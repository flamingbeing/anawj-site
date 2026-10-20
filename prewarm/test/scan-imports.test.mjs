// Run with: node prewarm/test/scan-imports.test.mjs  (fake data only)
// A scan import becomes rows for the approval screen: flagged first, unknown ids left out, nothing replaced unless ticked.
import assert from 'node:assert/strict';
import { rowsFor, toValue } from '../js/scan-imports.js';

const imp = { fields: { age: { v: '67', flags: [] }, pw_gown: { v: '07:05', flags: ['hard to read'] }, wt: { v: '', flags: [] }, nonsense: { v: '5', flags: [] }, prewarm_5_core: { v: '36.7', flags: [] } } };
const { rows, skipped } = rowsFor(imp, id => id === 'prewarm_5_core' ? 36.1 : null);
assert.deepEqual(skipped, ['nonsense']);
assert.deepEqual(rows.map(r => r.id), ['pw_gown', 'age', 'prewarm_5_core'], 'flagged first, blanks without flags dropped');
const by = Object.fromEntries(rows.map(r => [r.id, r]));
assert.equal(by.age.use, true, 'a clean new value starts ticked');
assert.equal(by.pw_gown.use, false, 'a flagged value starts unticked');
assert.equal(by.prewarm_5_core.use, false, 'a value that would replace a saved one starts unticked');
assert.equal(by.prewarm_5_core.replaces, true);
assert.equal(rowsFor({ fields: { age: { v: '67' } } }, () => 67).rows[0].replaces, false, 'same value is not a replacement');
assert.deepEqual(rowsFor({}).rows, [], 'an import with no fields');
assert.equal(toValue({ type: 'num' }, ' 36.5 '), 36.5);
assert.equal(toValue({ type: 'num' }, 'NA'), 'NA');
assert.equal(toValue({ type: 'text' }, ' x '), 'x');
assert.equal(toValue({ type: 'num' }, ''), null);
console.log('scan-imports: ok');
