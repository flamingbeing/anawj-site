// Logbook screen: every case, newest first (list) or by day (calendar). Search, filter, flags, edit; a grid view for bulk edits
// and pasting rows from Excel; Excel download and upload (round trip with a preview of the changes).

import { duplicates, fmtDate, diffRows, sortCodes, withParents, caseParts, caseText, dateWindow, nth, cleanInitials, procedureText, textHas, guessMapping, rowsFromGrid, IMPORT_FIELDS, caseFromRow, weekLead, weekdayNames, finalTarget } from './engine.js';
import { flagCase } from './importer.js';
import { exportWorkbook, readSheetGrid } from './xlsxio.js';
import { cleanExportOpts, exportTables, rangeText, CASE_COLS, REFL_COLS } from './export-opts.js';
import { inExport } from './reflections.js';
import { parseQuery, matchQuery, OPERATOR_HELP, insertOperator, FIELDS, FIELDS_NO_HAS } from './search-ops.js';
import { parseCsv } from './tags.js';
import {
  S, h, toast, debounce, modal, cat, categoryNamesRevision, catName, catShort, tagName, catFull, catChip, PICKER_ORDER, settings, patchLogbook, needExcel, download, fileButton, catPills,
  updateCase, updateMany, updatedToast, saveMany, deleteMany, displayName, rYear, todayISO, fill, add, resetters, tagSet, confirmBox, hooks, rowIcon, ic, ib, emptyState, reveal, basicHides, effectiveIntake, residentSmo } from './ui-core.js';
import { dayHasNotes, caseHasNotes, openNotes, ensureNotes, dayNoteCard } from './ui-notepad.js';
import { flatTree, tagTree } from './tags.js';
import { editCaseDialog, logOnDate } from './ui-log.js';
import { reflectOnCase, openReflection } from './ui-reflect.js';
import { moveToBin } from './bin.js';
import { rowLayoutOf } from './device-presets.js';
import { display, setDisplay } from './display.js';
import { destinations, openSend } from './ui-send.js';
import { syncButton } from './ui-sync.js';
import { shareText, copyText, caseText as shareCaseText, dayTextWithNotes } from './share.js';
import { labelsOn, parseParts, rowSegments, findLabel, takeHas } from './parts.js';
import { cloud, shows } from './ui-core.js';
import { evalRequestUrl, evalsBase } from './eval-link.js';
import { bulkEditDialog } from './ui-bulk.js';
import { pagesOf, pageSize, clampPage, PAGE_SIZES } from './paging.js';
import { GROUPS, SORTS, groupBy, sortBy, sortCases, groupCases, entriesOf } from './lb-group.js';
import { caseRYear } from './portfolio.js';
import { yearName } from './categories.js';

// has: tags a case must all have; not: tags it must have none of ('c:16' or a personal tag key); from/to: dates
const FRESH = () => ({ q: '', has: [], not: [], from: '', to: '', flag: '', mode: null, page: 0, month: null, day: null, fold: new Set() });
const view = FRESH();
resetters.push(() => Object.assign(view, FRESH()));   // next user starts unfiltered
// Select (List and the calendar's day list): press and hold a row, or the Select button; the bar at the bottom says
// how many, Select all (the whole search, not only the rows shown), Select none, Bulk edit… and Done
const sel = { on: false, ids: new Set(), paint: null };
resetters.push(() => { sel.on = false; sel.ids.clear(); });
// open the Logbook on a day (Settings → Logging → After Save: "Go to the Logbook"); ui-log.js calls it through hooks
hooks.showDay = iso => { view.month = iso.slice(0, 7); view.day = iso; };
// open the Logbook (List) on the cases behind a number in Analytics: a tag ('c:16' or a personal tag key) and/or a
// date range. Other filters are cleared so the list matches the number tapped.
hooks.showCases = ({ tag = null, from = '', to = '' } = {}) => {
  Object.assign(view, { q: '', has: tag ? [tag] : [], not: [], from, to, flag: '', page: 0, mode: 'list' });
};
const hasTag = (c, k) => (k.startsWith('c:') ? (c.cats || []).includes(k.slice(2)) : (c.tags || []).includes(k));
export const keyName = k => (k.startsWith('c:') ? catShort(k.slice(2)) : tagName(k));
// Every tag to filter or bulk-tag by: the tag list, then tags taken off it that cases still carry
// (so they can be found and removed). -> [{ k, depth, label }]
export function tagChoices() {
  const set = tagSet();
  const out = flatTree(tagTree(set)).filter(n => n.kind !== 'head').map(n => ({ k: n.e.k, depth: n.depth, label: keyName(n.e.k) }));
  const known = new Set(set.map(e => e.k)), gone = new Map();
  for (const c of S.cases || []) for (const k of c.tags || []) if (!known.has(k)) gone.set(k, (gone.get(k) || 0) + 1);
  for (const [k, n] of gone) out.push({ k, depth: 0, label: `${tagName(k)} (${n} case${n === 1 ? '' : 's'})` });
  return out;
}
// Labelled parts (Settings → Advanced logging; off by default): which parts a case has and its row text, worked out
// once per version of the case and list of labels
let partMemo = new WeakMap(), partFor = null;
function partInfo(c, labels) {
  if (partFor !== labels) { partMemo = new WeakMap(); partFor = labels; }
  let m = partMemo.get(c);
  if (!m) {
    const text = caseParts(c).details;
    m = { keys: new Set(parseParts(text, labels).parts.filter(p => p.text.trim()).map(p => p.k)), segs: rowSegments(text, labels) };
    partMemo.set(c, m);
  }
  return m;
}
// a row's text with each part's label in bold ("Plan: GA"), on lines of their own; parts hidden in lists left out
function partsText(c, labels) {
  const out = [];
  for (const seg of partInfo(c, labels).segs) {
    if (out.length) out.push('\n');
    if (seg.label) out.push(h('b', { class: 'part-l' }, seg.label + ':'), seg.text ? ' ' + seg.text : '');
    else out.push(seg.text);
  }
  return out.length ? out : null;
}
// The text a case is searched by, worked out once per version of the case (logbooks run to thousands)
// (and again when your tags change: renamed tags are searched by their new names)
let hayCache = new WeakMap(), hayFor = null, hayNames = -1;
const MODES = [['calendar', 'Calendar'], ['list', 'List'], ['grid', 'Grid']];
const modes = () => (basicHides('grid') ? MODES.filter(([m]) => m !== 'grid') : MODES);
// "2026-10-06" -> "Tue"
const weekday = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-GB', { weekday: 'short' }) : ''; };

// Tags in their short forms (full name on hover); a parent (e.g. 20) is left out when one of its sub-categories (20iii) is there.
function catTags(cats) {
  const codes = sortCodes(cats || []);
  const shown = codes.filter(c => !codes.some(o => o !== c && cat(o).parent === c));
  return h('span', { class: 'lb-tags' }, shown.map(c => h('span', { class: 'lb-tag', title: catFull(c) }, catShort(c))));
}

