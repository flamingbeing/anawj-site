import {
  DEFAULT_SETTINGS, DEFAULT_ROOMS, JUNIOR_GRADES, SENIOR_GRADES, POSTINGS, STATUSES, COLOURS, COLOUR_ARGB, isBaby,
  matchName, splitNameList, namesInCell, suggestFlags, generate, check, learnFromRosters, tickFromHistory, remoteRoom, suggestShortNames, mergeContacts, pacuRoom, isPacu, fmtSenior, fmtJunior, SPECIAL_ROWS, isCoverPart, coverTarget,
} from './engine.js';
// Consultants are always shown in black.
const staffColour = p => (p && p.grade !== 'Consultant' && p.colour) || '';
import { readRosterRows, readStaffSheet, buildRosterWorkbook, cellText, isContactList, readContactList, cleanContactName } from './xlsxio.js';
import { buildLayout, COL_WIDTHS, shortName, doubleCovered, isDouble, TEAM_ROWS, DUTIES } from './layout.js';
import * as cloud from './cloud.js';

const KEY = 'ot-roster-v1';
const clone = o => JSON.parse(JSON.stringify(o));
const today = () => {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

// ---------- state ----------

function blankState() {
  return {
    settings: clone(DEFAULT_SETTINGS),
    staff: [],
    roomTemplate: clone(DEFAULT_ROOMS),
    day: { date: today(), rooms: [], staff: {} },
    roster: null,
    tab: 'seniors',
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

// Room list changes since the first version: Remote Case -> Remote 1 + Remote 2, add KROR 1 and MCOR 9.
// Names imported before titles were stripped ("Dr Bryan Ng", "A/Prof ..."): clean them and
// remember they came from an import, so a contact list can correct their role.
function cleanStaffNames() {
  for (const p of state.staff) {
    const clean = cleanContactName(p.name);
    if (clean !== p.name.trim() && /^\s*(dr|a\/prof|prof|adj)\b/i.test(p.name)) { p.name = clean; p.source ||= 'import'; }
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
  if (!['general', 'roster', 'premed', 'cases', 'manpower', 'seniors', 'juniors', 'settings'].includes(state.tab)) state.tab = 'seniors';
  app.replaceChildren(({ general: renderGeneral, roster: renderRoster, premed: renderPremed, cases: () => renderDay('cases'), manpower: () => renderDay('manpower'), seniors: () => renderStaff('senior'), juniors: () => renderStaff('junior'), settings: renderSettings })[state.tab]());
  renderCloudBar();
  renderDateBar();
  window.scrollTo(0, y);
  save();
}
// One date for the whole workspace, in the header.
function renderDateBar() {
  const el = document.getElementById('date');
  if (!el) return;
  const input = el.querySelector('input') || el.appendChild(h('label', {}, 'Roster for ', h('input', { type: 'date', onchange: e => { state.day.date = e.target.value; render(); } }))).querySelector('input');
  if (input.value !== state.day.date) input.value = state.day.date || '';
}

document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', async () => {
  const t = b.dataset.tab;
  if (staffEditing() && !['seniors', 'juniors'].includes(t) && !(await finishStaffEdit())) return;
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

function renderStaff(role) {
  if (!staffEditing()) return renderStaffView(role);
  const subs = state.settings.subspecs;
  const senior = role === 'senior';
  const list = state.staff
    .filter(p => p.role === role)
    .filter(p => !staffFilter || (p.name + ' ' + (p.aliases || []).join(' ')).toLowerCase().includes(staffFilter.toLowerCase()))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'senior' ? -1 : 1) || a.name.localeCompare(b.name));

  const row = p => h('tr', {},
    h('td', {}, h('input', { value: p.name, onchange: e => { p.name = e.target.value.trim(); save(); } })),
    h('td', {}, h('input', { value: (p.aliases || []).join(', '), placeholder: 'e.g. Tan YW', onchange: e => { p.aliases = splitNameList(e.target.value); save(); } })),
    h('td', {}, select(p.grade, p.role === 'senior' ? SENIOR_GRADES : JUNIOR_GRADES, v => { p.grade = v; if (v === 'Baby MO' && !p.colour) p.colour = 'green'; render(); })),
    h('td', {}, p.grade === 'Consultant' ? h('span', { class: 'seen', title: 'Consultants are always black' }, 'Black') : select(p.colour || '', COLOURS, v => { p.colour = v; render(); })),
    !senior && h('td', {}, select(p.posting || '', POSTINGS, v => { p.posting = v; save(); })),
    senior && h('td', {}, h('div', { class: 'chips' }, subs.map(s => {
        const on = (p.subspecs || []).includes(s.key);
        return h('span', { class: 'chip' + (on ? ' on' : ''), title: s.hard ? 'Only seniors with this subspec get these lists' : '', onclick: () => {
          p.subspecs = on ? p.subspecs.filter(k => k !== s.key) : [...(p.subspecs || []), s.key]; render();
        } }, s.label);
      }))),
    senior && h('td', {}, h('input', { value: (p.avoid || []).join(', '), placeholder: 'e.g. eye, obs', onchange: e => { p.avoid = splitNameList(e.target.value).map(s => s.toLowerCase()); save(); } })),
    senior && h('td', { class: 'seen' }, Object.entries(p.history || {}).map(([k, n]) => `${subs.find(s => s.key === k)?.label || k} ×${n}`).join(', ')),
    h('td', {}, h('button', { class: 'small', title: 'Remove', onclick: () => { if (confirm(`Remove ${p.name}?`)) { state.staff = state.staff.filter(x => x !== p); render(); } } }, '✕')),
  );

  const count = state.staff.filter(p => p.role === role).length;
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, senior ? 'Seniors' : 'Juniors'),
      h('p', { class: 'hint' }, senior
        ? 'Tick each senior\'s subspecs and the lists they don\'t do. "Seen in" counts the subspec lists they did in past rosters you loaded, as a hint. Colour: purple for locums; consultants are always black.'
        : 'Set each junior\'s grade, posting and colour. Green marks a Baby MO: never left alone, so their senior won\'t double cover. Purple marks locums.'),
      h('div', { class: 'bar sync dirty' },
        h('span', {}, `Editing the staff list. ${diffStaff(staffBackup, state.staff).length} change(s) so far; nothing is kept until you review and save.`),
        h('button', { class: 'primary', onclick: finishStaffEdit }, 'Review & save changes'),
        h('button', { onclick: () => { if (confirm('Discard all changes since you started editing?')) { state.staff = staffBackup; staffBackup = null; render(); } } }, 'Cancel')),
      h('div', { class: 'bar' },
        fileButton('Import staff sheet or contact list', '.xlsx,.csv', false, importStaffSheet),
        fileButton('Learn from past rosters', '.xlsx', true, learnFiles),
        senior && h('span', { class: 'btn-group' },
          h('button', { title: 'Tick each senior\'s subspecs from the lists in "Seen in". Only adds ticks.', onclick: () => {
            const n = tickFromHistory(state.staff, tickMin);
            render();
            toast(n ? `Ticked ${n} subspec(s). Check them before generating.` : 'Nothing new to tick.');
          } }, 'Tick subspecs from "Seen in"'),
          h('label', { class: 'seen' }, ' if seen ≥ ', h('input', { type: 'number', min: 1, max: 20, value: tickMin, style: 'width:56px', onchange: e => { tickMin = Math.max(1, +e.target.value || 1); } }), ' times')),
        h('button', { title: 'Fill in short names (e.g. Tan YW, Swapna) for everyone who has none', onclick: () => {
          const props = suggestShortNames(state.staff);
          if (!props.length) return toast('Everyone already has a short name, or the suggestions would clash.');
          const eg = props.slice(0, 6).map(x => `${x.name} → ${x.short}`).join('\n');
          if (!confirm(`Add short names for ${props.length} people (seniors and juniors)?\n\n${eg}${props.length > 6 ? '\n…' : ''}\n\nYou can edit any of them afterwards.`)) return;
          for (const x of props) { const p = state.staff.find(s => s.id === x.id); if (p) p.aliases = [x.short]; }
          render();
          toast(`Added ${props.length} short names. Check them, then save for the team.`);
        } }, 'Suggest short names'),
        h('button', { onclick: () => { state.staff.unshift({ id: newId(), name: '', aliases: [], role, grade: senior ? 'Consultant' : 'Resident', posting: '', subspecs: [], avoid: [], history: {} }); staffFilter = ''; render(); } }, senior ? '+ Add senior' : '+ Add junior'),
        h('span', { class: 'grow' }),
        h('input', { placeholder: 'Filter names', value: staffFilter, oninput: e => { staffFilter = e.target.value; const pos = e.target.selectionStart; render(); const i = app.querySelector('input[placeholder="Filter names"]'); i.focus(); i.setSelectionRange(pos, pos); } }),
      ),
      h('div', { class: 'stats' }, h('span', {}, h('b', {}, count), senior ? ' seniors' : ' juniors')),
    ),
    count
      ? h('section', { class: 'card scroll' }, h('table', {},
        h('thead', {}, h('tr', {}, (senior ? ['Name', 'Short names', 'Grade', 'Colour', 'Subspecs', "Doesn't do", 'Seen in', ''] : ['Name', 'Short names', 'Grade', 'Colour', 'Posting', '']).map(t => h('th', {}, t)))),
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
    .sort((a, b) => a.name.localeCompare(b.name));
  const count = state.staff.filter(p => p.role === role).length;
  const row = p => h('tr', {},
    h('td', {}, h('b', { style: staffColour(p) ? `color:#${COLOUR_ARGB[staffColour(p)].slice(2)}` : '' }, p.name)),
    h('td', {}, (p.aliases || []).join(', ')),
    h('td', {}, p.grade),
    h('td', { class: 'seen' }, COLOURS.find(c => c[0] === staffColour(p))[1]),
    senior
      ? h('td', {}, h('div', { class: 'chips' }, (p.subspecs || []).map(k => h('span', { class: 'chip on static' }, subLabel(k)))))
      : h('td', {}, p.posting || ''),
    senior && h('td', {}, (p.avoid || []).join(', ')),
    senior && h('td', { class: 'seen' }, Object.entries(p.history || {}).map(([k, n]) => `${subLabel(k)} ×${n}`).join(', ')),
  );
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, senior ? 'Seniors' : 'Juniors'),
      h('p', { class: 'hint' }, senior
        ? 'The seniors the roster is generated from, with their subspecs and the lists they don\'t do.'
        : 'The juniors the roster is generated from, with their grade and posting.'),
      teamSyncBar(),
      h('div', { class: 'bar' },
        h('button', { onclick: startStaffEdit }, `Edit ${senior ? 'seniors' : 'juniors'}`),
        h('span', { class: 'grow' }),
        h('input', { placeholder: 'Filter names', value: staffFilter, oninput: e => { staffFilter = e.target.value; const pos = e.target.selectionStart; render(); const i = app.querySelector('input[placeholder="Filter names"]'); i.focus(); i.setSelectionRange(pos, pos); } })),
      h('div', { class: 'stats' }, h('span', {}, h('b', {}, count), senior ? ' seniors' : ' juniors')),
    ),
    count
      ? h('section', { class: 'card scroll' }, h('table', {},
        h('thead', {}, h('tr', {}, (senior ? ['Name', 'Short names', 'Grade', 'Colour', 'Subspecs', "Doesn't do", 'Seen in'] : ['Name', 'Short names', 'Grade', 'Colour', 'Posting']).map(t => h('th', {}, t)))),
        h('tbody', {}, list.map(row))))
      : h('section', { class: 'card empty' }, `No ${senior ? 'seniors' : 'juniors'} yet. Click Edit to import the master staff sheet or learn from past rosters.`),
    staffLogCard(),
  );
}

