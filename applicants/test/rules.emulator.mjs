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

// ---- guests (passcode sign-in: custom token, claim guest, no email) ----
const guestCtx = uid => env.authenticatedContext(uid, { guest: true }).firestore();
const g1 = guestCtx('g1'), g2 = guestCtx('g2');
await env.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), 'selection', 'c1', 'photos', 'a1'), { jpeg: 'AAAA', updatedAt: 1 });
  await setDoc(doc(ctx.firestore(), 'selection', 'c1', 'responses', 'alice@example.com'), resp('alice@example.com', { updatedAt: 1 }));
  await setDoc(doc(ctx.firestore(), 'members', 'someone@example.com'), { rid: 'R9' });
  await setDoc(doc(ctx.firestore(), 'residents', 'R9'), { rid: 'R9', name: 'Private', email: 'someone@example.com' });
});
await t('guest reads a round', assertSucceeds(getDoc(doc(g1, 'selection', 'c1'))));
await t('guest lists rounds', assertSucceeds(getDocs(collection(g1, 'selection'))));
await t('guest reads photos', assertSucceeds(getDoc(doc(g1, 'selection', 'c1', 'photos', 'a1'))));
await t('guest sends their own response', assertSucceeds(setDoc(doc(g1, 'selection', 'c1', 'responses', 'guest-g1'), resp('guest-g1', { name: 'Anonymous' }))));
await t('guest changes their own response', assertSucceeds(setDoc(doc(g1, 'selection', 'c1', 'responses', 'guest-g1'), resp('guest-g1'))));
await t('guest reads their own response', assertSucceeds(getDoc(doc(g1, 'selection', 'c1', 'responses', 'guest-g1'))));
await t('guest cannot read another guest', assertFails(getDoc(doc(g2, 'selection', 'c1', 'responses', 'guest-g1'))));
await t('guest cannot write as another guest', assertFails(setDoc(doc(g2, 'selection', 'c1', 'responses', 'guest-g1'), resp('guest-g1'))));
await t('guest cannot write as a resident', assertFails(setDoc(doc(g1, 'selection', 'c1', 'responses', RES), resp(RES))));
await t('guest cannot read responses', assertFails(getDocs(collection(g1, 'selection', 'c1', 'responses'))));
await t('guest cannot read a resident response', assertFails(getDoc(doc(g1, 'selection', 'c1', 'responses', RES))));
await t('guest cannot answer a closed round', assertFails(setDoc(doc(g1, 'selection', 'old', 'responses', 'guest-g1'), resp('guest-g1'))));
await t('guest cannot create a round', assertFails(setDoc(doc(g1, 'selection', 'c9'), round({ cycle: 'c9' }))));
await t('guest cannot change a round', assertFails(setDoc(doc(g1, 'selection', 'c1'), round({ title: 'Mine' }))));
await t('guest cannot add a photo', assertFails(setDoc(doc(g1, 'selection', 'c1', 'photos', 'a2'), { jpeg: 'AAAA', updatedAt: 1 })));
await t('guest cannot read the committee list', assertFails(getDocs(collection(g1, 'selectionCommittee'))));
await t('guest cannot read residents', assertFails(getDocs(collection(g1, 'residents'))));
await t('guest cannot read a resident', assertFails(getDoc(doc(g1, 'residents', 'R9'))));
await t('guest cannot read members', assertFails(getDoc(doc(g1, 'members', 'someone@example.com'))));
await t('guest cannot read faculty', assertFails(getDoc(doc(g1, 'faculty', FAC))));
await t('guest cannot write an admin', assertFails(setDoc(doc(g1, 'admins', 'guest-g1'), { name: 'x' })));
await t('a token claiming guest but with an email is no guest', assertFails(getDoc(doc(env.authenticatedContext('x', { guest: true, email: 'x@example.com' }).firestore(), 'selection', 'c1'))));

