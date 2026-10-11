// Logbook screen: every case, newest first (list) or by day (calendar). Search, filter, flags, edit; a grid view for bulk edits
// and pasting rows from Excel; Excel download and upload (round trip with a preview of the changes).

import { duplicates, fmtDate, diffRows, sortCodes, withParents, caseParts, caseText, dateWindow, nth, cleanInitials, procedureText, textHas, guessMapping, rowsFromGrid, IMPORT_FIELDS, caseFromRow } from './engine.js';
import { flagCase } from './importer.js';
import { exportCases, readSheetGrid } from './xlsxio.js';
import { parseCsv } from './tags.js';
import {
  S, h, toast, debounce, modal, cat, catName, catShort, tagName, catFull, catChip, PICKER_ORDER, settings, patchLogbook, needExcel, download, fileButton, catPills,
  updateCase, saveMany, deleteMany, displayName, rYear, todayISO, fill, add, resetters } from './ui-core.js';
import { editCaseDialog } from './ui-log.js';
import { reflectOnCase } from './ui-reflect.js';
import { moveToBin } from './bin.js';

const view = { q: '', cat: '', flag: '', mode: null, limit: 150, month: null, day: null };
resetters.push(() => Object.assign(view, { q: '', cat: '', flag: '', mode: null, limit: 150, month: null, day: null }));   // next user starts unfiltered
const MODES = [['list', 'List'], ['calendar', 'Calendar'], ['grid', 'Grid']];
// "2026-10-06" -> "Tue"
const weekday = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-GB', { weekday: 'short' }) : ''; };

// Procedure-name tags; a parent (e.g. 20) is left out when one of its sub-categories (20iii) is there.
function catTags(cats) {
  const codes = sortCodes(cats || []);
  const shown = codes.filter(c => !codes.some(o => o !== c && cat(o).parent === c));
  return h('span', { class: 'lb-tags' }, shown.map(c => h('span', { class: 'lb-tag', title: catFull(c) }, catName(c))));
}

