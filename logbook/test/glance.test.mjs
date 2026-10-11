// Analytics at a glance (js/glance.js).
import assert from 'node:assert/strict';
import { spread, logbookGlance, reflectionGlance, cohortGlance, MIN_COHORT } from '../js/glance.js';

assert.equal(spread([]), null);
assert.deepEqual(spread([5]), { n: 1, min: 5, p25: 5, median: 5, p75: 5, max: 5 });
assert.deepEqual(spread([4, 1, 3, 2]), { n: 4, min: 1, p25: 1.75, median: 2.5, p75: 3.25, max: 4 });
assert.equal(spread([1, NaN, 3]).n, 2);

const g = logbookGlance([{ status: 'done' }, { status: 'done' }, { status: 'due' }, { status: 'late' }, { status: 'ontrack' }, { status: 'none' }]);
assert.deepEqual(g, { done: 2, ontrack: 1, due: 1, late: 1, total: 5, goal: 4 });

assert.deepEqual(reflectionGlance(30, 3), { counted: 30, total: 96, goal: 58 });
assert.equal(reflectionGlance(0, 9).goal, 96);

const people = Array.from({ length: MIN_COHORT }, (_, i) => ({ rYear: 2, counts: { 13: i * 5 }, total: 10 * (i + 1), reflectionsTotal: i }));
assert.equal(cohortGlance(people.slice(1), 2), null);          // too few
const c = cohortGlance([...people, { rYear: 3, total: 999 }], 2);
assert.equal(c.n, MIN_COHORT);
assert.equal(c.cases.max, 40);                                  // other years left out
assert.equal(c.reflections.median, 1.5);
assert.ok(c.tags.min >= 0);

console.log('glance tests passed');
