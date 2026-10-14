// Run with: node logbook/test/outbox-script.test.mjs  (fake data only)
// The response sheet's outbox script (form-script/Outbox.gs): what it writes into the Case tab must be what the sheet's own
// script and the logbook's workbook import expect.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { CATEGORIES } from '../js/categories.js';
import { parseCaseSheet } from '../js/importer.js';

const src = fs.readFileSync(new URL('../form-script/Outbox.gs', import.meta.url), 'utf8');
const sandbox = { module: { exports: {} }, Date };
vm.runInNewContext(src, sandbox);
const S = sandbox.module.exports;

// the labels are exactly the app's
const plain = o => JSON.parse(JSON.stringify(o));   // (the script runs in its own vm context: prototypes differ)
assert.deepEqual(plain(S.labels), Object.fromEntries(CATEGORIES.map(c => [c.code, c.label])), 'Outbox.gs labels match categories.js');
assert.ok(CATEGORIES.every(c => !c.label.includes(',')), 'no label has a comma (the sheet splits cells on commas)');

// categories land in the Form's columns: D main, E 15i-ii, F 20i-iv, G 26i-iv
{
  const r = S.categories(['16', '20', '20iii', '26', '26i', '26ii', '15', '15i', '16', '42']);
  assert.deepEqual([...r.cells], [
    `${S.labels['16']}, ${S.labels['20']}, ${S.labels['26']}, ${S.labels['15']}`, S.labels['15i'], S.labels['20iii'], `${S.labels['26i']}, ${S.labels['26ii']}`]);
  assert.deepEqual([...r.unknown], ['42']);
  assert.deepEqual([...S.categories([]).cells], ['', '', '', '']);
}

// a row
const entry = { id: 'k1', email: 'fake.person@example.com', rid: '202301', date: '2026-10-14', initials: 'AB', details: '34F elective LSCS spinal',
  cats: ['16', '28'], createdAt: Date.parse('2026-10-14T03:20:15Z') };
const TEXT = 'Fake Person (202301)';
{
  const row = S.row(entry, TEXT);
  assert.equal(row.length, 10);
  assert.equal(row[0], TEXT);
  assert.ok(row[1] instanceof Date && row[1].getFullYear() === 2026 && row[1].getMonth() === 9 && row[1].getDate() === 14, 'B is a real date (the sheet script reads Year / Month / Week from it)');
  assert.equal(row[2], 'AB 34F elective LSCS spinal');
  assert.equal(row[3], `${S.labels['16']}, ${S.labels['28']}`);
  assert.deepEqual([row[4], row[5], row[6]], ['', '', '']);
  assert.ok(row[7] instanceof Date && row[7].getTime() === entry.createdAt, 'H is the moment it was logged');
  assert.equal(row[8], 'fake.person@example.com');
  assert.equal(row[9], 'app:k1');
  // no date: the typed text goes in B
  assert.equal(S.row({ ...entry, date: null, dateText: 'last Tue' }, TEXT)[1], 'last Tue');
  // no initials
  assert.equal(S.row({ ...entry, initials: '' }, TEXT)[2], '34F elective LSCS spinal');
}

// what the logbook's workbook import makes of such a row (column J blank): the same case; with J set it skips the row
{
  const HEADER = ['Resident', 'Date', 'Initials,  Case Details', 'Category', 'Neurosurgical procedure (15 | 15)', 'Paediatric Surgery (125 | 155)', 'Peripheral nerve blocks (R2=10 | R3=20 | R4=30 | R5=40)', 'Timestamp', 'Email address'];
  const e = { ...entry, cats: ['16', '20', '20iii', '26', '26i', '15', '15i'] };
  const row = S.row(e, TEXT);
  const asCase = [...row.slice(0, 9), ''];
  const res = parseCaseSheet([HEADER, asCase]);
  assert.equal(res.cases.length, 1);
  const c = res.cases[0];
  assert.deepEqual([c.rid, c.date, c.details], ['202301', '2026-10-14', 'AB 34F elective LSCS spinal']);
  assert.deepEqual([...c.cats].sort(), ['15', '15i', '16', '20', '20iii', '26', '26i']);
  const skipped = parseCaseSheet([HEADER, [...row]]);
  assert.equal(skipped.cases.length, 0);
  assert.deepEqual(skipped.skipped, [{ row: 2, reason: 'Made in the app' }]);
}

