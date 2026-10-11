// Colour themes from one accent (js/colors.js): readable whatever is picked.
import assert from 'node:assert/strict';
import { lightPalette, darkPalette, contrast, schemeCss, cleanAccent, PRESETS, DEFAULT_ACCENT } from '../js/colors.js';

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
