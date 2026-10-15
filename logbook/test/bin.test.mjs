// Run with: node logbook/test/bin.test.mjs  (demo backend, fake data only)
import assert from 'node:assert/strict';
globalThis.location = { search: '?demo' };
// Device recovery storage: explicit in-memory browser adapter for this Node test.
const device = new Map();
globalThis.localStorage = { getItem: k => device.get(k) || null, setItem: (k,v) => { device.set(k,String(v)); Object.defineProperty(localStorage,k,{value:String(v),configurable:true,enumerable:true}); }, removeItem: k => { device.delete(k); delete localStorage[k]; } };
const cloud = await import('../js/cloud.js');
const { resetDemo, DEMO_USER, sheetOutbox } = await import('../js/demo-backend.js');
const { S, setCases, resetCaches, createCase, writes } = await import('../js/ui-core.js');
const B = await import('../js/bin.js');

const DAY = 864e5, now = Date.parse('2026-03-01T00:00:00Z');
// pure helpers
assert.equal(B.daysAgo(now - 3 * DAY, now), 3);
assert.equal(B.daysLeft(now - 3 * DAY, now), 27);
assert.equal(B.binLabel({ deletedAt: now - 3 * DAY }, now), 'deleted 3 days ago · 27 days left');
assert.equal(B.binLabel({ deletedAt: now }, now), 'deleted today · 30 days left');
assert.equal(B.isExpired({ deletedAt: now - 31 * DAY }, now), true);
assert.equal(B.isExpired({ deletedAt: now - 29 * DAY }, now), false);
assert.equal(B.isExpired({}, now), true);
assert.deepEqual(B.imageIdsOf({ kind: 'reflection', data: { figures: [{ id: 'i1' }, { id: 'i2' }] } }), ['i1', 'i2']);
assert.deepEqual(B.imageIdsOf({ kind: 'case', data: {} }), []);
assert.throws(() => B.binEntry('summary', {}));
const e0 = B.binEntry('case', { id: 'x1', date: '2026-01-02', details: 'AB 5yo tonsil', cats: ['10'], junk: 1 }, now);
assert.equal(e0.kind, 'case'); assert.equal(e0.data.id, 'x1'); assert.equal(e0.data.junk, undefined); assert.ok(e0.id.startsWith('c_x1_'));

// case: delete -> bin -> restore
resetDemo({ seeded: true });
const email = DEMO_USER.email;
S.user = { ...DEMO_USER };
setCases(await cloud.listCases(email));
const before = S.cases.length;
const victim = S.cases[0];
const entry = await B.moveToBin('case', victim);
assert.equal(S.cases.length, before - 1, 'gone from S.cases');
assert.equal((await cloud.listCases(email)).length, before - 1, 'gone from store');
let bin = await cloud.listBin(email);
assert.equal(bin.length, 1); assert.equal(bin[0].data.details, victim.details);
const back = await B.restoreFromBin(entry.id);
assert.equal(back.id, victim.id, 'same id when free');
assert.equal(S.cases.length, before);
assert.equal((await cloud.listCases(email)).length, before);
assert.equal((await cloud.listBin(email)).length, 0);

// restoring when the id is taken gives a new id
const e2 = await B.moveToBin('case', victim);
await cloud.saveCase(email, victim); setCases(await cloud.listCases(email));
const back2 = await B.restoreFromBin(e2.id);
assert.notEqual(back2.id, victim.id);
assert.equal((await cloud.listCases(email)).length, before + 1);

// bulk
const two = S.cases.slice(0, 2);
const es = await B.moveToBin('case', two);
assert.equal(es.length, 2);
assert.equal(S.cases.length, before - 1);
assert.equal((await cloud.listBin(email)).length, 2);

