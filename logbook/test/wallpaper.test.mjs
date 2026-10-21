// Wallpaper, colours from it, icon tint and tab icons (theme-revamp S4: js/wallpaper.js, js/theme-engine.js): the
// pattern CSS, the dim floor that keeps text on the page at 4.5:1, the main colour of a photo, and what themes,
// saved themes and settings files may hold.
import assert from 'node:assert/strict';
import { PATTERNS, WALLPAPERS, patternCss, patternSamples, cleanWall, cleanPattern, cleanDim, dimOf, minDim, mainColour, cssHex, hexOf, textNeed, cleanInk, inkOf, scrimFor, frostAlpha, FROST } from '../js/wallpaper.js';
import { lightPalette, darkPalette, contrast, mix, DEFAULT_ACCENT } from '../js/colors.js';
import { TAB_ICONS, cleanTabIcons, tabIconPath, iconTintCss, cleanTintStrength } from '../js/theme-engine.js';
import { THEMES, THEME_KEYS, checkTheme, lookCss, themePatch, themeState, themeById, keepPhoto } from '../js/themes.js';
import { lookOf, minePatch } from '../js/my-themes.js';
import { readSettingsFile, SETTINGS_KIND } from '../js/settings-file.js';
import { DISPLAY_KEYS } from '../js/display.js';

const NEW = ['wallpaper', 'wallDim', 'iconTint', 'iconTintStrength', 'tabIcon'];
for (const k of NEW) { assert.ok(DISPLAY_KEYS.includes(k), k + ' per device'); assert.ok(THEME_KEYS.includes(k), k + ' themes may set'); }

// the choices: none first (the default), the patterns, the photo last
assert.deepEqual(WALLPAPERS.map(([k]) => k), ['none', 'dots', 'grid', 'paper', 'gradient', 'photo']);
assert.equal(cleanWall('photo'), 'photo'); assert.equal(cleanPattern('photo'), null); assert.equal(cleanWall('none'), null); assert.equal(cleanWall('url(x)'), null);
assert.equal(cleanDim(40), 40); assert.equal(cleanDim(42), null); assert.equal(cleanDim(95), null); assert.equal(cleanDim('40'), null);
assert.equal(dimOf({ wallpaper: 'photo' }), 40); assert.equal(dimOf({ wallpaper: 'dots' }), 0); assert.equal(dimOf({ wallpaper: 'photo', wallDim: 0 }), 0);