export function renderLogbook() {
  const wrap = h('div');
  const list = h('div');
  const dupIds = new Set(duplicates(S.cases).flatMap(g => g.slice(1))); // the later copies
  const flagsOf = c => [...flagCase(c), ...(dupIds.has(c.id) ? ['duplicate'] : [])];

  const filtered = () => {
    // "last tuesday", "this week", "last month"… narrow by date; the other words search the text
    const win = dateWindow(view.q);
    const words = (win ? win.rest : view.q).toLowerCase().split(/\s+/).filter(Boolean);
    return S.cases.filter(c => {
      if (view.cat && !(c.cats || []).includes(view.cat)) return false;
      if (view.flag && !flagsOf(c).includes(view.flag)) return false;
      if (win && !(c.date && c.date >= win.from && c.date <= win.to)) return false;
      if (!words.length) return true;
      // Search in (Filter): everything, the initials only, or the procedure line only; fuzzy allows typos
      const scope = settings().lbScope || 'all', fuzzy = !!settings().lbFuzzy;
      const hay = (scope === 'initials' ? caseParts(c).initials
        : scope === 'procedure' ? procedureText(c)
        : `${caseText(c)} ${c.date || c.dateText || ''} ${weekday(c.date)} ${fmtDate(c.date) || ''} ${(c.cats || []).map(k => `${k} ${catName(k)} ${catShort(k)}`).join(' ')} ${(c.tags || []).map(tagName).join(' ')}`).toLowerCase();
      return words.every(w => textHas(hay, w, fuzzy && scope !== 'initials'));
    });
  };

  if (!view.mode) view.mode = MODES.some(([m]) => m === settings().logbookView) ? settings().logbookView : 'list';
  const paint = () => {
    const rows = filtered();
    fill(list, view.mode === 'grid' ? gridView(rows, paint) : view.mode === 'calendar' ? calendarView(rows, flagsOf, paint) : listView(rows, flagsOf, paint));
    counter.textContent = rows.length === S.cases.length ? `${S.cases.length} cases` : `${rows.length} of ${S.cases.length} cases`;
  };
  const paintSoon = debounce(() => { view.limit = 150; paint(); }, 150);

  const nFlag = f => S.cases.filter(c => flagsOf(c).includes(f)).length;
  const flagOpts = [['', 'All cases'], ['needsDate', `Needs a date (${nFlag('needsDate')})`], ['duplicate', `Possible duplicates (${nFlag('duplicate')})`], ['future', `Future date (${nFlag('future')})`]];
  const counter = h('span', { class: 'muted', style: 'font-size:13px' });

  // the two filters fold behind a Filter button (shown open while one is in use)
  const searchIn = h('select', { 'aria-label': 'Search in', onchange: e => { patchLogbook({ settings: { lbScope: e.target.value } }); paintFilterBtn(); paint(); } },
    [['all', 'Search everything'], ['initials', 'Search initials only'], ['procedure', 'Search the procedure only']].map(([v, t]) => h('option', { value: v, selected: (settings().lbScope || 'all') === v }, t)));
  const fuzzyBox = h('label', { class: 'check', style: 'margin:0' }, h('input', { type: 'checkbox', checked: !!settings().lbFuzzy, onchange: e => { patchLogbook({ settings: { lbFuzzy: e.target.checked } }); paintFilterBtn(); paint(); } }), 'Fuzzy search (allows typos)');
  const filters = h('div', { class: 'bar lb-filters', hidden: !(view.showFilters || view.cat || view.flag || (settings().lbScope || 'all') !== 'all' || settings().lbFuzzy) },
    h('select', { 'aria-label': 'Filter by category', onchange: e => { view.cat = e.target.value; paintFilterBtn(); paint(); } },
      h('option', { value: '' }, 'All categories'),
      PICKER_ORDER.map(c => h('option', { value: c.code, selected: view.cat === c.code }, `${c.parent ? '  ' : ''}${catName(c.code)} (${S.counts[c.code] || 0})`))),
    h('select', { 'aria-label': 'Filter by flag', onchange: e => { view.flag = e.target.value; paintFilterBtn(); paint(); } },
      flagOpts.map(([v, l]) => h('option', { value: v, selected: view.flag === v }, l))),
    searchIn, fuzzyBox);
  const filterBtn = h('button', { class: 'small', 'aria-expanded': String(!filters.hidden), onclick: () => {
    view.showFilters = filters.hidden; filters.hidden = !filters.hidden; filterBtn.setAttribute('aria-expanded', String(!filters.hidden));
  } });
  const paintFilterBtn = () => { const n = (view.cat ? 1 : 0) + (view.flag ? 1 : 0) + ((settings().lbScope || 'all') !== 'all' ? 1 : 0) + (settings().lbFuzzy ? 1 : 0); filterBtn.textContent = n ? `Filter (${n})` : 'Filter'; filterBtn.classList.toggle('primary', !!n); };
  paintFilterBtn();
  add(wrap, h('section', { class: 'card' },
    h('div', { class: 'bar' },
      h('input', { type: 'search', class: 'grow', placeholder: 'Search: initials, procedure, “last Tuesday”, “this week”', value: view.q, 'aria-label': 'Search cases', oninput: e => { view.q = e.target.value; paintSoon(); } }),
      filterBtn),
    filters,
    h('div', { class: 'bar', style: 'margin-bottom:0' },
      counter, h('span', { class: 'grow' }),
      h('div', { class: 'seg' }, MODES.map(([m, l]) =>
        h('button', { 'aria-pressed': String(view.mode === m), onclick: () => setMode(m) }, l))))),
  h('section', { class: 'card' }, list),
  excelCard());
  paint();
  return wrap;

  function setMode(m) {
    view.mode = m; view.limit = 150; paint();
    wrap.querySelectorAll('.seg button').forEach((b, i) => b.setAttribute('aria-pressed', String(MODES[i][0] === m)));
    if (settings().logbookView !== m) patchLogbook({ settings: { logbookView: m } });  // remembered per user
  }
}

// ---------- list ----------

// A month heading: tap it to jump to a date (the first case on or before it).
function monthHead(label, ul) {
  const input = h('input', { type: 'date', class: 'jump-date', 'aria-label': 'Jump to a date', max: todayISO(), onchange: e => {
    const d = e.target.value; if (!d) return;
    const row = [...ul.querySelectorAll('li[data-date]')].find(li => li.dataset.date && li.dataset.date <= d);
    if (!row) { toast('No cases on or before ' + fmtDate(d) + ' in this list'); return; }
    row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
  } });
  return h('li', { class: 'monthhead' }, h('span', {}, label), h('label', { class: 'jump', title: 'Jump to a date' }, '📅 Jump', input));
}

