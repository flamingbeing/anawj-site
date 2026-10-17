// Markdown format and the notes export (js/markdown.js).
import assert from 'node:assert/strict';
import { fmtPattern, mdDate, fileDate, dateLink, HEAD_STYLES, DEFAULT_MARKDOWN, cleanMarkdown, storedMarkdown, fill, fmtMdDate, tagSlug, catsText, noteLink, mdCase, mdDay, safeName, frontMatter,
  reflectionPath, reflectionNote, caseNotes, progressNote, exportNotes, MAX_JSON } from '../js/markdown.js';
import { formatDay, formatCase } from '../js/share-format.js';
import { progress } from '../js/engine.js';
import { reflectionProgress } from '../js/reflections.js';

const cases = [
  { id: 'a', date: '2026-10-10', initials: 'AB', details: '34F LSCS spinal', cats: ['17', '16'], createdAt: 1 },
  { id: 'b', date: '2026-10-10', initials: '', details: 'TKR ACB', cats: ['18'], createdAt: 2 },
  { id: 'c', date: '2026-10-11', details: 'GH 45F lap chole', cats: ['08', '13'], createdAt: 3 },   // older case: initials in the details
];

// the Link heading reads exactly like Copy / Share did before (share-format.js defaults); Plain is the default now
assert.equal(mdDay('2026-10-10', cases.slice(0, 2), { dayHeadStyle: 'link' }), formatDay('2026-10-10', cases.slice(0, 2), null));
assert.equal(mdCase(cases[0], { dayHeadStyle: 'link' }), formatCase(cases[0], null));
assert.equal(mdDay('2026-10-10', cases.slice(0, 2), null), '2026-10-10\n1. AB\n34F LSCS spinal\n\n2.\nTKR ACB');
assert.equal(mdCase(cases[2], null), '2026-10-11\nGH\n45F lap chole');

// a Copy & share format someone saved carries over, single-brace fill-ins included
const legacy = { dayHead: '## {day} ({count})', dayCase: '- {initials} {case}' };
assert.equal(mdDay('2026-10-10', cases.slice(0, 2), cleanMarkdown(null, legacy)), '## 10 Oct 2026 (2)\n- AB 34F LSCS spinal\n- TKR ACB');
assert.equal(cleanMarkdown({ dayHead: 'X' }, legacy).dayCase, DEFAULT_MARKDOWN.dayCase);   // a Markdown format wins over the old one

// fill-ins: {{x}} and {x}; unknown names stay; values are never read as templates; empty lines go
assert.equal(fill('{{a}}-{b}-{{zz}}', { a: 1, b: 2 }), '1-2-{{zz}}');
assert.equal(fill('{{a}}', { a: '{{b}}' }), '{{b}}');
assert.equal(fill('Top\n{{a}}\n- {{b}}\nEnd', { a: '', b: '' }), 'Top\nEnd');
assert.equal(fill('Note: {{a}}', { a: '' }), 'Note:');   // a line with words of its own stays
assert.equal(fill('{{a}}   ', { a: 'x' }), 'x');

// dates, categories, links
assert.equal(fmtMdDate('2026-10-05', 'iso'), '2026-10-05');
assert.equal(fmtMdDate('2026-10-05', 'long'), '5 Oct 2026');
assert.equal(fmtMdDate('2026-10-05', 'dmy'), '05/10/2026');
assert.equal(fmtMdDate('soon', 'long'), '');
assert.equal(tagSlug('CNB(Obs)'), '#CNB-Obs');
assert.equal(tagSlug('<12yo'), '#12yo');
assert.equal(catsText(['17', '16'], 'codes'), '16, 17');
assert.equal(catsText(['16'], 'tags'), '#LSCS');
assert.match(catsText(['16'], 'names'), /Lower Segment Caesarean Section/);
assert.equal(catsText(['16'], 'names', { catName: () => 'C-section' }), 'C-section');   // the user's own names
assert.equal(noteLink('Reflections/2026-10/A b', 'Title'), '[[Reflections/2026-10/A b|Title]]');
assert.equal(noteLink('Cases/2026-10', '2026-10'), '[[Cases/2026-10]]');
assert.equal(noteLink('Cases/2026-10', 'Oct [x]', 'md', 'Reflections/2026-10/n.md'), '[Oct \\[x\\]](../../Cases/2026-10.md)');
assert.equal(noteLink('Reflections/A b', 'T', 'md'), '[T](Reflections/A%20b.md)');

