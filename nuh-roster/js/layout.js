// The department roster sheet as a list of cells, shared by the Excel export and the in-page preview.
// Columns are 1-based like Excel (A=1 ... L=12). Parts not generated yet are left blank.

import { namesInCell } from './engine.js';

export const COL_WIDTHS = [10, 5, 9.14, 9.14, 9.14, 9.14, 9.14, 9.14, 9.14, 9.14, 9.14, 9.14];
export const RED = 'FFFF0000';
export const BLUE = 'FF0000FF';

const UPPER = [
  // [row label, has a boxed assistant cell]
  ['Recovery Room', false], ['EOT 8:', false], ['EOT 9:', false], ['', false],
  ['Epidural:', false], ['ADOT:', false], ['Cardiac Call:', false], null,
  ['ECT:', false], ['AOCC:', false], ['Pain/ACP Clinic:', false], ['Acute Pain:', false], ['Chronic Pain:', false],
];

// lists: { postcall: [...names], leave: [...], admin: [...] }
export function buildLayout({ date, rows, lists = {} }) {
  const cells = [];
  const heights = {};
  const put = (r, c1, c2, text, o = {}) => cells.push({ r, r2: o.r2 || r, c1, c2, text: text ?? '', runs: o.runs || null, edit: o.edit || null, sz: o.sz || 8, bold: !!o.bold, color: o.color || null, align: o.align || 'center', box: !!o.box, valign: o.valign || 'middle', underlineFirst: !!o.underlineFirst });
  const label = (r, text, o = {}) => put(r, 1, 2, text, { align: 'right', ...o });

  const d = date ? new Date(date + 'T12:00:00') : null;
  put(2, 1, 12, 'DEPARTMENT OF ANAESTHESIA', { sz: 10, bold: true });
  put(3, 1, 12, 'NATIONAL UNIVERSITY HEALTH SYSTEM', { sz: 10, bold: true });
  label(5, 'Date', { bold: true });
  put(5, 3, 5, d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '', { bold: true });
  put(5, 6, 7, d ? d.toLocaleDateString('en-GB', { weekday: 'long' }) : '', { bold: true });
  put(5, 9, 11, ['Admin day', ...(lists.admin || [])].join('\n'), { r2: 13, box: true, align: 'left', valign: 'top', underlineFirst: true });

  put(7, 3, 5, 'MOT', { bold: true });
  put(7, 6, 8, 'SICU', { bold: true });
  label(8, 'Consultant:'); label(9, 'Registrar/AC:'); label(10, 'Residents:');
  for (let r = 8; r <= 12; r++) { put(r, 3, 5, ''); put(r, 6, 8, ''); }

  put(15, 3, 5, 'Specialist', { bold: true });
  put(15, 6, 8, 'Assistants', { bold: true });
  UPPER.forEach((u, i) => {
    if (!u) return;
    const r = 16 + i;
    const [text, boxed] = u;
    if (text) label(r, text);
    put(r, 3, 5, '');
    put(r, 6, 8, '', { box: boxed });
    if (text === 'AOCC:') put(r, 9, 11, 'AIC:', { box: true, bold: true });
  });

  // admin, post call and leave grids: ten names per row across C..L
  let r = 30;
  label(r, 'Admin/no list');
  put(r, 3, 3, '', { box: true });
  r++;
  const grid = (title, names) => {
    const list = names.length ? names : [''];
    for (let i = 0; i < list.length; i += 10) {
      if (i === 0) label(r, title);
      heights[r] = 22.5;
      list.slice(i, i + 10).forEach((n, k) => put(r, 3 + k, 3 + k, n, { box: true }));
      r++;
    }
  };
  grid('Post call', lists.postcall || []);
  grid('Leave', lists.leave || []);
  r++;

  label(r, 'AH OT : ', { bold: true, color: BLUE });
  put(r, 3, 11, '', { box: true, bold: true, color: BLUE });
  r++;

  const doubles = doubleCovered(rows);
  let last = null;
  rows.forEach((row, i) => {
    if (last && row.complex !== last && row.complex === 'MOR') r++;
    last = row.complex;
    const red = row.complex === 'KROR' || row.complex === 'Other';
    label(r, row.label + ':', red ? { bold: true, color: RED } : {});
    put(r, 3, 5, row.senior || '', { box: true, runs: seniorRuns(row.senior, doubles) });
    put(r, 6, 8, row.junior || '', { box: true });
    put(r, 9, 11, row.premed || '', { box: true, bold: true });
    put(r, 12, 12, row.notes || '', { sz: 10, align: 'left', edit: { row: i, key: 'notes' } });
    r++;
  });
  return { cells, heights, rows: r - 1, cols: 12 };
}

const key = n => n.toLowerCase().replace(/\s+/g, ' ').trim();

// Seniors named in more than one room's senior cell, i.e. double covering.
export function doubleCovered(rows) {
  const count = {};
  for (const row of rows) for (const n of new Set(namesInCell(row.senior).map(key))) count[n] = (count[n] || 0) + 1;
  return new Set(Object.keys(count).filter(n => count[n] > 1));
}

export function isDouble(part, doubles) {
  const n = namesInCell(part)[0];
  return !!n && doubles.has(key(n));
}

// The senior cell as text runs, with a superscript "&" after anyone double covering.
function seniorRuns(text, doubles) {
  const parts = String(text || '').split(/\s*\/\s*/).filter(Boolean);
  if (!parts.some(p => isDouble(p, doubles))) return null;
  const runs = [];
  parts.forEach((p, k) => {
    runs.push({ text: (k ? ' / ' : '') + p });
    if (isDouble(p, doubles)) runs.push({ text: '&', sup: true });
  });
  return runs;
}

// Short form for the post call / leave grid: the shortest name we know them by.
export function shortName(p) {
  const forms = [p.name, ...(p.aliases || [])].filter(Boolean);
  return forms.sort((a, b) => a.length - b.length)[0] || '';
}
