// Excel export choices (More → Export / Import, Logbook → More tools): what goes in (logbook,
// reflections or both), a date range, and which columns in which order. Saved per account as
// settings.excelExport. Pure (no DOM, no ExcelJS): xlsxio.js writes the sheets, tests cover the rest.

import { BY_CODE, REFLECTION_HEADINGS, DEFAULT_NAMES } from './categories.js';
import { caseParts, caseText, sortCodes, fmtDate } from './engine.js';

// Logbook columns. 'summary' is initials + case in one cell, as the old form had it (and what the
// upload reads back); 'initials' and 'case' split it. A hidden id column is always added so an
// edited file can be uploaded back.
export const CASE_COLS = [
  { k: 'date', name: 'Date', width: 13 },
  { k: 'summary', name: 'Case summary', width: 60 },
  { k: 'initials', name: 'Initials', width: 9 },
  { k: 'case', name: 'Case details', width: 55 },
  { k: 'apmes', name: 'Tags', width: 60 },
  { k: 'personal', name: 'Personal tags', width: 30 },
  { k: 'flag', name: 'Interesting', width: 10 },
  { k: 'reflected', name: 'Reflection written', width: 10 },
];
export const REFL_COLS = [
  { k: 'date', name: 'Date', width: 13 },
  { k: 'initials', name: 'Initials', width: 9 },
  { k: 'heading', name: 'Heading', width: 32 },
  { k: 'sub', name: 'Sub-heading', width: 20 },
  { k: 'diagnosis', name: 'Diagnosis / procedure', width: 32 },
  { k: 'title', name: 'Title', width: 32 },
  { k: 'summary', name: 'Case details', width: 60 },
  { k: 'points', name: 'Learning points', width: 80 },
  { k: 'references', name: 'References', width: 50 },
  { k: 'status', name: 'Status', width: 10 },
  { k: 'words', name: 'Words', width: 8 },
  { k: 'portfolio', name: 'In portfolio', width: 10 },
];

export const DEFAULT_EXPORT = {
  what: 'both',             // 'both' | 'logbook' | 'reflections'
  range: 'all',             // 'all' | 'year' (this residency year) | '12m' | 'custom'
  from: '', to: '',         // with range 'custom'
  caseCols: ['date', 'summary', 'apmes', 'personal'],
  reflCols: ['date', 'initials', 'heading', 'sub', 'diagnosis', 'title', 'summary', 'points', 'references', 'status', 'words', 'portfolio'],
  reflWhich: 'all',         // 'all' | 'complete' | 'portfolio'
  tagStyle: 'full',         // 'full' "Lower Segment Caesarean Section" | 'short' "LSCS" (no tag numbers: they're internal)
  dateStyle: 'excel',       // 'excel' a date cell (10 Oct 2026) | 'iso' text 2026-10-10
  sort: 'oldest',           // 'oldest' | 'newest'
  summary: true,            // the Summary sheet (counts against targets)
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pickCols = (list, known, fallback) => {
  const keys = new Set(known.map(c => c.k));
  const out = [...new Set((Array.isArray(list) ? list : []).filter(k => keys.has(k)))];
  return out.length ? out : [...fallback];
};
const oneOf = (v, opts, d) => (opts.includes(v) ? v : d);

export function cleanExportOpts(o) {
  o = o && typeof o === 'object' ? o : {};
  const d = DEFAULT_EXPORT;
  return {
    what: oneOf(o.what, ['both', 'logbook', 'reflections'], d.what),
    range: oneOf(o.range, ['all', 'year', '12m', 'custom'], d.range),
    from: ISO.test(o.from || '') ? o.from : '',
    to: ISO.test(o.to || '') ? o.to : '',
    caseCols: pickCols(o.caseCols, CASE_COLS, d.caseCols),
    reflCols: pickCols(o.reflCols, REFL_COLS, d.reflCols),
    reflWhich: oneOf(o.reflWhich, ['all', 'complete', 'portfolio'], d.reflWhich),
    tagStyle: o.tagStyle === 'short' || o.tagStyle === 'name' ? 'short' : 'full',
    dateStyle: oneOf(o.dateStyle, ['excel', 'iso'], d.dateStyle),
    sort: oneOf(o.sort, ['oldest', 'newest'], d.sort),
    summary: o.summary !== false,
  };
}

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// { from, to } for the chosen range ('' = open). The residency year starts 1 July.
export function dateRange(o, now = new Date()) {
  if (o.range === 'custom') return { from: o.from || '', to: o.to || '' };
  if (o.range === '12m') { const f = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1); return { from: iso(f), to: '' }; }
  if (o.range === 'year') { const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; return { from: `${y}-07-01`, to: `${y + 1}-06-30` }; }
  return { from: '', to: '' };
}
// undated items are kept only when there is no range
const inRange = (date, { from, to }) => (!from && !to) || (!!date && (!from || date >= from) && (!to || date <= to));

