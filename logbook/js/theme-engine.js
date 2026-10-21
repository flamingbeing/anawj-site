// The theme engine (Settings → Themes; owner, 19 Oct 2026). Every look a theme can set beyond colours, fonts and corners
// is a facet here: its device key, its choices, where it shows on the Themes page and the CSS it adds. The Themes
// page draws its "App-style details" from this list, themes.js lookCss adds the CSS (cached for the first paint),
// my-themes.js and settings-file.js accept only the values listed, and checkTheme (themes.js) refuses a theme that
// sets anything else. Each facet is off by default: with none chosen the page is exactly as before.
// A new facet: add it to FACETS (and its CSS, or the code that reads it), and a choice to a theme in themes.js.
// How to write themes with it: docs/theme-engine.md. Pure, unit-tested (test/theme-engine.test.mjs).

import { cleanAccent, lightPalette, darkPalette } from './colors.js';

// the fields every rule below restyles (the app's text boxes, dropdowns and case box)
const FIELDS = ['input[type="text"]', 'input[type="password"]', 'input[type="search"]', 'input[type="email"]', 'input:not([type])', 'input[type="date"]', 'input[type="number"]', 'select', 'textarea'];
const fields = (suffix = '') => FIELDS.map(f => `:root ${f}${suffix}`).join(', ');
// tick boxes, but not the on / off switches on the settings pages (style.css draws those)
const TICK = ':root input[type="checkbox"]:not(.set-page label.check > *)';
const TABS_SEL = '.tabs button[aria-selected="true"], html.tabs-top .tabs button[aria-selected="true"], html.tabs-bottom .tabs button[aria-selected="true"]';
const SWITCH = ':root .set-page label.check > input[type=checkbox]';
const blur = 'backdrop-filter: saturate(1.8) blur(20px); -webkit-backdrop-filter: saturate(1.8) blur(20px);';

// Icon sets: how the app's line icons are drawn (ui-core.js ic(), the tab bar in app.js). css restyles every icon;
// paths replaces single icons by name (the names in ui-core.js ICON_PATHS and app.js ICONS; 24 × 24, stroked);
// an icon a set doesn't draw keeps the default. activePaths: the current tab's icon, drawn filled (with tabIconFill).
export const ICON_SETS = {
  line: { label: 'Line (default)' },
  sharp: { label: 'Sharp (square ends)', css: ':root .ico, :root .ico.i { stroke-linecap: square; stroke-linejoin: miter; }' },
  soft: { label: 'Soft (rounded, tinted inside)', css: ':root .ico, :root .ico.i { stroke-width: 2.2; fill: color-mix(in srgb, currentColor 14%, transparent); }' },
  ios: { label: 'iOS-style (thin, round)', css: ':root .ico, :root .ico.i { stroke-width: 1.6; }', paths: {
    log: 'M12 4v16M4 12h16',
    logbook: 'M7 3.5h11a2 2 0 0 1 2 2v15H7a3 3 0 0 1-3-3v-11a3 3 0 0 1 3-3Zm0 0v17M10 8h6M10 12h6M10 16h4',
    reflect: 'M4 19V6a2 2 0 0 1 2-2h5v15H7c-1.7 0-3 .8-3 2V19Zm7-15h7a2 2 0 0 1 2 2v15c0-1.2-1.3-2-3-2h-6M7 8h1M14 8h3M14 12h3',
    progress: 'M4 20V10a1 1 0 0 1 1-1h2v11M10.5 20V5a1 1 0 0 1 1-1h2v16M17 20V8a1 1 0 0 1 1-1h2v12a1 1 0 0 1-1 1H4',
    totals: 'M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5ZM4 9h16M9 9v11M9 14.5h11',
    notes: 'M6 3.5h12a2 2 0 0 1 2 2v10l-5 5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2ZM15 20v-5h5M8 8h8M8 12h8M8 16h3',
    more: 'M6 12a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm7 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm7 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z',
    settings: 'M4 6h16M4 12h16M4 18h16M8 3.5v5M16 9.5v5M10 15.5v5',
    account: 'M12 3.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4.5 20.5v-1a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6v1Z',
    search: 'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0ZM15.2 15.2l5.3 5.3',
  } },
  material: { label: 'Material-style (even, square-ish)', css: ':root .ico, :root .ico.i { stroke-width: 2; stroke-linecap: butt; stroke-linejoin: miter; }', paths: {
    log: 'M11 3h2v8h8v2h-8v8h-2v-8H3v-2h8Z',
    logbook: 'M5 3h15v18H5V3ZM8 3v18M11 7h6M11 11h6M11 15h4M3 7h3M3 17h3',
    reflect: 'M3 4h8l1 1 1-1h8v16h-8l-1 1-1-1H3V4ZM12 5v16M6 8h3M6 12h3M15 8h3M15 12h3',
    progress: 'M4 21V12h3v9H4Zm6 0V3h3v18h-3Zm6 0V8h3v13h-3Z',
    totals: 'M3 3h18v18H3V3ZM3 9h18M3 15h18M9 9v12M15 9v12',
    notes: 'M4 3h16v13l-5 5H4V3ZM15 21v-5h5M7 7h10M7 11h10M7 15h4',
    more: 'M5 10h2v3H5v-3Zm6 0h2v3h-2v-3Zm6 0h2v3h-2v-3Z',
    settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3ZM15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z',
    account: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21v-3c0-3 4-4 8-4s8 1 8 4v3H4Z',
    search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM15 15l6 6',
  } },
};
// the path to draw for an icon: the set's own, else the default; set: <html data-icons> (display.js applyLook)
export function iconPath(name, fallback, set = typeof document !== 'undefined' ? document.documentElement.dataset.icons : '') {
  return (set && ICON_SETS[set]?.paths?.[name]) || fallback;
}

