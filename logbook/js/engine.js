// APMES logbook engine: dates, category counts, progress against targets, bulk paste and
// spreadsheet round trips. Pure functions only (no DOM), so it can be tested in Node.

import { CATEGORIES, BY_CODE, R_YEARS, codeOf } from './categories.js';
import { KEYWORDS, STOP } from './keywords.js';
const STOP_WORDS = new Set(STOP);

// ---------- ids and dates ----------

const ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
export const uid = () => {
  const n = 16, out = [];
  const bytes = new Uint8Array(n);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  for (const b of bytes) out.push(ID_CHARS[b % 36]);
  return out.join('');
};

const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export function todayISO(d = new Date()) {
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// 'Mar' / 'march' / 'Sept' -> 3 / 3 / 9; anything else (e.g. 'junior') -> 0
const monthOf = s => {
  const w = String(s).toLowerCase().replace(/\.$/, '');
  if (w.length < 3) return 0;
  const i = FULL_MONTHS.findIndex(f => f.startsWith(w) || (w === 'sept' && f === 'september'));
  return i + 1;
};

// A real calendar date? (31/6 and 29/2 in a non-leap year are not)
function validYMD(y, m, d) {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1)) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
const fullYear = y => (String(y).length <= 2 ? 2000 + Number(y) : Number(y));

// Day-first. Accepts a Date, 'YYYY-MM-DD' (optionally with a time), 'd/m/yy', 'd/m/yyyy' (also with - or .),
// 'd Mon yyyy' / 'd-Mon-yy' / 'd Month yyyy', or an Excel serial number. Returns 'YYYY-MM-DD' or null.
// Dates are read in local time, except a Date at exactly UTC midnight (how ExcelJS hands back date cells),
// which is read in UTC so a spreadsheet date never shifts by a day.
export function parseDate(input) {
  if (input == null || input === '') return null;
  if (input instanceof Date) {
    if (isNaN(input)) return null;
    const utcMidnight = input.getUTCHours() === 0 && input.getUTCMinutes() === 0 && input.getUTCSeconds() === 0 && input.getUTCMilliseconds() === 0;
    const [y, m, d] = utcMidnight
      ? [input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate()]
      : [input.getFullYear(), input.getMonth() + 1, input.getDate()];
    return validYMD(y, m, d) ? iso(y, m, d) : null;
  }
  if (typeof input === 'number') return fromSerial(input);
  const s = String(input).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/))) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return validYMD(y, mo, d) ? iso(y, mo, d) : null;
  }
  if ((m = s.match(/^(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2}|\d{4})$/))) {
    const [d, mo, y] = [+m[1], +m[2], fullYear(m[3])];
    return validYMD(y, mo, d) ? iso(y, mo, d) : null;
  }
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-\/.]*([a-z]{3,9})\.?,?[\s\-\/.]*(\d{2}|\d{4})$/i))) {
    const mo = monthOf(m[2]);
    if (!mo) return null;
    const [d, y] = [+m[1], fullYear(m[3])];
    return validYMD(y, mo, d) ? iso(y, mo, d) : null;
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) return fromSerial(Number(s));
  return null;
}

