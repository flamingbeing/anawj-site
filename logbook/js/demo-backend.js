// In-browser stand-in for the Firebase backend, used when the page URL has ?demo.
// Same functions and signatures as cloud.js, backed by localStorage (or memory when
// localStorage is unavailable, e.g. in node tests or a private window).
// The signed-in user is the fake admin demo@example.com. All data here is made up.
//   ?demo        demo store, seeded with a few fake cases and fake classmates on first use
//   ?demo=empty  blank store (nothing seeded)
//   ?demo=reset  wipe the demo store, then seed as for ?demo
//
// The field whitelists are in clean.js, shared with cloud.js so both backends store the same shapes
// (and so cloud writes never trip the field checks in firestore.rules).

export const DEMO_USER = { email: 'demo@example.com', name: 'Demo User', uid: 'demo-uid' };

import { cleanReflection, cleanImage } from './reflections.js';
import { cleanNote } from './notepad.js';
import { progress } from './engine.js';
import { cleanProfile } from './profile.js';
import { mergeSettings } from './profiles.js';
import { plain, cleanCase, cleanSummary, cleanResident, cleanTemplate, importDocId, defaultLogbook, cleanCategoryNames, cleanSubmission } from './clean.js';
export { cleanReflection, cleanImage, plain, cleanCase, cleanSummary, cleanResident, cleanTemplate, importDocId, defaultLogbook, cleanCategoryNames, cleanSubmission } from './clean.js';

const KEY = 'apmes-logbook-demo-v1';

// ---- shared field whitelists: clean.js (cloud.js uses them without loading this file) ----

// the demo's own logbook. The e2e tests (apmes-logbook-demo-small) check every feature, so theirs starts in Advanced;
// everyone else starts in Basic, the default profile
function demoDoc(email, name) {
  const doc = defaultLogbook(email, name);
  try { if (localStorage.getItem('apmes-logbook-demo-small')) doc.settings = { mode: 'advanced' }; } catch { /* no storage */ }
  return doc;
}

// ---- storage ----

let memory = null;            // fallback when localStorage is missing or throws
const outbox = new Map();     // the response sheet's outbox (sheetOutbox), in memory only: see queueSheetRows
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

// Wipe the store and the reflection images (tests, ?demo=reset on page load, and the banner's
// Reset demo button). The uploaded portfolio template is kept. The images key is spelled out
// because IMAGES_KEY is declared further down and this can run while the module is loading.
export function resetDemo({ seeded = true } = {}) {
  memory = null;
  outbox.clear();
  const ls = storage();
  if (ls) { try { ls.removeItem(KEY); ls.removeItem(KEY + '-images'); ls.removeItem(KEY + '-submissions'); } catch { /* ignore */ } }
  const s = blank();
  if (seeded) seed(s);
  save(s);
  notifyAll();
  if (seeded && typeof window !== 'undefined') loadExtras();
}

