// Notes (More → Notes, or on the tab bar via Arrange tabs): a resident's own notepad. Private (owner-only
// rules), never in the portfolio. Pure helpers in notepad.js.
//
// Firebase cost: notes are not read at sign-in. The listener starts the first time notes are needed (this page,
// a day's notes in the Logbook, the Markdown export, a backup) and then stays for the visit. Typing saves after
// 3 s of quiet, and at once when the note is left, the field loses focus or the page is hidden; every write goes
// through the durable write queue (writes.js → cloud.commitRecord 'note'), so notes work offline too.
// The note index (which days and cases have notes; its own owner-only doc, meta/noteIndex) lets the Logbook mark
// them without reading any note. It used to live in settings.noteIndex, which the app owner can read; it moves on the
// first sync and the old copy is cleared.

import { S, h, toast, fill, hooks, writes, cloud, transients, settings, patchLogbook, resetters, todayISO, modal, emptyState, download } from './ui-core.js';
import { uid, fmtDate, caseParts } from './engine.js';
import { barTabs, arrangeTabs, display, setTabOnBar } from './ui-settings.js';
import { MAX_NOTES, LIMITS, sortNotes, filterNotes, noteTitle, noteIndex, cleanNoteIndex, sameIndex, parseNote, toggleCheck, plainLines, noteFiles, cleanNote } from './notepad.js';

const SAVE_MS = 3000;
const mine = () => S.user && S.user.email;
// q: search; day / caseId: what the list is narrowed to; editing: the note open in the editor; preview: its view mode
export const nv = { q: '', day: '', caseId: '', editing: null, preview: false, autoNew: false };

// ---------- loading (lazy) ----------

let stop = null, owner = null, raw = [], ready = null, readyResolve = null, synced = false;
function apply() {
  if (!owner || owner !== mine()) return;
  S.notes = sortNotes(writes.overlay('note', owner, raw));
}
// resolves once the first list has arrived (from the offline cache or the server)
export function ensureNotes() {
  const me = mine();
  if (!me) return Promise.resolve([]);
  if (owner === me && ready) return ready.then(() => S.notes || []);   // the current list, not the first one
  stopNotes();
  owner = me; synced = false;
  ready = new Promise(r => { readyResolve = r; });
  stop = cloud.watchNotes(me, (list, meta = {}) => {
    if (owner !== me) return;
    raw = list; apply();
    if (!meta.fromCache) { synced = true; syncIndex(); }
    if (readyResolve) { readyResolve(S.notes); readyResolve = null; }
    if (S.tab === 'notes' && !nv.editing) queueMicrotask(() => { if (S.tab === 'notes' && !nv.editing && !document.activeElement?.closest?.('.notes-page input')) hooks.render(); });
  });
  return ready;
}
function stopNotes() { if (stop) stop(); stop = null; owner = null; raw = []; ready = null; readyResolve = null; S.notes = null; }
resetters.push(() => { stopNotes(); Object.assign(nv, { q: '', day: '', caseId: '', editing: null, preview: false, autoNew: false }); });
writes.onChange(() => { if (owner) { apply(); if (synced) syncIndex(); } });

// the index doc, read the first time the Logbook asks (one small read), then kept live for the visit
let idxStop = null, idxOwner = null;
function watchIndex() {
  const me = mine();
  if (!me || idxOwner === me) return;
  if (idxStop) idxStop();
  idxOwner = me;
  idxStop = cloud.watchNoteIndex(me, data => {
    if (idxOwner !== me) return;
    const next = data ? cleanNoteIndex(data) : null;
    if (JSON.stringify(next) === JSON.stringify(S.noteIndex)) return;
    S.noteIndex = next;
    if (S.tab === 'logbook') queueMicrotask(() => hooks.render());   // only the Logbook shows note marks
  });
}
resetters.push(() => { if (idxStop) idxStop(); idxStop = null; idxOwner = null; S.noteIndex = null; });

