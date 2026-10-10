// Firestore rules checks for evaluations, the faculty list, applications and the PD role, against
// the local emulator (fake accounts only). The rules live in logbook/firestore.rules: one Firebase
// project, one rules file.
// Run from the repo root with the emulator on port 8085, e.g.
//   npx firebase emulators:exec --only firestore --project demo-logbook "node evals/test/rules.emulator.mjs"
// Needs firebase-tools, @firebase/rules-unit-testing and firebase installed where node can find them.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, deleteField } from 'firebase/firestore';
import fs from 'node:fs';

const env = await initializeTestEnvironment({
  projectId: 'demo-logbook',
  firestore: { rules: fs.readFileSync('logbook/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
});
const as = (email, verified = true) => env.authenticatedContext(email, { email, email_verified: verified }).firestore();
const ADMIN = 'boss@example.com', PD = 'pd@example.com', A = 'alice@example.com', B = 'bob@example.com';
const ASR = 'dr.assessor@example.com', OTHER = 'dr.other@example.com', GONE = 'dr.gone@example.com', NOTFAC = 'dr.unlisted@example.com';
const STRANGER = 'stranger@example.com';
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'admins', ADMIN), { name: 'Boss' });
  await setDoc(doc(db, 'pds', PD), { name: 'Prog Director' });
  await setDoc(doc(db, 'residents', 'R1'), { rid: 'R1', name: 'Alice', email: A, status: 'ACTIVE', intake: 2024, rYear: 2 });
  await setDoc(doc(db, 'residents', 'R2'), { rid: 'R2', name: 'Bob', email: B, status: 'ACTIVE', intake: 2024, rYear: 2 });
  await setDoc(doc(db, 'summaries', 'R1'), { rid: 'R1', name: 'Alice', intake: 2024, rYear: 2, counts: { '10': 1 }, total: 1 });
  await setDoc(doc(db, 'logbooks', A), { email: A, name: 'Alice', rid: 'R1', settings: {}, templates: [], updatedAt: 1 });
  await setDoc(doc(db, 'logbooks', A, 'cases', 'c1'), { id: 'c1', date: '2026-01-02', details: 'AB tonsil', cats: ['10'], source: 'app' });
  for (const [e, status] of [[ASR, 'ACTIVE'], [OTHER, 'ACTIVE'], [GONE, 'INACTIVE'], [A, 'ACTIVE']]) {
    await setDoc(doc(db, 'faculty', e), { email: e, name: 'Dr ' + e.split('@')[0], status, updatedAt: 1 });
  }
});

let n = 0, fail = 0;
async function t(name, p) { n++; try { await p; } catch (e) { fail++; console.log('FAIL', name, e.message.slice(0, 300)); } }
const a = as(A), b = as(B), asr = as(ASR), oth = as(OTHER), pd = as(PD), adm = as(ADMIN), str = as(STRANGER);
const anon = env.unauthenticatedContext().firestore(), unv = as(STRANGER, false);
const ev = (id, o = {}) => ({ id, rid: 'R1', residentEmail: A, residentName: 'Alice', assessorEmail: ASR, assessorName: 'Dr A',
  formId: 'dops', formVersion: 1, date: '2026-10-10', source: 'evals', status: 'requested',
  itemId: 'DOPS-2-01', itemText: 'Mask holding and bag ventilation', tool: 'DOPS', epa: '2', level: null, caseKey: '2026-10-10|AB',
  request: { date: '2026-10-10', location: 'Operating theatre', initials: 'AB', ageBand: '40-49', gender: 'F' },
  createdAt: 1, updatedAt: 1, requestedAt: Date.now(), ...o });
