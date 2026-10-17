// A stand-in for the Firebase SDK (app, auth and Firestore in one module) for Node tests of cloud.js's real (not demo)
// code: an in-memory "server", batches that land after a scripted delay on the test's clock, and server reads that can
// be made to fail. form-pickup.test.mjs maps the gstatic SDK URLs here (module.register). Fake data only.
export const server = new Map();   // 'logbooks/<email>/cases/<id>' -> data
// delays: ms each batch commit takes (the server answering), in turn; wait(ms): moves the test's clock;
// fail: collection paths whose server reads fail (offline, or the server unreachable)
export const net = { delays: [], wait: async () => {}, fail: new Set() };
const copy = o => JSON.parse(JSON.stringify(o));

export const initializeApp = cfg => ({ cfg });
export const getAuth = app => ({ app, currentUser: null });
export const connectAuthEmulator = () => {};
export const persistentLocalCache = () => ({}), persistentMultipleTabManager = () => ({}), memoryLocalCache = () => ({});
export const initializeFirestore = () => ({}), getFirestore = () => ({}), connectFirestoreEmulator = () => {};

export const doc = (db, ...p) => ({ path: p.join('/'), id: String(p[p.length - 1]) });
export const collection = (db, ...p) => ({ path: p.join('/') });
const docsIn = path => [...server].filter(([k]) => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/'))
  .map(([k, v]) => ({ id: k.slice(path.length + 1), data: () => copy(v), exists: () => true }));
export async function getDocsFromServer(col) {
  if (net.fail.has(col.path)) throw new Error('Failed to get documents from server (fake)');
  const docs = docsIn(col.path);
  return { docs, size: docs.length };
}
// the offline cache: always empty here, so a test can tell which one was read (a failing path fails here too: refused)
export async function getDocs(col) {
  if (net.fail.has(col.path)) throw new Error('Missing or insufficient permissions (fake)');
  return { docs: [], size: 0 };
}
export async function setDoc(ref, d) { server.set(ref.path, copy(d)); }
export function writeBatch() {
  const ops = [];
  const b = {
    set(ref, d) { ops.push(m => m.set(ref.path, copy(d))); return b; },
    update(ref, d) { ops.push(m => { if (!m.has(ref.path)) throw new Error('No document to update (fake)'); m.set(ref.path, { ...m.get(ref.path), ...copy(d) }); }); return b; },
    delete(ref) { ops.push(m => m.delete(ref.path)); return b; },
    // all or nothing, after the server's delay
    async commit() {
      await net.wait(net.delays.length ? net.delays.shift() : 0);
      const next = new Map(server);
      for (const op of ops) op(next);
      server.clear();
      for (const [k, v] of next) server.set(k, v);
    },
  };
  return b;
}
