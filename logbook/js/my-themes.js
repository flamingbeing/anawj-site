// Your themes (Themes page; owner, 16 Oct 2026): change a theme and the page says it is now Custom; Save this look keeps
// it under a name of your own (this device, `display().myThemes`), to pick again later like any theme. Export writes
// them to a file (.json) to keep or pass on; Import reads such a file back (only known look settings, checked).
// Pure (test/my-themes.test.mjs); the page is ui-settings.js renderThemes.
import { THEME_KEYS, TINTS, keepPhoto, checkTheme, THEMES, themePatch } from './themes.js';
import { cleanFontFile } from './fonts.js';
import { FACETS, FACET_KEYS, cleanFacet, TUNE_KEYS, cleanTune, foldCompact, cleanTintStrength, cleanTabIcons } from './theme-engine.js';
import { PATTERNS, cleanPattern, cleanDim } from './wallpaper.js';
import { cleanAccent, cleanColours, checkColours, COLOUR_TOKENS } from './colors.js';

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

// Theme links (theme-revamp S5): a look as a link to send in WhatsApp (…/logbook/#t=…); whoever opens it sees it at
// once, with Use / Cancel. The link is input from anyone, so it goes through the same checks as a themes file and then
// checkTheme: each setting it rejects is dropped (never trusted), and fonts are the bundled ones only (a typed font name
// or an uploaded file stays on its phone). Light or dark travels as a label only, as in Your themes.
// Short links (owner, 21 Oct 2026), so a link fits a small QR code: the theme is packed into bits as the bundled theme it
// starts from (whichever gives the shortest link) plus only the settings that differ, each as its number in the lists
// below and a small value; a colour is 3 bytes, or "the same as a colour already in the link". A bundled theme is 4
// characters, one with a few changes ~30, a fully custom one ~130 (it was ~1,200 as JSON). Both phones must agree on the
// lists, so the link starts with a 12-bit fingerprint of them: after an update that changes them, an old link asks for a
// new one (Share always packs with the current lists). Old #theme=… links (JSON, v1) still open.
export const LINK_KEY = 't';
const OLD_KEY = 'theme';
const MAX_LINK = 6000;
const fromB64u = str => new TextDecoder().decode(bytesOf(str));
const bytesOf = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const b64uOf = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const HEX6 = /^#[0-9a-f]{6}$/;
const SIDES = ['light', 'dark'];
// a look with its colours as flat keys ('light.bg'), and back
const flatLook = look => {
  const { colours, ...rest } = look;
  for (const s of SIDES) for (const k of COLOUR_TOKENS) if (colours?.[s]?.[k]) rest[`${s}.${k}`] = colours[s][k];
  return rest;
};
const unflatLook = flat => {
  const look = {}, colours = {};
  for (const [k, v] of Object.entries(flat)) { const [s, t] = k.split('.'); if (t) (colours[s] ||= {})[t] = v; else look[k] = v; }
  return Object.keys(colours).length ? { ...look, colours } : look;
};
// the lists both phones share: the setting keys, the words a setting may hold, the bundled themes; and their fingerprint
let lists = null;
function packLists() {
  if (lists) return lists;
  const keys = [...THEME_KEYS.filter(k => k !== 'colours'), ...SIDES.flatMap(s => COLOUR_TOKENS.map(k => `${s}.${k}`))];
  const bases = THEMES.map(t => ({ name: t.name, flat: flatLook(lookOf(t.look)) }));
  const words = new Set([...FACETS.flatMap(f => (f.choices || []).map(c => c[0])), ...Object.keys(PATTERNS), ...Object.keys(TINTS),
    'tabs', 'rail', 'card', 'compact', 'chat', 'timeline', 'page', 'sections']);
  for (const b of bases) for (const v of Object.values(b.flat)) if (typeof v === 'string' && !HEX6.test(v)) words.add(v);
  const dict = [...words].sort();
  let sum = 0x811c9dc5;   // FNV-1a
  for (const c of JSON.stringify([keys, dict, bases, MODES])) sum = Math.imul(sum ^ c.charCodeAt(0), 16777619) >>> 0;
  return (lists = { keys, bases, dict, sum: sum & 0xfff, keyBits: Math.ceil(Math.log2(keys.length)) });
}
class Bits {
  constructor(bytes) { this.b = bytes ? [...bytes].flatMap(x => [7, 6, 5, 4, 3, 2, 1, 0].map(i => (x >> i) & 1)) : []; this.i = 0; }
  put(v, n) { for (let i = n - 1; i >= 0; i--) this.b.push(Math.floor(v / 2 ** i) % 2); }
  get(n) { let v = 0; for (let k = 0; k < n; k++) { if (this.i >= this.b.length) broken(); v = v * 2 + this.b[this.i++]; } return v; }
  num(v) { do { this.put(v > 15 ? 1 : 0, 1); this.put(v % 16, 4); v = Math.floor(v / 16); } while (v > 0); }   // 4 bits at a time
  getNum() { let v = 0, f = 1, more; do { more = this.get(1); v += this.get(4) * f; f *= 16; if (f > 2 ** 32) broken(); } while (more); return v; }
  text(s) { const u = new TextEncoder().encode(s); this.num(u.length); for (const x of u) this.put(x, 8); }
  getText() { const n = this.getNum(); if (n > 400) broken(); return new TextDecoder().decode(Uint8Array.from({ length: n }, () => this.get(8))); }
  bytes() { const o = new Uint8Array(Math.ceil(this.b.length / 8)); this.b.forEach((x, i) => { o[i >> 3] |= x << (7 - (i & 7)); }); return o; }
}
// a value: 2 bits for its kind, then on/off; a number (sign, decimals, digits); a word (from the list, or spelt out);
// or removed (the bundled theme has it, this one doesn't), a colour (3 bytes, or an earlier colour's number), other (JSON)
function putValue(w, v, L, pool) {
  if (v == null) return w.put(3, 2), w.put(0, 2);
  if (typeof v === 'boolean') return w.put(0, 2), w.put(+v, 1);
  if (typeof v === 'number') {
    const a = Math.abs(v), dec = [0, 1, 2, 3].find(d => Math.round(a * 10 ** d) / 10 ** d === a);
    if (dec !== undefined && a * 10 ** dec < 2 ** 32) return w.put(1, 2), w.put(v < 0 ? 1 : 0, 1), w.put(dec, 2), w.num(Math.round(a * 10 ** dec));
  }
  if (typeof v === 'string' && HEX6.test(v)) {
    const i = pool.indexOf(v);
    w.put(3, 2);
    if (i >= 0) return w.put(2, 2), w.num(i);
    pool.push(v);
    return w.put(1, 2), w.put(parseInt(v.slice(1), 16), 24);
  }
  if (typeof v === 'string') { const i = L.dict.indexOf(v); w.put(2, 2); return i >= 0 ? (w.put(0, 1), w.num(i)) : (w.put(1, 1), w.text(v)); }
  w.put(3, 2); w.put(3, 2); w.text(JSON.stringify(v));
}
function getValue(r, L, pool) {
  const kind = r.get(2);
  if (kind === 0) return !!r.get(1);
  if (kind === 1) { const neg = r.get(1), dec = r.get(2), n = r.getNum() / 10 ** dec; return neg ? -n : n; }
  if (kind === 2) { if (r.get(1)) return r.getText(); const w = L.dict[r.getNum()]; return w ?? broken(); }
  const ext = r.get(2);
  if (ext === 0) return null;
  if (ext === 2) return pool[r.getNum()] ?? broken();
  if (ext === 1) { const c = '#' + r.get(24).toString(16).padStart(6, '0'); pool.push(c); return c; }
  try { return JSON.parse(r.getText()); } catch { broken(); }
}
const colourPool = flat => [...new Set(['#ffffff', '#000000', ...Object.values(flat).filter(v => typeof v === 'string' && HEX6.test(v))])];
function packWith(L, base, name, mode, flat) {
  const from = base < 0 ? {} : L.bases[base].flat, pool = colourPool(from);
  const diff = L.keys.filter(k => JSON.stringify(flat[k] ?? null) !== JSON.stringify(from[k] ?? null));
  const w = new Bits();
  w.put(1, 2); w.put(L.sum, 12); w.num(base + 1); w.put(MODES.indexOf(mode) + 1, 3);
  if (base >= 0 && name === L.bases[base].name) w.put(0, 1); else { w.put(1, 1); w.text(name); }
  w.num(diff.length);
  for (const k of diff) { w.put(L.keys.indexOf(k), L.keyBits); putValue(w, flat[k], L, pool); }
  return b64uOf(w.bytes());
}
// a theme ({ name, look, mode }) as a link from the app's address (origin + path)
export function themeLink(base, t) {
  const L = packLists(), flat = flatLook(linkLook(lookOf(t.look || {}))), name = cleanName(t.name) || 'Shared theme';
  const mode = MODES.includes(t.mode) ? t.mode : null;
  let best = packWith(L, -1, name, mode, flat);
  L.bases.forEach((_, i) => { const s = packWith(L, i, name, mode, flat); if (s.length < best.length) best = s; });
  return `${base}#${LINK_KEY}=${best}`;
}
function unpack(str) {
  const L = packLists(), r = new Bits(bytesOf(str));
  if (r.get(2) !== 1) broken();
  if (r.get(12) !== L.sum) throw new Error('That theme link is from an older version of the app: ask for a new one');
  const base = r.getNum() - 1, mode = MODES[r.get(3) - 1] || null;
  if (base >= L.bases.length) broken();
  const flat = { ...(base < 0 ? {} : L.bases[base].flat) }, pool = colourPool(flat);
  const name = r.get(1) ? r.getText() : base >= 0 ? L.bases[base].name : broken();
  const n = r.getNum();
  if (n > L.keys.length) broken();
  for (let j = 0; j < n; j++) {
    const k = L.keys[r.get(L.keyBits)] ?? broken(), v = getValue(r, L, pool);
    if (v == null) delete flat[k]; else flat[k] = v;
  }
  return { name: cleanName(name) || 'Shared theme', look: linkLook(lookOf(unflatLook(flat))), ...(mode ? { mode } : {}) };
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
// the theme in an address's #t=… (or an old #theme=…; null when there is none); throws a message when it is there but
// unreadable
export const isThemeLink = hash => new RegExp(`^#?(${LINK_KEY}|${OLD_KEY})=`).test(String(hash || ''));
export function themeFromLink(hash) {
  hash = String(hash || '').split('?')[0];
  if (!isThemeLink(hash)) return null;
  const m = /^#?(t|theme)=([A-Za-z0-9_-]+)$/.exec(hash);
  if (!m || m[2].length > MAX_LINK) broken();
  if (m[1] === LINK_KEY) { try { return unpack(m[2]); } catch (err) { if (/older version/.test(err.message)) throw err; broken(); } }
  let raw;
  try { raw = JSON.parse(fromB64u(m[2])); } catch { broken(); }
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
