// Excel export and round trip for the logbook, with ExcelJS (the global from vendor/exceljs.min.js
// in the browser; tests set globalThis.ExcelJS).

import { BY_CODE } from './categories.js';
import { countCases, progress, sortCodes, fmtDate, todayISO, caseText } from './engine.js';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const X = () => {
  const E = globalThis.ExcelJS;
  if (!E) throw new Error('ExcelJS is not loaded');
  return E;
};

export const STATUS_EMOJI = { late: '🔴', due: '🟡', ontrack: '🟡', done: '🟢', none: '' };
const STATUS_FILL = { late: 'FFF8D7DA', due: 'FFFFF3CD', ontrack: 'FFFFF3CD', done: 'FFD4EDDA' };

export function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v.text != null) return cellText(v.text);
    if (v.result != null) return cellText(v.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return '';
  }
  return String(v);
}

// The raw value for a date cell: Dates and numbers are kept for parseDate, everything else as text.
function rawValue(v) {
  if (v == null) return null;
  if (v instanceof Date || typeof v === 'number') return v;
  if (typeof v === 'object' && v.result != null) return rawValue(v.result);
  return cellText(v);
}

const isoToUTC = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const labelsOf = cats => sortCodes(cats || []).map(c => (BY_CODE[c] ? BY_CODE[c].label : c)).join(', ');

async function toBlob(wb) {
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: XLSX_TYPE });
}

function styleHeader(row) {
  row.font = { bold: true };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F7' } };
  row.alignment = { vertical: 'middle' };
}

// Sheet "Cases" (Date | Case details (initials + details, one column as in the old form) | Categories | id, the id column hidden so edits can be
// matched back), oldest first, and sheet "Summary" (Category | Count | R3 | R5 | Status).
// progressRows = progress(counts, rYear); computed from counts (or the cases) and opts.rYear if absent.
export async function exportCases(cases, { name = '', counts, progressRows, rYear = 1 } = {}) {
  const wb = new (X().Workbook)();
  wb.creator = 'APMES Logbook';
  wb.title = name ? `${name} logbook` : 'Logbook';
  const ws = wb.addWorksheet('Cases', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Date', key: 'date', width: 13, style: { numFmt: 'd mmm yyyy' } },
    { header: 'Case summary', key: 'details', width: 60 },
    { header: 'Tags', key: 'categories', width: 60 },
    { header: 'id', key: 'id', width: 20, hidden: true },
  ];
  styleHeader(ws.getRow(1));
  const sorted = [...(cases || [])].sort((a, b) =>
    (a.date ? 0 : 1) - (b.date ? 0 : 1) || String(a.date || '').localeCompare(String(b.date || '')) || (a.createdAt || 0) - (b.createdAt || 0));
  for (const c of sorted) {
    const row = ws.addRow({ date: c.date ? isoToUTC(c.date) : (c.dateText || ''), details: caseText(c), categories: labelsOf(c.cats), id: c.id || '' });
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(1).alignment = { vertical: 'top', horizontal: 'left' };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 3 } };

  addSummary(wb, progressRows || progress(counts || countCases(cases || []), rYear), name, `Exported ${fmtDate(todayISO())}. R3 and R5 are cumulative targets.`);
  return toBlob(wb);
}

// Sheet "Summary": Category | Count | R3 | R5 | Status, plus the hidden export time (H1)
function addSummary(wb, rows, name, note) {
  const sum = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 3 }] });
  sum.columns = [{ width: 62 }, { width: 8 }, { width: 6 }, { width: 6 }, { width: 8 }];
  sum.getCell('A1').value = `${name ? name + ' — ' : ''}case log summary`;
  sum.getCell('A1').font = { bold: true, size: 13 };
  sum.getCell('A2').value = note;
  // when this file was made, in a hidden cell: on upload, cases logged after it are never deleted
  sum.getCell('H1').value = `${EXPORTED_TAG}${Date.now()}`;
  sum.getColumn(8).hidden = true;
  sum.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } };
  styleHeader(sum.addRow(['Category', 'Count', 'R3', 'R5', 'Status']));
  for (const p of rows) {
    const target = by => { const m = (p.milestones || []).find(x => x.by === by); return m ? m.n : null; };
    const cat = BY_CODE[p.code];
    const row = sum.addRow([cat ? cat.label : `${p.code}) ${p.name}`, p.count, target('R3'), target('R5'), STATUS_EMOJI[p.status] || '']);
    row.getCell(5).alignment = { horizontal: 'center' };
    if (STATUS_FILL[p.status]) row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[p.status] } };
  }
  sum.addRow([]);
  sum.addRow(['🔴 behind a past target   🟡 target not yet met   🟢 all targets met']).getCell(1).font = { color: { argb: 'FF666666' } };
}

