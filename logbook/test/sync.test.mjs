// Run with: node logbook/test/sync.test.mjs  (fake data only)
// The sync engine (sync.js) against a fake server that counts the documents it sends, and the local store (store.js,
// memory in node). The same engine runs on Firestore in the app and on the demo backend in the browser tests; the
// emulator test (test/e2e/reads.emulator.mjs) counts real Firestore reads.
import assert from 'node:assert/strict';
import { plan, applyChanges, replaceAll, applyTombs, pruneGone, binTombs, createCollectionSync, createSyncHub, SKEW, FULL_EVERY, GONE_KEEP } from '../js/sync.js';
import { openStore, wipeStores, storeName } from '../js/store.js';

const settle = () => new Promise(r => setTimeout(r, 5));
const DAY = 864e5, T0 = Date.parse('2026-10-13T08:00:00Z');

// ---- pure helpers ----
{
  assert.deepEqual(plan(null, T0), { full: true, since: null });
  assert.deepEqual(plan({ syncAt: T0 - 1000 }, T0), { full: true, since: null }, 'never fully read');
  assert.deepEqual(plan({ syncAt: T0 - 1000, fullAt: T0 - DAY }, T0), { full: false, since: T0 - 1000 - SKEW });
  assert.equal(plan({ syncAt: T0, fullAt: T0 - FULL_EVERY - 1 }, T0).full, true, 'weekly full read');
  assert.equal(plan({ syncAt: T0 + DAY, fullAt: T0 + DAY }, T0).full, true, 'clock went back a day');
  assert.equal(plan({ syncAt: T0 + 60e3, fullAt: T0 - DAY }, T0).since, T0 - SKEW, 'never past now');

  const docs = new Map([['a', { id: 'a', updatedAt: 1 }], ['b', { id: 'b', updatedAt: 1 }], ['c', { id: 'c', updatedAt: 1 }]]);
  const r = applyChanges(docs, [
    { type: 'modified', id: 'a', doc: { id: 'a', updatedAt: 5 } },
    { type: 'added', id: 'b', doc: { id: 'b', updatedAt: 1 } },         // unchanged: not written again
    { type: 'added', id: 'd', doc: { id: 'd', updatedAt: 3 } },         // older than its known deletion: stale
    { type: 'removed', id: 'c', doc: null },                            // not known to be deleted: check it
    { type: 'removed', id: 'zz', doc: null },                           // never had it
  ], { d: 4 });
  assert.deepEqual(r.put.map(d => d.id), ['a']); assert.deepEqual(r.del, []); assert.deepEqual(r.verify, ['c']);
  assert.equal(docs.get('a').updatedAt, 5); assert.ok(!docs.has('d'));
  const r2 = applyChanges(docs, [{ type: 'removed', id: 'c' }, { type: 'added', id: 'd', doc: { id: 'd', updatedAt: 9 } }], { c: 2, d: 4 });
  assert.deepEqual(r2.del, ['c']); assert.deepEqual(r2.put.map(d => d.id), ['d'], 'restored after the deletion');

  const m = new Map([['a', { id: 'a', v: 1 }], ['b', { id: 'b', v: 1 }]]);
  const rr = replaceAll(m, [{ id: 'a', v: 1 }, { id: 'c', v: 1 }]);
  assert.deepEqual(rr, { put: [{ id: 'c', v: 1 }], del: ['b'] }); assert.deepEqual([...m.keys()], ['a', 'c']);

  const g = {}, td = new Map([['x', { id: 'x', updatedAt: 10 }], ['y', { id: 'y', updatedAt: 30 }]]);
  assert.deepEqual(applyTombs(td, g, [{ id: 'x', deletedAt: 20 }, { id: 'y', deletedAt: 20 }, { id: 'q', deletedAt: 5 }, { id: 'bad' }]), ['x']);
  assert.ok(td.has('y'), 'restored (changed after it was binned) stays');
  assert.deepEqual(g, { x: 20, y: 20, q: 5 });
  assert.deepEqual(pruneGone({ old: T0 - GONE_KEEP - 1, new: T0 - 1 }, T0), { new: T0 - 1 });
  assert.deepEqual(binTombs([{ kind: 'case', data: { id: 'c1' }, deletedAt: 7 }, { kind: 'note', data: { id: 'n1' }, deletedAt: 8 }, { kind: 'summary', data: { id: 's' } }, { kind: 'reflection', data: {} }]),
    { cases: [{ id: 'c1', deletedAt: 7 }], notes: [{ id: 'n1', deletedAt: 8 }] });
}

