// Logbook screen: every case, newest first (list) or by day (calendar). Search, filter, flags, edit; a grid view for bulk edits
// and pasting rows from Excel; Excel download and upload (round trip with a preview of the changes).

import { duplicates, fmtDate, caseFromRow, diffRows, sortCodes, withParents, caseParts, caseText, dateWindow } from './engine.js';
import { flagCase } from './importer.js';
import { exportCases, readCasesSheet } from './xlsxio.js';
import {
  S, h, toast, debounce, modal, cat, catFull, catChip, PICKER_ORDER, settings, patchLogbook, needExcel, download, fileButton,
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
  return h('span', { class: 'lb-tags' }, shown.map(c => h('span', { class: 'lb-tag', title: catFull(c) }, catFull(c))));
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
      const hay = `${caseText(c)} ${c.date || c.dateText || ''} ${weekday(c.date)} ${fmtDate(c.date) || ''} ${(c.cats || []).join(' ')} ${(c.tags || []).join(' ')}`.toLowerCase();
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

  // the two filters fold behind a Filter button (shown open while one is in use)
  const filters = h('div', { class: 'bar lb-filters', hidden: !(view.showFilters || view.cat || view.flag) },
    h('select', { 'aria-label': 'Filter by category', onchange: e => { view.cat = e.target.value; paintFilterBtn(); paint(); } },
      h('option', { value: '' }, 'All categories'),
      PICKER_ORDER.map(c => h('option', { value: c.code, selected: view.cat === c.code }, `${c.parent ? '  ' : ''}${c.code} ${c.name} (${S.counts[c.code] || 0})`))),
    h('select', { 'aria-label': 'Filter by flag', onchange: e => { view.flag = e.target.value; paintFilterBtn(); paint(); } },
      flagOpts.map(([v, l]) => h('option', { value: v, selected: view.flag === v }, l))));
  const filterBtn = h('button', { class: 'small', 'aria-expanded': String(!filters.hidden), onclick: () => {
    view.showFilters = filters.hidden; filters.hidden = !filters.hidden; filterBtn.setAttribute('aria-expanded', String(!filters.hidden));
  } });
  const paintFilterBtn = () => { const n = (view.cat ? 1 : 0) + (view.flag ? 1 : 0); filterBtn.textContent = n ? `Filter (${n})` : 'Filter'; filterBtn.classList.toggle('primary', !!n); };
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
      h('span', { class: 'd' }, c.date ? [h('span', { class: 'wd' }, weekday(c.date)), ' ', fmtDate(c.date).replace(/ \d{4}$/, '')] : (c.dateText || '—')),
      h('span', { class: 't' }, p.initials ? [h('b', {}, p.initials), ' '] : null, p.details || (p.initials ? null : h('i', { class: 'muted' }, 'no details'))),
      h('span', { class: 'c' }, catTags(c.cats),
        flags.includes('needsDate') ? h('span', { class: 'flag err' }, 'needs date') : null,
        flags.includes('future') ? h('span', { class: 'flag' }, 'future date') : null,
        flags.includes('duplicate') ? h('span', { class: 'flag' }, 'possible duplicate') : null,
        !(c.cats || []).length ? h('span', { class: 'flag err' }, 'no category') : null,
        c.reflectTag && !(S.reflections || []).some(r => r.caseId === c.id) ? h('span', { class: 'flag', title: 'Tagged as a possible reflection' }, '☆ reflection?') : null,
        (c.tags || []).map(t => h('span', { class: 'flag sc-tag', title: 'Your subcategory' }, t.split(':').slice(1).join(':'))),
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
    const row = { id: c.id, date: c.date || c.dateText || '', initials: p.initials, details: p.details, categories: catText(c.cats) };
    const tr = h('tr');
    const commit = async () => {
      const parsed = caseFromRow(row);
      if (parsed.unknown.length) { toast('Unknown categor' + (parsed.unknown.length > 1 ? 'ies: ' : 'y: ') + parsed.unknown.join(', ')); tr.classList.add('dirty'); return; }
      // a typed date that can't be read (e.g. month first) is not saved as "no date"
      if (!parsed.date && String(row.date).trim() && String(row.date).trim() !== (c.dateText || '')) {
        toast(`Could not read the date “${row.date}” — use day/month/year, e.g. 13/3/2026`); tr.classList.add('dirty'); return;
      }
      parsed.cats = sortCodes(withParents(parsed.cats));   // as in the Log picker: 26i also counts for 26
      const same = (c.date || '') === (parsed.date || '') && p.initials === parsed.initials && p.details === parsed.details && catText(c.cats) === catText(parsed.cats)
        && (parsed.date || (c.dateText || '') === (parsed.dateText || ''));
      tr.classList.remove('dirty');
      if (same) return;
      const next = { ...c, date: parsed.date, initials: parsed.initials, details: parsed.details, cats: parsed.cats };
      if (!parsed.date && parsed.dateText) next.dateText = parsed.dateText;
      Object.assign(c, await updateCase(next));
      Object.assign(p, { initials: parsed.initials, details: parsed.details });
    };
    const cell = (key, attrs = {}) => h('input', { ...attrs, value: row[key], oninput: e => { row[key] = e.target.value; tr.classList.add('dirty'); }, onchange: commit });
    add(tr, 
      h('td', { class: 'date' }, cell('date', { 'aria-label': 'Date', placeholder: 'd/m/yyyy' })),
      h('td', { class: 'ini' }, cell('initials', { 'aria-label': 'Initials', placeholder: 'AB', autocapitalize: 'characters', size: '5' })),
      h('td', {}, cell('details', { 'aria-label': 'Details' })),
      h('td', { class: 'cats' }, cell('categories', { 'aria-label': 'Categories', placeholder: '16, 17' })));
    add(tbody, tr);
  }
  const more = rows.length > view.limit ? h('button', { onclick: () => { view.limit += 300; repaint(); } }, `Show more (${rows.length - view.limit} left)`) : null;
  return h('div', {},
    h('p', { class: 'hint' }, 'Edit cells directly; changes save when you leave a cell. Dates as 12/3/2026; categories as codes (16, 17) or names.'),
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
  return h('details', { class: 'card more-tools' }, h('summary', {}, 'More tools: Excel download and upload'),
    h('p', { class: 'hint' }, 'Download your logbook as a spreadsheet, edit it on a computer, then upload it back. You will see what changes before anything is saved.'),
    h('div', { class: 'bar', style: 'margin-bottom:0' },
      h('button', { onclick: downloadExcel }, 'Download Excel'),
      fileButton('Upload Excel', '.xlsx', uploadExcel)));
}

export async function downloadExcel() {
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
      // a case edited on the phone after the download: the sheet holds the older text, so keep the edit
      const edited = d.changed.filter(x => (x.before.updatedAt || 0) > rows.exportedAt);
      d.changed = d.changed.filter(x => !edited.includes(x));
      d.kept = [...newer, ...edited.map(x => x.before)];
    }
    previewDiff(d);
  } catch (err) { toast('Could not read the file: ' + err.message); }
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
  const line = c => `${c.date ? fmtDate(c.date) : (c.dateText || 'no date')} · ${caseText(c).slice(0, 60)} · ${catText(c.cats)}`;
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

