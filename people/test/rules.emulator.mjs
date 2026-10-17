// Firestore rules checks for roles kept in the app (access/ and accessLog/) and the faculty ticks, against the local emulator,
// fake accounts only. Rules: logbook/firestore.rules. Run from the repo root:  tools/test-rules.sh
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, deleteDoc, addDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import fs from 'node:fs';

const env = await initializeTestEnvironment({
  projectId: 'demo-logbook',
  firestore: { rules: fs.readFileSync('logbook/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
});
const as = (email) => env.authenticatedContext(email, { email, email_verified: true }).firestore();
const OWNER = 'owner@example.com', OWNER2 = 'owner2@example.com', ADM = 'admin@example.com', PC = 'pc@example.com', PD = 'pd@example.com';
const NEW = 'new@example.com', RES = 'alice@example.com', LEGACY_OWNER = 'legacy@example.com', LEGACY_ADMIN = 'oldadmin@example.com';
const rec = (email, roles, o = {}) => ({ email, name: 'Someone', roles, updatedAt: serverTimestamp(), updatedBy: 'x', ...o });
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  const put = (e, roles) => setDoc(doc(db, 'access', e), { email: e, name: e, roles, updatedAt: 1, updatedBy: 'seed' });
  await put(OWNER, ['owner']); await put(OWNER2, ['owner']); await put(ADM, ['admin']); await put(PC, ['pc']); await put(PD, ['pd']);
  await setDoc(doc(db, 'owners', LEGACY_OWNER), { name: 'Legacy' });
  await setDoc(doc(db, 'admins', LEGACY_ADMIN), { name: 'Old admin' });
  await setDoc(doc(db, 'residents', 'R1'), { rid: 'R1', name: 'Alice', email: RES, status: 'ACTIVE', intake: 2024 });
  await setDoc(doc(db, 'members', RES), { rid: 'R1' });
  await setDoc(doc(db, 'faculty', 'dr@example.com'), { email: 'dr@example.com', name: 'Dr', status: 'ACTIVE', updatedAt: 1 });
});
let n = 0, fail = 0;
async function t(name, p) { n++; try { await p; } catch (e) { fail++; console.log('FAIL', name, e.message.slice(0, 300)); } }
const owner = as(OWNER), adm = as(ADM), pc = as(PC), pd = as(PD), res = as(RES), lowner = as(LEGACY_OWNER), ladm = as(LEGACY_ADMIN);
const at = (db, e) => doc(db, 'access', e);

// ---- who counts as what ----
await t('an access owner reads the access list', assertSucceeds(getDocs(collection(owner, 'access'))));
await t('an old-list owner reads the access list', assertSucceeds(getDocs(collection(lowner, 'access'))));
await t('admin staff list roles', assertSucceeds(getDocs(collection(adm, 'access'))));
await t('a PC lists roles (same powers as admin staff)', assertSucceeds(getDocs(collection(pc, 'access'))));
await t('an old-list admin lists roles', assertSucceeds(getDocs(collection(ladm, 'access'))));
await t('a PD lists roles', assertSucceeds(getDocs(collection(pd, 'access'))));
await t('a resident cannot list roles', assertFails(getDocs(collection(res, 'access'))));
await t('a person checks their own record', assertSucceeds(getDoc(at(res, RES))));
await t('a person cannot read another record', assertFails(getDoc(at(res, ADM))));

// ---- owners grant and remove ----
await t('owner adds an owner', assertSucceeds(setDoc(at(owner, NEW), rec(NEW, ['owner'], { updatedBy: OWNER }))));
await t('owner removes another owner', assertSucceeds(deleteDoc(at(owner, NEW))));
await t('owner adds admin staff', assertSucceeds(setDoc(at(owner, NEW), rec(NEW, ['admin'], { updatedBy: OWNER }))));
await t('owner cannot delete their own record', assertFails(deleteDoc(at(owner, OWNER))));
await t('owner cannot drop their own owner role', assertFails(setDoc(at(owner, OWNER), rec(OWNER, ['admin'], { updatedBy: OWNER }))));
await t('owner keeps their own owner role while adding another', assertSucceeds(setDoc(at(owner, OWNER), rec(OWNER, ['owner', 'pd'], { updatedBy: OWNER }))));
await t('an old-list owner may add an owner', assertSucceeds(setDoc(at(lowner, 'x@example.com'), rec('x@example.com', ['owner'], { updatedBy: LEGACY_OWNER }))));

// ---- admin staff and PCs ----
for (const [who, db, me] of [['admin staff', adm, ADM], ['pc', pc, PC], ['old-list admin', ladm, LEGACY_ADMIN]]) {
  await t(`${who} grants pc`, assertSucceeds(setDoc(at(db, 'g1@example.com'), rec('g1@example.com', ['pc'], { updatedBy: me }))));
  await t(`${who} grants admin`, assertSucceeds(setDoc(at(db, 'g2@example.com'), rec('g2@example.com', ['admin'], { updatedBy: me }))));
  await t(`${who} grants pd`, assertSucceeds(setDoc(at(db, 'g3@example.com'), rec('g3@example.com', ['pd'], { updatedBy: me }))));
  await t(`${who} cannot grant owner`, assertFails(setDoc(at(db, 'g4@example.com'), rec('g4@example.com', ['owner'], { updatedBy: me }))));
  await t(`${who} cannot make themselves owner`, assertFails(setDoc(at(db, me), rec(me, ['owner'], { updatedBy: me }))));
  await t(`${who} cannot edit their own record`, assertFails(setDoc(at(db, me), rec(me, ['admin', 'pd'], { updatedBy: me }))));
  await t(`${who} removes a pc`, assertSucceeds(deleteDoc(at(db, 'g1@example.com'))));
  await t(`${who} cannot remove an owner`, assertFails(deleteDoc(at(db, OWNER2))));
  await t(`${who} cannot edit an owner's record`, assertFails(setDoc(at(db, OWNER2), rec(OWNER2, ['admin'], { updatedBy: me }))));
  await t(`${who} cannot add an owner role to an existing record`, assertFails(setDoc(at(db, 'g2@example.com'), rec('g2@example.com', ['admin', 'owner'], { updatedBy: me }))));
}
await t('a PD cannot grant roles', assertFails(setDoc(at(pd, 'p@example.com'), rec('p@example.com', ['pc'], { updatedBy: PD }))));
await t('a resident cannot grant roles', assertFails(setDoc(at(res, RES), rec(RES, ['admin'], { updatedBy: RES }))));
await t('a resident cannot grant others', assertFails(setDoc(at(res, 'r@example.com'), rec('r@example.com', ['pc'], { updatedBy: RES }))));

