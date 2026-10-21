// The MCP tools, each a zod input shape and a handler returning text.
// getData(fresh) -> { email, cases, reflections, logbook, resident }; fresh skips the one-minute cache.
// writer -> { saveCase, saveReflection, savePlan, queueSheetRow, invalidate }: with it, the write tools are added too. Both are
// injected so tests need no network.

import { z } from 'zod';
import {
  MAX_LIMIT, DEFAULT_LIMIT, filterCases, searchCases, formatCaseList, resolveYear, formatProgress,
  formatMissing, filterReflections, formatReflectionList, formatReflection, catName, normCase, formatCase,
} from './logbook.mjs';
import {
  buildNewCase, buildCaseUpdate, sameCase, describeCase, describeCaseChange, buildReflection, describeReflection,
  outboxEntry, outboxOn, today,
} from './write.mjs';
import {
  MAX_ROWS, MAX_PLAN, parseList, rowsFromCases, checkRows, buildCases, describeRows, suggester, formatSuggestions,
  untaggedReport, planOf, buildPlanItems, formatPlan, pickDue, casesFromPlan,
} from './bulk.mjs';

const limit = z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Most rows to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const year = z.number().int().min(1).max(5).optional().describe('Residency year 1-5 (R1, R2, R3, SR1, SR2). Default: from the programme list or your Settings');

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
// adds a document; update_case and save_reflection replace one
export const ADDS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
export const REPLACES = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

// Every write is two calls: without confirm it only shows what would be saved; the same call with confirm: true saves.
const confirm = z.boolean().optional().describe('false or left out: only preview, nothing is saved. true: save. Show the preview to the user and save only after they agree.');
const PREVIEW = name => `\n\nPreview only: nothing is saved yet. Show this to the user; once they agree, call ${name} again with the same arguments and confirm: true.`;
const tags = z.array(z.string().min(1).max(100)).max(40).describe('APMES tags: codes ("16", "26ii") or names ("caesarean"); each must match one tag');
const details = z.string().max(2000).describe('Short de-identified description, as typed in the app (no names, NRIC or record numbers)');
const initials = z.string().max(20).describe('Patient initials only');
const learningPoints = z.array(z.object({ heading: z.string().max(300).optional(), text: z.string().max(20000) })).max(15)
  .describe('Learning points; one point with no heading is free text');

