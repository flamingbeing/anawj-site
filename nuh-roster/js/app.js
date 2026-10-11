import {
  DEFAULT_SETTINGS, DEFAULT_ROOMS, JUNIOR_GRADES, SENIOR_GRADES, DEFAULT_GRADE, OLD_GRADES, POSTINGS, postingName, bySeniority, STATUSES, COLOURS, COLOUR_ARGB, isBaby,
  matchName, splitNameList, namesInCell, suggestFlags, generate, check, learnFromRosters, tickFromHistory, remoteRoom, suggestShortNames, mergeContacts, planImport, importUpdate, findDuplicates, mergeStaffRecords, pacuRoom, isPacu, fmtSenior, fmtJunior, SPECIAL_ROWS, isCoverPart, coverTarget,
} from './engine.js';
// Seniors are always shown in black; juniors may be green (Baby MO) or purple (locum).
const staffColour = p => (p && p.role !== 'senior' && p.colour) || '';
import { readRosterRows, readStaffSheet, buildRosterWorkbook, cellText, isContactList, readContactList, cleanContactName } from './xlsxio.js';
import { buildLayout, COL_WIDTHS, shortName, doubleCovered, isDouble, TEAM_ROWS, DUTIES } from './layout.js';
import * as cloud from './cloud.js';
import { buildRosterPdf } from './pdfout.js';
import { makeDemo } from './demo.js';
import { MONTHLY, monthlyDef, LEAVE_TYPES, NIGHT_DUTIES, cleanCell, daysIn, weekday, monthName, addDays, readMonthlyPdf, readMonthlyXlsx, buildMonthlyWorkbook, dutiesOn, generalFromMonthly, leaveOn } from './monthly.js';

// ?demo: a made-up department, kept apart from real data in its own storage
const DEMO = new URLSearchParams(location.search).has('demo');
const KEY = DEMO ? 'ot-roster-demo' : 'ot-roster-v1';
const clone = o => JSON.parse(JSON.stringify(o));
// tomorrow, in local time: the roster is made the day before
const today = () => {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------- state ----------

function blankState() {
  return {
    settings: clone(DEFAULT_SETTINGS),
    staff: [],
    roomTemplate: clone(DEFAULT_ROOMS),
    day: { date: today(), rooms: [], staff: {} },
    roster: null,
    days: {},     // other dates: { '2026-10-12': { day, roster } }
    monthly: {},  // monthly rosters by month: { '2022-10': { junior: { rows }, leave: { entries } } }
    tab: 'staff',
    cloudBase: {},
    roomsVersion: 4,
  };
}

let state = blankState();
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) state = { ...state, ...saved, settings: { ...clone(DEFAULT_SETTINGS), ...saved.settings }, roomsVersion: saved.roomsVersion || 1 };
} catch { /* private mode or corrupt data: start fresh */ }
migrateRooms();
syncRooms();
if (DEMO && !state.staff.length) startDemo();

function startDemo() {
  const demo = makeDemo(state.day.date);
  state.staff = demo.staff;
  state.monthly = demo.monthly;
  for (const r of state.day.rooms) if (demo.notes[r.name]) { r.notes = demo.notes[r.name]; r.running = true; r.flags = suggestFlags(r.notes, state.settings, r.name); }
  state.tab = 'monthly';
}
const demoLink = () => location.origin + location.pathname + '?demo';

// Room list changes since the first version: Remote Case -> Remote 1 + Remote 2, add KROR 1 and MCOR 9.
// Names imported before titles were stripped ("Dr Brandon Ong", "A/Prof ..."): clean them and
// remember they came from an import, so a contact list can correct their role.
function cleanStaffNames() {
  for (const p of state.staff) {
    // grades from before the department's own grade names
    // a registrar is a senior resident, on the junior list
    if (p.role === 'senior' && p.grade === 'Registrar') { p.role = 'junior'; p.grade = 'Senior resident'; }
    if (p.posting === 'Card') p.posting = 'Cardiac';
    const old = OLD_GRADES[p.role]?.[p.grade];
    if (old) { if (p.grade === 'Baby MO' && !p.colour) p.colour = 'green'; p.grade = old; }
    const clean = cleanContactName(p.name);
    if (clean !== p.name.trim() && /^\s*(dr|a\/prof|prof|adj)\b/i.test(p.name)) { p.name = clean; p.source ||= 'contact'; }
  }
}
cleanStaffNames();

function migrateRooms() {
  const t = state.roomTemplate;
  if ((state.roomsVersion || 1) >= 2) return migratePacu();
  const rename = (from, to) => {
    t.forEach(r => { if (r.name === from) r.name = to; });
    (state.day.rooms || []).forEach(r => { if (r.name === from) r.name = to; });
    (state.roster?.rows || []).forEach(r => { if (r.label === from) r.label = to; });
  };
  rename('Remote Case', 'Remote 1');
  const addAfter = (name, complex, after, before) => {
    if (t.some(r => r.name === name)) return;
    let i = t.findIndex(r => r.name === after);
    if (i >= 0) i++; else i = Math.max(0, t.findIndex(r => r.name === before));
    t.splice(i, 0, { complex, name, defaultOn: false });
  };
  addAfter('Remote 2', 'Other', 'Remote 1', 'KROR 2');
  addAfter('KROR 1', 'KROR', null, 'KROR 2');
  addAfter('MCOR 9', 'MCOR', 'MCOR 8', 'MCOR 10');
  t.forEach(r => { if (r.defaultOn === undefined) r.defaultOn = true; });
  state.roomsVersion = 2;
  migratePacu();
}

// v3: a PACU row above each complex
function migratePacu() {
  if ((state.roomsVersion || 1) >= 3) return migrateEct();
  const t = state.roomTemplate;
  for (const [complex, name] of [['KROR', 'KROR PACU'], ['MCOR', 'MCOR PACU'], ['MOR', 'MBOR PACU']]) {
    if (t.some(r => r.name === name)) continue;
    const i = t.findIndex(r => r.complex === complex);
    t.splice(i < 0 ? t.length : i, 0, { complex, name, defaultOn: true });
  }
  state.roomsVersion = 3;
  migrateEct();
}

// v4: ECT moves from the calls to the OT rows, just above MBOR PACU
function migrateEct() {
  if ((state.roomsVersion || 1) >= 4) return;
  const t = state.roomTemplate;
  if (!t.some(r => r.name === 'ECT')) {
    const i = t.findIndex(r => r.name === 'MBOR PACU');
    t.splice(i < 0 ? t.length : i, 0, { complex: 'ECT', name: 'ECT', defaultOn: true });
  }
  state.roomsVersion = 4;
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  }, 200);
}

let nextId = 1 + state.staff.reduce((m, p) => Math.max(m, parseInt(String(p.id).replace(/\D/g, ''), 10) || 0), 0);
const newId = () => 'p' + nextId++;

function syncRooms() {
  const byName = Object.fromEntries((state.day.rooms || []).map(r => [r.name, r]));
  state.day.rooms = state.roomTemplate.map((t, i) => byName[t.name]
    ? { ...byName[t.name], complex: t.complex }
    : { id: 'r' + i + '-' + t.name.replace(/\W+/g, ''), name: t.name, complex: t.complex, running: !!t.defaultOn, session: 'full', notes: '', flags: { subspecs: [], complex: false, long: false }, flagsManual: false, lockSenior: '', lockJunior: '' });
}

const dayOf = id => (state.day.staff[id] ||= {});
const person = id => state.staff.find(p => p.id === id);

// ---------- tiny DOM helper ----------

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 3500);
}

const select = (value, options, onchange) => h('select', { onchange: e => onchange(e.target.value) },
  options.map(o => {
    const [v, label] = Array.isArray(o) ? o : [o, o || '—'];
    return h('option', { value: v, selected: v === value }, label);
  }));

const fileButton = (label, accept, multiple, onfiles) => h('label', { class: 'btn' }, label,
  h('input', { type: 'file', accept, multiple, hidden: true, onchange: async e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) await onfiles(f); } }));

async function readWorkbook(file) {
  const wb = new window.ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  if (/\.csv$/i.test(file.name)) {
    const ws = wb.addWorksheet('csv');
    const text = new TextDecoder().decode(buf);
    for (const line of text.split(/\r?\n/)) if (line.trim()) ws.addRow(parseCsvLine(line));
    return wb;
  }
  await wb.xlsx.load(buf);
  return wb;
}

function parseCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

function download(name, blob) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- render ----------

const app = document.getElementById('app');
function render() {
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)));
  const y = window.scrollY;
  if (state.tab === 'day') state.tab = 'cases';
  colourCache.clear();
  if (state.tab === 'seniors' || state.tab === 'juniors') { state.staffRole = state.tab === 'juniors' ? 'junior' : 'senior'; state.tab = 'staff'; }
  if (state.tab === 'general' || state.tab === 'manpower') { state.monthlyView = state.tab === 'manpower' ? 'today' : state.monthlyView; state.tab = 'monthly'; }
  if (!['monthly', 'roster', 'premed', 'cases', 'staff', 'settings'].includes(state.tab)) state.tab = 'staff';
  personCache.clear();
  syncMonthly();
  app.replaceChildren(({ monthly: renderMonthly, roster: renderRoster, premed: renderPremed, cases: () => renderDay('cases'), staff: renderStaffTab, settings: renderSettings })[state.tab]());
  renderCloudBar();
  renderDateBar();
  renderDemoBar();
  window.scrollTo(0, y);
  save();
}
// Each date keeps its own manpower, calls, cases and roster. Switching the header date puts
// the current day away and brings up the other one (empty if it's new).
function switchDate(date) {
  if (!date || date === state.day.date) return;
  (state.days ||= {})[state.day.date] = { day: state.day, roster: state.roster };
  const rec = state.days[date];
  delete state.days[date];
  state.day = rec?.day || { date, rooms: [], staff: {} };
  state.day.date = date;
  state.roster = rec?.roster || null;
  syncRooms();
  undoStack = []; editing = null;
  lastRows = state.roster ? JSON.stringify(state.roster.rows) : null;
  render();
}

// The demo banner: what this is, and the way back out.
function renderDemoBar() {
  if (!DEMO || document.getElementById('demo-bar')) return;
  document.body.prepend(h('div', { id: 'demo-bar', class: 'demo-bar' },
    h('b', {}, 'Demo'), h('span', {}, ' · made-up staff and rosters, saved only in this browser, nothing is shared.'),
    h('span', { class: 'grow' }),
    h('button', { class: 'small', onclick: () => { if (confirm('Start the demo again from scratch?')) { try { localStorage.removeItem(KEY); } catch { /* no storage */ } location.reload(); } } }, 'Reset demo'),
    h('a', { class: 'btn small', href: location.pathname }, 'Exit demo')));
}

// One date for the whole workspace, in the header.
function renderDateBar() {
  const el = document.getElementById('date');
  if (!el) return;
  const input = el.querySelector('input') || el.appendChild(h('label', {}, 'Roster for ', h('input', { type: 'date', onchange: e => { if (e.target.value) switchDate(e.target.value); } }))).querySelector('input');
  if (input.value !== state.day.date) input.value = state.day.date || '';
}

document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', async () => {
  const t = b.dataset.tab;
  if (staffEditing() && t !== 'staff' && !(await finishStaffEdit())) return;
  state.tab = t; window.scrollTo(0, 0); render();
}));

// ----- staff tab -----

let staffFilter = '';
let tickMin = 1;
let staffBackup = null; // copy of the staff list taken when editing starts; null when not editing
const staffEditing = () => staffBackup !== null;
const who = () => (typeof rostererName === 'string' && rostererName.trim()) || cs?.user?.displayName || cs?.user?.email || 'this browser';

const subLabel = k => state.settings.subspecs.find(s => s.key === k)?.label || k;
const listText = a => (a || []).join(', ') || 'none';

// What changed between two staff lists, as readable lines.
function diffStaff(before, after) {
  const out = [];
  const old = Object.fromEntries(before.map(p => [p.id, p]));
  const now = Object.fromEntries(after.map(p => [p.id, p]));
  for (const p of after) {
    const o = old[p.id];
    if (!o) { out.push(`Added ${p.role} ${p.name || '(no name)'} (${p.grade}${p.posting ? ', ' + p.posting : ''}${(p.subspecs || []).length ? ', ' + p.subspecs.map(subLabel).join('/') : ''})`); continue; }
    const c = [];
    if (o.name !== p.name) c.push(`renamed from ${o.name}`);
    if (o.role !== p.role) c.push(`moved ${o.role} → ${p.role}`);
    if (o.grade !== p.grade) c.push(`grade ${o.grade} → ${p.grade}`);
    if ((o.posting || '') !== (p.posting || '')) c.push(`posting ${o.posting || 'none'} → ${p.posting || 'none'}`);
    const colourName = k => COLOURS.find(x => x[0] === (k || ''))[1].toLowerCase();
    if ((o.colour || '') !== (p.colour || '')) c.push(`colour ${colourName(o.colour)} → ${colourName(p.colour)}`);
    if (listText(o.aliases) !== listText(p.aliases)) c.push(`short names ${listText(o.aliases)} → ${listText(p.aliases)}`);
    const os = new Set(o.subspecs || []), ns = new Set(p.subspecs || []);
    const plus = [...ns].filter(k => !os.has(k)).map(k => '+' + subLabel(k)), minus = [...os].filter(k => !ns.has(k)).map(k => '−' + subLabel(k));
    if (plus.length || minus.length) c.push(`subspecs ${[...plus, ...minus].join(' ')}`);
    if (listText(o.avoid) !== listText(p.avoid)) c.push(`doesn't do ${listText(o.avoid)} → ${listText(p.avoid)}`);
    if (c.length) out.push(`${p.name}: ${c.join('; ')}`);
  }
  for (const o of before) if (!now[o.id]) out.push(`Removed ${o.role} ${o.name}`);
  return out;
}

// A modal listing changes. Resolves to one of the button keys.
function confirmChanges(title, lines, buttons) {
  return new Promise(resolve => {
    const dlg = h('dialog', { class: 'changes' },
      h('h2', {}, title),
      h('ul', {}, lines.slice(0, 300).map(l => h('li', {}, l))),
      lines.length > 300 ? h('p', { class: 'hint' }, `…and ${lines.length - 300} more.`) : null,
      h('div', { class: 'bar' }, buttons.map(([key, label, cls]) => h('button', { class: cls || '', onclick: () => {
        if (Date.now() - opened < 300) return; // ignore the key press that opened the dialog
        dlg.close(); dlg.remove(); resolve(key);
      } }, label))));
    const opened = Date.now();
    dlg.addEventListener('cancel', e => { e.preventDefault(); dlg.close(); dlg.remove(); resolve('back'); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

function startStaffEdit() { staffBackup = clone(state.staff); render(); }

// Ask to keep or discard edits. Resolves true when editing has ended.
async function finishStaffEdit() {
  if (!staffEditing()) return true;
  const changes = diffStaff(staffBackup, state.staff);
  if (!changes.length) { staffBackup = null; render(); return true; }
  const choice = await confirmChanges(`Save ${changes.length} change${changes.length > 1 ? 's' : ''} to the staff list?`, changes,
    [['save', 'Save changes', 'primary'], ['back', 'Keep editing'], ['discard', 'Discard changes']]);
  if (choice === 'back') return false;
  if (choice === 'discard') state.staff = staffBackup;
  else (state.staffLog ||= []).unshift({ at: Date.now(), by: who(), changes }), state.staffLog.splice(300);
  staffBackup = null;
  render();
  if (choice === 'save') toast(isMember() ? 'Changes saved here. Use "Save for the team" to share them.' : 'Changes saved.');
  return true;
}

function staffLogCard() {
  const log = state.staffLog || [];
  if (!log.length) return null;
  return h('section', { class: 'card' }, h('details', {},
    h('summary', {}, `Change history (${log.length})`),
    h('ul', { class: 'log' }, log.map(e => h('li', {},
      h('div', { class: 'seen' }, `${when(e.at)} · ${e.by}`),
      h('ul', {}, e.changes.map(c => h('li', {}, c))))))));
}

// The Staff tab: seniors or juniors, read-only until Edit.
function renderStaffTab() {
  const role = ['junior', 'postings'].includes(state.staffRole) ? state.staffRole : 'senior';
  const pick = (r, label) => h('button', { 'aria-pressed': String(role === r), onclick: () => { state.staffRole = r; staffFilter = ''; render(); } }, label);
  const n = r => state.staff.filter(p => p.role === r).length;
  return h('div', {}, h('div', { class: 'seg subtabs', role: 'group', 'aria-label': 'Staff' },
    pick('senior', `Seniors (${n('senior')})`), pick('junior', `Juniors (${n('junior')})`), pick('postings', 'Postings')),
    role === 'postings' ? renderPostings() : renderStaff(role));
}

// Junior postings: changed here (with the staff list's Edit), later from the posting roster.
function renderPostings() {
  const editing = staffEditing();
  const list = state.staff.filter(p => p.role === 'junior')
    .filter(p => !staffFilter || (p.name + ' ' + (p.aliases || []).join(' ')).toLowerCase().includes(staffFilter.toLowerCase()))
    .sort((a, b) => (postingName(a.posting) || '~').localeCompare(postingName(b.posting) || '~') || bySeniority(a, b));
  const counts = {};
  for (const p of state.staff) if (p.role === 'junior') counts[p.posting || ''] = (counts[p.posting || ''] || 0) + 1;
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Postings'),
      h('p', { class: 'hint' }, 'Each junior\'s current posting. It shows after their name on the roster, e.g. "(RA)", and matches them to lists that suit it. Uploading the posting roster will come later.'),
      editing
        ? h('div', { class: 'bar sync dirty' }, h('span', {}, 'Editing the staff list.'), h('button', { class: 'primary', onclick: finishStaffEdit }, 'Review & save changes'))
        : h('div', { class: 'bar' }, h('button', { onclick: startStaffEdit }, 'Edit postings'), h('span', { class: 'grow' }),
          h('input', { placeholder: 'Filter names', value: staffFilter, oninput: e => { staffFilter = e.target.value; const pos = e.target.selectionStart; render(); const i = app.querySelector('input[placeholder="Filter names"]'); i.focus(); i.setSelectionRange(pos, pos); } })),
      h('div', { class: 'stats' }, POSTINGS.filter(([k]) => counts[k]).map(([k, label]) => h('span', {}, h('b', {}, counts[k]), ' ', k ? label : 'no posting')))),
    h('section', { class: 'card scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Name', 'Grade', 'Posting'].map(t => h('th', {}, t)))),
      h('tbody', {}, list.map(p => h('tr', {},
        h('td', {}, h('b', { style: colourStyle(p.name) }, p.name)),
        h('td', { class: 'seen' }, p.grade),
        h('td', {}, editing ? select(p.posting || '', POSTINGS, v => { p.posting = v; render(); }) : postingName(p.posting) || '—')))))));
}

