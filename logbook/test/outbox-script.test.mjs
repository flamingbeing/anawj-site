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
  const store = { pending: JSON.parse(JSON.stringify(pending)), cursor: '' };
  const env = { trail: log, log: () => {}, store, io,
    list: () => entries, remove: id => log.push(`delete ${id}`),
    getCursor: () => store.cursor, setCursor: id => { store.cursor = id; },
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

// ---------- paging: entries that are skipped never hold the others back ----------
// A fake of Firestore's runQuery that reads the request body Outbox.gs sends, as the REST API does: documents in id
// (__name__) order, at most `limit`, starting after the startAt id; the answer as runQuery gives it.
const DOCS = 'projects/apmes-logbook/databases/(default)/documents';
const toFields = e => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v == null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(x => ({ stringValue: x })) } }
  : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) }]));
function restOutbox(list) {
  const docs = new Map(list.map(e => [e.id, e])), calls = [];
  const runQuery = body => {
    const q = body.structuredQuery;
    assert.deepEqual(plain(q.from), [{ collectionId: 'sheetOutbox' }]);
    assert.deepEqual(plain(q.orderBy), [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]);
    assert.ok(Number.isInteger(q.limit) && q.limit > 0 && q.limit <= 300, 'a page size the API takes');
    let after = '';
    if (q.startAt) {
      assert.equal(q.startAt.before, false, 'starts just after the given id');
      const ref = q.startAt.values[0].referenceValue;
      assert.ok(ref.startsWith(DOCS + '/sheetOutbox/'), ref);
      after = ref.slice((DOCS + '/sheetOutbox/').length);
    }
    const ids = [...docs.keys()].sort().filter(id => !after || id > after).slice(0, q.limit);
    calls.push({ after, n: ids.length });
    return ids.length ? ids.map(id => ({ document: { name: `${DOCS}/sheetOutbox/${id}`, fields: toFields(docs.get(id)) }, readTime: 't' })) : [{ readTime: 't' }];
  };
  return { docs, calls, runQuery, list: after => [...S.entriesOf(runQuery(S.pageQuery(after, S.batch)))] };
}
// one 5-minute run against the fake outbox; props: the Script properties (cursor, pending) kept between runs
function pagedRun(outbox, props, { appendMs = 0 } = {}) {
  let clock = 0;
  const env = fakeEnv({ over: {
    list: outbox.list, remove: id => outbox.docs.delete(id),
    getCursor: () => props.cursor || '', setCursor: id => { props.cursor = id; },
    getPending: () => props.pending || { rids: [], ays: [] }, setPending: p => { props.pending = JSON.parse(JSON.stringify(p)); },
    now: () => clock, pause: ms => { clock += ms; },
  } });
  const append = env.io.appendRow;
  env.io.appendRow = row => { clock += appendMs; return append(row); };
  const before = outbox.calls.length;
  const s = S.cycle(env);
  const calls = outbox.calls.slice(before);
  assert.ok(calls.length <= 2 && calls.every(c => c.n <= S.batch), 'a run reads one page (two when it goes back to the start): ' + JSON.stringify(calls));
  return s;
}
{
  assert.equal(S.batch, 12);
  // 14 entries for a resident who isn't on the Residents tab and one whose id isn't 6 digits, all sorting first (as the
  // REST API lists by id); then cases from residents who are on it
  const skip = Array.from({ length: 14 }, (_, n) => ({ ...entry, id: 'a' + String(n).padStart(2, '0'), rid: '999999' })).concat([{ ...entry, id: 'a14', rid: 'R2' }]);
  const good = ['b0', 'b1', 'b2', 'b3', 'b4'].map(id => ({ ...entry, id, rid: '202301' })).concat(['z0', 'z1', 'z2'].map(id => ({ ...entry, id, rid: '202402' })));
  const outbox = restOutbox([...good, ...skip]);
  const props = {};
  // (the old way, the first page every time, never got past the skipped ones)
  assert.deepEqual(outbox.list('').map(e => e.id), skip.slice(0, 12).map(e => e.id));
  let s = pagedRun(outbox, props);
  assert.equal(s.added, 0); assert.equal(s.skipped.length, 12); assert.equal(props.cursor, 'a11', 'the next run starts after the page it saw');
  s = pagedRun(outbox, props);
  assert.equal(s.added, good.length, 'the cases after the skipped ones are delivered');
  assert.equal(props.cursor, '', 'the end of the outbox: back to the start');
  assert.deepEqual([...outbox.docs.keys()].sort(), skip.map(e => e.id), 'only the skipped entries wait');
  // a new case whose id sorts among the skipped ones, and one after them: through within one round of the outbox
  outbox.docs.set('a05x', { ...entry, id: 'a05x', rid: '202301' });
  outbox.docs.set('c1', { ...entry, id: 'c1', rid: '202301' });
  for (let run = 0; run < 3 && outbox.docs.size > skip.length; run++) pagedRun(outbox, props);
  assert.equal(outbox.docs.size, skip.length, 'both new cases delivered');
  assert.ok(!outbox.docs.has('a05x') && !outbox.docs.has('c1'));
  // a run past the last entry finds nothing after its cursor: it goes back to the start in the same run
  props.cursor = 'zz';
  outbox.docs.set('b9', { ...entry, id: 'b9', rid: '202301' });
  const n0 = outbox.calls.length;
  pagedRun(outbox, props); pagedRun(outbox, props);
  assert.ok(!outbox.docs.has('b9'), 'delivered after going back to the start');
  assert.deepEqual(outbox.calls.slice(n0, n0 + 2).map(c => c.after), ['zz', ''], 'nothing after the cursor: the first page, in the same run');
  // nothing waiting at all: one read, the sheet isn't opened, and the cursor goes back to the start
  const empty = restOutbox([]), p2 = { cursor: 'k1' };
  let opened = 0;
  const env = fakeEnv({ over: { list: empty.list, getCursor: () => p2.cursor, setCursor: id => { p2.cursor = id; }, open: () => { opened++; } } });
  const quiet = S.cycle(env);
  assert.deepEqual([quiet.idle, opened, p2.cursor], [true, 0, '']);
}
// out of time half way through a page: the next run carries on after the last entry this one looked at
{
  const ids = ['g0', 'g1', 'g2', 'g3', 'g4', 'g5'];
  const outbox = restOutbox(ids.map(id => ({ ...entry, id, rid: '202301' })));
  const props = {};
  const s = pagedRun(outbox, props, { appendMs: 100000 });   // 100 s per row: the 4.5-minute budget ends after the first piece
  assert.equal(s.added, S.chunk); assert.equal(props.cursor, ids[S.chunk - 1]);
  pagedRun(outbox, props);
  assert.equal(outbox.docs.size, 0, 'the rest delivered by the next run'); assert.equal(props.cursor, '');
}
// the runQuery answer with no match is just a read time
assert.deepEqual([...S.entriesOf([{ readTime: 't' }])], []);
assert.equal(S.pageQuery('', 12).structuredQuery.startAt, undefined, 'from the start: no startAt');

