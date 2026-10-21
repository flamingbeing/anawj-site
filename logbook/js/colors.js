// Colour theme from one accent colour (Settings → Themes → Colour): the light and dark palettes are
// worked out here so text and buttons stay readable whatever is picked. Pure, unit-tested.
//
// Light: the accent is darkened until white text on it (and it as text on white) reaches 4.5:1.
// Dark and OLED: neutral greys (no tinted backgrounds), near-white text, and the accent lightened
// until it reaches 7:1 on the cards, with dark text on accent buttons.

export const DEFAULT_ACCENT = '#002f6c';   // NUHS navy
export const PRESETS = [
  ['#002f6c', 'Navy'], ['#2563eb', 'Blue'], ['#0f766e', 'Teal'], ['#3f7d4e', 'Green'],
  ['#6d4fc2', 'Purple'], ['#c2417a', 'Pink'], ['#c2410c', 'Orange'], ['#27272a', 'Graphite'],
];

// Settings → Themes → Colour: suggested colours (owner, 15 Oct 2026): the NUH ones as they are, muted ones, and
// pastels (the palette below darkens a pastel for text and buttons, so it shows as a soft tint), then Custom
export const SWATCHES = [
  ['NUH', [['#002f6c', 'NUHS navy (default)'], ['#e57200', 'NUH orange'], ['#e4002b', 'NUH red'], ['#178fd7', 'NUH blue']]],
  ['Muted', [['#4f7f7a', 'Muted teal'], ['#7d9a78', 'Sage'], ['#8a7a9e', 'Dusty purple'], ['#5b6b7c', 'Slate']]],
  ['Pastel', [['#f4c2d0', 'Blush pink'], ['#cdbfe8', 'Lavender'], ['#bfe5d3', 'Mint'], ['#f8cfb4', 'Peach'], ['#bcd7ef', 'Powder blue'], ['#f6e7a6', 'Butter yellow']]],
];
const HEX = /^#[0-9a-f]{6}$/i;
export const cleanAccent = c => (HEX.test(String(c || '')) ? String(c).toLowerCase() : null);
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };   // t of b
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const luminance = h => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
// HSL, so lightening keeps the hue vivid (mixing with white washes it out to grey)
const toHsl = h => {
  const [r, g, b] = rgb(h).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hh * 60 + 360) % 360, s, l];
};
const fromHsl = ([hh, s, l]) => {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  return hex([r + m, g + m, b + m].map(v => v * 255));
};
// change lightness in small steps until the colour reaches `ratio` against `on` (dir +1 lighter, -1 darker)
const until = (c, dir, on, ratio) => {
  let [hh, s, l] = toHsl(c), x = c;
  if (dir > 0 && s > 0.15) s = Math.max(s, 0.55);   // a dark, muted pick still reads as a colour when lightened
  for (let i = 0; i < 60 && contrast(x, on) < ratio; i++) { l = Math.max(0, Math.min(1, l + dir * 0.015)); x = fromHsl([hh, s, l]); }
  return x;
};

export function lightPalette(accent) {
  const a = until(accent, -1, '#ffffff', 4.5);
  return {
    bg: mix('#f3f3f3', a, 0.03), panel: '#ffffff', ink: '#2b2f33', muted: '#5f666e', line: '#dddfe2',
    accent: a, 'accent-ink': '#ffffff', 'accent-soft': mix(a, '#ffffff', 0.88), chip: mix(a, '#ffffff', 0.92), 'chip-on': a,
    info: a, 'info-bg': mix(a, '#ffffff', 0.9), 'row-alt': mix('#f8f9fb', a, 0.02), heading: a,
    s1: mix(a, '#ffffff', 0.7), s2: mix(a, '#ffffff', 0.45), s3: mix(a, '#ffffff', 0.2), s4: a,
  };
}

