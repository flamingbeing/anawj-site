// The CCC 360 store: rounds, a resident's own entry and nominees, and (for staff) everyone's.
// Live: Firestore in the logbook project (rules: logbook/firestore.rules, "CCC 360"):
//   ccc/{round}                      { round, title, status: 'open'|'closed', deadline?, closedAt?, updatedAt }
//   ccc/{round}/entries/{email}      { email, name, noProjects, projects, admin, teaching, conferences, updatedAt }
//   ccc/{round}/msf/{email}          { email, name, nominees, updatedAt }       (third parties' contact details)
//   ccc/{round}/review/{email}       { email, marks, updatedAt }                 (staff only)
// With ?demo: the same calls against this browser's localStorage (made-up people), so the screens are the same.

import { cloud } from '../../evals/js/ui-core.js';
import { entryDoc, msfDoc, cleanEntry, cleanNominees, demoRound, purgeDue } from './model.js';

const lc = s => String(s || '').trim().toLowerCase();
const KEY = 'ccc-demo-store';
const demoRead = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const demoWrite = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };
const demoDb = () => {
  const d = demoRead(); d.rounds ||= {}; d.entries ||= {}; d.msf ||= {}; d.review ||= {};
  if (!Object.keys(d.rounds).length) {
    // a made-up round with two residents who have sent and one who has not, so the coordinators' view has something to show
    const r = demoRound(); d.rounds[r.round] = r; const t = Date.now() - 86400000;
    const put = (email, name, entry, nominees) => { d.entries[r.round + '|' + email] = { ...entryDoc(email, name, entry), updatedAt: t }; d.msf[r.round + '|' + email] = { ...msfDoc(email, name, nominees), updatedAt: t }; };
    put('aiden.tan@example.com', 'Aiden Tan', { projects: [{ title: 'Audit of ward handover', supervisor: 'Dr Hana Lee', status: 'Ongoing', start: '2026-02' }], teaching: ['Intubation workshop for new MOs'] },
      [{ group: 'senior', name: 'Dr Hana Lee', email: 'dr.hana.lee@example.com' }, { group: 'peer', name: 'Bea Lim', email: 'bea.lim@example.com' }]);
    put('bea.lim@example.com', 'Bea Lim', { noProjects: true }, [{ group: 'senior', name: 'Dr Ivan Chua', email: 'dr.ivan.chua@example.com' }, { group: 'allied', name: 'Nurse Demo', email: 'nurse.demo@example.com' }]);
    demoWrite(d);
  }
  return d;
};
const ms = t => (t?.toMillis ? t.toMillis() : Number(t) || 0);
const toRound = (id, d) => ({ round: id, title: String(d.title || id), status: d.status === 'closed' ? 'closed' : 'open', deadline: d.deadline || '', closedAt: ms(d.closedAt), updatedAt: ms(d.updatedAt) });
const byNewest = (a, b) => b.updatedAt - a.updatedAt || String(b.round).localeCompare(String(a.round));

// every round, newest first (residents and staff read them)
export async function listRounds() {
  if (cloud.demo) return Object.entries(demoDb().rounds).map(([id, d]) => toRound(id, d)).sort(byNewest);
  const { db, F } = await cloud.firestore();
  return (await F.getDocs(F.collection(db, 'ccc'))).docs.map(d => toRound(d.id, d.data())).sort(byNewest);
}

// a resident's own entry and nominees for a round: { entry, nominees, sentAt } or null if nothing was sent
export async function mine(round, email) {
  email = lc(email);
  if (cloud.demo) {
    const d = demoDb(), e = d.entries[round + '|' + email], m = d.msf[round + '|' + email];
    return e || m ? { entry: cleanEntry(e), nominees: cleanNominees(m?.nominees), sentAt: Math.max(ms(e?.updatedAt), ms(m?.updatedAt)) } : null;
  }
  const { db, F } = await cloud.firestore();
  const get = async col => { try { const s = await F.getDoc(F.doc(db, 'ccc', round, col, email)); return s.exists() ? s.data() : null; } catch (e) { if (e?.code === 'permission-denied') return null; throw e; } };
  const [e, m] = await Promise.all([get('entries'), get('msf')]);
  return e || m ? { entry: cleanEntry(e), nominees: cleanNominees(m?.nominees), sentAt: Math.max(ms(e?.updatedAt), ms(m?.updatedAt)) } : null;
}