// keep the index in step (only from the server's copy of the notes, so a stale offline cache never overwrites it)
function syncIndex() {
  const me = mine();
  if (!Array.isArray(S.notes) || !S.logbook || !me) return;
  watchIndex();
  const next = noteIndex(S.notes);
  if (!sameIndex(next, S.noteIndex)) { S.noteIndex = next; cloud.saveNoteIndex(me, next).catch(e => console.error('Note index not saved', e)); }
  // the old copy in the logbook doc (readable by the app owner) goes
  if (settings().noteIndex != null) patchLogbook({ settings: { noteIndex: null } });
}
// until the index doc has arrived, an older settings.noteIndex still marks the days
export const notesIndex = () => { watchIndex(); return cleanNoteIndex(S.noteIndex || settings().noteIndex); };
export const dayHasNotes = date => !!date && notesIndex().days.includes(date);
export const caseHasNotes = id => !!id && notesIndex().cases.includes(id);

// open Notes on a day's notes, or a case's (from the Logbook); create: start a new note there (linked to the case)
export function openNotes({ day = '', caseId = '', create = false } = {}) {
  leaveNotes();   // a note open in the editor is saved first
  Object.assign(nv, { day, caseId, q: '', editing: null, preview: false, autoNew: create });
  if (S.tab === 'notes') return hooks.render();
  hooks.navigate ? hooks.navigate('notes') : (location.hash = '#notes');
}

// ---------- saving ----------

const sessions = new Map();   // note object → { base, timer, saving, dirty }
const blank = n => !String(n.title || '').trim() && !String(n.body || '').trim();
async function persist(n) {
  const s = sessions.get(n);
  if (!s || !s.dirty) return true;
  clearTimeout(s.timer); s.timer = null;
  const me = mine();
  if (!me || me !== s.owner) return false;
  while (s.saving) await s.saving;
  if (!s.dirty) return true;
  // an empty new note is never written
  if (!s.base && blank(n)) { s.dirty = false; return true; }
  s.dirty = false;
  const payload = JSON.parse(JSON.stringify(n));
  s.status?.('Saving…');
  s.saving = writes.save('note', me, payload, s.base).then(saved => {
    s.base = JSON.parse(JSON.stringify(saved));
    s.status?.(s.dirty ? 'Not saved yet' : 'Saved');
    return true;
  }, err => { s.dirty = true; s.status?.('Not saved: ' + err.message); return false; }).finally(() => { s.saving = null; });
  return s.saving;
}
const flushOpen = () => { if (nv.editing) persist(nv.editing); };
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushOpen);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushOpen(); });
}
// leaving the page (another tab, Back): save what is open
export function leaveNotes() { if (nv.editing) { const n = nv.editing; persist(n); nv.editing = null; editorTransient?.close(); } }

// ---------- the page ----------

const caseOf = id => (S.cases || []).find(c => c.id === id) || null;
// tapping a linked case's pill opens the case (its edit page) over the note
async function openCase(id) {
  const c = caseOf(id);
  if (!c) return toast('That case is not in your logbook any more');
  const { editCaseDialog } = await import('./ui-log.js');
  editCaseDialog(c);
}
const caseLabel = c => { const p = caseParts(c); return [c.date ? fmtDate(c.date) : '', p.initials, p.details].filter(Boolean).join(' · ').slice(0, 90); };

