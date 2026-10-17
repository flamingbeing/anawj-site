// Unit tests for the CCC 360 logic. Run: node 360/test/model.test.mjs
import assert from 'node:assert/strict';
import {
  GROUPS, TOTAL_MAX, cleanProject, cleanLines, cleanEntry, blankEntry, carryOver, cleanNominee, cleanNominees, nomineeCounts, canAdd,
  problems, warnings, progress, snapshot, entryDoc, msfDoc, suggestFaculty, contactEmail, monthText, dayText, pastDeadline, demoRound,
  PURGE_DAYS, markLabel, roundId, cleanRoundInput, purgeAt, purgeDue, roster, rosterCounts, csvCell, nomineesCSV, projectsCSV, mailto, emailList,
} from '../js/model.js';

// projects
assert.equal(cleanProject({}), null);
assert.equal(cleanProject({ title: '  ' }), null);
let p = cleanProject({ title: '  Audit   of PONV ', supervisor: 'Dr X', status: 'bogus', start: '2026-03', end: '2026-13', note: 'a\tb' });
assert.deepEqual([p.title, p.status, p.start, p.end, p.note], ['Audit of PONV', 'Ongoing', '2026-03', '', 'a b']);
assert.ok(p.id, 'gets an id');
assert.equal(cleanProject({ title: 'x', status: 'Completed' }).status, 'Completed');
assert.equal(cleanProject({ title: 'x'.repeat(500) }).title.length, 200);

// lists
assert.deepEqual(cleanLines(' a \n\n b '), ['a', 'b']);
assert.deepEqual(cleanLines(['x', '', ' y ']), ['x', 'y']);
assert.equal(cleanLines(Array.from({ length: 50 }, (_, i) => 'l' + i)).length, 30);
assert.deepEqual(cleanLines(null), []);

// entry
let e = cleanEntry({ noProjects: true, projects: [{ title: 'A' }], admin: 'one\ntwo' });
assert.equal(e.noProjects, false, 'projects and “none” cannot both be true');
assert.deepEqual(e.admin, ['one', 'two']);
assert.equal(cleanEntry({ noProjects: true }).noProjects, true);
assert.deepEqual(cleanEntry(null), blankEntry());

// carry over: projects only, with fresh ids
const prev = cleanEntry({ projects: [{ id: 'keep', title: 'A', status: 'Completed' }], admin: ['x'], teaching: ['y'] });
const co = carryOver(prev);
assert.equal(co.projects.length, 1);
assert.notEqual(co.projects[0].id, 'keep');
assert.deepEqual([co.projects[0].title, co.projects[0].status], ['A', 'Completed']);
assert.deepEqual([co.admin, co.teaching, co.conferences], [[], [], []]);
assert.deepEqual(carryOver(null), blankEntry());

// nominees
assert.equal(cleanNominee({}), null);
let n = cleanNominee({ group: 'weird', name: ' Sam  Example ', email: ' SAM@Example.COM ', fac: 'Fac@X.com' });
assert.deepEqual([n.group, n.name, n.email, n.fac], ['other', 'Sam Example', 'sam@example.com', 'fac@x.com']);
const many = Array.from({ length: 9 }, (_, i) => ({ group: 'senior', name: 'S' + i }));
assert.equal(cleanNominees(many).length, 6, 'six seniors at most');
const all = GROUPS.flatMap(g => Array.from({ length: g.max + 3 }, (_, i) => ({ group: g.id, name: g.id + i })));
const capped = cleanNominees(all);
assert.deepEqual(nomineeCounts(capped), { senior: 6, peer: 2, allied: 4, other: 2 });
assert.ok(capped.length <= TOTAL_MAX);
assert.ok(!canAdd(capped, 'peer') && !canAdd(capped, 'senior'));
assert.ok(canAdd([], 'allied'));

