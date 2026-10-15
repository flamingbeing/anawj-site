// Run with: node logbook/test/sheet-outbox.test.mjs  (fake data only)
// What a new app case sends to the response sheet's outbox (js/sheet-outbox.js).
import assert from 'node:assert/strict';
import { outboxEntry, outboxEntries, SHEET_OUTBOX_ON, SHEET_OUTBOX_SINCE, outboxOn, setOutboxOn } from '../js/sheet-outbox.js';

const who = { email: 'Fake.Person@Example.com', rid: '202301' };
const c = { id: 'k1', date: '2026-10-14', initials: 'AB', details: '34F elective LSCS spinal', cats: ['16', '28'], createdAt: Date.parse('2026-10-15T03:20:00Z'), updatedAt: 5, source: 'app', tags: ['x'], reflectTag: true };

{
  const e = outboxEntry(c, who);
  assert.deepEqual(e, { id: 'k1', email: 'fake.person@example.com', rid: '202301', date: '2026-10-14', initials: 'AB',
    details: '34F elective LSCS spinal', cats: ['16', '28'], createdAt: Date.parse('2026-10-15T03:20:00Z') });
  assert.ok(!('tags' in e) && !('updatedAt' in e) && !('source' in e), 'only what the sheet needs');
}
// identifiers never leave the logbook
assert.equal(outboxEntry({ ...c, details: 'S1234567D 34F hip, MRN 123456789' }, who).details, '[ID removed] 34F hip, MRN [ID removed]');
// pasted cases go too; Form cases, imported rows and unknown sources do not
assert.ok(outboxEntry({ ...c, source: 'paste' }, who));
assert.equal(outboxEntry({ ...c, source: 'form' }, who), null);
assert.equal(outboxEntry({ ...c, source: 'import' }, who), null);
assert.equal(outboxEntry({ ...c, source: 'sheet' }, who), null);
// not a programme resident (no rid): nothing
assert.equal(outboxEntry(c, { email: who.email, rid: null }), null);
assert.equal(outboxEntry(c, null), null);
assert.equal(outboxEntry(null, who), null);
// no date: the typed date text goes along
{
  const e = outboxEntry({ ...c, date: null, dateText: 'last Tue' }, who);
  assert.equal(e.date, null); assert.equal(e.dateText, 'last Tue');
}
// limits the rules check
{
  const e = outboxEntry({ ...c, initials: 'X'.repeat(30), details: 'y'.repeat(3000), cats: ['01', '01', ...Array.from({ length: 50 }, (_, i) => String(i))] }, who);
  assert.equal(e.initials.length, 20); assert.equal(e.details.length, 2000); assert.ok(e.cats.length <= 40); assert.equal(new Set(e.cats).size, e.cats.length);
}
assert.equal(outboxEntries([c, { ...c, id: 'k2', source: 'form' }, { ...c, id: 'k3', source: 'paste' }], who).map(e => e.id).join(), 'k1,k3');
// only cases made since the outbox went live (14 Oct 2026): an older app case restored from the recycle bin has no
// "app:<id>" row in the sheet, so it would arrive late or twice
assert.equal(SHEET_OUTBOX_SINCE, Date.parse('2026-10-14T14:15:00Z'), 'the go-live instant (22:15 Singapore time), not the start of the day');
assert.equal(outboxEntry({ ...c, createdAt: Date.parse('2026-10-13T23:59:59Z') }, who), null);
assert.equal(outboxEntry({ ...c, createdAt: Date.parse('2026-10-14T03:20:00Z') }, who), null, 'that morning, before it went live');
assert.equal(outboxEntry({ ...c, createdAt: Date.parse('2026-03-01T00:00:00Z'), source: 'paste' }, who), null);
assert.ok(outboxEntry({ ...c, createdAt: SHEET_OUTBOX_SINCE }, who));
assert.ok(outboxEntry({ ...c, createdAt: Date.parse('2027-01-05T00:00:00Z') }, who));
// no createdAt: a case made now (as before)
{ const t0 = Date.now(), e = outboxEntry({ ...c, createdAt: undefined }, who); assert.ok(e && e.createdAt >= t0); }
// on once the sheet script is installed (14 Oct 2026); the tests can still switch it
assert.equal(SHEET_OUTBOX_ON, true);
assert.equal(outboxOn(), true);
setOutboxOn(false); assert.equal(outboxOn(), false); setOutboxOn(null); assert.equal(outboxOn(), true);
console.log('PASS sheet-outbox');