const seed = (id, o) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'evaluations', id), ev(id, o)));
const now = () => Date.now();

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
await t('pd adds a resident', assertSucceeds(setDoc(doc(pd, 'residents', 'R3'), { rid: 'R3', name: 'Cara', email: 'cara@example.com', status: 'ACTIVE', intake: 2025, rYear: 1 })));
await t('pd edits a resident', assertSucceeds(setDoc(doc(pd, 'residents', 'R3'), { rid: 'R3', name: 'Cara', email: 'cara@example.com', status: 'ON LEAVE', intake: 2025, rYear: 1 })));
await t('pd cannot move a resident to another email', assertFails(setDoc(doc(pd, 'residents', 'R1'), { rid: 'R1', name: 'Alice', email: B, status: 'ACTIVE', intake: 2024, rYear: 2 })));
await t('pd sets a resident on leave', assertSucceeds(setDoc(doc(pd, 'residents', 'R3'), { rid: 'R3', name: 'Cara', email: 'cara@example.com', status: 'ACTIVE', intake: 2025, rYear: 2 })));
await t('admin may change a resident email', assertSucceeds(setDoc(doc(adm, 'residents', 'R3'), { rid: 'R3', name: 'Cara', email: 'cara2@example.com', status: 'ACTIVE', intake: 2025, rYear: 2 })));
await t('pd resident must be valid', assertFails(setDoc(doc(pd, 'residents', 'R4'), { rid: 'R4', email: 'D@example.com', status: 'ACTIVE' })));
await t('pd cannot delete a resident', assertFails(deleteDoc(doc(pd, 'residents', 'R3'))));
await t('resident cannot add residents', assertFails(setDoc(doc(a, 'residents', 'R5'), { rid: 'R5', email: 'e@example.com', status: 'ACTIVE' })));
await t('pd cannot write summaries', assertFails(setDoc(doc(pd, 'summaries', 'R1'), { rid: 'R1', counts: {}, total: 0 })));

// ---- faculty list ----
const fac = (e, o = {}) => ({ email: e, name: 'Dr X', status: 'ACTIVE', updatedAt: 1, ...o });
await t('stranger cannot list faculty', assertFails(getDocs(collection(str, 'faculty'))));
await t('resident without a member entry cannot list faculty', assertFails(getDocs(collection(b, 'faculty'))));
await t('resident registers as member', assertSucceeds(setDoc(doc(b, 'members', B), { rid: 'R2' })));
await t('resident reads own member entry', assertSucceeds(getDoc(doc(b, 'members', B))));
await t('cannot claim another resident as member', assertFails(setDoc(doc(str, 'members', STRANGER), { rid: 'R2' })));
await t('cannot write another member entry', assertFails(setDoc(doc(a, 'members', B), { rid: 'R2' })));
await t('member entry has only rid', assertFails(setDoc(doc(b, 'members', B), { rid: 'R2', role: 'admin' })));
await t('resident lists faculty', assertSucceeds(getDocs(collection(b, 'faculty'))));
await t('faculty lists faculty', assertSucceeds(getDocs(collection(asr, 'faculty'))));
await t('inactive faculty lists faculty', assertSucceeds(getDocs(collection(as(GONE), 'faculty'))));
await t('pd lists faculty', assertSucceeds(getDocs(collection(pd, 'faculty'))));
await t('stranger checks own faculty entry', assertSucceeds(getDoc(doc(str, 'faculty', STRANGER))));
await t('stranger cannot read a faculty entry', assertFails(getDoc(doc(str, 'faculty', ASR))));
await t('unverified cannot read faculty', assertFails(getDocs(collection(unv, 'faculty'))));
await t('anon cannot read faculty', assertFails(getDocs(collection(anon, 'faculty'))));
await t('pd adds faculty', assertSucceeds(setDoc(doc(pd, 'faculty', 'dr.new@example.com'), fac('dr.new@example.com'))));
await t('admin adds faculty', assertSucceeds(setDoc(doc(adm, 'faculty', 'dr.new2@example.com'), fac('dr.new2@example.com'))));
await t('admin sets faculty inactive', assertSucceeds(setDoc(doc(adm, 'faculty', 'dr.new2@example.com'), fac('dr.new2@example.com', { status: 'INACTIVE' }))));
await t('faculty id must be lower case', assertFails(setDoc(doc(adm, 'faculty', 'Dr.Up@example.com'), fac('Dr.Up@example.com'))));
await t('faculty email must match id', assertFails(setDoc(doc(adm, 'faculty', 'dr.x@example.com'), fac('dr.y@example.com'))));
await t('faculty bad status', assertFails(setDoc(doc(adm, 'faculty', 'dr.x@example.com'), fac('dr.x@example.com', { status: 'MAYBE' }))));
await t('faculty unknown field', assertFails(setDoc(doc(adm, 'faculty', 'dr.x@example.com'), fac('dr.x@example.com', { phone: '1' }))));
await t('resident cannot add faculty', assertFails(setDoc(doc(a, 'faculty', 'dr.x@example.com'), fac('dr.x@example.com'))));
await t('faculty cannot add faculty', assertFails(setDoc(doc(asr, 'faculty', 'dr.x@example.com'), fac('dr.x@example.com'))));
await t('pd cannot delete faculty', assertFails(deleteDoc(doc(pd, 'faculty', 'dr.new@example.com'))));

