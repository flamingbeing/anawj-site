// Log screen: the heart of the app. Date + details + categories, saved in a couple of taps.
// Also the reusable category picker and the edit-case dialog (used by the Logbook screen).

import { BY_CODE, TIPS } from './categories.js';
import { withParents, frequentCombos, parseBulk, parseDate, fmtDate, sortCodes, uid, caseParts, caseText, cleanInitials } from './engine.js';
import { suggest } from './suggest.js';
import {
  S, h, toast, debounce, modal, confirmBox, cat, catName, catFull, catChip, countText, PICKER_ORDER, PROGRESS_BY_CODE,
  createCase, updateCase, removeCase, restoreCase, saveMany, settings, todayISO, hooks, fill, add, cloud } from './ui-core.js';
import { moveToBin } from './bin.js';

const DRAFT_KEY = 'logbook-draft-v2';
const KEEP_MS = 12 * 3600e3; // a date kept by "Save, keep date" lasts this long
const yesterdayISO = () => { const d = new Date(); d.setDate(d.getDate() - 1); return todayISO(d); };

// The unsent draft survives tab switches and reloads (this browser only). It is kept per account
// (and apart from the demo), so the next person on a shared phone never sees it; sign-out wipes it.
const EMPTY = () => ({ date: null, details: '', cats: [], mode: 'one', bulk: '' });
let draft = EMPTY(), draftOwner = null;
const draftKey = () => `${DRAFT_KEY}:${cloud.demo ? 'demo:' : ''}${(S.user && S.user.email) || ''}`;
function loadDraft() {
  if (draftOwner === draftKey()) return;
  draftOwner = draftKey(); draft = EMPTY(); bulkRows = null;
  try { draft = { ...draft, ...JSON.parse(localStorage.getItem(draftOwner) || '{}') }; } catch { /* storage unavailable */ }
  // a kept date only lasts for one sitting, never into tomorrow's list
  if (!draft.keepDate || !(Date.now() - (draft.keptAt || 0) < KEEP_MS)) draft.date = null;
}
const saveDraft = debounce(() => { try { localStorage.setItem(draftKey(), JSON.stringify(draft)); } catch { /* ignore */ } }, 300);
export function clearDrafts() {
  saveDraft.cancel();
  draft = EMPTY(); draftOwner = null; bulkRows = null; ui = null;
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('logbook-draft-')) localStorage.removeItem(k); } catch { /* ignore */ }
}

// ---------- selection helpers ----------

// Adding a sub-category adds its parent; removing a parent removes its sub-categories.
function addCat(list, code) { return sortCodes(withParents([...list, code])); }
function dropCat(list, code) { return list.filter(c => c !== code && BY_CODE[c]?.parent !== code); }
const toggleCat = (list, code) => (list.includes(code) ? dropCat(list, code) : addCat(list, code));

// ---------- category picker (search + grouped list) ----------

// opts.get(): current codes; opts.toggle(code); opts.autofocus. Returns { el, refresh, focus }.
// Picking a category repaints the selected chips, suggestions and quick picks above, which changes
// their height. Keep whatever was tapped (or its group) at the same place on screen, so several
// categories can be tapped in a row without the page jumping.
function keepPlace(anchor, fn) {
  const before = anchor && anchor.isConnected ? anchor.getBoundingClientRect().top : null;
  const inner = anchor && anchor.scrollTop;
  fn();
  if (before == null || !anchor.isConnected) return;
  if (inner) anchor.scrollTop = inner;
  const d = anchor.getBoundingClientRect().top - before;
  if (d) window.scrollBy(0, d);
}
// On phones, focusing the details box pops the keyboard and scrolls back up: only do it with a mouse.
const refocus = () => { if (ui.textarea && matchMedia('(pointer: fine)').matches) ui.textarea.focus({ preventScroll: true }); };