// An icon per tab (Themes → App-style details → Icons; theme-revamp S4): any tab may take one of these instead of
// its own (tabIcon: { log: 'pen', … }, this device's; a theme may set it). Same grid and stroke as the tab bar's.
export const TAB_ICONS = {
  plus: ['Plus in a circle', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8 12h8'],
  pen: ['Pen', 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4'],
  book: ['Book', 'M4 5.5C6.5 4 9.5 4 12 5.5 14.5 4 17.5 4 20 5.5V20c-2.5-1.5-5.5-1.5-8 0-2.5-1.5-5.5-1.5-8 0zM12 5.5V20'],
  bookmark: ['Bookmark', 'M6 3h12v18l-6-4-6 4z'],
  list: ['List', 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01'],
  clipboard: ['Clipboard', 'M9 3h6v4H9zM9 5H5v16h14V5h-4M9 12h6M9 16h4'],
  calendar: ['Calendar', 'M4 6h16v15H4zM4 10h16M8 3v5M16 3v5'],
  chart: ['Line chart', 'M4 4v16h16M7 15l4-5 3 3 5-7'],
  pulse: ['Heartbeat', 'M3 12h4l2-5 4 10 2-5h6'],
  heart: ['Heart', 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
  star: ['Star', 'M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z'],
  bulb: ['Light bulb', 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z'],
  home: ['House', 'M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-6h4v6'],
  grid: ['Squares', 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
  syringe: ['Syringe', 'M14 4l6 6M17 7l-9 9-3 1 1-3 9-9M11 7l6 6M4 20l2-2'],
  person: ['Person', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'],
};
// a saved tab-icon choice: tab ids (letters) to names in TAB_ICONS only, at most 13; {} when none
export function cleanTabIcons(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([k, x]) => /^[a-z]{1,12}$/.test(k) && typeof x === 'string' && Object.hasOwn(TAB_ICONS, x)).sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, 13));
}
// the path for a tab's icon: its chosen one, else the icon set's, else the default
export const tabIconPath = (id, fallback, chosen = {}) => (Object.hasOwn(TAB_ICONS, chosen[id]) ? TAB_ICONS[chosen[id]][1] : iconPath(id, fallback));

// Icon tint (theme-revamp S4, as iOS 18 tinted icons): one colour mixed into every line icon at a strength (10 to 100%,
// unset = 100), apart from the current tab and icons on filled buttons. The colour is first made readable as text
// is (colors.js: 4.5:1 on light pages, 7:1 on dark ones), so a pale or dark pick still shows in both.
export const cleanTintStrength = v => (Number.isInteger(v) && v >= 10 && v <= 100 && v % 10 === 0 ? v : null);
const TINTED = ':root .ico:not(.tabs [aria-selected="true"] .ico, :is(.primary, .danger, .swatch) .ico, .more-list .ico)';
export function iconTintCss(d = {}) {
  const c = cleanAccent(d.iconTint);
  if (!c) return '';
  const s = cleanTintStrength(d.iconTintStrength) ?? 100;
  const v = p => `--icon-tint: ${p.accent};`;
  return [`:root { ${v(lightPalette(c))} }`, `:root[data-theme="dark"] { ${v(darkPalette(c))} }`, `:root[data-theme="dark"][data-oled] { ${v(darkPalette(c, true))} }`,
    `@media (prefers-color-scheme: dark) { :root[data-theme="auto"] { ${v(darkPalette(c))} } }`,
    `${TINTED} { stroke: color-mix(in srgb, var(--icon-tint) ${s}%, currentColor); }`,
    `:root .more-list .ico { stroke: color-mix(in srgb, var(--icon-tint) ${s}%, var(--accent)); }`].join('\n');
}

// Page motion (app.js slidePages): keyframes for the new page going deeper (dir 1), back (dir -1) or to another tab
// (dir 0, only where tabs is true); with the duration and easing. Reduce motion (Accessibility) turns all of it off.
export const PAGE_MOTIONS = {
  default: { label: 'Slide and fade (default)', ms: 280, ease: 'cubic-bezier(.2, .7, .2, 1)',
    frames: (dir, w) => [{ transform: `translateX(${Math.round(w * 0.3) * dir}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }] },
  ios: { label: 'iOS push (slides over from the edge)', ms: 380, ease: 'cubic-bezier(.32, .72, 0, 1)', vars: '--dur: 350ms; --ease: cubic-bezier(.32, .72, 0, 1);',
    frames: (dir, w) => (dir > 0 ? [{ transform: `translateX(${Math.round(w)}px)`, boxShadow: '-10px 0 30px rgba(0, 0, 0, .12)' }, { transform: 'translateX(0)', boxShadow: '0 0 0 rgba(0, 0, 0, 0)' }]
      : [{ transform: `translateX(${-Math.round(w * 0.3)}px)`, opacity: 0.6 }, { transform: 'translateX(0)', opacity: 1 }]) },
  material: { label: 'Material (fade through, small shift)', ms: 300, ease: 'cubic-bezier(.2, 0, 0, 1)', tabs: true, vars: '--dur: 300ms; --ease: cubic-bezier(.2, 0, 0, 1);',
    frames: dir => (dir ? [{ transform: `translateX(${30 * dir}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }] : [{ transform: 'scale(.98)', opacity: 0 }, { transform: 'none', opacity: 1 }]) },
  fade: { label: 'Fade only', ms: 200, ease: 'ease-out', tabs: true, frames: () => [{ opacity: 0 }, { opacity: 1 }] },
  none: { label: 'None (pages just change)', ms: 0 },
};
export const pageMotion = d => (Object.hasOwn(PAGE_MOTIONS, d?.pageMotion) ? PAGE_MOTIONS[d.pageMotion] : PAGE_MOTIONS.default);

// group: where the facet shows on the Themes page (FACET_GROUPS). choices: [value, label]; the first is the default
// (saved as null). bool: a switch instead. css(value): the CSS when chosen. js: read by code, not CSS (named in line).
export const FACET_GROUPS = [['shape', null], ['header', 'Header and status bar'], ['tabs', 'Tab bar'], ['lists', 'Lists and type'], ['icons', 'Icons'], ['motion', 'Motion'], ['popups', 'Pop-ups and messages'], ['controls', 'Controls']];
const opts = o => Object.entries(o).map(([k, v]) => [k, v.label]);
export const FACETS = [
  // Shape and type (drawn on that card, not under App-style details)
  // Spacing (theme-revamp S2; owner, 21 Oct 2026): 'compact' is the old Compact mode (style.css body.compact, set by
  // display.js applyCompact), shown as Tight; 'tight' is the milder spacing it always was, shown as Snug
  { key: 'spacing', group: 'shape', label: 'Spacing', line: 'Tight is the old Compact mode.', choices: [['normal', 'Normal (default)'], ['tight', 'Snug'], ['compact', 'Tight'], ['roomy', 'Roomy']], css: {
    roomy: 'section.card { padding: 20px; margin-bottom: 16px; } ul.cases li { padding-top: 12px; padding-bottom: 12px; } .chips { gap: 8px; }',
    tight: 'section.card { padding: 11px; margin-bottom: 8px; } ul.cases li { padding-top: 6px; padding-bottom: 6px; } .chips { gap: 4px; }' } },
  { key: 'tabStyle', group: 'shape', label: 'Tab bar style', line: 'How the tab you’re on is marked.', choices: [['underline', 'Underline (default)'], ['pill', 'Pill'], ['plain', 'Plain (colour only)'], ['indicator', 'Icon pill (Material)']], css: {
    pill: `${TABS_SEL} { border-color: transparent; background: var(--accent-soft); color: var(--accent); border-radius: 999px; }`,
    plain: `${TABS_SEL} { border-color: transparent; color: var(--accent); }`,
    indicator: `${TABS_SEL} { border-color: transparent; background: var(--accent-soft); color: var(--accent); border-radius: 999px; } @media (max-width: 600px) { :root:not(.tabs-top) .tabs button[aria-selected="true"] { background: none; border-radius: 0; } :root:not(.tabs-top) .tabs button[aria-selected="true"] .ico { box-sizing: content-box; padding: 4px 18px; margin: -4px 0 0; border-radius: 999px; background: var(--accent-soft); } }` } },

  // Header and status bar
  { key: 'statusBar', group: 'header', label: 'Phone status bar', js: true, line: 'The strip above the app on Android and in browsers (display.js paintStatusBar).', choices: [['accent', 'My colour (default)'], ['header', 'Match the header'], ['page', 'Match the page']] },
  { key: 'headerStyle', wins: true, group: 'header', label: 'Header', choices: [['plain', 'Plain (default)'], ['filled', 'Filled with my colour (Android apps)'], ['large', 'Large title (iOS)']], css: {
    filled: ':root .top { --header-ink: var(--accent-ink); background: var(--accent); color: var(--accent-ink); border-bottom-color: transparent; } :root .top :is(h1, .sub, a, .who, .email) { color: var(--accent-ink); } :root .top .who :is(button, .btn) { background: transparent; color: var(--accent-ink); border-color: color-mix(in srgb, var(--accent-ink) 45%, transparent); }',
    // the large title gets its own row under the header's buttons, as on iOS
    large: ':root .top { flex-wrap: wrap; row-gap: 2px; } :root .top .who { order: 1; margin-left: auto; } :root .top .brand { order: 2; flex: 1 0 100%; display: flex; flex-direction: column; align-items: flex-start; } :root .top h1 { flex: none; text-align: start; font-size: calc(32px * var(--fs, 1)); font-weight: 700; letter-spacing: -0.02em; line-height: 1.15; }' } },
  { key: 'barBlur', wins: true, group: 'header', label: 'See-through header and tab bar', bool: true, line: 'Content shows blurred behind them as you scroll (iOS, Instagram).',
    css: `:root .top { background-color: color-mix(in srgb, var(--panel) 72%, transparent); ${blur} } @media (max-width: 600px) { :root .tabs { background: color-mix(in srgb, var(--bg) 70%, transparent); ${blur} } }` },
  { key: 'titleAlign', group: 'header', label: 'Header title', choices: [['default', 'As now (default)'], ['centre', 'Centred (iOS)']], css: { centre: '.top h1 { flex: 1; text-align: center; }' } },

  // Tab bar
  { key: 'tabActiveLabel', group: 'tabs', label: 'Name only the tab you’re on', bool: true, line: 'The other tabs show just their icon (phone width, bottom bar).',
    css: '@media (max-width: 600px) { .tabs button:not([aria-selected="true"]) .lbl { display: none; } }' },
  { key: 'tabIconFill', group: 'tabs', label: 'Fill the current tab’s icon', bool: true, line: 'As iPhone and Android tab bars do.',
    css: ':root .tabs button[aria-selected="true"] .ico { fill: color-mix(in srgb, currentColor 28%, transparent); }' },
  { key: 'tabTone', wins: true, group: 'tabs', label: 'Active tab colour', choices: [['accent', 'My colour (default)'], ['ink', 'Text colour']],
    css: { ink: ':root .tabs button[aria-selected="true"] { color: var(--ink); }' } },

  // Lists and type
  { key: 'listStyle', group: 'lists', label: 'List style', line: 'How Logbook rows sit on the page.', choices: [['default', 'Cards (default)'], ['inset', 'Inset grouped (iOS)'], ['edge', 'Edge to edge (Material, chat apps)']], css: {
    inset: 'ul.cases, .more-list { background: var(--panel); border-radius: calc(12px * var(--round, 1)); overflow: hidden; } ul.cases li { padding-left: 14px; padding-right: 12px; } ul.cases li:last-child { border-bottom: 0; } ul.cases li { border-bottom-color: color-mix(in srgb, var(--ink) 14%, transparent); }',
    edge: 'section.card { border-radius: 0; border-left: 0; border-right: 0; box-shadow: none; margin-left: -12px; margin-right: -12px; } body.compact section.card { margin-left: -8px; margin-right: -8px; } ul.cases li { padding-left: 12px; padding-right: 12px; }' } },
  { key: 'typeStyle', group: 'lists', label: 'Type style', line: 'Weight and spacing of titles.', choices: [['default', 'As now (default)'], ['ios', 'iOS (bold titles, tight)'], ['material', 'Material (medium weight)']], css: {
    ios: ':root .top h1, :root h1, :root h2, :root section.card h2 { font-weight: 700; letter-spacing: -0.02em; } :root .top h1 { font-size: calc(20px * var(--fs, 1)); } body { letter-spacing: -0.01em; }',
    material: ':root .top h1, :root h1, :root h2, :root h3, :root section.card h2 { font-weight: 500; letter-spacing: 0; } .tabs button { letter-spacing: .02em; font-weight: 500; }' } },

  // Plain app headers usually use neutral titles even when their actions have a bright accent.
  // Filled headers keep their contrasting title through --header-ink (set only by headerStyle).
  { key: 'headingTone', wins: true, group: 'lists', label: 'Heading colour', choices: [['accent', 'My colour (default)'], ['ink', 'Text colour']],
    css: { ink: ':root :is(h1, h2, h3), :root section.card h2 { color: var(--ink); } :root .top h1 { color: var(--header-ink, var(--ink)); }' } },

  // Icons (the set first, then the weight, so a chosen weight wins over the set's)
  { key: 'iconSet', group: 'icons', label: 'Icon style', choices: opts(ICON_SETS), css: Object.fromEntries(Object.entries(ICON_SETS).filter(([, s]) => s.css).map(([k, s]) => [k, s.css])) },
  { key: 'iconWeight', group: 'icons', label: 'Icon line weight', choices: [['default', 'Regular (default)'], ['thin', 'Thin'], ['bold', 'Bold']], css: {
    thin: ':root .ico, :root .ico.i { stroke-width: 1.4; }', bold: ':root .ico, :root .ico.i { stroke-width: 2.6; }' } },

  // Motion
  { key: 'pageMotion', group: 'motion', label: 'Moving between pages', line: 'Reduce motion (Accessibility) still turns it off.', choices: opts(PAGE_MOTIONS),
    css: Object.fromEntries(Object.entries(PAGE_MOTIONS).filter(([, m]) => m.vars).map(([k, m]) => [k, `:root { ${m.vars} }`])) },

  // Pop-ups and messages
  { key: 'sheetStyle', wins: true, group: 'popups', label: 'Pop-up boxes', choices: [['default', 'As now (default)'], ['ios', 'iOS sheets (from the bottom, stacked buttons)'], ['material', 'Material dialogs (very round, text buttons)']], css: {
    ios: '@media (max-width: 600px) { :root dialog:not(.full) { margin: auto 0 0; width: 100%; max-width: 100%; border: 0; border-radius: calc(13px * var(--round, 1)) calc(13px * var(--round, 1)) 0 0; padding: 24px 16px calc(16px + env(safe-area-inset-bottom, 0px)); } :root dialog:not(.full)::before { content: ""; position: absolute; top: 7px; left: 50%; width: 36px; height: 5px; margin-left: -18px; border-radius: 3px; background: color-mix(in srgb, var(--muted) 45%, transparent); } :root dialog:not(.full)[open] { animation: sheet-up var(--dur) var(--ease); } :root dialog:not(.full) > .bar:last-child { flex-direction: column; align-items: stretch; gap: 0; margin: 8px -16px 0; } :root dialog:not(.full) > .bar:last-child > .grow { display: none; } :root dialog:not(.full) > .bar:last-child > button { width: 100%; min-height: 54px; margin: 0; border: 0; border-top: 1px solid color-mix(in srgb, var(--ink) 12%, transparent); border-radius: 0; background: none; box-shadow: none; color: var(--accent); font-size: calc(17px * var(--fs, 1)); font-weight: 400; } :root dialog:not(.full) > .bar:last-child > .primary { order: -1; font-weight: 600; } :root dialog:not(.full) > .bar:last-child > .danger { color: var(--err); } } @keyframes sheet-up { from { transform: translateY(100%); } to { transform: none; } }',
    material: ':root dialog:not(.full) { border: 0; border-radius: calc(28px * var(--round, 1)); padding: 24px; box-shadow: 0 8px 28px rgba(0, 0, 0, .22); } :root dialog:not(.full)[open] { animation: dlg-in var(--dur) var(--ease); } :root dialog:not(.full) h2 { font-size: calc(22px * var(--fs, 1)); font-weight: 400; margin-bottom: 14px; } :root dialog:not(.full) > .bar:last-child { justify-content: flex-end; } :root dialog:not(.full) > .bar:last-child > button { border-color: transparent; background: none; color: var(--accent); font-weight: 600; box-shadow: none; } :root dialog:not(.full) > .bar:last-child > button.danger { color: var(--err); } @keyframes dlg-in { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: none; } }' } },
  { key: 'toastStyle', group: 'popups', label: 'Messages (Saved, Undo)', choices: [['default', 'Dark pill at the top (default)'], ['ios', 'iOS banner (frosted, at the top)'], ['material', 'Material snackbar (at the bottom)']], css: {
    ios: `:root #toast { background: color-mix(in srgb, var(--panel) 82%, transparent); color: var(--ink); ${blur} border: 1px solid color-mix(in srgb, var(--ink) 10%, transparent); border-radius: calc(18px * var(--round, 1)); padding: 12px 18px; box-shadow: 0 10px 30px rgba(0, 0, 0, .18); transform: translate(-50%, calc(-100% - 16px)); transition: opacity .25s, transform .45s cubic-bezier(.32, .72, 0, 1); } :root #toast.show { transform: translate(-50%, 0); } :root #toast button { color: var(--accent); }`,
    material: ':root #toast { top: auto; bottom: calc(12px + (var(--tabbar-h) + var(--safe-b, 0px)) / var(--ui-zoom, 1)); left: 12px; right: 12px; transform: translateY(16px); max-width: none; justify-content: space-between; min-height: 48px; padding: 6px 8px 6px 16px; border-radius: calc(4px * var(--round, 1)); background: #313033; color: #f4eff4; box-shadow: 0 3px 10px rgba(0, 0, 0, .3); } :root #toast.show { transform: none; } :root #toast button { color: color-mix(in srgb, var(--accent) 40%, #ffffff); } @media (min-width: 601px) { :root #toast { left: 24px; right: auto; bottom: 24px; min-width: 344px; max-width: 560px; } }' } },

  // Controls
  { key: 'fieldStyle', wins: true, group: 'controls', label: 'Text boxes', choices: [['default', 'Rounded box (default)'], ['ios', 'iOS (grey fill, no line)'], ['filled', 'Material filled (line underneath)'], ['outlined', 'Material outline (thin, square-ish)']], css: {
    ios: `${fields()} { border-color: transparent; background-color: color-mix(in srgb, var(--muted) 14%, var(--panel)); border-radius: calc(10px * var(--round, 1)); } ${fields(':focus')} { outline: 0; border-color: transparent; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent); }`,
    filled: `${fields()} { border-color: transparent; border-bottom-color: var(--muted); border-radius: calc(4px * var(--round, 1)) calc(4px * var(--round, 1)) 0 0; background-color: color-mix(in srgb, var(--ink) 6%, var(--panel)); } ${fields(':focus')} { outline: 0; border-color: transparent; border-bottom-color: var(--accent); box-shadow: inset 0 -2px 0 var(--accent); }`,
    outlined: `${fields()} { border-color: var(--muted); border-radius: calc(4px * var(--round, 1)); background-color: transparent; } ${fields(':focus')} { outline: 0; border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }` } },
  { key: 'checkStyle', group: 'controls', label: 'Tick boxes', choices: [['default', 'The device’s own (default)'], ['round', 'Round (iOS)'], ['square', 'Square (Material)']], css: {
    round: `${TICK} { appearance: none; -webkit-appearance: none; display: inline-grid; place-content: center; flex: none; margin: 0; width: 22px; height: 22px; border: 1.5px solid var(--muted); border-radius: 50%; background: var(--panel); cursor: pointer; } ${TICK}::before { content: ""; width: 5px; height: 10px; margin-top: -2px; border: solid var(--accent-ink); border-width: 0 2px 2px 0; transform: rotate(45deg); opacity: 0; } ${TICK}:checked { background: var(--accent); border-color: var(--accent); } ${TICK}:checked::before { opacity: 1; } ${TICK}:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`,
    square: `${TICK} { appearance: none; -webkit-appearance: none; display: inline-grid; place-content: center; flex: none; margin: 0; width: 18px; height: 18px; border: 2px solid var(--muted); border-radius: calc(2px * var(--round, 1)); background: transparent; cursor: pointer; } ${TICK}::before { content: ""; width: 4px; height: 9px; margin-top: -2px; border: solid var(--accent-ink); border-width: 0 2px 2px 0; transform: rotate(45deg); opacity: 0; } ${TICK}:checked { background: var(--accent); border-color: var(--accent); } ${TICK}:checked::before { opacity: 1; } ${TICK}:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }` } },
  { key: 'switchStyle', group: 'controls', label: 'Switches', line: 'The on / off switches in Settings.', choices: [['default', 'As now (default)'], ['ios', 'iOS (green, round)'], ['material', 'Material (outlined, big knob)']], css: {
    ios: `${SWITCH} { width: 51px; height: 31px; border-radius: 16px; } ${SWITCH}::before { top: 2px; left: 2px; width: 27px; height: 27px; box-shadow: 0 2px 4px rgba(0, 0, 0, .25); } ${SWITCH}:checked { background: #34c759; } ${SWITCH}:checked::before { transform: translateX(20px); }`,
    material: `${SWITCH} { width: 52px; height: 32px; border-radius: 16px; background: var(--panel); box-shadow: inset 0 0 0 2px var(--muted); } ${SWITCH}::before { top: 8px; left: 8px; width: 16px; height: 16px; background: var(--muted); box-shadow: none; } ${SWITCH}:checked { background: var(--accent); box-shadow: none; } ${SWITCH}:checked::before { width: 24px; height: 24px; top: 4px; left: 4px; background: #fff; transform: translateX(20px); }` } },
  { key: 'pressStyle', group: 'controls', label: 'When you press', line: 'What buttons and rows do under your finger.', choices: [['default', 'Dim (default)'], ['highlight', 'Grey highlight (Material)'], ['none', 'No change']], css: {
    highlight: ':root :is(button, .btn, .chip, [role=button]):not(:disabled):active { opacity: 1; background-color: color-mix(in srgb, var(--ink) 12%, var(--panel)); }',
    none: ':root :is(button, .btn, .chip, [role=button]):not(:disabled):active { opacity: 1; } :root :is(ul.cases > li:not(.monthhead), .more-list a, .picker li, details > summary, ul.ready-list li, .notes-list li):active { background-color: transparent; }' } },
];
export const FACET_KEYS = FACETS.map(f => f.key);
export const facet = k => FACETS.find(f => f.key === k);
export const facetDefault = f => (f.bool ? null : f.choices[0][0]);
// a facet's value if it is one of its choices (true for a switch), else null (the default)
export function cleanFacet(k, v) {
  const f = facet(k);
  if (!f || v == null) return null;
  if (f.bool) return v === true ? true : null;
  return f.choices.some(([c]) => c === v) && v !== facetDefault(f) ? v : null;
}
export const facetValid = (k, v) => v == null || cleanFacet(k, v) !== null || (!facet(k)?.bool && v === facetDefault(facet(k)));
// the CSS of the chosen facets, in FACETS order, in cascade layers (index.html): most compete with style.css as they
// always have (the base layer, after it: the more specific rule wins), so the app's own special cases stay; a facet
// with wins: true goes in the facets layer, over all of style.css (no :root stacking), each in its own sub-layer so
// a later facet wins (tabTone over tabStyle)
export function facetCss(d = {}) {
  const out = [];
  for (const f of FACETS) {
    const v = cleanFacet(f.key, d[f.key]);
    if (v == null || !f.css) continue;
    const css = f.bool ? f.css : f.css[v];
    if (css) out.push(f.wins ? `@layer facets { @layer ${f.key} { ${css} } }` : `@layer base { ${css} }`);
  }
  return out.filter(Boolean);
}

// The old Compact mode switch (compact: true) is Spacing: Tight now ('compact'; it looked the same with any spacing,
// its rules being the more specific). The key stays readable: a device, a settings file or a saved theme that still
// has it is folded on reading. -> the same object if there is nothing to fold
export function foldCompact(o) {
  if (!o || typeof o !== 'object' || !('compact' in o)) return o;
  const { compact, ...rest } = o;
  return compact === true ? { ...rest, spacing: 'compact' } : rest;
}

// Fine-tune (Themes → Fine-tune; theme-revamp S2): single size values over the spacing preset, unset (null) by
// default, per device; a theme may set them too (checkTheme: in range only). Their CSS goes in the tune layer
// (index.html), after the theme's and before the resident's custom CSS. from: where the slider starts while unset.
const NOT_BTN = ':not(.link, .linkish, .small, .big, .chip, .note-flag, .demo-flag, .tabs *)';
export const FINE_TUNE = [
  { key: 'ftBtn', label: 'Button height', unit: 'px', min: 32, max: 56, step: 2, from: 40,
    css: v => `:is(button, .btn)${NOT_BTN} { min-height: ${v}px; } html.big-taps .log-card :is(button, .btn)${NOT_BTN} { min-height: max(${v}px, 44px); }` },
  { key: 'ftGap', label: 'Gaps', line: 'Between buttons and tags.', unit: 'px', min: 2, max: 16, step: 1, from: 8,
    css: v => `.bar, .chips, .actions, .datebar { gap: ${v}px; }` },
  { key: 'ftLine', label: 'Line weight', line: 'Card, row and box lines.', unit: 'px', min: 0, max: 3, step: 0.5, from: 1,
    css: v => `section.card, .log-card, :is(input:not([type=checkbox], [type=radio], [type=range], [type=color]), select, textarea) { border-width: ${v}px; } ul.cases li { border-bottom-width: ${v}px; }` },
  { key: 'ftShadow', label: 'Shadow', line: 'Under the cards.', unit: '', min: 0, max: 4, step: 1, from: 0,
    css: v => `section.card { box-shadow: ${v ? `0 ${v}px ${v * 4}px rgba(0, 0, 0, ${(0.04 + 0.03 * v).toFixed(2)})` : 'none'}; }` },
  { key: 'ftCases', label: 'Space between cases', unit: 'px', min: 0, max: 20, step: 1, from: 10,
    css: v => `ul.cases > li:not(.monthhead) { padding-top: ${v}px; padding-bottom: ${v}px; }` },
  { key: 'ftDays', label: 'Space between days', line: 'Above each day or month heading in the Logbook.', unit: 'px', min: 0, max: 32, step: 2, from: 0,
    css: v => `ul.cases > li.monthhead:not(:first-child) { margin-top: ${v}px; }` },
  { key: 'ftLetter', label: 'Letter spacing', unit: 'em', min: -0.03, max: 0.08, step: 0.01, from: 0,
    css: v => `body { letter-spacing: ${v}em; }` },
  { key: 'ftWeight', label: 'Text weight', unit: '', min: 300, max: 600, step: 100, from: 400,
    css: v => `body { font-weight: ${v}; }` },
];
export const TUNE_KEYS = FINE_TUNE.map(t => t.key);
// a Fine-tune value if it is a number in range on its step, else null (unset)
export function cleanTune(k, v) {
  const t = FINE_TUNE.find(x => x.key === k);
  if (!t || typeof v !== 'number' || !Number.isFinite(v) || v < t.min - 1e-9 || v > t.max + 1e-9) return null;
  const n = (v - t.min) / t.step;
  return Math.abs(n - Math.round(n)) < 1e-6 ? Math.round(v * 1000) / 1000 : null;
}
// the CSS of the set Fine-tune values (nothing when none is set)
export function tuneCss(d = {}) {
  const css = FINE_TUNE.map(t => { const v = cleanTune(t.key, d[t.key]); return v == null ? '' : t.css(v); }).filter(Boolean);
  return css.length ? `@layer tune {\n${css.join('\n')}\n}` : '';
}
