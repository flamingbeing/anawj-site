// Notes (More → Notes, or on the tab bar via Arrange tabs): a resident's own notepad. Private (owner-only
// rules), never in the portfolio. Pure helpers in notepad.js.
//
// Firebase cost: notes are not read at sign-in. The listener starts the first time notes are needed (this page,
// a day's notes in the Logbook, the Markdown export, a backup) and then stays for the visit. It runs on the sync
// engine (sync.js): this device's copy at once, then only the notes changed since the last visit. Typing saves after
// 3 s of quiet, and at once when the note is left, the field loses focus or the page is hidden; every write goes
// through the durable write queue (writes.js → cloud.commitRecord 'note'), so notes work offline too.
// The note index (which days and cases have notes; its own owner-only doc, meta/noteIndex) lets the Logbook mark
// them without reading any note. It used to live in settings.noteIndex, which the app owner can read; it moves on the
// first sync and the old copy is cleared.
// Daily notes: one note a day ("day-YYYY-MM-DD", notepad.js), opened from the Logbook's day, "Today's note" here, the
// app's "Today's note" shortcut (#today), and (Settings → Notes, off by default) a small box on the Add tab. They
// don't count towards the 100 notes.

import { S, h, toast, fill, hooks, writes, cloud, transients, settings, patchLogbook, resetters, todayISO, modal, emptyState, download, ic } from './ui-core.js';
import { uid, fmtDate, caseParts } from './engine.js';
import { barTabs, arrangeTabs, display, setDisplay, setTabOnBar } from './display.js';
import { toggle, help, resetLink } from './settings-rows.js';
import { MAX_NOTES, INDEX_CAP, LIMITS, indexCapped, sortNotes, filterNotes, noteTitle, noteIndex, cleanNoteIndex, sameIndex, parseNote, toggleCheck, plainLines, noteFiles, dayNoteId, dayNoteOf, isDayNote, cappedNotes, mergeDayNote, cleanNote } from './notepad.js';
import { recordSignature } from './recovery-store.js';
import { popShared, keepShared, sharedFiles } from './share-in.js';
import { fmtBar, replaceRange } from './fmt-bar.js';
import { htmlToMarkdown, tidyMarkdown } from './paste-clean.js';

const SAVE_MS = 3000;
const PAGE = 100;   // notes listed before "Show more"
const mine = () => S.user && S.user.email;
// q: search; day / caseId / kind ('day': daily notes only): what the list is narrowed to; editing: the note open in the
// editor; preview: its view mode; back: the tab the editor goes back to (a daily note opened from the Logbook);
// initBody: text a new note starts with (shared to the app)
// fromShare: initBody came from the share chooser (taken from the inbox only once the note has it)
const NV0 = () => ({ q: '', day: '', caseId: '', kind: '', editing: null, preview: false, autoNew: false, back: '', initBody: '', fromShare: false });
export const nv = NV0();

// ---------- loading (lazy) ----------