export function defineTools(getData, writer = null) {
  const tools = [
    {
      name: 'list_cases',
      title: 'List logbook cases',
      description: 'List your logged cases, newest first, optionally between two dates and for one APMES tag (category code like "16" or a name like "caesarean").',
      shape: { from: date.optional().describe('First date, YYYY-MM-DD'), to: date.optional().describe('Last date, YYYY-MM-DD'), category: z.string().max(100).optional(), limit },
      async run(args) {
        const d = await getData();
        const r = filterCases(d.cases, args);
        return formatCaseList(r, r.codes ? `cases tagged ${r.codes.map(c => `"${catName(c)}"`).join(' or ')}` : 'cases');
      },
    },
    {
      name: 'search_cases',
      title: 'Search logbook cases',
      description: 'Find cases whose initials, details or tag names contain every word given (any case; "quoted phrase" stays whole).',
      shape: { text: z.string().min(1).max(500), limit },
      async run({ text, limit: n }) {
        const d = await getData();
        return formatCaseList(searchCases(d.cases, text, { limit: n }), `cases matching "${text}"`);
      },
    },
    {
      name: 'progress',
      title: 'Progress against APMES targets',
      description: 'Per-tag case counts against the cumulative APMES targets for your residency year.',
      shape: { year },
      async run(args) {
        const d = await getData();
        return formatProgress(d.cases, resolveYear({ year: args.year, resident: d.resident, logbook: d.logbook }));
      },
    },
    {
      name: 'list_reflections',
      title: 'List reflections',
      description: 'List your reflections by heading, with id, title, date and status. Filter by heading (id or name) and status.',
      shape: { heading: z.string().max(200).optional(), status: z.enum(['draft', 'complete']).optional(), limit },
      async run(args) {
        const d = await getData();
        return formatReflectionList(filterReflections(d.reflections, args), args.limit);
      },
    },
    {
      name: 'get_reflection',
      title: 'Read one reflection',
      description: 'The full text of one reflection (id from list_reflections).',
      shape: { id: z.string().min(1).max(200) },
      async run({ id }) {
        const d = await getData();
        const r = d.reflections.find(x => String(x.id) === id);
        if (!r) throw new Error(`No reflection with id "${id}". Use list_reflections to find ids.`);
        return formatReflection(r);
      },
    },
    {
      name: 'missing_targets',
      title: 'What is missing',
      description: 'APMES tags behind or due for your residency year, and reflection headings below their minimum.',
      shape: { year },
      async run(args) {
        const d = await getData();
        return formatMissing(d.cases, d.reflections, resolveYear({ year: args.year, resident: d.resident, logbook: d.logbook }));
      },
    },
    {
      name: 'suggest_tags',
      title: 'Suggest APMES tags',
      description: 'APMES tag suggestions from the app\'s own keyword engine (with your shorthand from the Tag editor). Give text, or a case_id for one case; with neither, lists your cases that have no APMES tag, each with suggestions. Nothing is changed: tag a case with update_case.',
      shape: { text: z.string().min(1).max(2000).optional().describe('Case details to suggest tags for'), case_id: z.string().min(1).max(200).optional().describe('One of your cases (id from list_cases)'), limit },
      async run(args) {
        const d = await getData();
        if (args.text && args.case_id) throw new Error('Give text or case_id, not both.');
        const sug = suggester(d.logbook);
        if (args.text) return `Suggested tags (most likely first): ${formatSuggestions(sug(args.text, { limit: 8 }))}`;
        if (args.case_id) {
          const c = d.cases.find(x => String(x.id) === args.case_id);
          if (!c) throw new Error(`No case with id "${args.case_id}". Use list_cases or search_cases to find ids.`);
          const n = normCase(c);
          return `${formatCase(n)}\nSuggested tags it doesn't have yet: ${formatSuggestions(sug(n.details, { limit: 8 }), n.cats)}`;
        }
        return untaggedReport(d.cases, d.logbook, { limit: args.limit });
      },
    },
    {
      name: 'list_plan',
      title: 'Planned cases',
      description: 'Your planned cases (a list pasted for a later day, waiting to be logged once done), each with its id: due now and later.',
      shape: {},
      async run() {
        const d = await getData();
        return formatPlan(planOf(d.logbook));
      },
    },
  ];
  return writer ? tools.concat(writeTools(getData, writer)) : tools;
}

