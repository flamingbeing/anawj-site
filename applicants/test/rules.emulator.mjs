// Firestore rules checks for the applicants app (collections selection/ and selectionCommittee/) against the local emulator, fake accounts only.
// Rules: logbook/firestore.rules. Run from the repo root:  tools/test-rules.sh   (or, with the emulator on port 8085,
//   npx firebase emulators:exec --only firestore --project demo-logbook "node applicants/test/rules.emulator.mjs")
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, deleteDoc, serverTimestamp } from 'firebase/firestore';
import fs from 'node:fs';

const env = await initializeTestEnvironment({
  projectId: 'demo-logbook',
  firestore: { rules: fs.readFileSync('logbook/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
});
const as = (email, verified = true) => env.authenticatedContext(email, { email, email_verified: verified }).firestore();
const ADMIN = 'boss@example.com', PD = 'pd@example.com', RES = 'alice@example.com', RES2 = 'bob@example.com';
const FAC = 'dr.fac@example.com', COM = 'dr.committee@example.com', STRANGER = 'stranger@example.com', ADMIN2 = 'admin2@example.com';
const round = (o = {}) => ({ cycle: 'c1', title: 'Round', status: 'open', applicants: [{ id: 'a1', name: 'Applicant One' }], updatedAt: 1, ...o });
const resp = (email, o = {}) => ({ email, name: 'Someone', answers: { a1: { score: 4, comment: 'Good', na: false } }, updatedAt: serverTimestamp(), ...o });
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'admins', ADMIN), { name: 'Boss' });
  await setDoc(doc(db, 'admins', ADMIN2), { name: 'Admin Two' });
  await setDoc(doc(db, 'pds', PD), { name: 'PD' });
  await setDoc(doc(db, 'residents', 'R1'), { rid: 'R1', name: 'Alice', email: RES, status: 'ACTIVE', intake: 2024 });
  await setDoc(doc(db, 'residents', 'R2'), { rid: 'R2', name: 'Bob', email: RES2, status: 'ACTIVE', intake: 2024 });
  await setDoc(doc(db, 'members', RES), { rid: 'R1' });
  await setDoc(doc(db, 'members', RES2), { rid: 'R2' });
  await setDoc(doc(db, 'faculty', FAC), { email: FAC, name: 'Dr Fac', status: 'ACTIVE', updatedAt: 1 });
  await setDoc(doc(db, 'faculty', COM), { email: COM, name: 'Dr Committee', status: 'ACTIVE', updatedAt: 1 });
  await setDoc(doc(db, 'selectionCommittee', COM), { name: 'Dr Committee' });
  await setDoc(doc(db, 'selection', 'c1'), round());
  await setDoc(doc(db, 'selection', 'old'), round({ cycle: 'old', status: 'closed' }));
});
let n = 0, fail = 0;
async function t(name, p) { n++; try { await p; } catch (e) { fail++; console.log('FAIL', name, e.message.slice(0, 300)); } }
const adm = as(ADMIN), adm2 = as(ADMIN2), pd = as(PD), res = as(RES), res2 = as(RES2), fac = as(FAC), com = as(COM), str = as(STRANGER);
const anon = env.unauthenticatedContext().firestore();

// ---- rounds ----
for (const [who, db] of [['resident', res], ['faculty', fac], ['pd', pd], ['admin', adm]]) await t(`${who} reads a round`, assertSucceeds(getDoc(doc(db, 'selection', 'c1'))));
await t('resident lists rounds', assertSucceeds(getDocs(collection(res, 'selection'))));
await t('stranger cannot read a round', assertFails(getDoc(doc(str, 'selection', 'c1'))));
await t('signed out cannot read a round', assertFails(getDoc(doc(anon, 'selection', 'c1'))));
await t('pd creates a round', assertSucceeds(setDoc(doc(pd, 'selection', 'c2'), round({ cycle: 'c2' }))));
await t('admin updates a round', assertSucceeds(setDoc(doc(adm, 'selection', 'c2'), round({ cycle: 'c2', status: 'closed' }))));
await t('pd saves a round wired to a form with mirror on', assertSucceeds(setDoc(doc(pd, 'selection', 'c4'), round({ cycle: 'c4', form: { id: 'f'.repeat(30), nameEntry: 7 }, mirror: true }))));
await t('a malformed form or mirror is refused', assertFails(setDoc(doc(pd, 'selection', 'c5'), round({ cycle: 'c5', form: { id: 'f'.repeat(30), nameEntry: 7, extra: 1 }, mirror: 'yes' }))));
await t('resident cannot create a round', assertFails(setDoc(doc(res, 'selection', 'c3'), round({ cycle: 'c3' }))));
await t('faculty cannot change a round', assertFails(setDoc(doc(fac, 'selection', 'c1'), round({ title: 'Mine' }))));
await t('round id must match', assertFails(setDoc(doc(pd, 'selection', 'c4'), round({ cycle: 'other' }))));
await t('round needs applicants', assertFails(setDoc(doc(pd, 'selection', 'c5'), round({ cycle: 'c5', applicants: [] }))));
await t('round status is checked', assertFails(setDoc(doc(pd, 'selection', 'c6'), round({ cycle: 'c6', status: 'maybe' }))));
await t('round takes no extra fields', assertFails(setDoc(doc(pd, 'selection', 'c7'), round({ cycle: 'c7', secret: 1 }))));

