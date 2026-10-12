// Shared UI state and helpers for the logbook screens (ui-*.js). app.js owns boot, auth and tabs.

import { BY_CODE, CATEGORIES, DEFAULT_NAMES, yearName, appYear } from './categories.js';
import { tagSetOf, tagTree, flatTree, userCatNames, tagName as tagNameIn, tagLinks as tagLinksIn } from './tags.js';
import { countCases, uid, todayISO, sortCodes, progress, rYearDefault, academicYear, splitInitials, cleanInitials } from './engine.js';
import * as cloud from './cloud.js';
import { reflectionCounts } from './reflections.js';
import { writes } from './writes.js';
import { transients } from './transients.js';

export { cloud, writes, transients };

// ---------- state ----------

export const S = {
  user: null,          // { email, name, uid }
  admin: false,
  owner: false,        // the app owner (owners/{email}, set in the console): may read logbooks and import cases
  pd: false,           // a programme director (pds/{email}): can see Totals
  resident: null,      // residents/{rid} doc when the user is on the programme list
  logbook: null,       // logbooks/{email} doc
  cases: [],           // newest first
  reflections: [],     // logbooks/{email}/reflections (ui-reflect.js keeps it live)
  notes: null,         // logbooks/{email}/notes once something needs them (ui-notepad.js); null = not loaded
  noteIndex: null,     // logbooks/{email}/meta/noteIndex: which days and cases have notes (ui-notepad.js)
  counts: {},
  casesLoaded: false,
  casesSynced: false,  // a snapshot has come from the server (not only the offline cache)
  sharedTemplates: [],
  tab: 'log',
};

// Set by app.js: re-render the current screen, or tell it the case list changed.
export const hooks = { render() {}, casesChanged() {} };

