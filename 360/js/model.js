// APMES CCC 360: what a resident gives the programme coordinators (PCs) before a CCC meeting, and the checks on it.
// Pure logic, no page code (unit tests in test/model.test.mjs). Two halves: the scholar projects (and the other lists on
// the department's form) and the people to ask for multisource feedback (MSF). Storage shapes match the rules in
// logbook/firestore.rules ("CCC 360"): entries/{email} holds the projects, msf/{email} holds the nominees.

export const GROUPS = [
  { id: 'senior', label: 'Senior doctors', one: 'Senior doctor', max: 6, emailRequired: false,
    hint: 'Doctors you worked with in the past 5 months who are Associate Consultant or above.' },
  { id: 'peer', label: 'Peers', one: 'Peer', max: 2, emailRequired: false,
    hint: 'Registrars, residents or MOPEX you worked with in the past 5 months.' },
  { id: 'allied', label: 'Allied health', one: 'Allied health', max: 4, emailRequired: true,
    hint: 'Nurses, therapists, pharmacists and others you worked with in the past 5 months. Their email is needed.' },
  { id: 'other', label: 'Others', one: 'Other', max: 2, emailRequired: false,
    hint: 'Anyone else who should give feedback.' },
];
export const GROUP = Object.fromEntries(GROUPS.map(g => [g.id, g]));
export const TOTAL_MAX = 20;           // the rules cap the list
export const LIST_MAX = 30;            // and each of the lists
export const STATUSES = ['Planned', 'Ongoing', 'Completed', 'On hold'];
export const LISTS = [
  { key: 'admin', label: 'Committee / admin work', hint: 'One per line: for example a committee you sit on, with your role.' },
  { key: 'teaching', label: 'Teaching / presentations', hint: 'One per line.' },
  { key: 'conferences', label: 'Conference presentations', hint: 'One per line: the meeting, the title and the date.' },
];
export const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const lc = v => String(v ?? '').trim().toLowerCase();
const month = v => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v ?? '')) ? String(v) : '');
let counter = 0;
export const newId = () => 'x' + Date.now().toString(36).slice(-4) + (counter++).toString(36) + Math.random().toString(36).slice(2, 5);

// ---- projects and lists ----

export function cleanProject(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {
    id: str(p.id, 20) || newId(), title: str(p.title, 200), supervisor: str(p.supervisor, 120),
    status: STATUSES.includes(p.status) ? p.status : 'Ongoing', start: month(p.start), end: month(p.end),
    note: String(p.note ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, 1000),
  };
  return out.title || out.supervisor || out.note ? out : null;
}
export function cleanLines(v) {
  const list = Array.isArray(v) ? v : String(v ?? '').split(/\r?\n/);
  return list.map(x => str(x, 300)).filter(Boolean).slice(0, LIST_MAX);
}
export function cleanEntry(e) {
  e = e && typeof e === 'object' ? e : {};
  const projects = (Array.isArray(e.projects) ? e.projects : []).map(cleanProject).filter(Boolean).slice(0, LIST_MAX);
  return { noProjects: !!e.noProjects && projects.length === 0, projects, admin: cleanLines(e.admin), teaching: cleanLines(e.teaching), conferences: cleanLines(e.conferences) };
}
export const blankEntry = () => cleanEntry({});

// A new round starts from last round's scholar projects (the resident only updates them). The other lists, and the
// nominees, start empty each round.
export function carryOver(prev) {
  const p = cleanEntry(prev);
  return { ...blankEntry(), noProjects: p.noProjects, projects: p.projects.map(x => ({ ...x, id: newId() })) };
}

// ---- nominees ----

export function cleanNominee(n) {
  if (!n || typeof n !== 'object') return null;
  const email = lc(n.email).slice(0, 200);
  const out = { id: str(n.id, 20) || newId(), group: GROUP[n.group] ? n.group : 'other', name: str(n.name, 120), email };
  if (n.fac) out.fac = lc(n.fac).slice(0, 200);
  return out.name || out.email ? out : null;
}
// keeps each group within its limit and the whole list within the cap
export function cleanNominees(list) {
  const seen = {}; const out = [];
  for (const n of (Array.isArray(list) ? list : []).map(cleanNominee)) {
    if (!n) continue;
    seen[n.group] = (seen[n.group] || 0) + 1;
    if (seen[n.group] > GROUP[n.group].max || out.length >= TOTAL_MAX) continue;
    out.push(n);
  }
  return out;
}
export const nomineeCounts = list => Object.fromEntries(GROUPS.map(g => [g.id, (list || []).filter(n => n.group === g.id).length]));
export const canAdd = (list, group) => nomineeCounts(list)[group] < GROUP[group].max && (list || []).length < TOTAL_MAX;