function listView(rows, flagsOf, repaint) {
  if (!S.cases.length) return h('div', { class: 'empty' }, h('p', {}, 'No cases yet.'), h('a', { class: 'btn primary', href: '#log' }, 'Log your first case'));
  if (!rows.length) return h('p', { class: 'empty' }, 'No cases match.');
  const ul = h('ul', { class: 'cases' });
  let month = '';
  for (const c of rows.slice(0, view.limit)) {
    const m = c.date ? fmtDate(c.date).replace(/^\d+ /, '') : 'No date';
    if (m !== month) { month = m; add(ul, monthHead(m, ul)); }
    add(ul, caseRow(c, flagsOf));
  }
  // month headers are sticky and not tappable
  ul.querySelectorAll('.monthhead').forEach(li => { li.style.cursor = 'default'; });
  const more = rows.length > view.limit
    ? h('div', { class: 'bar', style: 'justify-content:center;margin-top:12px' }, h('button', { onclick: () => { view.limit += 300; repaint(); } }, `Show more (${rows.length - view.limit} left)`))
    : null;
  return h('div', {}, ul, more);
}

// One case: date, details, procedure tags, flags. Tap to edit. Shared by the list and the calendar.
// Swipe a row: right to edit, left to delete (Undo in the toast). A short tap still opens it.
function swipeable(li, c) {
  let x0 = null, y0 = 0, dx = 0, swiping = false;
  li.addEventListener('touchstart', e => { const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; dx = 0; swiping = false; }, { passive: true });
  li.addEventListener('touchmove', e => {
    if (x0 == null) return;
    const t = e.touches[0]; dx = t.clientX - x0;
    if (!swiping && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(t.clientY - y0) * 1.5) swiping = true;
    if (swiping) { li.style.transform = `translateX(${dx}px)`; li.classList.toggle('swipe-del', dx < -40); li.classList.toggle('swipe-edit', dx > 40); }
  }, { passive: true });
  li.addEventListener('touchend', () => {
    if (swiping) {
      li.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
      if (dx < -90) { li.style.transform = 'translateX(-110%)'; moveToBin('case', c, { toast: true }).catch(err => toast('Could not delete: ' + err.message)); }
      else { li.style.transform = ''; if (dx > 90) editCaseDialog(c); }
      li.classList.remove('swipe-del', 'swipe-edit');
    }
    x0 = null; swiping = false;
  });
  return li;
}

function caseRow(c, flagsOf) {
  const flags = flagsOf(c);
  const p = caseParts(c);
  return swipeable(h('li', { 'data-date': c.date || '', onclick: () => editCaseDialog(c), tabindex: '0', onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) editCaseDialog(c); } },
      h('span', { class: 'd' }, c.date ? [h('span', { class: 'wd' }, weekday(c.date)), ' ', fmtDate(c.date).replace(/ \d{4}$/, '').replace(/^(\d+)/, (_, d) => nth(Number(d)))] : (c.dateText || '—')),
      h('span', { class: 't' }, p.initials ? [h('b', {}, p.initials), ' '] : null, p.details || (p.initials ? null : h('i', { class: 'muted' }, 'no details'))),
      h('span', { class: 'c' }, catTags(c.cats),
        flags.includes('needsDate') ? h('span', { class: 'flag err' }, 'needs date') : null,
        flags.includes('future') ? h('span', { class: 'flag' }, 'future date') : null,
        flags.includes('duplicate') ? h('span', { class: 'flag' }, 'possible duplicate') : null,
        !(c.cats || []).length ? h('span', { class: 'flag err' }, 'no category') : null,
        c.reflectTag && !(S.reflections || []).some(r => r.caseId === c.id) ? h('span', { class: 'flag', title: 'Tagged as a possible reflection' }, '☆ reflection?') : null,
        (c.tags || []).map(t => h('span', { class: 'flag sc-tag', title: 'Your tag' }, tagName(t))),
        h('button', { class: 'small', style: 'margin-left:auto', title: 'Write a reflection on this case', onclick: e => { e.stopPropagation(); reflectOnCase(c); } },
          (S.reflections || []).some(r => r.caseId === c.id) ? 'Reflection' : 'Reflect'))), c);
}

// ---------- calendar ----------