function writeTools(getData, writer) {
  const fresh = () => getData(true);
  // a preview uses the one-minute cache (a read per case and reflection saved); the save itself reads fresh and checks again
  const load = args => getData(args.confirm === true);
  return [
    {
      name: 'add_case',
      title: 'Add a logbook case',
      annotations: ADDS,
      description: 'Add a case to your logbook, as if typed in the app (it also goes to the Google Form response sheet, as app cases do). First call without confirm to preview; save with confirm: true once the user agrees.',
      shape: { date: date.optional().describe('YYYY-MM-DD; default today'), initials: initials.optional(), details, tags: tags.optional(), interesting: z.boolean().optional().describe('Mark the case interesting (for a reflection later)'), confirm },
      async run(args) {
        const d = await load(args);
        const c = buildNewCase(args);
        const dup = d.cases.find(x => sameCase(x, c));
        if (!args.confirm) {
          return `New case:\n${describeCase(c)}${dup ? `\n\nNote: a case with the same date, initials and details is already there (id ${dup.id}).` : ''}${PREVIEW('add_case')}`;
        }
        if (dup) throw new Error(`Not saved: case ${dup.id} already has the same date, initials and details (a repeated save?). Use update_case to change it.`);
        await writer.saveCase(c);
        writer.invalidate();
        let sheet = '';
        const rid = d.logbook && d.logbook.rid;
        const entry = outboxOn() && rid ? outboxEntry(c, { email: d.email, rid }) : null;
        if (entry) {
          try { await writer.queueSheetRow(entry); sheet = '\nQueued for the response sheet.'; }
          catch (e) { sheet = `\nSaved, but not queued for the response sheet (${e.message}).`; }
        }
        return `Saved case ${c.id}:\n${describeCase(c)}${sheet}`;
      },
    },
    {
      name: 'update_case',
      title: 'Change a logbook case',
      annotations: REPLACES,
      description: 'Change one of your cases (id from list_cases or search_cases). Only the fields given change; tags replaces the whole tag list. Preview first; save with confirm: true once the user agrees. Cases cannot be deleted from here.',
      shape: { id: z.string().min(1).max(200), date: date.optional(), initials: initials.optional(), details: details.optional(), tags: tags.optional(), interesting: z.boolean().optional(), confirm },
      async run(args) {
        const d = await load(args);
        const before = d.cases.find(x => String(x.id) === args.id);
        if (!before) throw new Error(`No case with id "${args.id}". Use list_cases or search_cases to find ids.`);
        const after = buildCaseUpdate(before, args);
        const change = describeCaseChange(before, after);
        if (!args.confirm) return `Case ${args.id}:\n${change}${change === 'No changes.' ? '' : PREVIEW('update_case')}`;
        if (change === 'No changes.') return `Case ${args.id}: no changes, nothing saved.`;
        await writer.saveCase(after);
        writer.invalidate();
        return `Saved case ${args.id}:\n${change}`;
      },
    },
    {
      name: 'save_reflection',
      title: 'Write a draft reflection',
      annotations: REPLACES,
      description: 'Start a new draft reflection, or change one of your drafts (give its id from list_reflections). Only the fields given change. Always saved as a draft; complete reflections are edited and marked complete in the app. Preview first; save with confirm: true once the user agrees.',
      shape: {
        id: z.string().min(1).max(200).optional().describe('An existing draft to change; leave out to start a new one'),
        heading: z.string().max(200).optional().describe('Reflection heading id or name (needed for a new one)'),
        subheading: z.string().max(100).optional().describe('Sub-type, for headings that have them (e.g. "On pump")'),
        title: z.string().max(300).optional(),
        date: date.optional().describe('YYYY-MM-DD; default today for a new one'),
        initials: initials.optional(),
        diagnosis: z.string().max(2000).optional().describe('Diagnosis / case, one line'),
        summary: z.string().max(20000).optional().describe('Case summary'),
        learning_points: learningPoints.optional(),
        references: z.array(z.string().max(1000)).max(30).optional(),
        case_id: z.string().max(200).optional().describe('The logbook case it is about (id from list_cases)'),
        confirm,
      },
      async run(args) {
        const d = await load(args);
        const existing = args.id ? d.reflections.find(x => String(x.id) === args.id) : null;
        if (args.id && !existing) throw new Error(`No reflection with id "${args.id}". Use list_reflections to find ids.`);
        if (args.case_id && !d.cases.some(x => String(x.id) === args.case_id)) throw new Error(`No case with id "${args.case_id}". Nothing was saved.`);
        const r = buildReflection(existing, args);
        const what = existing ? `Draft reflection ${r.id}, as it would be saved` : 'New draft reflection';
        if (!args.confirm) return `${what}:\n\n${describeReflection(r)}${PREVIEW('save_reflection')}${existing ? ' (keep the id)' : ''}`;
        await writer.saveReflection(r);
        writer.invalidate();
        return `Saved draft reflection ${r.id}${existing ? '' : ' (give this id to change it again)'}:\n\n${describeReflection(r)}`;
      },
    },
    {
      name: 'add_cases',
      title: 'Add a list of cases',
      annotations: ADDS,
      description: `Add several cases at once (up to ${MAX_ROWS}), like the app's Paste a list: give the pasted list as text (read with your own Pasted list format; confident tags are ticked) or the cases one by one. Each also goes to the Google Form response sheet. Preview first; to change a row's tags, call again with cases instead of text. Save with confirm: true once the user agrees. Cases already there (same date, initials and details) are skipped.`,
      shape: {
        text: z.string().min(1).max(60000).optional().describe('The pasted list (e.g. an OT list): cases separated by empty lines; a date at the start of a case sets its date'),
        cases: z.array(z.object({ date: date.optional(), initials: initials.optional(), details, tags: tags.optional() })).min(1).max(MAX_ROWS).optional().describe('The cases one by one, in place of text'),
        date: date.optional().describe('YYYY-MM-DD for cases with no date of their own; default today'),
        confirm,
      },
      async run(args) {
        if (!!args.text === !!args.cases) throw new Error('Give text (a pasted list) or cases, one of the two.');
        const d = await load(args);
        const rows = checkRows(args.text ? parseList(args.text, d.logbook, { date: args.date }) : rowsFromCases(args.cases, { date: args.date }));
        const { cases, dups } = buildCases(rows, d.cases);
        if (!args.confirm) {
          return `${rows.length} case${rows.length === 1 ? '' : 's'} read${dups.length ? ` (${dups.length} already there, skipped)` : ''}:\n\n${describeRows(rows, dups)}${cases.length ? PREVIEW('add_cases') : '\n\nNothing new to save.'}`;
        }
        if (!cases.length) return 'Nothing saved: every case is already in the logbook.';
        const rid = d.logbook && d.logbook.rid;
        let saved = 0, queued = 0;
        const problems = [];
        for (const c of cases) {
          try { await writer.saveCase(c); saved++; }
          catch (e) { problems.push(`Stopped after ${saved} of ${cases.length}: ${e.message}. Calling add_cases again with the same arguments saves the rest (saved ones are skipped).`); break; }
          const entry = outboxOn() && rid ? outboxEntry(c, { email: d.email, rid }) : null;
          if (entry) {
            try { await writer.queueSheetRow(entry); queued++; }
            catch (e) { problems.push(`Case ${c.id} saved but not queued for the response sheet (${e.message}).`); }
          }
        }
        writer.invalidate();
        return [`Saved ${saved} case${saved === 1 ? '' : 's'}${dups.length ? ` (${dups.length} already there, skipped)` : ''}.`,
          queued ? `Queued ${queued} for the response sheet.` : '', ...problems].filter(Boolean).join('\n');
      },
    },
    {
      name: 'plan_cases',
      title: 'Plan cases for a later day',
      annotations: ADDS,
      description: `Add cases to your plan for a day (today or later; default tomorrow), like the app's Paste a list → Plan for later: they wait on the app's Log tab that day to be confirmed once done. Give the list as text or the cases one by one. Preview first; save with confirm: true once the user agrees. The plan holds at most ${MAX_PLAN}.`,
      shape: {
        text: z.string().min(1).max(60000).optional().describe('The pasted list (e.g. tomorrow\'s OT list): cases separated by empty lines'),
        cases: z.array(z.object({ initials: initials.optional(), details, tags: tags.optional() })).min(1).max(MAX_ROWS).optional().describe('The cases one by one, in place of text'),
        date: date.optional().describe('YYYY-MM-DD, today or later; default tomorrow'),
        confirm,
      },
      async run(args) {
        if (!!args.text === !!args.cases) throw new Error('Give text (a pasted list) or cases, one of the two.');
        const t = today();
        const day = args.date || today(new Date(Date.now() + 86_400_000));
        if (day < t) throw new Error('A plan is for today or a later day; use add_cases for cases already done. Nothing was saved.');
        const d = await load(args);
        const rows = checkRows(args.text ? parseList(args.text, d.logbook, { date: day }) : rowsFromCases(args.cases, { date: day }))
          .map(r => ({ ...r, date: day }));
        const plan = planOf(d.logbook);
        if (plan.length + rows.length > MAX_PLAN) throw new Error(`The plan holds at most ${MAX_PLAN}; it has ${plan.length} already. Confirm or remove some in the app first. Nothing was saved.`);
        if (!args.confirm) return `Plan for ${day}, ${rows.length} case${rows.length === 1 ? '' : 's'}:\n\n${describeRows(rows)}${PREVIEW('plan_cases')}`;
        await writer.savePlan([...plan, ...buildPlanItems(rows, day)]);
        writer.invalidate();
        return `Planned ${rows.length} case${rows.length === 1 ? '' : 's'} for ${day}. They wait on the app's Log tab that day: tick each one once done.`;
      },
    },
    {
      name: 'log_planned',
      title: 'Log planned cases as done',
      annotations: ADDS,
      description: 'Log planned cases that are due (today or earlier) as done, like ✓ Done on the app\'s Log tab → Planned: each becomes a case on its planned date, goes to the Google Form response sheet, and leaves the plan. Give ids (from list_plan) or all_due: true. Preview first; save with confirm: true once the user agrees. To change a case first, log it and then use update_case.',
      shape: {
        ids: z.array(z.string().min(1).max(200)).min(1).max(MAX_PLAN).optional().describe('Planned cases to log (ids from list_plan)'),
        all_due: z.boolean().optional().describe('true: every planned case due today or earlier'),
        confirm,
      },
      async run(args) {
        if (!!args.ids === !!args.all_due) throw new Error('Give ids (from list_plan) or all_due: true, one of the two.');
        const d = await load(args);
        const items = pickDue(planOf(d.logbook), { ids: args.ids || null });
        const { cases, dups } = casesFromPlan(items, d.cases);
        if (!args.confirm) {
          const rows = items.map(p => ({ date: p.date, initials: p.initials, details: String(p.details || ''), cats: p.cats || [] }));
          const dupNums = items.map((p, i) => (dups.includes(String(p.id)) ? i + 1 : 0)).filter(Boolean);
          return `${items.length} planned case${items.length === 1 ? '' : 's'} to log as done${dups.length ? ` (${dups.length} already in the logbook: only removed from the plan)` : ''}:\n\n${describeRows(rows, dupNums)}${PREVIEW('log_planned')}`;
        }
        const rid = d.logbook && d.logbook.rid;
        const done = new Set(dups);
        let queued = 0;
        const problems = [];
        for (const { plan: pid, case: c } of cases) {
          try { await writer.saveCase(c); done.add(pid); }
          catch (e) { problems.push(`Stopped after ${done.size - dups.length} of ${cases.length}: ${e.message}. The rest stay in the plan: call log_planned again (list_plan shows them).`); break; }
          const entry = outboxOn() && rid ? outboxEntry(c, { email: d.email, rid }) : null;
          if (entry) {
            try { await writer.queueSheetRow(entry); queued++; }
            catch (e) { problems.push(`Case ${c.id} saved but not queued for the response sheet (${e.message}).`); }
          }
        }
        // the plan as stored now, less what was logged (a change made meanwhile in the app stays)
        if (done.size) {
          try { await writer.savePlan(planOf((await fresh()).logbook).filter(p => !done.has(String(p.id)))); }
          catch (e) { problems.push(`Logged, but not removed from the plan (${e.message}): remove them in the app, Log tab → Planned (×).`); }
        }
        writer.invalidate();
        const saved = done.size - dups.length;
        return [`Logged ${saved} planned case${saved === 1 ? '' : 's'} as done${dups.length ? ` (${dups.length} already in the logbook, only removed from the plan)` : ''}.`,
          queued ? `Queued ${queued} for the response sheet.` : '', ...problems].filter(Boolean).join('\n');
      },
    },
  ];
}

// Runs a tool and wraps its text (or error) as an MCP result.
export async function callTool(tool, args) {
  try {
    const text = await tool.run(args || {});
    return { content: [{ type: 'text', text }] };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: e && e.message ? e.message : String(e) }] };
  }
}
