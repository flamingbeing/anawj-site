// Storage for the logbook: Google sign-in and Cloud Firestore (Firebase), with an offline cache
// so logging works without signal and syncs later. With ?demo in the URL, everything goes to an
// in-browser stand-in instead (demo-backend.js), signed in as a fake admin. Cases, reflections and
// notes are read through the sync engine (sync.js): a copy on this device plus only what changed.
// Who may read or write what is enforced by firestore.rules on Google's side, not by this file.
//
// Data (see README.md):
//   admins/{email}                        { name }                       (added by hand in the console)
//   residents/{rid}                       { rid, name, email, status, intake, rYear, smo? }  (smo: years as an SMO, counted as R3)
//   logbooks/{email}                      { email, name, rid, settings, templates, updatedAt }
//   logbooks/{email}/cases/{caseId}       case object (see engine.js)
//   logbooks/{email}/reflections/{id} reflection object (see reflections.js), owner only
//   logbooks/{email}/images/{id}      { id, data (base64 JPEG), mime, w, h, createdAt }  reflection figures, owner only
//   logbooks/{email}/notes/{id}       { id, date, title, body, caseId?, createdAt, updatedAt }  personal notes (notepad.js), owner only
//   logbooks/{email}/bin/{id}         { id, kind: case | reflection | note, data, deletedAt }  recycle bin (30 days), owner only
//   logbooks/{email}/formGone/{caseId} { id, deletedAt }  Google Form cases deleted (kept for good, form-inbox.js), owner only
//   summaries/{rid}                       counts only, readable by everyone signed in
//   imports/{rid}                         { email, keys: [importKey], updatedAt }  (which old-form rows are in)
//   formInbox/{responseId}                { id, email, date, dateText, details, labels, submittedAt }  Google Form responses
//                                         waiting to be picked up (form-inbox.js); formBots/{uid} lists the bot that writes them
//   sharedTemplates/{id}                  { id, name, cats, details? }
//   feedback/{id}                         { uid, text, doing?, screen, version, ua, status, createdAt }  private feedback, app owner reads

import { FIREBASE_CONFIG } from './firebase-config.js';
import { checkWrite } from './recovery-store.js';
import { cleanProfile } from './profile.js';
import { mergePaths } from './profiles.js';
import { cleanNote } from './notepad.js';
import { createSyncHub, eachSettled, SKEW } from './sync.js';
import { openStore, wipeStores } from './store.js';
import { plain, cleanCase, cleanSummary, cleanResident, cleanTemplate, importDocId, defaultLogbook, cleanReflection, cleanImage, cleanCategoryNames, cleanSubmission } from './clean.js';
export { cleanSubmission };

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
export const demo = (() => {
  try { return typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo'); } catch { return false; }
})();
// the in-browser stand-in, loaded only in the demo (a real sign-in never fetches it)
const D = demo ? await import('./demo-backend.js') : null;
// Tests only: ?emulator on localhost uses the local Firebase emulators (Firestore and Auth) with the demo project, never
// the live one (tools/test-reads.sh). ?emulator=<firestore port>:<auth port>, default 8085:9099.
const emulator = (() => {
  try {
    if (demo || typeof location === 'undefined' || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return null;
    const v = new URLSearchParams(location.search).get('emulator');
    if (v === null) return null;
    const [fs, auth] = v.split(':').map(Number);
    return { fs: fs || 8085, auth: auth || 9099 };
  } catch { return null; }
})();
export const enabled = demo || !!emulator || !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

const BATCH = 450;            // Firestore allows 500 writes per batch; keep a margin
const ACK_WAIT = 3000;        // ms to wait for the server before treating a write as queued
const CLEAR_WAIT = 3000;      // ms to wait for the offline cache to clear on sign-out

let fb = null, dbReady = null;   // dbReady: set while signOut swaps in a fresh Firestore
async function sdk() {
  const s = await loadSdk();
  if (dbReady) await dbReady;
  return s;
}
function loadSdk() {
  if (fb) return fb;
  fb = (async () => {
    const [app, auth, fs] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js'),
    ]);
    const a = app.initializeApp(emulator ? { projectId: 'demo-logbook', apiKey: 'fake-api-key', authDomain: 'localhost' } : FIREBASE_CONFIG);
    const s = { app: a, auth: auth.getAuth(a), db: openDb(a, fs), A: auth, F: fs };
    if (emulator) auth.connectAuthEmulator(s.auth, 'http://127.0.0.1:' + emulator.auth, { disableWarnings: true });
    return s;
  })();
  fb.catch(() => { fb = null; });   // e.g. offline on first ever load: try again next time
  return fb;
}

