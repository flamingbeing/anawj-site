// Run with: node logbook/test/note-bulk.test.mjs  (fake data only)
// Notes' bulk edit: date (set or clear; daily notes keep their day), title (replace / add in front / find and replace),
// text (add to the end / find and replace), unlink; nothing to change gives null; merging in date order.
import assert from 'node:assert/strict';
import { applyNoteChange, noteOverwrites, noteChangeLines, noteMissing, noteNone, noteEmpty, mergeNotes } from '../js/note-bulk.js';
import { LIMITS } from '../js/notepad.js';

const ch = x => ({ ...noteNone(), ...x });
const n = { id: 'n1', date: '2026-10-02', title: 'Fake airway plan', body: 'Fake line one\nUse the VL', caseId: 'c1', createdAt: 1, updatedAt: 1 };
const day = { id: 'day-2026-10-03', date: '2026-10-03', title: '', body: 'Fake daily', createdAt: 2, updatedAt: 2 };

assert.ok(noteEmpty(noteNone()));
assert.equal(applyNoteChange(n, noteNone()), null);
let r = applyNoteChange(n, ch({ date: { set: '2026-09-01' } }), 9);
assert.equal(r.date, '2026-09-01'); assert.equal(r.updatedAt, 9);
assert.equal(applyNoteChange(n, ch({ date: { clear: true } })).date, null, 'cleared');
assert.equal(applyNoteChange(day, ch({ date: { set: '2026-09-01' } })), null, 'a daily note keeps its day');
assert.equal(applyNoteChange(n, ch({ title: { mode: 'replace', text: 'Fake new' } })).title, 'Fake new');
assert.equal(applyNoteChange(n, ch({ title: { mode: 'prefix', text: 'ICU:' } })).title, 'ICU: Fake airway plan');
assert.equal(applyNoteChange(day, ch({ title: { mode: 'prefix', text: 'ICU:' } })).title, 'ICU:', 'an empty title becomes the prefix');
assert.equal(applyNoteChange(n, ch({ title: { mode: 'find', find: 'airway', with: 'block' } })).title, 'Fake block plan');
assert.equal(applyNoteChange(n, ch({ title: { mode: 'find', find: 'AIRWAY', with: 'x' } })), null, 'exact capitals');
assert.equal(applyNoteChange(n, ch({ body: { mode: 'append', text: '- [ ] fake to-do' } })).body, 'Fake line one\nUse the VL\n- [ ] fake to-do');
assert.equal(applyNoteChange(n, ch({ body: { mode: 'find', find: 'VL', with: 'video laryngoscope' } })).body, 'Fake line one\nUse the video laryngoscope');
r = applyNoteChange(n, ch({ unlink: true }));
assert.equal('caseId' in r, false);
assert.equal(applyNoteChange(day, ch({ unlink: true })), null, 'no case: nothing to unlink');
assert.deepEqual(applyNoteChange(n, ch({ body: { mode: 'append', text: 'x'.repeat(LIMITS.body) } })), { tooLong: true });

assert.equal(noteOverwrites(ch({ body: { mode: 'append', text: 'x' } })), false);
assert.equal(noteOverwrites(ch({ title: { mode: 'prefix', text: 'x' } })), false);
assert.equal(noteOverwrites(ch({ unlink: true })), true);
assert.deepEqual(noteChangeLines(ch({ title: { mode: 'prefix', text: 'ICU:' }, unlink: true })), ['Title: “ICU:” added in front', 'Linked case: unlinked']);
assert.equal(noteMissing(ch({ date: { clear: true } })), '');
assert.equal(noteMissing(ch({ date: { set: '' } })), 'Choose the date');
assert.equal(noteMissing(ch({ date: { set: '2026-1' } })), 'Choose the date');
assert.equal(noteMissing(ch({ body: { mode: 'find', find: '' } })), 'Type what to find');
assert.equal(noteMissing(ch({ title: { mode: 'replace', text: ' ' } })), 'Type the title');

// merge: oldest first, each under its title; the earliest date; the case only when they all share it
const a = { id: 'a', date: '2026-10-05', title: 'Fake later', body: 'B text', caseId: 'c1', createdAt: 5 };
const b = { id: 'b', date: '2026-10-01', title: 'Fake earlier', body: 'A text', caseId: 'c1', createdAt: 1 };
const m = mergeNotes([a, b], { id: 'm', now: 7 }).note;
assert.equal(m.body, '## Fake earlier (2026-10-01)\nA text\n\n## Fake later (2026-10-05)\nB text');
assert.equal(m.date, '2026-10-01'); assert.equal(m.caseId, 'c1'); assert.equal(m.title, 'Merged: Fake earlier'); assert.equal(m.id, 'm');
assert.equal('caseId' in mergeNotes([a, { ...b, caseId: 'c2' }], { id: 'm' }).note, false);
assert.match(mergeNotes([a], { id: 'm' }).error, /two or more/);
assert.match(mergeNotes([{ ...a, body: 'x'.repeat(LIMITS.body) }, b], { id: 'm' }).error, /Too long/);
console.log('note-bulk: ok');