export function renderNotes() {
  if (nv.editing) return editor(nv.editing);
  const el = h('section', { class: 'card notes-page' });
  ensureNotes();
  const loading = !Array.isArray(S.notes);
  const list = loading ? [] : S.notes;
  const full = list.length >= MAX_NOTES;
  if (nv.autoNew && !loading) { nv.autoNew = false; queueMicrotask(() => (full ? toast(`You have ${MAX_NOTES} notes, the most allowed. Delete or export some to make room.`) : newNote())); }
  const search = h('input', { type: 'search', class: 'grow', placeholder: 'Search notes', 'aria-label': 'Search notes', value: nv.q,
    oninput: e => { nv.q = e.target.value; paintList(); } });
  const listEl = h('div', { class: 'notes-list' });
  const paintList = () => {
    const rows = filterNotes(list, nv);
    fill(listEl, loading ? h('p', { class: 'empty' }, 'Loading…')
      : !list.length ? emptyState('notes', 'No notes yet', 'Writing about a case for your portfolio? Use Reflect instead.')
      : !rows.length ? emptyState('search', 'No notes match')
      : h('ul', { class: 'notes-rows' }, rows.map(noteRow)));
  };
  const narrowed = nv.day || nv.caseId;
  // Notes lives in More until it's put on the tab bar: offer it here (a full bar asks which tab it replaces)
  const offBar = !arrangeTabs(barTabs().map(([id]) => id), display()).shown.includes('notes');
  fill(el,
    h('div', { class: 'notes-head' }, h('h2', { style: 'margin:0' }, 'Notes'), h('span', { class: 'muted notes-count' }, loading ? '' : `${list.length} of ${MAX_NOTES}`)),
    h('p', { class: 'hint help' }, 'Your own notes: private, never in your portfolio.'),
    offBar ? h('p', { class: 'notes-onbar' }, h('button', { class: 'small', onclick: () => setTabOnBar('notes', true, () => hooks.render()) }, 'Add Notes to the tab bar')) : null,
    h('details', { class: 'fold help note-format' }, h('summary', {}, 'Formatting'),
      h('ul', { class: 'hint' }, ...[['# Heading', 'a heading'], ['**bold**', 'bold'], ['- item  or  1. item', 'a list'], ['- [ ] to-do', 'a box to tick'], ['https://…', 'a link']]
        .map(([k, v]) => h('li', {}, h('code', {}, k), ' ' + v)))),
    h('div', { class: 'bar' }, search,
      h('button', { class: 'primary', disabled: loading, onclick: () => {
        if (full) return toast(`You have ${MAX_NOTES} notes, the most allowed. Delete or export some to make room.`);
        newNote();
      } }, '+ New note')),
    narrowed ? h('p', { class: 'notes-filter' }, h('span', {}, nv.day ? `Notes on ${fmtDate(nv.day)}` : `Notes on the case ${caseOf(nv.caseId) ? caseLabel(caseOf(nv.caseId)) : ''}`),
      ' ', h('button', { class: 'small', onclick: () => { nv.day = ''; nv.caseId = ''; hooks.render(); } }, 'Show all')) : null,
    full ? h('p', { class: 'tip' }, `You have ${MAX_NOTES} notes, the most allowed. Delete old ones (they stay in the recycle bin for 30 days) or keep them in a Markdown export.`) : null,
    listEl,
    list.length ? h('p', { class: 'notes-download' }, h('button', { class: 'small', onclick: downloadNoteFiles }, 'Download notes as files (zip)')) : null);
  paintList();
  return el;
}

function noteRow(n) {
  const preview = plainLines(n.body).slice((n.title || '').trim() ? 0 : 1, 3).join(' · ');
  const c = n.caseId && caseOf(n.caseId);
  return h('li', { tabindex: '0', onclick: () => openEditor(n), onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) openEditor(n); } },
    h('span', { class: 'd' }, n.date ? fmtDate(n.date) : 'No date'),
    h('span', { class: 'note-main' }, h('b', {}, noteTitle(n)), preview ? h('span', { class: 'muted note-preview' }, preview.slice(0, 160)) : null,
      c ? h('button', { class: 'flag note-case', type: 'button', title: 'Open the linked case', 'aria-label': 'Open the linked case: ' + caseLabel(c),
        onclick: e => { e.stopPropagation(); openCase(n.caseId); } }, '↗ ' + caseLabel(c)) : null));
}

