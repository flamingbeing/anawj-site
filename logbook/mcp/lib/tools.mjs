// The MCP tools, each a zod input shape and a handler returning text.
// getData(fresh) -> { email, cases, reflections, logbook, resident }; fresh skips the one-minute cache.
// writer -> { saveCase, saveReflection, queueSheetRow, invalidate }: with it, the write tools are added too. Both are
// injected so tests need no network.

import { z } from 'zod';
import {
  MAX_LIMIT, DEFAULT_LIMIT, filterCases, searchCases, formatCaseList, resolveYear, formatProgress,
  formatMissing, filterReflections, formatReflectionList, formatReflection, catName,
} from './logbook.mjs';
import {
  buildNewCase, buildCaseUpdate, sameCase, describeCase, describeCaseChange, buildReflection, describeReflection,
  outboxEntry, outboxOn,
} from './write.mjs';

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
  ];
  return writer ? tools.concat(writeTools(getData, writer)) : tools;
}

function writeTools(getData, writer) {
  const fresh = () => getData(true);
  return [
    {
      name: 'add_case',
      title: 'Add a logbook case',
      annotations: ADDS,
      description: 'Add a case to your logbook, as if typed in the app (it also goes to the Google Form response sheet, as app cases do). First call without confirm to preview; save with confirm: true once the user agrees.',
      shape: { date: date.optional().describe('YYYY-MM-DD; default today'), initials: initials.optional(), details, tags: tags.optional(), interesting: z.boolean().optional().describe('Mark the case interesting (for a reflection later)'), confirm },
      async run(args) {
        const d = await fresh();
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
        const d = await fresh();
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
        const d = await fresh();
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