function renderStaff(role) {
  if (!staffEditing()) return renderStaffView(role);
  const subs = state.settings.subspecs;
  const senior = role === 'senior';
  const list = state.staff
    .filter(p => p.role === role)
    .filter(p => !staffFilter || (p.name + ' ' + (p.aliases || []).join(' ')).toLowerCase().includes(staffFilter.toLowerCase()))
    .sort(bySeniority);

  const row = p => h('tr', { 'data-id': p.id, class: staffHighlight === p.id ? 'highlight' : '' },
    h('td', {}, h('input', { value: p.name, onchange: e => { p.name = e.target.value.trim(); save(); } })),
    h('td', {}, h('input', { value: (p.aliases || []).join(', '), placeholder: 'e.g. Koh YW', onchange: e => { p.aliases = splitNameList(e.target.value); save(); } })),
    h('td', {}, select(p.grade, p.role === 'senior' ? SENIOR_GRADES : JUNIOR_GRADES, v => { p.grade = v; if (v === 'Locum' && !p.colour) p.colour = 'purple'; render(); })),
    !senior && h('td', {}, select(p.colour || '', COLOURS, v => { p.colour = v; render(); })),
    senior && h('td', {}, h('div', { class: 'chips' }, subs.map(s => {
        const on = (p.subspecs || []).includes(s.key);
        return h('span', { class: 'chip' + (on ? ' on' : ''), title: s.hard ? 'Only seniors with this subspec get these lists' : '', onclick: () => {
          p.subspecs = on ? p.subspecs.filter(k => k !== s.key) : [...(p.subspecs || []), s.key]; render();
        } }, s.label);
      }))),
    senior && h('td', {}, h('input', { value: (p.avoid || []).join(', '), placeholder: 'e.g. eye, obs', onchange: e => { p.avoid = splitNameList(e.target.value).map(s => s.toLowerCase()); save(); } })),
    h('td', {}, select(p.role, [['senior', 'Senior'], ['junior', 'Junior']], v => {
      p.role = v;
      if (!(v === 'senior' ? SENIOR_GRADES : JUNIOR_GRADES).includes(p.grade)) p.grade = DEFAULT_GRADE[v];
      if (v === 'senior') { p.colour = ''; p.posting = ''; }
      render();
      toast(`Moved ${p.name || 'them'} to ${v === 'senior' ? 'Seniors' : 'Juniors'}.`);
    })),
    h('td', {}, h('button', { class: 'small', title: 'Remove', onclick: () => { if (confirm(`Remove ${p.name}?`)) { state.staff = state.staff.filter(x => x !== p); render(); } } }, '✕')),
  );

  const count = state.staff.filter(p => p.role === role).length;
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, senior ? 'Seniors' : 'Juniors'),
      h('p', { class: 'hint' }, senior
        ? 'Tick each senior\'s subspecs and the lists they don\'t do. "Move to" moves someone to the juniors.'
        : 'Set each junior\'s grade and colour (postings are on the Postings tab). Green marks a Baby MO: never left alone, so their senior won\'t double cover. Purple marks locums. "Move to" moves someone to the seniors.'),
      h('div', { class: 'bar sync dirty' },
        h('span', {}, `Editing the staff list. ${diffStaff(staffBackup, state.staff).length} change(s) so far; nothing is kept until you review and save.`),
        h('button', { class: 'primary', onclick: finishStaffEdit }, 'Review & save changes'),
        h('button', { onclick: () => { if (confirm('Discard all changes since you started editing?')) { state.staff = staffBackup; staffBackup = null; render(); } } }, 'Cancel')),
      h('div', { class: 'bar' },
        fileButton('Import staff sheet or contact list', '.xlsx,.csv', false, importStaffSheet),
        fileButton('Learn from past rosters', '.xlsx', true, learnFiles),
        senior && h('span', { class: 'btn-group' },
          h('button', { title: 'Tick each senior\'s subspecs from the subspec lists they did in past rosters you loaded. Only adds ticks.', onclick: () => {
            const n = tickFromHistory(state.staff, tickMin);
            render();
            toast(n ? `Ticked ${n} subspec(s). Check them before generating.` : 'Nothing new to tick.');
          } }, 'Tick subspecs from past rosters'),
          h('label', { class: 'seen' }, ' if seen ≥ ', h('input', { type: 'number', min: 1, max: 20, value: tickMin, style: 'width:56px', onchange: e => { tickMin = Math.max(1, +e.target.value || 1); } }), ' times')),
        h('button', { title: 'Look for people on the staff list twice under different spellings', onclick: () => { showDups = true; render(); } }, 'Find duplicates'),
        h('button', { title: 'Fill in short names (e.g. Koh YW, Anjali) for everyone who has none', onclick: () => {
          const props = suggestShortNames(state.staff);
          if (!props.length) return toast('Everyone already has a short name, or the suggestions would clash.');
          const eg = props.slice(0, 6).map(x => `${x.name} → ${x.short}`).join('\n');
          if (!confirm(`Add short names for ${props.length} people (seniors and juniors)?\n\n${eg}${props.length > 6 ? '\n…' : ''}\n\nYou can edit any of them afterwards.`)) return;
          for (const x of props) { const p = state.staff.find(s => s.id === x.id); if (p) p.aliases = [x.short]; }
          render();
          toast(`Added ${props.length} short names. Check them, then save for the team.`);
        } }, 'Suggest short names'),
        h('button', { onclick: () => { state.staff.unshift({ id: newId(), name: '', aliases: [], role, grade: DEFAULT_GRADE[role], posting: '', subspecs: [], avoid: [], history: {} }); staffFilter = ''; render(); } }, senior ? '+ Add senior' : '+ Add junior'),
        h('span', { class: 'grow' }),
        h('input', { placeholder: 'Filter names', value: staffFilter, oninput: e => { staffFilter = e.target.value; const pos = e.target.selectionStart; render(); const i = app.querySelector('input[placeholder="Filter names"]'); i.focus(); i.setSelectionRange(pos, pos); } }),
      ),
      h('div', { class: 'stats' }, h('span', {}, h('b', {}, count), senior ? ' seniors' : ' juniors')),
      importSkipNote(),
    ),
    duplicatesCard(),
    count
      ? h('section', { class: 'card scroll' }, h('table', {},
        h('thead', {}, h('tr', {}, (senior ? ['Name', 'Short names', 'Grade', 'Subspecs', "Doesn't do", 'Move to', ''] : ['Name', 'Short names', 'Grade', 'Colour', 'Move to', '']).map(t => h('th', {}, t)))),
        h('tbody', {}, list.map(row))))
      : h('section', { class: 'card empty' }, `No ${senior ? 'seniors' : 'juniors'} yet. Import the master staff sheet, or load a few past rosters to build the list automatically.`),
  );
}

function renderStaffView(role) {
  const subs = state.settings.subspecs;
  const senior = role === 'senior';
  const list = state.staff
    .filter(p => p.role === role)
    .filter(p => !staffFilter || (p.name + ' ' + (p.aliases || []).join(' ')).toLowerCase().includes(staffFilter.toLowerCase()))
    .sort(bySeniority);
  const count = state.staff.filter(p => p.role === role).length;
  const row = p => h('tr', {},
    h('td', {}, h('b', { style: staffColour(p) ? `color:#${COLOUR_ARGB[staffColour(p)].slice(2)}` : '' }, p.name)),
    h('td', {}, (p.aliases || []).join(', ')),
    h('td', {}, p.grade),
    !senior && h('td', { class: 'seen' }, COLOURS.find(c => c[0] === staffColour(p))[1]),
    senior
      ? h('td', {}, h('div', { class: 'chips' }, (p.subspecs || []).map(k => h('span', { class: 'chip on static' }, subLabel(k)))))
      : null,
    senior && h('td', {}, (p.avoid || []).join(', ')),
  );
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, senior ? 'Seniors' : 'Juniors'),
      h('p', { class: 'hint' }, senior
        ? 'The seniors the roster is generated from, with their subspecs and the lists they don\'t do.'
        : 'The juniors the roster is generated from, with their grade. Postings are on the Postings tab.'),
      teamSyncBar(),
      h('div', { class: 'bar' },
        h('button', { onclick: startStaffEdit }, `Edit ${senior ? 'seniors' : 'juniors'}`),
        h('button', { title: 'Look for people on the staff list twice under different spellings', onclick: () => { showDups = true; startStaffEdit(); } }, 'Find duplicates'),
        h('span', { class: 'grow' }),
        h('input', { placeholder: 'Filter names', value: staffFilter, oninput: e => { staffFilter = e.target.value; const pos = e.target.selectionStart; render(); const i = app.querySelector('input[placeholder="Filter names"]'); i.focus(); i.setSelectionRange(pos, pos); } })),
      h('div', { class: 'stats' }, h('span', {}, h('b', {}, count), senior ? ' seniors' : ' juniors')),
    ),
    count
      ? h('section', { class: 'card scroll' }, h('table', {},
        h('thead', {}, h('tr', {}, (senior ? ['Name', 'Short names', 'Grade', 'Subspecs', "Doesn't do"] : ['Name', 'Short names', 'Grade', 'Colour']).map(t => h('th', {}, t)))),
        h('tbody', {}, list.map(row))))
      : h('section', { class: 'card empty' }, `No ${senior ? 'seniors' : 'juniors'} yet. Click Edit to import the master staff sheet or learn from past rosters.`),
    staffLogCard(),
  );
}

async function importStaffSheet([file]) {
  const wb = await readWorkbook(file);
  const ws = wb.worksheets[0];
  const contact = isContactList(ws);
  let people;
  if (contact) people = readContactList(ws).people;
  else {
    const res = readStaffSheet(ws);
    if (res.error) return toast(res.error);
    people = res.people;
  }
  const plan = planImport(state.staff, people, { contact, skip: state.settings.importSkip || [] });
  const done = await reviewImport(plan, contact, file.name);
  if (!done) return;
  render();
  toast(`${done} Review the changes before saving.`);
}