// the newest earlier round in which this resident sent an entry (for carrying projects over)
export async function previousEntry(rounds, current, email) {
  for (const r of rounds) {
    if (r.round === current) continue;
    const got = await mine(r.round, email);
    if (got && (got.entry.projects.length || got.entry.noProjects)) return { round: r, entry: got.entry };
  }
  return null;
}

// Send: the entry and the nominees go together in one write. A plain await, so “sent” means the server has it.
export async function send(round, user, name, entry, nominees) {
  const e = entryDoc(user.email, name, entry), m = msfDoc(user.email, name, nominees);
  if (cloud.demo) {
    const d = demoDb(); const key = round + '|' + e.email, t = Date.now();
    d.entries[key] = { ...e, updatedAt: t }; d.msf[key] = { ...m, updatedAt: t }; demoWrite(d); return t;
  }
  const { db, F } = await cloud.firestore();
  const b = F.writeBatch(db);
  b.set(F.doc(db, 'ccc', round, 'entries', e.email), { ...e, updatedAt: F.serverTimestamp() });
  b.set(F.doc(db, 'ccc', round, 'msf', m.email), { ...m, updatedAt: F.serverTimestamp() });
  await b.commit();
  return Date.now();
}

// ---- the coordinators' side (PDs, Admin staff and PCs; the rules allow nobody else to read these) ----

const stamp = (d, t) => ({ ...d, updatedAt: ms(t) });
const byEmail = list => Object.fromEntries(list.map(d => [d.email, d]));
const demoOf = (map, round) => byEmail(Object.entries(map).filter(([k]) => k.startsWith(round + '|')).map(([, v]) => ({ ...v, updatedAt: ms(v.updatedAt) })));
const liveOf = async (round, col) => {
  const { db, F } = await cloud.firestore();
  return byEmail((await F.getDocs(F.collection(db, 'ccc', round, col))).docs.map(d => stamp({ email: d.id, ...d.data() }, d.data().updatedAt)));
};

// open (or change, close, reopen) a round. A round id is chosen once and never changes.
export async function saveRound({ round, title, deadline = '', status = 'open', closedAt = 0 }) {
  const doc = { round, title, status, updatedAt: Date.now() };
  if (deadline) doc.deadline = deadline;
  if (status === 'closed' && closedAt) doc.closedAt = closedAt;
  if (cloud.demo) { const d = demoDb(); d.rounds[round] = doc; demoWrite(d); return toRound(round, doc); }
  const { db, F } = await cloud.firestore();
  await F.setDoc(F.doc(db, 'ccc', round), doc);
  return toRound(round, doc);
}
export const listEntries = round => cloud.demo ? Promise.resolve(demoOf(demoDb().entries, round)) : liveOf(round, 'entries');
export const listNominees = round => cloud.demo ? Promise.resolve(demoOf(demoDb().msf, round)) : liveOf(round, 'msf');
export const listReviews = round => cloud.demo ? Promise.resolve(demoOf(demoDb().review, round)) : liveOf(round, 'review');

// the coordinators' marks on one resident's nominees: { [nomineeId]: 'ok' | 'swap' | 'sent' }
export async function saveMarks(round, email, marks) {
  email = lc(email);
  const doc = { email, marks: marks || {}, updatedAt: Date.now() };
  if (cloud.demo) { const d = demoDb(); d.review[round + '|' + email] = doc; demoWrite(d); return; }
  const { db, F } = await cloud.firestore();
  await F.setDoc(F.doc(db, 'ccc', round, 'review', email), doc);
}

// Delete a resident's nominees (and the marks on them): the contact details of people who are not in the programme.
export async function deleteNominees(round, email) {
  email = lc(email);
  if (cloud.demo) { const d = demoDb(); delete d.msf[round + '|' + email]; delete d.review[round + '|' + email]; demoWrite(d); return; }
  const { db, F } = await cloud.firestore();
  const b = F.writeBatch(db);
  b.delete(F.doc(db, 'ccc', round, 'msf', email));
  b.delete(F.doc(db, 'ccc', round, 'review', email));
  await b.commit();
}

// Delete the nominees of every round that closed more than a year ago. Runs when staff open the app. Returns how many
// nominee lists were deleted (0 mostly). Projects are kept.
export async function purgeExpired(rounds, now = Date.now()) {
  let n = 0;
  for (const r of rounds) {
    if (!purgeDue(r, now)) continue;
    const left = Object.keys(await listNominees(r.round));
    for (const email of left) { await deleteNominees(r.round, email); n++; }
  }
  return n;
}