// ---- the record is checked ----
await t('unknown roles are refused', assertFails(setDoc(at(owner, 'v1@example.com'), rec('v1@example.com', ['god'], { updatedBy: OWNER }))));
await t('extra fields are refused', assertFails(setDoc(at(owner, 'v2@example.com'), rec('v2@example.com', ['pc'], { updatedBy: OWNER, extra: 1 }))));
await t('roles must be a list', assertFails(setDoc(at(owner, 'v3@example.com'), rec('v3@example.com', 'pc', { updatedBy: OWNER }))));
await t('the id must be lower case', assertFails(setDoc(at(owner, 'Mixed@Example.com'), rec('Mixed@Example.com', ['pc'], { updatedBy: OWNER }))));
await t('updatedBy must be the writer', assertFails(setDoc(at(owner, 'v4@example.com'), rec('v4@example.com', ['pc'], { updatedBy: 'someone-else' }))));
await t('updatedAt must be the server time', assertFails(setDoc(at(owner, 'v5@example.com'), rec('v5@example.com', ['pc'], { updatedBy: OWNER, updatedAt: 5 }))));

// ---- a role in access/ works like the older lists ----
await t('a PC reads CCC data as staff', assertSucceeds(getDocs(collection(pc, 'ccc'))));
await t('a role does not give a resident anything', assertFails(getDocs(collection(res, 'access'))));

// ---- the log ----
const log = (by, o = {}) => ({ by, to: 'new@example.com', change: 'added pc', at: serverTimestamp(), ...o });
await t('admin staff append to the log', assertSucceeds(addDoc(collection(adm, 'accessLog'), log(ADM))));
await t('an owner appends to the log', assertSucceeds(addDoc(collection(owner, 'accessLog'), log(OWNER))));
await t('a log entry must name the writer', assertFails(addDoc(collection(adm, 'accessLog'), log(OWNER))));
await t('a log entry needs the server time', assertFails(addDoc(collection(adm, 'accessLog'), log(ADM, { at: 5 }))));
await t('a log entry takes no extra fields', assertFails(addDoc(collection(adm, 'accessLog'), log(ADM, { x: 1 }))));
await t('a resident cannot write the log', assertFails(addDoc(collection(res, 'accessLog'), log(RES))));
await t('a PD cannot write the log', assertFails(addDoc(collection(pd, 'accessLog'), log(PD))));
await t('admin staff read the log', assertSucceeds(getDocs(collection(adm, 'accessLog'))));
await t('a resident cannot read the log', assertFails(getDocs(collection(res, 'accessLog'))));
let logId;
await env.withSecurityRulesDisabled(async ctx => { logId = (await addDoc(collection(ctx.firestore(), 'accessLog'), { by: 'seed', to: 'x', change: 'seed', at: 1 })).id; });
await t('the log cannot be edited', assertFails(setDoc(doc(owner, 'accessLog', logId), log(OWNER))));
await t('the log cannot be deleted', assertFails(deleteDoc(doc(owner, 'accessLog', logId))));
await t('a grant and its log entry go together in one batch', (async () => {
  const b = writeBatch(adm);
  b.set(at(adm, 'b1@example.com'), rec('b1@example.com', ['pc'], { updatedBy: ADM }));
  b.set(doc(collection(adm, 'accessLog')), log(ADM, { to: 'b1@example.com' }));
  await assertSucceeds(b.commit());
})());

// ---- faculty ticks and work email ----
const fac = (o = {}) => ({ email: 'dr@example.com', name: 'Dr', status: 'ACTIVE', updatedAt: 1, ...o });
const fdoc = (db) => doc(db, 'faculty', 'dr@example.com');
await t('admin staff tick core and ccc and set a work email', assertSucceeds(setDoc(fdoc(adm), fac({ core: true, ccc: false, workEmail: 'dr_work@nuhs.example.sg' }))));
await t('a PC ticks core', assertSucceeds(setDoc(fdoc(pc), fac({ core: true }))));
await t('a PD ticks ccc', assertSucceeds(setDoc(fdoc(pd), fac({ ccc: true }))));
await t('core must be true or false', assertFails(setDoc(fdoc(adm), fac({ core: 'yes' }))));
await t('work email must be text', assertFails(setDoc(fdoc(adm), fac({ workEmail: 5 }))));
await t('faculty still take no other fields', assertFails(setDoc(fdoc(adm), fac({ extra: 1 }))));
await t('a resident cannot tick', assertFails(setDoc(fdoc(res), fac({ core: true }))));

await env.cleanup();
console.log(fail ? `access rules: ${fail} of ${n} checks failed` : `access rules: ${n} checks passed`);
process.exit(fail ? 1 : 0);
