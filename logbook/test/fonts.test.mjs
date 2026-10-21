// Fonts (js/fonts.js): names and CSS stacks. Loading and uploads need a browser (checked in the e2e / by hand).
import assert from 'node:assert/strict';
import { FONTS, STACKS, fontStack, cleanFontName, logChoice, userFamily, FONT_TYPES, MAX_FONT_BYTES, THEME_FONTS, cleanFontFile, fontToFile } from '../js/fonts.js';
import { existsSync, readFileSync } from 'node:fs';

assert.equal(FONTS[0][0], 'default');
assert.match(STACKS.default, /^"Open Sans", /);   // the default stays the font the app always had
assert.equal(fontStack('nope'), STACKS.default);
assert.equal(fontStack('atkinson'), STACKS.atkinson);
assert.match(fontStack('inter'), /^"Inter", /);
assert.match(fontStack('mono'), /monospace$/);
// a typed name can't break out of the CSS
assert.equal(cleanFontName('  Calibri  Light '), 'Calibri Light');
assert.equal(cleanFontName('Evil"; } body { x'), 'Evil body x');
assert.equal(cleanFontName('x'.repeat(80)).length, 60);
assert.equal(fontStack('named', 'Calibri'), `"Calibri", ${STACKS.default}`);
assert.equal(fontStack('named', '";}'), STACKS.default);   // nothing left of it: the default
assert.equal(fontStack('file', '', 'log'), `"${userFamily('log')}", ${STACKS.default}`);
assert.notEqual(userFamily('ui'), userFamily('log'));
// the logging font follows the interface font unless set
assert.equal(logChoice({}), null);
assert.equal(logChoice({ fontLog: 'same' }), null);
assert.equal(logChoice({ fontLog: 'mono' }), 'mono');
assert.ok(FONT_TYPES.test('My Font.TTF') && FONT_TYPES.test('a.woff2') && !FONT_TYPES.test('a.zip'));
assert.equal(MAX_FONT_BYTES, 3 * 1024 * 1024);
// every bundled font has its two files, an @font-face each and its licence (theme-revamp S5: more of them)
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
for (const f of ['atkinson', 'lexend', 'inter', 'nunito', 'plex', 'sourceserif', 'jetbrains']) {
  for (const w of [400, 700]) { assert.ok(existsSync(new URL(`../fonts/${f}-${w}.woff2`, import.meta.url)), f + w); assert.ok(css.includes(`url(fonts/${f}-${w}.woff2)`), f + w + ' @font-face'); }
  assert.ok(THEME_FONTS.includes(f) && FONTS.some(([k]) => k === f), f);
}
assert.ok(!THEME_FONTS.includes('file') && !THEME_FONTS.includes('named'));
// a font file in a themes file: checked by name, size and its first bytes
const woff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, ...new Array(20).fill(0)]).buffer;
const back = cleanFontFile(fontToFile({ name: 'Fake.woff2', data: woff2 }));
assert.equal(back.name, 'Fake.woff2'); assert.equal(back.data.byteLength, 24);
assert.equal(cleanFontFile({ name: 'Fake.woff2', data: btoa('GIF89a' + 'x'.repeat(20)) }), null);
assert.equal(cleanFontFile({ name: 'Fake.woff2', data: 'not base64!' }), null);
assert.equal(cleanFontFile({ name: 'Fake.woff2', data: 'A'.repeat(5 * 1024 * 1024) }), null, 'over 3 MB');
assert.equal(cleanFontFile(null), null);
console.log('fonts tests passed');
