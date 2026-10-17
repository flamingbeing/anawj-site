// Run with: node logbook/test/form-inbox.test.mjs  (fake cases only)
import assert from 'node:assert/strict';
import { entryToCase, mergeFormEntries, formCaseId, maskIds, pickupMessage, pickUp, sameResponse, withoutFormCases, looksLikeImportOf, PICKUP_MAX } from '../js/form-inbox.js';
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
  assert.equal(r.case.importKey, `form:2_ABC~${NOW - 5000}@${NOW}`);   // the response's newest submit, then the write time
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
  assert.equal(r2.save[0].importKey, `form:a~${later - 1000}@${later}`);

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

// the same response from the workbook import (its timestamp read as UTC: +8 h in Singapore) and from the inbox
{
  const t = Date.UTC(2026, 9, 14, 2, 30, 15);   // 10:30:15 in Singapore
  assert.equal(sameResponse(t + 8 * 3600e3, t), true);
  assert.equal(sameResponse(t + 8 * 3600e3 + 400, t), true);    // ms rounding
  assert.equal(sameResponse(t, t), true);                        // a UTC sheet
  assert.equal(sameResponse(t + 5.5 * 3600e3, t), true);         // any whole quarter-hour zone
  assert.equal(sameResponse(t + 8 * 3600e3 + 5000, t), false);   // 5 s apart: another response
  assert.equal(sameResponse(t + 20 * 3600e3, t), false);
  assert.equal(sameResponse(undefined, t), false);
  const imported = { id: 'imp_x', source: 'import', date: '2026-03-04', details: 'old copy', cats: ['16'], createdAt: t + 8 * 3600e3, updatedAt: 1 };
  // backfill after an import: the inbox entry is dropped, not doubled
  const r = mergeFormEntries([entry('d1', { submittedAt: t })], [imported].reduce((m, c) => m.set(c.id, c), new Map()), NOW);
  assert.deepEqual(r.save, []);
  assert.deepEqual(r.dupes, ['d1']);
  assert.deepEqual(r.done, ['d1']);
  assert.equal(pickupMessage(r), '');
  // ... but a different day, or another second, is a different response
  assert.equal(mergeFormEntries([entry('d2', { submittedAt: t, date: '2026-03-05' })], { imp_x: imported }, NOW).save.length, 1);
  assert.equal(mergeFormEntries([entry('d3', { submittedAt: t + 7000 })], { imp_x: imported }, NOW).save.length, 1);
  // re-running the workbook import after the inbox: rows the inbox brought in are left out
  const formCase = { id: formCaseId('d4'), source: 'form', date: '2026-03-04', createdAt: t };
  const rows = [{ date: '2026-03-04', createdAt: t + 8 * 3600e3 }, { date: '2026-03-04', createdAt: t + 8 * 3600e3 + 60000 }];
  const w = withoutFormCases(rows, [formCase, imported]);
  assert.equal(w.dropped, 1);
  assert.deepEqual(w.rows, [rows[1]]);
  assert.deepEqual(withoutFormCases(rows, [imported]), { rows, dropped: 0 });
}

// a Form case the resident deleted (in the recycle bin) doesn't come back; the entry leaves the inbox
{
  const r = mergeFormEntries([entry('b1')], {}, NOW, { binned: [formCaseId('b1')] });
  assert.deepEqual(r.save, []);
  assert.deepEqual(r.gone, ['b1']);
  assert.deepEqual(r.done, ['b1']);
}

// the same response sent again unchanged (a backfill re-run): nothing to write
{
  const had = cleanCase(entryToCase(entry('u1'), NOW).case, NOW + 3);
  const r = mergeFormEntries([entry('u1')], { [had.id]: had }, NOW + 864e5);
  assert.deepEqual(r.save, []);
  assert.deepEqual(r.done, ['u1']);
}

