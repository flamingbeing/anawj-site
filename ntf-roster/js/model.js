// NTF Roster: the data model. State shape, defaults, local-date helpers, cell helpers and code tokens.
// Plain functions over plain data (see SPEC.md "State"). No DOM, so node tests and the solver worker can use it.

export const STORE_KEY = 'ntf-roster-v1';
export const DEMO_KEY = 'ntf-roster-demo';

// ---------- defaults ----------

// Sheet order: the department's "ALL STAFF LEAVE REQUEST" sections, top to bottom.
export const DEFAULT_GROUPS = [
  { id: 'cons', name: 'Senior consultants / consultants', kind: 'senior' },
  { id: 'ac', name: 'Associate consultants', kind: 'senior' },
  { id: 'ext', name: 'NUH / NTFGH / ICU consultants', kind: 'senior' },
  { id: 'vc', name: 'Visiting consultants', kind: 'senior' },
  { id: 'sr', name: 'Senior residents', kind: 'junior' },
  { id: 'srp', name: 'Senior resident physicians', kind: 'junior' },
  { id: 'rp', name: 'Resident physicians', kind: 'junior' },
  { id: 'jr', name: 'Junior residents', kind: 'junior' },
  { id: 'locum', name: 'Locums', kind: 'junior' },
  { id: 'mo', name: 'Medical officers', kind: 'junior' },
];

export const DEFAULT_TAGS = [
  { id: 'babymo', name: 'Baby MO', help: 'New MO, never on call alone' },
  { id: 'parttime', name: 'Part time', help: 'Works part time: set their FTE' },
  { id: 'pain', name: 'Pain (APS)', help: 'Does acute pain service weeks' },
  { id: 'icu', name: 'ICU', help: 'ICU posting or ICU trained' },
];

const duty = (code, name, kind, color, ink, extra = {}) =>
  ({ code, name, kind, color, ink, overnight: false, auto: false, hours: 0, ...extra });
const shift = (code, name, color, extra) => duty(code, name, 'shift', color, '#fff', { hours: 8, ...extra });
const leave = (code, name, color = '#fde2e4') => duty(code, name, 'leave', color, '#7a1c27');
const request = (code, name) => duty(code, name, 'request', '#0b5394', '#fff');   // UI draws requests as outlined chips
const other = (code, name) => duty(code, name, 'other', '#e0e0e0', '#333');

export const DEFAULT_DUTIES = [
  shift('C', 'Call', '#c62828', { overnight: true, auto: true, hours: 24 }),
  shift('P', 'PM shift', '#ef6c00', { auto: true, hours: 5 }),
  shift('SMO', 'Stepdown MO call', '#6a1b9a', { overnight: true, auto: true, hours: 24 }),
  shift('OTC', 'OT consultant', '#1565c0', { auto: true, hours: 10 }),
  shift('PHD', 'Public holiday day shift', '#00838f', { auto: true, hours: 12 }),
  shift('W', 'Weekend duty', '#4527a0', { overnight: true, hours: 24 }),
  shift('Creg', 'Call tag-on', '#ad1457', { hours: 4 }),
  shift('APS', 'Acute pain service', '#2e7d32'),
  shift('Clinic', 'Clinic', '#558b2f', { hours: 4 }),
  shift('Inj', 'Injection list', '#827717', { hours: 4 }),
  leave('AL', 'Annual leave', '#f8c9cf'),
  leave('AAL', 'Advance annual leave'),
  leave('CL', 'Conference/training leave'),
  leave('TL', 'Training leave'),
  leave('EL', 'Exam leave'),
  leave('RS', 'Reservist'),
  leave('MC', 'Medical leave'),
  leave('HL', 'Hospitalisation leave'),
  leave('ML', 'Maternity leave'),
  leave('NPL', 'No pay leave'),
  leave('OIL', 'Off in lieu'),
  leave('FCL', 'Family care leave'),
  leave('CCL', 'Childcare leave'),
  leave('SPL', 'Special leave'),
  request('Cr', 'Call request'),
  request('Nc', 'No call'),
  request('Wr', 'Weekend shift request'),
  request('Nw', 'No weekend shift'),
  request('Pr', 'PM request'),
  request('NP', 'No PM shift'),
  other('NUH', 'At NUH'),
  other('ICM', 'ICU posting'),
  other('LT', 'Liver transplant'),
  other('Mtg', 'Meeting'),
  other('Teach', 'Teaching'),
  duty('x', 'Post call', 'derived', '#eeeeee', '#555'),
];

