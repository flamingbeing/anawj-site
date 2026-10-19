// Run with: node logbook/test/my-themes.test.mjs  (fake data only)
// Your themes: save the look under a name, match it again, export to a file and import it back (checked values only).
import assert from 'node:assert/strict';
import { THEMES } from '../js/themes.js';
import { lookOf, cleanMine, saveMine, minePatch, matchMine, exportText, importText, MAX_MINE, FILE_KIND } from '../js/my-themes.js';

// every built-in theme's look survives the checks unchanged
for (const t of THEMES) assert.deepEqual(lookOf(t.look), Object.fromEntries(Object.entries(t.look).filter(([, v]) => v != null)), t.id);
// odd values are dropped, other keys ignored
assert.deepEqual(lookOf({ accent: 'red', bgTint: 'nope', round: 99, spacing: 'roomy', theme: 'x', zoom: 2, btnStyle: 'a b<script>' }), { spacing: 'roomy' });
assert.deepEqual(lookOf({ accent: '#ABCDEF', shadows: false, flat: true }), { accent: '#abcdef', shadows: false, flat: true });

// save, replace by name, newest first, the limit
let mine = saveMine([], '  Fake   night ', { accent: '#112233', round: 0, compact: true }, 'dark', 'a1');
assert.deepEqual(mine, [{ id: 'a1', name: 'Fake night', look: { accent: '#112233', round: 0, compact: true }, mode: 'dark' }]);
mine = saveMine(mine, 'Fake day', { spacing: 'roomy' }, null, 'b2');
mine = saveMine(mine, 'fake NIGHT', { round: 3 }, null, 'c3');
assert.deepEqual(mine.map(t => t.name), ['fake NIGHT', 'Fake day'], 'same name (any capitals) replaced');
assert.throws(() => saveMine(mine, '  ', {}), /name/);
const full = Array.from({ length: MAX_MINE }, (_, i) => ({ id: 'x' + i, name: 'Fake ' + i, look: {} }));
assert.throws(() => saveMine(full, 'One more', {}), /Up to/);
assert.equal(saveMine(full, 'Fake 3', { round: 1 }).length, MAX_MINE, 'replacing one is fine when full');

// applying one: every look key set or cleared, the theme back to none
const patch = minePatch(mine[0]);
assert.equal(patch.round, 3); assert.equal(patch.accent, null); assert.equal(patch.theme, null);
assert.equal(matchMine(mine, { round: 3, zoom: '1.2' }).name, 'fake NIGHT', 'other settings don’t matter');
assert.equal(matchMine(mine, { round: 2 }), null);

// export and import
const text = exportText(mine);
assert.equal(JSON.parse(text).kind, FILE_KIND); assert.ok(!text.includes('"id"'), 'ids stay on the device');
const back = importText(text, [{ id: 'z', name: 'Fake day', look: { round: 0 } }, { id: 'y', name: 'Fake other', look: {} }]);
assert.equal(back.added, 2);
assert.deepEqual(back.list.map(t => t.name), ['fake NIGHT', 'Fake day', 'Fake other']);
assert.deepEqual(back.list[1].look, { spacing: 'roomy' }, 'the file’s version replaces one with the same name');
assert.throws(() => importText('not json', []), /isn’t a themes file/);
assert.throws(() => importText(JSON.stringify({ kind: 'other', themes: [] }), []), /No themes/);
const odd = importText(JSON.stringify({ kind: FILE_KIND, themes: [{ name: 'Fake <b>x</b>', look: { accent: 'javascript:1', round: 2 } }] }), []).list[0];
assert.equal(odd.name, 'Fake bx/b'); assert.deepEqual(odd.look, { round: 2 }, 'unsafe values dropped');
assert.equal(cleanMine([{ name: 'A' }, { name: 'a' }, null, { name: '' }]).length, 1);
console.log('my-themes: ok');

// Colour tokens round-trip without retaining unknown keys or non-hex CSS.
const colours = { light: { bg: '#ffffff', ink: '#112233', accentInk: '#ffffff' }, dark: { line: '#556677' } };
const saved = saveMine([], 'Fake palette', { colours }, 'auto', 'p1');
assert.deepEqual(saved[0].look.colours, colours);
assert.deepEqual(importText(exportText(saved), []).list[0].look.colours, colours);
assert.deepEqual(minePatch(saved[0]).colours, colours);
assert.equal(matchMine(saved, { colours: { dark: colours.dark, light: { ink: '#112233', bg: '#ffffff', accentInk: '#ffffff' } } }).name, 'Fake palette');
assert.deepEqual(lookOf({ colours: { light: { bg: '#FFFFFF', extra: '#123456', panel: 'red' }, unknown: {} } }), { colours: { light: { bg: '#ffffff' } } });
assert.deepEqual(lookOf({ colours: { light: { bg: '#fff' } } }), {});
const oldFile = JSON.stringify({ kind: FILE_KIND, version: 1, themes: [{ name: 'Fake legacy', look: { accent: '#123456', bgTint: 'cream' } }] });
assert.deepEqual(importText(oldFile, []).list[0].look, { accent: '#123456', bgTint: 'cream' });
const bad = { colours: { light: { ink: '#ffffff' } } };
assert.throws(() => saveMine([], 'Fake bad', bad), /Light ink on bg/);
assert.throws(() => importText(JSON.stringify({ kind: FILE_KIND, version: 1, themes: [{ name: 'Fake bad', look: bad }] }), []), /Light ink on bg/);
console.log('my-themes colours: ok');