let stop = null, owner = null, raw = [], ready = null, readyResolve = null, synced = false, serverIn = null, serverResolve = null;
function apply() {
  if (!owner || owner !== mine()) return;
  const was = S.notes;
  S.notes = sortNotes(writes.overlay('note', owner, raw));
  // the Logbook's day shows its daily note: draw it again when the notes change (a save no longer repaints it
  // through the cases, which only repaint when the case list itself changes)
  if (S.tab === 'logbook' && !(was && was.length === S.notes.length && S.notes.every((n, i) => n === was[i]))) hooks.casesChanged?.();
}
// resolves once the first list has arrived (from the offline cache or the server)
export function ensureNotes() {
  const me = mine();
  if (!me) return Promise.resolve([]);
  if (owner === me && ready) return ready.then(() => S.notes || []);   // the current list, not the first one
  stopNotes();
  owner = me; synced = false;
  ready = new Promise(r => { readyResolve = r; });
  serverIn = new Promise(r => { serverResolve = r; });
  stop = cloud.watchNotes(me, (list, meta = {}) => {
    if (owner !== me) return;
    raw = list; apply();
    if (!meta.fromCache) { synced = true; syncIndex(); if (serverResolve) { serverResolve(); serverResolve = null; } }
    if (readyResolve) { readyResolve(S.notes); readyResolve = null; }
    takeServerDayNote();
    if (S.tab === 'notes' && !nv.editing) queueMicrotask(refreshList);
  });
  return ready;
}
// the server's list (not the offline cache's), or after ms, whichever comes first
const serverNotes = ms => Promise.race([serverIn || Promise.resolve(), new Promise(r => setTimeout(r, ms))]);
function stopNotes() { if (stop) stop(); stop = null; owner = null; raw = []; ready = null; readyResolve = null; serverIn = null; serverResolve = null; S.notes = null; }
resetters.push(() => { stopNotes(); Object.assign(nv, NV0()); inline = null; nsel.on = false; nsel.ids.clear(); });
// Select (as on the Logbook): press and hold a note, or Select; the bar's Bulk edit… opens ui-bulk-notes.js
const nsel = { on: false, ids: new Set() };
writes.onChange(() => { if (owner) { apply(); if (synced) syncIndex(); } healDayNotes(); });
// a conflict found after the save had already been accepted (a slow connection): merge it the same way, also when
// the note is no longer open (typed, Done, then the answer came): otherwise the other copy shows, the lines typed
// here are only in Recent changes, and every later save of that note waits behind the conflict
const healing = new Set();
function healDayNotes() {
  const me = mine();
  const open = new Set();
  for (const n of [nv.editing, inline && inline.note]) {
    const s = n && isDayNote(n) && sessions.get(n);
    if (!s || s.owner !== me) continue;
    open.add(n.id);
    if (s.saving || s.merging || !dayConflict(n)) continue;
    s.saving = mergeDaySave(n, s, me).then(ok => { if (ok) s.status?.(s.dirty ? 'Not saved yet' : 'Saved'); return !!ok; },
      err => { s.dirty = true; s.status?.('Not saved: ' + err.message); return false; }).finally(() => { s.saving = null; });
  }
  // (every save of anything comes through here: entries() copies them all, so only when a note's save needs attention)
  if (!me || !writes.attention('note')) return;
  for (const job of writes.entries()) {
    const id = job.record && job.record.id;
    if (job.kind !== 'note' || job.state !== 'conflict' || job.owner !== me || !isDayNote(job.record) || open.has(id) || healing.has(id)) continue;
    healing.add(id);
    healClosed(job, me).catch(e => console.error('Daily note not merged', e)).finally(() => healing.delete(id));
  }
}
async function healClosed(job, me) {
  // this device's newest copy (saves made after the conflict wait behind it), merged against the base its first
  // unsynced save started from
  const group = writes.entries().filter(x => x.kind === 'note' && x.record.id === job.record.id && (x.state === 'pending' || x.state === 'conflict'));
  const local = group[0] ? group[0].record : job.record, first = group.at(-1) || job;
  const base = 'base' in first ? first.base : null;
  await writes.archive((group[0] || job).key);   // (the newest: archive sets aside that one and older)
  await writes.save('note', me, mergeDayNote(local, base, job.remote), job.remote || null);
}
// the notes as the server has them (not a possibly stale offline copy), for anything that must not miss one (Sync,
// the backups and a restore); again: the button the error tells to tap
export async function notesFromServer(ms = 30e3, again = 'Sync') {
  const me = mine();
  if (!me) return [];
  const t0 = Date.now(), fail = () => new Error(`your notes didn’t finish loading (no signal?). Tap ${again} again.`);
  // the first answer counts in the time too (a new device with a stalled connection can wait long for it)
  let timer;
  try { await Promise.race([ensureNotes(), new Promise((_, no) => { timer = setTimeout(() => no(fail()), ms); })]); }
  finally { clearTimeout(timer); }
  for (; !(synced && owner === me); await new Promise(r => setTimeout(r, 250)))
    if (Date.now() - t0 > ms || mine() !== me) throw fail();
  return S.notes || [];
}

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
  // the doc holds the latest INDEX_CAP days and cases (the rules' cap); the marks use all notes once they're loaded
  const next = noteIndex(S.notes, INDEX_CAP);
  if (!sameIndex(next, S.noteIndex)) { S.noteIndex = next; cloud.saveNoteIndex(me, next).catch(e => console.error('Note index not saved', e)); }
  // the old copy in the logbook doc (readable by the app owner) goes
  if (settings().noteIndex != null) patchLogbook({ settings: { noteIndex: null } });
}
// { days, cases } (plus Sets for the per-day lookups): from the notes themselves once loaded (every day and case, past
// the index doc's cap); before that the index doc, and until it has arrived, an older settings.noteIndex.
const withSets = i => ({ ...i, daySet: new Set(i.days), caseSet: new Set(i.cases) });
let fromNotes = { list: null, index: null };
// A full index doc (the cap) can't say about older days and cases: the notes load then (this device's copy, so it is
// cheap), and the Logbook repaints with the marks from them.
let capLoad = null;
export function notesIndex() {
  if (Array.isArray(S.notes)) {
    if (fromNotes.list !== S.notes) fromNotes = { list: S.notes, index: withSets(noteIndex(S.notes)) };
    return fromNotes.index;
  }
  watchIndex();
  const idx = cleanNoteIndex(S.noteIndex || settings().noteIndex);
  if (indexCapped(idx) && capLoad !== mine()) {
    capLoad = mine();
    ensureNotes().then(() => { if (S.tab === 'logbook') hooks.render(); }, () => {});
  }
  return withSets(idx);
}
resetters.push(() => { capLoad = null; });
export const dayHasNotes = date => !!date && notesIndex().daySet.has(date);
export const caseHasNotes = id => !!id && notesIndex().caseSet.has(id);
// true when the day may have notes the index can't show (load them to be sure)
export const dayMayHaveNotes = date => !!date && (dayHasNotes(date) || (!Array.isArray(S.notes) && indexCapped(cleanNoteIndex(S.noteIndex || settings().noteIndex))));

// open Notes on a day's notes, or a case's (from the Logbook); create: start a new note there (linked to the case),
// with body as its text
export function openNotes({ day = '', caseId = '', create = false, body = '', fromShare = false } = {}) {
  leaveNotes();   // a note open in the editor is saved first
  Object.assign(nv, { day, caseId, kind: '', q: '', editing: null, preview: false, autoNew: create, back: '', initBody: create ? body : '', fromShare: create && fromShare });
  if (S.tab === 'notes') return hooks.render();
  hooks.navigate ? hooks.navigate('notes') : (location.hash = '#notes');
}

// open one note in the editor from elsewhere (Search): Done goes back to the page it came from
// (to Notes first: a step to another page closes an editor already open, as Back would)
export async function openNote(n, back = S.tab) {
  leaveNotes();
  Object.assign(nv, { day: '', caseId: '', kind: '', q: '' });
  if (S.tab !== 'notes') await (hooks.navigate ? hooks.navigate('notes') : (location.hash = '#notes'));
  openEditor(n, false, { back: back === 'notes' ? '' : back });
}

// ---------- saving ----------

const sessions = new Map();   // note object → { base, timer, saving, dirty, status?, onMerge? }
const blank = n => !String(n.title || '').trim() && !String(n.body || '').trim();
const clone = v => JSON.parse(JSON.stringify(v));
// A daily note has a fixed id, so two devices (or a stale offline copy opened as a new note) can each write it. When a
// save meets a newer copy, the two are merged (notepad.js mergeDayNote) and saved over it, instead of a conflict that
// stops the note saving until it's sorted out in Recent changes. Ordinary notes keep the conflict, as before.
const dayConflict = n => writes.entries().find(x => x.kind === 'note' && x.record.id === n.id && x.state === 'conflict');
async function mergeDaySave(n, s, me) {
  const job = dayConflict(n);
  if (!job || s.merging) return null;
  s.merging = true;
  try { return await mergeOver(n, s, me, job); } finally { s.merging = false; }
}
async function mergeOver(n, s, me, job) {
  // merged against the base the first unsynced save was written from (all of them are set aside together): s.base has
  // moved on to the saved copy once a save was accepted (before the server answered), and against that the text typed
  // since would look like nothing new
  const group = writes.entries().filter(x => x.kind === 'note' && x.record.id === n.id && (x.state === 'pending' || x.state === 'conflict'));
  const first = group.at(-1) || job;
  const base = 'base' in first ? first.base : s.base;
  await writes.archive((group[0] || job).key);
  const merged = mergeDayNote(n, base, job.remote);
  for (const k of Object.keys(n)) if (!(k in merged)) delete n[k];
  Object.assign(n, merged);
  s.base = job.remote ? clone(job.remote) : null;
  s.onMerge?.();
  const saved = await writes.save('note', me, clone(n), s.base);
  s.base = clone(saved);
  return true;
}
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
  s.saving = writes.save('note', me, payload, s.base).then(saved => { s.base = clone(saved); return true; })
    .catch(async err => { if (isDayNote(n) && await mergeDaySave(n, s, me)) return true; throw err; })
    .then(() => { s.status?.(s.dirty || dayConflict(n) ? 'Not saved yet' : 'Saved'); return true; },
      err => { s.dirty = true; s.status?.('Not saved: ' + err.message); return false; }).finally(() => { s.saving = null; });
  return s.saving;
}
const flushOpen = () => { if (nv.editing) persist(nv.editing); if (inline) persist(inline.note); };
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushOpen);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushOpen(); });
}
// leaving the page (another tab, Back): save what is open
export function leaveNotes() { if (nv.editing) { const n = nv.editing; persist(n); nv.editing = null; dropEditorEntry(); } }

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

