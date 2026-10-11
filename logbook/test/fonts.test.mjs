// Fonts (js/fonts.js): names and CSS stacks. Loading and uploads need a browser (checked in the e2e / by hand).
import assert from 'node:assert/strict';
import { FONTS, STACKS, fontStack, cleanFontName, logChoice, userFamily, FONT_TYPES, MAX_FONT_BYTES } from '../js/fonts.js';

assert.equal(FONTS[0][0], 'default');
assert.match(STACKS.default, /^"Open Sans", /);   // the default stays the font the app always had
assert.equal(fontStack('nope'), STACKS.default);
assert.equal(fontStack('atkinson'), STACKS.atkinson);
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
console.log('fonts tests passed');