function newNote() {
  const n = { id: uid(), date: nv.day || todayISO(), title: '', body: '', createdAt: Date.now() };
  if (nv.caseId) { n.caseId = nv.caseId; const c = caseOf(nv.caseId); if (c && c.date && !nv.day) n.date = c.date; }
  openEditor(n, true);
}

let editorTransient = null;
function openEditor(n, fresh = false) {
  const copy = JSON.parse(JSON.stringify(n));
  sessions.set(copy, { base: fresh ? null : JSON.parse(JSON.stringify(n)), owner: mine(), dirty: false, timer: null, saving: null });
  nv.editing = copy; nv.preview = !fresh && !!String(copy.body || '').trim();
  if (!editorTransient?.active) editorTransient = transients.open(() => {
    if (nv.editing) { persist(nv.editing); nv.editing = null; }
    hooks.render();
  });
  hooks.render();
  window.scrollTo(0, 0);
}
function closeEditor() {
  const n = nv.editing;
  if (n) persist(n);
  nv.editing = null;
  if (editorTransient?.active) editorTransient.close(); else hooks.render();
}

function editor(n) {
  const s = sessions.get(n) || { base: null, owner: mine(), dirty: false };
  if (!sessions.has(n)) sessions.set(n, s);
  const status = h('span', { class: 'muted notes-status', 'aria-live': 'polite' }, s.base ? 'Saved' : 'Not saved yet');
  s.status = t => { status.textContent = t; };
  const touch = () => { s.dirty = true; status.textContent = 'Not saved yet'; clearTimeout(s.timer); s.timer = setTimeout(() => persist(n), SAVE_MS); };
  const title = h('input', { class: 'note-title', placeholder: 'Title', 'aria-label': 'Note title', maxlength: String(LIMITS.title), value: n.title || '',
    oninput: e => { n.title = e.target.value; touch(); }, onblur: () => persist(n),
    // Enter in the one-line title moves on to the note itself (as in a notes app), never a lost line break
    onkeydown: e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); if (nv.preview) modeBtn.click(); body.focus(); body.setSelectionRange(0, 0); } } });
  const date = h('input', { type: 'date', 'aria-label': 'Note date', value: n.date || '', onchange: e => { n.date = e.target.value || null; touch(); paintMeta(); } });
  const body = h('textarea', { class: 'note-body', rows: '12', placeholder: 'Write your note… (- [ ] for a to-do)', 'aria-label': 'Note text', maxlength: String(LIMITS.body), spellcheck: 'true',
    oninput: e => { n.body = e.target.value; touch(); }, onblur: () => persist(n) });
  body.value = n.body || '';
  // one grey line under the title (like Notes and Bear): the date (tap it to change; the date box sits invisibly over
  // it), No date, and the linked case or a way to link one
  const meta = h('div', { class: 'note-meta' });
  const dateText = h('span', {});
  const paintMeta = () => {
    const c = n.caseId && caseOf(n.caseId);
    dateText.textContent = n.date ? fmtDate(n.date) : 'No date';
    fill(meta,
      h('label', { class: 'note-date', title: 'Change the date' }, dateText, date),
      n.date ? h('button', { class: 'linkish', type: 'button', onclick: () => { n.date = null; date.value = ''; touch(); paintMeta(); } }, 'No date') : null,
      h('span', { class: 'note-dot', 'aria-hidden': 'true' }, '·'),
      n.caseId ? h('span', { class: 'note-link' }, c
        ? h('button', { class: 'linkish note-case', type: 'button', title: 'Open the linked case', 'aria-label': 'Open the linked case: ' + caseLabel(c), onclick: () => openCase(n.caseId) }, '↗ ' + caseLabel(c))
        : h('span', { class: 'note-case' }, '↗ a deleted case'),
        h('button', { class: 'linkish', type: 'button', onclick: () => { delete n.caseId; touch(); paintMeta(); } }, 'Unlink'))
        : h('button', { class: 'linkish', type: 'button', onclick: () => pickCase(n, () => { touch(); paintMeta(); }) }, 'Link to a case…'));
  };
  paintMeta();
  const view = h('div', { class: 'note-view' });
  const paintView = () => fill(view, renderBody(n.body, line => { n.body = toggleCheck(n.body, line); body.value = n.body; touch(); persist(n); paintView(); }));
  const modeBtn = h('button', { type: 'button', 'aria-pressed': String(nv.preview), onclick: () => { closeMenu(); nv.preview = !nv.preview; paint(); if (!nv.preview) body.focus(); } });
  const paint = () => {
    modeBtn.textContent = nv.preview ? 'Edit' : 'Preview';
    modeBtn.setAttribute('aria-pressed', String(nv.preview));
    body.hidden = nv.preview; view.hidden = !nv.preview;
    if (nv.preview) paintView();
  };
  paint();
  const del = h('button', { class: 'danger', type: 'button', onclick: async () => {
    closeMenu();
    const st = sessions.get(n);
    clearTimeout(st?.timer);
    if (!st?.base) { nv.editing = null; editorTransient?.close(); hooks.render(); return; }   // never saved: nothing to bin
    await persist(n);
    try { const { moveToBin } = await import('./bin.js'); await moveToBin('note', { ...n }, { toast: true }); }
    catch (err) { return toast('Could not delete: ' + err.message); }
    nv.editing = null; if (editorTransient?.active) editorTransient.close(); else hooks.render();
  } }, 'Delete');
  setTimeout(() => { if (!s.base && !nv.preview) title.focus(); }, 0);
  // the top bar: ‹ Notes, whether it's saved, a ⋯ menu (Preview or Edit, Delete) and Done; no boxes below it
  const menu = h('div', { class: 'note-menu', role: 'menu', hidden: true }, modeBtn, del);
  [modeBtn, del].forEach(b => b.setAttribute('role', 'menuitem'));
  const closeMenu = () => { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); };
  const more = h('button', { class: 'small icon-btn note-more', type: 'button', 'aria-label': 'More options', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden; more.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) setTimeout(() => document.addEventListener('click', ev => { if (!menu.contains(ev.target)) closeMenu(); }, { once: true }), 0);
  } }, '⋯');
  return h('section', { class: 'card note-editor' },
    h('div', { class: 'note-top' }, h('a', { class: 'back-link note-back', href: '#notes', onclick: e => { e.preventDefault(); closeEditor(); } }, h('span', { class: 'back-chev', 'aria-hidden': 'true' }, '‹'), 'Notes'),
      h('span', { style: 'flex:1' }), status, h('span', { class: 'note-menu-wrap' }, more, menu), h('button', { class: 'small primary', type: 'button', onclick: closeEditor }, 'Done')),
    title, meta, body, view);
}