// ---- applications ----
const app = (uid, email, o = {}) => ({ uid, email, name: 'Sam', role: 'faculty', note: 'Consultant', status: 'pending', createdAt: 1, ...o });
await t('stranger applies', assertSucceeds(setDoc(doc(str, 'applications', STRANGER), app(STRANGER, STRANGER))));
await t('stranger edits own pending application', assertSucceeds(setDoc(doc(str, 'applications', STRANGER), app(STRANGER, STRANGER, { role: 'resident' }))));
await t('stranger reads own application', assertSucceeds(getDoc(doc(str, 'applications', STRANGER))));
await t('cannot apply as approved', assertFails(setDoc(doc(b, 'applications', B), app(B, B, { status: 'approved' }))));
await t('cannot apply for another uid', assertFails(setDoc(doc(b, 'applications', 'someone'), app('someone', B))));
await t('cannot apply with another email', assertFails(setDoc(doc(b, 'applications', B), app(B, 'x@example.com'))));
await t('cannot apply as admin role', assertFails(setDoc(doc(b, 'applications', B), app(B, B, { role: 'admin' }))));
await t('unverified cannot apply', assertFails(setDoc(doc(unv, 'applications', STRANGER), app(STRANGER, STRANGER))));
await t('other user cannot read an application', assertFails(getDoc(doc(b, 'applications', STRANGER))));
await t('resident cannot list applications', assertFails(getDocs(collection(a, 'applications'))));
await t('pd lists applications', assertSucceeds(getDocs(collection(pd, 'applications'))));
await t('applicant cannot approve themselves', assertFails(updateDoc(doc(str, 'applications', STRANGER), { status: 'approved' })));
await t('pd cannot change the application body', assertFails(updateDoc(doc(pd, 'applications', STRANGER), { role: 'faculty', status: 'approved', decidedAt: 2, decidedBy: PD })));
await t('pd approves', assertSucceeds(updateDoc(doc(pd, 'applications', STRANGER), { status: 'approved', decidedAt: 2, decidedBy: PD })));
await t('applicant cannot edit after decision', assertFails(setDoc(doc(str, 'applications', STRANGER), app(STRANGER, STRANGER))));
await t('admin rejects', assertSucceeds(updateDoc(doc(adm, 'applications', STRANGER), { status: 'rejected', decidedAt: 3, decidedBy: ADMIN })));
await t('rejected applicant cannot keep the decision fields', assertFails(setDoc(doc(str, 'applications', STRANGER), app(STRANGER, STRANGER, { decidedAt: 3 }))));
await t('rejected applicant applies again', assertSucceeds(setDoc(doc(str, 'applications', STRANGER), app(STRANGER, STRANGER))));

// ---- evaluations: create ----
await t('resident creates own request', assertSucceeds(setDoc(doc(a, 'evaluations', 'e1'), ev('e1'))));
await t('resident creates draft', assertSucceeds(setDoc(doc(a, 'evaluations', 'e2'), ev('e2', { status: 'draft' }))));
await t('resident creates Mini-CEX', assertSucceeds(setDoc(doc(a, 'evaluations', 'e5'), ev('e5', { formId: 'minicex', tool: 'MiniCEX', itemId: 'MiniCEX-1-01', level: 3 }))));
await t('cannot create for another resident', assertFails(setDoc(doc(b, 'evaluations', 'e3'), ev('e3'))));
await t('cannot claim another rid', assertFails(setDoc(doc(b, 'evaluations', 'e3'), ev('e3', { residentEmail: B }))));
await t('cannot pre-fill the assessment', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { assessment: { q1: 'Low' } }))));
await t('cannot pre-fill a decline', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { declineReason: { code: 'other', text: 'x' } }))));
await t('cannot create submitted', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { status: 'submitted' }))));
await t('cannot create declined', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { status: 'declined' }))));
await t('cannot assess yourself', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { assessorEmail: A }))));
await t('assessor must be on the faculty list', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { assessorEmail: NOTFAC }))));
await t('assessor must be active faculty', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { assessorEmail: GONE }))));
await t('assessor email must be lower case', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { assessorEmail: 'Dr.Assessor@example.com' }))));
await t('source must be evals', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { source: 'app' }))));
await t('tool must be known', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { tool: 'MSF' }))));
await t('formId too long', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { formId: 'x'.repeat(61) }))));
await t('unknown field rejected', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { score: 1 }))));
await t('assessor cannot create one', assertFails(setDoc(doc(asr, 'evaluations', 'e3'), ev('e3'))));
await t('anon cannot create', assertFails(setDoc(doc(anon, 'evaluations', 'e3'), ev('e3'))));
await t('non-resident cannot create', assertFails(setDoc(doc(str, 'evaluations', 'e3'), ev('e3', { residentEmail: STRANGER }))));

