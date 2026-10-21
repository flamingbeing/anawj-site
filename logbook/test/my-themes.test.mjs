// Run with: node logbook/test/my-themes.test.mjs  (fake data only)
// Your themes: save the look under a name, match it again, export to a file and import it back (checked values only).
import assert from 'node:assert/strict';
import { THEMES } from '../js/themes.js';
import { lookOf, cleanMine, saveMine, minePatch, matchMine, exportText, importText, MAX_MINE, FILE_KIND, themeLink, themeFromLink, lookNow, nightRef } from '../js/my-themes.js';

// every built-in theme's look survives the checks unchanged
for (const t of THEMES) assert.deepEqual(lookOf(t.look), Object.fromEntries(Object.entries(t.look).filter(([, v]) => v != null)), t.id);
// odd values are dropped, other keys ignored
assert.deepEqual(lookOf({ accent: 'red', bgTint: 'nope', round: 99, spacing: 'roomy', theme: 'x', zoom: 2, btnStyle: 'a b<script>' }), { spacing: 'roomy' });
assert.deepEqual(lookOf({ accent: '#ABCDEF', shadows: false, flat: true }), { accent: '#abcdef', shadows: false, flat: true });

// save, replace by name, newest first, the limit
let mine = saveMine([], '  Fake   night ', { accent: '#112233', round: 0, compact: true }, 'dark', 'a1');
assert.deepEqual(mine, [{ id: 'a1', name: 'Fake night', look: { accent: '#112233', round: 0, spacing: 'compact' }, mode: 'dark' }]);   // the old Compact mode is Spacing: Tight
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

// Theme links (theme-revamp S5): every theme makes the trip unchanged; anything checkTheme rejects is dropped
const B = 'https://fake.example/logbook/';
const hashOf = l => l.slice(B.length);
for (const t of THEMES) assert.deepEqual(themeFromLink(hashOf(themeLink(B, t))).look, lookOf(t.look), t.id);
const link = themeLink(B, { name: 'Fake <i>shift</i>', look: { accent: '#112233', spacing: 'roomy', fontUi: 'nunito' }, mode: 'dark' });
assert.ok(link.startsWith(B + '#theme=') && /^[A-Za-z0-9_=#-]+$/.test(hashOf(link)), 'URL-safe');
assert.deepEqual(themeFromLink(hashOf(link)), { name: 'Fake ishift/i', look: { accent: '#112233', spacing: 'roomy', fontUi: 'nunito' }, mode: 'dark' });
assert.equal(themeFromLink('#themes'), null); assert.equal(themeFromLink(''), null);
const enc = o => '#theme=' + Buffer.from(JSON.stringify(o)).toString('base64url');
// bad values from a stranger's link: dropped, the rest kept
const got = themeFromLink(enc({ v: 1, n: 'Fake', m: 'neon', l: { accent: 'url(x)', fontUi: 'file', fontLog: 'named', headFont: 'comic', spacing: 'huge', ftGap: 99,
  round: 1, wallpaper: 'photo', iconTint: 'red', tabIcon: { log: 'nope' }, customCss: 'body{}', colours: { light: { ink: '#ffffff', bg: '#ffffff' } }, bgTint: 'sepia' } }));
assert.deepEqual(got, { name: 'Fake', look: { round: 1, bgTint: 'sepia' } }, 'bad values dropped, unreadable colours too');
for (const broken of ['#theme=', '#theme=%%%', '#theme=' + 'A'.repeat(7000), enc({ v: 2, l: {} }), enc([1]), enc({ v: 1, l: 'x' }), '#theme=bm90IGpzb24'])
  assert.throws(() => themeFromLink(broken), /broken or cut short/, broken.slice(0, 30));
console.log('my-themes links: ok');

// an uploaded font travels with its theme in a file, checked on the way back in
const ttf = Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(40)]).toString('base64');
const withFont = saveMine([], 'Fake font', { fontUi: 'file', round: 1 }, null, 'f1');
const file = exportText(withFont, { f1: { ui: { name: 'Fake.ttf', data: ttf }, log: { name: 'Other.ttf', data: ttf } } });
assert.deepEqual(Object.keys(JSON.parse(file).themes[0].fonts), ['ui'], 'only the slot the theme uses');
const imp = importText(file, []);
assert.equal(imp.fonts[imp.list[0].id].ui.name, 'Fake.ttf'); assert.equal(imp.fonts[imp.list[0].id].ui.data.byteLength, 44);
const notFont = exportText(withFont, { f1: { ui: { name: 'Fake.ttf', data: Buffer.from('<html>' + 'x'.repeat(40)).toString('base64') } } });
assert.deepEqual(importText(notFont, []).fonts, {}, 'not a font: dropped, the theme kept');
assert.deepEqual(importText(exportText(withFont, { f1: { ui: { name: 'evil.exe', data: ttf } } }), []).fonts, {});
console.log('my-themes fonts in files: ok');

// Day and night: the night theme while the phone is dark, the day look otherwise
const nightMine = saveMine([], 'Fake dark', { accent: '#223344', spacing: 'roomy' }, 'dark', 'n1');
const day = { accent: '#aa0000', round: 3, myThemes: nightMine, zoom: '1.1' };
assert.equal(lookNow(day, true), day, 'no night theme: the same look');
assert.equal(lookNow({ ...day, nightTheme: 'mine:n1' }, false).accent, '#aa0000');
const night = lookNow({ ...day, nightTheme: 'mine:n1' }, true);
assert.equal(night.accent, '#223344'); assert.equal(night.round, null); assert.equal(night.zoom, '1.1', 'not a look setting: kept');
assert.equal(lookNow({ ...day, nightTheme: 'obsidian' }, true).theme, 'obsidian');
assert.equal(nightRef({ ...day, nightTheme: 'mine:gone' }), null, 'a deleted theme: no night theme');
assert.equal(nightRef({ nightTheme: 'nope' }), null);
console.log('my-themes day and night: ok');