const pad = n => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function calendarView(rows, flagsOf, repaint) {
  if (!S.cases.length) return h('div', { class: 'empty' }, h('p', {}, 'No cases yet.'), h('a', { class: 'btn primary', href: '#log' }, 'Log your first case'));
  const today = todayISO();
  if (!view.month) view.month = today.slice(0, 7);
  const [y, m] = view.month.split('-').map(Number);
  const byDay = new Map();
  const undated = [];
  for (const c of rows) {
    if (!c.date) { undated.push(c); continue; }
    if (!byDay.has(c.date)) byDay.set(c.date, []);
    byDay.get(c.date).push(c);
  }
  const shift = d => { const t = new Date(y, m - 1 + d, 1); view.month = `${t.getFullYear()}-${pad(t.getMonth() + 1)}`; view.day = null; repaint(); };
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;           // Monday first
  const days = new Date(y, m, 0).getDate();
  const grid = h('div', { class: 'lb-cal', role: 'grid' }, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => h('div', { class: 'lb-dow' }, d)));
  for (let i = 0; i < lead; i++) add(grid, h('div', { class: 'lb-day blank' }));
  let monthN = 0;
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    const cs = byDay.get(iso) || [];
    monthN += cs.length;
    const flagged = cs.some(c => flagsOf(c).length);
    const tint = cs.length ? Math.min(4, cs.length) : 0;
    add(grid, h('button', {
      class: `lb-day t${tint} ${iso === today ? 'today' : ''} ${iso === view.day ? 'sel' : ''}`,
      'aria-label': `${d} ${MONTHS[m - 1]}: ${cs.length} case${cs.length === 1 ? '' : 's'}`, 'aria-pressed': String(iso === view.day),
      onclick: () => { view.day = view.day === iso ? null : iso; repaint(); },
    }, h('span', { class: 'n' }, d), cs.length ? h('span', { class: 'lb-count' }, cs.length) : null, flagged ? h('i', { class: 'lb-dot', title: 'Has a flagged case' }) : null));
  }
  const dayCases = view.day ? (byDay.get(view.day) || []) : [];
  return h('div', {},
    h('div', { class: 'bar lb-calbar' },
      h('button', { class: 'small icon-btn', 'aria-label': 'Previous month', onclick: () => shift(-1) }, '‹'),
      h('strong', { class: 'grow', style: 'text-align:center' }, `${MONTHS[m - 1]} ${y}`, h('span', { class: 'muted', style: 'font-weight:400;font-size:13px' }, ` · ${monthN} case${monthN === 1 ? '' : 's'}`)),
      h('button', { class: 'small icon-btn', 'aria-label': 'Next month', onclick: () => shift(1) }, '›'),
      h('button', { class: 'small', onclick: () => { view.month = today.slice(0, 7); view.day = today; repaint(); } }, 'Today')),
    grid,
    view.day ? h('div', { style: 'margin-top:12px' },
      h('h3', {}, `${fmtDate(view.day)} (${dayCases.length})`),
      dayCases.length ? h('ul', { class: 'cases' }, dayCases.map(c => caseRow(c, flagsOf))) : h('p', { class: 'empty' }, 'No cases on this day.'))
      : h('p', { class: 'hint', style: 'margin-top:10px' }, 'Tap a day to see its cases.'),
    undated.length ? h('details', { style: 'margin-top:12px' },
      h('summary', {}, `No date (${undated.length})`),
      h('ul', { class: 'cases' }, undated.map(c => caseRow(c, flagsOf)))) : null);
}

// ---------- grid ----------

const catText = cats => sortCodes(cats || []).join(', ');

