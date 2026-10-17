// Run with: node logbook/test/analytics.test.mjs  (fake data only)
import assert from 'node:assert/strict';
import { milestoneEnd, paceForecast, paceText, goneQuiet, reflectionTodos } from '../js/analytics.js';

const row = (code, count, n, by = 'R3', status = 'due') => ({ code, count, next: { by, n }, status });
const cases = list => list.map(([date, ...cats], i) => ({ id: 'c' + i, date, cats }));

// a residency year ends on 30 June; later years follow on
{
  assert.equal(milestoneEnd('R3', 3, '2026-10-12'), '2027-06-30');
  assert.equal(milestoneEnd('R3', 2, '2026-10-12'), '2028-06-30');
  assert.equal(milestoneEnd('R1', 1, '2027-03-01'), '2027-06-30', 'Jan–Jun is still the academic year that began last July');
  assert.equal(milestoneEnd('R5', 4, '2026-10-12'), '2028-06-30', 'R5 (shown as SR2) is year 5');
}

// pace: cases a month over the last 6 months; off pace when the next target can't be reached by its year's end
{
  const today = '2026-10-12';
  const cs = cases([
    ['2026-09-01', 'A'], ['2026-08-01', 'A'], ['2026-07-01', 'A'], ['2026-06-01', 'A'], ['2026-05-01', 'A'], ['2026-04-20', 'A'],
    ['2025-01-01', 'B'],   // too old for the window, but sets the first case early
    ['2026-10-01', 'C'],
  ]);
  const f = paceForecast([row('A', 6, 18), row('B', 1, 5), row('C', 1, 30), row('D', 3, 3, 'R3', 'done'), { code: 'E', count: 2, next: null, status: 'none' }], cs, 3, today);
  assert.ok(Math.abs(f.A.rate - 1) < 0.05, 'six cases in six months is about one a month');
  assert.equal(f.A.needed, 12);
  assert.equal(f.A.deadline, '2027-06-30');
  assert.equal(f.A.offPace, true, '12 more at one a month won\'t fit before June');
  assert.equal(f.B.rate, 0); assert.equal(f.B.monthsToGo, Infinity); assert.equal(f.B.offPace, true);
  assert.ok(!('D' in f) && !('E' in f), 'done and no-target tags have no forecast');
  // C: one case in six months, 29 to go
  assert.equal(f.C.offPace, true);
  const g = paceForecast([row('A', 6, 8)], cs, 3, today);
  assert.equal(g.A.offPace, false, '2 more at one a month fits');
  assert.equal(paceText(g.A), 'about 2 months at your pace');
  assert.equal(paceText(f.B), 'no cases in the last 6 months');
  assert.equal(paceText({ monthsToGo: 0.4 }), 'about a month at your pace');
  assert.equal(paceText({ monthsToGo: 23.2 }), 'about 23 months at your pace');
  assert.equal(paceText({ monthsToGo: 82 }), 'over 6 years at your pace');
}

// a new resident: the window is from the first case (at least a month), not a full six months
{
  const cs = cases([['2026-09-12', 'A'], ['2026-09-20', 'A'], ['2026-10-01', 'A'], ['2026-10-10', 'A']]);
  const f = paceForecast([row('A', 4, 10, 'R1', 'due')], cs, 1, '2026-10-12');
  assert.ok(f.A.rate > 3.5 && f.A.rate < 4.5, 'four cases in about a month');
  // future-dated (upcoming) cases don't count towards the pace
  const g = paceForecast([row('A', 4, 10, 'R1', 'due')], [...cs, { id: 'x', date: '2026-12-01', cats: ['A'] }], 1, '2026-10-12');
  assert.equal(g.A.rate, f.A.rate);
}

// gone quiet: still needed, last logged 60+ days ago; never-logged and done tags are left out
{
  const cs = cases([['2026-01-05', 'A'], ['2026-07-01', 'A'], ['2026-09-30', 'B'], ['2025-12-01', 'C'], ['2026-01-01', 'D']]);
  const q = goneQuiet([row('A', 2, 5), row('B', 1, 5), row('C', 1, 5), row('D', 1, 1, 'R3', 'done'), row('E', 0, 5)], cs, '2026-10-12');
  assert.deepEqual(q.map(x => x.code), ['C', 'A'], 'longest quiet first');
  assert.equal(q[1].last, '2026-07-01');
  assert.equal(q[1].days, 103);
}

// reflection to-dos
{
  const now = Date.UTC(2026, 9, 12);
  const cs = [{ id: 'a', date: '2026-10-01', reflectTag: true }, { id: 'b', date: '2026-10-05', reflectTag: true }, { id: 'c', date: '2026-10-06', reflectTag: true }, { id: 'd', date: '2026-10-07' }];
  const rs = [
    { id: 'r1', caseId: 'c', status: 'complete', updatedAt: now - 90 * 864e5 },
    { id: 'r2', status: 'draft', updatedAt: now - 45 * 864e5 },
    { id: 'r3', status: 'draft', updatedAt: now - 5 * 864e5 },
    { id: 'r4', status: 'draft', createdAt: now - 70 * 864e5 },
  ];
  const t = reflectionTodos(cs, rs, now);
  assert.deepEqual(t.interesting.map(c => c.id), ['b', 'a'], 'starred, no reflection, newest first');
  assert.deepEqual(t.stale.map(r => r.id), ['r4', 'r2'], 'drafts untouched 30+ days, oldest first; complete ones never');
}

