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

// Analytics Edit mode (owner, 15 Oct 2026): the account's layout of the cards, settings.anLayout { order, hidden }.
// ids: the cards this profile can show, in their default order -> { shown, hidden } (cards the layout doesn't know yet
// go in their default place; ones it names that aren't available are ignored)
export function cleanLayout(v) {
  const ids = x => (Array.isArray(x) ? [...new Set(x.filter(s => typeof s === 'string' && /^[a-z]{1,20}$/.test(s)))].slice(0, 40) : []);
  return v && typeof v === 'object' && !Array.isArray(v) ? { order: ids(v.order), hidden: ids(v.hidden), show: ids(v.show) } : { order: [], hidden: [], show: [] };
}
// off: cards hidden until shown (5b: the less important ones start in "Hidden cards"); layout.show lists those turned on
export function arrangeCards(ids, layout, off = []) {
  const { order, hidden: saved, show } = cleanLayout(layout);
  const hidden = [...new Set([...saved, ...off.filter(id => !show.includes(id))])];
  const known = order.filter(id => ids.includes(id));
  // a card not in the saved order goes after the card it follows by default
  const all = [...known];
  ids.forEach((id, i) => { if (all.includes(id)) return; const prev = ids.slice(0, i).reverse().find(x => all.includes(x)); all.splice(prev ? all.indexOf(prev) + 1 : 0, 0, id); });
  return { shown: all.filter(id => !hidden.includes(id)), hidden: all.filter(id => hidden.includes(id)) };
}
// one card moved by n places among the shown ones -> the new layout
export function moveCard(ids, layout, id, n, off = []) {
  const l = cleanLayout(layout), { shown, hidden } = arrangeCards(ids, layout, off);
  const i = shown.indexOf(id), j = Math.max(0, Math.min(shown.length - 1, i + n));
  if (i < 0 || i === j) return l;
  shown.splice(j, 0, ...shown.splice(i, 1));
  return { ...l, order: [...shown, ...hidden] };
}
export function hideCard(ids, layout, id, hide, off = []) {
  const l = cleanLayout(layout), { shown, hidden } = arrangeCards(ids, layout, off);
  return { order: [...shown, ...hidden], hidden: hide ? [...new Set([...l.hidden, id])] : l.hidden.filter(x => x !== id),
    show: hide ? l.show.filter(x => x !== id) : off.includes(id) ? [...new Set([...l.show, id])] : l.show };
}

// ---------- more cards (5b; owner, 15 Oct 2026) ----------

