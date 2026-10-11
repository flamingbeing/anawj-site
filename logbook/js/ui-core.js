// Shared UI state and helpers for the logbook screens (ui-*.js). app.js owns boot, auth and tabs.

import { BY_CODE, CATEGORIES } from './categories.js';
import { countCases, uid, todayISO, sortCodes, progress, rYearDefault, splitInitials, cleanInitials } from './engine.js';
import * as cloud from './cloud.js';
import { reflectionCounts } from './reflections.js';

export { cloud };

// ---------- state ----------

export const S = {
  user: null,          // { email, name, uid }
  admin: false,
  pd: false,           // a programme director (pds/{email}): can see Totals
  resident: null,      // residents/{rid} doc when the user is on the programme list
  logbook: null,       // logbooks/{email} doc
  cases: [],           // newest first
  reflections: [],     // logbooks/{email}/reflections (ui-reflect.js keeps it live)
  counts: {},
  casesLoaded: false,
  casesSynced: false,  // a snapshot has come from the server (not only the offline cache)
  sharedTemplates: [],
  tab: 'log',
};

// Set by app.js: re-render the current screen, or tell it the case list changed.
export const hooks = { render() {}, casesChanged() {} };

export const settings = () => ({ suggestions: true, rYear: 1, ...(S.logbook && S.logbook.settings) });
// A resident's year moves up each 1 July from their intake, unless an admin set it by hand (leave, repeats).
export const residentYear = r => Number(r && (r.rYear || (r.intake && rYearDefault(r.intake)))) || null;
// The intake to count residency years from. When an admin set the year by hand (leave, a repeat),
// the intake is shifted so this year comes out right, keeping JR and the Section 4 columns in step.
export function effectiveIntake(r = S.resident) {
  if (!r) return null;
  const ridYear = Number(String(r.rid || '').slice(0, 4));
  const intake = Number(r.intake) || (ridYear > 2000 && ridYear < 2100 ? ridYear : null);
  if (!r.rYear) return intake;
  const now = new Date(), ay = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return ay - Number(r.rYear) + 1;
}
export const rYear = () => residentYear(S.resident) || Number(settings().rYear) || 1;
export const displayName = () => (S.logbook && S.logbook.name) || (S.resident && S.resident.name) || (S.user && S.user.name) || '';

export function setCases(cases) {
  S.cases = [...cases].sort(byNewest);
  S.counts = countCases(S.cases);
  S.casesLoaded = true;
}
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

// toast('Saved', { action: 'Undo', onaction }) — one at a time, the newest wins.
export function toast(msg, { action, onaction, ms = 4500 } = {}) {
  const t = document.getElementById('toast');
  fill(t, h('span', {}, msg), action ? h('button', { onclick: () => { t.classList.remove('show'); onaction(); } }, action) : null);
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), ms);
}

export function download(name, blob) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const fileButton = (label, accept, onfile, cls = 'btn') => h('label', { class: cls }, label,
  h('input', { type: 'file', accept, hidden: true, onchange: async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await onfile(f); } }));

// A modal dialog; returns { el, close }. body: nodes. Closes on backdrop tap / Esc.
// sticky: a tap on the backdrop doesn't close it (forms, so a stray tap doesn't lose typing)
export function modal(title, body, { onclose, sticky } = {}) {
  // the title takes the initial focus, so phones don't pop a keyboard or date picker on open
  const el = h('dialog', {}, h('h2', { tabindex: '-1', autofocus: true, style: 'outline:none' }, title), body);
  el.addEventListener('close', () => { el.remove(); onclose && onclose(); });
  if (!sticky) el.addEventListener('click', e => { if (e.target === el) el.close(); });
  document.body.append(el);
  el.showModal();
  return { el, close: () => el.close() };
}

// A small ⓘ button that shows or hides a longer explanation: [button, paragraph].
export function info(...text) {
  const p = h('p', { class: 'hint info-text', hidden: true }, ...text);
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
    ], { onclose: () => resolve(ok) });
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
export const catName = code => cat(code).name;
// Readable procedure name for tags and tooltips: no code, no targets.
export const catFull = code => cat(code).full || cat(code).name;
export const PROGRESS_BY_CODE = () => Object.fromEntries(progress(S.counts, rYear()).map(p => [p.code, p]));

// "count / next target" for a category, e.g. "7 / 10 by R3" or "12 ✓".
export function countText(code, prog) {
  const n = S.counts[code] || 0;
  const p = prog && prog[code];
  if (!p || p.status === 'none') return String(n);
  if (p.status === 'done') return `${n} ✓`;
  return `${n} / ${p.next.n} by ${p.next.by}`;
}