// The list on screen (renderNotes), so a live update repaints its rows and count in place instead of drawing the
// whole page again: a page drawn again under a tap loses the tap (Firefox: the list sometimes came back empty after
// Done, while the saves that Done set off were arriving). The whole page is drawn again only when its shape changes.
let page = null;   // { el, shape, repaint(list) }
const listShape = (list, loading) => JSON.stringify([loading, cappedNotes(list).length >= MAX_NOTES, list.some(isDayNote), !!list.length]);
export const notesChanged = () => refreshList();
function refreshList() {
  if (S.tab !== 'notes' || nv.editing) return;
  const list = Array.isArray(S.notes) ? S.notes : [];
  if (page && page.el.isConnected && page.shape === listShape(list, !Array.isArray(S.notes))) return page.repaint(list);
  if (document.activeElement?.closest?.('.notes-page input')) return;   // never under someone typing a search
  hooks.render();
}

export function renderNotes() {
  if (nv.editing) { page = null; return editor(nv.editing); }
  const el = h('section', { class: 'card notes-page' });
  ensureNotes();
  const loading = !Array.isArray(S.notes);
  const counted = cappedNotes(loading ? [] : S.notes).length, full = counted >= MAX_NOTES;   // daily notes don't count
  if (nv.autoNew && !loading) {
    nv.autoNew = false;
    queueMicrotask(() => {
      if (!full) return newNote();
      toast(`You have ${MAX_NOTES} notes, the most allowed. Delete or export some to make room.`);
      // shared text that has nowhere to go goes back to the chooser (never lost)
      if (nv.fromShare) { nv.fromShare = false; nv.initBody = ''; hooks.navigate && hooks.navigate('share'); }
    });
  }
  const search = h('input', { type: 'search', class: 'grow', placeholder: 'Search notes', 'aria-label': 'Search notes', value: nv.q,
    oninput: e => { nv.q = e.target.value; shown = PAGE; paintList(); } });
  const listEl = h('div', { class: 'notes-list' });
  const selBar = h('div', { class: 'sel-bar', role: 'region', 'aria-label': 'Selected notes', hidden: true });
  const startSel = (ids = []) => { nsel.on = true; for (const id of ids) nsel.ids.add(id); paintList(); };
  const endSel = () => { nsel.on = false; nsel.ids.clear(); paintList(); };
  const selectBtn = h('button', { class: 'small notes-selbtn', title: 'Select notes to edit, merge, export or move to the bin together', onclick: () => (nsel.on ? endSel() : startSel()) }, 'Select');
  const paintSel = rows => {
    const have = new Set(list.map(n => n.id));
    for (const id of nsel.ids) if (!have.has(id)) nsel.ids.delete(id);
    el.classList.toggle('selecting', nsel.on);
    selectBtn.hidden = !list.length;
    selBar.hidden = !nsel.on;
    if (!nsel.on) return fill(selBar);
    const n = nsel.ids.size;
    fill(selBar,
      h('span', { class: 'sel-n', 'aria-live': 'polite' }, `${n} selected`),
      h('button', { class: 'small', disabled: rows.length && rows.every(x => nsel.ids.has(x.id)), onclick: () => { for (const x of rows) nsel.ids.add(x.id); paintList(); } }, rows.length === list.length ? `Select all ${rows.length}` : `Select all ${rows.length} found`),
      h('button', { class: 'small', disabled: !n, onclick: () => { nsel.ids.clear(); paintList(); } }, 'Select none'),
      h('span', { class: 'grow' }),
      h('button', { class: 'small primary', disabled: !n, onclick: async () => {
        const { notesBulkDialog } = await import('./ui-bulk-notes.js');
        notesBulkDialog(list.filter(x => nsel.ids.has(x.id)), { onDone: endSel });
      } }, 'Bulk edit…'),
      h('button', { class: 'small', onclick: endSel }, 'Done'));
  };
  nsel.start = n => startSel([n.id]);
  nsel.paint = () => paintSel(filterNotes(list, nv));
  // a page of rows at a time (up to 2,000 notes), more on request
  let shown = PAGE;
  let list = loading ? [] : S.notes;   // (a live update swaps in the newer list: page.repaint)
  const paintList = () => {
    const rows = filterNotes(list, nv);
    paintSel(rows);
    const more = rows.length - shown;
    fill(listEl, loading ? h('p', { class: 'empty' }, 'Loading…')
      : !list.length ? emptyState('notes', 'No notes yet', 'Writing about a case for your portfolio? Use Reflect instead.')
      : !rows.length ? emptyState('search', 'No notes match')
      : [h('ul', { class: 'notes-rows' }, rows.slice(0, shown).map(noteRow)),
        more > 0 ? h('p', { class: 'notes-more' }, h('button', { class: 'small', onclick: () => {
          // focus moves to the first row just shown (the button is replaced, which would drop focus to the page)
          const from = shown; shown += PAGE; paintList();
          listEl.querySelectorAll('.notes-rows > li')[from]?.focus();
        } }, `Show ${Math.min(more, PAGE)} more (${more} not shown)`)) : null]);
  };
  const narrowed = nv.day || nv.caseId || nv.kind;
  const hasDaily = list.some(isDayNote);
  // Notes lives in More until it's put on the tab bar: offer it here (a full bar asks which tab it replaces)
  const offBar = !arrangeTabs(barTabs().map(([id]) => id), display()).shown.includes('notes');
  fill(el,
    h('div', { class: 'notes-head' }, h('h2', { style: 'margin:0' }, 'Notes'), h('span', { class: 'muted notes-count', title: 'Daily notes don’t count' }, loading ? '' : `${counted} of ${MAX_NOTES}`)),
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
    // one note a day: today's (made the first time it's opened), and a chip for only the daily notes once there are some
    h('div', { class: 'bar notes-daily' },
      h('button', { class: 'small', disabled: loading, onclick: () => openDayNote(todayISO()) }, 'Today’s note'),
      hasDaily || nv.kind ? h('button', { class: 'small chip-toggle', 'aria-pressed': String(nv.kind === 'day'), onclick: () => { nv.kind = nv.kind === 'day' ? '' : 'day'; hooks.render(); } }, 'Daily notes') : null,
      h('span', { class: 'grow' }), selectBtn),
    narrowed ? h('p', { class: 'notes-filter' }, h('span', {}, nv.day ? `Notes on ${fmtDate(nv.day)}` : nv.caseId ? `Notes on the case ${caseOf(nv.caseId) ? caseLabel(caseOf(nv.caseId)) : ''}` : 'Daily notes'),
      ' ', h('button', { class: 'small', onclick: () => { nv.day = ''; nv.caseId = ''; nv.kind = ''; hooks.render(); } }, 'Show all')) : null,
    full ? h('p', { class: 'tip' }, `You have ${MAX_NOTES} notes, the most allowed. Delete old ones (they stay in the recycle bin for 30 days) or keep them in a Markdown export.`) : null,
    listEl, selBar,
    list.length ? h('p', { class: 'notes-download' }, h('button', { class: 'small', onclick: () => downloadNoteFiles() }, 'Download notes as files (zip)')) : null);
  paintList();
  page = { el, shape: listShape(list, loading), repaint: next => {
    list = next;
    const count = el.querySelector('.notes-count');
    if (count) count.textContent = `${cappedNotes(list).length} of ${MAX_NOTES}`;
    paintList();
  } };
  return el;
}