export function renderLogbook() {
  const wrap = h('div', { class: 'lb-wrap' });
  const list = h('div');
  const dupIds = new Set(duplicates(S.cases).flatMap(g => g.slice(1))); // the later copies
  const flagsOf = c => [...flagCase(c), ...(dupIds.has(c.id) ? ['duplicate'] : [])];

  const filtered = () => {
    // "last tuesday", "this week", "last month"… narrow by date; the other words search the text
    const win = dateWindow(view.q, new Date(), settings().weekStart);
    // Search in (Filter): everything, the initials only, or the procedure line only; fuzzy allows typos;
    // case sensitive (off by default) keeps capitals apart ("GA" doesn't find "gastrectomy")
    const scope = settings().lbScope || 'all', fuzzy = !!settings().lbFuzzy, cs = !!settings().lbCase;
    const low = t => (cs ? t : t.toLowerCase());
    // has:lp (Labelled parts on): cases with that part; a plain search takes it here, Advanced search as an operator
    const labels = labelsOn(settings());
    let q = win ? win.rest : view.q;
    const has = labels && !opsOn() ? takeHas(q, labels) : null;
    if (has) q = has.rest;
    const words = low(q).split(/\s+/).filter(Boolean);
    const ops = opsOn() && words.length ? parseQuery(q, { keepCase: cs, fields: labels ? FIELDS : FIELDS_NO_HAS }) : null;
    const partHas = c => t => { const l = labels && findLabel(t, labels); return !!l && partInfo(c, labels).keys.has(l.k); };
    if (hayFor !== settings().tagSet || hayNames !== categoryNamesRevision) { hayCache = new WeakMap(); hayFor = settings().tagSet; hayNames = categoryNamesRevision; }
    const hayOf = c => {
      let m = hayCache.get(c);
      if (!m) { m = {}; hayCache.set(c, m); }
      const key = cs ? scope + ':cs' : scope;
      if (m[key] == null) m[key] = low(scope === 'initials' ? caseParts(c).initials
        : scope === 'procedure' ? procedureText(c)
        : `${caseText(c)} ${c.date || c.dateText || ''} ${weekday(c.date)} ${fmtDate(c.date) || ''} ${(c.cats || []).map(k => `${k} ${catName(k)} ${catShort(k)}`).join(' ')} ${(c.tags || []).map(tagName).join(' ')}`);
      return m[key];
    };
    return S.cases.filter(c => {
      if (view.flag && !(view.flag === 'interesting' ? c.reflectTag : view.flag.startsWith('part:') ? !!labels && partInfo(c, labels).keys.has(view.flag.slice(5)) : flagsOf(c).includes(view.flag))) return false;
      if (view.has.length && !view.has.every(k => hasTag(c, k))) return false;
      if (view.not.length && view.not.some(k => hasTag(c, k))) return false;
      if ((view.from || view.to) && !(c.date && (!view.from || c.date >= view.from) && (!view.to || c.date <= view.to))) return false;
      if (win && !(c.date && c.date >= win.from && c.date <= win.to)) return false;
      if (has && has.keys.length && !has.keys.every(k => k && partInfo(c, labels).keys.has(k))) return false;
      if (ops) return matchQuery(ops, k => (k === 'all' ? hayOf(c) : partsOf(c, cs)[k]), t => tagHas(c, t), (hay, w, f) => textHas(hay, w, fuzzy && f !== 'initials' && (f || scope !== 'initials')), partHas(c));
      if (!words.length) return true;
      const hay = hayOf(c);
      return words.every(w => textHas(hay, w, fuzzy && scope !== 'initials'));
    });
  };
  // Advanced search (Settings → Logging): operators in the box (search-ops.js); off by default
  const opsOn = () => !!settings().searchOps;
  // title: the case's first line (initials and the first line of the details)
  const partsOf = (c, cs) => { const p = caseParts(c), low = t => (cs ? t : t.toLowerCase()); return { initials: low(p.initials), case: low(String(p.details || '')), title: low(caseText(c).split('\n')[0]) }; };
  // tag:16 / tag:lscs: a tag's code, or a word in its name (APMES or your own)
  const tagHas = (c, t) => (c.cats || []).some(k => k.toLowerCase() === t || `${catName(k)} ${catShort(k)} ${catFull(k)}`.toLowerCase().includes(t))
    || (c.tags || []).some(k => tagName(k).toLowerCase().includes(t));

  if (!view.mode) view.mode = MODES.some(([m]) => m === settings().logbookView) ? settings().logbookView : 'calendar';
  if (!modes().some(([m]) => m === view.mode)) view.mode = 'calendar';   // no grid (a Basic profile)
  const paint = () => {
    const rows = filtered();
    fill(list, view.mode === 'grid' ? gridView(rows, paint) : view.mode === 'calendar' ? calendarView(rows, flagsOf, paint) : listView(rows, flagsOf, paint));
    counter.textContent = rows.length === S.cases.length ? `${S.cases.length} cases` : `${rows.length} of ${S.cases.length} cases`;
    bulkBtn.textContent = `Edit ${rows.length === S.cases.length ? 'all ' : ''}${rows.length} case${rows.length === 1 ? '' : 's'}…`; bulkBtn.disabled = !rows.length;
    selectBtn.hidden = view.mode === 'grid' || !S.cases.length;
    groupRow.hidden = view.mode !== 'list';
    paintSel();
  };
  // the selection: cases since deleted drop out; the grid has its own editing, so selecting stops there
  const startSel = (ids = []) => { sel.on = true; for (const id of ids) sel.ids.add(id); paint(); };
  const endSel = () => { sel.on = false; sel.ids.clear(); paint(); };
  const selBar = h('div', { class: 'sel-bar', role: 'region', 'aria-label': 'Selected cases', hidden: true });
  const paintSel = () => {
    if (view.mode === 'grid') { sel.on = false; sel.ids.clear(); }
    const have = new Set(S.cases.map(c => c.id));
    for (const id of sel.ids) if (!have.has(id)) sel.ids.delete(id);
    wrap.classList.toggle('selecting', sel.on);
    selBar.hidden = !sel.on;
    if (!sel.on) return fill(selBar);
    const rows = filtered(), n = sel.ids.size;
    fill(selBar,
      h('span', { class: 'sel-n', 'aria-live': 'polite' }, `${n} selected`),
      h('button', { class: 'small', disabled: rows.length && rows.every(c => sel.ids.has(c.id)), onclick: () => { for (const c of rows) sel.ids.add(c.id); paint(); } }, rows.length === S.cases.length ? `Select all ${rows.length}` : `Select all ${rows.length} found`),
      h('button', { class: 'small', disabled: !n, onclick: () => { sel.ids.clear(); paint(); } }, 'Select none'),
      h('span', { class: 'grow' }),
      h('button', { class: 'small primary', disabled: !n, onclick: () => openBulk() }, 'Bulk edit…'),
      h('button', { class: 'small', onclick: endSel }, 'Done'));
  };
  sel.paint = paintSel;
  const openBulk = () => bulkEditDialog(S.cases.filter(c => sel.ids.has(c.id)), { tags: tagChoices(), name: keyName, onDone: () => endSel() });
  const paintSoon = debounce(() => { view.page = 0; paint(); }, 150);   // (a new search starts at page 1)

  const nFlag = f => S.cases.filter(c => flagsOf(c).includes(f)).length;
  // with Labelled parts on, one more for each label: "Has learning point (12)"
  const labelList = labelsOn(settings()) || [];
  const flagOpts = [['', 'All cases'], ['needsDate', `Needs a date (${nFlag('needsDate')})`], ['duplicate', `Possible duplicates (${nFlag('duplicate')})`], ['future', `Upcoming (${nFlag('future')})`], ...(basicHides('reflect') ? [] : [['interesting', `Interesting (${S.cases.filter(c => c.reflectTag).length})`]]),
    ...labelList.map(l => ['part:' + l.k, `Has ${l.n.toLowerCase()} (${S.cases.filter(c => partInfo(c, labelList).keys.has(l.k)).length})`])];
  if (view.flag && !flagOpts.some(([v]) => v === view.flag)) view.flag = '';   // a label since taken off, or the setting off
  const counter = h('span', { class: 'muted', style: 'font-size:calc(13px * var(--fs, 1))' });

  // the two filters fold behind a Filter button (shown open while one is in use)
  const searchIn = h('select', { 'aria-label': 'Search in', onchange: e => { patchLogbook({ settings: { lbScope: e.target.value } }); paintFilterBtn(); paint(); } },
    [['all', 'Everything'], ['initials', 'Initials only'], ['procedure', 'Procedure only']].map(([v, t]) => h('option', { value: v, selected: (settings().lbScope || 'all') === v }, t)));
  const fuzzyBox = h('label', { class: 'check', style: 'margin:0' }, h('input', { type: 'checkbox', checked: !!settings().lbFuzzy, onchange: e => { patchLogbook({ settings: { lbFuzzy: e.target.checked } }); paintFilterBtn(); paintFolds(); paint(); } }), 'Fuzzy search (allows typos)');
  const caseBox = h('label', { class: 'check', style: 'margin:0' }, h('input', { type: 'checkbox', checked: !!settings().lbCase, onchange: e => { patchLogbook({ settings: { lbCase: e.target.checked } }); paintFilterBtn(); paintFolds(); paint(); } }), 'Case sensitive');
  // tag filters: chips you add from a list of every tag (APMES and your own)
  const tagSel = (label, list) => h('select', { class: 'small', 'aria-label': label, onchange: e => { const k = e.target.value; e.target.value = ''; if (k && !list.includes(k)) { list.push(k); refresh(); } } },
    h('option', { value: '' }, label),
    tagChoices().map(n => h('option', { value: n.k }, `${'  '.repeat(Math.min(n.depth, 3))}${n.label}`)));
  const chipsOf = list => list.map(k => h('span', { class: 'chip on', role: 'button', tabindex: '0', title: 'Remove', onclick: () => { list.splice(list.indexOf(k), 1); refresh(); } }, keyName(k), h('span', { class: 'x' }, ' ×')));
  const hasRow = h('div', { class: 'chips lb-tagrow' });
  const notRow = h('div', { class: 'chips lb-tagrow' });
  const dateIn = k => h('input', { type: 'date', value: view[k], 'aria-label': k === 'from' ? 'From' : 'To', onchange: e => { view[k] = e.target.value; refresh(); } });
  // Edit N cases…: every case in the search, selected, into Bulk edit
  const bulkBtn = h('button', { class: 'small', onclick: () => { const rows = filtered(); if (!rows.length) return; if (view.mode === 'grid') setMode('list'); startSel(rows.map(c => c.id)); openBulk(); } });
  const selectBtn = h('button', { class: 'small lb-selbtn', title: 'Select cases to edit, copy or move to the bin together', onclick: () => (sel.on ? endSel() : startSel()) }, 'Select');
  const flagSel = h('select', { 'aria-label': 'Filter by flag', onchange: e => { view.flag = e.target.value; refresh(); } },
    flagOpts.map(([v, l]) => h('option', { value: v, selected: view.flag === v }, l)));
  // compact: two columns on a phone, so the panel doesn't fill the screen
  const cell = (label, ...kids) => h('div', { class: 'lb-cell' }, h('span', { class: 'lb-fl' }, label), ...kids);
  const resetBtn = resetLink();
  // Dates, Tags and More fold behind one row of small toggles (a fold opens by itself while in use);
  // the toggles say what is set ("1 Oct – 31 Oct", "Tags (2)")
  const fold = (body, open) => {
    const b = h('button', { type: 'button', class: 'small lb-fold', 'aria-expanded': String(!!open), onclick: () => { const open = body.hidden; reveal(body, open); b.setAttribute('aria-expanded', String(open)); } });
    body.hidden = !open;
    return b;
  };
  const datePanel = h('div', { class: 'lb-grid lb-panel' }, cell('From', dateIn('from')), cell('To', dateIn('to')));
  const tagPanel = h('div', { class: 'lb-grid lb-panel' }, cell('Has all of', hasRow), cell('Has none of', notRow));
  const morePanel = h('div', { class: 'lb-panel' },
    h('div', { class: 'bar lb-fbar' }, fuzzyBox, caseBox),
    h('div', { class: 'bar lb-fbar', style: 'margin:0' }, h('button', { class: 'small', title: 'Save this search', onclick: saveSearch }, ic('star'), 'Save search'), bulkBtn));
  const dateBtn = fold(datePanel, view.from || view.to);
  const tagBtn = fold(tagPanel, view.has.length || view.not.length);
  const moreBtn = fold(morePanel, settings().lbFuzzy || settings().lbCase);
  moreBtn.textContent = 'More';
  const short = iso => fmtDate(iso).replace(/ \d{4}$/, '');
  const paintFolds = () => {
    dateBtn.textContent = view.from && view.to ? `${short(view.from)} – ${short(view.to)}` : view.from ? `From ${short(view.from)}` : view.to ? `To ${short(view.to)}` : 'Dates';
    dateBtn.classList.toggle('on', !!(view.from || view.to));
    const n = view.has.length + view.not.length;
    tagBtn.textContent = n ? `Tags (${n})` : 'Tags';
    tagBtn.classList.toggle('on', !!n);
    moreBtn.classList.toggle('on', !!(settings().lbFuzzy || settings().lbCase));
    // a fold in use opens (a saved search with tags or dates); closing is left to the toggle
    for (const [b, body, on] of [[dateBtn, datePanel, view.from || view.to], [tagBtn, tagPanel, n]]) if (on && body.hidden) { body.hidden = false; b.setAttribute('aria-expanded', 'true'); }
  };
  const [groupSel, sortSel] = groupSelects(() => paint());
  const groupRow = h('div', { class: 'lb-grid lb-grouprow', hidden: view.mode !== 'list' }, cell('Group by', groupSel), cell('Sort', sortSel));
  const filters = h('div', { class: 'lb-filters', hidden: !(view.showFilters || active()) },
    h('div', { class: 'lb-grid' }, cell('Show', flagSel), cell('Search in', searchIn)),
    groupRow,
    h('div', { class: 'bar lb-folds' }, dateBtn, tagBtn, moreBtn, resetBtn),
    datePanel, tagPanel, morePanel,
    labelList.length ? h('p', { class: 'lb-points' }, h('a', { href: '#points' }, 'All learning points ›')) : null);
  // everything back to how it starts: search text, tag and date filters, search options
  function resetLink() {
    return h('button', { class: 'small linkish', style: 'margin-left:auto', onclick: () => {
      Object.assign(view, { q: '', has: [], not: [], from: '', to: '', flag: '' });
      setBox('');
      filters.querySelectorAll('input[type=date]').forEach(i => { i.value = ''; });
      setOpts('all', false, false);
      refresh();
    } }, 'Reset');
  }
  // "Search in", fuzzy and case sensitive are kept with your account; a saved search sets "Search in" only
  function setOpts(scope, fuzzy, cs = !!settings().lbCase) {
    if ((settings().lbScope || 'all') !== scope || !!settings().lbFuzzy !== fuzzy || !!settings().lbCase !== cs) patchLogbook({ settings: { lbScope: scope, lbFuzzy: fuzzy, lbCase: cs } });
    searchIn.value = scope; fuzzyBox.querySelector('input').checked = fuzzy; caseBox.querySelector('input').checked = cs;
  }
  const repaintFilters = () => {
    fill(hasRow, ...chipsOf(view.has), tagSel('+ Add tag', view.has));
    fill(notRow, ...chipsOf(view.not), tagSel('+ Add tag', view.not));
    paintFolds();
  };
  // saved searches: one tap to run again (stored with your account)
  const savedRow = h('div', { class: 'chips lb-saved' });
  const paintSaved = () => {
    const list = settings().savedSearches || [];
    fill(savedRow, ...list.map(x => h('span', { class: 'chip tmpl', role: 'button', tabindex: '0', title: (x.global ? 'Run this search in Search' : 'Run this search') + (x.q ? `: “${x.q}”` : ''), onclick: async () => {
      // saved on the Search page (cases, reflections and notes): it runs there
      if (x.global) { const { searchFor } = await import('./ui-search.js'); return searchFor(x.q); }
      Object.assign(view, { q: x.q || '', has: [...(x.has || [])], not: [...(x.not || [])], from: x.from || '', to: x.to || '', flag: x.flag || '' });
      setBox(view.q);
      if (x.scope) setOpts(x.scope, !!settings().lbFuzzy);
      const [f, t] = filters.querySelectorAll('input[type=date]'); if (f) f.value = view.from; if (t) t.value = view.to;
      filters.hidden = false; refresh();
    } }, x.global ? ic('search') : ic('star'), x.name, h('span', { class: 'x', role: 'button', tabindex: '0', 'aria-label': 'Delete saved search', onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); e.target.click(); } }, onclick: async e => {
      e.stopPropagation();
      if (!(await confirmBox('Delete saved search', `Delete “${x.name}”?`, 'Delete', true))) return;
      await patchLogbook({ settings: { savedSearches: (settings().savedSearches || []).filter(y => y.id !== x.id) } }); paintSaved();
    } }, ' ×'))));
  };
  async function saveSearch() {
    if (!active() && !view.q.trim()) return toast('Search or filter first, then save it');
    const name = (prompt('Name this search', view.q.trim() || view.has.map(keyName).join(' + ') || 'My search') || '').trim().slice(0, 40);
    if (!name) return;
    const list = settings().savedSearches || [];
    const x = { id: Math.random().toString(36).slice(2, 8), name, q: view.q, has: [...view.has], not: [...view.not], from: view.from, to: view.to, flag: view.flag, scope: settings().lbScope || 'all' };
    await patchLogbook({ settings: { savedSearches: [...list, x].slice(-20) } });
    paintSaved(); toast(`Saved “${name}”`);
  }
  function refresh() { flagSel.value = view.flag; paintFilterBtn(); repaintFilters(); view.page = 0; paint(); }
  function active() { return !!(view.has.length || view.not.length || view.from || view.to || view.flag || (settings().lbScope || 'all') !== 'all' || settings().lbFuzzy || settings().lbCase); }
  const filterBtn = h('button', { class: 'small ib', title: 'Filter', 'aria-expanded': String(!filters.hidden), onclick: () => {
    const open = filters.hidden; view.showFilters = open; reveal(filters, open); filterBtn.setAttribute('aria-expanded', String(open));
  } });
  const paintFilterBtn = () => {
    const n = view.has.length + view.not.length + (view.from || view.to ? 1 : 0) + (view.flag ? 1 : 0) + ((settings().lbScope || 'all') !== 'all' ? 1 : 0) + (settings().lbFuzzy ? 1 : 0) + (settings().lbCase ? 1 : 0);
    // the count in the word (screen readers), and as a small number beside the icon when icons replace words
    fill(filterBtn, ...ib('filter', n ? `Filter (${n})` : 'Filter'), n ? h('span', { class: 'ib-n', 'aria-hidden': 'true' }, String(n)) : null); filterBtn.classList.toggle('primary', !!n);
  };
  // the search box, with its own × that empties just the box (filters stay)
  const searchBox = h('input', { type: 'search', placeholder: 'Search, or “last Tuesday”', value: view.q, 'aria-label': 'Search cases',
    oninput: e => { view.q = e.target.value; searchWrap.classList.toggle('has-text', !!view.q); paintOpsNote(); paintSoon(); } });
  const searchWrap = h('div', { class: 'search-wrap grow' + (view.q ? ' has-text' : '') }, searchBox,
    h('button', { type: 'button', class: 'search-x', title: 'Clear the search', 'aria-label': 'Clear the search', onclick: () => { view.q = ''; setBox(''); searchBox.focus(); refresh(); } }, '×'));
  function setBox(v) { searchBox.value = v; searchWrap.classList.toggle('has-text', !!v); paintOpsNote(); }
  const opsNote = h('p', { class: 'hint lb-opsnote', hidden: true });
  const paintOpsNote = () => {
    const on = !!labelsOn(settings()), u = opsOn() && view.q ? parseQuery(view.q, { fields: on ? FIELDS : FIELDS_NO_HAS }).unknown.filter(x => on || x.op.toLowerCase() !== 'has:') : [];
    const needs = opsOn() && !on && /(^|\s)-?has:/i.test(view.q || '');
    opsNote.hidden = !u.length && !needs;
    opsNote.textContent = [...u.map(x => `“${x.op}” isn’t an operator (searched as text): did you mean ${x.suggest}?`), ...(needs ? ['has: needs Labelled parts (Settings → Advanced logging): searched as text.'] : [])].join(' ');
  };
  const helpBtn = opsOn() ? h('button', { type: 'button', class: 'small icon-btn', title: 'Search operators', 'aria-label': 'Search operators', onclick: () => opsHelp(searchBox, v => { view.q = v; searchWrap.classList.toggle('has-text', !!v); paintOpsNote(); refresh(); }) }, '?') : null;
  paintFilterBtn(); repaintFilters(); paintSaved(); paintOpsNote();
  const top = h('section', { class: 'card lb-top' },
    h('div', { class: 'bar' },
      searchWrap,
      helpBtn,
      filterBtn),
    opsNote,
    savedRow,
    filters,
    h('div', { class: 'bar', style: 'margin-bottom:0' },
      // Sync (Settings → Sync): only once a place to sync to is set up; it says how many days wait (and then the
      // gap may shrink, so the view switch stays on this row on a phone)
      ...(sb => [counter, h('span', { class: 'grow', style: sb ? 'min-width:0' : null }), sb])(syncButton()), selectBtn,
      h('div', { class: 'seg' }, modes().map(([m, l]) =>
        h('button', { 'aria-pressed': String(view.mode === m), onclick: () => setMode(m) }, l)))));
  // pinned (Settings → Layout): the month headings in List stick just under it
  if ('ResizeObserver' in window) new ResizeObserver(() => wrap.style.setProperty('--lb-top-h', top.offsetHeight + 'px')).observe(top);
  add(wrap, top, h('section', { class: 'card' }, list), selBar);
  // a press and hold (or the row menu's Select) starts selecting from that row
  hooks.selectCase = c => { if (view.mode === 'grid') return; startSel([c.id]); };
  paint();
  return wrap;

  function setMode(m) {
    view.mode = m; view.page = 0; paint();
    wrap.querySelectorAll('.seg button').forEach((b, i) => b.setAttribute('aria-pressed', String(modes()[i][0] === m)));
    if (settings().logbookView !== m) patchLogbook({ settings: { logbookView: m } });  // remembered per user
  }
}