export function darkPalette(accent, oled = false) {
  const panel = oled ? '#000000' : '#1b1e23';
  const a = until(accent, +1, panel, 7);
  const ink = oled ? '#000000' : '#0d0f12';
  return {
    bg: oled ? '#000000' : '#121417', panel, ink: '#eef0f3', muted: '#b8c0c9', line: oled ? '#30343b' : '#363b43',
    accent: a, 'accent-ink': ink, 'accent-soft': mix(panel, a, 0.2), chip: mix(panel, a, 0.12), 'chip-on': a,
    info: a, 'info-bg': mix(panel, a, 0.14), 'row-alt': oled ? '#0a0a0b' : '#202329', heading: a,
    'input-bg': oled ? '#0a0a0b' : '#15181c',
    s1: mix(a, panel, 0.6), s2: mix(a, panel, 0.4), s3: mix(a, panel, 0.2), s4: a,
  };
}

const decl = p => Object.entries(p).map(([k, v]) => `--${k}: ${v};`).join(' ');
const STATUS = { light: { ok: '#1a7f37', warn: '#8a5a00', err: '#b42318' }, dark: { ok: '#74dd90', warn: '#f3c46e', err: '#ff9a8f' } };
const NUH_STRIPE = { s1: '#e57200', s2: '#e4002b', s3: '#178fd7', s4: '#002f6c' };
// NUHS, the default look (TE S4): its palettes written out in full, as any theme's would be, so nothing in the
// generator below treats the navy specially. These are the colours NUHS has always shown (the light ink and the tints
// made from the navy by lightPalette, the grey page and lines of style.css, the NUH stripe in every appearance);
// test/e2e/nuhs-baseline.mjs holds the pages to them.
export const NUHS = {
  light: {
    bg: '#f3f3f3', panel: '#ffffff', ink: '#2b2f33', muted: '#5f666e', line: '#dddddd',
    accent: '#002f6c', 'accent-ink': '#ffffff', 'accent-soft': '#e0e6ed', chip: '#ebeef3', 'chip-on': '#002f6c',
    info: '#002f6c', 'info-bg': '#e6eaf0', 'row-alt': '#f8f9fb', heading: '#002f6c', ...STATUS.light, ...NUH_STRIPE,
  },
  dark: {
    bg: '#121417', panel: '#1b1e23', ink: '#eef0f3', muted: '#b8c0c9', line: '#363b43',
    accent: '#69abff', 'accent-ink': '#0d0f12', 'accent-soft': '#2b3a4f', chip: '#242f3d', 'chip-on': '#69abff',
    info: '#69abff', 'info-bg': '#263242', 'row-alt': '#202329', heading: '#69abff', 'input-bg': '#15181c', ...STATUS.dark, ...NUH_STRIPE,
  },
  oled: {
    bg: '#000000', panel: '#000000', ink: '#eef0f3', muted: '#b8c0c9', line: '#30343b',
    accent: '#4b99ff', 'accent-ink': '#000000', 'accent-soft': '#0f1f33', chip: '#09121f', 'chip-on': '#4b99ff',
    info: '#4b99ff', 'info-bg': '#0b1524', 'row-alt': '#0a0a0b', heading: '#4b99ff', 'input-bg': '#0a0a0b', ...STATUS.dark, ...NUH_STRIPE,
  },
};
// the colours made from the accent and the cards (as lightPalette and darkPalette make them)
const fromAccent = (side, a, panel) => (side === 'light'
  ? { 'accent-soft': mix(a, panel, 0.88), chip: mix(a, panel, 0.92), 'chip-on': a, info: a, 'info-bg': mix(a, panel, 0.9), heading: a }
  : { 'accent-soft': mix(panel, a, 0.2), chip: mix(panel, a, 0.12), 'chip-on': a, info: a, 'info-bg': mix(panel, a, 0.14), heading: a });
