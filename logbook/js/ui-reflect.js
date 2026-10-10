// Reflections tab (#reflect; also opened by the Logbook's Reflect buttons): list grouped by section
// and heading with progress, a case picker (every reflection is linked to a logged case: "+ New
// reflection" picks the case, then suggests headings from it; each heading's "+ Add" presets the heading),
// and an editor laid out like a portfolio Section 2 row: title, case summary, learning points, figures,
// references. Drafts autosave (cloud + this device); images are compressed and saved to their own docs.
// Edit mode (list "Edit" button) unlocks dragging reflections between headings (pointer events, so touch
// works) and selecting several to delete. Every delete goes to the recycle bin (bin.js, 30 days).

import { REFLECTION_HEADINGS, REFLECTION_SECTIONS } from './categories.js';
import { reflectionProgress, reflectionCounts, HEADING_BY_ID, splitDetails, completeProblems, isLegacy, LIMITS, IMAGE_MAX_B64, wordCount, MIN_WORDS, suggestHeadings, moveToHeading } from './reflections.js';
export { completeProblems };
import { fmtDate } from './engine.js';
import { S, h, toast, cloud, debounce, hooks, rYear, todayISO, confirmBox, add, resetters, scheduleSummary, displayName, byNewest, catName } from './ui-core.js';
import { renderExportButton, caseRYear } from './portfolio.js';

const DRAFT_KEY = 'apmes-logbook-reflection-draft';
const rv = { editing: null, thumbs: {}, picking: null, editMode: false, sel: new Set(), view: null };
// editing: the reflection open in the editor (or null for the list); thumbs: figure previews by image id;
// picking: case picker state { q, relink, preset: { headingId, subId }, chosen: case awaiting a heading };
// editMode: list edit mode (drag between headings, select to delete); sel: selected reflection ids;
// view: 'import' (Upload from Word) or 'bin' (Recycle bin) sub-view, or null.

const mine = () => S.user.email;
const lsGet = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } };
const lsSet = r => { try { r ? localStorage.setItem(DRAFT_KEY, JSON.stringify(r)) : localStorage.removeItem(DRAFT_KEY); } catch { /* blocked */ } };
resetters.push(() => { rv.editing = null; rv.picking = null; rv.editMode = false; rv.sel.clear(); rv.view = null; lsSet(null); });

// Live reflections for the signed-in user (app.js calls this after sign-in).
export function watchMyReflections(email) {
  S.reflections = [];
  return cloud.watchReflections(email, list => {
    S.reflections = list;
    scheduleSummary();
    // don't re-render under someone typing in the editor
    if (S.tab === 'reflect' && !rv.editing && !rv.picking && !rv.view && !drag) hooks.render();
  });
}
export const summaryReflections = () => reflectionCounts(S.reflections || []);

const blank = (over = {}) => ({
  id: null, headingId: '', subId: null, initials: '', date: todayISO(), jr: rYear() <= 3, diagnosis: '',
  title: '', summary: '', points: [{ heading: '', text: '' }], figures: [], references: [], caseId: null, status: 'draft', ...over,
});

