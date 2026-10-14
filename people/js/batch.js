// The People app's own logic, kept free of page code so people/test/batch.test.mjs can run it in Node:
// a new intake pasted as a list, the year-change check, and the CSV export.
// The lists themselves are the logbook project's (apmes-logbook): residents/{rid}, faculty/{email}, pds/{email}.
// Logbook and evals both read them, so a resident added here is on both apps.

import { nextRid, cleanEmail, validEmail } from '../../evals/js/ui-admin.js';
import { residentYear, todayISO } from '../../evals/js/engine.js';

// The academic year starts on 1 July (as residentYear in evals/js/engine.js).
export function academicYear(today = todayISO()) {
  const [y, m] = String(today).split('-').map(Number);
  return m >= 7 ? y : y - 1;
}

// The year the intake would give on its own, without a set rYear (can run past 5, unlike residentYear).
export function yearFromIntake(r, today = todayISO()) {
  const intake = Number(r?.intake);
  return intake ? academicYear(today) - intake + 1 : null;
}

const EMAIL_IN = /[^\s<>,;"'()]+@[^\s<>,;"'()]+/;
const looksLikeId = s => /^[A-Za-z]{0,6}\d{1,8}$/.test(String(s || '').trim());

// A new intake: one person per line, "Name, email" (or "Name <email>", or two spreadsheet columns), optionally
// with the resident ID first ("R031, Name, email"). Everyone gets the same intake year; IDs are given in order
// after the highest existing one when a line has none. Returns [{ line, rec?, problem?, dup? }] like the evals parsers.
export function parseIntake(text, existing = [], { intake, rYear = null } = {}) {
  const taken = [...existing];
  const emails = new Set(existing.map(r => r.email));
  const rids = new Set(existing.map(r => String(r.rid)));
  const seenE = new Set();
  return String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(line => {
    const m = line.match(EMAIL_IN);
    if (!m) return /^\W*(name|rid|id|resident|e-?mail)\b/i.test(line) ? null : { line, problem: 'No email' };
    const email = cleanEmail(m[0]);
    if (!validEmail(email)) return { line, problem: 'Email not valid' };
    let before = line.slice(0, m.index).replace(/[<"]+\s*$/, '');
    let rid = null;
    const first = before.split(/\t|,/)[0].trim();
    if (looksLikeId(first) && before.split(/\t|,/).length > 2) { rid = first; before = before.slice(before.indexOf(first) + first.length); }
    const name = before.replace(/[<>"\t,;]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) return { line, problem: 'No name' };
    if (seenE.has(email)) return { line, rec: { name, email }, dup: 'Repeated in this list' };
    seenE.add(email);
    if (emails.has(email)) return { line, rec: { name, email }, dup: 'Already on the resident list' };
    if (rid && rids.has(rid)) return { line, rec: { name, email, rid }, dup: `ID ${rid} already used` };
    rid = rid || nextRid(taken);
    rids.add(rid);
    const rec = { rid, name, email, status: 'ACTIVE', intake: intake ? Number(intake) : null, rYear: rYear ? Number(rYear) : null };
    taken.push(rec);
    return { line, rec };
  }).filter(Boolean);
}

// The year-change check: residents whose year won't look after itself. Each issue has a kind, a plain-words
// reason and the one change that fixes it (fix: a patch for the resident doc, or null when only a person can say).
//   fixed   year set by hand while the intake says otherwise: the set year never moves up in July
//   nointake year set by hand with no intake: it stays there every year
//   noyear  neither: the apps can't tell their year
//   past    the intake puts them past R5 and they're still Active: graduated?
export function yearIssues(residents, today = todayISO()) {
  const out = [];
  for (const r of residents) {
    if (r.status !== 'ACTIVE' && r.status !== 'ON LEAVE') continue;
    const set = Number(r.rYear) >= 1 && Number(r.rYear) <= 5 ? Number(r.rYear) : null;
    const byIntake = yearFromIntake(r, today);
    if (r.status === 'ACTIVE' && byIntake > 5 && !(Number(r.smo) > 0)) {
      out.push({ r, kind: 'past', why: `Intake ${r.intake} makes them R${byIntake}: graduated?`, fix: { status: 'GRADUATED' }, fixLabel: 'Mark graduated' });
    } else if (set && byIntake && byIntake >= 1 && byIntake <= 5 && set !== byIntake) {
      out.push({ r, kind: 'fixed', why: `Set to R${set}; intake ${r.intake} says R${byIntake}`, fix: { rYear: null }, fixLabel: `Use intake (R${byIntake})` });
    } else if (set && !byIntake) {
      out.push({ r, kind: 'nointake', why: `Set to R${set} with no intake year: it won't move up in July`,
        fix: { intake: academicYear(today) - set + 1, rYear: null }, fixLabel: `Set intake ${academicYear(today) - set + 1}` });
    } else if (!set && !byIntake) {
      out.push({ r, kind: 'noyear', why: 'No intake or year: the apps can’t tell their year', fix: null });
    }
  }
  return out;
}

// Counts by current year for the summary line (Active and On leave only).
export function yearCounts(residents, today = todayISO()) {
  const c = {};
  for (const r of residents) {
    if (r.status !== 'ACTIVE' && r.status !== 'ON LEAVE') continue;
    const y = residentYear(r, today);
    const k = y ? 'R' + y : '?';
    c[k] = (c[k] || 0) + 1;
  }
  return c;
}

function cell(v) {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;   // no spreadsheet formulas
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
// One CSV of everyone: residents, faculty and PDs, with a "list" column (opens in Excel; BOM for the names).
export const CSV_COLUMNS = ['list', 'id', 'name', 'email', 'status', 'intake', 'setYear', 'yearNow'];
export function peopleCSV({ residents = [], faculty = [], pds = [] } = {}, today = todayISO()) {
  const rows = [
    ...[...residents].sort((a, b) => String(a.rid).localeCompare(String(b.rid)))
      .map(r => ['resident', r.rid, r.name, r.email, r.status, r.intake, r.rYear, residentYear(r, today)]),
    ...faculty.map(f => ['faculty', '', f.name, f.email, f.status, '', '', '']),
    ...pds.map(p => ['pd', '', p.name, p.email, '', '', '', '']),
  ];
  return '\ufeff' + [CSV_COLUMNS.join(','), ...rows.map(r => r.map(cell).join(','))].join('\r\n') + '\r\n';
}