// The export with the user's choices (export-opts.js exportTables): sheet "Cases" (with the hidden id
// column, so it can be uploaded back), sheet "Reflections", and "Summary" when asked for.
// meta: { name, rYear, rangeLabel }
export async function exportWorkbook(tables, meta = {}) {
  const wb = new (X().Workbook)();
  wb.creator = 'APMES Logbook';
  wb.title = meta.name ? `${meta.name} logbook` : 'Logbook';
  const excelDates = tables.opts.dateStyle !== 'iso';
  const sheet = (title, t, withId) => {
    const ws = wb.addWorksheet(title, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      ...t.cols.map(c => ({ header: c.name, key: c.k, width: c.width, ...(c.k === 'date' && excelDates ? { style: { numFmt: 'd mmm yyyy' } } : {}) })),
      ...(withId ? [{ header: 'id', key: 'id', width: 20, hidden: true }] : []),
    ];
    styleHeader(ws.getRow(1));
    for (const r of t.rows) {
      const cells = r.cells.map(v => (v && typeof v === 'object' && v.date ? (excelDates ? isoToUTC(v.date) : v.date) : v));
      const row = ws.addRow(withId ? [...cells, r.id] : cells);
      t.cols.forEach((c, i) => { row.getCell(i + 1).alignment = c.width >= 30 ? { wrapText: true, vertical: 'top' } : { vertical: 'top', horizontal: 'left' }; });
    }
    if (t.cols.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.cols.length } };
  };
  if (tables.cases) sheet('Cases', tables.cases, true);
  if (tables.reflections) sheet('Reflections', tables.reflections, false);
  if (tables.cases && tables.opts.summary) {
    const ranged = tables.range.from || tables.range.to;
    addSummary(wb, progress(countCases(tables.cases.list), meta.rYear || 1), meta.name,
      `Exported ${fmtDate(todayISO())}${ranged ? ` · counts are for ${meta.rangeLabel || 'the chosen dates'} only` : ''}. R3 and R5 are cumulative targets.`);
  }
  if (!wb.worksheets.length) wb.addWorksheet('Empty');
  if (tables.cases) {
    const info = wb.addWorksheet('Export info', { state: 'veryHidden' });
    info.getCell('A1').value = `${EXPORTED_TAG}${Date.now()}`;
    info.getCell('A2').value = `${RANGE_TAG}${tables.range.from || ''}:${tables.range.to || ''}`;
  }
  return toBlob(wb);
}

const EXPORTED_TAG = 'logbook-exported-at:';
const RANGE_TAG = 'logbook-range:';
// When the file was made and the dates it was limited to: from the hidden "Export info" sheet, or
// the hidden Summary H1 cell of older files. On upload, cases outside the range, or logged after the
// file was made, are never deleted.
function exportInfo(wb) {
  const info = wb.getWorksheet('Export info');
  const sumTag = wb.getWorksheet('Summary') && cellText(wb.getWorksheet('Summary').getCell('H1').value);
  const tag = (info && cellText(info.getCell('A1').value)) || sumTag || '';
  const exportedAt = tag.startsWith(EXPORTED_TAG) ? Number(tag.slice(EXPORTED_TAG.length)) || null : null;
  const r = (info && cellText(info.getCell('A2').value)) || '';
  const [from = '', to = ''] = r.startsWith(RANGE_TAG) ? r.slice(RANGE_TAG.length).split(':') : [];
  return { exportedAt, from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : '', to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : '' };
}

