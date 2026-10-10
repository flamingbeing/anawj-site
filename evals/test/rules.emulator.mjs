// Firestore rules checks for evaluations and the PD role, against the local emulator (fake accounts
// only). The rules live in logbook/firestore.rules: one Firebase project, one rules file.
// Run from the repo root with the emulator on port 8085, e.g.
//   npx firebase emulators:exec --only firestore --project demo-logbook "node evals/test/rules.emulator.mjs"
// Needs firebase-tools, @firebase/rules-unit-testing and firebase installed where node can find them.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where } from 'firebase/firestore';
import fs from 'node:fs';

const env = await initializeTestEnvironment({
  projectId: 'demo-logbook',
  firestore: { rules: fs.readFileSync('logbook/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
});
const as = (email, verified = true) => env.authenticatedContext(email, { email, email_verified: verified }).firestore();
const ADMIN = 'boss@example.com', PD = 'pd@example.com', A = 'alice@example.com', B = 'bob@example.com';
const ASR = 'dr.assessor@example.com', OTHER = 'dr.other@example.com';
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'admins', ADMIN), { name: 'Boss' });
  await setDoc(doc(db, 'pds', PD), { name: 'Prog Director' });
  await setDoc(doc(db, 'residents', 'R1'), { rid: 'R1', name: 'Alice', email: A, status: 'ACTIVE', intake: 2024, rYear: 2 });
  await setDoc(doc(db, 'residents', 'R2'), { rid: 'R2', name: 'Bob', email: B, status: 'ACTIVE', intake: 2024, rYear: 2 });
  await setDoc(doc(db, 'summaries', 'R1'), { rid: 'R1', name: 'Alice', intake: 2024, rYear: 2, counts: { '10': 1 }, total: 1 });
  await setDoc(doc(db, 'logbooks', A), { email: A, name: 'Alice', rid: 'R1', settings: {}, templates: [], updatedAt: 1 });
  await setDoc(doc(db, 'logbooks', A, 'cases', 'c1'), { id: 'c1', date: '2026-01-02', details: 'AB tonsil', cats: ['10'], source: 'app' });
});

let n = 0, fail = 0;
async function t(name, p) { n++; try { await p; } catch (e) { fail++; console.log('FAIL', name, e.message.slice(0, 200)); } }
const a = as(A), b = as(B), asr = as(ASR), oth = as(OTHER), pd = as(PD), adm = as(ADMIN), anon = env.unauthenticatedContext().firestore();
const ev = (id, o = {}) => ({ id, rid: 'R1', residentEmail: A, residentName: 'Alice', assessorEmail: ASR, assessorName: 'Dr A',
  formId: 'mini-cex', formVersion: 1, date: '2026-10-10', source: 'evals', status: 'requested', request: { setting: 'OT' },
  createdAt: 1, updatedAt: 1, requestedAt: 1, ...o });

// ---- PD role ----
await t('pd reads own pds entry', assertSucceeds(getDoc(doc(pd, 'pds', PD))));
await t('resident cannot read pds entry of another', assertFails(getDoc(doc(a, 'pds', PD))));
await t('resident cannot make themselves PD', assertFails(setDoc(doc(a, 'pds', A), { name: 'me' })));
await t('pd cannot add PDs', assertFails(setDoc(doc(pd, 'pds', B), { name: 'x' })));
await t('admin adds PD', assertSucceeds(setDoc(doc(adm, 'pds', 'pd2@example.com'), { name: 'PD 2' })));
await t('admin cannot add mixed-case PD id', assertFails(setDoc(doc(adm, 'pds', 'PD3@example.com'), { name: 'PD 3' })));
await t('pd lists residents', assertSucceeds(getDocs(collection(pd, 'residents'))));
await t('pd reads summaries', assertSucceeds(getDoc(doc(pd, 'summaries', 'R1'))));
await t('pd cannot read a logbook', assertFails(getDoc(doc(pd, 'logbooks', A))));
await t('pd cannot read cases', assertFails(getDoc(doc(pd, 'logbooks', A, 'cases', 'c1'))));
await t('pd cannot edit residents', assertFails(setDoc(doc(pd, 'residents', 'R3'), { rid: 'R3', email: 'c@example.com', status: 'ACTIVE' })));
await t('pd cannot write summaries', assertFails(setDoc(doc(pd, 'summaries', 'R1'), { rid: 'R1', counts: {}, total: 0 })));

// ---- evaluations: create ----
await t('resident creates own request', assertSucceeds(setDoc(doc(a, 'evaluations', 'e1'), ev('e1'))));
await t('resident creates draft', assertSucceeds(setDoc(doc(a, 'evaluations', 'e2'), ev('e2', { status: 'draft' }))));
await t('cannot create for another resident', assertFails(setDoc(doc(b, 'evaluations', 'e3'), ev('e3'))));
await t('cannot claim another rid', assertFails(setDoc(doc(b, 'evaluations', 'e3'), ev('e3', { residentEmail: B }))));
await t('cannot pre-fill the assessment', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { assessment: { overall: 9 } }))));
await t('cannot create submitted', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { status: 'submitted' }))));
await t('cannot assess yourself', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { assessorEmail: A }))));
await t('assessor email must be lower case', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { assessorEmail: 'Dr.Assessor@example.com' }))));
await t('source must be evals', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { source: 'app' }))));
await t('unknown field rejected', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { score: 1 }))));
await t('assessor cannot create one', assertFails(setDoc(doc(asr, 'evaluations', 'e3'), ev('e3'))));
await t('anon cannot create', assertFails(setDoc(doc(anon, 'evaluations', 'e3'), ev('e3'))));

