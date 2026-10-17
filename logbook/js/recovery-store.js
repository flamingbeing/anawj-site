// Private device recovery records. A completed transaction (or a successful
// localStorage fallback) is required before an editor may discard its input.
const PREFIX = 'apmes-logbook-recovery:';
const realm = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo') ? 'demo' : 'account';
let opened = null;
async function database() {
  if (!opened) opened = new Promise((resolve, reject) => {
    const request = indexedDB.open('apmes-logbook-recovery', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('changes', { keyPath: 'key' });
      store.createIndex('owner', 'owner');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close older logbook tabs to enable recovery storage'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opened = null; };
      resolve(db);
    };
  }).catch(error => { opened = null; throw error; });
  return opened;
}
async function transaction(mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('changes', mode), store = tx.objectStore('changes');
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Recovery storage write failed'));
    const request = operation(store);
    if (request) request.onsuccess = () => { result = request.result; };
  });
}
const fallbackRecords = owner => Object.keys(localStorage).filter(k => k.startsWith(PREFIX))
  .map(k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } })
  .filter(x => x && x.owner === owner);
export const recoveryStore = {
  async put(record) {
    const copy = { ...JSON.parse(JSON.stringify(record)), realm };
    try {
      await transaction('readwrite', store => store.put(copy));
      try { localStorage.removeItem(PREFIX + copy.key); } catch { /* IndexedDB succeeded */ }
    }
    catch { localStorage.setItem(PREFIX + copy.key, JSON.stringify(copy)); }
    return copy;
  },
  async list(owner) {
    let records = [], succeeded = false;
    try { records = await transaction('readonly', store => store.index('owner').getAll(owner)); succeeded = true; } catch { /* try fallback */ }
    try { records.push(...fallbackRecords(owner)); succeeded = true; } catch { /* storage blocked */ }
    if (!succeeded) throw new Error('Local recovery storage is unavailable; keep your text in the editor');
    return [...new Map(records.filter(x => x.realm === realm).map(x => [x.key, x])).values()];
  },
  // one change by key: the write queue reads it again before sending (another tab may have sent it). A fallback copy
  // is the newer one (a successful IndexedDB write removes it); an unreadable database throws, never reads as gone.
  async get(key) {
    let record = null;
    try { record = JSON.parse(localStorage.getItem(PREFIX + key)); } catch { /* storage blocked */ }
    record ||= await transaction('readonly', store => store.get(key));
    return record && record.realm === realm ? record : null;
  },
  async remove(key) {
    try { await transaction('readwrite', store => store.delete(key)); } catch { /* fallback may be in use */ }
    try { localStorage.removeItem(PREFIX + key); } catch { /* blocked */ }
  },
  async forget(owner) {
    const failed = [];
    // Cleanup must never mistake an unreadable IndexedDB for an empty database.
    if (typeof indexedDB !== 'undefined') {
      try {
        const records = await transaction('readonly', store => store.index('owner').getAll(owner));
        for (const r of records.filter(x => x.realm === realm)) await transaction('readwrite', store => store.delete(r.key));
      } catch (err) { failed.push(err); }
    }
    try { for (const r of fallbackRecords(owner).filter(x => x.realm === realm)) localStorage.removeItem(PREFIX + r.key); }
    catch (err) { failed.push(err); }
    if (failed.length) throw new Error('Some device recovery copies could not be removed. Close other logbook tabs and clear this site’s storage before sharing the device.');
  },
};

// Pure equality for concurrency checks. The backend refreshes updatedAt on
// save; identical content retried after an acknowledgement loss is idempotent.
export function recordSignature(record) {
  const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().filter(k => k !== 'updatedAt').map(k => [k, sort(value[k])])) : value;
  return JSON.stringify(sort(record || null));
}

export function checkWrite(current, desired, base) {
  if (recordSignature(current) === recordSignature(desired)) return false;
  if (recordSignature(current) !== recordSignature(base)) {
    const error = new Error('This record changed elsewhere. Both versions are kept in Recover');
    error.code = 'write-conflict'; error.remote = current || null; throw error;
  }
  return true;
}
