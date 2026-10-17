// Run with: node logbook/test/global-search.test.mjs  (fake data only)
// Global search: words over cases, planned cases, reflections and notes; in:, status:, is:, has:, no:, linked:,
// heading:, tag:; grouped counts; Best match and Newest; snippets with the words marked.
import assert from 'node:assert/strict';
import { buildIndex, search, snippet } from '../js/global-search.js';

const idx = buildIndex({
  cases: [
    { id: 'c1', date: '2026-10-01', initials: 'ZQ', details: '45F fake lap chole GA', cats: ['17'], reflectTag: true },
    { id: 'c2', date: '2026-10-05', initials: 'ZW', details: 'fake spinal for TURP', cats: [] },
    { id: 'c3', date: '2026-09-01', initials: 'ZE', details: 'fake lap appendicectomy', cats: ['17'], tags: ['u:mine'] },
  ],
  plan: [{ id: 'p1', initials: 'ZP', details: 'fake planned lap hernia', cats: [] }],
  reflections: [
    { id: 'r1', caseId: 'c1', headingId: 'gs', initials: 'ZQ', date: '2026-10-02', diagnosis: 'Fake lap chole', summary: 'fake difficult airway', status: 'draft', points: [{ heading: 'Fake VL', text: 'fake' }] },
    { id: 'r2', headingId: '', initials: 'ZR', date: '2026-08-01', diagnosis: 'Fake thyroid', summary: 'fake', status: 'complete' },
  ],
  notes: [
    { id: 'n1', caseId: 'c3', date: '2026-10-03', title: 'Fake airway plan', body: 'Use the VL for the lap case' },
    { id: 'n2', date: null, title: '', body: '# Fake reading list\nairway papers' },
  ],
}, { catName: k => ({ 17: 'General surgery' })[k] || k, tagName: k => (k === 'u:mine' ? 'Fake mine' : k), headingName: id => (id === 'gs' ? 'General surgery' : '') });

const ids = r => [...r.results.case, ...r.results.reflection, ...r.results.note].map(d => d.id).sort();
let r = search(idx, 'lap');
assert.deepEqual(r.counts, { case: 3, reflection: 1, note: 1 });
assert.deepEqual(ids(r), ['c1', 'c3', 'n1', 'p1', 'r1']);
assert.deepEqual(ids(search(idx, 'airway')), ['n1', 'n2', 'r1']);
assert.deepEqual(ids(search(idx, 'airway in:notes')), ['n1', 'n2']);
assert.deepEqual(ids(search(idx, 'airway -in:notes')), ['r1']);
assert.deepEqual(ids(search(idx, 'status:draft')), ['r1']);
assert.deepEqual(ids(search(idx, 'status:complete')), ['r2']);
assert.deepEqual(ids(search(idx, 'is:interesting')), ['c1']);
assert.deepEqual(ids(search(idx, 'is:planned')), ['p1']);
assert.deepEqual(ids(search(idx, 'has:reflection')), ['c1']);
assert.deepEqual(ids(search(idx, 'has:note')), ['c3']);
assert.deepEqual(ids(search(idx, 'no:tag')), ['c2', 'p1', 'r2']);
assert.deepEqual(ids(search(idx, 'linked:yes')), ['n1', 'r1']);
assert.deepEqual(ids(search(idx, 'linked:no')), ['n2', 'r2']);
assert.deepEqual(ids(search(idx, 'heading:general')), ['r1']);
assert.deepEqual(ids(search(idx, 'tag:general')), ['c1', 'c3']);
assert.deepEqual(ids(search(idx, 'tag:mine')), ['c3']);
assert.deepEqual(ids(search(idx, 'initials:zq')), ['c1', 'r1']);
assert.deepEqual(ids(search(idx, 'spinal OR thyroid')), ['c2', 'r2']);
assert.deepEqual(ids(search(idx, '"lap chole"')), ['c1', 'r1']);
assert.deepEqual(ids(search(idx, '')), [], 'nothing typed: nothing found');
assert.equal(search(idx, 'statsu:draft').unknown[0].suggest, 'status:', 'a near miss is reported');

// Best match puts the title hits first; Newest by date (undated last)
assert.equal(search(idx, 'lap', { sort: 'best' }).results.case[0].id, 'c1');
assert.deepEqual(search(idx, 'lap', { sort: 'newest' }).results.case.map(d => d.id), ['c1', 'c3', 'p1']);
assert.equal(search(idx, 'lap', { limit: 1 }).results.case.length, 1); assert.equal(search(idx, 'lap', { limit: 1 }).counts.case, 3, 'counts are all of them');

// snippets
assert.deepEqual(snippet('Use the VL for the lap case', ['vl']), [['Use the ', false], ['VL', true], [' for the lap case', false]]);
const long = 'x '.repeat(80) + 'the fake airway word ' + 'y '.repeat(80);
const s = snippet(long, ['airway']);
assert.ok(s[0][0].startsWith('…'), 'cut at the front'); assert.ok(s.some(([t, on]) => on && t === 'airway'));
assert.deepEqual(snippet('', ['x']), []);
console.log('global-search: ok');

// dates, and the chips' helpers
{
  const { hasOp, opValue, setOp, toggleOp } = await import('../js/global-search.js');
  assert.deepEqual(ids(search(idx, 'lap after:2026-10-01')), ['c1', 'n1', 'r1']);
  assert.deepEqual(ids(search(idx, 'lap before:2026-09')), ['c3']);
  assert.equal(hasOp('lap in:notes', 'in', 'notes'), true);
  assert.equal(hasOp('lap -in:notes', 'in', 'notes'), false, 'left out is not on');
  assert.equal(hasOp('lap in:notes', 'in'), true);
  assert.equal(opValue('x tag:"general surgery" y', 'tag'), 'general surgery');
  assert.equal(setOp('lap in:notes', 'in', 'cases'), 'lap in:cases');
  assert.equal(setOp('lap in:notes', 'in', ''), 'lap');
  assert.equal(setOp('lap', 'tag', 'general surgery'), 'lap tag:"general surgery"');
  assert.equal(toggleOp('lap in:notes', 'in', 'notes'), 'lap');
  assert.equal(toggleOp('lap', 'is', 'interesting'), 'lap is:interesting');
  console.log('global-search chips: ok');
}
{
  const { setOp } = await import('../js/global-search.js');
  assert.equal(setOp('lap tag:"general surgery"', 'tag', 'ent'), 'lap tag:ent', 'a quoted value goes whole');
}