// Excel serial day number (1900 system): 25569 = 1970-01-01. Only plausible logbook years are accepted.
function fromSerial(n) {
  if (!isFinite(n) || n < 20000 || n > 80000) return null;
  const d = new Date(Math.round((Math.floor(n) - 25569) * 86400000));
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

// '2026-01-07' -> '7 Jan 2026'
export function fmtDate(iso_) {
  const m = String(iso_ || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso_ ? String(iso_) : '';
  return `${+m[3]} ${MONTH_NAMES[+m[2] - 1]} ${m[1]}`;
}

// ---------- categories and counts ----------

// ['17', '26i'] -> ['17', '26', '26i']: a parent goes just before its first sub-category.
export function withParents(codes) {
  const out = [];
  for (const c of codes || []) {
    const p = BY_CODE[c] && BY_CODE[c].parent;
    if (p && !out.includes(p)) out.push(p);
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

// { code: n }. Each code counts once per case. Parents are NOT added (counts match the old form totals).
export function countCases(cases) {
  const counts = {};
  for (const c of cases || []) for (const code of new Set(c.cats || [])) counts[code] = (counts[code] || 0) + 1;
  return counts;
}

// Academic year starts 1 July: intake 2026 is R1 from July 2026 to June 2027.
export const academicYear = (now = new Date()) => (now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1);
// The residency year in academic year `ay`. `smo` years spent as an SMO after R3 count as R3 (so cases
// done then land in the R3 column), and the years after them move back by as many.
export function yearInAY(ay, intakeYear, smo = 0) {
  const raw = Number(ay) - Number(intakeYear) + 1;
  const s = Math.max(0, Math.floor(Number(smo) || 0));
  const y = raw <= 3 ? raw : raw <= 3 + s ? 3 : raw - s;
  return Math.min(5, Math.max(1, y));
}
export function rYearDefault(intakeYear, now = new Date(), smo = 0) {
  const intake = Number(intakeYear);
  if (!intake) return 1;
  return yearInAY(academicYear(now), intake, smo);
}

const yearNum = by => Number(String(by).replace(/\D/g, ''));

// Targets are cumulative: "R3: 10" means 10 cases logged by the end of R3, whenever they were done.
// A milestone is 'past' once the resident is beyond that year, 'now' during it and 'later' before it.
export function progress(counts, rYear) {
  counts = counts || {};
  const yr = Number(rYear) || 1;
  return CATEGORIES.filter(c => !c.retired).map(c => {
    const count = counts[c.code] || 0;
    const t = c.targets || {};
    const milestones = R_YEARS.filter(by => t[by] != null).map(by => {
      const N = yearNum(by);
      return { by, n: t[by], met: count >= t[by], due: yr > N ? 'past' : yr === N ? 'now' : 'later' };
    });
    if (!milestones.length) return { code: c.code, name: c.name, count, milestones, next: null, status: 'none' };
    const unmet = milestones.filter(m => !m.met);
    const next = unmet.length ? { by: unmet[0].by, n: unmet[0].n } : null;
    const status = !unmet.length ? 'done'
      : unmet.some(m => m.due === 'past') ? 'late'
      : unmet.some(m => m.due === 'now') ? 'due' : 'ontrack';
    return { code: c.code, name: c.name, count, milestones, next, status };
  });
}

export const STATUS_RANK = { none: 0, done: 1, ontrack: 2, due: 3, late: 4 };
const worst = items => items.reduce((w, it) => (STATUS_RANK[it.status] > STATUS_RANK[w] ? it.status : w), 'none');
const epaKey = e => { const m = String(e).match(/^(\d+)(.*)$/); return m ? +m[1] * 100 + (m[2] ? m[2].charCodeAt(0) : 0) : 1e9; };

// Categories grouped by EPA (only those with an EPA tag), EPAs in order (2, 3, 4, 7a, 7b, ...).
export function epaProgress(counts, rYear) {
  const groups = new Map();
  for (const item of progress(counts, rYear)) {
    const epa = BY_CODE[item.code].epa;
    if (epa == null) continue;
    if (!groups.has(epa)) groups.set(epa, []);
    groups.get(epa).push(item);
  }
  return [...groups.entries()].sort((a, b) => epaKey(a[0]) - epaKey(b[0]))
    .map(([epa, items]) => ({ epa, items, status: worst(items) }));
}

// Codes in category-list order (unknown codes last, alphabetically).
const ORDER = Object.fromEntries(CATEGORIES.map((c, i) => [c.code, i]));
export const sortCodes = codes => [...new Set(codes)].sort((a, b) => (ORDER[a] ?? 1e6) - (ORDER[b] ?? 1e6) || (a < b ? -1 : a > b ? 1 : 0));

// The user's most common exact category sets, for one-tap templates. Sets of 2+ codes and single
// codes both need at least `min` cases; most frequent first, bigger sets first on a tie.
export function frequentCombos(cases, { min = 3, limit = 6 } = {}) {
  const tally = new Map();
  for (const c of cases || []) {
    const cats = sortCodes(c.cats || []);
    if (!cats.length) continue;
    const key = cats.join(',');
    const t = tally.get(key) || { cats, count: 0 };
    t.count++;
    tally.set(key, t);
  }
  return [...tally.values()].filter(t => t.count >= min)
    .sort((a, b) => b.count - a.count || b.cats.length - a.cats.length || (a.cats.join() < b.cats.join() ? -1 : 1))
    .slice(0, limit);
}

// ---------- patient initials ----------

// Leading capitals that are case words, not a patient ("GA for lap chole", "LSCS spinal"):
// anything the keyword table knows (as in suggest.js tokens()), plus a few common abbreviations.
const NOT_INITIALS = new Set(['GA', 'LA', 'RA', 'MAC', 'ETT', 'LMA', 'ASA', 'OT', 'ICU', 'HDU', 'ED', 'CSE', 'SAB', 'GETA', 'TIVA', 'IV', 'ECT', 'MRI', 'CT', 'IR', 'EUA', 'ENT', 'OGD', 'ERCP',
  'DM', 'THR', 'TURP', 'TURBT', 'AVR', 'MVR', 'EVAR', 'TEVAR', 'PCNL', 'URS', 'ESWL', 'EGD', 'DHS', 'AAA', 'TOF', 'BMI', 'HTN', 'IHD', 'COPD',
  'LRTI', 'URTI', 'DKA', 'AKI', 'CVA', 'TIA', 'DVT', 'PPH', 'APH', 'ARDS', 'TBI', 'MVA', 'RTA', 'RIJ', 'LIJ', 'CVC', 'CVP', 'PICC', 'NGT', 'TCI',
  'CICU', 'NICU', 'PICU', 'PACU', 'NBM', 'DNR', 'GERD', 'GORD', 'PONV', 'AKA', 'BKA', 'TORS', 'EBUS', 'ESD', 'EMR', 'LAVH', 'TAH', 'BSO', 'TLH',
  'RFA', 'TACE', 'IVC', 'SVC', 'SVD', 'NVD', 'HIE', 'NEC', 'TEF', 'CDH', 'CXR', 'ECG', 'ECHO', 'TTE', 'TOE', 'CPB', 'IABP', 'ECMO', 'RRT', 'CRRT',
  'MPFL', 'ROM', 'LP', 'PEG', 'ICD', 'MRCP', 'HFNO', 'EBL', 'UGIB', 'BTL', 'LAR', 'EVLT', 'SSG', 'STSG', 'OSA', 'CKD', 'ESRF', 'ESRD', 'SAH', 'SDH', 'EDH', 'RSI', 'PET', 'ART', 'LSCS', 'ORIF', 'CABG', 'VATS']);

// Patient initials as stored: upper case, letters, '-' and '.' only, at most 20 characters.
export const cleanInitials = s => String(s || '').toUpperCase().replace(/[^A-Z.\-]/g, '').slice(0, 20);

// "AB 34F LSCS spinal" / "AB/34F ..." -> { initials: 'AB', details: '34F LSCS spinal' }. Leading 2–4 capitals,
// unless they are a known case word ("LSCS spinal", "TKR"). No initials -> { initials: '', details }.
// Line breaks inside the rest are kept.
export function splitInitials(text, keywords = KEYWORDS) {
  const s = String(text || '').trim();
  // the first run of 2-4 letters, in any case ("ab 45f lap chole" -> AB); stored in capitals
  const m = s.match(/^([A-Za-z]{2,4})(?![A-Za-z0-9])[\s\/,:;.\-]*/);
  if (!m) return { initials: '', details: s };
  const word = m[1], up = word.toUpperCase(), lower = word !== up;
  // a case word ("IJ", "TKR", "lap") is still initials when an age follows: "IJ 60M VATS", "lap 45f …"
  const ageNext = /^\d{1,3}\s?(?:[MF]|yo|y\/o|yrs?|years?|\/12|\/52|m\/o|mo|d\/o)(?![A-Za-z])/i.test(s.slice(m[0].length));
  const caseWord = NOT_INITIALS.has(up) || (keywords && keywords[word.toLowerCase()]) || (lower && STOP_WORDS.has(word.toLowerCase()));
  if (caseWord && !ageNext) return { initials: '', details: s };
  // lower case: a 4-letter word ("circ", "knee") needs an age after it to count as initials
  if (lower && up.length === 4 && !ageNext) return { initials: '', details: s };
  return { initials: up, details: s.slice(m[0].length).trim() };
}

// A case's initials and details for display and editing: the initials field when the case has one,
// else split off the details (cases logged before initials had their own field).
export const caseParts = c => (c && c.initials != null
  ? { initials: String(c.initials || ''), details: String(c.details || '') }
  : splitInitials(c && c.details));

// Search words that mean dates: "today", "yesterday", "this week", "last week", "this month",
// "last month", "last 7 days", "tuesday", "last tue". -> { from, to, rest } (ISO dates, inclusive;
// rest is the query without the date words), or null when the query names no date.
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export function dateWindow(q, now = new Date()) {
  let s = ' ' + String(q || '').toLowerCase().replace(/\s+/g, ' ') + ' ';
  const day = (n = 0) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n); return todayISO(d); };
  const monday = (weeksBack = 0) => { const dow = (now.getDay() + 6) % 7; return day(-dow - 7 * weeksBack); };
  let win = null;
  const take = (re, f) => { if (win) return; const m = s.match(re); if (m) { win = f(m); s = s.replace(re, ' '); } };
  take(/ today /, () => ({ from: day(), to: day() }));
  take(/ yesterday /, () => ({ from: day(-1), to: day(-1) }));
  take(/ (?:last|past) (\d{1,3}) days /, m => ({ from: day(-(Number(m[1]) - 1)), to: day() }));
  take(/ this week /, () => ({ from: monday(), to: day() }));
  take(/ last week /, () => { const from = monday(1); const [y, mo, d] = from.split('-').map(Number); return { from, to: todayISO(new Date(y, mo - 1, d + 6)) }; });
  take(/ this month /, () => ({ from: todayISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: day() }));
  take(/ last month /, () => ({ from: todayISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: todayISO(new Date(now.getFullYear(), now.getMonth(), 0)) }));
  take(/ (last )?(sun|mon|tue|wed|thu|fri|sat)(?:day|s|sday|nesday|r|rs|rsday|urday)? /, m => {
    const want = WEEKDAYS.indexOf(m[2]);
    let back = (now.getDay() - want + 7) % 7;
    if (m[1] && back === 0) back = 7;   // "last tuesday" on a Tuesday is a week ago
    return { from: day(-back), to: day(-back) };
  });
  return win ? { ...win, rest: s.trim() } : null;
}

// 5 -> '5th', 22 -> '22nd'
export const nth = d => `${d}${(d % 100 >= 11 && d % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[d % 10] || 'th'}`;

// A leading age / sex ("45F", "72 M", "5yo", "3/12 M") on case details: { age, rest }. Optional.
const AGE_SEX = /^\s*(\d{1,3}\s?(?:(?:yo|y\/o|yrs?|years?|\/12|\/52|m\/o|mo|d\/o)\s?[MF]?|[MF]))(?![A-Za-z])[\s,;:\-]*/i;
export function splitAge(details) {
  const s = String(details || '');
  const m = s.match(AGE_SEX);
  return m ? { age: m[1].replace(/\s+/g, ''), rest: s.slice(m[0].length).trim() } : { age: '', rest: s.trim() };
}

// Initials + details as one line of text: the Excel "Case details" column, search, duplicates.
export const caseText = c => [c && c.initials, c && c.details].map(x => String(x || '').trim()).filter(Boolean).join(' ');

// ---------- bulk paste ----------

// A leading date on a pasted line: "12/3", "12/3/26", "12-3-2026", "2026-03-12", "12 Mar", "12 Mar 26".
const LEAD_DATE = /^\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/.\-]\d{1,2}[\/.\-](?:\d{4}|\d{2})|\d{1,2}[\/\-]\d{1,2}|\d{1,2}\s*[a-z]{3,9}\.?(?:\s+\d{4}|\s+\d{2}(?!\d))?)(?=$|[\s,:;\-–)]+)/i;
// "8/12 boy", "3/52 old": paediatric ages written like dates; leave those as details.
const AGE_AFTER = /^\s*(?:old|yo|y\/o|yr|yrs|year|years|boy|girl|male|female|man|woman|lady|gentleman|m|f|infant|baby|child|ex|prem|term|chinese|malay|indian)\b/i;

