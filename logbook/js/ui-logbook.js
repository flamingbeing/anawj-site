// Logbook screen: every case, newest first (list) or by day (calendar). Search, filter, flags, edit; a grid view for bulk edits
// and pasting rows from Excel; Excel download and upload (round trip with a preview of the changes).

import { duplicates, fmtDate, caseFromRow, diffRows, sortCodes, withParents } from './engine.js';
import { flagCase } from './importer.js';
import { exportCases, readCasesSheet } from './xlsxio.js';
import {
  S, h, toast, debounce, modal, cat, catFull, catChip, PICKER_ORDER, settings, patchLogbook, needExcel, download, fileButton,
  updateCase, saveMany, deleteMany, displayName, rYear, todayISO, fill, add } from './ui-core.js';
import { editCaseDialog } from './ui-log.js';
import { reflectOnCase } from './ui-reflect.js';
import { moveToBin } from './bin.js';

const view = { q: '', cat: '', flag: '', mode: null, limit: 150, month: null, day: null };
const MODES = [['list', 'List'], ['calendar', 'Calendar'], ['grid', 'Grid']];

// Procedure-name tags; a parent (e.g. 20) is left out when one of its sub-categories (20iii) is there.
function catTags(cats) {
  const codes = sortCodes(cats || []);
  const shown = codes.filter(c => !codes.some(o => o !== c && cat(o).parent === c));
  return h('span', { class: 'lb-tags' }, shown.map(c => h('span', { class: 'lb-tag', title: catFull(c) }, catFull(c))));
}