// at most PICKUP_MAX per pick-up; the rest stay for next time
{
  const many = Array.from({ length: PICKUP_MAX + 7 }, (_, i) => entry('m' + i));
  const r = mergeFormEntries(many, {}, NOW);
  assert.equal(r.save.length, PICKUP_MAX);
  assert.equal(r.done.length, PICKUP_MAX);
  assert.equal(r.left, 7);
  assert.match(pickupMessage(r), /7 more next time/);
}

// a deleted Form case stays deleted once its bin entry has gone (30-day purge, Delete forever): the formGone list
{
  const r = mergeFormEntries([entry('g1'), entry('g2')], {}, NOW, { binned: [], gone: [formCaseId('g1')] });
  assert.deepEqual(r.gone, ['g1']);
  assert.deepEqual(r.save.map(c => c.id), [formCaseId('g2')]);
  assert.deepEqual(r.done, ['g1', 'g2']);
  // bin entries may be passed as the binned cases' data too
  assert.deepEqual(mergeFormEntries([entry('g3')], {}, NOW, { binned: [{ id: formCaseId('g3'), source: 'form' }] }).gone, ['g3']);
}

// an imported case the resident deleted (still in the bin) isn't brought back by the same response from the inbox
{
  const t = Date.UTC(2026, 9, 5, 3, 0, 0);
  const imp = { id: 'imp_k1', source: 'import', date: '2026-10-05', initials: 'AB', details: '34F elective LSCS spinal', cats: ['16', '17'], createdAt: t + 8 * 3600e3, updatedAt: 1 };
  const r = mergeFormEntries([entry('i1', { date: '2026-10-05', submittedAt: t })], {}, NOW, { binned: [imp] });
  assert.deepEqual(r.save, []);
  assert.deepEqual(r.gone, ['i1']);
  assert.equal(pickupMessage(r), '');   // (the same response: quietly)
  // A response that only has its day, initials and categories (an edit of it, a corrected copy sent after deleting a
  // wrong one, another patient) is added, as nothing in the logbook has it, and the toast points to the bin
  const later = mergeFormEntries([entry('i2', { date: '2026-10-05', details: 'AB 34F elective LSCS spinal (corrected)', submittedAt: t + 17 * 864e5 })], {}, NOW, { binned: [imp] });
  assert.deepEqual([later.save.map(c => c.id), later.gone, later.binLike], [[formCaseId('i2')], [], ['i2']]);
  assert.equal(pickupMessage(later), '1 case from the Google Form added to your logbook; it has the same day, initials and categories as a case in your recycle bin (if it is the case you deleted, delete it again).');
  const two = mergeFormEntries([entry('i3', { date: '2026-10-05', submittedAt: t + 864e5 }), entry('i4', { date: '2026-10-06' })], {}, NOW, { binned: [imp] });
  assert.match(pickupMessage(two), /^2 cases from the Google Form added to your logbook; 1 of them has the same day, initials and categories as a case in your recycle bin \(if it is the case/);
  // ... deleted again, it is a Form case: listed in formGone, it stays gone
  assert.deepEqual(mergeFormEntries([entry('i2', { date: '2026-10-05', submittedAt: t + 18 * 864e5 })], {}, NOW, { binned: [imp], gone: [formCaseId('i2')] }).gone, ['i2']);
}

// An old response (before the inbox, brought in by the workbook import) edited in the Form arrives with the edit's
// time: the imported case on that day with the same initials and categories is taken to be it, not added again
{
  const first = Date.UTC(2026, 9, 3, 2, 30, 15);   // 10:30:15 in Singapore, 3 Oct
  const imp = { id: 'imp_abc~00230', source: 'import', date: '2026-10-03', initials: 'AB', details: '34F elective LSCS spinal', cats: ['16', '17'], createdAt: first + 8 * 3600e3, updatedAt: 1 };
  const edited = entry('o1', { date: '2026-10-03', details: 'AB 34F elective LSCS spinal, block top-up', submittedAt: Date.UTC(2026, 9, 20, 5, 0, 0) });
  const r = mergeFormEntries([edited], { [imp.id]: imp }, NOW);
  assert.deepEqual(r.save, []);
  assert.deepEqual(r.dupes, ['o1']);
  assert.deepEqual(r.similar, ['o1']);
  assert.deepEqual(r.done, ['o1']);
  assert.equal(pickupMessage(r), '1 Form response not added: your logbook already has a case with the same day, initials and categories (if it was another patient, log it here in the app: the Form would skip it again).');
  // an older imported case without the initials field (initials at the front of the details) matches too
  const oldImp = { ...imp, initials: undefined, details: 'AB 34F elective LSCS spinal' };
  delete oldImp.initials;
  assert.equal(mergeFormEntries([edited], { [imp.id]: oldImp }, NOW).similar.length, 1);
  // anything else is another case: other initials, other categories, another day, no initials, or a response sent
  // before the imported one
  const added = e => mergeFormEntries([e], { [imp.id]: imp }, NOW).save.length;
  assert.equal(added({ ...edited, details: 'CD 34F elective LSCS spinal' }), 1);
  assert.equal(added({ ...edited, labels: [LSCS] }), 1);
  assert.equal(added({ ...edited, date: '2026-10-04' }), 1);
  assert.equal(added({ ...edited, details: '34F elective LSCS spinal' }), 1);
  assert.equal(added({ ...edited, submittedAt: first - 864e5 }), 1);
  // only imported cases count (a case logged in the app or another Form response is another case)
  assert.equal(looksLikeImportOf({ ...imp, source: 'app' }, edited, entryToCase(edited, NOW).case), false);
  assert.equal(looksLikeImportOf(imp, edited, entryToCase(edited, NOW).case), true);
  // the same response unedited is still matched by its time, quietly
  const same = mergeFormEntries([entry('o2', { date: '2026-10-03', submittedAt: first })], { [imp.id]: imp }, NOW);
  assert.deepEqual([same.dupes, same.similar, pickupMessage(same)], [['o2'], [], '']);
}

// A Form case's response edited later: the key notes the newest submit, so a re-run of the workbook import (whose sheet
// row now carries the edit's time) leaves that row out, even when the case is kept as the resident changed it in the app
{
  const H8 = 8 * 3600e3, sub = Date.UTC(2026, 9, 16, 1, 0, 0), edit = Date.UTC(2026, 9, 17, 1, 0, 0), later = edit + 60e3;
  const had = cleanCase(entryToCase(entry('e1', { date: '2026-10-16', submittedAt: sub }), sub + 60e3).case, sub + 60e3);
  const row = { date: '2026-10-16', createdAt: edit + H8 };
  assert.equal(withoutFormCases([row], [had]).dropped, 0);   // (before the edit is picked up: not known yet)
  // the edit replaces the Form case: createdAt stays the first submit, the key notes the edit
  const r = mergeFormEntries([entry('e1', { date: '2026-10-16', details: 'AB 34F emergency LSCS GA', submittedAt: edit })], { [had.id]: had }, later);
  assert.equal(r.save.length, 1);
  assert.equal(r.save[0].createdAt, sub);
  const now1 = cleanCase(r.save[0], later + 5);
  assert.deepEqual(withoutFormCases([row, { date: '2026-10-16', createdAt: sub + H8 }], [now1]).dropped, 2);   // edit or first submit
  // kept as the app has it: nothing replaced, the key's write time kept (still the resident's), the newest submit noted
  const mine = { ...had, details: 'my own words', updatedAt: sub + 3600e3 };
  const k = mergeFormEntries([entry('e1', { date: '2026-10-16', details: 'AB changed on the Form', submittedAt: edit })], { [had.id]: mine }, later);
  assert.deepEqual([k.save, k.kept], [[], ['e1']]);
  assert.deepEqual(k.mark, [{ id: had.id, importKey: `form:e1~${edit}@${sub + 60e3}`, updatedAt: later }]);
  const marked = { ...mine, importKey: k.mark[0].importKey, updatedAt: k.mark[0].updatedAt };
  assert.equal(withoutFormCases([row], [marked]).dropped, 1);
  // ... and it stays the resident's: the next edit is kept too, and the same edit again needs nothing
  assert.deepEqual(mergeFormEntries([entry('e1', { submittedAt: edit + 864e5 })], { [had.id]: marked }, later + 864e5).kept, ['e1']);
  assert.deepEqual(mergeFormEntries([entry('e1', { date: '2026-10-16', details: 'AB changed on the Form', submittedAt: edit })], { [had.id]: marked }, later + 1).mark, []);
  // the same content sent with a newer submit time (a field the logbook doesn't keep was edited): the key is updated
  const same = mergeFormEntries([entry('e1', { date: '2026-10-16', submittedAt: edit })], { [had.id]: had }, later);
  assert.equal(same.save.length, 1);
  assert.match(same.save[0].importKey, new RegExp(`^form:e1~${edit}@`));
  // an older copy than the case has (two quick edits sent out of order) changes nothing
  const old = mergeFormEntries([entry('e1', { date: '2026-10-16', details: 'AB first words', submittedAt: sub })], { [now1.id]: now1 }, later + 2);
  assert.deepEqual([old.save, old.kept, old.done], [[], [], ['e1']]);
  // a case written before the key noted the submit ('form:<id>@<ms>'): an edit is still told apart from a re-send
  const legacy = { ...had, importKey: `form:e1@${sub + 60e3}` };
  assert.equal(mergeFormEntries([entry('e1', { date: '2026-10-16', submittedAt: sub })], { [had.id]: legacy }, later).save.length, 0);
  assert.equal(mergeFormEntries([entry('e1', { date: '2026-10-16', submittedAt: edit })], { [had.id]: legacy }, later).save.length, 1);
}

// The toast tells only what reached the server: a pick-up whose commits are refused (another device took the entries, a
// lost connection) says nothing, and the entries wait for the next one
{
  const sub = Date.UTC(2026, 9, 15, 1, 0, 0);
  const had = cleanCase(entryToCase(entry('k1', { date: '2026-10-15', submittedAt: sub }), sub + 60e3).case, sub + 60e3);
  const mine = { ...had, details: 'my own words', updatedAt: sub + 3600e3 };
  const t = Date.UTC(2026, 9, 5, 3, 0, 0);
  const imp = { id: 'imp_k2', source: 'import', date: '2026-10-05', initials: 'AB', details: '34F elective LSCS spinal', cats: ['16', '17'], createdAt: t + 8 * 3600e3, updatedAt: 1 };
  const es = [entry('k1', { date: '2026-10-15', submittedAt: sub + 864e5 }), entry('n1', { details: 'CD 12345678 new' }), entry('s1', { date: '2026-10-05', submittedAt: t + 864e5 })];
  const io = ok => ({ listBin: async () => [], listFormGone: async () => [], commitFormPickup: async (_, items) => items.map(it => it.id).filter(ok) });
  const none = await pickUp(io(() => false), 'alice@example.com', es, { cases: () => [mine, imp], now: NOW });
  assert.deepEqual([none.save, none.done, none.kept, none.similar, none.mark, none.masked], [[], [], [], [], [], 0]);
  assert.equal(pickupMessage(none), '');
  const all = await pickUp(io(() => true), 'alice@example.com', es, { cases: () => [mine, imp], now: NOW });
  assert.deepEqual([all.save.map(c => c.id), all.kept, all.similar, all.mark.map(m => m.id), all.masked], [[formCaseId('n1')], ['k1'], ['s1'], [had.id], 1]);
  assert.match(pickupMessage(all), /^1 case from the Google Form added to your logbook; 1 edited Form response left as you changed it here; 1 Form response not added: .*; an ID number was removed from 1\.$/);
  // only some committed: only those are told
  const some = await pickUp(io(id => id === 'n1'), 'alice@example.com', es, { cases: () => [mine, imp], now: NOW });
  assert.deepEqual([some.save.length, some.kept, some.similar, some.mark], [1, [], [], []]);
}

console.log('form-inbox tests passed');
