// Settings export / import (Settings → Settings file): your preferences, tag set, shorthand, tag groups,
// Markdown format, Excel choices and saved searches as one small JSON file, to move them to another
// account or share a setup with a colleague. Never cases, reflections or portfolio details. Pure, tested.

import { cleanTagSet } from './tags.js';
import { cleanTemplate } from './clean.js';
import { cleanFormat } from './share-format.js';
import { storedMarkdown } from './markdown.js';
import { cleanExportOpts } from './export-opts.js';
import { cleanDestinations } from './destinations.js';
import { SWITCH_KEYS } from './profiles.js';
import { cleanSync } from './sync-md.js';
import { cleanMine } from './my-themes.js';
import { FACET_KEYS, TUNE_KEYS } from './theme-engine.js';
import { cleanLook, KEEP_GROUPS } from './look-schema.js';
import { cleanLayout } from './analytics.js';
import { cleanLabels, cleanCaseTemplate } from './parts.js';
import { cleanListFormat } from './list-format.js';

export const SETTINGS_KIND = 'apmes-logbook-settings';
// account-specific bookkeeping that shouldn't travel with the file (your residency year is yours, not a colleague's)
const SKIP = new Set(['sharedSeen', 'rYear', 'rYearAY', 'importMap', 'cloudBackup', 'noteIndex']);
// the settings a file may set: plain values, or a cleaner for the ones that hold lists and objects. A key not
// listed here is dropped, and a value of the wrong shape never reaches the account (it would break every device)
const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : '');
const strs = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string').map(x => x.slice(0, 80)).slice(0, 300) : []);
const OBJECTS = {
  // look settings a theme may hold: only the values the Themes page can show (look-schema.js; a wallpaper photo never
  // leaves its device), and which of them stay when changing theme
  ...Object.fromEntries(['navStyle', 'rowLayout', 'formLayout', 'colours', ...FACET_KEYS, ...TUNE_KEYS, 'wallpaper', 'wallDim', 'wallInk', 'wallFrost', 'iconTint', 'iconTintStrength', 'tabIcon'].map(k => [k, v => cleanLook(k, v)])),
  themeKeep: v => (Array.isArray(v) ? KEEP_GROUPS.map(([g]) => g).filter(g => v.includes(g)) : null),
  // the theme when the phone is dark (a theme's id or 'mine:<id>'), case text size (theme-revamp S5)
  nightTheme: v => (typeof v === 'string' && /^(mine:)?[a-z0-9]{1,20}$/.test(v) ? v : null),
  caseSize: v => (['0.9', '1.15', '1.3', '1.5'].includes(String(v)) ? String(v) : null),
  tagSet: v => (v == null ? null : cleanTagSet(v)),
  shareFormat: v => cleanFormat(v),
  markdown: v => { try { return storedMarkdown(v); } catch { return null; } },
  excelExport: v => cleanExportOpts(v),
  destinations: v => cleanDestinations(v),
  sync: v => cleanSync(v),   // where to sync (Settings → Sync); tokens are never in settings
  listFormat: v => cleanListFormat(v),   // Settings → Logging → Pasted list format
  partLabels: v => (v == null ? null : cleanLabels(v)),
  caseTpl: v => (v == null ? null : cleanCaseTemplate(v)),
  catOrder: strs,
  myThemes: v => { const l = cleanMine(v); return l.length ? l : null; },   // your themes (Themes; this device)
  // the Grid's column widths (px, this device; log2 10)
  gridCols: v => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([k, x]) => ['date', 'ini', 'details', 'cats'].includes(k) && Number.isFinite(x)).map(([k, x]) => [k, Math.max(40, Math.min(1200, Math.round(x)))])) : null),
  anLayout: v => cleanLayout(v),   // Analytics Edit mode: the cards' order and the hidden ones
  caseHide: v => strs(v).slice(0, 20),
  basicOn: v => strs(v).slice(0, 30),
  // the profile switches (profiles.js): known keys, true or false
  show: v => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([k, x]) => SWITCH_KEYS.includes(k) || /^case:[a-z]{1,20}$/.test(k)).filter(([, x]) => typeof x === 'boolean')) : null),
  tabOrder: v => strs(v).slice(0, 10),
  moreOrder: v => strs(v).slice(0, 20),
  tabHidden: v => strs(v).slice(0, 10),
  subcats: v => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).slice(0, 100).map(([k, x]) => [String(k).slice(0, 10), strs(x)])) : {}),
  savedSearches: v => (Array.isArray(v) ? v : []).filter(x => x && typeof x === 'object' && !Array.isArray(x) && typeof x.name === 'string').slice(0, 20)
    .map(x => ({ id: str(x.id, 20) || Math.random().toString(36).slice(2, 8), name: str(x.name, 40), q: str(x.q), has: strs(x.has), not: strs(x.not), from: str(x.from, 10), to: str(x.to, 10), flag: str(x.flag, 20), scope: str(x.scope, 20) || 'all', ...(x.global === true ? { global: true } : {}) })),   // global: saved on Search
};
const PLAIN = new Set(['dayNoteOnCase', 'pasteClean', 'shareAsk', 'noteToolbar', 'accent', 'boxLines', 'catView', 'compact', 'compactTags', 'defaultDate', 'detectAgeSex', 'firstField', 'enterMode', 'enterSaves', 'hideTips', 'lbCase', 'lbFuzzy', 'lbScope', 'logbookView',
  'reflExport', 'reflNotes', 'searchOps', 'startTab', 'suggestions', 'tagEditorView', 'textSize', 'zoom', 'fontUi', 'fontUiName', 'fontLog', 'fontLogName', 'lineWidth', 'lineHeight', 'contrast', 'motion', 'tabIcons', 'tabBar', 'hideHeader', 'caseInverted', 'colourful', 'autoFocus', 'appTitle', 'weeklyDigest',
  'basic', 'mode', 'weekStart', 'afterSave', 'undoSecs', 'boxCaps', 'boxCorrect', 'boxSpell', 'reflSpell', 'pinBox', 'pinSearch', 'borders', 'reflPoints', 'round', 'shadows', 'bigTaps', 'swipeTabs', 'rowMenu', 'reflToolbar', 'autoTick', 'recentCount',
  // device keys added later (they were dropped on import until 13 Oct 2026; settings-file.test.mjs checks DISPLAY_KEYS)
  'rowCopy', 'edgeBack', 'hideWords', 'flat', 'btnStyle', 'iconBtns', 'calPlain', 'pageTitles', 'rowShort', 'navStyle', 'rowLayout', 'formLayout', 'rowHold', 'dayCopy', 'hideTabsTyping',
  'labelParts', 'caseTplOn', 'listHeight', 'pageSize', 'lbGroup', 'lbSort', 'gridLines', 'boxHeight', 'boxGrow', 'totalsCompact', 'totalsTargets', 'calRefl', 'detectInitials', 'oneLetterInitials', 'skipStarts', 'theme', 'themeMode', 'headFont', 'bgTint', 'spacing', 'tabStyle', 'band', 'barBlur', 'tabActiveLabel', 'listStyle', 'titleAlign', 'switchStyle', 'pressStyle', 'iconWeight', 'typeStyle']);
