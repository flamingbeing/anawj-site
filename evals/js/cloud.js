// Storage for evaluations: Google sign-in and Cloud Firestore (Firebase, the logbook's project), with
// an offline cache so an assessor can fill in a form without signal and it syncs later. With ?demo in
// the URL, everything goes to an in-browser stand-in instead (demo-backend.js) and Firebase is never
// loaded. Who may read or write what is enforced by logbook/firestore.rules on Google's side.
//
// Data (see SPEC.md):
//   admins/{email}, pds/{email}            roles (added by hand / by admins)
//   residents/{rid}                        { rid, name, email, status, intake, rYear }   admins or PDs write
//   faculty/{email}                        { email, name, status: ACTIVE|INACTIVE, updatedAt }   admins or PDs write
//   applications/{uid}                     { uid, email, name, role, note, status, createdAt, decidedAt?, decidedBy? }
//   evaluations/{id}                       see EVAL_FIELDS in demo-backend.js

import { FIREBASE_CONFIG } from './firebase-config.js';
import * as D from './demo-backend.js';
import { plain, lc, cleanEval, cleanPatch, stampPatch, cleanFaculty, cleanResident, cleanApplication, newRid } from './demo-backend.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
export const demo = (() => {
  try { return typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo'); } catch { return false; }
})();
export const enabled = demo || !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
// Email-link sign-in (hospital addresses) waits for the paid plan; Google only for now.
export const EMAIL_LINK = false;
// Demo role switch (More); harmless no-ops outside the demo.
export const DEMO_USERS = D.DEMO_USERS;
export const demoRole = () => (demo ? D.demoRole() : null);
export const setDemoRole = role => { if (demo) D.setDemoRole(role); };
export const resetDemo = opts => { if (demo) D.resetDemo(opts); };

export const SENT = ['requested', 'submitted', 'declined', 'cancelled'];
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

// ---- writes that work offline ----
// Firestore applies a write to the local cache at once (listeners fire straight away) but the
// promise only settles when the server confirms. Offline that can be hours, so wait a little and
// then return; a later failure (e.g. a rules rejection) is reported to onSyncError listeners.
const syncErrorListeners = new Set();
export function onSyncError(cb) {
  if (demo) return D.onSyncError(cb);
  syncErrorListeners.add(cb);
  return () => syncErrorListeners.delete(cb);
}
function queued(p) {
  let late = false;
  p.catch(e => { if (late) { console.error('Sync failed', e); for (const cb of syncErrorListeners) cb(e); } });
  return Promise.race([p, new Promise(r => setTimeout(() => { late = true; r(); }, ACK_WAIT))]);
}
// a read that answers null instead of failing when access is denied or the device is offline
const soft = p => p.catch(e => {
  if (!['permission-denied', 'unavailable'].includes(e?.code)) console.warn('Read failed', e);
  return null;
});

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

// Signing out also wipes this device's offline copy (a shared ward PC keeps nothing).
export async function signOut() {
  // the assessor's unsent answers on this device go too
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('evals-draft-')) localStorage.removeItem(k); } catch {}
  if (demo) return D.signOut();
  const s = await sdk();
  for (const stop of [...live]) stop();   // before auth changes, so no listener fails as permission-denied
  await s.A.signOut(s.auth);
  try {
    await s.F.terminate(s.db);
    await s.F.clearIndexedDbPersistence(s.db);
  } catch (e) { console.warn('Could not clear the offline cache', e); }
  s.db = openDb(s.app, s.F);   // a fresh, empty Firestore for the next sign-in
  known.clear();
}

// ---- roles ----

