// Reflections tab (#reflect; also opened by the Logbook's Reflect buttons): list grouped by section
// and heading with progress, a case picker (every reflection is linked to a logged case: "+ New
// reflection" picks the case, then suggests headings from it; each heading's "+ Add" presets the heading),
// and an editor laid out like a portfolio Section 2 row: title, case summary, learning points, figures,
// references. Drafts autosave (cloud + this device); images are compressed and saved to their own docs.
// Edit mode (list "Edit" button) unlocks dragging reflections between headings (pointer events, so touch
// works) and selecting several to delete. Every delete goes to the recycle bin (bin.js, 30 days).

import { REFLECTION_HEADINGS, REFLECTION_SECTIONS, yearName } from './categories.js';
import { reflectionProgress, reflectionCounts, HEADING_BY_ID, splitDetails, completeProblems, isLegacy, LIMITS, IMAGE_MAX_B64, IMAGE_MAX_SIDE, IMAGE_QUALITY, PHOTO_BUDGET_KB, PHOTO_NOTE, photoUsageKb, imageKb, fmtMb, wordCount, MIN_WORDS, suggestHeadings, moveToHeading, inExport, exportSummary, pickJustEnough } from './reflections.js';
export { completeProblems };
import { fmtDate, caseText, procedureText, caseParts } from './engine.js';
import { S, h, toast, cloud, debounce, hooks, rYear, effectiveIntake, residentSmo, todayISO, confirmBox, add, resetters, scheduleSummary, displayName, byNewest, catName, updateCase, settings, patchLogbook } from './ui-core.js';
import { renderExportButton, caseRYear, countsByYear } from './portfolio.js';
import { parseQuery, matchQuery, REFL_FIELDS, REFL_OPERATOR_HELP } from './search-ops.js';
import { opsHelp } from './ui-logbook.js';

const DRAFT_KEY = 'apmes-logbook-reflection-draft';
const VIEW_KEY = 'apmes-logbook-reflection-view';
const savedView = (() => { try { return JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') || {}; } catch { return {}; } })();
const rv = { editing: null, thumbs: {}, picking: null, editMode: false, sel: new Set(), view: null, q: '', filter: 'all', openH: new Set(), shutH: new Set(),
  group: savedView.group || 'heading', sort: savedView.sort || 'newest', viewOpen: false };
const saveView = () => { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ group: rv.group, sort: rv.sort })); } catch { /* blocked */ } };
// editing: the reflection open in the editor (or null for the list); thumbs: figure previews by image id;
// picking: case picker state { q, relink, preset: { headingId, subId }, chosen: case awaiting a heading };
// editMode: list edit mode (drag between headings, select to delete); sel: selected reflection ids;
// view: 'import' (Upload from Word) or 'bin' (Recycle bin) sub-view, or null.
// q / filter: list search and filter ('all', 'draft', 'in', 'out'); openH / shutH: headings opened or
// closed by hand (met headings start closed); group / sort: how the list is grouped and ordered (this device).

const mine = () => S.user.email;
// the unsaved editor draft is kept per account (and apart from the demo), like the Log page's
const draftKey = () => `${DRAFT_KEY}:${cloud.demo ? 'demo:' : ''}${(S.user && S.user.email) || ''}`;
const lsGet = () => { try { return JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch { return null; } };
const lsSet = r => { try { r ? localStorage.setItem(draftKey(), JSON.stringify(r)) : localStorage.removeItem(draftKey()); } catch { /* blocked */ } };
// sign-out: nothing of this person's is left for the next one (drafts, search, open headings, figure previews)
resetters.push(() => {
  Object.assign(rv, { editing: null, picking: null, editMode: false, view: null, q: '', filter: 'all', thumbs: {}, viewOpen: false, readyOpen: false, toolsOpen: false });
  rv.sel.clear(); rv.openH.clear(); rv.shutH.clear();
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(DRAFT_KEY)) localStorage.removeItem(k); } catch { /* blocked */ }
});

// Live reflections for the signed-in user (app.js calls this after sign-in).
export function watchMyReflections(email) {
  S.reflections = [];
  return cloud.watchReflections(email, list => {
    S.reflections = list;
    scheduleSummary();
    // don't re-render under someone typing in the editor
    if ((S.tab === 'reflect' && !rv.editing && !rv.picking && !rv.view && !drag) || S.tab === 'export' || S.tab === 'choose') hooks.render();
  });
}
export const summaryReflections = () => reflectionCounts(S.reflections || []);

const blank = (over = {}) => ({
  id: null, headingId: '', subId: null, initials: '', date: todayISO(), jr: rYear() <= 3, diagnosis: '',
  title: '', summary: '', points: [{ heading: '', text: '' }], figures: [], references: [], caseId: null, status: 'draft',
  ...(settings().reflExport === false ? { export: false } : {}), ...over,
});

// From a logged case: its initials (older cases have them at the front of the details), the procedure
// line as the diagnosis, and its case summary as the reflection's case details (summary).
const fromCase = c => {
  // the case's own initials field (even when empty); only older cases carry them at the front of the details
  const { initials, details } = caseParts(c), rest = String(details || '').trim();
  return { initials, diagnosis: procedureText(c) || rest, summary: rest, date: c.date || null, caseId: c.id };
};
// preset: { headingId, subId } from a heading's "+ Add" button.
export function reflectOnCase(c, preset = null) {
  rv.picking = null; rv.view = null;
  const existing = (S.reflections || []).find(r => r.caseId === c.id);
  if (existing) {
    if (preset && preset.headingId && existing.headingId !== preset.headingId) toast('That case already has a reflection (opened). Each reflection must be a different patient.');
    return openEditor(existing);
  }
  openEditor(blank({ ...fromCase(c), ...(preset ? { headingId: preset.headingId || '', subId: preset.subId || null } : {}) }));
}

