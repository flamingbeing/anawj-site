// Search (the magnifier in the header on every tab, or / on a computer; log2 9e): one box over your cases (and planned ones),
// reflections and notes, with the Logbook's search language and a few more operators (global-search.js; ⓘ lists them).
// Results come grouped by kind with counts, Best match or Newest, the words marked in a short piece of each; a tap opens
// the item where it lives (a case's edit page, the reflection editor, the note). A case found also links its
// reflection and notes. Works offline on what is on this device; notes are loaded the first time Search opens.
// Filter chips (kind, dates, tag, drafts, Interesting) add or take out their operator in the box, and light up from
// what is typed: the box is the one source. Saved searches are the Logbook's list (a search saved here opens Search
// from there). Select ticks results into bulk edit: one kind opens its own popup, several share the date.
import { S, h, fill, hooks, resetters, debounce, catName, tagName, emptyState, settings, patchLogbook, toast, confirmBox, ic, basicHides } from './ui-core.js';
import { buildIndex, search, snippet, GS_HELP, hasOp, opValue, setOp, toggleOp } from './global-search.js';
import { insertOperator } from './search-ops.js';
import { HEADING_BY_ID } from './reflections.js';
import { fmtDate } from './engine.js';
import { ensureNotes, openNote, openNotes } from './ui-notepad.js';

const SV0 = () => ({ q: '', sort: 'best', more: {}, sel: null, dates: false });
const sv = SV0();
resetters.push(() => Object.assign(sv, SV0()));
const KIND = { case: ['Cases', 'case'], reflection: ['Reflections', 'reflection'], note: ['Notes', 'note'] };
const PER = 20;   // shown per kind before "Show all"
const key = d => `${d.type}:${d.id}`;

// open Search with a query (a search saved on this page, run from the Logbook)
export function searchFor(q) { sv.q = String(q || ''); sv.more = {}; hooks.navigate ? hooks.navigate('search') : (location.hash = '#search'); }

let memo = { key: null, index: null };
function indexNow() {
  const notes = Array.isArray(S.notes) ? S.notes : [];
  const plan = (S.logbook && S.logbook.plan) || [];
  const k = [S.cases, S.reflections, notes, plan];
  if (memo.key && memo.key.every((x, i) => x === k[i])) return memo.index;
  const headingName = id => { const hd = HEADING_BY_ID[id]; return hd ? `${hd.name} ${hd.label || ''}` : ''; };
  memo = { key: k, index: buildIndex({ cases: S.cases || [], plan, reflections: S.reflections || [], notes }, { catName, tagName, headingName }) };
  return memo.index;
}
// a Logbook saved search as Search words: its text, tags (has / not) and dates
const tagWord = k => (k.startsWith('c:') ? catName(k.slice(2)) : tagName(k)).split(/\s+/)[0].toLowerCase();
export const savedQuery = x => (x.global ? x.q || '' : [x.q || '', 'in:cases', ...(x.has || []).map(k => `tag:${tagWord(k)}`), ...(x.not || []).map(k => `-tag:${tagWord(k)}`),
  x.from ? `after:${x.from}` : '', x.to ? `before:${x.to}` : ''].filter(Boolean).join(' '));