// phase 1 (rows, Database, one sort), against fakes of the sheet and the existing script
function fakeIo(over = {}) {
  const log = [], rows = [];
  return {
    log, rows, markers: {},
    residentOk: rid => rid !== '999999',
    residentText: rid => `Fake Person (${rid})`,
    appendRow: row => { rows.push(row); log.push('append'); return rows.length + 1; },
    database: (n, first8) => { log.push(`database ${n} ${first8.length}`); },
    sort: () => log.push('sort'),
    residentReport: rid => log.push(`report ${rid}`),
    aySummary: ay => log.push(`totals ${ay}`),
    ...over,
  };
}
const ids = a => [...a];
{
  const io = fakeIo();
  const entries = [entry, { ...entry, id: 'k2', rid: '202302' }, { ...entry, id: 'k3', rid: '999999' }, { ...entry, id: 'k4', rid: 'abc' }, { ...entry, id: 'k5', rid: '202301' }];
  const r = S.add(entries, io);
  assert.deepEqual(ids(r.done), ['k1', 'k2', 'k5']);
  assert.deepEqual(ids(r.skipped.map(s => s.id)), ['k3', 'k4']);
  assert.deepEqual(ids(r.errors), []);
  assert.deepEqual(ids(r.rids).sort(), ['202301', '202302']); assert.deepEqual(ids(r.ays), ['AY2023']);
  // the sheet's order: each row into the Case tab and the Database (before the sort), then one sort; no rebuilds in this hold
  assert.deepEqual(ids(io.log), ['append', 'database 2 8', 'append', 'database 3 8', 'append', 'database 4 8', 'sort']);
  // run again with the markers it left: nothing is added twice, the entries can still be deleted and their rebuilds are owed
  const again = S.add(entries.slice(0, 2), { ...io, log: [], appendRow: () => { throw new Error('added twice'); } });
  assert.deepEqual(ids(again.done), ['k1', 'k2']); assert.deepEqual(ids(again.rids).sort(), ['202301', '202302']);
}
// nothing to add: no sort
{
  const io = fakeIo();
  S.add([{ ...entry, rid: '999999' }], io);
  assert.deepEqual(ids(io.log), []);
}
// a failing Database step does not hold the entry back (its row is in the sheet), and is reported; the sort still runs
{
  const io = fakeIo({ database: () => { throw new Error('boom'); } });
  const r = S.add([entry], io);
  assert.deepEqual(ids(r.done), ['k1']); assert.equal(r.errors.length, 1); assert.ok(io.log.includes('sort'));
}

