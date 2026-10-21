// Fonts (Settings → Themes, per device): one for the interface and one for logging (the case box, case text in
// the Logbook, the reflection editor). Bundled fonts (fonts/, SIL Open Font License) load only when chosen and are
// then cached for offline use by the service worker. Your own font: a font installed on this device, by name (not
// every browser allows it: Safari mostly doesn't), or a font file kept on this device only (IndexedDB).

export const FONTS = [
  ['default', 'Open Sans (default)'],
  ['system', 'This device’s font'],
  ['atkinson', 'Atkinson Hyperlegible'],
  ['lexend', 'Lexend'],
  ['inter', 'Inter'],
  ['nunito', 'Nunito (rounded)'],
  ['plex', 'IBM Plex Sans'],
  ['sourceserif', 'Source Serif'],
  ['serif', 'Serif'],
  ['jetbrains', 'JetBrains Mono'],
  ['mono', 'Monospace'],
  ['named', 'A font installed on this device…'],
  ['file', 'Your own font file…'],
];
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const STACKS = {
  default: `"Open Sans", ${SANS}`,
  system: SANS,
  atkinson: `"Atkinson Hyperlegible Next", ${SANS}`,
  lexend: `"Lexend", ${SANS}`,
  inter: `"Inter", ${SANS}`,
  nunito: `"Nunito", ${SANS}`,
  plex: `"IBM Plex Sans", ${SANS}`,
  sourceserif: '"Source Serif 4", ui-serif, Georgia, serif',
  jetbrains: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
  serif: 'ui-serif, Charter, "Bitstream Charter", Georgia, "Noto Serif", "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
};
// the fonts a theme (or a theme link) may set: the bundled ones and the device's own, never a typed name or a file
export const THEME_FONTS = Object.keys(STACKS);
export const MAX_FONT_BYTES = 3 * 1024 * 1024;
export const FONT_TYPES = /\.(woff2?|ttf|otf)$/i;