// checks
assert.deepEqual(problems(blankEntry(), []), []);
assert.equal(problems({ ...blankEntry(), projects: [{ id: 'p', title: '' }] }, []).length, 1);
let ns = [
  { id: '1', group: 'allied', name: 'Nurse N', email: '' },
  { id: '2', group: 'senior', name: 'Dr A', email: 'bad' },
  { id: '3', group: 'peer', name: '', email: 'x@y.co' },
  { id: '4', group: 'senior', name: 'Dr B', email: '' },
];
const pr = problems(blankEntry(), ns);
assert.equal(pr.length, 3);
assert.ok(pr.some(x => x.id === '1' && /need an email/.test(x.text)));
assert.ok(pr.some(x => x.id === '2' && /doesn’t look right/.test(x.text)));
assert.ok(pr.some(x => x.id === '3' && /add a name/.test(x.text)));
let w = warnings(blankEntry(), []);
assert.equal(w.length, 2, 'no projects and no nominees');
assert.equal(warnings({ ...blankEntry(), noProjects: true }, [{ group: 'senior', name: 'A', email: 'a@b.co', id: 'q' }]).length, 0);
assert.ok(warnings({ ...blankEntry(), noProjects: true }, [{ group: 'peer', name: 'A', email: 'a@b.co', id: 'q' }]).some(x => /senior/.test(x.text)));
assert.ok(warnings({ ...blankEntry(), noProjects: true }, [{ group: 'senior', name: 'A', email: 'a@b.co', id: 'q' }, { group: 'senior', name: 'B', email: 'a@b.co', id: 'r' }]).some(x => /twice/.test(x.text)));
assert.ok(warnings(cleanEntry({ projects: [{ title: 'T', start: '2026-05', end: '2026-01' }] }), [{ group: 'senior', name: 'A', id: 'q' }]).some(x => /before the start/.test(x.text)));
assert.deepEqual(progress(blankEntry(), []), { projects: 'empty', nominees: 'empty' });
assert.equal(progress(cleanEntry({ noProjects: true }), []).projects, 'none');
assert.equal(progress(cleanEntry({ admin: ['x'] }), [{}]).projects, 'partial');
assert.equal(progress(cleanEntry({ projects: [{ title: 'A' }] }), [{}]).projects, 'filled');

// snapshots change when content changes
const s1 = snapshot(cleanEntry({ projects: [{ id: 'a', title: 'A' }] }), []);
assert.equal(s1, snapshot(cleanEntry({ projects: [{ id: 'a', title: ' A ' }] }), []));
assert.notEqual(s1, snapshot(cleanEntry({ projects: [{ id: 'a', title: 'B' }] }), []));

// documents match the rules' shapes
const d = entryDoc('Me@X.com', '', cleanEntry({ projects: [{ title: 'A' }] }));
assert.deepEqual(Object.keys(d).sort(), ['admin', 'conferences', 'email', 'name', 'noProjects', 'projects', 'teaching']);
assert.equal(d.email, 'me@x.com'); assert.equal(d.name, 'me@x.com');
const md = msfDoc('me@x.com', 'Me', many.map(x => ({ ...x, id: undefined })));
assert.deepEqual(Object.keys(md).sort(), ['email', 'name', 'nominees']);
assert.equal(md.nominees.length, 6);

// the faculty picker
const fac = [
  { email: 'a@x.com', name: 'Dr Ann Lee', status: 'ACTIVE' },
  { email: 'b@x.com', name: 'Dr Ben Lim', status: 'ACTIVE', core: true, workEmail: 'ben_lim@nuhs.example' },
  { email: 'c@x.com', name: 'Dr Cara Leong', status: 'INACTIVE' },
  { email: 'd@x.com', name: 'Dr Dev Lee', status: 'ACTIVE', core: true },
];
assert.deepEqual(suggestFaculty(fac, ''), []);
assert.deepEqual(suggestFaculty(fac, 'le').map(f => f.email), ['d@x.com', 'a@x.com'], 'core first, inactive left out');
assert.deepEqual(suggestFaculty(fac, 'lee ann').map(f => f.email), ['a@x.com'], 'any order');
assert.deepEqual(suggestFaculty(fac, 'dr li').map(f => f.email), ['b@x.com'], 'titles ignored');
assert.equal(contactEmail(fac[1]), 'ben_lim@nuhs.example');
assert.equal(contactEmail(fac[0]), 'a@x.com');
assert.equal(suggestFaculty(fac, 'l', 1).length, 1);

