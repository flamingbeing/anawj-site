// Excel export and round trip for the logbook, with ExcelJS (the global from vendor/exceljs.min.js
// in the browser; tests set globalThis.ExcelJS).

import { BY_CODE } from './categories.js';
import { countCases, progress, sortCodes, fmtDate, todayISO } from './engine.js';

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

// Sheet "Cases" (Date | Case details | Categories | id, the id column hidden so edits can be
// matched back), oldest first, and sheet "Summary" (Category | Count | R3 | R5 | Status).
// progressRows = progress(counts, rYear); computed from counts (or the cases) and opts.rYear if absent.
export async function exportCases(cases, { name = '', counts, progressRows, rYear = 1 } = {}) {
  const wb = new (X().Workbook)();
  wb.creator = 'APMES Logbook';
  wb.title = name ? `${name} logbook` : 'Logbook';
  const ws = wb.addWorksheet('Cases', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Date', key: 'date', width: 13, style: { numFmt: 'd mmm yyyy' } },
    { header: 'Case details', key: 'details', width: 60 },
    { header: 'Categories', key: 'categories', width: 60 },
    { header: 'id', key: 'id', width: 20, hidden: true },
  ];
  styleHeader(ws.getRow(1));
  const sorted = [...(cases || [])].sort((a, b) =>
    (a.date ? 0 : 1) - (b.date ? 0 : 1) || String(a.date || '').localeCompare(String(b.date || '')) || (a.createdAt || 0) - (b.createdAt || 0));
  for (const c of sorted) {
    const row = ws.addRow({ date: c.date ? isoToUTC(c.date) : (c.dateText || ''), details: c.details || '', categories: labelsOf(c.cats), id: c.id || '' });
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(1).alignment = { vertical: 'top', horizontal: 'left' };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 3 } };

  const rows = progressRows || progress(counts || countCases(cases || []), rYear);
  const sum = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 3 }] });
  sum.columns = [{ width: 62 }, { width: 8 }, { width: 6 }, { width: 6 }, { width: 8 }];
  sum.getCell('A1').value = `${name ? name + ' — ' : ''}case log summary`;
  sum.getCell('A1').font = { bold: true, size: 13 };
  sum.getCell('A2').value = `Exported ${fmtDate(todayISO())}. R3 and R5 are cumulative targets.`;
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
  return toBlob(wb);
}

const EXPORTED_TAG = 'logbook-exported-at:';

const HEADERS = {
  date: /^date\b/i,
  details: /detail|initials/i,
  categories: /categor/i,
  id: /^id$/i,
};

// Rows [{ row, id?, date, details, categories }] from the "Cases" sheet exported above or from the first
// sheet with Date / Case details / Categories headers (found by name, in the first 10 rows).
// `date` is the raw cell (Date, number or text) for parseDate. Rows only carry `id` when the sheet
// has an id column; the returned array then has hasIdColumn = true (diffRows uses it for deletions).
// file: a File/Blob, ArrayBuffer or Uint8Array.
export async function readCasesSheet(file) {
  const data = file && typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file;
  const wb = new (X().Workbook)();
  await wb.xlsx.load(data);
  const sheets = [...wb.worksheets].sort((a, b) => (b.name === 'Cases') - (a.name === 'Cases'));
  const tag = wb.getWorksheet('Summary') && cellText(wb.getWorksheet('Summary').getCell('H1').value);
  const exportedAt = tag && tag.startsWith(EXPORTED_TAG) ? Number(tag.slice(EXPORTED_TAG.length)) || null : null;
  for (const ws of sheets) {
    let headerRow = 0, cols = {};
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (headerRow || n > 10) return;
      const found = {};
      row.eachCell((c, i) => {
        const h = cellText(c.value).trim();
        for (const [k, re] of Object.entries(HEADERS)) if (!found[k] && re.test(h)) found[k] = i;
      });
      if (found.details && (found.date || found.categories)) { headerRow = n; cols = found; }
    });
    if (!headerRow) continue;
    const out = [];
    out.hasIdColumn = !!cols.id;
    out.exportedAt = exportedAt;   // ms, or null for a sheet not exported by this app
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
      if (r.date == null && !r.details && !r.categories && !r.id) return;
      out.push(r);
    });
    return out;
  }
  throw new Error('Could not find a sheet with "Date", "Case details" and "Categories" columns.');
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
