// Notes (notepad.js): the stored shape, order, search, the day/case index, the light Markdown and the export.
// Fake notes only.
import assert from 'node:assert/strict';
import { cleanNote, sortNotes, filterNotes, notesOn, noteTitle, plainLines, noteIndex, cleanNoteIndex, sameIndex, parseNote, inline, safeHref, toggleCheck, noteMd, notesMd, noteFiles, MAX_NOTES, LIMITS, dayNoteId, isDayNote, dayNoteOf, cappedNotes } from '../js/notepad.js';
import { mdDay, exportNotes } from '../js/markdown.js';

assert.equal(MAX_NOTES, 100);
// cleaning: unknown fields dropped, bad dates cleared, long text cut, title on one line
const c = cleanNote({ id: 'n1', date: '12/10/2026', title: 'A\nB', body: 'x'.repeat(LIMITS.body + 5), images: [1], createdAt: 5 }, 9);
assert.deepEqual(Object.keys(c).sort(), ['body', 'createdAt', 'date', 'id', 'title', 'updatedAt']);
assert.equal(c.date, null); assert.equal(c.title, 'A B'); assert.equal(c.body.length, LIMITS.body); assert.equal(c.createdAt, 5); assert.equal(c.updatedAt, 9);
assert.equal(cleanNote({ id: 'n', date: '2026-10-12', body: '', caseId: 'c9' }).caseId, 'c9');
assert.match(cleanNote({}).id, /^[a-z0-9]+$/);

// order: undated first (latest change first), then newest day first, then as written within a day
const notes = [
  { id: 'a', date: '2026-10-10', title: 'Older day', body: '', createdAt: 1, updatedAt: 1 },
  { id: 'b', date: null, title: 'Undated old', body: 'pump settings', createdAt: 2, updatedAt: 2 },
  { id: 'c', date: '2026-10-12', title: 'Second today', body: 'remifentanil', createdAt: 4, updatedAt: 4, caseId: 'case1' },
  { id: 'd', date: null, title: 'Undated new', body: '', createdAt: 3, updatedAt: 9 },
  { id: 'e', date: '2026-10-12', title: 'First today', body: '- [ ] read about TIVA', createdAt: 3, updatedAt: 3 },
];
assert.deepEqual(sortNotes(notes).map(n => n.id), ['d', 'b', 'e', 'c', 'a']);
assert.deepEqual(notesOn(notes, '2026-10-12').map(n => n.id), ['e', 'c']);

// search: every word, in title or body, any case; narrowed by day or case
assert.deepEqual(filterNotes(notes, { q: 'TIVA read' }).map(n => n.id), ['e']);
assert.deepEqual(filterNotes(notes, { q: 'undated' }).map(n => n.id), ['b', 'd']);
assert.deepEqual(filterNotes(notes, { day: '2026-10-12' }).map(n => n.id), ['c', 'e']);
assert.deepEqual(filterNotes(notes, { caseId: 'case1' }).map(n => n.id), ['c']);

// titles and previews without Markdown marks
assert.equal(noteTitle({ title: '', body: '\n## **Plan** for [list](https://x.org)\nmore' }), 'Plan for list');
assert.equal(noteTitle({ title: '', body: '' }), 'Untitled note');
assert.deepEqual(plainLines('- [x] done\n1. one\n\ntext'), ['done', 'one', 'text']);

// the index the Logbook reads (days and cases with notes)
const idx = noteIndex(notes);
assert.deepEqual(idx, { days: ['2026-10-10', '2026-10-12'], cases: ['case1'], n: 5 });
assert.ok(sameIndex(idx, JSON.parse(JSON.stringify(idx))));
assert.ok(!sameIndex(idx, { days: [], cases: [], n: 0 }));
assert.deepEqual(cleanNoteIndex({ days: ['bad', '2026-01-01'], cases: [5, 'x'], n: -1 }), { days: ['2026-01-01'], cases: ['x'], n: 0 });

