// Your themes (Themes page; owner, 16 Oct 2026): change a theme and the page says it is now Custom; Save this look keeps
// it under a name of your own (this device, `display().myThemes`), to pick again later like any theme. Export writes
// them to a file (.json) to keep or pass on; Import reads such a file back (only known look settings, checked).
// Pure (test/my-themes.test.mjs); the page is ui-settings.js renderThemes.
import { THEME_KEYS, TINTS, keepKept, checkTheme, THEMES, themePatch } from './themes.js';
import { cleanFontFile } from './fonts.js';
import { foldCompact, TAB_ICONS } from './theme-engine.js';
import { GRID, gridIndex, isSnapped, bits18, fromBits18 } from './colour-grid.js';
import { LOOK, lookField, cleanLook, keptKeys } from './look-schema.js';
import { checkColours, COLOUR_TOKENS, ROLE_TOKENS, EDIT_TOKENS } from './colors.js';

export const MAX_MINE = 12;
export const FILE_KIND = 'apmes-logbook-themes';
const MODES = ['light', 'dark', 'oled', 'auto'];

// the look settings of a display (only the set ones)
export function lookOf(d = {}) {
  d = foldCompact(d) || {};   // an old saved theme's Compact mode is Spacing: Tight
  const out = {};
  // each checked against what it may hold (look-schema.js), so a file can't put odd values on a device
  for (const k of THEME_KEYS) { const v = cleanLook(k, d[k]); if (v != null) out[k] = v; }
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
// (what the device keeps when changing theme stays, and a photo wallpaper: keepKept)
export const minePatch = (t, current = {}) => keepKept({ theme: null, ...Object.fromEntries(THEME_KEYS.map(k => [k, t.look[k] ?? null])) }, current);
// the saved theme the device's look matches, if any
// (the settings the device keeps when changing theme don't count)
export function matchMine(list, d) {
  const kept = keptKeys(d), mine = look => JSON.stringify(Object.entries(lookOf(look)).filter(([k]) => !kept.has(k)));
  const now = mine(d);
  return cleanMine(list).find(t => mine(t.look) === now) || null;
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
// Link format 2 (owner, 21 Oct 2026; short enough for a small QR code, and it never goes stale): a bundled theme
// unchanged is just its id. Any other look is written out in full, each setting as its place in LINK_KEYS and its
// value as its place in that setting's list (look-schema.js), its step from the lowest (numbers), or a colour (3 bytes,
// or "the same as an earlier one"). Nothing depends on what the bundled themes look like now, so adding, renaming or
// changing themes never breaks a link. LINK_KEYS and each setting's list only ever grow at the end (the test holds
// them to test/fixtures/theme-link-lists.json); every value says its kind, so a setting or value from a newer app is
// skipped and the rest kept. Format 1 links (Oct 2026, a fingerprint of the lists; and #theme=… JSON) ask for a new one.
// Format 3 (TE S2, 21 Oct 2026; a fully custom theme went from ~180 characters with the address to ~120): each setting
// as its step on from the one before (most are 1 or 2 places on, so 5 bits instead of 10); a colour from the grid as
// its place in it (colour-grid.js), one snapped to 6 bits a channel (anything picked in the app) in 18 bits, any other
// in 24, so every colour still arrives exactly as sent; tab icons as places in two lists, not as text. Format 2 links
// keep opening as they did.
export const LINK_KEY = 't';
const OLD_KEY = 'theme';
const MAX_LINK = 2000;
const bytesOf = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const b64uOf = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const SIDES = ['light', 'dark'];
// (settings added to the look after tabIcon, from TE S3, come after the colour tokens, so older places never move; the
// colour roles, TE S4, after wallFrost; look settings newer than that after the roles)
const LATE = LOOK.findIndex(f => f.key === 'tabIcon') + 1, ROLES_AT = LOOK.findIndex(f => f.key === 'wallFrost') + 1;
export const LINK_KEYS = [...LOOK.slice(0, LATE).filter(f => f.kind !== 'colours').map(f => f.key), ...SIDES.flatMap(s => COLOUR_TOKENS.map(k => `${s}.${k}`)),
  ...LOOK.slice(LATE, ROLES_AT).map(f => f.key), ...SIDES.flatMap(s => ROLE_TOKENS.map(k => `${s}.${k}`)), ...LOOK.slice(ROLES_AT).map(f => f.key)];
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
// a value's kind (2 bits): 0 a number (a place in a list, a step, 1 for on), 1 a new colour, 2 an earlier colour, 3 text
const fieldOf = key => (key.includes('.') ? { kind: 'colour' } : lookField(key));
// (format 3) the tabs and icons a tab icon is written with: both lists only grow at the end (the fixture holds them)
export const LINK_TABS = ['caselogs', 'log', 'logbook', 'totals', 'notes', 'reflect', 'progress', 'account', 'settings', 'recovery', 'data', 'admin', 'more'];
export const LINK_ICONS = Object.keys(TAB_ICONS);
// (format 3) the settings every format 3 link reader knows: their values skip the 2 bits that say the value's kind
export const KNOWN3 = 76;
// (format 3) white and black count as already sent (panels and button text often are), so each costs a few bits
const POOL3 = ['#ffffff', '#000000'];
// a colour: (format 3) 0 + 18 bits (snapped), 10 + its place in the grid, 11 + 24 bits; (format 2) 24 bits
function putColour(w, v, v3) {
  if (!v3) return w.put(parseInt(v.slice(1), 16), 24);
  const g = gridIndex(v);
  return g >= 0 ? (w.put(2, 2), w.num(g)) : isSnapped(v) ? (w.put(0, 1), w.put(bits18(v), 18)) : (w.put(3, 2), w.put(parseInt(v.slice(1), 16), 24));
}
const readColour = (r, v3) => {
  if (!v3) return '#' + r.get(24).toString(16).padStart(6, '0');
  if (r.get(1) === 0) return fromBits18(r.get(18));
  return r.get(1) === 0 ? (GRID[r.getNum()] ?? broken()).c : '#' + r.get(24).toString(16).padStart(6, '0');
};
// tab icons: (format 3) 1 + how many + places in LINK_TABS and LINK_ICONS, or 0 + the text; (format 2) the text
function putIcons(w, v, v3) {
  const pairs = Object.entries(v);
  if (!v3) return w.text(JSON.stringify(v));
  if (!pairs.every(([t, i]) => LINK_TABS.includes(t) && LINK_ICONS.includes(i))) return w.put(0, 1), w.text(JSON.stringify(v));
  w.put(1, 1); w.num(pairs.length);
  for (const [t, i] of pairs) { w.num(LINK_TABS.indexOf(t)); w.num(LINK_ICONS.indexOf(i)); }
}
function readIcons(r, v3) {
  if (!v3 || r.get(1) === 0) { const t = r.getText(); try { return JSON.parse(t); } catch { return null; } }
  const n = r.getNum(), out = {};
  if (n > 50) broken();
  for (let j = 0; j < n; j++) { const t = LINK_TABS[r.getNum()], i = LINK_ICONS[r.getNum()]; if (t && i) out[t] = i; }
  return out;
}
const numOf = (f, v) => (f.kind === 'enum' ? f.values.indexOf(v) : f.kind === 'int' || f.kind === 'tune' ? Math.round((v - f.min) / f.step) : 1);
// a value: its kind (2 bits: 0 a number, 1 a new colour, 2 an earlier colour, 3 text) then the value; a format 3
// setting below KNOWN3 has no kind (a colour says 1 bit: earlier or new)
function putValue(w, key, v, pool, v3, known) {
  const f = fieldOf(key);
  if (f.kind === 'colour') {
    const i = pool.indexOf(v);
    if (known) { w.put(i >= 0 ? 1 : 0, 1); if (i >= 0) return w.num(i); pool.push(v); return putColour(w, v, true); }
    if (i >= 0) return w.put(2, 2), w.num(i);
    pool.push(v);
    return w.put(1, 2), putColour(w, v, v3);
  }
  if (f.kind === 'icons') { if (!known) w.put(3, 2); return putIcons(w, v, v3); }
  if (!known) w.put(0, 2);
  w.num(numOf(f, v));
}
function getValue(r, key, pool, v3, known) {
  const f = key && fieldOf(key);
  const kind = !known ? r.get(2) : f.kind === 'colour' ? (r.get(1) ? 2 : 1) : f.kind === 'icons' ? 3 : 0;
  if (kind === 1) { const c = readColour(r, v3); pool.push(c); return f?.kind === 'colour' ? c : null; }
  if (kind === 2) { const c = pool[r.getNum()] ?? broken(); return f?.kind === 'colour' ? c : null; }
  if (kind === 3) { const v = readIcons(r, v3); return f?.kind === 'icons' ? v : null; }
  const n = r.getNum();
  if (!f) return null;
  if (f.kind === 'enum') return f.values[n] ?? null;
  if (f.kind === 'int' || f.kind === 'tune') return Math.round((f.min + n * f.step) * 1000) / 1000;
  return f.kind === 'off' ? false : f.kind === 'bool' ? true : null;
}
// (format 3) a name of letters, digits, spaces and hyphens in 6 bits a letter (1, then how many), else 0 and the text
const NAME_CHARS = ' abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
function v3Name(w, name) {
  if (![...name].every(c => NAME_CHARS.includes(c))) return w.put(0, 1), w.text(name);
  w.put(1, 1); w.num(name.length);
  for (const c of name) w.put(NAME_CHARS.indexOf(c), 6);
}
function readName(r) {
  if (!r.get(1)) return r.getText();
  const n = r.getNum();
  if (n > 400) broken();
  return Array.from({ length: n }, () => NAME_CHARS[r.get(6)]).join('');
}
// a look with its colours as flat keys ('light.bg'), and back
const flatLook = look => {
  const { colours, ...rest } = look;
  for (const s of SIDES) for (const k of EDIT_TOKENS) if (colours?.[s]?.[k]) rest[`${s}.${k}`] = colours[s][k];
  return rest;
};
const unflatLook = flat => {
  const look = {}, colours = {};
  for (const [k, v] of Object.entries(flat)) { const [s, t] = k.split('.'); if (t) (colours[s] ||= {})[t] = v; else look[k] = v; }
  return Object.keys(colours).length ? { ...look, colours } : look;
};
// a theme ({ name, look, mode }) as a link from the app's address (origin + path)
export function themeLink(base, t) {
  const look = linkLook(lookOf(t.look || {})), name = cleanName(t.name) || 'Shared theme';
  const same = JSON.stringify(look), bundled = THEMES.find(x => JSON.stringify(lookOf(x.look)) === same);
  const w = new Bits();
  w.put(3, 2); w.put(0, 1);   // format 3 (the 0: a later format would say 1 and its number)
  w.put(MODES.indexOf(MODES.includes(t.mode) ? t.mode : null) + 1, 3);
  if (bundled) { w.put(1, 1); w.text(bundled.id); }
  else {
    const flat = flatLook(look), keys = LINK_KEYS.filter(k => flat[k] != null), pool = [...POOL3];
    w.put(0, 1); v3Name(w, name); w.num(keys.length);
    let at = -1;
    for (const k of keys) { const i = LINK_KEYS.indexOf(k); w.num(i - at - 1); at = i; putValue(w, k, flat[k], pool, true, i < KNOWN3); }
  }
  return `${base}#${LINK_KEY}=${b64uOf(w.bytes())}`;
}
function unpack(str) {
  const r = new Bits(bytesOf(str));
  const format = r.get(2);
  if (format < 2) throw new Error('That theme link is from an older version of the app: ask for a new one');
  const v3 = format === 3;
  if (v3 && r.get(1)) throw new Error('That theme link is from a newer version of the app: update it (Settings → App version) and open the link again');
  const mode = MODES[r.get(3) - 1] || null, also = mode ? { mode } : {};
  if (r.get(1)) {
    const id = r.getText(), t = THEMES.find(x => x.id === id);
    if (!t) throw new Error('That theme isn’t in this version of the app: update it (Settings → App version) and open the link again');
    return { name: t.name, look: lookOf(t.look), ...also };
  }
  const name = v3 ? readName(r) : r.getText(), n = r.getNum(), flat = {}, pool = v3 ? [...POOL3] : [];
  if (n > 500) broken();
  let at = -1;
  for (let j = 0; j < n; j++) {
    at = v3 ? at + 1 + r.getNum() : r.getNum();
    const k = LINK_KEYS[at], v = getValue(r, k, pool, v3, v3 && at < KNOWN3);
    if (k && v != null) flat[k] = v;
  }
  return { name: cleanName(name) || 'Shared theme', look: linkLook(lookOf(unflatLook(flat))), ...also };
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
// the theme in an address's #t=… (null when there is none); throws a message when it is there but unreadable
export const isThemeLink = hash => new RegExp(`^#?(${LINK_KEY}|${OLD_KEY})=`).test(String(hash || ''));
export function themeFromLink(hash) {
  hash = String(hash || '').split('?')[0];
  if (!isThemeLink(hash)) return null;
  const m = /^#?(t|theme)=([A-Za-z0-9_-]+)$/.exec(hash);
  if (m && m[1] === OLD_KEY) throw new Error('That theme link is from an older version of the app: ask for a new one');
  if (!m || m[2].length > MAX_LINK) broken();
  try { return unpack(m[2]); } catch (err) { if (/older version|newer version|this version/.test(err.message)) throw err; broken(); }
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
