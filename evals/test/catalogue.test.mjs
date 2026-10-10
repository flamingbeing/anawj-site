// Run with: node evals/test/catalogue.test.mjs
import assert from 'node:assert/strict';
import { CATALOGUE_VERSION, EPAS, ITEMS, GROUPS, itemById, groupById, searchItems } from '../js/catalogue.js';

assert.equal(CATALOGUE_VERSION, '2024-07-v8');
assert.deepEqual(EPAS.map(e => e.epa), ['1', '2', '3', '4', '5', '6', '7', '7a', '7b', '8', '9', '10', '11', '12']);
for (const e of EPAS) { assert.ok(e.title.length > 10); assert.ok(e.levels.length >= 1); assert.match(e.levels[0].by, /^R\d$/); }

// counts (PLAN §7): 67 items, DOPS 17, Mini-CEX 12, EBD 38
assert.equal(ITEMS.length, 67);
const n = t => ITEMS.filter(i => i.tool === t).length;
assert.deepEqual([n('DOPS'), n('MiniCEX'), n('EBD')], [17, 12, 38]);

// ids are stable, unique and well formed; fields complete
const ids = new Set();
const FORM = { DOPS: 'dops', MiniCEX: 'minicex', EBD: 'ebd' }, IDT = { DOPS: 'DOPS', MiniCEX: 'MINICEX', EBD: 'EBD' };
for (const i of ITEMS) {
  assert.ok(!ids.has(i.id), 'dup ' + i.id); ids.add(i.id);
  assert.match(i.id, /^(DOPS|MINICEX|EBD)-(\d+[ab]?)-\d\d$/);
  assert.ok(i.id.startsWith(IDT[i.tool] + '-' + i.epa + '-'), i.id);
  assert.equal(i.formId, FORM[i.tool]);
  assert.ok(i.byYear >= 1 && i.byYear <= 5, i.id);
  assert.ok(i.completeBy, i.id);
  assert.ok(i.level === null || i.level === 3 || i.level === 4);
  assert.ok(i.synonyms.length > 0, i.id);
  assert.ok(Array.isArray(i.entrustQs));
  assert.ok(!/•|^Minimum/.test(i.text), i.text);
  assert.equal(groupById(i.group).itemIds.includes(i.id), true);
  assert.equal(i.min, groupById(i.group).min);
  assert.equal(itemById(i.id), i);
}
assert.equal(itemById('nope'), null);
assert.ok(ITEMS.every(i => i.epa !== '7'), 'EPA 7 items live under 7a/7b');

// groups cover each item exactly once
assert.equal(GROUPS.flatMap(g => g.itemIds).length, 67);
assert.equal(new Set(GROUPS.flatMap(g => g.itemIds)).size, 67);

// exceptions
assert.equal(itemById('DOPS-10-01').text, 'Central venous catheter insertion');
assert.equal(groupById('EPA10-DOPS-A').min, 3);
assert.equal(groupById('EPA2-DOPS-A').min, 3);
assert.equal(groupById('EPA2-DOPS-A').completeBy, 'first 2 months of R1');
assert.equal(groupById('EPA2-DOPS-A').byYear, 1);
const obese = groupById('EPA2-DOPS-B');
assert.equal(obese.min, 4); assert.equal(obese.itemIds.length, 3); assert.equal(obese.each, true);
assert.match(itemById(obese.itemIds[0]).text, /obese/);
assert.equal(groupById('EPA4-DOPS-A').min, 1);
assert.equal(groupById('EPA4-DOPS-B').min, 3);
assert.match(itemById('DOPS-4-02').text, /three different types of laryngoscope blades/);
assert.equal(groupById('EPA7a-DOPS-A').min, 3);
const sc = groupById('EPA7a-EBD-A'); assert.equal(sc.min, 1); assert.equal(sc.itemIds.length, 5); assert.equal(sc.each, false);
assert.match(itemById('DOPS-3-03').text, /any one of: Fascia iliaca, Femoral nerve block, Popliteal/);
assert.match(itemById('DOPS-3-04').text, /Erector spinae block.*Transversus abdominis plane block/);
assert.match(itemById('DOPS-2-02').note, /one form/);
assert.match(itemById('EBD-8-01').note, /paediatric/);
assert.equal(itemById('EBD-3-04').level, 3); assert.equal(itemById('EBD-3-05').level, 4);
assert.equal(groupById('EPA6-MINICEX-A').completeBy, 'end R3');
assert.equal(groupById('EPA8-EBD-A').completeBy, 'end R3');

