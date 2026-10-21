// Profiles as presets (owner, 13 Oct 2026: "changing profiles simply toggles a bunch of switches"). Everything a profile
// hides is a switch of its own (SWITCHES, account settings), and the tab bar's defaults are the device half of the
// preset (PROFILE_OFF / PROFILE_ON). A switch's value is the one saved for it, else its profile's default, so an
// account with only `mode` saved looks exactly as it did. Picking a profile clears the saved values (applyPatch), and
// the profile shows as "Custom (based on …)" once any switch differs from its preset. Pure: tested in profiles.test.mjs.

import { expandParts } from './logging.js';

export const PROFILE_IDS = ['logbook', 'basic', 'advanced', 'personal', 'faculty'];

// [key, label, group]. Add tab parts are 'case:<part>' (CASE_PARTS in ui-log.js; their switches live there and in
// the Add tab group; these labels are for the lists of changes); 'case:still' is an APMES one too. Groups: extras (what Basic leaves out), case, apmes.
export const SWITCHES = [
  ['grid', 'The Logbook grid view', 'extras'],
  ['analytics', 'Analytics trends, forecasts, Gone quiet, reflection to-dos and links to cases', 'extras'],
  ['reflExtras', 'Figures and references in reflections', 'extras'],
  ['reflect', 'Reflect buttons, ☆ Interesting and reflection headings in Analytics', 'extras'],
  ['case:interesting', 'Interesting on the Add tab', 'case'],
  ['case:sugg', 'Suggested tags as you type on the Add tab', 'case'],
  ['case:recent', 'Quick picks (Same as last, tag groups) on the Add tab', 'case'],
  ['case:groupsave', 'Save as a tag group on the Add tab', 'case'],
  ['case:plan', 'Plan for later on the Add tab', 'case'],
  ['targets', 'Counts against the APMES targets', 'apmes'],
  ['case:still', 'Still needed (on the Add tab)', 'apmes'],
  ['totals', 'Programme totals (the Totals tab, You and your year)', 'apmes'],
  ['portfolio', 'Portfolio export and Section 1 details', 'apmes'],
  ['year', 'Residency year', 'apmes'],
  ['reflHeadings', 'Reflection headings (the APMES list)', 'apmes'],
  ['saveToast', '“LSCS now 4/10” after Save', 'apmes'],
  ['apmesTitle', 'APMES in the app’s name', 'apmes'],
  ['evalRequest', 'Request an evaluation from a case', 'apmes'],
];
export const SWITCH_KEYS = SWITCHES.map(([k]) => k);
export const switchLabel = key => (SWITCHES.find(([k]) => k === key) || [key, key])[1];
// (Basic leaves out every optional Add tab part, Still needed too)
const EXTRAS = SWITCHES.filter(s => s[2] === 'extras' || s[0].startsWith('case:')).map(([k]) => k);
// the items older copies of the app let a Basic profile turn back on (settings.basicOn)
const BASIC_ITEMS = EXTRAS;
const APMES = SWITCHES.filter(s => s[2] === 'apmes').map(([k]) => k);

// what each profile turns off (everything else is on). Basic: the extras and the optional Add tab parts;
// logbook only: Basic without reflections; Personal: the APMES parts, with the extras on.
// Full Analytics in every profile (owner, 15 Oct 2026): Personal still leaves out the APMES parts, and Basic: logbook
// only the reflection parts, as their own switches.
const PRESET_OFF = {
  logbook: EXTRAS.filter(k => k !== 'analytics'),
  basic: EXTRAS.filter(k => k !== 'reflect' && k !== 'analytics'),
  advanced: [],
  personal: APMES,
  faculty: [],
};
// Opt-in switches (new options, off by default): off in every profile unless its PRESET_ON lists them. Request an
// evaluation (phone batch, 13 Oct 2026) is off everywhere until switched on.
export const OPT_IN = ['evalRequest'];
const PRESET_ON = {};
// a profile's default for a switch (true for anything it doesn't govern, like 'case:parsed')
export const presetOn = (mode, key) => (OPT_IN.includes(key) ? (PRESET_ON[mode] || []).includes(key) : !(PRESET_OFF[mode] || []).includes(key));

// The Add tab part 'quick' was split into 'sugg' and 'recent' (logging.js expandParts): an older 'quick' in
// caseHide, basicOn or `show` stands for both.
const OLD_PART = { 'case:sugg': 'case:quick', 'case:recent': 'case:quick' };
const hideList = st => expandParts((st && st.caseHide) || []);
const onList = st => expandParts((st && st.basicOn) || [], 'case:');
const sameList = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);

