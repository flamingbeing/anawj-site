// Run with: node logbook/test/lb-group.test.mjs  (fake data only)
// The Logbook List's Group by and Sort: months, days, weeks, residency years, APMES tags (a case under each, with
// the count against the target), your tags, flags (with planned cases), none; Newest / Oldest / Initials / Most tags.
import assert from 'node:assert/strict';
import { groupCases, sortCases, entriesOf, groupBy, sortBy } from '../js/lb-group.js';

const rows = [
  { id: 'a', date: '2026-10-14', initials: 'ZB', cats: ['16', '18'], tags: ['u:x'], createdAt: 3 },
  { id: 'b', date: '2026-10-02', initials: 'ZA', cats: ['16'], reflectTag: true, createdAt: 2 },
  { id: 'c', date: '2026-09-30', initials: 'zc', cats: [], createdAt: 1 },
  { id: 'd', date: null, initials: 'ZD', cats: ['18'], createdAt: 4 },
];
const ctx = {
  initials: c => c.initials || '', tagCount: c => (c.cats || []).length + (c.tags || []).length, weekStart: 1,
  year: d => (d >= '2026-10-01' ? 2 : 1), yearName: n => `R${n}`, day: iso => `D${iso}`,
  catName: k => ({ 16: 'LSCS', 18: 'Spinal' })[k], order: k => Number(k), target: k => (k === '16' ? 20 : null), count: k => (k === '16' ? 12 : 3),
  tagName: k => (k === 'u:x' ? 'Fake mine' : k), plan: [{ id: 'p1', details: 'fake planned' }],
};
const view = (by, sort = 'newest') => groupCases(sortCases(rows, sort, ctx), by, sort, ctx).map(g => `${g.label}${g.note ? ` (${g.note})` : ''}: ${g.items.map(c => c.id).join('')}`);

assert.equal(groupBy('nonsense'), 'month'); assert.equal(sortBy(undefined), 'newest');
assert.deepEqual(view('month'), ['October 2026: ab', 'September 2026: c', 'No date: d']);
assert.deepEqual(view('month', 'oldest'), ['September 2026: c', 'October 2026: ba', 'No date: d'], 'oldest first, no date last');
assert.deepEqual(view('day'), ['D2026-10-14: a', 'D2026-10-02: b', 'D2026-09-30: c', 'No date: d']);
assert.deepEqual(view('week'), ['Week of D2026-10-12: a', 'Week of D2026-09-28: bc', 'No date: d'], 'weeks start on Monday (30 Sep and 2 Oct: one week)');
assert.deepEqual(view('year'), ['R2: ab', 'R1: c', 'Year unknown: d']);
assert.deepEqual(view('tag'), ['LSCS (12 of 20 for the target): ab', 'Spinal: ad', 'No tag yet: c'], 'a case under each of its tags; the count against the target');
assert.deepEqual(view('mine'), ['Fake mine: a', 'None of your tags: bcd']);
assert.deepEqual(view('flag'), ['No tag yet: c', '☆ Interesting: b', 'Plan for later: ']);
assert.deepEqual(view('none'), ['All cases: abcd']);
// sorts
assert.deepEqual(sortCases(rows, 'initials', ctx).map(c => c.id), ['b', 'a', 'c', 'd'], 'A–Z, any capitals');
assert.deepEqual(sortCases(rows, 'tags', ctx).map(c => c.id), ['a', 'b', 'd', 'c'], 'most tags, then newest');
// entries: a case in two groups counts twice; the planned group is one entry
const e = entriesOf(groupCases(sortCases(rows, 'newest', ctx), 'tag', 'newest', ctx));
assert.equal(e.length, 5); assert.deepEqual(e.filter(x => x.first).map(x => x.g.label), ['LSCS', 'Spinal', 'No tag yet']);
assert.equal(entriesOf(groupCases(rows, 'flag', 'newest', ctx)).filter(x => !x.c).length, 1);
console.log('lb-group: ok');