// Colour roles (TE S4): a filled button and the text on it, links, the focus ring and selected text. Each follows the
// accent (focus: the heading colour on light pages, as before) unless a theme or Edit colours sets it.
export const ROLE_TOKENS = ['fill', 'onFill', 'link', 'focus', 'selection'];
const cssName = k => k.replace(/[A-Z]/g, c => '-' + c.toLowerCase());   // accentInk -> accent-ink
function withRoles(p, side, own = {}) {
  const out = { ...p, fill: own.fill || p.accent, 'on-fill': own.onFill || p['accent-ink'], link: own.link || p.accent, focus: own.focus || (side === 'light' ? p.heading : p.accent) };
  if (own.selection) out.selection = own.selection;
  return out;
}
// A colour other than the navy makes its own palettes; the navy (or none) is NUHS's
const accentOf = look => { const c = cleanAccent(look?.accent); return c && c !== DEFAULT_ACCENT ? c : null; };
// The one palette for an appearance ('light', 'dark' or 'oled'), after everything that can change it: NUHS's or the
// accent's, then the background tint (not on OLED, which stays black), then the look's own colours; the colours made
// from the accent and the cards are made again from the final ones if those changed (a theme's own dark accent, a
// cream card), then the roles. Used for the page's CSS, the contrast checks, previews and the status bar.
export function resolvePalette(look = {}, appearance = 'light', tint = {}) {
  const side = appearance === 'light' ? 'light' : 'dark', a = accentOf(look);
  const base = a ? { ...(side === 'light' ? lightPalette(a) : darkPalette(a, appearance === 'oled')), ...STATUS[side] } : NUHS[appearance] || NUHS.light;
  const own = cleanColours(look?.colours)[side] || {};
  const p = { ...base, ...(appearance === 'oled' ? {} : tint?.[side]) };
  for (const k of COLOUR_TOKENS) if (own[k]) p[cssName(k)] = own[k];
  if (p.accent !== base.accent || p.panel !== base.panel) Object.assign(p, fromAccent(side, p.accent, p.panel));
  return withRoles(p, side, own);
}
// The page's colours (display.js puts them in the theme layer, index.html: cascade layers, which wins over the base
// palettes in style.css): light, dark (data-theme dark, or auto with a dark phone) and OLED (data-oled), each complete.
export function paletteCss(look = {}, tint = {}) {
  const L = resolvePalette(look, 'light', tint), D = resolvePalette(look, 'dark', tint), O = resolvePalette(look, 'oled', tint);
  // selected text: only when a look sets it (else the browser's own); the other appearance then uses its soft accent
  const sel = L.selection || D.selection;
  if (sel) for (const p of [L, D, O]) p.selection ||= p['accent-soft'];
  return [
    `:root { ${decl(L)} }`,
    `:root[data-theme="dark"] { ${decl(D)} }`,
    `:root[data-theme="dark"][data-oled] { ${decl(O)} }`,
    `@media (prefers-color-scheme: dark) { :root[data-theme="auto"] { ${decl(D)} } }`,
    sel ? '::selection { background: var(--selection); color: var(--ink); }' : '',
  ].filter(Boolean).join('\n');
}

// One colour per tab, everything in it (Settings → Themes → Colourful): the same palettes as the colour picker,
// scoped to the pages of one tab (scope: 'body[data-bar="log"]'), for light, dark, OLED and auto
export function tabSchemeCss(accent, scope) {
  const c = cleanAccent(accent) || DEFAULT_ACCENT;
  const L = lightPalette(c), D = darkPalette(c), O = darkPalette(c, true);
  for (const p of [L, D, O]) for (const k of ['s1', 's2', 's3', 's4']) delete p[k];   // the stripe at the top stays as it is
  // (the roles too, so the tab's buttons, links and focus ring follow its colour)
  return [
    `html.colour-all ${scope} { ${decl(withRoles(L, 'light'))} }`,
    `html.colour-all[data-theme="dark"] ${scope} { ${decl(withRoles(D, 'dark'))} }`,
    `html.colour-all[data-theme="dark"][data-oled] ${scope} { ${decl(withRoles(O, 'dark'))} }`,
    `@media (prefers-color-scheme: dark) { html.colour-all[data-theme="auto"] ${scope} { ${decl(withRoles(D, 'dark'))} } }`,
  ].join('\n');
}