export function catChip(code, { on, onclick, cls = '', removable, title } = {}) {
  return h('span', {
    class: `chip ${on ? 'on' : ''} ${cls}`, role: 'button', tabindex: '0', title: title || catFull(code),
    onclick, onkeydown: e => { if ((e.key === 'Enter' || e.key === ' ') && onclick) { e.preventDefault(); onclick(e); } },
  }, h('span', { class: 'code' }, code), h('span', { class: 'nm' }, catName(code)), removable ? h('span', { class: 'x', 'aria-label': 'remove' }, '×') : null);
}
export const miniChips = cats => h('span', { class: 'chips' }, sortCodes(cats || []).map(c => h('span', { class: 'mini', title: catFull(c) }, c)));

// Categories ordered for the picker: each parent followed by its sub-categories.
export const PICKER_ORDER = (() => {
  const active = CATEGORIES.filter(c => !c.retired);
  const out = [];
  for (const c of active) if (!c.parent) { out.push(c); for (const s of active) if (s.parent === c.code) out.push(s); }
  return out;
})();

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

// Personal subcategories (settings.subcats = { '26': ['Interscalene', 'Femoral'] }): a case carries
// them as tags '26:Interscalene'. They sit within the APMES categories and never change the counts.
export const subcatsOf = code => ((settings().subcats || {})[code] || []);
export function subcatChips(cats, tags, onchange) {
  const rows = (cats || []).filter(code => subcatsOf(code).length).map(code => h('div', { class: 'subcats' },
    h('span', { class: 'sc-l' }, code),
    subcatsOf(code).map(name => {
      const t = `${code}:${name}`, on = (tags || []).includes(t);
      return h('span', { class: `chip sc ${on ? 'on' : ''}`, role: 'button', tabindex: '0', 'aria-pressed': String(on),
        onclick: () => onchange(on ? tags.filter(x => x !== t) : [...(tags || []), t]) }, name);
    })));
  return rows.length ? h('div', { class: 'subcat-wrap' }, rows) : null;
}

export async function createCase({ date, details, initials, cats, source = 'app', dateText, reflectTag = false, tags = [] }) {
  const now = Date.now();
  const parts = initials == null ? splitInitials(details) : { initials: cleanInitials(initials), details: String(details || '').trim() };
  const c = { id: uid(), date: date || null, initials: parts.initials, details: parts.details, cats: sortCodes(cats), createdAt: now, updatedAt: now, source };
  if (!date && dateText) c.dateText = dateText;
  if (reflectTag) c.reflectTag = true;
  const kept = (tags || []).filter(t => c.cats.includes(String(t).split(':')[0]));
  if (kept.length) c.tags = kept;
  applyLocal(list => [c, ...list]);
  cloud.saveCase(mine(), c).catch(err => toast('Could not save: ' + err.message));
  return c;
}

export async function updateCase(c) {
  const next = { ...c, cats: sortCodes(c.cats), updatedAt: Date.now() };
  if (next.date) delete next.dateText;
  applyLocal(list => list.map(x => (x.id === c.id ? next : x)));
  cloud.saveCase(mine(), next).catch(err => toast('Could not save: ' + err.message));
  return next;
}

export async function removeCase(id) {
  applyLocal(list => list.filter(x => x.id !== id));
  cloud.deleteCase(mine(), id).catch(err => toast('Could not delete: ' + err.message));
}

export async function restoreCase(c) {
  applyLocal(list => [c, ...list.filter(x => x.id !== c.id)]);
  cloud.saveCase(mine(), c).catch(err => toast('Could not restore: ' + err.message));
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
    rid: r.rid, name: r.name || '', intake: r.intake || null, rYear: rYear(),
    counts, total, ...reflectionCounts(S.reflections), updatedAt: Date.now(),
  };
}

let lastSummary = '';
const writeSummaryNow = async () => {
  // an empty first snapshot from a new device's cache must not wipe the shared counts
  if (!S.resident || !S.resident.rid || !S.casesLoaded || !S.casesSynced) return;
  const s = summaryOf();
  const key = JSON.stringify([s.counts, s.total, s.rYear, s.name, s.reflections]);
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

// Sign-out: forget per-user caches held by the screens (each registers its own reset).
export const resetters = [() => { lastSummary = ''; scheduleSummary.cancel(); }];
export const resetCaches = () => resetters.forEach(f => f());

export { todayISO };