// entrustment questions: EPA 1-6 items have them, 7+ are pending
for (const i of ITEMS) {
  const early = ['1', '2', '3', '4', '5', '6'].includes(i.epa);
  assert.equal(i.entrustQs.length > 0, early, i.id);
}
assert.match(itemById('DOPS-2-02').entrustQs[0], /mask/i);
assert.ok(itemById('DOPS-2-01').entrustQs.length > itemById('DOPS-2-02').entrustQs.length, 'mask gets both forms');
assert.ok(itemById('MINICEX-6-01').entrustQs.every(q => !q.startsWith('*') && !/^[a-f]\. /.test(q)));
assert.ok(itemById('MINICEX-1-01').entrustQs[2].includes('allergic rhinitis'), 'sub-points joined');

// search
const top = (q, o) => searchItems(q, o)[0] && searchItems(q, o)[0].id;
assert.equal(top('art line'), 'DOPS-6-01');
assert.equal(top('IA line'), 'DOPS-6-01');
assert.equal(top('vascath'), 'DOPS-6-02');
assert.equal(top('CVC'), 'DOPS-10-01');
assert.equal(top('central line'), 'DOPS-10-01');
assert.equal(top('awake FOI'), 'DOPS-4-01');
assert.equal(top('awake fibreoptic'), 'DOPS-4-01');
assert.equal(top('DLT'), 'DOPS-2-06');
assert.equal(top('ESP'), 'DOPS-3-04');
assert.ok(searchItems('TAP').slice(0, 1).every(i => i.id === 'DOPS-3-04'));
assert.equal(top('MAC'), 'EBD-3-01');
assert.equal(top('IONM'), 'EBD-2-05');
assert.equal(top('PEC'), 'MINICEX-1-01');
assert.equal(top('ICU outreach'), 'MINICEX-6-01');
assert.equal(top('LSCS ebd'), 'EBD-7b-01');
assert.ok(searchItems('CSE').slice(0, 3).some(i => i.id === 'DOPS-7a-01'));
assert.ok(searchItems('spinal dops').every(i => i.tool === 'DOPS'));
assert.equal(top('spinal dops'), 'DOPS-3-01');
assert.ok(searchItems('PNB').length >= 5);
assert.ok(searchItems('OLV').some(i => i.id === 'EBD-2-06'));
assert.ok(searchItems('SAB').some(i => i.id === 'DOPS-3-01'));
assert.deepEqual([...new Set(searchItems('epa 3').map(i => i.epa))], ['3']);
assert.deepEqual([...new Set(searchItems('EPA7a').map(i => i.epa))], ['7a']);
assert.deepEqual([...new Set(searchItems('epa 7').map(i => i.epa))].sort(), ['7a', '7b']);
assert.ok(searchItems('mini-cex').every(i => i.tool === 'MiniCEX'));
assert.equal(searchItems('mini-cex').length, 12);
assert.equal(searchItems('ebd 5').length, 3);
assert.equal(searchItems('zzzz').length, 0);
assert.equal(searchItems('').length, 67);
// rYear lifts items due this year
assert.equal(searchItems('', { rYear: 3 })[0].byYear, 3);
assert.equal(searchItems('', { rYear: 1 })[0].byYear, 1);

console.log('catalogue tests passed');
