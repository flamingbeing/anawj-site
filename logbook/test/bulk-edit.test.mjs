// Run with: node logbook/test/bulk-edit.test.mjs  (demo backend, fake data only)
// Many logged cases changed at once (Tag N cases, Settings tag merge, a spreadsheet's changed rows) go through the write
// queue case by case with the version each change was made from: a case changed on another device meanwhile keeps that
// version (audit, 14 Oct 2026: a blind batch put this device's stale copy back over it, with no conflict and no copy).
import assert from 'node:assert/strict';
globalThis.location = { search: '?demo', hash: '' };
// Device recovery storage: explicit in-memory browser adapter for this Node test.
const device = new Map();
globalThis.localStorage = { getItem: k => device.get(k) || null, setItem: (k,v) => { device.set(k,String(v)); Object.defineProperty(localStorage,k,{value:String(v),configurable:true,enumerable:true}); }, removeItem: k => { device.delete(k); delete localStorage[k]; } };
const cloud = await import('../js/cloud.js');
const { resetDemo, DEMO_USER } = await import('../js/demo-backend.js');
const { S, setCases, updateMany, writes, resetCaches, scheduleSummary } = await import('../js/ui-core.js');

resetDemo({ seeded: false });
const email = DEMO_USER.email;
S.user = { ...DEMO_USER };
const ids = Array.from({ length: 23 }, (_, i) => 'fake-bulk-' + i);   // more than one batch of ten
for (const [i, id] of ids.entries())
  await cloud.saveCase(email, { id, date: '2026-10-01', initials: 'ZZ', details: 'Fake case ' + i, cats: ['16'], createdAt: i + 1, updatedAt: 1000 + i, source: 'app' });
setCases(await cloud.listCases(email));
const stale = S.cases.find(c => c.id === 'fake-bulk-7');

// the laptop adds details and a category to one of them; this device hasn't heard yet (offline in theatre)
const laptop = { ...stale, details: 'Fake case 7, spinal then GA', cats: ['16', '17'], updatedAt: 5000 };
await cloud.commitRecord(email, 'case', laptop, stale);

// this device tags them all from its own (stale) copies, as Tag N cases and a tag merge build them: each with its base
const server = async id => (await cloud.listCases(email)).find(c => c.id === id);
const pairs = S.cases.filter(c => ids.includes(c.id)).reverse().map(c => ({ base: c, next: { ...c, tags: ['u:fake'], updatedAt: Date.now() } }));
const r = await updateMany(pairs);
assert.deepEqual([r.saved, r.kept, r.failed], [22, 1, 0], JSON.stringify(r));
const x = await server('fake-bulk-7');
assert.equal(x.details, 'Fake case 7, spinal then GA', 'the edit made elsewhere is not overwritten');
assert.deepEqual(x.cats, ['16', '17']); assert.equal(x.tags, undefined);
for (const id of ids.filter(id => id !== 'fake-bulk-7')) assert.deepEqual((await server(id)).tags, ['u:fake'], id + ' tagged');
// this device shows what the server has (the other device's version for the kept one) and keeps its own in Recent changes
assert.equal(S.cases.find(c => c.id === 'fake-bulk-7').details, 'Fake case 7, spinal then GA');
assert.equal(S.cases.filter(c => (c.tags || []).includes('u:fake')).length, 22);
assert.equal(writes.status('case', 'fake-bulk-7'), 'conflict');
assert.deepEqual(writes.entries().find(j => j.record.id === 'fake-bulk-7').record.tags, ['u:fake']);
assert.equal(S.counts['17'], 1, 'the counts follow');

// a save refused for another reason counts as not saved, with its error; the rest still save
writes.configure({ backend: async (em, kind, rec, base) => { if (rec.id === 'fake-bulk-3') throw Object.assign(new Error('Fake refusal'), { code: 'permission-denied' }); return cloud.commitRecord(em, kind, rec, base); } });
const two = ['fake-bulk-2', 'fake-bulk-3'].map(id => S.cases.find(c => c.id === id));
const r2 = await updateMany(two.map(c => ({ base: c, next: { ...c, tags: [], updatedAt: Date.now() } })));
writes.configure({ backend: cloud.commitRecord });
assert.deepEqual([r2.saved, r2.kept, r2.failed], [1, 0, 1]); assert.match(r2.error.message, /Fake refusal/);
assert.equal((await server('fake-bulk-2')).tags, undefined); assert.deepEqual((await server('fake-bulk-3')).tags, ['u:fake']);

// nothing to change: nothing saved, nothing kept
assert.deepEqual(await updateMany([]), { saved: 0, kept: 0, failed: 0, error: null });

scheduleSummary.cancel(); resetCaches();
console.log('bulk edit tests passed');
process.exit(0);