// Fake data only: a demo resident, a few made-up cases and three made-up classmates.
function seed(s) {
  const now = new Date();
  const intake = now.getMonth() >= 6 ? now.getFullYear() - 2 : now.getFullYear() - 3;   // an R3
  s.residents.DEMO01 = { rid: 'DEMO01', name: 'Demo User', email: DEMO_USER.email, status: 'ACTIVE', intake, rYear: 3 };
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
    doc: demoDoc(DEMO_USER.email, DEMO_USER.name),
    cases: Object.fromEntries(cases.map(([ago, details, cats], i) => {
      const id = 'demo' + i;
      return [id, { id, date: day(ago), details, cats, createdAt: t - ago * 864e5, updatedAt: t - ago * 864e5, source: 'app' }];
    })),
  };
  s.logbooks[DEMO_USER.email].doc.rid = 'DEMO01';
  s.logbooks[DEMO_USER.email].epoch = newEpoch();
  // two years of cases and the sample reflections come from demo-seed.js, loaded after the page starts
  s.logbooks[DEMO_USER.email].extras = 'pending';
  // one complete reflection on the LSCS case, so the Reflections, Progress and Export pages have something in them
  const rt = t - 864e5;
  s.logbooks[DEMO_USER.email].reflections = { refl0: {
    id: 'refl0', headingId: 'lscs', subId: null, initials: 'AB', date: day(1), jr: true, diagnosis: 'LSCS under spinal',
    title: 'High spinal block during caesarean section',
    summary: 'Made-up example. A term parturient for elective caesarean section under spinal anaesthesia. Shortly after the intrathecal injection she reported difficulty breathing and weak hands, with hypotension and bradycardia. The block was rising quickly. I called for help, tilted the table head up slightly, supported ventilation with oxygen by mask and gave vasopressors and atropine. She did not need intubation; the block settled and surgery went ahead. Mother and baby were well afterwards.',
    points: [
      { heading: 'Recognising a high block early', text: 'Hand weakness, difficulty speaking and a falling heart rate are early signs. Checking the block height early and often, and asking the patient how her hands and breathing feel, let me act before she lost her airway reflexes.' },
      { heading: 'A plan before the block goes in', text: 'Having vasopressors drawn up, the airway equipment checked and a second pair of hands ready made the response calm and quick. I now say the plan for a high block out loud at the sign-in.' },
    ],
    figures: [], references: [], caseId: 'demo0', source: 'app', status: 'complete', createdAt: rt, updatedAt: rt,
  } };
  // made-up batchmates (the demo user is an R3): enough for Totals and the Analytics comparison
  const peers = [['DEMO02', 'Resident A', 0.55], ['DEMO03', 'Resident B', 0.8], ['DEMO04', 'Resident C', 1.05], ['DEMO05', 'Resident D', 0.7], ['DEMO06', 'Resident E', 1.25], ['DEMO07', 'Resident F', 0.9]];
  for (const [rid, name, f] of peers) {
    // each tag a share of its R3 target (or of the R5 one when there's none by R3), so some are done and some not
    const counts = {};
    progress({}, 3).forEach((r, n) => {
      const m = (r.milestones || []).find(x => x.by === 'R3') || (r.milestones || []).find(x => x.by === 'R5');
      if (m) counts[r.code] = Math.max(0, Math.round(m.n * f * (0.7 + ((n * 37) % 10) / 15)));
    });
    s.residents[rid] = { rid, name, email: rid.toLowerCase() + '@example.com', status: 'ACTIVE', intake, rYear: 3 };
    s.summaries[rid] = { rid, name, intake, rYear: 3, counts, total: Math.round(330 * f), reflections: {}, reflectionsTotal: Math.round(34 * f), updatedAt: t };
  }
  s.sharedTemplates.tpl1 = { id: 'tpl1', name: 'LSCS spinal', cats: ['16', '17', '28'] };
}

// ---- change notification (same tab and other tabs) ----
// The synced collections (cases, reflections, notes, bin) are watched like Firestore queries (listenSince, used by
// the sync engine in sync.js): each watcher gets the changes since what it last saw.

const userWatchers = new Set();
const sinceWatchers = new Set();   // { email, coll, run }

function notifyAll() {
  for (const cb of userWatchers) cb(currentUser());
  for (const w of [...sinceWatchers]) w.run();
}
function notifyColl(email, coll) { for (const w of [...sinceWatchers]) if (w.email === email && w.coll === coll) w.run(); }
const notifyCases = email => notifyColl(email, 'cases');
// a logbook's epoch changes when its data is replaced wholesale (reset, the sample logbook arriving), so a device's
// stored copy is read again in full rather than patched
const newEpoch = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// ?demo=reset wipes and reseeds on page load (after the watcher sets above exist).
// The address then says plain ?demo, so a reload keeps what was done since.
// The bigger sample logbook (demo-seed.js: ~350 cases, 32 reflections) loads on demand, so real users
// never download it; it lands a moment after the first paint and the watchers repaint.
function loadExtras() {
  const st = load(), lb = st.logbooks[DEMO_USER.email];
  if (!lb || lb.extras !== 'pending') return;
  try { if (localStorage.getItem('apmes-logbook-demo-small')) return; } catch { /* no storage */ }   // the e2e test
  import('./demo-seed.js').then(({ demoLogbook }) => {
    const s2 = load(), lb2 = s2.logbooks[DEMO_USER.email];
    if (!lb2 || lb2.extras !== 'pending') return;
    const pad = n => String(n).padStart(2, '0');
    const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const { cases, reflections } = demoLogbook(day, Date.now());
    lb2.cases ||= {}; lb2.reflections ||= {};
    for (const c of cases) if (!lb2.cases[c.id]) lb2.cases[c.id] = cleanCase(c, c.updatedAt);
    for (const r of reflections) if (!lb2.reflections[r.id]) lb2.reflections[r.id] = cleanReflection(r);
    lb2.extras = 'done'; lb2.epoch = newEpoch();
    save(s2); notifyAll();
  }).catch(err => console.warn('Demo sample data not loaded', err));
}