// a whole run: the lock is held in pieces (a few entries, then each rebuild), and rebuilds owed survive a stopped run
function fakeEnv({ entries = [], pending = { rids: [], ays: [] }, over = {}, ioOver = {} } = {}) {
  const log = [];
  let clock = 0, held = 0, maxHeld = 0, holds = 0;
  const io = fakeIo({ ...ioOver, appendRow: row => { log.push('append'); return 2; }, database: () => log.push('database'), sort: () => log.push('sort'),
    residentReport: rid => { log.push(`report ${rid}`); clock += 20000; }, aySummary: ay => { log.push(`totals ${ay}`); clock += 30000; } });
  const store = { pending: JSON.parse(JSON.stringify(pending)) };
  const env = { trail: log, log: () => {}, store, io,
    list: () => entries, remove: id => log.push(`delete ${id}`),
    locked: fn => { held++; holds++; maxHeld = Math.max(maxHeld, held); log.push('lock'); try { fn(); } finally { held--; log.push('unlock'); } },
    getPending: () => JSON.parse(JSON.stringify(store.pending)), setPending: p => { store.pending = JSON.parse(JSON.stringify(p)); log.push('pending ' + p.rids.length + '/' + p.ays.length); },
    now: () => clock, pause: ms => { clock += ms; }, ...over };
  env.stats = () => ({ holds, maxHeld });
  return env;
}
{
  const entries = [1, 2, 3, 4].map(n => ({ ...entry, id: 'e' + n, rid: n < 4 ? '202301' : '202402' }));
  const env = fakeEnv({ entries });
  const s = S.cycle(env);
  assert.equal(s.added, 4); assert.equal(s.rebuilt, 4); assert.equal(s.left, 0); assert.deepEqual(ids(s.errors), []);
  // 4 entries in chunks of 3 -> 2 holds; then a hold per rebuild: 2 residents + 2 AYs = 4 holds; never two at once
  assert.equal(env.stats().holds, 2 + 4); assert.equal(env.stats().maxHeld, 1);
  // the pending list is saved BEFORE an entry is deleted, and emptied only as each rebuild finishes
  const log = env.trail;
  assert.ok(log.indexOf('pending 1/1') < log.indexOf('delete e1'), 'owed rebuilds are written down before the entries go');
  assert.ok(log.indexOf('report 202301') > log.indexOf('delete e4'));
  assert.deepEqual(JSON.parse(JSON.stringify(env.store.pending)), { rids: [], ays: [] });
  // a rebuild is never inside the same hold as the rows: between 'lock' and 'unlock' there is one kind of work
  const holdsOf = []; let cur = null;
  for (const l of log) { if (l === 'lock') cur = []; else if (l === 'unlock') { holdsOf.push(cur); cur = null; } else if (cur) cur.push(l.split(' ')[0]); }
  assert.ok(holdsOf.every(h => h.every(x => ['append', 'database', 'sort'].includes(x)) || (h.length === 1 && ['report', 'totals'].includes(h[0]))), JSON.stringify(holdsOf));
}
// out of time: the rebuilds still owed are kept for the next run, which does them first
{
  const entries = [{ ...entry, id: 'z1' }];
  const env = fakeEnv({ entries, over: {} });
  // each rebuild costs 20-30 s of the fake clock; with a 270 s budget and 14 owed rebuilds some are left over
  const owed = { rids: Array.from({ length: 14 }, (_, i) => `2023${String(i).padStart(2, "0")}`), ays: ['AY2023'] };
  env.store.pending = JSON.parse(JSON.stringify(owed));
  const s = S.cycle(env);
  assert.ok(s.left > 0 && s.left < 16, 'some left: ' + s.left); assert.equal(env.store.pending.rids.length + env.store.pending.ays.length, s.left);
  // next run: nothing new in the outbox, picks the owed ones up
  const env2 = fakeEnv({ entries: [], pending: env.store.pending });
  const s2 = S.cycle(env2);
  assert.ok(s2.rebuilt > 0);
}
// a failing rebuild is reported and not retried forever
{
  const env = fakeEnv({ entries: [entry], ioOver: {} });
  env.io.residentReport = () => { throw new Error('bang'); };
  const s = S.cycle(env);
  assert.equal(s.errors.length, 1); assert.equal(s.left, 0);
}

// a Firestore REST document -> an entry
{
  const doc = { name: 'projects/apmes-logbook/databases/(default)/documents/sheetOutbox/k9', fields: {
    id: { stringValue: 'k9' }, email: { stringValue: 'fake.person@example.com' }, rid: { stringValue: '202301' }, date: { stringValue: '2026-10-14' },
    initials: { stringValue: 'AB' }, details: { stringValue: '34F' }, cats: { arrayValue: { values: [{ stringValue: '16' }, { stringValue: '28' }] } }, createdAt: { integerValue: '1760412015000' } } };
  assert.deepEqual(plain(S.entryOf(doc)), { id: 'k9', email: 'fake.person@example.com', rid: '202301', date: '2026-10-14', initials: 'AB', details: '34F', cats: ['16', '28'], createdAt: 1760412015000 });
  assert.deepEqual([...S.entryOf({ name: 'x/y/z', fields: { cats: { arrayValue: {} }, date: { nullValue: null } } }).cats], []);
}
console.log('PASS outbox script');

