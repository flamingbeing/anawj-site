// Firestore rules checks for prewarm/firestore.rules against the local emulator (fake accounts, demo project only).
// Run with tools/test-rules.sh (it starts the emulator and runs this from prewarm/).
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where } from 'firebase/firestore';
import fs from 'node:fs';
const env = await initializeTestEnvironment({ projectId: 'demo-prewarm', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 } });
const ADMIN = 'lead@example.com';
const google = (email, verified = true) => env.authenticatedContext('g-' + email, { email, email_verified: verified }).firestore();
const anonUser = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'admins', ADMIN), { name: 'Lead' });
  await setDoc(doc(db, 'codes', 'NUH'), { code: 'NUH-CODE-1', setAt: 1, setBy: ADMIN });
  await setDoc(doc(db, 'codes', 'SGH'), { code: 'SGH-CODE-1', setAt: 1, setBy: ADMIN });
  await setDoc(doc(db, 'patients', 'sgh1'), { site: 'SGH', created: 1, f: {} });
});
let n = 0, fail = 0;
async function t(name, p) { n++; try { await p; } catch (e) { fail++; console.log('FAIL', name, e.message.slice(0, 200)); } }
const adm = google(ADMIN), stranger = google('someone@example.com'), unv = google(ADMIN, false);
const a = anonUser('phoneA'), b = anonUser('phoneB'), c = anonUser('phoneC'), nobody = env.unauthenticatedContext().firestore();
const join = (db, uid, site, code, extra = {}) => setDoc(doc(db, 'members', uid), { site, initials: 'AB', code, joinedAt: 1, ...extra });
const pat = (site, f = {}) => ({ site, created: 1, locked: false, f });

// joining
await t('join with the right code', assertSucceeds(join(a, 'phoneA', 'NUH', 'NUH-CODE-1')));
await t('join with a wrong code', assertFails(join(b, 'phoneB', 'NUH', 'guess')));
await t('join with another hospital code', assertFails(join(b, 'phoneB', 'NUH', 'SGH-CODE-1')));
await t('join a hospital with no code yet', assertFails(join(b, 'phoneB', 'WH', 'anything')));
await t('join an unknown hospital', assertFails(join(b, 'phoneB', 'XYZ', 'NUH-CODE-1')));
await t('join as someone else', assertFails(join(b, 'phoneA', 'NUH', 'NUH-CODE-1')));
await t('join with extra fields', assertFails(join(b, 'phoneB', 'NUH', 'NUH-CODE-1', { admin: true })));
await t('join signed out', assertFails(join(nobody, 'x', 'NUH', 'NUH-CODE-1')));
await t('SGH phone joins', assertSucceeds(join(c, 'phoneC', 'SGH', 'SGH-CODE-1')));
await t('member reads own entry', assertSucceeds(getDoc(doc(a, 'members', 'phoneA'))));
await t('member cannot read another', assertFails(getDoc(doc(a, 'members', 'phoneC'))));
await t('member cannot list members', assertFails(getDocs(collection(a, 'members'))));
await t('member changes initials', assertSucceeds(updateDoc(doc(a, 'members', 'phoneA'), { initials: 'CD' })));
await t('member cannot move hospital', assertFails(updateDoc(doc(a, 'members', 'phoneA'), { site: 'SGH' })));
await t('codes hidden from members', assertFails(getDoc(doc(a, 'codes', 'NUH'))));
await t('codes hidden from strangers', assertFails(getDoc(doc(stranger, 'codes', 'NUH'))));
await t('member cannot set a code', assertFails(setDoc(doc(a, 'codes', 'NUH'), { code: 'MINE-123', setAt: 2, setBy: 'x' })));