// Heading suggestions for a case as tappable chips; onpick({ headingId, subId }).
function suggestChips(c, onpick, jr = rYear() <= 3) {
  const sug = c ? suggestHeadings(c, S.reflections || [], { jr }) : [];
  if (!sug.length) return null;
  return h('div', { class: 'refl-sug' }, h('div', { class: 'hint', style: 'margin:0 0 4px' }, 'Suggested headings for this case'),
    h('div', { class: 'refl-chips' }, sug.map(x => {
      const hd = HEADING_BY_ID[x.headingId];
      const sub = x.subId && hd.subs ? hd.subs.find(s => s.id === x.subId) : null;
      const nm = labelOf(hd) + (sub ? ' · ' + sub.name : '');
      return h('button', { class: 'refl-chip' + (x.needed ? ' need' : ''), title: hd.name + (x.needed ? ' (still needed)' : ' (already met)'),
        onclick: () => onpick({ headingId: x.headingId, subId: x.subId }) }, nm, x.needed ? null : h('span', { class: 'muted' }, ' ✓'));
    })));
}
const shortName = n => { const t = n.replace(/\s*\(.*$/, '').replace(/\s+e\.g\.?,?.*$/i, '').trim() || n; return t.length > 48 ? t.slice(0, 46) + '…' : t; };
// a heading's name in the app: its chosen label (categories.js), else the official name shortened
const labelOf = hd => (hd ? hd.label || shortName(hd.name) : 'Uncategorised');
// the notes under each heading (rules, examples): on unless switched off at the bottom of the list
const notesOn = () => settings().reflNotes !== false;

const showTab = () => { if (location.hash !== '#reflect') location.hash = '#reflect'; else hooks.render(); };
// JR follows from the reflection's date: R1–R3 at that date (from the resident's intake) is junior residency.
// Without a known intake, the current residency year decides.
// Mark complete was refused: outline the fields that are still needed in red and scroll to the first.
function showMissing(missing) {
  document.querySelectorAll('[data-field].missing').forEach(el => el.classList.remove('missing'));
  const els = missing.map(m => document.querySelector(`[data-field="${m}"]`)).filter(Boolean);
  for (const el of els) {
    el.classList.add('missing');
    el.addEventListener('input', () => el.classList.remove('missing'), { once: true });
    el.addEventListener('change', () => el.classList.remove('missing'), { once: true });
  }
  if (!els.length) return;
  els[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  const f = els[0].matches('input, select, textarea') ? els[0] : els[0].querySelector('input, select, textarea');
  if (f) setTimeout(() => f.focus({ preventScroll: true }), 300);
}

const PROMPTS = 'What were the considerations?\n\n\nWhat did you learn?\n';

function setJr(r) {
  const intake = effectiveIntake();
  const y = r.date && intake ? caseRYear(r.date, intake, residentSmo(S.resident)) : null;
  r.jr = y ? y <= 3 : rYear() <= 3;
}

function openEditor(r) {
  rv.editing = JSON.parse(JSON.stringify(r));
  showTab();
}
const caseById = id => (id && (S.cases || []).find(c => c.id === id)) || null;
const caseDate = c => (c.date ? fmtDate(c.date) : c.dateText || '—');

export function renderReflect() {
  if (rv.view) return subView();
  if (rv.picking) return picker();
  if (!rv.editing) {
    const d = lsGet();
    if (d && d.restore) { rv.editing = d; delete rv.editing.restore; }
  }
  return rv.editing ? editor() : list();
}

// ---------- case picker ----------

// relink: change the case of the reflection open in the editor (keeps what has been written).
function openPicker(relink = false, preset = null) { rv.picking = { q: '', relink, preset }; showTab(); }

function pickCase(c) {
  const p = rv.picking;
  const other = (S.reflections || []).find(r => r.caseId === c.id && (!p.relink || r.id !== rv.editing.id));
  if (p.relink) {
    if (other) return toast('That case already has a reflection. Each reflection must be a different patient.');
    const r = rv.editing, old = caseById(r.caseId), oldFill = old ? fromCase(old) : null, f = fromCase(c);
    r.caseId = c.id; r.initials = f.initials || r.initials; r.date = f.date || r.date;
    if (!String(r.diagnosis || '').trim() || (oldFill && r.diagnosis === oldFill.diagnosis)) r.diagnosis = f.diagnosis;
    if (!String(r.summary || '').trim() || (oldFill && r.summary === oldFill.summary)) r.summary = f.summary;
    lsSet({ ...r, restore: true });
    rv.picking = null; rv.relinked = true; hooks.render();
    return;
  }
  if (other || p.preset) return reflectOnCase(c, p.preset);
  // general "+ New reflection": offer heading suggestions before opening the editor
  if (!suggestHeadings(c, S.reflections || []).length) return reflectOnCase(c);
  p.chosen = c; hooks.render();
}

// Step 2 of the general "+ New reflection": choose a heading (suggested from the case) or skip.
function chooseHeading() {
  const p = rv.picking, c = p.chosen;
  return h('div', {}, h('section', { class: 'card' },
    h('div', { class: 'bar' }, h('button', { onclick: () => { p.chosen = null; hooks.render(); } }, '← Cases'), h('span', { class: 'grow' })),
    h('h2', { style: 'margin:8px 0 4px' }, 'Which heading?'),
    h('p', { style: 'margin:0 0 8px' }, h('span', { class: 'muted' }, caseDate(c) + ' · '), caseText(c) || '(no details)',
      (c.cats || []).length ? h('span', { class: 'muted', style: 'display:block;font-size:13px' }, c.cats.map(catName).join(', ')) : null),
    suggestChips(c, preset => reflectOnCase(c, preset)),
    h('p', { class: 'hint', style: 'margin:10px 0 6px' }, 'Highlighted headings still need reflections. You can change the heading later.'),
    h('button', { onclick: () => reflectOnCase(c) }, 'Choose the heading later')));
}

function picker() {
  const p = rv.picking;
  if (p.chosen) return chooseHeading();
  const ph = p.preset && HEADING_BY_ID[p.preset.headingId];
  const psub = ph && p.preset.subId && ph.subs ? ph.subs.find(s => s.id === p.preset.subId) : null;
  const linked = new Set((S.reflections || []).map(r => r.caseId).filter(Boolean));
  // cases marked interesting (and not written yet) come first
  const cases = [...(S.cases || [])].sort(byNewest).sort((a, b) => (b.reflectTag && !linked.has(b.id)) - (a.reflectTag && !linked.has(a.id)));
  const ul = h('ul', { class: 'cases refl-pick' });
  const count = h('p', { class: 'hint', style: 'margin:6px 0 0' });
  const paint = () => {
    const words = p.q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = cases.filter(c => {
      if (!words.length) return true;
      const hay = `${caseText(c)} ${c.date || ''} ${c.dateText || ''} ${c.date ? fmtDate(c.date) : ''} ${(c.cats || []).map(k => k + ' ' + catName(k)).join(' ')}`.toLowerCase();
      return words.every(w => hay.includes(w));
    });
    const shown = hits.slice(0, 200);
    count.textContent = cases.length ? `${hits.length} case${hits.length === 1 ? '' : 's'}${hits.length > shown.length ? ', showing the newest ' + shown.length + ' (search to narrow)' : ''}` : '';
    ul.replaceChildren(...shown.map(c => {
      const has = linked.has(c.id) && !(p.relink && rv.editing && rv.editing.caseId === c.id);
      const cur = p.relink && rv.editing && rv.editing.caseId === c.id;
      const names = (c.cats || []).map(catName).join(', ');
      return h('li', { tabindex: '0', role: 'button', onclick: () => pickCase(c), onkeydown: e => { if (e.key === 'Enter') pickCase(c); } },
        h('span', { class: 'd' }, caseDate(c)),
        h('span', { class: 't' }, c.reflectTag && !has ? h('span', { class: 'flag tagged' }, '☆ interesting') : null, caseText(c) || '(no details)', names ? h('span', { class: 'muted', style: 'display:block;font-size:13px' }, names) : null),
        h('span', { class: 'c' }, cur ? h('span', { class: 'flag' }, 'current') : has ? h('span', { class: 'flag' }, 'has reflection') : null));
    }));
    if (!shown.length) ul.replaceChildren(h('li', { class: 'empty' }, cases.length ? 'No cases match.' : 'No cases logged yet: tap + New case above.'));
  };
  paint();
  const search = h('input', { type: 'search', value: p.q, placeholder: 'Search initials, details, date or procedure', style: 'font-size:16px;width:100%;box-sizing:border-box',
    'aria-label': 'Search cases', oninput: e => { p.q = e.target.value; paint(); } });
  setTimeout(() => search.focus(), 0);
  return h('div', {}, h('section', { class: 'card' },
    h('div', { class: 'bar' },
      h('button', { onclick: () => { rv.picking = null; hooks.render(); } }, p.relink ? '← Back to reflection' : '← Reflections'),
      h('span', { class: 'grow' })),
    h('h2', { style: 'margin:8px 0 4px' }, p.relink ? 'Change the linked case' : 'Which case is this reflection on?'),
    ph ? h('p', { style: 'margin:0 0 4px' }, h('span', { class: 'muted' }, 'Heading: '), h('b', {}, labelOf(ph) + (psub ? ' · ' + psub.name : ''))) : null,
    p.preset && p.preset.uncat ? h('p', { style: 'margin:0 0 4px' }, h('span', { class: 'muted' }, 'Heading: '), h('b', {}, 'Uncategorised')) : null,
    h('p', { class: 'hint', style: 'margin:0 0 8px' }, p.relink ? 'Pick the logged case this reflection is about.' : 'Pick a logged case: the reflection starts with its initials, date, diagnosis and case details filled in. Not logged yet? Add it here.'),
    p.relink ? null : h('button', { class: 'small', style: 'margin:0 0 8px', onclick: newCaseForReflection }, '+ New case'),
    search, count), h('section', { class: 'card' }, ul));
}

// Log a case from the picker, then carry on as if it had been picked.
async function newCaseForReflection() {
  const { editCaseDialog } = await import('./ui-log.js');
  editCaseDialog({ date: todayISO(), initials: '', details: '', cats: [] }, { onCreated: c => { if (rv.picking) pickCase(c); else reflectOnCase(c); } });
}

// ---------- recycle bin / Word upload sub-views ----------

// The bin and Word-upload modules load on first use; a friendly message if they can't.
async function loadMod(path) {
  try { return await import(path); } catch (err) { console.warn(err); return null; }
}
function subView() {
  const back = () => { rv.view = null; hooks.render(); };
  const wrap = h('div', {}, h('section', { class: 'card' }, h('p', { class: 'hint' }, 'Loading…')));
  const which = rv.view;
  loadMod(which === 'bin' ? './bin.js' : './ui-reflect-import.js').then(m => {
    if (rv.view !== which) return;
    const fn = m && (which === 'bin' ? m.renderBin : m.renderImport);
    let el = null;
    try { el = fn ? (which === 'bin' ? fn() : fn(back)) : null; } catch (err) { console.warn(err); }
    const bar = h('section', { class: 'card' }, h('div', { class: 'bar' }, h('button', { onclick: back }, '← Reflections'), h('span', { class: 'grow' })));
    if (!el) return wrap.replaceChildren(bar, h('section', { class: 'card' }, h('p', {}, which === 'bin' ? 'The recycle bin isn’t available yet. Try again after the app updates.' : 'Upload from Word isn’t available yet. Try again after the app updates.')));
    Promise.resolve(el).then(node => { if (rv.view === which) wrap.replaceChildren(...(which === 'bin' ? [bar] : []), node); });
  });
  return wrap;
}
const openView = v => { rv.view = v; rv.editMode = false; rv.sel.clear(); hooks.render(); };

// Move reflections to the recycle bin (restorable for 30 days). Returns how many moved.
async function binReflections(list) {
  const m = await loadMod('./bin.js');
  if (!m || !m.moveToBin) { toast('The recycle bin isn’t available yet, so nothing was deleted.'); return 0; }
  let n = 0;
  for (const r of list) {
    try { await m.moveToBin('reflection', r); n++; } catch (err) { toast('Could not delete: ' + err.message); break; }
  }
  return n;
}

// ---------- list ----------

// "Ready to write": cases marked interesting, then recent cases that fit a heading you
// haven't met yet. Each opens a new reflection prefilled from the case.
function readyLine(p) {
  const linked = new Set((S.reflections || []).map(r => r.caseId).filter(Boolean));
  const tagged = (S.cases || []).filter(c => c.reflectTag && !linked.has(c.id));
  const unmet = new Set(p.headings.filter(x => !x.met).map(x => x.id));
  const since = todayISO(new Date(Date.now() - 60 * 864e5));
  const suggested = [];
  for (const c of S.cases || []) {
    if (suggested.length >= 3) break;
    if (linked.has(c.id) || c.reflectTag || !c.date || c.date < since) continue;
    const hd = suggestHeadings(c, S.reflections || []).find(x => unmet.has(x.headingId));
    if (hd) suggested.push({ c, hd });
  }
  if (!tagged.length && !suggested.length) return null;
  const line = c => `${c.date ? fmtDate(c.date) : ''} · ${[c.initials, String(c.details || '').split('\n').join(' ')].filter(Boolean).join(' ').slice(0, 60)}`;
  const row = (c, hd, isTag) => h('li', {},
    h('span', { class: 'rt' }, isTag ? '☆ ' : '', line(c), hd ? h('small', {}, ' → ' + labelOf(HEADING_BY_ID[hd.headingId])) : null),
    h('span', { class: 'row' },
      h('button', { class: 'small primary', onclick: () => reflectOnCase(c, hd || null) }, 'Write'),
      isTag ? h('button', { class: 'small', title: 'Remove the tag', onclick: async () => { const next = { ...c }; delete next.reflectTag; await updateCase(next); hooks.render(); } }, 'Untag') : null));
  // one slim line under the header; tap to see the cases
  const what = [tagged.length ? `☆ ${tagged.length} interesting case${tagged.length === 1 ? '' : 's'} to write up` : null,
    suggested.length ? `${suggested.length} suggestion${suggested.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');
  return h('details', { class: 'ready-line', open: !!rv.readyOpen, ontoggle: e => { rv.readyOpen = e.target.open; } },
    h('summary', {}, what),
    tagged.length ? h('ul', { class: 'ready-list' }, tagged.slice(0, 20).map(c => row(c, suggestHeadings(c, S.reflections || [])[0] || null, true))) : null,
    suggested.length ? [h('div', { class: 'chiplabel', style: 'margin-top:8px' }, 'Suggested for headings not yet met'),
      h('ul', { class: 'ready-list' }, suggested.map(({ c, hd }) => row(c, hd, false)))] : null);
}

let drag = null;   // active drag { r, ghost, target, x, y, raf }

function list() {
  const all = S.reflections || [];
  const p = reflectionProgress(all);
  const ex = exportSummary(all);
  const exBy = Object.fromEntries(ex.headings.map(x => [x.id, x]));
  const em = rv.editMode;
  for (const id of [...rv.sel]) if (!all.some(r => r.id === id)) rv.sel.delete(id);

  // search and filter: headings with no match are hidden, the rest open
  const words = rv.q.toLowerCase().split(/\s+/).filter(Boolean);
  const FILTERS = { all: () => true, draft: r => r.status !== 'complete', complete: r => r.status === 'complete', uncat: r => !HEADING_BY_ID[r.headingId] };
  const hayOf = r => `${r.initials || ''} ${r.diagnosis || ''} ${r.title || ''} ${r.summary || ''} ${(r.points || []).map(x => `${x.heading || ''} ${x.text || ''}`).join(' ')} ${r.date || ''} ${r.date ? fmtDate(r.date) : ''}`.toLowerCase();
  // Advanced search (Settings → Logging): operators, with the reflection's own fields
  const ops = settings().searchOps && words.length ? parseQuery(rv.q, { fields: REFL_FIELDS }) : null;
  const fieldOf = (r, k) => {
    const hd = HEADING_BY_ID[r.headingId];
    if (k === 'heading') return `${hd ? hd.name + ' ' + (hd.label || '') : 'uncategorised'} ${(hd && (hd.subs || []).find(x => x.id === r.subId) || {}).name || ''}`.toLowerCase();
    if (k === 'case') return String(r.summary || '').toLowerCase();
    return k === 'all' ? hayOf(r) : String(r[k] || '').toLowerCase();
  };
  const match = r => (FILTERS[rv.filter] || FILTERS.all)(r) && (!words.length
    || (ops ? matchQuery(ops, k => fieldOf(r, k), null) : words.every(w => hayOf(r).includes(w))));
  const narrowed = !!words.length || rv.filter !== 'all';
  // the filter / group / sort panel folds behind one button; it says how many differ from the defaults
  const changedN = (rv.filter !== 'all') + (rv.group !== 'heading') + (rv.sort !== 'newest');
  const viewOpen = rv.viewOpen ?? false;
  // sort within each group
  const SORTS = {
    newest: (a, b) => String(b.date || '').localeCompare(String(a.date || '')),
    oldest: (a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')),
    longest: (a, b) => wordCount(b) - wordCount(a),
    shortest: (a, b) => wordCount(a) - wordCount(b),
    az: (a, b) => `${a.diagnosis || ''} ${a.initials || ''}`.localeCompare(`${b.diagnosis || ''} ${b.initials || ''}`, undefined, { sensitivity: 'base' }),
  };
  const sorted = list => [...list].sort(SORTS[rv.sort] || SORTS.newest);
  const viewSel = (label, key, opts) => h('label', { class: 'refl-view' }, h('span', { class: 'hint' }, label + ' '),
    h('select', { 'aria-label': label, onchange: e => { rv[key] = e.target.value; saveView(); hooks.render(); } },
      opts.map(([v, t]) => h('option', { value: v, selected: rv[key] === v }, t))));
  const viewBar = h('div', { class: 'bar refl-viewbar', style: 'flex-wrap:wrap;gap:6px 12px;margin:6px 0 0' },
    viewSel('Group by', 'group', [['heading', 'Heading'], ['month', 'Month'], ['year', 'Residency year'], ['status', 'Status'], ['none', 'None']]),
    viewSel('Sort', 'sort', [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['longest', 'Longest'], ['shortest', 'Shortest'], ['az', 'A–Z']]));

  const search = h('input', { type: 'search', value: rv.q, placeholder: 'Search reflections', 'aria-label': 'Search reflections', style: 'font-size:16px;flex:1;min-width:0',
    oninput: debounce(e => { rv.q = e.target.value; hooks.render(); requestAnimationFrame(() => { const el = document.querySelector('input[aria-label="Search reflections"]'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }); }, 250) });
  const filterChips = h('div', { class: 'chips refl-filters' }, [['all', 'All'], ['draft', 'Drafts'], ['complete', 'Complete'], ['uncat', 'Uncategorised']].map(([k, t]) =>
    h('span', { class: `chip ${rv.filter === k ? 'on' : ''}`, role: 'button', tabindex: '0', 'aria-pressed': String(rv.filter === k), onclick: () => { rv.filter = k; hooks.render(); } }, t)));

  const head = h('section', { class: 'card' },
    h('div', { class: 'bar', style: 'flex-wrap:wrap;gap:8px' },
      h('h2', { style: 'margin:0' }, 'Reflections'), h('span', { class: 'grow' }),
      // Edit then New, side by side, even on a narrow phone with large text
      h('span', { class: 'refl-actions' },
        h('button', { class: em ? 'primary' : '', 'aria-pressed': String(em), onclick: () => { rv.editMode = !em; rv.sel.clear(); hooks.render(); } }, em ? 'Done' : 'Edit'),
        em ? null : h('button', { class: 'primary', onclick: () => openPicker() }, '+ New reflection'))),
    h('p', { class: 'hint', style: 'margin:6px 0 0' }, `${p.totals.counted} / ${p.totals.min} counted · ${p.totals.done} complete · ${p.totals.drafts} draft${p.totals.drafts === 1 ? '' : 's'}`),
    em ? null : readyLine(p),
    em ? null : h('div', { class: 'bar', style: 'gap:8px;margin:8px 0 0;flex-wrap:nowrap' }, search,
      settings().searchOps ? h('button', { type: 'button', class: 'small icon-btn', title: 'Search operators', 'aria-label': 'Search operators', onclick: () => opsHelp(search, v => { rv.q = v; hooks.render(); requestAnimationFrame(() => { const el = document.querySelector('input[aria-label="Search reflections"]'); if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n); } }); }, REFL_OPERATOR_HELP, 'heading:lap -draft "blood pressure"') }, '?') : null,
      h('button', { class: `small${changedN ? ' primary' : ''}`, 'aria-expanded': String(viewOpen), onclick: () => { rv.viewOpen = !viewOpen; hooks.render(); } }, 'Filter & sort' + (changedN ? ` (${changedN})` : ''))),
    em || !ops || !ops.unknown.length ? null : h('p', { class: 'hint lb-opsnote' }, ops.unknown.map(x => `“${x.op}” isn’t an operator (searched as text): did you mean ${x.suggest}?`).join(' ')),
    em || !viewOpen ? null : h('div', { class: 'refl-viewpanel' }, filterChips, viewBar));

  // edit-mode toolbar: select all / clear / complete / export in or out / delete selected
  const checks = [];
  const delBtn = h('button', { class: 'danger', onclick: () => deleteSelected() });
  const doneBtn = h('button', { class: 'primary', onclick: () => completeSelected() });
  const paintSel = () => {
    delBtn.textContent = `Delete selected (${rv.sel.size})`; delBtn.disabled = !rv.sel.size;
    doneBtn.textContent = `Mark complete (${rv.sel.size})`; doneBtn.disabled = !rv.sel.size;
    for (const [cb, li, id] of checks) { cb.checked = rv.sel.has(id); li.classList.toggle('sel', cb.checked); }
  };
  const toolbar = em ? h('section', { class: 'card refl-editbar' },
    h('p', { class: 'hint', style: 'margin:0 0 6px' }, 'Drag ', h('span', { class: 'refl-handle-ico' }, '⠿'), ' onto another heading to move a reflection. Tick reflections to mark them complete or delete them.'),
    h('div', { class: 'bar', style: 'flex-wrap:wrap;gap:8px' },
      h('button', { class: 'small', onclick: () => { all.forEach(r => r.id && rv.sel.add(r.id)); paintSel(); } }, 'Select all'),
      h('button', { class: 'small', onclick: () => { rv.sel.clear(); paintSel(); } }, 'Clear'),
      h('span', { class: 'grow' }), doneBtn, delBtn)) : null;

  const row = (r, showHeading = false) => {
    const cb = em ? h('input', { type: 'checkbox', class: 'refl-cb', 'aria-label': `Select ${r.initials || 'reflection'} ${r.diagnosis || ''}`, onclick: e => e.stopPropagation(),
      onchange: e => { e.target.checked ? rv.sel.add(r.id) : rv.sel.delete(r.id); paintSel(); } }) : null;
    const draft = r.status !== 'complete';
    const pts = (r.points || []).map(pt => (pt && pt.heading || '').trim()).filter(Boolean);
    const open = () => { if (em) { if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); } } else openEditor(r); };
    const li = h('li', { tabindex: '0', class: em ? 'refl-row edit' : 'refl-row', onclick: open, onkeydown: e => { if (e.key === 'Enter') open(); } },
      h('span', { class: 'd' }, em ? h('span', { class: 'refl-tools' }, rv.group === 'heading' ? h('span', { class: 'refl-handle', title: 'Drag to another heading', 'aria-label': 'Drag to another heading', onpointerdown: e => startDrag(e, r, li), onclick: e => e.stopPropagation() }, '⠿') : null, cb) : null,
        (r.jr ? 'JR ' : '') + (r.date ? fmtDate(r.date) : '—')),
      h('span', { class: 't' }, h('span', { class: draft ? 'refl-proc draft' : 'refl-proc' }, `${r.initials || '??'} ${r.diagnosis || ''}`), draft ? h('span', { class: 'flag err' }, 'draft') : null,
        h('span', { class: 'muted refl-wc' }, ` ${wordCount(r)} words`),
        showHeading ? h('span', { class: 'muted refl-hd' }, labelOf(HEADING_BY_ID[r.headingId])) : null),
      pts.length ? h('div', { class: 'refl-points' }, ...pts.map((t, i) => h('div', {}, `${i + 1}. ${t}`))) : null);
    if (cb) checks.push([cb, li, r.id]);
    return li;
  };

  // a heading: tap its line to open or close it (met headings start closed)
  const isOpen = (id, met) => em || narrowed || rv.openH.has(id) || (!met && !rv.shutH.has(id));
  const toggle = (id, met) => { if (isOpen(id, met)) { rv.openH.delete(id); rv.shutH.add(id); } else { rv.shutH.delete(id); rv.openH.add(id); } hooks.render(); };

  // at the bottom, small and without a card: the rules (export and Word upload are under More →
  // Export / Import; the bin and photo sizes under Settings)
  const notesSwitch = em || rv.group !== 'heading' ? null : h('label', { class: 'check refl-notes-switch' },
    h('input', { type: 'checkbox', role: 'switch', checked: notesOn(), onchange: e => { patchLogbook({ settings: { reflNotes: e.target.checked } }); hooks.render(); } }), 'Show notes under each heading');
  const foot = em ? null : h('details', { class: 'refl-rules refl-foot' }, h('summary', {}, 'Rules for reflections'),
    h('ul', { class: 'hint' },
      h('li', {}, 'Each reflection is a different patient, under one heading only.'),
      h('li', {}, 'Some categories require one case reflection in Junior Residency (JR, R1–R3); when not indicated, at most one case reflection can be done at the JR level per category.'),
      h('li', {}, 'Write as many as you like: you choose which go into the portfolio when you export. Uncategorised ones are never exported.'),
      h('li', {}, 'Generative AI use must follow the NUS guidelines on the use of AI tools in academic work.')));
  const body = h('section', { class: 'card' });
  let shown = 0;
  if (rv.group !== 'heading') {
    // other groupings: plain sections of rows (no + Add, counts or dragging between headings)
    const hits = sorted(narrowed ? all.filter(match) : all);
    const intake = effectiveIntake(), smo = residentSmo(S.resident);
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const keyOf = {
      month: r => r.date ? r.date.slice(0, 7) : '',
      year: r => { const y = r.date && intake ? caseRYear(r.date, intake, smo) : null; return y ? String(y) : ''; },
      status: r => r.status !== 'complete' ? '1' : !HEADING_BY_ID[r.headingId] ? '3' : '2',
      none: () => 'all',
    }[rv.group] || (() => 'all');
    const nameOf = {
      month: k => k ? `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}` : 'No date',
      year: k => k ? yearName(Number(k)) : 'Year unknown',
      status: k => ({ 1: 'Drafts', 2: 'Complete', 3: 'Uncategorised (complete)' })[k],
      none: () => 'All reflections',
    }[rv.group] || (() => 'All reflections');
    const groups = new Map();
    for (const r of hits) { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    // months and years: newest first (oldest first with that sort); the unknown group last
    const order = [...groups.keys()].sort((a, b) => (a === '') - (b === '') || (rv.group === 'status' ? a.localeCompare(b)
      : rv.sort === 'oldest' ? a.localeCompare(b) : b.localeCompare(a)));
    for (const k of order) {
      const rs = groups.get(k);
      shown += rs.length;
      add(body, h('div', { class: 'refl-h refl-group', style: 'margin:8px 0 4px' },
        h('h3', { style: 'margin:10px 0 4px' }, nameOf(k), h('span', { class: 'muted refl-counts' }, ` · ${rs.length}`)),
        h('ul', { class: 'cases' }, rs.map(r => row(r, true)))));
    }
    if (!shown) add(body, h('p', { class: 'empty' }, narrowed ? 'No reflections match.' : 'No reflections yet.'));
    if (em) paintSel();
    return h('div', {}, head, toolbar, body, foot);
  }
  for (const hp of p.headings) {
    const items = sorted(all.filter(r => r.headingId === hp.id));
    const hits = narrowed ? items.filter(match) : items;
    if (narrowed && !hits.length) continue;
    shown += hits.length;
    // no section headings (General Surgery, Trauma…): the heading names say enough (owner's choice)
    const x = exBy[hp.id];
    const opened = isOpen(hp.id, hp.met);
    add(body, h('div', { class: 'refl-h', 'data-heading': hp.id, style: 'margin:8px 0 4px' },
      h('div', { class: 'refl-hrow' },
        h('div', { class: 'grow refl-htoggle', role: 'button', tabindex: '0', 'aria-expanded': String(opened), onclick: () => toggle(hp.id, hp.met), onkeydown: e => { if (e.key === 'Enter') toggle(hp.id, hp.met); } },
          items.length ? h('span', { class: 'res-chev', 'aria-hidden': 'true' }, '›') : h('span', { class: 'res-chev blank', 'aria-hidden': 'true' }), ' ',
          h('i', { class: `dot ${hp.met ? 'done' : hp.done ? 'ontrack' : 'due'}` }), ' ', h('b', {}, `${hp.done}/${hp.min}`), ' ',
          // the name flows beside the count (a long one wraps under itself, not below the count)
          h('span', { class: 'refl-hname' }, hp.label, x.written > hp.done ? h('span', { class: 'muted refl-counts' }, ` · ${x.written} written`) : null)),
        em ? null : h('button', { class: 'small refl-add', title: 'Add a reflection under ' + hp.label, 'aria-label': 'Add a reflection under ' + hp.label, onclick: () => openPicker(false, { headingId: hp.id, subId: null }) }, '+ Add')),
      // the heading's note (rules, examples; categories.js), shown whether open or not unless switched off
      notesOn() && hp.note ? h('div', { class: 'hint refl-note' }, hp.note) : null,
      opened ? [
        // sub-types are in the note above, so a missing one isn't repeated here
        hp.issues.filter(y => !y.startsWith('Missing: ')).length ? h('div', { class: 'hint', style: 'color:var(--warn, #b45309)' }, hp.issues.filter(y => !y.startsWith('Missing: ')).join(' · ')) : null,
        hits.length ? h('ul', { class: 'cases' }, hits.map(row)) : em ? h('div', { class: 'refl-empty hint' }, 'Drop here') : null] : null));
  }
  // Uncategorised: always there (+ Add), never exported
  const orphans = sorted(all.filter(r => !HEADING_BY_ID[r.headingId]));
  const oHits = narrowed ? orphans.filter(match) : orphans;
  if (!narrowed || oHits.length) {
    shown += oHits.length;
    add(body, h('div', { class: 'refl-h', 'data-heading': '', style: 'margin:16px 0 4px' },
      h('div', { class: 'refl-hrow' },
        h('div', { class: 'grow' }, h('b', {}, 'Uncategorised'), h('span', { class: 'muted refl-counts' }, ` · ${orphans.length} written · not exported`)),
        em ? null : h('button', { class: 'small refl-add', title: 'Add an uncategorised reflection', 'aria-label': 'Add an uncategorised reflection', onclick: () => openPicker(false, { headingId: '', subId: null, uncat: true }) }, '+ Add')),
      h('div', { class: 'hint' }, 'For reflections that don’t fit a portfolio heading yet. Move one to a heading to export it.'),
      oHits.length ? h('ul', { class: 'cases' }, oHits.map(row)) : null));
  }
  if (narrowed && !shown) add(body, h('p', { class: 'empty' }, 'No reflections match.'));
  if (em) paintSel();
  return h('div', {}, head, toolbar, body, notesSwitch, foot);
}

// Tick or untick one reflection for the export.
async function setExport(r, on) {
  try { await cloud.saveReflection(mine(), { ...r, export: on }); }
  catch (err) { toast('Could not save: ' + err.message); hooks.render(); }
}

// "Tick just enough": per heading, the longest complete reflections that meet its minimum (keeping
// the required sub-types and JR ones) go into the export; the rest are left out. Undo puts them back.
async function justEnough() {
  const all = S.reflections || [];
  const pick = pickJustEnough(all);
  const change = all.filter(r => r.id in pick && (r.export !== false) !== pick[r.id]);
  if (!change.length) return toast('Already just enough: nothing to change.');
  const outN = change.filter(r => !pick[r.id]).length, inN = change.length - outN;
  if (!await confirmBox('Tick just enough?', `For each heading, the longest complete reflections that meet its minimum go into the export (keeping the required sub-types and JR ones). ${inN ? inN + ' will be ticked, ' : ''}${outN} left out. Nothing is deleted, and you can change any of them after.`, 'Tick just enough')) return;
  const before = change.map(r => ({ ...r }));
  let n = 0;
  for (const r of change) { try { await cloud.saveReflection(mine(), { ...r, export: pick[r.id] }); n++; } catch (err) { toast('Could not save: ' + err.message); break; } }
  toast(`${exportSummary(S.reflections || []).total} reflections in the export`, { action: 'Undo', onaction: async () => {
    for (const r of before) { try { await cloud.saveReflection(mine(), r); } catch (err) { toast('Could not undo: ' + err.message); return; } }
    toast('Export choices put back'); hooks.render();
  } });
  hooks.render();
}

async function deleteSelected() {
  const pick = (S.reflections || []).filter(r => rv.sel.has(r.id));
  if (!pick.length) return;
  const n = pick.length, word = n === 1 ? 'reflection' : 'reflections';
  if (!await confirmBox(`Delete ${n} ${word}?`, `Move ${n} ${word} to the recycle bin? They can be restored for 30 days.`, 'Move to bin', true)) return;
  const done = await binReflections(pick);
  rv.sel.clear();
  if (done) toast(`${done} ${done === 1 ? 'reflection' : 'reflections'} moved to the recycle bin`, { action: 'Recycle bin', onaction: () => openView('bin') });
  hooks.render();
}

// Mark the ticked reflections complete. Ones still missing something (case, initials, date, …) stay
// drafts and are listed, so nothing is marked complete that couldn't be marked one by one.
async function completeSelected() {
  const pick = (S.reflections || []).filter(r => rv.sel.has(r.id));
  if (!pick.length) return;
  const ready = pick.filter(r => r.status !== 'complete' && !completeProblems(r).length);
  const already = pick.filter(r => r.status === 'complete').length;
  const blocked = pick.filter(r => r.status !== 'complete' && completeProblems(r).length);
  let done = 0;
  for (const r of ready) {
    try { await cloud.saveReflection(mine(), { ...r, status: 'complete' }); done++; }
    catch (err) { toast('Could not save: ' + err.message); break; }
  }
  rv.sel.clear();
  const parts = [`${done} marked complete`];
  if (already) parts.push(`${already} already complete`);
  if (blocked.length) {
    const why = [...new Set(blocked.flatMap(completeProblems))].slice(0, 3).join(', ');
    parts.push(`${blocked.length} still need${blocked.length === 1 ? 's' : ''} ${why}`);
  }
  toast(parts.join(' · '));
  hooks.render();
}

// ---------- drag between headings (edit mode; pointer events so it works with touch on iOS) ----------

function startDrag(e, r, li) {
  if (!rv.editMode || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault(); e.stopPropagation();
  const box = li.getBoundingClientRect();
  const ghost = li.cloneNode(true);
  ghost.classList.add('refl-ghost');
  ghost.style.width = box.width + 'px';
  document.body.append(ghost);
  li.classList.add('dragging');
  document.body.classList.add('dragging-refl');
  drag = { r, li, ghost, target: null, x: e.clientX, y: e.clientY, dy: e.clientY - box.top, raf: 0 };
  const handle = e.currentTarget;
  try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  const move = ev => { drag.x = ev.clientX; drag.y = ev.clientY; place(); };
  const end = ev => {
    handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', end);
    const d = drag; drag = null;
    cancelAnimationFrame(d.raf); d.ghost.remove(); d.li.classList.remove('dragging');
    document.body.classList.remove('dragging-refl');
    if (d.target) d.target.classList.remove('refl-drop');
    const to = ev.type === 'pointerup' && d.target ? d.target.dataset.heading : null;
    if (to && to !== d.r.headingId) moveReflection(d.r, to);
    else hooks.render();   // catch up on anything that changed during the drag
  };
  handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
  place();
  const tick = () => {   // auto-scroll near the top/bottom edge
    if (!drag) return;
    const edge = 70, bottom = innerHeight - (parseFloat(getComputedStyle(document.body).getPropertyValue('--tabbar-h')) || 0);
    let v = 0;
    if (drag.y < edge) v = -Math.ceil((edge - drag.y) / 4);
    else if (drag.y > bottom - edge) v = Math.ceil((drag.y - (bottom - edge)) / 4);
    if (v) { scrollBy(0, Math.max(-24, Math.min(24, v))); place(); }
    drag.raf = requestAnimationFrame(tick);
  };
  drag.raf = requestAnimationFrame(tick);
}
function place() {
  const d = drag;
  if (!d) return;
  d.ghost.style.transform = `translate(${Math.round(d.x - 20)}px, ${Math.round(d.y - d.dy)}px)`;
  const el = document.elementFromPoint(d.x, d.y);
  let t = el && el.closest ? el.closest('[data-heading]') : null;
  if (t && t.dataset.heading === d.r.headingId) t = null;   // its own heading isn't a drop target
  if (t !== d.target) {
    if (d.target) d.target.classList.remove('refl-drop');
    d.target = t;
    if (t) t.classList.add('refl-drop');
  }
}
async function moveReflection(r, headingId) {
  const before = { ...r };
  const moved = moveToHeading(r, headingId);
  const name = labelOf(HEADING_BY_ID[headingId]);
  try {
    await cloud.saveReflection(mine(), moved);
    toast(`Moved to ${name}`, { action: 'Undo', ms: 7000, onaction: async () => {
      try { await cloud.saveReflection(mine(), before); toast('Move undone'); } catch (err) { toast('Could not undo: ' + err.message); }
    } });
  } catch (err) { toast('Could not move: ' + err.message); }
  hooks.render();
}

// ---------- images ----------

// ---------- mark the portfolio as ready (admins generate it; js/cloud.js submissions) ----------

const RS = { sub: undefined, loading: false, busy: false };
// gen: bumped on sign-out, so a load still running for the last person is dropped
resetters.push(() => { RS.sub = undefined; RS.loading = false; RS.busy = false; RS.gen = (RS.gen || 0) + 1; });
const hashStr = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
// what admins would get now: the ticked reflections, Section 1, the Section 4 numbers, and a fingerprint
function readyPayload() {
  const list = (S.reflections || []).filter(inExport);
  const profile = (S.logbook && S.logbook.profile) || null;
  const intake = effectiveIntake(), smo = residentSmo(S.resident);
  const counts = countsByYear(S.cases || [], intake, smo);
  const imageIds = [...new Set(list.flatMap(r => (r.figures || []).map(f => f.id)).filter(Boolean))];
  const fp = hashStr(JSON.stringify([list.map(r => [r.id, r.updatedAt || 0]).sort(), profile, counts, displayName(), intake, rYear(), smo]));
  return { list, meta: { rid: (S.resident && S.resident.rid) || (S.logbook && S.logbook.rid) || null, name: displayName(), intake, rYear: rYear(), smo, fp, count: list.length, profile, counts, imageIds } };
}
async function markReady(ex, update = false) {
  // no check against the portfolio rules here: the programme also reviews interim portfolios
  // the admins read this copy from the server, so it needs a connection (offline it would wait forever)
  if (!cloud.demo && !navigator.onLine) return toast('Marking the portfolio ready needs a connection. Try again when you have signal.');
  RS.busy = true; hooks.render();
  try {
    const { list, meta } = readyPayload();
    RS.sub = await cloud.submitPortfolio(mine(), { ...meta, readyAt: update && RS.sub ? RS.sub.readyAt : Date.now() }, list);
    toast(update ? 'Ready portfolio updated' : 'Portfolio marked as ready: the programme admins can generate it');
  } catch (err) { toast('Could not save: ' + err.message); }
  RS.busy = false; hooks.render();
}
function readyCard(ex) {
  if (RS.sub === undefined && !RS.loading) {
    RS.loading = true;
    const gen = RS.gen;
    cloud.loadMySubmission(mine()).then(x => { if (gen !== RS.gen) return; RS.sub = x; RS.loading = false; if (S.tab === 'export') hooks.render(); });
  }
  const sub = RS.sub;
  const changed = sub && sub.fp !== readyPayload().meta.fp;
  return h('section', { class: `card ready-card${sub ? ' is-ready' : ''}` },
    h('h2', { style: 'margin:0 0 4px' }, 'Portfolio for the programme'),
    sub === undefined ? h('p', { class: 'muted' }, 'Checking…')
      : sub ? h('p', { style: 'margin:0 0 6px' }, h('b', {}, '✓ Marked ready'), ` on ${new Date(sub.readyAt).toLocaleDateString()} (${sub.count} reflection${sub.count === 1 ? '' : 's'}). The programme admins can generate it.`)
      : h('p', { class: 'hint', style: 'margin:0 0 6px' }, 'When your ticked reflections are ready, mark the portfolio as ready: the programme admins can then generate it. They see only the ticked reflections, your Section 1 details and your Section 4 case numbers, never your cases or other reflections.'),
    changed ? h('p', { class: 'tip' }, 'You’ve changed things since you marked it ready. Tap Update so the admins get the latest.') : null,
    sub === undefined ? null : h('div', { class: 'bar', style: 'flex-wrap:wrap;gap:8px;margin:0' },
      sub ? [
        h('button', { class: changed ? 'primary' : '', disabled: RS.busy, onclick: () => markReady(ex, true) }, RS.busy ? 'Saving…' : 'Update'),
        h('button', { disabled: RS.busy, onclick: async () => {
          if (!cloud.demo && !navigator.onLine) return toast('Unmarking needs a connection. Try again when you have signal.');
          if (!(await confirmBox('Unmark the portfolio?', 'The admins will no longer be able to generate it until you mark it ready again.', 'Unmark', true))) return;
          try { await cloud.withdrawPortfolio(mine()); RS.sub = null; toast('Portfolio unmarked'); } catch (err) { toast('Could not unmark: ' + err.message); }
          hooks.render();
        } }, 'Unmark')]
        : h('button', { class: 'primary', disabled: RS.busy || !ex.total, onclick: () => markReady(ex) }, RS.busy ? 'Saving…' : 'Mark portfolio as ready')));
}

// ---------- Export page (#export, from More → Export) ----------

// Choose which complete reflections go into the Word portfolio (ticks are kept for next time), then export.
// Per heading: how many are ticked against its minimum, with warnings when a required sub-type or the
// JR ones are left out. "Tick just enough" keeps the longest that meet each minimum.
export function renderExportPage(onChoose = false) {
  const all = S.reflections || [];
  const ex = exportSummary(all);
  const exBy = Object.fromEntries(ex.headings.map(x => [x.id, x]));
  const drafts = all.filter(r => r.status !== 'complete').length;
  const uncat = all.filter(r => r.status === 'complete' && !HEADING_BY_ID[r.headingId]).length;
  const complete = all.filter(r => r.status === 'complete' && HEADING_BY_ID[r.headingId]);
  const setMany = async (list, on) => {
    let n = 0;
    for (const r of list.filter(x => (x.export !== false) !== on)) { try { await cloud.saveReflection(mine(), { ...r, export: on }); n++; } catch (err) { toast('Could not save: ' + err.message); break; } }
    hooks.render();
    return n;
  };
  const top = h('section', { class: 'card' },
    h('h2', { style: 'margin:0 0 4px' }, 'Export portfolio (Word)'),
    h('p', { class: 'hint', style: 'margin:0 0 8px' }, 'Your complete reflections go into the APMES portfolio, with Section 1 and the Section 4 case numbers filled in. All are included unless you leave some out.'),
    h('div', { class: 'bar', style: 'flex-wrap:wrap;gap:8px;margin:0 0 10px;align-items:center' },
      h('span', {}, h('b', {}, `${ex.total} of ${complete.length} reflections included`),
        drafts || uncat ? h('span', { class: 'hint' }, ` · not exported: ${[drafts ? `${drafts} draft${drafts === 1 ? '' : 's'}` : '', uncat ? `${uncat} uncategorised` : ''].filter(Boolean).join(', ')}`) : null),
      complete.length ? h('a', { class: 'btn small', href: '#choose' }, 'Choose reflections ›') : null),
    portfolioExportButton());
  if (!onChoose) return h('div', {}, top, readyCard(ex));
  // ---- the Choose page (#choose): ticks per heading, quick actions behind one button ----
  const quick = h('details', { class: 'quick-actions' },
    h('summary', { class: 'btn small' }, 'Quick actions ▾'),
    h('div', { class: 'qa-menu' },
      h('button', { class: 'small', onclick: () => justEnough() }, 'Tick just enough (longest that meet each minimum)'),
      h('button', { class: 'small', onclick: () => setMany(complete, true) }, 'Tick all'),
      h('button', { class: 'small', onclick: async () => { if (await confirmBox('Untick all?', 'Nothing will be exported until you tick some again.', 'Untick all', true)) setMany(complete, false); } }, 'Untick all')));
  const choose = h('section', { class: 'card' },
    h('div', { class: 'bar', style: 'align-items:center' }, h('h2', { style: 'margin:0' }, 'Choose reflections'), h('span', { class: 'grow' }), complete.length ? quick : null),
    h('p', { class: 'hint', style: 'margin:6px 0 0' }, `${ex.total} of ${complete.length} included. Untick any you’d rather leave out; your choice is kept for next time.`));
  const body = h('section', { class: 'card' });
  for (const hd of REFLECTION_HEADINGS) {
    const rs = complete.filter(r => r.headingId === hd.id).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (!rs.length) continue;
    const x = exBy[hd.id];
    add(body, h('div', { class: 'exp-h' },
      h('div', { class: 'bar', style: 'gap:8px;align-items:center;margin:8px 0 2px' },
        h('i', { class: `dot ${x.inExport >= hd.min ? 'done' : x.inExport ? 'ontrack' : 'due'}` }),
        h('span', { class: 'grow' }, h('b', {}, `${x.inExport} of ${hd.min}`), ' ', labelOf(hd), h('span', { class: 'muted refl-counts' }, ` · ${rs.length} written`))),
      x.warn.length ? h('div', { class: 'hint', style: 'color:var(--warn, #b45309)' }, x.warn.join(' · ')) : null,
      h('ul', { class: 'exp-list' }, rs.map(r => h('li', {},
        h('label', { class: 'check exp-row' },
          h('input', { type: 'checkbox', checked: r.export !== false, onchange: e => setExport(r, e.target.checked) }),
          h('span', {}, h('span', { class: 'muted' }, `${r.jr ? 'JR ' : ''}${r.date ? fmtDate(r.date) : '—'} · `), `${r.initials || '??'} ${r.diagnosis || ''}`,
            r.subId && hd.subs ? h('span', { class: 'flag' }, (hd.subs.find(s2 => s2.id === r.subId) || {}).name || '') : null,
            h('span', { class: 'muted refl-wc' }, ` · ${wordCount(r)} words`),
            // learning point headings, to tell similar reflections apart
            (r.points || []).some(pt => (pt.heading || '').trim())
              ? h('ul', { class: 'exp-points hint' }, (r.points || []).filter(pt => (pt.heading || '').trim()).map(pt => h('li', {}, pt.heading.trim())))
              : null)))))));
  }
  if (!complete.length) add(body, h('p', { class: 'empty' }, 'No complete reflections under a heading yet. Mark reflections complete on the Reflections tab, then come back.'));
  return h('div', {}, choose, body);
}
export const renderChoosePage = () => renderExportPage(true);

// Images of the given reflections' figures, for the Word export: { id: { data, mime, w, h } }. Missing ones are skipped.
// The Word portfolio export button (shown in More → Export): complete reflections, Section 1
// details and the Section 4 counts.
export function portfolioExportButton() {
  const n = (S.reflections || []).filter(inExport).length;
  return renderExportButton(() => (S.reflections || []).filter(inExport), displayName,
    async () => ({ cases: S.cases || [], intake: effectiveIntake(), rYear: rYear(), smo: residentSmo(S.resident),
      profile: (S.logbook && S.logbook.profile) || null,
      images: await loadImagesFor((S.reflections || []).filter(inExport)) }),
    `Export ${n} reflection${n === 1 ? '' : 's'} (Word)`);
}

export async function loadImagesFor(reflections) {
  const ids = [...new Set((reflections || []).flatMap(r => (r.figures || []).map(f => f.id)).filter(Boolean))];
  const out = {};
  await Promise.all(ids.map(async id => {
    try {
      const img = await cloud.loadImage(mine(), id);
      if (img && img.data) out[id] = { data: img.data, mime: img.mime || 'image/jpeg', w: img.w, h: img.h };
    } catch { /* skip */ }
  }));
  return out;
}

// Phone photo -> JPEG base64 (no data: prefix), longest side ≤ IMAGE_MAX_SIDE, under IMAGE_MAX_B64.
async function compressImage(file) {
  let src = null;
  try { if (typeof createImageBitmap === 'function') src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { src = null; }
  if (!src) {
    // fallback: <img> (browsers apply EXIF orientation to images by default)
    const url = URL.createObjectURL(file);
    try {
      src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('not an image this browser can read')); i.src = url; });
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const W = src.width || src.naturalWidth, H = src.height || src.naturalHeight;
  if (!W || !H) throw new Error('could not read the image');
  let max = IMAGE_MAX_SIDE, q = IMAGE_QUALITY;
  for (let i = 0; i < 8; i++) {
    const k = Math.min(1, max / Math.max(W, H));
    const w = Math.max(1, Math.round(W * k)), hh = Math.max(1, Math.round(H * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = hh;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);   // transparent PNGs -> white, not black
    ctx.drawImage(src, 0, 0, w, hh);
    const data = c.toDataURL('image/jpeg', q).split(',')[1] || '';
    if (data && data.length < IMAGE_MAX_B64) { if (src.close) src.close(); return { data, mime: 'image/jpeg', w, h: hh }; }
    max = Math.round(max * 0.8); q = Math.max(0.5, q - 0.08);
  }
  throw new Error('image is too large even after compressing');
}

const newId = () => 'img' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- editor ----------

const TA = 'font-size:16px;width:100%;box-sizing:border-box;line-height:1.4';
const IN = 'font-size:16px;width:100%;box-sizing:border-box';
const boxCard = (label, hint, ...kids) => h('section', { class: 'card' },
  h('h3', { style: 'margin:0 0 4px' }, label), hint ? h('p', { class: 'hint', style: 'margin:0 0 8px' }, hint) : null, ...kids);
const nonEmpty = s => !!String(s || '').trim();

// Move figures along with their learning points when points are removed or reordered.
function remapFigures(r, map) { for (const f of r.figures || []) if (f.point != null) f.point = map(f.point); }

function editor() {
  const r = rv.editing;
  // KB of photos across all my reflections, with this one as currently edited
  const usedKb = () => photoUsageKb([...(S.reflections || []).filter(x => x.id !== r.id), r]);
  r.points ||= []; r.figures ||= []; r.references ||= [];
  const legacy = isLegacy(r);
  const status = h('span', { class: 'muted', style: 'font-size:13px' }, r.id ? 'Saved' : 'Not saved yet');
  const persist = async () => {
    // a debounced save from an earlier render can fire after the editor closed or the reflection
    // was deleted: it must not reopen the editor or bring the reflection back
    if (rv.editing !== r) return;
    lsSet({ ...r, restore: true });
    try {
      if (r.source !== 'word') setJr(r);   // Word imports keep the JR written in the document
      r.id ||= Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      r.createdAt ||= Date.now();
      await cloud.saveReflection(mine(), r);
      status.textContent = 'Saved';
    } catch (err) { status.textContent = 'Saved on this device only'; toast('Could not save: ' + err.message); }
  };
  const autosave = debounce(persist, 1200);
  const words = h('span', { 'aria-live': 'polite' });
  const paintWords = () => {
    const n = wordCount(r), ok = n >= MIN_WORDS;
    words.textContent = ok ? `${n} words ✓ meets the ${MIN_WORDS}-word guide` : `${n} / ${MIN_WORDS} words (suggested minimum)`;
    words.style.cssText = `font-size:13px;font-weight:600;color:${ok ? 'var(--ok, #15803d)' : 'var(--warn, #b45309)'}`;
  };
  paintWords();
  const changed = () => { status.textContent = 'Editing…'; paintWords(); lsSet({ ...r, restore: true }); autosave(); };
  const restructure = () => { changed(); hooks.render(); };   // list changed: save and redraw
  const close = async () => { autosave.cancel(); if (hasContent(r)) await persist(); rv.editing = null; rv.thumbs = {}; lsSet(null); hooks.render(); };

  const subWrap = h('div');
  const paintSubs = () => {
    const hd = HEADING_BY_ID[r.headingId];
    subWrap.replaceChildren(...[
      hd && hd.name !== hd.label ? h('p', { class: 'hint' }, 'Portfolio heading: ' + hd.name) : null,
      hd && hd.note ? h('p', { class: 'hint' }, hd.note) : null,
    ].filter(Boolean));
  };
  paintSubs();

  let sec = '';
  const headingSelect = h('select', { 'data-field': 'heading', style: 'font-size:16px;max-width:100%', onchange: e => { r.headingId = e.target.value; r.subId = null; paintSubs(); changed(); } },
    h('option', { value: '', selected: !HEADING_BY_ID[r.headingId] }, 'Uncategorised (not exported)'),
    REFLECTION_HEADINGS.map(hd => {
      const g = hd.section !== sec ? (sec = hd.section) : null;
      return [g ? h('option', { disabled: true }, `— ${g} —`) : null, h('option', { value: hd.id, selected: r.headingId === hd.id }, labelOf(hd))];
    }));

  const lc = caseById(r.caseId);
  const linkBox = r.caseId
    ? h('div', { class: 'refl-case', style: 'border:1px solid var(--line, #ddd);border-radius:10px;padding:8px 10px;margin:8px 0' },
      h('div', { class: 'bar', style: 'gap:8px;align-items:center' },
        h('b', { style: 'font-size:13px' }, 'Linked case'), h('span', { class: 'grow' }),
        h('button', { class: 'small', onclick: () => openPicker(true) }, 'Change case'),
        h('button', { class: 'small', onclick: () => { r.caseId = null; restructure(); } }, 'Unlink')),
      lc ? h('div', {}, h('span', { class: 'muted' }, caseDate(lc) + ' · '), caseText(lc) || '(no details)',
        (lc.cats || []).length ? h('div', { class: 'muted', style: 'font-size:13px' }, lc.cats.map(catName).join(', ')) : null)
        : h('div', { class: 'hint' }, S.casesLoaded === false ? 'Loading case…' : 'The linked case is no longer in your logbook. Change case to link another.'))
    : h('div', { style: 'border:1px solid var(--line, #ddd);border-radius:10px;padding:8px 10px;margin:8px 0' },
      h('p', { style: 'margin:0 0 6px' }, h('b', {}, r.source === 'word' ? 'Imported from Word. ' : 'No case linked. '), 'Linking it to a logged case is optional.'),
      h('button', { onclick: () => openPicker(true) }, 'Link to a case'));
  if (rv.relinked) { rv.relinked = false; setTimeout(() => { status.textContent = 'Editing…'; autosave(); }, 0); }

  const input = (key, attrs = {}) => h('input', { style: 'font-size:16px', value: r[key] ?? '', ...attrs, oninput: e => { r[key] = e.target.value || (key === 'date' ? null : ''); changed(); } });
  const fields = h('section', { class: 'card' },
    h('div', { class: 'bar' }, h('button', { onclick: close }, '← Reflections'), h('span', { class: 'grow' }), status),
    linkBox,
    !r.headingId ? suggestChips(lc, x => { r.headingId = x.headingId; r.subId = null; restructure(); }, r.jr) : null,
    h('label', { class: 'field' }, 'Heading', headingSelect),
    subWrap,
    h('div', { class: 'bar', style: 'flex-wrap:wrap;gap:8px' },
      h('label', { class: 'field' }, 'Patient initials', input('initials', { 'data-field': 'initials', maxlength: '20', autocapitalize: 'characters', style: 'font-size:16px;width:7em' })),
      h('label', { class: 'field' }, 'Date', h('input', { type: 'date', 'data-field': 'date', style: 'font-size:16px', value: r.date || '', oninput: e => { r.date = e.target.value || null; if (r.source !== 'word') setJr(r); changed(); } }))),
    h('p', { class: 'hint' }, 'Some categories require one case reflection in Junior Residency (JR); when not indicated, at most one case reflection can be done at the JR level per category. A reflection dated in R1–R3 is marked JR in the Word export automatically.'),
    h('label', { class: 'field' }, 'Diagnosis / operation', input('diagnosis', { maxlength: '2000' })),
    h('p', { class: 'hint' }, 'De-identified only: initials, no names or NRIC. Generative AI use must follow the NUS guidelines on the use of AI tools in academic work.'));

  // What APMES wants covered (from the portfolio's reflection elements)
  const guide = h('details', { class: 'card', style: 'padding:12px 16px' },
    h('summary', { style: 'cursor:pointer;font-weight:600' }, 'What APMES wants covered'),
    h('p', { class: 'hint' }, 'Write the case details, then learning points. Between them, the learning points should cover:'),
    h('ul', { style: 'margin:4px 0 0;padding-left:20px' }, REFLECTION_SECTIONS.filter(s => s.id !== 'description' && (s.id !== 'further' || r.jr))
      .map(s => h('li', { style: 'margin-bottom:4px' }, h('b', {}, s.name), ': ', s.hint))));

  let body;
  if (legacy) {
    body = [h('section', { class: 'card' },
      h('p', { class: 'hint' }, 'This reflection uses the older one-box-per-section layout. It still exports as it is, or convert it to the portfolio layout (case details + learning points).'),
      h('button', { onclick: () => {
        const sx = r.sections || {};
        r.summary = sx.description || '';
        r.points = REFLECTION_SECTIONS.filter(s => s.id !== 'description' && nonEmpty(sx[s.id])).map(s => ({ heading: s.name, text: sx[s.id] }));
        if (!r.points.length) r.points = [{ heading: '', text: '' }];
        delete r.sections;
        restructure();
      } }, 'Convert to portfolio layout')),
    h('section', { class: 'card' }, REFLECTION_SECTIONS.map(s =>
      s.id === 'further' && !r.jr ? null : h('label', { class: 'field', style: 'display:block;margin-bottom:12px' },
        h('b', {}, s.name + (s.optional ? ' (optional)' : '')),
        h('textarea', { rows: '5', maxlength: '20000', placeholder: s.hint, style: TA,
          value: r.sections[s.id] || '', oninput: e => { r.sections[s.id] = e.target.value; changed(); } }))))];
  } else {
    const title = boxCard('Title', 'Bold heading of the reflection, e.g. “Airway management in a patient with trismus”.',
      h('input', { style: IN, maxlength: String(LIMITS.title), value: r.title || '', placeholder: 'Title', oninput: e => { r.title = e.target.value; changed(); } }));
    const summary = boxCard('Case details', 'What happened?',
      h('textarea', { rows: '10', maxlength: String(LIMITS.summary), style: TA, value: r.summary || '',
        placeholder: 'What happened? Demographics, history, examination, investigations, anaesthetic plan, events, outcome.',
        oninput: e => { r.summary = e.target.value; changed(); } }));
    title.dataset.field = summary.dataset.field = 'title or case details';

    const n = r.points.length;
    const points = boxCard('Learning points', 'For each point: what were the considerations, and what did you learn? Give it a short heading, then your discussion (analysis with evidence, conclusions, action plan).',
      r.points.map((p, i) => h('div', { style: 'border:1px solid var(--line, #ddd);border-radius:10px;padding:10px;margin:0 0 10px' },
        h('div', { class: 'bar', style: 'gap:6px;align-items:center;margin-bottom:6px' },
          h('b', { style: 'font-size:16px' }, `${i + 1}.`),
          h('input', { style: IN + ';flex:1', maxlength: String(LIMITS.pointHeading), value: p.heading || '', placeholder: 'Heading, e.g. Choice of airway management in trismus',
            'aria-label': `Learning point ${i + 1} heading`, oninput: e => { p.heading = e.target.value; changed(); } })),
        h('textarea', { rows: '6', maxlength: String(LIMITS.pointText), style: TA, value: p.text || '', placeholder: 'What were the considerations?\nWhat did you learn?',
          'aria-label': `Learning point ${i + 1} text`, oninput: e => { p.text = e.target.value; changed(); } }),
        // a scaffold to write into, for an empty point
        !String(p.text || '').trim() ? h('button', { class: 'small', style: 'margin-top:6px', onclick: () => { p.text = PROMPTS; restructure(); } }, 'Use prompts') : null,
        h('div', { class: 'bar', style: 'gap:6px;margin-top:6px' },
          h('button', { disabled: i === 0, 'aria-label': 'Move up', onclick: () => {
            [r.points[i - 1], r.points[i]] = [r.points[i], r.points[i - 1]];
            remapFigures(r, k => (k === i ? i - 1 : k === i - 1 ? i : k)); restructure();
          } }, '↑'),
          h('button', { disabled: i === n - 1, 'aria-label': 'Move down', onclick: () => {
            [r.points[i + 1], r.points[i]] = [r.points[i], r.points[i + 1]];
            remapFigures(r, k => (k === i ? i + 1 : k === i + 1 ? i : k)); restructure();
          } }, '↓'),
          h('span', { class: 'grow' }),
          h('button', { class: 'danger', onclick: async () => {
            if ((nonEmpty(p.heading) || nonEmpty(p.text)) && !await confirmBox('Remove learning point?', `Learning point ${i + 1} will be removed.`, 'Remove', true)) return;
            r.points.splice(i, 1);
            remapFigures(r, k => (k === i ? (i > 0 ? i - 1 : null) : k > i ? k - 1 : k)); restructure();
          } }, 'Remove')))),
      n < LIMITS.points ? h('button', { onclick: () => { r.points.push({ heading: '', text: '' }); restructure(); } }, '+ Add learning point') : null);

    // figures
    const fileIn = h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: async e => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (r.figures.length >= LIMITS.figures) return toast(`At most ${LIMITS.figures} images per reflection.`);
      status.textContent = 'Adding image…';
      try {
        const img = await compressImage(file);
        const kb = imageKb(img.data);
        if (usedKb() + kb > PHOTO_BUDGET_KB) {
          status.textContent = 'Image not added';
          return toast(`Your photos are using ${fmtMb(usedKb())} of ${fmtMb(PHOTO_BUDGET_KB)}. Remove a photo you no longer need (deleted reflections free theirs after 30 days in the recycle bin).`, { ms: 9000 });
        }
        const id = newId();
        await cloud.saveImage(mine(), { id, ...img, createdAt: Date.now() });
        rv.thumbs[id] = 'data:image/jpeg;base64,' + img.data;
        r.figures.push({ id, caption: '', point: r.points.length ? r.points.length - 1 : null, kb });
        autosave.cancel(); await persist(); hooks.render();
      } catch (err) { status.textContent = 'Image not added'; toast('Could not add image: ' + err.message); }
    } });
    // figures: rarely needed, so collapsed after References like it (open when there are some)
    const figures = h('details', { class: 'card fold-card', open: r.figures.length > 0 },
      h('summary', {}, `Figures (optional)${r.figures.length ? ' · ' + r.figures.length : ''}`),
      h('p', { class: 'hint', style: 'margin:8px 0 4px' }, `${PHOTO_NOTE} Your photos: ${fmtMb(usedKb())} of ${fmtMb(PHOTO_BUDGET_KB)} used.`),
      h('p', { class: 'hint', style: 'margin:0 0 4px;color:var(--warn, #b45309)' }, 'No faces, names, NRIC, MRN or anything identifying on monitors, labels or screens. Crop before adding.'),
      h('p', { class: 'hint', style: 'margin:0 0 8px;color:var(--warn, #b45309)' }, 'Use your own photos or diagrams. Don’t copy copyrighted figures from papers, books or websites without permission; if you adapt one, cite it under References.'),
      r.figures.map((f, i) => {
        const im = h('img', { alt: f.caption || `Figure ${i + 1}`, style: 'max-width:100%;max-height:220px;display:block;border-radius:6px;background:#eee;min-height:60px' });
        if (rv.thumbs[f.id]) im.src = rv.thumbs[f.id];
        else cloud.loadImage(mine(), f.id).then(d => {
          if (d && d.data) {
            rv.thumbs[f.id] = `data:${d.mime || 'image/jpeg'};base64,${d.data}`; im.src = rv.thumbs[f.id];
            if (!(f.kb > 0)) { f.kb = imageKb(d.data); autosave(); }   // older figure: record its real size
          }
          else im.alt = 'Image not found';
        }).catch(() => { im.alt = 'Image not available offline'; });
        return h('div', { style: 'border:1px solid var(--line, #ddd);border-radius:10px;padding:10px;margin:0 0 10px' },
          im,
          h('label', { class: 'field', style: 'display:block;margin-top:6px' }, `Caption (Figure ${i + 1}: …)`,
            h('input', { style: IN, maxlength: String(LIMITS.caption), value: f.caption || '', placeholder: 'e.g. Apnoeic oxygenation', oninput: e => { f.caption = e.target.value; changed(); } })),
          h('label', { class: 'field', style: 'display:block' }, 'Place after',
            h('select', { style: 'font-size:16px;max-width:100%', onchange: e => { f.point = e.target.value === '' ? null : Number(e.target.value); changed(); } },
              r.points.map((p, k) => h('option', { value: String(k), selected: f.point === k }, `Learning point ${k + 1}${nonEmpty(p.heading) ? ': ' + p.heading.slice(0, 40) : ''}`)),
              h('option', { value: '', selected: f.point == null }, 'End (after all learning points)'))),
          h('div', { class: 'bar' }, h('span', { class: 'grow' }), h('button', { class: 'danger', onclick: async () => {
            if (!await confirmBox('Remove image?', 'The image will be deleted.', 'Remove', true)) return;
            r.figures.splice(i, 1); delete rv.thumbs[f.id];
            cloud.deleteImage(mine(), f.id).catch(err => toast('Could not delete image: ' + err.message));
            restructure();
          } }, 'Remove image')));
      }),
      !S.resident ? h('p', { class: 'hint' }, 'Adding photos is for residents on the programme list. Ask an admin to add you.')
        : r.figures.length < LIMITS.figures ? h('button', { onclick: () => fileIn.click() }, '+ Add image') : h('p', { class: 'hint' }, `At most ${LIMITS.figures} images.`),
      fileIn);

    // references (optional, collapsed unless there are some)
    const refs = h('details', { class: 'card fold-card', open: r.references.length > 0 },
      h('summary', {}, `References (optional)${r.references.length ? ' · ' + r.references.length : ''}`),
      r.references.map((x, i) => h('div', { class: 'bar', style: 'gap:6px;margin:6px 0;align-items:center' },
        h('span', {}, `${i + 1}.`),
        h('input', { style: IN + ';flex:1', maxlength: String(LIMITS.reference), value: x, placeholder: 'Author. Title. Journal. Year;vol:pages.', oninput: e => { r.references[i] = e.target.value; changed(); } }),
        h('button', { 'aria-label': 'Remove reference', onclick: () => { r.references.splice(i, 1); restructure(); } }, '✕'))),
      r.references.length < LIMITS.references ? h('button', { style: 'margin-top:6px', onclick: () => { r.references.push(''); restructure(); } }, '+ Add reference') : null);

    points.dataset.field = 'at least one learning point';
    body = [title, summary, points, refs, figures];
  }

  const exportBox = HEADING_BY_ID[r.headingId] ? null : h('p', { class: 'hint', style: 'margin:0 0 8px' }, 'Uncategorised: not exported. Choose a heading above to export it.');
  const actions = h('section', { class: 'card' }, h('p', { style: 'margin:0 0 8px' }, words), exportBox, h('div', { class: 'bar', style: 'flex-wrap:wrap;gap:8px' },
    r.status === 'complete'
      ? h('button', { onclick: async () => { r.status = 'draft'; await persist(); hooks.render(); } }, 'Back to draft')
      : h('button', { class: 'primary', onclick: async () => {
        const missing = completeProblems(r);
        if (missing.length) { showMissing(missing); return toast('Before marking complete: ' + missing.join(', ')); }
        r.status = 'complete'; autosave.cancel(); await persist(); toast('Reflection complete'); rv.editing = null; rv.thumbs = {}; lsSet(null); hooks.render();
      } }, 'Mark complete'),
    h('span', { class: 'grow' }),
    r.id || r.figures.length ? h('button', { class: 'danger', onclick: async () => {
      if (!await confirmBox('Delete reflection?', 'Move this reflection to the recycle bin? It can be restored for 30 days.', 'Move to bin', true)) return;
      autosave.cancel();
      if (!r.id) await persist();   // images saved but the reflection never was: save it so the bin keeps both
      const n = await binReflections([JSON.parse(JSON.stringify(r))]);
      if (!n) return;
      toast('Reflection moved to the recycle bin', { action: 'Recycle bin', onaction: () => openView('bin') });
      rv.editing = null; rv.thumbs = {}; lsSet(null); hooks.render();
    } }, 'Delete') : null));

  return h('div', {}, fields, legacy ? null : guide, body, actions);
}

const hasContent = r => !!(r.headingId || r.initials || r.diagnosis || r.title || r.summary
  || (r.points || []).some(p => p.heading || p.text) || (r.figures || []).length || (r.references || []).some(Boolean)
  || Object.values(r.sections || {}).some(Boolean));