function noteRow(n) {
  const preview = plainLines(n.body).slice((n.title || '').trim() ? 0 : 1, 3).join(' · ');
  const c = n.caseId && caseOf(n.caseId);
  const picking = nsel.on, picked = picking && nsel.ids.has(n.id);
  const toggle = (setBox = true) => {
    const on = !nsel.ids.has(n.id);
    if (on) nsel.ids.add(n.id); else nsel.ids.delete(n.id);
    li.classList.toggle('sel', on);
    const box = li.querySelector('.sel-box'); if (box && setBox) box.checked = on;
    nsel.paint?.();
  };
  const open = () => (picking ? toggle() : openEditor(n));
  // while selecting, the checkbox takes the keyboard (one stop a row) and names the note
  const li = h('li', { class: picked ? 'sel' : null, tabindex: picking ? '-1' : '0', onclick: open, onkeydown: e => { if ((e.key === 'Enter' || (picking && e.key === ' ')) && e.target === e.currentTarget) { e.preventDefault(); open(); } } },
    picking ? h('input', { type: 'checkbox', class: 'sel-box', checked: picked, 'aria-label': `Select ${noteTitle(n)}${n.date ? ', ' + fmtDate(n.date) : ''}`, onclick: e => { e.stopPropagation(); toggle(false); } }) : null,
    h('span', { class: 'd' }, n.date ? fmtDate(n.date) : 'No date'),
    h('span', { class: 'note-main' }, h('b', {}, noteTitle(n)), preview ? h('span', { class: 'muted note-preview' }, preview.slice(0, 160)) : null,
      c ? h('button', { class: 'flag note-case', type: 'button', title: 'Open the linked case', 'aria-label': 'Open the linked case: ' + caseLabel(c),
        onclick: e => { e.stopPropagation(); openCase(n.caseId); } }, '↗ ' + caseLabel(c)) : null),
    // while selecting (a press and hold starts it), each note has its own bin: one tap, Undo in the message (owner, 16 Oct 2026)
    picking ? h('button', { type: 'button', class: 'small icon-btn note-del', title: 'Move to the recycle bin', 'aria-label': `Delete ${noteTitle(n)}`,
      onclick: async e => {
        e.stopPropagation();
        try { const { moveToBin } = await import('./bin.js'); await moveToBin('note', { ...n }, { toast: true }); nsel.ids.delete(n.id); nsel.paint?.(); }
        catch (err) { toast('Could not delete: ' + err.message); }
      } }, ic('trash')) : null);
  holdToSelect(li, () => !nsel.on && nsel.start?.(n));
  return li;
}
// half a second's hold without moving starts selecting (the click that follows is swallowed); Android's long press
// (contextmenu) may come a moment sooner and starts it then
function holdToSelect(li, start) {
  let t = 0, x = 0, y = 0, held = 0;
  const stop = () => { clearTimeout(t); t = 0; };
  const go = () => {
    t = 0; held = Date.now();
    const eat = e => { e.stopPropagation(); e.preventDefault(); window.removeEventListener('click', eat, true); };
    window.addEventListener('click', eat, true); setTimeout(() => window.removeEventListener('click', eat, true), 700);
    try { navigator.vibrate?.(10); } catch { /* not allowed */ }
    start();
  };
  li.addEventListener('pointerdown', e => { if (e.button !== 0 || e.target.closest('button, a, input') || nsel.on) return; x = e.clientX; y = e.clientY; stop(); t = setTimeout(go, 500); });
  li.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - x, e.clientY - y) > 10) stop(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) li.addEventListener(ev, stop);
  li.addEventListener('contextmenu', e => { if (t) { e.preventDefault(); stop(); go(); } else if (Date.now() - held < 1000) e.preventDefault(); });
}

