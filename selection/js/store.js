// Selection 360's shared store: the round, each respondent's response and the committee list.
// Live: Firestore in the logbook project (rules: logbook/firestore.rules, "Selection 360"):
//   selection/{cycle}                       { cycle, title, status: 'open'|'closed', applicants: [{ id, name }], updatedAt }
//   selection/{cycle}/responses/{email}     { email, name, answers: { [applicantId]: { score, comment, na } }, updatedAt }
//   selectionCommittee/{email}              { name }
// With ?demo: the same calls against this browser's localStorage (made-up people), so the screens are the same.

import { cloud } from '../../evals/js/ui-core.js';
import { cleanRound, cleanAnswers } from './model.js';

const lc = s => String(s || '').trim().toLowerCase();
const DEMO_KEY = 'sel-demo-store';
const demoRead = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || {}; } catch { return {}; } };
const demoWrite = d => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(d)); } catch {} };
const demoDb = () => { const d = demoRead(); d.rounds ||= {}; d.responses ||= {}; d.committee ||= {}; return d; };

const toRound = (id, d) => {
  const r = cleanRound({ cycle: id, title: d.title, applicants: d.applicants });
  return r ? { ...r, cycle: id, shared: true, status: d.status === 'closed' ? 'closed' : 'open', updatedAt: Number(d.updatedAt) || 0 } : null;
};
const byNewest = (a, b) => b.updatedAt - a.updatedAt;

// every round (staff and the committee pick one to look at)
export async function listRounds() {
  if (cloud.demo) return Object.entries(demoDb().rounds).map(([id, d]) => toRound(id, d)).filter(Boolean).sort(byNewest);
  const { db, F } = await cloud.firestore();
  return (await F.getDocs(F.collection(db, 'selection'))).docs.map(d => toRound(d.id, d.data())).filter(Boolean).sort(byNewest);
}
export const openRound = async () => (await listRounds()).find(r => r.status === 'open') || null;

export async function saveRound(round, status = 'open') {
  const cycle = String(round.cycle || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) || String(new Date().getFullYear());
  const doc = { cycle, title: round.title, status, applicants: round.applicants.map(a => ({ id: a.id, name: a.name })), updatedAt: Date.now() };
  if (cloud.demo) { const d = demoDb(); d.rounds[cycle] = doc; demoWrite(d); return toRound(cycle, doc); }
  const { db, F, queued } = await cloud.firestore();
  await queued(F.setDoc(F.doc(db, 'selection', cycle), doc));
  return toRound(cycle, doc);
}

// a respondent's own response (null if none yet)
export async function myResponse(cycle, email) {
  email = lc(email);
  if (cloud.demo) return demoDb().responses[cycle + '|' + email] || null;
  const { db, F } = await cloud.firestore();
  try { const s = await F.getDoc(F.doc(db, 'selection', cycle, 'responses', email)); return s.exists() ? s.data() : null; }
  catch (e) { if (e?.code === 'permission-denied') return null; throw e; }
}
export async function sendResponse(round, user, name, answers) {
  const email = lc(user.email);
  const clean = cleanAnswers(round, answers);
  if (cloud.demo) { const d = demoDb(); d.responses[round.cycle + '|' + email] = { email, name, answers: clean, updatedAt: Date.now() }; demoWrite(d); return; }
  const { db, F } = await cloud.firestore();
  // a plain await: "sent" must mean the server has it, not that it is queued on this phone
  await F.setDoc(F.doc(db, 'selection', round.cycle, 'responses', email), { email, name, answers: clean, updatedAt: F.serverTimestamp() });
}

// PDs and the committee: every response to a round
export async function listResponses(cycle) {
  if (cloud.demo) return Object.entries(demoDb().responses).filter(([k]) => k.startsWith(cycle + '|')).map(([, v]) => v);
  const { db, F } = await cloud.firestore();
  return (await F.getDocs(F.collection(db, 'selection', cycle, 'responses'))).docs.map(d => {
    const v = d.data(); const t = v.updatedAt;
    return { ...v, updatedAt: t?.toMillis ? t.toMillis() : Number(t) || 0 };
  });
}

// the committee list (admins and PDs keep it; a member can check their own entry)
export async function isCommittee(email) {
  email = lc(email);
  if (cloud.demo) return !!demoDb().committee[email];
  const { db, F } = await cloud.firestore();
  try { return (await F.getDoc(F.doc(db, 'selectionCommittee', email))).exists(); } catch { return false; }
}
export async function listCommittee() {
  if (cloud.demo) return Object.entries(demoDb().committee).map(([email, v]) => ({ email, name: v.name || '' }));
  const { db, F } = await cloud.firestore();
  return (await F.getDocs(F.collection(db, 'selectionCommittee'))).docs.map(d => ({ email: d.id, name: d.data().name || '' }))
    .sort((a, b) => a.email.localeCompare(b.email));
}
export async function saveCommittee({ email, name }) {
  email = lc(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That doesn’t look like an email address.');
  const doc = { name: String(name || '').trim().slice(0, 200) };
  if (cloud.demo) { const d = demoDb(); d.committee[email] = doc; demoWrite(d); return; }
  const { db, F, queued } = await cloud.firestore();
  await queued(F.setDoc(F.doc(db, 'selectionCommittee', email), doc));
}
export async function removeCommittee(email) {
  email = lc(email);
  if (cloud.demo) { const d = demoDb(); delete d.committee[email]; demoWrite(d); return; }
  const { db, F, queued } = await cloud.firestore();
  await queued(F.deleteDoc(F.doc(db, 'selectionCommittee', email)));
}
