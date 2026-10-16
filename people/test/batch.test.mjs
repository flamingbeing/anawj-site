// Plain node checks for people/js/batch.js (new intake paste, year-change check, CSV).
import assert from 'node:assert/strict';
import { parseIntake, yearIssues, yearCounts, peopleCSV, academicYear, yearFromIntake, gradeMeaning, parseRosterList, nameScore, rosterChanges, itemPatch } from '../js/batch.js';

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

// ---------- import from the monthly roster ----------

t('roster grades: residency years, senior residents, ACs, everyone else', () => {
  assert.deepEqual(gradeMeaning('RES2'), { year: 2 });
  assert.deepEqual(gradeMeaning(' res3 '), { year: 3 });
  assert.deepEqual(gradeMeaning('R'), { senior: true });
  assert.deepEqual(gradeMeaning('SR'), { senior: true });
  assert.deepEqual(gradeMeaning('AC'), { ac: true });
  for (const g of ['MOPEX', 'RR', 'NHG', 'Fellow', 'SC', 'C', '', 'Min:48']) assert.equal(gradeMeaning(g), null, g);
});

t('roster list: NUH Junior Monthly copy and the department grid tab', () => {
  const jm = parseRosterList('NUH Junior Monthly staff, roster month 2026-12, copied 2026-10-16\nGrade\tName\tFrom\tUntil\nRES1\tSam Example\t\t\nR\tKim Example\t2026-07-01\t2027-06-30\n');
  assert.equal(jm.month, '2026-12');
  assert.deepEqual(jm.people, [{ grade: 'RES1', name: 'Sam Example', from: '', until: '' }, { grade: 'R', name: 'Kim Example', from: '2026-07-01', until: '2027-06-30' }]);
  const grid = parseRosterList('Dec 26 Request\n\t\tMon\tTue\nS/N\tGrade\tName\t1\t2\t1-Jan\n1\tSC\tDr Senior Example\t\t\t\n2\tRES2\t  Lee   Example \tC\tR1B\t\n\t\t\t\t\t\n\tMin:48\tCount\t1\t1\n');
  assert.equal(grid.month, null);
  assert.deepEqual(grid.people.map(p => [p.grade, p.name]), [['SC', 'Dr Senior Example'], ['RES2', 'Lee Example'], ['Min:48', 'Count']]);
  assert.equal(parseRosterList('just names\nSam\nKim').problem, 'No Grade and Name columns found');
  assert.equal(parseRosterList('Grade,Name\nRES1,Sam Example').people[0].name, 'Sam Example');
});

t('names: same words in any order, one inside the other, a word in common', () => {
  assert.equal(nameScore('Sam Tan', 'TAN Sam'), 3);
  assert.equal(nameScore('Wei Ling Tan', 'Weiling Tan'), 3);
  assert.equal(nameScore('Dr Sam Tan', 'Sam Tan'), 3);
  assert.equal(nameScore('Sam Tan', 'Sam Tan Wei Ming'), 2);
  assert.equal(nameScore('Sam', 'Sam Tan'), 1);   // one word alone is only a hint
  assert.equal(nameScore('Ng', 'Ng Example'), 0);   // and a word of two letters isn't even that
  assert.equal(nameScore('Samuel Tan', 'Sam Tan Wei'), 1);
  assert.equal(nameScore('Kim Lee (Ortho)', 'Kim Lee'), 3);
  assert.equal(nameScore('Ann Example', 'Ben Other'), 0);
});