// light Markdown: blocks and inline parts, never raw HTML
const blocks = parseNote('# Plan\nline one\nline two\n\n- [ ] to-do\n- [x] done\n- plain\n1. first\n2) second\n<script>alert(1)</script>');
assert.deepEqual(blocks.map(b => b.t), ['h', 'p', 'ul', 'ol', 'p']);
assert.equal(blocks[0].level, 1);
assert.deepEqual(blocks[2].items.map(i => i.check), [false, true, null]);
assert.deepEqual(blocks[2].items.map(i => i.line), [4, 5, 6]);
assert.deepEqual(blocks[4].inl, [{ t: 'text', v: '<script>alert(1)</script>' }]);   // shown as text
assert.deepEqual(inline('see **this** and [docs](https://example.com) or www.example.org'), [
  { t: 'text', v: 'see ' }, { t: 'b', v: 'this' }, { t: 'text', v: ' and ' }, { t: 'a', v: 'docs', href: 'https://example.com' }, { t: 'text', v: ' or www.example.org' }]);
assert.deepEqual(inline('[x](javascript:alert(1))').map(p => p.t), ['text', 'text']);   // never a link
assert.equal(safeHref('javascript:alert(1)'), '');
assert.equal(safeHref('mailto:a@b.c'), 'mailto:a@b.c');
assert.deepEqual(inline('bare https://example.com/a.'), [{ t: 'text', v: 'bare ' }, { t: 'a', v: 'https://example.com/a', href: 'https://example.com/a' }, { t: 'text', v: '.' }]);
// ticking a to-do changes only that line
assert.equal(toggleCheck('- [ ] a\n- [x] b', 0), '- [x] a\n- [x] b');
assert.equal(toggleCheck('- [ ] a\n- [x] b', 1), '- [ ] a\n- [ ] b');
assert.equal(toggleCheck('plain', 0), 'plain');

// Markdown out: a day's notes follow its cases under "## Notes"; none, no heading; {{notes}} in the heading places them
const day = notesOn(notes, '2026-10-12');
assert.equal(noteMd(day[0]), '### First today\n- [ ] read about TIVA');
assert.equal(notesMd(day), '### First today\n- [ ] read about TIVA\n\n### Second today\nremifentanil');
const cases = [{ id: 'case1', date: '2026-10-12', initials: 'ZZ', details: '40M fake lap chole', cats: ['01'], createdAt: 1 }];
assert.equal(mdDay('2026-10-12', cases, null, {}, day), '[[2026-10-12]]\n1. ZZ\n40M fake lap chole\n\n## Notes\n\n### First today\n- [ ] read about TIVA\n\n### Second today\nremifentanil');
assert.equal(mdDay('2026-10-12', cases, null, {}, []), '[[2026-10-12]]\n1. ZZ\n40M fake lap chole');
assert.equal(mdDay('2026-10-12', cases, { dayHead: '## {{date}}\n{{notes}}' }, {}, day.slice(1)), '## 2026-10-12\n### Second today\nremifentanil\n1. ZZ\n40M fake lap chole');
assert.equal(mdDay('2026-10-12', [], null, {}, day.slice(0, 1)), '[[2026-10-12]]\n\n## Notes\n\n### First today\n- [ ] read about TIVA');

