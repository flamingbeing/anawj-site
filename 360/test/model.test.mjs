// Unit tests for the CCC 360 logic. Run: node 360/test/model.test.mjs
import assert from 'node:assert/strict';
import {
  GROUPS, TOTAL_MAX, cleanProject, cleanLines, cleanEntry, blankEntry, carryOver, cleanNominee, cleanNominees, nomineeCounts, canAdd,
  problems, warnings, progress, snapshot, entryDoc, msfDoc, suggestFaculty, contactEmail, monthText, dayText, pastDeadline, demoRound,
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
console.log('ccc 360 model: all checks passed');
