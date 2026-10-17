// The CCC 360 store: rounds, a resident's own entry and nominees, and (for staff) everyone's.
// Live: Firestore in the logbook project (rules: logbook/firestore.rules, "CCC 360"):
//   ccc/{round}                      { round, title, status: 'open'|'closed', deadline?, closedAt?, updatedAt }
//   ccc/{round}/entries/{email}      { email, name, noProjects, projects, admin, teaching, conferences, updatedAt }
//   ccc/{round}/msf/{email}          { email, name, nominees, updatedAt }       (third parties' contact details)
//   ccc/{round}/review/{email}       { email, marks, updatedAt }                 (staff only)
//   access/{email}                   { roles }                                   (who is staff; read for your own record)
// With ?demo: the same calls against this browser's localStorage (made-up people), so the screens are the same.

import { cloud } from '../../evals/js/ui-core.js';
import { entryDoc, msfDoc, cleanEntry, cleanNominees, demoRound } from './model.js';

const lc = s => String(s || '').trim().toLowerCase();
const KEY = 'ccc-demo-store';
const demoRead = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const demoWrite = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };
const demoDb = () => {
  const d = demoRead(); d.rounds ||= {}; d.entries ||= {}; d.msf ||= {};
  if (!Object.keys(d.rounds).length) { const r = demoRound(); d.rounds[r.round] = r; demoWrite(d); }
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

// the roles in access/{email} (your own record may always be read); [] when none
export async function myRoles(email) {
  email = lc(email);
  if (cloud.demo) return cloud.demoRole() === 'admin' ? ['admin'] : [];
  const { db, F } = await cloud.firestore();
  try { const s = await F.getDoc(F.doc(db, 'access', email)); return s.exists() && Array.isArray(s.data().roles) ? s.data().roles : []; }
  catch (e) { if (e?.code === 'permission-denied') return []; throw e; }
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
