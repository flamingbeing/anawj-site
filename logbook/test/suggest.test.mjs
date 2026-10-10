// Run with: node logbook/test/suggest.test.mjs  (made-up case text only)
import assert from 'node:assert/strict';
import { parseAge, parseBMI, suggest, calibrate, tokens } from '../js/suggest.js';
import { KEYWORDS, CALIBRATION, STOP } from '../js/keywords.js';
import { BY_CODE } from '../js/categories.js';

const yrs = t => parseAge(t)?.years;
const near = (a, b, msg) => assert.ok(a != null && Math.abs(a - b) < 0.01, `${msg}: got ${a}, want ${b}`);

// ages: years
assert.equal(yrs('5yo circumcision'), 5);
assert.equal(yrs('5y squint'), 5);
assert.equal(yrs('5 yo'), 5);
assert.equal(yrs('5 years old'), 5);
assert.equal(yrs('QQ | 33 y.o. F | ASA 2'), 33);
assert.equal(yrs('10y/o dental'), 10);
assert.equal(yrs('78M left TKR'), 78);
assert.equal(yrs('65F'), 65);
assert.equal(yrs('ZZ 27/f labour epidural'), 27);
assert.equal(yrs('65 / M'), 65);
assert.equal(yrs('M78 hip'), 78);
assert.equal(yrs('F 65 lap chole'), 65);
assert.equal(yrs('QXZ 6/F dental clearance'), 6, '"x " before the age is not "x 6" (a count)');
assert.equal(yrs('3M circumcision'), 3, 'capital M is male, even on a paeds list');
// ages: months, weeks, days
near(yrs('8mo boy'), 8 / 12, '8mo');
near(yrs('8 months'), 8 / 12, '8 months');
near(yrs('8/12 hernia'), 8 / 12, '8/12');
near(yrs('6m boy herniotomy'), 0.5, 'lower-case 6m = months');
near(yrs('7y3mo girl'), 7.25, 'compound y+mo');
near(yrs('1y 2mo tongue tie'), 14 / 12, 'compound with space');
near(yrs('2m2w PDA ligation'), 2 / 12 + 2 / 52, 'compound m+w');
near(yrs('3/52 pyloromyotomy'), 3 / 52, '3/52');
near(yrs('2w'), 2 / 52, '2w');
near(yrs('2 wk old'), 2 / 52, '2 wk');
near(yrs('10d old'), 10 / 365, '10d');
near(yrs('10 days old'), 10 / 365, '10 days');
assert.equal(yrs('NB laparotomy'), 0);
assert.equal(yrs('neonate for TEF repair'), 0);
// not ages
assert.equal(parseAge('G1P0 38/52 elective LSCS'), null, 'gestation');
assert.equal(parseAge('G2P1 at 38+4w'), null, 'gestation with +');
assert.equal(parseAge('16w gestation cerclage'), null, 'gestation');
assert.equal(parseAge('labs 10/12/24 Hb 12'), null, 'date');
assert.equal(parseAge('fall from 3m'), null, 'metres');
assert.equal(parseAge('IOL +21.5d'), null, 'lens power');
assert.equal(parseAge('XYZ 123D hernia'), null, 'NRIC-ish fragment');
assert.equal(parseAge('QWE 083F hernia'), null, 'NRIC-ish fragment with F');
assert.equal(parseAge('lap chole'), null);
assert.equal(parseAge(''), null);
assert.equal(parseAge(null), null);
assert.equal(yrs('pain for 3 years ago 70/M'), 70, '"3 years ago" is not the age');

// BMI
assert.equal(parseBMI('BMI 42'), 42);
assert.equal(parseBMI('bmi42 OSA'), 42);
assert.equal(parseBMI('BMI 41.5'), 41.5);
assert.equal(parseBMI('BMI: 38'), 38);
assert.equal(parseBMI('no bmi here'), null);
assert.equal(parseBMI('BMI 3'), null);

// tokens: leading initials dropped unless they are a known word, stop words break bigrams
assert.deepEqual(tokens('ABC lap chole'), ['lap', 'chole']);
assert.equal(tokens('TKR spinal')[0], 'tkr', '"TKR" at the start is the case, not initials');
assert.deepEqual(tokens('hernia and repair'), ['hernia', null, 'repair']);
assert.deepEqual(tokens('id 123a dose 50mg'), ['id', null, 'dose', null]);

