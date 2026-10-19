// Themes (Settings → Themes; owner, 15 Oct 2026): a theme is a bundle of this device's look settings (display.js),
// set in one tap; every setting stays editable afterwards, and the page then says "Custom (based on …)". Classic
// themes are cards; Inspired ones (the look of other apps: colours, corners and type only, never their logos or
// fonts) sit in a searchable list. Pure, unit-tested; the CSS for the new look settings (background tint, spacing,
// tab bar style, heading font, the top band) is made here too, cached for the first paint (index.html).

import { coloursCss, checkColours } from './colors.js';
import { STACKS } from './fonts.js';
import { FACETS, FACET_KEYS, facetCss, cleanFacet } from './theme-engine.js';

// the display keys a theme sets; anything a theme doesn't list goes back to its default (null), unless it keeps it
export const THEME_KEYS = ['colours', 'accent', 'colourful', 'borders', 'flat', 'round', 'shadows', 'fontUi', 'fontLog', 'headFont', 'lineHeight',
  'compact', 'btnStyle', 'iconBtns', 'tabIcons', 'pageTitles', 'calPlain', 'rowShort', 'navStyle', 'rowLayout', 'formLayout', 'contrast', 'bgTint', 'band',
  ...FACET_KEYS];   // the theme engine's facets (theme-engine.js): spacing, tab style, header, icons, motion, pop-ups, controls…

// Background tints: the page ground (and for some the cards and text) in light and dark
export const TINTS = {
  auto: { label: 'From the colour (default)' },
  white: { label: 'White', light: { bg: '#ffffff', line: '#e3e3e3' }, dark: { bg: '#111111', panel: '#191919' } },
  grey: { label: 'Light grey', light: { bg: '#f3f2f1' }, dark: { bg: '#161616', panel: '#202020' } },
  cream: { label: 'Cream', light: { bg: '#f7f3ec', panel: '#fffdf9', line: '#e6dfd3' }, dark: { bg: '#1b1916', panel: '#24211d', line: '#3a352e' } },
  sepia: { label: 'Sepia (eye comfort)', light: { bg: '#efe6d2', panel: '#faf4e6', ink: '#3b352c', muted: '#6b6152', line: '#ddd1b8' }, dark: { bg: '#1d1915', panel: '#26211b', ink: '#e8dfcf', muted: '#b5a993', line: '#3d362c' } },
  beige: { label: 'Beige', light: { bg: '#efeae2', line: '#ddd6cb' }, dark: { bg: '#0b141a', panel: '#111b21', line: '#26343d' } },
  bluegrey: { label: 'Blue-grey', light: { bg: '#e7ebf0', line: '#d5dce4' }, dark: { bg: '#0e1621', panel: '#17212b', line: '#2b3846' } },
  iosgrey: { label: 'Grouped grey', light: { bg: '#f2f2f7', line: '#d8d8dc' }, dark: { bg: '#000000', panel: '#1c1c1e', line: '#38383a' } },
  graphite: { label: 'Graphite', light: { bg: '#f2f2f2' }, dark: { bg: '#1e1e1e', panel: '#262626', line: '#363636' } },
  navy: { label: 'Navy night', light: { bg: '#eef2f8' }, dark: { bg: '#0a1628', panel: '#10223b', line: '#22385a' } },
  obsidian: { label: 'Obsidian-style', light: { bg: '#ffffff', panel: '#f6f6f6', line: '#e3e3e3' }, dark: { bg: '#1e1e1e', panel: '#262626', line: '#363636' } },
  notion: { label: 'Notion-style', light: { bg: '#ffffff', panel: '#ffffff', ink: '#37352f', muted: '#6b6a67', line: '#e9e9e7' }, dark: { bg: '#191919', panel: '#252525', ink: '#ebebea', muted: '#9b9b9b', line: '#373737' } },
  instagram: { label: 'Instagram-style', light: { bg: '#ffffff', panel: '#ffffff', ink: '#262626', muted: '#737373', line: '#dbdbdb' }, dark: { bg: '#000000', panel: '#121212', ink: '#f5f5f5', muted: '#a8a8a8', line: '#262626' } },
  xblack: { label: 'X-style', light: { bg: '#ffffff', panel: '#ffffff', ink: '#0f1419', muted: '#536471', line: '#eff3f4' }, dark: { bg: '#000000', panel: '#000000', ink: '#e7e9ea', muted: '#71767b', line: '#2f3336' } },
  spotify: { label: 'Spotify-style', light: { bg: '#ffffff', panel: '#f6f6f6', line: '#e5e5e5' }, dark: { bg: '#121212', panel: '#1f1f1f', ink: '#ffffff', muted: '#b3b3b3', line: '#2a2a2a' } },
  youtube: { label: 'YouTube-style', light: { bg: '#ffffff', panel: '#ffffff', ink: '#0f0f0f', muted: '#606060', line: '#e5e5e5' }, dark: { bg: '#0f0f0f', panel: '#212121', ink: '#f1f1f1', muted: '#aaaaaa', line: '#303030' } },
  gmail: { label: 'Gmail-style', light: { bg: '#f6f8fc', panel: '#ffffff', ink: '#202124', muted: '#5f6368', line: '#dadce0' }, dark: { bg: '#131314', panel: '#1e1f20', ink: '#e3e3e3', muted: '#c4c7c5', line: '#444746' } },
  materialgrey: { label: 'Material grey', light: { bg: '#fafafa', panel: '#ffffff', line: '#e0e0e0' }, dark: { bg: '#121212', panel: '#1e1e1e', line: '#333333' } },
  tiktok: { label: 'TikTok-style', light: { bg: '#ffffff', panel: '#ffffff', ink: '#161823', muted: '#6a6b7e', line: '#e3e3e4' }, dark: { bg: '#000000', panel: '#121212', ink: '#ffffff', muted: '#a6a6ab', line: '#2f2f2f' } },
  black: { label: 'Black', light: { bg: '#f4f4f4' }, dark: { bg: '#000000', panel: '#121212', line: '#2a2a2a' } },
};
export const BANDS = [['theme', 'The theme’s colours (default)'], ['shades', 'Shades of my colour'], ['nuh', 'The NUH stripe'], ['none', 'None']];
export const HEAD_FONTS = [['same', 'Same as the interface (default)'], ['serif', 'Serif'], ['system', 'This device’s font'], ['inter', 'Inter'], ['lexend', 'Lexend'], ['atkinson', 'Atkinson Hyperlegible'], ['mono', 'Monospace']];
export const NUH_BAND = ['#e57200', '#e4002b', '#178fd7', '#002f6c'];

