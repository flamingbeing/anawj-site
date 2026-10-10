// Run with: node logbook/test/profile.test.mjs  (made-up profile only)
// Optional: PORTFOLIO_TEMPLATE=blank.docx also fills a real blank APMES template and reads it back;
// PORTFOLIO_OUT=out.docx writes that export (with made-up reflections) for a visual check.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { SECTIONS, PROFILE_FIELDS, emptyProfile, cleanProfile, parseSection1, dmyToIso, isoToDmy, parseSex, MAX_ITEMS } from '../js/profile.js';
import { fillSection1Xml, exportPortfolio, plainDocumentXml } from '../js/portfolio.js';

const JSZip = createRequire(import.meta.url)('../vendor/jszip.min.js');

// ---- cleanProfile ----
const e = emptyProfile();
assert.equal(Object.keys(e).length, PROFILE_FIELDS.length + SECTIONS.length + 1);
assert.ok(Object.keys(e).length <= 30, 'rules allow at most 30 keys');
assert.deepEqual(cleanProfile(null), e);
assert.deepEqual(cleanProfile('x'), e);
const dirty = cleanProfile({ familyName: 'x'.repeat(3000), postgrad: 'y'.repeat(5000), projectRemarks: 'z'.repeat(5000), sex: 'X', dob: '3/1/95',
  residencyStart: '2020-07-01', nric: 'S123', program: 42,
  awards: [...Array.from({ length: 50 }, (_, i) => ({ date: String(i), title: 't', purpose: 'p', extra: 'no' })), null, 'str'],
  papers: [{ authors: '', title: ' ', journal: '' }, { authors: 'A', title: 'x'.repeat(2500) }] });
assert.equal(dirty.familyName.length, 2000);
assert.equal(dirty.postgrad.length, 4000);
assert.equal(dirty.projectRemarks.length, 4000);
assert.equal(dirty.sex, '');
assert.equal(dirty.dob, '', 'dates must be ISO');
assert.equal(dirty.residencyStart, '2020-07-01');
assert.equal(dirty.program, '42');
assert.equal(dirty.nric, undefined);
assert.equal(dirty.awards.length, MAX_ITEMS);
assert.deepEqual(Object.keys(dirty.awards[0]), ['date', 'title', 'purpose']);
assert.equal(dirty.papers.length, 1, 'empty rows dropped');
assert.equal(dirty.papers[0].title.length, 2000);
assert.equal(dirty.papers[0].journal, '');
assert.equal(dmyToIso('03/01/1995'), '1995-01-03');
assert.equal(dmyToIso('3.1.95'), '1995-01-03');
assert.equal(dmyToIso('2001-02-03'), '2001-02-03');
assert.equal(dmyToIso('32/01/1995'), '');
assert.equal(isoToDmy('1995-01-03'), '03/01/1995');
assert.equal(parseSex('☐  Male    ☒  Female (please tick)'), 'F');
assert.equal(parseSex('☑ Male ☐ Female'), 'M');
assert.equal(parseSex('☐  Male    ☐  Female (please )'), '');
assert.equal(parseSex('Female'), 'F');
assert.equal(parseSex('male'), 'M');