// (the emulator again for the fresh Firestore a sign-out opens, or it looks for the live project and stays "offline")
function openDb(a, fs, memoryOnly = false) {
  const db = openCache(a, fs, memoryOnly);
  if (emulator) fs.connectFirestoreEmulator(db, '127.0.0.1', emulator.fs);
  return db;
}
function openCache(a, fs, memoryOnly) {
  if (memoryOnly) {
    try { return fs.initializeFirestore(a, { localCache: fs.memoryLocalCache() }); } catch (e) { return fs.getFirestore(a); }
  }
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
function queued(p, lateWrite = null) {
  let late = false;
  p.catch(e => { if (late) { console.error('Sync failed', e); for (const cb of syncErrorListeners) cb(e); } });
  // listed at once (a page closed within ACK_WAIT still stamps it after the next start), crossed off when the server has it
  if (lateWrite) { rememberLate(lateWrite); p.then(() => restampIfLate(lateWrite, true), () => forgetLate(lateWrite)); }
  return Promise.race([p, new Promise(r => setTimeout(() => { late = true; r(); }, ACK_WAIT))]);
}

// Writes that reach the server late (made offline) carry an updatedAt from when they were made, which other devices'
// "changed since my last sync" queries (sync.js) would skip. Once the server has them they are stamped again (one
// small write each, so a record deleted since doesn't stop the others). Every such write is listed in localStorage
// (ids only) until the server has it; one still waiting when the page closes is stamped after the next start, once
// Firestore has sent it.
const LATE_KEY = 'apmes-logbook-late:';
const late = (email, coll, ids, field = 'updatedAt') => ({ email: lc(email), coll, ids: ids.map(String), field, at: Date.now() });
const lateList = email => { try { return JSON.parse(localStorage.getItem(LATE_KEY + email) || '[]'); } catch { return []; } };
const lateSave = (email, l) => { try { if (l.length) localStorage.setItem(LATE_KEY + email, JSON.stringify(l.slice(-200))); else localStorage.removeItem(LATE_KEY + email); } catch { /* storage blocked */ } };
const sameLate = (a, b) => a.coll === b.coll && a.at === b.at && a.ids.join() === b.ids.join();
function rememberLate(w) { lateSave(w.email, [...lateList(w.email), w]); }
function forgetLate(w) { lateSave(w.email, lateList(w.email).filter(x => !sameLate(x, w))); }
async function restampIfLate(w, listed) {
  if (listed) forgetLate(w);
  if (Date.now() - w.at <= SKEW / 2) return;
  const now = Date.now(), { db, F } = await sdk();
  const done = await eachSettled(w.ids, id => F.updateDoc(F.doc(db, 'logbooks', w.email, w.coll, id), { [w.field]: now }));
  if (done.length < w.ids.length) console.warn(`${w.ids.length - done.length} late write(s) not stamped again (deleted since?)`);
}
const settled = new Set();
async function settleLate(email) {
  if (demo || settled.has(email) || !lateList(email).length) return;
  settled.add(email);
  const { db, F } = await sdk();
  await F.waitForPendingWrites(db);   // offline: resolves when signal returns and the server has them
  for (const w of lateList(email)) await restampIfLate(w, true);
}
// Sign-out, account switch, Delete account: stop syncing and delete this device's copies (a shared PC keeps nothing).
// proceed() is asked again once syncing has stopped: a tab that has seen a new sign-in by then leaves the stores alone.
// keep: the account signed in now (an account switch), whose store stays, here and in other tabs; so does the store
// of whoever is signed in by the time the wipe runs (a tab catching up on another tab's sign-out and sign-in).
export async function forgetLocal(proceed = () => true, keep = null) {
  await hub.stopAll();
  if (!proceed()) return;
  let now = null;
  try { if (!demo && fb) now = (await fb).auth.currentUser?.email || null; } catch { /* not loaded */ }
  await wipeStores([keep, now].filter(Boolean).map(lc));
  // late-write ids and the bin's last purge time (bin.js) are per account too
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(LATE_KEY) || k.startsWith('apmes-logbook-purged:')) localStorage.removeItem(k); } catch { /* storage blocked */ }
  settled.clear();
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
// Tests only (?emulator): sign in as a made-up Google account the Auth emulator accepts (email verified).
export async function emulatorSignIn(email) {
  if (!emulator) throw new Error('Only with ?emulator');
  const { auth, A } = await sdk();
  await A.signInWithCredential(auth, A.GoogleAuthProvider.credential(JSON.stringify({ sub: lc(email).replace(/\W/g, ''), email: lc(email), email_verified: true })));
}

