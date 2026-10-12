// Sharing through Firestore (Firebase project prewarm-study). Phones join with their hospital's code (anonymous
// sign-in); admins sign in with Google. Access is decided by firestore.rules. Demo mode (?demo) never connects.
//
//   members/{uid}  { site, initials, code, joinedAt }       codes/{site}  { code, setAt, setBy }   (admins only)
//   admins/{email} {}                                       patients/{id} { site, created, deleted?, f: { id: {v,t,by} } }

import { FIREBASE_CONFIG } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const params = new URLSearchParams(location.search);
// ?emulator on localhost: local Firebase emulators with the demo project (browser tests only; never the live project)
const EMU = params.has('emulator') && ['localhost', '127.0.0.1'].includes(location.hostname);
export const enabled = !!FIREBASE_CONFIG?.apiKey && !params.has('demo');

let fb = null;
async function sdk() {
  if (fb) return fb;
  const [app, auth, fs] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
  const a = app.initializeApp(EMU ? { ...FIREBASE_CONFIG, projectId: 'demo-prewarm' } : FIREBASE_CONFIG);
  let db;
  // keep a copy on the phone so saving works without signal and syncs later
  try { db = fs.initializeFirestore(a, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
  catch { db = fs.getFirestore(a); }
  fb = { auth: auth.getAuth(a), db, A: auth, F: fs };
  if (EMU) { fs.connectFirestoreEmulator(db, '127.0.0.1', 8085); auth.connectAuthEmulator(fb.auth, 'http://127.0.0.1:9099', { disableWarnings: true }); }
  return fb;
}

// Firestore rejects undefined; a JSON round trip drops it
const plain = o => JSON.parse(JSON.stringify(o));
const friendly = e => {
  if (e?.code === 'permission-denied') return 'Not allowed. Check the hospital and code.';
  if (e?.code === 'unavailable') return 'No connection. Try again with signal.';
  if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return 'Sign-in was cancelled.';
  return 'Something went wrong: ' + (e?.message || e);
};
export { friendly };

export async function onUser(cb) {
  const { auth, A } = await sdk();
  A.onAuthStateChanged(auth, cb);
}

export async function member() {
  const { auth, db, F } = await sdk();
  if (!auth.currentUser) return null;
  const ref = F.doc(db, 'members', auth.currentUser.uid);
  // ask the server: the phone's own copy can hold a join the rules are about to refuse; offline, trust the copy
  try { const s = await F.getDocFromServer(ref); return s.exists() ? s.data() : null; }
  catch (e) {
    if (e?.code === 'permission-denied') return null;
    try { const s = await F.getDocFromCache(ref); return s.exists() ? s.data() : null; } catch { return null; }
  }
}

export async function isAdmin() {
  const { auth, db, F } = await sdk();
  const u = auth.currentUser;
  if (!u?.email) return false;
  try { return (await F.getDoc(F.doc(db, 'admins', u.email.toLowerCase()))).exists(); } catch { return false; }
}

export async function join(site, code, initials) {
  const { auth, db, F, A } = await sdk();
  if (!auth.currentUser) await A.signInAnonymously(auth);
  await F.setDoc(F.doc(db, 'members', auth.currentUser.uid), { site, code: code.trim(), initials: initials || '', joinedAt: Date.now() });
}

export async function setInitials(initials) {
  const { auth, db, F } = await sdk();
  if (auth.currentUser) await F.updateDoc(F.doc(db, 'members', auth.currentUser.uid), { initials });
}

export async function leave() {
  const { auth, db, F, A } = await sdk();
  if (auth.currentUser && !auth.currentUser.isAnonymous) return A.signOut(auth);
  if (auth.currentUser) { try { await F.deleteDoc(F.doc(db, 'members', auth.currentUser.uid)); } catch { /* removed already */ } }
  await A.signOut(auth);
}

export async function adminSignIn() {
  const { auth, A } = await sdk();
  const p = new A.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  await A.signInWithPopup(auth, p);
}

// Patients of one hospital (or all, for an admin); cb gets the changed records
export async function watchPatients(site, cb, onError) {
  const { db, F } = await sdk();
  const q = site ? F.query(F.collection(db, 'patients'), F.where('site', '==', site)) : F.collection(db, 'patients');
  return F.onSnapshot(q, snap => cb(snap.docChanges().filter(c => c.type !== 'removed').map(c => ({ id: c.doc.id, ...c.doc.data() }))), onError);
}

// Send changed fields of a record; merges into the shared copy field by field
export async function push(rec, ids) {
  const { db, F } = await sdk();
  const f = {};
  for (const k of ids) if (rec.f[k]) f[k] = rec.f[k];
  const body = { site: rec.site, created: rec.created, f };
  if (rec.deleted) body.deleted = rec.deleted;
  await F.setDoc(F.doc(db, 'patients', rec.id), plain(body), { merge: true });
}

// ---- admin
export async function codes() {
  const { db, F } = await sdk();
  const s = await F.getDocs(F.collection(db, 'codes'));
  return Object.fromEntries(s.docs.map(d => [d.id, d.data()]));
}
export async function setCode(site, code) {
  const { auth, db, F } = await sdk();
  await F.setDoc(F.doc(db, 'codes', site), { code, setAt: Date.now(), setBy: auth.currentUser.email.toLowerCase() });
}
export async function members() {
  const { db, F } = await sdk();
  const s = await F.getDocs(F.collection(db, 'members'));
  return s.docs.map(d => ({ uid: d.id, ...d.data() }));
}
export async function removeMember(uid) {
  const { db, F } = await sdk();
  await F.deleteDoc(F.doc(db, 'members', uid));
}
