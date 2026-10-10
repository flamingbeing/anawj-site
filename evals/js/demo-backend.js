// In-browser stand-in for the Firebase backend, used when the page URL has ?demo.
// Same functions and signatures as cloud.js, backed by one shared localStorage store (or memory
// when localStorage is unavailable, e.g. in node tests or a private window). Never imports Firebase.
// All people and answers here are made up.
//   ?demo           signed in as the resident "Demo Resident" (resident@example.com)
//   ?demo=assessor  signed in as "Dr Demo Faculty" (faculty@example.com)
//   ?demo=admin     signed in as "Demo Admin", an admin and PD (admin@example.com)
//   ?demo=reset     wipe the store and seed again (as the resident)
// Each tab has its own role, the store is shared: send a request as the resident in one tab and it
// shows up in the assessor's tab (storage event).
//
// The field whitelists and clean*() helpers below are shared with cloud.js so both backends store
// the same shapes (and cloud writes never trip the field checks in firestore.rules). The demo also
// applies a simplified copy of the rules, so it fails where the real thing would.

const KEY = 'apmes-evals-demo-v1';
export const DEMO_USERS = {
  resident: { email: 'resident@example.com', name: 'Demo Resident', uid: 'demo-resident' },
  assessor: { email: 'faculty@example.com', name: 'Dr Demo Faculty', uid: 'demo-faculty' },
  admin: { email: 'admin@example.com', name: 'Demo Admin', uid: 'demo-admin' },
};
export const EMAIL_LINK = false;

// ---- shared field whitelists ----

export const EVAL_FIELDS = ['id', 'rid', 'residentEmail', 'residentName', 'assessorEmail', 'assessorName',
  'formId', 'formVersion', 'epa', 'date', 'source', 'status', 'request', 'assessment', 'caseId',
  'createdAt', 'updatedAt', 'requestedAt', 'submittedAt',
  'itemId', 'itemText', 'tool', 'level', 'caseKey', 'catalogueVersion',
  'declineReason', 'declinedAt', 'seenAt', 'chasedAt', 'metrics'];
// fields a patch may remove by passing null (Firestore deleteField)
export const REMOVABLE = ['assessment', 'metrics', 'declineReason', 'declinedAt', 'submittedAt', 'seenAt', 'chasedAt'];
const RESIDENT_FIELDS = ['rid', 'name', 'email', 'status', 'intake', 'rYear'];
const FACULTY_FIELDS = ['email', 'name', 'status', 'updatedAt'];
const APPLICATION_FIELDS = ['uid', 'email', 'name', 'role', 'note', 'status', 'createdAt', 'decidedAt', 'decidedBy'];
export const RESIDENT_STATUSES = ['ACTIVE', 'ON LEAVE', 'GRADUATED', 'ATTRITED'];
export const STATUSES = ['draft', 'requested', 'submitted', 'declined', 'cancelled'];

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
// Firestore rejects undefined values; a JSON round trip drops them (and deep-copies).
export const plain = o => JSON.parse(JSON.stringify(o));
export const lc = e => String(e || '').trim().toLowerCase();
const str = (v, max) => (v == null ? v : String(v).slice(0, max));

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function newEvaluationId(n = 20) {
  const bytes = new Uint8Array(n);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, b => ID_CHARS[b % 36]).join('');
}

// A whole new evaluation, as the resident sends it.
export function cleanEval(ev, now = Date.now()) {
  const out = pick(ev, EVAL_FIELDS);
  out.id = out.id ? String(out.id) : newEvaluationId();
  out.rid = String(out.rid ?? '');
  out.residentEmail = lc(out.residentEmail);
  out.assessorEmail = lc(out.assessorEmail);
  out.source = 'evals';
  out.status = out.status || 'requested';
  out.date = out.date || null;
  for (const [k, max] of [['residentName', 200], ['assessorName', 200], ['itemText', 600], ['caseKey', 100], ['itemId', 60], ['formId', 60]]) {
    if (out[k] != null) out[k] = str(out[k], max);
  }
  if (out.epa != null) out.epa = String(out.epa);
  out.createdAt = Number(out.createdAt) || now;
  out.updatedAt = now;
  if (out.status === 'requested' && !out.requestedAt) out.requestedAt = now;
  return plain(out);
}

