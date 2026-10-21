// Wallpaper (Settings → Themes → Wallpaper; theme-revamp S4, owner 20 Oct 2026): a built-in pattern or your own
// photo behind every page, with a dim. Text that sits on the page itself (hints, the version line) stays at 4.5:1 or
// better on its own soft backing (the scrim, scrimFor), so the picture itself is dimmed only as much as you choose
// (TE S3, owner 21 Oct 2026: the old way raised the whole dim to the floor, often 70-90%, and washed photos out).
// The floor is what minDim works out from the wallpaper's colours and the palette in use (light, dark, OLED, tints);
// Flat cards (no card behind any text) still raise the whole dim to it. Pattern strength (wallInk) and see-through
// cards (wallFrost: frosted, the panel at 80% or more as frostAlpha needs) are TE S3 too. The photo is kept on this device only (IndexedDB, like
// uploaded fonts), made smaller first, and never uploaded or synced; a theme may set a pattern, never a photo.
// Colours from the wallpaper (W2): the photo's main colour, or one tapped on it, becomes the accent (colors.js
// works out the palettes). The pure part is unit-tested (test/wallpaper.test.mjs); style.css draws the layers
// (html.wall::before the picture, ::after the dim), lookCss (themes.js) a pattern, display.js applyWallpaper the rest.

import { contrast, mix, cleanAccent } from './colors.js';

// pattern: CSS custom properties for html.wall::before; ink: [token, % of it over the page colour at the faintest
// strength], so the test (and minDim) can check text on it; wallInk sets the % (INK_MIN to INK_MAX)
export const PATTERNS = {
  dots: { label: 'Dots', ink: ['ink', 6], css: p => `--wall: radial-gradient(${p} 1.2px, transparent 1.7px); --wall-size: 18px 18px; --wall-repeat: repeat;` },
  grid: { label: 'Grid', ink: ['ink', 6], css: p => `--wall: linear-gradient(${p} 1px, transparent 1px), linear-gradient(90deg, ${p} 1px, transparent 1px); --wall-size: 24px 24px; --wall-repeat: repeat;` },
  paper: { label: 'Paper lines', ink: ['accent', 6], css: p => `--wall: repeating-linear-gradient(transparent 0 27px, ${p} 27px 28px); --wall-size: auto; --wall-repeat: repeat;` },
  gradient: { label: 'Soft gradient', ink: ['accent', 6], css: p => `--wall: linear-gradient(160deg, ${p}, transparent 55%, ${p});--wall-size: cover; --wall-repeat: no-repeat;` },
};
export const WALLPAPERS = [['none', 'None (default)'], ...Object.entries(PATTERNS).map(([k, p]) => [k, p.label]), ['photo', 'Your own photo']];
export const cleanPattern = v => (typeof v === 'string' && Object.hasOwn(PATTERNS, v) ? v : null);
export const cleanWall = v => (v === 'photo' ? 'photo' : cleanPattern(v));
// pattern strength: the % of its ink colour (6, the faintest, unless set; steps of 6)
export const INK_MIN = 6, INK_MAX = 36, INK_STEP = 6;
export const cleanInk = v => (Number.isInteger(v) && v >= INK_MIN && v <= INK_MAX && v % INK_STEP === 0 ? v : null);
export const inkOf = d => cleanInk(d?.wallInk) ?? INK_MIN;
// the dim: the page colour laid over the wallpaper, in % (0 to 90, steps of 5); unset: 40 for a photo, none for a pattern
export const DIM_MAX = 90;
export const cleanDim = v => (Number.isInteger(v) && v >= 0 && v <= DIM_MAX && v % 5 === 0 ? v : null);
export const dimOf = d => cleanDim(d.wallDim) ?? (cleanWall(d.wallpaper) === 'photo' ? 40 : 0);

// the CSS for a pattern (the theme layer, after the colours, so it follows light and dark), or ''
export function patternCss(d = {}) {
  const k = cleanPattern(d.wallpaper);
  if (!k) return '';
  return `:root { ${PATTERNS[k].css(`color-mix(in srgb, var(--${PATTERNS[k].ink[0]}) ${inkOf(d)}%, transparent)`)} }`;
}
// a pattern's colours over a palette, at its strongest: what text on the page may sit on (pct: its strength)
export const patternSamples = (k, pal, pct) => { const p = PATTERNS[k]; return p && pal[p.ink[0]] ? [pal.bg, mix(pal.bg, pal[p.ink[0]], (cleanInk(pct) ?? p.ink[1]) / 100)] : [pal.bg]; };

// The lowest dim (0 to 1, in 0.05 steps) at which every text colour on the page (ink, muted, accent) reaches 4.5:1 on
// every wallpaper colour once the page colour is laid over it at that strength; a text colour already under 4.5:1 on
// the plain page (a link in some colours) may lose no more than 5% of what it has. pal: { bg, ink, muted, accent } as
// #rrggbb. samples: #rrggbb colours.
export const TEXT_RATIO = 4.5;
export const textNeed = plain => (plain >= TEXT_RATIO ? TEXT_RATIO : plain * 0.95);
export function minDim(samples, pal) {
  const texts = ['ink', 'muted', 'accent'].map(k => pal[k]).filter(c => cleanAccent(c));
  if (!cleanAccent(pal.bg) || !texts.length) return 0;
  const need = texts.map(t => textNeed(contrast(t, pal.bg)));
  const ok = dim => samples.every(s => { const under = mix(s, pal.bg, dim); return texts.every((t, i) => contrast(t, under) >= need[i] - 1e-9); });
  for (let i = 0; i <= 20; i++) if (ok(i / 20)) return i / 20;
  return 1;
}