// a typed font name: letters, digits, spaces and a few marks only (it goes into CSS), at most 60 characters
export const cleanFontName = s => String(s || '').replace(/[^\p{L}\p{N} ._'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
// the CSS font-family for a choice. slot 'ui' | 'log' names an uploaded font's family
export function fontStack(choice, name = '', slot = 'ui') {
  if (choice === 'named' && cleanFontName(name)) return `"${cleanFontName(name).replace(/"/g, '')}", ${STACKS.default}`;
  if (choice === 'file') return `"${userFamily(slot)}", ${STACKS.default}`;
  return STACKS[choice] || STACKS.default;
}
export const userFamily = slot => (slot === 'log' ? 'Logbook own font (logging)' : 'Logbook own font');
// the logging font follows the interface font unless set (null / 'same')
export const logChoice = d => (d.fontLog && d.fontLog !== 'same' ? d.fontLog : null);

// An uploaded font in an exported themes file (my-themes.js; theme-revamp S5): { name, data } with the data as base64.
// Checked on the way in: a font file's name, at most 3 MB, and the first bytes of a woff2, woff, TrueType or OpenType font.
export const fontToFile = rec => ({ name: rec.name, data: b64(new Uint8Array(rec.data)) });
function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
const MAGIC = ['wOF2', 'wOFF', 'OTTO', 'true', '\u0000\u0001\u0000\u0000'];
export function cleanFontFile(f) {
  if (!f || typeof f !== 'object' || typeof f.name !== 'string' || typeof f.data !== 'string') return null;
  const name = f.name.replace(/[\u0000-\u001f<>/\\]/g, '').trim().slice(0, 80);
  if (!FONT_TYPES.test(name) || f.data.length > Math.ceil(MAX_FONT_BYTES / 3) * 4) return null;
  let bytes;
  try { bytes = Uint8Array.from(atob(f.data), c => c.charCodeAt(0)); } catch { return null; }
  if (bytes.length < 12 || !MAGIC.includes(String.fromCharCode(...bytes.subarray(0, 4)))) return null;
  return { name, data: bytes.buffer };
}

// ---- browser side ----

export function applyFonts(d = {}) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  const ui = fontStack(d.fontUi || 'default', d.fontUiName, 'ui');
  root.setProperty('--font-ui', ui);
  const lc = logChoice(d);
  root.setProperty('--font-log', lc ? fontStack(lc, d.fontLogName, 'log') : 'var(--font-ui)');
  for (const [slot, choice] of [['ui', d.fontUi], ['log', lc]]) if (choice === 'file') loadUserFont(slot).catch(() => {});
}

// is a font installed (by name)? compares text widths against two fallbacks, as fonts.check() can't tell
export function fontAvailable(name) {
  const n = cleanFontName(name);
  if (!n || typeof document === 'undefined') return false;
  const ctx = document.createElement('canvas').getContext('2d');
  const sample = 'mmmmmmmmmlli1O0WwQq@#';
  return ['monospace', 'serif'].some(base => {
    ctx.font = `32px ${base}`; const w0 = ctx.measureText(sample).width;
    ctx.font = `32px "${n}", ${base}`; return ctx.measureText(sample).width !== w0;
  });
}

// uploaded fonts: IndexedDB 'apmes-logbook-fonts', store 'files', key 'ui' | 'log' -> { name, data (ArrayBuffer) }
const DB = 'apmes-logbook-fonts';
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
const tx = async (mode, fn) => { const d = await db(); return new Promise((resolve, reject) => { const t = d.transaction('files', mode); const req = fn(t.objectStore('files')); t.oncomplete = () => resolve(req && req.result); t.onerror = () => reject(t.error); }); };
export const getUserFont = slot => tx('readonly', s => s.get(slot)).catch(() => null);
// Your themes keep their own copy of an uploaded font (key 'mine-<theme id>-<slot>'), so picking the theme later, or
// exporting it, brings that font back even after the device's own font file has changed (theme-revamp S5)
const mineKey = (id, slot) => `mine-${id}-${slot}`;
const SLOTS = [['ui', 'fontUi'], ['log', 'fontLog']];
export async function keepThemeFonts(t) {
  for (const [slot, k] of SLOTS) if (t.look[k] === 'file') { const f = await getUserFont(slot); if (f?.data) await tx('readwrite', s => s.put(f, mineKey(t.id, slot))).catch(() => {}); }
}
// a saved theme's fonts as { ui, log } for a file (base64), from its own copy or else this device's font
export async function themeFonts(t) {
  const out = {};
  for (const [slot, k] of SLOTS) if (t.look[k] === 'file') { const f = (await tx('readonly', s => s.get(mineKey(t.id, slot))).catch(() => null)) || await getUserFont(slot); if (f?.data) out[slot] = fontToFile(f); }
  return out;
}
// fonts read from a file ({ ui, log } of { name, data: ArrayBuffer }), kept for the theme
export async function putThemeFonts(id, fonts) {
  for (const [slot, f] of Object.entries(fonts || {})) await tx('readwrite', s => s.put(f, mineKey(id, slot)));
}
// picking a saved theme: its font becomes this device's font file (shown at once)
export async function useThemeFonts(t) {
  for (const [slot, k] of SLOTS) {
    if (t.look[k] !== 'file') continue;
    const f = await tx('readonly', s => s.get(mineKey(t.id, slot))).catch(() => null);
    if (f?.data) { await tx('readwrite', s => s.put(f, slot)); await addFace(slot, f.data).catch(() => {}); }
  }
}
export const dropThemeFonts = id => Promise.all(['ui', 'log'].map(slot => tx('readwrite', s => s.delete(mineKey(id, slot))).catch(() => {})));
export const deleteUserFont = slot => tx('readwrite', s => s.delete(slot));
const loaded = {};
async function addFace(slot, data) {
  const face = new FontFace(userFamily(slot), data);
  await face.load();
  if (loaded[slot]) document.fonts.delete(loaded[slot]);
  document.fonts.add(face); loaded[slot] = face;
}
export async function loadUserFont(slot) {
  if (loaded[slot]) return true;
  const f = await getUserFont(slot);
  if (!f || !f.data) return false;
  await addFace(slot, f.data);
  return true;
}
// a file the user picked: checked, tried, then kept; throws a message for the user
export async function saveUserFont(slot, file) {
  if (!FONT_TYPES.test(file.name)) throw new Error('Choose a .woff2, .woff, .ttf or .otf font file');
  if (file.size > MAX_FONT_BYTES) throw new Error('That font file is over 3 MB');
  const data = await file.arrayBuffer();
  try { await addFace(slot, data); } catch { throw new Error('That file could not be read as a font'); }
  await tx('readwrite', s => s.put({ name: file.name, data }, slot));
  return file.name;
}
