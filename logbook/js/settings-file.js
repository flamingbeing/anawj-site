// Settings export / import (Settings → Settings file): your preferences, tag set, shorthand, tag groups,
// Markdown format, Excel choices and saved searches as one small JSON file, to move them to another
// account or share a setup with a colleague. Never cases, reflections or portfolio details. Pure, tested.

import { cleanTagSet } from './tags.js';
import { cleanTemplate } from './demo-backend.js';
import { cleanFormat } from './share-format.js';
import { storedMarkdown } from './markdown.js';
import { cleanExportOpts } from './export-opts.js';
import { cleanDestinations } from './destinations.js';

export const SETTINGS_KIND = 'apmes-logbook-settings';
// account-specific bookkeeping that shouldn't travel with the file (your residency year is yours, not a colleague's)
const SKIP = new Set(['sharedSeen', 'rYear', 'rYearAY', 'importMap', 'cloudBackup', 'noteIndex']);
// the settings a file may set: plain values, or a cleaner for the ones that hold lists and objects. A key not
// listed here is dropped, and a value of the wrong shape never reaches the account (it would break every device)
const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : '');
const strs = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string').map(x => x.slice(0, 80)).slice(0, 300) : []);
const OBJECTS = {
  tagSet: v => (v == null ? null : cleanTagSet(v)),
  shareFormat: v => cleanFormat(v),
  markdown: v => { try { return storedMarkdown(v); } catch { return null; } },
  excelExport: v => cleanExportOpts(v),
  destinations: v => cleanDestinations(v),
  catOrder: strs,
  caseHide: v => strs(v).slice(0, 20),
  basicOn: v => strs(v).slice(0, 30),
  tabOrder: v => strs(v).slice(0, 10),
  tabHidden: v => strs(v).slice(0, 10),
  subcats: v => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).slice(0, 100).map(([k, x]) => [String(k).slice(0, 10), strs(x)])) : {}),
  savedSearches: v => (Array.isArray(v) ? v : []).filter(x => x && typeof x === 'object' && !Array.isArray(x) && typeof x.name === 'string').slice(0, 20)
    .map(x => ({ id: str(x.id, 20) || Math.random().toString(36).slice(2, 8), name: str(x.name, 40), q: str(x.q), has: strs(x.has), not: strs(x.not), from: str(x.from, 10), to: str(x.to, 10), flag: str(x.flag, 20), scope: str(x.scope, 20) || 'all' })),
};
const PLAIN = new Set(['accent', 'boxLines', 'catView', 'compact', 'compactTags', 'defaultDate', 'detectAgeSex', 'firstField', 'enterMode', 'enterSaves', 'hideTips', 'lbCase', 'lbFuzzy', 'lbScope', 'logbookView',
  'reflExport', 'reflNotes', 'searchOps', 'startTab', 'suggestions', 'tagEditorView', 'textSize', 'zoom', 'fontUi', 'fontUiName', 'fontLog', 'fontLogName', 'lineWidth', 'lineHeight', 'contrast', 'motion', 'tabIcons', 'tabBar', 'hideHeader', 'caseInverted', 'colourful', 'autoFocus', 'appTitle', 'weeklyDigest',
  'basic', 'mode', 'weekStart', 'afterSave', 'undoSecs', 'boxCaps', 'boxCorrect', 'boxSpell', 'reflSpell', 'pinBox', 'pinSearch', 'borders', 'reflPoints', 'round', 'shadows', 'bigTaps', 'swipeTabs', 'rowMenu', 'reflToolbar', 'autoTick', 'recentCount']);
const MAX_JSON = 400 * 1024;

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