function gridView(rows, repaint) {
  const tbody = h('tbody');
  for (const c of rows.slice(0, view.limit)) {
    const p = caseParts(c);
    // dates come from a date picker and categories from the case's edit dialog: nothing free-text gets in
    const row = { date: c.date || '', initials: p.initials, details: p.details };
    const tr = h('tr');
    const commit = async () => {
      const initials = cleanInitials(row.initials), details = String(row.details || '').trim();
      const date = /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : null;
      tr.classList.remove('dirty');
      if ((c.date || null) === date && p.initials === initials && p.details === details) return;
      const next = { ...c, date, initials, details };
      if (date) delete next.dateText;
      Object.assign(c, await updateCase(next));
      Object.assign(p, { initials, details });
    };
    const cell = (key, attrs = {}) => h('input', { ...attrs, value: row[key], oninput: e => { row[key] = e.target.value; tr.classList.add('dirty'); }, onchange: commit });
    add(tr, 
      h('td', { class: 'date' }, cell('date', { type: 'date', 'aria-label': 'Date', title: c.dateText && !c.date ? `Was written as “${c.dateText}”: pick the date` : '' })),
      h('td', { class: 'ini' }, cell('initials', { 'aria-label': 'Initials', placeholder: 'AB', autocapitalize: 'characters', size: '5' })),
      h('td', {}, cell('details', { 'aria-label': 'Details' })),
      h('td', { class: 'cats' }, h('button', { type: 'button', class: 'grid-cats', 'aria-label': 'Categories: change', onclick: () => editCaseDialog(c) },
        (c.cats || []).length ? catPills(c.cats) : h('span', { class: 'flag err' }, 'no category'))));
    add(tbody, tr);
  }
  const more = rows.length > view.limit ? h('button', { onclick: () => { view.limit += 300; repaint(); } }, `Show more (${rows.length - view.limit} left)`) : null;
  return h('div', {},
    h('p', { class: 'hint' }, 'Edit the date, initials and details directly; changes save when you leave a cell. Tap the categories to change them.'),
    h('div', { class: 'scroll' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Initials'), h('th', {}, 'Case details'), h('th', {}, 'Categories'))), tbody)),
    more,
    pasteRows());
}

// Rows copied from Excel arrive as tab-separated lines: Date, Case details, Categories (initials are split
// off the front of the details), or Date, Initials, Case details, Categories when there are four columns.
function pasteRows() {
  const ta = h('textarea', { rows: '4', placeholder: 'Paste rows from Excel here: Date ⇥ Case details ⇥ Categories (or Date ⇥ Initials ⇥ Case details ⇥ Categories)' });
  return h('div', { style: 'margin-top:16px' },
    h('h3', {}, 'Add rows from a spreadsheet'), ta,
    h('div', { class: 'bar', style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: () => {
      const rows = ta.value.split(/\r?\n/).filter(l => l.trim()).map((l, i) => {
        const cols = l.split('\t');
        // four columns with a short letters-only second one: Date, Initials, Details, Categories (a copied export's
        // fourth column is the hidden id, not initials)
        const four = cols.length >= 4 && /^[A-Za-z.\-]{0,6}$/.test(cols[1].trim());
        const [date, initials, details, categories] = four ? cols : [cols[0], undefined, cols[1], cols[2]];
        const r = { row: i + 1, date: (date || '').trim(), details: (details || '').trim(), categories: (categories || '').trim() };
        if (initials !== undefined) r.initials = initials.trim();
        return r;
      }).filter(r => !/^date$/i.test(r.date));
      if (!rows.length) return toast('Nothing to add');
      const d = diffRows(S.cases, rows);
      previewDiff({ ...d, deleted: [] }, () => { ta.value = ''; });
    } }, 'Add rows')));
}

// ---------- Excel ----------

function excelCard() {
  return h('details', { class: 'card more-tools' }, h('summary', {}, 'More tools: Excel download, Excel/CSV upload'),
    h('p', { class: 'hint' }, 'Download your logbook as a spreadsheet, edit it on a computer, then upload it back. You will see what changes before anything is saved.'),
    h('div', { class: 'bar', style: 'margin-bottom:0' },
      h('button', { onclick: downloadExcel }, 'Download Excel'),
      fileButton('Upload Excel/CSV logbook', '.xlsx,.csv,text/csv', uploadExcel)));
}

export async function downloadExcel() {
  try {
    await needExcel();
    const blob = await exportCases(S.cases, { name: displayName(), counts: S.counts, rYear: rYear() });
    download(`logbook-${todayISO()}.xlsx`, blob);
  } catch (err) { toast('Could not export: ' + err.message); }
}

// Upload a logbook from Excel (.xlsx) or a CSV file: match the file's columns to the case fields
// (guessed from the headers, or the names remembered from last time), see the first rows as they
// will be read, then review what changes before anything is saved.
async function uploadExcel(file) {
  let grid;
  try {
    if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
      grid = { sheets: [{ name: file.name, rows: parseCsv(await file.text()) }], exportedAt: null };
    } else {
      await needExcel();
      grid = await readSheetGrid(file);
    }
  } catch (err) { return toast('Could not read the file: ' + err.message); }
  if (!grid.sheets.length) return toast('That file has no rows');
  mapColumns(file.name, grid);
}

