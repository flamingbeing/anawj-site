// Colour theme from one accent colour (Settings → Display → Colour): the light and dark palettes are
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
// The CSS for an accent: light, dark (data-theme dark, or auto with a dark phone) and OLED (data-oled).
// :root:root wins over the base palettes in style.css even when this sheet comes first (first paint).
// The default accent keeps the NUHS stripe and light palette from style.css.
export function schemeCss(accent) {
  const c = cleanAccent(accent) || DEFAULT_ACCENT;
  const L = lightPalette(c), D = darkPalette(c), O = darkPalette(c, true);
  if (c === DEFAULT_ACCENT) { for (const k of ['bg', 'line', 'row-alt', 's1', 's2', 's3', 's4']) delete L[k]; delete D.s1; delete D.s2; delete D.s3; delete D.s4; delete O.s1; delete O.s2; delete O.s3; delete O.s4; }
  return [
    `:root:root { ${decl(L)} }`,
    `:root:root[data-theme="dark"] { ${decl(D)} }`,
    `:root:root[data-theme="dark"][data-oled] { ${decl(O)} }`,
    `@media (prefers-color-scheme: dark) { :root:root[data-theme="auto"] { ${decl(D)} } }`,
  ].join('\n');
}

// One colour per tab, everything in it (Settings → Display → Colourful): the same palettes as the colour picker,
// scoped to the pages of one tab (scope: 'body[data-bar="log"]'), for light, dark, OLED and auto
export function tabSchemeCss(accent, scope) {
  const c = cleanAccent(accent) || DEFAULT_ACCENT;
  const L = lightPalette(c), D = darkPalette(c), O = darkPalette(c, true);
  for (const p of [L, D, O]) for (const k of ['s1', 's2', 's3', 's4']) delete p[k];   // the stripe at the top stays as it is
  return [
    `html.colour-all ${scope} { ${decl(L)} }`,
    `html.colour-all[data-theme="dark"] ${scope} { ${decl(D)} }`,
    `html.colour-all[data-theme="dark"][data-oled] ${scope} { ${decl(O)} }`,
    `@media (prefers-color-scheme: dark) { html.colour-all[data-theme="auto"] ${scope} { ${decl(D)} } }`,
  ].join('\n');
}

// The --t-* tab colours for "tabs and headings": each tab's accent as the light and dark palettes work it out
export function tabVarsCss(colours) {
  const v = pal => Object.entries(colours).map(([t, c]) => `--t-${t}: ${pal(c).accent};`).join(' ');
  const dark = v(c => darkPalette(c));
  return [`html.colourful { ${v(c => lightPalette(c))} }`, `html.colourful[data-theme="dark"] { ${dark} }`,
    `@media (prefers-color-scheme: dark) { html.colourful[data-theme="auto"] { ${dark} } }`].join('\n');
}
