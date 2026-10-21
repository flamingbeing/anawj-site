// Bulk add, tag suggestions and the plan list, with the app's own engines and the user's own settings: parseBulk
// (../../js/engine.js) with Settings → Logging → Pasted list format and Labelled parts, as the app's "Paste a list"
// reads a list; suggest (../../js/suggest.js) with the user's shorthand from the Tag editor, as the Log tab suggests
// tags. Pure: no network here.

import { parseBulk, STRONG, sortCodes, cleanInitials } from '../../js/engine.js';
import { suggest } from '../../js/suggest.js';
import { apmesShorthand, tagSetOf } from '../../js/tags.js';
import { labelsOn, suggestText } from '../../js/parts.js';
import { cleanListFormat } from '../../js/list-format.js';
import { cleanCase } from '../../js/clean.js';
import { catName, checkDate, normCase, formatCase, clampLimit } from './logbook.mjs';
import { resolveTags, checkNoIds, today, sameCase } from './write.mjs';

export const MAX_ROWS = 50;
export const MAX_PLAN = 100;   // firestore.rules: logbook.plan holds at most 100
const MAX_DETAILS = 2000;
const settingsOf = logbook => (logbook && logbook.settings) || {};
const str = v => (v == null ? '' : String(v));

// (text, opts) -> [{ code, score, why }], as the app suggests: the user's shorthand mixed in, learning points left
// out (Labelled parts), the age and sex rule unless turned off in Settings
export function suggester(logbook) {
  const st = settingsOf(logbook);
  const extra = apmesShorthand(tagSetOf(st));
  const labels = labelsOn(st);
  return (text, opts = {}) => suggest(suggestText(text, labels), { detectAgeSex: st.detectAgeSex !== false, ...opts, extra });
}

const tagList = cats => (cats || []).length ? cats.map(c => `${c} ${catName(c)}`).join('; ') : 'no tag';
const sugList = list => list.map(s => `${s.code} ${catName(s.code)} (${Math.round(s.score * 100)}%${s.why === 'keyword' ? '' : `, ${s.why}`})`).join('; ');

// A pasted list -> [{ date, initials, details, cats, maybe }]: confident suggestions (the app's STRONG) are ticked,
// weaker ones are offered in maybe. date: the date of rows that carry none of their own (default today).
export function parseList(text, logbook, { date = null, now = new Date() } = {}) {
  const st = settingsOf(logbook);
  const sug = suggester(logbook);
  const rows = parseBulk(text, t => sug(t), now, { labels: labelsOn(st), format: cleanListFormat(st.listFormat) });
  return rows.filter(r => str(r.details).trim() || str(r.initials).trim()).map(r => {
    const cats = sortCodes(r.cats);
    const maybe = r.details ? sug(r.details, { limit: 4 }).filter(s => s.score < STRONG && !cats.includes(s.code)) : [];
    return { date: r.date || date || today(now), initials: cleanInitials(r.initials), details: str(r.details).trim(), cats, maybe };
  });
}

// Rows given one by one ({ date?, initials?, details, tags? }) -> the same shape as parseList's
export function rowsFromCases(list, { date = null } = {}) {
  return (list || []).map(r => ({
    date: checkDate(r.date, 'date') || date || today(),
    initials: cleanInitials(r.initials),
    details: str(r.details).trim(),
    cats: sortCodes(resolveTags(r.tags)),
    maybe: [],
  }));
}

// Checks every row before anything is saved: a count cap, details on each, no identifiers anywhere.
export function checkRows(rows, { max = MAX_ROWS } = {}) {
  if (!rows.length) throw new Error('No cases found in that text. Cases are separated by empty lines (or by the start text in Settings → Logging → Pasted list format). Nothing was saved.');
  if (rows.length > max) throw new Error(`That is ${rows.length} cases; at most ${max} go in at once. Split the list. Nothing was saved.`);
  rows.forEach((r, i) => {
    if (!r.details) throw new Error(`Case ${i + 1} has no details. Nothing was saved.`);
    if (r.details.length > MAX_DETAILS) throw new Error(`Case ${i + 1} is over the ${MAX_DETAILS}-character limit; shorten it. Nothing was saved.`);
    checkNoIds([[`initials of case ${i + 1}`, r.initials], [`details of case ${i + 1}`, r.details]]);
  });
  return rows;
}

// rows -> { cases (to save, as the app's pasted cases: source 'paste'), dups (row numbers already in the logbook or
// earlier in the list) }
export function buildCases(rows, existing, now = Date.now()) {
  const cases = [], dups = [];
  rows.forEach((r, i) => {
    const c = cleanCase({ date: r.date, initials: r.initials, details: r.details, cats: r.cats, source: 'paste', createdAt: now + i }, now + i);
    if ((existing || []).some(x => sameCase(x, c)) || cases.some(x => sameCase(x, c))) dups.push(i + 1);
    else cases.push(c);
  });
  return { cases, dups };
}