const MAX_JSON = 400 * 1024;

// Reset all settings (Settings, at the bottom; owner, 15 Oct 2026): the account's settings back to their defaults (null),
// except what is yours rather than a preference: your year and the app's bookkeeping, your profile (its own page has a
// reset), saved searches, places to send and sync to, and your tags and shorthand unless asked (tags: true).
// -> the patch for patchLogbook({ settings }); never cases, reflections, notes or drafts (they aren't settings)
const KEEP_ON_RESET = new Set([...SKIP, 'mode', 'basic', 'show', 'basicOn', 'caseHide', 'savedSearches', 'destinations', 'sync']);
const TAG_KEYS = ['tagSet', 'subcats', 'catOrder'];
export function resetAccountPatch(settings, { tags = false } = {}) {
  const out = {};
  for (const k of Object.keys(settings || {})) if (!KEEP_ON_RESET.has(k) && (tags || !TAG_KEYS.includes(k)) && settings[k] != null) out[k] = null;
  return out;
}

export function settingsFile(logbook, { theme } = {}) {
  const lb = logbook || {};
  const settings = Object.fromEntries(Object.entries(lb.settings || {}).filter(([k, v]) => !SKIP.has(k) && v !== undefined));
  return { kind: SETTINGS_KIND, version: 1, exportedAt: new Date().toISOString(), settings, templates: lb.templates || [], ...(theme ? { theme } : {}) };
}