// The --t-* tab colours for "tabs and headings": each tab's accent as the light and dark palettes work it out
export function tabVarsCss(colours) {
  const v = pal => Object.entries(colours).map(([t, c]) => `--t-${t}: ${pal(c).accent};`).join(' ');
  const dark = v(c => darkPalette(c));
  return [`html.colourful { ${v(c => lightPalette(c))} }`, `html.colourful[data-theme="dark"] { ${dark} }`,
    `@media (prefers-color-scheme: dark) { html.colourful[data-theme="auto"] { ${dark} } }`].join('\n');
}

// Optional full colour tokens. Only known six-digit hex values reach CSS or a themes file. (The roles, ROLE_TOKENS,
// are kept beside them; theme links list them after the rest, my-themes.js LINK_KEYS.)
export const COLOUR_TOKENS = ['bg', 'panel', 'ink', 'muted', 'line', 'accent', 'accentInk', 'ok', 'warn', 'err'];
export const EDIT_TOKENS = [...COLOUR_TOKENS, ...ROLE_TOKENS];
export function cleanColours(value) {
  const out = {};
  for (const side of ['light', 'dark']) {
    const got = value?.[side];
    if (!got || typeof got !== 'object' || Array.isArray(got)) continue;
    const tokens = {};
    for (const k of EDIT_TOKENS) if (Object.hasOwn(got, k) && typeof got[k] === 'string' && cleanAccent(got[k])) tokens[k] = cleanAccent(got[k]);
    if (Object.keys(tokens).length) out[side] = tokens;
  }
  return out;
}
// The effective editable tokens (resolvePalette, with the names Edit colours uses: accentInk, onFill).
export function colourPalette(d = {}, side = 'light', tint = {}, oled = false) {
  const p = resolvePalette(d, side === 'dark' ? (oled ? 'oled' : 'dark') : 'light', tint);
  return { ...p, accentInk: p['accent-ink'], onFill: p['on-fill'] };
}
// The pairs checked for contrast: text 4.5:1 always; a role's pairs only once a look sets that role (the focus ring
// 3:1 against the page, as WCAG asks of outlines)
const PAIRS = [['ink', 'bg'], ['ink', 'panel'], ['muted', 'bg'], ['muted', 'panel'], ['accentInk', 'accent']];
const ROLE_PAIRS = { fill: [['onFill', 'fill']], onFill: [['onFill', 'fill']], link: [['link', 'panel'], ['link', 'bg']], focus: [['focus', 'bg', 3]], selection: [['ink', 'selection']] };
export function colourChecks(d = {}, tint = {}, oled = false) {
  const out = [];
  for (const side of ['light', 'dark']) {
    const p = colourPalette(d, side, tint, oled), overrides = cleanColours(d.colours)[side] || {};
    const roles = ROLE_TOKENS.filter(k => overrides[k]).flatMap(k => ROLE_PAIRS[k]);
    const pairs = [...PAIRS, ...roles.filter((r, i) => roles.findIndex(x => x[0] === r[0] && x[1] === r[1]) === i)];
    for (const [fg, bg, need = 4.5] of pairs) {
      out.push({ side, fg, bg, need, ratio: contrast(p[fg], p[bg]), changed: !!(overrides[fg] || overrides[bg]) });
    }
  }
  return out;
}
export function checkColours(d = {}, tint = {}) {
  // Existing looks stay unchanged; full colour looks must pass in both modes, including OLED.
  if (!Object.keys(cleanColours(d.colours)).length) return;
  const failed = [...colourChecks(d, tint), ...colourChecks(d, tint, true).filter(p => p.side === 'dark')].find(p => p.ratio < p.need);
  if (failed) throw new Error(`${failed.side === 'light' ? 'Light' : 'Dark'} ${failed.fg} on ${failed.bg}: ${failed.ratio.toFixed(2)}:1 (needs ${failed.need}:1)`);
}