// pattern CSS: only for patterns, from the palette's own colours, never an address
assert.equal(patternCss({}), ''); assert.equal(patternCss({ wallpaper: 'photo' }), '');
for (const k of Object.keys(PATTERNS)) {
  const css = patternCss({ wallpaper: k });
  assert.match(css, /^:root \{ --wall: .*--wall-size: .*--wall-repeat: .* \}$/, k);
  assert.match(css, new RegExp(`var\\(--${PATTERNS[k].ink[0]}\\) ${PATTERNS[k].ink[1]}%`), k);
  assert.doesNotMatch(css, /url\(/, k);
  assert.match(lookCss({ wallpaper: k }), /@layer theme \{[\s\S]*--wall: /, k + ' in the theme layer');
}
assert.doesNotMatch(lookCss({ wallpaper: 'photo' }), /--wall:/, 'a photo is not in the cached look CSS');

// every pattern at its strongest keeps text at 4.5:1 with the app's own palettes (light, dark, OLED; a few colours)
const pals = [];
for (const a of [DEFAULT_ACCENT, '#2563eb', '#c2417a', '#f4c2d0', '#3f7d4e']) pals.push(['light ' + a, lightPalette(a)], ['dark ' + a, darkPalette(a)], ['oled ' + a, darkPalette(a, true)]);
for (const [name, p] of pals) {
  const pal = { bg: p.bg, ink: p.ink, muted: p.muted, accent: p.accent };
  for (const k of Object.keys(PATTERNS)) {
    for (const s of patternSamples(k, pal)) for (const t of ['ink', 'muted']) {
      assert.ok(contrast(pal[t], s) >= textNeed(contrast(pal[t], pal.bg)) - 0.05, `${k} ${t} on ${name}: ${contrast(pal[t], s).toFixed(2)}`);
    }
    assert.ok(minDim(patternSamples(k, pal), pal) <= 0.6, `${k} on ${name} still shows (links at 4.5:1 may raise the dim)`);
  }
}

assert.equal(textNeed(7), 4.5); assert.equal(textNeed(4), 3.8);
// the floor: a black photo on a light page needs a strong dim, a white one none; a white photo on a dark page needs one
const light = lightPalette(DEFAULT_ACCENT), dark = darkPalette(DEFAULT_ACCENT);
const L = { bg: '#f3f3f3', ink: light.ink, muted: light.muted, accent: light.accent }, D = { bg: dark.bg, ink: dark.ink, muted: dark.muted, accent: dark.accent };
assert.equal(minDim(['#ffffff', '#f3f3f3'], L), 0);
const fBlack = minDim(['#000000'], L);
assert.ok(fBlack >= 0.7 && fBlack < 1, 'black under a light page: ' + fBlack);
assert.ok(minDim(['#ffffff'], D) >= 0.7, 'white under a dark page');
assert.equal(minDim(['#000000'], D), 0);
// whatever it returns, every text colour reaches 4.5:1 on every sample (or matches the plain page), and one step less fails
const busy = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#7f7f7f', '#ffcc00', '#003366'];
for (const pal of [L, D]) {
  const f = minDim(busy, pal);
  for (const s of busy) for (const t of ['ink', 'muted', 'accent']) {
    assert.ok(contrast(pal[t], mix(s, pal.bg, f)) >= textNeed(contrast(pal[t], pal.bg)) - 1e-9, `${t} on ${s} at ${f}`);
  }
  if (f > 0) assert.ok(busy.some(s => ['ink', 'muted', 'accent'].some(t => contrast(pal[t], mix(s, pal.bg, f - 0.05)) < textNeed(contrast(pal[t], pal.bg)))), 'the floor is the lowest');
}
assert.equal(minDim(['#000000'], { bg: 'nope', ink: '#000000' }), 0, 'an unreadable palette: no floor');

// colours: computed values to #rrggbb; the photo's main colour
assert.equal(cssHex(' #ABC '), '#aabbcc'); assert.equal(cssHex('rgb(0, 47, 108)'), '#002f6c'); assert.equal(cssHex('var(--x)'), null);
assert.equal(hexOf(255, 0, 127.6), '#ff0080');
const sea = [...Array(60).fill('#1e6fb4'), ...Array(30).fill('#e8b04a'), ...Array(200).fill('#f5f5f5'), ...Array(100).fill('#101010')];
const main = mainColour(sea);
assert.ok(contrast(main, '#1e6fb4') < 1.1, 'the blue that covers most of it, not the greys: ' + main);
assert.equal(mainColour(['#ffffff', '#000000', '#808080', '#7a7a7a']), null, 'a grey photo has none');
assert.equal(mainColour([]), null);

// icon tint: off unless set; readable shades for light, dark and OLED; the strength
assert.equal(iconTintCss({}), ''); assert.equal(iconTintCss({ iconTint: 'red' }), '');
const tint = iconTintCss({ iconTint: '#f6e7a6', iconTintStrength: 60 });
assert.match(tint, new RegExp(`:root \\{ --icon-tint: ${lightPalette('#f6e7a6').accent}; \\}`));
assert.match(tint, new RegExp(`\\[data-oled\\] \\{ --icon-tint: ${darkPalette('#f6e7a6', true).accent}; \\}`));
assert.match(tint, /color-mix\(in srgb, var\(--icon-tint\) 60%, currentColor\)/);
assert.ok(contrast(lightPalette('#f6e7a6').accent, '#ffffff') >= 4.5, 'a pale tint is deepened for light pages');
assert.match(lookCss({ iconTint: '#c2417a' }), /@layer theme \{[\s\S]*--icon-tint/);
assert.equal(cleanTintStrength(100), 100); assert.equal(cleanTintStrength(5), null); assert.equal(cleanTintStrength(55), null);

// tab icons: known names only, tab ids as keys, sorted (so saved themes compare alike)
assert.ok(Object.keys(TAB_ICONS).length >= 12);
for (const [k, [label, d]] of Object.entries(TAB_ICONS)) { assert.ok(label && /^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/.test(d), k); }
assert.deepEqual(cleanTabIcons({ log: 'pen', logbook: 'nope', 'Bad-Key': 'pen', reflect: 'heart' }), { log: 'pen', reflect: 'heart' });
assert.deepEqual(Object.keys(cleanTabIcons({ reflect: 'heart', log: 'pen' })), ['log', 'reflect']);
assert.deepEqual(cleanTabIcons('pen'), {}); assert.deepEqual(cleanTabIcons(['pen']), {});
assert.equal(tabIconPath('log', 'M0 0', { log: 'pen' }), TAB_ICONS.pen[1]);
assert.equal(tabIconPath('log', 'M0 0', {}, ''), 'M0 0');

// themes: a pattern, tint and tab icons may be set; never a photo; every built-in theme still passes
assert.deepEqual(checkTheme({ ...themeById('soft'), id: 'walltest', look: { ...themeById('soft').look, wallpaper: 'paper', wallDim: 20, iconTint: '#3f7d4e', iconTintStrength: 70, tabIcon: { log: 'pen' } } }), []);
assert.match(checkTheme({ ...themeById('soft'), look: { wallpaper: 'photo' } }).join(), /never a photo/);
assert.match(checkTheme({ ...themeById('soft'), look: { wallDim: 33 } }).join(), /wallDim/);
assert.match(checkTheme({ ...themeById('soft'), look: { tabIcon: { log: 'rocket' } } }).join(), /tabIcon/);
assert.match(checkTheme({ ...themeById('soft'), look: { iconTint: '#FFF' } }).join(), /iconTint/);
for (const t of THEMES) assert.deepEqual(checkTheme(t), [], t.id);

// a photo is this device's: picking a theme (or a saved theme) without a wallpaper keeps it, and it isn't "Custom"
const mine = { wallpaper: 'photo', wallDim: 55 };
const patch = themePatch(themeById('soft'), mine);
assert.equal(patch.wallpaper, 'photo'); assert.equal(patch.wallDim, 55);
assert.equal(themeState({ ...patch, theme: 'soft' }).custom, false);
assert.equal(themePatch(themeById('soft'), {}).wallpaper, null);
assert.deepEqual(keepPhoto({ wallpaper: 'dots' }, mine), { wallpaper: 'dots' }, 'a theme with its own wallpaper replaces the photo');
assert.equal(minePatch({ look: {} }, mine).wallpaper, 'photo');
// saved themes and settings files: patterns only (a photo never leaves its device), cleaned values
assert.deepEqual(lookOf({ wallpaper: 'photo', wallDim: 40 }), { wallDim: 40 });
assert.deepEqual(lookOf({ wallpaper: 'grid', iconTint: '#ABCDEF', iconTintStrength: 30, tabIcon: { reflect: 'heart', log: 'nope' } }), { wallpaper: 'grid', iconTint: '#abcdef', iconTintStrength: 30, tabIcon: { reflect: 'heart' } });
const file = s => readSettingsFile(JSON.stringify({ kind: SETTINGS_KIND, settings: s })).settings;
const got = file({ wallpaper: 'photo', wallDim: 45, iconTint: 'blue', iconTintStrength: 20, tabIcon: { log: 'pen', x: 1 } });
assert.equal(got.wallpaper, null); assert.equal(got.wallDim, 45); assert.equal(got.iconTint, null); assert.equal(got.iconTintStrength, 20); assert.deepEqual(got.tabIcon, { log: 'pen' });
assert.equal(file({ wallpaper: 'dots' }).wallpaper, 'dots');

// TE S3: pattern strength, the text backing, see-through cards
{
  assert.equal(inkOf({}), 6); assert.equal(inkOf({ wallInk: 24 }), 24); assert.equal(cleanInk(7), null); assert.equal(cleanInk(42), null);
  assert.match(patternCss({ wallpaper: 'dots', wallInk: 30 }), /\) 30%/); assert.match(patternCss({ wallpaper: 'dots' }), /\) 6%/);
  const pal = { bg: light.bg, ink: light.ink, muted: light.muted, accent: light.accent };
  assert.equal(patternSamples('dots', pal, 36)[1], mix(pal.bg, pal.ink, 0.36));
  // the backing with the dim reaches the floor, and none when the dim already does
  assert.equal(scrimFor(0.5, 0.6), 0); assert.equal(scrimFor(0, 0), 0); assert.equal(scrimFor(0.9, 0), 0.9);
  for (const [f, d] of [[0.9, 0.4], [0.75, 0.15], [1, 0.3], [0.35, 0.3]]) { const s = scrimFor(f, d); assert.ok(1 - (1 - d) * (1 - s) >= f - 1e-9 && s - 0.05 < (f - d) / (1 - d), `${f} ${d}: ${s}`); }
  // see-through cards: at least 80%, more over a busy picture, every text on the card at 4.5:1
  const lp = lightPalette(DEFAULT_ACCENT), dp = darkPalette(DEFAULT_ACCENT, true);
  for (const p of [lp, dp]) {
    const cp = { bg: p.bg, panel: p.panel, ink: p.ink, muted: p.muted, accent: p.accent };
    assert.equal(frostAlpha([p.bg], 0, cp), FROST);
    for (const dim of [0, 0.4]) {
      const a = frostAlpha(busy, dim, cp);
      assert.ok(a >= FROST && a <= 1);
      for (const s of busy) for (const t of ['ink', 'muted']) assert.ok(contrast(cp[t], mix(mix(s, cp.bg, dim), cp.panel, a)) >= textNeed(contrast(cp[t], cp.panel)) - 1e-9, `${t} on ${s} under ${a}`);
    }
  }
  assert.equal(frostAlpha([], 0, { bg: '#ffffff', panel: '#ffffff' }), FROST);
}
console.log('wallpaper tests passed');