function newNote() {
  let body = nv.initBody || '', rest = '';
  // more than a note holds (a shared file can be 100k): the note takes what fits, up to a line end, and the rest stays
  // in the inbox for another note (counted as a file, so the chooser asks again instead of the Add tab taking it)
  if (body.length > LIMITS.body) {
    const cut = body.lastIndexOf('\n', LIMITS.body);
    const at = cut > LIMITS.body / 2 ? cut : LIMITS.body;
    rest = body.slice(at).trim(); body = body.slice(0, at);
  }
  const n = { id: uid(), date: nv.day || todayISO(), title: '', body, createdAt: Date.now() };
  if (nv.fromShare) {
    const files = sharedFiles();
    popShared();   // the note has the shared text now
    if (rest) { keepShared(rest, files || 1); toast('The note is full: the rest of the shared text is kept for another note'); }
  }
  nv.initBody = ''; nv.fromShare = false;
  if (nv.caseId) { n.caseId = nv.caseId; const c = caseOf(nv.caseId); if (c && c.date && !nv.day) n.date = c.date; }
  openEditor(n, true);
  // text shared to the app is saved at once (a new note is otherwise saved only once something is typed)
  if (n.body) touchOpen();
}

let editorTransient = null, editorClosing = null;
function guardEditor() {
  editorTransient = transients.open(() => {
    // a step back that Done, Delete or leaving asked for: they saved and drew already, and a note opened since (a tap
    // on the list before the browser took the step) stays open
    const mid = !!editorClosing, open = !!nv.editing && !mid;
    if (open) { persist(nv.editing); nv.editing = null; }
    if (!nv.editing) nv.back = '';
    if (open || (!nv.editing && !(page && page.el.isConnected))) hooks.render();
  });
}
// take the editor's history entry away (Back's job done by the app); resolves once the browser has taken the step
function dropEditorEntry() {
  if (!editorTransient?.active) return Promise.resolve();
  if (!editorClosing) editorClosing = editorTransient.close().finally(() => { editorClosing = null; });
  return editorClosing;
}
// edit: open straight in Edit (a daily note), not Preview; back: the tab Done goes back to
// own: n is already a live copy with its session (the Add tab's daily note box), edited as it is, so there's only ever
// one copy of it open
function openEditor(n, fresh = false, { edit = false, back = '', own = false } = {}) {
  const copy = own && sessions.has(n) ? n : JSON.parse(JSON.stringify(n));
  if (copy !== n || !sessions.has(copy)) sessions.set(copy, { base: fresh ? null : JSON.parse(JSON.stringify(n)), owner: mine(), dirty: false, timer: null, saving: null });
  nv.editing = copy; nv.preview = !edit && !fresh && !!String(copy.body || '').trim(); nv.back = back;
  // Back (the phone's, the browser's) closes the editor; when Done already closed it and drew the list, nothing is
  // drawn again here (a second drawing a moment later could swallow the next tap)
  // A note opened while Done's step back is still on its way gets its own entry once that step has landed
  if (editorClosing) editorClosing.then(() => { if (nv.editing === copy && !editorTransient?.active) guardEditor(); });
  else if (!editorTransient?.active) guardEditor();
  hooks.render();
  window.scrollTo(0, 0);
}
const touchOpen = () => { const s = nv.editing && sessions.get(nv.editing); if (s) { s.dirty = true; persist(nv.editing); } };
async function closeEditor() {
  const n = nv.editing, back = nv.back;
  if (n) persist(n);
  nv.editing = null; nv.back = '';
  // the list is drawn now, not when the browser gets round to the history step (Firefox's came late, and a live
  // update in between could leave the page half drawn); going back to the Logbook draws that instead
  const drawn = !back && S.tab === 'notes';
  if (drawn) hooks.render();
  if (editorTransient?.active) await dropEditorEntry(); else if (!drawn) hooks.render();
  // a daily note opened from the Logbook goes back there (the Notes page was only passed through)
  if (back && S.tab === 'notes') history.back();
}

// ---------- daily notes ----------

const BACK_LABEL = { logbook: 'Logbook', log: 'Add' };
const joinText = (body, add) => (String(body || '').trim() ? String(body).trimEnd() + '\n\n' : '') + String(add || '').trim();
// open a day's note in the editor (today's by default), made the first time; append: text to add at its end (shared to
// the app). It waits for the notes, so an existing daily note is always opened (never a second copy with the same id):
// when the offline cache doesn't have it, it waits a moment for the server's list too. The Add tab box's copy, when
// it's the same day, is the one opened. Resolves to whether the editor opened (false: gone elsewhere meanwhile).
export async function openDayNote(iso = todayISO(), { append = '' } = {}) {
  const me = mine();
  if (!me) return false;
  leaveNotes();
  const from = S.tab !== 'notes' && BACK_LABEL[S.tab] ? S.tab : '';
  Object.assign(nv, { day: '', caseId: '', kind: '', q: '', editing: null, preview: false, autoNew: false, initBody: '', fromShare: false });
  if (S.tab !== 'notes') { if (hooks.navigate) await hooks.navigate('notes'); else location.hash = '#notes'; } else hooks.render();
  const list = await ensureNotes();
  const away = () => S.tab !== 'notes' || nv.editing || mine() !== me;
  if (away()) return false;
  const live = inline && inline.owner === me && inline.iso === iso && sessions.has(inline.note) ? inline.note : null;
  let have = dayNoteOf(list, iso);
  if (!have && !live && !synced && !(typeof navigator !== 'undefined' && navigator.onLine === false)) {
    await serverNotes(3000);
    if (away()) return false;
    have = dayNoteOf(S.notes, iso);
  }
  if (live) openEditor(live, false, { edit: true, back: from, own: true });
  else openEditor(have || { id: dayNoteId(iso), date: iso, title: '', body: '', createdAt: Date.now() }, !have, { edit: true, back: from });
  if (append && nv.editing) {
    const n = nv.editing, add = String(append).trim();
    n.body = joinText(n.body, add).slice(0, LIMITS.body);
    if (n.body.length < joinText('', add).length) toast('The note is full: some of the text didn’t fit');
    touchOpen(); hooks.render();
  }
  return !!nv.editing;
}
// A daily note opened as new (none in the offline cache) that the server's list turns out to have, with nothing
// typed in it yet: the server's copy takes its place in the editor
function takeServerDayNote() {
  const e = nv.editing, s = e && isDayNote(e) && sessions.get(e);
  if (!s || s.base || s.dirty || s.saving || s.owner !== mine()) return;
  const have = dayNoteOf(S.notes, e.date);
  if (!have || have.id !== e.id) return;
  sessions.delete(e);
  if (inline && inline.note === e) inline = null;
  openEditor(have, false, { edit: true, back: nv.back });
}

