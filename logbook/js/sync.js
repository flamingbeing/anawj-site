// The sync engine: opening the app costs about one Firestore read per collection when nothing changed.
//
// Each collection (cases, reflections, notes) has a local copy on this device (store.js). On start the engine shows
// that copy at once, then listens only for documents changed since the last sync:
//   query(collection, where('updatedAt', '>', lastSync - SKEW))
// and merges what arrives. The first time on a device, and once a week after that, it reads the whole collection
// instead (current behaviour), which also picks up documents without updatedAt and heals anything the deltas missed.
// Deletions: the recycle bin's entries (deletedAt) arrive the same way and remove the binned record here, unless the
// record was changed after it was binned (restored). A record removed while it was in view is checked once.
//
// lastSync is this device's clock when the server last confirmed the list; SKEW covers writers whose clocks are a
// little behind. Writes that reach the server late (offline) are re-stamped by cloud.js (lateTouch), so they still
// land after everyone's lastSync. Limits (healed by the weekly full read): a record deleted for good without a bin
// entry (Undo of a just-saved case, Recent changes restoring a deletion) while another device was closed stays on
// that device until then; so does a write stamped by a clock more than SKEW behind.
//
// listen(email, coll, { since, epoch, field }, onSnap, onError) -> unsubscribe   (cloud.js: Firestore; demo-backend.js)
//   since: null = the whole collection. onSnap({ changes: [{ type: 'added'|'modified'|'removed', id, doc }],
//   fromCache, hasPendingWrites, full?, docs?, epoch? }); full: docs is the whole collection, confirmed by the server.
// fetchOne(email, coll, id) -> doc | null (throws when it can't tell, e.g. offline)

export const SKEW = 10 * 60e3;          // clocks may be this far behind
export const FULL_EVERY = 7 * 864e5;     // a full read at least weekly
export const GONE_KEEP = 8 * 864e5;      // deleted ids remembered (longer than the weekly full read)
const BIN_KIND = { case: 'cases', reflection: 'reflections', note: 'notes' };

const copy = v => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const stamp = d => Number(d && d.updatedAt) || 0;

// ---- pure helpers (test/sync.test.mjs) ----

// What to read now: the whole collection (first time, a week since the last full read, a clock gone back), or only
// what changed since the last confirmed sync.
export function plan(meta, now) {
  const m = meta || {};
  const full = !(m.fullAt > 0) || !(m.syncAt > 0) || now - m.fullAt > FULL_EVERY || m.fullAt > now + SKEW;
  return { full, since: full ? null : Math.min(m.syncAt, now) - SKEW };
}

// Apply a snapshot's changes to docs (a Map, changed in place). A copy older than a known deletion is stale and
// skipped; a removal of an id not known to be deleted is returned in verify (it may be a deletion elsewhere, or a
// rejected write leaving the query), to be checked with one read.
export function applyChanges(docs, changes, gone = {}) {
  const put = [], del = [], verify = [];
  for (const c of changes || []) {
    if (c.type === 'removed') {
      if (!docs.has(c.id)) continue;
      if (gone[c.id] != null) { docs.delete(c.id); del.push(c.id); } else verify.push(c.id);
      continue;
    }
    if (!c.doc || (gone[c.id] != null && stamp(c.doc) <= gone[c.id])) continue;
    if (docs.has(c.id) && same(docs.get(c.id), c.doc)) continue;
    docs.set(c.id, c.doc); put.push(c.doc);
  }
  return { put, del, verify };
}

// Replace docs with the server's whole list; returns what changed (so only that is written to the device).
export function replaceAll(docs, list) {
  const next = new Map(list.map(d => [d.id, d]));
  const put = list.filter(d => !docs.has(d.id) || !same(docs.get(d.id), d));
  const del = [...docs.keys()].filter(id => !next.has(id));
  docs.clear(); for (const [id, d] of next) docs.set(id, d);
  return { put, del };
}

// Tombstones [{ id, deletedAt }]: remove each record unless it changed after it was deleted; remember the ids.
export function applyTombs(docs, gone, tombs) {
  const del = [];
  for (const t of tombs || []) {
    const at = Number(t.deletedAt) || 0;
    if (!t.id || !at) continue;
    gone[t.id] = Math.max(gone[t.id] || 0, at);
    if (docs.has(t.id) && stamp(docs.get(t.id)) <= at) { docs.delete(t.id); del.push(t.id); }
  }
  return del;
}

