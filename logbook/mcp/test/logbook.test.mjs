// Run with: node logbook/mcp/test/logbook.test.mjs  (made-up cases only)
import assert from 'node:assert/strict';
import {
  catName, resolveCategory, normCase, filterCases, searchCases, formatCaseList, resolveYear, progressRows,
  formatProgress, missingTargets, formatMissing, resolveHeading, filterReflections, formatReflectionList,
  formatReflection, clampLimit,
} from '../lib/logbook.mjs';

// ---- names ----
assert.equal(catName('16'), 'Lower Segment Caesarean Section');
assert.equal(catName('zz'), 'zz');
assert.deepEqual(resolveCategory('16'), ['16']);
assert.deepEqual(resolveCategory('lscs'), ['16']);
assert.deepEqual(resolveCategory('caesarean'), ['16']);
assert.deepEqual(resolveCategory('Spinal'), ['28']);
assert.deepEqual(resolveCategory('nothing like this'), []);

// ---- made-up cases ----
const cases = [
  { id: 'c1', date: '2026-01-05', initials: 'AB', details: '34F LSCS spinal\nPET', cats: ['16', '28'], createdAt: 1 },
  { id: 'c2', date: '2026-02-10', details: 'CD 5M circumcision caudal', cats: ['20iii', '20', '27'], createdAt: 2 },   // old: initials in details
  { id: 'c3', date: '2026-03-15', initials: 'EF', details: '70M TKR spinal + adductor canal', cats: ['18', '21', '28', '26ii'], createdAt: 3, reflectTag: true },
  { id: 'c4', date: null, dateText: 'sometime', initials: 'GH', details: 'lap chole', cats: ['08', '13'], createdAt: 4 },
];

assert.deepEqual(normCase(cases[1]).initials, 'CD');
assert.equal(normCase(cases[1]).details, '5M circumcision caudal');
assert.equal(normCase(cases[2]).interesting, true);

let r = filterCases(cases);
assert.deepEqual(r.cases.map(c => c.id), ['c3', 'c2', 'c1', 'c4'], 'newest first, undated last');
r = filterCases(cases, { from: '2026-02-01', to: '2026-03-31' });
assert.deepEqual(r.cases.map(c => c.id), ['c3', 'c2']);
r = filterCases(cases, { category: 'spinal' });
assert.deepEqual(r.cases.map(c => c.id), ['c3', 'c1']);
r = filterCases(cases, { category: '26' });   // parent finds sub-tag cases
assert.deepEqual(r.cases.map(c => c.id), ['c3']);
r = filterCases(cases, { limit: 2 });
assert.equal(r.cases.length, 2); assert.equal(r.total, 4);
assert.throws(() => filterCases(cases, { from: '5/1/2026' }), /YYYY-MM-DD/);
assert.throws(() => filterCases(cases, { category: 'xyzzy' }), /No APMES tag/);
assert.equal(clampLimit(undefined), 50); assert.equal(clampLimit(10000), 500); assert.equal(clampLimit(0), 50);

r = searchCases(cases, 'spinal');
assert.deepEqual(r.cases.map(c => c.id), ['c3', 'c1']);
r = searchCases(cases, 'SPINAL tkr');
assert.deepEqual(r.cases.map(c => c.id), ['c3']);
r = searchCases(cases, 'geriatric');   // tag names are searched too
assert.deepEqual(r.cases.map(c => c.id), ['c3']);
r = searchCases(cases, '"adductor canal"');
assert.deepEqual(r.cases.map(c => c.id), ['c3']);
r = searchCases(cases, 'cd');   // initials of an old case
assert.deepEqual(r.cases.map(c => c.id), ['c2']);
assert.throws(() => searchCases(cases, '  '), /text/);