// ---- checks ----

// Things that stop Send (the PCs could not use the entry)
export function problems(entry, nominees) {
  const out = [];
  const e = entry || blankEntry();
  (e.projects || []).forEach((p, i) => { if (!p.title) out.push({ where: 'projects', id: p.id, text: `Project ${i + 1} has no title.` }); });
  for (const n of nominees || []) {
    const g = GROUP[n.group] || GROUP.other;
    const who = n.name || n.email || 'A nominee';
    if (!n.name) out.push({ where: 'nominees', id: n.id, text: `${g.one} nominee ${n.email}: add a name.` });
    else if (n.email && !EMAIL_RE.test(n.email)) out.push({ where: 'nominees', id: n.id, text: `${who}: that email doesn’t look right.` });
    else if (g.emailRequired && !n.email) out.push({ where: 'nominees', id: n.id, text: `${who}: ${g.one.toLowerCase()} nominees need an email.` });
  }
  return out;
}
// Worth a second look, but Send still works
export function warnings(entry, nominees) {
  const out = [];
  const e = entry || blankEntry();
  if (!e.projects.length && !e.noProjects) out.push({ where: 'projects', text: 'No scholarly projects yet. Add one, or tick “I have no scholarly projects”.' });
  for (const p of e.projects) if (p.start && p.end && p.end < p.start) out.push({ where: 'projects', id: p.id, text: `${p.title || 'A project'}: the end is before the start.` });
  const c = nomineeCounts(nominees);
  if (!(nominees || []).length) out.push({ where: 'nominees', text: 'No nominees yet. The coordinators will have nobody to ask for feedback.' });
  else if (!c.senior) out.push({ where: 'nominees', text: 'No senior doctor yet.' });
  const seen = new Map();
  for (const n of nominees || []) if (n.email) { if (seen.has(n.email)) out.push({ where: 'nominees', id: n.id, text: `${n.name || n.email} is listed twice.` }); seen.set(n.email, 1); }
  return out;
}
export function progress(entry, nominees) {
  const e = entry || blankEntry();
  const projects = e.projects.length ? 'filled' : e.noProjects ? 'none' : (e.admin.length || e.teaching.length || e.conferences.length) ? 'partial' : 'empty';
  return { projects, nominees: (nominees || []).length ? 'filled' : 'empty' };
}
// compare to what was sent, to show “changes not sent”
export const snapshot = (entry, nominees) => JSON.stringify([cleanEntry(entry), cleanNominees(nominees)]);

// ---- documents (the shapes the rules check; the store adds the server time) ----

export const entryDoc = (email, name, entry) => ({ email: lc(email), name: str(name, 120) || lc(email), ...cleanEntry(entry) });
export const msfDoc = (email, name, nominees) => ({ email: lc(email), name: str(name, 120) || lc(email), nominees: cleanNominees(nominees) });

// ---- the faculty picker ----

const TITLES = /\b(dr|drs|prof|a\/prof|assoc|asst|ms|mr|mrs|mdm|miss)\b\.?/gi;
const words = s => String(s || '').replace(TITLES, ' ').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
export const contactEmail = f => lc(f.workEmail) || lc(f.email);
// active faculty whose name starts with every word typed (any order); core faculty first, then A to Z
export function suggestFaculty(faculty, query, limit = 6) {
  const q = words(query);
  if (!q.length) return [];
  return (faculty || []).filter(f => f && f.status !== 'INACTIVE' && f.name).filter(f => {
    const w = words(f.name);
    return q.every(t => w.some(x => x.startsWith(t)));
  }).sort((a, b) => (!!b.core - !!a.core) || String(a.name).localeCompare(String(b.name))).slice(0, limit);
}

// ---- dates ----

export const monthText = v => {
  if (!month(v)) return '';
  const [y, m] = v.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};
export const dayText = iso => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? new Date(iso + 'T00:00:00Z') : null;
  return d && !isNaN(d) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
};
export const pastDeadline = (round, today = new Date().toISOString().slice(0, 10)) => !!round?.deadline && round.deadline < today;

// made-up round for ?demo
export function demoRound(today = new Date()) {
  const d = new Date(today.getTime() + 21 * 86400000);
  return { round: 'demo', title: 'CCC round (demo)', status: 'open', deadline: d.toISOString().slice(0, 10), updatedAt: today.getTime() };
}