// The saved value, else the profile's default. Older accounts saved two lists before the `show` map: caseHide (Case
// tab parts switched off) and basicOn (items a Basic profile hides, switched back on); they still count.
export function shownIn(st, mode, key) {
  const show = (st && st.show) || {};
  if (typeof show[key] === 'boolean') return show[key];
  if (OLD_PART[key] && typeof show[OLD_PART[key]] === 'boolean') return show[OLD_PART[key]];
  if (key.startsWith('case:') && hideList(st).includes(key.slice(5))) return false;
  if (onList(st).includes(key)) return true;
  return presetOn(mode, key);
}

// One switch saved: the settings patch. `show` carries only the changed key: the cloud merges the map key by key
// (saveLogbook writes each show key on its own, mergeFields), so another device's newer switches are never written over,
// and mergeSettings does the same here and in demo mode. caseHide (Add tab parts off) and basicOn (Basic's items
// turned on) are kept in step, so an older copy of the app on another device shows the same until it updates. Only that
// way round: once a switch is in `show`, an older copy changing only caseHide or basicOn is not seen here (shownIn
// reads `show` first) until the switch is set again or a profile is picked. A known limit, healed when it updates.
// parts: every Add tab part in order (caseHide's order).
export function switchPatch(st, key, on, parts = []) {
  const patch = { show: { [key]: !!on } };
  // the old combined part ('case:quick', both of these): the other of the two keeps its value, and 'quick' goes
  const old = OLD_PART[key], cur = (st && st.show) || {};
  if (old && typeof cur[old] === 'boolean') {
    const other = Object.keys(OLD_PART).find(k => k !== key && OLD_PART[k] === old);
    if (typeof cur[other] !== 'boolean') patch.show[other] = cur[old];
    patch.show[old] = null;
  }
  const was = (st && st.basicOn) || [];
  const legacyOn = onList(st).filter(k => k !== key);
  if (on && BASIC_ITEMS.includes(key)) legacyOn.push(key);
  if (!sameList(legacyOn, was)) patch.basicOn = legacyOn.length ? legacyOn : null;
  if (key.startsWith('case:')) {
    const part = key.slice(5), hide = new Set(hideList(st));
    if (on) hide.delete(part); else hide.add(part);
    const order = [...parts, ...[...hide].filter(p => !parts.includes(p))];
    patch.caseHide = hide.size ? order.filter(p => hide.has(p)) : null;
  }
  return patch;
}

// Back to the defaults for some switches (a group's "Reset"): their saved values go, in all three places. Each key is
// sent as null (not left out of `show`): Firestore's merge keeps any key a patch leaves out.
export function resetPatch(st, keys) {
  const show = Object.fromEntries(keys.map(k => [k, null]));
  // the old combined part ('case:quick') goes with either half; a half not being reset keeps its value
  const cur = (st && st.show) || {};
  for (const k of keys) {
    const old = OLD_PART[k];
    if (!old || typeof cur[old] !== 'boolean') continue;
    show[old] = null;
    const other = Object.keys(OLD_PART).find(x => x !== k && OLD_PART[x] === old);
    if (!keys.includes(other) && typeof cur[other] !== 'boolean') show[other] = cur[old];
  }
  const parts = keys.filter(k => k.startsWith('case:')).map(k => k.slice(5));
  const hide = hideList(st).filter(p => !parts.includes(p));
  const on = onList(st).filter(k => !keys.includes(k));
  return { show, caseHide: hide.length ? hide : null, basicOn: on.length ? on : null };
}

// A settings file's `show` replaces the account's: the keys the account has and the file doesn't go (as null)
export const replaceShow = (cur, next) => ({ ...Object.fromEntries(Object.keys(cur || {}).map(k => [k, null])), ...(next || {}) });

// A settings file from before the `show` map (mode, basicOn, caseHide only): the switches those lists set, as a `show`
// map holding what differs from the mode's defaults, so they win over the account's own `show` (shownIn reads it
// first). null when the file has neither list.
export function legacyShow(fileSettings, mode) {
  const f = fileSettings || {};
  if (f.show || (!Array.isArray(f.basicOn) && !Array.isArray(f.caseHide))) return null;
  const st = { basicOn: f.basicOn, caseHide: f.caseHide };
  return Object.fromEntries(SWITCH_KEYS.map(k => [k, shownIn(st, mode, k)]).filter(([k, on]) => on !== presetOn(mode, k)));
}