export const pruneGone = (gone, now) => Object.fromEntries(Object.entries(gone || {}).filter(([, t]) => t > now - GONE_KEEP));

// recycle bin entries -> tombstones per collection: { cases: [{ id, deletedAt }], ... }
export function binTombs(entries) {
  const out = {};
  for (const e of entries || []) {
    const coll = BIN_KIND[e && e.kind], id = e && e.data && e.data.id;
    if (coll && id) (out[coll] ||= []).push({ id: String(id), deletedAt: Number(e.deletedAt) || 0 });
  }
  return out;
}

// ---- one collection ----

// subscribe(cb) -> unsubscribe; cb(list, { fromCache, hasPendingWrites }) with the whole merged list (a copy each time).
export function createCollectionSync({ email, coll, store, listen, fetchOne = null, now = Date.now, onError = () => {} }) {
  const subs = new Set();
  let docs = new Map(), meta = {}, flags = null, stopped = false, unlisten = null, chain = Promise.resolve();
  const persist = op => (chain = chain.then(() => store.write(coll, op)).catch(e => console.warn('Local store not saved', e)));
  const send = cb => { if (flags && subs.has(cb)) cb(copy([...docs.values()]), { ...flags }); };
  const emit = () => { for (const cb of subs) send(cb); };

  const ready = (async () => {
    const got = await store.load(coll);
    if (stopped) return;
    docs = new Map(got.docs.map(d => [d.id, d]));
    meta = got.meta || {};
    // a list confirmed before shows at once; a device that never synced waits for the listener (as Firestore did)
    if (meta.syncAt) { flags = { fromCache: true, hasPendingWrites: false }; emit(); }
    const p = plan(meta, now());
    unlisten = listen(email, coll, { since: p.since, epoch: meta.epoch }, onSnap, onError);
    if (stopped) unlisten();
  })().catch(onError);

  function onSnap(s) {
    if (stopped) return;
    const t = now();
    let changed = false;
    if (s.full) {
      const r = replaceAll(docs, s.docs || []);
      changed = !!(r.put.length || r.del.length);
      meta = { ...meta, syncAt: t, fullAt: t, gone: pruneGone(meta.gone, t), ...(s.epoch !== undefined ? { epoch: s.epoch } : {}) };
      persist({ ...r, meta });
    } else {
      const r = applyChanges(docs, s.changes, meta.gone || {});
      changed = !!(r.put.length || r.del.length);
      if (!s.fromCache) meta = { ...meta, syncAt: t };
      if (changed || !s.fromCache) persist({ put: r.put, del: r.del, meta });
      for (const id of r.verify) verify(id);
    }
    const f = { fromCache: !!s.fromCache, hasPendingWrites: !!s.hasPendingWrites };
    if (changed || !flags || f.fromCache !== flags.fromCache || f.hasPendingWrites !== flags.hasPendingWrites) { flags = f; emit(); }
  }

  // a record left the query without a known deletion: one read says whether it still exists
  async function verify(id) {
    let doc;
    try { doc = fetchOne ? await fetchOne(email, coll, id) : undefined; } catch { doc = undefined; }
    if (stopped) return;
    const gone = meta.gone || {};
    if (doc && !(gone[id] != null && stamp(doc) <= gone[id])) {
      if (same(docs.get(id), doc)) return;
      docs.set(id, doc); persist({ put: [doc], meta });
    } else {
      // couldn't tell (offline): most likely deleted elsewhere; the next start reads everything to be sure
      if (doc === undefined) meta = { ...meta, fullAt: 0 };
      docs.delete(id); persist({ del: [id], meta });
    }
    emit();
  }

  return {
    subscribe(cb) { subs.add(cb); if (flags) queueMicrotask(() => send(cb)); return () => subs.delete(cb); },
    get size() { return subs.size; },
    ready,
    // deleted here (for good, or into the bin): gone at once, and older copies arriving later are ignored
    async drop(ids, at = now()) {
      await ready;
      const del = applyTombs(docs, meta.gone ||= {}, ids.map(id => ({ id: String(id), deletedAt: Math.max(at, stamp(docs.get(String(id)))) })));
      await persist({ del, meta });
      if (del.length) emit();
    },
    async tombs(list) {
      await ready;
      const del = applyTombs(docs, meta.gone ||= {}, list);
      await persist({ del, meta });
      if (del.length) emit();
    },
    stop() { stopped = true; subs.clear(); if (unlisten) unlisten(); return chain; },
    flush: () => chain,
  };
}

