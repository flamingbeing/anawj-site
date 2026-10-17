// Run with: node logbook/test/paging.test.mjs  (fake data only)
import assert from 'node:assert/strict';
import { pagesOf, pageSize, clampPage, PAGE_SIZES } from '../js/paging.js';

assert.equal(pageSize(undefined), 100); assert.equal(pageSize(null), 100, 'unset is not All'); assert.equal(pageSize(''), 100); assert.equal(pageSize('50'), 50); assert.equal(pageSize(0), 0); assert.equal(pageSize(7), 100);
assert.deepEqual(PAGE_SIZES, [25, 50, 100, 300, 0]);
const rows = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${String(10 - i).padStart(2, '0')}` }));
rows.push({ date: null });
const p = pagesOf(rows, 3);
assert.equal(p.length, 3);
assert.deepEqual(p[0], { start: 0, end: 3, from: '2026-10-10', to: '2026-10-08' });
assert.deepEqual(p[2], { start: 6, end: 8, from: '2026-10-04', to: '2026-10-04' }, 'an undated case does not count for the dates');
assert.equal(pagesOf(rows, 0).length, 1, 'All: one page');
assert.deepEqual(pagesOf(rows, 0)[0].end, 8);
assert.deepEqual(pagesOf([], 100), [{ start: 0, end: 0, from: '', to: '' }], 'no rows: one empty page');
assert.equal(clampPage(5, 3), 2); assert.equal(clampPage(-1, 3), 0); assert.equal(clampPage('x', 3), 0);
console.log('paging: ok');
