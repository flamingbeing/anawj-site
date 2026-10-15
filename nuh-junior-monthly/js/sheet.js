// NUH Junior Monthly: the department's Google Sheet in and out. The sheet stays the source of truth (its formulas,
// colours and other tabs are the department's), so the app reads the month's grid tab (pasted from Sheets, or a
// downloaded .xlsx) and gives back only the day cells, in the same rows and columns, to paste over the same block.
// A cell whose meaning didn't change goes back exactly as it was typed ("X/NP", "(XX)", "TL ").
//
// The grid tab ("1 - 30 Nov 26 Request"): a header row "S/N | Grade | Name | 1 | 2 | … | 30 | 1-Dec", the weekday names
// in the row above it, one row per person below (S/N, grade, name, one code per day, then the 1st of next month), then
// a blank row and count rows. Pure functions, no DOM (node tests use them).
import * as M from './model.js';

const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Column number (0-based) to letters: 3 -> D, 34 -> AI
export function colName(i) { let s = ''; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }

// Rows (arrays of cell text) from a paste: tab-separated, as Google Sheets copies a range.
export function rowsFromTSV(text) {
  return String(text || '').replace(/\r/g, '').split('\n').map(l => l.split('\t'));
}

// Find the grid: header row, day columns, people. `rowOffset` = the sheet row of rows[0] minus 1 (a paste that
// started at A1 has 0). Returns null when no grid is found.
export function parseGrid(rows, { rowOffset = 0, colOffset = 0 } = {}) {
  const h = rows.findIndex(r => r.slice(0, 5).some(c => /^name$/i.test(norm(c))) && r.slice(0, 5).some(c => /^(grade|s\/n)$/i.test(norm(c))));
  if (h < 0) return null;
  const head = rows[h];
  const nameCol = head.findIndex(c => /^name$/i.test(norm(c)));
  const gradeCol = head.findIndex(c => /^grade$/i.test(norm(c)));
  const snCol = head.findIndex(c => /^s\/n$/i.test(norm(c)));
  const days = [];
  for (let c = nameCol + 1; c < head.length; c++) {
    const v = norm(head[c]);
    if (/^\d{1,2}$/.test(v) && +v === days.length + 1) days.push(c); else break;
  }
  if (days.length < 28) return null;
  const nextCol = days[days.length - 1] + 1;
  const wdRow = rows[h - 1] || [];
  const firstWd = norm(wdRow[days[0]]).slice(0, 3).toLowerCase();
  // the month: a "1 to 30 November 26" or "Nov 26" anywhere above the header
  let month = '';
  for (let r = 0; r < h && !month; r++) for (const c of rows[r]) {
    const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*'?(\d{2,4})\b/i.exec(norm(c));
    if (m) { const y = m[2].length === 2 ? 2000 + +m[2] : +m[2]; month = `${y}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}`; break; }
  }
  const people = [];
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = norm(row[nameCol]);
    const sn = snCol >= 0 ? norm(row[snCol]) : '';
    const grade = gradeCol >= 0 ? norm(row[gradeCol]) : '';
    if (!name) { if (people.length && rows.slice(r + 1, r + 3).every(x => !norm((x || [])[nameCol]))) break; continue; }
    if (people.length && !grade && !/^\d+$/.test(sn)) break;   // the count rows ("R1", "Total Jnr") have neither
    people.push({ row: r + 1 + rowOffset, sn, grade, name, texts: days.map(c => (row[c] == null ? '' : String(row[c]))), next: row[nextCol] == null ? '' : String(row[nextCol]) });
  }
  return { headerRow: h + 1 + rowOffset, firstCol: days[0] + colOffset, nextCol: nextCol + colOffset, nDays: days.length, firstWd, month, people };
}

// Does the month fit the grid (days in the month, weekday of the 1st)?
export function monthFits(grid, month) {
  if (!grid || !/^\d{4}-\d{2}$/.test(month || '')) return false;
  const days = M.monthDays(month);
  if (days.length !== grid.nDays) return false;
  const wd = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][M.weekday(days[0])];
  return !grid.firstWd || grid.firstWd === wd;
}

// Words the sheet uses that the app works out from the date or ignores.
const IGNORE = new Set(['WE', 'PH', 'WD', '']);
// One cell's text -> { a: [codes], r: [requests], pc, ppc, unknown: [] }. dmap: code -> duty; upper: CODE -> code.
export function codesFromText(text, dmap, upper) {
  const out = { a: [], r: [], pc: false, ppc: false, unknown: [] };
  const t = norm(text);
  if (!t) return out;
  for (let tok of t.split(/[\s/,+&]+/)) {
    tok = tok.replace(/^\((.*)\)$/, '$1').replace(/_+$/, '');   // (XX) -> XX, R_ -> R, S1_ -> S1 (a request)
    const req = /_$/.test(t) && !tok.includes('_');
    const T = tok.toUpperCase();
    if (IGNORE.has(T)) continue;
    if (T === 'PC') { out.pc = true; continue; }
    if (T === 'PPC') { out.ppc = true; continue; }
    if (T === 'X') { out.r.push('X'); continue; }
    const code = upper.get(T);
    if (!code) { out.unknown.push(tok); continue; }
    const du = dmap.get(code);
    if (du.kind === 'request') out.r.push(code);
    else if (req && du.kind === 'shift') { out.r.push('R'); }   // "S1_" / "R1_": asks for that call
    else out.a.push(code);
  }
  return out;
}

