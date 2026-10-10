// In-browser stand-in for the Firebase backend, used when the page URL has ?demo.
// Same functions and signatures as cloud.js, backed by localStorage (or memory when
// localStorage is unavailable, e.g. in node tests or a private window).
// The signed-in user is the fake admin demo@example.com. All data here is made up.
//   ?demo        demo store, seeded with a few fake cases and fake classmates on first use
//   ?demo=empty  blank store (nothing seeded)
//   ?demo=reset  wipe the demo store, then seed as for ?demo
//
// The field whitelists below are shared with cloud.js so both backends store the same shapes
// (and so cloud writes never trip the field checks in firestore.rules).

export const DEMO_USER = { email: 'demo@example.com', name: 'Demo User', uid: 'demo-uid' };

import { cleanReflection, cleanImage } from './reflections.js';
export { cleanReflection, cleanImage };

const KEY = 'apmes-logbook-demo-v1';

// ---- shared field whitelists ----

const CASE_FIELDS = ['id', 'date', 'dateText', 'details', 'cats', 'createdAt', 'updatedAt', 'source', 'importKey', 'reflectionId'];
const SUMMARY_FIELDS = ['rid', 'name', 'intake', 'rYear', 'counts', 'total', 'reflections', 'reflectionsTotal', 'updatedAt'];
const RESIDENT_FIELDS = ['rid', 'name', 'email', 'status', 'intake', 'rYear'];
const TEMPLATE_FIELDS = ['id', 'name', 'cats', 'details'];

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
// Firestore rejects undefined values; a JSON round trip drops them (and deep-copies).
export const plain = o => JSON.parse(JSON.stringify(o));

export function cleanCase(c, now = Date.now()) {
  const out = pick(c, CASE_FIELDS);
  out.id = out.id ? String(out.id) : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  out.date = out.date || null;
  out.details = String(out.details ?? '').slice(0, 2000);
  out.cats = [...new Set((out.cats || []).map(String))].slice(0, 40);
  if (out.dateText != null) out.dateText = String(out.dateText).slice(0, 200);
  out.createdAt = Number(out.createdAt) || now;
  out.updatedAt = now;
  out.source = out.source || 'app';
  return plain(out);
}

export function cleanSummary(rid, s, now = Date.now()) {
  const out = pick(s, SUMMARY_FIELDS);
  out.rid = String(rid);
  out.counts = out.counts || {};
  out.total = Number(out.total) || 0;
  out.updatedAt = now;
  return plain(out);
}

export function cleanResident(r) {
  const out = pick(r, RESIDENT_FIELDS);
  out.rid = String(out.rid);
  out.name = String(out.name ?? '').slice(0, 200);
  out.email = String(out.email ?? '').trim().toLowerCase();
  out.status = out.status || 'ACTIVE';
  out.intake = out.intake == null || out.intake === '' ? null : Number(out.intake);
  out.rYear = out.rYear == null || out.rYear === '' ? null : Number(out.rYear);
  return plain(out);
}

export function cleanTemplate(t) {
  const out = pick(t, TEMPLATE_FIELDS);
  out.name = String(out.name ?? '').slice(0, 100);
  out.cats = [...new Set((out.cats || []).map(String))].slice(0, 40);
  if (out.details != null) out.details = String(out.details).slice(0, 2000);
  return plain(out);
}

// Firestore document ids may not contain '/', and some other characters are awkward.
// Map an importKey to a safe, reversible-enough id: keep [A-Za-z0-9_-], escape the rest as ~xxxx.
export const importDocId = key =>
  'imp_' + String(key).replace(/[^A-Za-z0-9_-]/g, ch => '~' + ch.charCodeAt(0).toString(16).padStart(4, '0'));

export function defaultLogbook(email, name = '') {
  return { email, name, rid: null, settings: {}, templates: [], updatedAt: Date.now() };
}

// ---- storage ----

let memory = null;            // fallback when localStorage is missing or throws
function storage() {
  try { if (typeof localStorage !== 'undefined') { localStorage.getItem(KEY); return localStorage; } } catch { /* blocked */ }
  return null;
}

function blank() {
  return { signedOut: false, admins: { [DEMO_USER.email]: { name: DEMO_USER.name } }, residents: {}, logbooks: {}, summaries: {}, imports: {}, sharedTemplates: {} };
}

function load() {
  const ls = storage();
  if (ls) {
    try { const s = JSON.parse(ls.getItem(KEY) || 'null'); if (s) return s; } catch { /* corrupt: start again */ }
  } else if (memory) return memory;
  const s = blank();
  if (mode() !== 'empty') seed(s);
  save(s);
  return s;
}