// reflection with figures: images kept until purge
await cloud.saveImage(email, { id: 'img1', data: 'QUJD', mime: 'image/jpeg', w: 1, h: 1, createdAt: 1 });
const r = await cloud.saveReflection(email, { id: 'r1', headingId: 'thyroid', initials: 'AB', title: 'Made-up', figures: [{ id: 'img1', caption: 'x', point: null }], status: 'draft' });
S.reflections = [r];
const re = await B.moveToBin('reflection', r);
assert.equal(S.reflections.length, 0);
assert.ok(await cloud.loadImage(email, 'img1'), 'image kept while binned');
// age the reflection entry and one case entry past 30 days, then purge
await cloud.saveBinEntry(email, { ...re, deletedAt: Date.now() - 31 * DAY });
await cloud.saveBinEntry(email, { ...es[0], deletedAt: Date.now() - 40 * DAY });
const n = await B.purgeExpired();
assert.equal(n, 2);
assert.equal(await cloud.loadImage(email, 'img1'), null, 'image purged with its entry');
bin = await cloud.listBin(email);
assert.deepEqual(bin.map(x => x.id), [es[1].id]);
assert.equal(await B.purgeExpired(), 0, 'runs once per user');

// delete forever
await B.deleteForever(es[1].id);
assert.equal((await cloud.listBin(email)).length, 0);
await assert.rejects(B.restoreFromBin('nope'));

// the response sheet's outbox (sheet-outbox.js; the demo keeps it in memory): a new case's entry leaves with the delete and
// comes back when the case is restored with its id (Undo, the bin, a delete that failed); never under a new id, and never
// for a case from before the outbox went live
{
  S.resident = { rid: '209901', name: 'Fake Resident', email };
  S.logbook = { ...(S.logbook || {}), rid: '209901' };
  const queued = id => sheetOutbox().some(e => e.id === id);
  const until = async (fn, what) => { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 20)); } assert.fail(what); };
  const c = await createCase({ details: 'XY 30F fake LSCS spinal', cats: ['16', '28'], date: '2026-10-20' });
  assert.ok(queued(c.id), 'queued when logged');
  const be = await B.moveToBin('case', S.cases.find(x => x.id === c.id));
  assert.ok(!queued(c.id), 'taken out with the delete');
  const back = await B.restoreFromBin(be.id);   // what the toast's Undo and the bin's Restore do
  assert.equal(back.id, c.id); assert.ok(queued(c.id), 'back in the outbox after Undo');
  assert.equal(sheetOutbox().filter(e => e.id === c.id).length, 1);
  // restored under a new id (a live case has the old one): not queued, or the sheet would get the case twice
  const be2 = await B.moveToBin('case', S.cases.find(x => x.id === c.id));
  await cloud.saveCase(email, { ...c }); setCases(await cloud.listCases(email));
  const back2 = await B.restoreFromBin(be2.id);
  assert.notEqual(back2.id, c.id); assert.ok(!queued(back2.id), 'never under a new id'); assert.ok(!queued(c.id));
  // an app case from before the outbox went live: restored, not queued
  const old = { id: 'old1', date: '2026-03-01', initials: 'OP', details: 'fake old case', cats: ['13'], createdAt: Date.parse('2026-03-01T02:00:00Z'), updatedAt: Date.parse('2026-03-01T02:00:00Z'), source: 'app' };
  await cloud.saveCase(email, old); setCases(await cloud.listCases(email));
  const be3 = await B.moveToBin('case', S.cases.find(x => x.id === 'old1'));
  assert.equal((await B.restoreFromBin(be3.id)).id, 'old1'); assert.ok(!queued('old1'), 'an old case is not sent late');
  // a delete accepted, then failing (a connection that only looks online): the case is saved again, and queued again
  const c2 = await createCase({ details: 'ZW 41M fake lap chole', cats: ['08', '13'], date: '2026-10-21' });
  writes.configure({ backend: async (em, kind, rec, bs) => { if (!rec._deleted) return cloud.commitRecord(em, kind, rec, bs); await new Promise(r => setTimeout(r, 400)); throw new Error('Fake: the client is offline'); } });
  try {
    await B.moveToBin('case', S.cases.find(x => x.id === c2.id));
    assert.ok(!queued(c2.id), 'taken out once the delete was accepted');
    await until(() => queued(c2.id) && S.cases.some(x => x.id === c2.id), 'the failed delete put the case and its outbox entry back');
  } finally { writes.configure({ backend: cloud.commitRecord }); }
  S.resident = null;
}

resetCaches();
console.log('bin tests passed');