async function importStaffSheet([file]) {
  const wb = await readWorkbook(file);
  if (isContactList(wb.worksheets[0])) {
    const { people } = readContactList(wb.worksheets[0]);
    const res = mergeContacts(state.staff, people, newId);
    state.staff = res.staff;
    render();
    toast(`Contact list: read ${people.length} anaesthetists (names, grades and subspecs only).${res.skipped.length ? ` ${res.skipped.length} juniors not on the staff list were left out, since postings rotate.` : ''}${res.removed.length ? ` ${res.removed.length} non-anaesthetist entries from an earlier import removed.` : ''} Review the changes before saving.`);
    return;
  }
  const res = readStaffSheet(wb.worksheets[0]);
  if (res.error) return toast(res.error);
  let added = 0, updated = 0;
  for (const p of res.people) {
    const m = matchName(p.name, state.staff).person;
    if (m) { Object.assign(m, { ...p, history: m.history, aliases: [...new Set([...(m.aliases || []), ...p.aliases])] }); updated++; }
    else { state.staff.push({ id: newId(), history: {}, source: 'import', ...p }); added++; }
  }
  toast(`Staff sheet: ${added} added, ${updated} updated.`);
  render();
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
let dayFilter = '';

function renderDay(part) {
  const cases = part === 'cases';
  const d = state.day;
  const subs = state.settings.subspecs;
  const running = d.rooms.filter(r => r.running);
  const avail = role => state.staff.filter(p => p.role === role && (dayOf(p.id).status || 'avail') === 'avail').length;
  const names = h('datalist', { id: 'staffNames' }, state.staff.map(p => h('option', { value: p.name })));

  const lockInput = (r, key) => h('input', {
    list: 'staffNames', value: r[key] ? person(r[key])?.name || '' : '', placeholder: 'auto',
    onchange: e => {
      const v = e.target.value.trim();
      if (!v) { r[key] = ''; save(); return; }
      const m = matchName(v, state.staff);
      if (m.person) { r[key] = m.person.id; e.target.value = m.person.name; save(); }
      else { toast(m.ambiguous ? `"${v}" matches several people` : `"${v}" isn't in the staff list`); e.target.value = ''; r[key] = ''; save(); }
    },
  });

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

  const flist = state.staff
    .filter(p => !dayFilter || p.name.toLowerCase().includes(dayFilter.toLowerCase()))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'senior' ? -1 : 1) || a.name.localeCompare(b.name));
  const staffRow = p => {
    const s = dayOf(p.id);
    return h('tr', { class: (s.status || 'avail') === 'avail' ? '' : 'off' },
      h('td', {}, p.name),
      h('td', { class: 'seen' }, p.role === 'senior' ? p.grade : `${p.grade}${p.posting ? ' · ' + p.posting : ''}`),
      h('td', {}, select(s.status || 'avail', STATUSES, v => { s.status = v; render(); })),
      h('td', {}, h('input', { class: 'narrow', value: s.leaveTime || '', placeholder: '4pm', title: 'Leaving at, e.g. 4pm or 4-5pm (shown as L-4pm)', onchange: e => { s.leaveTime = e.target.value.trim(); save(); } })),
      h('td', {}, p.role === 'senior'
        ? h('label', { title: 'Liver transplant standby' }, h('input', { type: 'checkbox', checked: s.liverStandby, onchange: e => { s.liverStandby = e.target.checked; save(); } }), ' (L)')
        : h('label', { title: 'Not around on the previous working day: needs premed cover' }, h('input', { type: 'checkbox', checked: s.notAroundPrev, onchange: e => { s.notAroundPrev = e.target.checked; save(); } }), ' away yesterday')),
      h('td', {}, h('input', { value: s.note || '', placeholder: p.role === 'senior' ? '(AOH 1), -mtg 5pm' : '', onchange: e => { s.note = e.target.value.trim(); save(); } })),
    );
  };

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
        `Names not matched to the staff list: ${unmatched.join(', ')}. Add them on the Seniors or Juniors tab, or add the short name to the right person, then load or apply again. `,
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
    !cases && quickStatusCard(),
    !cases && h('section', { class: 'card' },
      h('h2', {}, 'Paste from the leave sheet'),
      h('p', { class: 'hint' }, 'Paste names from the leave sheet: short forms like "Tan YW" or "Swapna" work. Separate names with commas or new lines.'),
      h('div', { class: 'paste' },
        pasteBox('leave', 'Leave', 'Tan YW, Ang KS'),
        pasteBox('postcall', 'Post call', ''),
        pasteBox('elsewhere', 'Elsewhere (SICU, EOT, epidural, pain, ECT…)', ''),
        pasteBox('admin', 'Admin / no list', ''),
        pasteBox('notAround', 'Juniors away on the previous working day', ''),
      ),
      h('div', { class: 'bar', style: 'margin-top:12px' }, h('button', { class: 'primary', onclick: applyPaste }, 'Apply names')),
    ),
    !cases && h('section', { class: 'card scroll' },
      h('div', { class: 'bar' }, h('h2', { class: 'grow' }, 'Staff today'),
        h('input', { placeholder: 'Filter', value: dayFilter, oninput: e => { dayFilter = e.target.value; const pos = e.target.selectionStart; render(); const i = app.querySelector('input[placeholder="Filter"]'); i.focus(); i.setSelectionRange(pos, pos); } })),
      state.staff.length
        ? h('table', {},
          h('thead', {}, h('tr', {}, ['Name', 'Grade', 'Status', 'Leaves at', '', 'Note on roster'].map(t => h('th', {}, t)))),
          h('tbody', {}, flist.map(staffRow)))
        : h('p', { class: 'empty' }, 'Add staff on the Seniors and Juniors tabs first.'),
    ),
  );
}

