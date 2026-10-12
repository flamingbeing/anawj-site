// The study workbook, laid out like the eCRF template: "Data Collection" (row 1 sections, row 2 headers, one
// patient per row from row 3) and "Screening Number". No DOM (tested in node).

import { HEADERS, SECTIONS, SCREENING_HEADERS } from './headers.js';
import { FIELDS, SCREENING, SERIES, EXTRA, IX_COLS, PAGES, colIndex, shownValue } from './schema.js';
import { val, isGone } from './store.js';
import { buildXlsx, dateSerial, timeSerial } from './xlsx.js';

export function cellFor(f, v) {
  if (v == null || v === '') return null;
  if (f.type === 'date') { const d = dateSerial(v); return d == null ? String(v) : { v: d, fmt: 'date' }; }
  if (f.type === 'time') { const t = timeSerial(v); return t == null ? String(v) : { v: t, fmt: 'time' }; }
  if (f.type === 'code' || f.type === 'num' || f.type === 'int') {
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    return String(v).trim() !== '' && Number.isFinite(n) ? n : String(v);
  }
  return String(v);
}

const sortKey = r => String(val(r, 'enrol_id') || val(r, 'screen_id') || '~' + r.created);
const bySortKey = (a, b) => sortKey(a).localeCompare(sortKey(b), undefined, { numeric: true });

// what goes in a template cell: hidden follow-ups left out; active warming start is NA for the no-pre-warming group
// (the template asks for NA; there's no time box for it in that group)
function exportValue(p, f) {
  const v = shownValue(f.id, k => val(p, k));
  if ((v == null || v === '') && f.id === 'pw_start' && String(val(p, 'arm')) === '3') return 'NA';
  return v;
}

export function workbookSheets(patients, screening) {
  const live = patients.filter(p => !isGone(p)).sort(bySortKey);
  const row1 = new Array(HEADERS.length).fill(null);
  for (const [title, a] of SECTIONS) row1[colIndex(a)] = { s: title, style: 'section' };
  const data = {
    name: 'Data Collection',
    rows: [row1, HEADERS.map(h => ({ s: h, style: 'head' })), ...live.map(p => FIELDS.map(f => f.id === 'io_ix' ? (ixText(val(p, 'io_ix_rows')) || cellFor(f, val(p, f.id))) : cellFor(f, exportValue(p, f))))],
    merges: SECTIONS.map(([, a, b]) => `${a}1:${b}1`),
    widths: HEADERS.map(() => 14),
    freeze: 2,
  };
  const scr = {
    name: 'Screening Number',
    rows: [SCREENING_HEADERS.map(h => ({ s: h, style: 'head' })),
      ...screening.filter(r => !r.deleted).sort((a, b) => String(val(a, 'id') || '').localeCompare(String(val(b, 'id') || ''), undefined, { numeric: true }))
        .map(r => SCREENING.map(f => cellFor(f, val(r, f.id))))],
    widths: SCREENING_HEADERS.map(() => 16),
    freeze: 1,
  };
  const sid = p => val(p, 'enrol_id') || val(p, 'screen_id') || '';
  const readings = [['Subject ID', 'Series', 'Timepoint', 'Time saved', 'Entered by', 'Values']];
  for (const p of live) for (const [s, def] of Object.entries(SERIES)) for (const pt of def.points) {
    const at = p.f['at_' + s + '_' + pt.key];
    const vals = def.cols.map(c => [c.label, val(p, `${s}_${pt.key}_${c.key}`)]).filter(([, v]) => v != null);
    if (!at?.v && !vals.length) continue;
    readings.push([sid(p), s === 'prewarm' ? 'Pre-warming' : s === 'iotemp' ? 'Intra-op temperature' : 'Haemodynamics', pt.label,
      at?.v ? cellFor({ type: 'time' }, at.v) : null, at?.by || '', vals.map(([l, v]) => `${l} ${v}`).join('; ')]);
  }
  const signs = PAGES.filter(pg => pg.signoff).map(pg => pg.id);
  const extra = [['Subject ID', ...EXTRA.map(f => f.label), ...signs.map(s => 'Complete: ' + PAGES.find(p => p.id === s).title)]];
  for (const p of live) extra.push([sid(p), ...EXTRA.map(f => f.type === 'rows' ? ixText(val(p, f.id)) || null : cellFor(f, shownValue(f.id, k => val(p, k)))),
    ...signs.map(s => val(p, 'sign_' + s))]);
  const head = r => r.map(h => ({ s: h, style: 'head' }));
  return [data, scr,
    { name: 'Readings', rows: [head(readings[0]), ...readings.slice(1)], widths: [12, 18, 14, 10, 10, 80], freeze: 1 },
    { name: 'Extra', rows: [head(extra[0]), ...extra.slice(1)], widths: extra[0].map(() => 16), freeze: 1 }];
}

// Intra-op investigation rows as one line each: "10:30 Hb 9.8, ROTEM, CT 60 …"
export function ixText(rows) {
  let list;
  try { list = typeof rows === 'string' ? JSON.parse(rows) : rows; } catch { return ''; }
  if (!Array.isArray(list)) return '';
  return list.map(r => IX_COLS.filter(([k]) => r[k] != null && r[k] !== '').map(([k, l]) => k === 'time' || k === 'test' ? r[k] : `${l} ${r[k]}`).join(', ')).filter(Boolean).join(' | ');
}

export const workbook = (patients, screening) => buildXlsx(workbookSheets(patients, screening));