// patients
await t('member creates own-hospital patient', assertSucceeds(setDoc(doc(a, 'patients', 'p1'), pat('NUH', { enrol_id: { v: 'S-01', t: 1, by: 'AB' } }))));
await t('member merges a reading', assertSucceeds(setDoc(doc(a, 'patients', 'p1'), { f: { prewarm_0_core: { v: '36.6', t: 2, by: 'AB' } } }, { merge: true })));
await t('member soft-deletes', assertSucceeds(setDoc(doc(a, 'patients', 'p1'), { deleted: 5 }, { merge: true })));
await t('member cannot create other-hospital patient', assertFails(setDoc(doc(a, 'patients', 'p2'), pat('SGH'))));
await t('member cannot move a patient', assertFails(setDoc(doc(a, 'patients', 'p1'), { site: 'SGH' }, { merge: true })));
await t('member cannot read other hospital', assertFails(getDoc(doc(a, 'patients', 'sgh1'))));
await t('member cannot write other hospital', assertFails(setDoc(doc(a, 'patients', 'sgh1'), { f: { x: { v: 1 } } }, { merge: true })));
await t('member lists own hospital', assertSucceeds(getDocs(query(collection(a, 'patients'), where('site', '==', 'NUH'), where('locked', '==', false)))));
await t('member cannot list everything', assertFails(getDocs(collection(a, 'patients'))));
await t('member cannot hard-delete', assertFails(deleteDoc(doc(a, 'patients', 'p1'))));
await t('unknown patient field', assertFails(setDoc(doc(a, 'patients', 'p3'), { ...pat('NUH'), name: 'Real Person' })));
await t('f must be a map', assertFails(setDoc(doc(a, 'patients', 'p3'), { site: 'NUH', created: 1, f: 'x' })));
await t('non-member cannot read', assertFails(getDoc(doc(b, 'patients', 'p1'))));
await t('signed out cannot read', assertFails(getDoc(doc(nobody, 'patients', 'p1'))));
await t('stranger Google account cannot read', assertFails(getDoc(doc(stranger, 'patients', 'p1'))));

