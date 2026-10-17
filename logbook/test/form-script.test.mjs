// Run with: node logbook/test/form-script.test.mjs  (fake answers only)
// The Google Form's Apps Script (form-script/Code.gs): what it sends must be what form-inbox.js and the rules expect.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { mergeFormEntries } from '../js/form-inbox.js';

const src = fs.readFileSync(new URL('../form-script/Code.gs', import.meta.url), 'utf8');
const sandbox = { module: { exports: {} } };
vm.runInNewContext(src, sandbox);
const { entryFrom, firestoreFields } = sandbox.module.exports;
const plain = o => JSON.parse(JSON.stringify(o));

const LSCS = '16) Lower Segment Caesarean Section (10 | 20)', SPINAL = '17) Obstetrics Spinal/ Epidural/ CSE (10 | 40)';
const answers = [
  { title: 'Resident', type: 'LIST', value: 'Fake Person (202301)' },
  { title: 'Date of case', type: 'DATE', value: '2026-10-14' },
  { title: 'Initials, case details', type: 'PARAGRAPH_TEXT', value: 'AB 34F elective LSCS spinal' },
  { title: 'Category', type: 'CHECKBOX', value: [LSCS, SPINAL] },
  { title: 'Paediatric surgery', type: 'CHECKBOX', value: [] },
  { title: 'Comments', type: 'TEXT', value: 'not the case text' },
];

{
  const e = plain(entryFrom('2_FakeResponse-1', 'Fake.Person@Example.com', 1760400000000, answers));
  assert.deepEqual(e, { id: '2_FakeResponse-1', email: 'fake.person@example.com', date: '2026-10-14',
    details: 'AB 34F elective LSCS spinal', labels: [LSCS, SPINAL], submittedAt: 1760400000000 });
  // the resident's name answer is never sent
  assert.doesNotMatch(JSON.stringify(e), /Fake Person/);
  // what the logbook makes of it
  const r = mergeFormEntries([e], {}, 1760400001000);
  assert.deepEqual(r.save[0].cats, ['16', '17']);
  assert.equal(r.save[0].initials, 'AB');
  // keys and sizes the rules allow (validFormEntry)
  assert.ok(Object.keys(e).every(k => ['id', 'email', 'date', 'dateText', 'details', 'labels', 'submittedAt'].includes(k)));
  // Firestore REST encoding
  assert.deepEqual(plain(firestoreFields(e)), {
    id: { stringValue: '2_FakeResponse-1' }, email: { stringValue: 'fake.person@example.com' }, date: { stringValue: '2026-10-14' },
    details: { stringValue: 'AB 34F elective LSCS spinal' },
    labels: { arrayValue: { values: [{ stringValue: LSCS }, { stringValue: SPINAL }] } }, submittedAt: { integerValue: '1760400000000' },
  });
  assert.deepEqual(plain(firestoreFields({ date: null })), { date: { nullValue: null } });
}

// no titled details question: the first text answer; a date that isn't one: kept as text; labels in a dropdown
{
  const e = plain(entryFrom('r2', 'a@example.com', 1, [
    { title: 'Case', type: 'TEXT', value: 'CD 60M TKR' },
    { title: 'When', type: 'DATE', value: '' },
    { title: 'Type', type: 'MULTIPLE_CHOICE', value: '18) Orthopaedic Surgery (20 | 20)' },
  ]));
  assert.equal(e.details, 'CD 60M TKR');
  assert.equal(e.date, null);
  assert.equal(e.dateText, undefined);
  assert.deepEqual(e.labels, ['18) Orthopaedic Surgery (20 | 20)']);
}

// skipped: no email (the Form must collect verified emails), an id the rules wouldn't take
assert.match(entryFrom('r3', '', 1, answers).skip, /no respondent email/);
assert.match(entryFrom('r 3', 'a@example.com', 1, answers).skip, /response id/);
// long text and many labels are cut to what the rules allow
{
  const many = Array.from({ length: 60 }, (_, i) => `${String(10 + (i % 20)).padStart(2, '0')}${'i'.repeat(i % 3)}) x${i}`);
  const e = entryFrom('r4', 'a@example.com', 1, [{ title: 'Details', type: 'PARAGRAPH_TEXT', value: 'x'.repeat(3000) }, { title: 'Category', type: 'CHECKBOX', value: many }]);
  assert.equal(e.details.length, 2000);
  assert.equal(e.labels.length, 40);
}

// identifiers never leave the Form; a date question with a time; a typed "16)" isn't a category; "Other" in a
// category question is sent (the logbook notes it); the resident's name answer still isn't sent
{
  const e = plain(entryFrom('r5', 'a@example.com', 1, [
    { title: 'Resident', type: 'LIST', value: 'Fake Person (202301)' },
    { title: 'Date', type: 'DATETIME', value: '2026-10-14 08:30' },
    { title: 'Initials, case details', type: 'PARAGRAPH_TEXT', value: 'EF 70F S1234567D MRN 12345678 TKR' },
    { title: 'Remarks', type: 'TEXT', value: '16) not a pick' },
    { title: 'Category', type: 'CHECKBOX', value: [LSCS, 'Something else typed'] },
  ]));
  assert.equal(e.date, '2026-10-14');
  assert.equal(e.details, 'EF 70F [ID removed] MRN [ID removed] TKR');
  assert.deepEqual(e.labels, [LSCS, 'Something else typed']);
  assert.doesNotMatch(JSON.stringify(e), /Fake Person|S1234567D|12345678/);
  const r = mergeFormEntries([e], {}, 2);
  assert.match(r.save[0].details, /Form tags not recognised: Something else typed/);
}

// every top-level name is prefixed, so the script can sit beside another one (e.g. a sheet script with its own
// onFormSubmit) in the same Apps Script project without replacing or clashing with anything
{
  const names = [...src.matchAll(/^(?:function\s+(\w+)|(?:var|let|const)\s+(\w+))/gm)].map(m => m[1] || m[2]);
  assert.ok(names.length >= 10, 'found the top-level names');
  for (const n of names) assert.match(n, /^(LOGBOOK_|logbookInbox)/, `unprefixed top-level name: ${n}`);
  assert.doesNotMatch(src, /function onFormSubmit\b|function onOpen\b/);
}

// the backfill starts when the inbox went live (14 Oct 2026): responses before it came in with the workbook import, and
// sending them again could bring back an imported case the resident deleted once it has left the recycle bin
assert.match(src, /var SINCE = new Date\('2026-10-14T00:00:00\+08:00'\);/);

console.log('form-script tests passed');
