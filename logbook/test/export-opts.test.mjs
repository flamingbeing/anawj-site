// Excel export choices (js/export-opts.js): cleaning, date ranges, tables; and the workbook written from them.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cleanExportOpts, DEFAULT_EXPORT, dateRange, exportTables, rangeText, tagText } from '../js/export-opts.js';

// cleaning
assert.deepEqual(cleanExportOpts(null), DEFAULT_EXPORT);
const c1 = cleanExportOpts({ what: 'nope', caseCols: ['apmes', 'bogus', 'date', 'date'], reflCols: [], from: '2026-13', range: 'custom', summary: false });
assert.equal(c1.what, 'both');
assert.deepEqual(c1.caseCols, ['apmes', 'date']);            // unknown and repeated dropped, order kept
assert.deepEqual(c1.reflCols, DEFAULT_EXPORT.reflCols);      // none left: back to the default
assert.equal(c1.from, '');
assert.equal(c1.summary, false);

// date ranges
const now = new Date(2026, 9, 11);   // 11 Oct 2026
assert.deepEqual(dateRange({ range: 'all' }, now), { from: '', to: '' });
assert.deepEqual(dateRange({ range: 'year' }, now), { from: '2026-07-01', to: '2027-06-30' });
assert.deepEqual(dateRange({ range: 'year' }, new Date(2027, 2, 1)), { from: '2026-07-01', to: '2027-06-30' });
assert.deepEqual(dateRange({ range: '12m' }, now), { from: '2025-10-12', to: '' });
assert.deepEqual(dateRange({ range: 'custom', from: '2026-01-01', to: '' }, now), { from: '2026-01-01', to: '' });
assert.equal(rangeText({ from: '', to: '' }), 'all dates');

assert.equal(tagText('16', 'short'), 'LSCS');
assert.equal(tagText('16', 'full'), 'Lower Segment Caesarean Section');
assert.equal(cleanExportOpts({ tagStyle: 'code' }).tagStyle, 'full');   // the old numbered choices read as full names

// tables
const cases = [
  { id: 'a', date: '2026-10-10', initials: 'AB', details: '34F LSCS', cats: ['16', '28'], tags: ['u:x'], reflectTag: true, createdAt: 2 },
  { id: 'b', date: '2025-01-05', details: 'XY 50M lap chole', cats: ['13'], createdAt: 1 },
  { id: 'c', dateText: 'sometime', details: 'undated', cats: [] },
  { id: 'd', date: '2026-12-01', initials: 'CD', details: 'planned list', cats: ['13'] },   // a future case
];
const refl = [
  { id: 'r1', caseId: 'a', date: '2026-10-10', initials: 'AB', headingId: 'lap', title: 'T', summary: 'one two three', points: [{ heading: 'H', text: 'body' }, { heading: '', text: '' }], references: ['Ref 1', ' '], status: 'complete' },
  { id: 'r2', date: '2025-03-01', headingId: 'zzz', status: 'draft' },
];
const ctx = { tagName: k => (k === 'u:x' ? 'My tag' : k), inPortfolio: r => r.status === 'complete' };

let t = exportTables(cases, refl, { caseCols: ['date', 'initials', 'case', 'apmes', 'personal', 'flag', 'reflected'], tagStyle: 'short' }, ctx, now);
assert.deepEqual(t.cases.rows.map(r => r.id), ['b', 'a', 'd', 'c']);   // oldest first, undated last
const a = t.cases.rows[1].cells;
assert.equal(a[3], 'LSCS, Spinal');
assert.deepEqual([a[0], a[1], a[2], a[4], a[5], a[6]], [{ date: '2026-10-10' }, 'AB', '34F LSCS', 'My tag', 'Yes', 'Yes']);
assert.deepEqual(t.cases.rows[0].cells.slice(1, 3), ['XY', '50M lap chole']);   // initials split off older cases
assert.equal(t.cases.rows[3].cells[0], 'sometime');
assert.equal(t.reflections.rows.length, 2);
const r1 = t.reflections.rows.find(r => r.cells[0].date === '2026-10-10').cells;
assert.equal(r1[2], 'Laparoscopic Surgery');
assert.equal(r1[7], '1. H: body');
assert.equal(r1[8], 'Ref 1');
assert.equal(r1[9], 'Complete');
assert.equal(r1[11], 'Yes');
assert.equal(t.reflections.rows.find(r => r.cells[0].date === '2025-03-01').cells[2], 'Uncategorised');

// only one kind, ranges, which reflections, newest first
t = exportTables(cases, refl, { what: 'logbook', range: 'year' }, ctx, now);
assert.equal(t.reflections, null);
assert.deepEqual(t.cases.rows.map(r => r.id), ['a', 'd']);   // undated left out when there is a range
t = exportTables(cases, refl, { what: 'reflections', reflWhich: 'portfolio' }, ctx, now);
assert.equal(t.cases, null);
assert.equal(t.reflections.rows.length, 1);
t = exportTables(cases, refl, { what: 'logbook', sort: 'newest', range: 'custom', from: '2025-01-01', to: '2026-10-31' }, ctx, now);
assert.deepEqual(t.cases.rows.map(r => r.id), ['a', 'b']);

// the workbook: sheets, headers in order, hidden id, Export info, and the upload reads it back
const require = createRequire(import.meta.url);
globalThis.ExcelJS = require('../../nuh-roster/vendor/exceljs.min.js');
const { exportWorkbook, readCasesSheet, readSheetGrid } = await import('../js/xlsxio.js');
t = exportTables(cases, refl, { caseCols: ['initials', 'date', 'case', 'apmes'], range: 'custom', from: '2025-01-01', to: '2026-10-31', dateStyle: 'iso' }, ctx, now);
const blob = await exportWorkbook(t, { name: 'Test', rYear: 3, rangeLabel: rangeText(t.range) });
const buf = new Uint8Array(await blob.arrayBuffer());
const wb = new globalThis.ExcelJS.Workbook(); await wb.xlsx.load(buf);
assert.deepEqual(wb.worksheets.filter(w => w.state === 'visible').map(w => w.name), ['Cases', 'Reflections', 'Summary']);
const ws = wb.getWorksheet('Cases');
assert.deepEqual(ws.getRow(1).values.slice(1), ['Initials', 'Date', 'Case details', 'Tags', 'id']);
assert.equal(ws.getColumn(5).hidden, true);
assert.equal(ws.getRow(2).getCell(2).value, '2025-01-05');   // text dates
assert.match(String(wb.getWorksheet('Summary').getCell('A2').value), /counts are for 5 Jan 2025|counts are for 1 Jan 2025/);
const grid = await readSheetGrid(buf);
assert.deepEqual(grid.range, { from: '2025-01-01', to: '2026-10-31' });
assert.ok(grid.exportedAt > 0);
assert.ok(!grid.sheets.some(s => s.name === 'Export info'));
const back = await readCasesSheet(buf);
assert.deepEqual(back.range, { from: '2025-01-01', to: '2026-10-31' });
// reflections only: no Cases, no Summary
t = exportTables(cases, refl, { what: 'reflections' }, ctx, now);
const wb2 = new globalThis.ExcelJS.Workbook(); await wb2.xlsx.load(new Uint8Array(await (await exportWorkbook(t, {})).arrayBuffer()));
assert.deepEqual(wb2.worksheets.map(w => w.name), ['Reflections']);
assert.equal(wb2.getWorksheet('Reflections').getRow(2).getCell(1).value instanceof Date, true);   // Excel dates by default

console.log('export options tests passed');