// The import, person by person, before anything changes. Nobody is ticked to start with.
// Resolves to a summary, or null if cancelled.
function reviewImport(plan, contact, fileName) {
  const label = p => `${p.name} (${p.role === 'senior' ? 'senior' : 'junior'}, ${p.grade})`;
  const dec = new Map(); // item -> { on, how, always }
  const rowOf = new Map(); // item -> its tick box
  const refresh = () => { for (const [it, d] of dec) { const cb = rowOf.get(it); if (cb) cb.checked = d.on; } };
  for (const it of plan.items) dec.set(it, { on: false, how: it.kind === 'maybe' ? 'same:' + it.candidates[0].id : '', always: false });
  const removeStale = new Set();
  const of = k => plan.items.filter(i => i.kind === k);
  const tick = (checked, onchange) => h('input', { type: 'checkbox', checked, onchange: e => onchange(e.target.checked) });
  const alwaysOf = new Map(); // item -> its Always skip box
  const always = it => {
    const cb = tick(false, v => { dec.get(it).always = v; if (v) { dec.get(it).on = false; refresh(); } });
    alwaysOf.set(it, cb);
    return h('label', { class: 'check seen', title: 'Never offer this name again when importing' }, cb, ' Always skip');
  };
  const person = (it, extra) => {
    // ticking someone in undoes Always skip
    const cb = tick(false, v => { dec.get(it).on = v; if (v && dec.get(it).always) { dec.get(it).always = false; alwaysOf.get(it).checked = false; } });
    rowOf.set(it, cb);
    return h('tr', {},
      h('td', {}, h('label', { class: 'check' }, cb, ' ', h('b', {}, it.c.name)), h('div', { class: 'seen' }, `${it.c.role}, ${it.c.grade}`)),
      h('td', {}, extra || null), h('td', {}, always(it)));
  };
  // a section with Select all / Clear for its checkboxes
  const section = (title, hint, rows, closed) => {
    if (!rows.length) return null;
    const body = h('div', {}, hint ? h('p', { class: 'hint' }, hint) : null, h('table', {}, h('tbody', {}, rows)));
    // Select all leaves out names set to Always skip
    const setAll = v => { for (const cb of body.querySelectorAll('td:first-child input[type=checkbox]')) if (cb.checked !== v && !(v && cb.closest('tr').querySelector('td:last-child input')?.checked)) { cb.checked = v; cb.dispatchEvent(new Event('change')); } };
    const head = [h('h3', { style: 'display:inline' }, `${title} (${rows.length})`), ' ',
      h('button', { class: 'small', onclick: e => { e.preventDefault(); setAll(true); } }, 'Select all'), ' ',
      h('button', { class: 'small', onclick: e => { e.preventDefault(); setAll(false); } }, 'Clear')];
    return closed ? h('section', {}, h('details', {}, h('summary', {}, ...head), body)) : h('section', {}, h('div', { class: 'section-head' }, ...head), body);
  };

  return new Promise(resolve => {
    const close = v => { dlg.close(); dlg.remove(); resolve(v); };
    const apply = () => {
      const skip = new Set(state.settings.importSkip || []);
      const byId = new Map(state.staff.map(p => [p.id, p]));
      const added = [];
      let updated = 0;
      const create = c => ({ id: newId(), source: contact ? 'contact' : 'sheet', name: c.name, aliases: c.aliases || [], role: c.role, grade: c.grade, posting: c.posting || '', subspecs: c.subspecs || [], avoid: c.avoid || [], history: {} });
      for (const it of plan.items) {
        const d = dec.get(it);
        if (!d) continue;
        if (d.always) { skip.add(it.c.name); continue; }
        if (!d.on) continue;
        if (it.kind === 'match') { byId.set(it.p.id, it.p); updated++; }
        else if (it.kind === 'maybe' && d.how.startsWith('same:')) { const t = byId.get(d.how.slice(5)); if (t) { byId.set(t.id, importUpdate(t, it.c, contact).p); updated++; } }
        else added.push(create(it.c));
      }
      for (const p of removeStale) byId.delete(p.id);
      state.staff = [...byId.values(), ...added];
      state.settings.importSkip = [...skip];
      close(`${fileName}: ${added.length} added, ${updated} updated${removeStale.size ? `, ${removeStale.size} removed` : ''}.`);
    };
    const dlg = h('dialog', { class: 'changes wide' },
      h('h2', {}, `Import ${fileName}`),
      h('p', { class: 'hint' }, `${plan.items.length} people read${contact ? ' (names, grades and subspecs only)' : ''}. Tick the people to bring in; nothing changes until you press Import.`),
      h('div', { class: 'import-review' },
        section('Might already be on the list', 'These look like someone already here, written differently. Pick who they are, or add them as a new person.',
          of('maybe').map(it => person(it, select(dec.get(it).how, [...it.candidates.map(p => ['same:' + p.id, `Same as ${label(p)}`]), ['add', 'Add as a new person']], v => { dec.get(it).how = v; })))),
        section('New people', null, of('new').map(it => person(it))),
        section('New juniors', 'Junior postings rotate, so juniors who aren\'t on the staff list usually stay out.', of('newJunior').map(it => person(it)), true),
        section('Changes to people on the list', null, of('match').filter(it => it.changes.length).map(it => h('tr', {},
          h('td', {}, h('label', { class: 'check' }, tick(false, v => { dec.get(it).on = v; }), ' ', h('b', {}, it.p.name))),
          h('td', { class: 'seen', colspan: 2 }, it.changes.join('; '))))),
        section('No longer on the contact list', 'Added by an earlier import of the contact list but not on this one. Tick to remove them.', plan.stale.map(p => h('tr', {},
          h('td', {}, h('label', { class: 'check' }, tick(false, v => { if (v) removeStale.add(p); else removeStale.delete(p); }), ' Remove ', h('b', {}, p.name))),
          h('td', { class: 'seen', colspan: 2 }, p.grade)))),
        h('p', { class: 'seen' }, `${of('match').filter(it => !it.changes.length).length} already on the list with nothing to change.${of('skipped').length ? ` ${of('skipped').length} always skipped.` : ''}`)),
      h('div', { class: 'bar' },
        h('button', { class: 'primary', onclick: apply }, 'Import'),
        h('button', { onclick: () => close(null) }, 'Cancel')));
    dlg.addEventListener('cancel', e => { e.preventDefault(); close(null); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

// ---- duplicates on the staff list ----

let showDups = false;
// Move a person's day records (status, flags, fixed rooms) to the person they were merged into.
function remapStaffId(from, to) {
  const days = [state.day, ...Object.values(state.days || {}).map(r => r.day)].filter(Boolean);
  for (const d of days) {
    if (d.staff?.[from]) {
      // keep whichever of the two isn't simply available (e.g. on leave)
      const a = d.staff[to], b = d.staff[from];
      d.staff[to] = !a ? b : (a.status || 'avail') === 'avail' && (b.status || 'avail') !== 'avail' ? { ...a, ...b } : { ...b, ...a };
      delete d.staff[from];
    }
    for (const r of d.rooms || []) { if (r.lockSenior === from) r.lockSenior = to; if (r.lockJunior === from) r.lockJunior = to; }
  }
}
function mergePair(keep, drop) {
  state.staff = state.staff.filter(p => p !== drop).map(p => p === keep ? mergeStaffRecords(keep, drop) : p);
  remapStaffId(drop.id, keep.id);
  toast(`Merged ${drop.name} into ${keep.name}. ${drop.name} is kept as a short name.`);
  render();
}
function duplicatesCard() {
  if (!showDups) return null;
  const pairs = findDuplicates(state.staff);
  const who = p => h('div', {}, h('b', {}, p.name), h('div', { class: 'seen' }, `${p.role === 'senior' ? 'Senior' : 'Junior'} · ${p.grade}${(p.aliases || []).length ? ' · ' + p.aliases.join(', ') : ''}`));
  return h('section', { class: 'card' },
    h('div', { class: 'bar' }, h('h2', { class: 'grow', style: 'margin:0' }, `Possible duplicates (${pairs.length})`), h('button', { onclick: () => { showDups = false; render(); } }, 'Close')),
    pairs.length
      ? h('table', {}, h('tbody', {}, pairs.map(({ a, b }) => h('tr', {},
        h('td', {}, who(a)), h('td', {}, who(b)),
        h('td', {}, h('div', { class: 'btn-group' },
          h('button', { title: `Keep ${a.name}; ${b.name} becomes a short name`, onclick: () => mergePair(a, b) }, `Keep ${a.name}`),
          h('button', { title: `Keep ${b.name}; ${a.name} becomes a short name`, onclick: () => mergePair(b, a) }, `Keep ${b.name}`),
          h('button', { onclick: () => { a.notDup = [...new Set([...(a.notDup || []), b.id])]; b.notDup = [...new Set([...(b.notDup || []), a.id])]; render(); } }, 'Different people')))))))
      : h('p', { class: 'hint' }, 'No likely duplicates.'));
}
function importSkipNote() {
  const list = state.settings.importSkip || [];
  if (!list.length) return null;
  return h('details', { class: 'seen', style: 'margin-top:8px' }, h('summary', {}, `${list.length} name(s) are always skipped when importing`),
    h('div', { class: 'chips', style: 'margin-top:6px' }, list.map(n => h('span', { class: 'chip static' }, n, ' ',
      h('button', { class: 'link', title: 'Import this name again next time', onclick: () => { state.settings.importSkip = list.filter(x => x !== n); render(); } }, '×')))));
}

async function learnFiles(files) {
  let staff = state.staff, rooms = [];
  for (const f of files) {
    const wb = await readWorkbook(f);
    const res = learnFromRosters(readRosterRows(wb.worksheets[0]), staff, state.settings);
    staff = res.staff;
    for (const r of res.rooms) if (!rooms.some(x => x.name === r.name)) rooms.push(r);
  }
  const before = state.staff.length;
  state.staff = staff;
  nextId = 1 + staff.reduce((m, p) => Math.max(m, parseInt(String(p.id).replace(/\D/g, ''), 10) || 0), 0);
  const newRooms = rooms.filter(r => !state.roomTemplate.some(t => t.name === r.name));
  if (newRooms.length) { state.roomTemplate.push(...newRooms.map(r => ({ ...r, defaultOn: true }))); syncRooms(); }
  toast(`Read ${files.length} roster(s): ${staff.length - before} new people${newRooms.length ? `, ${newRooms.length} new rooms` : ''}. Check roles, grades and subspecs.`);
  render();
}

// ----- day tab -----

const pasteText = { leave: '', postcall: '', elsewhere: '', admin: '', notAround: '' };
let unmatched = [];
let lockEditing = null;
let settingsEditing = false; // "roomId:lockSenior" while picking a fixed person on the Cases tab

function renderDay(part) {
  const cases = part === 'cases';
  const d = state.day;
  const subs = state.settings.subspecs;
  const running = d.rooms.filter(r => r.running);
  const avail = role => state.staff.filter(p => p.role === role && (dayOf(p.id).status || 'avail') === 'avail').length;
  const names = h('datalist', { id: 'staffNames' }, state.staff.map(p => h('option', { value: p.name })));

  // fixed senior / junior: a chip, picked from the staff list only (no typing in new names)
  const lockInput = (r, key) => {
    const p = r[key] && person(r[key]);
    if (p) return personChip(p, { class: 'name pchip lock-chip', onclick: e => openPersonBox(e.currentTarget, p, { kind: 'lock', room: r, key }) },
      h('span', { class: 'icon del', title: 'Let the roster choose', onclick: e => { e.stopPropagation(); r[key] = ''; render(); } }, '×'));
    const id = r.id + ':' + key;
    if (lockEditing !== id) return h('button', { class: 'add-name', title: 'Fix someone to this room', onclick: () => { lockEditing = id; render(); } }, '+');
    const pick = v => {
      if (lockEditing !== id) return; // the change event that follows Enter
      const q = String(v).trim();
      const exact = state.staff.find(s => s.name === q && s.role === (key === 'lockSenior' ? 'senior' : 'junior'));
      const m = exact ? { person: exact } : matchName(q, state.staff.filter(s => s.role === (key === 'lockSenior' ? 'senior' : 'junior')));
      if (!q) { lockEditing = null; render(); return; }
      if (!m.person) { toast(m.ambiguous ? `"${q}" could be ${m.ambiguous.map(x => x.name).join(' or ')}` : `"${q}" isn't on the staff list. Add them on the Staff tab first.`); return; }
      r[key] = m.person.id; lockEditing = null; render();
    };
    const input = nameInput({ class: 'cell-input', placeholder: 'Pick from the staff list',
      onkeydown: e => { if (e.key === 'Escape') { lockEditing = null; render(); } if (e.key === 'Enter') { e.preventDefault(); pick(e.target.value); } },
      onchange: e => { if (state.staff.some(s => s.name === e.target.value)) pick(e.target.value); },
      onblur: e => setTimeout(() => { if (lockEditing === id && !e.target.value.trim()) { lockEditing = null; render(); } }, 150) },
    key === 'lockSenior' ? 'senior' : 'junior');
    setTimeout(() => input.focus());
    return input;
  };

  const roomRow = r => h('tr', { class: r.running ? '' : 'off' },
    h('td', {}, h('input', { type: 'checkbox', checked: r.running, 'aria-label': 'Running', onchange: e => { r.running = e.target.checked; if (r.running && !r.flagsManual) r.flags = suggestFlags(r.notes, state.settings, r.name); render(); } })),
    h('td', {}, h('b', {}, r.name)),
    h('td', {}, select(r.session || 'full', [['full', 'Full'], ['am', 'AM'], ['pm', 'PM']], v => { r.session = v; save(); })),
    h('td', {}, h('input', { value: r.notes, placeholder: 'e.g. eye 5y', onchange: e => {
      r.notes = e.target.value;
      if (e.target.value.trim()) r.running = true;
      if (!r.flagsManual) r.flags = suggestFlags(r.notes, state.settings, r.name);
      render();
    } })),
    h('td', {}, h('div', { class: 'chips' },
      subs.map(s => {
        const on = r.flags.subspecs.includes(s.key);
        return h('span', { class: 'chip' + (on ? ' on' : ''), onclick: () => { r.flagsManual = true; r.flags.subspecs = on ? r.flags.subspecs.filter(k => k !== s.key) : [...r.flags.subspecs, s.key]; render(); } }, s.label);
      }),
      h('span', { class: 'chip' + (r.flags.complex ? ' on' : ''), title: 'No double cover, no MOPEX/Baby MO if avoidable, no liver standby senior', onclick: () => { r.flagsManual = true; r.flags.complex = !r.flags.complex; render(); } }, 'Complex'),
      h('span', { class: 'chip' + (r.flags.long ? ' on' : ''), title: 'Runs late: avoid people who need to leave early', onclick: () => { r.flagsManual = true; r.flags.long = !r.flags.long; render(); } }, 'Runs late'),
    )),
    h('td', {}, lockInput(r, 'lockSenior')),
    h('td', {}, lockInput(r, 'lockJunior')),
  );

  const pasteBox = (key, label, hint) => h('div', {},
    h('label', {}, label),
    h('textarea', { placeholder: hint, value: pasteText[key], oninput: e => { pasteText[key] = e.target.value; } }));

  return h('div', {},
    names,
    h('section', { class: 'card' },
      h('h2', {}, cases ? 'Cases' : 'Manpower'),
      h('div', { class: 'bar' },
        fileButton('Load draft roster (.xlsx)', '.xlsx', false, loadDraft),
        cases
          ? h('button', { onclick: () => { if (confirm('Clear the running rooms and case notes for this day? Rooms go back to "running by default".')) { d.rooms = []; syncRooms(); render(); } } }, 'Clear cases')
          : h('button', { onclick: () => { if (confirm('Clear leave, post call and other statuses for this day?')) { d.staff = {}; d.lists = {}; render(); } } }, 'Clear manpower'),
      ),
      h('p', { class: 'hint' }, "\"Load draft roster\" reads the admin team's draft in the usual format: it picks up running rooms, case notes, leave, post call and upper-half duties."),
      unmatched.length ? h('ul', { class: 'warnings', style: 'margin-bottom:12px' }, h('li', { class: 'warn' },
        `Names not matched to the staff list: ${unmatched.join(', ')}. Add them on the Staff tab, or add the short name to the right person, then load or apply again. `,
        h('button', { class: 'link', onclick: () => { unmatched = []; render(); } }, 'Dismiss'))) : null,
      h('div', { class: 'stats' },
        h('span', {}, h('b', {}, running.length), ' rooms running'),
        h('span', {}, h('b', {}, avail('senior')), ' seniors available'),
        h('span', {}, h('b', {}, avail('junior')), ' juniors available'),
      ),
    ),
    cases && h('section', { class: 'card scroll' },
      h('h2', {}, 'OT lists'),
      h('p', { class: 'hint' }, 'Tick the rooms that are running and type the case notes as usual. Flags are suggested from the notes (ages under ' + state.settings.paedsAgeYears + 'y count as paeds). Click a flag to change it. Fix a senior or junior to lock them in; the rest is filled automatically.'),
      h('table', {},
        h('thead', {}, h('tr', {}, ['Run', 'Room', 'Session', 'Case notes', 'Flags', 'Fixed senior', 'Fixed junior'].map(t => h('th', {}, t)))),
        h('tbody', {}, d.rooms.map(roomRow))),
    ),
    !cases && h('section', { class: 'card' },
      h('h2', {}, 'Paste from the leave sheet'),
      h('p', { class: 'hint' }, 'Paste names from the leave sheet: short forms like "Koh YW" or "Anjali" work. Separate names with commas or new lines.'),
      h('div', { class: 'paste' },
        pasteBox('leave', 'Leave', 'Koh YW, Ong KS'),
        pasteBox('postcall', 'Post call', ''),
        pasteBox('elsewhere', 'Elsewhere (SICU, EOT, epidural, pain, ECT…)', ''),
        pasteBox('admin', 'Admin / no list', ''),
        pasteBox('notAround', 'Juniors away on the previous working day', ''),
      ),
      h('div', { class: 'bar', style: 'margin-top:12px' }, h('button', { class: 'primary', onclick: applyPaste }, 'Apply names')),
    ),
  );
}

function markNames(names, fn) {
  const missed = [];
  for (const n of names) {
    const m = matchName(n, state.staff);
    if (m.person) {
      const d = dayOf(m.person.id);
      const before = [d.status, d.notAroundPrev];
      fn(d, m.person);
      if (d.status !== before[0]) d.manual = true;
      if (d.notAroundPrev !== before[1]) d.manualAway = true;
    } else missed.push(m.ambiguous ? `${n} (several matches)` : n);
  }
  return missed;
}

// Names as written on the leave sheet / draft, kept so the roster shows them the same way.
function addRaw(key, entries) {
  const lists = (state.day.lists ||= {});
  const list = (lists[key] ||= []);
  for (const e of entries.map(x => x.trim()).filter(Boolean)) if (!list.includes(e)) list.push(e);
}

// The post call / leave / admin lists for the sheet: raw entries that still apply, plus anyone
// whose status was set by hand and isn't listed yet.
function rosterLists() {
  const out = {};
  for (const key of ['postcall', 'leave', 'admin']) {
    const covered = new Set();
    const list = [];
    for (const e of state.day.lists?.[key] || []) {
      const p = matchName(e.replace(/\(.*?\)/g, '').trim(), state.staff).person;
      if (p) {
        if ((dayOf(p.id).status || 'avail') !== key) continue; // status changed since
        covered.add(p.id);
      }
      list.push(e);
    }
    for (const p of state.staff) {
      const st = state.day.staff[p.id]?.status || 'avail';
      if ((st === key || (key === 'leave' && st === 'mc')) && !covered.has(p.id)) list.push(shortName(p));
    }
    out[key] = list;
  }
  // people working today but on no list go on the Admin/no list row too
  for (const p of noListPeople()) out.admin.push(shortName(p));
  return out;
}

// Seniors and juniors who are available but not on any list of the roster (or the Calls/clinics tab).
function noListPeople() {
  const rows = state.roster?.date === state.day.date ? state.roster.rows : null;
  if (!rows) return [];
  const listed = new Set(generalPeople());
  for (const row of rows) for (const key of ['senior', 'junior']) for (const n of namesInCell(row[key])) {
    const p = matchName(n, state.staff).person;
    if (p) listed.add(p.id);
  }
  return state.staff.filter(p => (state.day.staff[p.id]?.status || 'avail') === 'avail' && !listed.has(p.id))
    .sort(bySeniority);
}

function applyPaste() {
  const missed = [];
  for (const [key, status] of [['leave', 'leave'], ['postcall', 'postcall'], ['elsewhere', 'elsewhere'], ['admin', 'admin']]) {
    missed.push(...markNames(splitNameList(pasteText[key]), s => { s.status = status; }));
    if (key !== 'elsewhere') addRaw(key, pasteText[key].split(/[\n,;\/\t]+/));
  }
  missed.push(...markNames(splitNameList(pasteText.notAround), s => { s.notAroundPrev = true; }));
  Object.keys(pasteText).forEach(k => { pasteText[k] = ''; });
  unmatched = missed;
  render();
  toast(missed.length ? `${missed.length} name(s) not matched` : 'All names matched.');
}

// The admin draft's top half: MOT/SICU block, duty rows, AOCC/AIC and AH OT.
function readUpperHalf(ws, d) {
  const g = (d.general = {});
  const fixed = (d.fixed = {});
  const byRow = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const t = c => cellText(row.getCell(c).value).trim();
    byRow[n] = { label: t(1).replace(/:\s*$/, '').toLowerCase(), c: t(3), f: t(6), i: t(9) };
  });
  const find = re => byRow.findIndex(x => x && re.test(x.label));
  const team = find(/^consultant$/);
  if (team > 0) TEAM_ROWS.forEach(([k], i) => {
    const x = byRow[team + i];
    if (!x) return;
    if (x.c && !/^mot$/i.test(x.c)) g['mot.' + k] = x.c;
    if (x.f && !/^sicu$/i.test(x.f)) g['sicu.' + k] = x.f;
  });
  const keys = { 'eot 8': 'eot8', 'eot 9': 'eot9', epidural: 'epi', 'cardiac call': 'cardiac', 'pain/acp clinic': 'painacp', 'acute pain': 'acute', 'chronic pain': 'chronic' };
  const strip = (v, t) => v.replace(new RegExp(`\\s*\\(${t}\\)\\s*$`, 'i'), '');
  byRow.forEach((x, n) => {
    if (!x) return;
    const k = keys[x.label];
    if (k === 'epi') { if (x.c) g['epi.s'] = x.c; if (x.f) g['epi.df'] = strip(x.f, 'DF'); if (x.i) g['epi.nf'] = strip(x.i, 'NF'); }
    if (x.label === 'adot' && x.c && !g['epi.s']) g['epi.s'] = x.c;
    if (x.label === 'ect') {
      const room = d.rooms.find(r => r.name === 'ECT');
      const who = t => matchName(namesInCell(t)[0] || '', state.staff).person;
      if (room) { room.running = true; room.lockSenior = who(x.c)?.id || ''; room.lockJunior = who(x.f)?.id || ''; }
    }
    else if (k) {
      if (x.c) g[k + '.s'] = x.c;
      if (x.f) g[k + '.a'] = x.f;
      if (k === 'eot9' && byRow[n + 1] && !byRow[n + 1].label && byRow[n + 1].f) g['eot9.a2'] = byRow[n + 1].f;
    }
    if (x.label === 'aocc') {
      if (x.c) fixed['aocc.s'] = x.c.replace(/\s*\(req\)\s*$/i, '');
      if (x.f) fixed['aocc.j'] = strip(x.f, 'AOCC');
      const aic = x.i.replace(/^AIC:\s*/i, '');
      if (aic) fixed.aic = aic;
    }
    if (/^ah ot/.test(x.label) && x.c) fixed.ahot = x.c;
  });
}

async function loadDraft([file]) {
  const wb = await readWorkbook(file);
  const ws = wb.worksheets[0];
  const rows = readRosterRows(ws);
  const dateCell = cellText(ws.getCell('C5').value).trim();
  const parsed = dateCell ? new Date(dateCell + ' 12:00') : null;
  // a draft for another date goes to that date; the current one is put away first
  const draftDate = parsed && !isNaN(parsed) ? `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}` : null;
  const moved = draftDate && draftDate !== state.day.date;
  if (moved) switchDate(draftDate);
  const d = state.day;

  // continuation lines (leave lists run over several rows with an empty label)
  const sections = {};
  let current = null;
  ws.eachRow({ includeEmpty: false }, row => {
    const label = cellText(row.getCell(1).value).trim();
    if (label) current = label.toLowerCase();
    if (!current) return;
    for (let c = 3; c <= 12; c++) {
      const t = cellText(row.getCell(c).value).trim();
      if (t) (sections[current] ||= []).push(t);
    }
  });
  const get = re => Object.entries(sections).filter(([k]) => re.test(k)).flatMap(([, v]) => v);

  // PACU rows aren't in the admin draft; keep them as set in Settings
  d.rooms.forEach(r => { r.running = isPacu(r.name) ? !!state.roomTemplate.find(t => t.name === r.name)?.defaultOn : false; });
  let rooms = 0;
  for (const r of rows) {
    const remote = remoteRoom(r.label);
    const pacu = pacuRoom(r.label);
    const m = (pacu ? [null, pacu, pacu.startsWith('MBOR') ? 'MOR' : pacu.split(' ')[0]] : null)
      || r.label.match(/((KROR|MCOR|MOR)\s*\d+)\s*$/i) || (remote ? [null, remote, 'Other'] : null);
    if (!m) continue;
    const name = pacu || remote || m[1].toUpperCase().replace(/\s+/, ' ');
    let room = d.rooms.find(x => x.name === name);
    if (!room) { state.roomTemplate.push({ complex: m[2] ? m[2].toUpperCase() : 'Other', name, defaultOn: true }); syncRooms(); room = d.rooms.find(x => x.name === name); }
    room.running = true;
    room.notes = r.notes;
    room.flagsManual = false;
    room.flags = suggestFlags(r.notes, state.settings, name);
    room.session = /\bam\b/i.test(r.senior) && !/\bpm\b/i.test(r.senior) && !r.notes ? 'am' : 'full';
    rooms++;
  }
  d.lists = { leave: get(/^leave/), postcall: get(/^post call/), admin: get(/^admin/) };
  const missed = [
    ...markNames(get(/^leave/).flatMap(splitNameList).filter(n => !/kiv/i.test(n)), s => { s.status = 'leave'; }),
    ...markNames(get(/^post call/).flatMap(splitNameList), s => { s.status = 'postcall'; }),
    ...markNames(get(/^admin/).flatMap(splitNameList), s => { s.status = 'admin'; }),
  ];
  readUpperHalf(ws, d);
  const upperLabels = /^(recovery|eot|epidural|adot|cardiac call|aocc|pain|acute pain|chronic pain|consultant|registrar|residents|ah ot|ah icu)/;
  const upperNames = Object.entries(sections).filter(([k]) => upperLabels.test(k)).flatMap(([, v]) => v)
    .flatMap(namesInCell).filter(n => !/^(MOT|SICU|AIC\b)/i.test(n)).map(n => n.replace(/^AIC:\s*/i, ''));
  markNames(upperNames, (s, p) => { if ((s.status || 'avail') === 'avail') s.status = 'elsewhere'; });
  unmatched = missed;
  render();
  toast(`Draft loaded${moved ? ` for ${draftDate}` : ''}: ${rooms} rooms.${missed.length ? ` ${missed.length} name(s) not matched.` : ''}`);
}

// ----- roster tab -----

// ---- names in roster cells: drag to swap or move, double-click to type ----

const PREMED = /\s*-\s*premed\s*$/i;
function cellParts(row, key) {
  return String(row[key] || '').split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean)
    .map(s => key === 'premed' ? s.replace(PREMED, '') : s);
}
function setCellParts(row, key, parts) {
  row[key] = parts.map(p => key === 'premed' ? `${p} - Premed` : p).join(' / ');
}

let undoStack = []; // roster rows as JSON, or { roster, day?, what } (JSON) for a whole-roster or whole-day change
// Before replacing the whole roster (Generate new): keep the roster. With day, also the day's
// details (restoring a saved version, the person box), and even when there's no roster yet.
function pushUndoAll(what, { day = false } = {}) {
  const rosterNow = state.roster && state.roster.date === state.day.date ? state.roster : null;
  if (!rosterNow && !day) return;
  undoStack.push({ roster: JSON.stringify(rosterNow), ...(day ? { day: JSON.stringify(state.day) } : {}), what });
  if (undoStack.length > 50) undoStack.shift();
}
function undo() {
  const e = undoStack.pop();
  if (!e) return;
  if (typeof e === 'string') { if (state.roster) { state.roster.rows = JSON.parse(e); afterRosterEdit(true); } return; }
  if (e.day) state.day = JSON.parse(e.day);
  state.roster = JSON.parse(e.roster);
  lastRows = state.roster ? JSON.stringify(state.roster.rows) : null;
  if (state.roster) logRoster([`Undo: ${e.what}`]);
  syncRooms();
  render();
  toast(`Undid ${e.what}.`);
}
let lastRows = null; // rows as of the last logged change
let editing = null; // "rowIndex:key" of the cell being typed in

const COLS = { senior: 'senior', junior: 'junior', premed: 'premed', notes: 'cases' };

// Cell-by-cell description of what changed between two versions of the roster rows.
function describeRowChanges(before, after) {
  const out = [];
  const old = Object.fromEntries(before.map(r => [r.roomId, r]));
  for (const r of after) {
    const o = old[r.roomId];
    if (!o) continue;
    for (const [k, label] of Object.entries(COLS)) {
      if ((o[k] || '') !== (r[k] || '')) out.push(`${r.label} ${label}: ${o[k] || '—'} → ${r[k] || '—'}`);
    }
  }
  return out;
}

function logRoster(changes) {
  if (!changes.length || !state.roster) return;
  (state.roster.log ||= []).unshift({ at: Date.now(), by: who(), changes });
  state.roster.log.splice(500);
}

// Where each junior is physically rostered: person id -> [{ row, part }] (ad hoc covers left out).
function juniorPlaces(rows) {
  const out = {};
  rows.forEach((row, i) => cellParts(row, 'junior').forEach((part, k) => {
    if (isCoverPart(part)) return;
    const p = matchName(namesInCell(part)[0] || '', state.staff).person;
    if (p) (out[p.id] ||= []).push({ row: i, part: k });
  }));
  return out;
}

// A junior can't be in two rooms at once: offer to make one of them an ad hoc cover (C).
let askingCover = false;
async function askCoverForDoubles(before) {
  if (askingCover) return;
  askingCover = true;
  try { await askCover(before); } finally { askingCover = false; }
}
async function askCover(before) {
  const rows = state.roster.rows;
  const now = juniorPlaces(rows);
  let changed = false; // every double-booked junior is asked about, one after another
  for (const [id, places] of Object.entries(now)) {
    if (places.length < 2 || (before[id]?.length || 0) >= places.length) continue;
    const p = state.staff.find(s => s.id === id);
    const was = new Set((before[id] || []).map(x => rows[x.row]?.label));
    const order = [...places].sort((a, b) => was.has(rows[a.row].label) - was.has(rows[b.row].label));
    const labels = places.map(x => rows[x.row].label);
    const choice = await confirmChanges(`${p.name} is now in ${labels.join(' and ')}`,
      ['A junior can\'t be in two places at once. Pick the room where they are only an ad hoc cover: it shows as "' + shortName(p) + ' (C)" in red.'],
      [...order.map((x, k) => [String(k), `Cover in ${rows[x.row].label}`, k ? '' : 'primary']), ['back', 'Keep both']]);
    if (choice === 'back') continue;
    const x = order[+choice];
    const parts = cellParts(rows[x.row], 'junior');
    const cur = parseNamePart(parts[x.part]);
    parts[x.part] = buildNamePart({ ...cur, tags: [...cur.tags, 'C'], cover: '' });
    setCellParts(rows[x.row], 'junior', parts);
    changed = true;
  }
  if (changed) afterRosterEdit(false, true);
}

function afterRosterEdit(undone, prompted) {
  const r = state.roster;
  const before = lastRows ? juniorPlaces(JSON.parse(lastRows)) : {};
  if (lastRows) {
    const changes = describeRowChanges(JSON.parse(lastRows), r.rows);
    logRoster(undone ? changes.map(c => 'Undo: ' + c) : changes);
  }
  lastRows = JSON.stringify(r.rows);
  r.checks = check({ rows: r.rows, staff: state.staff, day: state.day, settings: state.settings });
  render();
  if (!undone && !prompted) askCoverForDoubles(before);
}

function dropName(src, dst) {
  if (src.pool) return dropFromPool(src.pool, dst);
  if (src.cover) return dropAsCover(src, dst);
  if (src.dup) return dropAsDouble(src, dst);
  if (dst.pool) return dropToPool(src);
  const rows = state.roster.rows;
  const a = rows[src.row], b = rows[dst.row];
  if (!a || !b) return;
  const aParts = cellParts(a, src.key);
  const name = aParts[src.part];
  if (name == null) return;
  if (src.row === dst.row && src.key === dst.key && (dst.part == null || dst.part === src.part)) return;
  undoStack.push(JSON.stringify(rows));
  if (undoStack.length > 50) undoStack.shift();
  if (dst.part != null) {
    // swap two names
    const bParts = src.row === dst.row && src.key === dst.key ? aParts : cellParts(b, dst.key);
    const other = bParts[dst.part];
    aParts[src.part] = other;
    bParts[dst.part] = name;
    setCellParts(a, src.key, aParts);
    if (bParts !== aParts) setCellParts(b, dst.key, bParts);
    toast(`Swapped ${name} and ${other}.`);
  } else {
    // move into another cell
    aParts.splice(src.part, 1);
    setCellParts(a, src.key, aParts);
    const bParts = cellParts(b, dst.key);
    bParts.push(name);
    setCellParts(b, dst.key, bParts);
    toast(`Moved ${name} to ${b.label}.`);
  }
  afterRosterEdit();
}

// A name dragged from the Admin / no list card onto the roster: onto a name swaps them (the
// other person goes back to no list), onto a cell adds them there.
function dropFromPool(id, dst) {
  const p = state.staff.find(s => s.id === id);
  const row = state.roster.rows[dst.row];
  if (!p || !row || !dst.key) return;
  const d = dayOf(p.id);
  const admin = d.status === 'admin';
  if (admin) pushUndoAll(`putting ${p.name} in ${row.label}`, { day: true }); else undoStack.push(JSON.stringify(state.roster.rows));
  if (admin) { d.status = 'avail'; d.manual = true; } // off their admin day and onto a list
  const text = p.role === 'senior' ? fmtSenior(p, d) : fmtJunior(p, d);
  const parts = cellParts(row, dst.key);
  if (dst.part != null && parts[dst.part] != null) parts[dst.part] = text; else parts.push(text);
  setCellParts(row, dst.key, parts);
  toast(`Put ${p.name} in ${row.label}.`);
  afterRosterEdit();
}

// A junior dragged by their C grip: they stay in their room and are added to the other room's
// junior cell as an ad hoc cover, "Name (C)".
function dropAsCover(src, dst) {
  const rows = state.roster.rows;
  const from = rows[src.row], to = rows[dst.row];
  if (!from || !to || dst.pool || from === to) return;
  const cur = parseNamePart(cellParts(from, src.key)[src.part] || '');
  const n = namesInCell(cur.name)[0];
  if (!n) return;
  const parts = cellParts(to, 'junior');
  if (parts.some(x => namesInCell(x)[0] === n)) return toast(`${n} is already in ${to.label}.`);
  undoStack.push(JSON.stringify(rows));
  parts.push(buildNamePart({ name: cur.name, tags: [...cur.tags.filter(t => TAGS.includes(t)), 'C'], leave: '', cover: '', dash: '' }));
  setCellParts(to, 'junior', parts);
  toast(`${n} covers ${to.label} (C).`);
  afterRosterEdit();
}

// A senior dragged by their &: they stay in their room and also take the other room's
// senior cell, i.e. double cover it.
function dropAsDouble(src, dst) {
  const rows = state.roster.rows;
  const from = rows[src.row], to = rows[dst.row];
  if (!from || !to || dst.pool || from === to) return;
  const cur = parseNamePart(cellParts(from, src.key)[src.part] || '');
  const n = namesInCell(cur.name)[0];
  if (!n) return;
  const parts = cellParts(to, 'senior');
  if (parts.some(x => namesInCell(x)[0] === n)) return toast(`${n} is already in ${to.label}.`);
  if (from.complex !== to.complex && !confirm(`${from.label} and ${to.label} are in different complexes. Double cover across complexes anyway?`)) return;
  undoStack.push(JSON.stringify(rows));
  parts.push(buildNamePart({ name: cur.name, tags: cur.tags.filter(t => TAGS.includes(t)), leave: cur.leave, cover: '', dash: '' }));
  setCellParts(to, 'senior', parts);
  toast(`${n} double covers ${from.label} and ${to.label}.`);
  afterRosterEdit();
}

// A name dragged off the roster onto the Admin / no list card: take it out of its cell.
function dropToPool(src) {
  const row = state.roster.rows[src.row];
  const parts = row ? cellParts(row, src.key) : [];
  const name = parts[src.part];
  if (name == null) return;
  undoStack.push(JSON.stringify(state.roster.rows));
  parts.splice(src.part, 1);
  setCellParts(row, src.key, parts);
  toast(`Took ${namesInCell(name)[0] || name} off ${row.label}.`);
  afterRosterEdit();
}

// Touchscreens get no dragging, covering or deleting on the chips: tapping a name opens it.
const TOUCH = matchMedia('(hover: none), (pointer: coarse)').matches;

function startNameDrag(e, src) {
  if (e.button !== 0) return;
  e.preventDefault();
  const chip = e.currentTarget.closest('.name') || e.currentTarget;
  const x0 = e.clientX, y0 = e.clientY;
  let ghost = null, over = null;
  const targetAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-drop]');
  const move = ev => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      ghost = chip.cloneNode(true);
      ghost.classList.add('ghost');
      document.body.append(ghost);
      chip.classList.add('dragging');
    }
    ev.preventDefault();
    ghost.style.left = ev.clientX + 10 + 'px';
    ghost.style.top = ev.clientY + 10 + 'px';
    const t = targetAt(ev.clientX, ev.clientY);
    if (t !== over) { over?.classList.remove('over'); over = t; over?.classList.add('over'); }
  };
  const up = ev => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (!ghost) {
      // a click without dragging opens the name's details
      if (ev.type === 'pointerup' && src.pool) { const p = person(src.pool); if (p) openPersonBox(chip, p, { kind: 'view' }); }
      else if (ev.type === 'pointerup' && !src.cover && !src.dup) { clearTimeout(tagTimer); tagTimer = setTimeout(() => openTagEditor(chip, src), 200); }
      return;
    }
    ghost.remove();
    chip.classList.remove('dragging');
    over?.classList.remove('over');
    const t = ev.type === 'pointerup' ? targetAt(ev.clientX, ev.clientY) : null;
    if (!t) return;
    if (t.dataset.pool != null) { if (!src.pool && !src.cover && !src.dup) dropName(src, { pool: true }); return; }
    dropName(src, { row: +t.dataset.row, key: t.dataset.key, part: t.dataset.part != null ? +t.dataset.part : null });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// Resolve a typed name to a person. Unknown names offer to add the person (so typos are caught);
