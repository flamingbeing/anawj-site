// Log screen: the heart of the app. Date + details + categories, saved in a couple of taps.
// Also the reusable category picker and the edit-case dialog (used by the Logbook screen).

import { BY_CODE, TIPS } from './categories.js';
import { cleanListFormat } from './list-format.js';
import { withParents, parseBulk, parseDate, fmtDate, sortCodes, uid, caseParts, caseText, cleanInitials, splitInitials, splitAge, humanAge, nth, weekLead } from './engine.js';
import { suggest as suggestCodes, bmiAt } from './suggest.js';
import { apmesShorthand, shorthandTags } from './tags.js';
import {
  S, h, ic, toast, debounce, modal, confirmBox, cat, catName, catShort, catFull, catChip, countText, logTags, tagLinks, tagName, tagChip, tagSet, keepTags, PROGRESS_BY_CODE,
  createCase, updateCase, removeCase, restoreCase, saveMany, deleteMany, subcatChips, subcatsOf, settings, todayISO, hooks, fill, add, cloud, writes, okNoIds, patchLogbook, catPills, basicHides, basicMode, caseShown, shows } from './ui-core.js';
import { display, setDisplay } from './display.js';
import { moveToBin } from './bin.js';
import { caseHasNotes, openNotes, dayNoteBox, addNotes, notesRoom } from './ui-notepad.js';
import { createDraftSlot, listDrafts } from './drafts.js';
import { STRONG, confident, autoTick, rejectCodes, recentCases, recentCount as snapRecent } from './logging.js';
import { SHARED_KEY, peekShared, popShared, sharedFiles, shareState } from './share-in.js';
import { labelsOn, labelOf, parseParts, suggestText, cleanCaseTemplate, templateCaret, stripTemplate, splitOverflow, MAX_DETAILS } from './parts.js';
import { LIMITS as NOTE_LIMITS } from './notepad.js';
import { evalRequestUrl, evalsBase } from './eval-link.js';

const DRAFT_KEY = 'logbook-draft-v2';
const KEEP_MS = 12 * 3600e3; // a date kept by "Save, keep date" lasts this long
const yesterdayISO = () => { const d = new Date(); d.setDate(d.getDate() - 1); return todayISO(d); };

// The unsent draft survives tab switches and reloads (this browser only). It is kept per account
// (and apart from the demo), so the next person on a shared phone never sees it; sign-out wipes it.
const EMPTY = () => ({ date: null, details: '', initials: '', initialsHint: '', cats: [], mode: 'one', bulk: '' });
let draft = EMPTY(), draftOwner = null, draftSlot = null, draftError = '';
let suggestedSave = null, saving = false;
const draftText = () => [draft.initials, draft.details].filter(Boolean).join(' ').trim();
// something typed (a case template with nothing added doesn't count)
const typedText = () => !!(String(draft.initials || '').trim() || (draft.details.trim() && !onlyTemplate(draft.details)));
// Keep deliberately entered initials when switching back to the combined box,
// even if those letters also name a procedure (IJ, TKR). Editing the prefix can replace them.
// With the Separate initials box on (draft.sep: the box the draft was last shown with), the Initials field is
// taken as typed, even empty: a first word like "Mum" stays in the details.
const draftParts = (box = draft.details) => {
  if (draft.initials || (draft.sep === 'initials' && firstField() === 'initials')) return { initials: draft.initials, details: box.trim() };
  const text = box.trim(), hint = draft.initialsHint;
  if (hint && text.slice(0, hint.length).toUpperCase() === hint && (!text.slice(hint.length) || /^\s/.test(text.slice(hint.length))))
    return { initials: hint, details: text.slice(hint.length).trim() };
  settings();   // (brings the account's detection settings into engine.js first)
  const p = splitInitials(text);
  // tapped on the line under the box: these letters stay in the case text (Todoist-style undo; 15 Oct 2026)
  return p.initials && draft.noIni === p.initials ? { initials: '', details: text } : p;
};
// the age read from the box, unless tapped off on the line under it
const boxAge = details => { const { age } = settings().detectAgeSex !== false ? splitAge(details) : { age: '' }; return age && draft.noAge === age ? '' : age; };
const ageOff = () => !!draft.noAge && splitAge(draftParts().details).age === draft.noAge;
// Settings → Advanced logging → Separate initials box (device firstField 'initials'; an older 'date' counts as off)
const firstField = () => (display().firstField === 'initials' ? 'initials' : 'details');
// The Add tab opening the keyboard by itself (Logging → Advanced: "Open the keyboard when the Add tab opens"). On a
// touch screen only right after a tap or key (going to the Add tab), never as the app opens or when a live update
// draws the page again (the keyboard would cover it before anything was tapped), unless set to "Also when the app
// opens" (autoFocus true). Computers keep focusing it as before.
let gestureAt = 0;
if (typeof window !== 'undefined') for (const ev of ['pointerup', 'keydown']) window.addEventListener(ev, () => { gestureAt = Date.now(); }, { capture: true, passive: true });
const touchOnly = () => typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
// The app's "Log a case" shortcut (./#quicklog, manifest.webmanifest) asks for the keyboard: it counts as the tap, once
// (until the box gets focus or someone taps, at most 15 s while the app starts), and the address becomes #log
let launchedAt = 0;
const takeQuickLog = () => {
  if (location.hash !== '#quicklog') return;
  launchedAt = Date.now();
  history.replaceState(history.state, '', location.pathname + location.search + '#log');
};
if (typeof window !== 'undefined') {
  takeQuickLog();
  window.addEventListener('hashchange', takeQuickLog, true);   // before app.js routes it (registered first)
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { launchedAt = 0; }, { capture: true, passive: true });
}
export const wantFocus = () => {
  const a = display().autoFocus;
  return a !== false && !document.documentElement.classList.contains('no-autofocus') && (a === true || !touchOnly() || Date.now() - gestureAt < 1500 || Date.now() - launchedAt < 15000);
};
export const focusLog = () => {
  const el = (draft.mode === 'bulk' ? ui?.textarea : firstField() === 'initials' ? ui?.initials : ui?.textarea);
  el?.focus({ preventScroll: true });
  if (el && document.activeElement === el) launchedAt = 0;
};
const suggestionKey = () => JSON.stringify([draftText(), curDate(), settings().detectAgeSex !== false, draft.noIni || '', draft.noAge || '']);
const draftKey = () => `${DRAFT_KEY}:${cloud.demo ? 'demo:' : ''}${(S.user && S.user.email) || ''}`;
function loadDraft() {
  if (draftOwner === draftKey()) return;
  draftOwner = draftKey(); draft = EMPTY(); bulkRows = null;
  draftSlot = createDraftSlot(DRAFT_KEY, draftOwner.slice(DRAFT_KEY.length + 1), undefined, undefined, { move: true });
  draft = { ...draft, ...(draftSlot.initial || {}) };
  saveDraft();
  // a kept date only lasts for one sitting, never into tomorrow's list
  // a picked day survives a reload in the same sitting (phones unload the app when you switch away)
  if (!(Date.now() - Math.max(draft.keepDate ? draft.keptAt || 0 : 0, draft.dateAt || 0) < KEEP_MS)) draft.date = null;
}
let draftTimer = 0;
function saveDraft() {
  clearTimeout(draftTimer); draftTimer = 0;
  if (!draftSlot || draftOwner !== draftKey()) return;
  try { draftSlot.save({ ...draft, savedAt: Date.now() }); draftError = ''; }
  catch { draftError = 'Draft not saved: storage unavailable. Keep this page open.'; }
  if (ui?.draftNote) ui.draftNote.textContent = draftError || (draftText() || draft.bulk ? 'Draft saved' : '');
}
// Typing saves once the keys pause (one storage write, not one per key). Leaving the page, switching away or
// moving to another screen (Recover drafts lists what is stored) saves at once.
const saveDraftSoon = () => { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 300); };
saveDraft.cancel = () => { clearTimeout(draftTimer); draftTimer = 0; };
window.addEventListener('pagehide', saveDraft);
window.addEventListener('hashchange', () => { if (draftTimer) saveDraft(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) saveDraft(); });
export function recoverableCaseDrafts() {
  try { return listDrafts(DRAFT_KEY, draftKey().slice(DRAFT_KEY.length + 1)).filter(x => (x.value.details && !onlyTemplate(x.value.details)) || x.value.initials || x.value.bulk); } catch { return []; }
}
export function recoverCaseDraft(value) { loadDraft(); saveDraft(); draftSlot = createDraftSlot(DRAFT_KEY, draftOwner.slice(DRAFT_KEY.length + 1), undefined, undefined, { move: true }); draft = { ...EMPTY(), ...value }; saveDraft(); location.hash = '#log'; hooks.render(); }
// Text shared to the installed app (share sheet → Logbook; manifest share_target) arrives as
// ?share_text=… (or, from the service worker, ?shared=1: share-in.js); app.js keeps it for here: it opens in
// paste-a-list, so one case or a whole list works. With Settings → Notes → Ask what to do with shared text, the
// chooser (#share) asks first; it calls this for "Add as case(s)" (force).
export { SHARED_KEY };
export function takeShared(force = false) {
  if (!force && !shareState.seen && (settings().shareAsk || sharedFiles()) && peekShared()) { queueMicrotask(() => hooks.navigate && hooks.navigate('share')); return; }
  const text = popShared();
  if (!text.trim()) return;
  draft.bulk = draft.bulk && draft.bulk.trim() ? draft.bulk.trimEnd() + '\n\n' + text.trim() : text.trim();
  draft.mode = 'bulk'; bulkRows = null;
  saveDraft();
  setTimeout(() => toast('Shared text added: check it, then Review'), 300);
}

// Open the Log page with this day picked (from the Logbook calendar's "+ Add").
export function logOnDate(iso) {
  loadDraft();
  // a fresh case for that day; a case already being typed stays, and only its date changes
  const typing = typedText() || (draft.cats || []).length;
  if (typing) setTimeout(() => toast('Date set. The case you were typing is still in the box'), 300);
  else Object.assign(draft, { details: '', initials: '', initialsHint: '', cats: [], tags: [], reflectTag: false, ...FRESH_TICKS() });
  draft.mode = 'one';
  draft.date = iso === todayISO() ? null : iso; draft.dateAt = Date.now(); bulkRows = null;
  saveDraft();
  location.hash = '#log';
}

export function clearDrafts() {
  suggestedSave = null;
  saveDraft.cancel();
  draft = EMPTY(); draftOwner = null; draftSlot = null; bulkRows = null; ui = null;
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('logbook-draft-') || k.startsWith('logbook-edit-draft:')) localStorage.removeItem(k); } catch { /* ignore */ }
}

// ---------- selection helpers ----------

// Adding a sub-category adds its parent; removing a parent removes its sub-categories.
function addCat(list, code) { return sortCodes(withParents([...list, code])); }
// Tick or untick one of your tags: ticking it also ticks the APMES categories it counts towards.
function toggleTagIn(cats, tags, key) {
  const on = (tags || []).includes(key);
  return on ? { cats, tags: tags.filter(t => t !== key) } : { cats: sortCodes(withParents([...cats, ...tagLinks(key)])), tags: [...(tags || []), key] };
}
// your tags shown as their own chips (the ones right under a selected category show as tick-chips instead)
const looseTags = (cats, tags) => (tags || []).filter(k => !(cats || []).some(code => subcatsOf(code).some(e => e.k === k)));
function dropCat(list, code) { return list.filter(c => c !== code && BY_CODE[c]?.parent !== code); }
const toggleCat = (list, code) => (list.includes(code) ? dropCat(list, code) : addCat(list, code));
// The user's own changes to the ticked categories on the Add tab go through here: what they take off is
// remembered for this case, so "Tick confident suggestions automatically" leaves it off.
function setCats(next) {
  const gone = draft.cats.filter(c => !next.includes(c));
  draft.cats = next;
  if (gone.length) Object.assign(draft, rejectCodes(draft, gone));
}
// a new case starts with nothing ticked automatically and nothing turned down
const FRESH_TICKS = () => ({ auto: [], rejected: [] });

// Settings → Advanced logging → Labelled parts (null when off) and Case template ('' when off); parts.js
const labels = () => labelsOn(settings());
const caseTemplate = () => { const t = settings().caseTplOn ? cleanCaseTemplate(settings().caseTpl) : ''; return t.trim() ? t : ''; };
// the box holds only the template (nothing added): as good as empty
const onlyTemplate = text => { const tpl = caseTemplate(); return !!tpl && !!String(text || '').trim() && !stripTemplate(text, tpl, labels()).trim(); };
// An empty case box gets the template when it takes the focus, the cursor after its first label; left as it was,
// the template goes again when the box loses the focus (nothing to save, no draft kept)
function putTemplate(ta) {
  const tpl = caseTemplate();
  if (!tpl || ta.value.trim() || draft.mode === 'bulk') return;
  ta.value = tpl; draft.details = tpl;
  // the tap that focused the box puts the cursor where it landed: put it back once that tap ends
  const at = templateCaret(tpl), place = () => { if (document.activeElement === ta && ta.value === tpl) ta.setSelectionRange(at, at); };
  place();
  ta.addEventListener('click', place, { once: true });
  setTimeout(() => ta.removeEventListener('click', place), 800);
  saveDraftSoon(); paintParsed(false);
}
function dropTemplate(ta) {
  if (!onlyTemplate(ta.value)) return;
  ta.value = ''; draft.details = ''; saveDraft(); paintSuggest(); paintParsed(false);
}
// Tag suggestions and your shorthand read the case without its learning points (Labelled parts on)
const forTags = text => suggestText(text, labels());

