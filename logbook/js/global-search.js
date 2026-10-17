// Global search (the magnifier in the header, or / on a computer; log2 9e): one box over cases (and planned ones), reflections and
// notes. The Logbook's search language (search-ops.js parseQuery: words, "phrases", -leave out, OR) plus:
//
//   in:cases | in:reflections | in:notes   only that kind          heading:lap      a reflection's heading
//   status:draft | status:complete         reflections             is:interesting   a case marked Interesting
//   is:planned                              planned cases           has:reflection   a case with a reflection
//   has:note                                a case with a note      no:tag           a case with no tag (a
//   linked:yes | linked:no                 a reflection or note        reflection with no heading)
//                                           linked to a case         initials: title: case: tag: diagnosis:
//
// Pure (test/global-search.test.mjs). buildIndex once per change of the lists, then search(index, q, opts).
import { parseQuery } from './search-ops.js';

export const GS_FIELDS = ['in', 'initials', 'title', 'case', 'tag', 'heading', 'diagnosis', 'status', 'is', 'has', 'no', 'linked', 'after', 'before'];
export const GS_HELP = [
  ['in:reflections', 'only that kind: in:cases, in:reflections, in:notes', 'in:', 3],
  ['initials:AB', 'those initials (cases and reflections)', 'initials:', 9],
  ['tag:lscs', 'cases with that tag, by name', 'tag:', 4],
  ['heading:bariatric', 'reflections under that heading', 'heading:', 8],
  ['status:draft', 'reflections still drafts (status:complete: finished ones)', 'status:', 7],
  ['is:interesting', 'cases marked Interesting (is:planned: planned cases)', 'is:', 3],
  ['has:reflection', 'cases with a reflection (has:note: with a note)', 'has:', 4],
  ['no:tag', 'cases with no tag, reflections with no heading', 'no:tag', 6],
  ['linked:yes', 'reflections and notes linked to a case (linked:no: not linked)', 'linked:', 7],
  ['after:2026-01-01', 'dated on or after that day (before:2026-06-30: on or before)', 'after:', 6],
  ['"lap chole"', 'that exact phrase', '""', 1],
  ['-paeds', 'leave out (works with the others: -in:notes)', '-', 1],
  ['spinal OR epidural', 'either one', 'OR ', 3],
];
const KINDS = { case: 'case', cases: 'case', reflection: 'reflection', reflections: 'reflection', refl: 'reflection', note: 'note', notes: 'note' };
const low = s => String(s || '').toLowerCase();