// The Logbook's day: its daily note as a preview (tap it or Edit to open the editor), or "+ Daily note". Notes are only
// read when the index says the day has some, as before; until they arrive the button shows (it opens the right note).
export function dayNoteCard(iso) {
  const n = Array.isArray(S.notes) ? dayNoteOf(S.notes, iso) : null;
  const open = () => openDayNote(iso);
  if (!n || !String(n.body || '').trim()) return h('p', { class: 'lb-daynote-add' }, h('button', { class: 'small linkish', type: 'button', onclick: open }, n ? 'Daily note (empty) ›' : '+ Daily note'));
  const view = h('div', { class: 'note-view lb-daynote-view', title: 'Open the daily note', onclick: e => { if (!e.target.closest('a')) open(); } }, renderBody(n.body));
  return h('div', { class: 'lb-daynote' },
    h('div', { class: 'lb-daynote-head' }, h('h4', {}, 'Daily note'), h('button', { class: 'small', type: 'button', 'aria-label': 'Edit the daily note', onclick: open }, 'Edit')),
    view);
}

// The Add tab's daily note box (Settings → Notes → Show the daily note on the Add tab; off by default): today's note
// in a small box that folds away, saving as you type like the editor. Its own copy of the note lives here between
// renders, so a re-render of the Add tab never loses what's being typed.
let inline = null, inlineOpen = false;   // { owner, iso, note }
export function dayNoteBox() {
  const me = mine(), iso = todayISO();
  if (!me) return null;
  const status = h('span', { class: 'muted notes-status', 'aria-live': 'polite' });
  const ta = h('textarea', { class: 'day-note-text', rows: '4', placeholder: 'Loading…', disabled: true, 'aria-label': 'Today’s note', maxlength: String(LIMITS.body), spellcheck: 'true' });
  const box = h('details', { class: 'fold day-note-box', open: inlineOpen },
    h('summary', {}, 'Today’s note'),
    ta,
    h('div', { class: 'bar day-note-bar' }, status, h('span', { class: 'grow' }),
      // the editor opens this box's own copy (openDayNote), so nothing typed here waits on a save first
      h('button', { class: 'small linkish', type: 'button', onclick: () => openDayNote(iso) }, 'Open in Notes')));
  box.addEventListener('toggle', () => { inlineOpen = box.open; });
  const ready = () => {
    const have = dayNoteOf(S.notes, iso);
    const fresh = () => {
      if (inline) persist(inline.note);   // yesterday's box (open past midnight) is saved first
      const note = JSON.parse(JSON.stringify(have || { id: dayNoteId(iso), date: iso, title: '', body: '', createdAt: Date.now() }));
      inline = { owner: me, iso, note };
      sessions.set(note, { base: have ? JSON.parse(JSON.stringify(have)) : null, owner: me, dirty: false, timer: null, saving: null });
    };
    if (!inline || inline.owner !== me || inline.iso !== iso) fresh();
    else {
      // saved elsewhere since (the editor, another device: any field, not only the text) and nothing typed here: take
      // the newer copy
      const s = sessions.get(inline.note);
      if (!s || (have && !s.dirty && !s.saving && !s.merging && recordSignature(have) !== recordSignature(s.base))) fresh();
    }
    const n = inline.note, s = sessions.get(n);
    s.status = t => { status.textContent = t; };
    s.onMerge = () => { if (document.activeElement !== ta || ta.value !== n.body) ta.value = n.body || ''; };
    status.textContent = s.dirty ? 'Not saved yet' : s.base ? 'Saved' : '';
    ta.value = n.body || ''; ta.disabled = false; ta.placeholder = 'A line for today…';
    ta.oninput = () => { n.body = ta.value; s.dirty = true; status.textContent = 'Not saved yet'; clearTimeout(s.timer); s.timer = setTimeout(() => persist(n), SAVE_MS); };
    ta.onblur = () => persist(n);
  };
  if (Array.isArray(S.notes)) ready();
  else ensureNotes().then(ready);
  return box;
}

// Settings → Notes: the daily note on the Add tab, the paste cleaner, formatting buttons, and what shared text does
export function renderNoteSettings() {
  const st = settings(), d = display();
  const save = (patch, note = 'Saved') => patchLogbook({ settings: patch }).then(() => note && toast(note));
  return h('div', { class: 'set-page' },
    h('section', { class: 'card' },
      h('h2', {}, 'Notes'),
      help('Your own notes (More → Notes): private, never in your portfolio.'),
      h('h3', {}, 'Daily note'),
      toggle('Show the daily note on the Add tab', st.dayNoteOnCase, v => save({ dayNoteOnCase: v || null }),
        'A small box under the case box for today’s note, saving as you type.', 'Off by default. The notes are read when the Add tab opens, which adds a little to the app’s reads.'),
      h('h3', {}, 'Writing notes'),
      toggle('Clean rich text when pasting', st.pasteClean, v => save({ pasteClean: v || null }),
        'Text copied from a web page, Word, OneNote or UpNote becomes plain Markdown: headings, bold, lists, links.', 'Off: pasting keeps the plain text as it came. Clean up in a note’s ⋯ menu tidies a note already pasted.'),
      toggle(['Formatting buttons in notes (this device)', 'Formatting buttons in notes'], d.noteToolbar, v => { setDisplay({ noteToolbar: v || null }); toast('Saved on this device'); },
        'Bold, italic, heading, lists, to-do, link and undo above the note; on phones they sit on the keyboard.'),
      h('h3', {}, 'Shared to the app'),
      toggle('Ask what to do with shared text', st.shareAsk, v => save({ shareAsk: v || null }),
        'Text shared to the installed app asks: add as cases, add to today’s note, or a new note.', 'Off: shared text goes to the Add tab’s paste-a-list, as before. Shared files always ask.')),
    resetLink('everything on this page (the Add tab box, pasting, the formatting buttons and shared text)', async () => {
      await patchLogbook({ settings: { dayNoteOnCase: null, pasteClean: null, shareAsk: null } });
      setDisplay({ noteToolbar: null });
    }));
}