// ---------- list ----------

// A month heading: a thin sticky line; tap it anywhere to jump to a date (the first case on or before it).
function monthHead(label, ul) {
  const input = h('input', { type: 'date', class: 'jump-date', 'aria-label': 'Jump to a date', max: todayISO(), onchange: e => {
    const d = e.target.value; if (!d) return;
    const row = [...ul.querySelectorAll('li[data-date]')].find(li => li.dataset.date && li.dataset.date <= d);
    if (!row) { toast('No cases on or before ' + fmtDate(d) + ' in this list'); return; }
    row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
  } });
  return h('li', { class: 'monthhead' }, h('label', { class: 'jump', title: 'Jump to a date' }, h('span', { class: 'mh-name' }, label), h('span', { class: 'mh-jump' }, ic('calendar'), 'Jump'), input));
}

function listView(rows, flagsOf, repaint) {
  if (!S.cases.length) return emptyState('logbook', 'No cases yet', 'Cases you log show here, newest first.', h('a', { class: 'btn primary', href: '#log' }, 'Log your first case'));
  if (!rows.length) return emptyState('search', 'No cases match', 'Try fewer words, or clear the filters.');
  const timeline = rowLayoutOf(display()) === 'timeline';
  const by = timeline ? 'day' : groupBy(display().lbGroup), sort = sortBy(display().lbSort);
  const ul = h('ul', { class: 'cases' });
  // the default (Month, Newest): as it always was, with Jump to a date on each month
  if (by === 'month' && sort === 'newest') {
    const pg = pager(rows, repaint);
    let month = '';
    for (const c of pg.rows) {
      const m = c.date ? fmtDate(c.date).replace(/^\d+ /, '') : 'No date';
      if (m !== month) { month = m; add(ul, monthHead(m, ul)); }
      add(ul, caseRow(c, flagsOf));
    }
    return h('div', {}, pg.bar(), ul, pg.bar(true));
  }
  const groups = groupCases(sortCases(rows, sort, groupCtx()), by, sort, groupCtx());
  // a folded group is one heading on its page; the pages count the cases shown (a case under two tags counts twice)
  const folded = g => view.fold.has(`${by}:${g.key}`);
  const all = groups.flatMap(g => (folded(g) ? [{ g, c: null, first: true, fold: true }] : entriesOf([g])));
  const pg = pager(all.map(e => ({ ...e, date: e.c ? e.c.date : '' })), repaint);
  let cur = null;
  for (const e of pg.rows) {
    if (e.g !== cur) { cur = e.g; add(ul, groupHead(e.g, by, !e.first, folded(e.g), repaint)); }
    if (e.fold) continue;
    if (e.g.planned) { add(ul, ...e.g.planned.map(p => h('li', { class: 'lb-planned' }, h('a', { href: '#log' }, `${p.date ? fmtDate(p.date) + ' · ' : ''}${caseText(p).slice(0, 80) || 'Planned case'}`)))); continue; }
    add(ul, caseRow(e.c, flagsOf));
  }
  return h('div', {}, pg.bar(), ul, pg.bar(true));
}