// The group for a grade text ("RES3", "Fellow", "LOC")
export function groupForGrade(state, grade) {
  const G = norm(grade).toUpperCase();
  const g = (state.groups || []).find(x => (x.grades || []).map(s => s.toUpperCase()).includes(G))
    || (state.groups || []).find(x => x.id.toUpperCase() === G);
  return g ? g.id : null;
}

const nameKey = s => norm(s).toLowerCase().replace(/[^a-z]/g, '');

// What an import would do: people matched / new / skipped (seniors' rows), unknown codes, cells.
export function planImport(state, grid, month) {
  const dmap = M.dutyMap(state);
  const upper = new Map([...dmap.keys()].map(c => [c.toUpperCase(), c]));
  const byName = new Map((state.staff || []).map(p => [nameKey(p.name), p]));
  const unknown = new Map();
  const people = [];
  for (const row of grid.people) {
    const group = groupForGrade(state, row.grade);
    if (!group) { people.push({ ...row, skip: true, why: `grade ${row.grade || '?'} not on People › Groups` }); continue; }
    const match = byName.get(nameKey(row.name));
    const parsed = row.texts.map(t => codesFromText(t, dmap, upper));
    parsed.forEach(p => p.unknown.forEach(u => unknown.set(u, (unknown.get(u) || 0) + 1)));
    people.push({ ...row, group, match: match ? match.id : '', parsed });
  }
  return { month, people, unknown };
}

// Apply a planned import (inside a store commit): add new people, replace this month's cells for everyone in the
// sheet, remember the sheet layout and each cell's original text (for the copy back). Unknown codes are added as
// kind "other" when addUnknown is true, else kept as cell notes.
export function applyImport(draft, plan, grid, { addUnknown = true, tab = '' } = {}) {
  const month = plan.month;
  const days = M.monthDays(month);
  if (addUnknown) for (const code of plan.unknown.keys()) if (!draft.duties.some(d => d.code.toUpperCase() === code.toUpperCase())) draft.duties.push(M.cleanDuty({ code, name: code, kind: 'other' }));
  const dmap = M.dutyMap(draft);
  const upper = new Map([...dmap.keys()].map(c => [c.toUpperCase(), c]));
  const layout = { tab, headerRow: grid.headerRow, firstCol: grid.firstCol, nextCol: grid.nextCol, rows: {}, orig: {}, importedAt: new Date().toISOString() };
  let added = 0, cells = 0;
  for (const row of plan.people) {
    layout.orig[row.row] = [...row.texts, row.next];
    if (row.skip) continue;
    let id = row.match;
    if (!id) {
      id = M.uid('s');
      draft.staff.push({ id, name: row.name, short: '', group: row.group, tags: [], fte: 1, start: '', end: '', note: '', active: true });
      added++;
    }
    layout.rows[row.row] = id;
    // the sheet shows only the call (or PC / PPC) on a posting day: the posting underneath comes from the days around
    const parsedRow = row.texts.map(t => codesFromText(t, dmap, upper));
    const postOf = p => p.a.find(c => dmap.get(c)?.kind === 'posting') || '';
    const covered = p => p.pc || p.ppc || p.a.some(c => dmap.get(c)?.kind === 'shift');
    const fill = parsedRow.map(postOf);
    for (let k = 0; k < fill.length; k++) {
      if (fill[k] || !covered(parsedRow[k])) continue;
      let b = k - 1; while (b >= 0 && !postOf(parsedRow[b]) && covered(parsedRow[b])) b--;
      let f = k + 1; while (f < fill.length && !postOf(parsedRow[f]) && covered(parsedRow[f])) f++;
      const before = b >= 0 ? postOf(parsedRow[b]) : '', after = f < fill.length ? postOf(parsedRow[f]) : '';
      fill[k] = before || after;
      if (before && after && before !== after) fill[k] = before;
    }
    days.forEach((d, k) => {
      const p = parsedRow[k];
      if (fill[k] && !p.a.includes(fill[k])) p.a.unshift(fill[k]);
      // PC / PPC the app can't explain from the cells (carried over from last month) stay as typed codes
      if (p.pc && (k === 0 || !parsedRow[k - 1].a.some(c => dmap.get(c)?.overnight))) p.a.push('PC');
      if (p.ppc && (k < 2 || !parsedRow[k - 2].a.some(c => dmap.get(c)?.rest2))) p.a.push('PPC');
      const note = !addUnknown && p.unknown.length ? p.unknown.join(' ') : '';
      M.setCell(draft, d, id, { a: p.a, r: p.r, auto: [], note, lock: false });
      if (p.a.length || p.r.length) cells++;
    });
  }
  if (!draft.sheets || typeof draft.sheets !== 'object') draft.sheets = {};
  draft.sheets[month] = layout;
  return { added, cells };
}

