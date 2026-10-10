// Storage for the logbook: Google sign-in and Cloud Firestore (Firebase), with an offline cache
// so logging works without signal and syncs later. With ?demo in the URL, everything goes to an
// in-browser stand-in instead (demo-backend.js), signed in as a fake admin.
// Who may read or write what is enforced by firestore.rules on Google's side, not by this file.
//
// Data (see README.md):
//   admins/{email}                        { name }                       (added by hand in the console)
//   residents/{rid}                       { rid, name, email, status, intake, rYear }
//   logbooks/{email}                      { email, name, rid, settings, templates, updatedAt }
//   logbooks/{email}/cases/{caseId}       case object (see engine.js)
//   logbooks/{email}/reflections/{id} reflection object (see reflections.js), owner only
//   logbooks/{email}/images/{id}      { id, data (base64 JPEG), mime, w, h, createdAt }  reflection figures, owner only
//   summaries/{rid}                       counts only, readable by everyone signed in
//   imports/{rid}                         { email, keys: [importKey], updatedAt }  (which old-form rows are in)
//   sharedTemplates/{id}                  { id, name, cats, details? }

import { FIREBASE_CONFIG } from './firebase-config.js';
import * as D from './demo-backend.js';
import { plain, cleanCase, cleanSummary, cleanResident, cleanTemplate, importDocId, defaultLogbook, cleanReflection, cleanImage } from './demo-backend.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
export const demo = (() => {
  try { return typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo'); } catch { return false; }
})();
export const enabled = demo || !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

const BATCH = 450;            // Firestore allows 500 writes per batch; keep a margin
const ACK_WAIT = 3000;        // ms to wait for the server before treating a write as queued

let fb = null;
async function sdk() {
  if (fb) return fb;
  fb = (async () => {
    const [app, auth, fs] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js'),
    ]);
    const a = app.initializeApp(FIREBASE_CONFIG);
    return { app: a, auth: auth.getAuth(a), db: openDb(a, fs), A: auth, F: fs };
  })();
  fb.catch(() => { fb = null; });   // e.g. offline on first ever load: try again next time
  return fb;
}