// Group by and Sort (log2 14; this device), in the Filter panel while the List shows: Month (the default) / Day / Week /
// Residency year / APMES tag / Your tags / Flags / None; Newest / Oldest / Initials A–Z / Most tags. Groups fold.
function groupSelects(repaint) {
  const pick = (label, key, opts, val) => h('select', { 'aria-label': label, onchange: e => { const v = e.target.value; setDisplay({ [key]: v === opts[0][0] ? null : v }); view.page = 0; repaint(); } },
    opts.map(([v, t]) => h('option', { value: v, selected: v === val }, t)));
  const groups = GROUPS.filter(([k]) => !(k === 'year' && basicHides('year')));
  return [rowLayoutOf(display()) === 'timeline' ? h('span', { class: 'hint' }, 'Timeline groups cases by day') : pick('Group by', 'lbGroup', groups, groupBy(display().lbGroup)), pick('Sort', 'lbSort', SORTS, sortBy(display().lbSort))];
}

// what the grouping needs from the app: names, residency years, targets and counts, the planned cases
function groupCtx() {
  const intake = effectiveIntake(), smo = residentSmo(S.resident);
  const order = new Map(PICKER_ORDER.map((c, i) => [c.code, i]));
  const targets = !basicHides('targets');
  return {
    initials: c => caseParts(c).initials || '', tagCount: c => (c.cats || []).length + (c.tags || []).length,
    weekStart: settings().weekStart == null || settings().weekStart === '' ? 1 : Number(settings().weekStart),
    year: d => (intake ? caseRYear(d, intake, smo) : null), yearName,
    day: iso => fmtDate(iso), catName, order: k => (order.has(k) ? order.get(k) : 999),
    target: k => (targets ? finalTarget(k) : null), count: k => (S.counts || {})[k] || 0, tagName,
    plan: S.logbook && Array.isArray(S.logbook.plan) ? S.logbook.plan : [],
  };
}

// A group's heading: tap to fold or unfold it; while selecting, "Select these" ticks the whole group
function groupHead(g, by, cont, isFolded, repaint) {
  const id = `${by}:${g.key}`, n = g.planned ? g.planned.length : g.items.length;
  const toggle = h('button', { type: 'button', class: 'lb-gfold', 'aria-expanded': String(!isFolded), onclick: () => { if (view.fold.has(id)) view.fold.delete(id); else view.fold.add(id); repaint(); } },
    h('span', { class: 'lb-gfold-i', 'aria-hidden': 'true' }, isFolded ? '▸' : '▾'), ' ',
    h('span', { class: 'mh-name' }, g.label + (cont ? ' (continued)' : '')), ' ',
    h('span', { class: 'muted' }, [`${n} ${g.planned ? 'planned' : n === 1 ? 'case' : 'cases'}`, g.note].filter(Boolean).join(' · ')));
  const pickAll = sel.on && !g.planned && n ? h('button', { type: 'button', class: 'small', onclick: () => { for (const c of g.items) sel.ids.add(c.id); repaint(); } }, `Select these ${n}`) : null;
  return h('li', { class: 'monthhead lb-ghead' }, toggle, pickAll);
}

// Pages (log2 11; owner, 15 Oct 2026): 100 cases a page by default (25 / 50 / 100 / 300 / All, this device);
// "‹ Page 2 of 14 ›" with a list of the pages and their dates to jump to. A new search or filter starts at page 1.
// -> { rows (this page's), bar(bottom) }
function pager(rows, repaint) {
  const size = pageSize(display().pageSize), pages = pagesOf(rows, size);
  view.page = clampPage(view.page, pages.length);
  const cur = pages[view.page];
  const go = i => { view.page = clampPage(i, pages.length); repaint(); window.scrollTo({ top: 0 }); };
  const span = pg => (pg.from && pg.to ? (pg.from === pg.to ? fmtDate(pg.from) : `${fmtDate(pg.from)} – ${fmtDate(pg.to)}`) : 'No date');
  const bar = (bottom = false) => {
    if (pages.length <= 1 && (bottom || rows.length <= PAGE_SIZES[0])) return null;
    return h('div', { class: 'bar lb-pager' + (bottom ? ' bottom' : '') },
      pages.length > 1 ? h('button', { class: 'small icon-btn', 'aria-label': 'Previous page', disabled: view.page === 0, onclick: () => go(view.page - 1) }, '‹') : null,
      pages.length > 1 ? h('select', { class: 'lb-pagesel', 'aria-label': 'Page', onchange: e => go(Number(e.target.value)) },
        pages.map((pg, i) => h('option', { value: String(i), selected: i === view.page }, `Page ${i + 1} of ${pages.length} · ${span(pg)}`))) : null,
      pages.length > 1 ? h('button', { class: 'small icon-btn', 'aria-label': 'Next page', disabled: view.page >= pages.length - 1, onclick: () => go(view.page + 1) }, '›') : null,
      bottom ? null : h('span', { class: 'grow' }),
      bottom ? null : h('select', { class: 'lb-pagesize', 'aria-label': 'Cases per page', onchange: e => { setDisplay({ pageSize: Number(e.target.value) === 100 ? null : Number(e.target.value) }); view.page = 0; repaint(); } },
        PAGE_SIZES.map(n => h('option', { value: String(n), selected: n === size }, n ? `${n} per page` : 'All on one page'))));
  };
  return { rows: rows.slice(cur.start, cur.end), bar };
}

