// Run with: node logbook/test/importer.test.mjs  (fake names and cases only)
import assert from 'node:assert/strict';
import { parseResidentsScript, parseCaseSheet, parseTotalsSheet, countCheck, flagCase, splitLabels, ridOf } from '../js/importer.js';

// residents (Apps Script)
{
  const text = `
// Resident list
const RESIDENTS = [
  {id: "202301", name: "Alex Tan", email: "Alex.Tan@Example.com", status: "ACTIVE"},
  { id: '202302', name: 'Bea Lim, Jo', email: 'bea@example.com', status: 'on leave' },
  // {id: "202399", name: "Commented Out", email: "x@example.com", status: "ACTIVE"},
  {id: 202303, name: "Chris O\\"Neil", email: "chris@example.com", status: "GRADUATED"},
  {id: "202301", name: "Duplicate", email: "dup@example.com", status: "ACTIVE"},
];
const OTHER = [{id: "999", name: "Not a resident"}];`;
  const rs = parseResidentsScript(text);
  assert.deepEqual(rs, [
    { id: '202301', name: 'Alex Tan', email: 'alex.tan@example.com', status: 'ACTIVE' },
    { id: '202302', name: 'Bea Lim, Jo', email: 'bea@example.com', status: 'ON LEAVE' },
    { id: '202303', name: 'Chris O"Neil', email: 'chris@example.com', status: 'GRADUATED' },
  ]);
  // just the object lines, no wrapper
  assert.equal(parseResidentsScript('{id: "202401", name: "Dee Ng", email: "d@example.com", status: "ACTIVE"},')[0].name, 'Dee Ng');
  assert.deepEqual(parseResidentsScript(''), []);
}

// helpers
assert.equal(ridOf('Alex Tan (202301)'), '202301');
assert.equal(ridOf('Tan, Alex Jr (202301) '), '202301');
assert.equal(ridOf('WRONG ENTRY'), null);
assert.deepEqual(splitLabels('16) Lower Segment Caesarean Section (10 | 20), 17) Obstetrics Spinal/ Epidural/ CSE (10 | 40)'),
  ['16) Lower Segment Caesarean Section (10 | 20)', '17) Obstetrics Spinal/ Epidural/ CSE (10 | 40)']);
assert.deepEqual(splitLabels('99) Others, with a comma, 20iii) Age 4 to 12 years (100 | 100)'), ['99) Others, with a comma', '20iii) Age 4 to 12 years (100 | 100)']);
assert.deepEqual(splitLabels(null), []);

