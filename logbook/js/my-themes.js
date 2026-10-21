// Your themes (Themes page; owner, 16 Oct 2026): change a theme and the page says it is now Custom; Save this look keeps
// it under a name of your own (this device, `display().myThemes`), to pick again later like any theme. Export writes
// them to a file (.json) to keep or pass on; Import reads such a file back (only known look settings, checked).
// Pure (test/my-themes.test.mjs); the page is ui-settings.js renderThemes.
import { THEME_KEYS, TINTS } from './themes.js';
import { FACET_KEYS, cleanFacet, TUNE_KEYS, cleanTune, foldCompact } from './theme-engine.js';
import { cleanAccent, cleanColours, checkColours } from './colors.js';

export const MAX_MINE = 12;
export const FILE_KIND = 'apmes-logbook-themes';
const MODES = ['light', 'dark', 'oled', 'auto'];
// what each look setting may hold (anything else is dropped, so a file can't put odd values on a device)
const small = v => Number.isInteger(v) && v >= 0 && v <= 9;
const word = v => typeof v === 'string' && /^[a-z0-9-]{1,30}$/i.test(v);
const OK = {
  navStyle: v => ['tabs', 'rail'].includes(v),
  rowLayout: v => ['card', 'compact', 'chat', 'timeline'].includes(v),
  formLayout: v => ['page', 'sections'].includes(v),
  accent: v => !!cleanAccent(v), bgTint: v => typeof v === 'string' && Object.hasOwn(TINTS, v),
  borders: small, round: small, flat: v => v === true, shadows: v => v === false,
  colourful: v => v === true || word(v), lineHeight: v => typeof v === 'string' && /^\d(\.\d{1,2})?$/.test(v),
  ...Object.fromEntries(FACET_KEYS.map(k => [k, v => cleanFacet(k, v) !== null])),   // the theme engine's facets: listed choices only
  ...Object.fromEntries(TUNE_KEYS.map(k => [k, v => cleanTune(k, v) !== null])),   // Fine-tune: numbers in range
};
const okValue = (k, v) => v != null && (OK[k] ? OK[k](v) : typeof v === 'boolean' || word(v));

// the look settings of a display (only the set ones)
export function lookOf(d = {}) {
  d = foldCompact(d) || {};   // an old saved theme's Compact mode is Spacing: Tight
  const out = {};
  for (const k of THEME_KEYS) if (k !== 'colours' && okValue(k, d[k])) out[k] = k === 'accent' ? cleanAccent(d[k]) : d[k];
  const colours = cleanColours(d.colours);
  if (Object.keys(colours).length) out.colours = colours;
  return out;
}
const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
export function cleanMine(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter(t => t && typeof t === 'object' && cleanName(t.name)).map(t => ({
    id: typeof t.id === 'string' && /^[a-z0-9]{1,12}$/.test(t.id) ? t.id : Math.random().toString(36).slice(2, 10),
    name: cleanName(t.name), look: lookOf(t.look || {}), ...(MODES.includes(t.mode) ? { mode: t.mode } : {}),
  })).filter(t => (seen.has(t.name.toLowerCase()) ? false : seen.add(t.name.toLowerCase()))).slice(0, MAX_MINE);
}
// save the look now under a name: a theme of the same name is replaced; the newest first
export function saveMine(list, name, d, mode = null, id = Math.random().toString(36).slice(2, 10)) {
  checkColours(d, TINTS[d.bgTint] || {});
  const n = cleanName(name);
  if (!n) throw new Error('Give the theme a name');
  const rest = cleanMine(list).filter(t => t.name.toLowerCase() !== n.toLowerCase());
  if (rest.length >= MAX_MINE) throw new Error(`Up to ${MAX_MINE} themes of your own: delete one first`);
  return cleanMine([{ id, name: n, look: lookOf(d), ...(MODES.includes(mode) ? { mode } : {}) }, ...rest]);
}
// the patch that puts a saved theme on this device: every look setting (unset ones back to the default)
export const minePatch = t => ({ theme: null, ...Object.fromEntries(THEME_KEYS.map(k => [k, t.look[k] ?? null])) });
// the saved theme the device's look matches, if any
export function matchMine(list, d) {
  const now = JSON.stringify(lookOf(d));
  return cleanMine(list).find(t => JSON.stringify(lookOf(t.look)) === now) || null;
}

// the file: { kind, version, themes }
export const exportText = list => JSON.stringify({ kind: FILE_KIND, version: 1, themes: cleanMine(list).map(({ id, ...t }) => t) }, null, 2);
// a file's themes, checked; added to yours (a name already there is replaced) -> { list, added }
export function importText(text, list) {
  let data;
  try { data = JSON.parse(String(text || '')); } catch { throw new Error('That isn’t a themes file'); }
  const got = data && data.kind === FILE_KIND && Array.isArray(data.themes) ? cleanMine(data.themes) : null;
  if (!got || !got.length) throw new Error('No themes in that file');
  for (const t of got) checkColours(t.look, TINTS[t.look.bgTint] || {});
  const names = new Set(got.map(t => t.name.toLowerCase()));
  const merged = [...got, ...cleanMine(list).filter(t => !names.has(t.name.toLowerCase()))];
  if (merged.length > MAX_MINE) throw new Error(`Up to ${MAX_MINE} themes of your own: delete some first`);
  return { list: cleanMine(merged), added: got.length };
}