// resolves to the person, or null when cancelled.
async function resolvePerson(text, role) {
  const v = String(text).trim();
  if (!v) return null;
  const m = matchName(v, state.staff);
  if (m.person) return m.person;
  if (m.ambiguous) { toast(`"${v}" could be ${m.ambiguous.map(p => p.name).join(' or ')}. Type more of the name.`); return null; }
  const other = role === 'senior' ? 'junior' : 'senior';
  const choice = await confirmChanges(`"${v}" isn't on the staff list`, ['Check the spelling. If it\'s right, add them so they can be rostered.'],
    [[role, `Add to ${role === 'senior' ? 'Seniors' : 'Juniors'}`, 'primary'], [other, `Add to ${other === 'senior' ? 'Seniors' : 'Juniors'}`], ['back', 'Cancel']]);
  if (choice === 'back') return null;
  const p = { id: newId(), name: v, aliases: [], role: choice, grade: DEFAULT_GRADE[choice], posting: '', subspecs: [], avoid: [], history: {}, source: 'roster-entry' };
  state.staff.push(p);
  (state.staffLog ||= []).unshift({ at: Date.now(), by: who(), changes: [`Added ${choice} ${v} (typed on the roster)`] });
  toast(`Added ${v} to ${choice === 'senior' ? 'Seniors' : 'Juniors'}. Fill in their details there.`);
  return p;
}

// A text box that suggests names from the staff list (optionally one role).
function nameInput(attrs = {}, role = null) {
  const id = 'names-' + (role || 'all');
  if (!document.getElementById(id)) document.body.append(h('datalist', { id }));
  document.getElementById(id).replaceChildren(...state.staff.filter(p => !role || p.role === role)
    .sort(bySeniority).map(p => h('option', { value: p.name })));
  return h('input', { list: id, autocomplete: 'off', spellcheck: 'false', ...attrs });
}

// ---- tags on one name: "(L)", "(RA)", "(AOH 1)" and the part after a dash ("-5pm", "-C-OT 4") ----

const TAGS = ['L', 'AOH', 'HPB', 'RA', 'P', 'SR', 'Neu', 'Cardiac', 'ENT', 'Vasc', 'Amb', 'Remote', 'PACU'];
let tagTimer = null;

// "Koh YW (RA) L-4pm C-OT13 -mtg 5pm" -> name, tags, leave ("4pm" / "4-5pm"), cover ("OT13", "KROR PACU"), note
const TIME = '[\\d.:]+(?:\\s*-\\s*[\\d.:]+)?\\s*(?:am|pm)?';
// "/" separates names in a cell and brackets hold tags, so typed text can't use them as-is
const cellSafe = t => String(t || '').replace(/\bw\/\s*/gi, 'with ').replace(/\s*\/\s*/g, ' or ').replace(/\(/g, '[').replace(/\)/g, ']').trim();
// The parts of today's roster cells this person is physically in (not covers).
function rosterPartsOf(p) {
  if (!state.roster || state.roster.date !== state.day.date) return [];
  return state.roster.rows.flatMap(r => ['senior', 'junior'].flatMap(k => cellParts(r, k))).filter(x => !isCoverPart(x) && personOfPart(x) === p);
}
function parseNamePart(text) {
  const tags = [...String(text).matchAll(/\(([^)]*)\)/g)].map(m => m[1].trim()).filter(Boolean);
  let rest = String(text).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  let leave = '', cover = '', dash = '';
  rest = rest.replace(new RegExp(`\\s+L-\\s*(${TIME})`, 'i'), (_, t) => { leave = t.trim(); return ''; });
  rest = rest.replace(/\s+-?C-\s*(.+?)(?=\s+L-|\s+-|$)/i, (_, c) => { cover = c.trim().replace(/^OT\s+/i, 'OT'); return ''; });
  const m = rest.match(/^(.*?)\s+-\s*(.+)$/);
  if (m) {
    rest = m[1].trim(); dash = m[2].trim();
    // older roster style: "Name -5pm" means leaving at 5pm
    if (!leave && new RegExp(`^${TIME}$`, 'i').test(dash)) { leave = dash; dash = ''; }
  }
  return { name: rest.trim(), tags, leave, cover, dash };
}
const buildNamePart = ({ name, tags, leave, cover, dash }) =>
  `${name}${tags.map(t => ` (${t})`).join('')}${leave ? ` L-${leave}` : ''}${cover ? ` C-${cover}` : ''}${dash ? ` -${dash}` : ''}`;

// Keep the "Name (C)" entry in the room a junior covers in step with their C- tag.
function syncCoverEntry(row, oldName, oldCover, name, coverTo) {
  const rows = state.roster.rows;
  const target = c => c ? rows.find(r => r.label === coverTarget(c, row, rows)) : null;
  const isEntry = (part, n) => isCoverPart(part) && namesInCell(part)[0] === namesInCell(n)[0];
  const from = target(oldCover), to = target(coverTo);
  if (from && (from !== to || oldName !== name)) setCellParts(from, 'junior', cellParts(from, 'junior').filter(x => !isEntry(x, oldName)));
  if (to && to !== row && !cellParts(to, 'junior').some(x => isEntry(x, name))) setCellParts(to, 'junior', [...cellParts(to, 'junior'), `${name} (C)`]);
}

// Everywhere a person is on today's roster: rooms, ad hoc covers, premeds, calls and clinics.
function wherePerson(p) {
  const out = [];
  const is = text => namesInCell(text).some(n => matchName(n, state.staff).person?.id === p.id);
  for (const row of state.roster?.rows || []) {
    for (const key of ['senior', 'junior']) for (const part of cellParts(row, key)) {
      if (!is(part)) continue;
      if (isCoverPart(part)) out.push(`Covering ${row.label} (C)`);
      else {
        out.push(`In ${row.label} (${key})`);
        const c = parseNamePart(part).cover;
        if (c) out.push(`Covering ${coverTarget(c, row, state.roster.rows) || c} (C-${c})`);
      }
    }
    if (cellParts(row, 'premed').some(is)) out.push(`Premed for ${row.label}`);
  }
  const g = effectiveGeneral();
  for (const [k, label] of TEAM_ROWS) for (const team of ['mot', 'sicu']) if (is(g[`${team}.${k}`] || '')) out.push(`${team.toUpperCase()} ${label.replace(':', '') || 'MO'}`);
  for (const d of DUTIES) for (const [f, label] of d.fields) if (is(g[`${d.key}.${f}`] || '')) out.push(`${d.label} ${label.toLowerCase()}`);
  const st = state.day.staff[p.id]?.status;
  if (st && st !== 'avail') out.push(STATUSES.find(s => s[0] === st)?.[1] || st);
  return out;
}
function whereCard(p) {
  const at = wherePerson(p);
  return h('div', { class: 'where' },
    h('b', {}, p.name), h('span', { class: 'seen' }, ` · ${p.grade}${p.posting ? ' · ' + postingName(p.posting) : ''}`),
    h('ul', {}, (at.length ? at : ['Not on any list today']).map(t => h('li', {}, t))));
}

function closeTagEditor() { document.querySelector('.tag-editor')?.remove(); }

function openRawEditor(chip, src) {
  closeTagEditor();
  const row = state.roster.rows[src.row];
  const parts = cellParts(row, src.key);
  const cur = parseNamePart(parts[src.part] ?? '');
  const p = matchName(cur.name, state.staff).person;
  const on = new Set(cur.tags.filter(t => TAGS.includes(t)));
  const other = h('input', { value: cur.tags.filter(t => !TAGS.includes(t) && !/^C$/i.test(t)).join(', '), placeholder: 'e.g. AOH 1' });
  const juniorCell = src.key === 'junior';
  const coveredBox = h('input', { type: 'checkbox', checked: cur.tags.some(t => /^C$/i.test(t)) });
  const dash = h('input', { value: cur.dash, placeholder: 'e.g. mtg 3pm' });
  const leave = h('input', { value: cur.leave, placeholder: 'e.g. 4pm or 4-5pm' });
  const cover = h('input', { value: cur.cover, placeholder: 'e.g. OT13, KROR PACU' });
  const name = nameInput({ value: cur.name }, src.key === 'senior' ? 'senior' : 'junior');
  const chips = h('div', { class: 'chips' }, TAGS.map(t => {
    const c = h('span', { class: 'chip' + (on.has(t) ? ' on' : ''), title: t === 'L' ? (src.key === 'senior' ? 'Liver standby' : 'Liver posting') : '', onclick: () => {
      if (on.has(t)) on.delete(t); else on.add(t);
      c.classList.toggle('on', on.has(t));
    } }, t);
    return c;
  }));
  const apply = async () => {
    const tags = [...TAGS.filter(t => on.has(t)), ...splitNameList(other.value).filter(t => !/^C$/i.test(t)), ...(juniorCell && coveredBox.checked ? ['C'] : [])];
    let picked = name.value.trim() || cur.name;
    if (picked !== cur.name) {
      const person = await resolvePerson(picked, src.key === 'senior' ? 'senior' : 'junior');
      if (!person) return;
      picked = person.name;
    }
    const coverTo = cover.value.trim().replace(/^C-/i, '');
    const next = buildNamePart({ name: picked, tags, leave: leave.value.trim().replace(/^L-/i, ''), cover: coverTo, dash: dash.value.trim() });
    closeTagEditor();
    if (next === parts[src.part]) return;
    undoStack.push(JSON.stringify(state.roster.rows));
    parts[src.part] = next;
    setCellParts(row, src.key, parts);
    // a junior covering another room (C-OT13) is shown there as "Name (C)"
    if (juniorCell && !coveredBox.checked) syncCoverEntry(row, cur.name, cur.cover, picked, coverTo);
    // keep the day's details in step so checks and regenerating agree with the sheet
    if (p) {
      const d = dayOf(p.id);
      if (src.key === 'senior') d.liverStandby = on.has('L');
      d.leaveTime = leave.value.trim().replace(/^L-/i, '');
    }
    afterRosterEdit();
  };
  const remove = () => {
    closeTagEditor();
    undoStack.push(JSON.stringify(state.roster.rows));
    parts.splice(src.part, 1);
    setCellParts(row, src.key, parts);
    afterRosterEdit();
  };
  const box = h('div', { class: 'tag-editor', role: 'dialog', 'aria-label': 'Edit name',
    onkeydown: e => { if (e.key === 'Escape') closeTagEditor(); if (e.key === 'Enter') { e.preventDefault(); apply(); } } },
    p ? whereCard(p) : null,
    h('label', {}, 'Name'), name,
    h('label', {}, 'Tags'), chips,
    h('label', {}, 'Other tags'), other,
    h('label', {}, 'Leaving (L-)'), leave,
    h('label', {}, 'Covering (C-)'), cover,
    juniorCell && h('label', { class: 'check', title: 'No junior is physically in this room: this person only covers it ad hoc. Shown as "Name (C)" in red.' }, coveredBox, ' Covered (ad hoc cover, not physically here)'),
    h('label', {}, 'Comment (also shown in the comments box)'), dash,
    h('div', { class: 'bar', style: 'margin:8px 0 0' },
      h('button', { class: 'primary', onclick: apply }, 'Save'),
      h('button', { onclick: closeTagEditor }, 'Cancel'),
      h('span', { class: 'grow' }),
      h('button', { onclick: remove, title: 'Take this name out of the cell' }, 'Remove')),
  );
  document.body.append(box);
  const rc = chip.getBoundingClientRect();
  const w = box.offsetWidth, hgt = box.offsetHeight;
  box.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, rc.left)) + 'px';
  box.style.top = (rc.bottom + hgt + 8 < window.innerHeight ? rc.bottom + 4 : Math.max(8, rc.top - hgt - 4)) + 'px';
  setTimeout(() => {
    const away = e => { if (!box.contains(e.target)) { closeTagEditor(); window.removeEventListener('pointerdown', away, true); } };
    window.addEventListener('pointerdown', away, true);
  });
}

// ---- the person box: one look for a person on every daily tab (Today, Cases, Roster, Premeds) ----

const personOfPart = part => matchName(namesInCell(part)[0] || '', state.staff).person;
const isAohTag = t => /^AOH\b/i.test(t);
// tags that belong to the roster cell rather than the person's day
const CELL_TAGS = TAGS.filter(t => t !== 'L' && t !== 'AOH');

// The day's markers after a short name: (L), (AOH), L-4pm
function dayMarks(p) {
  const d = state.day.staff[p.id] || {};
  return [d.liverStandby ? '(L)' : '', d.aoh ? `(${d.aoh})` : '', d.leaveTime ? `L-${d.leaveTime}` : ''].filter(Boolean).join(' ');
}
// The person chip for the daily tabs: short name in their colour, then the day's markers
function personChip(p, attrs = {}, ...extra) {
  const marks = dayMarks(p);
  return h('span', { class: 'name pchip', style: colourStyle(p.name), title: `${p.name} · ${p.grade}`, ...attrs },
    h('span', { class: 'label' }, shortName(p) || p.name), marks ? h('span', { class: 'marks' }, ' ' + marks) : null, ...extra);
}

// Write a person's day details (L-, (L), (AOH), comment) into every roster cell they're physically in.
function syncPersonCells(p) {
  if (!state.roster || state.roster.date !== state.day.date) return;
  const d = state.day.staff[p.id] || {};
  for (const row of state.roster.rows) for (const key of ['senior', 'junior']) {
    const parts = cellParts(row, key);
    let changed = false;
    parts.forEach((part, k) => {
      if (isCoverPart(part) || personOfPart(part) !== p) return;
      const cur = parseNamePart(part);
      const postingL = p.role === 'junior' && p.posting === 'L';
      const tags = cur.tags.filter(t => !isAohTag(t) && !(t === 'L' && !postingL));
      if (d.liverStandby && !tags.includes('L')) tags.unshift('L');
      if (d.aoh) tags.push(d.aoh);
      const next = buildNamePart({ ...cur, tags, leave: d.leaveTime || '', dash: d.comment || '' });
      if (next !== part) { parts[k] = next; changed = true; }
    });
    if (changed) setCellParts(row, key, parts);
  }
}

// Open the Staff tab in edit mode on this person.
let staffHighlight = null;
async function goEditStaff(p) {
  closeTagEditor();
  state.tab = 'staff';
  state.staffRole = p.role;
  staffFilter = '';
  staffHighlight = p.id;
  if (!staffEditing()) startStaffEdit(); else render();
  setTimeout(() => app.querySelector(`tr[data-id="${p.id}"]`)?.scrollIntoView({ block: 'center' }), 50);
}

