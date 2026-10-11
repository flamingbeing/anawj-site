// How a copied or shared case or day reads (Logbook tab: Copy, Share day). Plain templates the user
// can edit in Settings → Copy & share; no DOM here, so it is unit-tested.
//
// Placeholders: {date} 2026-10-10 · {day} 10 Oct 2026 · {weekday} Sat · {count} cases that day
// (day heading) · {n} the case's number in the day · {initials} · {case} the case without initials.
// A line whose placeholders are all empty is left out (a case with no initials doesn't leave a gap).

import { fmtDate, caseParts } from './engine.js';

export const DEFAULT_FORMAT = {
  dayHead: '[[{date}]]',
  dayCase: '{n}. {initials}\n{case}',
  oneCase: '[[{date}]]\n{initials}\n{case}',
};
export const PLACEHOLDERS = ['date', 'day', 'weekday', 'count', 'n', 'initials', 'case'];
const MAX = 500;

// a stored format, cleaned: unknown keys dropped, empty fields fall back to the default
export function cleanFormat(f) {
  const out = { ...DEFAULT_FORMAT };
  for (const k of Object.keys(DEFAULT_FORMAT)) {
    const v = f && typeof f[k] === 'string' ? f[k].replace(/\r\n?/g, '\n').slice(0, MAX) : '';
    if (v.trim()) out[k] = v;
  }
  return out;
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = iso => { if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return ''; const [y, m, d] = iso.split('-').map(Number); return WD[new Date(y, m - 1, d).getDay()]; };

export function fillTemplate(tpl, vals) {
  return String(tpl).split('\n').map(line => {
    const keys = [...line.matchAll(/\{(\w+)\}/g)].map(m => m[1]).filter(k => k in vals);
    const out = line.replace(/\{(\w+)\}/g, (m, k) => (k in vals ? String(vals[k] ?? '') : m)).replace(/\s+$/, '');
    // only placeholders (and spaces or punctuation) and every one of them empty: drop the line
    const bare = line.replace(/\{(\w+)\}/g, '').trim();
    if (keys.length && keys.every(k => !String(vals[k] ?? '').trim()) && !/[A-Za-z0-9]/.test(bare)) return null;
    return out;
  }).filter(l => l !== null).join('\n');
}

const dayVals = (date, dateText) => ({ date: date || '', day: date ? fmtDate(date) : (dateText || 'No date'), weekday: weekday(date) });
const caseVals = (c, n) => { const p = caseParts(c); return { ...dayVals(c.date, c.dateText), n: n ?? '', initials: p.initials, case: String(p.details || '').trim() }; };

export function formatCase(c, fmt) {
  return fillTemplate(cleanFormat(fmt).oneCase, caseVals(c, 1));
}

// the day's heading, then each case: a blank line between cases when a case takes more than one
// line in the format, none for a one-line format ("- {initials} {case}" reads as a plain list)
export function formatDay(date, cases, fmt) {
  const f = cleanFormat(fmt);
  const head = fillTemplate(f.dayHead, { ...dayVals(date), count: cases.length });
  const sep = f.dayCase.includes('\n') ? '\n\n' : '\n';
  const body = cases.map((c, i) => fillTemplate(f.dayCase, { ...caseVals(c, i + 1), count: cases.length })).join(sep);
  return head ? `${head}\n${body}` : body;
}
