// Look settings: one list of every setting a theme may hold (owner, 21 Oct 2026; docs/theme-engine-follow-up.md "unify
// validation"): its kind, the values it may hold, and whether it stays when you change theme. Bundled themes
// (themes.js checkTheme), saved themes and themes files (my-themes.js lookOf) and theme links all check against it, so
// a value the Themes page can't show (Corners 9, a made-up button style) is dropped at every way in.
// Pure, unit-tested (test/look-schema.test.mjs). The lists below that the Themes page shows (tints, bands, heading
// fonts, line spacing, contrast, button styles, lines, corners, Colourful) live here too, so this file needs nothing
// from the pages that use them.

import { cleanAccent, cleanColours } from './colors.js';
import { FONTS } from './fonts.js';
import { FACETS, FINE_TUNE, cleanTune, cleanTabIcons } from './theme-engine.js';
import { PATTERNS, DIM_MAX, INK_MIN, INK_MAX, INK_STEP } from './wallpaper.js';
import { NAV_STYLES, ROW_LAYOUTS, FORM_LAYOUTS } from './device-presets.js';

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
  obsidian: { label: 'Obsidian', light: { bg: '#f6f6f6', panel: '#ffffff', line: '#e3e3e3' }, dark: { bg: '#1e1e1e', panel: '#262626', line: '#363636' } },
  notion: { label: 'Notion', light: { bg: '#ffffff', panel: '#ffffff', ink: '#37352f', muted: '#6b6a67', line: '#e9e9e7' }, dark: { bg: '#191919', panel: '#252525', ink: '#ebebea', muted: '#9b9b9b', line: '#373737' } },
  instagram: { label: 'Instagram', light: { bg: '#ffffff', panel: '#ffffff', ink: '#262626', muted: '#737373', line: '#dbdbdb' }, dark: { bg: '#000000', panel: '#121212', ink: '#f5f5f5', muted: '#a8a8a8', line: '#262626' } },
  xblack: { label: 'X', light: { bg: '#ffffff', panel: '#ffffff', ink: '#0f1419', muted: '#536471', line: '#eff3f4' }, dark: { bg: '#000000', panel: '#000000', ink: '#e7e9ea', muted: '#71767b', line: '#2f3336' } },
  spotify: { label: 'Spotify', light: { bg: '#ffffff', panel: '#f6f6f6', line: '#e5e5e5' }, dark: { bg: '#121212', panel: '#1f1f1f', ink: '#ffffff', muted: '#b3b3b3', line: '#2a2a2a' } },
  youtube: { label: 'YouTube', light: { bg: '#ffffff', panel: '#ffffff', ink: '#0f0f0f', muted: '#606060', line: '#e5e5e5' }, dark: { bg: '#0f0f0f', panel: '#212121', ink: '#f1f1f1', muted: '#aaaaaa', line: '#303030' } },
  gmail: { label: 'Gmail', light: { bg: '#f6f8fc', panel: '#ffffff', ink: '#202124', muted: '#5f6368', line: '#dadce0' }, dark: { bg: '#131314', panel: '#1e1f20', ink: '#e3e3e3', muted: '#c4c7c5', line: '#444746' } },
  materialgrey: { label: 'Material grey', light: { bg: '#fafafa', panel: '#ffffff', line: '#e0e0e0' }, dark: { bg: '#121212', panel: '#1e1e1e', line: '#333333' } },
  tiktok: { label: 'TikTok', light: { bg: '#ffffff', panel: '#ffffff', ink: '#161823', muted: '#6a6b7e', line: '#e3e3e4' }, dark: { bg: '#000000', panel: '#121212', ink: '#ffffff', muted: '#a6a6ab', line: '#2f2f2f' } },
  black: { label: 'Black', light: { bg: '#f4f4f4' }, dark: { bg: '#000000', panel: '#121212', line: '#2a2a2a' } },
};
export const BANDS = [['theme', 'The theme’s colours (default)'], ['shades', 'Shades of my colour'], ['nuh', 'The NUH stripe'], ['none', 'None']];
export const HEAD_FONTS = [['same', 'Same as the interface (default)'], ['serif', 'Serif'], ['system', 'This device’s font'], ['inter', 'Inter'], ['lexend', 'Lexend'], ['atkinson', 'Atkinson Hyperlegible'], ['nunito', 'Nunito'], ['plex', 'IBM Plex Sans'], ['sourceserif', 'Source Serif'], ['jetbrains', 'JetBrains Mono'], ['mono', 'Monospace']];
export const LINE_HEIGHTS = [['0.9', 'Tight'], ['1', 'Normal (default)'], ['1.15', 'Relaxed'], ['1.3', 'Loose']];
export const CONTRASTS = [['auto', 'Follow the device (default)'], ['normal', 'Normal'], ['high', 'Higher contrast']];
export const BUTTON_STYLES = [['outlined', 'Outlined (default)'], ['filled', 'Filled'], ['tinted', 'Tinted'], ['plain', 'Plain']];
export const BORDERS = ['Borderless', 'Faint', 'Light', 'Soft', 'Normal (default)'];
export const ROUNDS = [['Square', 0], ['Slightly rounded', 0.5], ['Normal (default)', 1], ['Very round', 1.7]];
export const COLOURFUL = [['off', 'Off (default)'], ['tabs', 'One colour per tab: the tabs and headings'], ['all', 'One colour per tab: everything in the tab']];