// Search-and-add boxes for each status, showing who is already in it.
const QUICK = [['admin', 'Admin / no list'], ['leave', 'Leave'], ['postcall', 'Post call'], ['elsewhere', 'Elsewhere (SICU, EOT, pain…)'], ['away', 'Juniors away yesterday']];
function quickStatusCard() {
  const inList = key => state.staff.filter(p => key === 'away' ? state.day.staff[p.id]?.notAroundPrev : (state.day.staff[p.id]?.status || 'avail') === key)
    .sort((a, b) => a.name.localeCompare(b.name));
  const setOne = async (key, text) => {
    const p = await resolvePerson(text, key === 'away' ? 'junior' : 'senior');
    if (!p) return;
    const d = dayOf(p.id);
    if (key === 'away') d.notAroundPrev = true; else d.status = key;
    render();
    toast(`${p.name}: ${QUICK.find(q => q[0] === key)[1]}.`);
  };
  const clearOne = (key, p) => { const d = dayOf(p.id); if (key === 'away') d.notAroundPrev = false; else d.status = 'avail'; render(); };
  return h('section', { class: 'card' },
    h('h2', {}, 'Who is around'),
    h('p', { class: 'hint' }, 'Type a name to add someone, e.g. a senior on an admin day. Click × to put them back as available.'),
    h('div', { class: 'paste' }, QUICK.map(([key, label]) => h('div', {},
      h('label', {}, label),
      h('div', { class: 'chips', style: 'margin-bottom:6px' }, inList(key).map(p => h('span', { class: 'chip static' }, p.name, ' ',
        h('button', { class: 'link', title: 'Remove', onclick: () => clearOne(key, p) }, '×')))),
      nameInput({ placeholder: 'Add a name…', style: 'width:100%',
        onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); setOne(key, e.target.value); } },
        onchange: e => { if (state.staff.some(p => p.name === e.target.value)) setOne(key, e.target.value); } },
      key === 'away' ? 'junior' : null)))));
}