function save(s) {
  const ls = storage();
  if (ls) { try { ls.setItem(KEY, JSON.stringify(s)); return; } catch (e) { console.warn('Demo store not saved', e); } }
  memory = s;
}

function mode() {
  try { return typeof location !== 'undefined' ? new URLSearchParams(location.search).get('demo') : null; } catch { return null; }
}

// Wipe the store (tests, and ?demo=reset on page load).
export function resetDemo({ seeded = true } = {}) {
  memory = null;
  const ls = storage();
  if (ls) { try { ls.removeItem(KEY); } catch { /* ignore */ } }
  const s = blank();
  if (seeded) seed(s);
  save(s);
  notifyAll();
}

// Fake data only: a demo resident, a few made-up cases and three made-up classmates.
function seed(s) {
  const now = new Date();
  const intake = now.getMonth() >= 6 ? now.getFullYear() - 1 : now.getFullYear() - 2;   // an R2
  s.residents.DEMO01 = { rid: 'DEMO01', name: 'Demo User', email: DEMO_USER.email, status: 'ACTIVE', intake, rYear: 2 };
  const pad = n => String(n).padStart(2, '0');
  const day = n => { const d = new Date(now); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };   // local date
  const cases = [
    [1, 'AB 34F LSCS under spinal', ['16', '17', '28']],
    [1, 'CD 72M TKR, adductor canal block', ['18', '21', '26', '26ii']],
    [2, 'EF 5yo tonsillectomy', ['10', '11', '20', '20iii']],
    [3, 'GH 45F lap chole', ['08', '13']],
    [5, 'IJ 58M BMI 42 lap sleeve gastrectomy', ['08', '22', '23']],
    [8, 'KL 66F ESP block for VATS', ['03', '07', '21', '26', '26iii']],
  ];
  const t = now.getTime();
  s.logbooks[DEMO_USER.email] = {
    doc: defaultLogbook(DEMO_USER.email, DEMO_USER.name),
    cases: Object.fromEntries(cases.map(([ago, details, cats], i) => {
      const id = 'demo' + i;
      return [id, { id, date: day(ago), details, cats, createdAt: t - ago * 864e5, updatedAt: t - ago * 864e5, source: 'app' }];
    })),
  };
  s.logbooks[DEMO_USER.email].doc.rid = 'DEMO01';
  const peers = [['DEMO02', 'Resident A', 3], ['DEMO03', 'Resident B', 7], ['DEMO04', 'Resident C', 11]];
  for (const [rid, name, k] of peers) {
    const counts = { '13': 4 + k % 5, '16': 3 + k % 4, '17': 5 + k % 6, '18': 6 + k % 3, '20': 10 + k, '20iii': 8 + k, '26': 2 + k % 7, '28': 4 + k % 5 };
    s.residents[rid] = { rid, name, email: rid.toLowerCase() + '@example.com', status: 'ACTIVE', intake, rYear: 2 };
    s.summaries[rid] = { rid, name, intake, rYear: 2, counts, total: 20 + k * 2, reflections: {}, reflectionsTotal: k % 4, updatedAt: t };
  }
  s.sharedTemplates.tpl1 = { id: 'tpl1', name: 'LSCS spinal', cats: ['16', '17', '28'] };
}

// ---- change notification (same tab and other tabs) ----

const caseWatchers = new Set();   // { email, cb }
const userWatchers = new Set();
const reflWatchers = new Set();   // { email, cb }

function notifyAll() {
  for (const w of caseWatchers) w.cb(casesOf(w.email));
  for (const cb of userWatchers) cb(currentUser());
  for (const w of reflWatchers) w.cb(reflectionsOf(w.email));
}
function notifyCases(email) {
  for (const w of caseWatchers) if (w.email === email) w.cb(casesOf(email));
}
// ?demo=reset wipes and reseeds on page load (after the watcher sets above exist).
if (mode() === 'reset') resetDemo();
if (typeof addEventListener === 'function') {
  addEventListener('storage', e => { if (e.key === KEY) notifyAll(); });
}

function book(s, email) {
  if (!s.logbooks[email]) s.logbooks[email] = { doc: null, cases: {} };
  return s.logbooks[email];
}
const byNewest = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0);
function casesOf(email) {
  const lb = load().logbooks[email];
  return lb ? Object.values(lb.cases).map(plain).sort(byNewest) : [];
}
const lc = e => String(e || '').trim().toLowerCase();
const currentUser = () => (load().signedOut ? null : { ...DEMO_USER });
const meta = { fromCache: false, hasPendingWrites: false };