// a case line with every fill-in
const f1 = { ...DEFAULT_MARKDOWN, dayCase: '- {{iso}} {{weekday}} {{initials}} {{details}} {{categoryCodes}} | {{categories}} | {{tags}}', cats: 'tags' };
assert.equal(mdDay('2026-10-10', [{ ...cases[0], tags: ['u:1'] }], f1, { tagName: () => 'Night call' }).split('\n')[1], '- 2026-10-10 Sat AB 34F LSCS spinal 16, 17 | #LSCS #CNB-Obs | Night call');

// file names and front matter are safe
assert.equal(safeName(' a/b:c*?"<>|d\n '), 'a b c d');
assert.equal(safeName('...hidden'), 'hidden');
assert.equal(safeName(''), 'Untitled');
assert.equal(frontMatter({ title: 'He said "hi": ok', tags: ['a', 'b c'], jr: true, empty: '' }), '---\ntitle: "He said \\"hi\\": ok"\ntags: ["a", "b c"]\njr: true\n---\n\n');
assert.equal(frontMatter({ empty: '' }), '');

// reflection notes
const r = { id: 'r1', headingId: 'lscs', initials: 'AB', date: '2026-10-10', diagnosis: 'LSCS', title: 'High spinal', status: 'complete', jr: true,
  summary: 'Made-up summary.', points: [{ heading: 'Early signs', text: 'Hands weak.' }, { heading: 'Plan', text: 'Say it.' }],
  figures: [{ id: 'img1', caption: 'Block height', point: 0 }, { id: 'img2', caption: 'End', point: null }], references: ['Doe J. 2026.', ' '], caseId: 'a' };
const used = new Set();
const path = reflectionPath(r, DEFAULT_MARKDOWN, used);
assert.equal(path, 'Reflections/2026-10/2026-10-10 AB Caesarean sections.md');
assert.equal(reflectionPath(r, DEFAULT_MARKDOWN, used), 'Reflections/2026-10/2026-10-10 AB Caesarean sections (2).md');   // never two the same
assert.equal(reflectionPath(r, { ...DEFAULT_MARKDOWN, folders: 'heading' }, new Set()), 'Reflections/Caesarean sections/2026-10-10 AB Caesarean sections.md');
assert.equal(reflectionPath(r, { ...DEFAULT_MARKDOWN, folders: 'flat', fileName: '{{title}}' }, new Set()), 'Reflections/High spinal.md');
const note = reflectionNote(r, DEFAULT_MARKDOWN, { path, images: { img1: 'images/img1.jpg' } });
assert.ok(note.startsWith('---\ndate: "2026-10-10"\nheading: "Caesarean sections"\nstatus: "complete"\ntags: ["apmes/reflection", "Caesarean-sections"]\n---\n\n# High spinal\n\n**AB** · 2026-10-10 · LSCS\n\nMade-up summary.'), note);
assert.ok(note.indexOf('## Early signs') < note.indexOf('![[images/img1.jpg]]') && note.indexOf('![[images/img1.jpg]]') < note.indexOf('## Plan'), 'figure after its point');
assert.ok(note.includes('\n*End*'), 'a figure without its picture keeps its caption');
assert.ok(note.includes('## References\n\n1. Doe J. 2026.') && !note.includes('2. '), 'references');
const mdNote = reflectionNote(r, { ...DEFAULT_MARKDOWN, links: 'md', frontMatter: false }, { path, images: { img1: 'images/img1.jpg' } });
assert.ok(mdNote.startsWith('# High spinal') && mdNote.includes('![Block height](../../images/img1.jpg)'), mdNote);
assert.ok(!reflectionNote({ id: 'x', status: 'draft' }, DEFAULT_MARKDOWN).includes('undefined'));
// free-text learning points: one "Learning points" section, not "Learning point 1"
const freeNote = reflectionNote({ ...r, points: [{ heading: '', text: 'One flowing discussion.' }], figures: [] }, DEFAULT_MARKDOWN, { path });
assert.ok(freeNote.includes('## Learning points\n\nOne flowing discussion.') && !freeNote.includes('Learning point 1'), freeNote);

