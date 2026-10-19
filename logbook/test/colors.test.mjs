// Colour themes from one accent (js/colors.js): readable whatever is picked.
import assert from 'node:assert/strict';
import { lightPalette, darkPalette, contrast, schemeCss, cleanAccent, PRESETS, DEFAULT_ACCENT, COLOUR_TOKENS, cleanColours, coloursCss, colourPalette, colourChecks, checkColours } from '../js/colors.js';

assert.ok(contrast('#000000', '#ffffff') > 20.9);
assert.equal(cleanAccent('#ABCDEF'), '#abcdef');
assert.equal(cleanAccent('red'), null);

// every preset, plus awkward picks (pale yellow, pure white, pure black, mid grey, neon green)
for (const c of [...PRESETS.map(p => p[0]), '#fff176', '#ffffff', '#000000', '#808080', '#39ff14']) {
  const L = lightPalette(c), D = darkPalette(c), O = darkPalette(c, true);
  assert.ok(contrast(L.accent, '#ffffff') >= 4.5, `light accent ${c}`);
  assert.ok(contrast(L.ink, L.panel) >= 7, `light ink ${c}`);
  assert.ok(contrast(L.muted, L.panel) >= 4.5, `light muted ${c}`);
  for (const P of [D, O]) {
    assert.ok(contrast(P.accent, P.panel) >= 7 || P.accent === '#ffffff', `dark accent ${c}`);
    assert.ok(contrast(P['accent-ink'], P.accent) >= 7, `dark button text ${c}`);
    assert.ok(contrast(P.ink, P.panel) >= 12, `dark ink ${c}`);
    assert.ok(contrast(P.muted, P.panel) >= 7, `dark muted ${c}`);
    assert.ok(contrast(P.ink, P.chip) >= 10, `dark chip text ${c}`);
  }
  assert.equal(O.bg, '#000000');
}
// navy stays navy in light mode
assert.equal(lightPalette(DEFAULT_ACCENT).accent, DEFAULT_ACCENT);
assert.match(schemeCss('#2563eb'), /:root:root\[data-theme="dark"\]\[data-oled\]/);
assert.doesNotMatch(schemeCss(DEFAULT_ACCENT).split('\n')[0], /--s1/);   // the NUHS stripe stays for Default

console.log('colour tests passed');

// Partial palettes are sanitised, independent and keep the accent/tint fallback.
assert.deepEqual(cleanColours({ light: { bg: '#ABCDEF', ink: 'red', evil: '#123456', accentInk: '#FFFFFF' }, dark: [], other: { bg: '#ffffff' } }), { light: { bg: '#abcdef', accentInk: '#ffffff' } });
for (const value of [null, [], 'red', { light: null }, { light: { bg: '#fff', panel: 'url(x)', ink: ['#ffffff'] } }]) assert.deepEqual(cleanColours(value), {});
const look = { accent: '#2563eb', colours: { light: { bg: '#ffffff', accentInk: '#ffffff' }, dark: { line: '#556677' } } };
assert.equal(colourPalette(look).bg, '#ffffff');
assert.equal(colourPalette(look).accent, lightPalette(look.accent).accent);
assert.equal(colourPalette(look, 'dark').line, '#556677');
assert.equal(colourPalette({}, 'light', { light: { panel: '#fffdf9' } }).panel, '#fffdf9');
assert.equal(colourPalette({}, 'dark', {}, true).bg, '#000000');
assert.equal(coloursCss({}), '');
const css = coloursCss(look.colours);
assert.match(css, /prefers-color-scheme: light/);
assert.match(css, /prefers-color-scheme: dark/);
assert.match(css, /data-oled/);
assert.match(css, /--accent-ink: #ffffff/);
assert.doesNotMatch(css, /--accentInk|undefined/);
for (const k of COLOUR_TOKENS) assert.ok(coloursCss({ dark: { [k]: '#123456' } }).includes('#123456'));
assert.equal(colourChecks(look).length, 10);
assert.doesNotThrow(() => checkColours(look));
assert.throws(() => checkColours({ colours: { light: { ink: '#ffffff' } } }), /Light ink on bg: 1\.\d+:1/);
assert.throws(() => checkColours({ colours: { dark: { accentInk: '#ffffff', accent: '#ffffff' } } }), /Dark accentInk on accent: 1\.00:1/);
assert.throws(() => checkColours({ colours: { light: { muted: '#ffffff' } } }), /muted on bg/);
// Legacy looks without overrides still import unchanged; edited palettes check every text pair.
const legacyTint = { dark: { muted: '#71767b', bg: '#000000', panel: '#121212' } };
assert.doesNotThrow(() => checkColours({}, legacyTint));
assert.throws(() => checkColours({ colours: { dark: { line: '#556677' } } }, legacyTint), /Dark muted on panel/);
console.log('full colour tokens: ok');