// ctx: { kind: 'roster', src } | { kind: 'today' } | { kind: 'lock', room, key } | { kind: 'premed', row, options }
function openPersonBox(anchor, p, ctx) {
  closeTagEditor();
  const d = state.day.staff[p.id] || {};
  const roster = ctx.kind === 'roster';
  const rrow = roster ? state.roster.rows[ctx.src.row] : null;
  const parts = roster ? cellParts(rrow, ctx.src.key) : [];
  const part = roster ? parts[ctx.src.part] ?? '' : '';
  const cur = roster ? parseNamePart(part) : { tags: [], leave: '', cover: '', dash: '' };
  const cover = roster && isCoverPart(part);
  // away from the roster tab, the day's details start from the person's first roster cell
  const firstPart = roster ? null : rosterPartsOf(p)[0];
  const seed = roster ? (cover ? { tags: [], leave: '', dash: '' } : cur) : firstPart ? parseNamePart(firstPart) : { tags: [], leave: '', dash: '' };

  // the person's day (shared by every tab)
  const leave = h('input', { value: d.leaveTime || seed.leave, placeholder: 'e.g. 4pm or 4-5pm' });
  const liver = h('input', { type: 'checkbox', checked: !!d.liverStandby || (p.role === 'senior' && seed.tags.includes('L')) });
  const aoh = h('input', { value: d.aoh || seed.tags.find(isAohTag) || '', placeholder: 'e.g. AOH or AOH 1' });
  const comment = h('input', { value: d.comment ?? seed.dash, placeholder: 'e.g. mtg 3pm' });
  const away = h('input', { type: 'checkbox', checked: !!d.notAroundPrev });
  let status = groupOf(d.status);
  const statusBtns = BOARD.map(([k, label]) => h('button', { class: 'small', 'aria-pressed': String(k === status), onclick: e => {
    status = k; e.currentTarget.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
  } }, label));

  // this roster cell only
  const on = new Set(cur.tags.filter(t => CELL_TAGS.includes(t)));
  const other = h('input', { value: cur.tags.filter(t => !TAGS.includes(t) && !/^C$/i.test(t) && !isAohTag(t)).join(', '), placeholder: 'e.g. KIV' });
  const coverTo = h('input', { value: cur.cover, placeholder: 'e.g. OT13, KROR PACU' });
  const coveredBox = h('input', { type: 'checkbox', checked: cover });
  const chips = h('div', { class: 'chips' }, CELL_TAGS.map(t => {
    const c = h('span', { class: 'chip' + (on.has(t) ? ' on' : ''), onclick: () => { if (on.has(t)) on.delete(t); else on.add(t); c.classList.toggle('on', on.has(t)); } }, t);
    return c;
  }));
  const premedPick = ctx.kind === 'premed' ? select(p.name, ctx.options, () => {}) : null;

  const apply = () => {
    const rosterNow = state.roster && state.roster.date === state.day.date;
    const s = dayOf(p.id);
    const before = JSON.stringify([state.day, rosterNow ? state.roster.rows : null]);
    pushUndoAll(`the change to ${p.name}`, { day: true });
    if (roster) {
      const juniorCell = ctx.src.key === 'junior';
      const coverText = coverTo.value.trim().replace(/^C-/i, '');
      // a Liver Transplant posting's (L) isn't one of the cell's tag chips; keep it
      const postingL = p.role === 'junior' && p.posting === 'L' && cur.tags.includes('L');
      const tags = [...(postingL ? ['L'] : []), ...CELL_TAGS.filter(t => on.has(t)), ...splitNameList(other.value).map(cellSafe).filter(t => t && !/^C$/i.test(t)), ...(juniorCell && coveredBox.checked ? ['C'] : [])];
      parts[ctx.src.part] = buildNamePart({ name: cur.name, tags, leave: '', cover: coverText, dash: '' });
      setCellParts(rrow, ctx.src.key, parts);
      if (juniorCell && !coveredBox.checked) syncCoverEntry(rrow, cur.name, cur.cover, cur.name, coverText);
    }
    // only fields that changed are written, so a Save that changes nothing leaves no Undo step
    const put = (k, v) => { if ((s[k] || '') !== v) s[k] = v; };
    put('leaveTime', leave.value.trim().replace(/^L-/i, ''));
    if (liver.checked !== !!s.liverStandby) { s.liverStandby = liver.checked; s.manualLiver = true; delete s.autoLiver; }
    put('aoh', cellSafe(aoh.value.trim().replace(/^\(|\)$/g, '')));
    put('comment', cellSafe(comment.value.trim().replace(/^-\s*/, '')));
    if (p.role === 'junior' && away.checked !== !!s.notAroundPrev) { s.notAroundPrev = away.checked; s.manualAway = true; delete s.autoAway; }
    if (ctx.kind === 'today' && status !== groupOf(s.status)) { closeTagEditor(); setStatus(p, status); }
    if (ctx.kind === 'premed' && premedPick.value !== p.name) ctx.setCover(premedPick.value);
    syncPersonCells(p);
    closeTagEditor();
    if (JSON.stringify([state.day, rosterNow ? state.roster.rows : null]) === before) undoStack.pop(); // nothing changed
    if (rosterNow) afterRosterEdit(); else render();
  };
  const remove = () => {
    closeTagEditor();
    if (roster) dropToPool(ctx.src);
    else if (ctx.kind === 'lock') { ctx.room[ctx.key] = ''; render(); }
    else if (ctx.kind === 'premed') ctx.setCover('');
  };
  const field = (label, el, title) => [h('label', { title: title || '' }, label), el];
  const box = h('div', { class: 'tag-editor person-box', role: 'dialog', 'aria-label': p.name,
    onkeydown: e => { if (e.key === 'Escape') closeTagEditor(); if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); apply(); } } },
    h('div', { class: 'where' },
      h('div', { class: 'bar', style: 'margin:0' },
        h('div', { class: 'grow' }, h('b', { style: colourStyle(p.name) }, p.name), h('div', { class: 'seen' }, [shortName(p) !== p.name ? shortName(p) : '', p.grade, p.posting ? postingName(p.posting) : ''].filter(Boolean).join(' · '))),
        h('button', { class: 'small', title: 'Edit their name, short names, grade and so on on the Staff tab', onclick: () => goEditStaff(p) }, 'Edit')),
      h('ul', {}, (wherePerson(p).length ? wherePerson(p) : ['Not on any list today']).map(t => h('li', {}, t)))),
    ctx.kind === 'today' ? [h('label', {}, 'Today'), h('div', { class: 'seg status-pick' }, statusBtns)] : null,
    roster ? [h('label', {}, 'Tags in this room'), chips, ...field('Other tags', other), ...field('Covering (C-)', coverTo, 'Covers another room, e.g. when someone there leaves early'),
      ctx.src.key === 'junior' ? h('label', { class: 'check', title: 'No junior is physically in this room: this person only covers it ad hoc. Shown as "Name (C)" in red.' }, coveredBox, ' Ad hoc cover here (C), not physically here') : null] : null,
    ctx.kind === 'premed' ? field('Premed cover', premedPick) : null,
    h('div', { class: 'seen', style: 'margin-top:6px; font-weight:600' }, 'For the whole day (shows wherever they are)'),
    ...field('Leaving (L-)', leave),
    h('label', { class: 'check' }, liver, ' Liver standby (L): no complex lists'),
    ...field('AOH tag', aoh, 'Shown as (AOH) after their name'),
    ...field('Comment (also shown in the comments box)', comment),
    p.role === 'junior' ? h('label', { class: 'check', title: 'Not around on the previous working day: needs premed cover' }, away, ' Away on the previous working day') : null,
    h('div', { class: 'bar', style: 'margin:8px 0 0' },
      h('button', { class: 'primary save', onclick: apply }, 'Save'),
      h('button', { onclick: closeTagEditor }, 'Cancel'),
      h('span', { class: 'grow' }),
      ['roster', 'lock', 'premed'].includes(ctx.kind) ? h('button', { onclick: remove, title: ctx.kind === 'lock' ? 'Let the roster choose' : 'Take them off here' }, 'Remove') : null),
  );
  document.body.append(box);
  const rc = anchor.getBoundingClientRect();
  const w = box.offsetWidth, hgt = box.offsetHeight;
  box.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, rc.left)) + 'px';
  box.style.top = (rc.bottom + hgt + 8 < window.innerHeight ? rc.bottom + 4 : Math.max(8, rc.top - hgt - 4)) + 'px';
  setTimeout(() => {
    const awayClick = e => { if (!box.contains(e.target)) { closeTagEditor(); window.removeEventListener('pointerdown', awayClick, true); } };
    window.addEventListener('pointerdown', awayClick, true);
  });
}

// A name on the roster: the person box, or (for a name not on the staff list) the plain editor.
function openTagEditor(chip, src) {
  const part = cellParts(state.roster.rows[src.row], src.key)[src.part] ?? '';
  const p = personOfPart(part);
  if (p) openPersonBox(chip, p, { kind: 'roster', src });
  else openRawEditor(chip, src);
}

// Case notes typed on the roster also update the day's room, so flags and checks follow.
function editNotes(i, value) {
  const row = state.roster.rows[i];
  if (!row || value === row.notes) return;
  undoStack.push(JSON.stringify(state.roster.rows));
  logRoster([`${row.label} cases: ${row.notes || '—'} → ${value || '—'}`]);
  row.notes = value;
  lastRows = JSON.stringify(state.roster.rows);
  const room = state.day.rooms.find(x => x.id === row.roomId);
  if (room) {
    room.notes = value;
    if (!room.flagsManual) room.flags = suggestFlags(value, state.settings, room.name);
  }
  const before = JSON.stringify(state.roster.checks);
  state.roster.checks = check({ rows: state.roster.rows, staff: state.staff, day: state.day, settings: state.settings });
  save();
  if (JSON.stringify(state.roster.checks) !== before) render();
}

const notesCell = (row, i, attrs = {}) => h('td', {
  ...attrs, contenteditable: 'plaintext-only', spellcheck: 'false', title: 'Click to edit the case notes',
  onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } },
  onblur: e => editNotes(i, e.target.textContent.trim()),
}, row.notes || '');

// The colour of a roster name: red for an ad hoc cover ("Name (C)"), else the person's
// colour ('green', 'purple' or '', consultants always black).
const colourCache = new Map();
function colourOf(part) {
  if (isCoverPart(part)) return 'red';
  const n = namesInCell(part)[0];
  if (!n) return '';
  const k = n + '|' + state.staff.length;
  if (!colourCache.has(k)) colourCache.set(k, staffColour(matchName(n, state.staff).person));
  return colourCache.get(k);
}
// The sheet uses short names: "Koh Yi Wen (RA) L-4pm" -> "Koh YW (RA) L-4pm".
function shortOf(part) {
  const n = namesInCell(part)[0];
  if (!n) return part;
  const p = matchName(n, state.staff).person;
  if (!p) return part;
  const s = shortName(p);
  const at = part.indexOf(n);
  return s && at >= 0 ? part.slice(0, at) + s + part.slice(at + n.length) : part;
}
const colourStyle = part => { const c = COLOUR_ARGB[colourOf(part)]; return c ? `color:#${c.slice(2)}` : ''; };

// Add a person to a cell from the staff list (unknown names offer to add them to the staff list).
async function addToCell(i, key, text) {
  const p = await resolvePerson(text, key === 'senior' ? 'senior' : 'junior');
  if (!p) return false;
  if (state.roster.rows[i].roomId === 'aic' && !(['SC', 'C'].includes(p.grade) || p.grade === 'Senior resident')
    && !confirm(`AIC is usually a consultant or senior resident. Put ${p.name} (${p.grade}) there anyway?`)) return false;
  if (!p) return false;
  const row = state.roster.rows[i];
  const d = state.day.staff[p.id] || {};
  undoStack.push(JSON.stringify(state.roster.rows));
  setCellParts(row, key, [...cellParts(row, key), p.role === 'senior' ? fmtSenior(p, d) : fmtJunior(p, d)]);
  editing = null;
  afterRosterEdit();
  return true;
}

function rosterCell(row, i, key, doubles) {
  const id = i + ':' + key;
  const parts = cellParts(row, key);
  let adder;
  if (editing === id) {
    // Enter and the change event can both fire for one pick: add the name once
    let busy = false;
    const add = v => { if (busy) return; busy = true; addToCell(i, key, v).then(ok => { if (!ok) busy = false; }); };
    adder = nameInput({ class: 'cell-input', placeholder: 'Type a name',
      onkeydown: e => { if (e.key === 'Escape') { editing = null; render(); } if (e.key === 'Enter') { e.preventDefault(); add(e.target.value); } },
      onchange: e => { if (state.staff.some(p => p.name === e.target.value)) add(e.target.value); },
      onblur: e => setTimeout(() => { if (editing === id && !e.target.value.trim()) { editing = null; render(); } }, 150),
    }, key === 'senior' && row.roomId !== 'aic' ? 'senior' : key === 'senior' ? null : 'junior');
    setTimeout(() => adder.focus());
  } else {
    adder = h('button', { class: 'add-name', title: 'Add a name', onclick: () => { clearTimeout(tagTimer); closeTagEditor(); editing = id; render(); } }, '+');
  }
  // each name shows the short name. With a mouse: drag the chip to move or swap it, drag the
  // C to add a junior to another room as an ad hoc cover, drag a senior's & to have them
  // double cover another room, × takes the name off. On a touchscreen there's no dragging
  // (so the page scrolls); tapping opens the name's details.
  const chip = (p, k) => {
    const src = { row: i, key, part: k };
    const icon = (cls, title, text, o) => h('span', { class: 'icon ' + cls, title, onpointerdown: e => { e.stopPropagation(); o.down?.(e); }, onclick: e => { e.stopPropagation(); o.click?.(); } }, text);
    const el = h('span', { class: 'name', 'data-drop': '', 'data-row': i, 'data-key': key, 'data-part': k, style: colourStyle(p), title: p,
      onpointerdown: TOUCH ? null : e => startNameDrag(e, src),
      onclick: TOUCH ? () => openTagEditor(el, src) : null },
      !TOUCH && key === 'junior' && !isCoverPart(p) ? icon('cover', 'Drag to another room to add them there as an ad hoc cover (C). They stay in this room.', 'C', { down: e => startNameDrag(e, { ...src, cover: true }) }) : null,
      key === 'senior' && (!TOUCH || isDouble(p, doubles)) ? icon('dbl' + (isDouble(p, doubles) ? ' on' : ''),
        (isDouble(p, doubles) ? 'Double covering. ' : '') + (TOUCH ? '' : 'Drag to another room to have them double cover it too.'), '&',
        { down: TOUCH ? null : e => startNameDrag(e, { ...src, dup: true }) }) : null,
      h('span', { class: 'label' }, shortOf(p)),
      !TOUCH ? icon('del', isCoverPart(p) ? 'Remove this ad hoc cover' : 'Take off this list (they go to Admin / no list)', '×', { click: () => dropToPool(src) }) : null);
    return el;
  };
  return h('td', {
    class: 'cell', 'data-drop': '', 'data-row': i, 'data-key': key, title: 'Drag a name to swap or move it. Click a name to edit it.',
  }, h('div', { class: 'names' }, parts.map(chip), adder));
}

// The day as the generator sees it: people on the Calls/clinics tab are busy, and the
// cardiac call team goes to MOR 12.
function generatorDay() {
  const busy = generalPeople();
  const genDay = { ...state.day, staff: { ...state.day.staff }, rooms: state.day.rooms.map(r => ({ ...r })) };
  const mor12 = genDay.rooms.find(r => r.name === 'MOR 12' && r.running);
  if (mor12) {
    const eff = effectiveGeneral();
    const first = k => matchName(namesInCell(eff[k] || '')[0] || '', state.staff).person;
    const cs = first('cardiac.s'), ca = first('cardiac.a');
    if (cs && !mor12.lockSenior) mor12.lockSenior = cs.id;
    if (ca && !mor12.lockJunior) mor12.lockJunior = ca.id;
  }
  for (const id of busy) if ((genDay.staff[id]?.status || 'avail') === 'avail') genDay.staff[id] = { ...(genDay.staff[id] || {}), status: 'elsewhere' };
  return genDay;
}

function canGenerate() {
  if (!state.staff.length) { toast('Add staff on the Staff tab first.'); return false; }
  if (!state.day.rooms.some(r => r.running)) { toast('Tick the running rooms on the Cases tab first.'); return false; }
  return true;
}

function runGenerate(newSeed) {
  if (!canGenerate()) return;
  const seed = newSeed ? Math.floor(Math.random() * 1e9) : (state.roster?.seed || 1);
  const res = generate({ staff: state.staff, day: generatorDay(), settings: state.settings, seed });
  const log = state.roster?.date === state.day.date ? state.roster.log || [] : [];
  if (state.roster?.rows?.length && state.roster.date === state.day.date && !confirm('Generate a new roster? This replaces the current one, including any changes you made by hand (Undo brings it back). To keep what\'s there, use Fill empty gaps instead.')) return;
  pushUndoAll('the new roster');
  editing = null;
  state.roster = { ...res, seed, date: state.day.date, log, checks: check({ rows: res.rows, staff: state.staff, day: state.day, settings: state.settings }) };
  logRoster([log.length ? 'Generated a new roster' : 'Generated the roster']);
  lastRows = JSON.stringify(res.rows);
  render();
}

// Keep every name already on the roster and generate only the empty cells: people already
// placed stay where they are (so the generator can pair or cover around them), everyone
// else rostered is left out.
function fillGaps() {
  if (!canGenerate()) return;
  const r = state.roster;
  const genDay = generatorDay();
  const placed = new Set(), locked = new Set();
  const person = text => matchName(namesInCell(text)[0] || '', state.staff).person;
  for (const row of r.rows) for (const key of ['senior', 'junior']) for (const part of cellParts(row, key)) {
    const p = person(part);
    if (p) placed.add(p.id);
  }
  for (const row of r.rows) {
    const room = genDay.rooms.find(x => x.id === row.roomId);
    if (!room) continue;
    const s = person(cellParts(row, 'senior')[0] || '');
    const j = person(cellParts(row, 'junior').find(x => !isCoverPart(x)) || '');
    if (s && !locked.has(s.id)) { room.lockSenior = s.id; locked.add(s.id); }
    if (j && !locked.has(j.id)) { room.lockJunior = j.id; locked.add(j.id); }
  }
  for (const id of placed) {
    if (locked.has(id) || (genDay.staff[id]?.status || 'avail') !== 'avail') continue;
    genDay.staff[id] = { ...(genDay.staff[id] || {}), status: 'elsewhere' };
  }
  const special = id => r.rows.find(x => x.roomId === id) || {};
  const fixed = { ...(genDay.fixed || {}) };
  if (special('ahot').senior) fixed.ahot = special('ahot').senior;
  if (special('aic').senior) fixed.aic = special('aic').senior;
  if (special('aocc').senior || special('aocc').junior) { fixed['aocc.s'] = special('aocc').senior || ''; fixed['aocc.j'] = special('aocc').junior || ''; }
  genDay.fixed = fixed;
  const res = generate({ staff: state.staff, day: genDay, settings: state.settings, seed: Math.floor(Math.random() * 1e9) });
  const old = Object.fromEntries(r.rows.map(x => [x.roomId, x]));
  const filled = [];
  const rows = res.rows.map(g => {
    const o = old[g.roomId];
    if (!o) { if (g.senior || g.junior) filled.push(`${g.label} (new room)`); return g; }
    const row = { ...o };
    for (const key of ['senior', 'junior', 'premed']) if (!String(o[key] || '').trim() && g[key]) { row[key] = g[key]; filled.push(`${g.label} ${key}`); }
    return row;
  });
  // rows filled in by hand for rooms that aren't running any more stay
  const kept = new Set(rows.map(x => x.roomId));
  rows.push(...r.rows.filter(o => !kept.has(o.roomId) && (o.senior || o.junior || o.premed)));
  if (!filled.length) return toast('Nothing to fill: no one free for the empty cells.');
  undoStack.push(JSON.stringify(r.rows));
  r.rows = rows;
  r.warnings = res.warnings;
  editing = null;
  afterRosterEdit(false, true);
  toast(`Filled ${filled.length} empty cell(s).`);
}

let rosterView = 'edit';

// ----- general tab -----

// Names typed into a General field must be on the staff list (unknown ones offer to be added).
async function setGeneral(key, value, role, input) {
  const g = (state.day.general ||= {});
  const before = g[key] || '';
  const v = value.trim();
  for (const n of v.split('/').flatMap(namesInCell)) {
    const p = await resolvePerson(n, role);
    if (!p) { if (input) input.value = before; return; }
  }
  if (v === before) return;
  g[key] = v;
  if (state.roster) logRoster([`General · ${key}: ${before || '—'} → ${v || '—'}`]);
  render();
}

// Fields left empty take a default: the MOT on-call team also does EOT 8 and EOT 9.
const GENERAL_DEFAULTS = { 'eot8.s': 'mot.cons', 'eot8.a': 'mot.res1', 'eot9.s': 'mot.cons', 'eot9.a': 'mot.res2', 'eot9.a2': 'mot.res3' };
function effectiveGeneral() {
  const typed = Object.fromEntries(Object.entries(state.day.general || {}).filter(([, v]) => v));
  const g = { ...generalFromMonthly(state.monthly, state.day.date), ...typed };
  for (const [k, from] of Object.entries(GENERAL_DEFAULTS)) if (!g[k] && g[from]) g[k] = g[from];
  return g;
}

// Everyone named on the Calls/clinics tab, so the OT generator leaves them out.
function generalPeople() {
  const ids = new Set();
  for (const v of Object.values(effectiveGeneral())) for (const n of String(v).split('/').flatMap(namesInCell)) {
    const p = matchName(n, state.staff).person;
    if (p) ids.add(p.id);
  }
  return ids;
}

// One Calls/clinics field: typed names win; grey placeholders come from the monthly rosters or the MOT team.
function generalField(key, role) {
  const g = state.day.general || {};
  const eff = effectiveGeneral();
  const fromMonthly = generalFromMonthly(state.monthly, state.day.date);
  return nameInput({ value: g[key] || '', placeholder: !g[key] && eff[key] ? `${eff[key]} (${fromMonthly[key] ? 'monthly roster' : 'MOT'})` : '—', style: 'width:100%',
    onchange: e => setGeneral(key, e.target.value, role, e.target),
    onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } } }, role);
}

// The calls and clinics on the Roster tab, as a compact list (the same fields as Monthly › Today).
function callsCard() {
  const rows = [
    ...TEAM_ROWS.map(([k, label], i) => [`MOT ${i < 2 ? label.replace(':', '') : 'MO' + (i - 1)}`, 'mot.' + k, i < 2 ? 'senior' : 'junior']),
    ...TEAM_ROWS.slice(0, 3).map(([k, label], i) => [`SICU ${i < 2 ? label.replace(':', '') : 'MO1'}`, 'sicu.' + k, i < 2 ? 'senior' : 'junior']),
    ...DUTIES.flatMap(d => d.fields.map(([f, label]) => [`${d.label} · ${label}`, `${d.key}.${f}`, f === 's' ? 'senior' : 'junior'])),
  ];
  const filled = rows.filter(([, k]) => effectiveGeneral()[k]).length;
  return h('section', { class: 'card' }, h('details', { open: true },
    h('summary', {}, h('h2', { style: 'display:inline' }, 'Calls and clinics'), h('span', { class: 'seen' }, ` ${filled} of ${rows.length} filled`)),
    h('p', { class: 'hint' }, 'The top half of the sheet. Grey names come from the monthly rosters; type to override.'),
    h('div', { class: 'calls-list' }, rows.map(([label, key, role]) => [h('label', { class: 'seen' }, label), generalField(key, role)]))));
}

