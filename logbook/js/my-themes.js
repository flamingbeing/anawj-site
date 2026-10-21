// Your themes (Themes page; owner, 16 Oct 2026): change a theme and the page says it is now Custom; Save this look keeps
// it under a name of your own (this device, `display().myThemes`), to pick again later like any theme. Export writes
// them to a file (.json) to keep or pass on; Import reads such a file back (only known look settings, checked).
// Pure (test/my-themes.test.mjs); the page is ui-settings.js renderThemes.
import { THEME_KEYS, TINTS, keepPhoto, checkTheme, THEMES, themePatch } from './themes.js';
import { cleanFontFile } from './fonts.js';
import { FACET_KEYS, cleanFacet, TUNE_KEYS, cleanTune, foldCompact, cleanTintStrength, cleanTabIcons } from './theme-engine.js';
import { cleanPattern, cleanDim } from './wallpaper.js';
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
  // wallpaper.js: a pattern (a photo stays on its device, so a saved theme never holds it), icon tint, tab icons
  wallpaper: v => !!cleanPattern(v), wallDim: v => cleanDim(v) !== null, iconTint: v => !!cleanAccent(v),
  iconTintStrength: v => cleanTintStrength(v) !== null, tabIcon: v => Object.keys(cleanTabIcons(v)).length > 0,
};
const okValue = (k, v) => v != null && (OK[k] ? OK[k](v) : typeof v === 'boolean' || word(v));