// keywords.js shape and hygiene
assert.ok(Object.keys(KEYWORDS).length > 300, 'keyword table looks populated');
assert.ok(STOP.includes('the'));
for (const [g, ps] of Object.entries(KEYWORDS)) {
  assert.ok(/^[a-z0-9&]+( [a-z0-9&]+)?$/.test(g), `odd token ${g}`);
  assert.ok(!/\d{3}/.test(g), `digit-heavy token ${g}`);
  for (const [c, p] of Object.entries(ps)) {
    assert.ok(BY_CODE[c], `unknown code ${c} for ${g}`);
    assert.ok(p > 0 && p <= 1, `bad p for ${g}`);
  }
}
for (let i = 1; i < CALIBRATION.length; i++) assert.ok(CALIBRATION[i][1] >= CALIBRATION[i - 1][1], 'calibration is monotone');
assert.ok(calibrate(0) === 0 && calibrate(1) <= 1);
assert.ok(calibrate(0.9) > calibrate(0.5));

// suggest: shape
const codes = (t, min = 0.5) => suggest(t).filter(s => s.score >= min).map(s => s.code);
const has = (t, want, min = 0.5) => { const got = codes(t, min); for (const c of want) assert.ok(got.includes(c), `"${t}" should suggest ${c} (got ${got.join(', ')})`); };
const lacks = (t, no, min = 0.5) => { const got = codes(t, min); for (const c of no) assert.ok(!got.includes(c), `"${t}" should not suggest ${c} (got ${got.join(', ')})`); };
{
  const s = suggest('ABC 5yo circumcision penile block caudal', { limit: 10 });
  assert.ok(s.length <= 10);
  assert.equal(new Set(s.map(x => x.code)).size, s.length, 'no duplicates');
  for (const x of s) {
    assert.ok(BY_CODE[x.code] && !BY_CODE[x.code].retired, 'only active codes');
    assert.ok(x.score >= 0 && x.score <= 1);
    assert.ok(['keyword', 'age', 'bmi'].includes(x.why));
  }
  for (let i = 1; i < s.length; i++) assert.ok(s[i - 1].score >= s[i].score, 'sorted by score');
  assert.ok(suggest('ABC 5yo circumcision penile block caudal').length <= 6, 'default limit 6');
}
assert.deepEqual(suggest(''), []);
assert.deepEqual(suggest('   '), []);

// suggest: the examples from the spec
has('LSCS spinal', ['16', '17']);
has('lap chole', ['08', '13']);
has('ABC lap cholecystectomy', ['08', '13']);
has('TKR', ['18']);
has('ESP block', ['26', '26iii']);
has('interscalene block shoulder arthroscopy', ['26', '26i', '18']);
has('labour epidural', ['17']);
has('phaco IOL', ['09']);
has('craniotomy for SDH', ['15']);
// age and BMI rules
has('QRS 78M laparotomy', ['21']);
has('QRS 5yo dental', ['20', '20iii']);
has('2/12 herniotomy', ['20', '20i']);
has('18mo hypospadias', ['20', '20ii']);
lacks('18mo hypospadias', ['20i', '20iii'], 0);
lacks('QRS 45F lap chole', ['20', '20iii', '21'], 0);
lacks('QRS 14/M appendicectomy', ['20'], 0.5);
has('QRS 14/M appendicectomy', ['20'], 0.4);
has('sleeve gastrectomy BMI 45', ['22']);
lacks('BMI 30 TKR', ['22'], 0);
assert.equal(suggest('QRS 78M BMI 42 TKR').find(s => s.code === '21').why, 'age');
assert.equal(suggest('QRS 78M BMI 42 TKR').find(s => s.code === '22').why, 'bmi');
// swapping in a table (used by the builder's evaluation)
assert.deepEqual(suggest('zzword', { keywords: { zzword: { '09': 0.9 } }, calibration: [] }).map(s => s.code), ['09']);

// block and procedure abbreviations residents actually type
has('EF 72M TKR ACB', ['26', '26ii']);
has('EF 80F hip FNB', ['26ii']);
has('CD 5yo T&A', ['10']);
has('CD adenotonsillectomy', ['10']);
has('AB 2yo circumcision caudal', ['27']);

console.log('suggest tests passed');
