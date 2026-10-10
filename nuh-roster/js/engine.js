// OT roster engine: name matching, case-note parsing, assignment and checks.
// Pure functions only (no DOM), so it can be tested in Node.

export const DEFAULT_SETTINGS = {
  paedsAgeYears: 12,
  premedCap: 3,
  subspecs: [
    { key: 'paeds', label: 'Paeds', keywords: ['pas', 'paeds', 'paed'], hard: true, posting: 'P', byAge: true },
    { key: 'cardiac', label: 'Cardiac', keywords: ['c', 'cardiac', 'cabg', 'avr', 'mvr'], hard: true, posting: '' },
    { key: 'neuro', label: 'Neuro', keywords: ['nes', 'neuro', 'craniotomy', 'crani'], hard: true, posting: 'Neu' },
    { key: 'thoracic', label: 'Thoracic', keywords: ['vats', 'thoracic', 'lobectomy'], hard: true, posting: 'SR' },
    { key: 'hpb', label: 'Liver / HPB', keywords: ['hepatec', 'hepatectomy', 'whipple', 'liver', 'hpb'], hard: false, posting: 'L' },
    { key: 'obs', label: 'Obstetric', keywords: ['lscs'], hard: false, posting: '' },
    { key: 'regional', label: 'Regional', keywords: ['tkr', 'thr', 'acl', 'shoulder', 'knee', 'hip'], hard: false, posting: 'RA' },
  ],
  complexKeywords: ['whipple', 'hepatec', 'hepatectomy', 'oesophagectomy', 'scoli', 'evar', 'laryngect', 'lefort', 'transplant', 'vats', 'ugi', 'thoracic'],
  longKeywords: ['7pm', '8pm', 'long'],
  // rooms whose lists always need a subspec, whatever the case notes say
  roomDefaults: { 'MOR 12': ['cardiac'], 'MOR 13': ['cardiac'] },
};

export const JUNIOR_GRADES = ['Resident', 'MOPEX', 'Baby MO'];
export const SENIOR_GRADES = ['Consultant', 'AC', 'Registrar'];
export const POSTINGS = ['', 'RA', 'P', 'L', 'SR', 'Neu', 'Amb'];

// Name colour on the roster: green marks Baby MOs (never left alone), purple marks locums.
export const COLOURS = [['', 'Black'], ['green', 'Green'], ['purple', 'Purple']];
export const COLOUR_ARGB = { green: 'FF00B050', purple: 'FF7030A0' };
export const isBaby = p => !!p && (p.grade === 'Baby MO' || p.colour === 'green');
export const STATUSES = [
  ['avail', 'Available'],
  ['leave', 'Leave'],
  ['postcall', 'Post call'],
  ['elsewhere', 'Elsewhere'],
  ['admin', 'Admin / no list'],
];

// defaultOn: ticked as running when a new day is set up. MOR 7-9 are emergency OTs and have no line.
export const DEFAULT_ROOMS = [
  ['Other', ['Remote 1', 'Remote 2']],
  ['KROR', ['KROR PACU', 'KROR 1', 'KROR 2', 'KROR 3', 'KROR 4', 'KROR 5', 'KROR 6', 'KROR 7']],
  ['MCOR', ['MCOR PACU', 'MCOR 1', 'MCOR 2', 'MCOR 3', 'MCOR 4', 'MCOR 5', 'MCOR 6', 'MCOR 7', 'MCOR 8', 'MCOR 9', 'MCOR 10']],
  ['MOR', ['MBOR PACU', 'MOR 1', 'MOR 2', 'MOR 3', 'MOR 4', 'MOR 5', 'MOR 6', 'MOR 10', 'MOR 11', 'MOR 12', 'MOR 13', 'MOR 14', 'MOR 15', 'MOR 16', 'MOR 17', 'MOR 18']],
].flatMap(([complex, rooms]) => rooms.map(name => ({ complex, name, defaultOn: !['Remote 2', 'KROR 1', 'MCOR 9'].includes(name) })));

// PACU rows are filled by hand: the generator leaves them empty and doesn't ask for a senior.
export const isPacu = name => /pacu/i.test(String(name));
export function pacuRoom(label) {
  const m = String(label).match(/\b(KROR|MCOR|MBOR|MOR)\s*PACU\b/i);
  return m ? `${m[1].toUpperCase() === 'MOR' ? 'MBOR' : m[1].toUpperCase()} PACU` : null;
}

// "Remote Case" / "Remote case 2" / "Remote 2:" -> "Remote 1" / "Remote 2"
export function remoteRoom(label) {
  const m = String(label).match(/^\s*remote(?:\s*case)?\s*(\d)?/i);
  return m ? `Remote ${m[1] || 1}` : null;
}

// ---------- names ----------

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = s => norm(s).split(' ').filter(Boolean);

// Does query token q match staff tokens t starting at i, either as a whole token
// or as a run of initials ("yw" -> "yi wei")? Returns the number of tokens consumed.
function tokenMatch(q, t, i) {
  if (t[i] === q) return 1;
  if (q.length === 1 && t[i][0] === q) return 1; // "R Chia", "Arumugam R Kannan"
  if (i + 1 < t.length && t[i] + t[i + 1] === q) return 2; // "Jiaxin" vs "Jia Xin"
  if (q.length >= 2 && q.length <= 4 && i + q.length <= t.length) {
    for (let k = 0; k < q.length; k++) if (t[i + k][0] !== q[k]) return 0;
    return q.length;
  }
  return 0;
}