t('roster changes: years, graduations, new and missing residents', () => {
  const res = [
    { rid: 'R001', name: 'Ann Example', email: 'ann@example.com', status: 'ACTIVE', intake: 2026 },           // R1 now
    { rid: 'R002', name: 'Ben Tan Example', email: 'ben@example.com', status: 'ACTIVE', intake: 2024 },       // R3, agrees
    { rid: 'R003', name: 'Cat Example', email: 'cat@example.com', status: 'ACTIVE', intake: 2021 },           // R5 → AC
    { rid: 'R004', name: 'Dan Example', email: 'dan@example.com', status: 'ACTIVE', intake: 2024 },           // R3 → senior
    { rid: 'R005', name: 'Eve Example', email: 'eve@example.com', status: 'ACTIVE', intake: 2022 },           // R5, senior: agrees
    { rid: 'R006', name: 'Fay Missing', email: 'fay@example.com', status: 'ACTIVE', intake: 2025 },           // not on the roster
    { rid: 'R007', name: 'Gus Mopex', email: 'gus@example.com', status: 'ACTIVE', intake: 2025 },             // on it as MOPEX
    { rid: 'R008', name: 'Hal Example', email: 'hal@example.com', status: 'GRADUATED', intake: 2018 },        // back as RES3?
    { rid: 'R009', name: 'Ida Old', email: 'ida@example.com', status: 'GRADUATED', intake: 2015 },            // gone: no item
  ];
  const list = parseRosterList([
    'NUH Junior Monthly staff, roster month 2026-12, copied 2026-10-16', 'Grade\tName\tFrom\tUntil',
    'RES2\tAnn Example', 'RES3\tBen Tan', 'AC\tCat Example', 'R\tDan Example', 'R\tEve Example', 'MOPEX\tGus Mopex',
    'RES3\tHal Example', 'RES1\tJo New', 'R\tKit New', 'RES1\tLeft Already\t\t2026-11-30', 'Fellow\tMo Fellow',
    'RES2\tAnn Example',
  ].join('\n'));
  const out = rosterChanges(list, res, { today: '2026-10-16' });
  assert.equal(out.date, '2026-12-01');
  assert.equal(out.same, 2);   // Ben (one name inside the other), Eve
  const by = Object.fromEntries(out.items.map(i => [i.key, i]));
  assert.deepEqual(Object.keys(by).sort(), ['change:R001', 'change:R003', 'change:R004', 'change:R008', 'missing:R006', 'new:7', 'new:8', 'other:R007']);
  assert.deepEqual(by['change:R001'].changes, ['R1 → R2']);
  assert.deepEqual(by['change:R001'].fix, { intake: 2025, rYear: null });
  assert.equal(by['change:R001'].tick, true);
  assert.deepEqual(by['change:R003'].fix, { status: 'GRADUATED' });
  assert.equal(by['change:R003'].tick, true);
  assert.deepEqual(by['change:R004'].choose, [4, 5]);
  assert.equal(by['change:R004'].suggest, 4);
  assert.equal(by['change:R004'].tick, true);
  assert.deepEqual(itemPatch(by['change:R004']), { ...res[3], intake: 2023, rYear: null });
  assert.deepEqual(itemPatch(by['change:R004'], 5), { ...res[3], intake: 2022, rYear: null });
  assert.deepEqual(by['change:R008'].fix, { status: 'ACTIVE', intake: 2024, rYear: null });
  assert.equal(by['change:R008'].tick, false);   // back from Graduated: a person checks
  assert.deepEqual(by['new:7'].rec, { name: 'Jo New', email: '', status: 'ACTIVE', intake: 2026, rYear: null });
  assert.deepEqual(by['new:8'].choose, [4, 5]);
  assert.deepEqual(itemPatch(by['new:8'], 5), { name: 'Kit New', email: '', status: 'ACTIVE', intake: 2022, rYear: null });
  assert.equal(by['other:R007'].p.grade, 'MOPEX');
  assert.equal(out.ignored, 2);   // Gus as MOPEX, Mo as Fellow
});

t('roster changes: a choice of month, links, and two people with the same short name', () => {
  const res = [
    { rid: 'R001', name: 'Sam Tan Wei', email: 'a@example.com', status: 'ACTIVE', intake: 2026 },
    { rid: 'R002', name: 'Sam Tan Ming', email: 'b@example.com', status: 'ACTIVE', intake: 2025 },
    { rid: 'R003', name: 'Samuel Lim', email: 'c@example.com', status: 'ACTIVE', intake: 2026 },
  ];
  const list = parseRosterList('Grade\tName\nRES2\tSam Tan\nRES1\tSam Lim');
  // "Sam Tan" fits both: not matched, offered as new with both as possible matches
  const a = rosterChanges(list, res, { month: '2027-01', today: '2026-10-16' });
  const n0 = a.items.find(i => i.key === 'new:0');
  assert.deepEqual(n0.maybe.map(r => r.rid), ['R002', 'R001']);
  assert.ok(a.items.find(i => i.key === 'new:1').maybe.some(r => r.rid === 'R003'));   // "Lim" in common
  // the user says who they are
  const b = rosterChanges(list, res, { month: '2027-01', links: { 0: 'R002', 1: 'R003' }, today: '2026-10-16' });
  assert.equal(b.same, 2);
  assert.deepEqual(b.items.map(i => i.key), ['missing:R001']);
  // July: the same grades are a year on
  const c = rosterChanges(list, res, { month: '2027-07', links: { 0: 'R002', 1: 'R003' }, today: '2026-10-16' });
  assert.deepEqual(c.items.find(i => i.key === 'change:R003').changes, ['R2 → R1']);
  // "new" by hand
  const d = rosterChanges(list, res, { links: { 1: '' }, today: '2026-10-16' });
  assert.ok(d.items.some(i => i.key === 'new:1'));
});

console.log(`people batch: ${n} checks passed`);