// Default rules live here (data only) so defaultState() needs no import from rules.js (no circular import);
// rules.js re-exports them as DEFAULT_RULES. The owner tunes them in the app.
const JUNIORS = ['sr', 'srp', 'rp', 'jr', 'locum', 'mo'];
const SENIORS = ['cons', 'ac'];
const R = (id, type, name, params, o = {}) => ({
  id, type, name, enabled: true, hard: o.hard !== false, weight: o.weight ?? 10,
  who: { groups: [], tags: [], staff: [], exclude: [], ...(o.who || {}) },
  when: { from: '', to: '', days: [], holidays: 'any', ...(o.when || {}) },
  params, note: o.note || '',
});
const soft = (weight, more = {}) => ({ hard: false, weight, ...more });
export const DEFAULT_RULES = [
  R('r-leave', 'sameDay', 'No shifts on leave', { codesA: ['@leave'], codesB: ['@shift'], mode: 'forbid' }),
  R('r-postcall', 'sameDay', 'Post call is a day off', { codesA: ['x'], codesB: ['@shift'], mode: 'forbid' }),
  R('r-jcall', 'cover', '', { codes: ['C'], min: 2, max: 2 }, { who: { groups: JUNIORS } }),
  R('r-scall', 'cover', '', { codes: ['C'], min: 1, max: 1 }, { who: { groups: SENIORS } }),
  R('r-gap', 'sequence', 'At least 3 days between calls', { ifCodes: ['C'], thenCodes: ['C'], mode: 'forbid', from: 1, to: 2 }, soft(20)),
  R('r-maxcall', 'limit', '', { codes: ['C'], period: 'month', window: 7, min: null, max: 7, fte: true, prorate: false }, { who: { groups: JUNIORS } }),
  R('r-wkend', 'limit', 'At most 2 weekend calls a month', { codes: ['C'], period: 'month', window: 7, min: null, max: 2, fte: false, prorate: false }, soft(20, { when: { days: [0, 6] } })),
  R('r-fair-j', 'spread', '', { codes: ['C'], period: 'month', weekendWeight: 2, holidayWeight: 2, tolerance: 1 }, soft(5, { who: { groups: JUNIORS } })),
  R('r-fair-s', 'spread', '', { codes: ['C'], period: 'month', weekendWeight: 2, holidayWeight: 2, tolerance: 1 }, soft(5, { who: { groups: SENIORS } })),
  R('r-req-cr', 'requests', '', { request: 'Cr', codes: ['C'], mode: 'want', span: 'day' }, soft(10)),
  R('r-req-nc', 'requests', '', { request: 'Nc', codes: ['C'], mode: 'avoid', span: 'day' }),
  R('r-req-wr', 'requests', '', { request: 'Wr', codes: ['@shift'], mode: 'want', span: 'weekend' }, soft(5)),
  R('r-req-nw', 'requests', '', { request: 'Nw', codes: ['@shift'], mode: 'avoid', span: 'weekend' }, soft(50)),
  R('r-req-pr', 'requests', '', { request: 'Pr', codes: ['P'], mode: 'want', span: 'day' }, soft(5)),
  R('r-req-np', 'requests', '', { request: 'NP', codes: ['P'], mode: 'avoid', span: 'day' }),
  R('r-baby', 'together', 'A Baby MO on call needs a senior resident, RP or AC on call',
    { codes: ['C'], other: { groups: ['sr', 'srp', 'rp', 'ac'], tags: [], staff: [], exclude: [] }, otherCodes: ['C'], mode: 'needs', min: 1 },
    { who: { tags: ['babymo'] } }),
  R('r-baby2', 'together', 'Two Baby MOs never on call together',
    { codes: ['C'], other: { groups: [], tags: ['babymo'], staff: [], exclude: [] }, otherCodes: ['C'], mode: 'never', min: 1 },
    { who: { tags: ['babymo'] } }),
  R('r-preleave', 'sequence', 'No call the night before leave', { ifCodes: ['C'], thenCodes: ['@leave'], mode: 'forbid', from: 1, to: 1 }, soft(10)),
  R('r-pm', 'cover', '', { codes: ['P'], min: 1, max: 1 }, { who: { groups: JUNIORS }, when: { days: [1, 2, 3, 4, 5], holidays: 'exclude' } }),
  R('r-otc', 'eligible', '', { codes: ['OTC'] }, { who: { groups: ['cons', 'ac', 'ext', 'vc'] } }),
  R('r-phd', 'cover', '', { codes: ['PHD'], min: 1, max: 1 }, { who: { groups: JUNIORS }, when: { holidays: 'only' } }),
];