function nameMatchesForms(query, forms) {
  const q = tokens(query);
  if (!q.length) return 0;
  let best = 0;
  for (const form of forms) {
    const t = tokens(form);
    if (!t.length) continue;
    if (q.join(' ') === t.join(' ')) return 3;
    // every query token must match a distinct staff token (initials may span several)
    const used = new Array(t.length).fill(false);
    let ok = true;
    for (const qt of q) {
      let hit = false;
      for (let i = 0; i < t.length && !hit; i++) {
        if (used[i]) continue;
        const n = tokenMatch(qt, t, i);
        if (n && !used.slice(i, i + n).some(Boolean)) {
          for (let k = 0; k < n; k++) used[i + k] = true;
          hit = true;
        }
      }
      if (!hit) { ok = false; break; }
    }
    if (ok) best = Math.max(best, q.length > 1 ? 2 : 1);
  }
  return best;
}

// Find the staff member a free-text name refers to. Returns {person} or {ambiguous:[...]} or {}.
export function matchName(query, staff) {
  let top = 0, hits = [];
  for (const p of staff) {
    const sc = nameMatchesForms(query, [p.name, ...(p.aliases || [])]);
    if (sc > top) { top = sc; hits = [p]; } else if (sc && sc === top) hits.push(p);
  }
  if (hits.length === 1) return { person: hits[0] };
  if (hits.length > 1) return { ambiguous: hits };
  return {};
}

// Split a free-text list ("Tan YW, Ang KS / Swapna (KIV)") into name strings.
export function splitNameList(text) {
  return String(text ?? '')
    .split(/[\n,;\/\t]+/)
    .map(s => s.replace(/\(.*?\)/g, '').trim())
    .filter(Boolean);
}

