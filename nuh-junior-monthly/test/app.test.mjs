// Unit tests: posting rules, PPC, auto-fill on a small month, and the Google Sheet import / export round trip.
// Made-up names only. Run: node nuh-junior-monthly/test/app.test.mjs
import assert from 'node:assert/strict';
import * as M from '../js/model.js';
import * as S from '../js/sheet.js';
import { evaluate, describeRule } from '../js/rules.js';
import { solve } from '../js/solver.js';
import { demoState } from '../js/demo.js';
import { apmesList } from '../js/apmes.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const MONTH = '2026-12', days = M.monthDays(MONTH);

function team() {
  const s = M.defaultState();
  s.rules = s.rules.filter(r => !/^r-(c3|r1b)-(fair|sat)$/.test(r.id) && r.id !== 'r-r1b-d1');
  for (let k = 0; k < 6; k++) s.staff.push({ id: 'i' + k, name: 'Icu Person ' + k, group: 'res2', tags: [], fte: 1, active: true });
  for (let k = 0; k < 4; k++) s.staff.push({ id: 'c' + k, name: 'Cardiac Person ' + k, group: 'nhg', tags: [], fte: 1, active: true });
  for (const d of [M.addDays(days[0], -2), M.addDays(days[0], -1), ...days]) {
    for (let k = 0; k < 6; k++) M.setCell(s, d, 'i' + k, { a: ['ICU'] });
    for (let k = 0; k < 4; k++) M.setCell(s, d, 'c' + k, { a: ['C'] });
  }
  return s;
}
const evalM = s => evaluate(s, { from: days[0], to: days[days.length - 1] });
const ids = (s, rule) => evalM(s).violations.filter(v => v.ruleId === rule);