export function renderLogbook() {
  const wrap = h('div');
  const list = h('div');
  const dupIds = new Set(duplicates(S.cases).flatMap(g => g.slice(1))); // the later copies
  const flagsOf = c => [...flagCase(c), ...(dupIds.has(c.id) ? ['duplicate'] : [])];

  const filtered = () => {
    const words = view.q.toLowerCase().split(/\s+/).filter(Boolean);
    return S.cases.filter(c => {
      if (view.cat && !(c.cats || []).includes(view.cat)) return false;
      if (view.flag && !flagsOf(c).includes(view.flag)) return false;
      if (!words.length) return true;
      const hay = `${c.details} ${c.date || c.dateText || ''} ${fmtDate(c.date) || ''} ${(c.cats || []).join(' ')}`.toLowerCase();
      return words.every(w => hay.includes(w));
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

  add(wrap, h('section', { class: 'card' },
    h('div', { class: 'bar' },
      h('input', { type: 'search', class: 'grow', placeholder: 'Search details, dates, codes', value: view.q, 'aria-label': 'Search cases', oninput: e => { view.q = e.target.value; paintSoon(); } }),
      h('select', { 'aria-label': 'Filter by category', onchange: e => { view.cat = e.target.value; paint(); } },
        h('option', { value: '' }, 'All categories'),
        PICKER_ORDER.map(c => h('option', { value: c.code, selected: view.cat === c.code }, `${c.parent ? '  ' : ''}${c.code} ${c.name} (${S.counts[c.code] || 0})`))),
      h('select', { 'aria-label': 'Filter by flag', onchange: e => { view.flag = e.target.value; paint(); } },
        flagOpts.map(([v, l]) => h('option', { value: v, selected: view.flag === v }, l)))),
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

function listView(rows, flagsOf, repaint) {
  if (!S.cases.length) return h('p', { class: 'empty' }, 'No cases yet. Log your first one on the Log tab.');
  if (!rows.length) return h('p', { class: 'empty' }, 'No cases match.');
  const ul = h('ul', { class: 'cases' });
  let month = '';
  for (const c of rows.slice(0, view.limit)) {
    const m = c.date ? fmtDate(c.date).replace(/^\d+ /, '') : 'No date';
    if (m !== month) { month = m; add(ul, h('li', { class: 'monthhead', onclick: null }, m)); }
    add(ul, caseRow(c, flagsOf));
  }
  // month headers are sticky and not tappable
  ul.querySelectorAll('.monthhead').forEach(li => { li.style.display = 'block'; li.style.cursor = 'default'; });
  const more = rows.length > view.limit
    ? h('div', { class: 'bar', style: 'justify-content:center;margin-top:12px' }, h('button', { onclick: () => { view.limit += 300; repaint(); } }, `Show more (${rows.length - view.limit} left)`))
    : null;
  return h('div', {}, ul, more);
}

// One case: date, details, procedure tags, flags. Tap to edit. Shared by the list and the calendar.
function caseRow(c, flagsOf) {
  const flags = flagsOf(c);
  return h('li', { onclick: () => editCaseDialog(c), tabindex: '0', onkeydown: e => { if (e.key === 'Enter') editCaseDialog(c); } },
      h('span', { class: 'd' }, c.date ? fmtDate(c.date).replace(/ \d{4}$/, '') : (c.dateText || '—')),
      h('span', { class: 't' }, c.details || h('i', { class: 'muted' }, 'no details')),
      h('span', { class: 'c' }, catTags(c.cats),
        flags.includes('needsDate') ? h('span', { class: 'flag err' }, 'needs date') : null,
        flags.includes('future') ? h('span', { class: 'flag' }, 'future date') : null,
        flags.includes('duplicate') ? h('span', { class: 'flag' }, 'possible duplicate') : null,
        !(c.cats || []).length ? h('span', { class: 'flag err' }, 'no category') : null,
        h('button', { class: 'small', style: 'margin-left:auto', title: 'Write a reflection on this case', onclick: e => { e.stopPropagation(); reflectOnCase(c); } },
          (S.reflections || []).some(r => r.caseId === c.id) ? 'Reflection' : 'Reflect')));
}

// ---------- calendar ----------

const pad = n => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function calendarView(rows, flagsOf, repaint) {
  if (!S.cases.length) return h('p', { class: 'empty' }, 'No cases yet. Log your first one on the Log tab.');
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
      h('button', { class: 'small', 'aria-label': 'Previous month', onclick: () => shift(-1) }, '‹'),
      h('strong', { class: 'grow', style: 'text-align:center' }, `${MONTHS[m - 1]} ${y}`, h('span', { class: 'muted', style: 'font-weight:400;font-size:13px' }, ` · ${monthN} case${monthN === 1 ? '' : 's'}`)),
      h('button', { class: 'small', 'aria-label': 'Next month', onclick: () => shift(1) }, '›'),
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
    const row = { id: c.id, date: c.date || c.dateText || '', details: c.details || '', categories: catText(c.cats) };
    const tr = h('tr');
    const commit = async () => {
      const parsed = caseFromRow(row);
      if (parsed.unknown.length) { toast('Unknown categor' + (parsed.unknown.length > 1 ? 'ies: ' : 'y: ') + parsed.unknown.join(', ')); tr.classList.add('dirty'); return; }
      // a typed date that can't be read (e.g. month first) is not saved as "no date"
      if (!parsed.date && String(row.date).trim() && String(row.date).trim() !== (c.dateText || '')) {
        toast(`Could not read the date “${row.date}” — use day/month/year, e.g. 13/3/2026`); tr.classList.add('dirty'); return;
      }
      parsed.cats = sortCodes(withParents(parsed.cats));   // as in the Log picker: 26i also counts for 26
      const same = (c.date || '') === (parsed.date || '') && (c.details || '') === parsed.details && catText(c.cats) === catText(parsed.cats)
        && (parsed.date || (c.dateText || '') === (parsed.dateText || ''));
      tr.classList.remove('dirty');
      if (same) return;
      const next = { ...c, date: parsed.date, details: parsed.details, cats: parsed.cats };
      if (!parsed.date && parsed.dateText) next.dateText = parsed.dateText;
      Object.assign(c, await updateCase(next));
    };
    const cell = (key, attrs = {}) => h('input', { ...attrs, value: row[key], oninput: e => { row[key] = e.target.value; tr.classList.add('dirty'); }, onchange: commit });
    add(tr, 
      h('td', { class: 'date' }, cell('date', { 'aria-label': 'Date', placeholder: 'd/m/yyyy' })),
      h('td', {}, cell('details', { 'aria-label': 'Details' })),
      h('td', { class: 'cats' }, cell('categories', { 'aria-label': 'Categories', placeholder: '16, 17' })));
    add(tbody, tr);
  }
  const more = rows.length > view.limit ? h('button', { onclick: () => { view.limit += 300; repaint(); } }, `Show more (${rows.length - view.limit} left)`) : null;
  return h('div', {},
    h('p', { class: 'hint' }, 'Edit cells directly; changes save when you leave a cell. Dates as 12/3/2026; categories as codes (16, 17) or names.'),
    h('div', { class: 'scroll' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Case details'), h('th', {}, 'Categories'))), tbody)),
    more,
    pasteRows());
}

// Rows copied from Excel arrive as tab-separated lines: Date, Case details, Categories.
function pasteRows() {
  const ta = h('textarea', { rows: '4', placeholder: 'Paste rows from Excel here: Date ⇥ Case details ⇥ Categories' });
  return h('div', { style: 'margin-top:16px' },
    h('h3', {}, 'Add rows from a spreadsheet'), ta,
    h('div', { class: 'bar', style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: () => {
      const rows = ta.value.split(/\r?\n/).filter(l => l.trim()).map((l, i) => {
        const [date, details, categories] = l.split('\t');
        return { row: i + 1, date: (date || '').trim(), details: (details || '').trim(), categories: (categories || '').trim() };
      }).filter(r => !/^date$/i.test(r.date));
      if (!rows.length) return toast('Nothing to add');
      const d = diffRows(S.cases, rows);
      previewDiff({ ...d, deleted: [] }, () => { ta.value = ''; });
    } }, 'Add rows')));
}

// ---------- Excel ----------

function excelCard() {
  return h('section', { class: 'card' },
    h('h2', {}, 'Excel'),
    h('p', { class: 'hint' }, 'Download your logbook as a spreadsheet, edit it on a computer, then upload it back. You will see what changes before anything is saved.'),
    h('div', { class: 'bar', style: 'margin-bottom:0' },
      h('button', { onclick: downloadExcel }, 'Download Excel'),
      fileButton('Upload Excel', '.xlsx', uploadExcel)));
}

async function downloadExcel() {
  try {
    await needExcel();
    const blob = await exportCases(S.cases, { name: displayName(), counts: S.counts, rYear: rYear() });
    download(`logbook-${todayISO()}.xlsx`, blob);
  } catch (err) { toast('Could not export: ' + err.message); }
}

async function uploadExcel(file) {
  try {
    await needExcel();
    const rows = await readCasesSheet(file);
    const d = diffRows(S.cases, rows);
    // cases logged or edited after the file was downloaded are not in it: never delete those
    if (rows.exportedAt) {
      const newer = d.deleted.filter(c => Math.max(c.updatedAt || 0, c.createdAt || 0) > rows.exportedAt);
      d.deleted = d.deleted.filter(c => !newer.includes(c));
      d.kept = newer;
    }
    previewDiff(d);
  } catch (err) { toast('Could not read the file: ' + err.message); }
}

const caseKey = c => `${c.date || c.dateText || ''}|${(c.details || '').trim().toLowerCase()}|${catText(c.cats)}`;

function previewDiff(d, after) {
  const { changed, deleted, errors } = d;
  // rows without an id (e.g. copied into a new sheet) that match a case already logged are not added twice
  const have = new Set(S.cases.map(caseKey));
  const already = d.added.filter(c => have.has(caseKey(c)));
  const added = d.added.filter(c => !have.has(caseKey(c))).map(c => ({ ...c, cats: sortCodes(withParents(c.cats || [])) }));
  for (const x of changed) x.after = { ...x.after, cats: sortCodes(withParents(x.after.cats || [])) };
  const nothing = !added.length && !changed.length && !deleted.length;
  const line = c => `${c.date ? fmtDate(c.date) : (c.dateText || 'no date')} · ${(c.details || '').slice(0, 60)} · ${catText(c.cats)}`;
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
    section('Kept (logged after this file was downloaded)', d.kept || [], line, 'info'),
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