// the zip: dated notes in their day's note (a notes-only day too), undated ones in Notes.md
const files = exportNotes({ cases, notes, m: { caseNotes: 'day' }, opts: { progress: false, reflections: false } });
const byPath = Object.fromEntries(files.map(f => [f.path, f.text]));
assert.deepEqual(Object.keys(byPath).sort(), ['Cases/2026-10/2026-10-10.md', 'Cases/2026-10/2026-10-12.md', 'Notes.md']);
assert.match(byPath['Cases/2026-10/2026-10-12.md'], /notes: "2"[\s\S]*## Notes\n\n### First today/);
assert.match(byPath['Cases/2026-10/2026-10-10.md'], /### Older day/);
assert.match(byPath['Notes.md'], /^---\nnotes: "2"[\s\S]*# Notes\n\n### Undated new\n\n### Undated old\npump settings\n$/);
assert.equal(exportNotes({ cases, notes, opts: { notes: false, progress: false } }).some(f => /Notes/.test(f.text) || f.path === 'Notes.md'), false);


// one file per note: names, no clashes, .md or .txt
{
  const list = [
    { id: 'a', date: '2026-10-12', title: 'Fake: dose/plan?', body: 'one\ntwo', createdAt: 1 },
    { id: 'b', date: '2026-10-12', title: 'Fake: dose/plan?', body: '', createdAt: 2 },
    { id: 'c', date: null, title: '', body: '# Heading line\ntext', createdAt: 3, updatedAt: 3 },
  ];
  const md = noteFiles(list, 'md');
  assert.deepEqual(md.map(f => f.path), ['No date Heading line.md', '2026-10-12 Fake dose plan.md', '2026-10-12 Fake dose plan 2.md']);
  assert.equal(md[1].text, '# Fake: dose/plan?\n\nDate: 2026-10-12\n\none\ntwo\n');
  assert.equal(md[0].text, '# Heading line\n\n# Heading line\ntext\n');
  const txt = noteFiles(list, 'txt');
  assert.equal(txt[1].path, '2026-10-12 Fake dose plan.txt');
  assert.equal(txt[1].text, 'Fake: dose/plan?\n\nDate: 2026-10-12\n\none\ntwo\n');
  assert.deepEqual(noteFiles([], 'md'), []);
}

// daily notes: one per day, id day-YYYY-MM-DD; first in their day; not counted in the 100; called "Daily note"
{
  assert.equal(dayNoteId('2026-10-13'), 'day-2026-10-13');
  assert.ok(isDayNote({ id: 'day-2026-10-13' }));
  assert.ok(!isDayNote({ id: 'day-2026-10' }) && !isDayNote({ id: 'x-day-2026-10-13' }) && !isDayNote(null));
  assert.equal(cleanNote({ id: 'day-2026-10-13', date: '2026-10-13', body: 'x' }).id, 'day-2026-10-13');
  const list = [
    { id: 'a', date: '2026-10-13', title: 'Fake first', body: '', createdAt: 1 },
    { id: 'day-2026-10-13', date: '2026-10-13', title: '', body: 'Fake day: **busy** list', createdAt: 5 },
    { id: 'day-2026-10-12', date: '2026-10-12', title: '', body: '', createdAt: 2 },
    { id: 'b', date: null, title: 'Undated', body: '', createdAt: 3, updatedAt: 3 },
  ];
  assert.deepEqual(sortNotes(list).map(n => n.id), ['b', 'day-2026-10-13', 'a', 'day-2026-10-12']);
  assert.deepEqual(filterNotes(list, { kind: 'day' }).map(n => n.id), ['day-2026-10-13', 'day-2026-10-12']);
  assert.deepEqual(filterNotes(list, { kind: 'day', q: 'busy' }).map(n => n.id), ['day-2026-10-13']);
  assert.equal(dayNoteOf(list, '2026-10-13').body, 'Fake day: **busy** list');
  assert.equal(dayNoteOf(list, '2026-10-01'), null);
  assert.deepEqual(cappedNotes(list).map(n => n.id), ['a', 'b']);
  assert.equal(noteTitle(list[1]), 'Daily note');
  assert.equal(noteTitle({ ...list[1], title: 'Fake theatre day' }), 'Fake theatre day');
  // in a day's Copy / Markdown: the daily note first, with no heading of its own
  assert.equal(notesMd(notesOn(list, '2026-10-13')), 'Fake day: **busy** list\n\n### Fake first');
  assert.equal(noteFiles([list[1]])[0].path, '2026-10-13 Daily note.md');
  // the index keeps the latest 100 days (the rules allow 100)
  const many = Array.from({ length: 130 }, (_, i) => ({ id: dayNoteId(`2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`), date: `2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, title: '', body: 'x' }));
  const ix = noteIndex(many);
  assert.equal(ix.days.length, 100);
  assert.equal(ix.days[99], many[129].date);
  assert.equal(ix.n, 130);
  assert.equal(cleanNoteIndex({ days: many.map(n => n.date), cases: [], n: 130 }).days[0], many[30].date);
}

// *italic*: shown in italics; a lone star (2*3, a * b) stays as typed
{
  assert.deepEqual(inline('a *word* b'), [{ t: 'text', v: 'a ' }, { t: 'i', v: 'word' }, { t: 'text', v: ' b' }]);
  assert.deepEqual(inline('2*3*4 and a * b *').map(p => p.t), ['text']);
  assert.deepEqual(inline('**bold** *it*').map(p => p.t), ['b', 'text', 'i']);
  assert.deepEqual(plainLines('- *Fake* plan'), ['Fake plan']);
}

console.log('notepad tests passed');