// the look settings of a display (only the set ones)
export function lookOf(d = {}) {
  d = foldCompact(d) || {};   // an old saved theme's Compact mode is Spacing: Tight
  const out = {};
  for (const k of THEME_KEYS) if (k !== 'colours' && okValue(k, d[k])) out[k] = k === 'accent' || k === 'iconTint' ? cleanAccent(d[k]) : k === 'tabIcon' ? cleanTabIcons(d[k]) : d[k];
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
// (a photo wallpaper on this device stays: keepPhoto)
export const minePatch = (t, current = {}) => keepPhoto({ theme: null, ...Object.fromEntries(THEME_KEYS.map(k => [k, t.look[k] ?? null])) }, current);
// the saved theme the device's look matches, if any
export function matchMine(list, d) {
  const now = JSON.stringify(lookOf(d));
  return cleanMine(list).find(t => JSON.stringify(lookOf(t.look)) === now) || null;
}

// the file: { kind, version, themes }. fonts: a theme id -> { ui, log } uploaded font files ({ name, data: base64 }),
// carried for a theme whose font is "Your own font file" (theme-revamp S5), so it looks the same on the other phone
export const exportText = (list, fonts = {}) => JSON.stringify({ kind: FILE_KIND, version: 1, themes: cleanMine(list).map(({ id, ...t }) => {
  const f = Object.fromEntries(['ui', 'log'].filter(slot => t.look[slot === 'ui' ? 'fontUi' : 'fontLog'] === 'file' && fonts[id]?.[slot]).map(slot => [slot, fonts[id][slot]]));
  return Object.keys(f).length ? { ...t, fonts: f } : t;
}) }, null, 2);
// a file's themes, checked; added to yours (a name already there is replaced) -> { list, added, fonts }
// fonts: a theme id (in the new list) -> { ui, log } font files ({ name, data: ArrayBuffer }), each checked (fonts.js)
export function importText(text, list) {
  let data;
  try { data = JSON.parse(String(text || '')); } catch { throw new Error('That isn’t a themes file'); }
  const got = data && data.kind === FILE_KIND && Array.isArray(data.themes) ? cleanMine(data.themes) : null;
  if (!got || !got.length) throw new Error('No themes in that file');
  for (const t of got) checkColours(t.look, TINTS[t.look.bgTint] || {});
  const names = new Set(got.map(t => t.name.toLowerCase()));
  const merged = [...got, ...cleanMine(list).filter(t => !names.has(t.name.toLowerCase()))];
  if (merged.length > MAX_MINE) throw new Error(`Up to ${MAX_MINE} themes of your own: delete some first`);
  const out = cleanMine(merged), fonts = {};
  for (const raw of data.themes) {
    const t = raw && raw.fonts && typeof raw.fonts === 'object' && got.find(x => x.name === cleanName(raw.name));
    if (!t) continue;
    for (const slot of ['ui', 'log']) {
      const rec = t.look[slot === 'ui' ? 'fontUi' : 'fontLog'] === 'file' ? cleanFontFile(raw.fonts[slot]) : null;
      if (rec) (fonts[out.find(x => x.name === t.name).id] ||= {})[slot] = rec;
    }
  }
  return { list: out, added: got.length, fonts };
}

// Theme links (theme-revamp S5): a look as a link to send in WhatsApp (…/logbook/#theme=…); whoever opens it sees it
// at once, with Use / Cancel. The link is input from anyone, so it goes through the same checks as a themes file and
// then checkTheme: each setting it rejects is dropped (never trusted), and fonts are the bundled ones only (a typed
// font name or an uploaded file stays on its phone). Light or dark travels as a label only, as in Your themes.
export const LINK_KEY = 'theme';
const MAX_LINK = 6000;
const toB64u = str => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = str => new TextDecoder().decode(Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
// a theme ({ name, look, mode }) as a link from the app's address (origin + path)
export function themeLink(base, t) {
  const look = linkLook(lookOf(t.look || {}));
  return `${base}#${LINK_KEY}=${toB64u(JSON.stringify({ v: 1, n: cleanName(t.name) || 'Shared theme', l: look, ...(MODES.includes(t.mode) ? { m: t.mode } : {}) }))}`;
}
// the look, made safe for a link: (after lookOf) whatever checkTheme rejects is dropped, fonts that aren't bundled too
function linkLook(look) {
  look = { ...look };
  const bad = () => checkTheme({ id: 'shared', name: 'Shared', group: 'classic', desc: 'A theme from a link', look });
  for (const b of bad()) {
    const k = /^look\.(\w+)/.exec(b)?.[1] || (b.startsWith('colours') ? 'colours' : null);
    if (k) delete look[k];
  }
  if (bad().length) delete look.colours, delete look.bgTint, delete look.accent;   // colours that clash in a way no single key explains
  return bad().length ? {} : look;
}
// the theme in an address's #theme=… (null when there is none); throws a message when it is there but unreadable
export function themeFromLink(hash) {
  const m = /^#?theme=([A-Za-z0-9_-]+)$/.exec(String(hash || '').split('?')[0]);
  if (!m) return /^#?theme=/.test(String(hash || '')) ? broken() : null;
  if (m[1].length > MAX_LINK) broken();
  let raw;
  try { raw = JSON.parse(fromB64u(m[1])); } catch { broken(); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1 || !raw.l || typeof raw.l !== 'object') broken();
  return { name: cleanName(raw.n) || 'Shared theme', look: linkLook(lookOf(raw.l)), ...(MODES.includes(raw.m) ? { mode: raw.m } : {}) };
}
function broken() { throw new Error('That theme link is broken or cut short: ask for it again'); }

// Day and night (theme-revamp S5): with Light or dark on Auto, nightTheme picks the theme for when the phone is dark
// ('mine:<id>' for one of Your themes, else a theme's id); the day look is the one set on Themes as usual.
// -> the look to show now (d itself by day, or with no night theme)
export function nightRef(d = {}) {
  const ref = typeof d.nightTheme === 'string' ? d.nightTheme : '';
  if (ref.startsWith('mine:')) { const t = cleanMine(d.myThemes).find(x => x.id === ref.slice(5)); return t ? { mine: t, name: t.name } : null; }
  const t = THEMES.find(x => x.id === ref);
  return t ? { theme: t, name: t.name } : null;
}
export function lookNow(d = {}, dark = false) {
  const n = dark ? nightRef(d) : null;
  if (!n) return d;
  return { ...d, ...(n.mine ? minePatch(n.mine, d) : themePatch(n.theme, d)) };
}