// ---- read ----
await t('resident reads own', assertSucceeds(getDoc(doc(a, 'evaluations', 'e1'))));
await t('other resident cannot read', assertFails(getDoc(doc(b, 'evaluations', 'e1'))));
await t('assessor reads assigned', assertSucceeds(getDoc(doc(asr, 'evaluations', 'e1'))));
await t('other assessor cannot read', assertFails(getDoc(doc(oth, 'evaluations', 'e1'))));
await t('pd reads', assertSucceeds(getDoc(doc(pd, 'evaluations', 'e1'))));
await t('admin reads', assertSucceeds(getDoc(doc(adm, 'evaluations', 'e1'))));
await t('anon cannot read', assertFails(getDoc(doc(anon, 'evaluations', 'e1'))));
await t('resident lists own', assertSucceeds(getDocs(query(collection(a, 'evaluations'), where('residentEmail', '==', A)))));
await t('assessor lists assigned (sent only)', assertSucceeds(getDocs(query(collection(asr, 'evaluations'), where('assessorEmail', '==', ASR), where('status', 'in', ['requested', 'submitted', 'declined', 'cancelled'])))));
await t('assessor cannot list including drafts', assertFails(getDocs(query(collection(asr, 'evaluations'), where('assessorEmail', '==', ASR)))));
await t('assessor cannot read an unsent draft', assertFails(getDoc(doc(asr, 'evaluations', 'e2'))));
await t('resident cannot list all', assertFails(getDocs(collection(a, 'evaluations'))));
await t('resident cannot list another resident', assertFails(getDocs(query(collection(a, 'evaluations'), where('residentEmail', '==', B)))));
await t('pd lists all', assertSucceeds(getDocs(collection(pd, 'evaluations'))));

// ---- resident updates ----
await t('case card has no extra keys', assertFails(updateDoc(doc(a, 'evaluations', 'e2'), { request: { location: 'ICU', name: 'Full Name' }, updatedAt: 2 })));
await t('case card initials max 3', assertFails(updateDoc(doc(a, 'evaluations', 'e2'), { request: { initials: 'ABCD' }, updatedAt: 2 })));
await t('cannot create a future-dated request', assertFails(setDoc(doc(a, 'evaluations', 'e3'), ev('e3', { requestedAt: now() + 3600e3 }))));
await t('resident edits request', assertSucceeds(updateDoc(doc(a, 'evaluations', 'e2'), { request: { location: 'ICU' }, status: 'requested', updatedAt: 2 })));
await t('resident changes assessor before any assessment', assertSucceeds(updateDoc(doc(a, 'evaluations', 'e2'), { assessorEmail: OTHER, assessorName: 'Dr O', updatedAt: 3 })));
await t('resident cannot change to an unlisted assessor', assertFails(updateDoc(doc(a, 'evaluations', 'e2'), { assessorEmail: NOTFAC, updatedAt: 3 })));
await t('resident cannot change to an inactive assessor', assertFails(updateDoc(doc(a, 'evaluations', 'e2'), { assessorEmail: GONE, updatedAt: 3 })));
await t('resident changes item before any assessment', assertSucceeds(updateDoc(doc(a, 'evaluations', 'e2'), { itemId: 'DOPS-2-02', itemText: 'Successful LMA insertion', updatedAt: 3 })));
await t('resident nudges (chasedAt)', assertSucceeds(updateDoc(doc(a, 'evaluations', 'e1'), { chasedAt: now(), updatedAt: 3 })));
await t('resident cannot write the assessment', assertFails(updateDoc(doc(a, 'evaluations', 'e1'), { assessment: { q1: 'Low' }, updatedAt: 2 })));
await t('resident cannot write metrics', assertFails(updateDoc(doc(a, 'evaluations', 'e1'), { metrics: { submitAttempts: 0 }, updatedAt: 2 })));
await t('resident cannot submit', assertFails(updateDoc(doc(a, 'evaluations', 'e1'), { status: 'submitted', submittedAt: now(), updatedAt: 2 })));
await t('resident cannot decline', assertFails(updateDoc(doc(a, 'evaluations', 'e1'), { status: 'declined', declineReason: { code: 'other', text: 'x' }, declinedAt: now(), updatedAt: 2 })));
await t('resident cannot set seenAt before submit', assertFails(updateDoc(doc(a, 'evaluations', 'e1'), { seenAt: now(), updatedAt: 2 })));
await t('resident cannot change rid', assertFails(updateDoc(doc(a, 'evaluations', 'e1'), { rid: 'R2', updatedAt: 2 })));