export function renderSearch() {
  const wrap = h('section', { class: 'card gsearch' + (sv.sel ? ' selecting' : '') });
  const notesLoading = !Array.isArray(S.notes);
  if (notesLoading) ensureNotes()?.then?.(() => { if (S.tab === 'search') paint(); });
  const box = h('input', { type: 'search', class: 'grow', value: sv.q, placeholder: 'Search cases, reflections and notes', 'aria-label': 'Search everything', enterkeyhint: 'search',
    oninput: e => { sv.q = e.target.value; sv.more = {}; paintSoon(); } });
  const setQ = q => { sv.q = q; box.value = q; sv.more = {}; paint(); };
  const helpList = h('ul', { class: 'gs-help', hidden: true }, GS_HELP.map(([ex, what, ins, at]) => h('li', {},
    h('button', { type: 'button', class: 'small linkish', title: 'Add to the search', onclick: () => {
      const r = insertOperator(box.value, box.selectionStart, ins, at);
      box.value = r.text; sv.q = r.text; box.focus(); box.setSelectionRange(r.caret, r.caret); paint();
    } }, h('code', {}, ex)), ' ', what)));
  const helpBtn = h('button', { type: 'button', class: 'small icon-btn', 'aria-label': 'Search operators', 'aria-expanded': 'false', title: 'Search operators',
    onclick: () => { helpList.hidden = !helpList.hidden; helpBtn.setAttribute('aria-expanded', String(!helpList.hidden)); } }, 'ⓘ');
  const sortSel = h('select', { 'aria-label': 'Sort', onchange: e => { sv.sort = e.target.value; paint(); } },
    [['best', 'Best match'], ['newest', 'Newest']].map(([v, t]) => h('option', { value: v, selected: sv.sort === v }, t)));
  const note = h('p', { class: 'hint gs-note', hidden: true });
  const out = h('div', { class: 'gs-results', 'aria-live': 'polite' });
  const chips = h('div', { class: 'chips gs-chips' });
  const datePanel = h('div', { class: 'bar gs-dates', hidden: true });
  const saved = h('div', { class: 'chips lb-saved gs-saved' });
  const selBar = h('div', { class: 'sel-bar', role: 'region', 'aria-label': 'Selected results', hidden: true });
  const selectBtn = h('button', { class: 'small gs-selbtn', onclick: () => { sv.sel = sv.sel ? null : new Map(); paint(); } });
  let shownNow = [];

  // ---- chips: each adds or takes out its operator; lit from what the box says
  const chip = (label, on, onclick, extra = {}) => h('button', { type: 'button', class: `chip${on ? ' on' : ''}`, 'aria-pressed': String(!!on), onclick, ...extra }, label);
  function paintChips() {
    // (the handlers read the box when tapped: typing and a quick tap must not act on an older text)
    const q = sv.q;
    const from = opValue(q, 'after'), to = opValue(q, 'before'), tag = opValue(q, 'tag');
    const tags = basicHides('tags') ? [] : tagList();
    fill(chips,
      chip('Cases', hasOp(q, 'in', 'cases'), () => setQ(toggleOp(sv.q, 'in', 'cases'))),
      chip('Reflections', hasOp(q, 'in', 'reflections'), () => setQ(toggleOp(sv.q, 'in', 'reflections'))),
      chip('Notes', hasOp(q, 'in', 'notes'), () => setQ(toggleOp(sv.q, 'in', 'notes'))),
      chip(from || to ? `${from ? fmtDate(from) : '…'} – ${to ? fmtDate(to) : '…'}` : 'Dates', from || to, () => { sv.dates = !sv.dates; datePanel.hidden = !sv.dates; }, { 'aria-expanded': String(!!sv.dates) }),
      tags.length ? h('select', { class: `chip-select${tag ? ' on' : ''}`, 'aria-label': 'Tag', onchange: e => setQ(setOp(sv.q, 'tag', e.target.value)) },
        h('option', { value: '' }, tag ? `Tag: ${tag}` : 'Tag…'), tag ? h('option', { value: '' }, 'Any tag') : null,
        tags.map(([v, t]) => h('option', { value: v }, t))) : null,
      chip('Drafts', hasOp(q, 'status', 'draft'), () => setQ(toggleOp(sv.q, 'status', 'draft'))),
      chip(['☆ ', 'Interesting'], hasOp(q, 'is', 'interesting'), () => setQ(toggleOp(sv.q, 'is', 'interesting'))));
    const dateIn = (field, label) => h('label', { class: 'field gs-date-in' }, label, h('input', { type: 'date', value: opValue(q, field), onchange: e => setQ(setOp(sv.q, field, e.target.value)) }));
    fill(datePanel, dateIn('after', 'From'), dateIn('before', 'To'));
    datePanel.hidden = !sv.dates && !(from || to);
  }
  // the tags a Tag… chip offers: the APMES ones and yours, by a word of their name (what tag: matches)
  function tagList() {
    const seen = new Map();
    for (const c of S.cases || []) {
      for (const k of c.cats || []) { const w = catName(k); if (w && !seen.has(w)) seen.set(w, w); }
      for (const k of c.tags || []) { const w = tagName(k); if (w && !seen.has(w)) seen.set(w, w); }
    }
    return [...seen.keys()].sort((a, b) => a.localeCompare(b)).slice(0, 200).map(n => [n.split(/\s+/)[0].toLowerCase(), n]);
  }

  // ---- saved searches: the Logbook's list
  function paintSaved() {
    const list = settings().savedSearches || [];
    fill(saved, ...list.map(x => h('span', { class: 'chip tmpl', role: 'button', tabindex: '0', title: 'Run this search', onclick: () => setQ(savedQuery(x)) }, ic('star'), x.name,
      h('span', { class: 'x', role: 'button', tabindex: '0', 'aria-label': 'Delete saved search', onclick: async e => {
        e.stopPropagation();
        if (!(await confirmBox('Delete saved search', `Delete “${x.name}”?`, 'Delete', true))) return;
        await patchLogbook({ settings: { savedSearches: (settings().savedSearches || []).filter(y => y.id !== x.id) } }); paintSaved();
      } }, ' ×'))),
    h('button', { class: 'small', title: 'Save this search (also listed on the Logbook)', onclick: saveIt }, ic('star'), 'Save search'));
  }
  async function saveIt() {
    if (!sv.q.trim()) return toast('Search first, then save it');
    const name = (prompt('Name this search', sv.q.trim().slice(0, 40)) || '').trim().slice(0, 40);
    if (!name) return;
    const x = { id: Math.random().toString(36).slice(2, 8), name, q: sv.q.trim(), global: true };
    await patchLogbook({ settings: { savedSearches: [...(settings().savedSearches || []), x].slice(-20) } });
    paintSaved(); toast(`Saved “${name}”`);
  }

  // ---- Select: tick results into bulk edit
  function paintSel() {
    selectBtn.textContent = sv.sel ? 'Done' : 'Select';
    wrap.classList.toggle('selecting', !!sv.sel);
    selBar.hidden = !sv.sel;
    if (!sv.sel) return fill(selBar);
    const n = sv.sel.size;
    fill(selBar,
      h('span', { class: 'sel-n', 'aria-live': 'polite' }, `${n} selected`),
      h('button', { class: 'small', disabled: !shownNow.length || shownNow.every(d => sv.sel.has(key(d))), onclick: () => { for (const d of shownNow) sv.sel.set(key(d), d); paint(); } }, `Select all ${shownNow.length}`),
      h('button', { class: 'small', disabled: !n, onclick: () => { sv.sel.clear(); paint(); } }, 'Select none'),
      h('span', { class: 'grow' }),
      h('button', { class: 'small primary', disabled: !n, onclick: () => bulk() }, 'Bulk edit…'),
      h('button', { class: 'small', onclick: () => { sv.sel = null; paint(); } }, 'Done'));
  }
  async function bulk() {
    const picks = [...sv.sel.values()], kinds = new Set(picks.map(d => d.type));
    const onDone = () => { sv.sel = null; if (S.tab === 'search') hooks.render(); };
    if (kinds.size > 1) { const { mixedBulkDialog } = await import('./ui-bulk-mixed.js'); return mixedBulkDialog(picks.map(d => ({ type: d.type, id: d.id })), { onDone }); }
    const kind = [...kinds][0], items = picks.map(d => d.item);
    if (kind === 'note') { const { notesBulkDialog } = await import('./ui-bulk-notes.js'); return notesBulkDialog(items, { onDone }); }
    if (kind === 'reflection') { const { reflBulkDialog } = await import('./ui-bulk-refl.js'); return reflBulkDialog(items, { onDone }); }
    const [{ bulkEditDialog }, lb] = await Promise.all([import('./ui-bulk.js'), import('./ui-logbook.js')]);
    const planned = items.filter(c => !(S.cases || []).some(x => x.id === c.id)).length;
    if (planned) toast(`${planned} planned case${planned === 1 ? '' : 's'} left out: confirm them on the Add tab first`);
    bulkEditDialog(items.filter(c => (S.cases || []).some(x => x.id === c.id)), { tags: lb.tagChoices(), name: lb.keyName, onDone });
  }

  function paint() {
    paintChips();
    const q = sv.q.trim();
    shownNow = [];
    if (!q) {
      note.hidden = true; selectBtn.hidden = true;
      if (sv.sel) sv.sel = null;
      paintSel();
      return fill(out, h('p', { class: 'hint' }, 'Type to search your cases, reflections and notes, or use the chips. ⓘ lists the operators (in:notes, status:draft, has:reflection…).'));
    }
    const r = search(indexNow(), q, { sort: sv.sort, limit: 1e9 });
    note.hidden = !r.unknown.length && !(notesLoading && !Array.isArray(S.notes));
    note.textContent = [...r.unknown.map(x => `“${x.op}” isn’t an operator (searched as text): did you mean ${x.suggest}?`),
      !Array.isArray(S.notes) ? 'Loading your notes…' : ''].filter(Boolean).join(' ');
    const total = r.counts.case + r.counts.reflection + r.counts.note;
    selectBtn.hidden = !total;
    if (!total) { sv.sel = null; paintSel(); return fill(out, emptyState('search', 'Nothing found', 'Try fewer words, or ⓘ for the operators.')); }
    fill(out, ['case', 'reflection', 'note'].filter(k => r.counts[k]).map(k => {
      const list = r.results[k], n = r.counts[k], shown = sv.more[k] ? list : list.slice(0, PER);
      shownNow.push(...list);
      return h('div', { class: 'gs-group' },
        h('h3', { class: 'gs-h' }, `${KIND[k][0]} `, h('span', { class: 'muted' }, `(${n})`)),
        h('ul', { class: 'gs-list' }, shown.map(d => row(d, r.words, paintSel))),
        n > shown.length ? h('button', { class: 'small', onclick: () => { sv.more[k] = true; paint(); } }, `Show all ${n}`) : null);
    }));
    paintSel();
  }
  const paintSoon = debounce(paint, 150);
  fill(wrap,
    h('h2', { style: 'margin:0 0 8px' }, 'Search'),
    h('div', { class: 'bar', style: 'gap:8px;flex-wrap:nowrap;margin:0' }, box, helpBtn),
    helpList, chips, datePanel, saved, note,
    h('div', { class: 'bar gs-sortbar' }, h('label', { class: 'refl-view' }, h('span', { class: 'hint' }, 'Sort '), sortSel), h('span', { class: 'grow' }), selectBtn),
    out, selBar);
  paintSaved();
  paint();
  requestAnimationFrame(() => { if (box.isConnected && matchMedia('(pointer: fine)').matches && !sv.sel) box.focus(); });
  return wrap;
}