// A case longer than the 2000 characters a case can hold (firestore.rules): with a yes, the first part stays in the
// case and the rest goes into a note linked to it, never cut off silently. rows: [{ details }] (changed in place:
// details shortened, rest added); false when cancelled or there's no room in Notes.
async function splitLong(rows) {
  const over = rows.filter(r => String(r.details || '').length > MAX_DETAILS);
  if (!over.length) return true;
  const cut = over.map(r => splitOverflow(r.details));
  if (cut.some(x => x.rest.length > NOTE_LIMITS.body)) { toast('A case is too long even with a note: shorten it first'); return false; }
  const one = over.length === 1;
  if (!(await confirmBox('Longer than a case can hold', `${one ? 'This case is' : `${over.length} cases are`} over the ${MAX_DETAILS}-character limit. Keep the first part in the case and move the rest into a note linked to it?`, one ? 'Move the rest to a note' : 'Move the rest to notes'))) return false;
  let room = 0;
  try { room = await notesRoom(); } catch { /* counted as none */ }
  if (room < over.length) { toast(`No room in Notes (100 at most) for ${one ? 'the rest' : over.length + ' notes'}: shorten ${one ? 'the case' : 'them'} or delete some notes`); return false; }
  over.forEach((r, i) => { r.details = cut[i].head; r.rest = cut[i].rest; });
  return true;
}
// the notes for split cases, once the cases are saved: [{ c (the saved case), rest }] -> a promise of the notes made,
// or null when there are none. No toast of its own (there is one toast, and it would hide the Saved toast's Undo):
// the caller adds restSaid() to its toast, and its Undo calls binRest()
function restNotes(list) {
  const todo = list.filter(x => x.rest);
  if (!todo.length) return null;
  return addNotes(todo.map(({ c, rest }) => ({ date: c.date || null, caseId: c.id, title: 'Rest of the case' + (c.initials ? ' · ' + c.initials : ''), body: rest })))
    .catch(err => { toast('The rest of the case was not saved as a note: ' + err.message); return []; });
}
const restSaid = list => { const n = list.filter(x => x.rest).length; return !n ? '' : n === 1 ? ' · the rest is in a linked note' : ` · the rest of ${n} cases is in linked notes`; };
async function binRest(made) {
  const notes = made ? await made : [];
  if (!notes || !notes.length) return;
  try { const { moveToBin } = await import('./bin.js'); await moveToBin('note', notes); } catch (err) { toast('Could not remove the linked note: ' + err.message); }
}

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
// how tall the case box starts (Settings → Logging: 2 to 20 lines)
const boxLines = () => Math.min(20, Math.max(2, Math.round(Number(settings().boxLines) || 3)));
// The case box's height (owner, 15 Oct 2026; per device): a dragged height is kept (display().boxHeight, px), and
// "Grow as I type" (on unless display().boxGrow is false) grows it from there up to two thirds of the screen
const boxHeight = () => { const v = Math.round(Number(display().boxHeight)); return v >= 60 && v <= 2000 ? v : null; };
const boxGrows = () => display().boxGrow !== false;
function fitBox(ta) {
  if (!ta || !ta.isConnected) return;
  const base = boxHeight();
  ta.style.height = base ? base + 'px' : '';
  if (!boxGrows()) return;
  const want = Math.min(Math.round(innerHeight * 0.66), ta.scrollHeight + 2);
  if (want > ta.offsetHeight) ta.style.height = want + 'px';
}
// the grab bar under the box: drag (finger or mouse) to set the height; double-tap resets; ↑ ↓ on a keyboard.
// The List box (paste a list) has its own (owner, 16 Oct 2026): its height is kept apart (display().listHeight)
const listHeight = () => { const v = Math.round(Number(display().listHeight)); return v >= 60 && v <= 2000 ? v : null; };
function boxGrab(ta, list = false) {
  const set = px => { const v = Math.max(60, Math.min(Math.round(innerHeight * 0.85), Math.round(px))); ta.style.height = v + 'px'; grab.setAttribute('aria-valuenow', v); return v; };
  const save = v => { if (list) setDisplay({ listHeight: v }); else { setDisplay({ boxHeight: v }); fitBox(ta); } };
  const reset = () => { if (list) { setDisplay({ listHeight: null }); ta.style.height = ''; } else { setDisplay({ boxHeight: null }); fitBox(ta); } };
  let lastTap = 0;
  // a focusable separator is a slider to screen readers: it needs a value (the height in pixels)
  const grab = h('div', { class: 'box-grab', role: 'separator', tabindex: '0', 'aria-orientation': 'horizontal', 'aria-label': `${list ? 'List box' : 'Case box'} height: drag to change, double-tap to reset`,
    'aria-valuemin': '60', 'aria-valuemax': String(Math.round(innerHeight * 0.85)), 'aria-valuenow': String((list ? listHeight() : boxHeight()) || (list ? 180 : 96)),
    onpointerdown: e => {
      const now = Date.now();
      if (now - lastTap < 350) { lastTap = 0; reset(); return; }
      lastTap = now;
      e.preventDefault();
      const y0 = e.clientY, h0 = ta.offsetHeight;
      grab.setPointerCapture?.(e.pointerId); grab.classList.add('dragging');
      let v = h0;
      const move = ev => { v = set(h0 + ev.clientY - y0); };
      const up = () => { grab.classList.remove('dragging'); for (const [k, f] of [['pointermove', move], ['pointerup', up], ['pointercancel', up]]) grab.removeEventListener(k, f); if (v !== h0) save(v); };
      grab.addEventListener('pointermove', move); grab.addEventListener('pointerup', up); grab.addEventListener('pointercancel', up);
    },
    onkeydown: e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); save(set(ta.offsetHeight + (e.key === 'ArrowDown' ? 24 : -24))); } } });
  return grab;
}
// Paste: the clipboard into a box (filled when empty, else on a new line). Browsers that can't read
// the clipboard (or a refused permission) get a hint to long-press and paste instead.
async function pasteInto(ta, after) {
  let text = '';
  try { text = await navigator.clipboard.readText(); }
  catch { return toast('Couldn’t read the clipboard here: long-press (or right-click) the box and choose Paste'); }
  text = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return toast('The clipboard is empty');
  ta.value = ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' + text : text;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus({ preventScroll: true });
  after && after();
}
// in the case box's corner it is the icon alone; elsewhere the icon and a label
const pasteBtn = (ta, label = '') => h('button', { type: 'button', class: 'small paste-btn' + (label ? '' : ' icon-only'), title: 'Paste from the clipboard', 'aria-label': label || 'Paste from the clipboard', onclick: () => pasteInto(ta) }, ic('paste'), label);
const refocus = () => { if (ui.textarea && matchMedia('(pointer: fine)').matches) ui.textarea.focus({ preventScroll: true }); };