// A patch for updateEvaluation: whitelisted, emails lower case. Returns { set, remove }: null values
// of REMOVABLE fields become removals. The id, source and createdAt never change.
export function cleanPatch(patch, now = Date.now()) {
  const p = pick(patch || {}, EVAL_FIELDS.filter(k => !['id', 'source', 'createdAt'].includes(k)));
  const remove = [];
  for (const k of REMOVABLE) if (k in p && p[k] === null) { remove.push(k); delete p[k]; }
  if (p.assessorEmail != null) p.assessorEmail = lc(p.assessorEmail);
  if (p.residentEmail != null) p.residentEmail = lc(p.residentEmail);
  p.updatedAt = now;
  return { set: plain(p), remove };
}

// Stamps the times a transition needs (submit, decline, (re)send) unless the caller set them, and
// clears the old assessor's partial answers when a declined request goes to someone new.
export function stampPatch(cur, patch, now = Date.now()) {
  const p = { ...patch };
  const from = cur ? cur.status : null;
  if (p.status === 'submitted' && from !== 'submitted' && p.submittedAt == null) p.submittedAt = now;
  if (p.status === 'declined' && from !== 'declined' && p.declinedAt == null) p.declinedAt = now;
  if (p.status === 'requested' && (from === 'draft' || from === 'declined') && p.requestedAt == null) p.requestedAt = now;
  if (from === 'declined' && p.status === 'requested' && p.assessorEmail && lc(p.assessorEmail) !== cur.assessorEmail) {
    if (!('assessment' in p)) p.assessment = null;
    if (!('metrics' in p)) p.metrics = null;
  }
  return p;
}

export function cleanResident(r) {
  const out = pick(r, RESIDENT_FIELDS);
  out.rid = String(out.rid);
  out.name = String(out.name ?? '').slice(0, 200);
  out.email = lc(out.email);
  out.status = out.status || 'ACTIVE';
  out.intake = out.intake == null || out.intake === '' ? null : Number(out.intake);
  out.rYear = out.rYear == null || out.rYear === '' ? null : Number(out.rYear);
  return plain(out);
}

export function cleanFaculty(f, now = Date.now()) {
  const out = pick(f, FACULTY_FIELDS);
  out.email = lc(out.email);
  out.name = String(out.name ?? '').slice(0, 200);
  out.status = out.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  out.updatedAt = now;
  return plain(out);
}

export function cleanApplication(a, now = Date.now()) {
  const out = pick(a, APPLICATION_FIELDS);
  out.uid = String(out.uid);
  out.email = lc(out.email);
  out.name = String(out.name ?? '').slice(0, 200);
  out.note = String(out.note ?? '').slice(0, 1000);
  out.role = out.role === 'faculty' ? 'faculty' : 'resident';
  out.status = out.status || 'pending';
  out.createdAt = Number(out.createdAt) || now;
  return plain(out);
}

// rid for a resident added from an application when the admin gives none
export const newRid = () => 'EV' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();

const byNewest = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || String(a.id).localeCompare(String(b.id));

// ---- storage ----

let memory = null;            // fallback when localStorage is missing or throws
function storage() {
  try { if (typeof localStorage !== 'undefined') { localStorage.getItem(KEY); return localStorage; } } catch { /* blocked */ }
  return null;
}
function blank() {
  return { admins: { [DEMO_USERS.admin.email]: { name: DEMO_USERS.admin.name } }, pds: { [DEMO_USERS.admin.email]: { name: DEMO_USERS.admin.name } },
    residents: {}, faculty: {}, applications: {}, evaluations: {} };
}
function load() {
  const ls = storage();
  if (ls) {
    try { const s = JSON.parse(ls.getItem(KEY) || 'null'); if (s) return s; } catch { /* corrupt: start again */ }
  } else if (memory) return memory;
  const s = blank();
  seed(s);
  save(s);
  return s;
}
function save(s) {
  const ls = storage();
  if (ls) { try { ls.setItem(KEY, JSON.stringify(s)); return; } catch (e) { console.warn('Demo store not saved', e); } }
  memory = s;
}

