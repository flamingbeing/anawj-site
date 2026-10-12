// The backup as one spreadsheet (backup-csv.js): readable columns, a full round trip, Excel-safe cells. Fake data only.
import assert from 'node:assert/strict';
import { backupToCsv, csvToBackup, looksLikeBackupCsv, CSV_COLUMNS } from '../js/backup-csv.js';
import { parseCsv } from '../js/tags.js';

const data = {
  format: 'apmes-logbook-backup', version: 1, exportedAt: '2026-10-12T09:00:00.000Z', email: 'fake@example.com', name: 'Fake Resident',
  logbook: { name: 'Fake Resident', settings: { weekStart: 0 }, templates: [{ id: 't1', name: 'Fake group', cats: ['16'] }], profile: null },
  cases: [
    { id: 'c1', date: '2026-10-11', initials: 'ZZ', details: '30F fake LSCS, "spinal"\nsecond line', cats: ['16', '28'], createdAt: 1, updatedAt: 1791700000000, source: 'app' },
    { id: 'c2', date: null, dateText: 'last week', initials: '', details: '=1+1 not a formula', cats: [], createdAt: 2, updatedAt: 2, source: 'app' },
  ],
  reflections: [{ id: 'r1', headingId: 'thyroid', initials: 'ZZ', date: '2026-10-11', title: 'Fake title', summary: 'Fake summary', points: [{ heading: 'Point', text: 'Fake learning' }], figures: [{ id: 'img1', caption: 'x' }], references: [], caseId: 'c1', status: 'draft', createdAt: 3, updatedAt: 3 }],
  notes: [{ id: 'n1', date: null, title: 'Fake note', body: '- [ ] fake to-do, with a comma', createdAt: 4, updatedAt: 4 }],
};
const csv = backupToCsv(data, { catName: c => ({ 16: 'LSCS', 28: 'Spinal' })[c] || c, headingName: id => (id === 'thyroid' ? 'Thyroid' : id) });
assert.ok(csv.startsWith('﻿Kind,'));   // a BOM so Excel reads UTF-8
assert.ok(looksLikeBackupCsv(csv));
assert.ok(!looksLikeBackupCsv('{"format":"x"}'));
const rows = parseCsv(csv);
assert.deepEqual(rows[0], CSV_COLUMNS);
assert.deepEqual(rows.map(r => r[0]), ['Kind', 'logbook', 'case', 'case', 'reflection', 'note']);
assert.equal(rows[2][6], 'LSCS; Spinal');
assert.equal(rows[2][10], '2026-10-11 06:26');   // UTC
assert.equal(rows[3][5], "'=1+1 not a formula");   // shown as text in Excel
assert.equal(rows[4][7], 'Thyroid');
assert.equal(JSON.parse(rows[4][11]).figures.length, 0);   // photos left out

// round trip: everything but the photos comes back as it was
const back = csvToBackup(csv);
assert.equal(back.format, 'apmes-logbook-backup');
assert.equal(back.email, 'fake@example.com');
assert.deepEqual(back.logbook, data.logbook);
assert.deepEqual(back.cases, data.cases);
assert.deepEqual(back.notes, data.notes);
assert.deepEqual(back.reflections, [{ ...data.reflections[0], figures: [] }]);
assert.equal(back.skipped, 0);

// semicolon CSV (Excel in some regions) and a damaged row
const semi = 'Kind;ID;Data\r\ncase;c9;"{""id"":""c9"",""details"":""x""}"\r\nnote;n9;not json\r\n';
const s2 = csvToBackup(semi);
assert.deepEqual(s2.cases, [{ id: 'c9', details: 'x' }]);
assert.equal(s2.notes.length, 0); assert.equal(s2.skipped, 1);
assert.equal(csvToBackup('Name,Date\r\nx,y'), null);   // not a backup spreadsheet

console.log('backup csv tests passed');