function leadingDate(line, now) {
  const m = line.match(LEAD_DATE);
  if (!m) return null;
  let token = m[1].trim();
  let rest = line.slice(m[0].length).replace(/^[\s,:;\-–)]+/, '');
  // "12 Mar 65 year old man": the 65 is an age, not 2065
  const yy = token.match(/^(\d{1,2}\s*[a-z]{3,9}\.?)\s+(\d{2})$/i);
  if (yy && (AGE_AFTER.test(rest) || 2000 + Number(yy[2]) > now.getFullYear() + 1)) { token = yy[1]; rest = yy[2] + (rest ? ' ' + rest : ''); }
  else if (AGE_AFTER.test(rest)) return null;
  let date = parseDate(token);
  if (!date) {
    // no year: this year, or last year if that date is still to come
    let dm = token.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
    let d, mo;
    if (dm) { d = +dm[1]; mo = +dm[2]; }
    else if ((dm = token.match(/^(\d{1,2})\s*([a-z]{3,9})\.?$/i)) && monthOf(dm[2])) { d = +dm[1]; mo = monthOf(dm[2]); }
    else return null;
    const today = todayISO(now);
    let y = now.getFullYear();
    // 29/2 in a non-leap year: try last year's date only if it exists
    if (!validYMD(y, mo, d) && !validYMD(y - 1, mo, d)) return null;
    if (!validYMD(y, mo, d) || iso(y, mo, d) > today) y--;
    if (!validYMD(y, mo, d)) return null;
    date = iso(y, mo, d);
  }
  return { date, rest };
}