export const settings = () => ({ suggestions: true, rYear: 1, ...(S.logbook && S.logbook.settings) });
// Profiles (settings.mode, the whole account; at the top of Settings → Profiles or hide items). Basic is the default
// for everyone (owner, 12 Oct 2026): a simpler app, the same tabs and buttons in the same places without the extras
// (the optional Case tab parts, the Logbook grid, Analytics trends and forecasts, reflection figures and references),
// and Analytics in More. Basic: logbook only is Basic without reflections, for residents who submit theirs separately
// (Reflections in More, for ones already written; no Reflect buttons or ☆ Interesting). Advanced hides nothing.
// Profiles hide interface items only, never settings, and each item can be turned back on (BASIC_ITEMS).
// Faculty / PCs (faculty, PDs and admins, who include the programme coordinators; their default, outside the demo):
// residents' case logs first (Case logs: counts per tag from the summaries, never case details), then programme
// analytics, then More; their own Case, Logbook, Reflections and Notes tabs start in More.
export const PROFILES = [
  // simplest first: logbook only hides the most
  ['logbook', 'Basic: logbook only', 'Basic without reflections, if you submit your reflections separately. Reflections you already wrote stay in More.'],
  ['basic', 'Basic', 'A simpler app (the default): the same tabs and buttons without the extras. Analytics is in More.'],
  ['advanced', 'Advanced', 'Everything: quick picks, the Logbook grid, Analytics trends and forecasts, reflection figures and references.'],
  ['faculty', 'Faculty / PCs', 'For faculty, PDs and programme coordinators: residents’ case logs first, then programme analytics, then More.'],
];
// may use Faculty / PCs: admins (PCs), PDs and active faculty (the rules let them read the counts summaries)
export const facultyRole = () => !!(S.admin || S.pd || S.faculty);
export const profile = () => {
  const m = settings().mode;
  if (m === 'advanced' || m === 'logbook' || m === 'basic') return m;
  if (m === 'faculty') return facultyRole() ? 'faculty' : 'basic';
  return facultyRole() && !cloud.demo ? 'faculty' : 'basic';
};
export const facultyMode = () => profile() === 'faculty';
export const basicMode = () => profile() === 'basic' || profile() === 'logbook';
export const logbookOnly = () => profile() === 'logbook';
// What a Basic profile hides is interface only (never a setting), and each can be turned back on (Profiles or hide
// items; settings.basicOn lists them), so all on is Advanced again. Case tab parts are 'case:<part>'. 'reflect'
// (Reflect buttons, ☆ Interesting, the reflection headings card) only in Basic: logbook only. The tabs (Analytics,
// Reflections) are tab bar switches instead.
export const BASIC_ITEMS = [
  ['grid', 'The Logbook grid view'],
  ['analytics', 'Analytics trends, forecasts, Gone quiet, reflection to-dos and links to cases'],
  ['reflExtras', 'Figures and references in reflections'],
  ['reflect', 'Reflect buttons, ☆ Interesting and reflection headings in Analytics', 'logbook'],
];
export const basicHides = item => {
  const p = profile();
  if ((p !== 'basic' && p !== 'logbook') || (item === 'reflect' && p !== 'logbook') || item === 'case:parsed') return false;
  return !(settings().basicOn || []).includes(item);
};
// the Case tab parts (Logging and Profiles or hide items; settings.caseHide, and the profile's)
export const caseShown = part => !(settings().caseHide || []).includes(part) && !basicHides('case:' + part);
export function setCaseShown(part, show, parts) {
  const hide = new Set(settings().caseHide || []), on = new Set(settings().basicOn || []);
  if (show) { hide.delete(part); if (basicHides('case:' + part)) on.add('case:' + part); } else hide.add(part);
  return patchLogbook({ settings: { caseHide: hide.size ? parts.filter(p => hide.has(p)) : null, basicOn: on.size ? [...on] : null } });
}
export function setBasicOn(item, on) {
  const now = new Set(settings().basicOn || []);
  if (on) now.add(item); else now.delete(item);
  return patchLogbook({ settings: { basicOn: now.size ? [...now] : null } });
}
// The intake on the list, or the year the rid starts with.
export function baseIntake(r) {
  if (!r) return null;
  const ridYear = Number(String(r.rid || '').slice(0, 4));
  return Number(r.intake) || (ridYear > 2000 && ridYear < 2100 ? ridYear : null);
}
// Years spent as an SMO after R3 (they count as R3). While the status is SMO, each new academic year
// past R3 adds one.
export function residentSmo(r) {
  const s = Math.max(0, Number(r && r.smo) || 0);
  if (!r || r.status !== 'SMO') return s;
  const intake = baseIntake(r);
  return intake ? Math.max(s, academicYear() - intake + 1 - 3) : s;
}
// A resident's year moves up each 1 July from their intake (SMO years count as R3), unless an admin set
// it by hand (leave, repeats). An SMO counts as R3 for targets and the portfolio.
export const residentYear = r => {
  if (!r) return null;
  if (r.status === 'SMO') return 3;
  return Number(r.rYear || (r.intake && rYearDefault(r.intake, new Date(), residentSmo(r)))) || null;
};
// "SR1", or "SMO" while the status is SMO
export const residentYearName = r => (r && r.status === 'SMO' ? 'SMO' : residentYear(r) ? yearName(residentYear(r)) : '?');
// The intake to count residency years from. When an admin set the year by hand (leave, a repeat),
// the intake is shifted so this year comes out right, keeping JR and the Section 4 columns in step.
export function effectiveIntake(r = S.resident) {
  if (!r) return null;
  const intake = baseIntake(r);
  if (!r.rYear || r.status === 'SMO') return intake;
  return academicYear() - Number(r.rYear) + 1;
}
// not on the programme list: the year picked in Settings, moved up each 1 July since it was picked
const settingsYear = () => {
  const st = settings(), y = Number(st.rYear) || 1;
  return st.rYearAY ? Math.min(5, Math.max(1, y + academicYear() - Number(st.rYearAY))) : y;
};
export const rYear = () => residentYear(S.resident) || settingsYear();
// what to call the signed-in resident's year in the app: "SR1", "SMO"
export const myYearName = () => (S.resident && S.resident.status === 'SMO' ? 'SMO' : yearName(rYear()));
export const displayName = () => (S.logbook && S.logbook.name) || (S.resident && S.resident.name) || (S.user && S.user.name) || '';