// ---- assessor ----
await t('assessor opens the form (metrics only)', assertSucceeds(updateDoc(doc(asr, 'evaluations', 'e1'), { metrics: { openedAt: 2 }, updatedAt: 3 })));
await t('resident may still change the assessor of an opened one', assertSucceeds(updateDoc(doc(a, 'evaluations', 'e1'), { assessorEmail: OTHER, assessorName: 'Dr O', updatedAt: 3 })));
await t('resident changes it back', assertSucceeds(updateDoc(doc(a, 'evaluations', 'e1'), { assessorEmail: ASR, assessorName: 'Dr A', updatedAt: 3 })));
await t('assessor saves a draft assessment', assertSucceeds(updateDoc(doc(asr, 'evaluations', 'e1'), { assessment: { q1: 'Moderate', q3: 6 }, metrics: { openedAt: 2, firstAnswerAt: 3 }, updatedAt: 3 })));
await t('resident cannot move a started assessment to another assessor', assertFails(updateDoc(doc(a, 'evaluations', 'e1'), { assessorEmail: OTHER, updatedAt: 4 })));
await t('resident cannot change the item of a started assessment', assertFails(updateDoc(doc(a, 'evaluations', 'e1'), { itemId: 'DOPS-2-03', updatedAt: 4 })));
await t('resident cannot pull a started one back to draft', assertFails(updateDoc(doc(a, 'evaluations', 'e1'), { status: 'draft', updatedAt: 4 })));
await t('resident may still nudge a started one', assertSucceeds(updateDoc(doc(a, 'evaluations', 'e1'), { chasedAt: now(), updatedAt: 4 })));
await t('assessor cannot edit the request', assertFails(updateDoc(doc(asr, 'evaluations', 'e1'), { request: { location: 'x' }, updatedAt: 4 })));
await t('assessor cannot reassign', assertFails(updateDoc(doc(asr, 'evaluations', 'e1'), { assessorEmail: OTHER, updatedAt: 4 })));
await t('assessor cannot set seenAt', assertFails(updateDoc(doc(asr, 'evaluations', 'e1'), { seenAt: 4, updatedAt: 4 })));
await t('other assessor cannot assess', assertFails(updateDoc(doc(oth, 'evaluations', 'e1'), { assessment: { q1: 'Low' }, updatedAt: 4 })));
await t('assessor private comments', assertSucceeds(setDoc(doc(asr, 'evaluations', 'e1', 'private', 'assessor'), { comments: 'for the PD', updatedAt: 4 })));
await t('resident cannot read private comments', assertFails(getDoc(doc(a, 'evaluations', 'e1', 'private', 'assessor'))));
await t('pd reads private comments', assertSucceeds(getDoc(doc(pd, 'evaluations', 'e1', 'private', 'assessor'))));
await t('submit needs a current submittedAt', assertFails(updateDoc(doc(asr, 'evaluations', 'e1'), { assessment: { q1: 'Low' }, status: 'submitted', submittedAt: 5, updatedAt: 5 })));
await t('submit needs submittedAt', assertFails(updateDoc(doc(asr, 'evaluations', 'e1'), { assessment: { q1: 'Low' }, status: 'submitted', updatedAt: 5 })));
await t('submit cannot be future-dated', assertFails(updateDoc(doc(asr, 'evaluations', 'e1'), { status: 'submitted', submittedAt: now() + 3600e3, updatedAt: 5 })));
await t('assessor cannot submit with a decline reason', assertFails(updateDoc(doc(asr, 'evaluations', 'e1'), { status: 'submitted', submittedAt: now(), declineReason: { code: 'other' }, updatedAt: 5 })));
await seed('e11', { assessment: { q1: 'Low' } });
await t('a submit made offline syncs hours later', assertSucceeds(updateDoc(doc(asr, 'evaluations', 'e11'), { status: 'submitted', submittedAt: now() - 3 * 3600e3, updatedAt: now() - 3 * 3600e3 })));
await t('assessor submits', assertSucceeds(updateDoc(doc(asr, 'evaluations', 'e1'), { assessment: { q1: 'Moderate', q3: 7 }, metrics: { openedAt: 2, firstAnswerAt: 3, submitAttempts: 1 }, status: 'submitted', submittedAt: now(), updatedAt: 5 })));
await t('assessor edits within 15 min', assertSucceeds(updateDoc(doc(asr, 'evaluations', 'e1'), { assessment: { q1: 'High', q3: 7 }, updatedAt: 6 })));
await t('assessor cannot change status after submit', assertFails(updateDoc(doc(asr, 'evaluations', 'e1'), { status: 'requested', updatedAt: 6 })));
await t('assessor cannot move submittedAt', assertFails(updateDoc(doc(asr, 'evaluations', 'e1'), { submittedAt: now() + 600e3, updatedAt: 6 })));
await t('submitted is locked for the resident', assertFails(updateDoc(doc(a, 'evaluations', 'e1'), { request: { location: 'x' }, updatedAt: 6 })));
await t('resident cannot cancel a submitted one', assertFails(updateDoc(doc(a, 'evaluations', 'e1'), { status: 'cancelled', updatedAt: 6 })));
await t('resident marks feedback seen', assertSucceeds(updateDoc(doc(a, 'evaluations', 'e1'), { seenAt: now(), updatedAt: 6 })));
await t('private comments locked after submit', assertFails(setDoc(doc(asr, 'evaluations', 'e1', 'private', 'assessor'), { comments: 'late', updatedAt: 6 })));
await seed('e6', { status: 'submitted', assessment: { q1: 'Low' }, submittedAt: now() - 16 * 60e3 });
await t('submitted is locked for the assessor after 15 min', assertFails(updateDoc(doc(asr, 'evaluations', 'e6'), { assessment: { q1: 'High' }, updatedAt: 6 })));
await seed('e7', { status: 'submitted', assessment: { q1: 'Low' } });
await t('no submittedAt means no edit window', assertFails(updateDoc(doc(asr, 'evaluations', 'e7'), { assessment: { q1: 'High' }, updatedAt: 6 })));
await t('pd cannot edit', assertFails(updateDoc(doc(pd, 'evaluations', 'e1'), { status: 'requested', updatedAt: 6 })));
await t('admin can reopen', assertSucceeds(updateDoc(doc(adm, 'evaluations', 'e1'), { status: 'requested', updatedAt: 7 })));
await t('admin cannot break validity', assertFails(updateDoc(doc(adm, 'evaluations', 'e1'), { status: 'lost', updatedAt: 7 })));