// ---------- the nightly Totals check (counts only; fake residents) ----------
{
  const L1 = '01) Cardiac surgery with CPB (10 | 15)', L16 = S.labels['16'], L20 = S.labels['20'], L20iii = S.labels['20iii'], L26iv = S.labels['26iv'];
  const caseRow = (rid, ...labels) => [`Fake ${rid} (${rid})`, labels.filter(l => !/^(20i|26i)/.test(l.slice(0, 3))).join(', '), '', '', labels.filter(l => /^26iv/.test(l)).join(', '), new Date('2026-10-01T00:00:00Z')];
  // Case counts: one per label per row; rows without a resident id (WRONG ENTRY) are not counted
  const cc = S.caseCounts([caseRow('202301', L1, L16), caseRow('202301', L1), ['WRONG ENTRY', L1, '', '', '', null], caseRow('202302', L26iv)]);
  assert.deepEqual(plain(cc), { 202301: { [L1]: 2, [L16]: 1 }, 202302: { [L26iv]: 1 } });
  assert.deepEqual(plain(S.dbCounts([['202301', L1], ['202301', L1], ['x', L1], ['202301', '']])), { 202301: { [L1]: 2 } });
  const tab = (cols, rows) => [['Category', ...cols], ...rows, ['Grand Total', 0]];
  const ok = { AY2023: tab(['Fake A (202301)'], [[L1, 2], [L16, 1], [L20, '']]) };
  // everything agrees; the Totals tab has no row for 26iv: that is not a difference (it is reported as ignored)
  const same = S.totalsDiff(cc, plain(cc), ok);
  assert.deepEqual([same.db.length, same.ay.length, [...same.ignored]], [0, 0, [L26iv]]);
  // a Database row added twice, a Case row missing from the Database, a stale Totals cell
  const dbBad = { 202301: { [L1]: 3, [L16]: 1 }, 202302: {} };
  const d1 = S.totalsDiff(cc, dbBad, { AY2023: tab(['Fake A (202301)'], [[L1, 2], [L16, 5]]) });
  assert.deepEqual(plain(d1.db).map(x => [x.rid, x.label, x.caseCount, x.dbCount]), [['202301', L1, 2, 3], ['202302', L26iv, 1, 0]]);
  assert.deepEqual(plain(d1.ay).map(x => [x.label, x.dbCount, x.tabCount]), [[L1, 3, 2], [L16, 1, 5]]);

  // the cycle: fake sheet whose state is advanced by the rebuilds
  const mk = ({ fixOn = true, ageMs = 3600e3, rows = 1200, fixable = true } = {}) => {
    const st = { stale: true, log: [], now: 1e12 };
    const base = []; for (let i = 0; i < rows; i++) base.push(caseRow('202301', L1));
    const env = {
      fixOn, now: () => st.now, log: t => st.log.push(t),
      locked: fn => { st.log.push('lock'); fn(); st.log.push('unlock'); },
      rebuildDatabase: () => { st.log.push('db'); st.dbDone = true; },
      rebuildAy: () => { st.log.push('ay'); if (fixable) st.ayDone = true; },
      read: () => ({
        caseRows: base,
        dbRows: Array.from({ length: rows + (st.dbDone ? 0 : 1) }, () => ['202301', L1]),
        ayTabs: { AY2023: tab(['Fake A (202301)'], [[L1, st.ayDone ? rows : rows + 5]]) },
        newestCaseMs: st.now - ageMs,
      }),
    };
    return { env, st };
  };
  let m = mk({ fixOn: false }); let r = S.totalsCycle(m.env);
  assert.deepEqual([r.status, r.before.database, r.before.totals, m.st.log.length], ['differs', 1, 1, 0], 'report only: nothing is run');
  m = mk(); r = S.totalsCycle(m.env);
  assert.equal(r.status, 'fixed'); assert.deepEqual([...r.ran], ['Rebuild Database', 'Rebuild AY Reports']);
  assert.deepEqual(m.st.log, ['lock', 'db', 'unlock', 'lock', 'ay', 'unlock'], 'each rebuild in a lock hold of its own, Database first');
  m = mk({ ageMs: 60e3 }); r = S.totalsCycle(m.env);
  assert.deepEqual([r.status, m.st.log.length], ['skipped', 0], 'a case arrived a minute ago: wait for the next night');
  m = mk({ rows: 300 }); r = S.totalsCycle(m.env);
  assert.deepEqual([r.status, m.st.log.length], ['skipped', 0], 'too few rows read: change nothing');
  m = mk({ fixable: false }); r = S.totalsCycle(m.env);
  assert.equal(r.status, 'still differs', 'checked again after the rebuild, once');
  assert.equal(m.st.log.filter(x => x === 'ay').length, 1, 'never rebuilds twice in one night');
  // nothing differs: nothing runs
  const clean = mk(); clean.st.dbDone = true; clean.st.ayDone = true; r = S.totalsCycle(clean.env);
  assert.deepEqual([r.status, clean.st.log.length], ['ok', 0]);
  // the menu commands end with an alert a trigger cannot show: that error is swallowed, others are not
  S.noUi(() => { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); });
  assert.throws(() => S.noUi(() => { throw new Error('boom'); }), /boom/);
}
console.log('outbox script totals check ok');