// The list follows your tag set (Settings → Tag editor): section headers, categories and your own tags,
// indented under what they sit in; hidden ones only turn up in a search. getTags / toggleTag handle your
// tags (left out: categories only).
// onEmptyEnter: Enter in the empty search box (the Add tab saves the case).
export function catPicker({ get, toggle, getTags = null, toggleTag = null, placeholder = 'Search tags', collapsed = false, onEmptyEnter = null }) {
  let q = '', hl = -1, items = [], showAll = !collapsed;
  const listId = 'tags-' + uid();
  const list = h('ul', { id: listId, role: 'listbox', 'aria-label': 'Tags', 'aria-multiselectable': 'true' });
  const input = h('input', {
    type: 'search', role: 'combobox', 'aria-label': placeholder, 'aria-controls': listId, 'aria-expanded': 'true', 'aria-autocomplete': 'list', placeholder, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done',
    oninput: e => { q = e.target.value; hl = q.trim() ? 0 : -1; refresh(); },
    onkeydown: e => {
      if (e.key === 'ArrowDown') { hl = Math.min(items.length - 1, hl + 1); paintHl(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { hl = Math.max(0, hl - 1); paintHl(); e.preventDefault(); }
      else if (e.key === 'Enter' && (q.trim() || hl >= 0)) {
        e.preventDefault();
        if (items[hl]) { pick(items[hl]); q = ''; input.value = ''; hl = -1; refresh(); }
      } else if (e.key === 'Enter' && onEmptyEnter && !e.isComposing) { e.preventDefault(); if (!e.repeat) onEmptyEnter(); }   // holding Enter never saves
      else if (e.key === 'Escape') { q = ''; input.value = ''; refresh(); }
    },
  });
  function matches(n, words) {
    if (n.kind === 'head') return false;
    if (n.kind === 'tag') { const hay = `${n.e.n} ${n.e.l || ''}`.toLowerCase(); return words.every(w => hay.includes(w)); }
    const c = BY_CODE[n.code];
    const hay = `${c.code} ${c.name} ${c.label} ${catName(c.code)} ${catShort(c.code)}`.toLowerCase();
    return words.every(w => (/^\d/.test(w) ? c.code.startsWith(w.padStart(2, '0')) || c.code.startsWith(w) : hay.includes(w)));
  }
  const pick = n => (n.kind === 'cat' ? toggle(n.code) : n.kind === 'tag' && toggleTag ? toggleTag(n.e.k) : null);
  const options = () => [...list.querySelectorAll('[role=option]')];
  function paintHl() {
    const nodes = options();
    if (hl >= 0) list.hidden = false;
    nodes.forEach((li, i) => { li.id = listId + '-' + i; li.tabIndex = i === Math.max(0, hl) ? 0 : -1; li.classList.toggle('hl', i === hl); });
    if (nodes[hl]) { input.setAttribute('aria-activedescendant', nodes[hl].id); nodes[hl].scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
    input.setAttribute('aria-expanded', String(!list.hidden));
  }
  // A roving tab stop supports both List and Pills without hundreds of tab stops.
  list.addEventListener('keydown', ev => {
    const nodes = options(), index = nodes.indexOf(ev.target.closest('[role=option]'));
    if (index < 0) return;
    let next;
    if (ev.key === 'ArrowDown') next = Math.min(nodes.length - 1, index + 1);
    else if (ev.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = nodes.length - 1;
    else if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault(); ev.stopPropagation(); hl = index; pick(items[index]); sync(); options()[index]?.focus({ preventScroll: true }); return;
    } else if (ev.key === 'Escape') { ev.preventDefault(); input.focus(); return; }
    if (next != null) { ev.preventDefault(); hl = next; paintHl(); nodes[next]?.focus({ preventScroll: true }); }
  });
  function refresh() {
    list.hidden = !showAll && !q.trim() && hl < 0;
    const sel = new Set(get());
    const prog = PROGRESS_BY_CODE();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const tagsOn = new Set(getTags ? getTags() : []);
    // hidden items (and everything under them) only in a search; your tags only when this list handles them
    const hiddenUnder = new Set();
    const all = logTags().filter(n => {
      if ((n.e.p && hiddenUnder.has(n.e.p)) || n.e.hide) { hiddenUnder.add(n.e.k); if (!words.length) return false; }
      return n.kind !== 'tag' || !!toggleTag;
    });
    items = words.length ? all.filter(n => matches(n, words)) : all.filter(n => n.kind !== 'head');
    const shown = words.length ? items : all;
    // Pills (Settings or the switch above the list): the same items as chips, under their headers
    if (!words.length && settings().catView === 'pills') {
      const rows = [];
      let cur = null;
      for (const n of shown) {
        if (n.kind === 'head') { rows.push(h('li', { class: 'head', role: 'presentation' }, n.e.n)); cur = null; continue; }
        if (!cur) { cur = h('div', { class: 'chips' }); rows.push(h('li', { class: 'pill-row', role: 'presentation' }, cur)); }
        const on = n.kind === 'cat' ? sel.has(n.code) : tagsOn.has(n.e.k);
        add(cur, h('span', { class: `chip ${on ? 'on' : ''} ${n.kind === 'tag' ? 'tag' : ''} ${n.depth ? 'subp' : ''}`, role: 'option', tabindex: '0', 'aria-selected': String(on),
          ...(n.kind === 'cat' ? { 'data-code': n.code, title: catName(n.code) } : { 'data-tag': n.e.k, title: n.e.l || n.e.n }),
          onclick: () => keepPlace(list, () => { pick(n); sync(); }) },
          h('span', { class: 'nm' }, n.kind === 'cat' ? catShort(n.code) : n.e.n)));
      }
      fill(list, ...rows);
      list.classList.add('pills');
      paintHl();
      return;
    }
    list.classList.remove('pills');
    fill(list, ...shown.map(n => {
      const pad = `padding-left:${12 + Math.min(n.depth, 4) * 16}px`;
      if (n.kind === 'head') return h('li', { class: 'head', role: 'presentation', style: pad }, n.e.n);
      if (n.kind === 'tag') {
        const on = tagsOn.has(n.e.k);
        return h('li', { role: 'option', 'data-tag': n.e.k, 'aria-selected': String(on), class: `tag ${n.depth ? 'sub' : ''} ${on ? 'on' : ''}`, style: pad, title: n.e.l || n.e.n,
          onclick: () => keepPlace(list, () => { pick(n); sync(); }) },
          h('span', { class: 'tick' }, on ? '✓' : ''), h('span', { class: 'nm' }, n.e.n, n.e.l ? h('small', { class: 'muted' }, ' ' + n.e.l) : null), h('span', { class: 'ct' }, ''));
      }
      const c = BY_CODE[n.code], p = prog[c.code];
      return h('li', {
        role: 'option', 'data-code': c.code, 'aria-selected': String(sel.has(c.code)), class: `${n.depth ? 'sub' : ''} ${sel.has(c.code) ? 'on' : ''}`, style: pad, title: c.full || c.name,
        onclick: () => keepPlace(list, () => { pick(n); sync(); }),
      },
      h('span', { class: 'tick' }, sel.has(c.code) ? '✓' : ''),
      h('span', { class: 'nm' }, catName(c.code)),
      h('span', { class: `ct ${p && p.status === 'done' ? 'met' : ''}` }, countText(c.code, prog)));
    }));
    if (words.length && !items.length) add(list, h('li', { class: 'muted' }, 'Nothing matches “' + q + '”'));
    paintHl();
  }
  // A tap only changes what is ticked: update the ticks in place instead of rebuilding the list (keeps the
  // focus, the scroll and the work small). refresh() rebuilds, for a search, the counts or the tag set.
  function sync() {
    const sel = new Set(get()), tagsOn = new Set(getTags ? getTags() : []);
    for (const el of options()) {
      const on = el.dataset.code ? sel.has(el.dataset.code) : tagsOn.has(el.dataset.tag);
      if (el.classList.contains('on') === on) continue;
      el.classList.toggle('on', on); el.setAttribute('aria-selected', String(on));
      const tick = el.querySelector(':scope > .tick');
      if (tick) tick.textContent = on ? '✓' : '';
    }
  }
  refresh();
  const expand = collapsed ? h('button', { type: 'button', class: 'small', 'aria-expanded': String(showAll), onclick: () => { showAll = !showAll; hl = -1; expand.textContent = showAll ? 'Hide full tag list' : 'Show all tags'; expand.setAttribute('aria-expanded', String(showAll)); refresh(); } }, 'Show all tags') : null;
  const el = h('div', { class: 'picker' }, input, expand, list);
  return { el, refresh, sync, focus: opts => input.focus(opts), input };
}

// ---------- the Log screen ----------

// Parts of the Add tab people can hide (Settings → Logging, settings.caseHide); tags can always be picked from All tags
export const CASE_PARTS = [
  ['interesting', 'Interesting'],
  ['parsed', 'What the box was read as (initials · details)'],
  ['sugg', 'Suggested tags as you type'],
  ['recent', 'Quick picks (Same as last, tag groups)'],
  ['still', 'Still needed'],
  ['groupsave', 'Save these tags as a tag group'],
  ['plan', 'Plan for later'],
];
const caseHidden = part => !caseShown(part);
// What Save does next (Settings → Logging, settings.afterSave)
export const AFTER_SAVE = [
  ['next', 'Ready for the next case (default)'],
  ['keepTags', 'Ready for the next case, keeping the tags'],
  ['closed', 'Ready for the next case, keyboard closed'],
  ['logbook', 'Go to the Logbook, on that day'],
];

let dateRO = null;
let ui = null; // live parts of the screen, so a case-list update doesn't wipe what's being typed

// "Still needed this year": the categories behind or due, most urgent first; tap for Progress.
function stillNeeded() {
  const rank = { late: 0, due: 1 };
  const need = Object.values(PROGRESS_BY_CODE()).filter(p => p.status in rank && p.next)
    .sort((a, b) => rank[a.status] - rank[b.status] || (b.next.n - b.count) - (a.next.n - a.count)).slice(0, 3);
  if (!need.length) return null;
  return h('a', { class: 'still-needed', href: '#progress' },
    h('span', { class: 'sn-l' }, 'Still needed:'),
    need.map(p => h('span', { class: `sn ${p.status}` }, catName(p.code), ' ', h('b', {}, `${p.next.n - p.count} more`))),
    h('span', { class: 'chev' }, '›'));
}

// Once a week (from the week's first day: Monday unless set): last week's count and what is still needed.
// Dismissed until next week. Off unless turned on in Settings → Logging.
function weeklyDigest() {
  if (!settings().weeklyDigest || !S.cases || !S.cases.length) return null;
  const now = new Date(), dow = weekLead(now, settings().weekStart);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
  const from = todayISO(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7)), to = todayISO(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 1));
  const key = `logbook-digest:${(S.user && S.user.email) || ''}`;
  let seen = ''; try { seen = localStorage.getItem(key) || ''; } catch { /* storage blocked */ }
  if (seen === from) return null;
  const n = S.cases.filter(c => c.date && c.date >= from && c.date <= to).length;
  const card = h('section', { class: 'card digest' },
    h('div', { class: 'bar', style: 'margin:0' },
      h('b', {}, `Last week: ${n} case${n === 1 ? '' : 's'} logged`), h('span', { class: 'grow' }),
      h('button', { class: 'small', 'aria-label': 'Dismiss until next week', onclick: () => { try { localStorage.setItem(key, from); } catch { /* ignore */ } card.remove(); } }, 'OK')),
    h('p', { class: 'hint', style: 'margin:4px 0 8px' }, n ? 'Nice work.' : 'Nothing logged last week: catch up with the weekday chips or Paste list.'),
    basicHides('targets') ? null : h('a', { class: 'btn small', href: '#progress' }, 'See what is still needed'));
  return card;
}

export function renderLog() {
  loadDraft();
  takeShared();
  const card = h('section', { class: 'card log-card' });
  const datebar = h('div', { class: 'datebar', id: 'datebar' });
  add(card, datebar);
  ui = { card, datebar };
  if (draft.mode === 'bulk') renderBulk(card);
  else renderOne(card);
  paintDate();
  const digest = weeklyDigest();
  const planned = draft.mode === 'bulk' || caseHidden('plan') ? null : planCard();
  return digest || planned ? h('div', {}, digest, planned, card) : card;
}

// saved at once (not debounced): a reload right after switching must come back in the same mode
function setMode(m) { draft.mode = m; saveDraft(); hooks.render(); }

// A picked or kept date lasts KEEP_MS from when it was set, even if the app stays open for days.
function curDate() {
  if (draft.date && !(Date.now() - (draft.dateAt || draft.keptAt || 0) < KEEP_MS)) { draft.date = null; saveDraft(); }
  return draft.date || todayISO();
}

// "Sat 10th" (toLocaleDateString is slow, and the date bar is redrawn after every save)
const WD = new Map();
const weekdayLabel = iso => {
  if (!WD.has(iso)) { const [Y, M, D] = iso.split('-').map(Number); WD.set(iso, new Date(Y, M - 1, D).toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' + nth(D)); }
  return WD.get(iso);
};
// One line, never wrapping: Today, then as many recent weekdays as fit ("Sat 10th", newest first), a
// calendar for any other day, and the Case | List switch. A chosen day that doesn't fit shows on the
// calendar chip instead.
function paintDate() {
  paintEnterHint();
  const d = curDate(), t = todayISO();
  const dateInput = h('input', {
    type: 'date', value: d, 'aria-label': 'Case date',
    onkeydown: e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ui.textarea?.focus(); } },
    onchange: e => { draft.date = parseDate(e.target.value) || null; draft.dateAt = Date.now(); saveDraft(); paintDate(); },
  });
  // the box keeps the focus it had (a tap while typing doesn't drop the keyboard); a tap from elsewhere doesn't
  // pop the keyboard up on a phone
  const pick = iso => () => { const had = document.activeElement === ui.textarea; draft.date = iso === t ? null : iso; draft.dateAt = Date.now(); saveDraft(); paintDate(); if (had) ui.textarea?.focus(); };
  const week = [];
  for (let k = 1; k <= 6; k++) { const x = new Date(); x.setDate(x.getDate() - k); week.push(todayISO(x)); }
  const wd = iso => weekdayLabel(iso);
  const calText = h('span', {});
  // the date input sits invisibly over the chip
  const picker = h('label', { class: 'chip datepick', title: 'Pick a date', 'aria-label': 'Pick a date' }, ic('calendar'), calText, dateInput);
  dateInput.addEventListener('click', () => { try { dateInput.showPicker(); } catch { /* not supported: native tap opens it */ } });
  const chips = week.map(iso => h('span', { class: `chip wk ${d === iso ? 'on' : ''}`, role: 'button', tabindex: '0', 'data-date': iso, onclick: pick(iso) }, wd(iso)));
  const mode = h('span', { class: 'seg mode-seg', role: 'group', 'aria-label': 'One case or a list' },
    h('button', { 'data-mode': 'one', 'aria-pressed': String(draft.mode !== 'bulk'), onclick: () => { if (draft.mode === 'bulk') setMode('one'); } }, 'Case'),
    h('button', { 'data-mode': 'bulk', 'aria-pressed': String(draft.mode === 'bulk'), title: 'Paste a list of cases', onclick: () => { if (draft.mode !== 'bulk') setMode('bulk'); } }, 'List'));
  fill(ui.datebar,
    h('span', { class: `chip ${d === t ? 'on' : ''}`, role: 'button', tabindex: '0', onclick: pick(t) }, 'Today'),
    ...chips, picker, h('span', { class: 'grow' }), mode);
  const fit = () => {
    const bar = ui && ui.datebar;
    if (!bar || !bar.isConnected) return;
    chips.forEach(c => { c.hidden = false; });
    for (let i = chips.length - 1; i >= 0 && bar.scrollWidth > bar.clientWidth + 1; i--) chips[i].hidden = true;
    const shownSel = d === t || chips.some(c => !c.hidden && c.dataset.date === d);
    picker.classList.toggle('on', !shownSel);
    calText.textContent = shownSel ? '' : fmtDate(d).replace(/ \d{4}$/, '');
    if (!shownSel) for (let i = chips.length - 1; i >= 0 && bar.scrollWidth > bar.clientWidth + 1; i--) chips[i].hidden = true;
  };
  requestAnimationFrame(fit);
  // one observer for the module, moved to the current date bar (ui is rebuilt on every render)
  if ('ResizeObserver' in window) {
    dateRO ||= new ResizeObserver(() => ui && ui.refit && ui.refit());
    if (dateRO.el !== ui.datebar) { dateRO.disconnect(); dateRO.observe(ui.datebar); dateRO.el = ui.datebar; }
  }
  ui.refit = fit;
}

// The empty box's example, one line per part, with the arrows lined up (padded to the box's own font).
const htmlHas = c => document.documentElement.classList.contains(c);
const placeholderRows = () => {
  const initials = firstField() !== 'initials', age = settings().detectAgeSex !== false;
  return [...(initials || age ? [[[initials ? 'AB' : '', age ? '72M' : ''].filter(Boolean).join(' '),
    [initials ? 'initials' : '', age ? 'age/sex' : ''].filter(Boolean).join(', ')]] : []),
    ['lap chole', 'procedure'], ['GA ETT', 'notes']];
};
function alignPlaceholder(ta) {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = getComputedStyle(ta).font;
    const w = t => ctx.measureText(t).width;
    const en = w('\u2002'), hair = w('\u200A') || 1;
    const rows = placeholderRows();
    const max = Math.max(...rows.map(([a]) => w(a))) + 2 * en;
    ta.placeholder = rows.map(([a, b]) => {
      let gap = max - w(a);
      const ens = Math.floor(gap / en); gap -= ens * en;
      return a + '\u2002'.repeat(ens) + '\u200A'.repeat(Math.round(gap / hair)) + '← ' + b;
    }).join('\n');
  } catch { /* keep the plain one */ }
}

// Enter key setting (Settings → Logging); enterSaves (true) was the older on/off for 'single'
const enterMode = () => { const m = settings().enterMode; return m === 'double' || m === 'single' ? m : settings().enterSaves ? 'single' : 'newline'; };
// the caret sits on an empty line after some text: a second Enter
const onEmptyLine = ta => { const before = ta.value.slice(0, ta.selectionStart); return ta.selectionStart === ta.selectionEnd && /\n[ \t]*$/.test(before) && before.trim() !== ''; };
// drop the empty line the first Enter made, then save
function saveFromEmptyLine(ta, another) {
  const at = ta.selectionStart, before = ta.value.slice(0, at).replace(/\n[ \t]*$/, ''), after = ta.value.slice(at);
  ta.value = before + after; draft.details = ta.value; saveDraft();
  save({ another });
}