// dates
assert.equal(monthText('2026-03'), 'Mar 2026');
assert.equal(monthText('x'), '');
assert.equal(dayText('2026-12-01'), '1 Dec 2026');
assert.equal(dayText(''), '');
assert.ok(pastDeadline({ deadline: '2026-01-01' }, '2026-02-01'));
assert.ok(!pastDeadline({ deadline: '2026-03-01' }, '2026-02-01'));
assert.ok(!pastDeadline({}, '2026-02-01'));
const dr = demoRound(new Date('2026-10-17T00:00:00Z'));
assert.deepEqual([dr.round, dr.status, dr.deadline], ['demo', 'open', '2026-11-07']);

// ---- the coordinators' side ----
assert.equal(PURGE_DAYS, 365);
assert.equal(markLabel('ok'), 'Checked'); assert.equal(markLabel(undefined), 'To check'); assert.equal(markLabel('x'), 'To check');
assert.equal(roundId([], new Date('2026-10-17T00:00:00Z')), 'r2026-10');
assert.equal(roundId(['r2026-10'], new Date('2026-10-17T00:00:00Z')), 'r2026-10-2');
assert.equal(roundId(['r2026-10', 'r2026-10-2'], new Date('2026-10-17T00:00:00Z')), 'r2026-10-3');
assert.ok(roundId([], new Date()).length <= 20);
assert.equal(cleanRoundInput({ title: '  ' }), null);
assert.deepEqual(cleanRoundInput({ title: ' CCC  Dec ', deadline: '2026-12-01' }), { title: 'CCC Dec', deadline: '2026-12-01' });
assert.equal(cleanRoundInput({ title: 'x', deadline: 'soon' }).deadline, '');
// retention: nominees go a year after a round closes
const day = 86400000, t0 = Date.UTC(2026, 0, 1);
assert.equal(purgeAt({ status: 'open', closedAt: t0 }), 0);
assert.equal(purgeAt({ status: 'closed' }), 0, 'no close time: never purged by guesswork');
assert.equal(purgeAt({ status: 'closed', closedAt: t0 }), t0 + 365 * day);
assert.equal(purgeAt({ status: 'closed', closedAt: 0, updatedAt: t0 }), t0 + 365 * day, 'falls back to the last update');
assert.ok(!purgeDue({ status: 'closed', closedAt: t0 }, t0 + 364 * day));
assert.ok(purgeDue({ status: 'closed', closedAt: t0 }, t0 + 365 * day));
assert.ok(!purgeDue({ status: 'open', closedAt: t0 }, t0 + 999 * day));