function openDb(a, fs) {
  try {
    return fs.initializeFirestore(a, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch (e) {
    console.warn('Offline cache unavailable; using memory only', e);
    return fs.getFirestore(a);
  }
}

const lc = e => String(e || '').trim().toLowerCase();

// ---- writes that work offline ----
// Firestore applies a write to the local cache at once (listeners fire straight away) but the
// promise only settles when the server confirms. Offline that can be hours, so wait a little and
// then return; a later failure (e.g. a rules rejection) is reported to onSyncError listeners.
const syncErrorListeners = new Set();
export function onSyncError(cb) { syncErrorListeners.add(cb); return () => syncErrorListeners.delete(cb); }
function queued(p) {
  let late = false;
  p.catch(e => { if (late) { console.error('Sync failed', e); for (const cb of syncErrorListeners) cb(e); } });
  return Promise.race([p, new Promise(r => setTimeout(() => { late = true; r(); }, ACK_WAIT))]);
}

// ---- sign-in ----

const asUser = u => (u ? { email: lc(u.email), name: u.displayName || u.email, uid: u.uid } : null);

export async function watchUser(cb) {
  if (demo) return D.watchUser(cb);
  if (!enabled) return;
  const { auth, A } = await sdk();
  // finishes a redirect sign-in (the fallback below) when the page loads again
  A.getRedirectResult(auth).catch(e => console.warn('Redirect sign-in failed', e));
  A.onAuthStateChanged(auth, u => cb(asUser(u)));
}

// Popup first; redirect when popups are blocked or unsupported (e.g. some home-screen apps).
const REDIRECT_CODES = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported', 'auth/cancelled-popup-request'];
export async function signIn() {
  if (demo) return D.signIn();
  const { auth, A } = await sdk();
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await A.signInWithPopup(auth, provider);
  } catch (e) {
    if (!REDIRECT_CODES.includes(e?.code)) throw e;
    await A.signInWithRedirect(auth, provider);
  }
}

// Signing out also wipes this device's offline copy of the cases (a shared theatre PC keeps nothing).
export async function signOut() {
  if (demo) return D.signOut();
  const s = await sdk();
  await s.A.signOut(s.auth);
  try {
    await s.F.terminate(s.db);
    await s.F.clearIndexedDbPersistence(s.db);
  } catch (e) { console.warn('Could not clear the offline cache', e); }
  s.db = openDb(s.app, s.F);   // a fresh, empty Firestore for the next sign-in
}

// ---- people ----

export async function isAdmin(email) {
  if (demo) return D.isAdmin(email);
  const { db, F } = await sdk();
  try {
    return (await F.getDoc(F.doc(db, 'admins', lc(email)))).exists();
  } catch (e) {
    if (e?.code !== 'permission-denied') console.warn('Admin check failed', e);
    return false;
  }
}

export async function myResident(email) {
  if (demo) return D.myResident(email);
  const { db, F } = await sdk();
  const snap = await F.getDocs(F.query(F.collection(db, 'residents'), F.where('email', '==', lc(email)), F.limit(1)));
  return snap.empty ? null : snap.docs[0].data();
}

// ---- the user's logbook ----

export async function loadLogbook(email) {
  if (demo) return D.loadLogbook(email);
  email = lc(email);
  const { db, F, auth } = await sdk();
  const ref = F.doc(db, 'logbooks', email);
  let snap;
  try {
    snap = await F.getDoc(ref);
  } catch (e) {
    // offline and never loaded on this device: work with a default; saving later merges
    if (e?.code === 'unavailable') return defaultLogbook(email, auth.currentUser?.displayName || '');
    throw e;
  }
  if (snap.exists()) return { ...defaultLogbook(email), ...snap.data() };
  const doc = defaultLogbook(email, auth.currentUser && lc(auth.currentUser.email) === email ? auth.currentUser.displayName || '' : '');
  await queued(F.setDoc(ref, doc));
  return doc;
}

export async function saveLogbook(email, patch) {
  if (demo) return D.saveLogbook(email, patch);
  email = lc(email);
  const { db, F } = await sdk();
  const doc = plain({ ...patch, email, updatedAt: Date.now() });
  await queued(F.setDoc(F.doc(db, 'logbooks', email), doc, { merge: true }));
  return doc;
}

// Live list of the user's cases, newest first. Served from the offline cache when there is no
// signal. cb(cases, { fromCache, hasPendingWrites }). Returns an unsubscribe function.
const byNewest = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0);
export function watchCases(email, cb) {
  if (demo) return D.watchCases(email, cb);
  let stop = null, stopped = false;
  sdk().then(({ db, F }) => {
    if (stopped) return;
    stop = F.onSnapshot(F.collection(db, 'logbooks', lc(email), 'cases'), { includeMetadataChanges: true }, snap => {
      const cases = snap.docs.map(d => ({ ...d.data(), id: d.id })).sort(byNewest);
      cb(cases, { fromCache: snap.metadata.fromCache, hasPendingWrites: snap.metadata.hasPendingWrites });
    }, e => { console.error('Case listener failed', e); for (const l of syncErrorListeners) l(e); });
  });
  return () => { stopped = true; if (stop) stop(); };
}

export async function saveCase(email, c) {
  if (demo) return D.saveCase(email, c);
  const { db, F } = await sdk();
  const doc = cleanCase(c);
  await queued(F.setDoc(F.doc(db, 'logbooks', lc(email), 'cases', doc.id), doc));
  return doc;
}

export async function deleteCase(email, id) {
  if (demo) return D.deleteCase(email, id);
  const { db, F } = await sdk();
  await queued(F.deleteDoc(F.doc(db, 'logbooks', lc(email), 'cases', String(id))));
}

// Reflection figures: one doc per image (base64 < 700 KB) so reflection docs stay small. Owner only.
export async function saveImage(email, img) {
  if (demo) return D.saveImage(email, img);
  const { db, F } = await sdk();
  const doc = cleanImage(img);
  await queued(F.setDoc(F.doc(db, 'logbooks', lc(email), 'images', doc.id), doc));
  return doc;
}
export async function loadImage(email, id) {
  if (demo) return D.loadImage(email, id);
  const { db, F } = await sdk();
  try {
    const snap = await F.getDoc(F.doc(db, 'logbooks', lc(email), 'images', String(id)));
    return snap.exists() ? snap.data() : null;
  } catch (e) { console.warn('Could not load image', id, e); return null; }
}
export async function deleteImage(email, id) {
  if (demo) return D.deleteImage(email, id);
  const { db, F } = await sdk();
  await queued(F.deleteDoc(F.doc(db, 'logbooks', lc(email), 'images', String(id))));
}