function renderOne(card) {
  suggestedSave = null;
  if (onlyTemplate(draft.details)) draft.details = '';   // the template comes back when the box takes the focus
  const separateInitials = firstField() === 'initials';
  // (split only when coming from the combined box, not on every render of the separate one)
  if (separateInitials && !draft.initials && draft.sep !== 'initials') {
    const parts = draftParts(); draft.initials = parts.initials; draft.details = parts.details;
  } else if (!separateInitials && draft.initials) { draft.initialsHint = draft.initials; draft.details = draftText(); draft.initials = ''; }
  draft.sep = firstField();
  saveDraft();
  const initialsInput = separateInitials ? h('input', { 'aria-label': 'Patient initials', placeholder: 'AB (initials, optional)', maxlength: '20', enterkeyhint: 'next', autocomplete: 'off', autocapitalize: 'characters', value: draft.initials || '',
    oninput: e => { suggestedSave = null; draft.initials = cleanInitials(e.target.value); draft.initialsHint = ''; saveDraftSoon(); paintParsed(true); suggestSoon(); },
    onkeydown: e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ui.textarea.focus(); } } }) : null;
  const textarea = h('textarea', {
    class: 'details', rows: String(boxLines()), style: `min-height:calc(${boxLines()} * 1.4em + 22px)`, autofocus: firstField() === 'details' && wantFocus(), enterkeyhint: enterMode() === 'single' ? 'done' : 'enter', 'aria-label': 'Case summary',
    // Settings → Logging (this device): capitals, autocorrect, spelling underlines (html classes, applyLook)
    autocapitalize: htmlHas('box-caps-off') ? 'off' : 'sentences', autocorrect: htmlHas('box-correct') ? 'on' : 'off', spellcheck: htmlHas('box-spell-off') ? 'false' : 'true',
    placeholder: placeholderRows().map(([a, b]) => `${a}  ← ${b}`).join('\n'),
    value: draft.details,
    oninput: e => { suggestedSave = null; draft.details = e.target.value; saveDraftSoon(); suggestSoon(); paintParsed(true); fitBox(e.target); },
    // the browser's own corner handle (a mouse): the height it leaves is kept, as the grab bar's is
    onmousedown: e => { e.target._h0 = e.target.offsetHeight; },
    onmouseup: e => { const ta = e.target; if (ta._h0 && Math.abs(ta.offsetHeight - ta._h0) > 4) setDisplay({ boxHeight: ta.offsetHeight }); ta._h0 = 0; },
    // Settings → Advanced logging → Case template (off by default)
    onfocus: e => putTemplate(e.target), onblur: e => dropTemplate(e.target),
    // Settings → Logging → Enter key: 'newline' (default; Ctrl/Cmd+Enter saves), 'double' (Enter on an empty
    // line saves, so a case can still take several lines) or 'single' (Enter saves; Shift+Enter a new line)
    onkeydown: e => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.target._shiftAt = e.shiftKey ? Date.now() : 0;   // Shift+Enter is a new line in every mode (see onbeforeinput)
      if (e.repeat && suggestedSave && !e.shiftKey) { e.preventDefault(); return; }
      if (!e.shiftKey && applySuggestedSave()) { e.preventDefault(); return save({ another: e.altKey }); }
      const mode = enterMode();
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); return save({ another: e.altKey }); }
      if (e.shiftKey) return;
      if (mode === 'single') { e.preventDefault(); return save({ another: e.altKey }); }
      if (mode === 'double' && onEmptyLine(e.target)) { e.preventDefault(); saveFromEmptyLine(e.target, e.altKey); }
    },
    // phone keyboards that don't send a usable Enter keydown still send this
    onbeforeinput: e => {
      if (e.isComposing || !/^insert(LineBreak|Paragraph)$/.test(e.inputType) || Date.now() - (e.target._shiftAt || 0) < 1000) return;
      if (applySuggestedSave()) { e.preventDefault(); return save({}); }
      const mode = enterMode();
      if (mode === 'single') { e.preventDefault(); save({}); }
      else if (mode === 'double' && onEmptyLine(e.target)) { e.preventDefault(); saveFromEmptyLine(e.target, false); }
    },
  });
  const sugg = h('div', { class: 'chips sugg-row', 'aria-live': 'polite' });
  // empty the box in one tap (Undo puts it back); shown once there is text, where Paste was
  const clearBtn = h('button', { type: 'button', class: 'small clear-btn icon-only', title: 'Clear the case box', 'aria-label': 'Clear the case box', onclick: () => {
    const was = draft.details, rejected = [...(draft.rejected || [])];
    if (!was) return;
    draft.details = ''; textarea.value = ''; saveDraft(); paintSuggest(); paintParsed(false);
    textarea.focus({ preventScroll: true });
    if (document.activeElement === textarea) putTemplate(textarea);
    toast('Case box cleared', { action: 'Undo', onaction: () => { draft.details = was; draft.rejected = [...new Set([...(draft.rejected || []), ...rejected])]; if (ui.textarea) { ui.textarea.value = was; paintSuggest(); paintParsed(false); } saveDraft(); } });
  } }, ic('clear'));
  const selected = h('div', { class: 'chips selected' });
  const tip = h('div');
  const templates = h('div', { class: 'chips quick-rest' });
  const picker = catPicker({
    collapsed: !!display().compactTags,
    get: () => draft.cats,
    // the list stays put under your finger while the rows above it change
    toggle: code => keepPlace(picker.el, () => { setCats(toggleCat(draft.cats, code)); saveDraft(); paintSel(); }),
    getTags: () => draft.tags || [],
    toggleTag: key => keepPlace(picker.el, () => { Object.assign(draft, toggleTagIn(draft.cats, draft.tags, key)); saveDraft(); paintSel(); }),
    // Enter in the empty search saves in Basic (where the hint says so), and elsewhere only accepts a pending
    // offer ("press Enter again"); in other profiles a stray Enter there does nothing, as before
    onEmptyEnter: () => { if (basicMode() || offerPending()) save({}); },
  });
  const common = display().compactTags ? h('div', { class: 'chips common-tags', 'aria-label': 'Common tags' }) : null;
  const paintCommon = () => {
    if (!common) return;
    const counts = new Map();
    for (const c of S.cases.slice(0, 100)) for (const k of [...(c.cats || []).map(code => 'c:' + code), ...(c.tags || [])]) counts.set(k, (counts.get(k) || 0) + 1);
    const choices = logTags().filter(n => n.kind !== 'head' && !n.e.hide && counts.has(n.e.k)).sort((a,b) => counts.get(b.e.k) - counts.get(a.e.k)).slice(0, 6);
    fill(common, choices.length ? choices.map(n => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(n.kind === 'cat' ? draft.cats.includes(n.code) : (draft.tags || []).includes(n.e.k)), onclick: () => {
      if (n.kind === 'cat') setCats(toggleCat(draft.cats, n.code)); else Object.assign(draft, toggleTagIn(draft.cats, draft.tags, n.e.k));
      saveDraft(); paintSel(); paintCommon();
    } }, n.kind === 'cat' ? catShort(n.code) : n.e.n)) : h('span', { class: 'muted' }, 'Your common tags appear as you log cases.'));
  };
  paintCommon();
  // "Interesting": a star on the case (reflectTag), to find it again; the Reflections tab offers these first
  const tagBox = h('label', { class: 'check reflect-tag' }, h('input', { type: 'checkbox', checked: !!draft.reflectTag, onchange: e => { draft.reflectTag = e.target.checked; saveDraft(); } }), ic('star'), 'Interesting');
  ui.tagBox = tagBox;
  const draftNote = h('span', { class: 'draft-note', 'aria-live': 'polite' });
  // one quiet line under the box: the star on the left, the draft and sync state on the right, then a short
  // link to Recent changes / Recover drafts (its words say what needs doing when a save needs attention)
  const syncNote = h('a', { href: '#recovery', class: 'draft-note sync-note', title: 'Recover: drafts, deleted items and earlier versions', 'aria-live': 'polite' });
  const paintSync = () => { syncNote.textContent = writes.error() || (writes.attention() ? 'Save needs attention' : writes.pending() ? 'Pending sync' : writes.entries().length ? 'Synced' : 'Recover'); };
  const offSync = writes.onChange(() => { if (syncNote.isConnected) paintSync(); else offSync(); });
  paintSync();
  const tagRow = h('div', { class: 'tag-row' }, tagBox, draftNote, syncNote);
  const enterHint = h('p', { class: 'hint enter-suggestion-hint', 'aria-live': 'polite', hidden: true });
  // one wide Save; saving and keeping the date for the next case is the small text button beside it
  const actions = h('div', { class: 'actions' },
    h('button', { class: 'linkish keep-date', title: 'Save and keep this date for the next case', onclick: () => save({ another: true, tap: true }) }, 'Save, keep date'),
    h('button', { class: 'primary big', onclick: () => save({ tap: true }) }, 'Save', h('span', { class: 'kbd', title: 'Ctrl+Enter (Cmd+Enter on a Mac)' }, ' Ctrl+⏎')));

  // what the box was read as: the initials and the age/sex are marked inside the box itself (a copy of its text
  // behind it, transparent but for the marks; owner's Apple-apps review), and the line under it says only what the
  // age means ("6m = 6 years · male"), the one thing worth checking
  const parsed = h('div', { class: 'parsed', 'aria-live': 'polite' });
  // over the 2000 characters a case holds: said under the box (Save offers to move the rest into a note)
  const tooLong = h('p', { class: 'tip too-long', 'aria-live': 'polite', hidden: true });
  const boxMarks = h('div', { class: 'box-marks', 'aria-hidden': 'true' });
  textarea.addEventListener('scroll', () => { boxMarks.scrollTop = textarea.scrollTop; });
  // Only the selected categories and Save stay pinned: a slim bar at the end of the card that sticks
  // to the bottom (above the tab bar) the whole way down; the box itself scrolls away.
  const selExtra = h('div', { class: 'sel-extra' });
  // "Save as tag group" sits under the tag list, not in the pinned bar (keeps the bar slim)
  const groupSave = h('div', { class: 'group-save' });
  const savebar = h('div', { class: 'savebar' }, selected, selExtra, tip, enterHint, actions);
  // Two panes on wide screens (style.css .log-card.panes): the case, quick picks and Save on the left,
  // all tags on the right, scrolling on their own. On phones the wrappers vanish (display: contents).
  card.classList.add('panes');
  add(card,
    h('div', { class: 'lp-left' },
      initialsInput ? h('label', { class: 'field log-initials' }, 'Initials', initialsInput) : null,
      h('div', { class: 'box-wrap' }, boxMarks, textarea, pasteBtn(textarea), clearBtn), boxGrab(textarea), tooLong, parsed, tagRow,
      // suggestions first, then the last case and your own templates
      h('div', { class: 'chiplabel quick-label' }, 'Quick picks'), sugg, templates,
      // Settings → Notes → Show the daily note on the Add tab (off by default)
      settings().dayNoteOnCase ? dayNoteBox() : null),
    h('div', { class: 'lp-right' },
    h('div', { class: 'bar cat-head' }, h('div', { class: 'chiplabel grow' }, 'All tags'),
      h('span', { class: 'seg cat-view', role: 'group', 'aria-label': 'Show tags as' },
        ['list', 'pills'].map(v => h('button', { class: 'small', 'aria-pressed': String((settings().catView || 'list') === v), onclick: () => { if ((settings().catView || 'list') === v) return; patchLogbook({ settings: { catView: v } }); hooks.render(); } }, v === 'list' ? 'List' : 'Pills')))),
    common, picker.el,
    groupSave),
    caseHidden('still') ? null : stillNeeded(),
    savebar);
  // Native details keep the same fields and handlers; only the chosen layout adds wrappers.
  if (display().formLayout === 'sections') {
    card.classList.remove('panes');
    const left = card.querySelector('.lp-left'), right = card.querySelector('.lp-right');
    const first = h('details', { class: 'case-section', open: true }, h('summary', {}, 'Case details'), ui.datebar, left);
    const tags = h('details', { class: 'case-section' }, h('summary', {}, 'Tags'), right);
    card.insertBefore(first, card.firstChild);
    first.after(tags);
  }
  for (const [part] of CASE_PARTS) card.classList.toggle('hide-' + part, caseHidden(part));
  // Tapping a chip, a tag in the list or a button while typing keeps the focus (and the keyboard) in the
  // case box, so the screen doesn't jump as the keyboard drops and comes back. Fields and the date
  // picker still take the focus.
  card.addEventListener('mousedown', e => {
    if (document.activeElement !== textarea) return;
    const t = e.target;
    if (t.closest('input:not([type=checkbox]), textarea, select, .datepick, .box-wrap')) return;
    if (t.closest('.chip, .picker li, label.check, [role=button], button, a.btn')) e.preventDefault();
  });
  Object.assign(ui, { initials: initialsInput, draftNote, textarea, parsed, tooLong, boxMarks, sugg, selected, selExtra, groupSave, tip, enterHint, templates, picker, paintCommon });
  requestAnimationFrame(() => fitBox(textarea));   // the kept height, grown to the draft's text
  paintSuggest(); paintSel(); paintQuick(); paintParsed(false);
  watchMarks(textarea);
  requestAnimationFrame(() => alignPlaceholder(textarea));
  // autofocus attribute is ignored on re-render; focus after insertion (not on phones' first paint
  // when that would pop the keyboard over a fresh landing — it's what the user came to do, so do it)
  requestAnimationFrame(() => { if (wantFocus() && (document.activeElement === document.body || !document.activeElement || document.activeElement.closest('#tabs'))) focusLog(); });   // the tapped tab button keeps focus now the bar isn't rebuilt
}

