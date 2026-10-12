// Pure helpers behind the MCP tools: case filters and search, progress and what's missing, reflections.
// They reuse the app's own modules (no DOM in any of them), so counts and targets match the app.

import { progress, countCases, caseParts, withParents, rYearDefault, academicYear } from '../../js/engine.js';
import { BY_CODE, CATEGORIES, DEFAULT_NAMES, REFLECTION_HEADINGS, yearName } from '../../js/categories.js';
import { reflectionProgress, HEADING_BY_ID } from '../../js/reflections.js';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;
export const clampLimit = n => Math.max(1, Math.min(MAX_LIMIT, Math.floor(Number(n) || DEFAULT_LIMIT)));

// ---- names ----

// The name the app shows (programme display name), then the official short name, then the code.
export const catName = code => (DEFAULT_NAMES[code] && DEFAULT_NAMES[code][0]) || (BY_CODE[code] && BY_CODE[code].name) || String(code);
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// A category code or name -> the matching codes. Exact code or name first, else names containing it.
export function resolveCategory(q) {
  const s = norm(q);
  if (!s) return [];
  const namesOf = c => [c.code, c.name, c.full, ...(DEFAULT_NAMES[c.code] || [])].map(norm);
  const exact = CATEGORIES.filter(c => namesOf(c).includes(s)).map(c => c.code);
  if (exact.length) return exact;
  return CATEGORIES.filter(c => namesOf(c).slice(1).some(n => n.includes(s))).map(c => c.code);
}

// ---- cases ----

const byNewest = (a, b) => (b.date || '0').localeCompare(a.date || '0') || (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);

