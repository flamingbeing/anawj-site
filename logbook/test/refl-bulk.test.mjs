// Run with: node logbook/test/refl-bulk.test.mjs  (fake data only)
// Reflections' bulk edit: heading (sub-type kept only where the new heading has it), status (complete only when
// nothing is missing), export in / out, JR, date; nothing to change gives null.
import assert from 'node:assert/strict';
import { applyReflChange, reflOverwrites, reflChangeLines, reflMissing, reflNone, reflEmpty } from '../js/refl-bulk.js';

const t = {
  headings: { gen: { subs: [{ id: 'lap' }] }, obs: { subs: [] } },
  problems: r => [!r.initials ? 'initials' : '', !r.date ? 'date' : ''].filter(Boolean),
};
const ch = x => ({ ...reflNone(), ...x });
const r = { id: 'r1', headingId: 'gen', subId: 'lap', initials: 'ZQ', date: '2026-10-01', status: 'draft', createdAt: 1, updatedAt: 1 };

assert.ok(reflEmpty(reflNone()));
assert.equal(applyReflChange(r, reflNone(), t), null);
let x = applyReflChange(r, ch({ heading: { id: 'obs' } }), t, 9);
assert.equal(x.headingId, 'obs'); assert.equal(x.subId, null, 'obs has no lap sub-type'); assert.equal(x.updatedAt, 9);
x = applyReflChange({ ...r, headingId: 'obs', subId: 'lap' }, ch({ heading: { id: 'gen' } }), t);
assert.equal(x.subId, 'lap', 'kept where the new heading has it');
assert.equal(applyReflChange(r, ch({ heading: { id: '' } }), t).headingId, '', 'Uncategorised');
assert.equal(applyReflChange(r, ch({ heading: { id: 'gen' } }), t), null, 'already there');

x = applyReflChange(r, ch({ status: 'complete' }), t);
assert.equal(x.status, 'complete');
assert.deepEqual(applyReflChange({ ...r, initials: '' }, ch({ status: 'complete' }), t), { blocked: ['initials'] });
x = applyReflChange({ ...r, initials: '' }, ch({ status: 'complete', jr: true }), t);
assert.equal(x.status, 'draft', 'still a draft'); assert.equal(x.jr, true, 'the other change applies');
x = applyReflChange({ ...r, date: '' }, ch({ status: 'complete', date: { set: '2026-09-09' } }), t);
assert.equal(x.status, 'complete', 'the new date counts'); assert.equal(x.date, '2026-09-09');
assert.equal(applyReflChange({ ...r, status: 'complete' }, ch({ status: 'draft' }), t).status, 'draft');

assert.equal(applyReflChange(r, ch({ exp: false }), t).export, false);
assert.equal(applyReflChange(r, ch({ exp: true }), t), null, 'unset counts as in');
assert.equal(applyReflChange(r, ch({ jr: true }), t).jr, true);
assert.equal(applyReflChange(r, ch({ jr: false }), t), null);

assert.equal(reflOverwrites(ch({ status: 'complete' })), false);
assert.equal(reflOverwrites(ch({ exp: true })), false);
assert.equal(reflOverwrites(ch({ heading: { id: 'gen' } })), true);
assert.deepEqual(reflChangeLines(ch({ heading: { id: 'obs' }, exp: false }), { heading: id => id.toUpperCase() }), ['Heading: moved to OBS', 'Portfolio export: left out']);
assert.equal(reflMissing(ch({ date: { set: '' } })), 'Choose the date');
assert.equal(reflMissing(ch({ heading: { id: null } })), 'Choose the heading');
console.log('refl-bulk: ok');