// The text the sheet should show for one person-day: a call first, then PC / PPC, leave, other, the posting, requests.
export function cellText(state, date, staffId) {
  const dmap = M.dutyMap(state);
  const cell = M.getCell(state, date, staffId);
  const eff = M.effectiveCodes(state, date, staffId);
  const a = (cell && cell.a) || [];
  const r = (cell && cell.r) || [];
  const of = k => a.filter(c => (dmap.get(c) || {}).kind === k);
  const shifts = of('shift');
  if (shifts.length) return shifts.join('/');
  if (eff.includes('x') || a.includes('PC')) return 'PC';
  if (eff.includes('PPC')) return 'PPC';
  const lv = of('leave');
  if (lv.length) return lv.join('/');
  const ot = of('other').filter(c => c !== 'PC' && c !== 'PPC');
  if (ot.length) return ot.join('/');
  const reqs = r.map(c => (c === 'XX' ? '(XX)' : c));
  const post = of('posting');
  if (post.length) return reqs.length ? `${post[0]}` : post[0];
  return reqs.join('/');
}

// Same meaning? (so an unchanged cell goes back exactly as typed)
function sameMeaning(state, text, want) {
  const dmap = M.dutyMap(state);
  const upper = new Map([...dmap.keys()].map(c => [c.toUpperCase(), c]));
  const a = codesFromText(text, dmap, upper), b = codesFromText(want, dmap, upper);
  const key = p => [...p.a, ...p.r.map(x => 'r:' + x), p.pc ? 'PC' : '', p.ppc ? 'PPC' : '', ...p.unknown].filter(Boolean).sort().join(',');
  return key(a) === key(b);
}

// The block to paste back over the sheet: every person row from the first to the last, day 1 to the 1st of next
// month. Rows the app doesn't know (seniors) go back exactly as they were. Returns { tsv, range, changes: [...] }.
export function exportBlock(state, month) {
  const lay = state.sheets && state.sheets[month];
  if (!lay) return null;
  const days = M.monthDays(month);
  const rowsNums = Object.keys(lay.orig).map(Number).sort((x, y) => x - y);
  if (!rowsNums.length) return null;
  const first = rowsNums[0], last = rowsNums[rowsNums.length - 1];
  const nextDay = M.addDays(days[days.length - 1], 1);
  const lines = [], changes = [];
  for (let r = first; r <= last; r++) {
    const orig = lay.orig[r];
    const id = lay.rows[r];
    const person = id && (state.staff || []).find(p => p.id === id);
    if (!orig) { lines.push(new Array(days.length + 1).fill('').join('\t')); continue; }
    const out = [];
    days.forEach((d, k) => {
      const was = orig[k] || '';
      if (!person) { out.push(was); return; }
      const want = cellText(state, d, id);
      if (sameMeaning(state, was, want)) { out.push(was); return; }
      out.push(want);
      changes.push({ cell: `${colName(lay.firstCol + k)}${r}`, name: person.name, date: d, from: was.trim(), to: want });
    });
    // the 1st of next month: post call (or the day off) after a call on the last days
    const nextOrig = orig[days.length] || '';
    let nx = nextOrig;
    if (person) {
      const lastCell = M.getCell(state, days[days.length - 1], id);
      const dmap = M.dutyMap(state);
      let want = '';
      if (lastCell && (lastCell.a || []).some(c => dmap.get(c)?.overnight)) want = 'PC';
      else {
        const prev2 = M.getCell(state, days[days.length - 2], id);
        if (prev2 && (prev2.a || []).some(c => dmap.get(c)?.rest2) && (lastCell?.a || []).some(c => (prev2.a || []).includes(c) && dmap.get(c)?.kind === 'posting')) want = 'PPC';
      }
      if (want && norm(nextOrig).toUpperCase() !== want) nx = want;
      if (nx !== nextOrig) changes.push({ cell: `${colName(lay.nextCol)}${r}`, name: person.name, date: nextDay, from: nextOrig.trim(), to: nx });
    }
    out.push(nx);
    lines.push(out.join('\t'));
  }
  const range = `${colName(lay.firstCol)}${first}:${colName(lay.nextCol)}${last}`;
  return { tsv: lines.join('\n'), range, first, last, topLeft: `${colName(lay.firstCol)}${first}`, changes, tab: lay.tab };
}