function markNames(names, fn) {
  const missed = [];
  for (const n of names) {
    const m = matchName(n, state.staff);
    if (m.person) fn(dayOf(m.person.id), m.person);
    else missed.push(m.ambiguous ? `${n} (several matches)` : n);
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
      if ((state.day.staff[p.id]?.status || 'avail') === key && !covered.has(p.id)) list.push(shortName(p));
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
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'senior' ? -1 : 1) || shortName(a).localeCompare(shortName(b)));
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
  const d = state.day;
  const dateCell = cellText(ws.getCell('C5').value).trim();
  const parsed = dateCell ? new Date(dateCell + ' 12:00') : null;
  if (parsed && !isNaN(parsed)) d.date = parsed.toISOString().slice(0, 10);

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
  toast(`Draft loaded: ${rooms} rooms.${missed.length ? ` ${missed.length} name(s) not matched.` : ''}`);
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

let undoStack = [];
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
    afterRosterEdit(false, true);
    return;
  }
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
  if (d.status === 'admin') d.status = 'avail'; // off their admin day and onto a list
  const text = p.role === 'senior' ? fmtSenior(p, d) : fmtJunior(p, d);
  undoStack.push(JSON.stringify(state.roster.rows));
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
      if (ev.type === 'pointerup' && !src.pool && !src.cover) { clearTimeout(tagTimer); tagTimer = setTimeout(() => openTagEditor(chip, src), 200); }
      return;
    }
    ghost.remove();
    chip.classList.remove('dragging');
    over?.classList.remove('over');
    const t = ev.type === 'pointerup' ? targetAt(ev.clientX, ev.clientY) : null;
    if (!t) return;
    if (t.dataset.pool != null) { if (!src.pool && !src.cover) dropName(src, { pool: true }); return; }
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
  const p = { id: newId(), name: v, aliases: [], role: choice, grade: choice === 'senior' ? 'Consultant' : 'Resident', posting: '', subspecs: [], avoid: [], history: {}, source: 'roster-entry' };
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
    .sort((a, b) => a.name.localeCompare(b.name)).map(p => h('option', { value: p.name })));
  return h('input', { list: id, autocomplete: 'off', spellcheck: 'false', ...attrs });
}