// Case tab
const HEADER = ['Resident', 'Date', 'Initials,  Case Details', 'Category', 'Neurosurgical procedure (15 | 15)', 'Paediatric Surgery (125 | 155)', 'Peripheral nerve blocks (R2=10 | R3=20 | R4=30 | R5=40)', 'Timestamp', 'Email Address'];
const A = 'Alex Tan (202301)', B = 'Bea Lim (202302)';
const utc = s => new Date(s + 'Z');
const ROWS = [
  HEADER,
  [A, utc('2026-03-02T00:00:00'), 'AB 5yo M tonsillectomy', '10) ENT (5 | 10), 20) Paediatric Surgery (125 | 155)', null, '20iii) Age 4 to 12 years (100 | 100)', null, utc('2026-03-02T10:00:00.123'), ''],
  [B, '2026-03-01T00:00:00', 'CD 70F TKR, ACB', '18) Orthopaedic Surgery (20 | 20), 21) Geriatric patients undergoing surgery (30 | 30), 26) Peripheral nerve blocks (R2=10 | R3=20 | R4=30 | R5=40)', null, null, '26ii) Lower limb blocks (10 | 10), 26iv) Other blocks', '2026-03-01T12:00:00', ''],
  ['WRONG ENTRY', utc('2026-03-01T00:00:00'), 'oops', '13) General Surgery (20 | 20)', null, null, null, null, ''],
  [A, '31/6/24', 'EF craniotomy', '15) Neurosurgical procedure (15 | 15)', '15i) Emergency neurosurgery (10 | 10)', null, null, null, ''],
  [A, '-', 'GH lap chole', '08) Laparoscopic surgery (5 | 10), 13) General Surgery (20 | 20)', null, null, null, null, ''],
  [A, '-', 'GH lap chole', '08) Laparoscopic surgery (5 | 10), 13) General Surgery (20 | 20)', null, null, null, null, ''],
  [A, '15/1/2024', 'IJ mystery', '42) Not a category', null, null, null, null, ''],
  [null, null, null, null, null, null, null, null, null],
];
const res = parseCaseSheet(ROWS);
assert.equal(res.cases.length, 6);
assert.deepEqual(res.skipped, [{ row: 4, reason: 'WRONG ENTRY' }]);
{
  const [c1, c2, c3, c4] = res.cases;
  assert.deepEqual([c1.rid, c1.residentLabel, c1.date, c1.dateText, c1.details], ['202301', A, '2026-03-02', '', 'AB 5yo M tonsillectomy']);
  assert.deepEqual(c1.cats, ['10', '20', '20iii'], 'D..G merged in order, no parents added');
  assert.equal(c1.timestamp, Date.parse('2026-03-02T10:00:00.123Z'));
  assert.equal(c2.date, '2026-03-01', 'ISO strings accepted as well as Dates');
  assert.equal(c2.timestamp, Date.parse('2026-03-01T12:00:00Z'), 'zoneless ISO timestamp read as UTC, like ExcelJS');
  assert.deepEqual(c2.cats, ['18', '21', '26', '26ii', '26iv'], 'retired 26iv kept');
  assert.deepEqual([c3.date, c3.dateText], [null, '31/6/24'], 'invalid date kept as text');
  assert.deepEqual(c3.cats, ['15', '15i']);
  assert.deepEqual(c4.dateText, '-');
  assert.deepEqual(res.cases[5].cats, []);
  assert.ok(res.warnings.some(w => w.row === 8 && /Unknown category "42\) Not a category"/.test(w.message)));
}
// importKeys: unique, stable on re-parse, stable for rows added on top, identical rows numbered from the bottom
{
  const keys = res.cases.map(c => c.importKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(parseCaseSheet(ROWS).cases.map(c => c.importKey), keys);
  assert.ok(keys[3].endsWith('#1') && keys[4].endsWith('#0') && keys[3].split('#')[0] === keys[4].split('#')[0]);
  const NEW = [B, utc('2026-03-05T00:00:00'), 'GH lap chole', '08) Laparoscopic surgery (5 | 10), 13) General Surgery (20 | 20)', null, null, null, utc('2026-03-05T09:00:00'), ''];
  const DUP = [A, '-', 'GH lap chole', '08) Laparoscopic surgery (5 | 10), 13) General Surgery (20 | 20)', null, null, null, null, ''];
  const more = parseCaseSheet([HEADER, NEW, DUP, ...ROWS.slice(1)]).cases.map(c => c.importKey);
  assert.deepEqual(more.slice(2), keys, 'existing keys unchanged when newer rows are prepended');
  assert.ok(more[1].endsWith('#2'), 'third identical row gets the next index');
  // Date objects and their ISO string dump give the same keys
  const isoRows = ROWS.map(r => r.map(v => (v instanceof Date ? v.toISOString().replace('Z', '') : v)));
  assert.deepEqual(parseCaseSheet(isoRows).cases.map(c => c.importKey), keys);
  // a key changes when content changes
  const edited = ROWS.map(r => r.slice()); edited[1][2] = 'AB 5yo M tonsillectomy + adenoidectomy';
  assert.notEqual(parseCaseSheet(edited).cases[0].importKey, keys[0]);
}
// header found loosely, columns in another order, ExcelJS rich text / formula cells
{
  const r = parseCaseSheet([
    ['Timestamp', 'resident ', 'Initials, Case Details', 'DATE', 'Category'],
    [null, { richText: [{ text: 'Alex Tan ' }, { text: '(202301)' }] }, { result: 'KL appendicectomy' }, 45658, '13) General Surgery (20 | 20)'],
  ]);
  assert.deepEqual([r.cases[0].rid, r.cases[0].details, r.cases[0].date, r.cases[0].cats], ['202301', 'KL appendicectomy', '2025-01-01', ['13']]);
  assert.equal(parseCaseSheet([['nothing']]).cases.length, 0);
  assert.equal(parseCaseSheet([]).warnings.length, 1);
}

// Totals tab
const TOTALS = [
  ['Category', A, B, 'Someone Without Id'],
  ['10) ENT (5 | 10)', 1, 0, 3],
  ['18) Orthopaedic Surgery (20 | 20)', null, 1, 0],
  ['20) Paediatric Surgery (125 | 155)', 1, '', 0],
  ['20iii) Age 4 to 12 years (100 | 100)', 1, 0, 0],
  ['26ii) Lower limb blocks (10 | 10)', 0, 1, 0],
  ['08) Laparoscopic surgery (5 | 10)', 2, 0, 0],
  ['15i) Emergency neurosurgery (10 | 10)', 1, 0, 0],
  ['Grand Total', 7, 2, 3],
  ['10) ENT (5 | 10)', 99, 99, 99],
];
const totals = parseTotalsSheet(TOTALS);
assert.deepEqual(totals['202301'], { 10: 1, 18: 0, 20: 1, '20iii': 1, '26ii': 0, '08': 2, '15i': 1 });
assert.deepEqual(totals['202302'], { 10: 0, 18: 1, 20: 0, '20iii': 0, '26ii': 1, '08': 0, '15i': 0 });
assert.equal(totals['Someone Without Id'][10], 3);
assert.deepEqual(parseTotalsSheet([]), {});

// countCheck
{
  const { ['Someone Without Id']: _, ...t } = totals;
  assert.deepEqual(countCheck(res.cases, t), { ok: true, diffs: [] });
  const bad = { ...t, 202302: { ...t['202302'], 18: 2 }, 202303: { 13: 1 } };
  assert.deepEqual(countCheck(res.cases, bad).diffs, [{ rid: '202302', code: '18', expected: 2, got: 1 }, { rid: '202303', code: '13', expected: 1, got: 0 }]);
  assert.equal(countCheck([], {}).ok, true);
}

// flagCase
assert.deepEqual(flagCase({ date: '2026-03-01' }, '2026-10-10'), []);
assert.deepEqual(flagCase({ date: null, dateText: '31/6/24' }), ['needsDate']);
assert.deepEqual(flagCase({ date: '2024-06-31' }), ['needsDate']);
assert.deepEqual(flagCase({ date: '2026-12-01' }, '2026-10-10'), ['future']);
assert.deepEqual(res.cases.map(c => flagCase(c, '2026-10-10')).filter(f => f.includes('needsDate')).length, 3);

console.log('importer tests passed');