// From a logged case: initials = leading capitals, diagnosis = the rest.
const fromCase = c => { const { initials, diagnosis } = splitDetails(c.details); return { initials, diagnosis, date: c.date || null, caseId: c.id }; };
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
      const nm = shortName(hd.name) + (sub ? ' · ' + sub.name : '');
      return h('button', { class: 'refl-chip' + (x.needed ? ' need' : ''), title: hd.name + (x.needed ? ' (still needed)' : ' (already met)'),
        onclick: () => onpick({ headingId: x.headingId, subId: x.subId }) }, nm, x.needed ? null : h('span', { class: 'muted' }, ' ✓'));
    })));
}
const shortName = n => { const t = n.replace(/\s*\(.*$/, '').replace(/\s+e\.g\.?,?.*$/i, '').trim() || n; return t.length > 48 ? t.slice(0, 46) + '…' : t; };

const showTab = () => { if (location.hash !== '#reflect') location.hash = '#reflect'; else hooks.render(); };
// JR follows from the reflection's date: R1–R3 at that date (from the resident's intake) is junior residency.
// Without a known intake, the current residency year decides.
function setJr(r) {
  const intake = S.resident && (S.resident.intake || Number(String(S.resident.rid || '').slice(0, 4)));
  const y = r.date && intake ? caseRYear(r.date, intake) : null;
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
    h('p', { style: 'margin:0 0 8px' }, h('span', { class: 'muted' }, caseDate(c) + ' · '), c.details || '(no details)',
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
  const cases = [...(S.cases || [])].sort(byNewest);
  const ul = h('ul', { class: 'cases refl-pick' });
  const count = h('p', { class: 'hint', style: 'margin:6px 0 0' });
  const paint = () => {
    const words = p.q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = cases.filter(c => {
      if (!words.length) return true;
      const hay = `${c.details || ''} ${c.date || ''} ${c.dateText || ''} ${c.date ? fmtDate(c.date) : ''} ${(c.cats || []).map(k => k + ' ' + catName(k)).join(' ')}`.toLowerCase();
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
        h('span', { class: 't' }, c.details || '(no details)', names ? h('span', { class: 'muted', style: 'display:block;font-size:13px' }, names) : null),
        h('span', { class: 'c' }, cur ? h('span', { class: 'flag' }, 'current') : has ? h('span', { class: 'flag' }, 'has reflection') : null));
    }));
    if (!shown.length) ul.replaceChildren(h('li', { class: 'empty' }, cases.length ? 'No cases match.' : 'No cases logged yet. Log the case first, then reflect on it.'));
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
    ph ? h('p', { style: 'margin:0 0 4px' }, h('span', { class: 'muted' }, 'Heading: '), h('b', {}, shortName(ph.name) + (psub ? ' · ' + psub.name : ''))) : null,
    h('p', { class: 'hint', style: 'margin:0 0 8px' }, p.relink ? 'Pick the logged case this reflection is about.' : 'Pick a logged case: the reflection starts with its initials, date and diagnosis filled in.'),
    search, count), h('section', { class: 'card' }, ul));
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

let drag = null;   // active drag { r, ghost, target, x, y, raf }