// ---- the Applicants set-up role (access/{email}.roles includes 'selection') ----
const SEL = 'setup.only@example.com';
await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), 'access', SEL), { email: SEL, name: 'Set-up Only', roles: ['selection'], updatedAt: 1, updatedBy: ADMIN }); });
const sel = as(SEL);
await t('set-up role reads a round', assertSucceeds(getDoc(doc(sel, 'selection', 'c1'))));
await t('set-up role creates a round', assertSucceeds(setDoc(doc(sel, 'selection', 'c6'), round({ cycle: 'c6' }))));
await t('set-up role adds a photo', assertSucceeds(setDoc(doc(sel, 'selection', 'c1', 'photos', 'a1'), { jpeg: 'AAAA', updatedAt: 1 })));
await t('set-up role cannot read responses', assertFails(getDocs(collection(sel, 'selection', 'c1', 'responses'))));
await t('set-up role cannot join the committee', assertFails(setDoc(doc(sel, 'selectionCommittee', SEL), { name: 'Me' })));
await t('set-up role cannot list the committee', assertFails(getDocs(collection(sel, 'selectionCommittee'))));
await t('set-up role cannot grant roles', assertFails(setDoc(doc(sel, 'access', 'x@example.com'), { email: 'x@example.com', name: 'X', roles: ['admin'], updatedAt: serverTimestamp(), updatedBy: SEL })));
await t('set-up role is not an admin elsewhere', assertFails(getDocs(collection(sel, 'admins'))));
await t('admin gives the set-up role', assertSucceeds(setDoc(doc(adm, 'access', 'new@example.com'), { email: 'new@example.com', name: 'New', roles: ['selection'], updatedAt: serverTimestamp(), updatedBy: ADMIN })));
await t('a stranger has no set-up powers', assertFails(setDoc(doc(str, 'selection', 'c7'), round({ cycle: 'c7' }))));