// admins
await t('admin checks own entry', assertSucceeds(getDoc(doc(adm, 'admins', ADMIN))));
await t('stranger checks own (absent) entry', assertSucceeds(getDoc(doc(stranger, 'admins', 'someone@example.com'))));
await t('stranger cannot add self', assertFails(setDoc(doc(stranger, 'admins', 'someone@example.com'), { name: 'x' })));
await t('member cannot list admins', assertFails(getDocs(collection(a, 'admins'))));
await t('unverified admin email refused', assertFails(getDoc(doc(unv, 'codes', 'NUH'))));
await t('admin reads codes', assertSucceeds(getDocs(collection(adm, 'codes'))));
await t('admin sets a code', assertSucceeds(setDoc(doc(adm, 'codes', 'WH'), { code: 'WH-NEW-CODE', setAt: 3, setBy: ADMIN })));
await t('code too short', assertFails(setDoc(doc(adm, 'codes', 'WH'), { code: '123', setAt: 3, setBy: ADMIN })));
await t('code for unknown hospital', assertFails(setDoc(doc(adm, 'codes', 'XYZ'), { code: 'XYZ-CODE-1', setAt: 3, setBy: ADMIN })));
await t('admin lists members', assertSucceeds(getDocs(collection(adm, 'members'))));
await t('admin reads all patients', assertSucceeds(getDocs(collection(adm, 'patients'))));
// locking (admins only; a locked patient can't be changed by members)
const L = (on, t = 10) => ({ lock: { on, t, by: ADMIN }, locked: on });
await t('member creates p4', assertSucceeds(setDoc(doc(a, 'patients', 'p4'), pat('NUH'))));
await t('member cannot lock', assertFails(setDoc(doc(a, 'patients', 'p4'), L(true), { merge: true })));
await t('member cannot create a locked patient', assertFails(setDoc(doc(a, 'patients', 'p5'), { ...pat('NUH'), ...L(true) })));
await t('admin locks', assertSucceeds(setDoc(doc(adm, 'patients', 'p4'), L(true), { merge: true })));
await t('member cannot write a locked patient', assertFails(setDoc(doc(a, 'patients', 'p4'), { f: { x: { v: 1, t: 11, by: 'AB' } } }, { merge: true })));
await t('member cannot unlock', assertFails(setDoc(doc(a, 'patients', 'p4'), L(false, 12), { merge: true })));
await t('member cannot read a locked patient', assertFails(getDoc(doc(a, 'patients', 'p4'))));
await t('member query for unlocked patients', assertSucceeds(getDocs(query(collection(a, 'patients'), where('site', '==', 'NUH'), where('locked', '==', false)))));
await t('member query never returns a locked patient', getDocs(query(collection(a, 'patients'), where('site', '==', 'NUH'))).then(r => { if (r.docs.some(d => d.id === 'p4')) throw new Error('locked patient returned'); }, () => {}));
await t('admin reads a locked patient', assertSucceeds(getDoc(doc(adm, 'patients', 'p4'))));
await t('locked must match lock.on', assertFails(setDoc(doc(adm, 'patients', 'p4'), { locked: false }, { merge: true })));
await t('member cannot mark locked without a lock', assertFails(setDoc(doc(a, 'patients', 'p6'), { ...pat('NUH'), locked: true })));
await t('lock must be { on, t, by }', assertFails(setDoc(doc(adm, 'patients', 'p4'), { lock: { on: 'yes', t: 1, by: ADMIN } }, { merge: true })));
await t('admin cannot change a locked patient either', assertFails(setDoc(doc(adm, 'patients', 'p4'), { f: { x: { v: 9, t: 12, by: 'L' } } }, { merge: true })));
await t('admin unlocks', assertSucceeds(setDoc(doc(adm, 'patients', 'p4'), L(false, 13), { merge: true })));
await t('member reads it again once unlocked', assertSucceeds(getDoc(doc(a, 'patients', 'p4'))));
await t('member writes again once unlocked', assertSucceeds(setDoc(doc(a, 'patients', 'p4'), { f: { x: { v: 2, t: 14, by: 'AB' } } }, { merge: true })));
await t('admin writes any hospital', assertSucceeds(setDoc(doc(adm, 'patients', 'sgh1'), { f: { x: { v: 1, t: 1, by: 'L' } } }, { merge: true })));
await t('admin removes a member', assertSucceeds(deleteDoc(doc(adm, 'members', 'phoneC'))));
await t('removed member loses access', assertFails(getDoc(doc(c, 'patients', 'sgh1'))));
// managing admins: any admin adds (lower-case email, addedBy themselves) or removes another; nobody removes themselves
const add = (db, em, by = ADMIN, extra = {}) => setDoc(doc(db, 'admins', em), { addedBy: by, addedAt: 1, ...extra });
await t('admin adds an admin', assertSucceeds(add(adm, 'second@example.com')));
await t('admin lists admins', assertSucceeds(getDocs(collection(adm, 'admins'))));
await t('admin add: not an email', assertFails(add(adm, 'not-an-email')));
await t('admin add: upper-case id', assertFails(add(adm, 'Third@example.com')));
await t('admin add: addedBy someone else', assertFails(add(adm, 'third@example.com', 'second@example.com')));
await t('admin add: extra fields', assertFails(add(adm, 'third@example.com', ADMIN, { role: 'owner' })));
await t('admin cannot change an admin entry', assertFails(add(adm, 'second@example.com')));
await t('member cannot add an admin', assertFails(add(a, 'phone@example.com', 'phone@example.com')));
await t('unverified email cannot add an admin', assertFails(add(unv, 'x@example.com')));
const second = google('second@example.com');
await t('new admin is an admin', assertSucceeds(getDocs(collection(second, 'admins'))));
await t('admin cannot remove themselves', assertFails(deleteDoc(doc(adm, 'admins', ADMIN))));
await t('second admin removes the first', assertSucceeds(deleteDoc(doc(second, 'admins', ADMIN))));
await t('removed admin loses access', assertFails(getDocs(collection(adm, 'admins'))));
await t('removed admin cannot re-add self', assertFails(add(adm, ADMIN)));
await t('second admin re-adds the first', assertSucceeds(add(second, ADMIN, 'second@example.com')));
await t('stranger cannot remove an admin', assertFails(deleteDoc(doc(stranger, 'admins', ADMIN))));
// a code change keeps existing members in, and the old code stops working for new phones
// the blank paper form
const form = (extra = {}) => ({ b64: 'UEsDBA==', name: 'form.docx', size: 6, setAt: 5, setBy: ADMIN, ...extra });
await t('admin uploads the blank form', assertSucceeds(setDoc(doc(adm, 'forms', 'blank'), form())));
await t('member reads the blank form', assertSucceeds(getDoc(doc(a, 'forms', 'blank'))));
await t('stranger cannot read the form', assertFails(getDoc(doc(stranger, 'forms', 'blank'))));
await t('signed out cannot read the form', assertFails(getDoc(doc(nobody, 'forms', 'blank'))));
await t('member cannot replace the form', assertFails(setDoc(doc(a, 'forms', 'blank'), form())));
await t('form only as forms/blank', assertFails(setDoc(doc(adm, 'forms', 'other'), form())));
await t('form with extra fields', assertFails(setDoc(doc(adm, 'forms', 'blank'), form({ note: 'x' }))));
await t('form too big', assertFails(setDoc(doc(adm, 'forms', 'blank'), form({ b64: 'A'.repeat(1000001) }))));
await t('admin changes NUH code', assertSucceeds(setDoc(doc(adm, 'codes', 'NUH'), { code: 'NUH-CODE-2', setAt: 4, setBy: ADMIN })));
await t('existing member still reads', assertSucceeds(getDoc(doc(a, 'patients', 'p1'))));
await t('old code refused', assertFails(join(b, 'phoneB', 'NUH', 'NUH-CODE-1')));
await t('new code works', assertSucceeds(join(b, 'phoneB', 'NUH', 'NUH-CODE-2')));
await t('member leaves', assertSucceeds(deleteDoc(doc(b, 'members', 'phoneB'))));

