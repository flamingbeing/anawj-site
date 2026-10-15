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
const { S, setCases, updateCase, updateMany, writes, hooks, resetCaches, scheduleSummary } = await import('../js/ui-core.js');
const { createWriteQueue } = await import('../js/writes.js');
const { checkWrite } = await import('../js/recovery-store.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const quiet = { onprogress: () => {} };   // (the progress toast needs a page)

resetDemo({ seeded: false });
const email = DEMO_USER.email;
S.user = { ...DEMO_USER };
const server = async id => (await cloud.listCases(email)).find(c => c.id === id);
async function seed(prefix, n, extra = {}) {
  const ids = Array.from({ length: n }, (_, i) => prefix + i);
  for (const [i, id] of ids.entries())
    await cloud.saveCase(email, { id, date: '2026-10-01', initials: 'ZZ', details: 'Fake case ' + i, cats: ['16'], createdAt: i + 1, updatedAt: 1000 + i, source: 'app', ...extra });
  setCases(await cloud.listCases(email));
  return ids;
}
// the laptop edits a case; this device hasn't heard yet (offline in theatre, or a slow listener)
const elsewhere = async c => cloud.commitRecord(email, 'case', { ...c, details: c.details + ', changed on the laptop', cats: ['16', '17'], updatedAt: 5000 }, c);
const tagged = (list, tag) => list.map(c => ({ base: c, next: { ...c, tags: [tag], updatedAt: Date.now() } }));

// 1. 23 cases in three batches, one changed elsewhere: that one is kept, the rest are tagged; one repaint a batch
{
  const ids = await seed('fake-bulk-', 23);
  const stale = S.cases.find(c => c.id === 'fake-bulk-7');
  await elsewhere(stale);
  const progress = [], drawn = { cases: 0, overlay: 0 };
  const was = { changed: hooks.casesChanged, overlay: writes.overlay };
  hooks.casesChanged = () => { drawn.cases++; };
  writes.overlay = (...a) => { drawn.overlay++; return was.overlay(...a); };
  const r = await updateMany(tagged(S.cases.filter(c => ids.includes(c.id)).reverse(), 'u:fake'), { onprogress: (done, of) => progress.push([done, of]) });
  hooks.casesChanged = was.changed; writes.overlay = was.overlay;
  assert.deepEqual([r.saved, r.kept, r.failed], [22, 1, 0], JSON.stringify(r));
  const x = await server('fake-bulk-7');
  assert.equal(x.details, 'Fake case 7, changed on the laptop', 'the edit made elsewhere is not overwritten');
  assert.deepEqual(x.cats, ['16', '17']); assert.equal(x.tags, undefined);
  for (const id of ids.filter(id => id !== 'fake-bulk-7')) assert.deepEqual((await server(id)).tags, ['u:fake'], id + ' tagged');
  // this device shows what the server has (the other device's version for the kept one) and keeps its own in Recent changes
  assert.equal(S.cases.find(c => c.id === 'fake-bulk-7').details, 'Fake case 7, changed on the laptop');
  assert.equal(S.cases.filter(c => (c.tags || []).includes('u:fake')).length, 22);
  assert.equal(writes.status('case', 'fake-bulk-7'), 'conflict');
  assert.equal(writes.conflicted('case', 'fake-bulk-7'), true); assert.equal(writes.conflicted('case', 'fake-bulk-8'), false);
  assert.deepEqual(writes.entries().find(j => j.record.id === 'fake-bulk-7').record.tags, ['u:fake']);
  assert.equal(S.counts['17'], 1, 'the counts follow');
  assert.deepEqual(progress, [[0, 23], [10, 23], [20, 23]], 'progress before each batch of a long run');
  // each save's state changes (stored, sent, accepted) drew the whole list again: 300 cases took half a minute
  assert.ok(drawn.cases <= 4, `one repaint a batch, not one a case (${drawn.cases})`);
  assert.ok(drawn.overlay <= 6, `the list is overlaid once a batch, not three times a case (${drawn.overlay})`);
}

// 2. a case whose saves already met a change made elsewhere (unresolved in Recent changes) is left alone and counted as
// kept: a save queued behind that conflict never synced, said it saved (a merge then took the old tag off the list), and
// either choice in Recent changes set it aside
{
  await seed('fake-held-', 2, { tags: ['u:old'] });
  const v1 = S.cases.find(c => c.id === 'fake-held-0');
  await elsewhere(v1);
  await assert.rejects(updateCase({ ...v1, details: 'Fake held, phone edit' }, { base: v1 }), /changed elsewhere/i);
  setCases(await cloud.listCases(email));
  const before = writes.entries().filter(j => j.record.id === 'fake-held-0').map(j => j.key);
  const pairs = tagged(S.cases.filter(c => (c.tags || []).includes('u:old')), 'u:new');
  assert.equal(pairs.length, 2);
  const r = await updateMany(pairs, quiet);
  assert.deepEqual([r.saved, r.kept, r.failed], [1, 1, 0], JSON.stringify(r));
  assert.ok(r.saved < pairs.length, 'a merge keeps the old tag on the list');
  assert.deepEqual(writes.entries().filter(j => j.record.id === 'fake-held-0').map(j => j.key), before, 'nothing queued behind the conflict');
  assert.deepEqual((await server('fake-held-1')).tags, ['u:new']);
  assert.deepEqual((await server('fake-held-0')).tags, ['u:old'], 'the kept case still has the old tag, so the tag stays listed');
}

// 3. a slow connection (each save 300 ms, longer than the 180 ms save() waits): the case changed elsewhere is still
// found and kept (it counted as saved, and a merge took the old tag off the list), and no more than ten are in flight
{
  const ids = await seed('fake-slow-', 12, { tags: ['u:old'] });
  await elsewhere(S.cases.find(c => c.id === 'fake-slow-4'));
  let busy = 0, most = 0;
  writes.configure({ backend: async (...a) => { most = Math.max(most, ++busy); try { await sleep(300); return await cloud.commitRecord(...a); } finally { busy--; } } });
  const r = await updateMany(tagged(S.cases.filter(c => ids.includes(c.id)), 'u:new'), quiet);
  writes.configure({ backend: cloud.commitRecord });
  assert.deepEqual([r.saved, r.kept, r.failed], [11, 1, 0], JSON.stringify(r));
  assert.ok(most <= 10, `ten at a time (${most} in flight)`);
  assert.deepEqual((await server('fake-slow-4')).tags, ['u:old']);
  assert.equal(writes.status('case', 'fake-slow-3'), 'synced');
}

// 4. a save refused for another reason counts as not saved, with its error; the rest still save
{
  writes.configure({ backend: async (em, kind, rec, base) => { if (rec.id === 'fake-bulk-3') throw Object.assign(new Error('Fake refusal'), { code: 'permission-denied' }); return cloud.commitRecord(em, kind, rec, base); } });
  const two = ['fake-bulk-2', 'fake-bulk-3'].map(id => S.cases.find(c => c.id === id));
  const r = await updateMany(two.map(c => ({ base: c, next: { ...c, tags: [], updatedAt: Date.now() } })), quiet);
  writes.configure({ backend: cloud.commitRecord });
  assert.deepEqual([r.saved, r.kept, r.failed], [1, 0, 1]); assert.match(r.error.message, /Fake refusal/);
  assert.equal((await server('fake-bulk-2')).tags, undefined); assert.deepEqual((await server('fake-bulk-3')).tags, ['u:fake']);
}

// 5. nothing to change: nothing saved, nothing kept
assert.deepEqual(await updateMany([], quiet), { saved: 0, kept: 0, failed: 0, error: null });

// 6. signed out partway through a long run: it stops (no more saves, no error toast on the sign-in page)
{
  const ids = await seed('fake-out-', 25);
  writes.configure({ backend: async (em, kind, rec, base) => { if (rec.id === 'fake-out-5') S.user = null; return cloud.commitRecord(em, kind, rec, base); } });
  const r = await updateMany(tagged(ids.map(id => S.cases.find(c => c.id === id)), 'u:out'), quiet);
  writes.configure({ backend: cloud.commitRecord });
  assert.equal(r.stopped, true, JSON.stringify(r)); assert.equal(r.failed, 0, 'not counted as failures');
  for (const id of ids.slice(10)) assert.equal((await server(id)).tags, undefined, id + ' not sent after the sign-out');
  S.user = { ...DEMO_USER };
}

// 7. the queue's helpers on their own (fake records, in-memory store)
{
  const records = new Map(), remote = new Map();
  let release;
  const gate = () => new Promise(r => { release = r; });
  let hold = null;
  const q = createWriteQueue({ getOwner: () => 'a',
    store: { async put(x) { records.set(x.key, structuredClone(x)); }, async list(o) { return [...records.values()].filter(x => x.owner === o); }, async remove(k) { records.delete(k); }, async forget() {} },
    backend: async (_, kind, record, base) => { if (hold) await hold; checkWrite(remote.get(record.id) || null, record, base); remote.set(record.id, structuredClone(record)); return record; } });
  remote.set('2', { id: '2', details: 'other device' });
  hold = gate();
  await q.save('case', 'a', { id: '1', details: 'one' }); await q.save('case', 'a', { id: '2', details: 'mine' }, { id: '2', details: 'old' });
  assert.equal(q.status('case', '2'), 'pending', 'still on its way after save() returned');
  assert.equal(await q.settle('case', ['1', '2'], 50), false, 'not settled while sending');
  setTimeout(() => release(), 20);
  assert.equal(await q.settle('case', ['1', '2'], 2000), true);
  hold = null;
  assert.equal(q.status('case', '1'), 'synced'); assert.equal(q.status('case', '2'), 'conflict');
  assert.equal(q.conflicted('case', '2'), true); assert.equal(q.conflicted('case', '1'), false); assert.equal(q.conflicted('note', '2'), false);
  assert.equal(q.attention(), true); assert.equal(q.attention('case'), true); assert.equal(q.attention('note'), false);
  assert.equal(await q.settle('case', ['3'], 10), true, 'nothing being sent');
  // the sorted list is kept between calls: entries() must not reverse it in place
  await q.save('case', 'a', { id: '1', details: 'two' }, { id: '1', details: 'one' });
  const keys = () => q.entries().map(j => j.record.details);
  assert.deepEqual(keys(), ['two', 'mine', 'one']); assert.deepEqual(keys(), ['two', 'mine', 'one']);
  assert.equal(q.status('case', '1'), 'synced');
}

scheduleSummary.cancel(); resetCaches();
console.log('bulk edit tests passed');
process.exit(0);