// The backing for text on the bare page (0 to 1, in 0.05 steps, rounded up): the page colour laid over what shows
// through the dim, enough that together they reach the floor (1 - (1 - dim)(1 - scrim) >= floor)
export const scrimFor = (floor, dim) => (dim >= floor || dim >= 1 ? 0 : Math.min(1, Math.ceil(((floor - dim) / (1 - dim)) * 20 - 1e-9) / 20));
// See-through cards: how much of the card colour covers the wallpaper (FROST, more if that's what keeps every text
// colour on a card at 4.5:1 over every wallpaper colour once dimmed). samples: #rrggbb; pal: { bg, panel, ink, muted,
// accent }; dim: 0 to 1.
export const FROST = 0.8;
export function frostAlpha(samples, dim, pal) {
  if (!cleanAccent(pal.panel) || !cleanAccent(pal.bg) || !samples.length) return FROST;
  return Math.max(FROST, minDim(samples.map(s => mix(s, pal.bg, dim)), { ...pal, bg: pal.panel }));
}

// The photo's main colour (W2, "automatic"): the hue that covers most of it among colours with some colour in them
// (greys, near-black and near-white don't count), as the average of that hue's samples; null for a grey photo
export function mainColour(samples) {
  const bins = new Map();
  for (const s of samples) {
    if (!cleanAccent(s)) continue;
    const [r, g, b] = [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    const sat = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    if (sat < 0.25 || l < 0.12 || l > 0.9) continue;
    const hue = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const bin = Math.floor(hue * 2) % 12;   // twelve 30° hues
    const e = bins.get(bin) || { n: 0, w: 0, rgb: [0, 0, 0] };
    const w = sat;   // more colourful samples count for more
    e.n++; e.w += w; e.rgb = e.rgb.map((v, i) => v + [r, g, b][i] * w);
    bins.set(bin, e);
  }
  const best = [...bins.values()].sort((a, b) => b.w - a.w)[0];
  if (!best || best.n < Math.max(2, samples.length * 0.03)) return null;
  return '#' + best.rgb.map(v => Math.round((v / best.w) * 255).toString(16).padStart(2, '0')).join('');
}
// a pixel's colour (r, g, b, 0 to 255) as #rrggbb
export const hexOf = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
// a colour from the page's computed style (#rgb, #rrggbb or rgb()) as #rrggbb, or null
export function cssHex(v) {
  const s = String(v || '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return '#' + [...s.slice(1)].map(c => c + c).join('');
  const m = s.match(/^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/);
  return m ? hexOf(+m[1], +m[2], +m[3]) : null;
}

// ---- browser side ----

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;   // what can be picked; it is kept much smaller
const LONG_SIDE = 1600, GRID = 32;
// the photo: IndexedDB 'apmes-logbook-wall', store 'files', key 'photo' -> { name, blob (JPEG), samples (#rrggbb, 32 × 32) }
const DB = 'apmes-logbook-wall';
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
const tx = async (mode, fn) => { const d = await db(); return new Promise((resolve, reject) => { const t = d.transaction('files', mode); const req = fn(t.objectStore('files')); t.oncomplete = () => { d.close(); resolve(req && req.result); }; t.onerror = () => { d.close(); reject(t.error); }; }); };
export const getPhoto = () => tx('readonly', s => s.get('photo')).catch(() => null);
export const putPhoto = rec => tx('readwrite', s => s.put(rec, 'photo'));
export const deletePhoto = () => tx('readwrite', s => s.delete('photo')).catch(() => {});

// a picked image file: made at most 1600 px on its long side (JPEG), its colours sampled, then kept; throws a message
export async function savePhoto(file) {
  if (!/^image\//.test(file.type || '') && !/\.(jpe?g|png|webp|gif|heic|avif)$/i.test(file.name || '')) throw new Error('Choose a picture (a photo or an image file)');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('That picture is over 25 MB');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url;
    try { await img.decode(); } catch { throw new Error('That file could not be read as a picture'); }
    const k = Math.min(1, LONG_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
    if (!blob) throw new Error('That picture could not be made smaller');
    const rec = { name: String(file.name || 'photo').slice(0, 80), blob, samples: samplesOf(c) };
    await putPhoto(rec);
    return rec;
  } finally { URL.revokeObjectURL(url); }
}
// the colours of a 32 × 32 version of a picture (each one the average of its patch)
export function samplesOf(source) {
  const c = document.createElement('canvas'); c.width = GRID; c.height = GRID;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(source, 0, 0, GRID, GRID);
  const px = x.getImageData(0, 0, GRID, GRID).data, out = [];
  for (let i = 0; i < px.length; i += 4) out.push(hexOf(px[i], px[i + 1], px[i + 2]));
  return out;
}
// the colour around a point of an <img> (a 5 × 5 average at its own resolution), for the tap-to-pick
export function colourAt(img, fx, fy) {
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const px = Math.round(fx * (c.width - 1)), py = Math.round(fy * (c.height - 1));
  const d = x.getImageData(Math.max(0, px - 2), Math.max(0, py - 2), 5, 5).data, sum = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
  const n = d.length / 4;
  return hexOf(sum[0] / n, sum[1] / n, sum[2] / n);
}