export function setCases(cases) {
  rawCases = cases;
  S.cases = writes.overlay('case', S.user?.email, cases).sort(byNewest);
  S.counts = countCases(S.cases);
  S.casesLoaded = true;
}
let rawCases = [];
writes.configure({ backend: cloud.commitRecord, normalize: cloud.cleanWrite, getOwner: () => S.user?.email || null });
writes.onChange(() => {
  if (!S.user) return;
  if (S.casesLoaded) { setCases(rawCases); hooks.casesChanged?.(); }
  hooks.writesChanged?.();
});
export const byNewest = (a, b) => (b.date || '0').localeCompare(a.date || '0') || (b.createdAt || 0) - (a.createdAt || 0);

// ---------- tiny DOM helper (as in nuh-roster) ----------

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'ref') v(el);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}

// replaceChildren, skipping null/false (replaceChildren would print them as text)
export const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false));

export const add = (el, ...kids) => { el.append(...kids.flat(Infinity).filter(k => k != null && k !== false)); return el; };

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

// One set of line icons (24x24, stroked, like the tab bar's) instead of emoji, so every phone draws them alike.
// rowIcon: the Logbook row buttons (an icon alone on phones, where two labelled buttons don't fit beside the tags).
// ic: an icon inside text or a button, sized to the words (style.css .ico.i).
const ICON_PATHS = {
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  reflect: 'M4 19.5V5a2 2 0 0 1 2-2h12v14H6a2 2 0 0 0-2 2.5zM6 21h12v-4M8 7h6M8 11h4',   // the Reflections tab's book
  done: 'M5 12.5l4.5 4.5L19 7.5',
  paste: 'M9 3h6v4H9zM9 5H5v16h14V5h-4M9 12h6M9 16h4',   // a clipboard
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v5M16 3v5',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z',
  again: 'M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 3.5v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20.5v-5h5',   // log the same again
  clear: 'M6 6l12 12M18 6L6 18',
  note: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',   // a pencil
  logbook: 'M4 5h16M4 10h16M4 15h16M4 20h10',   // the tab bar's
  notes: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
};
const svgIcon = (k, cls) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', cls); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', ICON_PATHS[k]);
  svg.append(path); return svg;
};
export const rowIcon = k => svgIcon(k, 'ico');
export const ic = k => svgIcon(k, 'ico i');
// Show or hide a panel (Filter, its Dates / Tags / More folds) by growing or shrinking it, like a fold; with
// Reduce motion (Accessibility) it just appears. el.hidden is set at once when showing, after the shrink when hiding.
const motionOff = () => { const c = document.documentElement.classList; return c.contains('rm') || (c.contains('rm-auto') && matchMedia('(prefers-reduced-motion: reduce)').matches); };
export function reveal(el, show) {
  el._reveal?.cancel();
  if (!show && el.hidden) return;
  if (motionOff() || !el.animate) { el.hidden = !show; return; }
  el.hidden = false;
  const full = el.offsetHeight;
  el.style.overflow = 'clip';
  const a = el.animate({ height: show ? ['0px', full + 'px'] : [full + 'px', '0px'], opacity: show ? [0, 1] : [1, 0] }, { duration: 220, easing: 'cubic-bezier(.2, .7, .2, 1)' });
  el._reveal = a;
  const end = () => { if (el._reveal !== a) return; el._reveal = null; el.style.overflow = ''; if (!show) el.hidden = true; };
  a.onfinish = end; a.oncancel = () => { if (el._reveal === a) { el._reveal = null; el.style.overflow = ''; el.hidden = !show; } };
}
// An empty list: a soft icon, one bold line, a grey hint and the button to fill it (style.css .empty-state).
// Keeps the class "empty" so the old look-ups still find it.
export const emptyState = (icon, title, hint, action) => h('div', { class: 'empty empty-state' },
  icon ? svgIcon(icon, 'ico') : null, h('b', {}, title), hint ? h('p', {}, hint) : null, action || null);