// ---------- the nightly report of skipped entries ----------
{
  const H = 3600e3, now = Date.parse('2026-10-20T03:00:00Z');
  const ok = rid => rid === '202301';
  const at = hours => now - hours * H;
  const list = [
    { ...entry, id: 's1', rid: '999999', createdAt: at(30) }, { ...entry, id: 's2', rid: '999999', createdAt: at(2) },
    { ...entry, id: 's3', rid: 'R2', createdAt: at(5) }, { ...entry, id: 'g1', rid: '202301', createdAt: at(1) },
  ];
  const w = S.waiting(list, ok, now);
  assert.deepEqual([w.waiting, w.skippedN, w.overdue, w.oldOther, Math.round(w.oldestSkippedMs / H)], [4, 3, 1, 0, 30]);
  assert.deepEqual(plain(w.skipped).map(b => [b.rid, b.n, Math.round(b.oldestMs / H)]), [['999999', 2, 30], ['R2', 1, 5]]);
  assert.match(w.skipped[0].reason, /no resident 999999 on the Residents sheet/); assert.match(w.skipped[1].reason, /not 6 digits/);
  assert.equal(S.waitingText(w), 'Outbox: 4 waiting, 3 skipped (999999: 2, R2: 1; oldest 1.3 days).');
  // skipped for over a day: the nightly run fails (Google emails the owner) and says what to do
  const p = [...S.nightProblems({ status: 'ok' }, w, '')];
  assert.equal(p.length, 1); assert.match(p[0], /^1 app case waited over a day .*\(resident id 999999\)\. If the id is right: add the resident .*Residents tab/);
  // a wrong id can't be fixed in People for the entries already waiting: the alert says what to do instead
  assert.match(p[0], /If it is wrong .*keep the id they were queued with .*run logbookOutboxDropRid for that id/);
  assert.ok(!p[0].includes('R2'), 'only the residents whose entries are over a day old');
  // skipped only since this afternoon: reported, not a failure yet
  const young = S.waiting(list.filter(e => e.id !== 's1'), ok, now);
  assert.deepEqual([young.skippedN, young.overdue, S.nightProblems({ status: 'ok' }, young, '').length], [2, 0, 0]);
  // nothing skipped; a case from a known resident waiting over a day is reported (not a failure)
  const clean = S.waiting([{ ...entry, rid: '202301', createdAt: at(26) }], ok, now);
  assert.equal(clean.oldOther, 1);
  assert.equal(S.waitingText(clean), 'Outbox: 1 waiting, none skipped, 1 logged over a day ago for a resident on the Residents tab (check logbookOutboxRun in Executions).');
  assert.equal(S.waitingText(S.waiting([...list, { ...entry, id: 'g2', rid: '202301', createdAt: at(26) }, { ...entry, id: 'g3', rid: '202301', createdAt: at(40) }], ok, now)),
    'Outbox: 6 waiting, 3 skipped (999999: 2, R2: 1; oldest 1.3 days), 2 logged over a day ago for residents on the Residents tab (check logbookOutboxRun in Executions).');
  assert.equal(S.waitingText(S.waiting([{ ...entry, rid: '202301', createdAt: at(2) }], ok, now)), 'Outbox: 1 waiting, none skipped.');
  assert.equal(S.waitingText({ ...S.waiting([], ok, now), capped: true }), 'Outbox: 0+ waiting, none skipped.');
  // the other failures
  assert.equal(S.nightProblems({ status: 'still differs' }, null, '').length, 1);
  assert.match(S.nightProblems({ status: 'ok' }, null, 'Outbox not checked: 403')[0], /Outbox not checked/);
  assert.equal(S.nightProblems({ status: 'fixed' }, clean, '').length, 0);
}
// ---------- the real entry points, against fakes of Apps Script (the sheet, the lock, Script properties, Firestore REST) ----------
// A tab: rows[0] is row 1. getRange(row, column, rows, columns) as Apps Script's; a TextFinder as Google's (case and part
// of a cell match unless told otherwise).
class FakeSheet {
  constructor(name, rows) { this.name = name; this.rows = rows; }
  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(0, ...this.rows.map(r => r.length)); }
  getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); }
  getRange(r, c, nr = 1, nc = 1) {
    const rows = this.rows, cell = (i, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '';
    const range = {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(i, j))),
      getValue: () => cell(0, 0),
      setValue: v => range.setValues([[v]]),
      setValues: v => v.forEach((row, i) => { const t = rows[r - 1 + i] || (rows[r - 1 + i] = []); row.forEach((x, j) => { t[c - 1 + j] = x; }); }),
      setNumberFormat: () => range,
      createTextFinder: text => {
        let whole = false, exact = false;
        const f = {
          matchEntireCell: b => { whole = b; return f; }, matchCase: b => { exact = b; return f; },
          findNext: () => {
            const q = exact ? text : text.toLowerCase();
            for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { const v = exact ? String(cell(i, j)) : String(cell(i, j)).toLowerCase(); if (whole ? v === q : v.includes(q)) return { row: r + i }; }
            return null;
          },
        };
        return f;
      },
    };
    return range;
  }
}
const CASE_HEAD = ['Resident', 'Date', 'Initials,  Case Details', 'Category', '15', '20', '26', 'Timestamp', 'Email address', 'App marker'];
// The globals Outbox.gs uses, on the script's own sandbox; `outbox` a restOutbox. -> { ss, props, lock, trail, outbox }
function appsScript({ outbox = restOutbox([]), residents = [['Fake Person', '202301']], caseRows = [], dbRows = [], onQuery = null } = {}) {
  const props = new Map([['LOGBOOK_BOT_EMAIL', 'fake.bot@example.com'], ['LOGBOOK_BOT_PASSWORD', 'not-a-real-password']]);
  const lock = { held: false, tries: [] }, trail = [];
  const sheets = [new FakeSheet('Case', [CASE_HEAD, ...caseRows]), new FakeSheet('Residents', [['Name', 'Id'], ...residents]), new FakeSheet('Database', [['x'], ...dbRows])];
  const ss = { getSheetByName: n => sheets.find(x => x.name === n) || null, getSheets: () => sheets };
  const reply = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  Object.assign(sandbox, {
    console: { log: () => {}, warn: () => {} },
    LockService: {
      getScriptLock: () => ({ tryLock: ms => { lock.tries.push(ms); if (lock.held) return false; lock.held = true; return true; }, releaseLock: () => { lock.held = false; } }),
      getDocumentLock: () => ({ waitLock: () => {}, releaseLock: () => {} }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => { props.set(k, String(v)); }, deleteProperty: k => { props.delete(k); } }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    UrlFetchApp: { fetch: (url, o) => {
      if (url.includes('accounts:signInWithPassword')) return reply(200, { idToken: 'fake-token' });
      if (url.endsWith(':runQuery')) { trail.push('query'); if (onQuery) { const f = onQuery; onQuery = null; f(); } return reply(200, outbox.runQuery(JSON.parse(o.payload))); }
      if (o.method === 'delete') { const id = decodeURIComponent(url.split('/').pop()); trail.push('delete ' + id); return reply(outbox.docs.delete(id) ? 200 : 404, {}); }
      throw new Error('unexpected fetch ' + url);
    } },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush: () => trail.push('flush') },
    Utilities: { sleep: () => {}, formatDate: () => '20/10/2026 03:00' },
    // the sheet's own script
    updateDatabase: (sheet, n) => trail.push('database ' + n), sortByTimestampDescending_: () => trail.push('sort'),
    updateResidentReport: rid => trail.push('report ' + rid), updateAYSummaryReport: ay => trail.push('totals ' + ay),
    rebuildDatabase: () => trail.push('rebuild Database'), rebuildAYSummaryReports: () => trail.push('rebuild AY'),
  });
  return { ss, props, lock, trail, outbox, caseTab: sheets[0] };
}
const appRows = sheet => sheet.rows.slice(1).map(r => r[9]).filter(x => /^app:/.test(String(x)));

