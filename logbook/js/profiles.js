// Profiles as presets (owner, 13 Oct 2026: "changing profiles simply toggles a bunch of switches"). Everything a profile
// hides is a switch of its own (SWITCHES, account settings), and the tab bar's defaults are the device half of the
// preset (PROFILE_OFF / PROFILE_ON). A switch's value is the one saved for it, else its profile's default, so an
// account with only `mode` saved looks exactly as it did. Picking a profile clears the saved values (applyPatch), and
// the profile shows as "Custom (based on …)" once any switch differs from its preset. Pure: tested in profiles.test.mjs.

export const PROFILE_IDS = ['logbook', 'basic', 'advanced', 'personal', 'faculty'];

// [key, label, group]. Case tab parts are 'case:<part>' (CASE_PARTS in ui-log.js; their switches live there and in
// the Case tab group; these labels are for the lists of changes); 'case:still' is an APMES one too. Groups: extras (what Basic leaves out), case, apmes.
export const SWITCHES = [
  ['grid', 'The Logbook grid view', 'extras'],
  ['analytics', 'Analytics trends, forecasts, Gone quiet, reflection to-dos and links to cases', 'extras'],
  ['reflExtras', 'Figures and references in reflections', 'extras'],
  ['reflect', 'Reflect buttons, ☆ Interesting and reflection headings in Analytics', 'extras'],
  ['case:interesting', 'Interesting on the Case tab', 'case'],
  ['case:quick', 'Quick picks on the Case tab', 'case'],
  ['case:groupsave', 'Save as a tag group on the Case tab', 'case'],
  ['case:plan', 'Plan for later on the Case tab', 'case'],
  ['targets', 'Counts against the APMES targets', 'apmes'],
  ['case:still', 'Still needed (on the Case tab)', 'apmes'],
  ['totals', 'Programme totals (Compare with your intake)', 'apmes'],
  ['portfolio', 'Portfolio export and Section 1 details', 'apmes'],
  ['year', 'Residency year', 'apmes'],
  ['reflHeadings', 'Reflection headings (the APMES list)', 'apmes'],
  ['saveToast', '“LSCS now 4/10” after Save', 'apmes'],
  ['apmesTitle', 'APMES in the app’s name', 'apmes'],
];
export const SWITCH_KEYS = SWITCHES.map(([k]) => k);
export const switchLabel = key => (SWITCHES.find(([k]) => k === key) || [key, key])[1];
// (Basic leaves out every optional Case tab part, Still needed too)
const EXTRAS = SWITCHES.filter(s => s[2] === 'extras' || s[0].startsWith('case:')).map(([k]) => k);
// the items older copies of the app let a Basic profile turn back on (settings.basicOn)
const BASIC_ITEMS = EXTRAS;
const APMES = SWITCHES.filter(s => s[2] === 'apmes').map(([k]) => k);

// what each profile turns off (everything else is on). Basic: the extras and the optional Case tab parts;
// logbook only: Basic without reflections; Personal: the APMES parts, with the extras on.
const PRESET_OFF = {
  logbook: EXTRAS,
  basic: EXTRAS.filter(k => k !== 'reflect'),
  advanced: [],
  personal: APMES,
  faculty: [],
};
// a profile's default for a switch (true for anything it doesn't govern, like 'case:parsed')
export const presetOn = (mode, key) => !(PRESET_OFF[mode] || []).includes(key);

// The saved value, else the profile's default. Older accounts saved two lists before the `show` map: caseHide (Case
// tab parts switched off) and basicOn (items a Basic profile hides, switched back on); they still count.
export function shownIn(st, mode, key) {
  const show = (st && st.show) || {};
  if (typeof show[key] === 'boolean') return show[key];
  if (key.startsWith('case:') && ((st && st.caseHide) || []).includes(key.slice(5))) return false;
  if (((st && st.basicOn) || []).includes(key)) return true;
  return presetOn(mode, key);
}

// One switch saved: the settings patch. `show` carries only the changed key: Firestore merges the map key by key
// (setDoc with merge), so another device's newer switches are never written over, and mergeSettings does the same
// here and in demo mode. caseHide (Case tab parts off) and basicOn (Basic's items turned on) are kept in step, so an
// older copy of the app on another device agrees until it updates. parts: every Case tab part in order (caseHide's order).
export function switchPatch(st, key, on, parts = []) {
  const patch = { show: { [key]: !!on } };
  const was = (st && st.basicOn) || [];
  const legacyOn = was.filter(k => k !== key);
  if (on && BASIC_ITEMS.includes(key)) legacyOn.push(key);
  if (legacyOn.length !== was.length || legacyOn.some((k, i) => k !== was[i])) patch.basicOn = legacyOn.length ? legacyOn : null;
  if (key.startsWith('case:')) {
    const part = key.slice(5), hide = new Set((st && st.caseHide) || []);
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
  const parts = keys.filter(k => k.startsWith('case:')).map(k => k.slice(5));
  const hide = ((st && st.caseHide) || []).filter(p => !parts.includes(p));
  const on = ((st && st.basicOn) || []).filter(k => !keys.includes(k));
  return { show, caseHide: hide.length ? hide : null, basicOn: on.length ? on : null };
}

// A settings file's `show` replaces the account's: the keys the account has and the file doesn't go (as null)
export const replaceShow = (cur, next) => ({ ...Object.fromEntries(Object.keys(cur || {}).map(k => [k, null])), ...(next || {}) });

// Settings after a patch, as Firestore's merge leaves them: top-level keys replaced, `show` merged key by key (null
// clears the whole map). Used for the local copy (patchLogbook) and the demo backend, so both match the cloud.
export function mergeSettings(cur, patch) {
  const out = { ...(cur || {}), ...(patch || {}) };
  const a = cur && cur.show, b = patch && patch.show;
  if (b && typeof b === 'object' && a && typeof a === 'object') out.show = { ...a, ...b };
  return out;
}

// Picking a profile: its mode, and every switch back to that profile's default (the Case tab parts no profile
// governs, like 'case:parsed', stay as they were)
export function applyPatch(st, mode) {
  const governed = SWITCH_KEYS.filter(k => k.startsWith('case:')).map(k => k.slice(5));
  const hide = ((st && st.caseHide) || []).filter(p => !governed.includes(p));
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

// tabs off the bar until someone puts them there (they live in More by default)
export const OFF_BAR = ['caselogs', 'notes', 'account', 'settings', 'recovery', 'data', 'admin'];
// the Basic profiles keep Analytics in More too, and Basic: logbook only Reflections; Faculty / PCs keeps the person's
// own Case, Logbook and Reflections in More
export const PROFILE_OFF = { advanced: [], basic: ['progress'], logbook: ['progress', 'reflect'], personal: [], faculty: ['log', 'logbook', 'reflect'] };
// OFF_BAR tabs a profile puts on the bar: Case logs and the Admin portal (admins only) in Faculty / PCs, Notes in Personal
export const PROFILE_ON = { faculty: ['caselogs', 'admin'], personal: ['notes'] };
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
