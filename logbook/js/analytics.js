// Analytics (Advanced mode only): pace forecast, tags gone quiet, reflection to-dos. Pure functions (no DOM), so
// they're unit-tested (test/analytics.test.mjs). Dates are 'YYYY-MM-DD' strings, as cases keep them.

import { academicYear } from './engine.js';

const DAY = 864e5;
const parse = iso => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthsBetween = (a, b) => (b - a) / DAY / 30.44;
const yearNum = by => Number(String(by).replace(/\D/g, ''));

// The last day of residency year `by` (e.g. 'R3'), when you're in year `yr` now: residency years end on 30 June.
export function milestoneEnd(by, yr, today) {
  const ay = academicYear(parse(today)) + (yearNum(by) - Number(yr || 1));
  return `${ay + 1}-06-30`;
}

// Your pace per tag, from the cases you logged in the last `months` months (fewer if your first case is more
// recent, but at least one month). rows: progress() rows. -> { code: { rate, needed, monthsToGo, deadline,
// offPace } } for tags with a target still to reach. rate = cases a month; monthsToGo = Infinity at a pace of 0.
export function paceForecast(rows, cases, yr, today, months = 6) {
  const t = parse(today);
  const from = new Date(t); from.setMonth(from.getMonth() - months);
  const dated = (cases || []).filter(c => c.date && c.date <= today);
  const first = dated.reduce((m, c) => (c.date < m ? c.date : m), today);
  const start = parse(first) > from ? parse(first) : from;
  const span = Math.max(1, monthsBetween(start, t));
  const startIso = iso(start);
  const recent = {};
  for (const c of dated) if (c.date >= startIso) for (const code of new Set(c.cats || [])) recent[code] = (recent[code] || 0) + 1;
  const out = {};
  for (const r of rows || []) {
    if (!r.next || r.status === 'done' || r.status === 'none') continue;
    const needed = r.next.n - r.count;
    const rate = (recent[r.code] || 0) / span;
    const monthsToGo = rate > 0 ? needed / rate : Infinity;
    const deadline = milestoneEnd(r.next.by, yr, today);
    const left = monthsBetween(t, parse(deadline));
    out[r.code] = { rate, needed, monthsToGo, deadline, offPace: monthsToGo > Math.max(0, left) };
  }
  return out;
}

// Plain words for a forecast: "about 4 months at your pace" / "no cases in the last 6 months".
export function paceText(f, months = 6) {
  if (!f) return '';
  if (!isFinite(f.monthsToGo)) return `no cases in the last ${months} months`;
  const m = Math.round(f.monthsToGo);
  if (m >= 24) return `over ${Math.floor(m / 12)} years at your pace`;
  return m <= 1 ? 'about a month at your pace' : `about ${m} months at your pace`;
}

// Tags you still need that you haven't logged in `days` days (tags never logged are left out: they're not quiet,
// just not started). -> [{ code, last, days }] longest quiet first.
export function goneQuiet(rows, cases, today, days = 60) {
  const last = {};
  for (const c of cases || []) if (c.date && c.date <= today) for (const code of c.cats || []) if (!last[code] || c.date > last[code]) last[code] = c.date;
  const t = parse(today);
  return (rows || [])
    .filter(r => r.next && r.status !== 'done' && r.status !== 'none' && last[r.code])
    .map(r => ({ code: r.code, last: last[r.code], days: Math.round((t - parse(last[r.code])) / DAY) }))
    .filter(x => x.days >= days)
    .sort((a, b) => b.days - a.days);
}

// Reflection to-dos: ☆ Interesting cases with no reflection yet (newest first), and drafts not touched for
// `days` days (oldest first). now: ms.
export function reflectionTodos(cases, reflections, now = Date.now(), days = 30) {
  const linked = new Set((reflections || []).map(r => r.caseId).filter(Boolean));
  const interesting = (cases || []).filter(c => c.reflectTag && !linked.has(c.id))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const stale = (reflections || []).filter(r => r.status !== 'complete' && (r.updatedAt || r.createdAt || 0) < now - days * DAY)
    .sort((a, b) => (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0));
  return { interesting, stale };
}
