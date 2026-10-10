import {
  DEFAULT_SETTINGS, DEFAULT_ROOMS, JUNIOR_GRADES, SENIOR_GRADES, POSTINGS, STATUSES,
  matchName, splitNameList, namesInCell, suggestFlags, generate, check, learnFromRosters, tickFromHistory,
} from './engine.js';
import { readRosterRows, readStaffSheet, buildRosterWorkbook, cellText } from './xlsxio.js';
import { buildLayout, COL_WIDTHS, shortName, doubleCovered, isDouble } from './layout.js';

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
    tab: 'staff',
  };
}

let state = blankState();
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) state = { ...state, ...saved, settings: { ...clone(DEFAULT_SETTINGS), ...saved.settings } };
} catch { /* private mode or corrupt data: start fresh */ }
syncRooms();

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
    : { id: 'r' + i + '-' + t.name.replace(/\W+/g, ''), name: t.name, complex: t.complex, running: false, session: 'full', notes: '', flags: { subspecs: [], complex: false, long: false }, flagsManual: false, lockSenior: '', lockJunior: '' });
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
  app.replaceChildren(({ staff: renderStaff, day: renderDay, roster: renderRoster, settings: renderSettings })[state.tab]());
  window.scrollTo(0, y);
  save();
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { state.tab = b.dataset.tab; window.scrollTo(0, 0); render(); }));

// ----- staff tab -----

let staffFilter = '';
let tickMin = 1;
function renderStaff() {
  const subs = state.settings.subspecs;
  const list = state.staff
    .filter(p => !staffFilter || (p.name + ' ' + (p.aliases || []).join(' ')).toLowerCase().includes(staffFilter.toLowerCase()))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'senior' ? -1 : 1) || a.name.localeCompare(b.name));

  const row = p => h('tr', {},
    h('td', {}, h('input', { value: p.name, onchange: e => { p.name = e.target.value.trim(); save(); } })),
    h('td', {}, h('input', { value: (p.aliases || []).join(', '), placeholder: 'e.g. Tan YW', onchange: e => { p.aliases = splitNameList(e.target.value); save(); } })),
    h('td', {}, select(p.role, [['senior', 'Senior'], ['junior', 'Junior']], v => { p.role = v; p.grade = v === 'senior' ? 'Consultant' : 'Resident'; render(); })),
    h('td', {}, select(p.grade, p.role === 'senior' ? SENIOR_GRADES : JUNIOR_GRADES, v => { p.grade = v; save(); })),
    h('td', {}, p.role === 'junior' ? select(p.posting || '', POSTINGS, v => { p.posting = v; save(); }) : ''),
    h('td', {}, p.role === 'senior'
      ? h('div', { class: 'chips' }, subs.map(s => {
        const on = (p.subspecs || []).includes(s.key);
        return h('span', { class: 'chip' + (on ? ' on' : ''), title: s.hard ? 'Only seniors with this subspec get these lists' : '', onclick: () => {
          p.subspecs = on ? p.subspecs.filter(k => k !== s.key) : [...(p.subspecs || []), s.key]; render();
        } }, s.label);
      }))
      : ''),
    h('td', {}, p.role === 'senior' ? h('input', { value: (p.avoid || []).join(', '), placeholder: 'e.g. eye, obs', onchange: e => { p.avoid = splitNameList(e.target.value).map(s => s.toLowerCase()); save(); } }) : ''),
    h('td', { class: 'seen' }, Object.entries(p.history || {}).map(([k, n]) => `${subs.find(s => s.key === k)?.label || k} ×${n}`).join(', ')),
    h('td', {}, h('button', { class: 'small', title: 'Remove', onclick: () => { if (confirm(`Remove ${p.name}?`)) { state.staff = state.staff.filter(x => x !== p); render(); } } }, '✕')),
  );

  const seniors = state.staff.filter(p => p.role === 'senior').length;
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Staff list'),
      h('p', { class: 'hint' }, 'Do this once, then save a team file to share with the other rosterers. "Seen in" counts the subspec lists each senior did in the past rosters you loaded. Use it as a hint when ticking subspecs.'),
      h('div', { class: 'bar' },
        fileButton('Import staff sheet (.xlsx / .csv)', '.xlsx,.csv', false, importStaffSheet),
        fileButton('Learn from past rosters', '.xlsx', true, learnFiles),
        h('span', { class: 'btn-group' },
          h('button', { title: 'Tick each senior\'s subspecs from the lists in "Seen in". Only adds ticks.', onclick: () => {
            const n = tickFromHistory(state.staff, tickMin);
            render();
            toast(n ? `Ticked ${n} subspec(s). Check them before generating.` : 'Nothing new to tick.');
          } }, 'Tick subspecs from "Seen in"'),
          h('label', { class: 'seen' }, ' if seen ≥ ', h('input', { type: 'number', min: 1, max: 20, value: tickMin, style: 'width:56px', onchange: e => { tickMin = Math.max(1, +e.target.value || 1); } }), ' times')),
        h('button', { onclick: () => { state.staff.unshift({ id: newId(), name: '', aliases: [], role: 'junior', grade: 'Resident', posting: '', subspecs: [], avoid: [], history: {} }); staffFilter = ''; render(); } }, '+ Add person'),
        h('span', { class: 'grow' }),
        h('input', { placeholder: 'Filter names', value: staffFilter, oninput: e => { staffFilter = e.target.value; const pos = e.target.selectionStart; render(); const i = app.querySelector('input[placeholder="Filter names"]'); i.focus(); i.setSelectionRange(pos, pos); } }),
      ),
      h('div', { class: 'stats' }, h('span', {}, h('b', {}, seniors), ' seniors'), h('span', {}, h('b', {}, state.staff.length - seniors), ' juniors')),
    ),
    state.staff.length
      ? h('section', { class: 'card scroll' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Name', 'Short names', 'Role', 'Grade', 'Posting', 'Subspecs', "Doesn't do", 'Seen in', ''].map(t => h('th', {}, t)))),
        h('tbody', {}, list.map(row))))
      : h('section', { class: 'card empty' }, 'No staff yet. Import the master staff sheet, or load a few past rosters to build the list automatically.'),
  );
}