// the PACU nurse's link: pacu/{token} (owner, 13 Oct 2026)
const nurse = anonUser('nurse1');
const TK = 'k3m9x7q2w5r8t4y6u2p5n3d7', TK2 = 'z9y8x7w6v5u4t3s2r1q2p3m4';
const pacuDoc = (extra = {}) => ({ site: 'NUH', pid: 'p1', sid: 'S-01', created: 1, f: {}, ...extra });
await t('member makes a PACU link for own hospital', assertSucceeds(setDoc(doc(a, 'pacu', TK), pacuDoc({ f: { pacu_in: { v: '09:10', t: 1, by: 'AB' } } }))));
await t('member cannot make one for another hospital', assertFails(setDoc(doc(a, 'pacu', TK2), pacuDoc({ site: 'SGH' }))));
await t('a short token is refused', assertFails(setDoc(doc(a, 'pacu', 'short'), pacuDoc())));
await t('extra fields are refused', assertFails(setDoc(doc(a, 'pacu', TK2), pacuDoc({ note: 'x' }))));
await t('a non-PACU field is refused', assertFails(setDoc(doc(a, 'pacu', TK2), pacuDoc({ f: { prewarm_0_core: { v: '36', t: 1, by: 'AB' } } }))));
await t('a stranger cannot make a link', assertFails(setDoc(doc(nurse, 'pacu', TK2), pacuDoc())));
await t('the nurse (anonymous, not a member) opens the link', assertSucceeds(getDoc(doc(nurse, 'pacu', TK))));
await t('signed out cannot open it', assertFails(getDoc(doc(nobody, 'pacu', TK))));
await t('nobody lists links', assertFails(getDocs(collection(nurse, 'pacu'))));
await t('a member cannot list links either', assertFails(getDocs(collection(a, 'pacu'))));
await t('admin lists links', assertSucceeds(getDocs(collection(adm, 'pacu'))));
await t('the nurse fills a PACU field', assertSucceeds(setDoc(doc(nurse, 'pacu', TK), { f: { pacu_temp: { v: '36.4', t: 2, by: 'NN', auto: false } } }, { merge: true })));
await t('the nurse ticks PACU complete', assertSucceeds(setDoc(doc(nurse, 'pacu', TK), { f: { sign_pacu: { v: 'NN 13 Oct 2026 09:40', t: 3, by: 'NN' } } }, { merge: true })));
await t('the nurse cannot write a non-PACU field', assertFails(setDoc(doc(nurse, 'pacu', TK), { f: { prewarm_0_core: { v: '36', t: 4, by: 'NN' } } }, { merge: true })));
await t('the nurse cannot move the link to another participant', assertFails(setDoc(doc(nurse, 'pacu', TK), { pid: 'p2' }, { merge: true })));
await t('the nurse cannot change the hospital', assertFails(setDoc(doc(nurse, 'pacu', TK), { site: 'SGH' }, { merge: true })));
await t('the nurse cannot change the Subject ID', assertFails(setDoc(doc(nurse, 'pacu', TK), { sid: 'S-99' }, { merge: true })));
await t('the nurse cannot add other fields', assertFails(setDoc(doc(nurse, 'pacu', TK), { admin: true }, { merge: true })));
await t('the nurse cannot make a new link', assertFails(setDoc(doc(nurse, 'pacu', TK2), pacuDoc())));
await t('the nurse cannot delete the link', assertFails(deleteDoc(doc(nurse, 'pacu', TK))));
await t('a member corrects the Subject ID shown', assertSucceeds(setDoc(doc(a, 'pacu', TK), { sid: 'S-01b' }, { merge: true })));
await t('another hospital cannot delete the link', assertFails(deleteDoc(doc(c, 'pacu', TK))));
await t('the member stops the link', assertSucceeds(deleteDoc(doc(a, 'pacu', TK))));
await t('a stopped link is gone', assertSucceeds(getDoc(doc(nurse, 'pacu', TK)).then(s => { if (s.exists()) throw new Error('still there'); })));