// One case: date, details, procedure tags, flags. Tap to edit. Shared by the list and the calendar.
// Layout → Fewer buttons on Logbook rows: one ⋯ that opens Copy / Reflect / Edit; a ✓ marks a reflection
// the ⋯ menu's sheet; also opened by pressing and holding a row (Accessibility → Press and hold, html.row-hold)
function openRowMenu(c) {
  const has = (S.reflections || []).some(r => r.caseId === c.id);
  const m = modal(caseText(c).slice(0, 60) || 'Case', h('div', { class: 'row-menu-list' },
    h('button', { onclick: () => { m.close(); copyText(shareCaseText(c), 'Case copied: paste it into your notes'); } }, rowIcon('copy'), ' Copy'),
    destinations().length ? h('button', { onclick: () => { m.close(); openSend({ text: shareCaseText(c), title: c.date || 'Case', fileDate: c.date || '' }); } }, rowIcon('copy'), ' Send to…') : null,
    basicHides('reflect') ? null : h('button', { class: has ? 'has-refl' : '', onclick: () => { m.close(); reflectOnCase(c); } }, rowIcon(has ? 'done' : 'reflect'), has ? ' Open the reflection' : ' Write a reflection'),
    // APMES → Request an evaluation (off by default): the evaluations app, with this case's date and initials
    shows('evalRequest') ? h('a', { class: 'btn eval-req', href: evalRequestUrl({ date: c.date, initials: caseParts(c).initials }, { today: todayISO(), demo: cloud.demo, base: evalsBase(location.href) }), target: '_blank', rel: 'noopener', onclick: () => m.close() }, rowIcon('reflect'), ' Request an evaluation') : null,
    h('button', { onclick: () => { m.close(); editCaseDialog(c); } }, ' Edit the case'),
    hooks.selectCase && S.tab === 'logbook' ? h('button', { onclick: () => { m.close(); hooks.selectCase(c); } }, ' Select (to edit several)') : null,
    h('button', { class: 'linkish', onclick: () => m.close() }, 'Cancel')));
}
function rowMenu(c) {
  const has = (S.reflections || []).some(r => r.caseId === c.id);
  const open = e => { e.stopPropagation(); openRowMenu(c); };
  return h('span', { class: 'acts' },
    has && !basicHides('reflect') ? h('span', { class: 'refl-done', title: 'Has a reflection', 'aria-label': 'Has a reflection' }, rowIcon('done')) : null,
    basicHides('reflect') ? h('button', { class: 'small row-btn row-more', title: 'Copy or edit', 'aria-label': 'Copy or edit this case', onclick: open }, '⋯')
      : h('button', { class: 'small row-btn row-more', title: 'Copy, reflect or edit', 'aria-label': 'Copy, reflect or edit this case', onclick: open }, '⋯'));
}

// The tags line scrolls sideways when it's longer than the row: then it takes the keyboard focus too, so the arrow
// keys can scroll it (a scrolling area nobody can reach by keyboard is an accessibility error)
function tagRow(el) {
  requestAnimationFrame(() => { if (el.isConnected && el.scrollWidth > el.clientWidth + 1) { el.tabIndex = 0; el.setAttribute('aria-label', 'Tags'); el.setAttribute('role', 'group'); } });
  return el;
}

// Press and hold a row for its menu (Accessibility, off by default; owner, 13 Oct 2026): half a second without moving
// opens the ⋯ sheet. The click that comes with lifting the finger is swallowed, so it neither opens the case nor
// presses the sheet's button that is now under the finger. A sideways swipe still changes tabs.
const HOLD_MS = 500;
function swallowNextClick() {
  const eat = e => { e.stopPropagation(); e.preventDefault(); window.removeEventListener('click', eat, true); };
  window.addEventListener('click', eat, true);
  const off = () => setTimeout(() => window.removeEventListener('click', eat, true), 350);
  window.addEventListener('pointerup', off, { capture: true, once: true });
  window.addEventListener('pointercancel', off, { capture: true, once: true });
}
// With Press and hold off (the default), holding a row starts selecting from it (owner, 15 Oct 2026); with it on, the
// hold opens the menu, which has Select. While selecting, a hold does nothing more (a tap ticks).
function holdToMenu(li, c, menu = true) {
  let t = 0, x = 0, y = 0, held = 0;
  const stop = () => { clearTimeout(t); t = 0; };
  const act = () => (menu ? openRowMenu(c) : hooks.selectCase?.(c));
  li.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button, a, input') || (!menu && sel.on)) return;
    x = e.clientX; y = e.clientY; stop();
    t = setTimeout(() => { t = 0; held = Date.now(); swallowNextClick(); try { navigator.vibrate?.(10); } catch { /* not allowed */ } act(); }, HOLD_MS);
  });
  li.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - x, e.clientY - y) > 10) stop(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) li.addEventListener(ev, stop);
  // Android's long press and a right-click: the same menu instead of the browser's (unless the hold already opened it);
  // for Select, only the touch long press that just selected (a right-click keeps the browser's menu)
  li.addEventListener('contextmenu', e => {
    // (Android may send it a moment before the half second: then it starts selecting there and then)
    if (!menu) { if (t) { e.preventDefault(); stop(); held = Date.now(); swallowNextClick(); act(); } else if (Date.now() - held < 1000) e.preventDefault(); return; }
    e.preventDefault(); if (document.querySelector('dialog[open] .row-menu-list')) return; stop(); openRowMenu(c);
  });
}
// tick or untick a row while selecting (no repaint: the bar's count and the row change in place)
function toggleSel(c, li, setBox = true) {
  const on = !sel.ids.has(c.id);
  if (on) sel.ids.add(c.id); else sel.ids.delete(c.id);
  li.classList.toggle('sel', on);
  const box = li.querySelector('.sel-box'); if (box && setBox) box.checked = on;
  sel.paint?.();
}

function caseRow(c, flagsOf) {
  const flags = flagsOf(c);
  const p = caseParts(c);
  const picking = sel.on && S.tab === 'logbook', picked = picking && sel.ids.has(c.id);
  const open = () => (picking ? toggleSel(c, li) : editCaseDialog(c));
  // while selecting, the row's checkbox takes the keyboard (one stop a row) and says which case it is
  const li = h('li', { 'data-date': c.date || '', class: picked ? 'sel' : null, onclick: open, tabindex: picking ? '-1' : '0',
      onkeydown: e => { if ((e.key === 'Enter' || (picking && e.key === ' ')) && e.target === e.currentTarget) { e.preventDefault(); open(); } } },
      picking ? h('input', { type: 'checkbox', class: 'sel-box', checked: picked, 'aria-label': `Select ${[p.initials, c.date ? fmtDate(c.date) : '', String(p.details || '').slice(0, 40)].filter(Boolean).join(', ') || 'this case'}`,
        onclick: e => { e.stopPropagation(); toggleSel(c, li, false); } }) : null,
      // the left column: the initials on top, the date on one line under them (like Reflections; owner, 13 Oct 2026)
      h('span', { class: 'd' }, p.initials ? h('b', { class: 'ini' }, p.initials) : null,
        h('span', { class: 'chat-time', title: 'Logged at' }, Number.isFinite(c.createdAt) ? new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''),
        h('span', { class: 'dt' }, c.date ? [h('span', { class: 'wd' }, weekday(c.date)), ' ', fmtDate(c.date).replace(/ \d{4}$/, '')] : (c.dateText || '—'))),
      h('span', { class: 't' }, (labelsOn(settings()) ? partsText(c, labelsOn(settings())) : p.details) || h('i', { class: 'muted' }, 'no details')),
      // tags on the left (wrapping), Copy and Reflect on the right, the same size whatever they say
      h('span', { class: 'c' }, tagRow(h('span', { class: 'c-tags' }, catTags(c.cats),
        flags.includes('needsDate') ? h('span', { class: 'flag err' }, 'needs date') : null,
        flags.includes('future') ? h('span', { class: 'flag', title: 'Dated after today' }, 'upcoming') : null,
        flags.includes('duplicate') ? h('span', { class: 'flag' }, 'possible duplicate') : null,
        !(c.cats || []).length ? h('span', { class: 'flag err' }, 'no tag') : null,
        c.reflectTag ? h('span', { class: 'flag', title: 'Marked interesting' }, ic('star'), 'interesting') : null,
        (c.tags || []).map(t => h('span', { class: 'flag sc-tag', title: 'Your tag' }, tagName(t))),
        caseHasNotes(c.id) ? h('button', { class: 'flag note-flag', type: 'button', title: 'Open your notes on this case', 'aria-label': 'Open your notes on this case', onclick: e => { e.stopPropagation(); openNotes({ caseId: c.id }); } }, ic('note'), 'note') : null)),
        document.documentElement.classList.contains('row-menu') ? rowMenu(c) : h('span', { class: 'acts' },
          // to your own notes (paste into WhatsApp, Notes, Obsidian); off unless switched on (Layout, row-copy)
          !document.documentElement.classList.contains('row-copy') ? null : h('button', { class: 'small row-btn', title: 'Copy this case', 'aria-label': 'Copy this case', onclick: e => { e.stopPropagation(); copyText(shareCaseText(c), 'Case copied: paste it into your notes'); } }, rowIcon('copy'), h('span', { class: 'lbl' }, 'Copy')),
          // ✓ and filled once the case has a reflection (opens it); the same width either way, so the row never wraps.
          // Basic: logbook only has no Reflect button (unless turned back on).
          basicHides('reflect') ? null : (S.reflections || []).some(r => r.caseId === c.id)
            ? h('button', { class: 'small row-btn has-refl', title: 'Open the reflection on this case', 'aria-label': 'Open the reflection on this case', onclick: e => { e.stopPropagation(); reflectOnCase(c); } }, rowIcon('done'), h('span', { class: 'lbl' }, 'Reflect'))
            : h('button', { class: 'small row-btn', title: 'Write a reflection on this case', 'aria-label': 'Write a reflection on this case', onclick: e => { e.stopPropagation(); reflectOnCase(c); } }, rowIcon('reflect'), h('span', { class: 'lbl' }, 'Reflect')))));
  holdToMenu(li, c, document.documentElement.classList.contains('row-hold'));
  return li;
}