async function importStaffSheet([file]) {
  const wb = await readWorkbook(file);
  const res = readStaffSheet(wb.worksheets[0]);
  if (res.error) return toast(res.error);
  let added = 0, updated = 0;
  for (const p of res.people) {
    const m = matchName(p.name, state.staff).person;
    if (m) { Object.assign(m, { ...p, history: m.history, aliases: [...new Set([...(m.aliases || []), ...p.aliases])] }); updated++; }
    else { state.staff.push({ id: newId(), history: {}, ...p }); added++; }
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
  if (newRooms.length) { state.roomTemplate.push(...newRooms); syncRooms(); }
  toast(`Read ${files.length} roster(s): ${staff.length - before} new people${newRooms.length ? `, ${newRooms.length} new rooms` : ''}. Check roles, grades and subspecs.`);
  render();
}

// ----- day tab -----

const pasteText = { leave: '', postcall: '', elsewhere: '', admin: '', notAround: '' };
let unmatched = [];
let dayFilter = '';

function renderDay() {
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
      h('td', {}, h('input', { class: 'narrow', value: s.leaveTime || '', placeholder: '5pm', title: 'Needs to leave at', onchange: e => { s.leaveTime = e.target.value.trim(); save(); } })),
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
      h('h2', {}, 'Day'),
      h('div', { class: 'bar' },
        h('label', {}, 'Roster for ', h('input', { type: 'date', value: d.date, onchange: e => { d.date = e.target.value; save(); } })),
        fileButton('Load draft roster (.xlsx)', '.xlsx', false, loadDraft),
        h('button', { onclick: () => { if (confirm('Clear rooms, notes and staff statuses for this day?')) { state.day = { date: d.date, rooms: [], staff: {}, lists: {} }; syncRooms(); render(); } } }, 'Clear day'),
      ),
      h('p', { class: 'hint' }, "\"Load draft roster\" reads the admin team's draft in the usual format: it picks up running rooms, case notes, leave, post call and upper-half duties."),
      unmatched.length ? h('ul', { class: 'warnings', style: 'margin-bottom:12px' }, h('li', { class: 'warn' },
        `Names not matched to the staff list: ${unmatched.join(', ')}. Add them in Staff, or add the short name to the right person, then load or apply again. `,
        h('button', { class: 'link', onclick: () => { unmatched = []; render(); } }, 'Dismiss'))) : null,
      h('div', { class: 'stats' },
        h('span', {}, h('b', {}, running.length), ' rooms running'),
        h('span', {}, h('b', {}, avail('senior')), ' seniors available'),
        h('span', {}, h('b', {}, avail('junior')), ' juniors available'),
      ),
    ),
    h('section', { class: 'card scroll' },
      h('h2', {}, 'OT lists'),
      h('p', { class: 'hint' }, 'Tick the rooms that are running and type the case notes as usual. Flags are suggested from the notes (ages under ' + state.settings.paedsAgeYears + 'y count as paeds). Click a flag to change it. Fix a senior or junior to lock them in; the rest is filled automatically.'),
      h('table', {},
        h('thead', {}, h('tr', {}, ['Run', 'Room', 'Session', 'Case notes', 'Flags', 'Fixed senior', 'Fixed junior'].map(t => h('th', {}, t)))),
        h('tbody', {}, d.rooms.map(roomRow))),
    ),
    h('section', { class: 'card' },
      h('h2', {}, 'Who is around'),
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
    h('section', { class: 'card scroll' },
      h('div', { class: 'bar' }, h('h2', { class: 'grow' }, 'Staff today'),
        h('input', { placeholder: 'Filter', value: dayFilter, oninput: e => { dayFilter = e.target.value; const pos = e.target.selectionStart; render(); const i = app.querySelector('input[placeholder="Filter"]'); i.focus(); i.setSelectionRange(pos, pos); } })),
      state.staff.length
        ? h('table', {},
          h('thead', {}, h('tr', {}, ['Name', 'Grade', 'Status', 'Leaves at', '', 'Note on roster'].map(t => h('th', {}, t)))),
          h('tbody', {}, flist.map(staffRow)))
        : h('p', { class: 'empty' }, 'Add staff in step 1 first.'),
    ),
  );
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
  return out;
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

  d.rooms.forEach(r => { r.running = false; });
  let rooms = 0;
  for (const r of rows) {
    const m = r.label.match(/((KROR|MCOR|MOR)\s*\d+)\s*$/i) || (/^remote/i.test(r.label) ? [null, 'Remote Case', 'Other'] : null);
    if (!m) continue;
    const name = m[1].toUpperCase().replace(/\s+/, ' ').replace('REMOTE CASE', 'Remote Case');
    let room = d.rooms.find(x => x.name === name);
    if (!room) { state.roomTemplate.push({ complex: m[2] ? m[2].toUpperCase() : 'Other', name }); syncRooms(); room = d.rooms.find(x => x.name === name); }
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
  const upperLabels = /^(recovery|eot|epidural|adot|cardiac call|ect|aocc|pain|acute pain|chronic pain|consultant|registrar|residents|ah ot|ah icu)/;
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
let editing = null; // "rowIndex:key" of the cell being typed in

function afterRosterEdit() {
  const r = state.roster;
  r.checks = check({ rows: r.rows, staff: state.staff, day: state.day, settings: state.settings });
  render();
}

function dropName(src, dst) {
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

function startNameDrag(e, src) {
  if (e.button !== 0) return;
  const chip = e.currentTarget;
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
      if (ev.type === 'pointerup') { clearTimeout(tagTimer); tagTimer = setTimeout(() => openTagEditor(chip, src), 250); }
      return;
    }
    ghost.remove();
    chip.classList.remove('dragging');
    over?.classList.remove('over');
    const t = ev.type === 'pointerup' ? targetAt(ev.clientX, ev.clientY) : null;
    if (!t) return;
    dropName(src, { row: +t.dataset.row, key: t.dataset.key, part: t.dataset.part != null ? +t.dataset.part : null });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// ---- tags on one name: "(L)", "(RA)", "(AOH 1)" and the part after a dash ("-5pm", "-C-OT 4") ----

const TAGS = ['L', 'RA', 'P', 'SR', 'Neu', 'Amb', 'PACU'];
let tagTimer = null;

function parseNamePart(text) {
  const tags = [...String(text).matchAll(/\(([^)]*)\)/g)].map(m => m[1].trim()).filter(Boolean);
  let rest = String(text).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  let dash = '';
  const m = rest.match(/^(.*?)\s+-\s*(.+)$/);
  if (m) { rest = m[1].trim(); dash = m[2].trim(); }
  return { name: rest, tags, dash };
}
const buildNamePart = ({ name, tags, dash }) => `${name}${tags.map(t => ` (${t})`).join('')}${dash ? ` -${dash}` : ''}`;

function closeTagEditor() { document.querySelector('.tag-editor')?.remove(); }

function openTagEditor(chip, src) {
  closeTagEditor();
  const row = state.roster.rows[src.row];
  const parts = cellParts(row, src.key);
  const cur = parseNamePart(parts[src.part] ?? '');
  const p = matchName(cur.name, state.staff).person;
  const on = new Set(cur.tags.filter(t => TAGS.includes(t)));
  const other = h('input', { value: cur.tags.filter(t => !TAGS.includes(t)).join(', '), placeholder: 'e.g. AOH 1' });
  const dash = h('input', { value: cur.dash, placeholder: 'e.g. 5pm, mtg 3pm, C-OT 4' });
  const name = h('input', { value: cur.name });
  const chips = h('div', { class: 'chips' }, TAGS.map(t => {
    const c = h('span', { class: 'chip' + (on.has(t) ? ' on' : ''), title: t === 'L' ? (src.key === 'senior' ? 'Liver standby' : 'Liver posting') : '', onclick: () => {
      if (on.has(t)) on.delete(t); else on.add(t);
      c.classList.toggle('on', on.has(t));
    } }, t);
    return c;
  }));
  const apply = () => {
    const tags = [...TAGS.filter(t => on.has(t)), ...splitNameList(other.value)];
    const next = buildNamePart({ name: name.value.trim() || cur.name, tags, dash: dash.value.trim() });
    closeTagEditor();
    if (next === parts[src.part]) return;
    undoStack.push(JSON.stringify(state.roster.rows));
    parts[src.part] = next;
    setCellParts(row, src.key, parts);
    // keep the day's details in step so checks and regenerating agree with the sheet
    if (p) {
      const d = dayOf(p.id);
      if (src.key === 'senior') d.liverStandby = on.has('L');
      const t = dash.value.trim();
      if (!t || /^\d{1,2}([.:]\d{2})?\s*(am|pm)?$/i.test(t)) d.leaveTime = t;
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
    onkeydown: e => { if (e.key === 'Escape') closeTagEditor(); if (e.key === 'Enter') apply(); } },
    h('label', {}, 'Name'), name,
    h('label', {}, 'Tags'), chips,
    h('label', {}, 'Other tags'), other,
    h('label', {}, 'After a dash (leave time or note)'), dash,
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
  row.notes = value;
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

function rosterCell(row, i, key, doubles) {
  const id = i + ':' + key;
  if (editing === id) {
    const input = h('input', {
      class: 'cell-input', value: row[key] || '', spellcheck: 'false',
      onkeydown: e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { editing = null; render(); } },
      onblur: e => {
        if (editing !== id) return;
        editing = null;
        if (e.target.value !== (row[key] || '')) { undoStack.push(JSON.stringify(state.roster.rows)); row[key] = e.target.value; afterRosterEdit(); }
        else render();
      },
    });
    setTimeout(() => { input.focus(); input.select(); });
    return h('td', { class: 'cell editing' }, input);
  }
  const parts = cellParts(row, key);
  return h('td', {
    class: 'cell', 'data-drop': '', 'data-row': i, 'data-key': key, title: 'Drag a name to swap or move it. Double-click to type.',
    ondblclick: () => { clearTimeout(tagTimer); closeTagEditor(); editing = id; render(); },
  }, parts.length
    ? h('div', { class: 'names' }, parts.map((p, k) => [k ? h('span', { class: 'sep' }, '/') : null, h('span', {
      class: 'name', 'data-drop': '', 'data-row': i, 'data-key': key, 'data-part': k,
      title: 'Drag to swap or move. Click to edit tags.',
      onpointerdown: e => startNameDrag(e, { row: i, key, part: k }),
    }, p, key === 'senior' && isDouble(p, doubles) ? h('sup', { class: 'dbl', title: 'Double covering' }, '&') : null)]))
    : h('span', { class: 'empty-cell' }, '—'));
}

function runGenerate(newSeed) {
  if (!state.staff.length) return toast('Add staff first.');
  if (!state.day.rooms.some(r => r.running)) return toast('Tick the running rooms in Day setup first.');
  const seed = newSeed ? Math.floor(Math.random() * 1e9) : (state.roster?.seed || 1);
  const res = generate({ staff: state.staff, day: state.day, settings: state.settings, seed });
  undoStack = []; editing = null;
  state.roster = { ...res, seed, date: state.day.date, checks: check({ rows: res.rows, staff: state.staff, day: state.day, settings: state.settings }) };
  render();
}

let rosterView = 'edit';

// The sheet exactly as it will be exported, drawn as an HTML table.
function renderSheet() {
  const layout = buildLayout({ date: state.day.date, rows: state.roster.rows, lists: rosterLists() });
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
      ].filter(Boolean).join(';');
      const attrs = { class: (c.box ? 'box' : '') + (c.c1 === 12 ? ' spill' : ''), colspan: c.c2 - c.c1 + 1, rowspan: c.r2 - c.r + 1, style };
      if (c.edit?.key === 'notes') {
        const row = state.roster.rows[c.edit.row];
        tds.push(notesCell(row, c.edit.row, { ...attrs, class: attrs.class + ' editable' }));
        continue;
      }
      const lines = String(c.text).split('\n');
      tds.push(h('td', attrs, c.runs
        ? c.runs.map(run => run.sup ? h('sup', {}, run.text) : run.text)
        : lines.map((t, i) => [i ? h('br') : null, c.underlineFirst && i === 0 ? h('u', {}, t) : t])));
    }
    trs.push(h('tr', { style: layout.heights[r] ? `height:${Math.round(layout.heights[r] * 1.33)}px` : '' }, tds));
  }
  return h('section', { class: 'card scroll sheet-wrap' },
    h('table', { class: 'xl' },
      h('colgroup', {}, COL_WIDTHS.map(w => h('col', { style: `width:${Math.round(w * 7 + 5)}px` }))),
      h('tbody', {}, trs)));
}