const text = formatCaseList(filterCases(cases, { limit: 1 }));
assert.match(text, /^4 cases \(showing the newest 1/);
assert.match(text, /2026-03-15 · EF: 70M TKR spinal \+ adductor canal \[Orthopaedic Surgery; Geriatric patient; Spinal anaesthesia; Lower limb block\] ☆/);
assert.match(formatCaseList(filterCases(cases, { category: '16' })), /34F LSCS spinal \/ PET/);
assert.equal(formatCaseList({ cases: [], total: 0 }), 'No cases found.');

// ---- year ----
const now = new Date('2026-10-01T00:00:00');
assert.deepEqual(resolveYear({ year: 4, resident: { rYear: 2 } }), { year: 4, source: 'given' });
assert.equal(resolveYear({ resident: { rYear: 2 } }).year, 2);
assert.equal(resolveYear({ resident: { status: 'SMO', rYear: 5 } }).year, 3);
assert.equal(resolveYear({ resident: { intake: 2025 }, now }).year, 2);        // AY2026 = second year
assert.equal(resolveYear({ resident: { rid: '2024003' }, now }).year, 3);      // intake from the rid
assert.equal(resolveYear({ logbook: { settings: { rYear: 2 } }, now }).year, 2);
assert.equal(resolveYear({ logbook: { settings: { rYear: 2, rYearAY: 2025 } }, now }).year, 3);
assert.deepEqual(resolveYear({}), { year: 1, source: 'assumed (pass year to change)' });

// ---- progress and missing (R3: R3 targets are due now) ----
const rows = progressRows(cases, 3);
const lscs = rows.find(x => x.code === '16');
assert.equal(lscs.count, 1); assert.equal(lscs.status, 'due'); assert.equal(lscs.name, 'Lower Segment Caesarean Section');
assert.equal(rows.find(x => x.code === '28').count, 2);
assert.equal(rows.find(x => x.code === '20').count, 1);
assert.equal(rows.find(x => x.code === '99').status, 'none');
// R4: R3 targets are past -> behind
assert.equal(progressRows(cases, 4).find(x => x.code === '16').status, 'late');
// R1: nothing due yet (R2 block targets come later too)
assert.ok(progressRows(cases, 1).every(x => x.status === 'ontrack' || x.status === 'none'));

const p = formatProgress(cases, { year: 3, source: 'given' });
assert.match(p, /^Progress for R3 \(year 3\)/);
assert.match(p, /- Lower Segment Caesarean Section: 1, next 10 by R3 \(due this year; targets 10 by R3, 20 by SR2\)/);

const reflections = [
  { id: 'r1', headingId: 'lscs', status: 'complete', title: 'Massive PPH at LSCS', date: '2026-01-05', initials: 'AB', jr: true, summary: 'Made-up summary.', points: [{ heading: 'Call for help early', text: 'Text.' }], references: ['A made-up reference'] },
  { id: 'r2', headingId: 'lscs', status: 'draft', title: 'Placenta praevia', date: '2026-02-01', initials: 'XY' },
  { id: 'r3', headingId: 'paeds', subId: 'neonate', status: 'complete', title: 'Neonatal pyloromyotomy', date: '2026-02-10', initials: 'CD' },
  { id: 'r4', headingId: 'icu', status: 'complete', title: 'Septic shock', date: '2026-03-01', initials: 'IJ' },
  { id: 'r5', headingId: '', status: 'complete', title: 'Uncategorised one', date: null, initials: '' },
];
const m = missingTargets(cases, reflections, 3);
assert.ok(m.tags.length > 10);
// R2 block targets are past in R3: behind, listed first
assert.deepEqual(m.tags.filter(t => t.status === 'late').map(t => t.code).sort(), ['26', '27', '28']);
assert.equal(m.tags[0].status, 'late');
assert.ok(m.tags.filter(t => t.status !== 'late').every(t => t.status === 'due'));
assert.deepEqual(m.tags.find(t => t.code === '16'), { code: '16', name: 'Lower Segment Caesarean Section', status: 'due', count: 1, target: 10, by: 'R3', short: 9 });
const due = m.tags.filter(t => t.status === 'due');
assert.ok(due[0].short >= due[due.length - 1].short, 'most short first');
assert.equal(m.headings.find(h => h.id === 'lscs').done, 1);
assert.equal(m.headings.find(h => h.id === 'lscs').short, 4);
assert.equal(m.reflectionTotals.done, 3, 'uncategorised does not count');
assert.equal(m.reflectionTotals.drafts, 1);
assert.equal(missingTargets(cases, reflections, 1).tags.length, 0, 'nothing due in R1');
const mt = formatMissing(cases, reflections, { year: 3, source: 'given' });
assert.match(mt, /- Lower Segment Caesarean Section: 1 of 10 by R3, 9 to go \(due this year\)/);
assert.match(mt, /- Caesarean sections: 1 of 5, 4 to go/);
assert.match(mt, /Reflections: 3 of 96 counted/);

// ---- reflections ----
assert.deepEqual(resolveHeading('lscs'), ['lscs']);
assert.deepEqual(resolveHeading('caesarean'), ['lscs']);
assert.deepEqual(resolveHeading('uncategorised'), ['']);
assert.deepEqual(filterReflections(reflections, { heading: 'Caesarean sections' }).map(x => x.id), ['r2', 'r1']);
assert.deepEqual(filterReflections(reflections, { heading: 'lscs', status: 'complete' }).map(x => x.id), ['r1']);
assert.deepEqual(filterReflections(reflections, { status: 'draft' }).map(x => x.id), ['r2']);
assert.deepEqual(filterReflections(reflections, { heading: 'uncategorised' }).map(x => x.id), ['r5']);
assert.throws(() => filterReflections(reflections, { heading: 'qwerty' }), /No reflection heading/);
const rl = formatReflectionList(filterReflections(reflections, {}));
assert.match(rl, /^5 reflections:/);
assert.match(rl, /- \[r3\] Paediatrics \(Neonate\/infant less than 3 month/);
assert.match(rl, /- \[r1\] Caesarean sections: Massive PPH at LSCS \(2026-01-05 · AB · complete · JR\)/);
assert.match(formatReflectionList(reflections, 2), /^5 reflections \(showing 2\)/);
const full = formatReflection(reflections[0]);
assert.match(full, /^# Massive PPH at LSCS\nHeading: Caesarean sections\nStatus: complete · junior residency \(JR\)/);
assert.match(full, /## Learning point 1: Call for help early\nText\./);
assert.match(full, /## References\n1\. A made-up reference/);
assert.match(formatReflection({ id: 'x', headingId: 'icu', status: 'draft', summary: 'y'.repeat(50000) }), /cut short\)$/);
assert.match(formatReflection({ id: 'x', headingId: 'icu', sections: { thoughts: 'Old style' } }), /## Thoughts and feelings\nOld style/);

console.log('logbook.test.mjs: ok');