const suggestSoon = debounce(() => { if (!saving) paintSuggest(); }, 120);

// "AB · 72M · lap chole, GA ETT" under the box; "Draft saved" (once typing pauses) sits at the end of
// the Interesting line
// Per key, only what changed is touched: rewriting the same words still makes the browser restyle the page.
const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
function paintParsed(typed) {
  if (!ui || !ui.parsed) return;
  const text = draftText();
  paintEnterHint();
  setText(ui.draftNote, draftError || (text ? 'Draft saved' : ''));
  if (!text) { if (ui.parsed.firstChild) fill(ui.parsed); ui.parsed.dataset.age = ''; ui.parsed.dataset.key = ''; if (ui.tooLong) ui.tooLong.hidden = true; marksSoon([]); return; }
  const { initials, details } = draftParts();
  const age = boxAge(details);
  // Labelled parts on: which parts the box has ("Parts Learning point · Plan"), so you see a label was read
  const lab = labels();
  const names = lab ? [...new Set(parseParts(details, lab).parts.filter(p => p.text.trim()).map(p => p.name.replace(/ \d+$/, '')))] : [];
  // the initials as they'll be saved, only when read from the box (not typed in their own field); in the colour of
  // their highlight in the box, as the age is (owner, 15 Oct 2026)
  const ini = initials && !draft.initials ? initials : '';
  const key = ini + '|' + age + '|' + (draft.noIni || '') + '|' + (draft.noAge || '') + '|' + names.join('|');
  if (ui.parsed.dataset.key !== key) {
    ui.parsed.dataset.key = key; ui.parsed.dataset.age = age;
    // each is a button: a tap keeps that text in the case instead (a tap on the struck line reads it again)
    const undo = (cls, what, label, flag, on) => h('button', { type: 'button', class: `pi ${cls}${on ? '' : ' undone'}`, 'aria-pressed': String(!on),
      title: on ? `Not ${label}: keep ${what} in the case text` : `Read ${what} as ${label} again`,
      onclick: () => { draft[flag] = on ? what : ''; saveDraft(); paintParsed(true); suggestSoon(); } },
      h('b', {}, what), on ? ` = ${label === 'the age' ? humanAge(what) : label}` : ` · not ${label} (tap to undo)`);
    const offIni = !ini && !draft.initials && draft.noIni && splitInitials(text).initials === draft.noIni ? draft.noIni : '';
    const rawAge = settings().detectAgeSex !== false ? splitAge(details).age : '', offAge = !age && rawAge && rawAge === draft.noAge ? rawAge : '';
    fill(ui.parsed, ini ? undo('pi-ini', ini, 'initials', 'noIni', true) : offIni ? undo('pi-ini', offIni, 'initials', 'noIni', false) : null,
      age ? undo('pi-age', age, 'the age', 'noAge', true) : offAge ? undo('pi-age', offAge, 'the age', 'noAge', false) : null,
      names.length ? h('span', { class: 'pi parts-read' }, h('small', {}, 'Parts '), names.join(' · ')) : null);
  }
  if (ui.tooLong) {
    const tpl = caseTemplate(), over = (tpl ? stripTemplate(details, tpl, labels()) : details).length - MAX_DETAILS;
    if (ui.tooLong.hidden !== !(over > 0)) ui.tooLong.hidden = !(over > 0);
    setText(ui.tooLong, over > 0 ? `${over} character${over === 1 ? '' : 's'} over the ${MAX_DETAILS} a case holds: Save offers to move the rest into a linked note.` : '');
  }
  // where they are in the box's own text (the initials only when they're in the box, not in their own field)
  const v = ui.textarea ? ui.textarea.value : '', lead = v.length - v.trimStart().length, marks = [];
  let at = lead;
  if (initials && !draft.initials && v.slice(lead, lead + initials.length).toUpperCase() === initials.toUpperCase()) { marks.push(['ini', lead, lead + initials.length]); at = lead + initials.length; }
  if (age) {
    const rem = v.slice(at), from = at + rem.length - rem.trimStart().length;
    const m = v.slice(from).match(/^[^\s,;:]+(?:\s?[mf](?![a-z]))?/i);
    if (m && m[0].replace(/\s+/g, '').toLowerCase() === age.toLowerCase()) marks.push(['age', from, from + m[0].length]);
  }
  // each label at the start of a line ("Plan:"), after the initials and age
  if (lab) {
    let i = 0;
    for (const line of v.split('\n')) {
      const hit = labelOf(line, lab);
      if (hit) {
        const head = line.slice(0, line.length - hit.rest.length), from = i + head.length - head.trimStart().length, to = i + head.trimEnd().length;
        if (to > from && from >= (marks.length ? marks[marks.length - 1][2] : 0)) marks.push(['lab', from, to]);
      }
      i += line.length + 1;
    }
  }
  // the BMI the suggestions read ("BMI 42": Bariatric from 40), wherever it is (log2 2); in order, none overlapping
  const bmi = settings().suggestions !== false ? bmiAt(v) : null;
  if (bmi && !marks.some(([, a, b]) => bmi.from < b && bmi.to > a)) { marks.push(['bmi', bmi.from, bmi.to]); marks.sort((x, y) => x[1] - y[1]); }
  marksSoon(marks);
}
// The marks are drawn just before the next frame: one paint for a burst of keys, and the box never shows
// out of step with its text.
let marksFrame = 0, marksNext = [];
function marksSoon(marks) {
  marksNext = marks;
  if (!marksFrame) marksFrame = requestAnimationFrame(() => { marksFrame = 0; paintMarks(marksNext); });
}
// Match the box exactly (it may be pinned, compact, bigger text, another font): copy what decides where text
// wraps. Reading the box's style forces a layout, so it is done when the box is drawn or changes size, not per key.
let marksRO = null;
function fitMarks() {
  const ta = ui && ui.textarea, el = ui && ui.boxMarks;
  if (!ta || !el || !ta.isConnected) return;
  const cs = getComputedStyle(ta);
  for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'tabSize']) el.style[k] = cs[k];
  Object.assign(el.style, { top: ta.offsetTop + 'px', left: ta.offsetLeft + 'px', width: ta.offsetWidth + 'px', height: ta.offsetHeight + 'px' });
  if (marksRO) el.dataset.fit = '1';   // without ResizeObserver, fitted on every paint as before
}
function watchMarks(ta) {
  if (!('ResizeObserver' in window)) return;
  marksRO ||= new ResizeObserver(() => fitMarks());
  marksRO.disconnect(); marksRO.observe(ta);
}
// the copy of the box's text behind it, with the marks; same font, padding and wrapping as the box
function paintMarks(marks) {
  const ta = ui && ui.textarea, el = ui && ui.boxMarks;
  if (!ta || !el) return;
  // no marks before or now: the hidden copy needn't follow the text
  if (!marks.length && el.hidden) return;
  if (!el.dataset.fit) fitMarks();
  el.hidden = !marks.length;
  const v = ta.value, end = marks.length ? marks[marks.length - 1][2] : 0;
  // the same marks over the same text (typing goes on after them): only the text after them changes
  const key = JSON.stringify(marks) + v.slice(0, end);
  if (el._key === key && el._tail && el._tail.isConnected) el._tail.data = v.slice(end);
  else {
    const parts = [];
    let i = 0;
    for (const [k, a, b] of marks) { parts.push(document.createTextNode(v.slice(i, a)), h('mark', { class: 'm-' + k }, v.slice(a, b))); i = b; }
    el._tail = document.createTextNode(v.slice(i)); el._key = key;
    fill(el, ...parts, el._tail, '\n');
  }
  el.scrollTop = ta.scrollTop;
}

// Suggestions, with your own shorthand for APMES tags (Tag editor) mixed in
// (learning points left out: forTags)
const suggest = (text, opts = {}) => suggestCodes(forTags(text), { detectAgeSex: settings().detectAgeSex !== false, ...opts, extra: apmesShorthand(tagSet()) });

function paintSuggest() {
  if (!ui || !ui.sugg) return;
  const on = settings().suggestions !== false;
  ui.sugg.hidden = !on;
  if (!on) return;
  const text = draft.details.trim();
  const found = text ? suggest(text, { limit: 8, ...(ageOff() ? { detectAgeSex: false } : {}) }) : [];
  if (settings().autoTick && applyAutoTick(found, text)) return paintSel();   // paintSel paints these again
  const list = found.filter(s => !draft.cats.includes(s.code));
  // your own tags whose shorthand you typed (choosing one ticks what it counts towards)
  const mine = text ? shorthandTags(tagSet(), forTags(text)).filter(k => !(draft.tags || []).includes(k)) : [];
  const mineChips = mine.map(k => tagChip(k, { on: false, onclick: () => { keepPlace(ui.sugg, () => { Object.assign(draft, toggleTagIn(draft.cats, draft.tags, k)); saveDraft(); paintSel(); }); refocus(); } }));
  const strong = confident(list);
  const all = strong.length > 1 ? h('span', { class: 'chip sugg strong all', role: 'button', tabindex: '0', title: 'Add all the confident suggestions',
    onclick: () => { keepPlace(ui.sugg, () => { draft.cats = sortCodes(withParents([...draft.cats, ...strong])); saveDraft(); paintSel(); }); refocus(); } }, '+ All ' + strong.length) : null;
  fill(ui.sugg, ...mineChips, all, ...(list.length || mine.length ? list.map(s => catChip(s.code, {
    cls: `sugg ${s.score >= STRONG ? 'strong' : ''}`,
    title: `${catFull(s.code)} — ${s.why === 'age' ? 'from the age' : s.why === 'bmi' ? 'from the BMI' : s.why === 'shorthand' ? 'from shorthand (Tag editor)' : 'from your words'}`,
    onclick: () => { keepPlace(ui.sugg, () => { draft.cats = addCat(draft.cats, s.code); saveDraft(); paintSel(); }); refocus(); },
  })) : [h('span', { class: 'muted help', style: 'font-size:calc(13px * var(--fs, 1))' }, text ? 'No suggestions: search below.' : 'Suggestions appear as you type.')]));
}

// Settings → Logging → Tick confident suggestions automatically (off by default): the confident
// suggestions are ticked as you type and follow the text; one you take off stays off for this case.
// true when the ticks changed
function applyAutoTick(found, text) {
  if (!text && (draft.rejected || []).length) draft.rejected = [];
  const next = autoTick({ cats: draft.cats, auto: draft.auto || [], rejected: draft.rejected || [] }, confident(found));
  if (next.cats === draft.cats) return false;
  Object.assign(draft, next);
  saveDraft();
  return true;
}

function paintSel() {
  suggestedSave = null;
  paintEnterHint();
  if (!ui || !ui.selected) return;
  ui.paintCommon?.();
  fill(ui.selected, ...(draft.cats.length
    ? draft.cats.map(code => catChip(code, { on: true, removable: true, cls: 'add', title: 'Remove ' + catFull(code),
      onclick: () => { setCats(dropCat(draft.cats, code)); saveDraft(); paintSel(); } }))
    : [h('span', { class: 'none' }, 'No tag yet: pick one above')]),
    ...looseTags(draft.cats, draft.tags).map(k => tagChip(k, { onclick: () => { draft.tags = draft.tags.filter(t => t !== k); saveDraft(); paintSel(); } })),
    // all the tags off in one tap (Undo puts them back)
    draft.cats.length + (draft.tags || []).length > 1 ? h('button', { type: 'button', class: 'small clear-tags', title: 'Clear all tags', 'aria-label': 'Clear all tags', onclick: () => {
      // (which were ticked automatically, and which turned down, come back too: auto-ticked ones keep following the text)
      const was = { cats: draft.cats, tags: draft.tags || [], auto: draft.auto, rejected: draft.rejected };
      setCats([]); draft.tags = []; saveDraft(); paintSel();
      toast('Tags cleared', { action: 'Undo', onaction: () => { Object.assign(draft, was); saveDraft(); paintSel(); } });
    } }, '× Clear') : null);
  fill(ui.groupSave,
    // a combination worth keeping: one tap to make it a template (no trip to Settings)
    draft.cats.length >= 2 && !((S.logbook && S.logbook.templates) || []).some(t => sortCodes(t.cats).join() === sortCodes(draft.cats).join())
      ? h('button', { type: 'button', class: 'small linkish', onclick: async () => (await import('./ui-settings.js').catch(() => { toast('That didn’t load. Check the connection, then reload.'); }))?.templateDialog({ id: uid(), name: '', cats: [...draft.cats], details: '' }, async out => {
        await patchLogbook({ templates: [...((S.logbook && S.logbook.templates) || []), out] });
        toast(`Tag group “${out.name}” saved`); paintQuick(); paintSel();
      }, 'Save as tag group') }, 'Save these tags as a tag group') : null);
  fill(ui.selExtra,
    // personal subcategories of the selected categories (Settings → My subcategories)
    subcatChips(draft.cats, draft.tags || [], tags => keepPlace(ui.selExtra, () => { draft.tags = tags; saveDraft(); paintSel(); })));
  // counting tips for the chosen tags ("blocks count cumulatively"); off in Settings → Logging
  const tips = settings().hideTips ? [] : draft.cats.filter(c => TIPS[c]).map(c => TIPS[c]);
  fill(ui.tip, ...tips.map(t => h('p', { class: 'tip' }, t)));
  paintSuggest();
  ui.picker.sync();
}