function mapColumns(fileName, grid) {
  const st = { sheet: 0, headerRow: true, monthFirst: false, map: null };
  const saved = settings().importMap || null;
  const rowsOf = () => grid.sheets[st.sheet].rows;
  const colName = i => { let n = '', k = i + 1; while (k) { k--; n = String.fromCharCode(65 + (k % 26)) + n; k = Math.floor(k / 26); } return n; };
  const cellShow = v => (v instanceof Date ? fmtDate(todayISO(v)) : String(v ?? '')).slice(0, 30);
  const guess = () => { st.map = guessMapping(st.headerRow ? rowsOf()[0] || [] : [], saved); };
  guess();
  const body = h('div');
  const paint = () => {
    const rows = rowsOf(), width = Math.max(0, ...rows.slice(0, 50).map(r => r.length));
    const head = st.headerRow ? rows[0] || [] : [];
    const sample = rows[st.headerRow ? 1 : 0] || [];
    const cols = Array.from({ length: width }, (_, i) => i);
    const sel = f => h('select', { 'aria-label': f.name, onchange: e => { st.map[f.k] = Number(e.target.value); paint(); } },
      h('option', { value: '-1', selected: st.map[f.k] < 0 }, '— not in the file —'),
      cols.map(i => h('option', { value: String(i), selected: st.map[f.k] === i }, `${colName(i)}${head[i] ? ': ' + String(head[i]).slice(0, 30) : ''}${sample[i] !== undefined && String(sample[i]).trim() ? ` (e.g. ${cellShow(sample[i])})` : ''}`)));
    // the first rows as they'll be read
    const parsed = rowsFromGrid(rows.slice(0, (st.headerRow ? 1 : 0) + 8), st.map, { headerRow: st.headerRow, monthFirst: st.monthFirst }).map(r => ({ r, c: caseFromRow(r) }));
    const ok = st.map.details >= 0 || st.map.date >= 0;
    fill(body,
      grid.sheets.length > 1 ? h('label', { class: 'field' }, 'Sheet', h('select', { onchange: e => { st.sheet = Number(e.target.value); guess(); paint(); } },
        grid.sheets.map((sh, i) => h('option', { value: String(i), selected: st.sheet === i }, sh.name)))) : null,
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.headerRow, onchange: e => { st.headerRow = e.target.checked; guess(); paint(); } }), 'The first row holds the column names'),
      h('div', { class: 'map-grid' }, IMPORT_FIELDS.map(f => h('label', { class: 'field' }, f.name, sel(f)))),
      st.map.initials < 0 ? h('p', { class: 'hint', style: 'margin:0 0 6px' }, 'No Initials column: initials at the start of the case details are split off.') : null,
      h('label', { class: 'field' }, 'Dates are written', h('select', { onchange: e => { st.monthFirst = e.target.value === 'mdy'; paint(); } },
        h('option', { value: 'dmy', selected: !st.monthFirst }, 'Day first (13/3/2026)'), h('option', { value: 'mdy', selected: st.monthFirst }, 'Month first (3/13/2026)'))),
      h('div', { class: 'chiplabel' }, 'How the first rows will be read'),
      h('div', { class: 'scroll' }, h('table', { class: 'map-preview' },
        h('thead', {}, h('tr', {}, ['Row', 'Date', 'Initials', 'Details', 'Categories'].map(t => h('th', {}, t)))),
        h('tbody', {}, parsed.map(({ r, c }) => h('tr', {},
          h('td', { class: 'muted' }, String(r.row)),
          h('td', { class: !c.date && c.dateText ? 'bad' : '' }, c.date ? fmtDate(c.date) : c.dateText ? `“${c.dateText}” ✗` : '—'),
          h('td', {}, c.initials || ''),
          h('td', {}, String(c.details || '').slice(0, 60)),
          h('td', { class: c.unknown.length ? 'bad' : '' }, [catPills(c.cats), c.unknown.length ? ` ✗ ${c.unknown.join(', ')}` : ''].join('')))))))),
      ok ? null : h('p', { class: 'tip' }, 'Choose at least the Date or the Case details column.'));
    reviewBtn.disabled = !ok;
  };
  const reviewBtn = h('button', { class: 'primary', onclick: () => {
    const rows = rowsFromGrid(rowsOf(), st.map, { headerRow: st.headerRow, monthFirst: st.monthFirst });
    // remember the column names for next time
    const head = st.headerRow ? rowsOf()[0] || [] : [];
    if (st.headerRow) patchLogbook({ settings: { importMap: Object.fromEntries(IMPORT_FIELDS.map(f => [f.k, st.map[f.k] >= 0 ? String(head[st.map[f.k]] ?? '') : ''])) } });
    m.close();
    const d = diffRows(S.cases, rows);
    // cases logged or edited after an exported file was downloaded are not in it: never delete those
    if (grid.exportedAt) {
      const newer = d.deleted.filter(c => Math.max(c.updatedAt || 0, c.createdAt || 0) > grid.exportedAt);
      d.deleted = d.deleted.filter(c => !newer.includes(c));
      const edited = d.changed.filter(x => (x.before.updatedAt || 0) > grid.exportedAt);
      d.changed = d.changed.filter(x => !edited.includes(x));
      d.kept = [...newer, ...edited.map(x => x.before)];
    }
    previewDiff(d);
  } }, 'Review changes');
  const m = modal('Upload logbook: match the columns', [
    h('p', { class: 'hint' }, `${fileName}. Pick which column holds each field. Nothing is saved until you review the changes and tap Apply.`),
    body,
    h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { class: 'grow' }), h('button', { onclick: () => m.close() }, 'Cancel'), reviewBtn)], { sticky: true });
  paint();
}