// Kept when you change theme (Themes → Keep when changing theme): each group is a switch; wallpaper and layout are on
// unless switched off (a device's themeKeep: the groups that are on, [] for none). Light or dark, text size and zoom
// are never part of a theme, so they always stay.
export const KEEP_GROUPS = [
  ['wallpaper', 'Wallpaper', 'The pattern or photo, its dim and strength, and see-through cards.', true],
  ['layout', 'Layout', 'Navigation, Logbook rows, the case form, tab bar icons and labels, icon buttons, page titles, the plain calendar.', true],
  ['type', 'Fonts and text', 'The fonts, heading font, line spacing, letter spacing and text weight.', false],
];
export const keepGroups = d => (Array.isArray(d?.themeKeep) ? KEEP_GROUPS.filter(([g]) => d.themeKeep.includes(g)) : KEEP_GROUPS.filter(g => g[3])).map(([g]) => g);

// The Themes pages (TE S2, owner 21 Oct 2026: the essentials first, the rest on Advanced theme settings): each card,
// its page and its title, in page order. Every setting below names its card (section), so the two pages can't drift;
// cards with no look settings (the theme list, Your themes, Custom CSS) are listed too, to place them.
export const THEME_CARDS = [
  ['themes', 'themes', 'Themes'], ['mine', 'themes', 'Your themes'], ['colour', 'themes', 'Colour and light'], ['wallpaper', 'themes', 'Wallpaper'],
  ['shape', 'themesadv', 'Shape and type'], ['tune', 'themesadv', 'Fine-tune'], ['header', 'themesadv', 'Header and tab bar'], ['rows', 'themesadv', 'Rows and forms'],
  ['details', 'themesadv', 'App-style details'], ['colours', 'themesadv', 'More colour'], ['edit', 'themesadv', 'Edit colours'], ['css', 'themesadv', 'Custom CSS'],
  ['access', 'access', 'Accessibility'],
];
export const cardsOn = page => THEME_CARDS.filter(c => c[1] === page).map(([id]) => id);
const SECTIONS = {
  colour: ['accent', 'bgTint'], colours: ['colourful', 'band'], edit: ['colours'], wallpaper: ['wallpaper', 'wallDim', 'wallInk', 'wallFrost'],
  shape: ['borders', 'flat', 'round', 'shadows', 'fontUi', 'fontLog', 'headFont', 'lineHeight', 'btnStyle', 'iconBtns', 'calPlain'],
  header: ['tabIcons', 'pageTitles'], rows: ['navStyle', 'rowLayout', 'rowShort', 'formLayout'], details: ['iconTint', 'iconTintStrength', 'tabIcon'],
  access: ['contrast'],
};
const sectionOf = f => Object.keys(SECTIONS).find(c => SECTIONS[c].includes(f.key)) || (f.kind === 'tune' ? 'tune' : f.facet || f.kind === 'bool' ? (f.group === 'shape' ? 'shape' : 'details') : null);