// -> [{ type, id, date, title, text, f: { all, initials, title, case, tag, heading, diagnosis }, flags, item }]
// ctx: { catName(code), tagName(key), headingName(id) }
export function buildIndex({ cases = [], plan = [], reflections = [], notes = [] }, ctx = {}) {
  const catName = ctx.catName || (k => k), tagName = ctx.tagName || (k => k), headingName = ctx.headingName || (() => '');
  const reflBy = new Set(reflections.map(r => r.caseId).filter(Boolean));
  const noteBy = new Set(notes.map(n => n.caseId).filter(Boolean));
  const out = [];
  const caseDoc = (c, planned) => {
    const details = String(c.details || ''), initials = String(c.initials || '');
    const tags = [...(c.cats || []).map(k => `${k} ${catName(k)}`), ...(c.tags || []).map(tagName)].join(' ');
    const title = [initials, details.split('\n')[0]].filter(Boolean).join(' ');
    // (the title is the first line: the piece under it shows the rest, when there is more)
    out.push({ type: 'case', id: c.id, date: c.date || '', title: title || 'Case', text: details.split('\n').slice(1).join(' ').trim(),
      f: { all: low(`${initials} ${details} ${tags} ${c.date || ''}`), initials: low(initials), title: low(title), case: low(details), tag: low(tags), heading: '', diagnosis: '' },
      flags: { interesting: !!c.reflectTag, planned, reflection: reflBy.has(c.id), note: noteBy.has(c.id), notag: !(c.cats || []).length && !(c.tags || []).length },
      item: c });
  };
  for (const c of cases) caseDoc(c, false);
  for (const c of plan) caseDoc(c, true);
  for (const r of reflections) {
    const points = (r.points || []).map(p => `${p.heading || ''} ${p.text || ''}`).join(' ');
    const heading = headingName(r.headingId) || '';
    const title = r.title || r.diagnosis || 'Reflection';
    const text = [r.summary, points].filter(Boolean).join(' ');
    out.push({ type: 'reflection', id: r.id, date: r.date || '', title, text,
      f: { all: low(`${r.initials || ''} ${r.diagnosis || ''} ${r.title || ''} ${text} ${heading} ${r.date || ''}`), initials: low(r.initials), title: low(r.title || r.diagnosis), case: low(r.summary), tag: '', heading: low(heading || 'uncategorised'), diagnosis: low(r.diagnosis) },
      flags: { status: r.status === 'complete' ? 'complete' : 'draft', linked: !!r.caseId, notag: !heading },
      item: r });
  }
  for (const n of notes) {
    const title = String(n.title || '').trim() || String(n.body || '').split('\n').find(l => l.trim()) || 'Note';
    out.push({ type: 'note', id: n.id, date: n.date || '', title: title.replace(/^#+\s*/, ''), text: String(n.body || ''),
      f: { all: low(`${n.title || ''} ${n.body || ''} ${n.date || ''}`), initials: '', title: low(n.title), case: low(n.body), tag: '', heading: '', diagnosis: '' },
      flags: { linked: !!n.caseId },
      item: n });
  }
  return out;
}

// one term against one document
function hit(d, t) {
  const v = t.text;
  switch (t.field) {
    case 'in': return KINDS[v] ? d.type === KINDS[v] : false;
    case 'status': return d.type === 'reflection' && d.flags.status === (v === 'done' ? 'complete' : v);
    case 'is': return d.type === 'case' && (v === 'interesting' ? d.flags.interesting : v === 'planned' ? d.flags.planned : false);
    case 'has': return d.type === 'case' && (/^refl/.test(v) ? d.flags.reflection : /^note/.test(v) ? d.flags.note : false);
    case 'no': return /^(tag|tags|heading)$/.test(v) && d.type !== 'note' && d.flags.notag;
    case 'linked': return d.type !== 'case' && (/^(no|n|false|none)$/.test(v) ? !d.flags.linked : d.flags.linked);
    // dates: a day (2026-03-01) or a month (2026-03: after its first day, before its last)
    case 'after': return !!d.date && d.date >= v;
    case 'before': return !!d.date && d.date.slice(0, v.length) <= v;
    default: return (d.f[t.field || 'all'] || '').includes(v);
  }
}
const matches = (d, groups) => groups.every(g => g.some(t => (t.neg ? !hit(d, t) : hit(d, t))));

// q -> { results: { case: [...], reflection: [...], note: [...] }, counts, words, unknown }
// opts: { sort: 'best' | 'newest', limit (per type) }
export function search(index, q, { sort = 'best', limit = 50 } = {}) {
  const parsed = parseQuery(q, { fields: GS_FIELDS });
  const words = parsed.groups.flat().filter(t => !t.neg && (!t.field || ['initials', 'title', 'case', 'diagnosis', 'heading', 'tag'].includes(t.field))).map(t => t.text);
  const empty = { case: [], reflection: [], note: [] };
  if (!parsed.groups.length) return { results: empty, counts: { case: 0, reflection: 0, note: 0 }, words, unknown: parsed.unknown };
  const found = index.filter(d => matches(d, parsed.groups));
  const score = d => words.reduce((s, w) => s + (d.f.title.includes(w) ? 3 : 0) + (d.f.initials === w ? 3 : 0) + (d.f.all.split(w).length - 1), 0);
  const newest = (a, b) => (b.date || '').localeCompare(a.date || '');
  const ranked = sort === 'newest' ? found.sort(newest) : found.map(d => [score(d), d]).sort((a, b) => b[0] - a[0] || newest(a[1], b[1])).map(x => x[1]);
  const results = { case: [], reflection: [], note: [] }, counts = { case: 0, reflection: 0, note: 0 };
  for (const d of ranked) { counts[d.type]++; if (results[d.type].length < limit) results[d.type].push(d); }
  return { results, counts, words, unknown: parsed.unknown };
}

// A short piece of the text around the first word found: [[text, isHit], ...] (hits marked for highlighting)
export function snippet(text, words, width = 90) {
  const src = String(text || '').replace(/\s+/g, ' ').trim();
  if (!src) return [];
  const l = src.toLowerCase();
  let at = -1;
  for (const w of words) { const i = l.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; }
  let start = at < 0 ? 0 : Math.max(0, at - Math.floor(width / 3));
  if (start > 0) { const sp = src.indexOf(' ', start); if (sp > 0 && sp < at) start = sp + 1; }
  const piece = (start > 0 ? '…' : '') + src.slice(start, start + width) + (start + width < src.length ? '…' : '');
  if (!words.length) return [[piece, false]];
  const re = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|'), 'gi');
  const out = []; let last = 0, m;
  while ((m = re.exec(piece))) { if (!m[0]) { re.lastIndex++; continue; } if (m.index > last) out.push([piece.slice(last, m.index), false]); out.push([m[0], true]); last = m.index + m[0].length; }
  if (last < piece.length) out.push([piece.slice(last), false]);
  return out;
}

// ---- the filter chips (Search) and the box kept in step: the box is the source, a chip adds or takes out its operator
const ANY = '(?:"[^"]*"|\\S+)';
const opRe = (field, value = ANY) => new RegExp(`(^|\\s)${field}:${value}(?=\\s|$)`, 'gi');
const tidy = q => q.replace(/\s+/g, ' ').trim();
const esc = v => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// is field:value in the box (not left out with -)?  value '' : any value
export const hasOp = (q, field, value = '') => opRe(field, value ? esc(value) : ANY).test(String(q || ''));
// the value of field: in the box ('' when none)
export function opValue(q, field) { const m = new RegExp(`(?:^|\\s)${field}:("[^"]*"|\\S+)`, 'i').exec(String(q || '')); return m ? m[1].replace(/^"|"$/g, '') : ''; }
// field: set to value (every other one of that field taken out); '' takes it out
export function setOp(q, field, value) {
  const out = tidy(String(q || '').replace(opRe(field), ' '));
  if (!value) return out;
  const v = /\s/.test(value) ? `"${value}"` : value;
  return tidy(`${out} ${field}:${v}`);
}
// a chip: on → off (taken out), off → on (the only one of its field)
export const toggleOp = (q, field, value) => (hasOp(q, field, value) ? tidy(String(q || '').replace(opRe(field, esc(value)), ' ')) : setOp(q, field, value));