// toast('Saved', { action: 'Undo', onaction }) — one at a time, the newest wins.
// A toast with a button (Undo) stays at least as long as Settings → Logging → Undo window says (settings.undoSecs).
export const UNDO_SECS = [[5, '5 seconds (default)'], [10, '10 seconds'], [20, '20 seconds'], [30, '30 seconds']];
const undoMs = () => (UNDO_SECS.some(([n]) => n === Number(settings().undoSecs)) ? Number(settings().undoSecs) * 1000 : 4500);
export function toast(msg, { action, onaction, ms } = {}) {
  ms = action ? Math.max(ms || 0, undoMs()) : ms || 4500;
  const t = document.getElementById('toast');
  fill(t, h('span', {}, msg), action ? h('button', { onclick: () => { t.classList.remove('show'); onaction(); } }, action) : null);
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), ms);
}

export function clearToast() { clearTimeout(toast.t); const el = document.getElementById('toast'); if (el) { el.classList.remove('show'); fill(el); } }

export function download(name, blob) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const fileButton = (label, accept, onfile, cls = 'btn') => h('label', { class: cls }, label,
  h('input', { type: 'file', accept, hidden: true, onchange: async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await onfile(f); } }));

// A modal dialog; returns { el, close }. body: nodes. Closes on backdrop tap / Esc.
// sticky: a tap on the backdrop doesn't close it (forms, so a stray tap doesn't lose typing)
// cls: extra classes on the dialog ('full': the whole screen on phones, with a .dlg-actions bar pinned)
export function modal(title, body, { onclose, sticky, cls = '' } = {}) {
  // the title takes the initial focus, so phones don't pop a keyboard or date picker on open
  const el = h('dialog', { class: cls }, h('h2', { tabindex: '-1', autofocus: true, style: 'outline:none' }, title), body);
  const ownerUser = S.user, previousFocus = document.activeElement;
  const caret = previousFocus && typeof previousFocus.selectionStart === 'number' ? [previousFocus.selectionStart, previousFocus.selectionEnd] : null;
  let finished = false;
  const finish = () => {
    if (finished) return; finished = true; el.remove(); const accountChanged = S.user !== ownerUser; onclose?.({ accountChanged });
    if (!accountChanged && previousFocus?.isConnected) { previousFocus.focus({ preventScroll: true }); if (caret) previousFocus.setSelectionRange(...caret); }
  };
  const view = transients?.open(() => { el.close(); finish(); });
  const close = () => { el.close(); if (view?.active) return view.close(); finish(); return Promise.resolve(); };
  el.addEventListener('close', () => { if (view?.active) void view.close(); else finish(); });
  if (!sticky) el.addEventListener('click', e => { if (e.target === el) void close(); });
  document.body.append(el); el.showModal();
  return { el, close };
}

// A small ⓘ button that shows or hides a longer explanation: [button, paragraph].
export function info(...text) {
  const p = h('div', { class: 'hint info-text', hidden: true }, ...text);
  const b = h('button', { type: 'button', class: 'info-btn', 'aria-label': 'More about this', 'aria-expanded': 'false', onclick: () => { p.hidden = !p.hidden; b.setAttribute('aria-expanded', String(!p.hidden)); } }, 'ⓘ');
  return [b, p];
}

export function confirmBox(title, text, okLabel = 'OK', danger = false) {
  return new Promise(resolve => {
    let ok = false;
    const m = modal(title, [
      h('p', {}, text),
      h('div', { class: 'bar' }, h('span', { class: 'grow' }),
        h('button', { onclick: () => m.close() }, 'Cancel'),
        h('button', { class: danger ? 'primary danger' : 'primary', onclick: () => { ok = true; m.close(); } }, okLabel)),
    ], { onclose: state => resolve(state?.accountChanged ? false : ok) });
  });
}

// ExcelJS is ~1 MB, so it loads on first use (the service worker caches it for offline use).
let excelP = null;
export function needExcel() {
  if (globalThis.ExcelJS) return Promise.resolve(globalThis.ExcelJS);
  excelP ||= new Promise((resolve, reject) => {
    const s = h('script', { src: 'vendor/exceljs.min.js' });
    s.onload = () => resolve(globalThis.ExcelJS);
    s.onerror = () => { excelP = null; reject(new Error('Could not load the Excel library (offline?)')); };
    document.head.append(s);
  });
  return excelP;
}