// case notes by month and by day
const months = caseNotes(cases, DEFAULT_MARKDOWN);
assert.deepEqual(months.map(x => x.path), ['Cases/2026-10.md']);
assert.ok(months[0].text.includes('# October 2026 (3 cases)\n\n2026-10-10\n1. AB') && months[0].text.includes('2026-10-11\n1. GH'), months[0].text);
const days = caseNotes(cases, { ...DEFAULT_MARKDOWN, caseNotes: 'day', frontMatter: false });
assert.deepEqual(days.map(x => x.path), ['Cases/2026-10/2026-10-10.md', 'Cases/2026-10/2026-10-11.md']);
assert.deepEqual(caseNotes([{ id: 'z', date: null, dateText: 'March', details: 'XY lap' }], DEFAULT_MARKDOWN).map(x => x.path), ['Cases/No date.md']);

// Progress.md
const pn = progressNote(progress({ '16': 3 }, 3), reflectionProgress([r]), { year: 'R3', today: '2026-10-11' });
assert.ok(pn.startsWith('# APMES progress (R3)\n\nExported 2026-10-11.\n\n## Cases\n\n| Tag | Logged | Next target | Status |'), pn.slice(0, 200));
assert.match(pn, /\| Lower Segment Caesarean Section \| 3 \| 10 by R3 \| due this year \|/);
assert.match(pn, /## Reflections \(1 of 96 counted\)/);
assert.match(pn, /\| Caesarean sections \| 1 \| 5 \| 4 to go \|/);

// the whole export: the case links to its reflection note, the note back to its case month
const files = exportNotes({ cases, reflections: [r], m: { ...DEFAULT_MARKDOWN, dayCase: '{{n}}. {{initials}} {{details}} {{reflection}}' }, progress: { rows: progress({}, 3), refl: reflectionProgress([r]), year: 'R3' } });
assert.deepEqual(files.map(x => x.path), ['Cases/2026-10.md', 'Reflections/2026-10/2026-10-10 AB Caesarean sections.md', 'Progress.md']);
assert.ok(files[0].text.includes('1. AB 34F LSCS spinal [[Reflections/2026-10/2026-10-10 AB Caesarean sections|High spinal]]'), files[0].text);
assert.ok(files[1].text.includes('Case: [[Cases/2026-10|2026-10-10]]'), files[1].text);
assert.deepEqual(exportNotes({ cases, reflections: [r], opts: { reflections: false, progress: false } }).map(x => x.path), ['Cases/2026-10.md']);

// what is saved: only the changes, and capped
assert.equal(storedMarkdown(DEFAULT_MARKDOWN), null);
assert.deepEqual(storedMarkdown({ ...DEFAULT_MARKDOWN, cats: 'tags', bogus: 1 }), { cats: 'tags' });
assert.deepEqual(cleanMarkdown({ cats: 'nope', frontMatter: 'yes', fmFields: ['tags', 'evil', 'date'] }).fmFields, ['date', 'tags']);
assert.equal(cleanMarkdown({ cats: 'nope' }).cats, 'names');
assert.equal(cleanMarkdown({ dayHead: 'x'.repeat(5000) }).dayHead.length, 1000);
assert.throws(() => storedMarkdown(Object.fromEntries(['dayHead', 'dayCase', 'oneCase', 'fileName', 'reflTitle', 'reflSummary', 'reflPoint', 'reflFigure', 'reflRefs'].map(k => [k, 'y'.repeat(1000)]))), /too long/);
assert.ok(MAX_JSON >= 8000);

// Bold labels (labelled parts on: ctx.labels): "Plan: GA" -> "**Plan:** GA" in {{details}}; off by default
{
  const { cleanLabels } = await import('../js/parts.js');
  const labels = cleanLabels([{ k: 'lp', n: 'Learning point' }, { k: 'Plan' }]);
  const c = { date: '2026-10-10', initials: 'AB', details: 'lap chole\nPlan: GA ETT\nlp: cuff', cats: [] };
  assert.equal(cleanMarkdown({}).boldLabels, false);
  assert.equal(cleanMarkdown({ boldLabels: 'yes' }).boldLabels, false);
  assert.deepEqual(storedMarkdown({ boldLabels: true }), { boldLabels: true });
  assert.equal(mdCase(c, {}, { labels }), '2026-10-10\nAB\nlap chole\nPlan: GA ETT\nlp: cuff');              // as typed
  assert.equal(mdCase(c, { boldLabels: true }, {}), '2026-10-10\nAB\nlap chole\nPlan: GA ETT\nlp: cuff');   // the setting off
  assert.equal(mdCase(c, { boldLabels: true }, { labels }), '2026-10-10\nAB\nlap chole\n**Plan:** GA ETT\n**Learning point:** cuff');
  assert.match(mdDay('2026-10-10', [c], { boldLabels: true }, { labels }), /\*\*Plan:\*\* GA ETT/);
}

console.log('markdown tests passed');

// the day heading's styles (log2 15): Plain (default), Heading, Link, Custom; one case follows unless typed
{
  const c = cases[0];
  assert.equal(mdCase(c, { dayHeadStyle: 'heading' }), '# 2026-10-10\nAB\n34F LSCS spinal');
  assert.equal(mdDay('2026-10-10', [c], { dayHeadStyle: 'link' }).split('\n')[0], '[[2026-10-10]]');
  assert.equal(mdCase(c, { dayHeadStyle: 'heading', oneCase: '{{initials}} only' }), 'AB only', 'a typed one-case format stays');
  assert.equal(cleanMarkdown({ dayHead: '## {{day}}' }).dayHeadStyle, 'custom', 'a heading typed before the styles is Custom');
  assert.equal(mdDay('2026-10-10', [c], { dayHead: '## {{day}}' }).split('\n')[0], '## 10 Oct 2026');
  assert.equal(cleanMarkdown({ dayHeadStyle: 'heading', dayHead: 'ignored' }).dayHead, '# {{date}}');
  // stored: only the style, not the heading it writes; switching style later moves the one-case line too
  assert.deepEqual(storedMarkdown(cleanMarkdown({ dayHeadStyle: 'link' })), { dayHeadStyle: 'link' });
  assert.equal(storedMarkdown(cleanMarkdown({ dayHeadStyle: 'plain' })), null);
  assert.equal(cleanMarkdown({ dayHeadStyle: 'heading', oneCase: '[[{{date}}]]\n{{initials}}\n{{details}}' }).oneCase, '# {{date}}\n{{initials}}\n{{details}}');
}
// dates: presets, a custom pattern ([text] literal), and file names / link targets of their own
{
  assert.equal(fmtPattern('2026-10-05', 'dddd D MMMM YYYY [wk] YY.MM.DD M'), 'Monday 5 October 2026 wk 26.10.05 10');
  assert.equal(fmtPattern('2026-10-05', ''), '2026-10-05');
  const f = k => cleanMarkdown(k);
  assert.equal(mdDate('2026-10-10', f({ dateFormat: 'compact' })), '20261010');
  assert.equal(mdDate('2026-10-10', f({ dateFormat: 'wlong' })), 'Sat 10 Oct 2026');
  assert.equal(mdDate('2026-10-10', f({ dateFormat: 'custom', datePattern: 'D/M/YY' })), '10/10/26');
  assert.equal(fileDate('2026-10-10', f({ dateFormat: 'dmy' })), '10 10 2026', 'no slashes in a file name');
  assert.equal(fileDate('2026-10-10', f({ dateFormat: 'long', fileDate: 'iso' })), '2026-10-10');
  assert.equal(dateLink('2026-10-10', f({ dateFormat: 'long', fileDate: 'iso' })), '[[2026-10-10|10 Oct 2026]]', 'the link shows the date, targets the file');
  assert.equal(dateLink('2026-10-10', f({ links: 'md', fileDate: 'compact' })), '[2026-10-10](20261010.md)');
  assert.equal(cleanMarkdown({ dateFormat: 'custom', datePattern: 'x'.repeat(200) }).datePattern.length, 60);
  assert.deepEqual(storedMarkdown(cleanMarkdown({ dateFormat: 'iso', datePattern: 'YYYY' })), null, 'a pattern only with Custom');
  // the export's day notes take the file date; a reflection's case link shows the date
  const files = exportNotes({ cases: cases.slice(0, 1), reflections: [{ id: 'r', caseId: 'a', date: '2026-10-10', title: 'T', points: [] }], m: { caseNotes: 'day', fileDate: 'compact', dateFormat: 'long' } });
  assert.ok(files.some(x => x.path === 'Cases/2026-10/20261010.md'), files.map(x => x.path).join());
  assert.ok(files.find(x => x.path.startsWith('Reflections/')).text.includes('Case: [[Cases/2026-10/20261010|10 Oct 2026]]'));
}
console.log('markdown styles and dates: ok');

// under each case (log2 15): reflections None / Link / Embed / Full text, linked notes None / Full text
{
  const c = { id: 'u1', date: '2026-10-10', initials: 'ZZ', details: 'fake case', createdAt: 1 };
  const r = { id: 'ur', caseId: 'u1', date: '2026-10-10', title: 'Fake title', summary: 'Fake summary.', status: 'complete', points: [{ heading: 'Point', text: 'Fake text.' }] };
  const n = { id: 'un', date: '2026-10-10', title: 'Fake linked', body: 'fake body', caseId: 'u1', createdAt: 2 };
  const day = { id: 'ud', date: '2026-10-10', title: 'Fake day note', body: 'day body', createdAt: 3 };
  const ctx = { reflectionsOf: x => (x.id === 'u1' ? [r] : []), notesOf: x => (x.id === 'u1' ? [n] : []), reflPath: () => 'Reflections/2026-10/Fake.md' };
  assert.equal(mdDay('2026-10-10', [c], null, ctx), '2026-10-10\n1. ZZ\nfake case', 'None by default');
  assert.equal(mdDay('2026-10-10', [c], { reflInDay: 'link' }, ctx), '2026-10-10\n1. ZZ\nfake case\n\nReflection: [[Reflections/2026-10/Fake|Fake title]]');
  assert.equal(mdCase(c, { reflInDay: 'embed' }, ctx), '2026-10-10\nZZ\nfake case\n\n![[Reflections/2026-10/Fake]]');
  assert.equal(mdCase(c, { reflInDay: 'embed', links: 'md' }, ctx), '2026-10-10\nZZ\nfake case\n\nReflection: [Fake title](Reflections/2026-10/Fake.md)', 'Markdown links cannot embed');
  const full = mdCase(c, { reflInDay: 'link' }, { ...ctx, reflPath: () => '' });
  assert.ok(full.includes('\n\n### Fake title\n\n') && full.includes('#### Point\n\nFake text.') && !full.includes('---'), 'no note: the full text, headings down two, no front matter: ' + full);
  // linked notes: under the case, and out of the day's Notes
  const withNotes = mdDay('2026-10-10', [c], { notesInDay: 'full' }, ctx, [n, day]);
  assert.ok(withNotes.startsWith('2026-10-10\n1. ZZ\nfake case\n\n##### Fake linked\nfake body'), withNotes);
  assert.equal((withNotes.match(/Fake linked/g) || []).length, 1, 'once');
  assert.ok(withNotes.includes('## Notes\n\n### Fake day note'), 'the day note stays in Notes');
  // the export links each case's reflection to its note
  const files = exportNotes({ cases: [c], reflections: [r], notes: [], m: { reflInDay: 'embed' } });
  const month = files.find(x => x.path === 'Cases/2026-10.md').text, rp = files.find(x => x.path.startsWith('Reflections/')).path;
  assert.ok(month.includes(`![[${rp.replace(/\.md$/, '')}]]`), month);
}
console.log('markdown under case: ok');