function param() {
  try { return typeof location !== 'undefined' ? new URLSearchParams(location.search).get('demo') : null; } catch { return null; }
}
const ROLE_ALIASES = { '': 'resident', resident: 'resident', reset: 'resident', assessor: 'assessor', faculty: 'assessor', admin: 'admin', pd: 'admin' };
let roleNow = ROLE_ALIASES[param() ?? ''] || 'resident';
let signedOut = false;        // per tab

export const demoRole = () => roleNow;
const currentUser = () => (signedOut ? null : { ...DEMO_USERS[roleNow] });

// Switch this tab to another demo identity (More → Switch demo role). Keeps the URL in step.
export function setDemoRole(role) {
  roleNow = ROLE_ALIASES[role] || 'resident';
  signedOut = false;
  try {
    if (typeof location !== 'undefined' && typeof history !== 'undefined') {
      const q = new URLSearchParams(location.search);
      q.delete('demo');
      const rest = q.toString();
      history.replaceState(null, '', location.pathname + '?demo' + (roleNow === 'resident' ? '' : '=' + roleNow) + (rest ? '&' + rest : '') + location.hash);
    }
  } catch { /* not a browser */ }
  for (const cb of userWatchers) cb(currentUser());
}

// Wipe the store and seed again (tests, and ?demo=reset on page load).
export function resetDemo({ seeded = true } = {}) {
  memory = null;
  const ls = storage();
  if (ls) { try { ls.removeItem(KEY); } catch { /* ignore */ } }
  const s = blank();
  if (seeded) seed(s);
  save(s);
  notifyEvals();
}

// ---- seed: made-up people and evaluations ----

const DOPS_GUIDANCE = 'Passive Help (Supervisor assists and follows the lead of the resident)';
function dopsAnswers(o = {}) {
  return { q1: 'Moderate', q2: DOPS_GUIDANCE, q3: 6, q4: 7, q5: 6, q6: 6, q7: 7, q8: 6, q9: 5, q10: 7, q11: 6, q12: 6, q13: 'NA', q14: 6,
    q15: 'Discussed airway plan B if the LMA failed, and when to call for help. Resident talked through the difficult airway trolley.',
    q16: 4, q17: 'Good preparation and calm technique. Next time check the cuff pressure after insertion.', q18: 'Yes', q19: 'Yes', ...o };
}
function minicexAnswers(o = {}) {
  return { q1: 'Preop Clinic', q2: 'Moderate', q3: 7, q4: 6, q5: 6, q6: 7, q7: 6, q8: 6, q9: 7, q10: 6, q11: 7, q12: 7,
    q13: 'Talked through risk stratification for a patient with stable angina and when to involve cardiology before elective surgery.',
    q14: 3.0, q15: 3.0, q16: 2.5, q17: 'NA', q18: 3,
    q19: 'Thorough history and clear explanation to the patient. Work on a more structured summary of the plan.', q20: 'Yes', q21: 'Yes', q22: '', ...o };
}
function ebdAnswers(o = {}) {
  return { q1: 'High', q2: ['Clinical management plan'], q3: 'Plan for post-op ventilation could have been considered earlier.',
    q4: 'Discussed optimisation of COPD before surgery, including bronchodilators and the timing of steroid cover.',
    q5: 3.5, q6: 3.0, q7: 3.0, q8: 'NA', q9: 3,
    q10: 'Sound knowledge of respiratory physiology. Be more explicit about the threshold for post-op HDU.', q11: 'Yes', q12: 'Maybe', ...o };
}

