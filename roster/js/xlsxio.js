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

// Build the roster workbook in the department's layout (OT section only for now).
export function buildRosterWorkbook(ExcelJS, { date, rows }) {
  const wb = new ExcelJS.Workbook();
  const d = date ? new Date(date + 'T00:00:00') : null;
  const title = date || 'roster';
  const ws = wb.addWorksheet(title, { pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [10, 5, 9, 9, 9, 9, 9, 9, 9, 9, 9, 18].map(width => ({ width }));
  const font = (sz, bold, color) => ({ name: 'Arial', size: sz, bold: !!bold, ...(color ? { color: { argb: color } } : {}) });
  const center = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const thin = { style: 'thin' };

  const put = (addr, value, f, align) => { const c = ws.getCell(addr); c.value = value; c.font = f; if (align) c.alignment = align; return c; };
  ws.mergeCells('A2:L2'); put('A2', 'DEPARTMENT OF ANAESTHESIA', font(10, true), center);
  ws.mergeCells('A3:L3'); put('A3', 'NATIONAL UNIVERSITY HEALTH SYSTEM', font(10, true), center);
  ws.mergeCells('A5:B5'); put('A5', 'Date', font(8, true), { horizontal: 'right' });
  ws.mergeCells('C5:E5');
  put('C5', d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '', font(8, true), center);
  ws.mergeCells('F5:G5');
  put('F5', d ? d.toLocaleDateString('en-GB', { weekday: 'long' }) : '', font(8, true), center);

  let r = 7;
  let lastComplex = null;
  for (const row of rows) {
    if (lastComplex && row.complex !== lastComplex && row.complex === 'MOR') r++; // gap before MOR, as in the paper roster
    lastComplex = row.complex;
    ws.mergeCells(`A${r}:B${r}`);
    ws.mergeCells(`C${r}:E${r}`);
    ws.mergeCells(`F${r}:H${r}`);
    ws.mergeCells(`I${r}:K${r}`);
    put(`A${r}`, row.label + ':', font(8, true), { horizontal: 'right', vertical: 'middle' });
    put(`C${r}`, row.senior || '', font(8), center).border = { bottom: thin };
    put(`F${r}`, row.junior || '', font(8), center).border = { bottom: thin, left: thin };
    put(`I${r}`, row.premed || '', font(8, false, 'FF000000'), center).border = { bottom: thin };
    put(`L${r}`, row.notes || '', font(10));
    r++;
  }
  return wb;
}