// Sign in by redirect straight away in the installed app (display-mode standalone, or iOS's navigator.standalone)
// and on Firefox for Android: there a popup opens as a separate tab without its opener, so Google's handler signs
// in but can't hand back or close itself, leaving a blank tab (owner, 15 Oct 2026). authDomain is our own
// apmes.anawj.com, so the redirect keeps its storage; getRedirectResult on start finishes it. Elsewhere, the popup.
export const redirectFirst = ({ standalone = false, ua = '' } = {}) => standalone || (/Android/i.test(ua) && /Firefox\//i.test(ua));
const installedApp = () => {
  try { return !!(globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.matchMedia?.('(display-mode: fullscreen)').matches || globalThis.navigator?.standalone); } catch { return false; }
};
export async function signIn() {
  if (demo) return D.signIn();
  const { auth, A } = await sdk();
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (redirectFirst({ standalone: installedApp(), ua: globalThis.navigator?.userAgent || '' })) return A.signInWithRedirect(auth, provider);
  try {
    await A.signInWithPopup(auth, provider);
  } catch (e) {
    if (!REDIRECT_CODES.includes(e?.code)) throw e;
    await A.signInWithRedirect(auth, provider);
  }
}

// Signing out also wipes this device's offline copy of the cases (a shared theatre PC keeps nothing).
// True when every local change has reached the server within ms (offline: false). Signing out
// wipes the offline cache, so changes still waiting for signal would be lost.
export async function synced(ms = 4000) {
  if (demo) return true;
  const { db, F } = await sdk();
  return Promise.race([F.waitForPendingWrites(db).then(() => true, () => false), new Promise(r => setTimeout(() => r(false), ms))]);
}

// Demo only: wipe the in-browser demo data and start again with the made-up cases.
export function resetDemo() { if (demo) D.resetDemo(); }

export async function signOut() {
  if (demo) return D.signOut();
  const s = await sdk();
  await s.A.signOut(s.auth);
  // Every Firestore call waits for this, so nothing touches the terminated instance. Clearing the
  // cache never finishes while the logbook is open in another tab or the home-screen app, so give
  // up after a few seconds and run memory-only until the next reload.
  dbReady = (async () => {
    let cleared = false;
    try {
      await s.F.terminate(s.db);
      cleared = await Promise.race([s.F.clearIndexedDbPersistence(s.db).then(() => true, e => { console.warn('Could not clear the offline cache', e); return false; }), new Promise(r => setTimeout(() => r(false), CLEAR_WAIT))]);
    } catch (e) { console.warn('Could not clear the offline cache', e); }
    if (!cleared) console.warn('Offline cache not cleared (open in another tab?); using memory only until reload');
    s.db = openDb(s.app, s.F, !cleared);   // a fresh, empty Firestore for the next sign-in
  })();
  try { await dbReady; } finally { dbReady = null; }
}

// Delete the account (Account → Delete account; never offered to residents on the programme list):
// every case, reflection, photo and bin entry, a ready portfolio, the members entry and the logbook,
// then the Google sign-in itself. Firebase may ask to sign in again first (a recent sign-in is needed
// to delete one). onStep(text) reports progress.
export async function deleteAccount(email, onStep = () => {}) {
  if (demo) return D.deleteAccount(email);
  email = lc(email);
  const { db, F, auth, A } = await sdk();
  // Google must have signed you in within the last few minutes to delete the sign-in: ask first, while
  // the tap still counts (a popup after the deletes would be blocked, leaving the data gone but the sign-in)
  const me = auth.currentUser;
  if (me && !(Date.now() - Date.parse(me.metadata?.lastSignInTime || 0) < 4 * 60e3)) {
    onStep('Confirm with Google…');
    await A.reauthenticateWithPopup(me, new A.GoogleAuthProvider());
  }
  const wipe = async path => {
    const snap = await F.getDocs(F.collection(db, ...path));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = F.writeBatch(db);
      for (const d of snap.docs.slice(i, i + 400)) b.delete(d.ref);
      await b.commit();
    }
    return snap.size;
  };
  // stop the listeners first, so the deletions below don't each cost a check (the store goes at sign-out)
  await hub.stopAll();
  // first, so that if its rules aren't live yet (or are refused) this stops before anything else is gone
  onStep('Deleting deleted Form cases…');
  await wipe(['logbooks', email, 'formGone']);
  try {
    for (const [sub, label] of [['cases', 'cases'], ['reflections', 'reflections'], ['images', 'photos'], ['notes', 'notes'], ['meta', 'notes index'], ['bin', 'recycle bin']]) {
      onStep(`Deleting ${label}…`);
      await wipe(['logbooks', email, sub]);
    }
    onStep('Deleting the rest…');
    await wipe(['submissions', email, 'reflections']).catch(() => 0);
    await F.deleteDoc(F.doc(db, 'submissions', email)).catch(() => {});
    await F.deleteDoc(F.doc(db, 'members', email)).catch(() => {});
    await F.deleteDoc(F.doc(db, 'logbooks', email));
  } catch (e) { throw Object.assign(e, { started: true }); }   // part of it may be gone already
  onStep('Removing the sign-in…');
  const u = auth.currentUser;
  if (u) {
    try { await A.deleteUser(u); }
    catch (e) {
      if (e?.code !== 'auth/requires-recent-login') throw Object.assign(e, { dataGone: true });
      try { await A.reauthenticateWithPopup(u, new A.GoogleAuthProvider()); await A.deleteUser(u); }
      catch (e2) { throw Object.assign(e2, { dataGone: true }); }
    }
  }
  await signOut().catch(() => {});
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

// The app owner (owners/{email}, added in the Firebase console): reads logbooks and cases, imports.
export async function isAppOwner(email) {
  if (demo) return D.isAdmin(email);   // the demo admin plays the owner too
  const { db, F } = await sdk();
  try { return (await F.getDoc(F.doc(db, 'owners', lc(email)))).exists(); }
  catch (e) { if (e?.code !== 'permission-denied') console.warn('Owner check failed', e); return false; }
}

// ---- private feedback (More → Send feedback; owner reads it in More → Feedback). Never a GitHub issue. ----
// feedback/{id} { uid, text, doing?, screen, version, ua, status: 'new' | 'done', createdAt (server time) }
// Resolves true once the server has it, false when it is still queued on this device (offline: Firestore sends it later).
export async function sendFeedback(rec) {
  if (demo) return D.sendFeedback(rec);
  const { db, F } = await sdk();
  const p = F.addDoc(F.collection(db, 'feedback'), { ...rec, createdAt: F.serverTimestamp() });
  let late = false;   // a refusal after we've said "queued" goes to the sync-error banner; before that, to the caller
  p.catch(e => { if (late) { console.error('Feedback not sent', e); for (const cb of syncErrorListeners) cb(e); } });
  return Promise.race([p.then(() => true), new Promise(r => setTimeout(() => { late = true; r(false); }, ACK_WAIT))]);
}
// the app owner only (the rules refuse everyone else): newest first, at most 200
export async function listFeedback() {
  if (demo) return D.listFeedback();
  const { db, F } = await sdk();
  const snap = await F.getDocs(F.query(F.collection(db, 'feedback'), F.orderBy('createdAt', 'desc'), F.limit(200)));
  return snap.docs.map(d => { const x = d.data(); return { ...x, id: d.id, createdAt: x.createdAt?.toMillis?.() ?? null }; });
}
export async function setFeedbackStatus(id, status) {
  if (demo) return D.setFeedbackStatus(id, status);
  const { db, F } = await sdk();
  await F.updateDoc(F.doc(db, 'feedback', id), { status });
}
export async function deleteFeedback(id) {
  if (demo) return D.deleteFeedback(id);
  const { db, F } = await sdk();
  await F.deleteDoc(F.doc(db, 'feedback', id));
}

// Programme directors (pds/{email}, managed with the evals app) can read the shared totals.
export async function isPD(email) {
  if (demo) return false;
  const { db, F } = await sdk();
  try { return (await F.getDoc(F.doc(db, 'pds', lc(email)))).exists(); }
  catch (e) { if (e?.code !== 'permission-denied') console.warn('PD check failed', e); return false; }
}

// Active faculty (faculty/{email}, managed with the evals app) can read the counts summaries (Faculty / PCs profile).
export async function isFaculty(email) {
  if (demo) return false;
  const { db, F } = await sdk();
  try { const s = await F.getDoc(F.doc(db, 'faculty', lc(email))); return s.exists() && s.data().status === 'ACTIVE'; }
  catch (e) { if (e?.code !== 'permission-denied') console.warn('Faculty check failed', e); return false; }
}

export async function myResident(email) {
  if (demo) return D.myResident(email);
  const { db, F } = await sdk();
  const snap = await F.getDocs(F.query(F.collection(db, 'residents'), F.where('email', '==', lc(email)), F.limit(1)));
  return snap.empty ? null : snap.docs[0].data();
}

// ---- the user's logbook ----

// { cached: true }: this device's offline copy when it has one (no wait for the server), else the server.
export async function loadLogbook(email, { cached = false } = {}) {
  if (demo) return D.loadLogbook(email);
  email = lc(email);
  const { db, F, auth } = await sdk();
  const ref = F.doc(db, 'logbooks', email);
  if (cached) {
    try { const c = await F.getDocFromCache(ref); if (c.exists()) return { ...defaultLogbook(email), ...c.data() }; } catch { /* not on this device yet */ }
  }
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
  const doc = plain({ ...patch, ...(patch && 'profile' in patch ? { profile: cleanProfile(patch.profile) } : {}), email, updatedAt: Date.now() });
  // each settings key replaced whole, `show` key by key (profiles.js mergePaths; a plain merge would keep the keys a
  // map like settings.markdown leaves out)
  await queued(F.setDoc(F.doc(db, 'logbooks', email), doc, { mergeFields: mergePaths(doc).map(p => new F.FieldPath(...p)) }));
  return doc;
}

// ---- the synced collections (sync.js): cases, reflections, notes, each with a copy on this device ----
// Firestore's side of the engine: the collection (since null) or the documents changed since a time, live. With
// ?emulator, window.__reads counts documents read: billed (each listen's first server result in full, at least
// one, as Firestore charges a listener started cold, plus every change after) and served (changes only).
const reads = emulator && typeof window !== 'undefined' ? (window.__reads = {}) : null;
const count = (coll, k, n) => { const r = (reads[coll] ||= { billed: 0, served: 0, listens: 0 }); r[k] += n; };
function listenFirestore(email, coll, { since = null, field = 'updatedAt' } = {}, onSnap, onError) {
  let stop = null, stopped = false, first = true;
  sdk().then(({ db, F }) => {
    if (stopped) return;
    const col = F.collection(db, 'logbooks', lc(email), coll);
    if (reads) count(coll, 'listens', 1);
    // with metadata changes, so the engine learns when the server has confirmed an unchanged offline copy
    stop = F.onSnapshot(since === null ? col : F.query(col, F.where(field, '>', since)), { includeMetadataChanges: true }, snap => {
      const server = !snap.metadata.fromCache, full = since === null && first && server;
      // pending: this device's write is not on the server yet (if it is refused, the record leaves again: checked)
      const changes = snap.docChanges().map(c => ({ type: c.type, id: c.doc.id, pending: c.doc.metadata.hasPendingWrites, doc: c.type === 'removed' ? null : { ...c.doc.data(), id: c.doc.id } }));
      if (reads && server) {
        const n = changes.filter(c => c.type !== 'removed').length;
        count(coll, 'served', n);
        count(coll, 'billed', first ? Math.max(1, snap.size) : n);
      }
      if (server) first = false;
      onSnap({ changes, fromCache: !server, hasPendingWrites: snap.metadata.hasPendingWrites, ...(full ? { full: true, docs: snap.docs.map(d => ({ ...d.data(), id: d.id })) } : {}) });
    }, onError);
  }).catch(onError);
  return () => { stopped = true; if (stop) stop(); };
}
async function fetchFirestore(email, coll, id) {
  const { db, F } = await sdk();
  const snap = await F.getDocFromServer(F.doc(db, 'logbooks', lc(email), coll, String(id)));
  if (reads) count(coll, 'billed', 1);
  return snap.exists() ? { ...snap.data(), id: snap.id } : null;
}
const hub = createSyncHub({
  openStore,
  listen: demo ? D.listenSince : listenFirestore,
  fetchOne: demo ? D.fetchOne : fetchFirestore,
  onError: e => { console.error('Sync listener failed', e); for (const l of syncErrorListeners) l(e); },
});
const watchColl = (coll, sort) => (email, cb) => {
  settleLate(lc(email)).catch(e => console.warn('Late writes not stamped', e));
  return hub.watch(lc(email), coll, (list, meta) => cb(sort ? list.sort(sort) : list, meta));
};
// tests: wait until the engines' local writes are done
export const syncFlush = () => hub.flush();

// Live list of the user's cases, newest first, from this device's copy, then the server's changes.
// cb(cases, { fromCache, hasPendingWrites }). Returns an unsubscribe function.
const byNewest = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0);
export const watchCases = watchColl('cases', byNewest);