function seed(s) {
  const now = Date.now();
  const H = 3600e3, D = 24 * H;
  const iso = t => new Date(t + 8 * H).toISOString().slice(0, 10);   // Singapore date
  const yr = new Date(now).getUTCFullYear();
  const R = [
    ['DEMO01', 'Demo Resident', DEMO_USERS.resident.email, 2],
    ['DEMO02', 'Aiden Tan', 'aiden.tan@example.com', 1],
    ['DEMO03', 'Bea Lim', 'bea.lim@example.com', 1],
    ['DEMO04', 'Chandra Rao', 'chandra.rao@example.com', 2],
    ['DEMO05', 'Dina Hassan', 'dina.hassan@example.com', 3],
    ['DEMO06', 'Evan Koh', 'evan.koh@example.com', 3],
    ['DEMO07', 'Farah Ng', 'farah.ng@example.com', 4],
    ['DEMO08', 'Gabriel Wong', 'gabriel.wong@example.com', 5, 'ON LEAVE'],
  ];
  for (const [rid, name, email, rYear, status] of R) {
    s.residents[rid] = { rid, name, email, status: status || 'ACTIVE', intake: yr - rYear + (new Date(now).getUTCMonth() >= 6 ? 1 : 0), rYear };
  }
  const F = [
    [DEMO_USERS.assessor.email, 'Dr Demo Faculty'],
    ['dr.hana.lee@example.com', 'Dr Hana Lee'],
    ['dr.ivan.chua@example.com', 'Dr Ivan Chua'],
    ['dr.julia.menon@example.com', 'Dr Julia Menon'],
    ['dr.kumar.siva@example.com', 'Dr Kumar Siva'],
    ['dr.lena.ho@example.com', 'Dr Lena Ho', 'INACTIVE'],
  ];
  for (const [email, name, status] of F) s.faculty[email] = { email, name, status: status || 'ACTIVE', updatedAt: now - 30 * D };
  s.applications['demo-app-1'] = { uid: 'demo-app-1', email: 'dr.maya.goh@example.com', name: 'Dr Maya Goh', role: 'faculty', note: 'New consultant, joined this month', status: 'pending', createdAt: now - 2 * D };
  s.applications['demo-app-2'] = { uid: 'demo-app-2', email: 'noah.teo@example.com', name: 'Noah Teo', role: 'resident', note: 'R1, July intake', status: 'pending', createdAt: now - 1 * D };
  s.applications['demo-app-3'] = { uid: 'demo-app-3', email: 'someone@example.com', name: 'Test Account', role: 'faculty', note: '', status: 'rejected', createdAt: now - 9 * D, decidedAt: now - 8 * D, decidedBy: DEMO_USERS.admin.email };

  const res = rid => s.residents[rid];
  const fac = email => s.faculty[email];
  const ME = DEMO_USERS.assessor.email;
  const items = {
    'DOPS-2-02': ['DOPS', 'dops', '2', null, 'Successful LMA insertion'],
    'DOPS-2-03': ['DOPS', 'dops', '2', null, 'Successful endotracheal intubation'],
    'DOPS-3-01': ['DOPS', 'dops', '3', null, 'Subarachnoid block'],
    'DOPS-6-01': ['DOPS', 'dops', '6', null, 'Intra-arterial (IA) line'],
    'MINICEX-1-01': ['MiniCEX', 'minicex', '1', 3, 'Preoperative assessment of a patient in the hospital setting e.g., preoperative clinic/ pre-anaesthetic evaluation clinic (PEC), ward'],
    'MINICEX-2-01': ['MiniCEX', 'minicex', '2', 3, 'Patient requiring GA with endotracheal tube (inclusive of entrustment discussion)'],
    'EBD-1-01': ['EBD', 'ebd', '1', 3, 'Assessment of a patient with pre-existing respiratory disease'],
    'EBD-1-02': ['EBD', 'ebd', '1', 3, 'Assessment of a patient with pre-existing cardiovascular disease'],
    'EBD-2-01': ['EBD', 'ebd', '2', 3, 'Management of cardiovascular related anaesthetic crisis during general anaesthesia'],
    'EBD-3-02': ['EBD', 'ebd', '3', 3, 'Management of a patient undergoing surgery under subarachnoid block'],
  };
  let k = 0;
  const add = (rid, assessorEmail, itemId, ago, status, o = {}) => {
    const [tool, formId, epa, level, itemText] = items[itemId];
    const r = res(rid), f = fac(assessorEmail);
    const t = now - ago;
    const initials = ['AB', 'CK', 'DL', 'EM', 'FN', 'GP', 'HQ', 'JR', 'KS', 'LT', 'MW', 'NY', 'PZ'][k % 13];
    const date = iso(t);
    const id = 'demo-ev-' + String(++k).padStart(2, '0');
    const request = { date, location: formId === 'minicex' ? 'Preop Clinic' : 'Operating theatre', initials, ageBand: ['20-29', '40-49', '60-69', '70-79'][k % 4], gender: k % 2 ? 'F' : 'M' };
    if (formId === 'ebd') request.coManaged = true;
    const ev = { id, rid, residentEmail: r.email, residentName: r.name, assessorEmail, assessorName: f.name,
      formId, formVersion: 1, catalogueVersion: '2024-07-v8', itemId, itemText, tool, epa, level, caseKey: date + '|' + initials,
      date, source: 'evals', status, request, createdAt: t, updatedAt: t };
    if (status !== 'draft') ev.requestedAt = t;
    Object.assign(ev, o);
    if (ev.status === 'submitted' && !ev.submittedAt) ev.submittedAt = t + 5 * H;
    if (ev.submittedAt) ev.updatedAt = ev.submittedAt;
    if (ev.declinedAt) ev.updatedAt = ev.declinedAt;
    s.evaluations[id] = ev;
  };
  const sub = (answers, o = {}) => ({ assessment: answers, metrics: { openedAt: 1, firstAnswerAt: 2, submitAttempts: 1 }, ...o });

  // the demo resident: something in every state
  add('DEMO01', ME, 'DOPS-2-02', 3 * H, 'requested');
  add('DEMO01', ME, 'MINICEX-1-01', 26 * H, 'requested', { assessment: { q1: 'Preop Clinic', q2: 'Moderate', q3: 7 }, metrics: { openedAt: now - 20 * H, firstAnswerAt: now - 20 * H } });
  add('DEMO01', 'dr.hana.lee@example.com', 'EBD-1-01', 6 * D, 'submitted', sub(ebdAnswers()));
  add('DEMO01', ME, 'DOPS-2-03', 12 * D, 'submitted', sub(dopsAnswers({ q14: 7, q16: 4 }), { seenAt: now - 11 * D }));
  add('DEMO01', 'dr.ivan.chua@example.com', 'MINICEX-2-01', 20 * D, 'submitted', sub(minicexAnswers({ q1: 'Operating theatre', q18: 4 }), { seenAt: now - 19 * D }));
  add('DEMO01', 'dr.julia.menon@example.com', 'EBD-2-01', 2 * D, 'declined', { declineReason: { code: 'not-co-managed', text: '' }, declinedAt: now - 1 * D });
  add('DEMO01', 'dr.kumar.siva@example.com', 'DOPS-3-01', 1 * H, 'draft');
  add('DEMO01', 'dr.hana.lee@example.com', 'DOPS-6-01', 15 * D, 'cancelled');
  // other residents: Dr Demo Faculty's pending list and history, and the cohort for the PD
  add('DEMO02', ME, 'EBD-1-02', 30 * H, 'requested');
  add('DEMO04', ME, 'DOPS-2-03', 4 * D, 'submitted', sub(dopsAnswers({ q2: 'Hands-off', q9: 7, q14: 7, q16: 5 })));
  add('DEMO05', ME, 'EBD-3-02', 9 * D, 'submitted', sub(ebdAnswers({ q2: ['No obvious areas for improvement'], q3: '', q9: 4 })));
  add('DEMO03', 'dr.julia.menon@example.com', 'MINICEX-1-01', 5 * D, 'submitted', sub(minicexAnswers({ q12: 5, q18: 2 })));
  add('DEMO06', 'dr.ivan.chua@example.com', 'DOPS-3-01', 50 * H, 'requested');
  add('DEMO07', 'dr.kumar.siva@example.com', 'EBD-2-01', 3 * D, 'declined', { declineReason: { code: 'other', text: 'On leave that week' }, declinedAt: now - 2 * D });
}