// A stored case -> { id, date, initials, details, cats, interesting }. Older cases keep the initials
// at the front of details (caseParts splits them off).
export function normCase(c) {
  const { initials, details } = caseParts(c);
  return {
    id: String(c.id || ''), date: c.date || null, dateText: c.date ? '' : String(c.dateText || ''),
    initials, details, cats: Array.isArray(c.cats) ? c.cats.map(String) : [],
    interesting: !!c.reflectTag, reflectionId: c.reflectionId || null, createdAt: c.createdAt,
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function checkDate(s, label) {
  if (s == null || s === '') return null;
  if (!ISO.test(String(s))) throw new Error(`${label} must be a date as YYYY-MM-DD`);
  return String(s);
}

// { from?, to?, category?, limit? } -> { cases (newest first, capped), total (before the cap), codes }
export function filterCases(cases, { from, to, category, limit } = {}) {
  const f = checkDate(from, 'from'), t = checkDate(to, 'to');
  let codes = null;
  if (category != null && String(category).trim()) {
    codes = resolveCategory(category);
    if (!codes.length) throw new Error(`No APMES tag matches "${category}". Try a code (e.g. 16) or part of a name (e.g. "caesarean").`);
  }
  const want = codes && new Set(codes);
  const out = cases.map(normCase).filter(c => {
    if ((f || t) && !c.date) return false;
    if (f && c.date < f) return false;
    if (t && c.date > t) return false;
    // a parent tag also finds cases under its sub-tags (Paediatric surgery finds "Age 4 to 12 years")
    if (want && !withParents(c.cats).some(code => want.has(code))) return false;
    return true;
  }).sort(byNewest);
  return { cases: out.slice(0, clampLimit(limit)), total: out.length, codes };
}

// Every word must appear (any case) in the initials, details or tag names. "quoted phrases" stay whole.
export function searchCases(cases, text, { limit } = {}) {
  const words = [...String(text || '').matchAll(/"([^"]+)"|(\S+)/g)].map(m => norm(m[1] || m[2])).filter(Boolean);
  if (!words.length) throw new Error('Give some text to search for');
  const out = cases.map(normCase).filter(c => {
    const hay = norm([c.initials, c.details, c.date, ...c.cats.map(catName)].join(' '));
    return words.every(w => hay.includes(w));
  }).sort(byNewest);
  return { cases: out.slice(0, clampLimit(limit)), total: out.length };
}

const oneLine = s => String(s || '').replace(/\s*\n\s*/g, ' / ').trim();
export function formatCase(c) {
  const date = c.date || (c.dateText ? `${c.dateText} (no date)` : 'no date');
  const head = [date, c.initials].filter(Boolean).join(' · ');
  const tags = c.cats.length ? ` [${c.cats.map(catName).join('; ')}]` : '';
  return `- ${head}: ${oneLine(c.details) || '(no details)'}${tags}${c.interesting ? ' ☆' : ''}`;
}

export function formatCaseList({ cases, total }, what = 'cases') {
  if (!total) return `No ${what} found.`;
  const more = total > cases.length ? ` (showing the newest ${cases.length}; narrow the dates or raise limit, max ${MAX_LIMIT})` : '';
  return `${total} ${what}${more}:\n${cases.map(formatCase).join('\n')}`;
}

// ---- residency year ----

const intakeOf = r => {
  const ridYear = Number(String(r.rid || '').slice(0, 4));
  return Number(r.intake) || (ridYear > 2000 && ridYear < 2100 ? ridYear : null);
};

// The year the app would use: an explicit argument, then the programme list entry (SMO counts as R3;
// a year set by an admin; else from the intake), then the year picked in Settings (moved up each 1 July
// since it was picked). -> { year, source }
export function resolveYear({ year, resident, logbook, now = new Date() } = {}) {
  const clamp = y => Math.min(5, Math.max(1, Math.floor(y)));
  if (Number(year) >= 1) return { year: clamp(Number(year)), source: 'given' };
  if (resident) {
    if (resident.status === 'SMO') return { year: 3, source: 'programme list (SMO counts as R3)' };
    const smo = Math.max(0, Number(resident.smo) || 0);
    const y = Number(resident.rYear) || (intakeOf(resident) && rYearDefault(intakeOf(resident), now, smo));
    if (y) return { year: clamp(y), source: 'programme list' };
  }
  const st = (logbook && logbook.settings) || {};
  if (Number(st.rYear) >= 1) {
    const y = Number(st.rYear) + (st.rYearAY ? academicYear(now) - Number(st.rYearAY) : 0);
    return { year: clamp(y), source: 'your Settings' };
  }
  return { year: 1, source: 'assumed (pass year to change)' };
}
const yearLabel = y => `${yearName(y)} (year ${y})`;

// ---- progress and what's missing ----

const STATUS_WORDS = { done: 'done', ontrack: 'on track', due: 'due this year', late: 'behind', none: 'no target' };

export function progressRows(cases, rYear) {
  return progress(countCases(cases), rYear).map(p => ({ ...p, name: catName(p.code), official: p.name }));
}

const targetText = p => p.milestones.length ? p.milestones.map(m => `${m.n} by ${yearName(m.by.slice(1))}`).join(', ') : 'no target';

export function formatProgress(cases, { year, source }) {
  const rows = progressRows(cases, year);
  const tally = Object.fromEntries(Object.keys(STATUS_WORDS).map(k => [k, rows.filter(r => r.status === k).length]));
  const lines = rows.map(r => `- ${r.name}: ${r.count}` + (r.next ? `, next ${r.next.n} by ${yearName(r.next.by.slice(1))}` : '') + ` (${STATUS_WORDS[r.status]}; targets ${targetText(r)})`);
  return `Progress for ${yearLabel(year)}, year from ${source}. ${cases.length} cases logged.\n`
    + `Done ${tally.done}, on track ${tally.ontrack}, due this year ${tally.due}, behind ${tally.late}.\n`
    + `Targets are cumulative (cases logged by the end of that year).\n${lines.join('\n')}`;
}

export function missingTargets(cases, reflections, rYear) {
  const rows = progressRows(cases, rYear);
  const tags = rows.filter(r => r.status === 'late' || r.status === 'due').map(r => {
    const m = r.milestones.find(x => !x.met && x.due !== 'later');
    return { code: r.code, name: r.name, status: r.status, count: r.count, target: m.n, by: m.by, short: m.n - r.count };
  }).sort((a, b) => (a.status === b.status ? b.short - a.short : a.status === 'late' ? -1 : 1));
  const rp = reflectionProgress(reflections || []);
  const headings = rp.headings.filter(h => h.counted < h.min).map(h => ({ id: h.id, label: h.label, done: h.counted, min: h.min, short: h.min - h.counted }));
  return { tags, headings, reflectionTotals: rp.totals };
}

export function formatMissing(cases, reflections, { year, source }) {
  const m = missingTargets(cases, reflections, year);
  const out = [`What's missing for ${yearLabel(year)} (year from ${source}).`];
  out.push(m.tags.length ? `APMES tags behind or due (${m.tags.length}):` : 'APMES tags: nothing behind or due this year.');
  for (const t of m.tags) out.push(`- ${t.name}: ${t.count} of ${t.target} by ${yearName(t.by.slice(1))}, ${t.short} to go (${STATUS_WORDS[t.status]})`);
  const rt = m.reflectionTotals;
  out.push(`Reflections: ${rt.counted} of ${rt.min} counted (${rt.done} complete, ${rt.drafts} drafts). Minimums are for the whole residency.`);
  out.push(m.headings.length ? `Headings below their minimum (${m.headings.length}):` : 'Every reflection heading has its minimum.');
  for (const h of m.headings) out.push(`- ${h.label}: ${h.done} of ${h.min}, ${h.short} to go`);
  return out.join('\n');
}

// ---- reflections ----

export const headingLabel = id => (id && HEADING_BY_ID[id] ? HEADING_BY_ID[id].label || HEADING_BY_ID[id].name : 'Uncategorised');
const subName = (hid, sid) => (HEADING_BY_ID[hid]?.subs || []).find(s => s.id === sid)?.name || '';

export function resolveHeading(q) {
  const s = norm(q);
  if (!s) return null;
  if (s === 'uncategorised' || s === 'uncategorized') return [''];
  const exact = REFLECTION_HEADINGS.filter(h => [h.id, h.label, h.name].map(norm).includes(s)).map(h => h.id);
  if (exact.length) return exact;
  return REFLECTION_HEADINGS.filter(h => [h.label, h.name].some(n => norm(n).includes(s))).map(h => h.id);
}

export function filterReflections(reflections, { heading, status } = {}) {
  let ids = null;
  if (heading != null && String(heading).trim()) {
    ids = resolveHeading(heading);
    if (!ids.length) throw new Error(`No reflection heading matches "${heading}".`);
  }
  const want = ids && new Set(ids);
  return (reflections || [])
    .filter(r => !want || want.has(r.headingId || ''))
    .filter(r => !status || (status === 'complete' ? r.status === 'complete' : r.status !== 'complete'))
    .sort((a, b) => headingLabel(a.headingId).localeCompare(headingLabel(b.headingId)) || (b.date || '').localeCompare(a.date || ''));
}

export function formatReflectionList(list, limit) {
  if (!list.length) return 'No reflections found.';
  const shown = list.slice(0, clampLimit(limit));
  const more = list.length > shown.length ? ` (showing ${shown.length})` : '';
  return `${list.length} reflections${more}:\n` + shown.map(r => {
    const sub = subName(r.headingId, r.subId);
    const bits = [r.date || 'no date', r.initials, r.status === 'complete' ? 'complete' : 'draft', r.jr ? 'JR' : ''].filter(Boolean).join(' · ');
    return `- [${r.id}] ${headingLabel(r.headingId)}${sub ? ` (${sub})` : ''}: ${oneLine(r.title) || oneLine(r.diagnosis) || '(untitled)'} (${bits})`;
  }).join('\n');
}

export const MAX_REFLECTION_CHARS = 40000;
const LEGACY = [['description', 'Case description'], ['thoughts', 'Thoughts and feelings'], ['evaluation', 'Evaluation'], ['analysis', 'Analysis'], ['conclusions', 'Conclusions'], ['action', 'Action plan'], ['further', 'Further']];

export function formatReflection(r) {
  const sub = subName(r.headingId, r.subId);
  const out = [
    `# ${oneLine(r.title) || '(untitled)'}`,
    `Heading: ${headingLabel(r.headingId)}${sub ? ` (${sub})` : ''}`,
    `Status: ${r.status === 'complete' ? 'complete' : 'draft'}${r.jr ? ' · junior residency (JR)' : ''}${r.export === false ? ' · left out of the Word export' : ''}`,
    `Date: ${r.date || 'none'} · Initials: ${r.initials || 'none'}`,
  ];
  if (r.diagnosis) out.push(`Diagnosis / case: ${r.diagnosis}`);
  if (r.summary) out.push('', '## Case summary', r.summary);
  const free = (r.points || []).length === 1 && !(r.points[0] || {}).heading;   // free-text learning points
  (r.points || []).forEach((p, i) => out.push('', free ? '## Learning points' : `## Learning point ${i + 1}${p.heading ? `: ${p.heading}` : ''}`, p.text || ''));
  for (const [k, name] of LEGACY) if (r.sections && String(r.sections[k] || '').trim()) out.push('', `## ${name}`, r.sections[k]);
  if ((r.references || []).length) out.push('', '## References', ...r.references.map((x, i) => `${i + 1}. ${x}`));
  if ((r.figures || []).length) out.push('', `Figures: ${r.figures.length} (images are not read; captions: ${r.figures.map(f => f.caption || 'none').join('; ')})`);
  const text = out.join('\n');
  return text.length > MAX_REFLECTION_CHARS ? text.slice(0, MAX_REFLECTION_CHARS) + '\n…(cut short)' : text;
}