// ---- a fake server: collections of docs, live queries, and a count of documents sent ----
function fakeServer() {
  const colls = { cases: new Map(), reflections: new Map(), notes: new Map(), bin: new Map() };
  const watchers = new Set();
  const srv = {
    colls, reads: 0, listens: 0, fetches: 0, clock: T0,
    set(coll, doc) { colls[coll].set(doc.id, { ...doc }); for (const w of [...watchers]) if (w.coll === coll) w.run(); },
    del(coll, id) { colls[coll].delete(id); for (const w of [...watchers]) if (w.coll === coll) w.run(); },
    // Firestore bills each document a listener sends (at least one per query), as when it starts cold
    listen(email, coll, { since = null, field = 'updatedAt' } = {}, onSnap) {
      srv.listens++;
      const w = { coll, prev: null };
      w.run = () => {
        const docs = [...colls[coll].values()].filter(d => since === null || (Number(d[field]) || 0) > since).map(d => ({ ...d }));
        const next = new Map(docs.map(d => [d.id, JSON.stringify(d)])), changes = [];
        for (const d of docs) { const was = w.prev && w.prev.get(d.id); if (was !== next.get(d.id)) changes.push({ type: was ? 'modified' : 'added', id: d.id, doc: d }); }
        for (const id of (w.prev || new Map()).keys()) if (!next.has(id)) changes.push({ type: 'removed', id, doc: null });
        const first = w.prev === null;
        srv.reads += first ? Math.max(1, docs.length) : changes.filter(c => c.type !== 'removed').length;
        w.prev = next;
        if (first || changes.length) onSnap({ changes, fromCache: false, hasPendingWrites: false, ...(first && since === null ? { full: true, docs } : {}) });
      };
      watchers.add(w); w.run();
      return () => watchers.delete(w);
    },
    fetchOne(email, coll, id) { srv.fetches++; srv.reads++; const d = colls[coll].get(id); return d ? { ...d } : null; },
  };
  return srv;
}
const E = 'fake@example.com';

// ---- one collection: first open reads all, reopening reads ~nothing, one change reads one ----
{
  const srv = fakeServer();
  for (let i = 0; i < 50; i++) srv.set('cases', { id: 'c' + i, details: 'Fake case ' + i, updatedAt: T0 - 2 * DAY });
  srv.set('cases', { id: 'old', details: 'Fake case without updatedAt' });   // only a full read finds it
  let now = T0;
  const store = await openStore(E);
  const open = () => createCollectionSync({ email: E, coll: 'cases', store, listen: srv.listen, fetchOne: srv.fetchOne, now: () => now });

  let got = [];
  let s = open(); s.subscribe((l, m) => got.push([l.length, m.fromCache]));
  await settle();
  assert.deepEqual(got, [[51, false]], 'a device that never synced waits for the server');
  assert.equal(srv.reads, 51);
  await s.stop();

  now += 3600e3; srv.reads = 0; got = [];
  s = open(); s.subscribe((l, m) => got.push([l.length, m.fromCache]));
  await settle();
  assert.deepEqual(got, [[51, true], [51, false]], 'the stored list at once, then confirmed');
  assert.equal(srv.reads, 1, 'nothing changed: one read (an empty result)');
  await s.stop();

  now += 3600e3; srv.reads = 0; got = [];
  srv.set('cases', { id: 'c7', details: 'Fake case 7 edited', updatedAt: now - 60e3 });
  srv.set('cases', { id: 'new', details: 'Fake new case', updatedAt: now - 30e3 });
  let last = null;
  s = open(); s.subscribe(l => { last = l; });
  await settle();
  assert.equal(srv.reads, 2, 'two changed: two reads');
  assert.equal(last.length, 52); assert.equal(last.find(c => c.id === 'c7').details, 'Fake case 7 edited');
  last[0].details = 'mutated';   // callers get copies

  // live while open: a change, a deletion seen in view (checked with one read), a deletion via the bin
  srv.reads = 0;
  srv.set('cases', { id: 'c1', details: 'Fake case 1 edited', updatedAt: now });
  srv.del('cases', 'new');        // in view (changed recently): removed, then checked
  await settle();
  assert.ok(!last.some(c => c.id === 'new')); assert.equal(last.find(c => c.id === 'c1').details, 'Fake case 1 edited');
  assert.equal(srv.fetches, 1); assert.equal(srv.reads, 2);
  await s.tombs([{ id: 'c2', deletedAt: now }, { id: 'c1', deletedAt: now - 1 }]);
  assert.ok(!last.some(c => c.id === 'c2')); assert.ok(last.some(c => c.id === 'c1'), 'c1 changed after it was binned: kept');
  // deleted here for good: gone at once, and a stale copy from the server (still pending there) is ignored
  await s.drop(['c3']);
  assert.ok(!last.some(c => c.id === 'c3'));
  srv.set('cases', { id: 'c3', details: 'stale', updatedAt: T0 - 2 * DAY });
  await settle(); assert.ok(!last.some(c => c.id === 'c3'));
  await s.stop();

  // a week on: a full read heals what the deltas can't see (the server still has c3; c2 truly gone)
  now += 8 * DAY; srv.reads = 0;
  srv.del('cases', 'c2');
  srv.set('cases', { id: 'c3', details: 'Fake case 3', updatedAt: now - 9 * DAY });
  s = open(); s.subscribe(l => { last = l; });
  await settle();
  assert.equal(srv.reads, 50, 'weekly full read (c2 gone)');
  assert.ok(last.some(c => c.id === 'c3') && !last.some(c => c.id === 'c2') && last.some(c => c.id === 'old'));
  await s.stop();
  await wipeStores();
  assert.deepEqual(await (await openStore(E)).load('cases'), { docs: [], meta: {} }, 'wiped');
}

