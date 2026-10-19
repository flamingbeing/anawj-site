// Pasted-list format: start text, skip, drop-from-end (list-format.js) through parseBulk. Fake data only.
import assert from 'node:assert/strict';
import { cleanListFormat, startRegex, startUsable, splitByStart, trimCase } from '../js/list-format.js';
import { parseBulk } from '../js/engine.js';

const now = new Date('2026-03-20T12:00:00');

// cleaning
assert.equal(cleanListFormat(null), null);
assert.equal(cleanListFormat({ start: '  ', skip: 0, dropEnd: '' }), null);
assert.deepEqual(cleanListFormat({ start: '{n}.  ===', skip: '5.7', dropEnd: ' ===,,-- ' }), { start: '{n}. ===', skip: 5, dropEnd: '===, --' });
assert.equal(cleanListFormat({ skip: 9999 }).skip, 200);
assert.equal(startUsable('{n}{any}'), false);
assert.equal(startRegex('{initials}'), null);
assert.ok(startRegex('{n}. === {initials} ('));

// one long line, numbered, wrapped in === (made-up cases)
const blob = '1. === AAB (60/M, ASA II) ===Op: knee scopeIssue: OA2. === CDE (40/F, ASA I) ===Op: lap cholePlan: GA3. === FGH (7/M) ===Op: circumcision, caudal';
const fmt = { start: '{n}. === {initials} (' };
const cut = splitByStart(blob, fmt);
assert.equal(cut.length, 3);
assert.deepEqual(cut.map(c => c.initials), ['AAB', 'CDE', 'FGH']);
const r = parseBulk(blob, null, now, { format: fmt });
assert.equal(r.length, 3);
assert.equal(r[1].initials, 'CDE');
assert.equal(r[1].details, '40/F, ASA I) ===Op: lap cholePlan: GA');
// no start text found -> the usual empty-line splitting
assert.equal(parseBulk('AB 45F LSCS\n\nCD 30F hernia', null, now, { format: fmt }).length, 2);
assert.equal(parseBulk('AB 45F LSCS\n\nCD 30F hernia', null, now).length, 2);

// the date can be captured, or read from the first line as before; the start text can sit on its own line
const dated = parseBulk('#1 12/3 EF 70F\nTKR spinal\n#2 13/3 GH 50M\nhernia', null, now, { format: { start: '#{n} {date}' } });
assert.equal(dated.length, 2);
assert.equal(dated[0].date, '2026-03-12');
assert.equal(dated[1].date, '2026-03-13');
assert.equal(dated[0].initials, 'EF');
assert.equal(dated[0].details, '70F\nTKR spinal');
const cap = parseBulk('Case 5: IJ 5yo circ\nCase 6: KL 60F THR', null, now, { format: { start: 'Case {n}:' } });
assert.deepEqual(cap.map(c => c.initials), ['IJ', 'KL']);
assert.equal(cap[0].date, null);

// skip characters and drop-from-end, with empty-line splitting too
const sk = parseBulk('>> 12/3 AB 45F LSCS ===\n\n>> CD 30F hernia ===', null, now, { format: { skip: 3, dropEnd: '===' } });
assert.deepEqual(sk.map(c => [c.date, c.initials, c.details]), [['2026-03-12', 'AB', '45F LSCS'], [null, 'CD', '30F hernia']]);
assert.equal(trimCase('abc === ===', { dropEnd: '===' }), 'abc');
assert.equal(trimCase('abc', { skip: 10 }), '');

// an empty or odd start text never hangs or splits on every character
assert.equal(splitByStart('x y z', { start: '{any}' }), null);
assert.equal(splitByStart('a b', { start: '   ' }), null);
const t0 = Date.now(); splitByStart('=== '.repeat(5000), { start: '{any}{any}{any}x' }); assert.ok(Date.now() - t0 < 2000);

console.log('list-format tests passed');

// teach by example
{
  const { learnFormat } = await import('../js/list-format.js');
  const sample = '1. === AAB (60/M) ===Op: knee scope --2. === CDE (40/F) ===Op: lap chole --';
  const at = (needle, from = 0) => { const s = sample.indexOf(needle, from); return { s, e: s + needle.length }; };
  const L = learnFormat(sample, [{ role: 'start', ...at('1. === AAB (') }, { role: 'initials', ...at('AAB') }, { role: 'end', ...at('--', 20) }]);
  assert.deepEqual(L.format, { start: '{n}. === {initials} (', dropEnd: '--' });
  assert.equal(parseBulk(sample, null, now, { format: L.format }).map(c => c.initials).join(), 'AAB,CDE');
  assert.match(learnFormat(sample, []).error, /starts a case/);
  assert.match(learnFormat(sample, [{ role: 'start', ...at('1') }]).error, /fixed text/);
  const D = learnFormat('#1 12/3 EF 70F', [{ role: 'start', s: 0, e: 7 }, { role: 'date', s: 3, e: 7 }, { role: 'skip', s: 7, e: 10 }]);
  assert.deepEqual(D.format, { start: '#{n} {date}', skip: 3 });
  console.log('learn format tests passed');
}

// a premed-style list: a title line with the day's date, "N.=== AB (details) ===" headers, labelled lines (made-up cases)
{
  const { learnFormat, dateTokens } = await import('../js/list-format.js');
  const t = 'OR06 - 20 Oct 2026 (Tue)\n\n1.=== AAB (60/M, ASA II) ===\nOp: knee scope\nIssue: OA\n\n2.=== CDE (40/F, ASA I) ===\nOp: lap chole\n';
  const f = { start: '{n}.=== {initials} (', remove: ') ===' };
  const r = parseBulk(t, null, now, { format: f });
  assert.deepEqual(r.map(c => [c.date, c.initials, c.details]), [['2026-10-20', 'AAB', '60/M, ASA II\nOp: knee scope\nIssue: OA'], ['2026-10-20', 'CDE', '40/F, ASA I\nOp: lap chole']]);
  assert.deepEqual(dateTokens('OR06 - 20 Oct 2026 (Tue)'), ['20 Oct 2026']);
  // a case's own date wins over the title's
  assert.equal(parseBulk('Day 1/2/26\n#1 12/3 EF 70F\nTKR\n#2 GH 50M\nhernia', null, now, { format: { start: '#{n}' } }).map(c => c.date).join(), '2026-03-12,2026-02-01');
  const t0 = t.indexOf('1.=== AAB ('), t1 = t.indexOf(') ===');
  const L = learnFormat(t, [{ role: 'start', s: t0, e: t0 + 11 }, { role: 'initials', s: t0 + 6, e: t0 + 9 }, { role: 'remove', s: t1, e: t1 + 5 }]);
  assert.deepEqual(L.format, f);
  console.log('premed list tests passed');
}