// ---- decline and reassign ----
await t('decline needs a reason', assertFails(updateDoc(doc(asr, 'evaluations', 'e5'), { status: 'declined', declinedAt: now(), updatedAt: 8 })));
await t('decline reason needs a code', assertFails(updateDoc(doc(asr, 'evaluations', 'e5'), { status: 'declined', declineReason: { text: 'x' }, declinedAt: now(), updatedAt: 8 })));
await t('decline reason has no extra keys', assertFails(updateDoc(doc(asr, 'evaluations', 'e5'), { status: 'declined', declineReason: { code: 'other', text: 'x', who: 1 }, declinedAt: now(), updatedAt: 8 })));
await t('decline needs a current declinedAt', assertFails(updateDoc(doc(asr, 'evaluations', 'e5'), { status: 'declined', declineReason: { code: 'not-observed' }, declinedAt: 5, updatedAt: 8 })));
await t('other assessor cannot decline', assertFails(updateDoc(doc(oth, 'evaluations', 'e5'), { status: 'declined', declineReason: { code: 'not-observed' }, declinedAt: now(), updatedAt: 8 })));
await t('assessor saves before declining', assertSucceeds(updateDoc(doc(asr, 'evaluations', 'e5'), { assessment: { q1: 'Ward' }, updatedAt: 8 })));
await t('decline must drop partial answers', assertFails(updateDoc(doc(asr, 'evaluations', 'e5'), { status: 'declined', declineReason: { code: 'not-observed', text: '' }, declinedAt: now(), updatedAt: 8 })));
await t('assessor declines', assertSucceeds(updateDoc(doc(asr, 'evaluations', 'e5'), { status: 'declined', declineReason: { code: 'not-observed', text: '' }, declinedAt: now(), assessment: deleteField(), updatedAt: 8 })));
await t('assessor cannot write after declining', assertFails(updateDoc(doc(asr, 'evaluations', 'e5'), { assessment: { q1: 'ICU' }, updatedAt: 9 })));
await t('resident cannot reassign to the same assessor', assertFails(updateDoc(doc(a, 'evaluations', 'e5'), { status: 'requested', assessment: deleteField(), updatedAt: 9 })));
await t('resident cannot reassign to unlisted faculty', assertFails(updateDoc(doc(a, 'evaluations', 'e5'), { status: 'requested', assessorEmail: NOTFAC, assessment: deleteField(), updatedAt: 9 })));
await seed('e14', { status: 'declined', declineReason: { code: 'conflict' }, declinedAt: 5, assessment: { q1: 'Low' } });   // older shape
await t('resident cannot reassign keeping the old answers', assertFails(updateDoc(doc(a, 'evaluations', 'e14'), { status: 'requested', assessorEmail: OTHER, updatedAt: 9 })));
await t('resident cannot clear the decline reason', assertFails(updateDoc(doc(a, 'evaluations', 'e5'), { status: 'requested', assessorEmail: OTHER, assessment: deleteField(), declineReason: deleteField(), updatedAt: 9 })));
await t('resident cannot reassign to themselves', assertFails(updateDoc(doc(a, 'evaluations', 'e5'), { status: 'requested', assessorEmail: A, assessment: deleteField(), updatedAt: 9 })));
await t('resident reassigns after decline', assertSucceeds(updateDoc(doc(a, 'evaluations', 'e5'), { status: 'requested', assessorEmail: OTHER, assessorName: 'Dr O', assessment: deleteField(), metrics: deleteField(), requestedAt: now(), updatedAt: 9 })));
await t('old assessor loses access', assertFails(getDoc(doc(asr, 'evaluations', 'e5'))));
await t('new assessor reads it', assertSucceeds(getDoc(doc(oth, 'evaluations', 'e5'))));
await seed('e8', { status: 'declined', declineReason: { code: 'conflict' }, declinedAt: 5 });
await t('resident cancels a declined one', assertSucceeds(updateDoc(doc(a, 'evaluations', 'e8'), { status: 'cancelled', updatedAt: 9 })));
await t('cancelled is locked for the resident', assertFails(updateDoc(doc(a, 'evaluations', 'e8'), { status: 'requested', updatedAt: 10 })));
await t('resident cancels a requested one', assertSucceeds(updateDoc(doc(a, 'evaluations', 'e2'), { status: 'cancelled', updatedAt: 10 })));