const clone = o => JSON.parse(JSON.stringify(o));

export function defaultState() {
  return migrate({
    v: 1,
    settings: { dept: 'NTFGH Department of Anaesthesia', holidays: {} },
    groups: clone(DEFAULT_GROUPS),
    tags: clone(DEFAULT_TAGS),
    staff: [],
    duties: clone(DEFAULT_DUTIES),
    rules: clone(DEFAULT_RULES),
    rulesLog: [],
    months: {},
    cells: {},
  });
}

// Fill missing fields (old saves, imports, cloud loads). Mutates and returns the state. Anything a damaged or
// hand-made file could hold is made safe here: lists hold objects with a string id (or code), duty kinds and colours
// are from a fixed set (they end up in class names and styles), and maps are plain objects.
export const DUTY_KINDS = ['shift', 'leave', 'request', 'other', 'derived'];
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v, dflt = '') => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : dflt);
const COLOUR = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
const strList = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x) : []);
// a list a hand-edited file may hold as "a,b" (who lists, weekdays)
const looseList = v => (typeof v === 'string' && v ? v.split(',').map(x => x.trim()).filter(Boolean) : Array.isArray(v) ? v : []);
// One duty code made safe (kind from the fixed set, colours as #rgb / #rrggbb). Expects a string `code`.
export function cleanDuty(d) {
  const out = { name: d.code, kind: 'other', color: '#e0e0e0', ink: '#333', overnight: false, auto: false, hours: 0, ...d };
  out.code = str(d.code);
  if (!DUTY_KINDS.includes(out.kind)) out.kind = 'other';
  out.name = str(out.name, out.code);
  if (!COLOUR.test(str(out.color))) out.color = '#e0e0e0';
  if (!COLOUR.test(str(out.ink))) out.ink = '#333333';
  out.overnight = !!out.overnight; out.auto = !!out.auto;
  out.hours = Number(out.hours) || 0;
  return out;
}
// One rule made safe: who lists are lists of strings, days are 0..6, params an object. Expects a string `type`.
export function cleanRule(r) {
  const who = isObj(r.who) ? r.who : {}, when = isObj(r.when) ? r.when : {};
  const lists = Object.fromEntries(['groups', 'tags', 'staff', 'exclude'].map(k => [k, strList(looseList(who[k]))]));
  return {
    name: '', enabled: true, hard: true, weight: 10, note: '', ...r,
    id: str(r.id) || uid('r'), name: str(r.name), note: str(r.note),
    params: isObj(r.params) ? r.params : {},
    who: { ...who, ...lists },
    when: { from: '', to: '', holidays: 'any', ...when, days: looseList(when.days).map(Number).filter(x => Number.isInteger(x) && x >= 0 && x <= 6) },
  };
}
export function migrate(s) {
  if (!isObj(s)) return defaultState();
  s.v = 1;
  s.settings = { dept: 'NTFGH Department of Anaesthesia', holidays: {}, ...(isObj(s.settings) ? s.settings : {}) };
  s.settings.dept = str(s.settings.dept, 'NTFGH Department of Anaesthesia');
  if (!isObj(s.settings.holidays)) s.settings.holidays = {};
  for (const [k, v] of Object.entries(s.settings.holidays)) if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || typeof v !== 'string') delete s.settings.holidays[k];
  const byId = (list, idKey = 'id') => (Array.isArray(list) ? list : []).filter(x => isObj(x) && str(x[idKey])).map(x => ({ ...x, [idKey]: str(x[idKey]) }));
  s.groups = byId(s.groups).map(g => ({ ...g, name: str(g.name, g.id), kind: g.kind === 'senior' || g.kind === 'junior' ? g.kind : (g.kind ? 'other' : g.kind) }));
  if (!s.groups.length) s.groups = clone(DEFAULT_GROUPS);
  s.tags = Array.isArray(s.tags) ? byId(s.tags).map(t => ({ ...t, name: str(t.name, t.id), help: str(t.help) })) : clone(DEFAULT_TAGS);
  s.duties = byId(s.duties, 'code');
  if (!s.duties.length) s.duties = clone(DEFAULT_DUTIES);
  s.duties = s.duties.map(cleanDuty);
  if (!s.duties.some(d => d.code === 'x')) s.duties.push(clone(DEFAULT_DUTIES.find(d => d.code === 'x')));
  s.staff = byId(s.staff).map(p => ({
    short: '', group: 'mo', tags: [], fte: 1, start: '', end: '', note: '', active: true, ...p,
    name: str(p.name, p.id), short: str(p.short), group: str(p.group, 'mo'), note: str(p.note),
    start: str(p.start), end: str(p.end), tags: strList(p.tags),
  }));
  if (!Array.isArray(s.rules)) s.rules = clone(DEFAULT_RULES);
  s.rules = s.rules.filter(r => isObj(r) && typeof r.type === 'string').map(cleanRule);
  if (!Array.isArray(s.rulesLog)) s.rulesLog = [];
  s.rulesLog = s.rulesLog.filter(isObj);
  if (s.rulesLog.length > 200) s.rulesLog = s.rulesLog.slice(-200);
  if (!isObj(s.months)) s.months = {};
  if (!isObj(s.cells)) s.cells = {};
  // cells: { date: { staffId: { a: [], r: [], auto: [], note, lock } } }; drop anything else
  for (const [d, day] of Object.entries(s.cells)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !isObj(day)) { delete s.cells[d]; continue; }
    for (const [id, c] of Object.entries(day)) {
      if (!isObj(c)) { delete day[id]; continue; }
      for (const k of ['a', 'r', 'auto']) if (c[k] !== undefined) c[k] = strList(c[k]);
      if (c.note !== undefined && typeof c.note !== 'string') c.note = str(c.note);
    }
  }
  return s;
}

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