// ---- responses ----
await t('resident sends their response', assertSucceeds(setDoc(doc(res, 'selection', 'c1', 'responses', RES), resp(RES))));
await t('resident changes it while open', assertSucceeds(setDoc(doc(res, 'selection', 'c1', 'responses', RES), resp(RES, { name: 'Alice' }))));
await t('faculty sends a response', assertSucceeds(setDoc(doc(fac, 'selection', 'c1', 'responses', FAC), resp(FAC))));
await t('resident cannot write as someone else', assertFails(setDoc(doc(res, 'selection', 'c1', 'responses', RES2), resp(RES2))));
await t('resident cannot claim another email in the body', assertFails(setDoc(doc(res, 'selection', 'c1', 'responses', RES), resp(RES2))));
await t('stranger cannot respond', assertFails(setDoc(doc(str, 'selection', 'c1', 'responses', STRANGER), resp(STRANGER))));
await t('no responses to a closed round', assertFails(setDoc(doc(res, 'selection', 'old', 'responses', RES), resp(RES))));
await t('updatedAt must be the server time', assertFails(setDoc(doc(res2, 'selection', 'c1', 'responses', RES2), resp(RES2, { updatedAt: 5 }))));
await t('response takes no extra fields', assertFails(setDoc(doc(res2, 'selection', 'c1', 'responses', RES2), resp(RES2, { extra: 1 }))));
await t('response needs a name', assertFails(setDoc(doc(res2, 'selection', 'c1', 'responses', RES2), resp(RES2, { name: '' }))));
await t('respondent reads only their own', assertSucceeds(getDoc(doc(res, 'selection', 'c1', 'responses', RES))));
await t('respondent cannot read another', assertFails(getDoc(doc(res, 'selection', 'c1', 'responses', FAC))));
await t('respondent cannot list responses', assertFails(getDocs(collection(res, 'selection', 'c1', 'responses'))));
await t('faculty cannot list responses', assertFails(getDocs(collection(fac, 'selection', 'c1', 'responses'))));
await t('pd lists responses', assertSucceeds(getDocs(collection(pd, 'selection', 'c1', 'responses'))));
await t('committee lists responses', assertSucceeds(getDocs(collection(com, 'selection', 'c1', 'responses'))));
await t('committee reads one response', assertSucceeds(getDoc(doc(com, 'selection', 'c1', 'responses', RES))));
await t('plain admin cannot read responses', assertFails(getDocs(collection(adm, 'selection', 'c1', 'responses'))));
await t('committee cannot edit a response', assertFails(setDoc(doc(com, 'selection', 'c1', 'responses', RES), resp(RES))));
await t('respondent cannot delete their response', assertFails(deleteDoc(doc(res, 'selection', 'c1', 'responses', RES))));
await t('pd deletes a response', assertSucceeds(deleteDoc(doc(pd, 'selection', 'c1', 'responses', FAC))));