export function describeRows(rows, dups = []) {
  const lines = rows.map((r, i) => `${i + 1}. ${[r.date, r.initials].filter(Boolean).join(' · ')}: ${r.details.split('\n').join(' / ')}\n   Tags: ${tagList(r.cats)}`
    + (r.maybe && r.maybe.length ? `\n   Maybe: ${sugList(r.maybe)}` : '')
    + (dups.includes(i + 1) ? '\n   Already in the logbook (same date, initials and details): skipped' : ''));
  const untagged = rows.filter(r => !r.cats.length).length;
  return lines.join('\n') + (untagged ? `\n\n${untagged} case${untagged === 1 ? ' has' : 's have'} no tag yet.` : '');
}

// ---- tag suggestions ----

export function formatSuggestions(list, have = []) {
  const out = list.filter(s => !have.includes(s.code));
  return out.length ? sugList(out) : 'none';
}

// The cases with no APMES tag, newest first, each with its suggestions. -> text
export function untaggedReport(cases, logbook, { limit } = {}) {
  const sug = suggester(logbook);
  const all = (cases || []).map(normCase).filter(c => !c.cats.length)
    .sort((a, b) => str(b.date).localeCompare(str(a.date)) || (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
  if (!all.length) return 'Every case has at least one APMES tag.';
  const shown = all.slice(0, clampLimit(limit ?? 20));
  const more = all.length > shown.length ? ` (showing the newest ${shown.length}; raise limit to see more)` : '';
  return `${all.length} case${all.length === 1 ? ' has' : 's have'} no APMES tag${more}:\n`
    + shown.map(c => `${formatCase(c)}\n  id ${c.id} · suggested: ${formatSuggestions(sug(c.details, { limit: 4 }))}`).join('\n')
    + '\n\nTo tag one, use update_case with its id and tags.';
}

// ---- the plan list (logbook.plan: paste tomorrow's list now, confirm each case in the app after) ----

export const planOf = logbook => (logbook && Array.isArray(logbook.plan) ? logbook.plan : []);

// rows -> plan entries as the app writes them ({ id, date, initials, details, cats }), all on one date
export function buildPlanItems(rows, date, now = Date.now()) {
  return rows.map((r, i) => ({
    id: (now + i).toString(36) + Math.random().toString(36).slice(2, 8),
    date, initials: r.initials, details: r.details, cats: sortCodes(r.cats),
  }));
}

const planLine = p => `- ${[p.date, p.initials].filter(Boolean).join(' · ')}: ${str(p.details).split('\n').join(' / ') || '(no details)'} [${tagList(p.cats)}] (id ${p.id})`;

export function formatPlan(plan, now = new Date()) {
  if (!plan.length) return 'No planned cases. (plan_cases adds some: paste a list for a later day.)';
  const t = today(now);
  const due = plan.filter(p => str(p.date) <= t), later = plan.filter(p => str(p.date) > t);
  const parts = [];
  if (due.length) parts.push(`Due now (${due.length}; once done, log them with log_planned or tick each in the app, Log tab → Planned):\n${due.map(planLine).join('\n')}`);
  if (later.length) parts.push(`Later (${later.length}):\n${[...later].sort((a, b) => str(a.date).localeCompare(str(b.date))).map(planLine).join('\n')}`);
  return parts.join('\n\n');
}

// The planned cases to log now: the given ids (each must be in the plan and due), or every due one. -> plan entries
export function pickDue(plan, { ids = null, now = new Date() } = {}) {
  const t = today(now);
  if (!ids) {
    const due = plan.filter(p => str(p.date) <= t);
    if (!due.length) throw new Error('No planned case is due yet (list_plan shows the plan). Nothing was saved.');
    return due;
  }
  return [...new Set(ids)].map(id => {
    const p = plan.find(x => String(x.id) === id);
    if (!p) throw new Error(`No planned case with id "${id}" (already logged or removed?). Use list_plan to find ids. Nothing was saved.`);
    if (str(p.date) > t) throw new Error(`Planned case ${id} is for ${p.date}, not due yet. Nothing was saved.`);
    return p;
  });
}

// plan entries -> cases as the app's Planned card logs them (source 'paste', the planned date, its tags), less the ones
// already in the logbook (a repeated call after a save that stopped part way)
export function casesFromPlan(items, existing, now = Date.now()) {
  const cases = [], dups = [];
  items.forEach((p, i) => {
    const c = cleanCase({ date: p.date, initials: p.initials || '', details: str(p.details), cats: sortCodes(p.cats || []), tags: p.tags, source: 'paste', createdAt: now + i }, now + i);
    if ((existing || []).some(x => sameCase(x, c))) dups.push(String(p.id)); else cases.push({ plan: String(p.id), case: c });
  });
  return { cases, dups };
}
