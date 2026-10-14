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

// the whole pass, against fakes of the sheet and the existing script
function fakeIo(over = {}) {
  const log = [], rows = [];
  const io = {
    log, rows, markers: {},
    residentOk: rid => rid !== '999999',
    residentText: rid => `Fake Person (${rid})`,
    appendRow: row => { rows.push(row); log.push('append'); return rows.length + 1; },
    database: (n, first8) => { log.push(`database ${n} ${first8.length}`); },
    reports: (rids, ays) => { log.push(`reports ${rids} | ${ays}`); },
    sort: () => log.push('sort'),
    ...over,
  };
  return io;
}
{
  const io = fakeIo();
  const entries = [entry, { ...entry, id: 'k2', rid: '202302' }, { ...entry, id: 'k3', rid: '999999' }, { ...entry, id: 'k4', rid: 'abc' }, { ...entry, id: 'k5', rid: '202301' }];
  const r = S.process(entries, io);
  assert.deepEqual([...r.done], ['k1', 'k2', 'k5']);
  assert.deepEqual([...r.skipped.map(s => s.id)], ['k3', 'k4']);
  assert.deepEqual([...r.errors], []);
  // the sheet's order: each row into the Case tab and the Database (before the sort), then the reports, then one sort
  assert.deepEqual([...io.log], ['append', 'database 2 8', 'append', 'database 3 8', 'append', 'database 4 8', 'reports 202301,202302 | AY2023', 'sort']);
  // run again with the markers it left: nothing is added twice, the entries can still be deleted
  const again = S.process(entries.slice(0, 2), { ...io, log: [], rows: [], appendRow: () => { throw new Error('added twice'); } });
  assert.deepEqual([...again.done], ['k1', 'k2']);
}
// nothing to add: no reports, no sort
{
  const io = fakeIo();
  S.process([{ ...entry, rid: '999999' }], io);
  assert.deepEqual([...io.log], []);
}
// a failing Database / report step does not hold the entry back (its row is in the sheet), and is reported
{
  const io = fakeIo({ database: () => { throw new Error('boom'); }, reports: () => { throw new Error('bang'); } });
  const r = S.process([entry], io);
  assert.deepEqual([...r.done], ['k1']);
  assert.equal(r.errors.length, 2);
  assert.ok(io.log.includes('sort'));
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