// A worksheet as plain row arrays (0-based columns); dates stay Date objects, formulas give their result.
export function sheetRows(ws) {
  const rows = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const out = [];
    row.eachCell({ includeEmpty: true }, (c, i) => { out[i - 1] = plainCell(c.value); });
    rows[n - 1] = out;
  });
  for (let i = 0; i < rows.length; i++) rows[i] ||= [];
  return rows;
}
function plainCell(v) {
  if (v == null || v instanceof Date || typeof v !== 'object') return v ?? null;
  if (v.richText) return v.richText.map(t => t.text).join('');
  if (v.result !== undefined) return plainCell(v.result);
  if (v.text != null) return plainCell(v.text);
  if (v.error) return null;
  return String(v);
}

// ---------- categories ----------

export const cat = code => BY_CODE[code] || { code, name: code, label: code, full: code };
// Display names an admin set (config/categoryNames): name for lists, short for the pills. Display only.
let NAMES = {};
export let categoryNamesRevision = 0;
export const setCategoryNames = m => { NAMES = m || {}; categoryNamesRevision++; };
export const categoryNames = () => NAMES;
// ---------- tags (Settings → Tag editor; js/tags.js) ----------
// The tag set in effect for the signed-in user, rebuilt when their settings change.
let tagMemo = { st: null, set: null, mine: {} };
export function tagSet() {
  const st = settings();
  if (tagMemo.st !== (S.logbook && S.logbook.settings)) {
    const set = tagSetOf(st);
    tagMemo = { st: S.logbook && S.logbook.settings, set, mine: userCatNames(set) };
  }
  return tagMemo.set;
}
const myNames = () => { tagSet(); return tagMemo.mine; };
export const tagName = key => tagNameIn(tagSet(), key);
export const tagLinks = key => tagLinksIn(tagSet(), key);
// The Log page's list: the tag tree flattened (headers, categories and your tags), hidden ones marked.
export const logTags = () => flatTree(tagTree(tagSet()));

// your own name (Tag editor), else an admin's (Settings → Category names), else the programme's
// default, else the official one
export const catName = code => (myNames()[code] && myNames()[code].l) || (NAMES[code] && NAMES[code].name) || (DEFAULT_NAMES[code] && DEFAULT_NAMES[code][0]) || cat(code).name;
export const catShort = code => (myNames()[code] && myNames()[code].n) || (NAMES[code] && NAMES[code].short) || (DEFAULT_NAMES[code] && DEFAULT_NAMES[code][1]) || catName(code);
// Readable procedure name for tags and tooltips: no code, no targets.
export const catFull = code => cat(code).full || cat(code).name;
export const PROGRESS_BY_CODE = () => Object.fromEntries(progress(S.counts, rYear()).map(p => [p.code, p]));

// "count / next target" for a category, e.g. "7 / 10 by R3" or "12 ✓".
export function countText(code, prog) {
  const n = S.counts[code] || 0;
  const p = prog && prog[code];
  if (!p || p.status === 'none') return String(n);
  if (p.status === 'done') return `${n} ✓`;
  return `${n} / ${p.next.n} by ${appYear(p.next.by)}`;
}

export function catChip(code, { on, onclick, cls = '', removable, title } = {}) {
  return h('span', {
    class: `chip ${on ? 'on' : ''} ${cls}`, role: 'button', tabindex: '0', title: title || catFull(code), 'data-code': code,
    onclick, onkeydown: e => { if ((e.key === 'Enter' || e.key === ' ') && onclick) { e.preventDefault(); onclick(e); } },
  }, h('span', { class: 'nm' }, catShort(code)), removable ? h('span', { class: 'x', 'aria-label': 'remove' }, '×') : null);
}
export const miniChips = cats => h('span', { class: 'chips' }, sortCodes(cats || []).map(c => h('span', { class: 'mini', title: catFull(c) }, catShort(c))));
// "LSCS + CNB(Obs) + Spinal": categories by their pill names (numbers are only on Totals and in exports)
export const catPills = cats => sortCodes(cats || []).map(catShort).join(' + ');