// ---------- calendar ----------

const pad = n => String(n).padStart(2, '0');
// browsers without a month picker (Firefox on a computer) keep the plain title and its arrows
const MONTH_INPUT = (() => { const i = document.createElement('input'); i.setAttribute('type', 'month'); return i.type === 'month'; })();
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function calendarView(rows, flagsOf, repaint) {
  if (!S.cases.length) return emptyState('logbook', 'No cases yet', 'Cases you log show here on their day.', h('a', { class: 'btn primary', href: '#log' }, 'Log your first case'));
  const today = todayISO();
  // opens on today (owner): the day's cases, or "No cases yet today" with + Add
  if (!view.month) { view.month = today.slice(0, 7); if (!view.day) view.day = today; }
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
  const ws = settings().weekStart;
  const lead = weekLead(first, ws);                // Monday first unless set (Settings → Logging)
  const days = new Date(y, m, 0).getDate();
  // a labelled group of day buttons (a role=grid would need rows and cells around them); the weekday letters are
  // decoration, each day's button says its own date
  const grid = h('div', { class: 'lb-cal', role: 'group', 'aria-label': `Days of ${MONTHS[m - 1]} ${y}` }, weekdayNames(ws).map(d => h('div', { class: 'lb-dow', 'aria-hidden': 'true' }, d)));
  for (let i = 0; i < lead; i++) add(grid, h('div', { class: 'lb-day blank' }));
  // Show reflections (owner, 15 Oct 2026; this device, off by default): a mark on days with a reflection, and each
  // reflection in the day's list under its case (or on its own when it isn't linked to one)
  const reflOn = !!display().calRefl && !basicHides('reflect');
  const reflByDay = new Map();
  if (reflOn) for (const r of S.reflections || []) if (r.date) (reflByDay.get(r.date) || reflByDay.set(r.date, []).get(r.date)).push(r);
  let monthN = 0;
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    const cs = byDay.get(iso) || [];
    monthN += cs.length;
    const flagged = cs.some(c => flagsOf(c).length);
    const tint = cs.length ? Math.min(4, cs.length) : 0;
    add(grid, h('button', {
      class: `lb-day t${tint} ${iso === today ? 'today' : ''} ${iso === view.day ? 'sel' : ''}`,
      'aria-label': `${d} ${MONTHS[m - 1]}: ${cs.length} case${cs.length === 1 ? '' : 's'}${dayHasNotes(iso) ? ', has notes' : ''}${reflByDay.has(iso) ? ', has a reflection' : ''}`, 'aria-pressed': String(iso === view.day),
      onclick: () => { view.day = view.day === iso ? null : iso; repaint(); if (view.day) showDay(); },
    }, h('span', { class: 'n' }, d), h('span', { class: 'lb-count' + (cs.length ? '' : ' none'), 'aria-hidden': cs.length ? null : 'true' }, cs.length || ''), flagged ? h('i', { class: 'lb-dot', title: 'Has a flagged case' }) : null,
      dayHasNotes(iso) ? h('i', { class: 'lb-note', title: 'Has notes' }) : null,
      reflByDay.has(iso) ? h('i', { class: 'lb-refl', title: 'Has a reflection' }) : null));
  }
  const dayRefl = view.day ? reflByDay.get(view.day) || [] : [];
  const reflRow = r => h('li', { class: 'refl-under' }, h('button', { type: 'button', class: 'linkish', onclick: () => { location.hash = '#reflect'; openReflection(r); } },
    rowIcon('reflect'), ` ${r.title || r.diagnosis || 'Reflection'}`, h('small', { class: 'muted' }, ` · ${r.status === 'complete' ? 'complete' : 'draft'}`)));
  const dayCases = view.day ? (byDay.get(view.day) || []) : [];
  const dayNotes = dayHasNotes(view.day);
  // the day's Copy includes its notes, and its daily note shows under the heading: have them ready (drawn again once
  // they arrive)
  if (dayNotes && !Array.isArray(S.notes)) ensureNotes().then(() => { if (S.tab === 'logbook') hooks.render(); });
  return h('div', {},
    h('div', { class: 'bar lb-calbar' },
      h('button', { class: 'small icon-btn', 'aria-label': 'Previous month', onclick: () => shift(-1) }, '‹'),
      // tap the month's name to pick another month (a month picker sits invisibly over it, like the Add tab's date chip)
      h('label', { class: 'grow lb-monthpick', title: 'Pick a month' }, h('strong', {}, `${MONTHS[m - 1]} ${y}`),
        h('span', { class: 'muted', style: 'font-weight:400;font-size:calc(13px * var(--fs, 1))' }, ` · ${monthN} case${monthN === 1 ? '' : 's'}`),
        !MONTH_INPUT ? null : h('input', { type: 'month', 'aria-label': 'Pick a month', value: view.month, onclick: e => { try { e.target.showPicker(); } catch { /* the native tap opens it */ } },
          onchange: e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { view.month = e.target.value; view.day = null; repaint(); } } })),
      h('button', { class: 'small icon-btn', 'aria-label': 'Next month', onclick: () => shift(1) }, '›'),
      h('button', { class: 'small', onclick: () => { view.month = today.slice(0, 7); view.day = today; repaint(); } }, 'Today'),
      basicHides('reflect') ? null : h('label', { class: 'check lb-reflsw', style: 'margin:0' }, h('input', { type: 'checkbox', checked: reflOn, onchange: e => { setDisplay({ calRefl: e.target.checked || null }); repaint(); } }), 'Show reflections')),
    grid,
    view.day ? h('div', { class: 'lb-daydetail', style: 'margin-top:12px' },
      // the day, then its buttons together on one row (none left alone on a line of its own)
      h('div', { class: 'lb-dayhead' },
        h('h3', { style: 'margin:0' }, `${fmtDate(view.day)} (${dayCases.length})`),
        h('div', { class: 'lb-daybtns' },
          dayCases.length || dayNotes ? h('button', { class: 'small ib', title: 'Share this day', 'aria-label': 'Share this day', onclick: async () => shareText(await dayTextWithNotes(view.day, dayCases)) }, ...ib('share', 'Share')) : null,
          // Send to…: only once a place to send to is set up (Settings → Send to)
          (dayCases.length || dayNotes) && destinations().length ? h('button', { class: 'small ib', title: 'Send this day to another app', 'aria-label': 'Send this day', onclick: async () => openSend({ text: await dayTextWithNotes(view.day, dayCases), title: view.day, date: view.day }) }, ...ib('share', 'Send')) : null,
          // Copy for the day: off unless switched on (Layout → Logbook rows; owner, 13 Oct 2026)
          (dayCases.length || dayNotes) && document.documentElement.classList.contains('day-copy') ? h('button', { class: 'small ib', title: 'Copy this day (format in Settings → Markdown)', 'aria-label': 'Copy this day', onclick: async () => copyText(await dayTextWithNotes(view.day, dayCases), 'Day copied: paste it into your notes') }, ...ib('copy', 'Copy')) : null,
          dayNotes ? h('button', { class: 'small ib', title: 'Notes', onclick: () => openNotes({ day: view.day }) }, ic('note'), h('span', { class: 'ib-l' }, 'Notes')) : null,
          // log on this day (the Log page opens with the date already picked): last, at the right like a main action
          h('button', { class: 'small primary', title: 'Log a case on this day', 'aria-label': 'Log a case on this day', onclick: () => logOnDate(view.day) }, '+ Add'))),
      dayNoteCard(view.day),
      dayCases.length ? h('ul', { class: 'cases' }, dayCases.map(c => [caseRow(c, flagsOf), ...dayRefl.filter(r => r.caseId === c.id).map(reflRow)]),
        dayRefl.filter(r => !dayCases.some(c => c.id === r.caseId)).map(reflRow)) : emptyState('calendar', view.day === today ? 'No cases yet today' : 'No cases on this day'),
      !dayCases.length && dayRefl.length ? h('ul', { class: 'cases' }, dayRefl.map(reflRow)) : null)
      : h('p', { class: 'hint help', style: 'margin-top:10px' }, 'Tap a day to see its cases.'),
    undated.length ? h('details', { style: 'margin-top:12px' },
      h('summary', {}, `No date (${undated.length})`),
      h('ul', { class: 'cases' }, undated.map(c => caseRow(c, flagsOf)))) : null);
}