// ---- the cloud.js API ----

export async function watchUser(cb) {
  userWatchers.add(cb);
  cb(currentUser());
}

export async function signIn() { const s = load(); s.signedOut = false; save(s); notifyAll(); }
export async function signOut() { const s = load(); s.signedOut = true; save(s); notifyAll(); }

export async function isAdmin(email) { return !!load().admins[lc(email)]; }

export async function myResident(email) {
  const r = Object.values(load().residents).find(r => r.email === lc(email));
  return r ? plain(r) : null;
}

export async function loadLogbook(email) {
  email = lc(email);
  const s = load();
  const lb = book(s, email);
  if (!lb.doc) { lb.doc = defaultLogbook(email, email === DEMO_USER.email ? DEMO_USER.name : ''); save(s); }
  return plain(lb.doc);
}

export async function saveLogbook(email, patch) {
  email = lc(email);
  const s = load();
  const lb = book(s, email);
  const cur = lb.doc || defaultLogbook(email);
  const p = plain(patch || {});
  lb.doc = { ...cur, ...p, settings: { ...(cur.settings || {}), ...(p.settings || {}) }, email, updatedAt: Date.now() };
  save(s);
  return plain(lb.doc);
}

export function watchCases(email, cb) {
  const w = { email: lc(email), cb: cases => cb(cases, meta) };
  caseWatchers.add(w);
  w.cb(casesOf(w.email));
  return () => caseWatchers.delete(w);
}

export async function saveCase(email, c) {
  email = lc(email);
  const s = load();
  const doc = cleanCase(c);
  book(s, email).cases[doc.id] = doc;
  save(s);
  notifyCases(email);
  return doc;
}

export async function deleteCase(email, id) { return deleteCases(email, [id]); }

export async function saveCases(email, cases) {
  email = lc(email);
  const s = load();
  const lb = book(s, email);
  const out = cases.map(c => cleanCase(c));
  for (const d of out) lb.cases[d.id] = d;
  save(s);
  notifyCases(email);
  return out;
}

export async function deleteCases(email, ids) {
  email = lc(email);
  const s = load();
  const lb = book(s, email);
  for (const id of ids) delete lb.cases[id];
  save(s);
  notifyCases(email);
}

// ---- reflections (logbooks/{email}/reflections/{id}) ----

function reflectionsOf(email) {
  const lb = load().logbooks[email];
  return lb && lb.reflections ? Object.values(lb.reflections).map(plain).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) : [];
}
function notifyReflections(email) {
  for (const w of reflWatchers) if (w.email === email) w.cb(reflectionsOf(email));
}
export function watchReflections(email, cb) {
  const w = { email: lc(email), cb: list => cb(list, meta) };
  reflWatchers.add(w);
  w.cb(reflectionsOf(w.email));
  return () => reflWatchers.delete(w);
}
export async function saveReflection(email, r) {
  email = lc(email);
  const s = load();
  const lb = book(s, email);
  const doc = cleanReflection(r);
  (lb.reflections ||= {})[doc.id] = doc;
  save(s);
  notifyReflections(email);
  return doc;
}
export async function deleteReflection(email, id) {
  email = lc(email);
  const s = load();
  const lb = book(s, email);
  if (lb.reflections) delete lb.reflections[id];
  save(s);
  notifyReflections(email);
}

// ---- reflection images (logbooks/{email}/images/{id}) ----
// Kept under their own key (base64 is large) so load()/save() of the demo state stays fast.
const IMAGES_KEY = KEY + '-images';
const imagesMem = {};
function imageStore() { try { return JSON.parse(localStorage.getItem(IMAGES_KEY) || '{}'); } catch { return { ...imagesMem }; } }
function imageStoreSave(m) {
  Object.keys(imagesMem).forEach(k => delete imagesMem[k]); Object.assign(imagesMem, m);
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(IMAGES_KEY, JSON.stringify(m)); } catch (e) { console.warn('Demo images kept in memory only', e); }
}
export async function saveImage(email, img) {
  const d = cleanImage(img);
  const m = imageStore(); m[lc(email) + '/' + d.id] = d; imageStoreSave(m);
  return d;
}
export async function loadImage(email, id) {
  const d = imageStore()[lc(email) + '/' + id];
  return d ? plain(d) : null;
}
export async function deleteImage(email, id) {
  const m = imageStore(); delete m[lc(email) + '/' + id]; imageStoreSave(m);
}