// Categories ordered for the picker: each parent followed by its sub-categories.
export const PICKER_ORDER = (() => {
  const active = CATEGORIES.filter(c => !c.retired);
  const out = [];
  for (const c of active) if (!c.parent) { out.push(c); for (const s of active) if (s.parent === c.code) out.push(s); }
  return out;
})();
// Categories in the order of your tag set (each parent followed by its subcategories).
export function pickerOrder() {
  const seen = new Set();
  const out = [];
  for (const n of logTags()) if (n.code && !seen.has(n.code)) { seen.add(n.code); out.push(BY_CODE[n.code]); }
  return out;
}

// ---------- case writes (optimistic; the live listener confirms) ----------

const mine = () => S.user.email;

function applyLocal(fn) {
  const next = fn(S.cases.slice());
  setCases(next);
  scheduleSummary();
  hooks.casesChanged();
}

// Without `initials`, leading patient initials are split off the details ("AB 34F LSCS" -> 'AB', '34F LSCS').
// Patient identifiers don't belong in a logbook: an NRIC/FIN (S1234567A) or a long number (a hospital
// or phone number) asks before saving.
const ID_RE = /\b[STFGM]\d{7}[A-Z]\b|\b\d{7,}\b/i;
export function okNoIds(...texts) {
  if (!texts.some(t => ID_RE.test(String(t || '')))) return Promise.resolve(true);
  return confirmBox('Looks like an ID number', 'This looks like an NRIC, hospital or phone number. Log patient initials only, never identifiers. Save anyway?', 'Save anyway', true);
}

// Your tags that sit right under a category (Tag editor; older personal subcategories became these).
// Under the selected categories they show as chips to tick; a case carries them by key in case.tags.
export const subcatsOf = code => tagSet().filter(e => e.p === 'c:' + code && !e.hd && !e.k.startsWith('c:') && !e.hide);
export function subcatChips(cats, tags, onchange) {
  const rows = (cats || []).filter(code => subcatsOf(code).length).map(code => h('div', { class: 'subcats' },
    h('span', { class: 'sc-l' }, catShort(code)),
    subcatsOf(code).map(e => {
      const on = (tags || []).includes(e.k);
      return h('span', { class: `chip sc ${on ? 'on' : ''}`, role: 'button', tabindex: '0', 'aria-pressed': String(on), 'data-tag': e.k,
        onclick: () => onchange(on ? tags.filter(x => x !== e.k) : [...(tags || []), e.k]) }, e.n);
    })));
  return rows.length ? h('div', { class: 'subcat-wrap' }, rows) : null;
}
// The tags a case keeps: a tag that sits under a category goes when that category isn't ticked; the
// rest (linked or personal) stay.
export function keepTags(tags, cats) {
  return [...new Set(tags || [])].filter(t => {
    const e = tagSet().find(x => x.k === t);
    const under = e && e.p && e.p.startsWith('c:') ? e.p.slice(2) : (/^\d/.test(String(t)) ? String(t).split(':')[0] : null);
    return !under || (cats || []).includes(under);
  }).slice(0, 20);
}
// A chip for one of your tags (selected ones can be removed).
export const tagChip = (key, { onclick, on = true } = {}) => h('span', { class: `chip tag ${on ? 'on' : ''}`, role: 'button', tabindex: '0', 'data-tag': key, title: 'Your tag', onclick,
  onkeydown: e => { if ((e.key === 'Enter' || e.key === ' ') && onclick) { e.preventDefault(); onclick(e); } } }, h('span', { class: 'nm' }, tagName(key)), onclick && on ? h('span', { class: 'x', 'aria-label': 'remove' }, '×') : null);

export async function createCase({ id, createdAt, date, details, initials, cats, source = 'app', dateText, reflectTag = false, tags = [] }) {
  const now = Date.now();
  const parts = initials == null ? splitInitials(details) : { initials: cleanInitials(initials), details: String(details || '').trim() };
  const c = { id: id || uid(), date: date || null, initials: parts.initials, details: parts.details, cats: sortCodes(cats), createdAt: createdAt || now, updatedAt: now, source };
  if (!date && dateText) c.dateText = dateText;
  if (reflectTag) c.reflectTag = true;
  const kept = keepTags(tags, c.cats);
  if (kept.length) c.tags = kept;
  const owner = mine();
  const saved = await writes.save('case', owner, c, null);
  if (S.user?.email !== owner) throw new Error('Account changed; this save belongs to the previous account');
  applyLocal(list => [saved, ...list.filter(x => x.id !== saved.id)]);
  return saved;
}