// Cases are separated by blank lines (one or more empty or whitespace-only lines), so a case can span
// several lines (kept in its details), e.g. "AB 45F" on one line and the procedure on the next.
// List markers ("1.", "-", "•") are dropped.
// An optional date at the start of a case's first line sets its date.
// Leading patient initials are split off as in splitInitials. suggestFn(text) -> [{ code, score }];
// codes scoring 0.5+ are kept.
export function parseBulk(text, suggestFn, now = new Date()) {
  const blocks = [];
  let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\t+/g, ' ').trim().replace(/^(?:\d{1,2}[.)]|[-•*·])\s+/, '');
    if (!line) { cur = null; continue; }
    if (!cur) blocks.push(cur = []);
    cur.push(line);
  }
  return blocks.map(([first, ...more]) => {
    const ld = leadingDate(first, now);
    const whole = [(ld ? ld.rest : first).trim(), ...more].filter(Boolean).join('\n');
    const { initials, details } = splitInitials(whole);
    const sugg = typeof suggestFn === 'function' && details ? suggestFn(details) || [] : [];
    const cats = withParents(sugg.filter(s => s.score >= 0.5).map(s => s.code));
    return { date: ld ? ld.date : null, initials, details, cats };
  });
}

// ---------- duplicates ----------

const normText = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const caseKey = c => `${c.date || c.dateText || ''}|${normText(caseText(c))}|${sortCodes(c.cats || []).join(',')}`;