function applyTemplate(t) {
  draft.cats = sortCodes(withParents([...draft.cats, ...t.cats]));
  // a box holding only the case template counts as empty: the group's text goes on its empty first line, or above it
  const tplOnly = onlyTemplate(draft.details);
  if (t.details && (!draft.details.trim() || tplOnly)) {
    if (tplOnly) { const lines = draft.details.split('\n'); if (!lines[0].trim()) lines[0] = t.details; else lines.unshift(t.details); draft.details = lines.join('\n'); }
    else draft.details = t.details + ' ';
    ui.textarea.value = draft.details;
  }
  keepPlace(ui.templates, () => { saveDraft(); paintSel(); }); refocus();
}

// Same as last chips on the Add tab (settings.recentCount, 1 to 5)
export const RECENT_COUNTS = [[1, '1 (default)'], [2, '2'], [3, '3'], [5, '5']];
const recentCount = () => snapRecent(settings().recentCount);
const clip = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

function paintQuick() {
  if (!ui || !ui.templates) return;
  const chips = [];
  // recent cases: one tap fills the procedure (not the patient) and the categories; type the new
  // initials and age on the first line
  // how many (Settings → Advanced logging; one by default)
  // with Labelled parts on, only the main text: the last patient's ASA, findings and learning points stay with them
  const procOf = c => { const d = caseParts(c).details, L = labels(); return splitAge(L ? parseParts(d, L).main : d).rest.replace(/\s+/g, ' ').trim(); };
  const recent = recentCases(S.cases, recentCount(), c => procOf(c).toLowerCase() + '|' + sortCodes(c.cats).join()).map(c => ({ c, proc: procOf(c) }));
  recent.forEach(({ c, proc }, i) => chips.push(h('span', {
    class: 'chip tmpl recent', role: 'button', tabindex: '0', title: 'Same as last: ' + (proc || 'no details') + '\n' + c.cats.map(catFull).join('\n'), 'aria-label': 'Same as last: ' + (proc || 'no details'),
    onclick: () => {
      draft.cats = sortCodes(withParents(c.cats)); Object.assign(draft, FRESH_TICKS());
      // the procedure goes on line 2; a first line already typed (initials, age) stays
      // the case template's untouched lines stay, under the procedure
      const lines = (draft.details || '').split('\n'), tl = new Set(caseTemplate().split('\n').map(l => l.trim().toLowerCase()).filter(Boolean));
      const isTpl = l => tl.has(l.trim().toLowerCase());
      const first = isTpl(lines[0]) ? '' : lines[0], tail = lines.slice(isTpl(lines[0]) ? 0 : 1).filter(isTpl);
      draft.details = [first, ...(proc ? [proc] : []), ...tail].join('\n');
      draft.tags = [];
      // its date too, but only when it was logged in this sitting (not yesterday evening's list)
      if (i === 0 && c.date && Date.now() - (c.createdAt || 0) < KEEP_MS / 3) { draft.date = c.date === todayISO() ? null : c.date; draft.dateAt = Date.now(); }
      if (ui.textarea) { const end = draft.details.indexOf('\n'); ui.textarea.value = draft.details; ui.textarea.focus({ preventScroll: true }); ui.textarea.setSelectionRange(end < 0 ? draft.details.length : end, end < 0 ? draft.details.length : end); }
      keepPlace(ui.templates, () => { saveDraft(); paintDate(); paintSel(); paintParsed(false); });
    },
  }, ic('again'), h('span', {}, clip(proc || 'no details', 30)))));
  const seen = new Set();
  const tmplChip = (t, name) => {
    const key = sortCodes(t.cats).join(',');
    if (!t.cats || !t.cats.length || (!name && seen.has(key))) return null;
    seen.add(key);
    return h('span', { class: 'chip tmpl', role: 'button', tabindex: '0', title: t.cats.map(catFull).join('\n'), onclick: () => applyTemplate(t) },
      name ? h('b', {}, name) : null, h('span', { class: name ? 'muted' : '', style: name ? 'font-size:calc(12px * var(--fs, 1))' : '' }, (name ? ' ' : '') + catPills(t.cats)));
  };
  for (const t of (S.logbook && S.logbook.templates) || []) chips.push(tmplChip(t, t.name));
  fill(ui.templates, ...chips.filter(Boolean));
}

// The failed no-tag save is the first step; a second Save (the button, Enter in the box or Enter in the empty
// tag search) accepts these suggestions. Editing, selecting tags or leaving this screen cancels the offer.
function paintEnterHint() {
  if (!ui?.enterHint) return;
  const offer = suggestedSave;
  const hidden = !offer || offer.key !== suggestionKey() || !!draft.cats.length;
  if (ui.enterHint.hidden !== hidden) ui.enterHint.hidden = hidden;
  setText(ui.enterHint, hidden ? '' : 'Tap Save or press Enter again to add ' + [...offer.cats.map(catShort), ...offer.tags.map(tagName)].join(', ') + ' and save.');
}
const offerPending = () => !!suggestedSave && suggestedSave.key === suggestionKey() && !draft.cats.length;
// a tap this soon after a tap made the offer is a double tap, not a look at the hint: it neither saves nor
// accepts (an offer made by a key has no gap: at is 0)
const OFFER_GAP_MS = 600;
const offerTooNew = () => offerPending() && Date.now() - (suggestedSave.at || 0) < OFFER_GAP_MS;
function applySuggestedSave() {
  const offer = suggestedSave;
  suggestedSave = null; paintEnterHint();
  if (!offer || saving || settings().suggestions === false || draft.cats.length || offer.key !== suggestionKey()) return false;
  draft.cats = offer.cats;
  draft.tags = [...new Set([...(draft.tags || []), ...offer.tags])];
  saveDraft(); paintSel();
  return true;
}

async function save(opts) {
  if (saving) return;
  if (opts.tap && offerTooNew()) return;
  applySuggestedSave();   // a second Save takes the offered tags, the same as a second Enter
  saving = true;
  try { await saveCase(opts); } catch (err) { toast('Could not save: ' + err.message); } finally { saving = false; }
}

async function saveCase({ another, tap }) {
  // the case template's lines left as they were are dropped (a template with nothing added saves as no details)
  const tpl = caseTemplate(), box = tpl ? stripTemplate(draft.details, tpl, labels()) : draft.details;
  const details = [draft.initials, box].filter(Boolean).join(' ').trim();
  // a quick Save must not depend on the typing debounce (and nothing re-ticks while the save is under way)
  suggestSoon.cancel();
  if (settings().autoTick) paintSuggest();
  if (!draft.cats.length) {
    paintSuggest();
    const tags = settings().suggestions !== false && details ? shorthandTags(tagSet(), forTags(details)).filter(k => !(draft.tags || []).includes(k)) : [];
    // confident suggestions only (as "+ All" and a pasted list): a weak guess is never counted without a look
    const codes = settings().suggestions !== false && details ? confident(suggest(box.trim(), { limit: 8, ...(ageOff() ? { detectAgeSex: false } : {}) })) : [];
    const cats = sortCodes(withParents([...codes, ...tags.flatMap(tagLinks)]));
    suggestedSave = cats.length ? { key: suggestionKey(), cats, tags, at: tap ? Date.now() : 0 } : null;
    paintEnterHint();
    // categories are counted towards credentialling, so they must be picked on purpose
    // point at the suggestions (the focus stays put, so no keyboard pops up); with none shown, the search box
    const target = ui.sugg && !ui.sugg.hidden && !caseHidden('sugg') && ui.sugg.querySelector('.chip') ? ui.sugg : null;
    if (target) {
      toast(suggestedSave ? 'Tap Save or press Enter again to add the suggested tags, or tap a tag' : 'Tap at least one tag: suggestions are highlighted');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash');
    } else { toast(suggestedSave ? 'Tap Save or press Enter again to add the suggested tags, or search below' : 'Pick at least one tag: search below'); ui.picker.focus(); }
    return;
  }
  suggestedSave = null;
  if (!details && !(await confirmBox('No case details', 'Save this case without initials or details?', 'Save'))) return;
  if (!(await okNoIds(details))) return;
  // the same text on the same date is probably a double entry
  const norm = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const twin = (S.cases || []).find(x => x.date === curDate() && norm(caseText(x)) === norm(details));
  if (twin && !(await confirmBox('Possible duplicate', `You already logged “${caseText(twin).slice(0, 60)}” on ${fmtDate(twin.date)}. Save another one?`, 'Save anyway'))) return;
  const parts = firstField() === 'initials' || draft.initialsHint || draft.noIni ? draftParts(box) : splitInitials(details);
  // over the 2000 characters a case holds: the rest into a linked note (asked first), never cut off silently
  if (!(await splitLong([parts]))) return;
  const owner = S.user?.email, inputAtSave = JSON.stringify(draft);
  draft.caseId ||= uid(); draft.caseCreatedAt ||= Date.now(); saveDraft();
  const c = await createCase({ id: draft.caseId, createdAt: draft.caseCreatedAt, date: curDate(), initials: parts.initials, details: parts.details, cats: draft.cats, reflectTag: !!draft.reflectTag, tags: draft.tags || [] });
  const restList = [{ c, rest: parts.rest }], restMade = restNotes(restList);
  if (S.user?.email !== owner) return;
  const currentInput = { ...draft }; delete currentInput.caseId; delete currentInput.caseCreatedAt;
  const originalInput = JSON.parse(inputAtSave); delete originalInput.caseId; delete originalInput.caseCreatedAt;
  if (JSON.stringify(currentInput) !== JSON.stringify(originalInput)) { draft.caseId = null; draft.caseCreatedAt = null; saveDraft(); toast('Previous case saved. Your new input stays in the box.'); return; }
  const sticky = another || settings().defaultDate === 'last';
  const keep = sticky ? draft.date : null;
  const next = settings().afterSave;
  const keepTags = next === 'keepTags' ? { cats: draft.cats, tags: draft.tags || [] } : { cats: [], tags: [] };
  // Undo puts the case back with the ticks the user took off still off (auto-tick)
  const ticksAtSave = { auto: [...(draft.auto || [])], rejected: [...(draft.rejected || [])] };
  draft = { ...draft, details: '', initials: '', initialsHint: '', noIni: '', noAge: '', caseId: null, caseCreatedAt: null, ...keepTags, ...FRESH_TICKS(), date: keep, keepDate: sticky, keptAt: Date.now(), dateAt: Date.now(), reflectTag: false };
  if (ui.tagBox) ui.tagBox.querySelector('input').checked = false;
  saveDraft();
  if (ui.textarea) ui.textarea.value = '';
  if (ui.initials) ui.initials.value = '';
  // the emptied box loses the last case's marks and its "Parts …" line too (they stayed until the box was touched)
  paintDate(); paintSel(); paintQuick(); paintParsed(false);
  if (next === 'logbook') { hooks.showDay?.(c.date); location.hash = '#logbook'; }
  else if (next === 'closed') document.activeElement?.blur();
  else { focusLog(); if (ui.textarea && document.activeElement === ui.textarea) putTemplate(ui.textarea); }
  // say where it went and what it counted towards: "Saved Sat 10 Oct · 16 LSCS now 4/10"
  const prog = basicHides('saveToast') ? {} : PROGRESS_BY_CODE();   // (Profile → APMES)
  const withTarget = c.cats.map(code => prog[code]).find(p => p && p.next);
  const counted = withTarget ? ` · ${catName(withTarget.code)} now ${withTarget.count}/${withTarget.next.n}` : ` · ${catPills(c.cats)}`;
  toast(`Saved ${fmtDate(c.date)}${counted}${restSaid(restList)}`, {
    action: 'Undo',
    onaction: async () => {
      if (S.user?.email !== owner) return;
      binRest(restMade);   // the split-off rest goes too (the case comes back whole only as far as the box held it)
      const beforeUndo = JSON.stringify(draft);
      // put the case back in the box, unless the next one is already being typed: then it goes to the recycle bin
      // (tags kept for the next case by After Save don't count as the next one)
      if (typedText() || (draft.cats.length && JSON.stringify(draft.cats) !== JSON.stringify(c.cats))) { moveToBin('case', c).then(() => toast('Removed: it is in the Recycle bin (Settings). Your new case stays in the box'), err => toast('Could not delete: ' + err.message)); return; }
      try { await removeCase(c.id); } catch (err) { toast('Could not undo: ' + err.message); return; }
      if (S.user?.email !== owner) return;
      if (JSON.stringify(draft) !== beforeUndo) { toast('Case removed. Your new input stays in the box.'); return; }
      draft = { ...draft, initials: firstField() === 'initials' ? caseParts(c).initials : '', initialsHint: caseParts(c).initials, details: firstField() === 'initials' ? caseParts(c).details : caseText(c), cats: c.cats, tags: c.tags || [], ...ticksAtSave, reflectTag: !!c.reflectTag, date: c.date === todayISO() ? null : c.date };
      saveDraft();
      if (S.tab === 'log' && ui.textarea) { ui.textarea.value = draft.details; if (ui.initials) ui.initials.value = draft.initials; if (ui.tagBox) ui.tagBox.querySelector('input').checked = draft.reflectTag; paintDate(); paintSel(); paintQuick(); paintParsed(false); }
    },
  });
}