// The field paths saveLogbook writes (Firestore setDoc mergeFields), so the cloud stores a patch as mergeSettings does:
// each top-level key and each settings key replaced whole (a map like settings.markdown too: with a plain merge,
// Firestore would merge it key by key and keep keys the new value leaves out), `show` key by key. Arrays of segments.
export function mergePaths(doc) {
  const out = [];
  for (const [k, v] of Object.entries(doc || {})) {
    if (k !== 'settings' || !v || typeof v !== 'object' || Array.isArray(v)) { out.push([k]); continue; }
    for (const [sk, sv] of Object.entries(v)) {
      if (sk === 'show' && sv && typeof sv === 'object' && !Array.isArray(sv)) for (const key of Object.keys(sv)) out.push(['settings', 'show', key]);
      else out.push(['settings', sk]);
    }
  }
  return out;
}

// Settings after a patch, as the cloud stores it (saveLogbook, mergePaths): settings keys replaced whole, `show` merged
// key by key (null clears the whole map). Used for the local copy (patchLogbook) and the demo backend, so both match.
export function mergeSettings(cur, patch) {
  const out = { ...(cur || {}), ...(patch || {}) };
  const a = cur && cur.show, b = patch && patch.show;
  if (b && typeof b === 'object' && a && typeof a === 'object') out.show = { ...a, ...b };
  return out;
}

// Picking a profile: its mode, and every switch back to that profile's default (the Add tab parts no profile
// governs, like 'case:parsed', stay as they were)
export function applyPatch(st, mode) {
  const governed = SWITCH_KEYS.filter(k => k.startsWith('case:')).map(k => k.slice(5));
  const hide = hideList(st).filter(p => !governed.includes(p));
  return { mode, basic: null, basicOn: null, show: null, caseHide: hide.length ? hide : null };
}

// The switches that differ from a profile's defaults ({ on: [...], off: [...] }, in SWITCHES order): with `to`, what
// picking that profile would change; without it, what makes the current one "Custom"
export function switchChanges(st, mode, to = mode) {
  const on = [], off = [];
  for (const k of SWITCH_KEYS) {
    const now = shownIn(st, mode, k), next = presetOn(to, k);
    if (now === next) continue;
    (next ? on : off).push(k);
  }
  return { on, off };
}

// ---- the device half: which tabs a profile keeps off the bar or puts on it ----

// tabs off the bar until someone puts them there (they live in More by default); Analytics too since 15 Oct 2026
// (owner: Case, Logbook, Totals, Reflections, More)
export const OFF_BAR = ['caselogs', 'progress', 'notes', 'account', 'settings', 'recovery', 'data', 'admin'];
// the Basic profiles keep Analytics in More, and Basic: logbook only Reflections; Faculty / PCs keeps the person's
// own Case, Logbook and Reflections in More, with Case logs and Analytics (both also in OFF_BAR: listed here so a device
// moving into the profile with its tabs arranged takes them off the bar), leaving Totals, the Admin portal and More
export const PROFILE_OFF = { advanced: [], basic: ['progress'], logbook: ['progress', 'reflect'], personal: [], faculty: ['log', 'logbook', 'reflect', 'caselogs', 'progress'] };
// OFF_BAR tabs a profile puts on the bar: the Admin portal (admins only) in Faculty / PCs, Analytics in Advanced, and
// Notes and Analytics in Personal (owner, 15 Oct 2026: logbook only Case · Logbook · Totals · More; Basic + Reflections;
// Advanced + Reflections · Analytics; Personal Case · Logbook · Notes · Reflections · Analytics · More)
export const PROFILE_ON = { faculty: ['admin'], advanced: ['progress'], personal: ['notes', 'progress'] };
export const offBar = mode => [...OFF_BAR.filter(id => !(PROFILE_ON[mode] || []).includes(id)), ...(PROFILE_OFF[mode] || [])];
// a profile's default for one tab: off the bar?
export const presetHidesTab = (mode, id) => offBar(mode).includes(id);

// This device's saved hidden tabs after moving from one profile to another: only the tabs either profile moves
// (its PROFILE_OFF / PROFILE_ON) go where the new profile puts them; the rest stay as arranged (Notes put on the bar
// by hand stays there from Basic to Advanced). Returns the new tabHidden list, or null when the device keeps the
// profile's defaults (nothing saved: arrangeTabs then follows the profile by itself).
export const ownTabs = mode => [...(PROFILE_OFF[mode] || []), ...(PROFILE_ON[mode] || [])];
export function tabsAfter(tabHidden, from, to) {
  if (!Array.isArray(tabHidden)) return null;
  const hid = new Set(tabHidden);
  for (const id of new Set([...ownTabs(from), ...ownTabs(to)])) if (presetHidesTab(to, id)) hid.add(id); else hid.delete(id);
  return [...hid];
}