export async function saveCase(email, c) {
  if (demo) return D.saveCase(email, c);
  const { db, F } = await sdk();
  const doc = cleanCase(c);
  await queued(F.setDoc(F.doc(db, 'logbooks', lc(email), 'cases', doc.id), doc), late(email, 'cases', [doc.id]));
  return doc;
}

// The recovery queue supplies durable offline storage. On reconnect, a transaction
// checks the version the editor started from before replacing an existing record.
// No new document fields/permissions are needed; history remains private to this device.
const CLEAN = { case: cleanCase, reflection: cleanReflection, note: cleanNote };
const COLLECTION = { case: 'cases', reflection: 'reflections', note: 'notes' };
export function cleanWrite(kind, input) { return input._deleted ? { id: String(input.id), _deleted: true } : CLEAN[kind](input); }
// Every note write comes through here too (notes: saved after a pause in typing, ui-notepad.js)
export async function commitRecord(email, kind, input, base) {
  const collection = COLLECTION[kind];
  const deleted = input._deleted === true;
  const doc = cleanWrite(kind, input);
  const canonical = value => value ? CLEAN[kind](value, 0) : null;
  const compare = current => checkWrite(canonical(current), deleted ? null : doc, canonical(base));
  if (demo) {
    const list = kind === 'case' ? await D.listCases(email) : kind === 'note' ? D.notesOf(lc(email)) : D.reflectionsOf(lc(email));
    const current = list.find(x => x.id === doc.id) || null;
    if (!compare(current)) return doc;
    if (deleted) await hub.drop(lc(email), collection, [doc.id]);
    if (kind === 'note') return deleted ? (D.deleteNote(email, doc.id), doc) : D.saveNote(email, doc);
    if (deleted) { await (kind === 'case' ? D.deleteCase(email, doc.id) : D.deleteReflection(email, doc.id)); return doc; }
    return kind === 'case' ? D.saveCase(email, doc) : D.saveReflection(email, doc);
  }
  const { db, F } = await sdk();
  const ref = F.doc(db, 'logbooks', lc(email), collection, doc.id);
  const out = await F.runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? { ...snap.data(), id: snap.id } : null;
    if (!compare(current)) return doc;
    if (deleted) tx.delete(ref); else tx.set(ref, doc); return doc;
  });
  // a delete for good: off this device's copy too (other devices: see sync.js, Limits)
  if (deleted) await hub.drop(lc(email), collection, [doc.id]);
  return out;
}

