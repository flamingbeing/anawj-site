// Run with: node evals/test/forms.test.mjs
import assert from 'node:assert/strict';
import { SCALES, FORMS, ENTRUSTMENT_TEXT_KEY, formById, questionsOf } from '../js/forms.js';

assert.deepEqual(Object.keys(FORMS).sort(), ['dops', 'ebd', 'minicex']);
assert.deepEqual(Object.keys(SCALES).sort(), ['clinicalSetting', 'complexity', 'guidance', 'milestone', 'ninePoint', 'receptive', 'reflective', 'supervision']);
assert.equal(SCALES.ninePoint.options.length, 9);
assert.ok(SCALES.ninePoint.options.every(o => o.descriptor));
assert.deepEqual(SCALES.ninePoint.bands.map(b => b.range), [[1, 3], [4, 6], [7, 9]]);
assert.deepEqual(SCALES.milestone.options.map(o => o.value), [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
assert.deepEqual(SCALES.supervision.options.map(o => o.value), [1, 2, 3, 4, 5]);
assert.equal(formById('dops'), FORMS.dops);
assert.equal(formById('x'), null);

const TYPES = ['select', 'checkboxes', 'text', 'ninePoint', 'milestone', 'supervision'];
const TOOL = { dops: 'DOPS', minicex: 'MiniCEX', ebd: 'EBD' };
for (const [id, f] of Object.entries(FORMS)) {
  assert.equal(f.id, id); assert.equal(f.tool, TOOL[id]);
  assert.ok(f.title && f.introduction.length >= 5 && /Insufficient contact/.test(f.decline));
  const qs = questionsOf(f);
  qs.forEach((q, i) => {
    assert.equal(q.n, i + 1, 'numbered in order');
    assert.equal(q.key, 'q' + q.n);
    assert.ok(TYPES.includes(q.type), q.type);
    assert.equal(typeof q.required, 'boolean'); assert.equal(typeof q.na, 'boolean');
    if (q.type === 'select' || q.type === 'checkboxes') assert.ok(q.options.length >= 3 && q.options.every(o => typeof o === 'string'));
    if (['ninePoint', 'milestone', 'supervision'].includes(q.type)) assert.equal(q.scaleKey, q.type);
    if (q.type === 'milestone') assert.deepEqual(Object.keys(q.descriptors), ['1', '3', '5', '7', '9']);
    if (q.na) assert.ok(['ninePoint', 'milestone'].includes(q.type));
  });
  assert.ok(f.sections.every(s => s.title === null || typeof s.title === 'string'));
  // entrustment text box
  const ek = qs.find(q => q.key === ENTRUSTMENT_TEXT_KEY[id]);
  assert.equal(ek.type, 'text'); assert.equal(ek.required, true); assert.match(ek.label, /at least 2 entrustment questions/);
  assert.equal(ek.minLength, null);
}

const q = (f, n) => questionsOf(FORMS[f]).find(x => x.n === n);
// DOPS (19)
assert.equal(questionsOf(FORMS.dops).length, 19);
assert.deepEqual(q('dops', 1).options, ['Low', 'Moderate', 'High']);
assert.equal(q('dops', 1).scaleKey, 'complexity');
assert.equal(q('dops', 2).options.length, 4);
for (let n = 3; n <= 13; n++) { assert.equal(q('dops', n).type, 'ninePoint'); assert.equal(q('dops', n).na, true); }
assert.equal(q('dops', 14).na, false); assert.equal(q('dops', 14).required, true);
assert.equal(q('dops', 16).type, 'supervision');
assert.equal(q('dops', 17).required, false); assert.equal(q('dops', 17).minLength, 30);
assert.deepEqual(q('dops', 18).options, ['Yes', 'No', 'Maybe']);
// Mini-CEX (22)
assert.equal(questionsOf(FORMS.minicex).length, 22);
assert.equal(q('minicex', 1).options.length, 8);
assert.equal(q('minicex', 7).required, false);
assert.equal(q('minicex', 12).na, false);
assert.deepEqual([14, 15, 16, 17].map(n => q('minicex', n).na), [false, false, true, true]);
assert.equal(q('minicex', 19).minLength, 30); assert.equal(q('minicex', 19).required, true);
assert.equal(q('minicex', 22).required, false);
assert.equal(FORMS.minicex.sections.find(s => s.questions.some(x => x.n === 3)).title, 'Patient Assessment/ Preparation');
// EBD (12)
assert.equal(questionsOf(FORMS.ebd).length, 12);
assert.equal(q('ebd', 2).type, 'checkboxes'); assert.equal(q('ebd', 2).options.length, 10);
assert.equal(q('ebd', 2).exclusive, 'No obvious areas for improvement');
assert.deepEqual(q('ebd', 3).showIf, { key: 'q2', anyExcept: 'No obvious areas for improvement' });
assert.equal(q('ebd', 3).required, false);
assert.deepEqual([5, 6, 7, 8].map(n => q('ebd', n).na), [false, false, true, true]);
assert.equal(q('ebd', 10).minLength, 30);
assert.ok(!questionsOf(FORMS.dops).some(x => x.showIf || x.exclusive));

console.log('forms tests passed');