// the roster: active residents, who has sent, nominee marks
const people = [
  { rid: 'R1', name: 'Zed Last', email: 'zed@x.com', status: 'ACTIVE' },
  { rid: 'R2', name: 'Amy First', email: 'AMY@x.com', status: 'ACTIVE' },
  { rid: 'R3', name: 'Gone', email: 'gone@x.com', status: 'GRADUATED' },
  { rid: 'R4', name: 'Bob Mid', email: 'bob@x.com', status: 'ACTIVE' },
];
const ents = { 'amy@x.com': { name: 'Amy First', projects: [{ title: 'P1' }, { title: 'P2' }] }, 'bob@x.com': { name: 'Bob Mid', noProjects: true }, 'new@x.com': { name: 'Not On List' } };
const ms = { 'amy@x.com': { nominees: [{ id: 'a', group: 'senior', name: 'S1', email: 's1@x.com' }, { id: 'b', group: 'peer', name: 'P1', email: 'p1@x.com' }, { id: 'c', group: 'allied', name: 'A1', email: 'a1@x.com' }] } };
const rv = { 'amy@x.com': { marks: { a: 'ok', b: 'swap' } } };
const rows = roster(people, ents, ms, rv);
assert.deepEqual(rows.map(r => r.email), ['zed@x.com', 'amy@x.com', 'bob@x.com', 'new@x.com'], 'not sent first, then by name');
assert.ok(!rows.some(r => r.email === 'gone@x.com'), 'graduated residents are left out');
const amy = rows.find(r => r.email === 'amy@x.com');
assert.deepEqual([amy.sent, amy.projects, amy.nominees], [true, 2, 3]);
assert.deepEqual(amy.marks, { ok: 1, swap: 1, sent: 0, todo: 1 });
assert.equal(rows.find(r => r.email === 'bob@x.com').noProjects, true);
assert.ok(rows.find(r => r.email === 'new@x.com').extra, 'someone not on the list is flagged');
assert.deepEqual(rosterCounts(rows), { total: 4, sent: 3, nominees: 3, toCheck: 1 });

// CSV is safe to open in a spreadsheet
assert.equal(csvCell('plain'), 'plain');
assert.equal(csvCell('a,b'), '"a,b"');
assert.equal(csvCell('say "hi"'), '"say ""hi"""');
assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
assert.equal(csvCell('=1,2'), '"\'=1,2"');
assert.equal(csvCell('+1'), "'+1"); assert.equal(csvCell('-2'), "'-2"); assert.equal(csvCell('@x'), "'@x");
assert.equal(csvCell('one\ntwo'), 'one two');
assert.equal(csvCell(null), '');
const round = { title: 'CCC Dec', status: 'open' };
const items = [{ resident: { name: '=Evil', email: 'amy@x.com' }, nominees: ms['amy@x.com'].nominees, marks: rv['amy@x.com'].marks }];
const nc = nomineesCSV(round, items).split('\r\n');
assert.equal(nc[0], 'Round,Resident,Resident email,Group,Nominee,Nominee email,Status');
assert.equal(nc.length, 5, 'header, three nominees, trailing newline');
assert.ok(nc[1].includes("'=Evil") && nc[1].endsWith('Checked'), 'the resident name cannot run as a formula');
assert.ok(nc[2].endsWith('Ask for a different person') && nc[3].endsWith('To check'));
const pc = projectsCSV(round, [{ resident: { name: 'Amy', email: 'amy@x.com' }, entry: { projects: [{ title: 'P1', supervisor: 'Dr S', status: 'Completed', start: '2026-01', end: '2026-06', note: 'n' }], admin: ['Quality committee'] } }, { resident: { name: 'Bob', email: 'bob@x.com' }, entry: { noProjects: true } }]).split('\r\n');
assert.equal(pc.length, 5);
assert.ok(pc[1].includes('Scholarly project,P1,Dr S,Completed,2026-01,2026-06,n'));
assert.ok(pc[2].includes('Committee / admin work,Quality committee'));
assert.ok(pc[3].includes('None to report'));
// mailto
const m = mailto({ name: 'Dr S', email: 'dr.s+x@y.com' }, 'Amy First', { title: 'CCC Dec' });
assert.ok(m.startsWith('mailto:dr.s%2Bx%40y.com?subject='));
assert.ok(decodeURIComponent(m).includes('Amy First has nominated you') && decodeURIComponent(m).includes('(CCC Dec)'));
assert.equal(emailList(['A@x.com', 'a@x.com', 'bad', ' b@y.co ']), 'a@x.com, b@y.co');
console.log('ccc 360 model: all checks passed');