export async function deleteCase(email, id) {
  await hub.drop(lc(email), 'cases', [String(id)]);
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

// Live list of the user's reflections (owner only), latest change first. cb(list, meta). Returns an unsubscribe function.
export const watchReflections = watchColl('reflections', (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

// Live list of the user's notes (owner only). Started only when notes are needed (ui-notepad.js), never at sign-in.
export const watchNotes = watchColl('notes');

// Which days and cases have notes ({ days, cases, n }), so the Logbook can mark them without reading a note. Its own
// owner-only doc (logbooks/{email}/meta/noteIndex), not the logbook doc, which the app owner can read. One small read
// when the Logbook first needs it. cb(index or null, meta). Returns an unsubscribe function.
export function watchNoteIndex(email, cb) {
  if (demo) return D.watchNoteIndex(email, cb);
  let stop = null, stopped = false;
  sdk().then(({ db, F }) => {
    if (stopped) return;
    stop = F.onSnapshot(F.doc(db, 'logbooks', lc(email), 'meta', 'noteIndex'), snap => {
      cb(snap.exists() ? snap.data() : null, { fromCache: snap.metadata.fromCache });
    }, e => console.error('Note index listener failed', e));
  });
  return () => { stopped = true; if (stop) stop(); };
}
export async function saveNoteIndex(email, idx) {
  if (demo) return D.saveNoteIndex(email, idx);
  const { db, F } = await sdk();
  const doc = { days: idx.days, cases: idx.cases, n: idx.n, updatedAt: Date.now() };
  await queued(F.setDoc(F.doc(db, 'logbooks', lc(email), 'meta', 'noteIndex'), doc));
  return doc;
}

export async function saveReflection(email, r) {
  if (demo) return D.saveReflection(email, r);
  const { db, F } = await sdk();
  const doc = cleanReflection(r);
  await queued(F.setDoc(F.doc(db, 'logbooks', lc(email), 'reflections', doc.id), doc), late(email, 'reflections', [doc.id]));
  return doc;
}

export async function deleteReflection(email, id) {
  await hub.drop(lc(email), 'reflections', [String(id)]);
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
  await inBatches(docs, (b, d, F, db) => b.set(F.doc(db, 'logbooks', email, 'cases', d.id), d),
    (b, part) => queued(b.commit(), late(email, 'cases', part.map(d => d.id))));
  return docs;
}

// Restore from a backup (kind 'case' or 'reflection'): writes only the records the server doesn't have. One already
// there is never written, even when it differs: it may have been changed since the backup was made (a restore used to
// write the backup's older copy over it), and a restore only adds what is missing. The ids are looked up on the server
// first, 30 at a time and four lookups at once (a read for each one found, at least one per lookup; about 13 rounds for
// 1,500 cases), then the missing ones go in batches. Needs signal. -> the docs written
export async function addMissing(email, kind, records) {
  const coll = COLLECTION[kind];
  const docs = [...new Map(records.map(r => CLEAN[kind](r)).map(d => [d.id, d])).values()];
  if (demo) {
    const have = new Set((kind === 'case' ? await D.listCases(email) : D.reflectionsOf(lc(email))).map(x => x.id));
    const out = docs.filter(d => !have.has(d.id));
    if (kind === 'case') return out.length ? D.saveCases(email, out) : [];
    const saved = [];
    for (const d of out) saved.push(await D.saveReflection(email, d));
    return saved;
  }
  email = lc(email);
  const { db, F } = await sdk();
  const have = new Set();
  const lookup = async ids => {
    const snap = await F.getDocsFromServer(F.query(F.collection(db, 'logbooks', email, coll), F.where(F.documentId(), 'in', ids)));
    if (reads) count(coll, 'billed', Math.max(1, snap.size));
    for (const d of snap.docs) have.add(d.id);
  };
  try {
    for (let i = 0; i < docs.length; i += 30 * 4)
      await Promise.all([0, 1, 2, 3].map(k => docs.slice(i + 30 * k, i + 30 * (k + 1)).map(d => d.id)).filter(ids => ids.length).map(lookup));
  } catch (e) { throw e && e.code === 'unavailable' ? new Error('no signal (a restore first checks what your logbook already has). Try again with signal.') : e; }
  const out = docs.filter(d => !have.has(d.id));
  await inBatches(out, (b, d, F, db) => b.set(F.doc(db, 'logbooks', email, coll, d.id), d),
    (b, part) => queued(b.commit(), late(email, coll, part.map(d => d.id))));
  return out;
}

// for good (no bin entry): Undo of a plan's "done" or of a pasted list, and after the bin copy
export async function deleteCases(email, ids) {
  await hub.drop(lc(email), 'cases', ids.map(String));
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
  // their row on Totals goes too (they can no longer write it, so it would stay frozen)
  await F.deleteDoc(F.doc(db, 'summaries', String(rid))).catch(err => console.warn('summary not removed', err));
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

// ---- the Google Form inbox: formInbox/{responseId}, written by the Form's Apps Script (form-inbox.js) ----
// The resident's own entries (the rules let each person read and delete only entries with their email). Read from
// the server, never the offline cache, so an entry already picked up on another device isn't added twice.
export async function listFormEntries(email) {
  if (demo) return D.listFormEntries ? D.listFormEntries(email) : [];
  const { db, F } = await sdk();
  const snap = await F.getDocsFromServer(F.query(F.collection(db, 'formInbox'), F.where('email', '==', lc(email))));
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}
// One entry at a time, its case (if any) and the entry's delete in one batch, waiting for the server: they land
// together or not at all, so a case is never lost with its entry, and an entry already picked up on another device
// (its delete refused) holds up only itself. items: [{ id: inbox id, case: case to save or null, mark: { id, importKey,
// updatedAt } or null (a case kept as the app has it: only its key changes) }]. -> ids done
export async function commitFormPickup(email, items) {
  if (demo) return D.commitFormPickup ? D.commitFormPickup(email, items) : [];
  email = lc(email);
  const { db, F } = await sdk();
  const done = [];
  for (const it of items) {
    const b = F.writeBatch(db);
    if (it.case) {
      const d = cleanCase(it.case);
      // the key's '@<ms>' (form-inbox.js keyOf) is the updatedAt written now: each entry waits for the server, so a
      // later one stamped with the pick-up's start would look edited in the app and lose the response's next edit
      if (d.source === 'form' && d.importKey) d.importKey = String(d.importKey).replace(/@\d+$/, '@' + d.updatedAt);
      b.set(F.doc(db, 'logbooks', email, 'cases', d.id), d);
    } else if (it.mark) b.update(F.doc(db, 'logbooks', email, 'cases', String(it.mark.id)), { importKey: String(it.mark.importKey), updatedAt: Math.max(Date.now(), Number(it.mark.updatedAt) || 0) });
    b.delete(F.doc(db, 'formInbox', String(it.id)));
    try { await b.commit(); done.push(String(it.id)); }
    catch (err) { console.warn('Google Form entry not picked up', it.id, err.message); }
  }
  return done;
}

// New app cases for the response sheet (sheet-outbox.js). Each entry is its own small write; offline they wait in
// Firestore's queue with the rest. An entry already there (a retried save) is refused by the rules: fine.
export async function queueSheetRows(email, entries) {
  if (!entries.length) return;
  if (demo) return D.queueSheetRows(entries);
  const { db, F } = await sdk();
  await Promise.allSettled(entries.map(e => queued(F.setDoc(F.doc(db, 'sheetOutbox', String(e.id)), plain(e)))));
}
// A case deleted before the script has picked it up. Best effort: an entry already gone has nothing to delete (the rules
// allow that, so a delete sent late, offline, raises no sync error).
export async function dropSheetRows(email, ids) {
  if (!ids.length) return;
  if (demo) return D.dropSheetRows(ids);
  const { db, F } = await sdk();
  await Promise.allSettled(ids.map(id => queued(F.deleteDoc(F.doc(db, 'sheetOutbox', String(id))))));
}

// The one-off initials fix (the app owner): every logbook's email, then the fixed cases written back.
// fixes: [{ id, initials, details }] from engine.js initialsFixes. onProgress(done, total) after each batch.
export async function listLogbookEmails() {
  if (demo) return D.listLogbookEmails();
  const { db, F } = await sdk();
  return (await F.getDocs(F.collection(db, 'logbooks'))).docs.map(d => d.id);
}
export async function fixCaseInitials(email, fixes, onProgress) {
  if (demo) return D.fixCaseInitials(email, fixes, onProgress);
  email = lc(email);
  const now = Date.now();
  await inBatches(fixes, (b, f, F, db) => b.update(F.doc(db, 'logbooks', email, 'cases', f.id), { initials: f.initials, details: f.details, updatedAt: now }),
    async (b, part, n) => { await b.commit(); if (onProgress) onProgress(n, fixes.length); });
  return fixes.length;
}

// ---- import from the old Google Form (admins) ----
// Writes only cases whose importKey is not yet recorded in imports/{rid}, so re-running an import
// after new form responses costs only the new rows (the free tier allows 20k writes a day).
// Each batch also updates imports/{rid}, so an interrupted import resumes where it stopped.
// Case doc ids are derived from the importKey, so even a lost imports doc cannot duplicate cases.
// have: ids of the cases already in the logbook (listCases). A row whose case is already there is never written
// again, even when the record lacks its key (a case written by another route, or a lost record): writing it would
// overwrite the resident's own edits, links and tags with the sheet's text. Its key is added to the record.
// onProgress(done, total) after each batch. Returns { written, skipped }.
export async function importCases(email, rid, cases, onProgress, { have = [] } = {}) {
  if (demo) return D.importCases(email, rid, cases, onProgress, { have });
  email = lc(email);
  rid = String(rid);
  const { db, F } = await sdk();
  const impRef = F.doc(db, 'imports', rid);
  const snap = await F.getDoc(impRef);
  // the record belongs to the address the cases went to: after an email fix, import again in full
  const prev = snap.exists() && (!snap.data().email || snap.data().email === email) ? snap.data().keys || [] : [];
  const known = new Set(prev), there = new Set(have), found = [];
  const fresh = [];
  for (const c of cases) {
    if (!c.importKey || known.has(c.importKey)) continue;
    known.add(c.importKey);   // also drops repeats within this upload
    const id = importDocId(c.importKey);
    if (there.has(id)) { found.push(c.importKey); continue; }
    fresh.push(cleanCase({ ...c, id, source: 'import', createdAt: c.createdAt || c.timestamp }));
  }
  const done = new Set([...prev, ...found]);
  if (found.length && !fresh.length) await F.setDoc(impRef, { email, keys: [...done], updatedAt: Date.now() });
  if (onProgress) onProgress(0, fresh.length);
  await inBatches(fresh, (b, d) => b.set(F.doc(db, 'logbooks', email, 'cases', d.id), d), async (b, part, n) => {
    for (const d of part) done.add(d.importKey);
    b.set(impRef, { email, keys: [...done], updatedAt: Date.now() });
    await b.commit();   // admins import online; wait for the server so progress is real
    if (onProgress) onProgress(n, fresh.length);
  });
  return { written: fresh.length, skipped: cases.length - fresh.length };
}

// ---- ready portfolios: submissions/{email} (the resident writes; admins read) ----
// A copy of only what the portfolio needs, made when the resident marks it ready: the meta doc
// { email, rid, name, intake, rYear, smo, readyAt, updatedAt, fp, count, profile, counts, imageIds }
// (counts = Section 4 numbers per category and year, never case details) and a sub-collection
// reflections/{id} (the ticked ones). Figures aren't copied (they're most of the size): imageIds lists
// them, and the rules let admins read just those from the resident's images. Admins never read
// logbooks, cases or other reflections.
export async function submitPortfolio(email, meta, reflections) {
  if (demo) return D.submitPortfolio(email, meta, reflections);
  const { db, F } = await sdk();
  const base = ['submissions', lc(email)];
  const keepR = new Set(reflections.map(r => r.id));
  for (const r of reflections) await F.setDoc(F.doc(db, ...base, 'reflections', r.id), cleanReflection(r));
  // what an earlier copy had that this one doesn't
  for (const s of (await F.getDocs(F.collection(db, ...base, 'reflections'))).docs) if (!keepR.has(s.id)) await F.deleteDoc(s.ref);
  // the meta doc last, so admins never see a half-written copy as ready
  const doc = cleanSubmission(email, meta);
  await F.setDoc(F.doc(db, ...base), doc);
  return doc;
}
export async function withdrawPortfolio(email) {
  if (demo) return D.withdrawPortfolio(email);
  const { db, F } = await sdk();
  const base = ['submissions', lc(email)];
  await F.deleteDoc(F.doc(db, ...base));
  for (const s of (await F.getDocs(F.collection(db, ...base, 'reflections'))).docs) await F.deleteDoc(s.ref);
}
export async function loadMySubmission(email) {
  if (demo) return D.loadMySubmission(email);
  const { db, F } = await sdk();
  try { const s = await F.getDoc(F.doc(db, 'submissions', lc(email))); return s.exists() ? s.data() : null; }
  catch (e) { console.warn('submission not loaded', e); return null; }
}
// admins: every ready portfolio's meta doc
export async function listSubmissions() {
  if (demo) return D.listSubmissions();
  const { db, F } = await sdk();
  return (await F.getDocs(F.collection(db, 'submissions'))).docs.map(d => d.data());
}
// admins: one ready portfolio in full { meta, reflections, images: { id: img } }
export async function loadSubmission(email) {
  if (demo) return D.loadSubmission(email);
  const { db, F } = await sdk();
  const base = ['submissions', lc(email)];
  const meta = await F.getDoc(F.doc(db, ...base));
  if (!meta.exists()) return null;
  const reflections = (await F.getDocs(F.collection(db, ...base, 'reflections'))).docs.map(d => d.data());
  // the figures, from the resident's own images (only the ones the copy lists are readable)
  const images = {};
  for (const id of meta.data().imageIds || []) {
    try { const s = await F.getDoc(F.doc(db, 'logbooks', lc(email), 'images', String(id))); if (s.exists()) images[id] = s.data(); }
    catch (e) { console.warn('figure not loaded', id, e); }
  }
  return { meta: meta.data(), reflections, images };
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

// Residents left off Totals (config/totalsHidden: attrited; admins write, everyone signed in reads).
const cleanRids = rids => [...new Set((Array.isArray(rids) ? rids : []).map(String))].sort().slice(0, 500);
export async function loadTotalsHidden() {
  if (demo) return D.loadTotalsHidden();
  const { db, F } = await sdk();
  try { const s = await F.getDoc(F.doc(db, 'config', 'totalsHidden')); return s.exists() ? cleanRids(s.data().rids) : []; }
  catch (e) { console.warn('Hidden list not loaded', e); return []; }
}
export async function saveTotalsHidden(rids) {
  if (demo) return D.saveTotalsHidden(rids);
  const { db, F } = await sdk();
  await queued(F.setDoc(F.doc(db, 'config', 'totalsHidden'), { rids: cleanRids(rids), updatedAt: Date.now() }));
}

// Category display names (config/categoryNames, admins write, everyone signed in reads).
export async function loadCategoryNames() {
  if (demo) return D.loadCategoryNames();
  const { db, F } = await sdk();
  try { const s = await F.getDoc(F.doc(db, 'config', 'categoryNames')); return s.exists() ? cleanCategoryNames(s.data().names) : {}; }
  catch (e) { console.warn('Category names not loaded', e); return {}; }
}
export async function saveCategoryNames(names) {
  if (demo) return D.saveCategoryNames(names);
  const { db, F } = await sdk();
  const n = cleanCategoryNames(names);
  await queued(F.setDoc(F.doc(db, 'config', 'categoryNames'), { names: n, updatedAt: Date.now() }));
  return n;
}

// Remove the template: the index doc first (so nobody reads a half-deleted one), then its parts.
export async function deleteTemplate() {
  if (demo) return D.deleteTemplate();
  const { db, F } = await sdk();
  const meta = await F.getDoc(F.doc(db, 'config', 'portfolioTemplate'));
  const parts = meta.exists() ? Number(meta.data().parts) || 0 : 0;
  await F.deleteDoc(F.doc(db, 'config', 'portfolioTemplate'));
  for (let i = 0; i < Math.max(parts, 1); i++) await F.deleteDoc(F.doc(db, 'config', 'portfolioTemplate_part' + i)).catch(() => {});
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

// ---- recycle bin (bin agent): logbooks/{email}/bin/{id} = { id, kind: reflection | case, data, deletedAt }, owner only ----
// Deleted cases and reflections are kept here for 30 days (js/bin.js purges older entries after sign-in).
const cleanBinEntry = e => plain({ id: String(e.id), kind: e.kind, data: e.data, deletedAt: Number(e.deletedAt) || Date.now() });
export { cleanBinEntry };
export function watchBin(email, cb) {
  if (demo) return D.watchBin(email, cb);
  let stop = null, stopped = false;
  sdk().then(({ db, F }) => {
    if (stopped) return;
    stop = F.onSnapshot(F.collection(db, 'logbooks', lc(email), 'bin'), snap => {
      cb(snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0)), { fromCache: snap.metadata.fromCache });
    }, e => { console.error('Bin listener failed', e); for (const l of syncErrorListeners) l(e); });
  });
  return () => { stopped = true; if (stop) stop(); };
}
// server: true reads the server's copy, never a possibly stale offline cache (and fails offline)
export async function listBin(email, { server = false } = {}) {
  if (demo) return D.listBin(email);
  const { db, F } = await sdk();
  const snap = await (server ? F.getDocsFromServer : F.getDocs)(F.collection(db, 'logbooks', lc(email), 'bin'));
  return snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
}
export async function saveBinEntry(email, entry) {
  if (demo) return D.saveBinEntry(email, entry);
  const { db, F } = await sdk();
  const doc = cleanBinEntry(entry);
  await queued(F.setDoc(F.doc(db, 'logbooks', lc(email), 'bin', doc.id), doc), late(email, 'bin', [doc.id], 'deletedAt'));
  return doc;
}
export async function deleteBinEntry(email, id) {
  if (demo) return D.deleteBinEntry(email, id);
  const { db, F } = await sdk();
  await queued(F.deleteDoc(F.doc(db, 'logbooks', lc(email), 'bin', String(id))));
}
// Google Form cases deleted (form-inbox.js): logbooks/{email}/formGone/{caseId} = { id, deletedAt }, owner only, kept
// after the bin entry goes, so an edited or re-sent response never brings the case back. ids: any case ids; only Form
// cases' (formCaseId) are kept. Written again when a bin entry goes for good (covers deletes made by older versions).
const FORM_CASE_ID = /^imp_form~003a[A-Za-z0-9_-]{1,120}$/;
export async function addFormGone(email, ids) {
  const list = [...new Set((ids || []).map(String).filter(id => FORM_CASE_ID.test(id)))];
  if (!list.length) return;
  if (demo) return D.addFormGone ? D.addFormGone(email, list) : undefined;
  const { db, F } = await sdk();
  const now = Date.now();
  await Promise.all(list.map(id => queued(F.setDoc(F.doc(db, 'logbooks', lc(email), 'formGone', id), { id, deletedAt: now }))));
}
// the ids, from the server (a pick-up needs the real list; fails offline)
export async function listFormGone(email) {
  if (demo) return D.listFormGone ? D.listFormGone(email) : [];
  const { db, F } = await sdk();
  return (await F.getDocsFromServer(F.collection(db, 'logbooks', lc(email), 'formGone'))).docs.map(d => d.id);
}
// ---- end recycle bin ----