// ---- change notification (same tab and other tabs) ----

const userWatchers = new Set();
const evalWatchers = new Set();   // { filter, cb }
const meta = { fromCache: false, hasPendingWrites: false };

function notifyEvals() {
  const all = Object.values(load().evaluations);
  for (const w of evalWatchers) w.cb(all.filter(w.filter).map(plain).sort(byNewest), meta);
}
if (param() === 'reset') {
  resetDemo();
  // drop "=reset" so a later reload (e.g. the update banner) does not wipe the store again
  try { if (typeof history !== 'undefined') history.replaceState(null, '', location.pathname + '?demo' + location.hash); } catch { /* not a browser */ }
}
if (typeof addEventListener === 'function') {
  addEventListener('storage', e => { if (e.key === KEY || e.key === null) notifyEvals(); });
}

// ---- simplified rules (mirrors firestore.rules) ----

function denied(why) {
  const e = new Error('Missing or insufficient permissions (demo: ' + why + ')');
  e.code = 'permission-denied';
  return e;
}
const me = () => { const u = currentUser(); if (!u) throw denied('signed out'); return u.email; };
const isAdmin = s => !!s.admins[me()];
const isPD = s => !!s.pds[me()];
const activeFaculty = (s, e) => s.faculty[e] && s.faculty[e].status === 'ACTIVE';
const changed = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
const only = (keys, allowed) => keys.every(k => allowed.includes(k));

