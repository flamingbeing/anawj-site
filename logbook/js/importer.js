// Importer for the old APMES Google Form workbook (tabs "Case" and "AY20xx Totals").
// Pure functions on plain row arrays (no DOM, no ExcelJS), so it can be tested in Node.
// In the browser, app.js reads the workbook with ExcelJS and passes each sheet as rows of cell values
// (date cells arrive as JS Date objects; a Python/openpyxl dump gives ISO strings; both are accepted).
//
// How the old Apps Script counted (and so what countCheck must reproduce):
//  - Database tab = one row per category per case, from columns D..G (Category + the 3 sub-category
//    questions), each split on ',' and trimmed. Rows by resident 'WRONG ENTRY' were dropped.
//  - "AYxxxx Totals" = count of Database rows per resident per category label, listing only labels in
//    the master CATEGORIES list (which has the retired 15ii and 20iv but not 26iv).
// So parents are NOT added here: a "20iii" pick without "20" counted only towards 20iii in the old sheet.

import { codeOf } from './categories.js';
import { parseDate, todayISO } from './engine.js';

// ---------- residents (Apps Script) ----------

// Parses the RESIDENTS array from the old Apps Script, e.g.
//   const RESIDENTS = [
//     {id: "202301", name: "Alex Tan", email: "Alex@example.com", status: "ACTIVE"},
//   ];
// Accepts double or single quotes, quoted or bare keys, numeric ids and trailing commas.
// Lines outside the array (or commented out with //) are ignored. Rows without an id are skipped.
export function parseResidentsScript(text) {
  let src = String(text || '');
  const start = src.search(/RESIDENTS\s*=\s*\[/);
  if (start >= 0) {
    src = src.slice(src.indexOf('[', start) + 1);
    const end = src.search(/\]\s*;?/);
    if (end >= 0) src = src.slice(0, end);
  }
  src = src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const out = [], seen = new Set();
  for (const m of src.matchAll(/\{([^{}]*)\}/g)) {
    const o = {};
    for (const f of m[1].matchAll(/["']?(\w+)["']?\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([\w.+-]+))/g)) {
      o[f[1].toLowerCase()] = (f[2] ?? f[3] ?? f[4] ?? '').replace(/\\(.)/g, '$1').trim();
    }
    const id = String(o.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: o.name || '',
      email: (o.email || '').toLowerCase(),
      status: (o.status || 'ACTIVE').toUpperCase(),
    });
  }
  return out;
}

// ---------- helpers ----------

const norm = s => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// 'Alex Tan (202301)' -> '202301'
export function ridOf(label) {
  const m = String(label ?? '').match(/\((\d{4,})\)\s*$/);
  return m ? m[1] : null;
}

// Cell text as the user typed it (Dates -> ISO date, numbers -> string, rich text -> plain).
function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return cellText(v.result);
    if ('$date' in v) return String(v.$date);
  }
  return String(v);
}

// Unwrap formula results / dumped dates to a plain value for date parsing.
function cellValue(v) {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('$date' in v) return v.$date;
    if ('result' in v) return cellValue(v.result);
    if (Array.isArray(v.richText) || 'text' in v) return cellText(v);
  }
  return v;
}

// Timestamp cell -> ms. Zoneless ISO strings are read as UTC, the same way ExcelJS turns a sheet
// date-time into a Date, so the browser and a Python dump give the same number (keeps importKey stable).
function timestampMs(v) {
  v = cellValue(v);
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v.getTime();
  if (typeof v === 'number') return isFinite(v) && v > 20000 ? Math.round((v - 25569) * 86400000) : null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/.test(s)) {
    const t = Date.parse(s.replace(' ', 'T') + (s.length > 10 ? 'Z' : 'T00:00:00Z'));
    return isNaN(t) ? null : t;
  }
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}

// Category cell -> labels. Splits on commas only when the next part starts with a code like "20iii)",
// so a label that ever contained a comma would survive (the old Database split naively on ','; no
// current label has a comma, so counts are identical).
export function splitLabels(cell) {
  const s = cellText(cell).trim();
  if (!s) return [];
  return s.split(/\s*,\s*(?=\d{2}[ivx]*\))/i).map(x => x.trim()).filter(Boolean);
}

// 53-bit string hash (cyrb53), base36. Stable across browsers and Node.
function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Find a column by header: exact (normalised) match first, then "starts with".
function findCol(header, ...names) {
  const hs = header.map(norm);
  for (const n of names) { const i = hs.indexOf(n); if (i >= 0) return i; }
  for (const n of names) { const i = hs.findIndex(x => x.startsWith(n)); if (i >= 0) return i; }
  return -1;
}

// ---------- Case tab ----------