// ---- a made-up profile ----
const FAKE = cleanProfile({
  familyName: 'Testperson', givenName: 'Alex Q', sex: 'F', dob: '1995-01-03', graduation: '12/06/2018, University of Nowhere',
  postgrad: 'MMed (Anaesthesiology) 01/02/2024\nFANZCA (part 1) 03/04/2025', program: 'Made-up Residency Program', programDirector: 'Dr Imaginary Director',
  residencyStart: '2020-07-01', seniorStart: '2023-07-01',
  memberships: Array.from({ length: 8 }, (_, i) => ({ year: String(2020 + i), post: `Post ${i}`, org: `Society <${i}> & Co`, achievements: i === 2 ? 'Line one\nLine two' : '' })),
  awards: [{ date: '01/2024', title: 'Fake prize', purpose: 'Best poster' }],
  scholarships: [{ date: '2023', title: 'Pretend scholarship', purpose: 'Travel' }],
  electives: [{ period: 'Jan–Mar 2025', duration: '3 months', department: 'Anaesthesia', institution: 'Imaginary Hospital', country: 'Elsewhere', purpose: 'Regional blocks' }],
  projects: Array.from({ length: 9 }, (_, i) => ({ date: `2024-0${i % 9 + 1}`, title: `Study ${i}`, coworkers: 'A, B', completion: i % 2 ? 'Ongoing' : '2025' })),
  projectRemarks: 'Remark line 1\nRemark line 2\n\nRemark line 4\nline 5\nline 6\nline 7',
  papers: [{ authors: 'Testperson A, Other B', title: 'A made-up paper', journal: 'J Imag 2025;1:1-2' }],
  courses: Array.from({ length: 22 }, (_, i) => ({ dateVenue: `0${i % 9 + 1}/2025, Venue ${i}`, details: `Course ${i}` })),
  teaching: [{ year: 'SR1', summary: 'Taught interns airway, 1 h' }, { year: 'SR2', summary: 'Nursing talk' }],
});

// plain layout carries the personal details
const plain = plainDocumentXml([], { name: 'Alex', profile: FAKE });
assert.match(plain, /PERSONAL DETAILS/);
assert.match(plain, /Testperson/);
assert.match(plain, /Society &lt;3&gt; &amp; Co/);

// ---- the real blank template (local only; never committed) ----
const TPL = process.env.PORTFOLIO_TEMPLATE;
if (TPL && existsSync(TPL)) {
  const zip = await JSZip.loadAsync(readFileSync(TPL));
  const xml = await zip.file('word/document.xml').async('string');
  const { xml: out, found } = fillSection1Xml(xml, FAKE, { name: 'Ignored Name' });
  assert.deepEqual(found.cover.sort(), ['name', 'program', 'residencyStart', 'seniorStart']);
  assert.ok(found.personal && found.remarks, 'personal details and remarks tables found');
  assert.deepEqual(found.lists.sort(), SECTIONS.map(s => s.key).sort(), 'every list table found');
  const back = parseSection1(out);
  assert.deepEqual(back, FAKE, 'round trip');
  const txt = out.replace(/<[^>]+>/g, '');
  assert.match(txt, /Resident’s name\s*:\s*Alex Q Testperson/);
  assert.match(txt, /Commencement\s*Date of Residency\s*:\s*01\/07\/2020/);
  assert.match(txt, /Date of\s*:\s*01\/07\/2023/);
  assert.match(txt, /☐\s*Male\s*☒\s*Female/);
  assert.match(out, /<w14:checked w14:val="1"\/>/);
  // a blank template reads back as an empty profile; name falls back when the profile has none
  assert.deepEqual(parseSection1(xml), emptyProfile());
  assert.match(fillSection1Xml(xml, {}, { name: 'Fallback Name' }).xml.replace(/<[^>]+>/g, ''), /Resident’s name\s*:\s*Fallback Name/);
  assert.equal(fillSection1Xml(xml, {}).xml, xml, 'empty profile leaves the template unchanged');
  // through exportPortfolio
  const blob = await exportPortfolio([{ id: 'r1', headingId: 'thyroid', initials: 'ZZ', date: '2025-03-04', diagnosis: 'Made-up', sections: { description: 'Fake' } }],
    { name: 'Alex', templateB64: readFileSync(TPL).toString('base64'), JSZip, profile: FAKE });
  assert.ok(blob.usedTemplate);
  const z2 = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
  const x2 = await z2.file('word/document.xml').async('string');
  assert.deepEqual(parseSection1(x2), FAKE, 'round trip through the export');
  assert.doesNotMatch(x2, /commentReference|commentRangeStart/);
  if (process.env.PORTFOLIO_OUT) writeFileSync(process.env.PORTFOLIO_OUT, Buffer.from(await blob.arrayBuffer()));
  console.log('template round trip ok');
}
console.log('profile tests passed');