if (mode() === 'reset') {
  resetDemo();
  try { const q = new URLSearchParams(location.search); q.set('demo', ''); history.replaceState(null, '', location.pathname + '?' + q.toString().replace(/=(&|$)/g, '$1') + location.hash); } catch { /* not in a browser */ }
}
if (mode() !== null && typeof window !== 'undefined') loadExtras();
if (typeof addEventListener === 'function') {
  addEventListener('storage', e => { if (e.key === KEY) notifyAll(); });
}

function book(s, email) {
  if (!s.logbooks[email]) s.logbooks[email] = { doc: null, cases: {}, epoch: newEpoch() };
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
// Delete account in the demo: the demo user's logbook goes (cases, reflections, photos, bin) and they're
// signed out; signing in again starts an empty logbook (?demo=reset brings the samples back).
export async function deleteAccount(email) {
  const s = load(); delete s.logbooks[lc(email)]; s.signedOut = true; save(s);
  try { localStorage.removeItem(KEY + '-images'); localStorage.removeItem(KEY + '-submissions'); } catch { /* ignore */ }
  notifyAll();
}

export async function isAdmin(email) { return !!load().admins[lc(email)]; }

// private feedback: in the demo store (Reset demo wipes it); the demo admin plays the owner, so it reads them back
export async function sendFeedback(rec) {
  const s = load(); s.feedback ||= {};
  const id = 'fb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  s.feedback[id] = { ...plain(rec), id, createdAt: Date.now() }; save(s);
  return true;
}
export async function listFeedback() { return Object.values(load().feedback || {}).map(plain).sort((a, b) => b.createdAt - a.createdAt); }
export async function setFeedbackStatus(id, status) { const s = load(); if (s.feedback?.[id]) { s.feedback[id].status = status; save(s); } }
export async function deleteFeedback(id) { const s = load(); if (s.feedback) { delete s.feedback[id]; save(s); } }

export async function myResident(email) {
  const r = Object.values(load().residents).find(r => r.email === lc(email));
  return r ? plain(r) : null;
}

export async function loadLogbook(email) {
  email = lc(email);
  const s = load();
  const lb = book(s, email);
  if (!lb.doc) { lb.doc = demoDoc(email, email === DEMO_USER.email ? DEMO_USER.name : ''); save(s); }
  return plain(lb.doc);
}

export async function saveLogbook(email, patch) {
  email = lc(email);
  const s = load();
  const lb = book(s, email);
  const cur = lb.doc || defaultLogbook(email);
  const p = plain(patch || {});
  if ('profile' in p) p.profile = cleanProfile(p.profile);
  lb.doc = { ...cur, ...p, settings: mergeSettings(cur.settings, p.settings), email, updatedAt: Date.now() };
  save(s);
  return plain(lb.doc);
}

// The sync engine's listener (sync.js): the collection's documents with field > since (all when since is null, or when
// the logbook's epoch differs from the one the device last saw), then the changes as they happen.
export function listenSince(email, coll, { since = null, epoch, field = 'updatedAt' } = {}, onSnap) {
  const w = { email: lc(email), coll, prev: null, seen: epoch };
  w.run = () => {
    const lb = load().logbooks[w.email];
    const ep = (lb && lb.epoch) || 'none';
    const full = w.prev === null ? since === null || ep !== w.seen : ep !== w.seen;
    if (full) since = null;   // from now on, the whole collection (as a full Firestore listener)
    w.seen = ep;
    const docs = Object.values((lb && lb[coll]) || {}).filter(d => since === null || (Number(d[field]) || 0) > since).map(plain);
    const next = new Map(docs.map(d => [d.id, JSON.stringify(d)]));
    const changes = [];
    for (const d of docs) { const was = w.prev && w.prev.get(d.id); if (was !== next.get(d.id)) changes.push({ type: was ? 'modified' : 'added', id: d.id, doc: d }); }
    for (const id of (w.prev || new Map()).keys()) if (!next.has(id)) changes.push({ type: 'removed', id, doc: null });
    const first = w.prev === null;
    w.prev = next;
    // documents "read", counted like cloud.js does with ?emulator (the browser tests check reopening reads ~nothing)
    if (typeof window !== 'undefined') {
      const r = ((window.__reads ||= {})[coll] ||= { billed: 0, served: 0, listens: 0 }), n = changes.filter(c => c.type !== 'removed').length;
      r.served += n; r.billed += first ? Math.max(1, docs.length) : n; if (first) r.listens++;
    }
    if (first || full || changes.length) onSnap({ changes, fromCache: false, hasPendingWrites: false, epoch: ep, ...(full ? { full: true, docs } : {}) });
  };
  sinceWatchers.add(w);
  w.run();
  return () => sinceWatchers.delete(w);
}
export function fetchOne(email, coll, id) {
  const lb = load().logbooks[lc(email)], d = lb && lb[coll] && lb[coll][id];
  return d ? plain(d) : null;
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

export function reflectionsOf(email) {
  const lb = load().logbooks[email];
  return lb && lb.reflections ? Object.values(lb.reflections).map(plain).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) : [];
}
const notifyReflections = email => notifyColl(email, 'reflections');
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

// ---- notes (logbooks/{email}/notes/{id}) ----
export function notesOf(email) {
  const lb = load().logbooks[email];
  return lb && lb.notes ? Object.values(lb.notes).map(plain) : [];
}
const notifyNotes = email => notifyColl(email, 'notes');
export function saveNote(email, n) {
  email = lc(email);
  const s = load(), lb = book(s, email), doc = cleanNote(n);
  (lb.notes ||= {})[doc.id] = doc;
  save(s); notifyNotes(email);
  return doc;
}
export function deleteNote(email, id) {
  email = lc(email);
  const s = load(), lb = book(s, email);
  if (lb.notes) delete lb.notes[id];
  save(s); notifyNotes(email);
}

// ---- the note index (logbooks/{email}/meta/noteIndex) ----
const noteIndexWatchers = new Set();
export function watchNoteIndex(email, cb) {
  const w = { email: lc(email), cb };
  noteIndexWatchers.add(w);
  const lb = load().logbooks[w.email];
  cb(lb && lb.noteIndex ? plain(lb.noteIndex) : null, meta);
  return () => noteIndexWatchers.delete(w);
}
export function saveNoteIndex(email, idx) {
  email = lc(email);
  const s = load(), lb = book(s, email), doc = { days: idx.days, cases: idx.cases, n: idx.n, updatedAt: Date.now() };
  lb.noteIndex = doc;
  save(s);
  for (const w of noteIndexWatchers) if (w.email === email) w.cb(plain(doc), meta);
  return doc;
}

// ---- reflection images (logbooks/{email}/images/{id}) ----
// Kept under their own key (base64 is large) so load()/save() of the demo state stays fast.
const IMAGES_KEY = KEY + '-images';
const imagesMem = {};
function imageStore() { try { return JSON.parse(localStorage.getItem(IMAGES_KEY) || '{}'); } catch { return { ...imagesMem }; } }
function imageStoreSave(m) {
  Object.keys(imagesMem).forEach(k => delete imagesMem[k]); Object.assign(imagesMem, m);
  try { if (typeof localStorage === 'undefined') return; } catch { return; }   // (blocked storage throws even here)
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

// ---- ready portfolios (submissions) ----
const SUB_KEY = KEY + '-submissions';
const subs = () => { try { return JSON.parse(localStorage.getItem(SUB_KEY) || '{}'); } catch { return {}; } };
const subsSave = m => { try { localStorage.setItem(SUB_KEY, JSON.stringify(m)); } catch (e) { console.warn('Demo submissions not saved', e); } };
export async function submitPortfolio(email, meta, reflections) {
  const m = subs();
  const doc = cleanSubmission(email, meta);
  m[lc(email)] = { meta: doc, reflections: reflections.map(r => cleanReflection(r)) };
  subsSave(m);
  return doc;
}
export async function withdrawPortfolio(email) { const m = subs(); delete m[lc(email)]; subsSave(m); }
export async function loadMySubmission(email) { const x = subs()[lc(email)]; return x ? plain(x.meta) : null; }
export async function listSubmissions() { return Object.values(subs()).map(x => plain(x.meta)); }
export async function loadSubmission(email) {
  const x = subs()[lc(email)];
  if (!x) return null;
  const images = {};
  for (const id of x.meta.imageIds || []) { const img = imageStore()[lc(email) + '/' + id]; if (img) images[id] = plain(img); }
  return { ...plain(x), images };
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
const STATUSES = ['ACTIVE', 'ON LEAVE', 'SMO', 'GRADUATED', 'ATTRITED'];
export async function saveResident(r) {
  const d = cleanResident(r);
  // the same checks as firestore.rules validResident, so the demo fails where the real thing would
  if (!STATUSES.includes(d.status)) throw new Error(`status “${d.status}” is not one of ${STATUSES.join(', ')}`);
  if (!d.email || d.email !== d.email.toLowerCase()) throw new Error('email missing or not lower case');
  const s = load(); s.residents[d.rid] = d; save(s); return d;
}
export async function deleteResident(rid) { const s = load(); delete s.residents[rid]; delete s.summaries[rid]; save(s); }

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
export async function listLogbookEmails() { return Object.keys(load().logbooks); }
export async function fixCaseInitials(email, fixes, onProgress) {
  email = lc(email);
  const s = load(), lb = book(s, email), now = Date.now();
  for (const f of fixes) if (lb.cases[f.id]) Object.assign(lb.cases[f.id], { initials: f.initials, details: f.details, updatedAt: now });
  save(s); notifyCases(email);
  if (onProgress) onProgress(fixes.length, fixes.length);
  return fixes.length;
}

export async function importCases(email, rid, cases, onProgress, { have = [] } = {}) {
  email = lc(email);
  const s = load();
  const prev = s.imports[rid];
  const known = new Set(prev && (!prev.email || prev.email === email) ? prev.keys || [] : []);
  const there = new Set(have);
  const fresh = [];
  for (const c of cases) {
    if (!c.importKey || known.has(c.importKey)) continue;
    known.add(c.importKey);
    const id = importDocId(c.importKey);
    if (!there.has(id)) fresh.push(cleanCase({ ...c, id, source: 'import', createdAt: c.createdAt || c.timestamp }));
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
const NAMES_KEY = KEY + '-category-names';
const HIDDEN_KEY = 'apmes-logbook-demo-hidden';
export async function loadTotalsHidden() { try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'); } catch { return []; } }
export async function saveTotalsHidden(rids) { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...new Set(rids.map(String))].sort())); } catch { /* storage blocked */ } }
export async function loadCategoryNames() { try { return JSON.parse(localStorage.getItem(NAMES_KEY) || '{}'); } catch { return {}; } }
export async function saveCategoryNames(names) { const n = cleanCategoryNames(names); try { localStorage.setItem(NAMES_KEY, JSON.stringify(n)); } catch { /* storage blocked */ } return n; }

const TEMPLATE_KEY = KEY + '-portfolio-template';
let templateMem = null;
export async function saveTemplate(b64) {
  const t = { data: b64, size: Math.floor(b64.length * 3 / 4), uploadedAt: Date.now() };
  templateMem = t;
  try { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(t)); } catch (e) { console.warn('Demo template kept in memory only', e); }
}
export async function deleteTemplate() { templateMem = null; try { localStorage.removeItem(TEMPLATE_KEY); } catch { /* storage blocked */ } }
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
function notifyBin(email) { for (const w of binWatchers) if (w.email === email) w.cb(binOf(email)); notifyColl(email, 'bin'); }
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
// Google Form cases deleted (logbooks/{email}/formGone/{caseId}; cloud.js filters the ids)
export async function addFormGone(email, ids) {
  email = lc(email);
  const s = load(), lb = book(s, email), now = Date.now();
  for (const id of ids) (lb.formGone ||= {})[id] = { id, deletedAt: now };
  save(s);
}
export async function listFormGone(email) { const lb = load().logbooks[lc(email)]; return lb && lb.formGone ? Object.keys(lb.formGone) : []; }
// ---- end recycle bin ----

// The response sheet's outbox (sheet-outbox.js; `outbox`, near the top): in memory only, as no sheet script reads it here,
// so it just shows the tests what the app queues and takes back. As the rules do, an entry already there is not replaced.
export function queueSheetRows(entries) { for (const e of entries) if (!outbox.has(String(e.id))) outbox.set(String(e.id), plain(e)); }
export function dropSheetRows(ids) { for (const id of ids) outbox.delete(String(id)); }
export const sheetOutbox = () => [...outbox.values()].map(plain);