// Case list changed (live listener): refresh counts and quick picks without touching the textarea.
export function logCasesChanged() {
  ui?.paintCommon?.();
  if (!ui || !ui.card.isConnected) return;
  if (ui.picker) { ui.picker.refresh(); paintQuick(); }
}

// ---------- paste a list ----------

let bulkRows = null, bulkText = null;   // the rows of the last Review, and the text they were read from

function renderBulk(card) {
  const ta = h('textarea', {
    class: 'details', rows: '8', value: draft.bulk || '',
    placeholder: settings().detectAgeSex !== false ? 'Leave an empty line between cases. An optional date at the start, e.g.\n12/3 AB 5yo\ncircumcision, caudal\n\n13/3 CD 30F\nLSCS spinal\n\nEF 80F\nhemiarthroplasty' : 'Leave an empty line between cases. An optional date at the start, e.g.\n12/3 AB\ncircumcision, caudal\n\n13/3 CD\nLSCS spinal\n\nEF\nhemiarthroplasty',
    oninput: e => {
      draft.bulk = e.target.value; saveDraftSoon();
      // the list changed after Review: the rows on screen no longer match it, so they can't be saved as they are
      if (bulkRows && e.target.value !== bulkText) { bulkRows = null; fill(out, h('p', { class: 'tip' }, 'The list has changed: tap Review again.')); }
    },
  });
  ui.textarea = ta;
  if (listHeight()) ta.style.height = listHeight() + 'px';
  const out = h('div');
  add(card, 
    h('p', { class: 'hint help' }, 'Paste your notes or OT list with an empty line between cases (a case can take several lines; a bold first line, **like this**, starts a case too). Tags are guessed for each case. Cases without a date at the start get ', h('b', {}, fmtDate(curDate())), ' (change it above).'),
    ta, boxGrab(ta, true),
    h('div', { class: 'bar', style: 'margin-top:8px' },
      h('button', { class: 'primary', onclick: () => { bulkRows = reviewRows(ta.value); bulkText = ta.value; paintBulk(out); } }, 'Review'),
      pasteBtn(ta, 'Paste from clipboard'),
      h('button', { onclick: () => { ta.value = ''; draft.bulk = ''; bulkRows = null; saveDraft(); fill(out); } }, 'Clear')),
    out);
  if (bulkRows) paintBulk(out);
}

// A pasted list read into rows: the confident suggestions ticked only with Settings → Logging → "Tick confident
// suggestions automatically" (as a single case; owner, 15 Oct 2026), else offered as chips with "Tick all
// suggestions"; and your own tags whose shorthand a row uses (Tag editor) with what they count towards.
function reviewRows(text) {
  const on = settings().suggestions !== false;
  return parseBulk(text, on && settings().autoTick ? t => suggest(t) : null, undefined, { labels: labels(), format: cleanListFormat(settings().listFormat) }).map(r => {
    const tags = on && r.details ? shorthandTags(tagSet(), forTags(r.details)) : [];
    return { ...r, tags, cats: tags.length ? sortCodes(withParents([...r.cats, ...tags.flatMap(tagLinks)])) : r.cats };
  });
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
      class: 'chip tmpl same', role: 'button', tabindex: '0', title: 'Add the tags of the case above: ' + above.map(catFull).join(', '),
      onclick: () => { r.cats = sortCodes(withParents([...r.cats, ...above])); paintBulk(out); },
    }, 'Same as above: ', h('b', {}, catPills(above))) : null;
    const sugg = on && r.details.trim() ? suggest(r.details, { limit: 4 }).filter(s => !r.cats.includes(s.code)) : [];
    // longer than a case holds: said here, and Save all offers to move the rest into a linked note
    const long = h('p', { class: 'tip too-long', 'aria-live': 'polite' });
    const paintLong = () => { const over = r.details.trim().length - MAX_DETAILS; long.hidden = over <= 0; long.textContent = over > 0 ? `${over} character${over === 1 ? '' : 's'} over the ${MAX_DETAILS} a case holds: the rest goes into a linked note when you save.` : ''; };
    paintLong();
    return h('tr', {},
      h('td', {}, h('input', { type: 'date', value: r.date || def, 'aria-label': 'Case date', onchange: e => { r.date = parseDate(e.target.value); } })),
      h('td', { class: 'details' },
        h('input', { value: r.initials || '', placeholder: 'Initials', 'aria-label': 'Patient initials', autocapitalize: 'characters', maxlength: '20', oninput: e => { r.initials = e.target.value; } }),
        h('textarea', { rows: String(Math.min(6, Math.max(2, r.details.split('\n').length))), value: r.details, 'aria-label': 'Case summary', oninput: e => { r.details = e.target.value; paintLong(); } }),
        long),
      h('td', {}, h('div', { class: 'chips' },
        r.cats.map(code => catChip(code, { on: true, removable: true, onclick: () => { r.cats = dropCat(r.cats, code); paintBulk(out); } })),
        (r.tags || []).map(k => tagChip(k, { onclick: () => { r.tags = r.tags.filter(t => t !== k); paintBulk(out); } })),
        h('button', { class: 'small icon-btn', 'aria-label': 'Add tags', onclick: () => pickDialog(r.cats, cats => { r.cats = cats; paintBulk(out); }) }, r.cats.length ? '+' : '+ Add')),
        same || sugg.length ? h('div', { class: 'chips', style: 'margin-top:4px' }, same,
          sugg.map(s => catChip(s.code, { cls: `sugg ${s.score >= STRONG ? 'strong' : ''}`, title: 'Suggested: ' + catFull(s.code), onclick: () => { r.cats = addCat(r.cats, s.code); paintBulk(out); } }))) : null),
      h('td', {}, h('button', { class: 'small danger icon-btn', title: 'Drop this case', 'aria-label': 'Drop this case', onclick: () => { bulkRows.splice(i, 1); paintBulk(out); } }, '×')));
  }));
  // the confident suggestions of every row, ticked in one tap (the bold chips)
  const strong = r => (on && r.details.trim() ? suggest(r.details).filter(s => s.score >= STRONG && !r.cats.includes(s.code)).map(s => s.code) : []);
  const anyStrong = bulkRows.some(r => strong(r).length);
  // the count and Tick all on one line, so the rows start high on a phone
  fill(out, 
    h('div', { class: 'bar', style: 'margin:0 0 6px;align-items:center' }, h('h3', { style: 'margin:0' }, `${bulkRows.length} case${bulkRows.length === 1 ? '' : 's'}`), h('span', { style: 'flex:1' }),
      anyStrong ? h('button', { class: 'small', title: 'The confident suggestions (in bold) on every case', onclick: () => {
        for (const r of bulkRows) { const add = strong(r); if (add.length) r.cats = sortCodes(withParents([...r.cats, ...add])); }
        paintBulk(out);
      } }, 'Tick all suggestions') : null),
    missing ? h('p', { class: 'tip' }, `${missing} case${missing === 1 ? ' has' : 's have'} no tag yet.`) : null,
    h('div', { class: 'scroll' }, h('table', { class: 'bulk' }, h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Details'), h('th', {}, 'Tags'), h('th', {}))), tbody)),
    h('div', { class: 'actions' }, h('button', { class: 'primary big', onclick: saveBulk }, `Save all ${bulkRows.length}`),
      h('button', { class: 'big', title: 'Keep these as a plan and confirm each one after the list', onclick: planBulk }, 'Plan for later…')));
}

let bulkBusy = false;
// your tags on a pasted row or planned case, as a case keeps them (none: no tags field at all)
const withTags = r => { const tags = keepTags(r.tags, r.cats); return tags.length ? { tags } : {}; };

// ---------- planned cases (logbook.plan): paste tomorrow's list now, confirm each case after ----------

const plan = () => (S.logbook && Array.isArray(S.logbook.plan) ? S.logbook.plan : []);
const savePlan = list => patchLogbook({ plan: list });
const isoPlus = n => { const d = new Date(); d.setDate(d.getDate() + n); return todayISO(d); };
// the next Monday-to-Friday after today (public holidays aren't known)
function nextWorkingDay() { for (let n = 1; n < 8; n++) { const d = new Date(); d.setDate(d.getDate() + n); if (d.getDay() % 6) return todayISO(d); } return isoPlus(1); }

async function planBulk() {
  if (!bulkRows || !bulkRows.length) return;
  const rows = bulkRows.filter(r => r.details.trim() || String(r.initials || '').trim() || r.cats.length);
  // a planned case can't carry a note yet: the long ones are shortened first, or saved now
  if (rows.some(r => r.details.trim().length > MAX_DETAILS)) return toast(`A case is over the ${MAX_DETAILS}-character limit: shorten it, or Save all now (the rest goes into a note)`);
  if (!(await okNoIds(...rows.map(r => r.details)))) return;
  const put = async date => {
    const items = rows.map(r => ({ id: uid(), date, initials: cleanInitials(r.initials), details: r.details.trim(), cats: sortCodes(r.cats), ...withTags(r) }));
    await savePlan([...plan(), ...items].slice(-100));
    bulkRows = null; if (draft.bulk === bulkText) draft.bulk = ''; saveDraft();
    toast(`Planned ${items.length} case${items.length === 1 ? '' : 's'} for ${fmtDate(date)}: confirm them on the Add tab that day`);
    m.close(); hooks.render();
  };
  const t = isoPlus(1), w = nextWorkingDay();
  const pick = h('input', { type: 'date', min: todayISO(), value: t, 'aria-label': 'Plan for date' });
  const m = modal('Plan for later', [
    h('p', { class: 'hint' }, `${rows.length} case${rows.length === 1 ? '' : 's'}. On that day they wait on the Add tab: tick each one when it is done.`),
    h('div', { class: 'bar' },
      h('button', { class: 'primary', onclick: () => put(t) }, `Tomorrow (${fmtDate(t).replace(/ \d{4}$/, '')})`),
      w !== t ? h('button', { onclick: () => put(w) }, `Next working day (${fmtDate(w).replace(/ \d{4}$/, '')})`) : null),
    h('div', { class: 'bar' }, h('label', { class: 'field', style: 'margin:0' }, 'Or another day', pick), h('button', { onclick: () => pick.value && put(pick.value) }, 'Plan')),
    h('div', { class: 'bar', style: 'margin-top:8px' }, h('span', { class: 'grow' }), h('button', { onclick: () => m.close() }, 'Cancel')),
  ]);
}

// The Log screen's "Planned" card: today's (and overdue) planned cases, each confirmed with one tap.
function planCard() {
  const today = todayISO();
  const due = plan().filter(p => p.date <= today);
  const later = plan().filter(p => p.date > today);
  if (!due.length && !later.length) return null;
  const done = async (items, opts = {}) => {
    const now = Date.now();
    const cases = items.map((p, i) => ({ id: uid(), date: p.date, initials: p.initials || '', details: p.details || '', cats: sortCodes(p.cats || []), ...withTags(p), createdAt: now + i, updatedAt: now + i, source: 'paste' }));
    if (cases.some(c => !c.cats.length) && !opts.quiet && !(await confirmBox('No tag', 'Some of these have no tag yet. Log them anyway?', 'Log'))) return;
    await saveMany(cases, { sheet: true });
    const gone = new Set(items.map(p => p.id));
    await savePlan(plan().filter(p => !gone.has(p.id)));
    toast(`Logged ${cases.length} case${cases.length === 1 ? '' : 's'}`, { action: 'Undo', onaction: async () => { await deleteMany(cases.map(c => c.id)); await savePlan([...plan(), ...items]); hooks.render(); } });
    hooks.render();
  };
  const edit = async p => {
    // don't throw away a case being typed
    if ((typedText() || draft.cats.length) && !(await confirmBox('Replace what you’re typing?', 'The case in the box is replaced by the planned one.', 'Replace', true))) return;
    draft = { ...draft, mode: 'one', sep: '', initials: '', initialsHint: p.initials || '', details: [p.initials, p.details].filter(Boolean).join(' '), cats: [...(p.cats || [])], tags: [...(p.tags || [])], ...FRESH_TICKS(), reflectTag: false, date: p.date === today ? null : p.date, dateAt: Date.now() };
    saveDraft();
    await savePlan(plan().filter(x => x.id !== p.id));
    hooks.render();
  };
  const drop = async p => { await savePlan(plan().filter(x => x.id !== p.id)); toast('Removed from the plan', { action: 'Undo', onaction: async () => { await savePlan([...plan(), p]); hooks.render(); } }); hooks.render(); };
  return h('section', { class: 'card plan' },
    h('div', { class: 'bar', style: 'margin:0 0 4px' }, h('h3', { style: 'margin:0' }, due.length ? `Planned (${due.length})` : 'Planned'), h('span', { class: 'grow' }),
      due.length > 1 ? h('button', { class: 'small primary', onclick: () => done(due) }, `✓ All ${due.length} done`) : null),
    due.length ? h('ul', { class: 'plan-list' }, due.map(p => h('li', {},
      h('span', { class: 'pt' }, p.date < today ? h('small', {}, fmtDate(p.date).replace(/ \d{4}$/, '') + ' · ') : null, p.initials ? h('b', {}, p.initials + ' ') : null, String(p.details || '').split('\n').join(' · '),
        h('small', { class: 'muted' }, ' ' + (p.cats && p.cats.length ? catPills(p.cats) : 'no tag'))),
      h('span', { class: 'row' },
        h('button', { class: 'small primary', 'aria-label': 'Done: log this case', onclick: () => done([p]) }, '✓ Done'),
        h('button', { class: 'small', 'aria-label': 'Edit before logging', onclick: () => edit(p) }, 'Edit'),
        h('button', { class: 'small danger icon-btn', 'aria-label': 'Remove from the plan', onclick: () => drop(p) }, '×'))))) : null,
    later.length ? h('p', { class: 'hint', style: 'margin:6px 0 0' }, [...new Set(later.map(p => p.date))].sort().map(d => `${later.filter(p => p.date === d).length} planned for ${fmtDate(d).replace(/ \d{4}$/, '')}`).join(' · ')) : null);
}
async function saveBulk(e) {
  if (bulkBusy || !bulkRows) return;
  const btn = e && e.currentTarget;
  const def = curDate();
  // copies: a long case is shortened for saving, and the list stays as it was if the save fails
  const rows = bulkRows.filter(r => r.details.trim() || String(r.initials || '').trim() || r.cats.length).map(r => ({ ...r, details: r.details.trim() }));
  if (!(await okNoIds(...rows.map(r => r.details)))) return;
  if (rows.some(r => !r.cats.length) && !(await confirmBox('Some cases have no tag', 'Save them anyway? They will not count towards any target until you add one.', 'Save all'))) return;
  if (!(await splitLong(rows)) || !bulkRows) return;
  const now = Date.now();
  const cases = rows.map((r, i) => ({ id: uid(), date: r.date || def, initials: cleanInitials(r.initials), details: r.details.trim(), cats: sortCodes(r.cats), ...withTags(r), createdAt: now + i, updatedAt: now + i, source: 'paste' }));
  // clear the list first: offline the save can take a few seconds, and a second tap must not repeat it
  bulkBusy = true;
  if (btn) btn.disabled = true;
  const keep = bulkRows;
  bulkRows = null;
  try {
    await saveMany(cases, { sheet: true });
    const restList = cases.map((c, i) => ({ c, rest: rows[i].rest })), restMade = restNotes(restList);
    if (draft.bulk === bulkText) draft.bulk = ''; saveDraft();   // (text added since Review stays in the box)
    toast(`Saved ${cases.length} cases${restSaid(restList)}`, { action: 'Undo', onaction: () => { binRest(restMade); return deleteMany(cases.map(c => c.id)).catch(err => toast('Could not undo: ' + err.message)); } });
  } catch (err) { bulkRows = keep; toast('Could not save: ' + err.message); }
  bulkBusy = false;
  hooks.render();
}

// ---------- dialogs ----------

// Pick categories in a sheet; done(cats) on close.
export function pickDialog(initial, done) {
  let cats = [...initial];
  const sel = h('div', { class: 'chips selected' });
  const paint = () => fill(sel, ...(cats.length ? cats.map(code => catChip(code, { on: true, removable: true, onclick: () => { cats = dropCat(cats, code); paint(); picker.sync(); } })) : [h('span', { class: 'none' }, 'None selected')]));
  const picker = catPicker({ get: () => cats, toggle: code => { cats = toggleCat(cats, code); paint(); } });
  paint();
  const m = modal('Tags', [sel, h('div', { style: 'height:8px' }), picker.el,
    h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { class: 'grow' }), h('button', { class: 'primary', onclick: () => m.close() }, 'Done'))],
  { onclose: state => { if (!state?.accountChanged) done(sortCodes(cats)); } });
  picker.focus();
}