// ---- the committee list ----
await t('member checks own committee entry', assertSucceeds(getDoc(doc(com, 'selectionCommittee', COM))));
await t('resident cannot read the committee list', assertFails(getDocs(collection(res, 'selectionCommittee'))));
await t('pd lists the committee', assertSucceeds(getDocs(collection(pd, 'selectionCommittee'))));
await t('admin adds a committee member', assertSucceeds(setDoc(doc(adm, 'selectionCommittee', 'new@example.com'), { name: 'New' })));
await t('pd removes a committee member', assertSucceeds(deleteDoc(doc(pd, 'selectionCommittee', 'new@example.com'))));
await t('resident cannot join the committee', assertFails(setDoc(doc(res, 'selectionCommittee', RES), { name: 'me' })));
await t('committee member cannot add others', assertFails(setDoc(doc(com, 'selectionCommittee', RES), { name: 'x' })));
await t('committee emails are lower case', assertFails(setDoc(doc(adm, 'selectionCommittee', 'Mixed@Example.com'), { name: 'x' })));
await t('an admin on the committee reads responses', assertSucceeds(setDoc(doc(adm2, 'selectionCommittee', ADMIN2), { name: 'Admin Two' })).then(() => assertSucceeds(getDocs(collection(adm2, 'selection', 'c1', 'responses')))));


// ---- questions and photos ----
const photo = (o = {}) => ({ jpeg: '/9j/4AAQSkZJRg==', updatedAt: 1, ...o });
await t('round with questions', assertSucceeds(setDoc(doc(pd, 'selection', 'q1'), round({ cycle: 'q1', questions: [{ id: 'score', type: 'scale', label: 'Score', required: true }] }))));
await t('too many questions', assertFails(setDoc(doc(pd, 'selection', 'q2'), round({ cycle: 'q2', questions: Array.from({ length: 11 }, (_, i) => ({ id: 'q' + i, type: 'text', label: 'x' })) }))));
await t('questions must be a list', assertFails(setDoc(doc(pd, 'selection', 'q3'), round({ cycle: 'q3', questions: 'nope' }))));
await t('empty question list', assertFails(setDoc(doc(pd, 'selection', 'q4'), round({ cycle: 'q4', questions: [] }))));
await t('pd adds a photo', assertSucceeds(setDoc(doc(pd, 'selection', 'c1', 'photos', 'a1'), photo())));
await t('admin replaces a photo', assertSucceeds(setDoc(doc(adm, 'selection', 'c1', 'photos', 'a1'), photo({ updatedAt: 2 }))));
for (const [who, db] of [['resident', res], ['faculty', fac], ['pd', pd], ['admin', adm]]) await t(`${who} reads a photo`, assertSucceeds(getDoc(doc(db, 'selection', 'c1', 'photos', 'a1'))));
await t('resident lists photos', assertSucceeds(getDocs(collection(res, 'selection', 'c1', 'photos'))));
await t('stranger cannot read a photo', assertFails(getDoc(doc(str, 'selection', 'c1', 'photos', 'a1'))));
await t('signed out cannot read a photo', assertFails(getDoc(doc(anon, 'selection', 'c1', 'photos', 'a1'))));
await t('resident cannot add a photo', assertFails(setDoc(doc(res, 'selection', 'c1', 'photos', 'a2'), photo())));
await t('committee cannot add a photo', assertFails(setDoc(doc(com, 'selection', 'c1', 'photos', 'a2'), photo())));
await t('photo takes no extra fields', assertFails(setDoc(doc(pd, 'selection', 'c1', 'photos', 'a2'), photo({ note: 'x' }))));
await t('photo must be a string', assertFails(setDoc(doc(pd, 'selection', 'c1', 'photos', 'a2'), photo({ jpeg: 5 }))));
await t('photo cannot be empty', assertFails(setDoc(doc(pd, 'selection', 'c1', 'photos', 'a2'), photo({ jpeg: '' }))));
await t('photo size limit', assertFails(setDoc(doc(pd, 'selection', 'c1', 'photos', 'a2'), photo({ jpeg: 'A'.repeat(80001) }))));
await t('photo at the size limit', assertSucceeds(setDoc(doc(pd, 'selection', 'c1', 'photos', 'a3'), photo({ jpeg: 'A'.repeat(80000) }))));
await t('pd removes a photo', assertSucceeds(deleteDoc(doc(pd, 'selection', 'c1', 'photos', 'a3'))));
await t('resident cannot remove a photo', assertFails(deleteDoc(doc(res, 'selection', 'c1', 'photos', 'a1'))));

await env.cleanup();
console.log(fail ? `selection rules: ${fail} of ${n} checks failed` : `selection rules: ${n} checks passed`);
process.exit(fail ? 1 : 0);