// ---- the recycle bin as a feed of tombstones ----
// Listens to bin entries changed since the last sync (deletedAt) and hands them on; keeps only its meta record.
export function createTombFeed({ email, store, listen, apply, now = Date.now, onError = () => {} }) {
  let meta = {}, stopped = false, unlisten = null, chain = Promise.resolve();
  const ready = (async () => {
    meta = (await store.load('bin')).meta || {};
    if (stopped) return;
    const p = plan(meta, now());
    unlisten = listen(email, 'bin', { since: p.since, epoch: meta.epoch, field: 'deletedAt' }, s => {
      if (stopped) return;
      const entries = s.full ? s.docs || [] : (s.changes || []).filter(c => c.type !== 'removed').map(c => c.doc);
      const t = now();
      const confirmed = !s.fromCache || s.full;
      chain = chain.then(async () => {
        if (entries.length) await apply(binTombs(entries));
        if (stopped || !confirmed) return;
        meta = { ...meta, syncAt: t, ...(s.full ? { fullAt: t } : {}), ...(s.epoch !== undefined ? { epoch: s.epoch } : {}) };
        await store.write('bin', { meta });
      }).catch(e => console.warn('Recycle bin sync failed', e));
    }, onError);
    if (stopped) unlisten();
  })().catch(onError);
  return { ready, stop() { stopped = true; if (unlisten) unlisten(); return chain; }, flush: () => chain };
}

// ---- all collections of the signed-in account(s) ----
// One engine per account and collection, shared by every caller (two callers never cost two listeners); the bin
// feed runs while any of them does.
export function createSyncHub({ openStore, listen, fetchOne = null, now = Date.now, onError = () => {} }) {
  const engines = new Map(), feeds = new Map(), stores = new Map();
  const key = (email, coll) => email + '\n' + coll;
  async function storeFor(email) {
    let s = stores.get(email);
    if (s) { const got = await s; if (!got.closed) return got; }
    s = openStore(email);
    stores.set(email, s);
    return s;
  }
  // a store opened lazily behind the same interface, so callers needn't wait for it
  const lazyStore = email => ({
    load: async coll => (await storeFor(email)).load(coll),
    write: async (coll, op) => (await storeFor(email)).write(coll, op),
  });
  // tombstones for a collection that isn't running: straight into its stored copy
  async function storeTombs(email, coll, list, drop = false) {
    const st = lazyStore(email), got = await st.load(coll);
    const docs = new Map(got.docs.map(d => [d.id, d])), meta = got.meta || {};
    const at = now();
    const del = applyTombs(docs, meta.gone ||= {}, drop ? list.map(id => ({ id: String(id), deletedAt: Math.max(at, stamp(docs.get(String(id)))) })) : list);
    await st.write(coll, { del, meta });
  }
  function tombsFor(email) {
    return async byColl => {
      for (const [coll, list] of Object.entries(byColl)) {
        const e = engines.get(key(email, coll));
        await (e ? e.tombs(list) : storeTombs(email, coll, list));
      }
    };
  }
  function idle(email) {
    if ([...engines.keys()].some(k => k.startsWith(email + '\n'))) return;
    const f = feeds.get(email);
    if (f) { f.stop(); feeds.delete(email); }
  }
  return {
    watch(email, coll, cb) {
      const k = key(email, coll);
      let e = engines.get(k);
      if (!e) { e = createCollectionSync({ email, coll, store: lazyStore(email), listen, fetchOne, now, onError }); engines.set(k, e); }
      if (!feeds.has(email)) feeds.set(email, createTombFeed({ email, store: lazyStore(email), listen, apply: tombsFor(email), now, onError }));
      const off = e.subscribe(cb);
      return () => {
        off();
        if (e.size || engines.get(k) !== e) return;
        e.stop(); engines.delete(k); idle(email);
      };
    },
    // records deleted on this device (for good, or into the bin)
    drop(email, coll, ids) {
      if (!ids || !ids.length) return Promise.resolve();
      const e = engines.get(key(email, coll));
      return (e ? e.drop(ids) : storeTombs(email, coll, ids, true)).catch(err => console.warn('Local store not updated', err));
    },
    // stop everything and forget open stores (sign-out); resolves when pending local writes are done
    async stopAll() {
      const waits = [...engines.values(), ...feeds.values()].map(x => x.stop());
      engines.clear(); feeds.clear(); stores.clear();
      await Promise.all(waits).catch(() => {});
    },
    // tests: wait for pending local writes
    flush: () => Promise.all([...engines.values(), ...feeds.values()].map(x => x.flush())),
  };
}
