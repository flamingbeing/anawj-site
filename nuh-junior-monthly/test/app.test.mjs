// Unit tests: posting rules, PPC, auto-fill on a small month, and the Google Sheet import / export round trip.
// Made-up names only. Run: node nuh-junior-monthly/test/app.test.mjs
import assert from 'node:assert/strict';
import * as M from '../js/model.js';
import * as S from '../js/sheet.js';
import { evaluate, describeRule } from '../js/rules.js';
import { solve } from '../js/solver.js';
import { demoState } from '../js/demo.js';
import * as G from '../js/gsheets.js';

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
// reading and writing the Google Sheet (a fake Sheets API in memory): check it is unchanged before writing, write only the changes, read back
{
  const head = ['S/N', 'Grade', 'Name', ...days.map((d, i) => String(i + 1)), '1-Jan'];
  const wd = ['', '', '', ...days.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][M.weekday(d)]), ''];
  const row = (sn, g, name, f) => [String(sn), g, name, ...days.map((d, i) => f(i)), 'Z'];
  const sheet = [['legend'], ['legend 2'], ['', '', '', 'DEPARTMENT OF ANAESTHESIA STAFF ROSTER'], ['Dept', '', '', '1 to 31 December 26'], wd, head,
    row(1, 'RES2', 'Icu Example', () => 'ICU'),
    row(2, 'NHG', 'Cardiac Example', () => 'C')];
  const colIdx = L => [...L].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const puts = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const json = o => ({ ok: true, status: 200, json: async () => o });
    if (/\/spreadsheets\/SHEETID\?fields/.test(u)) return json({ properties: { title: 'Test roster' }, sheets: [{ properties: { sheetId: 7, title: 'Request', gridProperties: { rowCount: 50, columnCount: 40 } } }] });
    if (/values\/'Request'!A1:/.test(u)) return json({ values: sheet.map(r => r.slice()) });
    if (/values:batchGet/.test(u)) return json({ valueRanges: [...u.matchAll(/ranges='Request'!([A-Z]+)(\d+)/g)].map(m => ({ values: [[(sheet[+m[2] - 1] || [])[colIdx(m[1])] ?? '']] })) });
    if (/values:batchUpdate/.test(u)) {
      const body = JSON.parse(opts.body);
      if (body.valueInputOption !== 'RAW') throw new Error('values must be written RAW');
      for (const d of body.data) { const m = d.range.match(/!([A-Z]+)(\d+)$/); sheet[+m[2] - 1][colIdx(m[1])] = d.values[0][0]; puts.push(m[1] + m[2]); }
      return json({});
    }
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no' } }) };
  };
  G.hooks.getToken = async () => 'test-token';
  const p = G.parseSheetUrl('https://docs.google.com/spreadsheets/d/SHEETID_0123456789abcdefgh/edit?gid=7#gid=7');
  ok(p && p.id.startsWith('SHEETID') && p.gid === '7' && !G.parseSheetUrl('not a link'), 'a Google Sheet link gives its id and tab');
  const SID = 'SHEETID';
  const info = await G.getTabs(SID);
  const tab = G.chooseTab(info.tabs, null);
  ok(tab.title === 'Request', 'the Request tab is chosen');
  const grid = S.parseGrid(await G.readGrid(SID, tab));
  const s = M.defaultState();
  S.applyImport(s, S.planImport(s, grid, MONTH), grid, { tab: tab.title, source: { id: SID, gid: tab.gid, title: tab.title } });
  const lay = s.sheets[MONTH];
  ok((await G.checkUnchanged({ id: SID, gid: tab.gid }, lay, days.length)).ok, 'right after reading, the sheet is unchanged');
  const card = s.staff.find(x => x.name === 'Cardiac Example');
  M.setCell(s, days[20], card.id, { a: [...M.getCell(s, days[20], card.id).a, 'C3'] });
  const ex = S.exportBlock(s, MONTH);
  ok(ex.changes.length === 2 && ex.changes.every(c => c.row && c.k != null), 'a new call and its post call are the changes');
  // somebody edits the sheet in between: nothing may be written, and the cell is named
  sheet[7][3 + 4] = 'AL';
  const bad = await G.checkUnchanged({ id: SID, gid: tab.gid }, lay, days.length);
  ok(!bad.ok && bad.diffs.length === 1 && bad.diffs[0].now === 'AL' && bad.diffs[0].cell === 'H8', `an edit made since is found (${bad.diffs.map(d => d.cell).join(',')})`);
  // a row moved: the names no longer match
  sheet[7][3 + 4] = 'C';
  const moved = sheet.splice(6, 1)[0]; sheet.push(moved);
  ok(!(await G.checkUnchanged({ id: SID, gid: tab.gid }, lay, days.length)).ok, 'rows that moved are found');
  sheet.pop(); sheet.splice(6, 0, moved);
  ok((await G.checkUnchanged({ id: SID, gid: tab.gid }, lay, days.length)).ok, 'put back, the sheet is unchanged again');
  const w = await G.writeChanges({ id: SID }, lay, ex.changes);
  ok(w.verified && puts.length === 2 && sheet[7][3 + 20] === 'C3' && sheet[7][3 + 21] === 'PC', `only the 2 changed cells were written and read back (${puts.join(',')})`);
  ok(sheet[6].every((v, i) => v === row(1, 'RES2', 'Icu Example', () => 'ICU')[i]), 'the other rows are exactly as they were');
  s.sheets[MONTH].orig = JSON.parse(JSON.stringify(s.sheets[MONTH].orig));
  S.markWritten(s, MONTH, ex.changes);
  ok(S.exportBlock(s, MONTH).changes.length === 0, 'after writing, nothing differs from the sheet');
  ok(s.sheets[MONTH].lastWrite.changes.length === 2, 'the write is recorded so it can be undone');
  // undo: a cell somebody edited since is left alone, the other goes back
  sheet[7][3 + 21] = 'AL';
  const preview = await G.checkCells({ id: SID }, s.sheets[MONTH], s.sheets[MONTH].lastWrite.changes);
  ok(preview.skipped.length === 1 && preview.skipped[0].cell === 'Y8', 'the undo preview names the cell changed since');
  const u = await G.undoChanges({ id: SID }, s.sheets[MONTH], s.sheets[MONTH].lastWrite.changes);
  ok(u.restored.length === 1 && u.skipped.length === 1 && sheet[7][3 + 20] === 'C' && sheet[7][3 + 21] === 'AL' && u.verified, 'undo puts back only what the app wrote and leaves the other edit');
  S.markUndone(s, MONTH, u.restored, u.skipped);
  ok(s.sheets[MONTH].lastWrite.changes.length === 1 && s.sheets[MONTH].orig[8][3 + 20] === 'C', 'the undone cell is "as read" again, the other stays in the record');
  // a cell holding a formula is never overwritten
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, o) => (/FORMULA/.test(String(url)) ? { ok: true, status: 200, json: async () => ({ valueRanges: [{ values: [['=A1']] }] }) } : realFetch(url, o));
  let refused = '';
  try { await G.writeChanges({ id: SID }, s.sheets[MONTH], [{ cell: 'X8', row: 8, k: 20, from: 'C', to: 'C3' }]); } catch (e) { refused = e.message; }
  globalThis.fetch = realFetch;
  ok(/holds a formula/.test(refused), 'a cell holding a formula is not overwritten'); 
}
// locking a month: nothing in it can change until it is unlocked
{
  const mem = {};
  globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const { createStore } = await import('../js/store.js');
  const store = createStore({ demo: true, fallback: () => M.defaultState() });
  store.commit('add', d => { d.staff.push({ id: 'z1', name: 'Z', group: 'res2', tags: [], fte: 1, active: true }); });
  store.commit('lock', d => { M.setMonthLocked(d, MONTH, true); });
  ok(M.isMonthLocked(store.get(), MONTH), 'the month is locked');
  let told = null; store.onLocked = m => { told = m; };
  ok(store.commit('edit', d => { M.setCell(d, days[2], 'z1', { a: ['ICU'] }); }) === false && told && told[0] === MONTH && !M.getCell(store.get(), days[2], 'z1'), 'a change to a locked month is refused');
  ok(store.commit('edit next month', d => { M.setCell(d, M.addDays(days[days.length - 1], 2), 'z1', { a: ['ICU'] }); }) === true, 'another month can still change');
  store.commit('unlock', d => { M.setMonthLocked(d, MONTH, false); });
  ok(store.commit('edit', d => { M.setCell(d, days[2], 'z1', { a: ['ICU'] }); }) === true, 'unlocked, it changes again');
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
console.log(`nuh-junior-monthly: ${n} checks passed`);