// Edit (or delete) one case. With opts.onCreated and a case with no id: a new case (from the
// Reflections case picker), saved with createCase and handed back.
export function editCaseDialog(c, opts = {}) {
  const isNew = !c.id && typeof opts.onCreated === 'function';
  // older cases keep the initials at the front of the details: split them now, saved apart on Save
  let base = JSON.parse(JSON.stringify(c)), created = false;
  const e = { ...c, ...caseParts(c), ...(opts.draft || {}), cats: [...(opts.draft?.cats || c.cats || [])] };
  const initial = JSON.stringify(e), ownerKey = (cloud.demo ? 'demo:' : '') + S.user.email;
  const editDraft = createDraftSlot('logbook-edit-draft', ownerKey + ':' + uid());
  const draftStatus = h('p', { class: 'hint', 'aria-live': 'polite' });
  const saveEditDraft = () => {
    if ((cloud.demo ? 'demo:' : '') + (S.user?.email || '') !== ownerKey) return;
    if (JSON.stringify(e) === initial) return;
    try { editDraft.save({ record: e, base, isNew, savedAt: Date.now() }); draftStatus.textContent = 'Edit draft saved on this device · in Recover'; }
    catch { draftStatus.textContent = 'Edit draft not saved · storage unavailable'; }
  };
  const sel = h('div', { class: 'chips selected' });
  const paint = () => {
    saveEditDraft();
    fill(sel, ...(e.cats.length ? e.cats.map(code => catChip(code, { on: true, removable: true, onclick: () => { e.cats = dropCat(e.cats, code); paint(); picker.sync(); } })) : [h('span', { class: 'none' }, 'No tags')]),
      ...looseTags(e.cats, e.tags).map(k => tagChip(k, { onclick: () => { e.tags = e.tags.filter(t => t !== k); paint(); picker.sync(); } })),
      subcatChips(e.cats, e.tags || [], tags => { e.tags = tags; paint(); }));
  };
  const picker = catPicker({ get: () => e.cats, toggle: code => { e.cats = toggleCat(e.cats, code); paint(); },
    getTags: () => e.tags || [], toggleTag: key => { Object.assign(e, toggleTagIn(e.cats, e.tags, key)); paint(); } });
  paint();
  // the full list opens from the Add tags button
  const pickWrap = h('div', { hidden: true, style: 'margin-top:8px' }, picker.el);
  const addBtn = h('button', { type: 'button', class: 'small', style: 'margin-top:8px', 'aria-expanded': 'false', onclick: () => {
    pickWrap.hidden = !pickWrap.hidden; addBtn.setAttribute('aria-expanded', String(!pickWrap.hidden));
    addBtn.textContent = pickWrap.hidden ? '+ Add tags' : 'Done adding tags';
    if (!pickWrap.hidden) picker.focus({ preventScroll: true });
  } }, '+ Add tags');
  // at least 6 lines, growing with the text
  const grow = ta => { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight + 2, 0) + 'px'; };
  const detailsBox = h('textarea', { rows: '6', class: 'grow-box', value: e.details, placeholder: isNew ? 'e.g. 72M lap chole GA ETT, difficult airway' : '',
    oninput: ev => { e.details = ev.target.value; saveEditDraft(); grow(ev.target); } });
  requestAnimationFrame(() => grow(detailsBox));
  // links to what hangs off this case: its reflection and its notes (a draft of unsaved edits stays on this device)
  const evalHref = () => evalRequestUrl({ date: e.date, initials: e.initials }, { today: todayISO(), demo: cloud.demo, base: evalsBase(location.href) });
  const freshEval = ev => { ev.currentTarget.href = evalHref(); };
  const linksBlock = () => {
    const refl = (S.reflections || []).some(r => r.caseId === c.id), notes = caseHasNotes(c.id);
    return h('div', { class: 'case-links' }, h('div', { class: 'chiplabel' }, 'Linked'),
      h('div', { class: 'bar' },
        basicHides('reflect') ? null : h('button', { type: 'button', class: 'small', onclick: async () => { await m.close(); (await import('./ui-reflect.js')).reflectOnCase(c); } },
          refl ? 'Open the reflection' : 'Write a reflection'),
        h('button', { type: 'button', class: 'small', onclick: async () => { await m.close(); openNotes({ caseId: c.id, create: !notes }); } },
          notes ? 'Open the notes' : 'Write a note'),
        // APMES → Request an evaluation (off by default): the date and initials as they stand in this dialog (only
        // those), read again as the link is used, so a correction made before Save goes with it
        shows('evalRequest') ? h('a', { class: 'btn small eval-req', href: evalHref(), target: '_blank', rel: 'noopener', onpointerdown: freshEval, onfocus: freshEval, onclick: freshEval, oncontextmenu: freshEval }, 'Request an evaluation') : null));
  };
  const m = modal(isNew ? 'New case' : 'Edit case', [
    c.dateText && !c.date ? h('p', { class: 'tip' }, `Imported date “${c.dateText}” could not be read — please set the date.`) : null,
    h('label', { class: 'field' }, 'Date', h('input', { type: 'date', value: e.date || '', onchange: ev => { e.date = parseDate(ev.target.value); saveEditDraft(); } })),
    h('label', { class: 'field' }, 'Patient initials', h('input', { value: e.initials, placeholder: 'e.g. AB', maxlength: '20', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', oninput: ev => { e.initials = ev.target.value; saveEditDraft(); } })),
    h('label', { class: 'field' }, 'Case summary', detailsBox),
    h('div', { class: 'chiplabel' }, 'Tags'), sel, addBtn, pickWrap,
    isNew ? null : linksBlock(),
    basicHides('reflect') ? null : h('label', { class: 'check reflect-tag', style: 'margin-top:8px' }, h('input', { type: 'checkbox', checked: !!e.reflectTag, onchange: ev => { e.reflectTag = ev.target.checked; saveEditDraft(); } }), ic('star'), 'Interesting'),
    draftStatus,
    // Delete / Cancel / Save stay pinned to the bottom while the form scrolls
    h('div', { class: 'bar dlg-actions' },
      isNew ? null : h('button', { class: 'danger', onclick: async () => {
        m.close();
        // recycle bin (bin agent): kept 30 days; Undo restores it
        try { await moveToBin('case', c, { toast: true }); } catch (err) { toast('Could not delete: ' + err.message); }
      } }, 'Delete'),
      h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'primary', onclick: async ev => {
        const button = ev.currentTarget, owner = S.user?.email;
        if (!(await okNoIds(e.details)) || S.user?.email !== owner) return;
        button.disabled = true;
        try {
        if (isNew && !created) {
          if (!e.details.trim() && !e.cats.length) return toast('Add a case summary or a tag');
          const long = { details: String(e.details || '').trim() };
          if (!(await splitLong([long]))) return;
          e.id ||= uid(); e.createdAt ||= Date.now();
          const inputAtSave = JSON.stringify(e);
          const made = await createCase({ id: e.id, createdAt: e.createdAt, date: e.date || todayISO(), initials: e.initials, details: long.details, cats: e.cats, reflectTag: !!e.reflectTag, tags: e.tags || [] });
          const restList = [{ c: made, rest: long.rest }];
          restNotes(restList);
          base = made; created = true; saveEditDraft();
          if (S.user?.email !== owner || JSON.stringify(e) !== inputAtSave) return toast('Case saved. Newer edits remain open.');
          editDraft.clear(); await m.close(); if (S.user?.email !== owner) return; toast('Case logged' + restSaid(restList));
          return opts.onCreated(made);
        }
        const next = { ...e, initials: cleanInitials(e.initials), details: e.details.trim() };
        // over the 2000 characters a case holds: the rest into a linked note (asked first)
        const long = { details: next.details };
        if (!(await splitLong([long]))) return;
        next.details = long.details;
        if (!next.reflectTag) delete next.reflectTag;
        // a tag that sits under a category goes when that category is taken off; other tags stay
        next.tags = keepTags(next.tags, next.cats);
        if (!next.tags.length) delete next.tags;
        const inputAtSave = JSON.stringify(e);
        const saved = await updateCase(next, { base });
        const restList = [{ c: saved, rest: long.rest }], restMade = restNotes(restList);
        base = saved; saveEditDraft();
        if (S.user?.email !== owner || JSON.stringify(e) !== inputAtSave) return toast('Case saved. Newer edits remain open.');
        editDraft.clear(); await m.close();
        if (S.user?.email !== owner) return;
        if (isNew) { toast('Case logged' + restSaid(restList)); return opts.onCreated(saved); }
        toast('Case updated' + restSaid(restList), { action: 'Undo', onaction: () => { if (S.user?.email === owner) { binRest(restMade); return restoreCase(c, saved).catch(err => toast(err.message)); } } });
        } catch (err) { toast('Could not save: ' + err.message); } finally { button.disabled = false; }
      } }, 'Save')),
  ], { cls: 'full', sticky: true });
  return m;
}