// PPC: two days after an ICU call, while still in ICU; not when the posting has ended
{
  const s = team();
  M.setCell(s, days[3], 'i0', { a: ['ICU', 'R1B'] });
  ok(M.effectiveCodes(s, days[4], 'i0').includes('x'), 'post call after R1B');
  ok(M.effectiveCodes(s, days[5], 'i0').includes('PPC'), 'PPC two days after R1B');
  M.setCell(s, days[5], 'i0', { a: ['CP'] });
  ok(!M.effectiveCodes(s, days[5], 'i0').includes('PPC'), 'no PPC once the ICU posting ended');
  M.setCell(s, days[5], 'i0', { a: ['ICU', 'R1B'] });
  ok(ids(s, 'r-ppc').length >= 1 && ids(s, 'r-ppc').every(v => v.hard === false), 'a call on the day off after post call is an EOD call: a preference, not a must-hold');
  M.setCell(s, days[5], 'i0', { a: ['ICU'] });
  M.setCell(s, days[4], 'i0', { a: ['ICU', 'R1B'] });
  ok(ids(s, 'r-r1b-gap').length >= 1 && ids(s, 'r-r1b-gap').every(v => v.hard !== false), 'a call on the post call day is never allowed');
}
// the owner's rulings (16 Oct 2026): requests and blocks are preferences; "new to ICU" is strict only for rotating residents and MOPEXes
{
  const s = team();
  ok(M.defaultState().rules.find(r => r.id === 'r-req-x').hard === false && M.defaultState().rules.find(r => r.id === 'r-req-xx').hard === false, 'requests and blocks are preferences');
  ok(M.defaultState().rules.find(r => r.id === 'r-postcall').hard !== false, 'post call as a day off stays a must-hold rule');
  s.staff.push({ id: 'rr0', name: 'Rotating Person', group: 'rr', tags: ['icunew'], fte: 1, active: true });
  for (const d of [M.addDays(days[0], -2), M.addDays(days[0], -1)]) { M.setCell(s, d, 'rr0', { a: ['CP'] }); M.setCell(s, d, 'i1', { a: ['CP'] }); }   // both start ICU on day 1
  for (const d of days) M.setCell(s, d, 'rr0', { a: ['ICU'] });
  s.staff[1].tags = ['icunew'];   // an anaesthesia resident (group res2), also new to ICU
  M.setCell(s, days[1], 'rr0', { a: ['ICU', 'R1B'] });
  M.setCell(s, days[1], 'i1', { a: ['ICU', 'R1B'] });
  const hardNew = evalM(s).violations.filter(v => v.ruleId === 'r-r1b-new' && v.hard !== false);
  ok(hardNew.length === 1 && hardNew[0].staffId === 'rr0', 'new to ICU is a must-hold only for the rotating resident');
  ok(evalM(s).violations.some(v => v.ruleId === 'r-r1b-new-res' && v.staffId === 'i1'), 'an anaesthesia resident new to ICU gets the preference instead');
  // a saved state from before the rulings is updated once
  const old = M.defaultState();
  old.rulesVersion = undefined;
  const x = old.rules.find(r => r.id === 'r-req-x'); x.hard = true; x.weight = 10;
  old.rules = old.rules.filter(r => r.id !== 'r-r1b-new-res'); delete old.rules.find(r => r.id === 'r-r1b-new').who.onlyGroups;
  const up = M.migrate(JSON.parse(JSON.stringify(old)));
  const older = M.defaultState();
  older.rulesVersion = 2;
  older.rules.find(r => r.id === 'r-postcall').params.codesA = ['x', 'PC', 'PPC'];
  older.rules = older.rules.filter(r => !['r-ppc', 'r-c3-eod'].includes(r.id));
  older.rules.find(r => r.id === 'r-r1b-gap').params.to = 2; older.rules.find(r => r.id === 'r-c3-gap').params.to = 2;
  older.rules.find(r => r.id === 'r-r1b-d1').hard = true;
  const up3 = M.migrate(JSON.parse(JSON.stringify(older)));
  ok(up3.rules.find(r => r.id === 'r-r1b-d1').hard === false, 'a day-1 ICU call becomes a last resort in an older saved state');
  ok(!up3.rules.find(r => r.id === 'r-postcall').params.codesA.includes('PPC') && up3.rules.some(r => r.id === 'r-ppc') && up3.rules.some(r => r.id === 'r-c3-eod') && up3.rules.find(r => r.id === 'r-r1b-gap').params.to === 1, 'an older saved state gets the EOD rules once');
  ok(up.rules.find(r => r.id === 'r-req-x').hard === false && up.rules.some(r => r.id === 'r-r1b-new-res') && up.rules.find(r => r.id === 'r-r1b-new').who.onlyGroups.includes('mopex'), 'an older saved state gets the rulings once');
}
// a cardiac call needs a cardiac day; first days of a posting
{
  const s = team();
  M.setCell(s, days[10], 'i1', { a: ['ICU', 'C3'] });
  ok(ids(s, 'r-c3-onc').length === 1, 'C3 off cardiac is flagged');
  s.staff[1].tags = ['icunew']; s.staff[1].group = 'rr';   // a rotating resident: strict
  for (const d of days.slice(0, 12)) M.setCell(s, d, 'i1', { a: ['CP'] });
  M.setCell(s, days[13], 'i1', { a: ['ICU', 'R1B'] });   // day 2 of the ICU block
  ok(ids(s, 'r-r1b-new').length === 1, 'new to ICU: no call on day 2');
  ok(/from day 4/.test(describeRule(s.rules.find(r => r.id === 'r-r1b-new'), s)), 'postingStart describes itself');
}
// auto-fill: one call of each a night, with no must-fix problems
{
  const s = team();
  const r = solve(s, { from: days[0], to: days[days.length - 1], timeMs: 4000 });
  ok(r.after.hard === 0, `auto-fill leaves no must-fix problems (got ${r.after.hard})`);
  let c3 = 0, r1b = 0;
  for (const m of Object.values(r.assignments)) for (const codes of Object.values(m)) { c3 += codes.filter(c => c === 'C3').length; r1b += codes.filter(c => c === 'R1B').length; }
  ok(c3 === days.length && r1b === days.length, 'one cardiac and one ICU call every night');
}
// EOD calls: with only two people on ICU a night can only be covered by a call right after the post call day, so Auto-fill uses one
// (and never a call on the post call day itself)
{
  const s = M.defaultState();
  s.rules = s.rules.filter(r => !/^r-c3/.test(r.id));
  for (let k = 0; k < 2; k++) s.staff.push({ id: 'e' + k, name: 'Eod Person ' + k, group: 'res2', tags: [], fte: 1, active: true });
  for (const d of [M.addDays(days[0], -3), M.addDays(days[0], -2), M.addDays(days[0], -1), ...days]) for (let k = 0; k < 2; k++) M.setCell(s, d, 'e' + k, { a: ['ICU'] });
  const r = solve(s, { from: days[0], to: days[days.length - 1], timeMs: 4000 });
  ok(r.after.hard === 0 && !(r.unfilled || []).length, `two people on ICU: every night covered with no must-fix problem (hard ${r.after.hard}, unfilled ${(r.unfilled || []).length})`);
  for (const [d, m] of Object.entries(r.assignments)) for (const [id, codes] of Object.entries(m)) if (codes.length) M.setCell(s, d, id, { a: [...(M.getCell(s, d, id)?.a || []), ...codes], auto: codes });
  ok(evalM(s).violations.some(v => v.ruleId === 'r-ppc'), 'and it says which nights are EOD calls');
}
// a rotation change: everyone on ICU starts on day 1 (nothing before it), yet night 1 still needs a call, so a day-1 call is the last resort
{
  const s = M.defaultState();
  s.rules = s.rules.filter(r => !/^r-c3/.test(r.id));
  for (let k = 0; k < 4; k++) s.staff.push({ id: 'n' + k, name: 'New Person ' + k, group: 'res2', tags: [], fte: 1, active: true });
  for (const d of days) for (let k = 0; k < 4; k++) M.setCell(s, d, 'n' + k, { a: ['ICU'] });
  const r = solve(s, { from: days[0], to: days[days.length - 1], timeMs: 3000 });
  ok(r.after.hard === 0 && !(r.unfilled || []).length, `a rotation change: night 1 is still covered (hard ${r.after.hard}, unfilled ${(r.unfilled || []).length})`);
}
// the Google Sheet: parse, import, and give back the same cells when nothing changed
{
  const head = ['S/N', 'Grade', 'Name', ...days.map((d, i) => String(i + 1)), '1-Jan', 'WE'];
  const wd = ['', '', '', ...days.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][M.weekday(d)]), 'Fri', 'WE'];
  const row = (sn, g, name, f) => [String(sn), g, name, ...days.map((d, i) => f(i)), 'Z', '0'];
  const rows = [['legend'], ['legend 2'], ['', '', '', 'DEPARTMENT OF ANAESTHESIA STAFF ROSTER'], ['Dept', '', '', '1 to 31 December 26'], wd, head,
    row(1, 'SC', 'A Senior Person', () => 'WE'),
    row(2, 'RES2', 'Icu Example', i => (i === 4 ? 'R1B' : i === 5 ? 'PC' : i === 6 ? 'PPC' : 'ICU')),
    row(3, 'NHG', 'Cardiac Example', i => (i === 2 ? 'C3' : i === 3 ? 'PC' : 'C')),
    row(4, 'MOPEX', 'Leave Example', i => (i < 3 ? 'AL' : i === 9 ? 'X/NP' : i === 12 ? '(XX)' : '')),
    [], ['', '', 'R1', ...days.map(() => '1')]];
  const grid = S.parseGrid(rows);
  ok(grid && grid.people.length === 4 && grid.month === MONTH && S.monthFits(grid, MONTH), 'grid found, month read');
  let s = M.defaultState();
  const plan = S.planImport(s, grid, MONTH);
  ok(plan.people[0].skip && !plan.people[1].skip, 'senior rows are left alone');
  S.applyImport(s, plan, grid, { tab: 'Request' });
  const icu = s.staff.find(p => p.name === 'Icu Example');
  ok(M.getCell(s, days[4], icu.id).a.includes('ICU'), 'the posting under a call comes from the days around');
  ok(M.effectiveCodes(s, days[6], icu.id).includes('PPC'), 'PPC worked out after import');
  const ex = S.exportBlock(s, MONTH);
  ok(ex.changes.length === 0, `nothing changed, nothing differs (${ex.changes.map(c => c.cell + ' ' + c.from + '>' + c.to).join(', ')})`);
  ok(ex.topLeft === 'D7' && ex.range === 'D7:AI10', `pastes at D7 (${ex.range})`);
  ok(ex.tsv.split('\n')[3].split('\t')[9] === 'X/NP', 'an unchanged cell goes back as typed');
  // a call on the last day: the sheet's marker (Z) in the 1st-of-next-month cell is left as it is
  const cardLast = s.staff.find(p => p.name === 'Cardiac Example');
  const lastC = M.getCell(s, days[days.length - 1], cardLast.id);
  M.setCell(s, days[days.length - 1], cardLast.id, { a: [...lastC.a, 'C3'] });
  ok(!S.exportBlock(s, MONTH).changes.some(c => c.date === M.addDays(days[days.length - 1], 1)), 'a Z in the next-month column is not overwritten');
  M.setCell(s, days[days.length - 1], cardLast.id, { a: lastC.a });
  // place a cardiac call: the cell and the next day's PC change
  const card = s.staff.find(p => p.name === 'Cardiac Example');
  const c = M.getCell(s, days[20], card.id);
  M.setCell(s, days[20], card.id, { a: [...c.a, 'C3'] });
  const ex2 = S.exportBlock(s, MONTH);
  ok(ex2.changes.length === 2 && ex2.changes[0].to === 'C3' && ex2.changes[1].to === 'PC', 'a new call and its post call');
}
// import fixes found by the backtest: leave inside a posting keeps the posting; someone listed twice
{
  const head = ['S/N', 'Grade', 'Name', ...days.map((d, i) => String(i + 1)), '1-Jan'];
  const wd = ['', '', '', ...days.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][M.weekday(d)]), ''];
  const row = (sn, g, name, f) => [String(sn), g, name, ...days.map((d, i) => f(i)), ''];
  const rows = [['x'], ['x'], ['', '', '', 'December 26'], ['x'], wd, head,
    row(1, 'RES1', 'Icu Leave', i => (i === 6 ? 'TL' : i === 7 ? 'R1B' : i === 8 ? 'PC' : i === 9 ? 'PPC' : 'ICU')),
    row(2, 'RES2', 'Twice Listed', () => 'Z'),
    row(3, 'MOPEX', 'Twice Listed', i => (i < 10 ? 'CP' : 'AL'))];
  const grid = S.parseGrid(rows);
  const s = M.defaultState();
  const plan = S.planImport(s, grid, MONTH);
  ok(plan.people.filter(p => p.skip).length === 1 && plan.people[1].skip, 'the row of someone listed twice without their roster is left alone');
  S.applyImport(s, plan, grid, {});
  const p = s.staff.find(x => x.name === 'Icu Leave');
  ok(M.getCell(s, days[6], p.id).a.includes('ICU'), 'a day of leave inside ICU keeps the posting underneath');
  ok(!evaluate(s, { from: days[0], to: days[days.length - 1] }).violations.some(v => v.ruleId === 'r-r1b-d1' && v.staffId === p.id), 'leave inside ICU does not start a new posting');
  const ex = S.exportBlock(s, MONTH);
  ok(ex.changes.length === 0, 'and nothing is written back differently (' + ex.changes.map(c => c.cell + ' ' + c.from + '>' + c.to).join(', ') + ')');
}
// the practice department loads and its rules can be checked
{
  const s = demoState('2026-10-15');
  ok(s.staff.length > 60, 'practice department');
  const ev = evaluate(s, { from: '2026-10-01', to: '2026-10-31' });
  ok(ev.violations.length >= 0 && !(ev.failed || []).length, 'every rule checks');
}
// the staff list for APMES People: everyone in post, in sheet order, with the sheet's grade; the roster month is the
// last one imported from the sheet
{
  const s = M.defaultState();
  s.staff.push({ id: 'a', name: 'Res Two', group: 'res2', tags: [], fte: 1, active: true },
    { id: 'b', name: 'Senior\tOne', group: 'r', tags: [], fte: 1, active: true, start: '2026-07-01' },
    { id: 'c', name: 'Gone Already', group: 'res1', tags: [], fte: 1, active: true, end: '2026-09-30' },
    { id: 'd', name: 'Not Active', group: 'res1', tags: [], fte: 1, active: false },
    { id: 'e', name: 'Mo Pex', group: 'mopex', tags: [], fte: 1, active: true, note: 'private note' });
  s.sheets = { '2026-11': {}, '2026-12': {} };
  const out = apmesList(s, { today: '2026-10-16' });
  const lines = out.text.replace(/\n$/, '').split('\n');
  ok(lines[0] === 'NUH Junior Monthly staff, roster month 2026-12, copied 2026-10-16' && lines[1] === 'Grade\tName\tFrom\tUntil', 'APMES list: the month and the header');
  ok(JSON.stringify(lines.slice(2)) === JSON.stringify(['R\tSenior One\t2026-07-01\t', 'RES2\tRes Two\t\t', 'MOPEX\tMo Pex\t\t']), 'APMES list: in post, sheet order, sheet grades (' + lines.slice(2) + ')');
  ok(out.count === 3 && out.month === '2026-12' && !out.text.includes('private'), 'APMES list: names and grades only');
  ok(apmesList(M.defaultState(), { today: '2026-10-16' }).month === '2026-10', 'APMES list: no sheet imported yet: this month');
  ok(apmesList(demoState('2026-10-15')).count > 60, 'APMES list: the practice department');
}
console.log(`nuh-junior-monthly: ${n} checks passed`);
