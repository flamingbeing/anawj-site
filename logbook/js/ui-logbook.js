// Logbook screen: every case, newest first (list) or by day (calendar). Search, filter, flags, edit; a grid view for bulk edits
// and pasting rows from Excel; Excel download and upload (round trip with a preview of the changes).

import { duplicates, fmtDate, diffRows, sortCodes, withParents, caseParts, caseText, dateWindow, nth, cleanInitials, procedureText, textHas, guessMapping, rowsFromGrid, IMPORT_FIELDS, caseFromRow, weekLead, weekdayNames } from './engine.js';
import { flagCase } from './importer.js';
import { exportWorkbook, readSheetGrid } from './xlsxio.js';
import { cleanExportOpts, exportTables, rangeText, CASE_COLS, REFL_COLS } from './export-opts.js';
import { inExport } from './reflections.js';
import { parseQuery, matchQuery, OPERATOR_HELP, insertOperator } from './search-ops.js';
import { parseCsv } from './tags.js';
import {
  S, h, toast, debounce, modal, cat, catName, catShort, tagName, catFull, catChip, PICKER_ORDER, settings, patchLogbook, needExcel, download, fileButton, catPills,
  updateCase, saveMany, deleteMany, displayName, rYear, todayISO, fill, add, resetters, tagSet, tagLinks, confirmBox, keepTags, hooks } from './ui-core.js';
import { flatTree, tagTree } from './tags.js';
import { editCaseDialog, logOnDate } from './ui-log.js';
import { reflectOnCase } from './ui-reflect.js';
import { moveToBin } from './bin.js';
import { shareText, copyText, caseText as shareCaseText, dayText } from './share.js';

// has: tags a case must all have; not: tags it must have none of ('c:16' or a personal tag key); from/to: dates
const FRESH = () => ({ q: '', has: [], not: [], from: '', to: '', flag: '', mode: null, limit: 150, month: null, day: null });
const view = FRESH();
resetters.push(() => Object.assign(view, FRESH()));   // next user starts unfiltered
// open the Logbook on a day (Settings → Logging → After Save: "Go to the Logbook"); ui-log.js calls it through hooks
hooks.showDay = iso => { view.month = iso.slice(0, 7); view.day = iso; };
const hasTag = (c, k) => (k.startsWith('c:') ? (c.cats || []).includes(k.slice(2)) : (c.tags || []).includes(k));
const keyName = k => (k.startsWith('c:') ? catShort(k.slice(2)) : tagName(k));
// Every tag to filter or bulk-tag by: the tag list, then tags taken off it that cases still carry
// (so they can be found and removed). -> [{ k, depth, label }]
function tagChoices() {
  const set = tagSet();
  const out = flatTree(tagTree(set)).filter(n => n.kind !== 'head').map(n => ({ k: n.e.k, depth: n.depth, label: keyName(n.e.k) }));
  const known = new Set(set.map(e => e.k)), gone = new Map();
  for (const c of S.cases || []) for (const k of c.tags || []) if (!known.has(k)) gone.set(k, (gone.get(k) || 0) + 1);
  for (const [k, n] of gone) out.push({ k, depth: 0, label: `${tagName(k)} (${n} case${n === 1 ? '' : 's'})` });
  return out;
}
// The text a case is searched by, worked out once per version of the case (logbooks run to thousands)
// (and again when your tags change: renamed tags are searched by their new names)
let hayCache = new WeakMap(), hayFor = null;
const MODES = [['calendar', 'Calendar'], ['list', 'List'], ['grid', 'Grid']];
// "2026-10-06" -> "Tue"
const weekday = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-GB', { weekday: 'short' }) : ''; };

// Tags in their short forms (full name on hover); a parent (e.g. 20) is left out when one of its sub-categories (20iii) is there.
function catTags(cats) {
  const codes = sortCodes(cats || []);
  const shown = codes.filter(c => !codes.some(o => o !== c && cat(o).parent === c));
  return h('span', { class: 'lb-tags' }, shown.map(c => h('span', { class: 'lb-tag', title: catFull(c) }, catShort(c))));
}

