import {
  DEFAULT_SETTINGS, DEFAULT_ROOMS, JUNIOR_GRADES, SENIOR_GRADES, POSTINGS, STATUSES,
  matchName, splitNameList, namesInCell, suggestFlags, generate, check, learnFromRosters,
} from './engine.js';
import { readRosterRows, readStaffSheet, buildRosterWorkbook, cellText } from './xlsxio.js';

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
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
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
    h('td', {}, h('input', { type: 'checkbox', checked: r.running, 'aria-label': 'Running', onchange: e => { r.running = e.target.checked; render(); } })),
    h('td', {}, h('b', {}, r.name)),
    h('td', {}, select(r.session || 'full', [['full', 'Full'], ['am', 'AM'], ['pm', 'PM']], v => { r.session = v; save(); })),
    h('td', {}, h('input', { value: r.notes, placeholder: 'e.g. eye 5y', onchange: e => {
      r.notes = e.target.value;
      if (e.target.value.trim()) r.running = true;
      if (!r.flagsManual) r.flags = suggestFlags(r.notes, state.settings);
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
        h('button', { onclick: () => { if (confirm('Clear rooms, notes and staff statuses for this day?')) { state.day = { date: d.date, rooms: [], staff: {} }; syncRooms(); render(); } } }, 'Clear day'),
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

function applyPaste() {
  const missed = [];
  for (const [key, status] of [['leave', 'leave'], ['postcall', 'postcall'], ['elsewhere', 'elsewhere'], ['admin', 'admin']]) {
    missed.push(...markNames(splitNameList(pasteText[key]), s => { s.status = status; }));
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
    room.flags = suggestFlags(r.notes, state.settings);
    room.session = /\bam\b/i.test(r.senior) && !/\bpm\b/i.test(r.senior) && !r.notes ? 'am' : 'full';
    rooms++;
  }
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

function runGenerate(newSeed) {
  if (!state.staff.length) return toast('Add staff first.');
  if (!state.day.rooms.some(r => r.running)) return toast('Tick the running rooms in Day setup first.');
  const seed = newSeed ? Math.floor(Math.random() * 1e9) : (state.roster?.seed || 1);
  const res = generate({ staff: state.staff, day: state.day, settings: state.settings, seed });
  state.roster = { ...res, seed, date: state.day.date, checks: check({ rows: res.rows, staff: state.staff, day: state.day, settings: state.settings }) };
  render();
}

function renderRoster() {
  const r = state.roster;
  const actions = h('div', { class: 'bar' },
    h('button', { class: 'primary', onclick: () => runGenerate(!!r) }, r ? 'Regenerate' : 'Generate roster'),
    r && h('button', { onclick: () => { r.checks = check({ rows: r.rows, staff: state.staff, day: state.day, settings: state.settings }); render(); toast('Checked.'); } }, 'Re-check edits'),
    r && h('button', { onclick: exportXlsx }, 'Download .xlsx'),
    h('span', { class: 'grow' }),
    r && h('span', { class: 'seen' }, `Roster for ${state.day.date}`),
  );
  if (!r) return h('div', {}, h('section', { class: 'card' }, h('h2', {}, 'Roster'), h('p', { class: 'hint' }, 'Generates the OT section: seniors, juniors and premed cover. You can edit any cell before downloading.'), actions));

  const flaggedRooms = new Set([...(r.warnings || []), ...(r.checks || [])].filter(w => w.level === 'error').map(w => w.text.split(':')[0]));
  const cell = (row, key) => h('td', { class: 'cell', contenteditable: 'plaintext-only', spellcheck: 'false', oninput: e => { row[key] = e.target.textContent; save(); } }, row[key] || '');
  const body = [];
  let last = null;
  for (const row of r.rows) {
    if (last && row.complex !== last && row.complex === 'MOR') body.push(h('tr', { class: 'gap' }, h('td', { colspan: 5 })));
    last = row.complex;
    body.push(h('tr', { class: flaggedRooms.has(row.label) ? 'flagged' : '' },
      h('td', { class: 'room' }, row.label + ':'),
      cell(row, 'senior'), cell(row, 'junior'), cell(row, 'premed'),
      h('td', { class: 'notes' }, row.notes)));
  }
  const genRooms = new Set((r.warnings || []).filter(w => w.level === 'error').map(w => w.text.split(':')[0]));
  const seen = new Set();
  const all = [...(r.warnings || []), ...(r.checks || []).filter(w => !(genRooms.has(w.text.split(':')[0]) && / no senior\.$/.test(w.text)))]
    .filter(w => !seen.has(w.text) && seen.add(w.text));
  const order = { error: 0, warn: 1, info: 2 };
  all.sort((a, b) => order[a.level] - order[b.level]);

  return h('div', {},
    h('section', { class: 'card' }, h('h2', {}, 'Roster'), actions),
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
  const wb = buildRosterWorkbook(window.ExcelJS, { date: state.day.date, rows: state.roster.rows });
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