const caseKey = c => `${c.date || c.dateText || ''}|${caseText(c).toLowerCase().replace(/\s+/g, ' ')}|${catText(c.cats)}`;

function previewDiff(d, after) {
  const { changed, deleted, errors } = d;
  // rows without an id (e.g. copied into a new sheet) that match a case already logged are not added twice
  const have = new Set(S.cases.map(caseKey));
  const already = d.added.filter(c => have.has(caseKey(c)));
  const added = d.added.filter(c => !have.has(caseKey(c))).map(c => ({ ...c, cats: sortCodes(withParents(c.cats || [])) }));
  for (const x of changed) x.after = { ...x.after, cats: sortCodes(withParents(x.after.cats || [])) };
  const nothing = !added.length && !changed.length && !deleted.length;
  const line = c => `${c.date ? fmtDate(c.date) : (c.dateText || 'no date')} · ${caseText(c).slice(0, 60)} · ${catPills(c.cats)}`;
  const section = (title, items, fmt, cls) => items.length ? h('details', { open: items.length <= 5 },
    h('summary', {}, `${title} (${items.length})`),
    h('ul', { class: 'warnings' }, items.slice(0, 200).map(x => h('li', { class: cls }, fmt(x))))) : null;
  const m = modal('Review changes', [
    h('p', {}, nothing ? 'No changes found.' : `${changed.length} changed, ${added.length} new, ${deleted.length} deleted.`),
    section('Errors (not applied)', errors, e => `Row ${e.row}: ${e.message}`, 'error'),
    section('Changed', changed, x => `${line(x.before)} → ${line(x.after)}`, 'info'),
    section('New', added, line, 'ok'),
    section('Already in your logbook (skipped)', already, line, 'info'),
    deleted.length ? h('p', { class: 'tip' }, `${deleted.length} case${deleted.length === 1 ? ' is' : 's are'} missing from the sheet and will be deleted. Check the list below before you apply.`) : null,
    section('Deleted (not in the sheet)', deleted, line, 'warn'),
    section('Kept (logged or edited after this file was downloaded)', d.kept || [], line, 'info'),
    h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Cancel'),
      nothing ? null : h('button', { class: 'primary', onclick: async () => {
        m.close();
        try {
          const writes = [...changed.map(x => x.after), ...added];
          if (writes.length) await saveMany(writes);
          if (deleted.length) await moveToBin('case', deleted);   // recycle bin (bin agent): restorable for 30 days
          toast(`Applied: ${changed.length} changed, ${added.length} new, ${deleted.length} deleted${deleted.length ? ' (in the recycle bin for 30 days)' : ''}`);
          after && after();
        } catch (err) { toast('Could not apply: ' + err.message); }
      } }, 'Apply')),
  ]);
}