export function renderLogbook() {
  const wrap = h('div');
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
    const words = low(win ? win.rest : view.q).split(/\s+/).filter(Boolean);
    const ops = opsOn() && words.length ? parseQuery(win ? win.rest : view.q, { keepCase: cs }) : null;
    if (hayFor !== settings().tagSet) { hayCache = new WeakMap(); hayFor = settings().tagSet; }
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
      if (view.flag && !(view.flag === 'interesting' ? c.reflectTag : flagsOf(c).includes(view.flag))) return false;
      if (view.has.length && !view.has.every(k => hasTag(c, k))) return false;
      if (view.not.length && view.not.some(k => hasTag(c, k))) return false;
      if ((view.from || view.to) && !(c.date && (!view.from || c.date >= view.from) && (!view.to || c.date <= view.to))) return false;
      if (win && !(c.date && c.date >= win.from && c.date <= win.to)) return false;
      if (ops) return matchQuery(ops, k => (k === 'all' ? hayOf(c) : partsOf(c, cs)[k]), t => tagHas(c, t), (hay, w, f) => textHas(hay, w, fuzzy && f !== 'initials' && (f || scope !== 'initials')));
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
  const paint = () => {
    const rows = filtered();
    fill(list, view.mode === 'grid' ? gridView(rows, paint) : view.mode === 'calendar' ? calendarView(rows, flagsOf, paint) : listView(rows, flagsOf, paint));
    counter.textContent = rows.length === S.cases.length ? `${S.cases.length} cases` : `${rows.length} of ${S.cases.length} cases`;
    bulkBtn.textContent = `Tag ${rows.length === S.cases.length ? 'all ' : ''}${rows.length} case${rows.length === 1 ? '' : 's'}…`; bulkBtn.disabled = !rows.length;
  };
  const paintSoon = debounce(() => { view.limit = 150; paint(); }, 150);

  const nFlag = f => S.cases.filter(c => flagsOf(c).includes(f)).length;
  const flagOpts = [['', 'All cases'], ['needsDate', `Needs a date (${nFlag('needsDate')})`], ['duplicate', `Possible duplicates (${nFlag('duplicate')})`], ['future', `Upcoming (${nFlag('future')})`], ['interesting', `☆ Interesting (${S.cases.filter(c => c.reflectTag).length})`]];
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
  const bulkBtn = h('button', { class: 'small', onclick: () => bulkTag(filtered()) });
  const flagSel = h('select', { 'aria-label': 'Filter by flag', onchange: e => { view.flag = e.target.value; refresh(); } },
    flagOpts.map(([v, l]) => h('option', { value: v, selected: view.flag === v }, l)));
  // compact: two columns on a phone, so the panel doesn't fill the screen
  const cell = (label, ...kids) => h('div', { class: 'lb-cell' }, h('span', { class: 'lb-fl' }, label), ...kids);
  const resetBtn = resetLink();
  // Dates, Tags and More fold behind one row of small toggles (a fold opens by itself while in use);
  // the toggles say what is set ("1 Oct – 31 Oct", "Tags (2)")
  const fold = (body, open) => {
    const b = h('button', { type: 'button', class: 'small lb-fold', 'aria-expanded': String(!!open), onclick: () => { body.hidden = !body.hidden; b.setAttribute('aria-expanded', String(!body.hidden)); } });
    body.hidden = !open;
    return b;
  };
  const datePanel = h('div', { class: 'lb-grid lb-panel' }, cell('From', dateIn('from')), cell('To', dateIn('to')));
  const tagPanel = h('div', { class: 'lb-grid lb-panel' }, cell('Has all of', hasRow), cell('Has none of', notRow));
  const morePanel = h('div', { class: 'lb-panel' },
    h('div', { class: 'bar lb-fbar' }, fuzzyBox, caseBox),
    h('div', { class: 'bar lb-fbar', style: 'margin:0' }, h('button', { class: 'small', title: 'Save this search', onclick: saveSearch }, '☆ Save search'), bulkBtn));
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
  const filters = h('div', { class: 'lb-filters', hidden: !(view.showFilters || active()) },
    h('div', { class: 'lb-grid' }, cell('Show', flagSel), cell('Search in', searchIn)),
    h('div', { class: 'bar lb-folds' }, dateBtn, tagBtn, moreBtn, resetBtn),
    datePanel, tagPanel, morePanel);
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
    fill(savedRow, ...list.map(x => h('span', { class: 'chip tmpl', role: 'button', tabindex: '0', title: 'Run this search' + (x.q ? `: “${x.q}”` : ''), onclick: () => {
      Object.assign(view, { q: x.q || '', has: [...(x.has || [])], not: [...(x.not || [])], from: x.from || '', to: x.to || '', flag: x.flag || '' });
      setBox(view.q);
      if (x.scope) setOpts(x.scope, !!settings().lbFuzzy);
      const [f, t] = filters.querySelectorAll('input[type=date]'); if (f) f.value = view.from; if (t) t.value = view.to;
      filters.hidden = false; refresh();
    } }, '★ ' + x.name, h('span', { class: 'x', role: 'button', tabindex: '0', 'aria-label': 'Delete saved search', onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); e.target.click(); } }, onclick: async e => {
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
  function refresh() { flagSel.value = view.flag; paintFilterBtn(); repaintFilters(); view.limit = 150; paint(); }
  function active() { return !!(view.has.length || view.not.length || view.from || view.to || view.flag || (settings().lbScope || 'all') !== 'all' || settings().lbFuzzy || settings().lbCase); }
  const filterBtn = h('button', { class: 'small', 'aria-expanded': String(!filters.hidden), onclick: () => {
    view.showFilters = filters.hidden; filters.hidden = !filters.hidden; filterBtn.setAttribute('aria-expanded', String(!filters.hidden));
  } });
  const paintFilterBtn = () => {
    const n = view.has.length + view.not.length + (view.from || view.to ? 1 : 0) + (view.flag ? 1 : 0) + ((settings().lbScope || 'all') !== 'all' ? 1 : 0) + (settings().lbFuzzy ? 1 : 0) + (settings().lbCase ? 1 : 0);
    filterBtn.textContent = n ? `Filter (${n})` : 'Filter'; filterBtn.classList.toggle('primary', !!n);
  };
  // the search box, with its own × that empties just the box (filters stay)
  const searchBox = h('input', { type: 'search', placeholder: 'Search cases, or “last Tuesday”', value: view.q, 'aria-label': 'Search cases',
    oninput: e => { view.q = e.target.value; searchWrap.classList.toggle('has-text', !!view.q); paintOpsNote(); paintSoon(); } });
  const searchWrap = h('div', { class: 'search-wrap grow' + (view.q ? ' has-text' : '') }, searchBox,
    h('button', { type: 'button', class: 'search-x', title: 'Clear the search', 'aria-label': 'Clear the search', onclick: () => { view.q = ''; setBox(''); searchBox.focus(); refresh(); } }, '×'));
  function setBox(v) { searchBox.value = v; searchWrap.classList.toggle('has-text', !!v); paintOpsNote(); }
  const opsNote = h('p', { class: 'hint lb-opsnote', hidden: true });
  const paintOpsNote = () => {
    const u = opsOn() && view.q ? parseQuery(view.q).unknown : [];
    opsNote.hidden = !u.length;
    opsNote.textContent = u.map(x => `“${x.op}” isn’t an operator (searched as text): did you mean ${x.suggest}?`).join(' ');
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
      counter, h('span', { class: 'grow' }),
      h('div', { class: 'seg' }, MODES.map(([m, l]) =>
        h('button', { 'aria-pressed': String(view.mode === m), onclick: () => setMode(m) }, l)))));
  // pinned (Settings → Display): the month headings in List stick just under it
  if ('ResizeObserver' in window) new ResizeObserver(() => wrap.style.setProperty('--lb-top-h', top.offsetHeight + 'px')).observe(top);
  add(wrap, top, h('section', { class: 'card' }, list));
  paint();
  return wrap;

  function setMode(m) {
    view.mode = m; view.limit = 150; paint();
    wrap.querySelectorAll('.seg button').forEach((b, i) => b.setAttribute('aria-pressed', String(MODES[i][0] === m)));
    if (settings().logbookView !== m) patchLogbook({ settings: { logbookView: m } });  // remembered per user
  }
}

// Add a tag to, or take one off, every case in the search results.
function bulkTag(rows) {
  if (!rows.length) return;
  const tags = tagChoices();
  const act = h('select', {}, h('option', { value: 'add' }, 'Add'), h('option', { value: 'remove' }, 'Remove'));
  const sel = h('select', {}, h('option', { value: '' }, 'Choose a tag…'), tags.map(n => h('option', { value: n.k }, `${'  '.repeat(Math.min(n.depth, 3))}${n.label}`)));
  const m = modal(`Tag ${rows.length} case${rows.length === 1 ? '' : 's'}`, [
    h('p', { class: 'hint help' }, 'Applies to every case in the current search results.'),
    h('div', { class: 'bar', style: 'gap:8px' }, act, sel),
    h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'primary', onclick: async () => {
        const k = sel.value; if (!k) return toast('Choose a tag');
        const add = act.value === 'add', code = k.startsWith('c:') ? k.slice(2) : null;
        const next = rows.filter(c => hasTag(c, k) !== add).map(c => {
          const out = { ...c, updatedAt: Date.now() };
          if (code) {
            out.cats = add ? sortCodes(withParents([...(c.cats || []), code])) : (c.cats || []).filter(x => x !== code && cat(x).parent !== code);
            // your tags that sit under a removed APMES tag go with it (as in the edit dialog)
            if (!add) { out.tags = keepTags(c.tags, out.cats); if (!out.tags.length) delete out.tags; }
          } else {
            out.tags = add ? [...new Set([...(c.tags || []), k])] : (c.tags || []).filter(x => x !== k);
            if (add) out.cats = sortCodes(withParents([...(c.cats || []), ...tagLinks(k)]));   // a tag that counts towards APMES ticks them
            if (!out.tags.length) delete out.tags;
          }
          return out;
        });
        m.close();
        if (!next.length) return toast(add ? 'They all have it already' : 'None of them have it');
        if (!(await confirmBox('Change cases?', `${add ? 'Add' : 'Remove'} “${keyName(k)}” ${add ? 'to' : 'from'} ${next.length} case${next.length === 1 ? '' : 's'}?`, add ? 'Add' : 'Remove', !add))) return;
        try { await saveMany(next); toast(`${next.length} case${next.length === 1 ? '' : 's'} updated`); } catch (err) { toast('Could not save: ' + err.message); }
      } }, 'Apply'))]);
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
function caseRow(c, flagsOf) {
  const flags = flagsOf(c);
  const p = caseParts(c);
  return h('li', { 'data-date': c.date || '', onclick: () => editCaseDialog(c), tabindex: '0', onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) editCaseDialog(c); } },
      h('span', { class: 'd' }, c.date ? [h('span', { class: 'wd' }, weekday(c.date)), ' ', fmtDate(c.date).replace(/ \d{4}$/, '').replace(/^(\d+)/, (_, d) => nth(Number(d)))] : (c.dateText || '—')),
      h('span', { class: 't' }, p.initials ? [h('b', {}, p.initials), ' '] : null, p.details || (p.initials ? null : h('i', { class: 'muted' }, 'no details'))),
      h('span', { class: 'c' }, catTags(c.cats),
        flags.includes('needsDate') ? h('span', { class: 'flag err' }, 'needs date') : null,
        flags.includes('future') ? h('span', { class: 'flag', title: 'Dated after today' }, 'upcoming') : null,
        flags.includes('duplicate') ? h('span', { class: 'flag' }, 'possible duplicate') : null,
        !(c.cats || []).length ? h('span', { class: 'flag err' }, 'no tag') : null,
        c.reflectTag ? h('span', { class: 'flag', title: 'Marked interesting' }, '☆ interesting') : null,
        (c.tags || []).map(t => h('span', { class: 'flag sc-tag', title: 'Your tag' }, tagName(t))),
        // to your own notes (paste into WhatsApp, Notes, Obsidian)
        h('button', { class: 'small', style: 'margin-left:auto', title: 'Copy this case', 'aria-label': 'Copy this case', onclick: e => { e.stopPropagation(); copyText(shareCaseText(c), 'Case copied: paste it into your notes'); } }, 'Copy'),
        h('button', { class: 'small', title: 'Write a reflection on this case', onclick: e => { e.stopPropagation(); reflectOnCase(c); } },
          (S.reflections || []).some(r => r.caseId === c.id) ? 'Reflection' : 'Reflect')));
}

