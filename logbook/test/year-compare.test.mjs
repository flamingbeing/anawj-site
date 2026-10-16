// Run with: node logbook/test/year-compare.test.mjs  (fake data only)
// Faculty Year comparison: each target tag's median in the year, the target due next, residents well behind.
import assert from 'node:assert/strict';
import { median, targetFor, yearComparison } from '../js/year-compare.js';

assert.equal(median([]), 0); assert.equal(median([3, 1, 2]), 2); assert.equal(median([4, 1, 2, 3]), 2.5);
assert.deepEqual(targetFor('01', 2), { by: 'R3', n: 10 }); assert.deepEqual(targetFor('01', 4), { by: 'R5', n: 15 });
assert.deepEqual(targetFor('03', 5), { by: 'R3', n: 10 }, 'past its last target: that one');
const people = [
  { rid: 1, name: 'Fake A', rYear: 2, counts: { '01': 8, '03': 2 } },
  { rid: 2, name: 'Fake B', rYear: 2, counts: { '01': 2 } },
  { rid: 3, name: 'Fake C', rYear: 2, counts: { '01': 6, '03': 1 } },
  { rid: 4, name: 'Fake D', rYear: 3, counts: { '01': 0 } },
];
const rows = yearComparison(people, 2), one = rows.find(r => r.code === '01'), three = rows.find(r => r.code === '03');
assert.equal(one.median, 6); assert.deepEqual(one.target, { by: 'R3', n: 10 });
assert.deepEqual(one.behind, [{ rid: 2, name: 'Fake B', count: 2 }], 'at most half the median');
assert.equal(three.median, 1); assert.deepEqual(three.behind, [], 'a small median flags nobody');
assert.deepEqual(yearComparison(people, 5), []);
console.log('year-compare: ok');