export function catPicker({ get, toggle, placeholder = 'Search categories: code or name' }) {
  let q = '', hl = 0, items = [];
  const list = h('ul', { role: 'listbox' });
  const input = h('input', {
    type: 'search', placeholder, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done',
    oninput: e => { q = e.target.value; hl = 0; refresh(); },
    onkeydown: e => {
      if (e.key === 'ArrowDown') { hl = Math.min(items.length - 1, hl + 1); paintHl(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { hl = Math.max(0, hl - 1); paintHl(); e.preventDefault(); }
      else if (e.key === 'Enter' && q.trim()) {
        e.preventDefault();
        if (items[hl]) { toggle(items[hl].code); q = ''; input.value = ''; hl = 0; refresh(); }
      } else if (e.key === 'Escape') { q = ''; input.value = ''; refresh(); }
    },
  });
  function matches(c, words) {
    const hay = `${c.code} ${c.name} ${c.label}`.toLowerCase();
    return words.every(w => (/^\d/.test(w) ? c.code.startsWith(w.padStart(2, '0')) || c.code.startsWith(w) : hay.includes(w)));
  }
  function paintHl() {
    [...list.children].forEach((li, i) => li.classList.toggle('hl', i === hl && !!q.trim()));
    list.children[hl]?.scrollIntoView({ block: 'nearest' });
  }
  function refresh() {
    const sel = new Set(get());
    const prog = PROGRESS_BY_CODE();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    items = words.length ? PICKER_ORDER.filter(c => matches(c, words)) : PICKER_ORDER;
    fill(list, ...items.map(c => {
      const p = prog[c.code];
      return h('li', {
        role: 'option', 'aria-selected': String(sel.has(c.code)), class: `${c.parent ? 'sub' : ''} ${sel.has(c.code) ? 'on' : ''}`, title: c.full || c.name,
        onclick: () => keepPlace(list, () => { toggle(c.code); refresh(); }),
      },
      h('span', { class: 'tick' }, sel.has(c.code) ? '✓' : ''),
      h('span', { class: 'code' }, c.code),
      h('span', { class: 'nm' }, c.name),
      h('span', { class: `ct ${p && p.status === 'done' ? 'met' : ''}` }, countText(c.code, prog)));
    }));
    if (!items.length) add(list, h('li', { class: 'muted' }, 'No category matches “' + q + '”'));
    paintHl();
  }
  refresh();
  const el = h('div', { class: 'picker' }, input, list);
  return { el, refresh, focus: () => input.focus(), input };
}

// ---------- the Log screen ----------

let ui = null; // live parts of the screen, so a case-list update doesn't wipe what's being typed

export function renderLog() {
  loadDraft();
  const card = h('section', { class: 'card log-card' });
  const datebar = h('div', { class: 'datebar', id: 'datebar' });
  add(card, datebar);
  ui = { card, datebar };
  if (draft.mode === 'bulk') renderBulk(card);
  else renderOne(card);
  paintDate();
  return card;
}

function setMode(m) { draft.mode = m; saveDraft(); hooks.render(); }

function curDate() { return draft.date || todayISO(); }

function paintDate() {
  const d = curDate(), t = todayISO(), y = yesterdayISO();
  const dateInput = h('input', {
    type: 'date', value: d, max: t, 'aria-label': 'Case date',
    onchange: e => { draft.date = parseDate(e.target.value) || null; saveDraft(); paintDate(); },
  });
  const pick = iso => () => { draft.date = iso === t ? null : iso; saveDraft(); paintDate(); ui.textarea?.focus(); };
  const other = d !== t && d !== y;
  // the date input sits invisibly over a chip, so the row stays one line on a phone
  const picker = h('label', { class: `chip datepick ${other ? 'on' : ''}`, title: 'Pick a date' }, other ? fmtDate(d) : '📅 Date', dateInput);
  dateInput.addEventListener('click', () => { try { dateInput.showPicker(); } catch { /* not supported: native tap opens it */ } });
  fill(ui.datebar,
    h('span', { class: `chip ${d === t ? 'on' : ''}`, role: 'button', tabindex: '0', onclick: pick(t) }, 'Today'),
    h('span', { class: `chip ${d === y ? 'on' : ''}`, role: 'button', tabindex: '0', onclick: pick(y) }, 'Yesterday'),
    picker,
    draft.mode === 'bulk'
      ? h('button', { class: 'small linkish', 'data-mode': 'one', onclick: () => setMode('one') }, 'One case')
      : h('button', { class: 'small linkish', 'data-mode': 'bulk', onclick: () => setMode('bulk'), title: 'Paste a list of cases' }, 'Paste list'));
}

function renderOne(card) {
  const textarea = h('textarea', {
    class: 'details', rows: '3', autofocus: true, enterkeyhint: 'enter', autocapitalize: 'sentences', autocorrect: 'off', 'aria-label': 'Case details',
    placeholder: 'Initials + case, e.g. “AB 72M lap chole GA” or “CD LSCS spinal”',
    value: draft.details,
    oninput: e => { draft.details = e.target.value; saveDraft(); suggestSoon(); },
    // on a phone the keyboard takes half the screen: bring the box to the top so the chips show below it
    onpointerup: e => { if (e.pointerType === 'touch') setTimeout(() => e.target.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300); },
    // Enter is a new line (a case can take several lines); Ctrl+Enter / Cmd+Enter saves
    onkeydown: e => {
      if (e.key !== 'Enter' || e.isComposing || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      save({ another: e.altKey });
    },
  });
  const sugg = h('div', { class: 'chips', 'aria-live': 'polite' });
  const selected = h('div', { class: 'chips selected' });
  const tip = h('div');
  const templates = h('div', { class: 'chips' });
  const top = h('div', { class: 'chips' });
  const picker = catPicker({
    get: () => draft.cats,
    toggle: code => { draft.cats = toggleCat(draft.cats, code); saveDraft(); paintSel(); },
  });
  const actions = h('div', { class: 'actions' },
    h('button', { class: 'primary big', onclick: () => save({}) }, 'Save', h('span', { class: 'kbd', title: 'Ctrl+Enter (Cmd+Enter on a Mac)' }, ' Ctrl+⏎')),
    h('button', { class: 'big', title: 'Save and keep this date for the next case', onclick: () => save({ another: true }) }, 'Save, keep date'));

  add(card, 
    textarea,
    h('div', { class: 'chiplabel', id: 'suggLabel' }, 'Suggested'), sugg,
    h('div', { class: 'chiplabel' }, 'Selected'), selected, tip,
    actions,
    h('div', { class: 'chiplabel' }, 'Quick picks'), templates,
    h('div', { class: 'chiplabel', id: 'topLabel' }, 'Your top categories'), top,
    h('div', { class: 'chiplabel' }, 'All categories'), picker.el);
  Object.assign(ui, { textarea, sugg, selected, tip, templates, top, picker });
  paintSuggest(); paintSel(); paintQuick();
  // autofocus attribute is ignored on re-render; focus after insertion (not on phones' first paint
  // when that would pop the keyboard over a fresh landing — it's what the user came to do, so do it)
  requestAnimationFrame(() => { if (document.activeElement === document.body || !document.activeElement) textarea.focus({ preventScroll: true }); });
}

const suggestSoon = debounce(() => paintSuggest(), 120);

function paintSuggest() {
  if (!ui || !ui.sugg) return;
  const on = settings().suggestions !== false;
  ui.card.querySelector('#suggLabel').hidden = !on;
  ui.sugg.hidden = !on;
  if (!on) return;
  const text = draft.details.trim();
  const list = text ? suggest(text, { limit: 8 }).filter(s => !draft.cats.includes(s.code)) : [];
  const strong = list.filter(s => s.score >= 0.5).map(s => s.code);
  const all = strong.length > 1 ? h('span', { class: 'chip sugg strong all', role: 'button', tabindex: '0', title: 'Add all the confident suggestions',
    onclick: () => { keepPlace(ui.selected, () => { draft.cats = sortCodes(withParents([...draft.cats, ...strong])); saveDraft(); paintSel(); }); refocus(); } }, '+ All ' + strong.length) : null;
  fill(ui.sugg, all, ...(list.length ? list.map(s => catChip(s.code, {
    cls: `sugg ${s.score >= 0.5 ? 'strong' : ''}`,
    title: `${catFull(s.code)} — ${s.why === 'age' ? 'from the age' : s.why === 'bmi' ? 'from the BMI' : 'from your words'}`,
    onclick: () => { keepPlace(ui.sugg, () => { draft.cats = addCat(draft.cats, s.code); saveDraft(); paintSel(); }); refocus(); },
  })) : [h('span', { class: 'muted', style: 'font-size:13px' }, text ? 'No suggestions — search below.' : 'Start typing to see suggestions.')]));
}

function paintSel() {
  if (!ui || !ui.selected) return;
  fill(ui.selected, ...(draft.cats.length
    ? draft.cats.map(code => catChip(code, { on: true, removable: true, cls: 'add', title: 'Remove ' + catFull(code),
      onclick: () => keepPlace(ui.selected, () => { draft.cats = dropCat(draft.cats, code); saveDraft(); paintSel(); }) }))
    : [h('span', { class: 'none' }, 'None yet — tap a suggestion, a quick pick or search below.')]));
  const tips = draft.cats.filter(c => TIPS[c]).map(c => TIPS[c]);
  fill(ui.tip, ...tips.map(t => h('p', { class: 'tip' }, t)));
  paintSuggest();
  ui.picker.refresh();
  paintTop();
}

function paintTop() {
  const top = Object.entries(S.counts).filter(([c]) => BY_CODE[c] && !BY_CODE[c].retired && !draft.cats.includes(c))
    .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
  ui.card.querySelector('#topLabel').hidden = !top.length;
  fill(ui.top, ...top.map(code => catChip(code, {
    onclick: () => keepPlace(ui.top, () => { draft.cats = addCat(draft.cats, code); saveDraft(); paintSel(); }),
  })));
}

const lastCase = () => S.cases.reduce((best, c) => (!best || (c.createdAt || 0) > (best.createdAt || 0) ? c : best), null);

function applyTemplate(t) {
  draft.cats = sortCodes(withParents([...draft.cats, ...t.cats]));
  if (t.details && !draft.details.trim()) { draft.details = t.details + ' '; ui.textarea.value = draft.details; }
  keepPlace(ui.templates, () => { saveDraft(); paintSel(); }); refocus();
}

function paintQuick() {
  if (!ui || !ui.templates) return;
  const chips = [];
  const last = lastCase();
  if (last && last.cats && last.cats.length) {
    chips.push(h('span', {
      class: 'chip tmpl', role: 'button', tabindex: '0', title: 'Same categories as your last case: ' + last.cats.map(catFull).join(', '),
      onclick: () => {
        draft.cats = sortCodes(withParents(last.cats));
        // its date too, but only when it was logged in this sitting (not yesterday evening's list)
        if (last.date && Date.now() - (last.createdAt || 0) < KEEP_MS / 3) draft.date = last.date === todayISO() ? null : last.date;
        keepPlace(ui.templates, () => { saveDraft(); paintDate(); paintSel(); }); refocus();
      },
    }, '↻ Same as last', h('span', { class: 'muted', style: 'font-size:12px' }, ' ' + last.cats.join(' + '))));
  }
  const seen = new Set();
  const tmplChip = (t, name) => {
    const key = sortCodes(t.cats).join(',');
    if (!t.cats || !t.cats.length || (!name && seen.has(key))) return null;
    seen.add(key);
    return h('span', { class: 'chip tmpl', role: 'button', tabindex: '0', title: t.cats.map(catFull).join('\n'), onclick: () => applyTemplate(t) },
      name ? h('b', {}, name) : null, h('span', { class: name ? 'muted' : '', style: name ? 'font-size:12px' : '' }, (name ? ' ' : '') + sortCodes(t.cats).join(' + ')));
  };
  for (const t of (S.logbook && S.logbook.templates) || []) chips.push(tmplChip(t, t.name));
  for (const t of S.sharedTemplates || []) chips.push(tmplChip(t, t.name));
  for (const t of frequentCombos(S.cases, { min: 3, limit: 6 })) if (t.cats.length > 1) chips.push(tmplChip(t));
  const list = chips.filter(Boolean);
  fill(ui.templates, ...(list.length ? list : [h('span', { class: 'muted', style: 'font-size:13px' }, 'Your common combinations will appear here.')]));
}

async function save({ another }) {
  const details = draft.details.trim();
  if (!draft.cats.length) {
    // categories are counted towards credentialling, so they must be picked on purpose
    toast('Tap at least one category (suggestions are above)'); ui.picker.focus({ preventScroll: true }); return;
  }
  if (!details && !(await confirmBox('No case details', 'Save this case without initials or details?', 'Save'))) return;
  const c = await createCase({ date: curDate(), details, cats: draft.cats });
  const sticky = another || settings().defaultDate === 'last';
  const keep = sticky ? draft.date : null;
  draft = { ...draft, details: '', cats: [], date: keep, keepDate: sticky, keptAt: Date.now() };
  saveDraft();
  if (ui.textarea) ui.textarea.value = '';
  paintDate(); paintSel(); paintQuick();
  ui.textarea.focus();
  toast(`Saved ${fmtDate(c.date)} · ${c.cats.join(', ')}`, {
    action: 'Undo',
    onaction: () => {
      removeCase(c.id);
      // put the case back in the box, unless the next one is already being typed
      if (draft.details.trim() || draft.cats.length) return;
      draft = { ...draft, details: caseText(c), cats: c.cats, date: c.date === todayISO() ? null : c.date };
      saveDraft();
      if (S.tab === 'log' && ui.textarea) { ui.textarea.value = draft.details; paintDate(); paintSel(); paintQuick(); }
    },
  });
}

// Case list changed (live listener): refresh counts and quick picks without touching the textarea.
export function logCasesChanged() {
  if (!ui || !ui.card.isConnected) return;
  if (ui.picker) { ui.picker.refresh(); paintTop(); paintQuick(); }
}

// ---------- paste a list ----------

let bulkRows = null;

function renderBulk(card) {
  const ta = h('textarea', {
    class: 'details', rows: '8', value: draft.bulk || '',
    placeholder: 'Separate cases with an empty line. An optional date at the start, e.g.\n12/3 AB 5yo circumcision caudal\n\n13/3 CD LSCS spinal\nconverted to GA\n\nEF 80F hemiarthroplasty',
    oninput: e => { draft.bulk = e.target.value; saveDraft(); },
  });
  const out = h('div');
  add(card, 
    h('p', { class: 'hint' }, 'Paste your notes. Separate cases with an empty line (a case can take several lines); categories are guessed for each case. Cases without a date at the start get ', h('b', {}, fmtDate(curDate())), ' (change it above).'),
    ta,
    h('div', { class: 'bar', style: 'margin-top:8px' },
      h('button', { class: 'primary', onclick: () => { bulkRows = parseBulk(ta.value, t => suggest(t)); paintBulk(out); } }, 'Review'),
      h('button', { onclick: () => { ta.value = ''; draft.bulk = ''; bulkRows = null; saveDraft(); fill(out); } }, 'Clear')),
    out);
  if (bulkRows) paintBulk(out);
}

function paintBulk(out) {
  if (!bulkRows || !bulkRows.length) { fill(out, h('p', { class: 'empty' }, 'Nothing to review — paste some cases first.')); return; }
  const def = curDate();
  const missing = bulkRows.filter(r => !r.cats.length).length;
  const on = settings().suggestions !== false;
  const tbody = h('tbody', {}, bulkRows.map((r, i) => {
    // "Same as above": the categories of the case above, in one tap, when they are not all here already
    const above = i > 0 ? bulkRows[i - 1].cats : [];
    const same = above.length && !above.every(c => r.cats.includes(c)) ? h('span', {
      class: 'chip tmpl same', role: 'button', tabindex: '0', title: 'Add the categories of the case above: ' + above.map(catFull).join(', '),
      onclick: () => { r.cats = sortCodes(withParents([...r.cats, ...above])); paintBulk(out); },
    }, 'Same as above: ', h('b', {}, sortCodes(above).join(' + '))) : null;
    const sugg = on && r.details.trim() ? suggest(r.details, { limit: 4 }).filter(s => !r.cats.includes(s.code)) : [];
    return h('tr', {},
      h('td', {}, h('input', { type: 'date', value: r.date || def, max: todayISO(), onchange: e => { r.date = parseDate(e.target.value); } })),
      h('td', { class: 'details' },
        h('input', { value: r.initials || '', placeholder: 'Initials', 'aria-label': 'Patient initials', autocapitalize: 'characters', maxlength: '20', oninput: e => { r.initials = e.target.value; } }),
        h('textarea', { rows: String(Math.min(6, Math.max(2, r.details.split('\n').length))), value: r.details, 'aria-label': 'Case details', oninput: e => { r.details = e.target.value; } })),
      h('td', {}, h('div', { class: 'chips' },
        r.cats.map(code => catChip(code, { on: true, removable: true, onclick: () => { r.cats = dropCat(r.cats, code); paintBulk(out); } })),
        h('button', { class: 'small', onclick: () => pickDialog(r.cats, cats => { r.cats = cats; paintBulk(out); }) }, r.cats.length ? '+' : '+ Add')),
        same || sugg.length ? h('div', { class: 'chips', style: 'margin-top:4px' }, same,
          sugg.map(s => catChip(s.code, { cls: `sugg ${s.score >= 0.5 ? 'strong' : ''}`, title: 'Suggested: ' + catFull(s.code), onclick: () => { r.cats = addCat(r.cats, s.code); paintBulk(out); } }))) : null),
      h('td', {}, h('button', { class: 'small danger', title: 'Drop this case', onclick: () => { bulkRows.splice(i, 1); paintBulk(out); } }, '×')));
  }));
  fill(out, 
    h('h3', {}, `${bulkRows.length} case${bulkRows.length === 1 ? '' : 's'}`),
    missing ? h('p', { class: 'tip' }, `${missing} case${missing === 1 ? ' has' : 's have'} no category yet.`) : null,
    h('div', { class: 'scroll' }, h('table', { class: 'bulk' }, h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Details'), h('th', {}, 'Categories'), h('th', {}))), tbody)),
    h('div', { class: 'actions' }, h('button', { class: 'primary big', onclick: saveBulk }, `Save all ${bulkRows.length}`)));
}

let bulkBusy = false;
async function saveBulk(e) {
  if (bulkBusy || !bulkRows) return;
  const btn = e && e.currentTarget;
  const def = curDate();
  const rows = bulkRows.filter(r => r.details.trim() || String(r.initials || '').trim() || r.cats.length);
  if (rows.some(r => !r.cats.length) && !(await confirmBox('Some cases have no category', 'Save them anyway? They will not count towards any target until you add one.', 'Save all'))) return;
  const now = Date.now();
  const cases = rows.map((r, i) => ({ id: uid(), date: r.date || def, initials: cleanInitials(r.initials), details: r.details.trim(), cats: sortCodes(r.cats), createdAt: now + i, updatedAt: now + i, source: 'paste' }));
  // clear the list first: offline the save can take a few seconds, and a second tap must not repeat it
  bulkBusy = true;
  if (btn) btn.disabled = true;
  const keep = bulkRows;
  bulkRows = null;
  try {
    await saveMany(cases);
    draft.bulk = ''; saveDraft();
    toast(`Saved ${cases.length} cases`);
  } catch (err) { bulkRows = keep; toast('Could not save: ' + err.message); }
  bulkBusy = false;
  hooks.render();
}

// ---------- dialogs ----------

// Pick categories in a sheet; done(cats) on close.
export function pickDialog(initial, done) {
  let cats = [...initial];
  const sel = h('div', { class: 'chips selected' });
  const paint = () => fill(sel, ...(cats.length ? cats.map(code => catChip(code, { on: true, removable: true, onclick: () => { cats = dropCat(cats, code); paint(); picker.refresh(); } })) : [h('span', { class: 'none' }, 'None selected')]));
  const picker = catPicker({ get: () => cats, toggle: code => { cats = toggleCat(cats, code); paint(); } });
  paint();
  const m = modal('Categories', [sel, h('div', { style: 'height:8px' }), picker.el,
    h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { class: 'grow' }), h('button', { class: 'primary', onclick: () => m.close() }, 'Done'))],
  { onclose: () => done(sortCodes(cats)) });
  picker.focus();
}

// Edit (or delete) one case.
export function editCaseDialog(c) {
  // older cases keep the initials at the front of the details: split them now, saved apart on Save
  const e = { ...c, ...caseParts(c), cats: [...(c.cats || [])] };
  const sel = h('div', { class: 'chips selected' });
  const sugg = h('div', { class: 'chips' });
  const paint = () => {
    fill(sel, ...(e.cats.length ? e.cats.map(code => catChip(code, { on: true, removable: true, onclick: () => { e.cats = dropCat(e.cats, code); paint(); picker.refresh(); } })) : [h('span', { class: 'none' }, 'No categories')]));
    const s = e.details.trim() && settings().suggestions !== false ? suggest(e.details, { limit: 6 }).filter(x => !e.cats.includes(x.code)) : [];
    fill(sugg, ...s.map(x => catChip(x.code, { cls: `sugg ${x.score >= 0.5 ? 'strong' : ''}`, onclick: () => { e.cats = addCat(e.cats, x.code); paint(); picker.refresh(); } })));
  };
  const picker = catPicker({ get: () => e.cats, toggle: code => { e.cats = toggleCat(e.cats, code); paint(); } });
  const paintSoon = debounce(paint, 120);
  paint();
  const m = modal('Edit case', [
    c.dateText && !c.date ? h('p', { class: 'tip' }, `Imported date “${c.dateText}” could not be read — please set the date.`) : null,
    h('label', { class: 'field' }, 'Date', h('input', { type: 'date', value: e.date || '', max: todayISO(), onchange: ev => { e.date = parseDate(ev.target.value); } })),
    h('label', { class: 'field' }, 'Patient initials', h('input', { value: e.initials, placeholder: 'e.g. AB', maxlength: '20', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', oninput: ev => { e.initials = ev.target.value; } })),
    h('label', { class: 'field' }, 'Case details', h('textarea', { rows: '3', value: e.details, oninput: ev => { e.details = ev.target.value; paintSoon(); } })),
    h('div', { class: 'chiplabel' }, 'Categories'), sel,
    h('div', { class: 'chiplabel' }, 'Suggested'), sugg,
    h('details', {}, h('summary', {}, 'All categories'), picker.el),
    h('div', { class: 'bar', style: 'margin-top:12px' },
      h('button', { class: 'danger', onclick: async () => {
        m.close();
        // recycle bin (bin agent): kept 30 days; Undo restores it
        try { await moveToBin('case', c, { toast: true }); } catch (err) { toast('Could not delete: ' + err.message); }
      } }, 'Delete'),
      h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'primary', onclick: async () => {
        m.close();
        await updateCase({ ...e, initials: cleanInitials(e.initials), details: e.details.trim() });
        toast('Case updated', { action: 'Undo', onaction: () => restoreCase(c) });
      } }, 'Save')),
  ]);
  return m;
}