function renderGeneral() {
  const field = generalField;
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Calls and clinics'),
      h('p', { class: 'hint' }, 'MOT and SICU calls, EOT and clinics for the day. Names in grey come from the monthly rosters (or, for EOT 8 and 9, the MOT call team); type a name to override one. Separate two people with "/". The cardiac call team goes to MOR 12. Everyone here is left out of the OT lists. These fill the top half of the sheet; Load draft roster on the Cases tab fills them from the admin draft.')),
    h('section', { class: 'card scroll' },
      h('h2', {}, 'MOT and SICU Calls'),
      h('table', {},
        h('thead', {}, h('tr', {}, ['', 'MOT', 'SICU'].map(t => h('th', {}, t)))),
        // residents are MO1–MO3; SICU has only an MO1
        h('tbody', {}, TEAM_ROWS.map(([k, label], i) => h('tr', {},
          h('td', { class: 'seen' }, i < 2 ? label : `MO${i - 1}:`),
          h('td', {}, field('mot.' + k, i < 2 ? 'senior' : 'junior')),
          h('td', {}, i < 3 ? field('sicu.' + k, i < 2 ? 'senior' : 'junior') : null)))))),
    h('section', { class: 'card scroll' },
      h('h2', {}, 'EOT and clinics'),
      h('table', {},
        h('thead', {}, h('tr', {}, ['', 'Senior', 'Junior', 'Junior'].map(t => h('th', {}, t)))),
        h('tbody', {}, DUTIES.map(d => h('tr', {},
          h('td', {}, h('b', {}, d.label)),
          [0, 1, 2].map(i => h('td', {}, d.fields[i] ? h('div', {}, h('div', { class: 'seen' }, d.fields[i][1]), field(`${d.key}.${d.fields[i][0]}`, d.fields[i][0] === 's' ? 'senior' : 'junior')) : null))))))),
    h('p', { class: 'hint' }, 'AOCC, AIC, AH OT and ECT are on the Roster tab.'));
}

// ----- monthly tab -----

// A name as written on a monthly roster ("Quah Zi Hui, Bernice", "LOKE BENJAMIN") -> person
const personCache = new Map();
function personByText(text) {
  const t = cleanCell(text);
  if (!t) return null;
  if (!personCache.has(t)) {
    const m = matchName(t, state.staff);
    personCache.set(t, m.person || matchName(cleanContactName(t), state.staff).person || null);
  }
  return personCache.get(t);
}

// What the monthly rosters say about everyone on a date: id -> { status, why, liver }
function derivedFor(date) {
  const out = new Map();
  const at = p => out.get(p.id) || out.set(p.id, {}).get(p.id);
  for (const e of leaveOn(state.monthly, date)) {
    const p = personByText(e.name);
    if (p) Object.assign(at(p), /medical/i.test(e.type) ? { status: 'mc', why: e.type } : { status: 'leave', why: e.type || 'Leave' });
  }
  const prev = dutiesOn(state.monthly, addDays(date, -1));
  for (const key of state.settings.nightDuties || NIGHT_DUTIES) {
    const [kind, col] = key.split('.');
    const p = personByText(prev[kind]?.[col]);
    if (p && !at(p).status) Object.assign(at(p), { status: 'postcall', why: `${monthlyDef(kind)?.cols.find(c => c.key === col)?.label} yesterday` });
  }
  const today = dutiesOn(state.monthly, date);
  for (const def of MONTHLY) for (const c of def.cols) if (c.liver) { const p = personByText(today[def.id]?.[c.key]); if (p) at(p).liver = true; }
  return out;
}
const prevWorkingDay = date => { let d = addDays(date, -1); while ([0, 6].includes(new Date(d + 'T12:00:00').getDay())) d = addDays(d, -1); return d; };
const hasMonthly = () => Object.keys(state.monthly || {}).length > 0;

// Bring the day's manpower in line with the monthly rosters. Anything set by hand stays.
function syncMonthly() {
  if (!hasMonthly() || !state.day?.date) return;
  const now = derivedFor(state.day.date);
  const before = derivedFor(prevWorkingDay(state.day.date));
  for (const p of state.staff) {
    const r = now.get(p.id) || {};
    const s = { ...(state.day.staff[p.id] || {}) };
    if (!s.manual) {
      if (r.status) { s.status = r.status; s.auto = r.why; }
      else if (s.auto) { s.status = 'avail'; delete s.auto; }
    }
    if (!s.manualLiver) {
      if (r.liver) { s.liverStandby = true; s.autoLiver = true; } else if (s.autoLiver) { s.liverStandby = false; delete s.autoLiver; }
    }
    if (p.role === 'junior' && !s.manualAway) {
      const away = ['leave', 'mc', 'postcall'].includes(before.get(p.id)?.status);
      if (away) { s.notAroundPrev = true; s.autoAway = true; } else if (s.autoAway) { s.notAroundPrev = false; delete s.autoAway; }
    }
    if (Object.keys(s).length && JSON.stringify(s) !== JSON.stringify(state.day.staff[p.id] || {})) state.day.staff[p.id] = s;
  }
}

const MONTHLY_VIEWS = [['today', 'Today'], ['pain', 'Pain Monthly'], ['liver', 'Liver Monthly'], ['leave', 'Leave Monthly'], ['aoh', 'AOH Monthly'], ['junior', 'Junior Monthly'], ['senior', 'Senior Monthly']];
function renderMonthly() {
  const view = MONTHLY_VIEWS.some(v => v[0] === state.monthlyView) ? state.monthlyView : 'today';
  const tabs = h('div', { class: 'seg subtabs', role: 'group', 'aria-label': 'Monthly' }, MONTHLY_VIEWS.map(([k, label]) =>
    h('button', { 'aria-pressed': String(view === k), onclick: () => { state.monthlyView = k; render(); } }, label)));
  return h('div', {}, tabs, view === 'today' ? renderToday() : renderMonthlyRoster(view));
}

// ---- today: who is where, then the calls and clinics ----

const BOARD = [['working', 'Working'], ['leave', 'Leave'], ['mc', 'MC'], ['postcall', 'Post call'], ['admin', 'Admin']];
const groupOf = st => ({ leave: 'leave', mc: 'mc', postcall: 'postcall', admin: 'admin' })[st || 'avail'] || 'working';
let boardRole = 'all', boardFilter = '';
function setStatus(p, group) {
  const s = dayOf(p.id);
  const was = groupOf(s.status);
  s.status = group === 'working' ? (s.status === 'elsewhere' ? 'elsewhere' : 'avail') : group;
  s.manual = true;
  delete s.auto;
  if (state.roster && was !== group) logRoster([`${p.name}: ${BOARD.find(b => b[0] === was)[1]} → ${BOARD.find(b => b[0] === group)[1]}`]);
  render();
}
function manpowerBoard() {
  const people = state.staff
    .filter(p => boardRole === 'all' || p.role === boardRole)
    .filter(p => !boardFilter || (p.name + ' ' + (p.aliases || []).join(' ')).toLowerCase().includes(boardFilter.toLowerCase()))
    .sort(bySeniority);
  const chip = p => {
    const s = state.day.staff[p.id] || {};
    return personChip(p, {
      class: 'name pchip board-chip' + (s.manual ? ' manual' : '') + (p.role === 'senior' ? ' senior' : ''), draggable: TOUCH ? null : 'true',
      title: `${p.name} · ${p.grade}${s.manual ? ' · set by hand' : s.auto ? ` · ${s.auto}` : ''}${s.status === 'elsewhere' ? ' · elsewhere (calls/clinics)' : ''}`,
      ondragstart: e => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; },
      onclick: e => openPersonBox(e.currentTarget, p, { kind: 'today' }),
    });
  };
  const col = ([key, label]) => {
    const list = people.filter(p => groupOf(state.day.staff[p.id]?.status) === key);
    return h('div', { class: 'board-col', 'data-group': key,
      ondragover: e => { e.preventDefault(); e.currentTarget.classList.add('over'); },
      ondragleave: e => e.currentTarget.classList.remove('over'),
      ondrop: e => { e.preventDefault(); e.currentTarget.classList.remove('over'); const p = person(e.dataTransfer.getData('text/plain')); if (p) setStatus(p, key); } },
      h('h3', {}, label, h('span', { class: 'seen' }, ` ${list.length}`)),
      h('div', { class: 'pool-names' }, list.map(chip)));
  };
  const manualCount = Object.values(state.day.staff).filter(s => s.manual || s.manualLiver || s.manualAway).length;
  return h('section', { class: 'card' },
    h('h2', {}, 'Manpower'),
    h('p', { class: 'hint' }, (TOUCH ? 'Tap a name to move them or change their day (leaving time, (L), comment). ' : 'Drag a name to another group, or click it to change their day (leaving time, (L), comment). ')
      + (hasMonthly() ? 'Leave, MC and post call come from the Leave, Junior and Senior rosters; anything you move by hand stays (bold border).' : 'Import the monthly rosters to fill leave, MC and post call automatically.')),
    h('div', { class: 'bar' },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Who' }, [['all', 'Everyone'], ['senior', 'Seniors'], ['junior', 'Juniors']].map(([k, l]) =>
        h('button', { 'aria-pressed': String(boardRole === k), onclick: () => { boardRole = k; render(); } }, l))),
      manualCount && hasMonthly() ? h('button', { onclick: () => {
        if (!confirm(`Undo the ${manualCount} change(s) made by hand today and go back to the monthly rosters?`)) return;
        for (const s of Object.values(state.day.staff)) {
          if (s.manualLiver && !s.autoLiver) s.liverStandby = false;
          if (s.manualAway && !s.autoAway) s.notAroundPrev = false;
          delete s.manual; delete s.manualAway; delete s.manualLiver; if (!s.auto) s.status = 'avail';
        }
        render();
      } }, 'Reset to monthly rosters') : null,
      h('span', { class: 'grow' }),
      h('input', { placeholder: 'Filter names', value: boardFilter, oninput: e => { boardFilter = e.target.value; const pos = e.target.selectionStart; render(); const i = app.querySelector('.card input[placeholder="Filter names"]'); i.focus(); i.setSelectionRange(pos, pos); } })),
    state.staff.length ? h('div', { class: 'board' }, BOARD.map(col)) : h('p', { class: 'empty' }, 'Add staff on the Staff tab first.'));
}

// The day's other duties from the monthly rosters (AOH, liver team, cardiac and so on)
function monthlyDayCard() {
  if (!hasMonthly()) return null;
  const duty = dutiesOn(state.monthly, state.day.date);
  const items = [];
  for (const def of MONTHLY) for (const c of def.cols) {
    const v = duty[def.id]?.[c.key];
    if (v) items.push([def.label.replace(' Monthly', ''), c.label, v]);
  }
  if (!items.length) return null;
  return h('section', { class: 'card' }, h('details', {},
    h('summary', {}, `From the monthly rosters today (${items.length})`),
    h('table', {}, h('tbody', {}, items.map(([r, c, v]) => h('tr', {}, h('td', { class: 'seen' }, r), h('td', {}, c), h('td', { class: personByText(v) ? '' : 'unmatched', title: personByText(v) ? '' : 'Not matched to the staff list' }, v)))))));
}

function renderToday() {
  return h('div', {},
    manpowerBoard(),
    monthlyDayCard(),
    renderGeneral(),
    h('section', { class: 'card' }, h('details', {},
      h('summary', {}, 'More: load the admin draft, paste names from the leave sheet'),
      renderDay('manpower'))));
}

// ---- the monthly roster grids ----

const curMonth = () => state.day.date.slice(0, 7);
const shiftMonth = n => { const d = new Date(state.day.date.slice(0, 7) + '-01T12:00:00'); d.setMonth(d.getMonth() + n); switchDate(d.toISOString().slice(0, 8) + '01'); };
function monthData(kind, month = curMonth(), create = false) {
  const m = state.monthly?.[month]?.[kind];
  if (m || !create) return m;
  return (((state.monthly ||= {})[month] ||= {})[kind] = monthlyDef(kind).list ? { entries: [] } : { rows: {} });
}

let pdfjs = null;
async function loadPdfJs() {
  if (pdfjs) return pdfjs;
  await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = 'vendor/pdf.min.js'; s.onload = ok; s.onerror = fail; document.head.append(s); });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  return (pdfjs = window.pdfjsLib);
}
async function readMonthlyFile(file) {
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      pages.push(tc.items.filter(x => x.str.trim()).map(x => ({ str: x.str, x: x.transform[4], y: x.transform[5], w: x.width })));
    }
    return readMonthlyPdf(pages);
  }
  const wb = await readWorkbook(file);
  return readMonthlyXlsx(wb.worksheets[0], cellText);
}
async function importMonthly(files) {
  const done = [];
  for (const file of files) {
    let res;
    try { res = await readMonthlyFile(file); } catch (e) { res = { error: `Couldn't read ${file.name}: ${e.message}` }; }
    if (res.error) { toast(res.error); continue; }
    const def = monthlyDef(res.kind);
    const old = state.monthly?.[res.month]?.[res.kind];
    if (old && !confirm(`Replace the ${def.label} for ${monthName(res.month)} with ${file.name}?`)) continue;
    ((state.monthly ||= {})[res.month] ||= {})[res.kind] = res.data;
    done.push(res);
  }
  if (!done.length) return;
  personCache.clear();
  const names = done.flatMap(r => r.data.entries ? r.data.entries.map(e => e.name) : Object.values(r.data.rows).flatMap(Object.values));
  const missing = [...new Set(names.filter(n => !personByText(n)))];
  const last = done.at(-1);
  state.monthlyView = last.kind;
  toast(`Imported ${done.map(r => `${monthlyDef(r.kind).label} (${monthName(r.month)})`).join(', ')}.${missing.length ? ` ${missing.length} name(s) aren't on the staff list.` : ''}`);
  if (last.month !== curMonth() && confirm(`Go to ${monthName(last.month)} to see it?`)) return switchDate(last.month + '-01');
  render();
}
async function exportMonthly(kind) {
  const wb = buildMonthlyWorkbook(window.ExcelJS, kind, curMonth(), monthData(kind) || {});
  const buf = await wb.xlsx.writeBuffer();
  download(`${monthlyDef(kind).label} ${monthName(curMonth())}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

function monthlyBar(kind) {
  const def = monthlyDef(kind);
  return h('section', { class: 'card' },
    h('div', { class: 'bar' },
      h('button', { title: 'Previous month', onclick: () => shiftMonth(-1) }, '‹'),
      h('h2', { style: 'margin:0' }, `${def.label} · ${monthName(curMonth())}`),
      h('button', { title: 'Next month', onclick: () => shiftMonth(1) }, '›'),
      h('span', { class: 'grow' }),
      fileButton('Import roster (PDF or Excel)', '.pdf,.xlsx', true, importMonthly),
      h('button', { onclick: () => exportMonthly(kind) }, 'Download .xlsx'),
      monthData(kind) && h('button', { onclick: () => { if (confirm(`Clear the ${def.label} for ${monthName(curMonth())}?`)) { delete state.monthly[curMonth()][kind]; render(); } } }, 'Clear')),
    h('p', { class: 'hint', style: 'margin:0' }, kind === 'leave'
      ? 'Leave sets people on leave on those days (Medical Leave counts as MC). Import the HMS leave roster or add leave by hand.'
      : `Import the HMS ${def.label.toLowerCase()} (PDF) or an Excel copy, or type names in. ${def.cols.some(c => c.to) ? 'Columns marked • fill the calls and clinics on Today. ' : ''}${def.cols.some(c => c.night) ? 'Overnight duties make people post call the next day. ' : ''}Names in red aren't matched to the staff list.`));
}

function renderMonthlyRoster(kind) {
  const def = monthlyDef(kind);
  if (def.list) return renderLeaveRoster();
  const month = curMonth();
  const data = monthData(kind);
  const set = (d, key, v) => {
    const rows = monthData(kind, month, true).rows;
    const rec = (rows[d] ||= {});
    if (v) rec[key] = v; else delete rec[key];
    personCache.clear();
    render();
  };
  const today = +state.day.date.slice(8, 10);
  const cell = (d, c) => {
    const v = data?.rows?.[d]?.[c.key] || '';
    return h('td', {}, nameInput({ value: v, class: v && !personByText(v) ? 'unmatched' : '', title: v && !personByText(v) ? 'Not matched to the staff list' : '',
      onchange: e => set(d, c.key, cleanCell(e.target.value)),
      onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } } }));
  };
  const days = Array.from({ length: daysIn(month) }, (_, i) => i + 1);
  return h('div', {}, monthlyBar(kind),
    h('section', { class: 'card scroll' }, h('table', { class: 'monthly' },
      h('thead', {}, h('tr', {}, ['Date', 'Day', ...def.cols.map(c => `${c.label}${c.to ? ' •' : ''}${c.night ? ' ☾' : ''}`)].map(t => h('th', {}, t)))),
      h('tbody', {}, days.map(d => {
        const wd = weekday(month, d);
        return h('tr', { class: (wd === 'Sat' || wd === 'Sun' ? 'weekend' : '') + (d === today ? ' today' : '') },
          h('td', {}, h('button', { class: 'link', title: 'Go to this day', onclick: () => { switchDate(`${month}-${String(d).padStart(2, '0')}`); } }, d)),
          h('td', { class: 'seen' }, wd),
          def.cols.map(c => cell(d, c)));
      })))));
}

let leaveFilter = '';
function renderLeaveRoster() {
  const month = curMonth();
  const data = monthData('leave');
  const entries = (data?.entries || [])
    .filter(e => !leaveFilter || e.name.toLowerCase().includes(leaveFilter.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name) || a.from.localeCompare(b.from));
  const change = () => { personCache.clear(); render(); };
  const row = e => h('tr', {},
    h('td', {}, nameInput({ value: e.name, class: personByText(e.name) ? '' : 'unmatched', title: personByText(e.name) ? '' : 'Not matched to the staff list', onchange: ev => { e.name = cleanCell(ev.target.value); change(); } })),
    h('td', {}, h('input', { type: 'date', value: e.from, onchange: ev => { e.from = ev.target.value; if (e.to < e.from) e.to = e.from; change(); } })),
    h('td', {}, h('input', { type: 'date', value: e.to, onchange: ev => { e.to = ev.target.value < e.from ? e.from : ev.target.value; change(); } })),
    h('td', {}, select(e.type, LEAVE_TYPES.includes(e.type) || !e.type ? LEAVE_TYPES : [e.type, ...LEAVE_TYPES], v => { e.type = v; change(); })),
    h('td', {}, h('input', { value: e.remarks || '', onchange: ev => { e.remarks = ev.target.value; save(); } })),
    h('td', {}, h('button', { class: 'small', title: 'Remove', onclick: () => { data.entries = data.entries.filter(x => x !== e); change(); } }, '✕')));
  return h('div', {}, monthlyBar('leave'),
    h('section', { class: 'card scroll' },
      h('div', { class: 'bar' },
        h('button', { onclick: () => { monthData('leave', month, true).entries.unshift({ name: '', from: state.day.date, to: state.day.date, type: 'Annual Leave', remarks: '' }); leaveFilter = ''; render(); } }, '+ Add leave'),
        h('span', { class: 'stats' }, h('span', {}, h('b', {}, data?.entries?.length || 0), ' entries')),
        h('span', { class: 'grow' }),
        h('input', { placeholder: 'Filter names', value: leaveFilter, oninput: e => { leaveFilter = e.target.value; const pos = e.target.selectionStart; render(); const i = app.querySelector('.card.scroll input[placeholder="Filter names"]'); i.focus(); i.setSelectionRange(pos, pos); } })),
      entries.length
        ? h('table', {}, h('thead', {}, h('tr', {}, ['Name', 'From', 'To', 'Leave type', 'Remarks', ''].map(t => h('th', {}, t)))), h('tbody', {}, entries.map(row)))
        : h('p', { class: 'empty' }, `No leave for ${monthName(month)} yet.`)));
}

// ----- premed tab -----