// Live list of the user's reflections (owner only). cb(list, meta). Returns an unsubscribe function.
export function watchReflections(email, cb) {
  if (demo) return D.watchReflections(email, cb);
  let stop = null, stopped = false;
  sdk().then(({ db, F }) => {
    if (stopped) return;
    stop = F.onSnapshot(F.collection(db, 'logbooks', lc(email), 'reflections'), snap => {
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      cb(list, { fromCache: snap.metadata.fromCache });
    }, e => { console.error('Reflection listener failed', e); for (const l of syncErrorListeners) l(e); });
  });
  return () => { stopped = true; if (stop) stop(); };
}

export async function saveReflection(email, r) {
  if (demo) return D.saveReflection(email, r);
  const { db, F } = await sdk();
  const doc = cleanReflection(r);
  await queued(F.setDoc(F.doc(db, 'logbooks', lc(email), 'reflections', doc.id), doc));
  return doc;
}

export async function deleteReflection(email, id) {
  if (demo) return D.deleteReflection(email, id);
  const { db, F } = await sdk();
  await queued(F.deleteDoc(F.doc(db, 'logbooks', lc(email), 'reflections', String(id))));
}

async function inBatches(items, write, onBatch) {
  const { db, F } = await sdk();
  for (let i = 0; i < items.length; i += BATCH) {
    const b = F.writeBatch(db);
    const part = items.slice(i, i + BATCH);
    for (const it of part) write(b, it, F, db);
    await (onBatch ? onBatch(b, part, i + part.length, F, db) : queued(b.commit()));
  }
}

export async function saveCases(email, cases) {
  if (demo) return D.saveCases(email, cases);
  email = lc(email);
  const docs = cases.map(c => cleanCase(c));
  await inBatches(docs, (b, d, F, db) => b.set(F.doc(db, 'logbooks', email, 'cases', d.id), d));
  return docs;
}

export async function deleteCases(email, ids) {
  if (demo) return D.deleteCases(email, ids);
  email = lc(email);
  await inBatches(ids, (b, id, F, db) => b.delete(F.doc(db, 'logbooks', email, 'cases', String(id))));
}

// ---- summaries (counts only; everyone signed in can read them) ----

export async function writeSummary(rid, summary) {
  if (demo) return D.writeSummary(rid, summary);
  const { db, F } = await sdk();
  await queued(F.setDoc(F.doc(db, 'summaries', String(rid)), cleanSummary(rid, summary)));
}

export async function listSummaries() {
  if (demo) return D.listSummaries();
  const { db, F } = await sdk();
  return (await F.getDocs(F.collection(db, 'summaries'))).docs.map(d => d.data());
}

// ---- residents (admins) ----

export async function listResidents() {
  if (demo) return D.listResidents();
  const { db, F } = await sdk();
  return (await F.getDocs(F.collection(db, 'residents'))).docs.map(d => d.data())
    .sort((a, b) => String(a.rid).localeCompare(String(b.rid)));
}

export async function saveResident(r) {
  if (demo) return D.saveResident(r);
  const { db, F } = await sdk();
  const doc = cleanResident(r);
  await queued(F.setDoc(F.doc(db, 'residents', doc.rid), doc));
  return doc;
}

export async function deleteResident(rid) {
  if (demo) return D.deleteResident(rid);
  const { db, F } = await sdk();
  await F.deleteDoc(F.doc(db, 'residents', String(rid)));
}

// ---- shared templates (everyone reads, admins write) ----

export async function listSharedTemplates() {
  if (demo) return D.listSharedTemplates();
  const { db, F } = await sdk();
  return (await F.getDocs(F.collection(db, 'sharedTemplates'))).docs.map(d => ({ ...d.data(), id: d.id }));
}

export async function saveSharedTemplate(t) {
  if (demo) return D.saveSharedTemplate(t);
  const { db, F } = await sdk();
  const ref = t.id ? F.doc(db, 'sharedTemplates', String(t.id)) : F.doc(F.collection(db, 'sharedTemplates'));
  const doc = cleanTemplate({ ...t, id: ref.id });
  await queued(F.setDoc(ref, doc));
  return doc;
}