// ---- delete (resident data is never deleted, except an unsent draft) ----
await t('resident cannot delete a requested one', assertFails(deleteDoc(doc(a, 'evaluations', 'e1'))));
await t('pd cannot delete', assertFails(deleteDoc(doc(pd, 'evaluations', 'e1'))));
await seed('e4', { status: 'draft' });
await t('resident deletes own draft', assertSucceeds(deleteDoc(doc(a, 'evaluations', 'e4'))));
await seed('e12', { status: 'draft', assessment: { q1: 'Low' } });
await t('resident cannot delete a draft with answers', assertFails(deleteDoc(doc(a, 'evaluations', 'e12'))));
await t('admin deletes', assertSucceeds(deleteDoc(doc(adm, 'evaluations', 'e2'))));

// ---- the app's own write shapes (demo-backend.js clean helpers, shared with cloud.js) pass the rules ----
const { cleanEval, cleanPatch, stampPatch, cleanFaculty, cleanApplication } = await import('../js/demo-backend.js');
const write = (db, id, cur, patch) => {
  const { set, remove } = cleanPatch(stampPatch(cur, patch));
  for (const k of remove) set[k] = deleteField();
  return updateDoc(doc(db, 'evaluations', id), set);
};
const e9 = cleanEval(ev('e9', { createdAt: undefined, updatedAt: undefined, requestedAt: undefined }));
await t('app: resident sends', assertSucceeds(setDoc(doc(a, 'evaluations', 'e9'), e9)));
await t('app: assessor saves', assertSucceeds(write(asr, 'e9', e9, { assessment: { q1: 'Low' }, metrics: { openedAt: 1 } })));
await t('app: assessor declines', assertSucceeds(write(asr, 'e9', { ...e9, assessment: { q1: 'Low' } }, { status: 'declined', declineReason: { code: 'other', text: 'Away' }, assessment: null, metrics: null })));
const e9d = (await getDoc(doc(pd, 'evaluations', 'e9'))).data();
await t('app: resident reassigns', assertSucceeds(write(a, 'e9', e9d, { status: 'requested', assessorEmail: OTHER, assessorName: 'Dr O' })));
const e9r = (await getDoc(doc(pd, 'evaluations', 'e9'))).data();
await t('app: new assessor submits', assertSucceeds(write(oth, 'e9', e9r, { assessment: { q1: 'High' }, status: 'submitted' })));
await t('app: resident sees', assertSucceeds(write(a, 'e9', { ...e9r, status: 'submitted' }, { seenAt: Date.now() })));
await t('app: pd saves faculty', assertSucceeds(setDoc(doc(pd, 'faculty', 'dr.app@example.com'), cleanFaculty({ email: 'Dr.App@example.com', name: 'Dr App' }))));
await t('app: applies', assertSucceeds(setDoc(doc(b, 'applications', B), cleanApplication({ uid: B, email: B, name: 'Bob', role: 'faculty', note: '' }))));

