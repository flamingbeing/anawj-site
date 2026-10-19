// Themes (Settings → Themes; owner, 15 Oct 2026): a theme is a bundle of this device's look settings (display.js),
// set in one tap; every setting stays editable afterwards, and the page then says "Custom (based on …)". Classic
// themes are cards; Inspired ones (the look of other apps: colours, corners and type only, never their logos or
// fonts) sit in a searchable list. Pure, unit-tested; the CSS for the new look settings (background tint, spacing,
// tab bar style, heading font, the top band) is made here too, cached for the first paint (index.html).

import { STACKS } from './fonts.js';

// the display keys a theme sets; anything a theme doesn't list goes back to its default (null), unless it keeps it
export const THEME_KEYS = ['accent', 'colourful', 'borders', 'flat', 'round', 'shadows', 'fontUi', 'fontLog', 'headFont', 'lineHeight',
  'compact', 'btnStyle', 'iconBtns', 'tabIcons', 'pageTitles', 'calPlain', 'rowShort', 'contrast', 'bgTint', 'spacing', 'tabStyle', 'band',
  'barBlur', 'tabActiveLabel', 'listStyle', 'titleAlign', 'switchStyle', 'pressStyle', 'iconWeight', 'typeStyle'];

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
export const SPACINGS = [['tight', 'Tight'], ['normal', 'Normal (default)'], ['roomy', 'Roomy']];
export const TAB_STYLES = [['underline', 'Underline (default)'], ['pill', 'Pill'], ['plain', 'Plain (colour only)'], ['indicator', 'Icon pill (Material)']];
// App-style details (Themes → App-style details; owner, 19 Oct 2026): each its own device setting, off by default (nothing changes until chosen)
export const LIST_STYLES = [['default', 'Cards (default)'], ['inset', 'Inset grouped (iOS)'], ['edge', 'Edge to edge (Material, chat apps)']];
export const TITLE_ALIGNS = [['default', 'As now (default)'], ['centre', 'Centred (iOS)']];
export const SWITCH_STYLES = [['default', 'As now (default)'], ['ios', 'iOS (green, round)'], ['material', 'Material (outlined, big knob)']];
export const PRESS_STYLES = [['default', 'Dim (default)'], ['highlight', 'Grey highlight (Material)'], ['none', 'No change']];
export const ICON_WEIGHTS = [['default', 'Regular (default)'], ['thin', 'Thin'], ['bold', 'Bold']];
export const TYPE_STYLES = [['default', 'As now (default)'], ['ios', 'iOS (bold titles, tight)'], ['material', 'Material (medium weight)']];
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
  { id: 'notion', name: 'Notion-style', group: 'inspired', desc: 'White, near-black, grey hairlines', look: { accent: '#37352f', bgTint: 'notion', headFont: 'serif', shadows: false, borders: 2, round: 1, btnStyle: 'plain', tabStyle: 'plain', band: 'none', typeStyle: 'ios', iconWeight: 'thin', pressStyle: 'highlight' } },
  { id: 'telegram', name: 'Telegram-style', group: 'inspired', desc: 'Blue, rounded, pale blue-grey, see-through bars', look: { accent: '#2481cc', bgTint: 'bluegrey', round: 3, tabStyle: 'plain', btnStyle: 'tinted', shadows: false, borders: 1, fontUi: 'system', band: 'none', barBlur: true, switchStyle: 'ios', listStyle: 'edge', titleAlign: 'centre', pressStyle: 'highlight' } },
  { id: 'office', name: 'Office-style', group: 'inspired', desc: 'Square, outlined, a dark blue band', look: { accent: '#185abd', bgTint: 'grey', round: 0, shadows: false, borders: 3, fontUi: 'system' }, band: ['#185abd', '#107c41', '#c43e1c', '#7719aa'] },
  { id: 'whatsapp', name: 'WhatsApp-style', group: 'inspired', desc: 'Teal-green header, beige chat ground, icon pill tabs', look: { accent: '#008069', bgTint: 'beige', shadows: false, borders: 1, fontUi: 'system', tabStyle: 'indicator', listStyle: 'edge', switchStyle: 'material', typeStyle: 'material', pressStyle: 'highlight' }, band: ['#008069', '#008069', '#008069', '#008069'] },
  { id: 'pixel', name: 'Pixel-style', group: 'inspired', desc: 'Material You: soft, round, icon pill tabs; follows your colour', keep: ['accent'], look: { round: 3, tabStyle: 'indicator', btnStyle: 'tinted', shadows: false, borders: 1, spacing: 'roomy', fontUi: 'system', band: 'shades', switchStyle: 'material', pressStyle: 'highlight', typeStyle: 'material', listStyle: 'edge' } },
  { id: 'apple', name: 'Apple-style', group: 'inspired', desc: 'iOS: grouped grey lists, blue, see-through bars, green switches, centred titles', look: { accent: '#007aff', bgTint: 'iosgrey', shadows: false, borders: 1, fontUi: 'system', tabStyle: 'plain', btnStyle: 'plain', band: 'none', barBlur: true, listStyle: 'inset', titleAlign: 'centre', switchStyle: 'ios', typeStyle: 'ios', iconWeight: 'thin' } },
  { id: 'material', name: 'Material-style', group: 'inspired', desc: 'Indigo, light grey ground, raised white cards, filled buttons', look: { accent: '#3f51b5', bgTint: 'materialgrey', round: 1, fontUi: 'system', btnStyle: 'filled', band: 'none', switchStyle: 'material', typeStyle: 'material', pressStyle: 'highlight' } },
  { id: 'instagram', name: 'Instagram-style', group: 'inspired', desc: 'White, black text, blue buttons, story-ring gradient, icons only', look: { accent: '#0095f6', bgTint: 'instagram', shadows: false, borders: 2, fontUi: 'system', tabStyle: 'plain', tabIcons: true, barBlur: true, typeStyle: 'ios', titleAlign: 'centre', iconWeight: 'bold' }, band: ['#feda75', '#fa7e1e', '#d62976', '#962fbf'] },
  { id: 'acgme', name: 'ACGME-style', group: 'inspired', desc: 'Case-log red, white forms, square fields, grey labels', look: { accent: '#d32f2f', bgTint: 'grey', round: 0, shadows: false, borders: 3, fontUi: 'system', btnStyle: 'filled', tabStyle: 'plain' }, band: ['#e53935', '#e53935', '#d32f2f', '#d32f2f'] },
  { id: 'x', name: 'X-style', group: 'inspired', desc: 'Black, blue, edge-to-edge lists, see-through bars, icons only', look: { accent: '#1d9bf0', bgTint: 'xblack', shadows: false, borders: 2, fontUi: 'system', band: 'none', barBlur: true, listStyle: 'edge', tabStyle: 'plain', tabIcons: true, typeStyle: 'ios', pressStyle: 'highlight' } },
  { id: 'spotify', name: 'Spotify-style', group: 'inspired', desc: 'Near-black, green, rounded, bold titles', look: { accent: '#1ed760', bgTint: 'spotify', shadows: false, borders: 0, round: 3, fontUi: 'system', band: 'none', tabStyle: 'plain', tabActiveLabel: true, typeStyle: 'ios', pressStyle: 'highlight' } },
  { id: 'youtube', name: 'YouTube-style', group: 'inspired', desc: 'White or near-black, red, plain tabs, edge-to-edge lists', look: { accent: '#ff0000', bgTint: 'youtube', shadows: false, borders: 1, fontUi: 'system', band: 'none', tabStyle: 'plain', listStyle: 'edge', pressStyle: 'highlight', typeStyle: 'material', btnStyle: 'tinted' } },
  { id: 'gmail', name: 'Gmail-style', group: 'inspired', desc: 'Pale blue-grey ground, white cards, red, icon pill tabs', look: { accent: '#d93025', bgTint: 'gmail', shadows: false, borders: 1, round: 3, fontUi: 'system', band: 'none', tabStyle: 'indicator', listStyle: 'edge', pressStyle: 'highlight', switchStyle: 'material', typeStyle: 'material', btnStyle: 'tinted' } },
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
  const val = (o, k) => (o[k] === false && k !== 'shadows' ? null : o[k] ?? null);
  const custom = THEME_KEYS.some(k => !(theme.keep || []).includes(k) && val(d, k) !== val(theme.look, k)
    && !(k === 'borders' && d.flat && theme.look.flat));
  return { theme, custom };
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
  if (d.spacing === 'roomy') out.push('section.card { padding: 20px; margin-bottom: 16px; } ul.cases li { padding-top: 12px; padding-bottom: 12px; } .chips { gap: 8px; }');
  if (d.spacing === 'tight') out.push('section.card { padding: 11px; margin-bottom: 8px; } ul.cases li { padding-top: 6px; padding-bottom: 6px; } .chips { gap: 4px; }');
  if (d.tabStyle === 'pill') out.push('.tabs button[aria-selected="true"], html.tabs-top .tabs button[aria-selected="true"], html.tabs-bottom .tabs button[aria-selected="true"] { border-color: transparent; background: var(--accent-soft); color: var(--accent); border-radius: 999px; }');
  if (d.tabStyle === 'plain') out.push('.tabs button[aria-selected="true"], html.tabs-top .tabs button[aria-selected="true"], html.tabs-bottom .tabs button[aria-selected="true"] { border-color: transparent; color: var(--accent); }');

  // App-style details: CSS only, so the first paint has it too (index.html). Nothing is added unless chosen.
  if (d.barBlur) out.push(':root:root .top { background-color: color-mix(in srgb, var(--panel) 72%, transparent); backdrop-filter: saturate(1.8) blur(20px); -webkit-backdrop-filter: saturate(1.8) blur(20px); } @media (max-width: 600px) { :root:root .tabs { background: color-mix(in srgb, var(--bg) 70%, transparent); backdrop-filter: saturate(1.8) blur(20px); -webkit-backdrop-filter: saturate(1.8) blur(20px); } }');
  if (d.tabActiveLabel) out.push('@media (max-width: 600px) { .tabs button:not([aria-selected="true"]) .lbl { display: none; } }');
  if (d.tabStyle === 'indicator') out.push('.tabs button[aria-selected="true"], html.tabs-top .tabs button[aria-selected="true"], html.tabs-bottom .tabs button[aria-selected="true"] { border-color: transparent; background: var(--accent-soft); color: var(--accent); border-radius: 999px; } @media (max-width: 600px) { :root:root:not(.tabs-top) .tabs button[aria-selected="true"] { background: none; border-radius: 0; } :root:root:not(.tabs-top) .tabs button[aria-selected="true"] .ico { box-sizing: content-box; padding: 4px 18px; margin: -4px 0 0; border-radius: 999px; background: var(--accent-soft); } }');
  if (d.listStyle === 'inset') out.push('ul.cases, .more-list { background: var(--panel); border-radius: calc(12px * var(--round, 1)); overflow: hidden; } ul.cases li { padding-left: 14px; padding-right: 12px; } ul.cases li:last-child { border-bottom: 0; } ul.cases li { border-bottom-color: color-mix(in srgb, var(--ink) 14%, transparent); }');
  if (d.listStyle === 'edge') out.push('section.card { border-radius: 0; border-left: 0; border-right: 0; box-shadow: none; margin-left: -12px; margin-right: -12px; } ul.cases li { padding-left: 12px; padding-right: 12px; }');
  if (d.titleAlign === 'centre') out.push('.top h1 { flex: 1; text-align: center; }');
  if (d.switchStyle === 'ios') out.push(':root .set-page label.check > input[type=checkbox] { width: 51px; height: 31px; border-radius: 16px; } :root .set-page label.check > input[type=checkbox]::before { top: 2px; left: 2px; width: 27px; height: 27px; box-shadow: 0 2px 4px rgba(0, 0, 0, .25); } :root .set-page label.check > input[type=checkbox]:checked { background: #34c759; } :root .set-page label.check > input[type=checkbox]:checked::before { transform: translateX(20px); }');
  if (d.switchStyle === 'material') out.push(':root .set-page label.check > input[type=checkbox] { width: 52px; height: 32px; border-radius: 16px; background: var(--panel); box-shadow: inset 0 0 0 2px var(--muted); } :root .set-page label.check > input[type=checkbox]::before { top: 8px; left: 8px; width: 16px; height: 16px; background: var(--muted); box-shadow: none; } :root .set-page label.check > input[type=checkbox]:checked { background: var(--accent); box-shadow: none; } :root .set-page label.check > input[type=checkbox]:checked::before { width: 24px; height: 24px; top: 4px; left: 4px; background: #fff; transform: translateX(20px); }');
  if (d.pressStyle === 'highlight') out.push(':root :is(button, .btn, .chip, [role=button]):not(:disabled):active { opacity: 1; background-color: color-mix(in srgb, var(--ink) 12%, var(--panel)); }');
  if (d.pressStyle === 'none') out.push(':root :is(button, .btn, .chip, [role=button]):not(:disabled):active { opacity: 1; } :root :is(ul.cases > li:not(.monthhead), .more-list a, .picker li, details > summary, ul.ready-list li, .notes-list li):active { background-color: transparent; }');
  if (d.iconWeight === 'thin') out.push(':root .ico, :root .ico.i { stroke-width: 1.4; }');
  if (d.iconWeight === 'bold') out.push(':root .ico, :root .ico.i { stroke-width: 2.6; }');
  if (d.typeStyle === 'ios') out.push(':root .top h1, :root h1, :root h2, :root section.card h2 { font-weight: 700; letter-spacing: -0.02em; } :root .top h1 { font-size: calc(20px * var(--fs, 1)); } body { letter-spacing: -0.01em; }');
  if (d.typeStyle === 'material') out.push(':root .top h1, :root h1, :root h2, :root h3, :root section.card h2 { font-weight: 500; letter-spacing: 0; } .tabs button { letter-spacing: .02em; font-weight: 500; }');
  return out.join('\n');
}