// ---- tags on one name: "(L)", "(RA)", "(AOH 1)" and the part after a dash ("-5pm", "-C-OT 4") ----

const TAGS = ['L', 'RA', 'P', 'SR', 'Neu', 'Amb', 'PACU'];
let tagTimer = null;

// "Tan YW (RA) L-4pm C-OT13 -mtg 5pm" -> name, tags, leave ("4pm" / "4-5pm"), cover ("OT13", "KROR PACU"), note
const TIME = '[\\d.:]+(?:\\s*-\\s*[\\d.:]+)?\\s*(?:am|pm)?';
function parseNamePart(text) {
  const tags = [...String(text).matchAll(/\(([^)]*)\)/g)].map(m => m[1].trim()).filter(Boolean);
  let rest = String(text).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  let leave = '', cover = '', dash = '';
  rest = rest.replace(new RegExp(`\\s+L-\\s*(${TIME})`, 'i'), (_, t) => { leave = t.trim(); return ''; });
  rest = rest.replace(/\s+-?C-\s*(.+?)(?=\s+L-|\s+-\s|$)/i, (_, c) => { cover = c.trim().replace(/^OT\s+/i, 'OT'); return ''; });
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
    h('b', {}, p.name), h('span', { class: 'seen' }, ` · ${p.grade}${p.posting ? ' · ' + p.posting : ''}`),
    h('ul', {}, (at.length ? at : ['Not on any list today']).map(t => h('li', {}, t))));
}