function validEval(d) {
  if (!d.rid || !d.residentEmail || !d.assessorEmail) return 'missing rid or emails';
  if (d.assessorEmail === d.residentEmail) return 'cannot assess yourself';
  if (!STATUSES.includes(d.status)) return 'bad status';
  if (d.source !== 'evals') return 'bad source';
  if (d.tool != null && !['DOPS', 'MiniCEX', 'EBD'].includes(d.tool)) return 'bad tool';
  if (d.declineReason != null && !(d.declineReason.code && typeof d.declineReason.code === 'string')) return 'decline reason needs a code';
  return null;
}

function checkUpdate(s, cur, next) {
  const bad = validEval(next);
  if (bad) throw denied(bad);
  const e = me();
  const keys = changed(cur, next);
  if (cur.residentEmail === e) {
    if (['draft', 'requested'].includes(cur.status) && ['draft', 'requested', 'cancelled'].includes(next.status)
      && only(keys, ['request', 'status', 'assessorEmail', 'assessorName', 'formId', 'formVersion', 'epa', 'date', 'caseId', 'updatedAt', 'requestedAt',
        'itemId', 'itemText', 'tool', 'level', 'caseKey', 'catalogueVersion', 'chasedAt'])
      && (!cur.assessment || !Object.keys(cur.assessment).length
        || (!keys.some(k => ['assessorEmail', 'formId', 'itemId', 'tool'].includes(k)) && next.status !== 'draft'))
      && (next.assessorEmail === cur.assessorEmail || activeFaculty(s, next.assessorEmail))) return;
    if (cur.status === 'declined' && next.status === 'requested'
      && only(keys, ['status', 'assessorEmail', 'assessorName', 'updatedAt', 'requestedAt', 'assessment', 'metrics', 'chasedAt', 'request', 'date'])
      && !('assessment' in next) && !('metrics' in next)
      && next.assessorEmail !== cur.assessorEmail && activeFaculty(s, next.assessorEmail)) return;
    if (cur.status === 'declined' && next.status === 'cancelled' && only(keys, ['status', 'updatedAt'])) return;
    if (cur.status === 'submitted' && only(keys, ['seenAt', 'updatedAt'])) return;
  }
  if (cur.assessorEmail === e) {
    // not in the future (5 min slack) and not over 30 days old: a submit may sync hours later
    const near = t => typeof t === 'number' && t <= Date.now() + 300e3 && t >= Date.now() - 30 * 864e5;
    if (cur.status === 'requested') {
      if (next.status === 'requested' && only(keys, ['assessment', 'metrics', 'assessorName', 'updatedAt'])) return;
      if (next.status === 'submitted' && only(keys, ['assessment', 'metrics', 'assessorName', 'updatedAt', 'status', 'submittedAt']) && near(next.submittedAt)) return;
      if (next.status === 'declined' && only(keys, ['assessment', 'metrics', 'assessorName', 'updatedAt', 'status', 'declineReason', 'declinedAt'])
        && !('assessment' in next) && !('metrics' in next)
        && next.declineReason && near(next.declinedAt)) return;
    }
    if (cur.status === 'submitted' && typeof cur.submittedAt === 'number' && Date.now() < cur.submittedAt + 900e3
      && only(keys, ['assessment', 'updatedAt'])) return;
  }
  if (isAdmin(s)) return;
  throw denied('this change is not allowed');
}