// A tapped day's cases come into view when they'd start below the screen (or under the tab bar): enough of them to
// see the day's heading and first cases, never so far that the calendar's own row goes off the top. Smoothly, unless
// Reduce motion is on.
function showDay() {
  requestAnimationFrame(() => {
    const el = document.querySelector('.lb-daydetail');
    if (!el) return;
    // the day's button was drawn again: keep the keyboard's place on it
    const sel0 = document.querySelector('.lb-day.sel');
    if (sel0 && (!document.activeElement || document.activeElement === document.body)) sel0.focus({ preventScroll: true });
    const r = el.getBoundingClientRect();
    const bar = document.getElementById('tabs'), br = bar && !bar.hidden ? bar.getBoundingClientRect() : null;
    const bottom = Math.min(window.visualViewport ? window.visualViewport.height : window.innerHeight, br && br.top > window.innerHeight / 2 ? br.top : Infinity) - 8;
    const want = r.top + Math.min(r.height, 220);   // the heading and about two cases
    if (want <= bottom) return;
    const sel = document.querySelector('.lb-day.sel'), top = sel ? sel.getBoundingClientRect().top - 8 : r.top - 8;
    const by = Math.min(want - bottom, Math.max(0, top));
    if (by <= 0) return;
    const c = document.documentElement.classList;
    const still = c.contains('rm') || (c.contains('rm-auto') && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const to = window.scrollY + by, behavior = still ? 'auto' : 'smooth';
    window.scrollTo({ top: to, behavior });
    // a page drawn again meanwhile (the day's notes arriving) puts the scroll back where it was: finish the move,
    // unless the finger has moved the page since
    let moved = false;
    const mark = () => { moved = true; };
    for (const ev of ['touchstart', 'wheel', 'keydown']) window.addEventListener(ev, mark, { once: true, passive: true });
    setTimeout(() => {
      for (const ev of ['touchstart', 'wheel', 'keydown']) window.removeEventListener(ev, mark);
      if (!moved && S.tab === 'logbook' && document.querySelector('.lb-daydetail') && Math.abs(window.scrollY - to) > 4) window.scrollTo({ top: to, behavior });
    }, still ? 50 : 500);
  });
}

// ---------- grid ----------

const catText = cats => sortCodes(cats || []).join(', ');

// The Grid (log2 10): a spreadsheet look (thin lines, no boxed inputs). Column widths drag from each heading's right
// edge (this device; a double-tap on the edge resets that column); lines per row 1 / 2 / 3 / Fit (the summary grows to
// its text). Edits save when a cell is left, as before.
const GRID_COLS = [['date', 'Date', 150], ['ini', 'Initials', 72], ['details', 'Case summary', 0], ['cats', 'Tags', 220]];
const LINE_OPTS = [['1', '1 line'], ['2', '2 lines'], ['3', '3 lines'], ['fit', 'Fit to text']];
function gridView(rows, repaint) {
  const lines = String(display().gridLines || '1');
  const widths = { ...(display().gridCols || {}) };
  const fitAll = () => tbody.querySelectorAll('textarea.g-details').forEach(fitCell);
  const fitCell = ta => { if (lines !== 'fit') return; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  const tbody = h('tbody');
  const pg = pager(rows, repaint);
  for (const c of pg.rows) {
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
    const cell = (key, attrs = {}, tag = 'input') => h(tag, { ...attrs, value: row[key], oninput: e => { row[key] = e.target.value; tr.classList.add('dirty'); if (tag === 'textarea') fitCell(e.target); }, onchange: commit });
    const details = cell('details', { 'aria-label': 'Details', class: 'g-details', rows: lines === 'fit' ? '1' : lines }, 'textarea');
    details.value = row.details;
    add(tr,
      h('td', { class: 'date' }, cell('date', { type: 'date', 'aria-label': 'Date', title: c.dateText && !c.date ? `Was written as “${c.dateText}”: pick the date` : '' })),
      h('td', { class: 'ini' }, cell('initials', { 'aria-label': 'Initials', placeholder: 'AB', autocapitalize: 'characters', size: '5' })),
      h('td', { class: 'details' }, details),
      h('td', { class: 'cats' }, h('button', { type: 'button', class: 'grid-cats', 'aria-label': 'Tags: change', onclick: () => editCaseDialog(c) },
        (c.cats || []).length ? catPills(c.cats) : h('span', { class: 'flag err' }, 'no tag'))));
    add(tbody, tr);
  }
  // a column's width: drag the heading's right edge (pointer events: a finger or a mouse); double-tap resets it
  const cols = GRID_COLS.map(([k, , w]) => h('col', { 'data-col': k, style: widths[k] ? `width:${widths[k]}px` : w ? `width:${w}px` : '' }));
  const table = h('table', { class: 'grid sheet' + (lines === 'fit' ? ' fit' : '') + (Object.keys(widths).length ? ' sized' : '') }, h('colgroup', {}, cols));
  const head = h('tr', {}, GRID_COLS.map(([k, label], i) => {
    let lastTap = 0;
    const grip = h('span', { class: 'col-grip', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': `${label} column width: drag to change, double-tap to reset`, tabindex: '0',
      'aria-valuemin': '40', 'aria-valuemax': '1200', 'aria-valuenow': String(Math.round(widths[k] || GRID_COLS[i][2] || 300)),
      onpointerdown: e => {
        e.preventDefault(); e.stopPropagation();
        const now = Date.now();
        if (now - lastTap < 350) { lastTap = 0; delete widths[k]; setDisplay({ gridCols: Object.keys(widths).length ? { ...widths } : null }); repaint(); return; }
        lastTap = now;
        const th = e.currentTarget.closest('th'), x0 = e.clientX, w0 = th.getBoundingClientRect().width;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        table.classList.add('sized');
        const move = ev => { const w = Math.max(40, Math.round(w0 + ev.clientX - x0)); cols[i].style.width = w + 'px'; widths[k] = w; grip.setAttribute('aria-valuenow', String(w)); };
        const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); if (widths[k]) setDisplay({ gridCols: { ...widths } }); };
        addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
      },
      onkeydown: e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const w = Math.max(40, Math.round((widths[k] || e.currentTarget.closest('th').getBoundingClientRect().width) + (e.key === 'ArrowRight' ? 16 : -16)));
        widths[k] = w; cols[i].style.width = w + 'px'; grip.setAttribute('aria-valuenow', String(w)); table.classList.add('sized');
        setDisplay({ gridCols: { ...widths } });
      } });
    return h('th', {}, h('span', { class: 'th-l' }, label), grip);
  }));
  add(table, h('thead', {}, head), tbody);
  const linesSel = h('select', { 'aria-label': 'Lines per row', onchange: e => { setDisplay({ gridLines: e.target.value === '1' ? null : e.target.value }); repaint(); } },
    LINE_OPTS.map(([v, t]) => h('option', { value: v, selected: lines === v }, t)));
  requestAnimationFrame(fitAll);
  return h('div', {},
    h('p', { class: 'hint help' }, 'Edit the date, initials and details directly; changes save when you leave a cell. Tap the tags to change them. Drag a heading’s edge to resize a column (double-tap it to reset).'),
    h('div', { class: 'bar grid-opts' }, h('label', { class: 'refl-view' }, h('span', { class: 'hint' }, 'Lines per row '), linesSel),
      Object.keys(widths).length ? h('button', { class: 'small linkish', onclick: () => { setDisplay({ gridCols: null }); repaint(); } }, 'Reset column widths') : null),
    pg.bar(),
    h('div', { class: 'scroll' }, table),
    pg.bar(true),
    pasteRows());
}