// the body as elements (never innerHTML): headings, paragraphs, lists and to-dos that tick
export function renderBody(text, onTick) {
  const blocks = parseNote(text);
  if (!blocks.length) return h('p', { class: 'muted' }, 'Nothing written yet.');
  const inl = parts => parts.map(p => p.t === 'b' ? h('strong', {}, p.v) : p.t === 'a' ? h('a', { href: p.href, target: '_blank', rel: 'noopener noreferrer' }, p.v) : p.v)
    .flatMap(x => (typeof x === 'string' ? x.split('\n').flatMap((t, i) => (i ? [h('br'), t] : [t])) : [x]));
  return blocks.map(b => b.t === 'h' ? h('h' + (b.level + 2), {}, inl(b.inl))
    : b.t === 'p' ? h('p', {}, inl(b.inl))
    : h(b.t, { class: b.items.some(i => i.check !== null) ? 'note-todos' : null }, b.items.map(i => h('li', {},
      i.check === null ? inl(i.inl) : h('label', { class: 'check' + (i.check ? ' done' : '') }, h('input', { type: 'checkbox', checked: i.check, onchange: () => onTick && onTick(i.line) }), h('span', {}, inl(i.inl)))))));
}

// link a note to one of your cases: that day's cases first, then the last two weeks, searchable
async function pickCase(n, done) {
  const all = [...(S.cases || [])].filter(c => c.date).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const q = h('input', { type: 'search', placeholder: 'Search your cases', 'aria-label': 'Search your cases' });
  const ul = h('ul', { class: 'cases pick-cases' });
  const paint = () => {
    const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = (words.length ? all.filter(c => words.every(w => caseLabel(c).toLowerCase().includes(w))) : [...all.filter(c => c.date === n.date), ...all.filter(c => c.date !== n.date)]).slice(0, 30);
    fill(ul, rows.length ? rows.map(c => h('li', { tabindex: '0', onclick: () => choose(c), onkeydown: e => { if (e.key === 'Enter') choose(c); } }, caseLabel(c))) : h('li', { class: 'muted' }, 'No cases match.'));
  };
  const choose = c => { n.caseId = c.id; m.close(); done(); };
  q.oninput = paint;
  const m = modal('Link to a case', [q, ul, h('div', { class: 'bar' }, h('span', { class: 'grow' }), h('button', { onclick: () => m.close() }, 'Cancel'))]);
  paint();
  q.focus();
}