// ---- the cloud.js API ----

export const demo = true;
export const enabled = true;

export async function watchUser(cb) {
  userWatchers.add(cb);
  cb(currentUser());
}
export async function signIn() { signedOut = false; for (const cb of userWatchers) cb(currentUser()); }
export async function signOut() { signedOut = true; for (const cb of userWatchers) cb(currentUser()); }

export function onSyncError(cb) { return () => {}; }   // the demo never syncs

export async function getRoles(email) {
  email = lc(email);
  const s = load();
  const u = currentUser();
  const resident = Object.values(s.residents).filter(r => r.email === email)
    .sort((a, b) => (b.status === 'ACTIVE') - (a.status === 'ACTIVE'))[0] || null;
  const application = u ? Object.values(s.applications).find(a => a.uid === u.uid) || null : null;
  return plain({ admin: !!s.admins[email], pd: !!s.pds[email], resident, faculty: s.faculty[email] || null, application });
}

export async function listFaculty() {
  const s = load(), e = me();
  if (!(s.admins[e] || s.pds[e] || s.faculty[e] || Object.values(s.residents).some(r => r.email === e))) throw denied('residents, faculty, PDs and admins only');
  return Object.values(load().faculty).map(plain).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
export async function saveFaculty(f) {
  const s = load();
  if (!isAdmin(s) && !isPD(s)) throw denied('admins and PDs only');
  const d = cleanFaculty(f);
  if (!d.email.includes('@')) throw new Error('email missing');
  s.faculty[d.email] = d; save(s); return plain(d);
}

export async function listResidents() {
  const s = load();
  if (!isAdmin(s) && !isPD(s)) throw denied('admins and PDs only');
  return Object.values(s.residents).map(plain).sort((a, b) => String(a.rid).localeCompare(String(b.rid)));
}
export async function saveResident(r) {
  const s = load();
  if (!isAdmin(s) && !isPD(s)) throw denied('admins and PDs only');
  const d = cleanResident(r);
  // the same checks as firestore.rules validResident, so the demo fails where the real thing would
  if (!RESIDENT_STATUSES.includes(d.status)) throw new Error(`status “${d.status}” is not one of ${RESIDENT_STATUSES.join(', ')}`);
  if (!d.email || !d.rid || d.rid === 'undefined') throw new Error('rid or email missing');
  const old = s.residents[d.rid];
  if (old && !isAdmin(s) && old.email !== d.email) throw denied('only admins change a resident’s email');
  s.residents[d.rid] = d; save(s); return plain(d);
}

export async function applyForRole({ role, name, note } = {}) {
  const u = currentUser();
  if (!u) throw denied('signed out');
  const s = load();
  const prev = s.applications[u.uid];
  if (prev && prev.status === 'approved') throw denied('already approved');
  const d = cleanApplication({ uid: u.uid, email: u.email, name: name || u.name, role, note, status: 'pending', createdAt: prev?.createdAt });
  s.applications[u.uid] = d; save(s); return plain(d);
}
export async function listApplications() {
  const s = load();
  if (!isAdmin(s) && !isPD(s)) throw denied('admins and PDs only');
  return Object.values(s.applications).map(plain)
    .sort((a, b) => (a.status !== 'pending') - (b.status !== 'pending') || (b.createdAt || 0) - (a.createdAt || 0));
}
// Approve (adds the faculty or resident entry; an existing resident with that email keeps their rid)
// or reject. Returns the updated application.
export async function decideApplication(uid, { approve, rid, rYear, intake } = {}) {
  const s = load();
  if (!isAdmin(s) && !isPD(s)) throw denied('admins and PDs only');
  const a = s.applications[uid];
  if (!a) throw new Error('No such application');
  if (approve) {
    if (a.role === 'faculty') s.faculty[a.email] = cleanFaculty({ email: a.email, name: a.name, status: 'ACTIVE' });
    else {
      const old = Object.values(s.residents).find(r => r.email === a.email);
      if (!old && rid && s.residents[rid]) throw new Error(`Resident ID ${rid} is already in use`);
      const d = cleanResident({ ...(old || {}), rid: rid || old?.rid || newRid(), name: old?.name || a.name, email: a.email, status: 'ACTIVE',
        rYear: rYear ?? old?.rYear ?? null, intake: intake ?? old?.intake ?? null });
      s.residents[d.rid] = d;
    }
  }
  Object.assign(a, { status: approve ? 'approved' : 'rejected', decidedAt: Date.now(), decidedBy: me() });
  save(s);
  return plain(a);
}

export async function createEvaluation(ev) {
  const s = load();
  const d = cleanEval(ev);
  const e = me();
  const bad = validEval(d);
  if (bad) throw denied(bad);
  if (d.residentEmail !== e) throw denied('only for yourself');
  const r = s.residents[d.rid];
  if (!r || r.email !== e) throw denied('not on the resident list');
  if (!['draft', 'requested'].includes(d.status)) throw denied('new evaluations are draft or requested');
  if (['assessment', 'metrics', 'submittedAt', 'declineReason', 'declinedAt', 'seenAt'].some(k => k in d)) throw denied('cannot pre-fill');
  if (!activeFaculty(s, d.assessorEmail)) throw denied('assessor is not on the faculty list');
  const prev = s.evaluations[d.id];
  if (prev) { checkUpdate(s, prev, { ...d, createdAt: prev.createdAt }); d.createdAt = prev.createdAt; }   // a repeat Send
  s.evaluations[d.id] = d;
  save(s);
  notifyEvals();
  return plain(d);
}

// Merge a patch (null removes assessment, metrics, declineReason, …). Returns the whole document.
export async function updateEvaluation(id, patch) {
  const s = load();
  const cur = s.evaluations[id];
  if (!cur) throw new Error('No such evaluation');
  const { set, remove } = cleanPatch(stampPatch(cur, patch));
  const next = { ...plain(cur), ...set };
  for (const k of remove) delete next[k];
  checkUpdate(s, cur, next);
  s.evaluations[id] = next;
  save(s);
  notifyEvals();
  return plain(next);
}

// Only to the resident, the assessor, PDs and admins (null otherwise, as for a missing one).
export async function getEvaluation(id) {
  const s = load();
  const d = s.evaluations[id];
  if (!d) return null;
  const e = currentUser()?.email;
  if (!e) return null;
  if (d.residentEmail === e || (d.assessorEmail === e && d.status !== 'draft') || s.admins[e] || s.pds[e]) return plain(d);
  return null;
}

// Removes only a resident's own draft (or anything, for an admin). The UI offers it for drafts only.
export async function deleteDraft(id) {
  const s = load();
  const d = s.evaluations[id];
  if (!d) return;
  if (!(isAdmin(s) || (d.residentEmail === me() && d.status === 'draft' && !d.assessment && !d.submittedAt && !d.declinedAt))) throw denied('only your own draft');
  delete s.evaluations[id];
  save(s);
  notifyEvals();
}

function watch(filter, cb) {
  const w = { filter, cb };
  evalWatchers.add(w);
  const all = Object.values(load().evaluations);
  cb(all.filter(filter).map(plain).sort(byNewest), meta);
  return () => evalWatchers.delete(w);
}
export function watchMine(email, cb) { email = lc(email); return watch(d => d.residentEmail === email, cb); }
export function watchAssigned(email, cb) { email = lc(email); return watch(d => d.assessorEmail === email && d.status !== 'draft', cb); }
export function watchAll(cb) {
  const ok = () => { const e = currentUser()?.email; const s = load(); return !!(e && (s.admins[e] || s.pds[e])); };
  return watch(() => ok(), cb);
}