const HEADING = Object.fromEntries(REFLECTION_HEADINGS.map(x => [x.id, x]));
export const tagText = (code, style) => (style === 'short'
  ? ((DEFAULT_NAMES[code] && DEFAULT_NAMES[code][1]) || (BY_CODE[code] && BY_CODE[code].name) || code)
  : ((BY_CODE[code] && BY_CODE[code].full) || (BY_CODE[code] && BY_CODE[code].name) || code));
const cut = s => String(s ?? '').slice(0, 32000);   // an Excel cell holds 32767 characters
const words = r => [r.summary, ...(r.points || []).map(p => `${p.heading || ''} ${p.text || ''}`)].join(' ').split(/\s+/).filter(Boolean).length;

// What goes in the file, as plain tables: { cases: {cols, rows} | null, reflections: {cols, rows} | null }.
// A date cell's value is { date: 'YYYY-MM-DD' } (xlsxio turns it into a date cell or text).
// ctx: { tagName(key), reflections (all, to mark "Reflection written"), inPortfolio(r) }
export function exportTables(cases, reflections, opts, ctx = {}, now = new Date()) {
  const o = cleanExportOpts(opts);
  const range = dateRange(o, now);
  const order = (a, b) => (a.date ? 0 : 1) - (b.date ? 0 : 1) || String(a.date || '').localeCompare(String(b.date || '')) || (a.createdAt || 0) - (b.createdAt || 0);
  const sorted = list => { const s = [...list].sort(order); return o.sort === 'newest' ? s.reverse() : s; };
  const dateCell = (date, text) => (date ? { date } : (text || ''));
  const out = { cases: null, reflections: null, range, opts: o };
  if (o.what !== 'reflections') {
    const linked = new Set((ctx.reflections || reflections || []).map(r => r.caseId).filter(Boolean));
    const cols = o.caseCols.map(k => CASE_COLS.find(c => c.k === k));
    const val = (c, k) => {
      const p = caseParts(c);
      switch (k) {
        case 'date': return dateCell(c.date, c.dateText);
        case 'summary': return cut(caseText(c));
        case 'initials': return p.initials;
        case 'case': return cut(p.details);
        case 'apmes': return sortCodes(c.cats || []).map(code => tagText(code, o.tagStyle)).join(', ');
        case 'personal': return (c.tags || []).map(t => (ctx.tagName ? ctx.tagName(t) : t)).join(', ');
        case 'flag': return c.reflectTag ? 'Yes' : '';
        case 'reflected': return linked.has(c.id) ? 'Yes' : '';
        default: return '';
      }
    };
    const list = sorted((cases || []).filter(c => inRange(c.date, range)));
    out.cases = { cols, rows: list.map(c => ({ id: c.id || '', cells: o.caseCols.map(k => val(c, k)) })), list };
  }
  if (o.what !== 'logbook') {
    const which = { all: () => true, complete: r => r.status === 'complete', portfolio: r => !!(ctx.inPortfolio && ctx.inPortfolio(r)) }[o.reflWhich];
    const cols = o.reflCols.map(k => REFL_COLS.find(c => c.k === k));
    const val = (r, k) => {
      const hd = HEADING[r.headingId];
      switch (k) {
        case 'date': return dateCell(r.date);
        case 'initials': return r.initials || '';
        case 'heading': return hd ? hd.name : 'Uncategorised';
        case 'sub': return (hd && (hd.subs || []).find(s => s.id === r.subId) || {}).name || '';
        case 'diagnosis': return cut(r.diagnosis);
        case 'title': return cut(r.title);
        case 'summary': return cut(r.summary);
        case 'points': return cut((r.points || []).filter(p => (p.heading || p.text || '').trim()).map((p, i) => `${i + 1}. ${[p.heading, p.text].filter(x => String(x || '').trim()).join(': ')}`).join('\n\n'));
        case 'references': return cut((r.references || []).filter(x => String(x).trim()).join('\n'));
        case 'status': return r.status === 'complete' ? 'Complete' : 'Draft';
        case 'words': return words(r);
        case 'portfolio': return ctx.inPortfolio && ctx.inPortfolio(r) ? 'Yes' : '';
        default: return '';
      }
    };
    const list = sorted((reflections || []).filter(r => which(r) && inRange(r.date, range)));
    out.reflections = { cols, rows: list.map(r => ({ cells: o.reflCols.map(k => val(r, k)) })) };
  }
  return out;
}

// "10 Oct 2026 to 30 Jun 2027", "from 11 Oct 2025", "all dates"
export const rangeText = ({ from, to }) => (from && to ? `${fmtDate(from)} to ${fmtDate(to)}` : from ? `from ${fmtDate(from)}` : to ? `up to ${fmtDate(to)}` : 'all dates');