// ---------- calendar ----------

const pad = n => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function calendarView(rows, flagsOf, repaint) {
  if (!S.cases.length) return h('div', { class: 'empty' }, h('p', {}, 'No cases yet.'), h('a', { class: 'btn primary', href: '#log' }, 'Log your first case'));
  const today = todayISO();
  // opens on the latest day with cases up to today (today when there are none), so the list under it isn't empty
  if (!view.month) {
    const last = S.cases.map(c => c.date).filter(d => d && d <= today).sort().pop() || today;
    view.month = last.slice(0, 7); if (!view.day) view.day = last;
  }
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
  const grid = h('div', { class: 'lb-cal', role: 'grid' }, weekdayNames(ws).map(d => h('div', { class: 'lb-dow' }, d)));
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
      h('strong', { class: 'grow', style: 'text-align:center' }, `${MONTHS[m - 1]} ${y}`, h('span', { class: 'muted', style: 'font-weight:400;font-size:calc(13px * var(--fs, 1))' }, ` · ${monthN} case${monthN === 1 ? '' : 's'}`)),
      h('button', { class: 'small icon-btn', 'aria-label': 'Next month', onclick: () => shift(1) }, '›'),
      h('button', { class: 'small', onclick: () => { view.month = today.slice(0, 7); view.day = today; repaint(); } }, 'Today')),
    grid,
    view.day ? h('div', { style: 'margin-top:12px' },
      // the day, then its buttons together on one row (none left alone on a line of its own)
      h('div', { class: 'lb-dayhead' },
        h('h3', { style: 'margin:0' }, `${fmtDate(view.day)} (${dayCases.length})`),
        h('div', { class: 'lb-daybtns' },
          // log on this day: the Log page opens with the date already picked
          h('button', { class: 'small primary', onclick: () => logOnDate(view.day) }, '+ Log a case'),
          dayCases.length ? h('button', { class: 'small', onclick: () => shareText(dayText(view.day, dayCases)) }, 'Share day') : null,
          dayCases.length ? h('button', { class: 'small', title: 'Copy this day (format in Settings → Markdown)', 'aria-label': 'Copy this day', onclick: () => copyText(dayText(view.day, dayCases), 'Day copied: paste it into your notes') }, 'Copy') : null)),
      dayCases.length ? h('ul', { class: 'cases' }, dayCases.map(c => caseRow(c, flagsOf))) : h('p', { class: 'empty' }, 'No cases on this day.'))
      : h('p', { class: 'hint help', style: 'margin-top:10px' }, 'Tap a day to see its cases.'),
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
      h('td', { class: 'cats' }, h('button', { type: 'button', class: 'grid-cats', 'aria-label': 'Tags: change', onclick: () => editCaseDialog(c) },
        (c.cats || []).length ? catPills(c.cats) : h('span', { class: 'flag err' }, 'no tag'))));
    add(tbody, tr);
  }
  const more = rows.length > view.limit ? h('button', { onclick: () => { view.limit += 300; repaint(); } }, `Show more (${rows.length - view.limit} left)`) : null;
  return h('div', {},
    h('p', { class: 'hint help' }, 'Edit the date, initials and details directly; changes save when you leave a cell. Tap the tags to change them.'),
    h('div', { class: 'scroll' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Initials'), h('th', {}, 'Case summary'), h('th', {}, 'Tags'))), tbody)),
    more,
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
    h('div', { class: 'ops-pick' }, list.map(([op, what, insert, at]) => h('button', { type: 'button', class: 'ops-row', onclick: () => {
      const r = insertOperator(box.value, caret, insert, at);
      m.close();
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
  const reviewBtn = h('button', { class: 'primary', onclick: () => {
    const rows = rowsFromGrid(rowsOf(), st.map, { headerRow: st.headerRow, monthFirst: st.monthFirst });
    // remember the column names for next time
    const head = st.headerRow ? rowsOf()[0] || [] : [];
    if (st.headerRow) patchLogbook({ settings: { importMap: Object.fromEntries(IMPORT_FIELDS.map(f => [f.k, st.map[f.k] >= 0 ? String(head[st.map[f.k]] ?? '') : ''])) } });
    m.close();
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
          const writes = [...changed.map(x => x.after), ...added];
          if (writes.length) await saveMany(writes);
          if (deleted.length) await moveToBin('case', deleted);   // recycle bin (bin agent): restorable for 30 days
          toast(`Applied: ${changed.length} changed, ${added.length} new, ${deleted.length} deleted${deleted.length ? ' (in the recycle bin for 30 days)' : ''}`);
          after && after();
        } catch (err) { toast('Could not apply: ' + err.message); }
      } }, 'Apply')),
  ]);
}