// Download every note as its own .md or .txt file in a zip (the files hold only the notes: the linked case isn't named)
export function downloadNoteFiles() {
  const list = Array.isArray(S.notes) ? S.notes : [];
  if (!list.length) return toast('No notes to download yet');
  const o = { fmt: 'md' };
  const radio = (v, label) => h('label', { class: 'check' }, h('input', { type: 'radio', name: 'notes-file-format', value: v, checked: v === o.fmt, onchange: () => { o.fmt = v; } }), label);
  const btn = h('button', { class: 'primary', onclick: async () => {
    btn.disabled = true; btn.textContent = 'Making the zip…';
    try {
      const { needZip } = await import('./portfolio.js');
      const Z = await needZip(), zip = new Z();
      const files = noteFiles(list, o.fmt);
      for (const f of files) zip.file(f.path, f.text);
      download(`apmes-notes-${todayISO()}.zip`, await zip.generateAsync({ type: 'blob' }));
      m.close();
      toast(`${files.length} note${files.length === 1 ? '' : 's'} downloaded`);
    } catch (err) { toast('Could not make the zip: ' + err.message); btn.disabled = false; btn.textContent = 'Download'; }
  } }, 'Download');
  const m = modal('Download notes', [
    h('p', { class: 'hint help', style: 'margin:0 0 8px' }, `${list.length} note${list.length === 1 ? '' : 's'}, one file each, named by day and title, in a zip.`),
    radio('md', 'Markdown (.md)'), radio('txt', 'Plain text (.txt)'),
    h('p', { class: 'tip', style: 'margin:8px 0 0' }, 'The files hold only your notes, not the linked cases. Keep them private.'),
    h('div', { class: 'bar dlg-actions' }, h('span', { class: 'grow' }), h('button', { onclick: () => m.close() }, 'Cancel'), btn)]);
}

// ---------- notes made for a case (the rest of a case over the 2000-character limit) ----------

// Room for n more notes? (loads the notes first: the limit counts them all)
export async function notesRoom() { const list = await ensureNotes(); return MAX_NOTES - (list || []).length; }
// Write new notes linked to their cases: [{ date, caseId, title, body }]. Through the durable write queue, like
// any note; the caller checks the room first (notesRoom).
export async function addNotes(list) {
  const me = mine();
  if (!me) throw new Error('Not signed in');
  await ensureNotes();
  for (const n of list) await writes.save('note', me, cleanNote({ id: uid(), ...n }), null);
}
