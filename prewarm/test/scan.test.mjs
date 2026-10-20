// Scan pages: the contrast stretch and sizing (fake pixels only). node prewarm/test/scan.test.mjs
import assert from 'node:assert/strict';
import { autoLevels, fitSize, burstLabels } from '../js/scan.js';

// a dull grey "paper" (150) with a few dark "ink" pixels (60): paper goes to white, ink stays dark
const n = 1000, d = new Uint8ClampedArray(n * 4);
for (let i = 0; i < n; i++) { const v = i < 30 ? 60 : 150; d.set([v, v, v, 255], i * 4); }
const r = autoLevels(d);
assert.equal(r.changed, true);
assert.equal(d[999 * 4], 255, 'paper becomes white');
assert.ok(d[0] < 5, 'ink stays dark');
assert.equal(d[3], 255, 'alpha untouched');

// a flat image is left alone
const flat = new Uint8ClampedArray(400).fill(120);
assert.equal(autoLevels(flat).changed, false);
assert.ok(flat.every(v => v === 120));

// colour balance: one gain for all channels
const c = new Uint8ClampedArray(n * 4);
for (let i = 0; i < n; i++) c.set(i < 30 ? [50, 40, 30, 255] : [200, 160, 120, 255], i * 4);
autoLevels(c);
assert.ok(c[999 * 4] > c[999 * 4 + 1] && c[999 * 4 + 1] > c[999 * 4 + 2], 'warm tint kept in order');

assert.deepEqual(fitSize(4000, 3000), [2400, 1800]);
assert.deepEqual(fitSize(1000, 800), [1000, 800], 'never scaled up');
// a burst covers a range of page numbers in order, kept within 1-14
assert.deepEqual(burstLabels('3', '7'), ['3', '4', '5', '6', '7']);
assert.deepEqual(burstLabels(1, 14).length, 14);
assert.deepEqual(burstLabels(9, 2), ['9'], 'an end before the start: just the first page');
assert.deepEqual(burstLabels(0, 99), burstLabels(1, 14), 'kept within 1-14');
console.log('scan unit tests passed');