// { admin, pd, resident: residents doc|null (ACTIVE preferred), faculty: faculty doc|null, application: own application|null }
export async function getRoles(email) {
  if (demo) return D.getRoles(email);
  email = lc(email);
  const { db, F, auth } = await sdk();
  const uid = auth.currentUser?.uid;
  const [adm, pd, res, fac, app] = await Promise.all([
    soft(F.getDoc(F.doc(db, 'admins', email))),
    soft(F.getDoc(F.doc(db, 'pds', email))),
    soft(F.getDocs(F.query(F.collection(db, 'residents'), F.where('email', '==', email), F.limit(5)))),
    soft(F.getDoc(F.doc(db, 'faculty', email))),
    uid ? soft(F.getDoc(F.doc(db, 'applications', uid))) : null,
  ]);
  const residents = res ? res.docs.map(d => d.data()).sort((a, b) => (b.status === 'ACTIVE') - (a.status === 'ACTIVE')) : [];
  // members/{email} → { rid }: lets the rules tell a resident by email (needed to read the faculty list)
  if (residents[0]) {
    const m = await soft(F.getDoc(F.doc(db, 'members', email)));
    if (!m?.exists() || m.data().rid !== residents[0].rid) await soft(queued(F.setDoc(F.doc(db, 'members', email), { rid: String(residents[0].rid) })));
  }
  return {
    admin: !!adm?.exists(),
    pd: !!pd?.exists(),
    resident: residents[0] || null,
    faculty: fac?.exists() ? fac.data() : null,
    application: app?.exists() ? app.data() : null,
  };
}

// ---- people lists (admins and PDs write; everyone signed in reads the faculty list) ----