export async function writeSummary(rid, summary) {
  const s = load();
  s.summaries[rid] = cleanSummary(rid, summary);
  save(s);
}

export async function listSummaries() { return Object.values(load().summaries).map(plain); }

export async function listResidents() {
  return Object.values(load().residents).map(plain).sort((a, b) => String(a.rid).localeCompare(String(b.rid)));
}
const STATUSES = ['ACTIVE', 'ON LEAVE', 'GRADUATED', 'ATTRITED'];
export async function saveResident(r) {
  const d = cleanResident(r);
  // the same checks as firestore.rules validResident, so the demo fails where the real thing would
  if (!STATUSES.includes(d.status)) throw new Error(`status “${d.status}” is not one of ${STATUSES.join(', ')}`);
  if (!d.email || d.email !== d.email.toLowerCase()) throw new Error('email missing or not lower case');
  const s = load(); s.residents[d.rid] = d; save(s); return d;
}
export async function deleteResident(rid) { const s = load(); delete s.residents[rid]; save(s); }

export async function listSharedTemplates() { return Object.values(load().sharedTemplates).map(plain); }
export async function saveSharedTemplate(t) {
  const s = load();
  const d = cleanTemplate({ ...t, id: t.id || 'tpl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
  s.sharedTemplates[d.id] = d;
  save(s);
  return d;
}
export async function deleteSharedTemplate(id) { const s = load(); delete s.sharedTemplates[id]; save(s); }

export async function listCases(email) { return casesOf(lc(email)); }

export async function importCases(email, rid, cases, onProgress) {
  email = lc(email);
  const s = load();
  const prev = s.imports[rid];
  const known = new Set(prev && (!prev.email || prev.email === email) ? prev.keys || [] : []);
  const fresh = [];
  for (const c of cases) {
    if (!c.importKey || known.has(c.importKey)) continue;
    known.add(c.importKey);
    fresh.push(cleanCase({ ...c, id: importDocId(c.importKey), source: 'import', createdAt: c.createdAt || c.timestamp }));
  }
  const lb = book(s, email);
  for (const d of fresh) lb.cases[d.id] = d;
  s.imports[rid] = { email, keys: [...known], updatedAt: Date.now() };
  save(s);
  if (onProgress) onProgress(fresh.length, fresh.length);
  notifyCases(email);
  return { written: fresh.length, skipped: cases.length - fresh.length };
}

// ---- portfolio template (word-export) ----
// Kept under its own key: it is ~1.4 MB of base64 and must not slow every load()/save() of the demo state.
const TEMPLATE_KEY = KEY + '-portfolio-template';
let templateMem = null;
export async function saveTemplate(b64) {
  const t = { data: b64, size: Math.floor(b64.length * 3 / 4), uploadedAt: Date.now() };
  templateMem = t;
  try { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(t)); } catch (e) { console.warn('Demo template kept in memory only', e); }
}
export async function loadTemplate() {
  try { const s = localStorage.getItem(TEMPLATE_KEY); if (s) return JSON.parse(s); } catch { /* storage blocked */ }
  return templateMem;
}

// ---- recycle bin (bin agent): logbooks/{email}/bin/{id} = { id, kind, data, deletedAt } ----
const binWatchers = new Set();   // { email, cb }
function binOf(email) {
  const lb = load().logbooks[email];
  return lb && lb.bin ? Object.values(lb.bin).map(plain).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0)) : [];
}
function notifyBin(email) { for (const w of binWatchers) if (w.email === email) w.cb(binOf(email)); }
export function watchBin(email, cb) {
  const w = { email: lc(email), cb: list => cb(list, meta) };
  binWatchers.add(w);
  w.cb(binOf(w.email));
  return () => binWatchers.delete(w);
}
export async function listBin(email) { return binOf(lc(email)); }
export async function saveBinEntry(email, e) {
  email = lc(email);
  const s = load();
  const lb = book(s, email);
  const doc = plain({ id: String(e.id), kind: e.kind, data: e.data, deletedAt: Number(e.deletedAt) || Date.now() });
  (lb.bin ||= {})[doc.id] = doc;
  save(s);
  notifyBin(email);
  return doc;
}
export async function deleteBinEntry(email, id) {
  email = lc(email);
  const s = load();
  const lb = book(s, email);
  if (lb.bin) delete lb.bin[id];
  save(s);
  notifyBin(email);
}
// ---- end recycle bin ----