function editor(n) {
  const s = sessions.get(n) || { base: null, owner: mine(), dirty: false };
  if (!sessions.has(n)) sessions.set(n, s);
  const status = h('span', { class: 'muted notes-status', 'aria-live': 'polite' }, s.base ? 'Saved' : 'Not saved yet');
  s.status = t => { status.textContent = t; };
  // (through s.status: the editor may have been drawn again since, e.g. after a live update once the box lost focus)
  const touch = () => { s.dirty = true; s.status('Not saved yet'); clearTimeout(s.timer); s.timer = setTimeout(() => persist(n), SAVE_MS); };
  // the title wraps onto more lines when it's long (a one-row box that grows), but stays one line of text: Enter moves
  // on to the note itself (as in a notes app), and a pasted line break becomes a space
  const fitTitle = () => { title.style.height = 'auto'; if (title.scrollHeight) title.style.height = title.scrollHeight + 'px'; };
  const title = h('textarea', { class: 'note-title', rows: '1', placeholder: 'Title', 'aria-label': 'Note title', maxlength: String(LIMITS.title),
    oninput: e => {
      const v = e.target.value;
      if (/[\r\n]/.test(v)) { const at = e.target.selectionStart; e.target.value = v.replace(/\r?\n|\r/g, ' '); e.target.setSelectionRange(at, at); }
      n.title = e.target.value; touch(); fitTitle();
    }, onblur: () => persist(n),
    onkeydown: e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); if (nv.preview) modeBtn.click(); body.focus(); body.setSelectionRange(0, 0); } } });
  title.value = n.title || '';
  requestAnimationFrame(fitTitle);
  // and again when its width changes (the phone turned, the window resized, a new text size), so no line is cut off;
  // only on a width change, as fitting it changes its height
  if (typeof ResizeObserver !== 'undefined') {
    let w = 0;
    const ro = new ResizeObserver(([e]) => {
      if (!title.isConnected) return ro.disconnect();
      const nw = Math.round(e.contentRect.width);
      if (nw && nw !== w) { const first = !w; w = nw; if (!first) fitTitle(); }
    });
    ro.observe(title);
  }
  const date = h('input', { type: 'date', 'aria-label': 'Note date', value: n.date || '', onchange: e => { n.date = e.target.value || null; touch(); paintMeta(); } });
  const body = h('textarea', { class: 'note-body', rows: '12', placeholder: 'Write your note… (- [ ] for a to-do)', 'aria-label': 'Note text', maxlength: String(LIMITS.body), spellcheck: 'true',
    oninput: e => { n.body = e.target.value; touch(); }, onblur: () => persist(n), onpaste: e => pasteClean(e, body) });
  body.value = n.body || '';
  // Settings → Notes → Formatting buttons (this device): above the note; on a phone they ride on the keyboard
  const bar = display().noteToolbar ? fmtBar(body, { full: true }) : null;
  if (bar) {
    bar.classList.add('note-fmt');
    body.addEventListener('focus', () => bar.classList.add('on'));
    body.addEventListener('blur', () => bar.classList.remove('on'));
  }
  // one grey line under the title (like Notes and Bear): the date (tap it to change; the date box sits invisibly over
  // it), No date, and the linked case or a way to link one
  const meta = h('div', { class: 'note-meta' });
  const dateText = h('span', {});
  const paintMeta = () => {
    const c = n.caseId && caseOf(n.caseId);
    dateText.textContent = n.date ? fmtDate(n.date) : 'No date';
    fill(meta,
      // a daily note belongs to its day (found by it everywhere): its date shows but doesn't change
      isDayNote(n) ? h('span', { class: 'note-date', title: 'A daily note stays on its day' }, dateText)
        : h('label', { class: 'note-date', title: 'Change the date' }, dateText, date),
      n.date && !isDayNote(n) ? h('button', { class: 'linkish', type: 'button', onclick: () => { n.date = null; date.value = ''; touch(); paintMeta(); } }, 'No date') : null,
      h('span', { class: 'note-dot', 'aria-hidden': 'true' }, '·'),
      n.caseId ? h('span', { class: 'note-link' }, c
        ? h('button', { class: 'linkish note-case', type: 'button', title: 'Open the linked case', 'aria-label': 'Open the linked case: ' + caseLabel(c), onclick: () => openCase(n.caseId) }, '↗ ' + caseLabel(c))
        : h('span', { class: 'note-case' }, '↗ a deleted case'),
        h('button', { class: 'linkish', type: 'button', onclick: () => { delete n.caseId; touch(); paintMeta(); } }, 'Unlink'))
        : h('button', { class: 'linkish', type: 'button', onclick: () => pickCase(n, () => { touch(); paintMeta(); }) }, 'Link to a case…'));
  };
  paintMeta();
  // a daily note merged with a newer copy saved elsewhere (persist): show the merged text
  s.onMerge = () => {
    if (nv.editing !== n) return;
    if (!(document.activeElement === body && body.value === n.body)) body.value = n.body || '';
    if (document.activeElement !== title) { title.value = n.title || ''; fitTitle(); }
    paintMeta(); if (nv.preview) paintView();
  };
  const view = h('div', { class: 'note-view' });
  const paintView = () => fill(view, renderBody(n.body, line => { n.body = toggleCheck(n.body, line); body.value = n.body; touch(); persist(n); paintView(); }));
  // (a menu item names what it does, Preview or Edit: aria-pressed isn't allowed on one)
  const modeBtn = h('button', { type: 'button', onclick: () => { closeMenu(); nv.preview = !nv.preview; paint(); if (!nv.preview) body.focus(); } });
  const paint = () => {
    modeBtn.textContent = nv.preview ? 'Edit' : 'Preview';
    body.hidden = nv.preview; view.hidden = !nv.preview;
    if (bar) bar.hidden = nv.preview;
    if (nv.preview) paintView();
  };
  paint();
  const del = h('button', { class: 'danger', type: 'button', onclick: async () => {
    closeMenu();
    const st = sessions.get(n);
    clearTimeout(st?.timer);
    if (!st?.base) { nv.editing = null; dropEditorEntry(); hooks.render(); return; }   // never saved: nothing to bin
    await persist(n);
    try { const { moveToBin } = await import('./bin.js'); await moveToBin('note', { ...n }, { toast: true }); }
    catch (err) { return toast('Could not delete: ' + err.message); }
    nv.editing = null; if (editorTransient?.active) dropEditorEntry(); else hooks.render();
  } }, 'Delete');
  // Clean up: tidy Markdown pasted earlier (stray \ escapes, double spaces, ** around nothing, broken bullets); Undo puts it back
  const tidy = h('button', { type: 'button', onclick: () => {
    closeMenu();
    const before = n.body || '', after = tidyMarkdown(before);
    if (after === before.trim() || after === before) return toast('Nothing to clean up');
    n.body = after; body.value = after; touch(); if (nv.preview) paintView();
    toast('Cleaned up', { action: 'Undo', onaction: () => {
      if (nv.editing !== n) return;
      n.body = before; touch();
      const live = document.querySelector('.note-editor .note-body');   // the editor on screen now
      if (live) live.value = before;
      if (nv.preview) hooks.render();
    } });
  } }, 'Clean up');
  const day = isDayNote(n);
  setTimeout(() => { if (!s.base && !nv.preview) (day ? body : title).focus(); }, 0);
  // the top bar: ‹ Notes, whether it's saved, a ⋯ menu (Preview or Edit, Clean up, Delete) and Done; no boxes below it
  const menu = h('div', { class: 'note-menu', role: 'menu', hidden: true }, modeBtn, tidy, del);
  [modeBtn, tidy, del].forEach(b => b.setAttribute('role', 'menuitem'));
  const more = h('button', { class: 'small icon-btn note-more', type: 'button', 'aria-label': 'More options', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, '⋯');
  const { close: closeMenu } = popMenu(more, menu);
  return h('section', { class: 'card note-editor' },
    h('div', { class: 'note-top' }, h('a', { class: 'back-link note-back', href: '#notes', onclick: e => { e.preventDefault(); closeEditor(); } }, h('span', { class: 'back-chev', 'aria-hidden': 'true' }, '‹'), BACK_LABEL[nv.back] || 'Notes'),
      h('span', { style: 'flex:1' }), status, h('span', { class: 'note-menu-wrap' }, more, menu), h('button', { class: 'small primary', type: 'button', onclick: closeEditor }, 'Done')),
    title, meta, bar, body, view);
}