function list() {
  const all = S.reflections || [];
  const p = reflectionProgress(all);
  const em = rv.editMode;
  for (const id of [...rv.sel]) if (!all.some(r => r.id === id)) rv.sel.delete(id);
  const head = h('section', { class: 'card' },
    h('div', { class: 'bar', style: 'flex-wrap:wrap;gap:8px' },
      h('h2', { style: 'margin:0' }, 'Reflections'), h('span', { class: 'grow' }),
      em ? null : h('button', { class: 'primary', onclick: () => openPicker() }, '+ New reflection'),
      h('button', { class: em ? 'primary' : '', 'aria-pressed': String(em), onclick: () => { rv.editMode = !em; rv.sel.clear(); hooks.render(); } }, em ? 'Done' : 'Edit')),
    em ? null : h('div', { class: 'bar', style: 'flex-wrap:wrap;gap:8px;margin-top:8px' },
      h('button', { class: 'small', onclick: () => openView('import') }, 'Upload from Word'),
      h('button', { class: 'small', onclick: () => openView('bin') }, 'Recycle bin')),
    h('p', { class: 'hint' }, `${p.totals.counted} / ${p.totals.min} counted · ${p.totals.done} complete · ${p.totals.drafts} draft${p.totals.drafts === 1 ? '' : 's'}. `,
      'Each reflection is a different patient, under one heading only. Some categories require one case reflection in Junior Residency (JR, R1–R3); when not indicated, at most one case reflection can be done at the JR level per category.'),
    em ? null : h('p', { class: 'hint' }, 'Generative AI use must follow the NUS guidelines on the use of AI tools in academic work.'),
    em ? null : h('div', { class: 'bar' }, renderExportButton(() => (S.reflections || []).filter(r => r.status === 'complete'), displayName,
      async () => ({ cases: S.cases || [], intake: (S.resident && (S.resident.intake || Number(String(S.resident.rid || '').slice(0, 4)))) || null, rYear: rYear(),
        images: await loadImagesFor((S.reflections || []).filter(r => r.status === 'complete')) }))),
    null);

  // edit-mode toolbar: select all / clear / delete selected
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

  const row = r => {
    const cb = em ? h('input', { type: 'checkbox', class: 'refl-cb', 'aria-label': `Select ${r.initials || 'reflection'} ${r.diagnosis || ''}`, onclick: e => e.stopPropagation(),
      onchange: e => { e.target.checked ? rv.sel.add(r.id) : rv.sel.delete(r.id); paintSel(); } }) : null;
    const open = () => { if (em) { if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); } } else openEditor(r); };
    const li = h('li', { tabindex: '0', class: em ? 'refl-row edit' : 'refl-row', onclick: open, onkeydown: e => { if (e.key === 'Enter') open(); } },
      h('span', { class: 'd' }, em ? h('span', { class: 'refl-tools' }, h('span', { class: 'refl-handle', title: 'Drag to another heading', 'aria-label': 'Drag to another heading', onpointerdown: e => startDrag(e, r, li), onclick: e => e.stopPropagation() }, '⠿'), cb) : null,
        (r.jr ? 'JR ' : '') + (r.date ? fmtDate(r.date) : '—')),
      h('span', { class: 't' }, `${r.initials || '??'} ${r.diagnosis || ''}`),
      h('span', { class: 'c' }, r.status === 'complete' ? h('span', { class: 'flag' }, 'complete') : h('span', { class: 'flag err' }, 'draft'), r.source === 'word' ? h('span', { class: 'flag' }, 'from Word') : null, h('span', { class: 'flag' + (wordCount(r) < MIN_WORDS ? ' err' : '') }, `${wordCount(r)} words`)));
    if (cb) checks.push([cb, li, r.id]);
    return li;
  };

  const body = h('section', { class: 'card' });
  let section = '';
  for (const hp of p.headings) {
    if (hp.section !== section) { section = hp.section; add(body, h('h3', { style: 'margin-top:14px' }, section)); }
    const jrTxt = '';
    const subsTxt = '';
    const items = all.filter(r => r.headingId === hp.id);
    add(body, h('div', { class: 'refl-h', 'data-heading': hp.id, style: 'margin:8px 0 4px' },
      h('div', { class: 'refl-hrow' },
        h('div', { class: 'grow' }, h('i', { class: `dot ${hp.met ? 'done' : hp.done ? 'ontrack' : 'due'}` }), ' ', h('b', {}, `${hp.done}/${hp.min}`), ' ', hp.name, h('span', { class: 'muted' }, jrTxt + subsTxt)),
        em ? null : h('button', { class: 'small refl-add', title: 'Add a reflection under ' + hp.name, 'aria-label': 'Add a reflection under ' + hp.name, onclick: () => openPicker(false, { headingId: hp.id, subId: null }) }, '+ Add')),
      HEADING_BY_ID[hp.id].subs ? h('div', { class: 'hint', style: 'margin:2px 0 0' }, 'Include at least one of each: ' + HEADING_BY_ID[hp.id].subs.map(s => s.name).join(' · ')) : null,
      // sub-types are shown in the "needs at least one of each" line above, so don't repeat them here
      hp.issues.filter(x => !x.startsWith('Missing: ')).length ? h('div', { class: 'hint', style: 'color:var(--warn, #b45309)' }, hp.issues.filter(x => !x.startsWith('Missing: ')).join(' · ')) : null,
      items.length ? h('ul', { class: 'cases' }, items.map(row)) : em ? h('div', { class: 'refl-empty hint' }, 'Drop here') : null));
  }
  const orphans = all.filter(r => !HEADING_BY_ID[r.headingId]);
  if (orphans.length) add(body, h('h3', {}, 'No heading yet'), h('ul', { class: 'cases' }, orphans.map(row)));
  if (em) paintSel();
  return h('div', {}, head, toolbar, body);
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
  const name = shortName(HEADING_BY_ID[headingId].name);
  try {
    await cloud.saveReflection(mine(), moved);
    toast(`Moved to ${name}`, { action: 'Undo', ms: 7000, onaction: async () => {
      try { await cloud.saveReflection(mine(), before); toast('Move undone'); } catch (err) { toast('Could not undo: ' + err.message); }
    } });
  } catch (err) { toast('Could not move: ' + err.message); }
  hooks.render();
}

// ---------- images ----------

// Images of the given reflections' figures, for the Word export: { id: { data, mime, w, h } }. Missing ones are skipped.
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

