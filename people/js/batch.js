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

// ---------- Import from the monthly roster ----------
// NUH Junior Monthly (nuhjuniormonthly.anawj.com) keeps the department's monthly junior roster, so its staff list has
// every resident's grade as of that month. People compares those grades with the residents here and lists what would
// change; the user ticks what to apply. The roster has no emails, so people are matched by name, and a new resident
// needs their email typed. It also takes the department sheet's grid tab pasted as it is (Grade and Name columns).

// What a roster grade says about an APMES resident: a residency year (RES1–RES3), a senior resident (R or SR: R4 or
// R5, the sheet doesn't say which), an associate consultant (AC: graduated), or nothing (MOs, locums, fellows,
// rotating residents from other departments, consultants).
export function gradeMeaning(grade) {
  const g = String(grade || '').trim().toUpperCase().replace(/\s+/g, '');
  const m = /^RES([1-3])$/.exec(g);
  if (m) return { year: Number(m[1]) };
  if (g === 'R' || g === 'SR') return { senior: true };
  if (g === 'AC') return { ac: true };
  return null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

// The pasted list: the first row with a Grade and a Name column is the header (tabs, or commas when a line has no
// tab); From and Until columns are read when there. "roster month YYYY-MM" anywhere gives the month the grades are for.
export function parseRosterList(text) {
  const lines = String(text || '').split(/\r?\n/);
  const mm = /roster month (\d{4}-(?:0[1-9]|1[0-2]))\b/i.exec(String(text || ''));
  const split = (line, tab) => (tab ? line.split('\t') : line.split(',')).map(c => c.trim());
  for (let i = 0; i < lines.length; i++) {
    const tab = lines[i].includes('\t');
    const cells = split(lines[i], tab).map(c => c.toLowerCase());
    const gc = cells.indexOf('grade'), nc = cells.indexOf('name');
    if (gc < 0 || nc < 0) continue;
    const fc = cells.findIndex(c => c === 'from' || c === 'starts'), uc = cells.findIndex(c => c === 'until' || c === 'leaves');
    const people = [];
    for (let j = i + 1; j < lines.length; j++) {
      const row = split(lines[j], tab);
      const name = (row[nc] || '').replace(/\s+/g, ' ').trim();
      if (!name) continue;
      const from = fc >= 0 && DATE.test(row[fc] || '') ? row[fc] : '';
      const until = uc >= 0 && DATE.test(row[uc] || '') ? row[uc] : '';
      people.push({ grade: (row[gc] || '').trim(), name, from, until });
    }
    return { month: mm ? mm[1] : null, people };
  }
  return { month: mm ? mm[1] : null, people: [], problem: 'No Grade and Name columns found' };
}

// Name words for matching: lower case, no accents, no "(Ortho)"-style notes or titles.
export function nameWords(name) {
  return String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ').split(/[^a-z]+/).filter(w => w && !/^(dr|mr|mrs|ms|miss|prof)$/.test(w));
}
// 3: the same words, in any order (or run together: "Wei Ling" / "Weiling"); 2: one name's words (two or more) all in
// the other ("Sam Tan" / "Sam Tan Wei"); 1: a word of three or more letters in common (only a hint); 0: nothing.
export function nameScore(a, b) {
  const A = nameWords(a), B = nameWords(b);
  if (!A.length || !B.length) return 0;
  if (A.join('') === B.join('') || [...A].sort().join(' ') === [...B].sort().join(' ')) return 3;
  const [small, big] = A.length <= B.length ? [A, new Set(B)] : [B, new Set(A)];
  if (small.length >= 2 && small.every(w => big.has(w))) return 2;
  return A.some(w => w.length >= 3 && B.includes(w)) ? 1 : 0;
}

// The patch that makes a resident year y on day d: an intake that gives y that academic year (moves up each July).
export const yearFix = (y, d) => ({ intake: academicYear(d) - y + 1, rYear: null });

// Compare the roster with the residents. Returns { date, items, same, ignored }:
//   date     the day years are compared on: the 1st of the roster month (or of `month`), else today
//   items    { key, kind, … } in order: 'change' (a matched resident with something to update: fix, changes[],
//            tick = confident; choose = [4, 5] when the roster only says senior), 'new' (a roster resident not here:
//            rec without rid and email, maybe = possible matches), 'missing' (an active resident not on the roster) and
//            'other' (on the roster in a grade that isn't a resident's: MOPEX, Fellow…), the last two for information
//   same     matched residents who already agree; ignored: roster rows that aren't residents
// links: { [roster index]: rid } says who a roster person is (or '' for "new"), overriding the name match.
export function rosterChanges(list, residents = [], { month = null, links = {}, today = todayISO() } = {}) {
  const m = MONTH.test(month || '') ? month : MONTH.test(list?.month || '') ? list.month : null;
  const date = m ? m + '-01' : today;
  const live = r => r.status === 'ACTIVE' || r.status === 'ON LEAVE';
  // roster people, once each (someone listed twice keeps the row with the higher grade); gone before the date: left out
  const rank = p => { const g = gradeMeaning(p.grade); return !g ? 0 : g.ac ? 6 : g.senior ? 4 : g.year; };
  const seen = new Map();
  const people = [];
  (list?.people || []).forEach((p, idx) => {
    if (p.until && p.until < date) return;
    const k = nameWords(p.name).sort().join(' ');
    if (!k) return;
    const q = { ...p, idx, meaning: gradeMeaning(p.grade) };
    const other = seen.get(k);
    if (other && rank(q) <= rank(other)) return;
    if (other) people[people.indexOf(other)] = q; else people.push(q);
    seen.set(k, q);
  });
  const roster = people.filter(p => p.meaning);
  const rest = people.filter(p => !p.meaning);
  // pair roster residents (and ACs) with residents: links first, then the same name, then one name inside the other,
  // each only when there is exactly one candidate both ways
  const pairOf = new Map();   // roster idx → resident
  const taken = new Set();    // rids paired
  const byRid = new Map(residents.map(r => [String(r.rid), r]));
  for (const p of roster) {
    if (!(p.idx in links)) continue;
    const r = byRid.get(String(links[p.idx]));
    if (r && !taken.has(String(r.rid))) { pairOf.set(p.idx, r); taken.add(String(r.rid)); }
    else pairOf.set(p.idx, null);   // "new", or a link to someone already paired
  }
  for (const level of [3, 2]) {
    const cand = new Map(), back = new Map();
    for (const p of roster) {
      if (pairOf.has(p.idx)) continue;
      for (const r of residents) {
        if (taken.has(String(r.rid)) || nameScore(p.name, r.name) !== level) continue;
        (cand.get(p.idx) || cand.set(p.idx, []).get(p.idx)).push(r);
        (back.get(String(r.rid)) || back.set(String(r.rid), []).get(String(r.rid))).push(p.idx);
      }
    }
    for (const [idx, rs] of cand) {
      if (rs.length === 1 && back.get(String(rs[0].rid)).length === 1) { pairOf.set(idx, rs[0]); taken.add(String(rs[0].rid)); }
    }
  }
  const items = [];
  let same = 0;
  for (const p of roster) {
    const r = pairOf.get(p.idx);
    const d = p.from && p.from > date ? p.from : date;
    if (!r) {
      if (p.meaning.ac) continue;   // an AC who isn't a resident here: nothing to do
      const free = residents.filter(x => !taken.has(String(x.rid)));
      const maybe = free.map(x => ({ r: x, s: nameScore(p.name, x.name) })).filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s || String(a.r.name).localeCompare(String(b.r.name))).map(x => x.r);
      const y = p.meaning.year || null;
      items.push({ key: 'new:' + p.idx, kind: 'new', p, date: d, maybe, choose: p.meaning.senior ? [4, 5] : null,
        rec: { name: p.name, email: '', status: 'ACTIVE', ...(y ? yearFix(y, d) : { intake: null, rYear: null }) }, tick: false });
      continue;
    }
    const fix = {}, changes = [];
    let tick = true, choose = null, suggest = null;
    const now = residentYear(r, d);
    if (p.meaning.ac) {
      if (r.status === 'ACTIVE' || r.status === 'ON LEAVE' || r.status === 'SMO') {
        fix.status = 'GRADUATED'; changes.push(`${statusWord(r.status)} → Graduated`);
      }
    } else {
      if (r.status === 'GRADUATED' || r.status === 'ATTRITED' || r.status === 'SMO') {
        fix.status = 'ACTIVE'; changes.push(`${statusWord(r.status)} → Active`); tick = false;
      }
      if (p.meaning.year && now !== p.meaning.year) {
        Object.assign(fix, yearFix(p.meaning.year, d)); changes.push(`${now ? 'R' + now : 'No year'} → R${p.meaning.year}`);
        if (Number(r.smo) > 0) tick = false;   // SMO years: the intake alone may not tell the year
      }
      if (p.meaning.senior && !(now >= 4)) {
        choose = [4, 5]; suggest = now === 3 ? 4 : null;
        changes.push(`${now ? 'R' + now : 'No year'} → senior resident`);
        if (!suggest) tick = false;
      }
    }
    if (!changes.length) { same++; continue; }
    items.push({ key: 'change:' + r.rid, kind: 'change', p, r, date: d, now, fix, changes, choose, suggest, tick, why: `On the roster as ${p.grade}` });
  }
  for (const r of residents) {
    if (taken.has(String(r.rid)) || !live(r)) continue;
    const o = rest.find(p => nameScore(p.name, r.name) === 3);
    items.push(o ? { key: 'other:' + r.rid, kind: 'other', r, p: o } : { key: 'missing:' + r.rid, kind: 'missing', r });
  }
  return { date, items, same, ignored: rest.length };
}

// What applying an item saves: a 'change' patches its resident, a 'new' item adds one (rid and email from the page).
// year: the year picked where the roster only says senior resident (R4 or R5).
export function itemPatch(item, year = null) {
  const y = item.choose ? Number(year || item.suggest) || null : null;
  if (item.kind === 'change') return { ...item.r, ...item.fix, ...(y ? yearFix(y, item.date) : {}) };
  if (item.kind === 'new') return { ...item.rec, ...(y ? yearFix(y, item.date) : {}) };
  return null;
}
const statusWord = s => ({ ACTIVE: 'Active', 'ON LEAVE': 'On leave', SMO: 'SMO', GRADUATED: 'Graduated', ATTRITED: 'Attrited' }[s] || s || '?');