const addMonths = (d, m) => { const x = new Date(d); x.setDate(x.getDate() + Math.round(m * 30.44)); return x; };
// Finish line: per tag still to reach, the day your pace gets there vs the end of its due year. fc: paceForecast.
// -> [{ code, eta (date or null at a pace of 0), deadline, late }] the furthest behind first
export function finishLine(fc, today) {
  const t = parse(today);
  const slack = x => (x.eta ? (parse(x.eta) - parse(x.deadline)) / DAY : Infinity);
  return Object.entries(fc || {}).map(([code, f]) => {
    const eta = isFinite(f.monthsToGo) ? iso(addMonths(t, f.monthsToGo)) : null;
    return { code, eta, deadline: f.deadline, late: !eta || eta > f.deadline };
  }).sort((a, b) => slack(b) - slack(a) || a.code.localeCompare(b.code));
}
// This month: cases, the top tags, tags logged for the first time, and tags whose final target was reached this month.
// target: code -> its final target (or null)
export function monthSummary(cases, today, target = () => null) {
  const month = String(today).slice(0, 7);
  const dated = (cases || []).filter(c => c.date && c.date <= today);
  const mine = dated.filter(c => c.date.startsWith(month));
  const per = {}, before = {};
  for (const c of dated) for (const code of new Set(c.cats || [])) { if (c.date.startsWith(month)) per[code] = (per[code] || 0) + 1; else if (c.date < month) before[code] = (before[code] || 0) + 1; }
  const top = Object.entries(per).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3);
  const first = Object.keys(per).filter(code => !before[code]).sort();
  const met = Object.keys(per).filter(code => { const n = target(code); return n != null && (before[code] || 0) < n && (before[code] || 0) + per[code] >= n; }).sort();
  return { month, n: mine.length, top, first, met };
}
// Milestones, dated: your first case, round numbers of cases, and each tag's final target reached. Newest first.
export function milestones(cases, target = () => null, rounds = [50, 100, 200, 300, 400, 500, 750, 1000, 1500, 2000]) {
  const dated = (cases || []).filter(c => c.date).sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  const out = [], per = {};
  dated.forEach((c, i) => {
    if (i === 0) out.push({ date: c.date, kind: 'first', n: 1 });
    if (rounds.includes(i + 1)) out.push({ date: c.date, kind: 'cases', n: i + 1 });
    for (const code of new Set(c.cats || [])) {
      per[code] = (per[code] || 0) + 1;
      const n = target(code);
      if (n != null && per[code] === n) out.push({ date: c.date, kind: 'target', code, n });
    }
  });
  return out.reverse();
}
// Patient ages from the case text (estimated): bands, and how many cases said an age. ageOf: details -> years or null
export function ageMix(cases, ageOf) {
  const bands = [['Under 1', 0, 1], ['1–12', 1, 13], ['13–16', 13, 17], ['17–64', 17, 65], ['65–79', 65, 80], ['80 and over', 80, 200]];
  const out = bands.map(([label]) => [label, 0]);
  let known = 0;
  for (const c of cases || []) { const y = ageOf(c.details || ''); if (y == null) continue; known++; const i = bands.findIndex(([, a, b]) => y >= a && y < b); if (i >= 0) out[i][1]++; }
  return { bands: out, known, total: (cases || []).length };
}
// ASA, elective or emergency, GA or regional, from words in the case text (estimated; a case can be both GA and
// regional). -> { asa: [[1..6, n]], emergency, elective, ga, regional, known: { asa, urgency, technique }, total }
export function caseMix(cases) {
  const asa = [1, 2, 3, 4, 5, 6].map(n => [n, 0]);
  let emergency = 0, elective = 0, ga = 0, regional = 0, kA = 0, kU = 0, kT = 0;
  for (const c of cases || []) {
    const t = String(c.details || '');
    const a = t.match(/\bASA\s*([1-6])\s*(E)?\b/i);
    if (a) { asa[Number(a[1]) - 1][1]++; kA++; }
    const em = /\b(emerg\w*|urgent|stat|after[- ]?hours|on[- ]?call|trauma call)\b/i.test(t) || (a && a[2]);
    const el = /\b(elective|day surgery|DSU|listed)\b/i.test(t);
    if (em) { emergency++; kU++; } else if (el) { elective++; kU++; }
    const g = /\b(GA|general an(a)?esthe\w*|ETT|LMA|TIVA|RSI|intubat\w*)\b/i.test(t);
    const r = /\b(spinal|epidural|CSE|block|regional|ESP|TAP|caudal|interscalene|femoral|sciatic)\b/i.test(t);
    if (g) ga++; if (r) regional++; if (g || r) kT++;
  }
  return { asa, emergency, elective, ga, regional, known: { asa: kA, urgency: kU, technique: kT }, total: (cases || []).length };
}
// Logging habits: how many days after the case it was logged (median, and the share on the day), and streaks of days
// in a row with a case logged. now: ms
export function loggingHabits(cases, today) {
  const lag = (cases || []).filter(c => c.date && c.createdAt).map(c => Math.max(0, Math.floor((c.createdAt - parse(c.date).getTime()) / DAY)));
  lag.sort((a, b) => a - b);
  const median = lag.length ? lag[Math.floor(lag.length / 2)] : null;
  const sameDay = lag.length ? lag.filter(x => x === 0).length / lag.length : null;
  const days = [...new Set((cases || []).filter(c => c.date && c.date <= today).map(c => c.date))].sort();
  let best = 0, run = 0, prev = null;
  for (const d of days) { run = prev && (parse(d) - parse(prev)) / DAY === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  // the current run: ends today or yesterday
  let now = 0;
  if (days.length) {
    const last = days[days.length - 1], gap = (parse(today) - parse(last)) / DAY;
    if (gap <= 1) { now = 1; for (let i = days.length - 1; i > 0 && (parse(days[i]) - parse(days[i - 1])) / DAY === 1; i--) now++; }
  }
  return { median, sameDay, logged: lag.length, best, now };
}

// Totals, Compact (owner, 15 Oct 2026): each name as its initials ("Ann Jones" -> "AJ"); names that would share them
// add the next letters of the last word ("AJo", "AJa") until each is its own. -> [short] in the same order
export function shortNames(names) {
  const words = n => String(n || '').trim().split(/\s+/).filter(Boolean);
  const base = n => words(n).map(w => w[0].toUpperCase()).join('').slice(0, 4) || '?';
  const out = names.map(base);
  for (let extra = 1; extra < 12; extra++) {
    const seen = {};
    out.forEach(s => { seen[s] = (seen[s] || 0) + 1; });
    if (!out.some(s => seen[s] > 1)) break;
    out.forEach((s, i) => { if (seen[s] > 1) { const last = words(names[i]).slice(-1)[0] || ''; out[i] = base(names[i]) + last.slice(1, 1 + extra).toLowerCase(); } });
  }
  return out;
}
