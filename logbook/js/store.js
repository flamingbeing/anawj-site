// This device's own copy of an account's cases, reflections and notes (the sync engine, sync.js, keeps it in step
// with Firestore). One IndexedDB database per account and mode, "apmes-logbook-store:<email>" (the demo:
// "apmes-logbook-store:demo:<email>"), with an object store per collection and a meta record per collection:
//   meta { coll, syncAt, fullAt, epoch?, gone: { id: deletedAt } }
// Falls back to memory (kept for this page only) where IndexedDB is missing or refused: every start is then a full
// read, as before the engine. Signing out deletes every store on the device (wipeStores), and tells other tabs.

export const COLLS = ['cases', 'reflections', 'notes'];
const PREFIX = 'apmes-logbook-store:';
const REGISTRY = 'apmes-logbook-stores';   // localStorage: names opened here (indexedDB.databases() is not everywhere)
const realm = (() => { try { return typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo') ? 'demo:' : ''; } catch { return ''; } })();
export const storeName = email => PREFIX + realm + String(email || '').trim().toLowerCase();
// this mode's stores (the demo's and the real ones never touch each other)
const ours = name => name.startsWith(PREFIX + realm) && (realm !== '' || !name.startsWith(PREFIX + 'demo:'));

const memory = new Map();   // name -> { [coll]: Map, meta: { [coll]: meta } }
const handles = new Set();  // open handles in this tab (closed when another tab wipes)
const copy = v => JSON.parse(JSON.stringify(v));

function memoryStore(name) {
  if (!memory.has(name)) memory.set(name, { docs: Object.fromEntries([...COLLS, 'bin'].map(c => [c, new Map()])), meta: {} });
  const m = memory.get(name);
  return {
    name, kind: 'memory',
    get closed() { return memory.get(name) !== m; },
    async load(coll) { if (memory.get(name) !== m) return { docs: [], meta: {} }; return { docs: [...m.docs[coll].values()].map(copy), meta: copy(m.meta[coll] || {}) }; },
    async write(coll, { put = [], del = [], meta, replace = false } = {}) {
      if (memory.get(name) !== m) return;   // wiped (sign-out): never bring it back
      if (replace) m.docs[coll].clear();
      for (const id of del) m.docs[coll].delete(id);
      for (const d of put) m.docs[coll].set(d.id, copy(d));
      if (meta) m.meta[coll] = copy(meta);
    },
    close() {},
  };
}

const req = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
// version 1 has every object store; a database left without them (opened elsewhere without a version) is upgraded
function openDb(name, version = 1) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, version);
    r.onupgradeneeded = () => {
      for (const c of [...COLLS, 'meta']) if (!r.result.objectStoreNames.contains(c)) r.result.createObjectStore(c, { keyPath: c === 'meta' ? 'coll' : 'id' });
    };
    r.onsuccess = () => {
      const db = r.result;
      if ([...COLLS, 'meta'].every(c => db.objectStoreNames.contains(c))) return resolve(db);
      db.close();
      openDb(name, db.version + 1).then(resolve, reject);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Local store blocked by another tab'));
  });
}
function remember(name) {
  try { const l = JSON.parse(localStorage.getItem(REGISTRY) || '[]'); if (!l.includes(name)) localStorage.setItem(REGISTRY, JSON.stringify([...l, name])); } catch { /* storage blocked */ }
}