// ---- worst-size documents stay under the rules engine's 1000-expression limit ----
const big = {}; for (let i = 1; i <= 80; i++) big['q' + i] = i % 9 + 1;
const bigReq = { date: '2026-10-10', location: 'x'.repeat(100), initials: 'ABC', ageBand: '40-49', gender: 'F', coManaged: true, notes: 'n'.repeat(1000) };
await seed('e13', { request: bigReq, assessment: big, metrics: { openedAt: 1, firstAnswerAt: 2, submitAttempts: 3 } });
await t('big: assessor saves', assertSucceeds(updateDoc(doc(asr, 'evaluations', 'e13'), { assessment: { ...big, q1: 2 }, updatedAt: 20 })));
await t('big: assessor submits', assertSucceeds(updateDoc(doc(asr, 'evaluations', 'e13'), { status: 'submitted', submittedAt: now(), updatedAt: 21 })));
await t('big: assessor corrects', assertSucceeds(updateDoc(doc(asr, 'evaluations', 'e13'), { assessment: { ...big, q1: 3 }, updatedAt: 22 })));
await t('big: resident sees', assertSucceeds(updateDoc(doc(a, 'evaluations', 'e13'), { seenAt: now(), updatedAt: 23 })));
await t('big: admin reopens', assertSucceeds(updateDoc(doc(adm, 'evaluations', 'e13'), { status: 'requested', submittedAt: deleteField(), updatedAt: 24 })));

// ---- forms ----
await t('signed-in reads forms', assertSucceeds(getDoc(doc(a, 'evalForms', 'mini-cex'))));
await t('resident cannot write forms', assertFails(setDoc(doc(a, 'evalForms', 'mini-cex'), { name: 'x' })));
await t('admin writes forms', assertSucceeds(setDoc(doc(adm, 'evalForms', 'mini-cex'), { name: 'Mini-CEX' })));

await env.cleanup();
console.log(`${n - fail}/${n} evals rules checks passed`);
process.exit(fail ? 1 : 0);