// ---- unverifiable removal (offline): dropped now, a full read next time ----
{
  const srv = fakeServer();
  srv.set('notes', { id: 'n1', body: 'Fake note', updatedAt: T0 });
  const store = await openStore(E);
  const offline = () => { throw new Error('offline'); };
  let last = null;
  const s = createCollectionSync({ email: E, coll: 'notes', store, listen: srv.listen, fetchOne: offline, now: () => T0 });
  s.subscribe(l => { last = l; });
  await settle();
  srv.del('notes', 'n1');
  await settle();
  assert.deepEqual(last, []);
  await s.stop();
  assert.equal((await store.load('notes')).meta.fullAt, 0, 'next start reads everything');
  await wipeStores();
}

// ---- the hub: shared engines, the bin feed, drops for collections not running ----
{
  const srv = fakeServer();
  let now = T0;
  srv.set('cases', { id: 'k1', details: 'Fake', updatedAt: T0 - DAY });
  srv.set('notes', { id: 'n1', body: 'Fake note', updatedAt: T0 - DAY });
  srv.set('notes', { id: 'n2', body: 'Fake note 2', updatedAt: T0 - DAY });
  const hub = createSyncHub({ openStore, listen: srv.listen, fetchOne: srv.fetchOne, now: () => now, grace: 0 });
  const a = [], b = [];
  const offA = hub.watch(E, 'cases', l => a.push(l.length)), offB = hub.watch(E, 'cases', l => b.push(l.length));
  await settle();
  assert.equal(srv.listens, 2, 'one listener for cases (shared) and one for the bin');
  assert.deepEqual([a, b], [[1], [1]]);
  // notes loaded once, then not running: a bin entry and a delete on this device still reach the stored copy
  const offN = hub.watch(E, 'notes', () => {}); await settle(); offN(); await settle();
  srv.set('bin', { id: 'n_n1_x', kind: 'note', data: { id: 'n1' }, deletedAt: now });
  await settle(); await hub.flush();
  await hub.drop(E, 'notes', ['n2']);
  assert.deepEqual((await (await openStore(E)).load('notes')).docs, []);
  // later, with the feed and notes engine stopped, the notes come back from the store without them
  offA(); offB(); await settle();
  now += 3600e3; srv.reads = 0;
  let notes = null;
  const offN2 = hub.watch(E, 'notes', l => { notes = l; }); await settle();
  assert.deepEqual(notes, []); assert.equal(srv.reads, 2, 'notes and bin: one read each');
  offN2();
  await hub.stopAll(); await wipeStores();
}

// ---- stopping and starting again within the grace keeps the same listener ----
{
  const srv = fakeServer();
  srv.set('cases', { id: 'g1', updatedAt: T0 });
  const hub = createSyncHub({ openStore, listen: srv.listen, fetchOne: srv.fetchOne, now: () => T0, grace: 40 });
  let off = hub.watch(E, 'cases', () => {}); await settle();
  const listens = srv.listens;
  off(); off = hub.watch(E, 'cases', () => {}); await new Promise(r => setTimeout(r, 60));
  assert.equal(srv.listens, listens, 'no new listener');
  off(); await new Promise(r => setTimeout(r, 60));
  let got = null; off = hub.watch(E, 'cases', l => { got = l; }); await settle();
  assert.equal(srv.listens, listens + 2, 'after the grace: a new one (cases and the bin feed)');
  assert.deepEqual(got.map(d => d.id), ['g1']);
  off(); await hub.stopAll(); await wipeStores();
}

// ---- store: names per account and mode; memory fallback in node ----
{
  assert.equal(storeName(' Fake@Example.com '), 'apmes-logbook-store:fake@example.com');
  const st = await openStore(E);
  assert.equal(st.kind, 'memory');
  await st.write('cases', { put: [{ id: 'a', v: 1 }, { id: 'b', v: 1 }], meta: { syncAt: 1 } });
  await st.write('cases', { del: ['a'], put: [{ id: 'c', v: 2 }] });
  assert.deepEqual(await st.load('cases'), { docs: [{ id: 'b', v: 1 }, { id: 'c', v: 2 }], meta: { syncAt: 1 } });
  await st.write('bin', { meta: { syncAt: 5 } });
  assert.deepEqual((await st.load('bin')).meta, { syncAt: 5 });
  await wipeStores();
  assert.equal(st.closed, true);
  await st.write('cases', { put: [{ id: 'z' }] });   // an old handle never brings a wiped store back
  assert.deepEqual((await (await openStore(E)).load('cases')).docs, []);
}

console.log('sync tests passed');
