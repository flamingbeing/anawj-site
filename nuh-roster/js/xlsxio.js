import { buildLayout, COL_WIDTHS } from './layout.js';

// Reading and writing roster spreadsheets with ExcelJS (passed in, so this runs in the browser and in Node).

export function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return '';
  }
  return String(v);
}

// Rows of a department roster sheet: label in A, senior in C, junior in F, premed in I, notes in L.
export function readRosterRows(ws) {
  const rows = [];
  ws.eachRow({ includeEmpty: false }, row => {
    const t = c => cellText(row.getCell(c).value).trim();
    const label = t(1);
    if (!label) return;
    rows.push({ label: label.replace(/:\s*$/, ''), senior: t(3), junior: t(6), premed: t(9), notes: t(12) });
  });
  return rows;
}

// A staff sheet with a header row. Columns are found by name, so order doesn't matter.
const HEADERS = {
  name: /^(full\s*)?name$/i,
  aliases: /short|alias|nick/i,
  role: /^role$|senior.*junior/i,
  grade: /grade|designation|rank/i,
  posting: /posting|rotation/i,
  subspecs: /subspec/i,
  avoid: /avoid|doesn.?t do|exclu/i,
};

export function readStaffSheet(ws) {
  let headerRow = null, cols = {};
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (headerRow) return;
    const found = {};
    row.eachCell((c, i) => {
      const h = cellText(c.value).trim();
      for (const [k, re] of Object.entries(HEADERS)) if (!found[k] && re.test(h)) found[k] = i;
    });
    if (found.name) { headerRow = n; cols = found; }
  });
  if (!headerRow) return { error: 'Could not find a header row with a "Name" column.' };
  const list = s => String(s || '').split(/[,;\/]+/).map(x => x.trim()).filter(Boolean);
  const people = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n <= headerRow) return;
    const get = k => cols[k] ? cellText(row.getCell(cols[k]).value).trim() : '';
    const name = get('name');
    if (!name) return;
    const grade = get('grade');
    const roleText = get('role').toLowerCase();
    const seniorish = /consultant|senior|registrar|\bac\b|associate/i.test(grade + ' ' + roleText);
    people.push({
      name,
      aliases: list(get('aliases')),
      role: roleText.startsWith('j') ? 'junior' : roleText.startsWith('s') || seniorish ? 'senior' : 'junior',
      grade: normGrade(grade, seniorish),
      posting: get('posting'),
      subspecs: list(get('subspecs')).map(s => s.toLowerCase()),
      avoid: list(get('avoid')).map(s => s.toLowerCase()),
    });
  });
  return { people };
}

function normGrade(g, seniorish) {
  const s = String(g).toLowerCase();
  if (/baby/.test(s)) return 'Baby MO';
  if (/mopex|medical officer|\bmo\b/.test(s)) return 'MOPEX';
  if (/resident|trainee/.test(s)) return 'Resident';
  if (/registrar/.test(s)) return 'Registrar';
  if (/\bac\b|associate/.test(s)) return 'AC';
  if (/consultant/.test(s)) return 'Consultant';
  return seniorish ? 'Consultant' : 'Resident';
}

// Build the roster workbook in the department's layout.
export function buildRosterWorkbook(ExcelJS, { date, rows, lists }) {
  const layout = buildLayout({ date, rows, lists });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(date || 'roster', { pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 } });
  ws.columns = COL_WIDTHS.map(width => ({ width }));
  const thin = { style: 'thin' };
  for (const c of layout.cells) {
    const cell = ws.getCell(c.r, c.c1);
    const font = { name: 'Arial', size: c.sz, bold: c.bold, ...(c.color ? { color: { argb: c.color } } : {}) };
    if (c.underlineFirst && c.text) {
      const [first, ...rest] = c.text.split('\n');
      cell.value = { richText: [{ text: first, font: { ...font, underline: true } }, ...(rest.length ? [{ text: '\n' + rest.join('\n'), font }] : [])] };
    } else if (c.runs) {
      cell.value = { richText: c.runs.map(run => ({ text: run.text, font: run.sup ? { ...font, vertAlign: 'superscript' } : font })) };
    } else cell.value = c.text;
    cell.font = font;
    cell.alignment = { horizontal: c.align, vertical: c.valign, wrapText: c.c2 < 12 };
    // style the top-left cell, then merge: the merged cells take its style, so the box is drawn all round
    if (c.box) cell.border = { top: thin, bottom: thin, left: thin, right: thin };
    if (c.r2 > c.r || c.c2 > c.c1) ws.mergeCells(c.r, c.c1, c.r2, c.c2);
  }
  for (const [r, h] of Object.entries(layout.heights)) ws.getRow(+r).height = h;
  return wb;
}