// Groups of ids of cases with the same date, initials + details (ignoring case and spacing) and categories.
export function duplicates(cases) {
  const groups = new Map();
  for (const c of cases || []) {
    const k = caseKey(c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c.id);
  }
  return [...groups.values()].filter(g => g.length > 1);
}

// ---------- spreadsheet round trip ----------

const NAME_INDEX = new Map();
for (const c of CATEGORIES) {
  NAME_INDEX.set(normText(c.name), c.code);
  // the label without its code and target numbers: "Lower Segment Caesarean Section"
  NAME_INDEX.set(normText(c.label.replace(/^\s*\d{2}[ivx]*\)\s*/i, '').replace(/\s*\([^)]*\)\s*$/, '')), c.code);
}

// One category cell entry -> code | null. Codes first ("16", "6", "20iii", "20iii)"), then full
// labels, then names (case-insensitive).
export function catFromText(t) {
  const s = String(t || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})([ivx]*)\)?$/i);
  if (m) { const code = pad(m[1]) + m[2].toLowerCase(); return BY_CODE[code] ? code : null; }
  const fromLabel = codeOf(s) || codeOf(s.replace(/^(\d)([ivx]*\))/i, '0$1$2'));
  if (fromLabel) return fromLabel;
  return NAME_INDEX.get(normText(s)) || NAME_INDEX.get(normText(s.replace(/\s*\([^)]*\)\s*$/, ''))) || null;
}

const cellStr = v => (v == null ? '' : v instanceof Date ? '' : String(v)).trim();