// Rows copied from Excel arrive as tab-separated lines: Date, Case details, Categories (initials are split
// off the front of the details), or Date, Initials, Case details, Categories when there are four columns.
function pasteRows() {
  const ta = h('textarea', { rows: '4', placeholder: 'Paste rows from Excel here: Date ⇥ Case summary ⇥ Categories (or Date ⇥ Initials ⇥ Case summary ⇥ Categories)' });
  return h('div', { style: 'margin-top:16px' },
    h('h3', {}, 'Add rows from a spreadsheet'), ta,
    h('div', { class: 'bar', style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: () => {
      const rows = ta.value.split(/\r?\n/).filter(l => l.trim()).map((l, i) => {
        const cols = l.split('\t');
        // four columns with a short letters-only second one: Date, Initials, Details, Categories (a copied export's
        // fourth column is the hidden id, not initials)
        // (an exported sheet copied whole: Date, Case summary, Tags, then the hidden id)
        const exported = cols.length >= 4 && /^[A-Za-z0-9_-]{12,24}$/.test(cols[3].trim());
        const four = !exported && cols.length >= 4 && /^[A-Za-z.\-]{0,6}$/.test(cols[1].trim());
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

// The operators, from the "?" by the search box (Advanced search on)
// The operators, from the "?" by the search box (Advanced search on). Tap one to add it to the box.
export function opsHelp(box, onchange, list = OPERATOR_HELP, example = 'tag:lscs -GA "under spinal"') {
  const caret = box.selectionStart ?? box.value.length;
  const m = modal('Search operators', [
    h('p', { class: 'hint help', style: 'margin:0 0 6px' }, 'Tap one to add it to the search box.'),
    h('div', { class: 'ops-pick' }, list.map(([op, what, insert, at]) => h('button', { type: 'button', class: 'ops-row', onclick: async () => {
      const r = insertOperator(box.value, caret, insert, at);
      await m.close();
      box.value = r.text; onchange(r.text);
      box.focus(); box.setSelectionRange(r.caret, r.caret);
    } }, h('code', {}, op), h('span', {}, what)))),
    h('p', { class: 'hint help' }, `Combine them: ${example}. Plain words work as usual. Turn operators off in Settings → Logging.`),
    h('div', { class: 'bar' }, h('span', { class: 'grow' }), h('button', { onclick: () => m.close() }, 'Close'))]);
}

// ---------- Excel ----------


// Excel export: logbook and/or reflections, a date range, the columns and their order. The choices
// are saved with the account (settings.excelExport) and come back next time.
export function downloadExcel() {
  let o = cleanExportOpts(settings().excelExport);
  const body = h('div', { class: 'xport' });
  const ctx = { tagName, reflections: S.reflections || [], inPortfolio: inExport };
  const seg = (label, key, opts) => h('div', { class: 'xp-row' }, h('span', { class: 'lb-fl' }, label),
    h('span', { class: 'seg', role: 'group', 'aria-label': label }, opts.map(([v, t]) =>
      h('button', { type: 'button', class: 'small', 'aria-pressed': String(o[key] === v), onclick: () => { o[key] = v; paint(); } }, t))));
  const sel = (label, key, opts) => h('label', { class: 'field xp-field' }, label,
    h('select', { onchange: e => { o[key] = e.target.value; paint(); } }, opts.map(([v, t]) => h('option', { value: v, selected: o[key] === v }, t))));
  // ticked columns first, in their order (↑ ↓ move them), then the unticked ones
  const colList = (key, all) => {
    const on = o[key], off = all.filter(c => !on.includes(c.k));
    const move = (k, d) => { const a = [...on], i = a.indexOf(k), j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; o[key] = a; paint(); };
    const toggle = k => { o[key] = on.includes(k) ? on.filter(x => x !== k) : [...on, k]; if (!o[key].length) { o[key] = on; toast('Keep at least one column'); } paint(); };
    return h('ul', { class: 'xp-cols' },
      ...on.map((k, i) => { const c = all.find(x => x.k === k); return h('li', {},
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, onchange: () => toggle(k) }), c.name),
        h('button', { type: 'button', class: 'small icon-btn', 'aria-label': `Move ${c.name} left`, disabled: i === 0, onclick: () => move(k, -1) }, '↑'),
        h('button', { type: 'button', class: 'small icon-btn', 'aria-label': `Move ${c.name} right`, disabled: i === on.length - 1, onclick: () => move(k, 1) }, '↓')); }),
      ...off.map(c => h('li', { class: 'off' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: false, onchange: () => toggle(c.k) }), c.name))));
  };
  const paint = () => {
    const t = exportTables(S.cases, S.reflections || [], o, ctx);
    const n = [t.cases ? `${t.cases.rows.length} case${t.cases.rows.length === 1 ? '' : 's'}` : '', t.reflections ? `${t.reflections.rows.length} reflection${t.reflections.rows.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
    fill(body,
      seg('Include', 'what', [['both', 'Logbook + reflections'], ['logbook', 'Logbook'], ['reflections', 'Reflections']]),
      sel('Dates', 'range', [['all', 'All dates'], ['year', 'This residency year'], ['12m', 'The last 12 months'], ['custom', 'Choose dates']]),
      o.range === 'custom' ? h('div', { class: 'lb-grid' },
        h('label', { class: 'field xp-field' }, 'From', h('input', { type: 'date', value: o.from, onchange: e => { o.from = e.target.value; paint(); } })),
        h('label', { class: 'field xp-field' }, 'To', h('input', { type: 'date', value: o.to, onchange: e => { o.to = e.target.value; paint(); } }))) : null,
      t.cases ? h('div', { class: 'xp-sec' }, h('h3', {}, 'Logbook columns'),
        h('p', { class: 'hint help' }, 'Tick the columns you want; ↑ ↓ set the order (left to right in Excel).'),
        colList('caseCols', CASE_COLS),
        sel('Tags written as', 'tagStyle', [['full', 'Full name (Lower Segment Caesarean Section)'], ['short', 'Short name (LSCS)']]),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: o.summary, onchange: e => { o.summary = e.target.checked; } }), 'Add a Summary sheet (counts against targets)')) : null,
      t.reflections ? h('div', { class: 'xp-sec' }, h('h3', {}, 'Reflections'),
        sel('Which', 'reflWhich', [['all', 'All, drafts too'], ['complete', 'Complete only'], ['portfolio', 'Only those in the portfolio export']]),
        colList('reflCols', REFL_COLS)) : null,
      h('div', { class: 'xp-sec' }, h('h3', {}, 'Both'),
        h('div', { class: 'lb-grid' },
          sel('Dates written as', 'dateStyle', [['excel', 'Excel dates (10 Oct 2026)'], ['iso', 'Text (2026-10-10)']]),
          sel('Order', 'sort', [['oldest', 'Oldest first'], ['newest', 'Newest first']]))),
      h('p', { class: 'xp-count' }, n ? `${n}, ${rangeText(t.range)}.` : 'Nothing to include.'),
      t.cases && (t.range.from || t.range.to) ? h('p', { class: 'hint', style: 'margin:0' }, 'Uploading this file back only changes cases within these dates.') : null);
  };
  const go = async () => {
    const t = exportTables(S.cases, S.reflections || [], o, ctx);
    if (!(t.cases && t.cases.rows.length) && !(t.reflections && t.reflections.rows.length)) return toast('Nothing to include for these choices');
    patchLogbook({ settings: { excelExport: cleanExportOpts(o) } });
    try {
      await needExcel();
      const blob = await exportWorkbook(t, { name: displayName(), rYear: rYear(), rangeLabel: rangeText(t.range) });
      const kind = o.what === 'both' ? 'logbook-reflections' : o.what;
      download(`${kind}-${todayISO()}.xlsx`, blob);
      m.close();
    } catch (err) { toast('Could not make the file: ' + err.message); }
  };
  paint();
  const m = modal('Excel backup', [body,
    h('div', { class: 'bar dlg-actions' },
      h('button', { class: 'small linkish', onclick: () => { o = cleanExportOpts(null); paint(); } }, 'Reset'),
      h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'primary', onclick: go }, 'Download'))], { cls: 'full xport-dlg' });
}

// Upload a logbook from Excel (.xlsx) or a CSV file: match the file's columns to the case fields
// (guessed from the headers, or the names remembered from last time), see the first rows as they
// will be read, then review what changes before anything is saved.
export async function uploadExcel(file) {
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
      st.map.initials < 0 ? h('p', { class: 'hint', style: 'margin:0 0 6px' }, 'No Initials column: initials at the start of the case summary are split off.') : null,
      h('label', { class: 'field' }, 'Dates are written', h('select', { onchange: e => { st.monthFirst = e.target.value === 'mdy'; paint(); } },
        h('option', { value: 'dmy', selected: !st.monthFirst }, 'Day first (13/3/2026)'), h('option', { value: 'mdy', selected: st.monthFirst }, 'Month first (3/13/2026)'))),
      h('div', { class: 'chiplabel' }, 'How the first rows will be read'),
      h('div', { class: 'scroll' }, h('table', { class: 'map-preview' },
        h('thead', {}, h('tr', {}, ['Row', 'Date', 'Initials', 'Details', 'Tags'].map(t => h('th', {}, t)))),
        h('tbody', {}, parsed.map(({ r, c }) => h('tr', {},
          h('td', { class: 'muted' }, String(r.row)),
          h('td', { class: !c.date && c.dateText ? 'bad' : '' }, c.date ? fmtDate(c.date) : c.dateText ? `“${c.dateText}” ✗` : '—'),
          h('td', {}, c.initials || ''),
          h('td', {}, String(c.details || '').slice(0, 60)),
          h('td', { class: c.unknown.length ? 'bad' : '' }, [catPills(c.cats), c.unknown.length ? ` ✗ ${c.unknown.join(', ')}` : ''].join(''))))))),
      ok ? null : h('p', { class: 'tip' }, 'Choose at least the Date or the Case summary column.'));
    reviewBtn.disabled = !ok;
  };
  const reviewBtn = h('button', { class: 'primary', onclick: async () => {
    const rows = rowsFromGrid(rowsOf(), st.map, { headerRow: st.headerRow, monthFirst: st.monthFirst });
    // remember the column names for next time
    const head = st.headerRow ? rowsOf()[0] || [] : [];
    if (st.headerRow) patchLogbook({ settings: { importMap: Object.fromEntries(IMPORT_FIELDS.map(f => [f.k, st.map[f.k] >= 0 ? String(head[st.map[f.k]] ?? '') : ''])) } });
    await m.close();
    const d = diffRows(S.cases, rows);
    // a file limited to some dates: cases outside them were never in it, so never delete those
    const rg = grid.range || {};
    if (rg.from || rg.to) d.deleted = d.deleted.filter(c => c.date && (!rg.from || c.date >= rg.from) && (!rg.to || c.date <= rg.to));
    else if (!grid.exportedAt && d.deleted.length) {
      // a file without our export info (a CSV, or saved again by another app): its dates are unknown, so only
      // cases dated between the first and last case it holds can go (a year's export never empties earlier years)
      const ids = new Set(rows.map(r => r.id).filter(Boolean));
      const dates = S.cases.filter(c => ids.has(c.id) && c.date).map(c => c.date).sort();
      d.deleted = dates.length ? d.deleted.filter(c => c.date && c.date >= dates[0] && c.date <= dates[dates.length - 1]) : [];
    }
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

// (with parents, as saved cases always have them: a pasted "15i" matches a case with 15 and 15i)
const caseKey = c => `${c.date || c.dateText || ''}|${caseText(c).toLowerCase().replace(/\s+/g, ' ')}|${catText(withParents(c.cats || []))}`;

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
          // changed rows: each through the write queue with the case as it was here (a case changed on another device
          // since is kept, not overwritten); new ones in one batch
          const r = await updateMany(changed.map(x => ({ base: x.before, next: x.after })));
          if (r.stopped) return;   // (signed out or switched meanwhile)
          if (added.length) await saveMany(added);
          if (deleted.length) await moveToBin('case', deleted);   // recycle bin (bin agent): restorable for 30 days
          updatedToast(`Applied: ${r.saved} changed, ${added.length} new, ${deleted.length} deleted${deleted.length ? ' (in the recycle bin for 30 days)' : ''}`, r);
          after && after();
        } catch (err) { toast('Could not apply: ' + err.message); }
      } }, 'Apply')),
  ]);
}