export async function updateCase(c, { base = S.cases.find(x => x.id === c.id) || null } = {}) {
  const next = { ...c, cats: sortCodes(c.cats), updatedAt: Date.now() };
  if (next.date) delete next.dateText;
  const owner = mine();
  const saved = await writes.save('case', owner, next, base);
  if (S.user?.email !== owner) throw new Error('Account changed; this save belongs to the previous account');
  applyLocal(list => list.map(x => (x.id === c.id ? saved : x)));
  return saved;
}

export async function removeCase(id) {
  const base = S.cases.find(x => x.id === id) || null;
  const owner = mine();
  await writes.save('case', owner, { id, _deleted: true }, base);
  if (S.user?.email !== owner) throw new Error('Account changed; this delete belongs to the previous account');
  applyLocal(list => list.filter(x => x.id !== id));
}

export async function restoreCase(c, base = S.cases.find(x => x.id === c.id) || null) {
  const owner = mine();
  const saved = await writes.save('case', owner, c, base);
  if (S.user?.email !== owner) throw new Error('Account changed; this save belongs to the previous account');
  applyLocal(list => [saved, ...list.filter(x => x.id !== c.id)]);
}

export async function saveMany(cases) {
  applyLocal(list => {
    const byId = new Map(list.map(c => [c.id, c]));
    for (const c of cases) byId.set(c.id, c);
    return [...byId.values()];
  });
  await cloud.saveCases(mine(), cases);
}

export async function deleteMany(ids) {
  const set = new Set(ids);
  applyLocal(list => list.filter(c => !set.has(c.id)));
  await cloud.deleteCases(mine(), ids);
}

export async function patchLogbook(patch) {
  S.logbook = { ...S.logbook, ...patch, settings: { ...(S.logbook && S.logbook.settings), ...(patch.settings || {}) } };
  try { await cloud.saveLogbook(mine(), patch); } catch (err) { toast('Could not save settings: ' + err.message); }
}

// ---------- benchmarking summary (counts only) ----------

export function summaryOf(counts = S.counts) {
  const r = S.resident;
  const total = S.cases.length;
  return {
    // the name is the one on the programme list (the rules check it), never a Google display name
    rid: r.rid, name: r.name || '', intake: r.intake || null, rYear: rYear(), ...(r.status === 'SMO' ? { smo: true } : {}),
    counts, total, ...reflectionCounts(S.reflections), updatedAt: Date.now(),
  };
}

let lastSummary = '';
const writeSummaryNow = async () => {
  // an empty first snapshot from a new device's cache must not wipe the shared counts
  if (!S.resident || !S.resident.rid || !S.casesLoaded || !S.casesSynced) return;
  const s = summaryOf();
  const key = JSON.stringify([s.counts, s.total, s.rYear, s.smo, s.intake, s.name, s.reflections]);
  if (key === lastSummary) return;
  try { await cloud.writeSummary(S.resident.rid, s); lastSummary = key; }
  catch (err) {
    // an admin changed this resident's name or intake since sign-in: reload the entry and try once more
    if (err && err.code === 'permission-denied' && S.user) {
      try {
        const r = await cloud.myResident(S.user.email);
        if (r && r.rid) { S.resident = r; const s2 = summaryOf(); await cloud.writeSummary(r.rid, s2); lastSummary = key; return; }
      } catch (e) { console.warn('summary retry', e); }
    }
    console.warn('summary', err);
  }
};
export const scheduleSummary = debounce(writeSummaryNow, 4000);
// demo only: the e2e test writes the summary now instead of waiting the 4 s
if (cloud.demo && typeof window !== 'undefined') window.__logbookTest = { flushSummary: () => { scheduleSummary.cancel(); return writeSummaryNow(); } };

// Sign-out: forget per-user caches held by the screens (each registers its own reset).
export const resetters = [() => { lastSummary = ''; scheduleSummary.cancel(); }];
export const resetCaches = () => resetters.forEach(f => f());

export { todayISO };