// ---- set-up and committee passcodes (custom token claims guest + role, no email) ----
const code = (uid, role) => env.authenticatedContext(uid, { guest: true, role }).firestore();
const su = code('s1', 'setup'), cm = code('c1', 'committee'), oldGuest = guestCtx('g9');
await t('set-up code reads a round', assertSucceeds(getDoc(doc(su, 'selection', 'c1'))));
await t('set-up code creates a round', assertSucceeds(setDoc(doc(su, 'selection', 'c8'), round({ cycle: 'c8' }))));
await t('set-up code adds a photo', assertSucceeds(setDoc(doc(su, 'selection', 'c1', 'photos', 'a1'), { jpeg: 'AAAA', updatedAt: 1 })));
await t('set-up code cannot read responses', assertFails(getDocs(collection(su, 'selection', 'c1', 'responses'))));
await t('set-up code cannot send a response', assertFails(setDoc(doc(su, 'selection', 'c1', 'responses', 'guest-s1'), resp('guest-s1'))));
await t('set-up code cannot touch the committee list', assertFails(setDoc(doc(su, 'selectionCommittee', 'guest-s1'), { name: 'x' })));
await t('set-up code cannot grant roles', assertFails(setDoc(doc(su, 'access', 'x@example.com'), { email: 'x@example.com', name: 'X', roles: ['admin'], updatedAt: serverTimestamp(), updatedBy: 'x' })));
await t('set-up code cannot read residents', assertFails(getDocs(collection(su, 'residents'))));
await t('committee code reads a round and photos', assertSucceeds(getDoc(doc(cm, 'selection', 'c1'))));
await t('committee code reads photos', assertSucceeds(getDoc(doc(cm, 'selection', 'c1', 'photos', 'a1'))));
await t('committee code reads every response', assertSucceeds(getDocs(collection(cm, 'selection', 'c1', 'responses'))));
await t('committee code cannot send a response', assertFails(setDoc(doc(cm, 'selection', 'c1', 'responses', 'guest-c1'), resp('guest-c1'))));
await t('committee code cannot change a round', assertFails(setDoc(doc(cm, 'selection', 'c1'), round({ title: 'Mine' }))));
await t('committee code cannot add a photo', assertFails(setDoc(doc(cm, 'selection', 'c1', 'photos', 'a2'), { jpeg: 'AAAA', updatedAt: 1 })));
await t('committee code cannot delete a response', assertFails(deleteDoc(doc(cm, 'selection', 'c1', 'responses', RES))));
await t('committee code cannot read residents', assertFails(getDocs(collection(cm, 'residents'))));
await t('committee code cannot list the committee', assertFails(getDocs(collection(cm, 'selectionCommittee'))));
await t('a guest still cannot read responses', assertFails(getDocs(collection(oldGuest, 'selection', 'c1', 'responses'))));
await t('a token with an unknown role is nothing', assertFails(getDoc(doc(code('z1', 'boss'), 'selection', 'c1'))));
await t('a role claim with an email is no passcode account', assertFails(getDocs(collection(env.authenticatedContext('q', { guest: true, role: 'committee', email: 'q@example.com' }).firestore(), 'selection', 'c1', 'responses'))));
// ---- the three passcodes, kept in selectionCodes/{role} (changed on the Set up page; the Worker reads them with its service sign-in) ----
const reader = env.authenticatedContext('codes-reader', { codesReader: true }).firestore();
const codeDoc = (c = 'maple-tree-42') => ({ code: c, updatedAt: 1 });
await t('admin sets a passcode', assertSucceeds(setDoc(doc(adm, 'selectionCodes', 'guest'), codeDoc())));
await t('pd sets a passcode', assertSucceeds(setDoc(doc(pd, 'selectionCodes', 'committee'), codeDoc('quiet-river-7'))));
await t('admin sets the setup passcode', assertSucceeds(setDoc(doc(adm, 'selectionCodes', 'setup'), codeDoc('lantern-9-glow'))));
await t('admin reads a passcode', assertSucceeds(getDoc(doc(adm, 'selectionCodes', 'guest'))));
await t('pd reads every passcode', assertSucceeds(getDocs(collection(pd, 'selectionCodes'))));
await t('the Worker service sign-in reads a passcode', assertSucceeds(getDoc(doc(reader, 'selectionCodes', 'guest'))));
await t('the Worker service sign-in lists passcodes', assertSucceeds(getDocs(collection(reader, 'selectionCodes'))));
await t('the Worker service sign-in cannot write one', assertFails(setDoc(doc(reader, 'selectionCodes', 'guest'), codeDoc('other-code-1'))));
await t('the Worker service sign-in cannot read rounds', assertFails(getDoc(doc(reader, 'selection', 'c1'))));
await t('the Worker service sign-in cannot read residents', assertFails(getDocs(collection(reader, 'residents'))));
await t('a claim with an email is no service sign-in', assertFails(getDoc(doc(env.authenticatedContext('x', { codesReader: true, email: 'x@example.com' }).firestore(), 'selectionCodes', 'guest'))));
for (const [who, db] of [['resident', res], ['faculty', fac], ['committee member', com], ['stranger', str], ['signed-out visitor', anon], ['guest', g1], ['set-up code', su], ['committee code', cm]]) {
  await t(`${who} cannot read a passcode`, assertFails(getDoc(doc(db, 'selectionCodes', 'guest'))));
  await t(`${who} cannot list passcodes`, assertFails(getDocs(collection(db, 'selectionCodes'))));
  await t(`${who} cannot set a passcode`, assertFails(setDoc(doc(db, 'selectionCodes', 'guest'), codeDoc('sneaky-code-1'))));
  await t(`${who} cannot clear a passcode`, assertFails(deleteDoc(doc(db, 'selectionCodes', 'guest'))));
}
await t('a passcode needs at least 6 characters', assertFails(setDoc(doc(adm, 'selectionCodes', 'guest'), codeDoc('abc12'))));
await t('a passcode is at most 100 characters', assertFails(setDoc(doc(adm, 'selectionCodes', 'guest'), codeDoc('a'.repeat(101)))));
await t('a passcode of exactly 100 characters is fine', assertSucceeds(setDoc(doc(adm, 'selectionCodes', 'guest'), codeDoc('a'.repeat(100)))));
await t('a passcode must be a string', assertFails(setDoc(doc(adm, 'selectionCodes', 'guest'), { code: 123456, updatedAt: 1 })));
await t('a passcode takes no extra fields', assertFails(setDoc(doc(adm, 'selectionCodes', 'guest'), { ...codeDoc(), role: 'admin' })));
await t('only the three roles have a passcode', assertFails(setDoc(doc(adm, 'selectionCodes', 'admin'), codeDoc())));
await t('admin clears a passcode', assertSucceeds(deleteDoc(doc(adm, 'selectionCodes', 'setup'))));
await t('pd clears a passcode', assertSucceeds(deleteDoc(doc(pd, 'selectionCodes', 'committee'))));
await env.cleanup();
console.log(fail ? `selection rules: ${fail} of ${n} checks failed` : `selection rules: ${n} checks passed`);
process.exit(fail ? 1 : 0);