// scan imports (Firetop writes them with its own sign-in, which bypasses rules; the app only reads and approves)
await env.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), 'scanImports', 'scan1'), { scan: 'scan1', createdAt: 1, status: 'pending', pages: [], fields: { age: { v: '67', flags: [] } } });
});
const review = (db, extra = {}) => updateDoc(doc(db, 'scanImports', 'scan1'), { status: 'approved', reviewedBy: ADMIN, reviewedAt: 5, ...extra });
await t('admin reads scan imports', assertSucceeds(getDocs(collection(adm, 'scanImports'))));
await t('member cannot read scan imports', assertFails(getDoc(doc(a, 'scanImports', 'scan1'))));
await t('stranger cannot read scan imports', assertFails(getDoc(doc(stranger, 'scanImports', 'scan1'))));
await t('unverified admin email cannot read scan imports', assertFails(getDoc(doc(unv, 'scanImports', 'scan1'))));
await t('nobody signed out reads scan imports', assertFails(getDoc(doc(nobody, 'scanImports', 'scan1'))));
await t('admin cannot create a scan import', assertFails(setDoc(doc(adm, 'scanImports', 'scan2'), { scan: 'scan2', createdAt: 1, status: 'pending', fields: {} })));
await t('member cannot create a scan import', assertFails(setDoc(doc(a, 'scanImports', 'scan2'), { scan: 'scan2', createdAt: 1, status: 'pending', fields: {} })));
await t('admin cannot change the scanned values', assertFails(updateDoc(doc(adm, 'scanImports', 'scan1'), { fields: { age: { v: '99', flags: [] } } })));
await t('admin cannot approve in someone else’s name', assertFails(review(adm, { reviewedBy: 'other@example.com' })));
await t('admin cannot set another status', assertFails(review(adm, { status: 'pending' })));
await t('member cannot approve', assertFails(review(a)));
await t('admin approves a pending import', assertSucceeds(review(adm)));
await t('an approved import cannot be changed again', assertFails(review(adm, { status: 'rejected' })));
await t('admin deletes an import', assertSucceeds(deleteDoc(doc(adm, 'scanImports', 'scan1'))));
await t('member cannot delete an import', assertFails(deleteDoc(doc(a, 'scanImports', 'scan1'))));

await env.cleanup();
console.log(`prewarm rules: ${n - fail}/${n} checks passed`);
process.exit(fail ? 1 : 0);