// A spreadsheet row {id?, date, initials?, details, categories: '16, 17'} -> { id, date, dateText?, initials, details, cats, unknown }.
// Categories may be separated by commas, semicolons or new lines. Without an initials column (no
// `initials` key on the row) the initials are split off the front of the details.
export function caseFromRow(row) {
  const r = row || {};
  const date = parseDate(r.date);
  const rawDate = r.date instanceof Date ? '' : cellStr(r.date);
  const cats = [], unknown = [];
  const catText = Array.isArray(r.categories) ? r.categories.join(',') : cellStr(r.categories);
  for (const part of catText.split(/[,;\n]+/)) {
    if (!part.trim()) continue;
    const code = catFromText(part);
    if (code) { if (!cats.includes(code)) cats.push(code); }
    else unknown.push(part.trim());
  }
  const parts = r.initials !== undefined ? { initials: cleanInitials(cellStr(r.initials)), details: cellStr(r.details) } : splitInitials(cellStr(r.details));
  const out = { id: cellStr(r.id) || undefined, date, initials: parts.initials, details: parts.details, cats, unknown };
  if (!date && rawDate) out.dateText = rawDate;
  return out;
}

const sameCats = (a, b) => sortCodes(a || []).join(',') === sortCodes(b || []).join(',');

// Compare the user's cases with rows read back from a spreadsheet.
// - rows with no id, a repeated id or an id we don't know are added as new cases
// - rows whose id matches a case and whose date, initials + details (as one text) or categories differ are changed
// - cases whose id is not in the sheet are deleted, but only if the sheet has an id column
//   (rows.hasIdColumn from readCasesSheet, or any row carrying an id); otherwise it's an add-only import
// - rows with unknown categories or no date and no details are errors and change nothing
// Row numbers come from row.row (as read from the sheet), else index + 2 (header in row 1).
export function diffRows(existing, rows, now = Date.now()) {
  const byId = new Map((existing || []).map(c => [c.id, c]));
  const hasId = rows && rows.hasIdColumn != null ? !!rows.hasIdColumn : (rows || []).some(r => r && cellStr(r.id));
  const seen = new Set();
  const added = [], changed = [], deleted = [], errors = [];
  (rows || []).forEach((row, i) => {
    const rowNum = (row && row.row) || i + 2;
    const hasDate = row && (row.date instanceof Date || typeof row.date === 'number' || cellStr(row.date));
    const blank = !row || (!hasDate && !cellStr(row.details) && !cellStr(row.initials) && !cellStr(row.categories));
    const c = caseFromRow(row);
    const known = c.id && byId.has(c.id) && !seen.has(c.id);
    if (c.id && byId.has(c.id)) seen.add(c.id); // an errored or blanked row still keeps its case from deletion
    if (blank) return;
    if (c.unknown.length) {
      errors.push({ row: rowNum, message: `Unknown categor${c.unknown.length > 1 ? 'ies' : 'y'}: ${c.unknown.join(', ')}` });
      return;
    }
    if (!c.date && !c.dateText && !c.details && !c.initials) { errors.push({ row: rowNum, message: 'No date or case details' }); return; }
    const fields = { date: c.date, initials: c.initials, details: c.details, cats: c.cats };
    if (!c.date && c.dateText) fields.dateText = c.dateText;
    if (known) {
      const before = byId.get(c.id);
      // initials + details as one text, or as parts (an older "AB/34F ..." case splits to the same parts as its exported text)
      const bp = caseParts(before);
      const sameText = normText(caseText(before)) === normText(caseText(c)) ||
        (normText(bp.initials) === normText(c.initials) && normText(bp.details) === normText(c.details));
      const same = (before.date || null) === c.date && sameText && sameCats(before.cats, c.cats) &&
        (c.date || (before.dateText || '') === (c.dateText || ''));
      if (!same) {
        const after = { ...before, ...fields, updatedAt: now };
        if (c.date) delete after.dateText;
        changed.push({ before, after });
      }
    } else {
      added.push({ id: uid(), ...fields, createdAt: now, updatedAt: now, source: 'sheet' });
    }
  });
  if (hasId) for (const c of existing || []) if (!seen.has(c.id)) deleted.push(c);
  return { added, changed, deleted, errors };
}