function renderPremed() {
  const r = state.roster;
  if (!r) return h('section', { class: 'card empty' }, 'Generate a roster on the Roster tab first.');
  const byName = n => matchName(n, state.staff).person;
  const away = p => !!p && !!state.day.staff[p.id]?.notAroundPrev;
  // who can cover: residents and MOPEX who were around yesterday and are working today
  const coverers = state.staff.filter(p => p.role === 'junior' && !isBaby(p) && !away(p)
    && ['avail', 'elsewhere'].includes(state.day.staff[p.id]?.status || 'avail'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const load = {};
  for (const row of r.rows) for (const n of cellParts(row, 'premed')) load[n] = (load[n] || 0) + 1;
  const homeOf = {};
  r.rows.forEach(row => cellParts(row, 'junior').forEach(part => { const p = byName(namesInCell(part)[0] || ''); if (p) homeOf[p.id] = row.label; }));

  const setCover = (row, name) => {
    undoStack.push(JSON.stringify(r.rows));
    row.premed = name ? `${name} - Premed` : '';
    afterRosterEdit();
  };
  let needed = 0, missing = 0;
  const rows = r.rows.filter(row => row.complex !== 'Clinic').map(row => {
    const juniors = cellParts(row, 'junior').map(part => ({ part, p: byName(namesInCell(part)[0] || '') }));
    const awayNames = juniors.filter(j => away(j.p)).map(j => j.p.name);
    const needs = awayNames.length > 0;
    const mate = juniors.find(j => j.p && !away(j.p) && !isBaby(j.p))?.p;
    const cur = cellParts(row, 'premed')[0] || '';
    if (needs) { needed++; if (!cur) missing++; }
    const options = [['', '— none —'], ...coverers.map(p => [p.name, `${p.name}${homeOf[p.id] ? ' · ' + homeOf[p.id] : ' · not on a list'}${load[p.name] ? ` · ${load[p.name]} room${load[p.name] > 1 ? 's' : ''}` : ''}`])];
    if (cur && !options.some(o => o[0] === cur)) options.push([cur, cur]);
    const coverP = cur && byName(cur);
    return h('tr', { class: needs && !cur ? 'flagged' : '' },
      h('td', { class: 'room' }, row.label + ':'),
      h('td', {}, h('div', { class: 'names' }, juniors.map(j => j.p
        ? personChip(j.p, { onclick: e => openPersonBox(e.currentTarget, j.p, { kind: 'view' }) })
        : h('span', { class: 'name', style: colourStyle(j.part) }, j.part)))),
      h('td', { class: 'seen' }, awayNames.length ? `${awayNames.join(', ')} away yesterday${mate && !cur ? ` · ${mate.name} in the same room could cover` : ''}` : ''),
      h('td', {}, coverP
        ? personChip(coverP, { onclick: e => openPersonBox(e.currentTarget, coverP, { kind: 'premed', options, setCover: v => setCover(row, v) }) })
        : select('', [['', needs ? '+ Add cover (needed)' : '+ Add cover'], ...options.slice(1)], v => setCover(row, v))));
  }).filter(Boolean);
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Premed cover'),
      h('p', { class: 'hint' }, 'A room needs premed cover when its junior wasn\'t around on the previous working day (it comes from the monthly rosters, or tick "away yesterday" under Monthly › Today). Cover can be any resident or MOPEX who was around, from any complex. The list shows where each person is today and how many rooms they already cover (max ' + state.settings.premedCap + ').'),
      h('div', { class: 'bar' },
        h('span', { class: 'stats' }, h('span', {}, h('b', {}, needed), ' rooms need cover'), h('span', {}, h('b', {}, missing), ' still without')),
        h('span', { class: 'grow' }))),
    h('section', { class: 'card scroll' }, h('table', { class: 'sheet' },
      h('thead', {}, h('tr', {}, ['', 'Junior', '', 'Premed cover'].map(t => h('th', {}, t)))),
      h('tbody', {}, rows))),
    rosterLogCard());
}

// The sheet exactly as it will be exported, drawn as an HTML table.
function renderSheet() {
  colourCache.clear();
  const layout = buildLayout({ date: state.day.date, rows: state.roster.rows, lists: rosterLists(), general: effectiveGeneral(), box: commentsText(), colourOf, shortOf });
  const start = {}, covered = new Set();
  for (const c of layout.cells) {
    start[c.r + ':' + c.c1] = c;
    for (let r = c.r; r <= c.r2; r++) for (let k = c.c1; k <= c.c2; k++) if (r !== c.r || k !== c.c1) covered.add(r + ':' + k);
  }
  const trs = [];
  for (let r = 2; r <= layout.rows; r++) {
    const tds = [];
    for (let k = 1; k <= layout.cols; k++) {
      if (covered.has(r + ':' + k)) continue;
      const c = start[r + ':' + k];
      if (!c) { tds.push(h('td', {})); continue; }
      const style = [
        `font-size:${c.sz === 10 ? 13 : 11}px`, c.bold ? 'font-weight:700' : '', c.color ? `color:#${c.color.slice(2)}` : '',
        `text-align:${c.align}`, `vertical-align:${c.valign}`,
        c.fill ? `background:#${c.fill.slice(2)}` : '', c.pad ? 'padding:6px 10px' : '',
      ].filter(Boolean).join(';');
      const attrs = { class: (c.box ? 'box' : '') + (c.c1 === 12 ? ' spill' : ''), colspan: c.c2 - c.c1 + 1, rowspan: c.r2 - c.r + 1, style };
      const lines = String(c.text).split('\n');
      tds.push(h('td', attrs, c.runs
        ? c.runs.map(run => h(run.sup ? 'sup' : 'span', { style: run.color ? `color:#${run.color.slice(2)}` : '' }, run.text))
        : lines.map((t, i) => [i ? h('br') : null, c.underlineFirst && i === 0 ? h('u', {}, t) : t])));
    }
    trs.push(h('tr', { style: layout.heights[r] ? `height:${Math.round(layout.heights[r] * 1.33)}px` : '' }, tds));
  }
  return h('section', { class: 'card scroll sheet-wrap' },
    h('table', { class: 'xl' },
      h('colgroup', {}, COL_WIDTHS.map(w => h('col', { style: `width:${Math.round(w * 7 + 5)}px` }))),
      h('tbody', {}, trs)));
}

// Rosters saved before AH OT, AOCC and AIC were added get empty rows for them.
function ensureSpecialRows(r) {
  if (r.rows.some(x => x.complex === 'Clinic')) return;
  r.rows.unshift(...SPECIAL_ROWS.map(x => ({ roomId: x.id, label: x.name, complex: 'Clinic', senior: '', junior: '', premed: '', notes: '' })));
  lastRows = JSON.stringify(r.rows);
}

// The comments box: free text at the top right of the sheet.
// Comments added to names on the roster ("Koh YW -mtg 3pm") as comments box lines.
function nameComments() {
  const out = [];
  for (const row of state.roster?.rows || []) for (const key of ['senior', 'junior']) for (const part of cellParts(row, key)) {
    const { name, dash } = parseNamePart(part);
    if (dash) { const line = `${shortOf(name)} - ${dash}`; if (!out.includes(line)) out.push(line); }
  }
  return out;
}
// The comments box text: what was typed, then name comments not already in it.
function commentsText() {
  const typed = state.day.box || '';
  const extra = nameComments().filter(l => !typed.toLowerCase().includes(l.toLowerCase()));
  return [typed.trimEnd(), ...extra].filter(Boolean).join('\n');
}

function boxCard() {
  const fromNames = nameComments();
  return h('section', { class: 'card' },
    h('h2', {}, 'Comments box'),
    h('p', { class: 'hint' }, 'Shown in the box at the top right of the sheet, e.g. meetings or people away. People on an admin day go on the Admin/no list row instead (Monthly › Today).'),
    h('textarea', { rows: 5, value: state.day.box || '', placeholder: 'e.g. Melody Goh - mtg 2 to 5pm', onchange: e => {
      const before = state.day.box || '';
      state.day.box = e.target.value;
      logRoster([`Comments box: ${before || '—'} → ${e.target.value || '—'}`]);
      save();
    } }),
    fromNames.length ? h('div', { class: 'hint' }, 'Also shown, from comments on names:', h('ul', {}, fromNames.map(l => h('li', {}, l)))) : null);
}

function renderRoster() {
  const r = state.roster;
  const actions = h('div', { class: 'bar' },
    h('button', { class: 'primary', onclick: () => runGenerate(!!r) }, r ? 'Generate new' : 'Generate roster'),
    r && r.date === state.day.date && h('button', { onclick: fillGaps, title: 'Keep every name already on the roster and fill only the empty cells' }, 'Fill empty gaps'),
    r && h('button', { disabled: !undoStack.length, onclick: undo }, 'Undo'),
    r && isMember() && h('button', { class: 'primary', onclick: saveRosterToCloud }, 'Save'),
    r && h('div', { class: 'seg', role: 'group', 'aria-label': 'View' },
      h('button', { 'aria-pressed': String(rosterView === 'edit'), onclick: () => { rosterView = 'edit'; render(); } }, 'Edit'),
      h('button', { 'aria-pressed': String(rosterView === 'sheet'), onclick: () => { rosterView = 'sheet'; render(); } }, 'Sheet preview')),
    r && downloadButton(),
  );
  if (!r) return h('div', {}, h('section', { class: 'card' }, h('h2', {}, 'OT roster'), h('p', { class: 'hint' }, 'Generates AOCC, AIC and the OT lists: seniors, juniors and premed cover. You can edit any cell before downloading.'), actions), historyCard());

  ensureSpecialRows(r);
  const doubles = doubleCovered(r.rows.filter(x => x.complex !== 'Clinic'));
  const flaggedRooms = new Set([...(r.warnings || []), ...(r.checks || [])].filter(w => w.level === 'error').map(w => w.text.split(':')[0]));
  const body = [];
  let last = null;
  r.rows.forEach((row, i) => {
    const sp = row.complex === 'Clinic';
    if (!sp && i && r.rows[i - 1].complex === 'Clinic') body.push(h('tr', { class: 'gap' }, h('td', { colspan: 4 })));
    body.push(h('tr', { class: (flaggedRooms.has(row.label) ? 'flagged' : '') + (sp ? ' special' : '') },
      h('td', { class: 'room' }, row.label + ':'),
      rosterCell(row, i, 'senior', doubles),
      row.roomId === 'aic' || row.roomId === 'ahot' ? h('td', {}) : rosterCell(row, i, 'junior', doubles),
      sp ? h('td', {}) : notesCell(row, i, { class: 'notes' })));
  });
  const genRooms = new Set((r.warnings || []).filter(w => w.level === 'error').map(w => w.text.split(':')[0]));
  const seen = new Set();
  const all = [...(r.warnings || []), ...(r.checks || []).filter(w => !(genRooms.has(w.text.split(':')[0]) && / no senior\.$/.test(w.text)))]
    .filter(w => !seen.has(w.text) && seen.add(w.text));
  const order = { error: 0, warn: 1, info: 2 };
  all.sort((a, b) => order[a.level] - order[b.level]);

  if (rosterView === 'sheet') {
    return h('div', {},
      h('section', { class: 'card no-print' }, h('h2', {}, 'OT roster'), actions,
        h('p', { class: 'hint', style: 'margin:0' }, 'This is what the downloaded .xlsx looks like. The top half comes from Monthly › Today; case notes aren\'t included. Switch to Edit to move names or change tags. & marks a senior who is double covering.')),
      renderSheet());
  }
  return h('div', {},
    h('section', { class: 'card' }, h('h2', {}, 'OT roster'), actions,
      h('p', { class: 'hint', style: 'margin:0' }, 'Drag a name onto another name to swap them, or onto an empty part of a cell to move it there. Drag the C on a junior to add them to another room as an ad hoc cover, or the & on a senior to have them double cover another room (a dark & means they already are). × takes a name off. Click a name to see where they are and change its tags ((L), (RA), L-4pm, C-OT13…). + adds someone from the staff list. Click the case notes to edit them. Premed cover is on the Premeds tab.')),
    h('div', { class: 'cols' },
      h('section', { class: 'card scroll' },
        h('table', { class: 'sheet' },
          h('thead', {}, h('tr', {}, ['', 'Senior', 'Junior', 'Cases'].map(t => h('th', {}, t)))),
          h('tbody', {}, body))),
      h('div', {},
        noListCard(),
        boxCard(),
        callsCard(),
        historyCard(),
        rosterLogCard(),
        h('section', { class: 'card' },
          h('h2', {}, 'Things to look at'),
          all.length ? h('ul', { class: 'warnings' }, all.map(w => h('li', { class: w.level }, w.text))) : h('p', { class: 'hint' }, 'No problems found.')),
      ),
    ),
  );
}

// Everyone available but on no list. They go on the sheet's Admin/no list row; drag them
// onto the roster to give them a list, or drag a name here to take it off.
function noListCard() {
  const people = noListPeople();
  const admin = state.staff.filter(p => state.day.staff[p.id]?.status === 'admin');
  const chip = p => personChip(p, { title: `${p.name} · ${p.grade}. Drag onto the roster.`,
    onpointerdown: TOUCH ? null : e => startNameDrag(e, { pool: p.id }),
    onclick: TOUCH ? e => openPersonBox(e.currentTarget, p, { kind: 'view' }) : null });
  const group = (title, list) => list.length ? h('div', { class: 'pool-group' }, h('b', {}, title), h('div', { class: 'pool-names' }, list.map(chip))) : null;
  return h('section', { class: 'card pool', 'data-drop': '', 'data-pool': '' },
    h('h2', {}, 'Admin / no list'),
    h('p', { class: 'hint' }, TOUCH ? 'Working today but not on any list, so they go on the Admin/no list row. Use + on the roster to give them a list.' : 'Working today but not on any list, so they go on the Admin/no list row. Drag a name onto the roster to give them a list, or drag a name off the roster onto this box (or click its ×).'),
    group('Seniors', people.filter(p => p.role === 'senior')),
    group('Juniors', people.filter(p => p.role === 'junior')),
    group('Admin day', admin),
    !people.length && !admin.length ? h('p', { class: 'hint' }, 'Everyone working has a list.') : null);
}

async function exportXlsx() {
  colourCache.clear();
  const wb = buildRosterWorkbook(window.ExcelJS, { date: state.day.date, rows: state.roster.rows, lists: rosterLists(), general: effectiveGeneral(), box: commentsText(), colourOf, shortOf });
  const buf = await wb.xlsx.writeBuffer();
  download(`OT roster ${state.day.date}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

let jspdf = null;
async function exportPdf() {
  if (!jspdf) {
    await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = 'vendor/jspdf.umd.min.js'; s.onload = ok; s.onerror = fail; document.head.append(s); });
    jspdf = window.jspdf.jsPDF;
  }
  colourCache.clear();
  const layout = buildLayout({ date: state.day.date, rows: state.roster.rows, lists: rosterLists(), general: effectiveGeneral(), box: commentsText(), colourOf, shortOf });
  download(`OT roster ${state.day.date}.pdf`, buildRosterPdf(jspdf, layout).output('blob'));
}

// Download button: the format last picked (remembered in this browser), with a menu to change it.
const DOWNLOADS = [['xlsx', 'Download .xlsx', exportXlsx], ['pdf', 'Download PDF', exportPdf], ['print', 'Print', () => { rosterView = 'sheet'; render(); setTimeout(() => window.print(), 100); }]];
let downloadMenu = false;
function downloadButton() {
  let pick = 'xlsx';
  try { pick = localStorage.getItem('nuh-roster-download') || 'xlsx'; } catch { /* no storage */ }
  const cur = DOWNLOADS.find(d => d[0] === pick) || DOWNLOADS[0];
  return h('div', { class: 'split' },
    h('button', { onclick: () => cur[2]() }, cur[1]),
    h('button', { class: 'caret', 'aria-label': 'Other formats', 'aria-expanded': String(downloadMenu), onclick: () => { downloadMenu = !downloadMenu; render(); } }, '▾'),
    downloadMenu ? h('div', { class: 'menu' }, DOWNLOADS.map(([k, label, fn]) => h('button', { class: k === cur[0] ? 'on' : '', onclick: () => {
      if (k !== 'print') { try { localStorage.setItem('nuh-roster-download', k); } catch { /* no storage */ } }
      downloadMenu = false; render(); fn();
    } }, label))) : null);
}

// ----- settings tab -----

function roomEditor() {
  const t = state.roomTemplate;
  const changed = () => { syncRooms(); render(); };
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= t.length) return; [t[i], t[j]] = [t[j], t[i]]; changed(); };
  const complexes = [...new Set(['Other', 'KROR', 'MCOR', 'MOR', ...t.map(r => r.complex)])];
  return h('div', { class: 'scroll' }, h('table', {},
    h('thead', {}, h('tr', {}, ['Complex', 'Room', 'Running by default', ''].map(x => h('th', {}, x)))),
    h('tbody', {},
      t.map((r, i) => h('tr', {},
        h('td', {}, select(r.complex, complexes, v => { r.complex = v; changed(); })),
        h('td', {}, h('input', { value: r.name, onchange: e => {
          const v = e.target.value.trim();
          if (!v || t.some(x => x !== r && x.name === v)) { toast(v ? `${v} is already in the list.` : 'A room needs a name.'); e.target.value = r.name; return; }
          (state.day.rooms || []).forEach(x => { if (x.name === r.name) x.name = v; });
          r.name = v; changed();
        } })),
        h('td', {}, h('input', { type: 'checkbox', checked: r.defaultOn, 'aria-label': 'Running by default', onchange: e => { r.defaultOn = e.target.checked; save(); } })),
        h('td', { style: 'white-space:nowrap' },
          h('button', { class: 'small', title: 'Move up', onclick: () => move(i, -1) }, '↑'), ' ',
          h('button', { class: 'small', title: 'Move down', onclick: () => move(i, 1) }, '↓'), ' ',
          h('button', { class: 'small', title: 'Remove room', onclick: () => { if (confirm(`Remove ${r.name} from the roster?`)) { t.splice(i, 1); changed(); } } }, '✕')))),
      h('tr', {}, h('td', { colspan: 4 }, h('button', { class: 'small', onclick: () => {
        const name = prompt('Room name, e.g. MOR 19');
        if (!name?.trim()) return;
        if (t.some(x => x.name === name.trim())) return toast(`${name.trim()} is already in the list.`);
        const complex = (name.match(/^(KROR|MCOR|MOR)/i)?.[1] || 'Other').toUpperCase().replace('OTHER', 'Other');
        let i = t.map(x => x.complex).lastIndexOf(complex);
        t.splice(i < 0 ? t.length : i + 1, 0, { complex, name: name.trim(), defaultOn: true });
        changed();
      } }, '+ Add room'))))));
}

function renderSettings() {
  const st = state.settings;
  const subRow = s => h('tr', {},
    h('td', {}, h('input', { value: s.label, onchange: e => { s.label = e.target.value; save(); } })),
    h('td', {}, h('input', { value: s.keywords.join(', '), onchange: e => { s.keywords = splitNameList(e.target.value).map(x => x.toLowerCase()); save(); } })),
    h('td', {}, h('label', {}, h('input', { type: 'checkbox', checked: s.hard, onchange: e => { s.hard = e.target.checked; save(); } }), ' required')),
    h('td', {}, select(s.posting || '', POSTINGS, v => { s.posting = v; save(); })),
    h('td', {}, h('button', { class: 'small', onclick: () => { st.subspecs = st.subspecs.filter(x => x !== s); render(); } }, '✕')),
  );

  return h('div', {},
    h('section', { class: 'card' },
      h('div', { class: 'bar', style: 'margin:0' },
        h('h2', { class: 'grow', style: 'margin:0' }, 'Settings'),
        settingsEditing
          ? h('button', { class: 'primary', onclick: () => { settingsEditing = false; render(); toast(isMember() ? 'Settings kept here. Use "Save for the team" to share them.' : 'Settings saved.'); } }, 'Done')
          : h('button', { onclick: () => { settingsEditing = true; render(); } }, 'Edit settings')),
      h('p', { class: 'hint', style: 'margin:0' }, settingsEditing ? 'Editing: changes apply straight away.' : 'Read only. Press Edit settings to change anything.'),
      teamSyncBar()),
    h('fieldset', { class: 'lock', disabled: !settingsEditing },
    h('section', { class: 'card scroll' },
      h('h2', {}, 'Subspecialties'),
      h('p', { class: 'hint' }, 'Keywords are matched as whole words in the case notes. "Required" means only seniors with that subspec can take the list. The posting is the junior posting that suits it.'),
      h('table', {},
        h('thead', {}, h('tr', {}, ['Name', 'Keywords in case notes', 'Senior', 'Junior posting', ''].map(t => h('th', {}, t)))),
        h('tbody', {}, st.subspecs.map(subRow))),
      h('div', { class: 'bar', style: 'margin-top:8px' },
        h('button', { onclick: () => { const label = prompt('Subspecialty name'); if (label) { st.subspecs.push({ key: label.toLowerCase().replace(/\W+/g, '-'), label, keywords: [], hard: false, posting: '' }); render(); } } }, '+ Add subspecialty')),
    ),
    h('section', { class: 'card' },
      h('h2', {}, 'Rules'),
      h('div', { class: 'paste' },
        h('div', {}, h('label', {}, 'Paeds if patient is younger than (years)'), h('input', { type: 'number', min: 1, max: 18, value: st.paedsAgeYears, onchange: e => { st.paedsAgeYears = +e.target.value || 12; save(); } })),
        h('div', {}, h('label', {}, 'Max rooms per premed cover'), h('input', { type: 'number', min: 1, max: 6, value: st.premedCap, onchange: e => { st.premedCap = +e.target.value || 3; save(); } })),
        h('div', {}, h('label', {}, 'Complex list keywords'), h('textarea', { value: st.complexKeywords.join(', '), onchange: e => { st.complexKeywords = splitNameList(e.target.value).map(x => x.toLowerCase()); save(); } })),
        h('div', {}, h('label', {}, 'Runs-late keywords'), h('textarea', { value: st.longKeywords.join(', '), onchange: e => { st.longKeywords = splitNameList(e.target.value).map(x => x.toLowerCase()); save(); } })),
      ),
    ),
    h('section', { class: 'card' },
      h('h2', {}, 'Post call'),
      h('p', { class: 'hint' }, 'Someone on one of these overnight duties in the monthly rosters is post call the next day.'),
      h('div', { class: 'chips' }, MONTHLY.flatMap(def => def.cols.filter(c => !def.list).map(c => {
        const key = `${def.id}.${c.key}`;
        const list = st.nightDuties || NIGHT_DUTIES;
        const on = list.includes(key);
        return h('span', { class: 'chip' + (on ? ' on' : ''), onclick: () => { st.nightDuties = on ? list.filter(k => k !== key) : [...list, key]; render(); } }, `${def.label.replace(' Monthly', '')}: ${c.label}`);
      })))),
    h('section', { class: 'card' },
      h('h2', {}, 'Rooms'),
      h('p', { class: 'hint' }, 'The rooms on the roster, in order. "Running by default" rooms are ticked when you set up a new day (Clear day). Rooms in the same complex can share a senior when seniors are short. MOR 7–9 are emergency OTs, so they have no line.'),
      roomEditor(),
      h('p', { class: 'hint', style: 'margin-top:12px' }, 'Room defaults: subspecs a room always needs, one room per line, e.g. "MOR 12: cardiac". Use the keys ' + st.subspecs.map(x => x.key).join(', ') + '.'),
      h('textarea', { rows: 3, value: Object.entries(st.roomDefaults || {}).map(([room, ks]) => `${room}: ${ks.join(', ')}`).join('\n'), onchange: e => {
        const keys = new Set(st.subspecs.map(x => x.key));
        const out = {}, bad = [];
        for (const line of e.target.value.split('\n')) {
          const [room, ks] = line.split(':');
          if (!room?.trim() || ks == null) continue;
          const list = splitNameList(ks).map(x => x.toLowerCase());
          bad.push(...list.filter(k => !keys.has(k)));
          out[room.trim().toUpperCase().replace(/\s+/, ' ')] = list.filter(k => keys.has(k));
        }
        st.roomDefaults = out;
        state.day.rooms.forEach(r => { if (!r.flagsManual) r.flags = suggestFlags(r.notes, st, r.name); });
        save(); toast(bad.length ? `Unknown subspec: ${bad.join(', ')}` : 'Room defaults updated.');
      } }),
    ),
    ),
    isAdmin() ? membersCard() : null,
    h('section', { class: 'card' },
      h('h2', {}, 'Demo mode'),
      h('p', { class: 'hint' }, 'Try the app with a made-up department: invented staff, monthly rosters and cases. The demo is kept apart from your real data and never signs in or shares anything. Send the link to anyone who wants to try it.'),
      h('div', { class: 'bar', style: 'margin:0' },
        DEMO ? null : h('a', { class: 'btn', href: demoLink(), target: '_blank', rel: 'noopener' }, 'Open demo'),
        h('button', { onclick: () => navigator.clipboard.writeText(demoLink()).then(() => toast('Demo link copied.'), () => prompt('Demo link', demoLink())) }, 'Copy demo link'),
        h('code', { class: 'seen' }, demoLink()))),
    h('fieldset', { class: 'lock', disabled: !settingsEditing },
    h('section', { class: 'card' },
      h('h2', {}, 'Reset'),
      h('div', { class: 'bar' },
        h('button', { onclick: () => { if (confirm('Reset rules and subspecialties to the defaults? Staff are kept.')) { state.settings = clone(DEFAULT_SETTINGS); render(); } } }, 'Reset rules'),
        h('button', { onclick: () => { if (confirm('Delete everything stored in this browser (staff, day, roster)?')) { state = blankState(); syncRooms(); render(); } } }, 'Delete all data in this browser')),
    )),
  );
}

// ---------- team file ----------

document.getElementById('saveTeam').addEventListener('click', () => {
  const data = { kind: 'ot-roster-team', version: 1, savedAt: new Date().toISOString(), settings: state.settings, staff: state.staff, roomTemplate: state.roomTemplate, roomsVersion: state.roomsVersion, staffLog: state.staffLog || [] };
  download(`OT roster team file ${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
});
document.getElementById('loadTeam').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.kind !== 'ot-roster-team') throw new Error('not a team file');
    if (state.staff.length && !confirm('Replace the staff list, rooms and settings in this browser with the team file?')) return;
    state.settings = { ...clone(DEFAULT_SETTINGS), ...data.settings };
    state.staff = data.staff || [];
    state.staffLog = data.staffLog || [];
    staffBackup = null;
    cleanStaffNames();
    state.roomTemplate = data.roomTemplate || clone(DEFAULT_ROOMS);
    state.roomsVersion = data.roomsVersion || 1;
    migrateRooms();
    nextId = 1 + state.staff.reduce((m, p) => Math.max(m, parseInt(String(p.id).replace(/\D/g, ''), 10) || 0), 0);
    syncRooms();
    render();
    toast(`Team file loaded: ${state.staff.length} staff.`);
  } catch {
    toast("That file isn't an OT roster team file.");
  }
});

