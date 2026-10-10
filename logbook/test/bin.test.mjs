// Run with: node logbook/test/bin.test.mjs  (demo backend, fake data only)
import assert from 'node:assert/strict';
globalThis.location = { search: '?demo' };
const cloud = await import('../js/cloud.js');
const { resetDemo, DEMO_USER } = await import('../js/demo-backend.js');
const { S, setCases, resetCaches } = await import('../js/ui-core.js');
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

resetCaches();
console.log('bin tests passed');