function renderRoster() {
  const r = state.roster;
  const actions = h('div', { class: 'bar' },
    h('button', { class: 'primary', onclick: () => runGenerate(!!r) }, r ? 'Regenerate' : 'Generate roster'),
    r && h('button', { disabled: !undoStack.length, onclick: () => { state.roster.rows = JSON.parse(undoStack.pop()); afterRosterEdit(); } }, 'Undo'),
    r && h('button', { onclick: exportXlsx }, 'Download .xlsx'),
    r && h('div', { class: 'seg', role: 'group', 'aria-label': 'View' },
      h('button', { 'aria-pressed': String(rosterView === 'edit'), onclick: () => { rosterView = 'edit'; render(); } }, 'Edit'),
      h('button', { 'aria-pressed': String(rosterView === 'sheet'), onclick: () => { rosterView = 'sheet'; render(); } }, 'Sheet preview')),
    r && rosterView === 'sheet' && h('button', { onclick: () => window.print() }, 'Print / save PDF'),
    h('span', { class: 'grow' }),
    h('label', { class: 'seen' }, 'Roster for ', h('input', { type: 'date', value: state.day.date, onchange: e => { state.day.date = e.target.value; render(); } })),
  );
  if (!r) return h('div', {}, h('section', { class: 'card' }, h('h2', {}, 'Roster'), h('p', { class: 'hint' }, 'Generates the OT section: seniors, juniors and premed cover. You can edit any cell before downloading.'), actions));

  const doubles = doubleCovered(r.rows);
  const flaggedRooms = new Set([...(r.warnings || []), ...(r.checks || [])].filter(w => w.level === 'error').map(w => w.text.split(':')[0]));
  const body = [];
  let last = null;
  r.rows.forEach((row, i) => {
    if (last && row.complex !== last && row.complex === 'MOR') body.push(h('tr', { class: 'gap' }, h('td', { colspan: 5 })));
    last = row.complex;
    body.push(h('tr', { class: flaggedRooms.has(row.label) ? 'flagged' : '' },
      h('td', { class: 'room' }, row.label + ':'),
      rosterCell(row, i, 'senior', doubles), rosterCell(row, i, 'junior', doubles), rosterCell(row, i, 'premed', doubles),
      notesCell(row, i, { class: 'notes' })));
  });
  const genRooms = new Set((r.warnings || []).filter(w => w.level === 'error').map(w => w.text.split(':')[0]));
  const seen = new Set();
  const all = [...(r.warnings || []), ...(r.checks || []).filter(w => !(genRooms.has(w.text.split(':')[0]) && / no senior\.$/.test(w.text)))]
    .filter(w => !seen.has(w.text) && seen.add(w.text));
  const order = { error: 0, warn: 1, info: 2 };
  all.sort((a, b) => order[a.level] - order[b.level]);

  if (rosterView === 'sheet') {
    return h('div', {},
      h('section', { class: 'card no-print' }, h('h2', {}, 'Roster'), actions,
        h('p', { class: 'hint', style: 'margin:0' }, 'This is what the downloaded .xlsx looks like. Click the case notes on the right to edit them. Parts the tool doesn\'t fill yet (MOT, SICU, upper duties, AH OT) are left blank. Switch to Edit to move names or change tags. & marks a senior who is double covering.')),
      renderSheet());
  }
  return h('div', {},
    h('section', { class: 'card' }, h('h2', {}, 'Roster'), actions,
      h('p', { class: 'hint', style: 'margin:0' }, 'Drag a name onto another name to swap them, or onto an empty part of a cell to move it there. Click a name to change its tags ((L), (RA), -5pm…). Double-click a cell to type, or click the case notes to edit them. & marks a senior who is double covering.')),
    h('div', { class: 'cols' },
      h('section', { class: 'card scroll' },
        h('table', { class: 'sheet' },
          h('thead', {}, h('tr', {}, ['', 'Senior', 'Junior', 'Premed cover', 'Cases'].map(t => h('th', {}, t)))),
          h('tbody', {}, body))),
      h('div', {},
        h('section', { class: 'card' },
          h('h2', {}, 'Things to look at'),
          all.length ? h('ul', { class: 'warnings' }, all.map(w => h('li', { class: w.level }, w.text))) : h('p', { class: 'hint' }, 'No problems found.')),
        h('section', { class: 'card' },
          h('h2', {}, 'Not on an OT list'),
          h('p', { class: 'hint' }, 'Available but unassigned. Use them for AH OT, covers or admin.'),
          h('p', {}, h('b', {}, 'Seniors: '), r.unusedSeniors.join(', ') || '—'),
          h('p', {}, h('b', {}, 'Juniors: '), r.unusedJuniors.join(', ') || '—')),
      ),
    ),
  );
}