export async function deleteSharedTemplate(id) {
  if (demo) return D.deleteSharedTemplate(id);
  const { db, F } = await sdk();
  await F.deleteDoc(F.doc(db, 'sharedTemplates', String(id)));
}

// All cases in someone's logbook, read once (admins: to recount a summary after an import).
export async function listCases(email) {
  if (demo) return D.listCases(email);
  const { db, F } = await sdk();
  return (await F.getDocs(F.collection(db, 'logbooks', lc(email), 'cases'))).docs.map(d => ({ ...d.data(), id: d.id }));
}

// ---- import from the old Google Form (admins) ----
// Writes only cases whose importKey is not yet recorded in imports/{rid}, so re-running an import
// after new form responses costs only the new rows (the free tier allows 20k writes a day).
// Each batch also updates imports/{rid}, so an interrupted import resumes where it stopped.
// Case doc ids are derived from the importKey, so even a lost imports doc cannot duplicate cases.
// onProgress(done, total) after each batch. Returns { written, skipped }.
export async function importCases(email, rid, cases, onProgress) {
  if (demo) return D.importCases(email, rid, cases, onProgress);
  email = lc(email);
  rid = String(rid);
  const { db, F } = await sdk();
  const impRef = F.doc(db, 'imports', rid);
  const snap = await F.getDoc(impRef);
  // the record belongs to the address the cases went to: after an email fix, import again in full
  const prev = snap.exists() && (!snap.data().email || snap.data().email === email) ? snap.data().keys || [] : [];
  const known = new Set(prev);
  const fresh = [];
  for (const c of cases) {
    if (!c.importKey || known.has(c.importKey)) continue;
    known.add(c.importKey);   // also drops repeats within this upload
    fresh.push(cleanCase({ ...c, id: importDocId(c.importKey), source: 'import', createdAt: c.createdAt || c.timestamp }));
  }
  const done = new Set(prev);
  if (onProgress) onProgress(0, fresh.length);
  await inBatches(fresh, (b, d) => b.set(F.doc(db, 'logbooks', email, 'cases', d.id), d), async (b, part, n) => {
    for (const d of part) done.add(d.importKey);
    b.set(impRef, { email, keys: [...done], updatedAt: Date.now() });
    await b.commit();   // admins import online; wait for the server so progress is real
    if (onProgress) onProgress(n, fresh.length);
  });
  return { written: fresh.length, skipped: cases.length - fresh.length };
}

// ---- portfolio template (word-export; admins upload, everyone signed in reads) ----
// The blank APMES portfolio .docx, as base64 split into ≤700 KB chunks to stay under Firestore's 1 MiB doc limit:
// config/portfolioTemplate {parts, size, uploadedAt} + config/portfolioTemplate_part{i} {data}.
const TEMPLATE_CHUNK = 700 * 1024;

export async function saveTemplate(b64) {
  if (demo) return D.saveTemplate(b64);
  const { db, F } = await sdk();
  const parts = Math.ceil(b64.length / TEMPLATE_CHUNK) || 1;
  for (let i = 0; i < parts; i++) {
    await F.setDoc(F.doc(db, 'config', 'portfolioTemplate_part' + i), { data: b64.slice(i * TEMPLATE_CHUNK, (i + 1) * TEMPLATE_CHUNK) });
  }
  // the index doc goes last, so a reader never sees parts from a half-finished upload as complete
  await F.setDoc(F.doc(db, 'config', 'portfolioTemplate'), { parts, size: Math.floor(b64.length * 3 / 4), uploadedAt: Date.now() });
}

// { data: base64, size, uploadedAt } or null when none was uploaded.
export async function loadTemplate() {
  if (demo) return D.loadTemplate();
  const { db, F } = await sdk();
  const meta = await F.getDoc(F.doc(db, 'config', 'portfolioTemplate'));
  if (!meta.exists()) return null;
  const { parts, size, uploadedAt } = meta.data();
  const snaps = await Promise.all(Array.from({ length: parts }, (_, i) => F.getDoc(F.doc(db, 'config', 'portfolioTemplate_part' + i))));
  if (snaps.some(s => !s.exists())) return null;
  return { data: snaps.map(s => s.data().data).join(''), size, uploadedAt };
}
