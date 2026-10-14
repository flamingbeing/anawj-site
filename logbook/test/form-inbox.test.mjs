// Run with: node logbook/test/form-inbox.test.mjs  (fake cases only)
import assert from 'node:assert/strict';
import { entryToCase, mergeFormEntries, formCaseId, maskIds, pickupMessage } from '../js/form-inbox.js';
import { cleanCase } from '../js/clean.js';

const NOW = 1_800_000_000_000;
const LSCS = '16) Lower Segment Caesarean Section (10 | 20)', SPINAL = '17) Obstetrics Spinal/ Epidural/ CSE (10 | 40)';
const entry = (id, extra = {}) => ({ id, email: 'alice@example.com', date: '2026-03-04', details: 'AB 34F elective LSCS spinal', labels: [LSCS + ', ' + SPINAL], submittedAt: NOW - 5000, ...extra });

// one response -> a case: initials split off, labels to codes, source 'form', stable id
{
  const r = entryToCase(entry('2_ABC'), NOW);
  assert.equal(r.case.id, formCaseId('2_ABC'));
  assert.equal(r.case.initials, 'AB');
  assert.equal(r.case.details, '34F elective LSCS spinal');
  assert.deepEqual(r.case.cats, ['16', '17']);
  assert.equal(r.case.date, '2026-03-04');
  assert.equal(r.case.source, 'form');
  assert.equal(r.case.importKey, `form:2_ABC@${NOW}`);
  assert.equal(r.case.createdAt, NOW - 5000);
  assert.equal(r.masked, false);
  // what the case looks like once cleaned for saving keeps everything (and fits the rules' fields)
  const saved = cleanCase(r.case, NOW);
  assert.equal(saved.source, 'form');
  assert.equal(saved.importKey, r.case.importKey);
  // separate label answers (the sub-category questions) work too, repeats count once
  assert.deepEqual(entryToCase(entry('x', { labels: [LSCS, SPINAL, LSCS] }), NOW).case.cats, ['16', '17']);
}

// identifiers removed; unknown tags noted in the details; a date that isn't one kept as text
{
  assert.equal(maskIds('AB S1234567D 45M'), 'AB [ID removed] 45M');
  assert.equal(maskIds('AB 45M MRN 12345678'), 'AB 45M MRN [ID removed]');
  assert.equal(maskIds('AB 45M 120kg'), 'AB 45M 120kg');
  const r = entryToCase(entry('y', { details: 'CD 60M S1234567D TKR', labels: ['77) Nonsense'], date: null, dateText: 'last Tuesday' }), NOW);
  assert.equal(r.masked, true);
  assert.equal(r.case.initials, 'CD');
  assert.match(r.case.details, /\[ID removed\]/);
  assert.doesNotMatch(r.case.details, /S1234567D/);
  assert.match(r.case.details, /Form tags not recognised: 77\) Nonsense/);
  assert.deepEqual(r.unknown, ['77) Nonsense']);
  assert.equal(r.case.date, null);
  assert.equal(r.case.dateText, 'last Tuesday');
  assert.equal(entryToCase(entry('z', { date: 'not a date', dateText: undefined }), NOW).case.dateText, 'not a date');
}

// merging the inbox with the logbook
{
  // new responses: saved, all entries leave the inbox
  const r = mergeFormEntries([entry('a'), entry('b'), null, { email: 'x' }], {}, NOW);
  assert.deepEqual(r.save.map(c => c.id), [formCaseId('a'), formCaseId('b')]);
  assert.deepEqual(r.done, ['a', 'b']);
  assert.equal(pickupMessage(r), '2 cases from the Google Form added to your logbook.');

  // an edited response replaces the case the Form wrote, keeping what the app added
  const had = cleanCase({ ...entryToCase(entry('a'), NOW).case, reflectionId: 'refl1', reflectTag: true }, NOW + 3);   // saving stamps a moment later
  const later = NOW + 86400000;
  const r2 = mergeFormEntries([entry('a', { details: 'AB 34F emergency LSCS GA', submittedAt: later - 1000 })], new Map([[had.id, had]]), later);
  assert.equal(r2.save.length, 1);
  assert.equal(r2.save[0].details, '34F emergency LSCS GA');
  assert.equal(r2.save[0].createdAt, had.createdAt);
  assert.equal(r2.save[0].reflectionId, 'refl1');
  assert.equal(r2.save[0].reflectTag, true);
  assert.equal(r2.save[0].importKey, `form:a@${later}`);

  // ... unless the resident changed it in the app since: theirs stays, the entry still leaves the inbox
  const edited = { ...had, details: 'my own words', updatedAt: NOW + 60000 };
  const r3 = mergeFormEntries([entry('a', { details: 'AB 34F emergency LSCS GA' })], { [had.id]: edited }, later);
  assert.deepEqual(r3.save, []);
  assert.deepEqual(r3.kept, ['a']);
  assert.deepEqual(r3.done, ['a']);
  assert.equal(pickupMessage(r3), '1 edited Form response left as you changed it here.');

  // a case with that id that the Form didn't write is never replaced
  const r4 = mergeFormEntries([entry('a')], { [formCaseId('a')]: { id: formCaseId('a'), updatedAt: 1 } }, later);
  assert.deepEqual(r4.kept, ['a']);

  // the message mentions removed IDs and tags to check; nothing to say when nothing happened
  const r5 = mergeFormEntries([entry('m', { details: 'EF 70F S1234567D', labels: ['zz'] })], {}, NOW);
  assert.equal(pickupMessage(r5), '1 case from the Google Form added to your logbook; an ID number was removed from 1; 1 with a tag to check.');
  assert.equal(pickupMessage(mergeFormEntries([], {}, NOW)), '');
}

console.log('form-inbox tests passed');
