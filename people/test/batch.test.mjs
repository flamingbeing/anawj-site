// Plain node checks for people/js/batch.js (new intake paste, year-change check, CSV).
import assert from 'node:assert/strict';
import { parseIntake, yearIssues, yearCounts, peopleCSV, academicYear, yearFromIntake } from '../js/batch.js';

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('✗ ' + name); throw e; } };

const existing = [
  { rid: 'R001', name: 'Ann Example', email: 'ann@example.com', status: 'ACTIVE', intake: 2023, rYear: null },
  { rid: 'R002', name: 'Ben Example', email: 'ben@example.com', status: 'ACTIVE', intake: 2024, rYear: null },
];

t('academic year starts in July', () => {
  assert.equal(academicYear('2026-06-30'), 2025);
  assert.equal(academicYear('2026-07-01'), 2026);
  assert.equal(yearFromIntake({ intake: 2020 }, '2026-10-13'), 7);
  assert.equal(yearFromIntake({}, '2026-10-13'), null);
});

t('intake paste: names and emails get the next IDs and the intake', () => {
  const out = parseIntake('Name, Email\nCat Example, CAT@example.com\nDan Example <dan@example.com>\nEve Example\teve@example.com', existing, { intake: 2026 });
  assert.equal(out.length, 3);   // header skipped
  assert.deepEqual(out.map(p => p.rec.rid), ['R003', 'R004', 'R005']);
  assert.deepEqual(out.map(p => p.rec.name), ['Cat Example', 'Dan Example', 'Eve Example']);
  assert.equal(out[0].rec.email, 'cat@example.com');
  assert.ok(out.every(p => p.rec.intake === 2026 && p.rec.rYear === null && p.rec.status === 'ACTIVE' && !p.dup && !p.problem));
});

t('intake paste: an ID given first is kept; problems and repeats are flagged', () => {
  const out = parseIntake('R050, Fay Example, fay@example.com\nno email here\nGus Example, gus@example\nAnn Again, ann@example.com\nFay Twice, fay@example.com\nR001, Hal Example, hal@example.com\n, nob@example.com', existing, { intake: 2026, rYear: 2 });
  assert.equal(out[0].rec.rid, 'R050');
  assert.equal(out[0].rec.rYear, 2);
  assert.equal(out[1].problem, 'No email');
  assert.equal(out[2].problem, 'Email not valid');
  assert.equal(out[3].dup, 'Already on the resident list');
  assert.equal(out[4].dup, 'Repeated in this list');
  assert.equal(out[5].dup, 'ID R001 already used');
  assert.equal(out[6].problem, 'No name');
});

t('intake paste: a "Last, First" name is not taken as an ID', () => {
  const out = parseIntake('"Example, Ivy" <ivy@example.com>', existing, { intake: 2026 });
  assert.equal(out[0].rec.name, 'Example Ivy');
  assert.equal(out[0].rec.rid, 'R003');
});

t('year check finds set years, missing years and past-R5', () => {
  const today = '2026-10-13';
  const res = [
    { rid: 'A', name: 'ok by intake', status: 'ACTIVE', intake: 2025 },
    { rid: 'B', name: 'set matches intake', status: 'ACTIVE', intake: 2025, rYear: 2 },
    { rid: 'C', name: 'set, intake disagrees', status: 'ACTIVE', intake: 2024, rYear: 2 },
    { rid: 'D', name: 'set, no intake', status: 'ON LEAVE', rYear: 3 },
    { rid: 'E', name: 'nothing', status: 'ACTIVE' },
    { rid: 'F', name: 'past R5', status: 'ACTIVE', intake: 2019 },
    { rid: 'G', name: 'past R5 but SMO years', status: 'ACTIVE', intake: 2019, smo: 2 },
    { rid: 'H', name: 'graduated', status: 'GRADUATED', intake: 2015 },
  ];
  const by = Object.fromEntries(yearIssues(res, today).map(i => [i.r.rid, i]));
  assert.deepEqual(Object.keys(by).sort(), ['C', 'D', 'E', 'F']);
  assert.equal(by.C.kind, 'fixed'); assert.deepEqual(by.C.fix, { rYear: null });
  assert.equal(by.D.kind, 'nointake'); assert.deepEqual(by.D.fix, { intake: 2024, rYear: null });
  assert.equal(by.E.kind, 'noyear'); assert.equal(by.E.fix, null);
  assert.equal(by.F.kind, 'past'); assert.deepEqual(by.F.fix, { status: 'GRADUATED' });
});

t('year counts', () => {
  assert.deepEqual(yearCounts(existing, '2026-10-13'), { R4: 1, R3: 1 });
});

t('CSV: one row per person, formulas defused', () => {
  const csv = peopleCSV({ residents: existing, faculty: [{ name: '=Dr Bad', email: 'bad@example.com', status: 'ACTIVE' }], pds: [{ name: 'Pat', email: 'pat@example.com' }] }, '2026-10-13');
  assert.ok(csv.startsWith('\ufeff'));
  const lines = csv.slice(1).trim().split('\r\n');
  assert.equal(lines[0], 'list,id,name,email,status,intake,setYear,yearNow');
  assert.equal(lines.length, 5);
  assert.equal(lines[1], 'resident,R001,Ann Example,ann@example.com,ACTIVE,2023,,4');
  assert.equal(lines[3], "faculty,,'=Dr Bad,bad@example.com,ACTIVE,,,");
  assert.equal(lines[4], 'pd,,Pat,pat@example.com,,,,');
});

console.log(`people batch: ${n} checks passed`);