// The ⋯ menu: opens and closes with its button; a tap or click anywhere else closes it, as do Escape (focus back on the
// button), Tab and leaving the page. One listener on the document while it's open (it ignores the button itself, so the
// tap that opened it can't close it again, whatever order a browser delivers it in: WebKit closed it at once with a
// one-off listener added after the tap), removed when it closes. Arrow keys move between the items.
function popMenu(btn, menu) {
  const items = () => [...menu.querySelectorAll('[role=menuitem]')];
  const away = e => { if (!menu.isConnected || (!menu.contains(e.target) && !btn.contains(e.target))) close(); };
  const keys = e => {
    if (!menu.isConnected) return close();
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.key === 'Tab') return close();
    if (!menu.contains(document.activeElement)) return;
    const list = items(), i = list.indexOf(document.activeElement);
    const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    list[(to + list.length) % list.length]?.focus();
  };
  function close(refocus = false) {
    document.removeEventListener('click', away, true);
    document.removeEventListener('keydown', keys, true);
    if (menu.hidden) return;
    menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
    if (refocus && btn.isConnected) btn.focus();
  }
  function open() {
    menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', away, true);
    document.addEventListener('keydown', keys, true);
    items()[0]?.focus({ preventScroll: true });
  }
  btn.addEventListener('click', e => { e.stopPropagation(); if (menu.hidden) open(); else close(); });
  return { open, close };
}

// Settings → Notes → Clean rich text when pasting (off by default): a paste with HTML (a web page, Word, Docs,
// OneNote, UpNote) goes in as light Markdown; plain text pastes as it is. Never more than the note can hold.
function pasteClean(e, ta) {
  if (!settings().pasteClean) return;
  const html = e.clipboardData && e.clipboardData.getData('text/html');
  if (!html) return;
  const md = htmlToMarkdown(html);
  if (!md) return;
  e.preventDefault();
  const room = LIMITS.body - (ta.value.length - (ta.selectionEnd - ta.selectionStart));
  if (md.length > room) toast('The note is full: some of the pasted text didn’t fit');
  replaceRange(ta, ta.selectionStart, ta.selectionEnd, md.slice(0, Math.max(0, room)));
}

// the body as elements (never innerHTML): headings, paragraphs, lists and to-dos that tick (with no onTick, a preview:
// the boxes show but don't change)
export function renderBody(text, onTick) {
  const blocks = parseNote(text);
  if (!blocks.length) return h('p', { class: 'muted' }, 'Nothing written yet.');
  const inl = parts => parts.map(p => p.t === 'b' ? h('strong', {}, p.v) : p.t === 'i' ? h('em', {}, p.v) : p.t === 'a' ? h('a', { href: p.href, target: '_blank', rel: 'noopener noreferrer' }, p.v) : p.v)
    .flatMap(x => (typeof x === 'string' ? x.split('\n').flatMap((t, i) => (i ? [h('br'), t] : [t])) : [x]));
  return blocks.map(b => b.t === 'h' ? h('h' + (b.level + 2), {}, inl(b.inl))
    : b.t === 'p' ? h('p', {}, inl(b.inl))
    : h(b.t, { class: b.items.some(i => i.check !== null) ? 'note-todos' : null }, b.items.map(i => h('li', {},
      i.check === null ? inl(i.inl) : h('label', { class: 'check' + (i.check ? ' done' : '') }, h('input', { type: 'checkbox', checked: i.check, disabled: !onTick, onchange: () => onTick && onTick(i.line) }), h('span', {}, inl(i.inl)))))));
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
export function downloadNoteFiles(only = null) {
  const list = only || (Array.isArray(S.notes) ? S.notes : []);
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
  const made = [];
  for (const n of list) { const note = cleanNote({ id: uid(), ...n }); await writes.save('note', me, note, null); made.push(note); }
  return made;   // so an Undo can bin them again
}
