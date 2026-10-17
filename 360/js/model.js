// APMES CCC 360: what a resident gives the programme coordinators (PCs) before a CCC meeting, and the checks on it.
// Pure logic, no page code (unit tests in test/model.test.mjs). Two halves: the scholar projects (and the other lists on
// the department's form) and the people to ask for multisource feedback (MSF). Storage shapes match the rules in
// logbook/firestore.rules ("CCC 360"): entries/{email} holds the projects, msf/{email} holds the nominees.

export const GROUPS = [
  { id: 'senior', label: 'Senior doctors', one: 'Senior doctor', max: 6, emailRequired: false,
    hint: 'Doctors you worked with in the past 5 months who are Associate Consultant or above.' },
  { id: 'peer', label: 'Peers', one: 'Peer', max: 2, emailRequired: false,
    hint: 'Registrars, residents or MOPEX you worked with in the past 5 months. Start typing to pick a resident.' },
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

// ---- the coordinators' side ----

export const PURGE_DAYS = 365;   // nominees' contact details are deleted this long after a round closes (owner, 17 Oct 2026: a year, since CCC meetings may be delayed)
export const PURGE_TEXT = 'a year';
export const MARKS = [['ok', 'Checked'], ['swap', 'Ask for a different person'], ['sent', 'Emailed']];
export const markLabel = m => (MARKS.find(([k]) => k === m) || [, 'To check'])[1];

// A round's id from the month it opens (r2026-10), made unique among `taken`; at most 20 characters (the rules).
export function roundId(taken = [], now = new Date()) {
  const base = 'r' + now.toISOString().slice(0, 7);
  const t = new Set(taken);
  if (!t.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!t.has(base + '-' + i)) return base + '-' + i;
  return base + '-' + Math.random().toString(36).slice(2, 6);
}
export function cleanRoundInput({ title, deadline } = {}) {
  const t = str(title, 200);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(deadline || '')) ? String(deadline) : '';
  return t ? { title: t, deadline: d } : null;
}
// when a closed round's nominees are due to be deleted (ms), or 0 if the round is open or has no close time
export function purgeAt(round) {
  if (!round || round.status !== 'closed') return 0;
  const at = Number(round.closedAt) || Number(round.updatedAt) || 0;
  return at ? at + PURGE_DAYS * 86400000 : 0;
}
export const purgeDue = (round, now = Date.now()) => { const at = purgeAt(round); return !!at && at <= now; };

// One row per active resident (and anyone who sent but is not on the list): who has sent, and how the nominees stand.
// residents: [{ rid, name, email, status, rYear? }]; entries/msfs/reviews: { [email]: doc }.
export function roster(residents, entries = {}, msfs = {}, reviews = {}) {
  const rows = []; const seen = new Set();
  const row = (email, name, extra = {}) => {
    const e = entries[email] ? cleanEntry(entries[email]) : null;
    const ns = cleanNominees(msfs[email]?.nominees);
    const marks = reviews[email]?.marks || {};
    const count = { ok: 0, swap: 0, sent: 0, todo: 0 };
    for (const n of ns) count[marks[n.id] in count ? marks[n.id] : 'todo']++;
    rows.push({ email, name, sent: !!(entries[email] || msfs[email]), projects: e ? e.projects.length : 0, noProjects: !!e?.noProjects, nominees: ns.length, marks: count, ...extra });
    seen.add(email);
  };
  for (const r of residents || []) {
    const email = lc(r.email);
    if (!email || seen.has(email) || r.status !== 'ACTIVE') continue;
    row(email, r.name || email, { rid: r.rid, rYear: r.rYear });
  }
  for (const email of new Set([...Object.keys(entries), ...Object.keys(msfs)])) if (!seen.has(email)) row(email, entries[email]?.name || msfs[email]?.name || email, { extra: true });
  return rows.sort((a, b) => (a.sent - b.sent) || String(a.name).localeCompare(String(b.name)));
}
export const rosterCounts = rows => ({ total: rows.length, sent: rows.filter(r => r.sent).length, nominees: rows.reduce((n, r) => n + r.nominees, 0), toCheck: rows.reduce((n, r) => n + r.marks.todo, 0) });

// ---- CSV and email links ----

// A spreadsheet runs a cell that starts with = + - @ as a formula, so those get a leading apostrophe.
export function csvCell(v) {
  let s = String(v ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const csv = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
// items: [{ resident: { name, email }, nominees: [...], marks: {} }]
export function nomineesCSV(round, items) {
  const rows = [['Round', 'Resident', 'Resident email', 'Group', 'Nominee', 'Nominee email', 'Status']];
  for (const it of items) for (const n of it.nominees) rows.push([round.title, it.resident.name, it.resident.email, GROUP[n.group]?.one || n.group, n.name, n.email, markLabel(it.marks?.[n.id])]);
  return csv(rows);
}
export function projectsCSV(round, items) {
  const rows = [['Round', 'Resident', 'Resident email', 'Kind', 'Title or line', 'Supervisor', 'Status', 'Start', 'End', 'Notes']];
  for (const it of items) {
    const e = cleanEntry(it.entry);
    if (e.noProjects) rows.push([round.title, it.resident.name, it.resident.email, 'Scholarly project', 'None to report', '', '', '', '', '']);
    for (const p of e.projects) rows.push([round.title, it.resident.name, it.resident.email, 'Scholarly project', p.title, p.supervisor, p.status, p.start, p.end, p.note]);
    for (const l of LISTS) for (const line of e[l.key]) rows.push([round.title, it.resident.name, it.resident.email, l.label, line, '', '', '', '', '']);
  }
  return csv(rows);
}
// a mailto: link to one nominee (the coordinator edits the text in their mail app)
export function mailto(nominee, residentName, round) {
  const subject = `Multisource feedback for ${residentName}`;
  const body = `Dear ${nominee.name},\n\n${residentName} has nominated you to give multisource feedback ahead of the Clinical Competency Committee meeting (${round?.title || 'CCC'}). The programme coordinators will send you the feedback form shortly. Thank you for your time.\n\nProgramme coordinators`;
  return `mailto:${encodeURIComponent(nominee.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
export const emailList = list => [...new Set((list || []).map(x => lc(x)).filter(x => EMAIL_RE.test(x)))].join(', ');