// Analytics Edit mode: the account's layout of the cards
{
  const { arrangeCards, moveCard, hideCard, cleanLayout } = await import('../js/analytics.js');
  const ids = ['urgent', 'quiet', 'targets', 'refl', 'trends'];
  assert.deepEqual(arrangeCards(ids, null), { shown: ids, hidden: [] });
  assert.deepEqual(arrangeCards(ids, { order: ['trends', 'urgent'], hidden: ['quiet'] }), { shown: ['trends', 'urgent', 'targets', 'refl'], hidden: ['quiet'] });
  assert.deepEqual(arrangeCards(['urgent', 'targets'], { order: ['trends', 'targets', 'urgent'] }).shown, ['targets', 'urgent'], 'cards a profile lacks are left out');
  let l = moveCard(ids, null, 'trends', -10);
  assert.deepEqual(arrangeCards(ids, l).shown, ['trends', 'urgent', 'quiet', 'targets', 'refl']);
  l = hideCard(ids, l, 'quiet', true);
  assert.deepEqual(arrangeCards(ids, l), { shown: ['trends', 'urgent', 'targets', 'refl'], hidden: ['quiet'] });
  l = moveCard(ids, l, 'urgent', 1);
  assert.deepEqual(arrangeCards(ids, l).shown, ['trends', 'targets', 'urgent', 'refl']);
  assert.deepEqual(arrangeCards(ids, hideCard(ids, l, 'quiet', false)).shown, ['trends', 'targets', 'urgent', 'refl', 'quiet']);
  assert.deepEqual(cleanLayout({ order: ['a', 'a', 'B!', 3], hidden: 'x' }), { order: ['a'], hidden: [], show: [] });
  // cards hidden until shown (off), shown with Show, hidden again with Hide
  const off = ['habits'];
  const ids2 = ['urgent', 'trends', 'habits'];
  assert.deepEqual(arrangeCards(ids2, null, off), { shown: ['urgent', 'trends'], hidden: ['habits'] });
  let l2 = hideCard(ids2, null, 'habits', false, off);
  assert.deepEqual(arrangeCards(ids2, l2, off).shown, ['urgent', 'trends', 'habits']);
  l2 = moveCard(ids2, l2, 'habits', -2, off);
  assert.deepEqual(arrangeCards(ids2, l2, off).shown, ['habits', 'urgent', 'trends']);
  assert.deepEqual(arrangeCards(ids2, hideCard(ids2, l2, 'habits', true, off), off).hidden, ['habits']);
}

// 5b: the new cards (fake cases)
{
  const A = await import('../js/analytics.js');
  const fl = A.finishLine({ '01': { monthsToGo: 2, deadline: '2027-06-30' }, '02': { monthsToGo: Infinity, deadline: '2027-06-30' }, '03': { monthsToGo: 30, deadline: '2027-06-30' } }, '2026-10-15');
  assert.deepEqual(fl.map(x => [x.code, x.late]), [['02', true], ['03', true], ['01', false]]);
  assert.equal(fl[2].eta, '2026-12-15');
  const cases = [
    { date: '2026-09-01', cats: ['13'], createdAt: new Date(2026, 8, 1, 20).getTime(), details: 'ZZ 45F fake hernia GA ETT ASA 2 elective' },
    { date: '2026-10-02', cats: ['13', '16'], createdAt: new Date(2026, 9, 4).getTime(), details: 'ZY 30F fake LSCS spinal ASA 2E emergency' },
    { date: '2026-10-03', cats: ['16'], createdAt: new Date(2026, 9, 3, 9).getTime(), details: 'ZX 5yo fake circumcision caudal GA LMA' },
    { date: '2026-10-04', cats: ['16'], createdAt: new Date(2026, 9, 4, 9).getTime(), details: 'fake TKR' },
  ];
  const target = code => ({ '16': 3, '13': 5 }[code] ?? null);
  const m = A.monthSummary(cases, '2026-10-15', target);
  assert.deepEqual(m, { month: '2026-10', n: 3, top: [['16', 3], ['13', 1]], first: ['16'], met: ['16'] });
  const ms = A.milestones(cases, target, [2]);
  assert.deepEqual(ms.map(x => [x.kind, x.date, x.code || x.n]), [['target', '2026-10-04', '16'], ['cases', '2026-10-02', 2], ['first', '2026-09-01', 1]]);
  const ages = A.ageMix(cases, t => ({ ZZ: 45, ZY: 30, ZX: 5 }[t.slice(0, 2)] ?? null));
  assert.deepEqual(ages.bands.filter(([, n]) => n), [['1–12', 1], ['17–64', 2]]);
  assert.equal(ages.known, 3); assert.equal(ages.total, 4);
  const mix = A.caseMix(cases);
  assert.deepEqual(mix.asa.filter(([, n]) => n), [[2, 2]]);
  assert.deepEqual([mix.emergency, mix.elective, mix.ga, mix.regional], [1, 1, 2, 2]);
  assert.deepEqual(mix.known, { asa: 2, urgency: 2, technique: 3 });
  const hb = A.loggingHabits(cases, '2026-10-04');
  assert.deepEqual(hb, { median: 0, sameDay: 0.75, logged: 4, best: 3, now: 3 });
  assert.equal(A.loggingHabits(cases, '2026-10-10').now, 0);
}

// Totals compact: initials, a clash adds letters of the surname
{
  const { shortNames } = await import('../js/analytics.js');
  assert.deepEqual(shortNames(['Ann Jones', 'Ben Lee', 'Amy Jacobs', 'Cara']), ['AJo', 'BL', 'AJa', 'C']);
  assert.deepEqual(shortNames(['Fake Resident A', 'Fake Resident B']), ['FRA', 'FRB']);
  assert.deepEqual(shortNames(['Al Jo', 'Al Jo']).length, 2);
  assert.deepEqual(shortNames(['']), ['?']);
}

console.log('analytics tests passed');
