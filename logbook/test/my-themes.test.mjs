// Run with: node logbook/test/my-themes.test.mjs  (fake data only)
// Your themes: save the look under a name, match it again, export to a file and import it back (checked values only).
import assert from 'node:assert/strict';
import { THEMES } from '../js/themes.js';
import { TAB_ICONS } from '../js/theme-engine.js';
import { lookOf, cleanMine, saveMine, minePatch, matchMine, exportText, importText, MAX_MINE, FILE_KIND, themeLink, themeFromLink, LINK_KEYS, LINK_TABS, LINK_ICONS, KNOWN3, lookNow, nightRef } from '../js/my-themes.js';
import { GRID, snap } from '../js/colour-grid.js';
import { lookField } from '../js/look-schema.js';

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

// Theme links (theme-revamp S5; format 2, 21 Oct 2026): every theme makes the trip unchanged; anything checkTheme
// rejects is dropped
const B = 'https://fake.example/logbook/';
const hashOf = l => l.slice(B.length);
for (const t of THEMES) assert.deepEqual(themeFromLink(hashOf(themeLink(B, t))), { name: t.name, look: lookOf(t.look) }, t.id);
const link = themeLink(B, { name: 'Fake <i>shift</i>', look: { accent: '#112233', spacing: 'roomy', fontUi: 'nunito' }, mode: 'dark' });
assert.ok(link.startsWith(B + '#t=') && /^[A-Za-z0-9_=#-]+$/.test(hashOf(link)), 'URL-safe');
// short: a bundled theme is its id (a few characters), a fully custom one fits a small QR code
for (const t of THEMES) assert.ok(hashOf(themeLink(B, t)).length <= 32, t.id + ' ' + hashOf(themeLink(B, t)));
const custom = { name: 'Fake fully custom', mode: 'auto', look: { ...THEMES[0].look, accent: '#123456', round: 3, ftGap: 6, ftLetter: -0.02, wallpaper: 'dots', tabIcon: { log: Object.keys(TAB_ICONS)[0] },
  colours: { light: { bg: '#fafafa', panel: '#ffffff', ink: '#101418', muted: '#4a5560', line: '#d0d6dc', accent: '#123456', accentInk: '#ffffff' },
    dark: { bg: '#0b0e12', panel: '#161b22', ink: '#f0f3f6', muted: '#a8b3bf', line: '#2c333c', accent: '#7fb2ff', accentInk: '#000000' } } } };
const customLink = themeLink(B, custom);
assert.deepEqual(themeFromLink(hashOf(customLink)), { name: custom.name, mode: 'auto', look: lookOf(custom.look) });
assert.ok(hashOf(customLink).length < 115, 'custom: ' + hashOf(customLink).length);
// format 3 (TE S2): colours picked in the app (snapped) make a fully custom theme about 120 characters with the address
const snapAll = look => ({ ...look, accent: snap(look.accent), colours: Object.fromEntries(Object.entries(look.colours).map(([s, t]) => [s, Object.fromEntries(Object.entries(t).map(([k, c]) => [k, snap(c)]))])) });
const snappedLink = themeLink('https://apmes.anawj.com/logbook/', { ...custom, name: 'Night shift', look: snapAll(custom.look) });
assert.ok(snappedLink.length <= 120, 'snapped: ' + snappedLink.length);
assert.deepEqual(themeFromLink(snappedLink.split('/logbook/')[1]).look, lookOf(snapAll(custom.look)), 'snapped colours arrive exactly');
const gridLook = { accent: GRID[70].c, colours: { light: { bg: GRID[97].c, ink: GRID[103].c }, dark: { bg: GRID[103].c, accent: GRID[41].c } } };
assert.deepEqual(themeFromLink(hashOf(themeLink(B, { name: 'Fake', look: gridLook }))).look, lookOf(gridLook));
assert.deepEqual(themeFromLink(hashOf(link)), { name: 'Fake ishift/i', look: { accent: '#112233', spacing: 'roomy', fontUi: 'nunito' }, mode: 'dark' });
// a bundled theme changed a little is written out in full, not as the theme plus changes, so editing that theme later
// never changes what an old link shows
assert.deepEqual(themeFromLink(hashOf(themeLink(B, { name: 'Fake', look: { ...lookOf(THEMES[1].look), round: 3 } }))).look, { ...lookOf(THEMES[1].look), round: 3 });
// settings added later (TE S3: pattern strength, see-through cards) travel too, and older places don't move
assert.deepEqual(themeFromLink(hashOf(themeLink(B, { name: 'Fake', look: { accent: '#112233', wallpaper: 'dots', wallInk: 24, wallFrost: true } }))).look, { accent: '#112233', wallpaper: 'dots', wallInk: 24, wallFrost: true });
// links never go stale: the lists only grow at the end (test/fixtures/theme-links.json), and links made with them
// still open as they did
const { readFileSync } = await import('node:fs');
const fx = JSON.parse(readFileSync(new URL('./fixtures/theme-links.json', import.meta.url), 'utf8'));
assert.deepEqual(LINK_KEYS.slice(0, fx.keys.length), fx.keys, 'LINK_KEYS: add new settings at the end only');
for (const [k, was] of Object.entries(fx.lists)) {
  const f = lookField(k);
  if (Array.isArray(was)) assert.deepEqual(f.values.slice(0, was.length), was, `${k}: add new choices at the end only`);
  else assert.deepEqual({ min: f.min, step: f.step }, was, `${k}: keep its lowest value and step`);
}
assert.equal(KNOWN3, fx.format3.known);
assert.deepEqual(LINK_KEYS.slice(0, KNOWN3).map(k => (k.includes('.') ? 'colour' : lookField(k).kind)), fx.format3.kinds, 'format 3: the first settings keep their kind');
assert.deepEqual(GRID.map(x => x.c).slice(0, fx.format3.grid.length), fx.format3.grid, 'colour grid: add cells at the end only');
assert.deepEqual(LINK_TABS.slice(0, fx.format3.tabs.length), fx.format3.tabs, 'LINK_TABS: add at the end only');
assert.deepEqual(LINK_ICONS.slice(0, fx.format3.icons.length), fx.format3.icons, 'tab icons: add at the end only');
assert.ok(fx.links.some(l => l.format === 3) && fx.links.some(l => !l.format), 'fixtures of both formats');
for (const l of fx.links) assert.deepEqual(themeFromLink('#t=' + l.link), { name: l.name, look: l.look, ...(l.mode ? { mode: l.mode } : {}) }, l.link);
// a setting or a value this phone doesn't know (a link from a newer app) is skipped, the rest kept
const bitsLink = write => {
  const w = []; const put = (v, n) => { for (let i = n - 1; i >= 0; i--) w.push(Math.floor(v / 2 ** i) % 2); };
  const num = v => { do { put(v > 15 ? 1 : 0, 1); put(v % 16, 4); v = Math.floor(v / 16); } while (v > 0); };
  const text = s => { num(s.length); for (const c of s) put(c.charCodeAt(0), 8); };
  write(put, num, text);
  return '#t=' + Buffer.from(Uint8Array.from({ length: Math.ceil(w.length / 8) }, (_, i) => w.slice(i * 8, i * 8 + 8).reduce((a, x, j) => a | (x << (7 - j)), 0))).toString('base64url');
};
assert.deepEqual(themeFromLink(bitsLink((put, num, text) => {
  put(2, 2); put(0, 3); put(0, 1); text('Fake'); num(3);
  num(500); put(0, 2); num(7);   // an unknown setting
  num(LINK_KEYS.indexOf('spacing')); put(0, 2); num(90);   // an unknown choice
  num(LINK_KEYS.indexOf('round')); put(0, 2); num(1);
})), { name: 'Fake', look: { round: 1 } });
// format 3 too: a setting past KNOWN3 says its kind, so one this phone doesn't know is skipped
assert.deepEqual(themeFromLink(bitsLink((put, num, text) => {
  put(3, 2); put(0, 1); put(0, 3); put(0, 1); put(1, 1); num(4); for (const c of 'Fake') put(' abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-'.indexOf(c), 6); num(2);
  num(LINK_KEYS.indexOf('round')); num(1);
  num(500); put(1, 2); put(0, 1); put(0, 18);   // an unknown colour setting
})), { name: 'Fake', look: { round: 1 } });
assert.throws(() => themeFromLink(bitsLink(put => { put(3, 2); put(1, 1); put(0, 8); })), /newer version/);
// format 1 links (and the JSON #theme= ones before them) ask for a new one; a theme this app doesn't have says so
const old = Buffer.from(hashOf(link).slice(3), 'base64url'); old[0] = (old[0] & 0x3f) | 0x40;
assert.throws(() => themeFromLink('#t=' + old.toString('base64url')), /older version/);
assert.throws(() => themeFromLink('#theme=' + Buffer.from(JSON.stringify({ v: 1, n: 'Fake', l: {} })).toString('base64url')), /older version/);
assert.throws(() => themeFromLink(bitsLink((put, num, text) => { put(2, 2); put(0, 3); put(1, 1); text('nosuchtheme'); })), /isn’t in this version/);
assert.equal(themeFromLink('#themes'), null); assert.equal(themeFromLink(''), null);
for (const broken of ['#t=', '#t=%%%', '#t=gA', hashOf(customLink).slice(0, 40), '#t=' + 'A'.repeat(3000)])
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