// ---------- team sign-in and shared rosters ----------

const cs = { ready: !cloud.enabled, user: null, member: null, meta: {}, versions: {}, recent: null, members: null, request: null, requests: null };
let rostererName = '';
const nameKey = () => 'ot-roster-name:' + (cs.user?.email || '').toLowerCase();
function storeName(n) { rostererName = n; try { localStorage.setItem(nameKey(), n); } catch { /* no storage */ } }
state.cloudBase ||= {}; // date -> updatedAt of the cloud copy this browser last loaded or saved

const isMember = () => !!cs.member;
const isAdmin = () => cs.member?.role === 'admin';
const me = () => ({ email: cs.user.email, displayName: cs.user.displayName, rostererName: rostererName.trim() });
const when = ms => new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const byName = b => b?.name || b?.email || 'someone';

function cloudError(e) {
  console.error(e);
  toast(e?.code === 'permission-denied' ? "You don't have access to that. Ask an admin to add you to the team." : `Couldn't reach the shared storage: ${e?.message || e}`);
}

function renderCloudBar() {
  const el = document.getElementById('cloud');
  if (!el) return;
  const note = document.getElementById('privacy');
  if (note && cloud.enabled) {
    note.textContent = isMember() ? '' : 'Works in this browser without signing in. Sign in to save and share rosters with the team.';
    note.hidden = isMember();
  }
  if (!cloud.enabled) { el.replaceChildren(); return; }
  if (!cs.ready) { el.replaceChildren(h('span', { class: 'seen' }, 'Connecting…')); return; }
  if (!cs.user) {
    el.replaceChildren(h('button', { class: 'primary', onclick: () => cloud.signIn().catch(e => { if (e?.code !== 'auth/popup-closed-by-user') cloudError(e); }) }, 'Sign in with Google'));
    return;
  }
  const out = h('button', { onclick: () => cloud.signOut() }, 'Sign out');
  if (!cs.member) {
    if (!cs.memberError) {
      el.replaceChildren(...[
        cs.request
          ? h('span', { class: 'seen' }, `${cs.user.email}: access requested ${when(cs.request.requestedAt)}. An admin needs to approve it, then sign in again.`)
          : [h('span', { class: 'seen' }, `${cs.user.email} isn't on the team yet.`),
            h('button', { class: 'primary', onclick: async () => {
              const name = prompt('Your name, so the admin knows who you are:', cs.user.displayName || '');
              if (name === null) return;
              try { cs.request = await cloud.requestAccess(cs.user, name.trim()); render(); toast('Access requested. An admin will approve it.'); } catch (e) { cloudError(e); }
            } }, 'Request access')],
        out].flat());
      return;
    }
    const why = cs.memberError === 'permission-denied'
        ? `Signed in as ${cs.user.email}, but the database refused access. Check the Firestore rules are published.`
        : `Signed in as ${cs.user.email}, but the team list couldn't be checked (${cs.memberError}).`;
    el.replaceChildren(h('span', { class: 'seen' }, why), out);
    return;
  }
  el.replaceChildren(...[
    h('label', { class: 'seen', title: 'Shown in the history when you save' }, 'Rosterer ',
      h('input', { value: rostererName, placeholder: cs.user.displayName || 'Your name', style: 'width:140px', onchange: e => {
        storeName(e.target.value);
      } })),
    h('span', { class: 'seen', title: cs.user.email }, isAdmin() ? 'admin' : ''),
    isAdmin() && Array.isArray(cs.requests) && cs.requests.length
      ? h('button', { onclick: () => { state.tab = 'settings'; render(); document.getElementById('requests')?.scrollIntoView(); } }, `${cs.requests.length} access request${cs.requests.length > 1 ? 's' : ''}`)
      : null,
    out].filter(Boolean));
}

cloud.watchUser(async user => {
  cs.user = user; cs.member = null; cs.meta = {}; cs.versions = {}; cs.recent = null; cs.members = null; cs.request = null; cs.requests = null;
  if (user) {
    cs.memberError = null;
    try { cs.member = await cloud.membership(user.email); } catch (e) { cs.memberError = e?.code || String(e); console.error(e); }
    rostererName = '';
    try { rostererName = localStorage.getItem(nameKey()) || ''; } catch { /* no storage */ }
    if (cs.member && !rostererName) rostererName = cs.member.name || user.displayName || '';
    if (!cs.member && !cs.memberError) { try { cs.request = await cloud.myRequest(user.email); } catch (e) { console.error(e); } }
    if (cs.member?.role === 'admin') { try { cs.requests = await cloud.listRequests(); } catch (e) { console.error(e); cs.requests = []; } }
  }
  cs.ready = true;
  render();
  if (cs.member) loadTeamFromCloud(false);
}).catch(e => { cs.ready = true; cloudError(e); render(); });

const teamHash = () => JSON.stringify([state.settings, state.staff, state.roomTemplate, state.staffLog || [], state.monthly || {}]);

// Shown on the staff and settings tabs: whether this browser's staff list, rooms and settings match the team's.
function teamSyncBar() {
  if (!isMember()) return cloud.enabled ? null : h('p', { class: 'hint' }, 'To share with other rosterers, use Export JSON at the bottom of the page.');
  const dirty = state.teamSyncedHash !== teamHash();
  return h('div', { class: 'bar sync' + (dirty ? ' dirty' : '') },
    h('span', {}, dirty
      ? 'You have changes to staff, rooms, settings or monthly rosters that the team doesn\'t have yet.'
      : `Shared with the team${state.teamSyncedAt ? `, last saved ${when(state.teamSyncedAt)}` : ''}.`),
    h('button', { class: dirty ? 'primary' : '', onclick: saveTeamToCloud }, 'Save for the team'),
    h('button', { onclick: () => loadTeamFromCloud(true) }, 'Load team version'));
}

async function saveTeamToCloud() {
  try {
    const doc = await cloud.saveTeam({ settings: state.settings, staff: state.staff, roomTemplate: state.roomTemplate, roomsVersion: state.roomsVersion, staffLog: state.staffLog || [] }, me());
    await cloud.saveMonthly(state.monthly || {}, me());
    state.teamSyncedAt = doc.updatedAt;
    state.teamSyncedHash = teamHash();
    render();
    toast(`Saved for the team: ${state.staff.length} staff, ${state.roomTemplate.length} rooms and settings.`);
  } catch (e) { cloudError(e); }
}

async function loadTeamFromCloud(asked) {
  try {
    const t = await cloud.loadTeam();
    if (!t) { if (asked) toast('Nobody has saved a team staff list yet.'); return; }
    if (!asked && t.updatedAt === state.teamSyncedAt) return;
    if (state.staff.length && !confirm(`Load the team's staff list (${t.staff?.length || 0} people, saved by ${byName(t.updatedBy)} ${when(t.updatedAt)})? It replaces the staff list, rooms and settings in this browser.`)) return;
    state.settings = { ...clone(DEFAULT_SETTINGS), ...t.settings };
    state.staff = t.staff || [];
    state.staffLog = t.staffLog || [];
    staffBackup = null;
    cleanStaffNames();
    state.roomTemplate = t.roomTemplate || clone(DEFAULT_ROOMS);
    const m = await cloud.loadMonthly();
    if (m) state.monthly = m.months || {};
    state.teamSyncedAt = t.updatedAt;
    state.roomsVersion = t.roomsVersion || 1;
    migrateRooms();
    nextId = 1 + state.staff.reduce((m, p) => Math.max(m, parseInt(String(p.id).replace(/\D/g, ''), 10) || 0), 0);
    syncRooms();
    state.teamSyncedHash = teamHash();
    render();
    toast(`Team version loaded: ${state.staff.length} staff, ${state.roomTemplate.length} rooms and settings.`);
  } catch (e) { cloudError(e); }
}

async function saveRosterToCloud() {
  const date = state.day.date;
  if (!date) return toast('Pick a date first.');
  if (state.roster?.date && state.roster.date !== date) return toast(`This roster is for ${state.roster.date}, not ${date}. Generate or restore it for ${date} first.`);
  if (!rostererName.trim()) {
    const n = prompt('Your name, for the roster history:', cs.user.displayName || '');
    if (!n) return;
    storeName(n.trim());
  }
  const data = { day: state.day, roster: state.roster };
  try {
    let ts;
    try {
      ts = await cloud.saveRoster(date, data, me(), { expectedUpdatedAt: state.cloudBase[date] ?? null });
    } catch (e) {
      if (!(e instanceof cloud.Conflict)) throw e;
      const c = e.current;
      if (!confirm(`${byName(c.updatedBy)} saved the ${date} roster at ${when(c.updatedAt)}, after you opened it.\n\nOK: save yours as the latest (theirs stays in the history).\nCancel: don't save, so you can open theirs from the history first.`)) return;
      ts = await cloud.saveRoster(date, data, me(), { force: true });
    }
    state.cloudBase[date] = ts;
    delete cs.meta[date]; delete cs.versions[date]; cs.recent = null;
    render();
    toast(`Saved the ${date} roster.`);
  } catch (e) { cloudError(e); }
}

// Has anything been set up for this day (rooms running, case notes, anyone's status)?
const dayHasData = d => !!d && ((d.rooms || []).some(r => r.notes || r.lockSenior || r.lockJunior)
  || Object.values(d.staff || {}).some(x => x.manual || x.manualLiver || x.manualAway || x.comment || x.leaveTime || x.aoh));
function openSaved(date, snapshot, updatedAt) {
  const here = state.day.date === date;
  // what this browser already has for that date, on screen or put away
  const local = here ? state.roster || dayHasData(state.day) : state.days?.[date] && (state.days[date].roster || dayHasData(state.days[date].day));
  if (local && !confirm(`Replace what you have for ${date} with the saved version?${here ? '' : ' Your changes to that date in this browser will be lost.'}`)) return;
  if (here) pushUndoAll('the restore', { day: true });
  else { (state.days ||= {})[state.day.date] = { day: state.day, roster: state.roster }; undoStack = []; }
  delete state.days?.[date];
  state.day = clone(snapshot.day);
  state.roster = clone(snapshot.roster);
  state.day.date = date;
  logRoster([`Restored the version saved ${snapshot.savedAt ? when(snapshot.savedAt) : ''} by ${byName(snapshot.savedBy || snapshot.updatedBy)}`.replace('  ', ' ')]);
  lastRows = state.roster ? JSON.stringify(state.roster.rows) : null;
  state.cloudBase[date] = updatedAt;
  editing = null;
  syncRooms();
  state.tab = 'roster';
  render();
  toast(`Restored the ${date} roster.${undoStack.length ? ' Undo brings back what you had.' : ''}`);
}

async function openLatest(date) {
  try {
    const d = await cloud.loadRoster(date);
    if (!d) return toast(`No saved roster for ${date}.`);
    openSaved(date, d, d.updatedAt);
  } catch (e) { cloudError(e); }
}

// fetch something once per key, then re-render when it arrives
function lazy(store, key, fn) {
  if (store[key] === undefined) {
    store[key] = 'loading';
    fn().then(v => { store[key] = v; render(); }, e => { store[key] = null; cloudError(e); });
  }
  return store[key] === 'loading' ? null : store[key];
}

function rosterLogCard() {
  const log = state.roster?.log || [];
  if (!log.length) return null;
  return h('section', { class: 'card' }, h('details', {},
    h('summary', {}, `Change log (${log.length})`),
    h('ul', { class: 'log' }, log.map(e => h('li', {},
      h('div', { class: 'seen' }, `${when(e.at)} · ${e.by}`),
      e.changes.length === 1 ? h('div', {}, e.changes[0]) : h('ul', {}, e.changes.map(c => h('li', {}, c))))))));
}

function historyCard() {
  if (!isMember()) return null;
  const date = state.day.date;
  const meta = lazy(cs.meta, date, () => cloud.rosterMeta(date));
  const versions = lazy(cs.versions, date, () => cloud.listVersions(date));
  if (cs.recent === null) { cs.recent = 'loading'; cloud.listRosters().then(v => { cs.recent = v; render(); }, e => { cs.recent = []; cloudError(e); }); }
  const recent = Array.isArray(cs.recent) ? cs.recent : [];
  const behind = meta && state.cloudBase[date] !== meta.updatedAt;
  return h('section', { class: 'card' },
    h('h2', {}, 'Saved rosters'),
    meta
      ? h('p', { class: 'hint' }, `${date}: last saved by ${byName(meta.updatedBy)}, ${when(meta.updatedAt)}. `,
        behind ? h('button', { class: 'link', onclick: () => openLatest(date) }, 'Open latest') : 'You have the latest.')
      : h('p', { class: 'hint' }, `${date} hasn't been saved yet.`),
    versions?.length ? h('details', { open: versions.length <= 5 },
      h('summary', {}, `History for ${date} (${versions.length})`),
      h('ul', { class: 'history' }, versions.map(v => h('li', {},
        h('span', {}, `${when(v.savedAt)} · ${byName(v.savedBy)}`),
        h('button', { class: 'link', onclick: () => openSaved(date, v, meta?.updatedAt ?? v.savedAt) }, 'Restore'))))) : null,
    recent.filter(x => x.date !== date).length ? h('details', {},
      h('summary', {}, 'Other dates'),
      h('ul', { class: 'history' }, recent.filter(x => x.date !== date).map(x => h('li', {},
        h('span', {}, `${x.date} · ${byName(x.updatedBy)}`),
        h('button', { class: 'link', onclick: () => openLatest(x.date) }, 'Restore'))))) : null,
  );
}

let newMember = { email: '', role: 'rosterer', name: '' };
function membersCard() {
  if (cs.members === null) {
    cs.members = 'loading';
    cloud.listMembers().then(v => { cs.members = v; render(); }, e => { cs.members = []; cloudError(e); });
  }
  const list = Array.isArray(cs.members) ? cs.members : [];
  const refresh = () => { cs.members = null; cs.requests = null; cloud.listRequests().then(v => { cs.requests = v; render(); }, cloudError); render(); };
  const requests = Array.isArray(cs.requests) ? cs.requests : [];
  return h('section', { class: 'card scroll' },
    requests.length ? h('div', { id: 'requests', style: 'margin-bottom:16px' },
      h('h2', {}, 'Access requests'),
      h('table', {},
        h('thead', {}, h('tr', {}, ['Google email', 'Name', 'Asked', ''].map(t => h('th', {}, t)))),
        h('tbody', {}, requests.map(q => h('tr', {},
          h('td', {}, q.email), h('td', {}, q.name || ''), h('td', { class: 'seen' }, when(q.requestedAt)),
          h('td', {},
            h('button', { class: 'small primary', onclick: () => cloud.setMember(q.email, 'rosterer', q.name || '').then(() => cloud.deleteRequest(q.email)).then(() => { toast(`Approved ${q.email}.`); refresh(); }, cloudError) }, 'Approve'), ' ',
            h('button', { class: 'small', onclick: () => { if (confirm(`Decline ${q.email}?`)) cloud.deleteRequest(q.email).then(refresh, cloudError); } }, 'Decline'))))))) : null,
    h('h2', {}, 'Team members'),
    h('p', { class: 'hint' }, 'Only these Google accounts can sign in and see the shared staff list and rosters. Admins can also manage this list.'),
    h('table', {},
      h('thead', {}, h('tr', {}, ['Google email', 'Name', 'Role', ''].map(t => h('th', {}, t)))),
      h('tbody', {},
        list.map(m => h('tr', {},
          h('td', {}, m.email), h('td', {}, m.name || ''),
          h('td', {}, select(m.role, [['rosterer', 'Rosterer'], ['admin', 'Admin']], v => cloud.setMember(m.email, v, m.name || '').then(refresh, cloudError))),
          h('td', {}, m.email === cs.user.email.toLowerCase() ? '' : h('button', { class: 'small', onclick: () => { if (confirm(`Remove ${m.email}?`)) cloud.removeMember(m.email).then(refresh, cloudError); } }, '✕')))),
        h('tr', {},
          h('td', {}, h('input', { type: 'email', placeholder: 'name@gmail.com', value: newMember.email, oninput: e => { newMember.email = e.target.value; } })),
          h('td', {}, h('input', { placeholder: 'Name', value: newMember.name, oninput: e => { newMember.name = e.target.value; } })),
          h('td', {}, select(newMember.role, [['rosterer', 'Rosterer'], ['admin', 'Admin']], v => { newMember.role = v; })),
          h('td', {}, h('button', { class: 'small', onclick: () => {
            const e = newMember.email.trim().toLowerCase();
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return toast('Enter a Google email address.');
            cloud.setMember(e, newMember.role, newMember.name.trim()).then(() => { newMember = { email: '', role: 'rosterer', name: '' }; refresh(); toast(`Added ${e}.`); }, cloudError);
          } }, 'Add'))))),
  );
}

lastRows = state.roster ? JSON.stringify(state.roster.rows) : null;
state.tab = state.staff.length ? 'roster' : 'staff'; // the page opens on the roster
render();