function closeTagEditor() { document.querySelector('.tag-editor')?.remove(); }

function openTagEditor(chip, src) {
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
// The sheet uses short names: "Tan Yi Wei (RA) L-4pm" -> "Tan YW (RA) L-4pm".
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
  if (state.roster.rows[i].roomId === 'aic' && !(p.grade === 'Consultant' || p.grade === 'Senior Resident')
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
  // C to add a junior to another room as an ad hoc cover, × takes the name off. On a
  // touchscreen there's no dragging (so the page scrolls); tapping opens the name's details.
  const chip = (p, k) => {
    const src = { row: i, key, part: k };
    const icon = (cls, title, text, o) => h('span', { class: 'icon ' + cls, title, onpointerdown: e => { e.stopPropagation(); o.down?.(e); }, onclick: e => { e.stopPropagation(); o.click?.(); } }, text);
    const el = h('span', { class: 'name', 'data-drop': '', 'data-row': i, 'data-key': key, 'data-part': k, style: colourStyle(p), title: p,
      onpointerdown: TOUCH ? null : e => startNameDrag(e, src),
      onclick: TOUCH ? () => openTagEditor(el, src) : null },
      !TOUCH && key === 'junior' && !isCoverPart(p) ? icon('cover', 'Drag to another room to add them there as an ad hoc cover (C). They stay in this room.', 'C', { down: e => startNameDrag(e, { ...src, cover: true }) }) : null,
      h('span', { class: 'label' }, shortOf(p)),
      key === 'senior' && isDouble(p, doubles) ? h('sup', { class: 'dbl', title: 'Double covering' }, '&') : null,
      !TOUCH ? icon('del', isCoverPart(p) ? 'Remove this ad hoc cover' : 'Take off this list (they go to Admin / no list)', '×', { click: () => dropToPool(src) }) : null);
    return el;
  };
  return h('td', {
    class: 'cell', 'data-drop': '', 'data-row': i, 'data-key': key, title: 'Drag a name by its grip to swap or move it. Click a name to edit it.',
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
  if (!state.staff.length) { toast('Add staff on the Seniors and Juniors tabs first.'); return false; }
  if (!state.day.rooms.some(r => r.running)) { toast('Tick the running rooms on the Cases tab first.'); return false; }
  return true;
}

function runGenerate(newSeed) {
  if (!canGenerate()) return;
  const seed = newSeed ? Math.floor(Math.random() * 1e9) : (state.roster?.seed || 1);
  const res = generate({ staff: state.staff, day: generatorDay(), settings: state.settings, seed });
  const log = state.roster?.date === state.day.date ? state.roster.log || [] : [];
  if (state.roster?.rows?.length && state.roster.date === state.day.date && !confirm('Generate a new roster? This replaces the current one, including any changes you made by hand. (Undo can\'t bring it back, but the change log keeps a record.) To keep what\'s there, use Fill empty gaps instead.')) return;
  undoStack = []; editing = null;
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
  const g = { ...(state.day.general || {}) };
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

function renderGeneral() {
  const g = state.day.general || {};
  const eff = effectiveGeneral();
  const field = (key, role) => nameInput({ value: g[key] || '', placeholder: !g[key] && eff[key] ? `${eff[key]} (MOT)` : '—', style: 'width:100%',
    onchange: e => setGeneral(key, e.target.value, role, e.target),
    onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } } }, role);
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Calls/clinics'),
      h('p', { class: 'hint' }, 'MOT and SICU calls, EOT and clinics for the day. Type names (autocomplete from the staff list); separate two people with "/". EOT 8 and EOT 9 default to the MOT call team (shown in grey) unless you type someone else. The cardiac call team goes to MOR 12. Everyone else here is left out of the OT lists. These fill the top half of the sheet; Load draft roster on the Cases tab fills them from the admin draft.')),
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
    h('p', { class: 'hint' }, 'AOCC, AIC, AH OT and ECT are on the OT roster tab.'));
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
    if (!needs && !cur && premedFilter) return null;
    const options = [['', '— none —'], ...coverers.map(p => [p.name, `${p.name}${homeOf[p.id] ? ' · ' + homeOf[p.id] : ' · not on a list'}${load[p.name] ? ` · ${load[p.name]} room${load[p.name] > 1 ? 's' : ''}` : ''}`])];
    if (cur && !options.some(o => o[0] === cur)) options.push([cur, cur]);
    return h('tr', { class: needs && !cur ? 'flagged' : '' },
      h('td', { class: 'room' }, row.label + ':'),
      h('td', {}, juniors.map((j, k) => [k ? ' / ' : '', h('span', { style: colourStyle(j.part) }, j.part)])),
      h('td', { class: 'seen' }, awayNames.length ? `${awayNames.join(', ')} away yesterday${mate && !cur ? ` · ${mate.name} in the same room could cover` : ''}` : ''),
      h('td', {}, select(cur, options, v => setCover(row, v))));
  }).filter(Boolean);
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Premed cover'),
      h('p', { class: 'hint' }, 'A room needs premed cover when its junior wasn\'t around on the previous working day (tick "away yesterday" on the Manpower tab). Cover can be any resident or MOPEX who was around, from any complex. The list shows where each person is today and how many rooms they already cover (max ' + state.settings.premedCap + ').'),
      h('div', { class: 'bar' },
        h('span', { class: 'stats' }, h('span', {}, h('b', {}, needed), ' rooms need cover'), h('span', {}, h('b', {}, missing), ' still without')),
        h('span', { class: 'grow' }),
        h('label', { class: 'seen' }, h('input', { type: 'checkbox', checked: premedFilter, onchange: e => { premedFilter = e.target.checked; render(); } }), ' Only rooms that need or have cover'))),
    h('section', { class: 'card scroll' }, h('table', { class: 'sheet' },
      h('thead', {}, h('tr', {}, ['', 'Junior', '', 'Premed cover'].map(t => h('th', {}, t)))),
      h('tbody', {}, rows))),
    rosterLogCard());
}
let premedFilter = true;

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
// Comments added to names on the roster ("Tan YW -mtg 3pm") as comments box lines.
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
    h('p', { class: 'hint' }, 'Shown in the box at the top right of the sheet, e.g. meetings or people away. People on an admin day go on the Admin/no list row instead (Manpower tab).'),
    h('textarea', { rows: 5, value: state.day.box || '', placeholder: 'e.g. Sophia Ang - mtg 2 to 5pm', onchange: e => {
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
    r && h('button', { disabled: !undoStack.length, onclick: () => { state.roster.rows = JSON.parse(undoStack.pop()); afterRosterEdit(true); } }, 'Undo'),
    r && isMember() && h('button', { class: 'primary', onclick: saveRosterToCloud }, 'Save'),
    r && h('button', { onclick: exportXlsx }, 'Download .xlsx'),
    r && h('div', { class: 'seg', role: 'group', 'aria-label': 'View' },
      h('button', { 'aria-pressed': String(rosterView === 'edit'), onclick: () => { rosterView = 'edit'; render(); } }, 'Edit'),
      h('button', { 'aria-pressed': String(rosterView === 'sheet'), onclick: () => { rosterView = 'sheet'; render(); } }, 'Sheet preview')),
    r && rosterView === 'sheet' && h('button', { onclick: () => window.print() }, 'Print / save PDF'),
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
        h('p', { class: 'hint', style: 'margin:0' }, 'This is what the downloaded .xlsx looks like. The top half comes from the General tab; case notes aren\'t included. Switch to Edit to move names or change tags. & marks a senior who is double covering.')),
      renderSheet());
  }
  return h('div', {},
    h('section', { class: 'card' }, h('h2', {}, 'OT roster'), actions,
      h('p', { class: 'hint', style: 'margin:0' }, 'Drag a name by its ⠿ grip onto another name to swap them, or onto an empty part of a cell to move it there. Drag a junior by their C grip to add them to another room as an ad hoc cover. Click a name to change it or its tags ((L), (RA), L-4pm, C-OT13, C-KROR PACU…). + adds someone from the staff list. Click the case notes to edit them. & marks a senior who is double covering. Premed cover is on its own tab.')),
    h('div', { class: 'cols' },
      h('section', { class: 'card scroll' },
        h('table', { class: 'sheet' },
          h('thead', {}, h('tr', {}, ['', 'Senior', 'Junior', 'Cases'].map(t => h('th', {}, t)))),
          h('tbody', {}, body))),
      h('div', {},
        noListCard(),
        boxCard(),
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
  const chip = p => h('span', { class: 'name', style: colourStyle(p.name), title: `${p.name} · ${p.grade}. Drag onto the roster.`,
    onpointerdown: TOUCH ? null : e => startNameDrag(e, { pool: p.id }) }, shortName(p));
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
      h('h2', {}, 'Rooms'),
      h('p', { class: 'hint' }, 'The rooms on the roster, in order. "Running by default" rooms are ticked when you set up a new day (Clear day). Rooms in the same complex can share a senior when seniors are short. MOR 7–9 are emergency OTs, so they have no line.'),
      teamSyncBar(),
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
    isAdmin() ? membersCard() : null,
    h('section', { class: 'card' },
      h('h2', {}, 'Reset'),
      h('div', { class: 'bar' },
        h('button', { onclick: () => { if (confirm('Reset rules and subspecialties to the defaults? Staff are kept.')) { state.settings = clone(DEFAULT_SETTINGS); render(); } } }, 'Reset rules'),
        h('button', { onclick: () => { if (confirm('Delete everything stored in this browser (staff, day, roster)?')) { state = blankState(); syncRooms(); render(); } } }, 'Delete all data in this browser')),
    ),
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

const teamHash = () => JSON.stringify([state.settings, state.staff, state.roomTemplate, state.staffLog || []]);

// Shown on the staff and settings tabs: whether this browser's staff list, rooms and settings match the team's.
function teamSyncBar() {
  if (!isMember()) return cloud.enabled ? null : h('p', { class: 'hint' }, 'To share with other rosterers, use Export JSON at the bottom of the page.');
  const dirty = state.teamSyncedHash !== teamHash();
  return h('div', { class: 'bar sync' + (dirty ? ' dirty' : '') },
    h('span', {}, dirty
      ? 'You have changes to staff, rooms or settings that the team doesn\'t have yet.'
      : `Shared with the team${state.teamSyncedAt ? `, last saved ${when(state.teamSyncedAt)}` : ''}.`),
    h('button', { class: dirty ? 'primary' : '', onclick: saveTeamToCloud }, 'Save for the team'),
    h('button', { onclick: () => loadTeamFromCloud(true) }, 'Load team version'));
}

async function saveTeamToCloud() {
  try {
    const doc = await cloud.saveTeam({ settings: state.settings, staff: state.staff, roomTemplate: state.roomTemplate, roomsVersion: state.roomsVersion, staffLog: state.staffLog || [] }, me());
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

function openSaved(date, snapshot, updatedAt) {
  const local = state.roster && state.day.date === date;
  if (local && !confirm(`Replace the roster on screen with the saved one for ${date}?`)) return;
  state.day = clone(snapshot.day);
  state.roster = clone(snapshot.roster);
  state.day.date = date;
  logRoster([`Opened the version saved ${snapshot.savedAt ? when(snapshot.savedAt) : ''} by ${byName(snapshot.savedBy || snapshot.updatedBy)}`.replace('  ', ' ')]);
  lastRows = JSON.stringify(state.roster.rows);
  state.cloudBase[date] = updatedAt;
  undoStack = []; editing = null;
  syncRooms();
  state.tab = 'roster';
  render();
  toast(`Opened the ${date} roster.`);
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
        h('button', { class: 'link', onclick: () => openSaved(date, v, meta?.updatedAt ?? v.savedAt) }, 'Open'))))) : null,
    recent.filter(x => x.date !== date).length ? h('details', {},
      h('summary', {}, 'Other dates'),
      h('ul', { class: 'history' }, recent.filter(x => x.date !== date).map(x => h('li', {},
        h('span', {}, `${x.date} · ${byName(x.updatedBy)}`),
        h('button', { class: 'link', onclick: () => openLatest(x.date) }, 'Open'))))) : null,
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
if (state.tab === 'staff') state.tab = 'seniors';
if (!state.staff.length) state.tab = 'seniors';
render();