// One entry per setting, in the order themes list them. kind: enum (values), bool (true or unset), off (false or
// unset: Soft shadows), int (min..max in steps), tune (Fine-tune numbers, theme-engine.js), colour (#rrggbb),
// colours (the full colour tokens, colors.js), icons (a tab's icon, theme-engine.js). keep: its KEEP_GROUPS group.
const values = list => list.map(([v]) => v);
const facetOf = f => (f.bool ? { key: f.key, kind: 'bool', group: f.group } : { key: f.key, kind: 'enum', values: values(f.choices), facet: true, group: f.group });
const KEEPS = {
  wallpaper: ['wallpaper', 'wallDim', 'wallInk', 'wallFrost'],
  layout: ['navStyle', 'rowLayout', 'rowShort', 'formLayout', 'tabIcons', 'tabActiveLabel', 'iconBtns', 'pageTitles', 'calPlain', 'tabIcon'],
  type: ['fontUi', 'fontLog', 'headFont', 'lineHeight', 'ftLetter', 'ftWeight'],
};
export const LOOK = [
  { key: 'colours', kind: 'colours' },
  { key: 'accent', kind: 'colour' },
  { key: 'colourful', kind: 'enum', values: ['tabs', 'all'] },
  { key: 'borders', kind: 'int', min: 0, max: BORDERS.length - 2, step: 1 },
  { key: 'flat', kind: 'bool' },
  { key: 'round', kind: 'int', min: 0, max: ROUNDS.length - 1, step: 1 },
  { key: 'shadows', kind: 'off' },
  { key: 'fontUi', kind: 'enum', values: values(FONTS) },
  { key: 'fontLog', kind: 'enum', values: ['same', ...values(FONTS)] },
  { key: 'headFont', kind: 'enum', values: values(HEAD_FONTS) },
  { key: 'lineHeight', kind: 'enum', values: values(LINE_HEIGHTS) },
  { key: 'btnStyle', kind: 'enum', values: values(BUTTON_STYLES) },
  ...['iconBtns', 'tabIcons', 'pageTitles', 'calPlain', 'rowShort'].map(key => ({ key, kind: 'bool' })),
  { key: 'navStyle', kind: 'enum', values: values(NAV_STYLES) },
  { key: 'rowLayout', kind: 'enum', values: values(ROW_LAYOUTS) },
  { key: 'formLayout', kind: 'enum', values: values(FORM_LAYOUTS) },
  { key: 'contrast', kind: 'enum', values: values(CONTRASTS) },
  { key: 'bgTint', kind: 'enum', values: Object.keys(TINTS) },
  { key: 'band', kind: 'enum', values: values(BANDS) },
  ...FACETS.map(facetOf),
  ...FINE_TUNE.map(t => ({ key: t.key, kind: 'tune', min: t.min, max: t.max, step: t.step })),
  { key: 'wallpaper', kind: 'enum', values: Object.keys(PATTERNS) },   // a pattern; a photo stays on its device
  { key: 'wallDim', kind: 'int', min: 0, max: DIM_MAX, step: 5 },
  { key: 'iconTint', kind: 'colour' },
  { key: 'iconTintStrength', kind: 'int', min: 10, max: 100, step: 10 },
  { key: 'tabIcon', kind: 'icons' },
  // new settings go last: theme links name a setting by its place in this list
  { key: 'wallInk', kind: 'int', min: INK_MIN, max: INK_MAX, step: INK_STEP },   // pattern strength (TE S3)
  { key: 'wallFrost', kind: 'bool' },   // see-through cards (TE S3)
].map(f => ({ ...f, keep: Object.keys(KEEPS).find(g => KEEPS[g].includes(f.key)) || null, section: sectionOf(f) }));
export const LOOK_KEYS = LOOK.map(f => f.key);
export const lookField = k => LOOK.find(f => f.key === k);

// a setting's value made safe, or null (unset) when it can't hold it. A facet at its default saves as unset.
export function cleanLook(k, v) {
  const f = lookField(k);
  if (!f || v == null) return null;
  switch (f.kind) {
    case 'enum': if (k === 'colourful' && v === true) return 'tabs';   // (a plain on/off before "everything in the tab")
      return f.values.includes(v) && !(f.facet && v === f.values[0]) ? v : null;
    case 'bool': return v === true ? true : null;
    case 'off': return v === false ? false : null;
    case 'int': return Number.isInteger(v) && v >= f.min && v <= f.max && (v - f.min) % f.step === 0 ? v : null;
    case 'tune': return cleanTune(k, v);
    case 'colour': return cleanAccent(v);
    case 'colours': { const c = cleanColours(v); return Object.keys(c).length ? c : null; }
    case 'icons': { const c = cleanTabIcons(v); return Object.keys(c).length ? c : null; }
  }
  return null;
}
// the keys the device's kept groups hold (themePatch, minePatch and themeState leave them as they are)
export const keptKeys = d => new Set(LOOK.filter(f => f.keep && keepGroups(d).includes(f.keep)).map(f => f.key));