// an open that never settles (some WebKit builds; an open queued behind a delete another tab blocks) gives up after this
export const OPEN_WAIT = 4000;
// The store for one account. Never throws: a store that can't open (or doesn't open in time) is a memory store.
export async function openStore(email, wait = OPEN_WAIT) {
  const name = storeName(email);
  if (typeof indexedDB === 'undefined') return memoryStore(name);
  let db, timer;
  const opening = openDb(name);
  try {
    db = await Promise.race([opening, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Local store took too long to open')), wait); })]);
  } catch (e) {
    console.warn('Local store unavailable; using memory', e);
    opening.then(late => late.close(), () => {});   // (opened after all: let it go, this page uses memory now)
    return memoryStore(name);
  } finally { clearTimeout(timer); }
  remember(name);
  let dead = false;   // deleted (sign-out in another tab): forget everything, never recreate the database
  const handle = {
    name, kind: 'idb',
    get closed() { return dead; },
    async load(coll) {
      if (dead) return { docs: [], meta: {} };
      // the recycle bin keeps only its meta record (its entries are tombstones, applied to the other collections)
      const tx = db.transaction(coll === 'bin' ? ['meta'] : [coll, 'meta'], 'readonly');
      const [docs, meta] = await Promise.all([coll === 'bin' ? [] : req(tx.objectStore(coll).getAll()), req(tx.objectStore('meta').get(coll))]);
      return { docs, meta: meta || {} };
    },
    // one transaction: replace (clear first), deletes, puts and the meta record
    write(coll, { put = [], del = [], meta, replace = false } = {}) {
      if (dead) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const stores = coll === 'bin' ? ['meta'] : [coll, 'meta'];
        const tx = db.transaction(stores, 'readwrite');
        if (coll !== 'bin') {
          const s = tx.objectStore(coll);
          if (replace) s.clear();
          for (const id of del) s.delete(id);
          for (const d of put) s.put(d);
        }
        if (meta) tx.objectStore('meta').put({ ...meta, coll });
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('Local store write failed'));
      });
    },
    close() { dead = true; handles.delete(handle); try { db.close(); } catch { /* closed */ } },
  };
  // another tab deletes the database (sign-out) or a newer version of the app upgrades it: let go at once
  db.onversionchange = () => handle.close();
  handles.add(handle);
  return handle;
}

let channel = null;
try {
  if (typeof BroadcastChannel === 'function') {
    channel = new BroadcastChannel('apmes-logbook-store');
    // (one channel for both modes: a message names its mode, and a demo tab's sign-out never closes real stores)
    channel.onmessage = e => { if (e.data && e.data.wipe && (e.data.realm || '') === realm) closeAll(e.data.keep); };
    if (channel.unref) channel.unref();   // node (tests): don't keep the process alive
  }
} catch { channel = null; }

function closeAll(keep) {
  const k = new Set(Array.isArray(keep) ? keep : []);
  for (const h of [...handles]) if (ours(h.name) && !k.has(h.name)) h.close();
}

// Delete every account's store on this device (this mode only), in this tab and the others. Sign-out, account
// switch and Delete account: a shared ward PC keeps nothing. keep: emails whose stores stay (the account signed in
// now, which another tab may be using). Resolves when the deletes are done (or can't be).
export async function wipeStores(keep = []) {
  const kept = (Array.isArray(keep) ? keep : [keep]).filter(Boolean).map(storeName);
  closeAll(kept);
  for (const name of [...memory.keys()]) if (ours(name) && !kept.includes(name)) memory.delete(name);
  try { channel && channel.postMessage({ wipe: true, realm, keep: kept }); } catch { /* closed */ }
  if (typeof indexedDB === 'undefined') return;
  const names = new Set();
  try { for (const n of JSON.parse(localStorage.getItem(REGISTRY) || '[]')) names.add(n); } catch { /* storage blocked */ }
  try { if (indexedDB.databases) for (const d of await indexedDB.databases()) if (d.name && d.name.startsWith(PREFIX)) names.add(d.name); } catch { /* not supported */ }
  const mine = [...names].filter(n => ours(n) && !kept.includes(n));
  await Promise.all(mine.map(n => new Promise(resolve => {
    try {
      const r = indexedDB.deleteDatabase(n);
      r.onsuccess = r.onerror = () => resolve();
      r.onblocked = () => setTimeout(resolve, 1500);   // an old tab holds it open; it closes on versionchange
    } catch { resolve(); }
  })));
  try { localStorage.setItem(REGISTRY, JSON.stringify([...names].filter(n => !mine.includes(n)))); } catch { /* storage blocked */ }
}
