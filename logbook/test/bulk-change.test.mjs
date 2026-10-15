// Run with: node logbook/test/bulk-change.test.mjs  (fake data only)
// Bulk edit's changes on one case: each field starts unchanged; replace / add / find and replace; tags add, remove and
// replace (with their parents and your tags under them); Interesting; nothing to change gives null.
import assert from 'node:assert/strict';
import { applyChange, overwrites, changeLines, missing, none, isEmpty, MAX_DETAILS } from '../js/bulk-change.js';
import { sortCodes, withParents, cleanInitials, caseParts } from '../js/engine.js';

const PARENT = { '20i': '20', '20ii': '20' };
const t = {
  parts: caseParts, cleanInitials, sortCodes, withParents,
  parentOf: code => PARENT[code] || null,
  keepTags: (tags, cats) => (tags || []).filter(k => k !== 'u:under20' || cats.includes('20')),
  tagLinks: k => (k === 'u:linked' ? ['16'] : []),
};
const base = { id: 'x', date: '2026-10-01', initials: 'AB', details: 'Fake LSCS under spinal', cats: ['16'], createdAt: 1, updatedAt: 1 };
const ch = extra => ({ ...none(), ...extra });

assert.ok(isEmpty(none()));
assert.equal(applyChange(base, none(), t), null, 'nothing chosen: no change');

// date and initials
let r = applyChange(base, ch({ date: { set: '2026-09-30' } }), t, 99);
assert.equal(r.date, '2026-09-30'); assert.equal(r.updatedAt, 99); assert.equal(r.details, base.details);
assert.equal(applyChange(base, ch({ date: { set: '2026-10-01' } }), t), null, 'the same date: no change');
assert.equal(applyChange(base, ch({ initials: { set: 'cd' } }), t).initials, 'CD');
assert.equal(applyChange(base, ch({ initials: { set: '' } }), t).initials, '', 'empty clears the initials');

// an old case with the initials at the front of the details: split as the edit dialog does
const old = { id: 'o', date: '2026-10-02', details: 'EF Fake appendicectomy', cats: ['17'] };
r = applyChange(old, ch({ details: { mode: 'append', text: 'converted to open' } }), t);
assert.equal(r.initials, 'EF'); assert.equal(r.details, 'Fake appendicectomy converted to open');
assert.equal(applyChange(old, ch({ initials: { set: 'EF' } }), t), null, 'splitting alone is not a change');

// the case summary
assert.equal(applyChange(base, ch({ details: { mode: 'replace', text: 'Fake new text' } }), t).details, 'Fake new text');
assert.equal(applyChange(base, ch({ details: { mode: 'find', find: 'spinal', with: 'CSE' } }), t).details, 'Fake LSCS under CSE');
assert.equal(applyChange(base, ch({ details: { mode: 'find', find: 'LSCS', with: 'caesarean' } }), t).details, 'Fake caesarean under spinal');
assert.equal(applyChange(base, ch({ details: { mode: 'find', find: 'lscs', with: 'C/S' } }), t), null, 'exact capitals');
assert.equal(applyChange({ ...base, details: 'GA for gastrectomy' }, ch({ details: { mode: 'find', find: 'GA', with: 'general' } }), t).details, 'general for gastrectomy', 'lower-case letters inside other words stay');
assert.equal(applyChange(base, ch({ details: { mode: 'find', find: '(x)', with: 'y' } }), t), null, 'found nowhere: no change (no regex)');
assert.deepEqual(applyChange(base, ch({ details: { mode: 'append', text: 'x'.repeat(MAX_DETAILS) } }), t), { tooLong: true });

// tags
r = applyChange(base, ch({ tags: { mode: 'add', k: 'c:20i' } }), t);
assert.deepEqual(r.cats, sortCodes(['16', '20', '20i']), 'a sub-category brings its parent');
r = applyChange(base, ch({ tags: { mode: 'add', k: 'u:linked' } }), t);
assert.deepEqual(r.tags, ['u:linked']); assert.deepEqual(r.cats, ['16']);
const twenty = { ...base, cats: ['16', '20', '20i'], tags: ['u:under20', 'u:mine'] };
r = applyChange(twenty, ch({ tags: { mode: 'remove', k: 'c:20' } }), t);
assert.deepEqual(r.cats, ['16'], 'removing a parent takes its sub-categories'); assert.deepEqual(r.tags, ['u:mine'], 'and your tags under it');
r = applyChange(twenty, ch({ tags: { mode: 'remove', k: 'u:mine' } }), t);
assert.deepEqual(r.tags, ['u:under20']);
r = applyChange({ ...base, tags: ['u:mine'] }, ch({ tags: { mode: 'remove', k: 'u:mine' } }), t);
assert.equal('tags' in r, false, 'no tags left: the field goes');
r = applyChange(base, ch({ tags: { mode: 'replace', k: 'c:16', to: 'c:17' } }), t);
assert.deepEqual(r.cats, ['17']);
assert.equal(applyChange(base, ch({ tags: { mode: 'replace', k: 'c:18', to: 'c:17' } }), t), null, 'replace leaves cases without the old tag');
assert.equal(applyChange(base, ch({ tags: { mode: 'add', k: 'c:16' } }), t), null, 'already there');

// Interesting
r = applyChange(base, ch({ star: true }), t); assert.equal(r.reflectTag, true);
r = applyChange({ ...base, reflectTag: true }, ch({ star: false }), t); assert.equal('reflectTag' in r, false);
assert.equal(applyChange(base, ch({ star: false }), t), null);

// several at once
r = applyChange(base, ch({ date: { set: '2026-09-01' }, initials: { set: 'ZZ' }, tags: { mode: 'add', k: 'c:17' }, star: true }), t);
assert.deepEqual([r.date, r.initials, r.cats, r.reflectTag], ['2026-09-01', 'ZZ', ['16', '17'], true]);

// what overwrites, the review lines, what is missing
assert.equal(overwrites(ch({ tags: { mode: 'add', k: 'c:16' } })), false);
assert.equal(overwrites(ch({ details: { mode: 'append', text: 'x' } })), false);
assert.equal(overwrites(ch({ star: true })), false);
for (const x of [{ date: { set: '2026-01-01' } }, { initials: { set: '' } }, { details: { mode: 'find', find: 'a' } }, { tags: { mode: 'remove', k: 'c:16' } }, { star: false }])
  assert.equal(overwrites(ch(x)), true, JSON.stringify(x));
assert.deepEqual(changeLines(ch({ date: { set: '2026-09-01' }, tags: { mode: 'replace', k: 'c:16', to: 'c:17' }, star: false }), { name: k => k.slice(2), day: d => 'D' + d }),
  ['Date: set to D2026-09-01', 'Tags: 16 replaced with 17', 'Interesting: off']);
assert.equal(missing(ch({ date: { set: '' } })), 'Choose the date');
assert.equal(missing(ch({ details: { mode: 'find', find: '' } })), 'Type what to find');
assert.equal(missing(ch({ tags: { mode: 'replace', k: 'c:16', to: '' } })), 'Choose the tag');
assert.equal(missing(ch({ tags: { mode: 'add', k: 'c:16' } })), '');
console.log('bulk-change: ok');