// round is a Corners level (0 square … 3 very round; 2, the default, is left out). group: classic | inspired. look: the keys it sets (the rest go back to their defaults). keep: keys it leaves as
// they are (Pixel-style follows your colour). themes never change light, dark or auto (the Light or dark setting is the user's); band: four colours for
// the top band (none: the usual behaviour, NUH with the default colour, shades of another)
export const THEMES = [
  { id: 'nuhs', name: 'NUHS', group: 'classic', desc: 'The default: navy, the NUH stripe, soft cards', look: {} },
  { id: 'flat', name: 'Flat', group: 'classic', desc: 'No lines, no cards, tinted buttons', look: { flat: true, borders: 0, shadows: false, round: 1, btnStyle: 'tinted' } },
  { id: 'soft', name: 'Soft', group: 'classic', desc: 'Very round, roomy, gentle grey', look: { round: 3, bgTint: 'grey', btnStyle: 'tinted', spacing: 'roomy', tabStyle: 'pill' } },
  { id: 'paper', name: 'Paper', group: 'classic', desc: 'Cream pages, serif headings, fine lines', look: { bgTint: 'cream', shadows: false, borders: 2, round: 1, headFont: 'serif', accent: '#5b4636' }, band: ['#d9c7a7', '#b89d74', '#8c6f4c', '#5b4636'] },
  { id: 'darknavy', name: 'Navy', group: 'classic', desc: 'Deep navy in dark mode', look: { bgTint: 'navy', accent: '#4a7fd0', shadows: false, borders: 3 } },
  { id: 'oled', name: 'OLED', group: 'classic', desc: 'Pure black in dark mode, saves battery', look: { bgTint: 'black', shadows: false, borders: 2 } },
  { id: 'contrast', name: 'High contrast', group: 'classic', desc: 'Strong lines, clear type', look: { contrast: 'high', shadows: false, fontUi: 'atkinson', btnStyle: 'filled' } },
  { id: 'eye', name: 'Eye comfort', group: 'classic', desc: 'Warm sepia, soft text, less blue', look: { bgTint: 'sepia', accent: '#8a6a4a', lineHeight: '1.15', shadows: false, borders: 3 }, band: ['#e3cfa8', '#c9a77a', '#a7845b', '#8a6a4a'] },
  { id: 'obsidian', name: 'Obsidian-style', group: 'inspired', desc: 'White or dark grey, violet, compact', look: { accent: '#7f6df2', bgTint: 'obsidian', compact: true, shadows: false, borders: 2, round: 1, fontUi: 'inter', typeStyle: 'material', pressStyle: 'highlight' }, band: ['#262626', '#363636', '#7f6df2', '#a99bf6'] },
  { id: 'bear', name: 'Bear-style', group: 'inspired', desc: 'Warm off-white, red, roomy, serif headings', look: { accent: '#dd4c4f', bgTint: 'cream', headFont: 'serif', spacing: 'roomy', shadows: false, borders: 2, band: 'none', listStyle: 'edge', typeStyle: 'ios' } },
  { id: 'evernote', name: 'Evernote-style', group: 'inspired', desc: 'White, green, clean', look: { accent: '#00a82d', bgTint: 'white', fontUi: 'system', shadows: false, borders: 3, round: 1, band: 'none', typeStyle: 'material', listStyle: 'edge' } },
  { id: 'notion', name: 'Notion-style', group: 'inspired', desc: 'White, near-black, grey hairlines', look: { rowLayout: 'timeline', accent: '#37352f', bgTint: 'notion', headFont: 'serif', shadows: false, borders: 2, round: 1, btnStyle: 'plain', tabStyle: 'plain', band: 'none', typeStyle: 'ios', iconWeight: 'thin', pressStyle: 'highlight' } },
  { id: 'telegram', name: 'Telegram-style', group: 'inspired', desc: 'Blue, rounded, pale blue-grey, see-through bars', look: { accent: '#2481cc', bgTint: 'bluegrey', round: 3, tabStyle: 'plain', btnStyle: 'tinted', shadows: false, borders: 1, fontUi: 'system', band: 'none', barBlur: true, switchStyle: 'ios', listStyle: 'edge', titleAlign: 'centre', pressStyle: 'highlight', statusBar: 'header', iconSet: 'ios', pageMotion: 'ios', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios', checkStyle: 'round' } },
  { id: 'office', name: 'Office-style', group: 'inspired', desc: 'Square, outlined, a dark blue band', look: { navStyle: 'rail', accent: '#185abd', bgTint: 'grey', round: 0, shadows: false, borders: 3, fontUi: 'system' }, band: ['#185abd', '#107c41', '#c43e1c', '#7719aa'] },
  { id: 'whatsapp', name: 'WhatsApp-style', group: 'inspired', desc: 'Teal-green header, beige chat ground, icon pill tabs', look: { accent: '#008069', bgTint: 'beige', shadows: false, borders: 1, fontUi: 'system', tabStyle: 'indicator', listStyle: 'edge', switchStyle: 'material', typeStyle: 'material', pressStyle: 'highlight', statusBar: 'header', headerStyle: 'filled', tabIconFill: true, iconSet: 'material', pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios', checkStyle: 'round' }, band: ['#008069', '#008069', '#008069', '#008069'] },
  { id: 'pixel', name: 'Pixel-style', group: 'inspired', desc: 'Material You: soft, round, icon pill tabs; follows your colour', keep: ['accent'], look: { round: 3, tabStyle: 'indicator', btnStyle: 'tinted', shadows: false, borders: 1, spacing: 'roomy', fontUi: 'system', band: 'shades', switchStyle: 'material', pressStyle: 'highlight', typeStyle: 'material', listStyle: 'edge', statusBar: 'page', tabIconFill: true, iconSet: 'material', pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'filled', checkStyle: 'square' } },
  { id: 'apple', name: 'Apple-style', group: 'inspired', desc: 'iOS: grouped grey lists, blue, see-through bars, green switches, centred titles', look: { accent: '#007aff', bgTint: 'iosgrey', shadows: false, borders: 1, fontUi: 'system', tabStyle: 'plain', btnStyle: 'plain', band: 'none', barBlur: true, listStyle: 'inset', titleAlign: 'centre', switchStyle: 'ios', typeStyle: 'ios', iconWeight: 'thin', statusBar: 'header', headerStyle: 'large', tabIconFill: true, iconSet: 'ios', pageMotion: 'ios', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios', checkStyle: 'round' } },
  { id: 'material', name: 'Material-style', group: 'inspired', desc: 'Indigo, light grey ground, raised white cards, filled buttons', look: { accent: '#3f51b5', bgTint: 'materialgrey', round: 1, fontUi: 'system', btnStyle: 'filled', band: 'none', switchStyle: 'material', typeStyle: 'material', pressStyle: 'highlight', statusBar: 'header', headerStyle: 'filled', iconSet: 'material', pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'filled', checkStyle: 'square' } },
  { id: 'instagram', name: 'Instagram-style', group: 'inspired', desc: 'White, black text, blue buttons, story-ring gradient, icons only', look: { accent: '#0095f6', bgTint: 'instagram', shadows: false, borders: 2, fontUi: 'system', tabStyle: 'plain', tabIcons: true, barBlur: true, typeStyle: 'ios', titleAlign: 'centre', iconWeight: 'bold' }, band: ['#feda75', '#fa7e1e', '#d62976', '#962fbf'] },
  { id: 'acgme', name: 'ACGME-style', group: 'inspired', desc: 'Case-log red, white forms, square fields, grey labels', look: { accent: '#d32f2f', bgTint: 'grey', round: 0, shadows: false, borders: 3, fontUi: 'system', btnStyle: 'filled', tabStyle: 'plain' }, band: ['#e53935', '#e53935', '#d32f2f', '#d32f2f'] },
  { id: 'x', name: 'X-style', group: 'inspired', desc: 'Black, blue, edge-to-edge lists, see-through bars, icons only', look: { rowLayout: 'chat', accent: '#1d9bf0', bgTint: 'xblack', shadows: false, borders: 2, fontUi: 'system', band: 'none', barBlur: true, listStyle: 'edge', tabStyle: 'plain', tabIcons: true, typeStyle: 'ios', pressStyle: 'highlight' } },
  { id: 'spotify', name: 'Spotify-style', group: 'inspired', desc: 'Near-black, green, rounded, bold titles', look: { accent: '#1ed760', bgTint: 'spotify', shadows: false, borders: 0, round: 3, fontUi: 'system', band: 'none', tabStyle: 'plain', tabActiveLabel: true, typeStyle: 'ios', pressStyle: 'highlight' } },
  { id: 'youtube', name: 'YouTube-style', group: 'inspired', desc: 'White or near-black, red, plain tabs, edge-to-edge lists', look: { accent: '#ff0000', bgTint: 'youtube', shadows: false, borders: 1, fontUi: 'system', band: 'none', tabStyle: 'plain', listStyle: 'edge', pressStyle: 'highlight', typeStyle: 'material', btnStyle: 'tinted' } },
  { id: 'gmail', name: 'Gmail-style', group: 'inspired', desc: 'Pale blue-grey ground, white cards, red, icon pill tabs', look: { accent: '#d93025', bgTint: 'gmail', shadows: false, borders: 1, round: 3, fontUi: 'system', band: 'none', tabStyle: 'indicator', listStyle: 'edge', pressStyle: 'highlight', switchStyle: 'material', typeStyle: 'material', btnStyle: 'tinted', statusBar: 'page', tabIconFill: true, iconSet: 'material', pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'outlined', checkStyle: 'square' } },
  { id: 'tiktok', name: 'TikTok-style', group: 'inspired', desc: 'Black, red buttons, cyan and pink-red edges, icons only', look: { accent: '#fe2c55', bgTint: 'tiktok', shadows: false, borders: 2, fontUi: 'inter', tabStyle: 'plain', tabIcons: true, typeStyle: 'ios' }, band: ['#25f4ee', '#25f4ee', '#fe2c55', '#fe2c55'] },
];
// the Inspired themes shown on the Themes page; the rest are under Browse all themes (owner, 19 Oct 2026)
export const FEATURED = ['apple', 'pixel', 'evernote', 'obsidian', 'notion', 'whatsapp', 'office', 'acgme'];
export const themeById = id => THEMES.find(t => t.id === id) || THEMES[0];

// the look keys to save when a theme is picked: its own values, the defaults (null) for the rest, kept keys as now
export function themePatch(theme, current = {}) {
  const patch = { theme: theme.id === 'nuhs' ? null : theme.id };
  for (const k of THEME_KEYS) patch[k] = (theme.keep || []).includes(k) ? current[k] ?? null : theme.look[k] ?? null;
  return patch;
}
// does the device's look still match its theme? -> { theme, custom }
export function themeState(d = {}) {
  const theme = themeById(d.theme || 'nuhs');
  // off switches save as false or null alike (Soft shadows aside: false there means off, null on)
  // (colours is an object: compared by its contents)
  const val = (o, k) => (o[k] === false && k !== 'shadows' ? null : o[k] && typeof o[k] === 'object' ? JSON.stringify(o[k]) : o[k] ?? null);
  const custom = THEME_KEYS.some(k => !(theme.keep || []).includes(k) && val(d, k) !== val(theme.look, k)
    && !(k === 'borders' && d.flat && theme.look.flat));
  return { theme, custom };
}
// The problems with a theme (an empty list when it is fine): run over every theme by the tests, so a new one can't
// set an unknown key or value, leave text hard to read, or use a brand name without "-style" (docs/theme-engine.md)
export function checkTheme(t) {
  const bad = [];
  if (!/^[a-z0-9]{1,20}$/.test(t.id || '')) bad.push('id: lower-case letters and digits');
  if (!t.name || (t.group === 'inspired' && !/-style$/.test(t.name))) bad.push('name: Inspired themes end in "-style"');
  if (!['classic', 'inspired'].includes(t.group)) bad.push('group: classic or inspired');
  if (!t.desc || t.desc.length > 90) bad.push('desc: one short line');
  if (t.mode) bad.push('mode: themes never set light or dark');
  for (const [k, v] of Object.entries(t.look || {})) {
    if (!THEME_KEYS.includes(k)) bad.push(`look.${k}: not a look setting`);
    else if (FACETS.some(f => f.key === k) && cleanFacet(k, v) === null) bad.push(`look.${k}: ${JSON.stringify(v)} is not one of its choices`);
  }
  if (t.look?.bgTint && !TINTS[t.look.bgTint]) bad.push(`look.bgTint: no tint ${t.look.bgTint}`);
  if (t.band && !(t.band.length === 4 && t.band.every(c => /^#[0-9a-f]{6}$/.test(c)))) bad.push('band: four #rrggbb colours');
  try { checkColours(t.look || {}, TINTS[t.look?.bgTint] || {}); } catch (err) { bad.push('colours: ' + err.message); }
  return bad;
}
export const themeLabel = d => { const { theme, custom } = themeState(d); return custom ? `Custom (based on ${theme.name})` : theme.name; };

// the four top-band colours, or null for the usual behaviour (NUH stripe with the default colour, else shades),
// or 'none' for no band
export function bandColours(d = {}) {
  const b = d.band || 'theme';
  if (b === 'none') return 'none';
  if (b === 'nuh') return NUH_BAND;
  if (b === 'shades') return 'shades';
  const t = themeById(d.theme || 'nuhs');
  return t.band || null;
}

// The CSS for the look settings that aren't classes: the tint, the band, the heading font, spacing and tab style.
// shades: the four band colours worked out from the accent (colors.js lightPalette), used when the band says so.
export function lookCss(d = {}, shades = null) {
  const out = [];
  const tint = TINTS[d.bgTint] && d.bgTint !== 'auto' ? TINTS[d.bgTint] : null;
  const vars = o => Object.entries(o).map(([k, v]) => `--${k}: ${v};`).join(' ');
  if (tint) {
    if (tint.light) out.push(`:root:root:not([data-theme="dark"]) { ${vars(tint.light)} }`);
    if (tint.dark) {
      out.push(`:root:root[data-theme="dark"] { ${vars(tint.dark)} }`);
      out.push(`@media (prefers-color-scheme: dark) { :root:root[data-theme="auto"] { ${vars(tint.dark)} } }`);
    }
  }
  const band = bandColours(d);
  const four = band === 'shades' ? shades : Array.isArray(band) ? band : null;
  if (band === 'none') out.push('.top { background: var(--panel); } .top, .top[class] { padding-top: max(12px, env(safe-area-inset-top, 0px)); }');
  else if (four && four.length === 4) out.push(`:root:root, :root:root[data-theme="dark"] { --s1: ${four[0]}; --s2: ${four[1]}; --s3: ${four[2]}; --s4: ${four[3]}; }`);
  if (d.headFont && d.headFont !== 'same' && STACKS[d.headFont]) out.push(`:root { --font-head: ${STACKS[d.headFont]}; }`);
  // the theme engine's facets (theme-engine.js): App-style details, spacing, tab style; nothing unless chosen
  out.push(...facetCss(d));
  out.push(coloursCss(d.colours));
  return out.filter(Boolean).join('\n');
}