// A file's contents -> { settings, templates, theme } ready to save, or throws a message for the user
export function readSettingsFile(text) {
  if (String(text || '').length > MAX_JSON) throw new Error('That file is too big to be a settings file');
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('That isn’t a settings file (not JSON)'); }
  if (!d || d.kind !== SETTINGS_KIND) throw new Error(d && d.kind === undefined && d.logbook ? 'That is a full backup: restore it under More → Export / Import' : 'That isn’t a settings file from this app');
  if (!d.settings || typeof d.settings !== 'object' || Array.isArray(d.settings)) throw new Error('The file has no settings');
  const settings = {};
  for (const [k, v] of Object.entries(d.settings)) {
    if (SKIP.has(k)) continue;
    if (Object.hasOwn(OBJECTS, k)) settings[k] = OBJECTS[k](v);
    else if (PLAIN.has(k) && (v === null || (typeof v === 'string' && v.length <= 200) || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean')) settings[k] = v;
  }
  const templates = Array.isArray(d.templates) ? d.templates.slice(0, 100).map(cleanTemplate).filter(t => t.id && t.cats.length) : null;
  const theme = ['light', 'dark', 'oled', 'auto'].includes(d.theme) ? d.theme : null;
  return { settings, templates, theme };
}

// ---- this browser's own saved choices as a file (look, text size, tab layout, unsent case drafts) ----
// Used when the logbook moves address: what a browser saves belongs to its address, so the old address offers this file and
// Settings -> Settings file at the new one loads it. Never cases from the account; no demo data, no Google / Dropbox sign-in state.
export const DEVICE_KIND = 'apmes-logbook-device';
const DEVICE_KEY = /^(apmes-)?logbook-/;
const NOT_DEVICE = /^apmes-logbook-(demo|moved|cloud)/;
export const isDeviceKey = k => DEVICE_KEY.test(String(k)) && !NOT_DEVICE.test(String(k));
// entries: [[key, value]] from localStorage -> the file's contents
export function deviceFile(entries) {
  const items = {};
  for (const [k, v] of entries || []) if (isDeviceKey(k) && typeof v === 'string' && v.length <= 100 * 1024) items[k] = v;
  return { kind: DEVICE_KIND, version: 1, exportedAt: new Date().toISOString(), items };
}
// a file's text -> { items } to write into localStorage, or throws a message for the user
export function readDeviceFile(text) {
  if (String(text || '').length > MAX_JSON * 2) throw new Error('That file is too big to be a device file');
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('That isn’t a device file (not JSON)'); }
  if (!d || d.kind !== DEVICE_KIND || !d.items || typeof d.items !== 'object' || Array.isArray(d.items)) throw new Error('That isn’t a device file from this app');
  const items = {};
  for (const [k, v] of Object.entries(d.items).slice(0, 200)) if (isDeviceKey(k) && typeof v === 'string' && v.length <= 100 * 1024) items[k] = v;
  return { items };
}
export const isDeviceFile = text => { try { return JSON.parse(text)?.kind === DEVICE_KIND; } catch { return false; } };
