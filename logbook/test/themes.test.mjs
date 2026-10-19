// Themes (js/themes.js): a theme is a bundle of look settings; changing one makes it "Custom (based on …)".
import assert from 'node:assert/strict';
import { THEMES, THEME_KEYS, TINTS, themePatch, themeState, themeLabel, bandColours, lookCss, NUH_BAND, themeById } from '../js/themes.js';
import { contrast } from '../js/colors.js';

// ids are unique, every theme only sets known keys, and every theme round-trips
assert.equal(new Set(THEMES.map(t => t.id)).size, THEMES.length);
for (const t of THEMES) {
  for (const k of Object.keys(t.look)) assert.ok(THEME_KEYS.includes(k), `${t.id}: unknown key ${k}`);
  assert.ok(t.look.round === undefined || [0, 1, 3].includes(t.look.round), `${t.id}: round is a Corners level other than the default`);
  if (t.band) { assert.equal(t.band.length, 4, t.id); for (const c of t.band) assert.match(c, /^#[0-9a-f]{6}$/, t.id); }
  const d = themePatch(t, { accent: '#123456' });
  assert.deepEqual(themeState(d), { theme: t, custom: false }, t.id);
  assert.equal(themeLabel(d), t.name);
}
// a theme resets what it doesn't set
const flat = themePatch(themeById('flat'), { compact: true, accent: '#123456' });
assert.equal(flat.compact, null);
assert.equal(flat.accent, null);
assert.equal(flat.theme, 'flat');
assert.equal(themePatch(themeById('nuhs')).theme, null);
// a kept key stays as it is (Pixel-style follows your colour)
assert.equal(themePatch(themeById('pixel'), { accent: '#123456' }).accent, '#123456');
// a change afterwards makes it custom; an off switch saved as false is still the theme
const tg = themePatch(themeById('telegram'));
assert.equal(themeLabel({ ...tg, round: 1 }), 'Custom (based on Telegram-style)');
assert.equal(themeLabel({ ...tg, compact: false }), 'Telegram-style');
assert.equal(themeLabel({}), 'NUHS');
assert.equal(themeLabel({ accent: '#123456' }), 'Custom (based on NUHS)');
// Flat's borders level is ignored once flat is on
assert.equal(themeLabel({ ...flat, borders: 2 }), 'Flat');

// the top band: NUHS keeps the usual stripe (null), others bring their own, the setting can override
assert.equal(bandColours({}), null);
assert.deepEqual(bandColours({ theme: 'whatsapp' }), themeById('whatsapp').band);
assert.deepEqual(bandColours({ theme: 'whatsapp', band: 'nuh' }), NUH_BAND);
assert.equal(bandColours({ theme: 'whatsapp', band: 'none' }), 'none');
assert.equal(bandColours({ band: 'shades' }), 'shades');

// the CSS: nothing for the default look; the band, none, tint, fonts, spacing, tabs
assert.equal(lookCss({}), '');
assert.match(lookCss({ theme: 'whatsapp' }), /--s1: #25d366; --s2: #00a884; --s3: #008069; --s4: #075e54;/);
assert.match(lookCss({ band: 'shades' }, ['#111111', '#222222', '#333333', '#444444']), /--s4: #444444/);
assert.equal(lookCss({ band: 'shades' }), '');   // no shades worked out: the usual band
assert.match(lookCss({ band: 'none' }), /\.top \{ background: var\(--panel\); \}/);
const cream = lookCss({ bgTint: 'cream' });
assert.match(cream, /:root:root:not\(\[data-theme="dark"\]\) \{ --bg: #f7f3ec;/);
assert.match(cream, /prefers-color-scheme: dark/);
assert.equal(lookCss({ bgTint: 'auto' }), '');
assert.match(lookCss({ headFont: 'serif' }), /--font-head: ui-serif/);
assert.equal(lookCss({ headFont: 'nonsense' }), '');
assert.match(lookCss({ spacing: 'roomy' }), /padding: 20px/);
assert.match(lookCss({ tabStyle: 'pill' }), /border-radius: 999px/);
assert.ok(!/[<>]/.test(lookCss({ theme: 'tiktok', bgTint: 'black', headFont: 'mono', spacing: 'tight', tabStyle: 'plain' })));

// tints that set their own text stay readable
for (const [k, t] of Object.entries(TINTS)) for (const side of ['light', 'dark']) {
  const v = t[side]; if (!v || !v.ink) continue;
  const panel = v.panel || (side === 'light' ? '#ffffff' : '#1b1e23');
  assert.ok(contrast(v.ink, panel) >= 7, `${k} ${side} ink`);
  assert.ok(contrast(v.muted, panel) >= 4.5, `${k} ${side} muted`);
  assert.ok(contrast(v.muted, v.bg) >= 4.5, `${k} ${side} muted on the page`);
}
console.log('themes tests passed');

// Card style (16 Oct 2026): one choice over flat / shadows; the line strength stays as it was
{
  const { cardStyle, cardPatch, CARD_STYLES } = await import('../js/display.js');
  assert.deepEqual(CARD_STYLES.map(([k]) => k), ['raised', 'outlined', 'flat']);
  assert.equal(cardStyle({}), 'raised', 'soft shadows by default');
  assert.equal(cardStyle({ shadows: false }), 'outlined');
  assert.equal(cardStyle({ flat: true, shadows: false, borders: 2 }), 'flat', 'Flat wins');
  for (const [k] of CARD_STYLES) assert.equal(cardStyle({ borders: 2, ...cardPatch(k) }), k, k + ' round-trips');
  assert.equal('borders' in cardPatch('flat'), false, 'Flat keeps the line strength for later');
  for (const t of THEMES) assert.ok(CARD_STYLES.some(([k]) => k === cardStyle(t.look)), t.id);
  console.log('card style: ok');
}

// App-style details (19 Oct 2026): each its own setting, nothing in the CSS until chosen
for (const [k, v, re] of [['barBlur', true, /backdrop-filter/], ['tabActiveLabel', true, /\.lbl \{ display: none/], ['tabStyle', 'indicator', /padding: 4px 18px/],
  ['listStyle', 'inset', /overflow: hidden/], ['listStyle', 'edge', /margin-left: -12px/], ['titleAlign', 'centre', /text-align: center/],
  ['switchStyle', 'ios', /#34c759/], ['switchStyle', 'material', /width: 52px/], ['pressStyle', 'highlight', /opacity: 1/], ['pressStyle', 'none', /transparent/],
  ['iconWeight', 'thin', /1\.4/], ['iconWeight', 'bold', /2\.6/], ['typeStyle', 'ios', /-0\.02em/], ['typeStyle', 'material', /font-weight: 500/]]) {
  assert.match(lookCss({ [k]: v }), re, `${k}=${v}`);
  assert.equal(lookCss({ [k]: null }), '', `${k} off`);
}
for (const k of ['barBlur', 'tabActiveLabel', 'listStyle', 'titleAlign', 'switchStyle', 'pressStyle', 'iconWeight', 'typeStyle']) assert.ok(THEME_KEYS.includes(k), k);
assert.equal(lookCss({ listStyle: 'default', switchStyle: 'default', pressStyle: 'default', iconWeight: 'default', typeStyle: 'default', titleAlign: 'default' }), '');