export async function listFaculty() {
  if (demo) return D.listFaculty();
  const { db, F } = await sdk();
  return (await F.getDocs(F.collection(db, 'faculty'))).docs.map(d => d.data())
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function saveFaculty(f) {
  if (demo) return D.saveFaculty(f);
  const { db, F } = await sdk();
  const doc = cleanFaculty(f);
  await queued(F.setDoc(F.doc(db, 'faculty', doc.email), doc));
  return doc;
}

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

// ---- applications to join as faculty or resident ----

export async function applyForRole({ role, name, note } = {}) {
  if (demo) return D.applyForRole({ role, name, note });
  const { db, F, auth } = await sdk();
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in first');
  const ref = F.doc(db, 'applications', u.uid);
  const prev = await soft(F.getDoc(ref));
  const doc = cleanApplication({ uid: u.uid, email: u.email, name: name || u.displayName || '', role, note, status: 'pending',
    createdAt: prev?.exists() ? prev.data().createdAt : undefined });
  await queued(F.setDoc(ref, doc));
  return doc;
}

export async function listApplications() {
  if (demo) return D.listApplications();
  const { db, F } = await sdk();
  return (await F.getDocs(F.collection(db, 'applications'))).docs.map(d => d.data())
    .sort((a, b) => (a.status !== 'pending') - (b.status !== 'pending') || (b.createdAt || 0) - (a.createdAt || 0));
}

// Approve (adds the faculty or resident entry in the same batch; an existing resident with that
// email keeps their rid) or reject. Returns the updated application.
export async function decideApplication(uid, { approve, rid, rYear, intake } = {}) {
  if (demo) return D.decideApplication(uid, { approve, rid, rYear, intake });
  const { db, F, auth } = await sdk();
  const ref = F.doc(db, 'applications', String(uid));
  const snap = await F.getDoc(ref);
  if (!snap.exists()) throw new Error('No such application');
  const a = snap.data();
  const b = F.writeBatch(db);
  if (approve && a.role === 'faculty') {
    const f = cleanFaculty({ email: a.email, name: a.name, status: 'ACTIVE' });
    b.set(F.doc(db, 'faculty', f.email), f);
  } else if (approve) {
    const old = (await F.getDocs(F.query(F.collection(db, 'residents'), F.where('email', '==', a.email), F.limit(1)))).docs[0]?.data();
    // never overwrite someone else's entry with a rid that is already taken
    if (!old && rid && (await F.getDoc(F.doc(db, 'residents', String(rid)))).exists()) throw new Error(`Resident ID ${rid} is already in use`);
    const r = cleanResident({ ...(old || {}), rid: rid || old?.rid || newRid(), name: old?.name || a.name, email: a.email, status: 'ACTIVE',
      rYear: rYear ?? old?.rYear ?? null, intake: intake ?? old?.intake ?? null });
    b.set(F.doc(db, 'residents', r.rid), r);
  }
  const decision = { status: approve ? 'approved' : 'rejected', decidedAt: Date.now(), decidedBy: lc(auth.currentUser?.email) };
  b.update(ref, decision);
  await queued(b.commit());
  return { ...a, ...decision };
}

// ---- evaluations ----

// Last known copy of each evaluation (from watchers and reads), to stamp transitions without a read.
const known = new Map();
const remember = list => { for (const d of list) known.set(d.id, d); return list; };

export const newEvaluationId = () => D.newEvaluationId();

export async function createEvaluation(ev) {
  if (demo) return D.createEvaluation(ev);
  const { db, F } = await sdk();
  const doc = cleanEval(ev);
  await queued(F.setDoc(F.doc(db, 'evaluations', doc.id), doc));
  known.set(doc.id, doc);
  return doc;
}

// Merge a patch into evaluations/{id} (null removes assessment, metrics, declineReason, …). Submit,
// decline and resend times are stamped here. Returns the merged document as far as it is known.
// { wait: false } returns once the write is in the local cache (autosaves), without waiting for the server.
export async function updateEvaluation(id, patch, { wait = true, onError = null } = {}) {
  if (demo) return D.updateEvaluation(id, patch);
  id = String(id);
  const { db, F } = await sdk();
  const cur = known.get(id) || await getEvaluation(id);
  const { set, remove } = cleanPatch(stampPatch(cur, patch));
  const write = { ...set };
  for (const k of remove) write[k] = F.deleteField();
  const p = queued(F.updateDoc(F.doc(db, 'evaluations', id), write));
  if (wait) await p;
  // not awaited: a quick rejection (before ACK_WAIT) would otherwise go unnoticed
  else p.catch(e => { if (onError) onError(e); else for (const cb of syncErrorListeners) cb(e); });
  const merged = { ...(cur || { id }), ...set };
  for (const k of remove) delete merged[k];
  known.set(id, merged);
  return plain(merged);
}

// null when it does not exist or is not yours to see (the rules answer both the same way)
export async function getEvaluation(id) {
  if (demo) return D.getEvaluation(id);
  const { db, F } = await sdk();
  const snap = await soft(F.getDoc(F.doc(db, 'evaluations', String(id))));
  if (!snap || !snap.exists()) return null;
  const d = { ...snap.data(), id: snap.id };
  known.set(d.id, d);
  return d;
}

// Removes a resident's own unsent draft (the only delete the UI offers).
export async function deleteDraft(id) {
  if (demo) return D.deleteDraft(id);
  const { db, F } = await sdk();
  await queued(F.deleteDoc(F.doc(db, 'evaluations', String(id))));
  known.delete(String(id));
}

// Live lists, newest change first, served from the offline cache when there is no signal.
// cb(list, { fromCache, hasPendingWrites }). Returns an unsubscribe function.
const byNewest = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || String(a.id).localeCompare(String(b.id));
const live = new Set();   // stop functions of open listeners (signOut closes them first)
function watch(build, cb, what) {
  let stop = null, stopped = false;
  const end = () => { stopped = true; live.delete(end); if (stop) stop(); };
  live.add(end);
  sdk().then(({ db, F }) => {
    if (stopped) return;
    stop = F.onSnapshot(build(db, F), { includeMetadataChanges: true }, snap => {
      const list = remember(snap.docs.map(d => ({ ...d.data(), id: d.id }))).sort(byNewest);
      cb(list, { fromCache: snap.metadata.fromCache, hasPendingWrites: snap.metadata.hasPendingWrites });
    }, e => {
      if (stopped) return;   // e.g. signing out
      console.error(what + ' listener failed', e); for (const l of syncErrorListeners) l(e);
    });
  }).catch(e => { console.error('Firebase did not load', e); for (const l of syncErrorListeners) l(e); });
  return end;
}

export function watchMine(email, cb) {
  if (demo) return D.watchMine(email, cb);
  return watch((db, F) => F.query(F.collection(db, 'evaluations'), F.where('residentEmail', '==', lc(email))), cb, 'My evaluations');
}
export function watchAssigned(email, cb) {
  if (demo) return D.watchAssigned(email, cb);
  // never the resident's unsent drafts (the rules hide those from the assessor)
  return watch((db, F) => F.query(F.collection(db, 'evaluations'), F.where('assessorEmail', '==', lc(email)),
    F.where('status', 'in', SENT)), cb, 'Assigned evaluations');
}
// PDs and admins only
export function watchAll(cb) {
  if (demo) return D.watchAll(cb);
  return watch((db, F) => F.collection(db, 'evaluations'), cb, 'All evaluations');
}