// ---- read ----
await t('resident reads own', assertSucceeds(getDoc(doc(a, 'evaluations', 'e1'))));
await t('other resident cannot read', assertFails(getDoc(doc(b, 'evaluations', 'e1'))));
await t('assessor reads assigned', assertSucceeds(getDoc(doc(asr, 'evaluations', 'e1'))));
await t('other assessor cannot read', assertFails(getDoc(doc(oth, 'evaluations', 'e1'))));
await t('pd reads', assertSucceeds(getDoc(doc(pd, 'evaluations', 'e1'))));
await t('admin reads', assertSucceeds(getDoc(doc(adm, 'evaluations', 'e1'))));
await t('anon cannot read', assertFails(getDoc(doc(anon, 'evaluations', 'e1'))));
await t('resident lists own', assertSucceeds(getDocs(query(collection(a, 'evaluations'), where('residentEmail', '==', A)))));
await t('assessor lists assigned', assertSucceeds(getDocs(query(collection(asr, 'evaluations'), where('assessorEmail', '==', ASR)))));
await t('resident cannot list all', assertFails(getDocs(collection(a, 'evaluations'))));
await t('resident cannot list another resident', assertFails(getDocs(query(collection(a, 'evaluations'), where('residentEmail', '==', B)))));
await t('pd lists all', assertSucceeds(getDocs(collection(pd, 'evaluations'))));

// ---- resident updates ----
await t('resident edits request', assertSucceeds(updateDoc(doc(a, 'evaluations', 'e2'), { request: { setting: 'ICU' }, status: 'requested', updatedAt: 2 })));
await t('resident changes assessor before any assessment', assertSucceeds(updateDoc(doc(a, 'evaluations', 'e2'), { assessorEmail: OTHER, assessorName: 'Dr O', updatedAt: 3 })));
await t('resident cannot write the assessment', assertFails(updateDoc(doc(a, 'evaluations', 'e1'), { assessment: { overall: 9 }, updatedAt: 2 })));
await t('resident cannot submit', assertFails(updateDoc(doc(a, 'evaluations', 'e1'), { status: 'submitted', updatedAt: 2 })));
await t('resident cannot change rid', assertFails(updateDoc(doc(a, 'evaluations', 'e1'), { rid: 'R2', updatedAt: 2 })));

// ---- assessor ----
await t('assessor saves a draft assessment', assertSucceeds(updateDoc(doc(asr, 'evaluations', 'e1'), { assessment: { overall: 6 }, updatedAt: 3 })));
await t('resident cannot move a started assessment to another assessor', assertFails(updateDoc(doc(a, 'evaluations', 'e1'), { assessorEmail: OTHER, updatedAt: 4 })));
await t('assessor cannot edit the request', assertFails(updateDoc(doc(asr, 'evaluations', 'e1'), { request: { setting: 'x' }, updatedAt: 4 })));
await t('assessor cannot reassign', assertFails(updateDoc(doc(asr, 'evaluations', 'e1'), { assessorEmail: OTHER, updatedAt: 4 })));
await t('other assessor cannot assess', assertFails(updateDoc(doc(oth, 'evaluations', 'e1'), { assessment: { overall: 1 }, updatedAt: 4 })));
await t('assessor private comments', assertSucceeds(setDoc(doc(asr, 'evaluations', 'e1', 'private', 'assessor'), { comments: 'for the PD', updatedAt: 4 })));
await t('resident cannot read private comments', assertFails(getDoc(doc(a, 'evaluations', 'e1', 'private', 'assessor'))));
await t('pd reads private comments', assertSucceeds(getDoc(doc(pd, 'evaluations', 'e1', 'private', 'assessor'))));
await t('assessor submits', assertSucceeds(updateDoc(doc(asr, 'evaluations', 'e1'), { assessment: { overall: 7 }, status: 'submitted', submittedAt: 5, updatedAt: 5 })));
await t('submitted is locked for the assessor', assertFails(updateDoc(doc(asr, 'evaluations', 'e1'), { assessment: { overall: 9 }, updatedAt: 6 })));
await t('submitted is locked for the resident', assertFails(updateDoc(doc(a, 'evaluations', 'e1'), { request: { setting: 'x' }, updatedAt: 6 })));
await t('private comments locked after submit', assertFails(setDoc(doc(asr, 'evaluations', 'e1', 'private', 'assessor'), { comments: 'late', updatedAt: 6 })));
await t('pd cannot edit', assertFails(updateDoc(doc(pd, 'evaluations', 'e1'), { status: 'requested', updatedAt: 6 })));
await t('admin can reopen', assertSucceeds(updateDoc(doc(adm, 'evaluations', 'e1'), { status: 'requested', updatedAt: 7 })));

// ---- delete ----
await t('resident cannot delete a requested one', assertFails(deleteDoc(doc(a, 'evaluations', 'e1'))));
await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'evaluations', 'e4'), ev('e4', { status: 'draft' })));
await t('resident deletes own draft', assertSucceeds(deleteDoc(doc(a, 'evaluations', 'e4'))));
await t('admin deletes', assertSucceeds(deleteDoc(doc(adm, 'evaluations', 'e2'))));

// ---- forms ----
await t('signed-in reads forms', assertSucceeds(getDoc(doc(a, 'evalForms', 'mini-cex'))));
await t('resident cannot write forms', assertFails(setDoc(doc(a, 'evalForms', 'mini-cex'), { name: 'x' })));
await t('admin writes forms', assertSucceeds(setDoc(doc(adm, 'evalForms', 'mini-cex'), { name: 'Mini-CEX' })));

await env.cleanup();
console.log(`${n - fail}/${n} evals rules checks passed`);
process.exit(fail ? 1 : 0);