async function exportXlsx() {
  const wb = buildRosterWorkbook(window.ExcelJS, { date: state.day.date, rows: state.roster.rows, lists: rosterLists() });
  const buf = await wb.xlsx.writeBuffer();
  download(`OT roster ${state.day.date}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

// ----- settings tab -----

function renderSettings() {
  const st = state.settings;
  const subRow = s => h('tr', {},
    h('td', {}, h('input', { value: s.label, onchange: e => { s.label = e.target.value; save(); } })),
    h('td', {}, h('input', { value: s.keywords.join(', '), onchange: e => { s.keywords = splitNameList(e.target.value).map(x => x.toLowerCase()); save(); } })),
    h('td', {}, h('label', {}, h('input', { type: 'checkbox', checked: s.hard, onchange: e => { s.hard = e.target.checked; save(); } }), ' required')),
    h('td', {}, select(s.posting || '', POSTINGS, v => { s.posting = v; save(); })),
    h('td', {}, h('button', { class: 'small', onclick: () => { st.subspecs = st.subspecs.filter(x => x !== s); render(); } }, '✕')),
  );
  const roomText = Object.entries(state.roomTemplate.reduce((acc, r) => { (acc[r.complex] ||= []).push(r.name); return acc; }, {}))
    .map(([c, rs]) => `${c}: ${rs.join(', ')}`).join('\n');

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
      h('p', { class: 'hint' }, 'One complex per line, in roster order. Rooms in the same complex can share a senior when seniors are short.'),
      h('textarea', { rows: 6, value: roomText, onchange: e => {
        state.roomTemplate = e.target.value.split('\n').map(l => l.split(':')).filter(p => p.length > 1)
          .flatMap(([c, rs]) => rs.split(',').map(n => n.trim()).filter(Boolean).map(name => ({ complex: c.trim(), name })));
        syncRooms(); save(); toast('Rooms updated.');
      } }),
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
  const data = { kind: 'ot-roster-team', version: 1, savedAt: new Date().toISOString(), settings: state.settings, staff: state.staff, roomTemplate: state.roomTemplate };
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
    state.roomTemplate = data.roomTemplate || clone(DEFAULT_ROOMS);
    nextId = 1 + state.staff.reduce((m, p) => Math.max(m, parseInt(String(p.id).replace(/\D/g, ''), 10) || 0), 0);
    syncRooms();
    render();
    toast(`Team file loaded: ${state.staff.length} staff.`);
  } catch {
    toast("That file isn't an OT roster team file.");
  }
});

if (!state.staff.length) state.tab = 'staff';
render();