// Pull person names out of one roster cell, ignoring annotations.
// "Sophia am /Leong SM pm" -> ["Sophia", "Leong SM"]; "Chaminda (Leong SM C)" -> ["Chaminda"]
export function namesInCell(text) {
  return String(text ?? '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\*+/g, ' ')
    .split('/')
    .map(s => s
      .replace(/\s-\s*premed.*$/i, '')
      .replace(/\s+[LC]-.*$/, '')        // "L-4pm", "L-4-5pm", "C-OT13", "C-KROR PACU"
      .replace(/\s+-.*$/, '')          // "-mtg 8.30", "-C-OT 4", "-5pm"
      .replace(/\b(am|pm)\b/gi, ' ')
      .replace(/\breq\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(s => s && /[a-z]/i.test(s));
}

// ---------- case notes ----------

function ageYears(notes) {
  let min = Infinity;
  const re = /(\d+(?:\.\d+)?)\s*(y|yo|yr|yrs|m|mo|mth|mths|w|wk|wks|d)\b/gi;
  for (const m of String(notes).matchAll(re)) {
    const n = parseFloat(m[1]);
    const u = m[2].toLowerCase();
    const y = u.startsWith('y') ? n : u.startsWith('m') ? n / 12 : u.startsWith('w') ? n / 52 : n / 365;
    min = Math.min(min, y);
  }
  return min;
}

function hasKeyword(notes, kw) {
  const k = norm(kw);
  if (!k) return false;
  return new RegExp(`(^| )${k.replace(/ /g, ' ')}( |$)`).test(norm(notes));
}

// Suggest flags for a room from its free-text case notes (and the room's own defaults).
export function suggestFlags(notes, settings = DEFAULT_SETTINGS, roomName = '') {
  const room = String(roomName).toUpperCase().replace(/\s+/g, ' ').trim();
  const defaults = Object.entries(settings.roomDefaults || {}).find(([k]) => k.toUpperCase().replace(/\s+/g, ' ').trim() === room)?.[1] || [];
  const subspecs = [...defaults];
  for (const s of settings.subspecs) {
    let hit = (s.keywords || []).some(k => hasKeyword(notes, k));
    if (s.byAge && ageYears(notes) < settings.paedsAgeYears) hit = true;
    if (hit && !subspecs.includes(s.key)) subspecs.push(s.key);
  }
  const complex = (settings.complexKeywords || []).some(k => hasKeyword(notes, k));
  const long = (settings.longKeywords || []).some(k => hasKeyword(notes, k));
  return { subspecs, complex, long };
}

// ---------- assignment ----------

const INF = 1e6;

// Hungarian algorithm for a rectangular cost matrix (rows <= cols). Returns col index per row.
export function hungarian(cost) {
  const n = cost.length, m = n ? cost[0].length : 0;
  if (!n) return [];
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(Infinity), used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const res = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) res[p[j] - 1] = j - 1;
  return res;
}

// Assign rows to cols minimising cost; works whether rows > cols or not.
function assign(cost) {
  if (!cost.length || !cost[0].length) return cost.map(() => -1);
  const n = cost.length, m = cost[0].length;
  if (n <= m) return hungarian(cost);
  const t = Array.from({ length: m }, (_, j) => cost.map(r => r[j]));
  const colToRow = hungarian(t);
  const res = new Array(n).fill(-1);
  colToRow.forEach((i, j) => { if (i >= 0) res[i] = j; });
  return res;
}

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}

const roomNum = name => parseInt(String(name).match(/(\d+)\s*$/)?.[1] ?? 'NaN', 10);

function subspecByKey(settings) {
  return Object.fromEntries(settings.subspecs.map(s => [s.key, s]));
}

function seniorRoomCost(p, d, room, settings, noise) {
  const sub = subspecByKey(settings);
  for (const k of room.flags.subspecs) {
    if (sub[k]?.hard && !(p.subspecs || []).includes(k)) return INF;
  }
  for (const a of p.avoid || []) {
    if (room.flags.subspecs.includes(a) || hasKeyword(room.notes, a)) return INF;
  }
  let c = noise;
  const special = room.flags.complex || room.flags.subspecs.some(k => sub[k]?.hard);
  if (d.liverStandby && special) c += 50;
  if (d.leaveTime && room.flags.long) c += 40;
  const mine = (p.subspecs || []).filter(k => room.flags.subspecs.includes(k)).length;
  c -= mine * 5;
  // keep subspecialists free for rooms that need them
  if ((p.subspecs || []).some(k => sub[k]?.hard) && !room.flags.subspecs.some(k => sub[k]?.hard)) c += 3;
  return c;
}

function juniorRoomCost(p, d, room, settings, noise, doubled) {
  const sub = subspecByKey(settings);
  const baby = isBaby(p);
  if (baby && doubled) return INF;
  let c = noise;
  if (baby && room.flags.complex) c += 30;
  if (room.flags.complex) c += p.grade === 'Resident' ? -5 : 10;
  else if (p.grade === 'MOPEX') c -= 2;
  if (p.posting) {
    const match = room.flags.subspecs.some(k => sub[k]?.posting && sub[k].posting === p.posting)
      || (p.posting === 'SR' && room.flags.complex);
    c += match ? -15 : 4;
  }
  if (d.leaveTime && room.flags.long) c += 40;
  return c;
}

const dayOf = (day, p) => day.staff?.[p.id] || {};
const isAvail = (day, p) => (dayOf(day, p).status || 'avail') === 'avail';

export function fmtSenior(p, d) {
  let s = p.name;
  if (d.liverStandby) s += ' (L)';
  if (d.note) s += ' ' + d.note;
  if (d.leaveTime) s += ' L-' + d.leaveTime;
  return s;
}

export function fmtJunior(p, d) {
  let s = p.name;
  if (p.posting) s += ` (${p.posting})`;
  if (d.note) s += ' ' + d.note;
  if (d.leaveTime) s += ' L-' + d.leaveTime;
  return s;
}

// Generate the OT section. Returns { rows, warnings, unusedSeniors, unusedJuniors }.
export function generate({ staff, day, settings = DEFAULT_SETTINGS, seed = 1 }) {
  const rand = rng(seed);
  const warnings = [];
  const allRooms = day.rooms.filter(r => r.running);
  const rooms = allRooms.filter(r => !isPacu(r.name)).map(r => ({
    ...r,
    flags: { subspecs: [], complex: false, long: false, ...(r.flags || {}) },
  }));
  const byId = Object.fromEntries(staff.map(p => [p.id, p]));
  const rowOf = Object.fromEntries(rooms.map(r => [r.id, { roomId: r.id, label: r.name, complex: r.complex, seniors: [], juniors: [], premed: null, notes: r.notes || '' }]));

  // ---- seniors ----
  const lockedSeniors = new Set();
  for (const r of rooms) {
    if (r.lockSenior && byId[r.lockSenior]) { rowOf[r.id].seniors.push(r.lockSenior); lockedSeniors.add(r.lockSenior); }
  }
  const openRooms = rooms.filter(r => !rowOf[r.id].seniors.length);
  const seniors = staff.filter(p => p.role === 'senior' && isAvail(day, p) && !lockedSeniors.has(p.id));

  // cost of each senior for each room (noise fixed up front so options compare fairly)
  const base = seniors.map(p => {
    const noise = rand() * 2;
    return Object.fromEntries(openRooms.map(r => [r.id, seniorRoomCost(p, dayOf(day, p), r, settings, noise)]));
  });
  const slotCost = slots => seniors.map((p, i) => slots.map(slot => {
    let c = 0;
    for (const r of slot) { const x = base[i][r.id]; if (x >= INF) return INF; c += x; }
    return c;
  }));
  const evaluate = slots => {
    const cost = slotCost(slots);
    if (!cost.length) return { cost, a: [], total: slots.length * INF };
    const a = assign(cost);
    let total = 0;
    const filled = new Set();
    a.forEach((j, i) => { if (j >= 0) { total += Math.min(cost[i][j], INF); if (cost[i][j] < INF) filled.add(j); } });
    total += (slots.length - filled.size) * INF;
    return { cost, a, total };
  };

  // slots: single rooms, plus double covers when seniors are short.
  // Pairs are chosen one at a time, each time taking the pair that leaves the best overall assignment.
  let slots = openRooms.map(r => [r]);
  let need = openRooms.length - seniors.length;
  const pairNotes = [];
  if (need > 0) {
    const sub = subspecByKey(settings);
    const cands = [];
    for (let i = 0; i < openRooms.length; i++) for (let j = i + 1; j < openRooms.length; j++) {
      const a = openRooms[i], b = openRooms[j];
      if (a.complex !== b.complex || a.complex === 'Other') continue;
      const halfDay = (a.session === 'am' && b.session !== 'am') || (b.session === 'am' && a.session !== 'am')
        || (a.session === 'pm' && b.session !== 'pm') || (b.session === 'pm' && a.session !== 'pm');
      if (!halfDay && (a.flags.complex || b.flags.complex)) continue;
      const gap = Math.abs(roomNum(a.name) - roomNum(b.name)) || 5;
      let c = halfDay ? 0 : 3 * Math.min(gap, 6);
      if (a.flags.subspecs.some(k => sub[k]?.hard) || b.flags.subspecs.some(k => sub[k]?.hard)) c += 6;
      cands.push({ a, b, c: c + rand() * 0.5 });
    }
    const used = new Set();
    const pairs = [];
    while (need > 0) {
      let best = null, bestTotal = Infinity;
      for (const cd of cands) {
        if (used.has(cd.a.id) || used.has(cd.b.id)) continue;
        const trial = [...pairs, [cd.a, cd.b], ...openRooms.filter(r => !used.has(r.id) && r !== cd.a && r !== cd.b).map(r => [r])];
        // rooms beyond the number of seniors can't all be filled yet; compare on what can be
        const t = evaluate(trial).total + cd.c;
        if (t < bestTotal) { bestTotal = t; best = cd; }
      }
      if (!best) break;
      used.add(best.a.id); used.add(best.b.id);
      pairs.push([best.a, best.b]);
      need--;
    }
    slots = [...pairs, ...openRooms.filter(r => !used.has(r.id)).map(r => [r])];
    for (const [a, b] of pairs) pairNotes.push(`${a.name} + ${b.name}`);
    if (pairs.length) warnings.push({ level: 'info', text: `Short of seniors: double cover ${pairNotes.join(', ')}.` });
    if (need > 0) warnings.push({ level: 'error', text: `Still short of ${need} senior(s) after double cover — some rooms left empty.` });
  }

  const { cost: sCost, a: sAssign } = evaluate(slots);
  const usedSeniors = new Set();
  sAssign.forEach((j, i) => {
    if (j < 0) return;
    if (sCost[i][j] >= INF) return;
    usedSeniors.add(seniors[i].id);
    for (const r of slots[j]) rowOf[r.id].seniors.push(seniors[i].id);
  });
  // a senior left over (e.g. because a subspec room had nobody eligible) takes one room of a double cover
  const spare = seniors.filter(p => !usedSeniors.has(p.id));
  for (const slot of slots) {
    if (slot.length < 2 || !spare.length) continue;
    for (const r of slot.slice(1)) {
      const k = spare.findIndex(p => seniorRoomCost(p, dayOf(day, p), r, settings, 0) < INF);
      if (k < 0) continue;
      const [p] = spare.splice(k, 1);
      rowOf[r.id].seniors = [p.id];
      usedSeniors.add(p.id);
      slot.splice(slot.indexOf(r), 1);
      const i = pairNotes.findIndex(t => t.includes(r.name));
      if (i >= 0) pairNotes.splice(i, 1);
    }
  }
  const pairInfo = warnings.findIndex(w => w.text.startsWith('Short of seniors'));
  if (pairInfo >= 0) {
    if (pairNotes.length) warnings[pairInfo].text = `Short of seniors: double cover ${pairNotes.join(', ')}.`;
    else warnings.splice(pairInfo, 1);
  }
  const doubled = new Set();
  for (const slot of slots) {
    if (slot.length > 1 && slot.some(r => rowOf[r.id].seniors.length)) slot.forEach(r => doubled.add(r.id));
  }
  for (const r of openRooms) {
    if (!rowOf[r.id].seniors.length) {
      const req = r.flags.subspecs.filter(k => subspecByKey(settings)[k]?.hard).map(k => subspecByKey(settings)[k].label);
      warnings.push({ level: 'error', text: `${r.name}: no eligible senior${req.length ? ` (needs ${req.join(', ')})` : ''}.` });
    }
  }

  // ---- juniors ----
  const lockedJuniors = new Set();
  for (const r of rooms) {
    if (r.lockJunior && byId[r.lockJunior]) { rowOf[r.id].juniors.push(r.lockJunior); lockedJuniors.add(r.lockJunior); }
  }
  const jRooms = rooms.filter(r => !rowOf[r.id].juniors.length);
  let juniors = staff.filter(p => p.role === 'junior' && isAvail(day, p) && !lockedJuniors.has(p.id));
  // first pass: one junior per room; dummy "nobody" columns let rooms go without
  const jCost = juniors.map(p => jRooms.map(r => juniorRoomCost(p, dayOf(day, p), r, settings, rand() * 2, doubled.has(r.id))));
  const nobody = jRooms.map(r => doubled.has(r.id) ? 5000 : r.flags.complex ? 80 : 40);
  const rowsForNobody = Math.max(0, jRooms.length - juniors.length);
  const fullCost = [
    ...jCost,
    ...Array.from({ length: rowsForNobody }, () => nobody.slice()),
  ];
  const jAssign = assign(fullCost);
  const placed = new Set();
  jAssign.forEach((j, i) => {
    if (j < 0 || i >= juniors.length || jCost[i][j] >= INF) return;
    rowOf[jRooms[j].id].juniors.push(juniors[i].id);
    placed.add(juniors[i].id);
  });
  for (const r of jRooms) {
    if (!rowOf[r.id].juniors.length) {
      warnings.push({ level: doubled.has(r.id) ? 'error' : 'warn', text: `${r.name}: no junior${doubled.has(r.id) ? ' but senior is double covering' : ''}.` });
    }
  }
  // extra juniors: double up, favouring rooms with Baby MOs, complex lists and posting matches
  let extras = juniors.filter(p => !placed.has(p.id));
  while (extras.length) {
    const cost = extras.map(p => rooms.map(r => {
      const here = rowOf[r.id].juniors.map(id => byId[id]);
      let c = juniorRoomCost(p, dayOf(day, p), r, settings, rand() * 2, doubled.has(r.id));
      if (c >= INF) return INF;
      if (isBaby(p)) c += 20; // a Baby MO as the extra is fine, but prefer seniors-in-training
      if (here.some(isBaby)) c -= 20;
      c += here.length * 25;
      if (!here.length) c -= 30;
      return c;
    }));
    const a = assign(cost);
    const next = [];
    a.forEach((j, i) => {
      if (j < 0 || cost[i][j] >= INF) { next.push(extras[i]); return; }
      rowOf[rooms[j].id].juniors.push(extras[i].id);
    });
    if (next.length === extras.length) break;
    extras = next;
  }

  // ---- premed cover ----
  const roomOfJunior = {};
  for (const r of rooms) for (const id of rowOf[r.id].juniors) roomOfJunior[id] = r;
  const coverers = staff.filter(p => p.role === 'junior' && !isBaby(p)
    && ['avail', 'elsewhere'].includes(dayOf(day, p).status || 'avail') && !dayOf(day, p).notAroundPrev);
  const load = {};
  const premedRooms = rooms.filter(r => rowOf[r.id].juniors.some(id => dayOf(day, byId[id]).notAroundPrev));
  for (const r of premedRooms) {
    const row = rowOf[r.id];
    const mate = row.juniors.map(id => byId[id]).find(p => !dayOf(day, p).notAroundPrev && !isBaby(p));
    if (mate) { row.premed = mate.id; load[mate.id] = (load[mate.id] || 0) + 1; continue; }
    const sameSenior = rooms.filter(o => o.id !== r.id && row.seniors.length && rowOf[o.id].seniors[0] === row.seniors[0]).map(o => rowOf[o.id].premed).filter(Boolean);
    let best = null, bestC = Infinity;
    for (const p of coverers) {
      const l = load[p.id] || 0;
      if (l >= settings.premedCap) continue;
      const home = roomOfJunior[p.id];
      let c = l * 3 + rand();
      if (!home) c += 4; else if (home.complex !== r.complex) c += 2;
      if (home?.flags.complex) c += 2;
      if (sameSenior.includes(p.id)) c -= 3;
      if (c < bestC) { bestC = c; best = p; }
    }
    if (best) { row.premed = best.id; load[best.id] = (load[best.id] || 0) + 1; }
    else warnings.push({ level: 'warn', text: `${r.name}: needs premed cover but nobody is free.` });
  }

  const pacu = Object.fromEntries(allRooms.filter(r => isPacu(r.name)).map(r => [r.id, { roomId: r.id, label: r.name, complex: r.complex, senior: '', junior: '', premed: '', notes: r.notes || '' }]));
  const rows = allRooms.map(r => {
    if (pacu[r.id]) return pacu[r.id];
    const row = rowOf[r.id];
    return {
      roomId: r.id,
      label: r.name,
      complex: r.complex,
      senior: row.seniors.map(id => fmtSenior(byId[id], dayOf(day, byId[id]))).join(' / '),
      junior: row.juniors.map(id => fmtJunior(byId[id], dayOf(day, byId[id]))).join(' / '),
      premed: row.premed ? `${byId[row.premed].name} - Premed` : '',
      notes: row.notes,
    };
  });
  const allUsed = new Set(Object.values(rowOf).flatMap(r => [...r.seniors, ...r.juniors]));
  const unusedSeniors = staff.filter(p => p.role === 'senior' && isAvail(day, p) && !allUsed.has(p.id)).map(p => p.name);
  const unusedJuniors = staff.filter(p => p.role === 'junior' && isAvail(day, p) && !allUsed.has(p.id)).map(p => p.name);
  return { rows, warnings, unusedSeniors, unusedJuniors };
}

// ---------- checks on a (possibly hand-edited) roster ----------

// Someone leaving early is written "Name L-4pm" (or "L-4-5pm"); whoever covers the room is
// written "Name C-OT13", "Name C-KROR PACU" or "Name C-MOR 4". Returns rooms where a leaver has no cover.
const COVER_RE = /\bC-\s*(.+?)(?=\s+L-|\s+-\s|$)/i;
export function coverText(part) { return String(part).match(COVER_RE)?.[1].trim() || ''; }

// Which room a cover refers to: a full room name ("KROR PACU", "MOR 4"), or "OT13" / "13"
// meaning that room number in the coverer's own complex.
export function coverTarget(text, row, rows) {
  const t = String(text).toUpperCase().replace(/\s+/g, ' ').trim();
  const exact = rows.find(r => r.label.toUpperCase() === t);
  if (exact) return exact.label;
  const n = t.match(/^(?:OT\s*)?(\d+)$/)?.[1];
  if (n) return rows.find(r => r.complex === row.complex && roomNum(r.label) === +n)?.label || null;
  return null;
}

export function missingCovers(rows) {
  const out = [];
  const covered = new Set();
  for (const row of rows) for (const col of ['senior', 'junior']) for (const part of String(row[col] || '').split('/')) {
    const c = coverText(part);
    if (c) { const target = coverTarget(c, row, rows); if (target) covered.add(target); }
  }
  for (const row of rows) for (const col of ['senior', 'junior']) for (const part of String(row[col] || '').split('/')) {
    const m = part.match(/\bL-\s*([\d.:]+(?:\s*-\s*[\d.:]+)?\s*(?:am|pm)?)/i);
    if (m && !covered.has(row.label)) out.push({ row, name: namesInCell(part)[0] || part.trim(), when: m[1] });
  }
  return out;
}

export function check({ rows, staff, day, settings = DEFAULT_SETTINGS }) {
  const out = [];
  for (const m of missingCovers(rows)) {
    out.push({ level: 'warn', text: `${m.row.label}: ${m.name} leaves L-${m.when} but nobody covers the room (C-${/^\D+\s\d+$/.test(m.row.label) ? 'OT' + roomNum(m.row.label) : m.row.label}).` });
  }
  const sub = subspecByKey(settings);
  const roomById = Object.fromEntries(day.rooms.map(r => [r.id, r]));
  const where = {}; // person id -> [{row, col}]
  const resolve = (text, col, row) => namesInCell(text).map(n => {
    const m = matchName(n, staff);
    if (m.ambiguous) out.push({ level: 'warn', text: `${row.label}: "${n}" could be ${m.ambiguous.map(p => p.name).join(' or ')}.` });
    else if (!m.person) out.push({ level: 'warn', text: `${row.label}: "${n}" is not in the staff list.` });
    else (where[m.person.id] ||= []).push({ row, col });
    return m.person;
  }).filter(Boolean);

  const seniorsOf = {}, juniorsOf = {};
  for (const row of rows) {
    seniorsOf[row.roomId] = resolve(row.senior, 'senior', row);
    juniorsOf[row.roomId] = resolve(row.junior, 'junior', row);
    resolve(String(row.premed || '').replace(/-\s*premed/i, ''), 'premed', row);
  }
  for (const [id, uses] of Object.entries(where)) {
    const p = staff.find(s => s.id === id);
    const d = dayOf(day, p);
    const st = d.status || 'avail';
    if (st === 'leave' || st === 'postcall') {
      out.push({ level: 'error', text: `${p.name} is ${st === 'leave' ? 'on leave' : 'post call'} but rostered in ${[...new Set(uses.map(u => u.row.label))].join(', ')}.` });
    }
    const asJunior = uses.filter(u => u.col === 'junior');
    if (asJunior.length > 1) out.push({ level: 'warn', text: `${p.name} is the junior in ${asJunior.map(u => u.row.label).join(' and ')}.` });
    const asSenior = uses.filter(u => u.col === 'senior');
    if (asSenior.length > 1) {
      const complexes = new Set(asSenior.map(u => u.row.complex));
      if (complexes.size > 1) out.push({ level: 'warn', text: `${p.name} covers rooms in different complexes (${asSenior.map(u => u.row.label).join(', ')}).` });
    }
    const asPremed = uses.filter(u => u.col === 'premed');
    if (asPremed.length > settings.premedCap) out.push({ level: 'warn', text: `${p.name} has premeds for ${asPremed.length} rooms (cap ${settings.premedCap}).` });
  }
  for (const row of rows) {
    const room = roomById[row.roomId];
    if (!room) continue;
    const flags = { subspecs: [], ...(room.flags || {}) };
    const sen = seniorsOf[row.roomId], jun = juniorsOf[row.roomId];
    if (!isPacu(row.label) && !String(row.senior || '').trim()) out.push({ level: 'error', text: `${row.label}: no senior.` });
    for (const k of flags.subspecs) {
      if (!sub[k]?.hard) continue;
      if (sen.length && !sen.some(p => (p.subspecs || []).includes(k))) {
        out.push({ level: 'error', text: `${row.label}: ${sub[k].label} list but ${sen.map(p => p.name).join(' / ')} has no ${sub[k].label} subspec.` });
      }
    }
    for (const p of sen) {
      if ((p.avoid || []).some(a => flags.subspecs.includes(a) || hasKeyword(row.notes, a))) {
        out.push({ level: 'error', text: `${row.label}: ${p.name} doesn't do this list.` });
      }
      if (dayOf(day, p).liverStandby && (flags.complex || flags.subspecs.some(k => sub[k]?.hard))) {
        out.push({ level: 'warn', text: `${row.label}: ${p.name} is liver standby but has a complex/subspec list.` });
      }
    }
    const shared = sen.some(p => (where[p.id] || []).filter(u => u.col === 'senior').length > 1);
    if (shared && jun.some(isBaby)) {
      out.push({ level: 'error', text: `${row.label}: Baby MO in a room whose senior is double covering.` });
    }
    if (shared && flags.complex) out.push({ level: 'warn', text: `${row.label}: complex list but senior is double covering.` });
    const needPremed = jun.some(p => dayOf(day, p).notAroundPrev) && !jun.some(p => !dayOf(day, p).notAroundPrev && !isBaby(p));
    if (needPremed && !String(row.premed || '').trim()) out.push({ level: 'warn', text: `${row.label}: junior wasn't around yesterday — needs premed cover.` });
  }
  return out;
}

// ---------- learning from past rosters ----------

const ROOM_RE = /^\s*((KROR|MCOR|MOR)\s*\d+)/i;

// rows: [{label, senior, junior, premed, notes}] from one roster file.
export function learnFromRosters(rosterRows, staff, settings = DEFAULT_SETTINGS) {
  const people = staff.map(p => ({ ...p, aliases: [...(p.aliases || [])], history: { ...(p.history || {}) } }));
  const rooms = [];
  let nextId = 1 + people.reduce((m, p) => Math.max(m, parseInt(String(p.id).replace(/\D/g, ''), 10) || 0), 0);
  const counts = {}; // id -> {senior, junior}
  const postingSeen = {};

  const add = (raw, col, notes, label) => {
    for (const n of namesInCell(raw)) {
      if (n.length < 3) continue;
      const m = matchName(n, people);
      let p = m.person;
      if (m.ambiguous) continue;
      if (!p) {
        // a short form ("Leong SM") is only useful once we know the full name
        if (tokens(n).length < 2 || tokens(n).some(t => t.length <= 2)) continue;
        p = { id: 'p' + nextId++, source: 'roster', name: n, aliases: [], role: col, grade: col === 'senior' ? 'Consultant' : 'Resident', posting: '', subspecs: [], avoid: [], history: {} };
        people.push(p);
      } else if (norm(n) !== norm(p.name) && !p.aliases.some(a => norm(a) === norm(n))) {
        if (tokens(n).length > tokens(p.name).length) { p.aliases.push(p.name); p.name = n; } else p.aliases.push(n);
      }
      const c = (counts[p.id] ||= { senior: 0, junior: 0 });
      c[col]++;
      if (col === 'senior') for (const k of suggestFlags(notes, settings, label).subspecs) p.history[k] = (p.history[k] || 0) + 1;
    }
    if (col === 'junior') {
      for (const part of String(raw).split('/')) {
        const tag = part.match(/\((RA|P|L|SR|Neu|Amb|LivOT)\)/)?.[1];
        const nm = namesInCell(part)[0];
        if (!tag || !nm) continue;
        const p = matchName(nm, people).person;
        if (p) postingSeen[p.id] = tag === 'LivOT' ? 'L' : tag;
      }
    }
  };

  for (const r of rosterRows) {
    const m = String(r.label).match(ROOM_RE);
    const remote = remoteRoom(r.label);
    const isRemote = !!remote;
    if (!m && !isRemote) continue;
    const name = isRemote ? remote : m[1].toUpperCase().replace(/\s+/, ' ');
    if (!rooms.some(x => x.name === name)) rooms.push({ complex: isRemote ? 'Other' : m[2].toUpperCase(), name });
    add(r.senior, 'senior', r.notes || '', name);
    add(r.junior, 'junior', r.notes || '', name);
  }
  for (const p of people) {
    const c = counts[p.id];
    if (c && !staff.some(s => s.id === p.id)) p.role = c.senior >= c.junior ? 'senior' : 'junior';
    if (p.role === 'senior' && SENIOR_GRADES.indexOf(p.grade) < 0) p.grade = 'Consultant';
    if (p.role === 'junior' && JUNIOR_GRADES.indexOf(p.grade) < 0) p.grade = 'Resident';
    if (postingSeen[p.id] && !p.posting) p.posting = postingSeen[p.id];
  }
  const order = { Other: 0, KROR: 1, MCOR: 2, MOR: 3 };
  rooms.sort((a, b) => (order[a.complex] - order[b.complex]) || (roomNum(a.name) - roomNum(b.name)));
  return { staff: people, rooms };
}

// Tick each senior's subspecs from the lists they were seen doing in past rosters.
// Only adds ticks; returns how many were added.
export function tickFromHistory(staff, minCount = 1) {
  let added = 0;
  for (const p of staff) {
    if (p.role !== 'senior') continue;
    for (const [k, n] of Object.entries(p.history || {})) {
      if (n >= minCount && !(p.subspecs || []).includes(k)) { (p.subspecs ||= []).push(k); added++; }
    }
  }
  return added;
}

// ---------- merging a contact list ----------

// Match a contact-list name ("Sophia Ang Bee Leng") to a staff entry ("Sophia Ang") either way round.
export function findSameStaff(name, staff) {
  const m = matchName(name, staff);
  if (m.person) return m.person;
  const squash = n => tokens(n).join('');
  const hits = staff.filter(p => [p.name, ...(p.aliases || [])].some(f => matchName(f, [{ id: 'x', name }]).person
    || squash(f) === squash(name)));
  return hits.length === 1 ? hits[0] : null;
}

// Fold contact-list people into the staff list. Matched people get the list's subspecs added,
// and its grade only if their role hasn't changed since (rosters are newer than the list).
// New seniors are added; new juniors are not, since junior postings rotate.
export function mergeContacts(staff, people, newId) {
  const out = staff.map(p => ({ ...p, subspecs: [...(p.subspecs || [])] }));
  const skipped = [];
  for (const c of people) {
    const p = findSameStaff(c.name, out);
    if (p) {
      p.inContactList = true;
      if (p.source === 'import') { p.role = c.role; p.grade = c.grade; p.name = c.name; }
      else if (p.role === c.role && p.grade !== c.grade) p.grade = c.grade;
      for (const k of c.subspecs) if (!p.subspecs.includes(k)) p.subspecs.push(k);
    } else if (c.role === 'senior') {
      out.push({ id: newId(), source: 'contact', name: c.name, aliases: [], role: c.role, grade: c.grade, posting: '', subspecs: c.subspecs, avoid: [], history: {} });
    } else skipped.push(c.name);
  }
  // people added by an earlier import of this list who aren't anaesthetists (admin, nursing…)
  const stale = out.filter(p => p.source === 'import' && !p.inContactList);
  const kept = out.filter(p => !(p.source === 'import' && !p.inContactList));
  kept.forEach(p => { delete p.inContactList; });
  return { staff: kept, skipped, removed: stale.map(p => p.name) };
}

// ---------- short names ----------

// Common surnames in the department's names; used to tell "Tan Yi Wei" (surname first)
// from "Swapna Thampi" (given name first).
const SURNAMES = new Set(`tan lim lee ng ong wong goh chua chan koh teo ang yeo tay ho low toh sim chong chia seah foo
  leong loh poh neo lau yap chew phua peng chen huang zhang liu wang li hwang tham tiong khoo quek oon chern cheah eu ti
  kang boey bao cui shen wo go chionh lui er oo hong lam chang zhao zhou wu xu sun ma hu guo he lin luo song tang han
  feng deng cao xie yang liang chiew chng gan heng hoe kek kwek lai lau leow lew liew lo mok pang pek seet soh tee teh
  thong wee yong yeoh yeow yip yu zheng choo fung kwan ling mah ow siew tung woo aw lum
  foong ngiam sng ting loke au kwok kok hoo hsu chiam chin chee choy eng fong kee khor kong ku lek loo lye mak neoh ooi
  pua see sia sin siow soo tai tey tng tsang wan yee yin yoong yuen quah thio tian`.split(/\s+/).filter(Boolean));

// The way names are written on the leave and post call lists:
// "Tan Yi Wei" -> "Tan YW", "Chan Jiaxin" -> "Jiaxin", "Swapna Thampi" -> "Swapna", "Eric Lee Shih Hsiung" -> "Eric".
export function suggestShortName(name) {
  let t = String(name).replace(/\(.*?\)/g, ' ').replace(/[^A-Za-z\-' ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  while (t.length > 1 && t[0].length === 1) t = t.slice(1); // "S. Surentheran"
  if (t.length < 2) return t[0] || '';
  const isSurname = w => SURNAMES.has(w.toLowerCase());
  if (isSurname(t[0])) {
    const given = t.slice(1).flatMap(w => w.split('-')).filter(Boolean);
    if (given.length === 1) return given[0].length <= 4 ? t.join(' ') : given[0]; // "Ng Peng" stays as is
    return `${t[0]} ${given.map(w => w[0].toUpperCase()).join('')}`;
  }
  return t[0];
}

// Suggest a short name for everyone who has none, skipping any that would clash with
// another person's name or short name. Returns [{ id, name, short }].
export function suggestShortNames(staff) {
  const key = s => String(s).toLowerCase().trim();
  const taken = new Map(); // form -> person id
  for (const p of staff) for (const f of [p.name, ...(p.aliases || [])]) taken.set(key(f), taken.has(key(f)) ? null : p.id);
  const proposals = staff.filter(p => !(p.aliases || []).length && p.name).map(p => ({ id: p.id, name: p.name, short: suggestShortName(p.name) }));
  const count = {};
  for (const x of proposals) count[key(x.short)] = (count[key(x.short)] || 0) + 1;
  return proposals.filter(x => x.short && key(x.short) !== key(x.name) && count[key(x.short)] === 1
    && (!taken.has(key(x.short)) || taken.get(key(x.short)) === x.id));
}