// rows: the "Case" tab as row arrays, header row included (it is found within the first 10 rows).
// Returns { cases, skipped:[{row, reason}], warnings:[{row, message}] }. row numbers are 1-based sheet rows.
export function parseCaseSheet(rows) {
  const warnings = [], skipped = [], cases = [];
  rows = Array.isArray(rows) ? rows : [];
  const h = rows.findIndex((r, i) => i < 10 && Array.isArray(r) && r.some(c => norm(cellText(c)) === 'resident'));
  if (h < 0) return { cases, skipped, warnings: [{ row: 0, message: 'No "Resident" header found in the Case sheet.' }] };
  const header = rows[h].map(cellText);
  const col = {
    resident: findCol(header, 'resident'),
    date: findCol(header, 'date'),
    details: findCol(header, 'initials, case details', 'initials', 'case details'),
    category: findCol(header, 'category'),
    neuro: findCol(header, 'neurosurgical procedure'),
    paeds: findCol(header, 'paediatric surgery'),
    blocks: findCol(header, 'peripheral nerve blocks'),
    timestamp: findCol(header, 'timestamp'),
  };
  for (const k of ['resident', 'date', 'details', 'category']) {
    if (col[k] < 0) warnings.push({ row: h + 1, message: `Column "${k}" not found.` });
  }
  if (col.resident < 0) return { cases, skipped, warnings };
  // Old sheets kept the sub-category questions in D..G right after Category; fall back to that layout.
  const catCols = [col.category, col.neuro, col.paeds, col.blocks].filter(i => i >= 0);
  const get = (r, i) => (i >= 0 ? r[i] : null);

  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] || [], rowNo = i + 1;
    const residentLabel = cellText(get(r, col.resident)).trim();
    if (!residentLabel) {
      if (r.some(c => cellText(c).trim())) skipped.push({ row: rowNo, reason: 'No resident' });
      continue;
    }
    if (norm(residentLabel) === 'wrong entry') { skipped.push({ row: rowNo, reason: 'WRONG ENTRY' }); continue; }
    const rid = ridOf(residentLabel);
    if (!rid) warnings.push({ row: rowNo, message: `No resident id in "${residentLabel}"` });

    const rawDate = cellValue(get(r, col.date));
    const date = parseDate(rawDate);
    const dateText = date ? '' : cellText(get(r, col.date)).trim();
    const details = cellText(get(r, col.details)).trim();
    const cats = [];
    for (const ci of catCols) {
      for (const label of splitLabels(r[ci])) {
        const code = codeOf(label);
        if (!code) { warnings.push({ row: rowNo, message: `Unknown category "${label}"` }); continue; }
        if (cats.includes(code)) warnings.push({ row: rowNo, message: `Category ${code} listed twice (counted once)` });
        else cats.push(code);
      }
    }
    if (!cats.length) warnings.push({ row: rowNo, message: 'No categories' });
    cases.push({ rid, residentLabel, date, dateText, details, cats, timestamp: timestampMs(get(r, col.timestamp)), row: rowNo });
  }

  // importKey = hash of the row's content + '#' + occurrence index among identical rows.
  // The sheet is sorted newest first, so occurrences are numbered from the bottom (oldest): rows added
  // on top later never shift the keys of rows already imported. Timestamps are keyed to the second so
  // ms rounding differences between readers do not matter.
  const seen = new Map();
  for (let k = cases.length - 1; k >= 0; k--) {
    const c = cases[k];
    const ts = c.timestamp == null ? '' : Math.round(c.timestamp / 1000);
    const base = hash([c.rid || c.residentLabel, ts, c.date || c.dateText, c.details, [...c.cats].sort().join(',')].join('␟'));
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    c.importKey = base + '#' + n;
  }
  return { cases, skipped, warnings };
}

// ---------- AY totals tab ----------

// rows: an "AY2024 Totals" tab. Header ['Category', 'Name (id)', ...]; stops at 'Grand Total'.
// -> { [rid]: { [code]: n } } (blank cells = 0; a column header without "(id)" is keyed by its text).
export function parseTotalsSheet(rows) {
  rows = Array.isArray(rows) ? rows : [];
  const h = rows.findIndex(r => Array.isArray(r) && norm(cellText(r[0])) === 'category');
  const out = {};
  if (h < 0) return out;
  const keys = rows[h].map((c, j) => {
    if (j === 0) return null;
    const t = cellText(c).trim();
    return t ? (ridOf(t) || t) : null;
  });
  keys.forEach(k => { if (k) out[k] = {}; });
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const label = cellText(r[0]).trim();
    if (/^grand total/i.test(label)) break;
    const code = codeOf(label);
    if (!code) continue;
    keys.forEach((k, j) => {
      if (!k) return;
      const n = Number(cellValue(r[j]));
      out[k][code] = (out[k][code] || 0) + (isFinite(n) ? n : 0);
    });
  }
  return out;
}

// ---------- checks ----------

// Compare imported cases with an old totals table. Only rids and codes present in the totals are checked.
export function countCheck(cases, totalsByRid) {
  const got = {};
  for (const c of cases || []) {
    if (!c.rid) continue;
    const g = got[c.rid] || (got[c.rid] = {});
    for (const code of new Set(c.cats || [])) g[code] = (g[code] || 0) + 1;
  }
  const diffs = [];
  for (const [rid, totals] of Object.entries(totalsByRid || {})) {
    for (const [code, expected] of Object.entries(totals)) {
      const n = got[rid]?.[code] || 0;
      if (n !== expected) diffs.push({ rid, code, expected, got: n });
    }
  }
  return { ok: diffs.length === 0, diffs };
}

// Flags shown in the logbook: 'needsDate' (missing/invalid date), 'future' (dated after today).
export function flagCase(c, today = todayISO()) {
  const flags = [];
  const d = c && c.date;
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d) || parseDate(d) !== d) flags.push('needsDate');
  else if (d > today) flags.push('future');
  return flags;
}
