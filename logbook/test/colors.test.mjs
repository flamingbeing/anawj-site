// Colour themes from one accent (js/colors.js): readable whatever is picked.
import assert from 'node:assert/strict';
import { lightPalette, darkPalette, contrast, mix, cleanAccent, PRESETS, DEFAULT_ACCENT, COLOUR_TOKENS, ROLE_TOKENS, EDIT_TOKENS, NUHS, cleanColours, colourPalette, colourChecks, checkColours, resolvePalette, paletteCss } from '../js/colors.js';

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

// NUHS (TE S4): its written-out palettes are exactly what NUHS showed before (the navy's palettes, with style.css's grey
// page, lines and rows on light pages, the NUH stripe everywhere), and picking the navy is the same as NUHS
const stripe = { s1: '#e57200', s2: '#e4002b', s3: '#178fd7', s4: '#002f6c' };
const roles = (p, light) => ({ ...p, fill: p.accent, 'on-fill': p['accent-ink'], link: p.accent, focus: light ? p.heading : p.accent });
assert.deepEqual(resolvePalette({}, 'light'), roles({ ...lightPalette(DEFAULT_ACCENT), bg: '#f3f3f3', line: '#dddddd', 'row-alt': '#f8f9fb', ok: '#1a7f37', warn: '#8a5a00', err: '#b42318', ...stripe }, true));
assert.deepEqual(resolvePalette({}, 'dark'), roles({ ...darkPalette(DEFAULT_ACCENT), ok: '#74dd90', warn: '#f3c46e', err: '#ff9a8f', ...stripe }));
assert.deepEqual(resolvePalette({}, 'oled'), roles({ ...darkPalette(DEFAULT_ACCENT, true), ok: '#74dd90', warn: '#f3c46e', err: '#ff9a8f', ...stripe }));
for (const a of ['light', 'dark', 'oled']) {
  assert.deepEqual(resolvePalette({ accent: DEFAULT_ACCENT }, a), resolvePalette({}, a), 'the navy is NUHS ' + a);
  assert.deepEqual(Object.keys(NUHS[a]).sort(), Object.keys(a === 'light' ? lightPalette('#2563eb') : darkPalette('#2563eb')).concat('ok', 'warn', 'err').sort(), 'NUHS is as complete as a made palette ' + a);
}
// another colour: its own palettes, nothing kept from NUHS
assert.equal(resolvePalette({ accent: '#2563eb' }).bg, lightPalette('#2563eb').bg);
assert.equal(resolvePalette({ accent: '#2563eb' }, 'oled').accent, darkPalette('#2563eb', true).accent);
// the colours made from the accent follow the final accent and card: a dark accent of its own on a dark panel of its own
const own = resolvePalette({ accent: '#2563eb', colours: { dark: { accent: '#ffcc00', panel: '#223344' } } }, 'dark');
assert.equal(own['accent-soft'], mix('#223344', '#ffcc00', 0.2));
assert.equal(own.chip, mix('#223344', '#ffcc00', 0.12));
for (const k of ['chip-on', 'info', 'heading', 'fill', 'link', 'focus']) assert.equal(own[k], '#ffcc00', k);
assert.equal(resolvePalette({ accent: '#2563eb', colours: { light: { panel: '#fffdf9' } } }).chip, mix(lightPalette('#2563eb').accent, '#fffdf9', 0.92));
// a tint changes light and dark, never OLED; the light tint never reaches a dark page (auto with a dark phone)
const white = { light: { bg: '#ffffff', line: '#e3e3e3' }, dark: { bg: '#111111', panel: '#191919' } };
assert.equal(resolvePalette({}, 'light', white).line, '#e3e3e3');
assert.equal(resolvePalette({}, 'dark', white).line, NUHS.dark.line);
assert.equal(resolvePalette({}, 'oled', white).bg, '#000000');
// roles: a vivid green fill with black words next to a dark green link, in light, dark and OLED
const green = { accent: '#0b5d1e', colours: { light: { fill: '#22c55e', onFill: '#000000', link: '#0b5d1e' }, dark: { fill: '#22c55e', onFill: '#000000', link: '#86efac' } } };
for (const a of ['light', 'dark', 'oled']) {
  const p = resolvePalette(green, a);
  assert.equal(p.fill, '#22c55e'); assert.equal(p['on-fill'], '#000000');
  assert.ok(contrast(p['on-fill'], p.fill) >= 4.5 && contrast(p.link, p.panel) >= 4.5, a);
  assert.notEqual(p.fill, p.link);
}
assert.doesNotThrow(() => checkColours(green));
assert.ok(colourChecks(green).some(p => p.fg === 'link' && p.bg === 'panel'), 'a set role is checked');
assert.equal(colourChecks({ colours: { light: { bg: '#ffffff' } } }).length, 10, 'roles not set: the same ten checks');
assert.throws(() => checkColours({ colours: { light: { fill: '#22c55e', onFill: '#ffffff' } } }), /Light onFill on fill: 2\.\d+:1 \(needs 4\.5:1\)/);
assert.throws(() => checkColours({ colours: { light: { focus: '#f3f3f3' } } }), /Light focus on bg: 1\.00:1 \(needs 3:1\)/);
assert.throws(() => checkColours({ colours: { dark: { selection: '#eeeeee' } } }), /Dark ink on selection/);
// the CSS: complete in every appearance, the selection rule only when a look sets one
const pc = paletteCss({});
for (const sel of [':root {', ':root[data-theme="dark"] {', ':root[data-theme="dark"][data-oled] {', ':root[data-theme="auto"] {']) assert.ok(pc.includes(sel), sel);
assert.doesNotMatch(pc, /undefined|selection/);
assert.equal(pc.split('\n')[0].match(/--/g).length, Object.keys(resolvePalette({})).length);
const sc = paletteCss({ colours: { light: { selection: '#cfe8ff' } } });
assert.match(sc, /::selection \{ background: var\(--selection\)/);
assert.match(sc, /:root \{[^}]*--selection: #cfe8ff;/);
assert.match(sc, new RegExp(`data-oled\\] \\{[^}]*--selection: ${NUHS.oled['accent-soft']};`), 'the other appearance: its soft accent');
assert.deepEqual(EDIT_TOKENS, [...COLOUR_TOKENS, ...ROLE_TOKENS]);

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
assert.equal(colourPalette({}, 'dark', { dark: { bg: '#112233', panel: '#223344' } }, true).panel, '#000000', 'OLED scheme takes precedence over the tint');
assert.equal(colourPalette({ colours: { dark: { panel: '#223344' } } }, 'dark', {}, true).panel, '#223344');
const css = paletteCss(look);
assert.match(css, /prefers-color-scheme: dark/);
assert.match(css, /data-oled/);
assert.match(css, /--accent-ink: #ffffff/);
assert.doesNotMatch(css, /--accentInk|--onFill|undefined/);
for (const k of EDIT_TOKENS) assert.ok(paletteCss({ colours: { dark: { [k]: '#123456' } } }).includes('#123456'), k);
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