// ---------- dates (local, never UTC) ----------

const pad = n => String(n).padStart(2, '0');
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function parseISO(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(s, n) {
  const [y, m, d] = String(s).split('-').map(Number);
  return iso(new Date(y, m - 1, d + n));
}
export function monthDays(m) {
  const [y, mo] = String(m).split('-').map(Number);
  const last = new Date(y, mo, 0).getDate();
  const out = [];
  for (let d = 1; d <= last; d++) out.push(`${y}-${pad(mo)}-${pad(d)}`);
  return out;
}
export function monthOf(s) { return String(s).slice(0, 7); }
export function addMonths(m, n) {
  const [y, mo] = String(m).split('-').map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
// Weekdays are asked for thousands of times per screen (grid, checks, demo): remember them per date string.
const WEEKDAY = new Map();
export function weekday(s) {
  let w = WEEKDAY.get(s);
  if (w === undefined) {
    w = parseISO(s).getDay();
    if (WEEKDAY.size > 5000) WEEKDAY.clear();
    WEEKDAY.set(s, w);
  }
  return w;
}
export function isWeekend(s) { const w = weekday(s); return w === 0 || w === 6; }
export function isHoliday(state, s) { return !!(state && state.settings && state.settings.holidays && state.settings.holidays[s]); }
export function holidayName(state, s) { return (state && state.settings && state.settings.holidays && state.settings.holidays[s]) || ''; }
export function fmtDay(s) { const d = parseISO(s); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; }
export function fmtMonth(m) { const [y, mo] = String(m).split('-').map(Number); return `${MONTH[mo - 1]} ${y}`; }

// ---------- lookups ----------

export function dutyMap(state) { return new Map((state.duties || []).map(d => [d.code, d])); }
// The same map, built once per duties list (read-only use: effectiveCodes and matchesCodes run per cell). It is
// rebuilt when the list changes, even in place (a duty added, replaced or recoded inside a commit).
const DUTY_MAPS = new WeakMap();
function dutyMapCached(state) {
  const list = state.duties;
  if (!Array.isArray(list)) return dutyMap(state);
  const hit = DUTY_MAPS.get(list);
  if (hit && hit.items.length === list.length && hit.items.every((d, k) => d === list[k] && hit.codes[k] === (d && d.code))) return hit.m;
  const m = dutyMap(state);
  DUTY_MAPS.set(list, { m, items: list.slice(), codes: list.map(d => d && d.code) });
  return m;
}
export function groupMap(state) { return new Map((state.groups || []).map(g => [g.id, g])); }
export function staffMap(state) { return new Map((state.staff || []).map(p => [p.id, p])); }

export function staffActiveOn(person, s) {
  return !!person && person.active !== false && (!person.start || s >= person.start) && (!person.end || s <= person.end);
}

// Everyone in post at some point in the month, in sheet order (group order, then the order in state.staff).
export function staffInMonth(state, m) {
  const days = monthDays(m), first = days[0], last = days[days.length - 1];
  const order = new Map((state.groups || []).map((g, i) => [g.id, i]));
  return (state.staff || [])
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.active !== false && (!p.start || p.start <= last) && (!p.end || p.end >= first))
    .sort((a, b) => ((order.get(a.p.group) ?? 999) - (order.get(b.p.group) ?? 999)) || a.i - b.i)
    .map(({ p }) => p);
}

// ---------- cells ----------

const EMPTY = Object.freeze([]);
const uniq = a => [...new Set((Array.isArray(a) ? a : []).filter(c => typeof c === 'string' && c))];

export function getCell(state, s, staffId) {
  const day = state.cells && state.cells[s];
  return (day && day[staffId]) || null;
}

// Merge a patch into a cell: dedupe codes, keep auto ⊆ a, delete the cell (and the day) when nothing is left.
// Always writes a new cell object (never mutates the old one), so shallow copies of state stay safe.
export function setCell(draft, s, staffId, patch) {
  if (!draft.cells) draft.cells = {};
  const day = draft.cells[s] || (draft.cells[s] = {});
  const cur = day[staffId] || {};
  const next = { ...cur, ...patch };
  const a = uniq(next.a);
  const cell = { a, r: uniq(next.r), auto: uniq(next.auto).filter(c => a.includes(c)), note: String(next.note || ''), lock: !!next.lock };
  if (!cell.a.length && !cell.r.length && !cell.note && !cell.lock) delete day[staffId];
  else day[staffId] = cell;
  if (!Object.keys(day).length) delete draft.cells[s];
  return day[staffId] || null;
}

// Assigned codes plus 'x' when the day before had an overnight shift.
export function effectiveCodes(state, s, staffId) {
  const cell = getCell(state, s, staffId);
  const out = cell && Array.isArray(cell.a) ? [...cell.a] : [];
  const prev = getCell(state, addDays(s, -1), staffId);
  if (prev && Array.isArray(prev.a) && prev.a.length) {
    const dm = dutyMapCached(state);
    if (prev.a.some(c => dm.get(c) && dm.get(c).overnight) && !out.includes('x')) out.push('x');
  }
  return out;
}

export const TOKENS = ['@shift', '@leave', '@other', '@request', '@away', '@present', '@any'];

// Tokens to concrete codes. '@present' is a property of the day, not a code: matchesCodes handles it.
export function expandTokens(state, codes) {
  const out = new Set();
  const all = state.duties || [];
  const ofKind = k => all.filter(d => d.kind === k).forEach(d => out.add(d.code));
  for (const c of codes || []) {
    if (c === '@shift') ofKind('shift');
    else if (c === '@leave') ofKind('leave');
    else if (c === '@other') ofKind('other');
    else if (c === '@request') ofKind('request');
    else if (c === '@away') { ofKind('leave'); ofKind('other'); out.add('x'); }
    else if (c === '@any') { all.forEach(d => out.add(d.code)); out.add('x'); }
    else if (c !== '@present') out.add(c);
  }
  return out;
}

// Does this person's day match any of the codes (requests in r count too)? Handles every token.
export function matchesCodes(state, s, staffId, codes, eff) {
  codes = codes || EMPTY;
  const cell = getCell(state, s, staffId);
  const effc = eff || effectiveCodes(state, s, staffId);
  const all = cell && Array.isArray(cell.r) ? [...effc, ...cell.r] : [...effc];
  if (codes.includes('@any') && all.length) return true;
  const set = expandTokens(state, codes);
  if (all.some(c => set.has(c))) return true;
  if (codes.includes('@present')) {
    const dm = dutyMapCached(state);
    const kindOf = c => (c === 'x' ? 'derived' : (dm.get(c) && dm.get(c).kind));
    if (effc.some(c => kindOf(c) === 'shift')) return true;
    const person = (state.staff || []).find(p => p.id === staffId);
    if (person && !staffActiveOn(person, s)) return false;
    const away = effc.some(c => c === 'x' || kindOf(c) === 'leave' || kindOf(c) === 'other');
    return !isWeekend(s) && !isHoliday(state, s) && !away;
  }
  return false;
}