// column J is looked at again under the lock: exactly the case's marker (case and all, the whole cell)
{
  const w = appsScript({ caseRows: [['Fake Person (202301)', '', '', '', '', '', '', '', '', 'app:abc']] });
  const io = S.io(w.ss);
  assert.deepEqual([io.marked('app:abc'), io.marked('app:ABC'), io.marked('app:ab'), io.marked('app:abcd')], [true, false, false, false]);
  assert.equal(S.io(appsScript().ss).marked('app:abc'), false, 'an empty Case tab');
}
// two runs that both read column J before either added a row (the overlap the script lock now prevents): the second one
// finds the first one's rows when it looks again, under the lock, and adds nothing twice
{
  const w = appsScript();
  const list = ['m1', 'm2', 'm3', 'm4'].map(id => ({ ...entry, id, rid: '202301' }));
  const ioA = S.io(w.ss), ioB = S.io(w.ss);
  const runWith = io => S.cycle(fakeEnv({ over: { list: () => list, io } }));
  runWith(ioA);
  assert.deepEqual(appRows(w.caseTab), ['app:m1', 'app:m2', 'app:m3', 'app:m4']);
  const b2 = runWith(ioB);
  assert.deepEqual(appRows(w.caseTab), ['app:m1', 'app:m2', 'app:m3', 'app:m4'], 'nothing added twice');
  assert.equal(b2.added, 4, 'the second run still deletes the entries (and rebuilds the reports)');
}
// one run at a time: a run started while another is going (another account's trigger, or Run in the editor) does nothing;
// the lock goes when the run ends, also when it fails; each hold of the document lock flushes the rows it wrote
{
  const outbox = restOutbox([...['n1', 'n2', 'n3'].map(id => ({ ...entry, id, rid: '202301' })), { ...entry, id: 'n9', rid: '999999' }]);
  let nested = null;
  const w = appsScript({ outbox, onQuery: () => { const q = w.trail.filter(x => x === 'query').length; sandbox.logbookOutboxRun(); nested = w.trail.filter(x => x === 'query').length - q; } });
  sandbox.logbookOutboxRun();
  assert.equal(nested, 0, 'the second run read nothing');
  assert.deepEqual(w.lock.tries, [0, 0], 'never waits for the lock');
  assert.equal(w.lock.held, false, 'let go at the end');
  assert.deepEqual(appRows(w.caseTab), ['app:n1', 'app:n2', 'app:n3'], 'each case added once');
  assert.deepEqual([...outbox.docs.keys()], ['n9'], 'the skipped one waits');
  assert.ok(w.trail.indexOf('flush') > w.trail.indexOf('sort') && w.trail.indexOf('flush') < w.trail.indexOf('delete n1'), 'rows flushed before the lock goes: ' + w.trail.join());
  // a run that fails lets go of the lock too
  outbox.docs.set('n4', { ...entry, id: 'n4', rid: '202301' });
  sandbox.updateDatabase = () => { throw new Error('fake Database failure'); };
  assert.throws(() => sandbox.logbookOutboxRun(), /fake Database failure/);
  assert.equal(w.lock.held, false, 'let go after a failure');
  // and a run while the lock is held by someone else does nothing at all
  w.lock.held = true; const n = w.trail.length;
  sandbox.logbookOutboxRun();
  assert.equal(w.trail.length, n, 'no read, no write');
}
// the nightly check holds the same lock; with a run still going it only reports that night
{
  const L1 = S.labels['01'];
  const caseRows = Array.from({ length: 1000 }, () => ['Fake Person (202301)', '', '', L1, '', '', '', new Date('2026-10-01T00:00:00Z')]);
  const dbRows = Array.from({ length: 1001 }, () => ['', '202301', '', '', '', '', '', '', L1]);   // one Database row too many
  let w = appsScript({ caseRows, dbRows });
  w.props.set('LOGBOOK_TOTALS_FIX', 'on');
  w.lock.held = true;   // a 5-minute run that doesn't end within the wait
  sandbox.logbookOutboxTotalsCheck();
  assert.deepEqual(w.lock.tries, [30000]);
  assert.ok(!w.trail.some(x => /^rebuild/.test(x)), 'no rebuild');
  assert.match(w.props.get('LOGBOOK_TOTALS_LAST'), /differs \(an outbox run was still going, so no rebuild tonight\)/);
  assert.match(w.props.get('LOGBOOK_TOTALS_LAST'), /Outbox: 0 waiting, none skipped\./);
  assert.equal(w.lock.held, true, "someone else's lock is left alone");
  // with the lock: rebuilds (here the fake ones change nothing, so it still differs and fails), and a 5-minute run
  // started meanwhile does nothing; the lock goes at the end
  w = appsScript({ caseRows, dbRows });
  w.props.set('LOGBOOK_TOTALS_FIX', 'on');
  let during = null;
  sandbox.rebuildDatabase = () => { w.trail.push('rebuild Database'); const n = w.trail.length; sandbox.logbookOutboxRun(); during = w.trail.length - n; };
  assert.throws(() => sandbox.logbookOutboxTotalsCheck(), /Totals still differ after the rebuild/);
  assert.ok(w.trail.includes('rebuild Database') && w.trail.includes('rebuild AY'));
  assert.equal(during, 0, 'a 5-minute run during the rebuilds did nothing');
  assert.equal(w.lock.held, false);
}
// entries under an id the sheet will never have: listed, and deleted only when asked to; an id on the Residents tab is refused
{
  const list = [{ ...entry, id: 'd1', rid: 'R2' }, { ...entry, id: 'd2', rid: 'R2', date: null, dateText: 'last Tue' }, { ...entry, id: 'd3', rid: '999999' }, { ...entry, id: 'd4', rid: '202301' }];
  const run = (rid, confirm) => { const log = [], removed = []; const r = S.dropRid({ entries: list, residentOk: x => x === '202301', remove: id => removed.push(id), log: t => log.push(t) }, rid, confirm); return { r: plain(r), log, removed }; };
  let x = run('R2');
  assert.deepEqual([x.r, x.removed], [{ found: 2, deleted: 0, refused: false }, []], 'a dry run unless confirmed');
  assert.equal(x.log[0], `d1: 2026-10-14 | AB 34F elective LSCS spinal | ${S.labels['16']}, ${S.labels['28']}`, 'what each case says, to add by hand');
  assert.match(x.log[1], /^d2: last Tue \|/);
  assert.match(x.log[2], /^2 entries wait under R2\. Nothing deleted\. .*LOGBOOK_OUTBOX_DROP_CONFIRM to R2/);
  x = run('R2', true);
  assert.deepEqual([x.r, x.removed], [{ found: 2, deleted: 2, refused: false }, ['d1', 'd2']]);
  x = run('202301', true);
  assert.deepEqual([x.r, x.removed], [{ found: 1, deleted: 0, refused: true }, []], 'on the Residents tab: on its way to the sheet');
  assert.match(x.log[0], /202301 is on the Residents tab/);
  assert.throws(() => run(''), /Which resident id/);
  // from the editor (no arguments): the id from a Script property; deletes only when the confirming property names the same id
  const outbox = restOutbox(list);
  const w = appsScript({ outbox });
  assert.throws(() => sandbox.logbookOutboxDropRid(), /Which resident id/, 'no id set');
  assert.equal(outbox.docs.size, 4);
  w.props.set('LOGBOOK_OUTBOX_DROP_RID', 'R2');
  sandbox.logbookOutboxDropRid();
  assert.equal(outbox.docs.size, 4, 'listed only');
  w.props.set('LOGBOOK_OUTBOX_DROP_CONFIRM', '999999');
  sandbox.logbookOutboxDropRid();
  assert.equal(outbox.docs.size, 4, 'the confirmation names another id: listed only');
  w.props.set('LOGBOOK_OUTBOX_DROP_CONFIRM', 'R2');
  sandbox.logbookOutboxDropRid();
  assert.deepEqual([...outbox.docs.keys()].sort(), ['d3', 'd4']);
  assert.ok(!w.props.has('LOGBOOK_OUTBOX_DROP_RID') && !w.props.has('LOGBOOK_OUTBOX_DROP_CONFIRM'), 'both properties removed');
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