// Phone photo -> JPEG base64 (no data: prefix), longest side ≤ 1400 px, under IMAGE_MAX_B64.
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
  let max = 1400, q = 0.75;
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
  r.points ||= []; r.figures ||= []; r.references ||= [];
  const legacy = isLegacy(r);
  const status = h('span', { class: 'muted', style: 'font-size:13px' }, r.id ? 'Saved' : 'Not saved yet');
  const persist = async () => {
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
      hd && hd.hint ? h('p', { class: 'hint' }, hd.hint) : null,
      hd && hd.subs ? h('p', { class: 'hint' }, 'This heading should include at least one of each: ' + hd.subs.map(s => s.name).join(' · ') + '. Just describe the procedure or diagnosis below.') : null,
    ].filter(Boolean));
  };
  paintSubs();

  let sec = '';
  const headingSelect = h('select', { style: 'font-size:16px;max-width:100%', onchange: e => { r.headingId = e.target.value; r.subId = null; paintSubs(); changed(); } },
    h('option', { value: '' }, 'Choose a heading…'),
    REFLECTION_HEADINGS.map(hd => {
      const g = hd.section !== sec ? (sec = hd.section) : null;
      return [g ? h('option', { disabled: true }, `— ${g} —`) : null, h('option', { value: hd.id, selected: r.headingId === hd.id }, hd.name.length > 70 ? hd.name.slice(0, 68) + '…' : hd.name)];
    }));

  const lc = caseById(r.caseId);
  const linkBox = r.caseId
    ? h('div', { class: 'refl-case', style: 'border:1px solid var(--line, #ddd);border-radius:10px;padding:8px 10px;margin:8px 0' },
      h('div', { class: 'bar', style: 'gap:8px;align-items:center' },
        h('b', { style: 'font-size:13px' }, 'Linked case'), h('span', { class: 'grow' }),
        h('button', { class: 'small', onclick: () => openPicker(true) }, 'Change case'),
        h('button', { class: 'small', onclick: () => { r.caseId = null; restructure(); } }, 'Unlink')),
      lc ? h('div', {}, h('span', { class: 'muted' }, caseDate(lc) + ' · '), lc.details || '(no details)',
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
      h('label', { class: 'field' }, 'Patient initials', input('initials', { maxlength: '20', autocapitalize: 'characters', style: 'font-size:16px;width:7em' })),
      h('label', { class: 'field' }, 'Date', h('input', { type: 'date', style: 'font-size:16px', value: r.date || '', oninput: e => { r.date = e.target.value || null; if (r.source !== 'word') setJr(r); changed(); } }))),
    h('p', { class: 'hint' }, 'Some categories require one case reflection in Junior Residency (JR); when not indicated, at most one case reflection can be done at the JR level per category. A reflection dated in R1–R3 is marked JR in the Word export automatically.'),
    h('label', { class: 'field' }, 'Diagnosis / operation', input('diagnosis', { maxlength: '2000' })),
    h('p', { class: 'hint' }, 'De-identified only: initials, no names or NRIC. Generative AI use must follow the NUS guidelines on the use of AI tools in academic work.'));

  // What APMES wants covered (from the portfolio's reflection elements)
  const guide = h('details', { class: 'card', style: 'padding:12px 16px' },
    h('summary', { style: 'cursor:pointer;font-weight:600' }, 'What APMES wants covered'),
    h('p', { class: 'hint' }, 'Write a case summary, then learning points. Between them, the learning points should cover:'),
    h('ul', { style: 'margin:4px 0 0;padding-left:20px' }, REFLECTION_SECTIONS.filter(s => s.id !== 'description' && (s.id !== 'further' || r.jr))
      .map(s => h('li', { style: 'margin-bottom:4px' }, h('b', {}, s.name), ': ', s.hint))));

  let body;
  if (legacy) {
    body = [h('section', { class: 'card' },
      h('p', { class: 'hint' }, 'This reflection uses the older one-box-per-section layout. It still exports as it is, or convert it to the portfolio layout (case summary + learning points).'),
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
    const summary = boxCard('Case summary', null,
      h('textarea', { rows: '10', maxlength: String(LIMITS.summary), style: TA, value: r.summary || '',
        placeholder: 'Demographics, history, examination, investigations, anaesthetic plan, events, outcome.',
        oninput: e => { r.summary = e.target.value; changed(); } }));

    const n = r.points.length;
    const points = boxCard('Learning points', 'Each point gets a short underlined heading and your discussion: thoughts and feelings, what went well or badly, analysis with evidence, conclusions, action plan.',
      r.points.map((p, i) => h('div', { style: 'border:1px solid var(--line, #ddd);border-radius:10px;padding:10px;margin:0 0 10px' },
        h('div', { class: 'bar', style: 'gap:6px;align-items:center;margin-bottom:6px' },
          h('b', { style: 'font-size:16px' }, `${i + 1}.`),
          h('input', { style: IN + ';flex:1', maxlength: String(LIMITS.pointHeading), value: p.heading || '', placeholder: 'Heading, e.g. Choice of airway management in trismus',
            'aria-label': `Learning point ${i + 1} heading`, oninput: e => { p.heading = e.target.value; changed(); } })),
        h('textarea', { rows: '6', maxlength: String(LIMITS.pointText), style: TA, value: p.text || '', placeholder: 'Discussion',
          'aria-label': `Learning point ${i + 1} text`, oninput: e => { p.text = e.target.value; changed(); } }),
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
        const id = newId();
        await cloud.saveImage(mine(), { id, ...img, createdAt: Date.now() });
        rv.thumbs[id] = 'data:image/jpeg;base64,' + img.data;
        r.figures.push({ id, caption: '', point: r.points.length ? r.points.length - 1 : null });
        autosave.cancel(); await persist(); hooks.render();
      } catch (err) { status.textContent = 'Image not added'; toast('Could not add image: ' + err.message); }
    } });
    const figures = boxCard('Figures (optional)', null,
      h('p', { class: 'hint', style: 'margin:0 0 4px;color:var(--warn, #b45309)' }, 'No faces, names, NRIC, MRN or anything identifying on monitors, labels or screens. Crop before adding.'),
      h('p', { class: 'hint', style: 'margin:0 0 8px;color:var(--warn, #b45309)' }, 'Use your own photos or diagrams. Don’t copy copyrighted figures from papers, books or websites without permission; if you adapt one, cite it under References.'),
      r.figures.map((f, i) => {
        const im = h('img', { alt: f.caption || `Figure ${i + 1}`, style: 'max-width:100%;max-height:220px;display:block;border-radius:6px;background:#eee;min-height:60px' });
        if (rv.thumbs[f.id]) im.src = rv.thumbs[f.id];
        else cloud.loadImage(mine(), f.id).then(d => {
          if (d && d.data) { rv.thumbs[f.id] = `data:${d.mime || 'image/jpeg'};base64,${d.data}`; im.src = rv.thumbs[f.id]; }
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
      r.figures.length < LIMITS.figures ? h('button', { onclick: () => fileIn.click() }, '+ Add image') : h('p', { class: 'hint' }, `At most ${LIMITS.figures} images.`),
      fileIn);

    // references (optional, collapsed unless there are some)
    const refs = h('details', { class: 'card', style: 'padding:12px 16px', open: r.references.length > 0 },
      h('summary', { style: 'cursor:pointer;font-weight:600' }, `References (optional)${r.references.length ? ' · ' + r.references.length : ''}`),
      r.references.map((x, i) => h('div', { class: 'bar', style: 'gap:6px;margin:6px 0;align-items:center' },
        h('span', {}, `${i + 1}.`),
        h('input', { style: IN + ';flex:1', maxlength: String(LIMITS.reference), value: x, placeholder: 'Author. Title. Journal. Year;vol:pages.', oninput: e => { r.references[i] = e.target.value; changed(); } }),
        h('button', { 'aria-label': 'Remove reference', onclick: () => { r.references.splice(i, 1); restructure(); } }, '✕'))),
      r.references.length < LIMITS.references ? h('button', { style: 'margin-top:6px', onclick: () => { r.references.push(''); restructure(); } }, '+ Add reference') : null);

    body = [title, summary, points, figures, refs];
  }

  const actions = h('section', { class: 'card' }, h('p', { style: 'margin:0 0 8px' }, words), h('div', { class: 'bar', style: 'flex-wrap:wrap;gap:8px' },
    r.status === 'complete'
      ? h('button', { onclick: async () => { r.status = 'draft'; await persist(); hooks.render(); } }, 'Back to draft')
      : h('button', { class: 'primary', onclick: async () => {
        const missing = completeProblems(r);
        if (missing.length) return toast('Before marking complete: ' + missing.join(', '));
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