const marks = (text, words) => snippet(text, words).map(([t, on]) => (on ? h('mark', {}, t) : t));
function row(d, words, paintSel) {
  const it = d.item;
  const date = d.date ? fmtDate(d.date) : d.type === 'case' && d.flags.planned ? 'Planned' : 'No date';
  const tagLine = d.type === 'reflection' ? [HEADING_BY_ID[it.headingId] ? HEADING_BY_ID[it.headingId].label || HEADING_BY_ID[it.headingId].name : 'Uncategorised', it.status === 'complete' ? 'complete' : 'draft'].join(' · ')
    : d.type === 'case' ? [d.flags.planned ? 'planned' : '', d.flags.interesting ? '☆ interesting' : ''].filter(Boolean).join(' · ') : '';
  const refl = d.type === 'case' && d.flags.reflection ? (S.reflections || []).find(r => r.caseId === it.id) : null;
  const picking = !!sv.sel, picked = picking && sv.sel.has(key(d));
  const li = h('li', { class: picked ? 'sel' : null });
  const toggle = () => {
    if (sv.sel.has(key(d))) sv.sel.delete(key(d)); else sv.sel.set(key(d), d);
    const on = sv.sel.has(key(d));
    li.classList.toggle('sel', on); const b = li.querySelector('.sel-box'); if (b) b.checked = on;
    paintSel();
  };
  fill(li,
    picking ? h('input', { type: 'checkbox', class: 'sel-box', checked: picked, 'aria-label': `Select ${d.type} ${d.title.slice(0, 40)}`, onclick: e => { e.stopPropagation(); toggle(); } }) : null,
    h('button', { type: 'button', class: 'gs-item', tabindex: picking ? '-1' : null, onclick: () => (picking ? toggle() : open(d)) },
      h('span', { class: 'gs-top' }, h('b', { class: 'gs-title' }, ...marks(d.title, words)), h('span', { class: 'muted gs-date' }, date)),
      d.text && d.text !== d.title ? h('span', { class: 'gs-snip' }, ...marks(d.text, words)) : null,
      tagLine ? h('span', { class: 'muted gs-meta' }, tagLine) : null),
    !picking && (refl || (d.type === 'case' && d.flags.note)) ? h('span', { class: 'gs-links' },
      refl ? h('button', { type: 'button', class: 'small linkish', onclick: () => openRefl(refl) }, '↗ Its reflection') : null,
      d.type === 'case' && d.flags.note ? h('button', { type: 'button', class: 'small linkish', onclick: () => openNotes({ caseId: it.id }) }, '↗ Its notes') : null) : null);
  return li;
}
async function openRefl(r) { const { openReflection } = await import('./ui-reflect.js'); openReflection(r); }
async function open(d) {
  if (d.type === 'note') return openNote(d.item, 'search');
  if (d.type === 'reflection') return openRefl(d.item);
  if (d.flags.planned) return hooks.navigate('log');   // planned cases are confirmed from the Add tab's plan
  const { editCaseDialog } = await import('./ui-log.js');
  editCaseDialog(d.item);
}