const HEADERS = {
  date: /^date\b/i,
  initials: /^(?:patient(?:'?s)?\s+)?initials$/i,   // an optional column of its own
  details: /detail|summary|initials/i,
  categories: /categor|^tags?$/i,
  id: /^id$/i,
};

// Rows [{ row, id?, date, initials?, details, categories }] from the "Cases" sheet exported above or from the first
// sheet with Date / Case details / Categories headers (found by name, in the first 10 rows).
// `date` is the raw cell (Date, number or text) for parseDate. Rows only carry `id` when the sheet
// has an id column; the returned array then has hasIdColumn = true (diffRows uses it for deletions).
// file: a File/Blob, ArrayBuffer or Uint8Array.
export async function readCasesSheet(file) {
  const data = file && typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file;
  const wb = new (X().Workbook)();
  await wb.xlsx.load(data);
  const sheets = [...wb.worksheets].sort((a, b) => (b.name === 'Cases') - (a.name === 'Cases'));
  const { exportedAt, from, to } = exportInfo(wb);
  for (const ws of sheets) {
    let headerRow = 0, cols = {};
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (headerRow || n > 10) return;
      const found = {};
      row.eachCell((c, i) => {
        const h = cellText(c.value).trim();
        for (const [k, re] of Object.entries(HEADERS)) {
          if (k === 'details' && HEADERS.initials.test(h)) continue;   // "Initials" alone is not the details column
          if (!found[k] && re.test(h)) found[k] = i;
        }
      });
      if (!found.details && found.initials) { found.details = found.initials; delete found.initials; }
      if (found.details && (found.date || found.categories)) { headerRow = n; cols = found; }
    });
    if (!headerRow) continue;
    const out = [];
    out.hasIdColumn = !!cols.id;
    out.exportedAt = exportedAt;   // ms, or null for a sheet not exported by this app
    out.range = { from, to };      // the dates the file was limited to ('' = open)
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n <= headerRow) return;
      const get = k => (cols[k] ? row.getCell(cols[k]).value : null);
      const r = {
        row: n,
        date: rawValue(get('date')),
        details: cellText(get('details')).trim(),
        categories: cellText(get('categories')).trim(),
      };
      if (cols.id) r.id = cellText(get('id')).trim();
      // with an Initials column they are used as they are; otherwise caseFromRow splits them off the details
      if (cols.initials) r.initials = cellText(get('initials')).trim();
      if (r.date == null && !r.details && !r.initials && !r.categories && !r.id) return;
      out.push(r);
    });
    return out;
  }
  throw new Error('Could not find a sheet with "Date", "Case summary" (or "Case details") and "Tags" (or "Categories") columns.');
}

// Every sheet as a grid of raw cells (Dates stay Dates; formulas give their result), for the Upload
// page where the columns are matched by hand: { sheets: [{ name, rows: [[...]] }], exportedAt }.
export async function readSheetGrid(file) {
  const data = file && typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file;
  const wb = new (X().Workbook)();
  await wb.xlsx.load(data);
  const { exportedAt, from, to } = exportInfo(wb);
  const sheets = [...wb.worksheets].filter(ws => ws.state !== 'veryHidden' && ws.state !== 'hidden').sort((a, b) => (b.name === 'Cases') - (a.name === 'Cases')).map(ws => {
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const out = [];
      row.eachCell({ includeEmpty: true }, (c, i) => { const v = rawValue(c.value); out[i - 1] = v instanceof Date ? v : v == null ? '' : typeof v === 'number' ? v : cellText(c.value); });
      rows[n - 1] = out;
    });
    return { name: ws.name, rows: Array.from(rows, r => r || []) };
  }).filter(s => s.rows.some(r => r.some(v => String(v ?? '').trim())));
  return { sheets, exportedAt, range: { from, to } };
}

// A totals matrix (categories down, residents across). Accepts either
//   { title?, columns: ['Name', ...], rows: [{ label, values: [n, ...], statuses?: ['late'|'due'|'ontrack'|'done'|'none', ...] }], sheet? }
// or a plain array of arrays whose first row is the header. Status cells are shaded like the Summary sheet.
export async function exportTotals(table) {
  const wb = new (X().Workbook)();
  wb.creator = 'APMES Logbook';
  let title = '', header, body;
  if (Array.isArray(table)) {
    [header = [], ...body] = table;
    body = body.map(r => ({ label: r[0], values: r.slice(1) }));
    header = header.slice(1);
  } else {
    title = table.title || '';
    header = table.columns || [];
    body = (table.rows || []).map(r => (Array.isArray(r) ? { label: r[0], values: r.slice(1) } : r));
  }
  const ws = wb.addWorksheet(String((table && table.sheet) || 'Totals').slice(0, 31));
  let first = 1;
  if (title) {
    ws.getCell(1, 1).value = title;
    ws.getCell(1, 1).font = { bold: true, size: 13 };
    first = 3;
  }
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: first }];
  const head = ws.getRow(first);
  head.values = ['Category', ...header];
  styleHeader(head);
  head.alignment = { wrapText: true, vertical: 'bottom', horizontal: 'center' };
  ws.getColumn(1).width = 46;
  header.forEach((_, i) => { ws.getColumn(i + 2).width = 12; });
  for (const r of body) {
    const row = ws.addRow([r.label, ...(r.values || []).map(v => (v == null ? '' : v))]);
    (r.statuses || []).forEach((s, i) => {
      if (STATUS_FILL[s]) row.getCell(i + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[s] } };
    });
    for (let i = 2; i <= header.length + 1; i++) row.getCell(i).alignment = { horizontal: 'center' };
    if (/^(grand )?total|reflection/i.test(String(r.label || ''))) row.font = { bold: true };
  }
  return toBlob(wb);
}
