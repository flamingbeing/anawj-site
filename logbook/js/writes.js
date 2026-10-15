import { recoveryStore, recordSignature } from './recovery-store.js';
const copy = value => JSON.parse(JSON.stringify(value));
const keyOf = job => job.kind + ':' + job.record.id;
const same = (a, b) => recordSignature(a) === recordSignature(b);
const terminal = new Set(['synced', 'archived']);
// the network dropped mid-save (Firestore: 'unavailable', 'deadline-exceeded'): the job stays pending and tries again
const transient = error => error?.code === 'unavailable' || error?.code === 'deadline-exceeded';
const failure = job => new Error(/Recent changes/.test(job.error) ? job.error : job.error + ' — a copy is kept in Recent changes');
export function createWriteQueue({ store, backend, getOwner = () => null, normalize = (_kind, value) => value, online = () => true, delay = ms => new Promise(r => setTimeout(r, ms)) }) {
  let owner = null, generation = 0, jobs = [], loading = null, storageError = '';
  const running = new Map(), listeners = new Set(), waits = new Map();
  const notify = () => { for (const fn of listeners) fn(); };
  const current = (email, gen) => owner === email && generation === gen && getOwner() === email;
  const ordered = () => [...jobs].sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
  // a record's saves not yet done with, oldest first: only the first is ever sent
  const chainOf = id => ordered().filter(x => keyOf(x) === id && !terminal.has(x.state));
  async function persist(job) { await store.put(copy(job)); }
  // Another window on this device (a second tab, or the home-screen app beside the browser) shares the store and may
  // have sent or set aside a job since this one read it: what it stored wins, or this window sends its stale copy
  // later (a case deleted there comes back, one restored there is deleted again). Two windows sending one job at the
  // same moment is harmless (checkWrite: same content); no Web Lock, which a frozen background window would hold.
  // -> true when the job moved on
  async function refresh(job) {
    let stored;
    try { stored = await store.get(job.key); } catch { return false; }   // unreadable: carry on as before
    // (not there, as when the browser cleared the site's storage: this window's copy may be the only one, so it goes)
    if (!stored || stored.state === job.state || stored.state === 'pending') return false;
    Object.assign(job, { state: stored.state, error: stored.error || '', result: stored.result, remote: stored.remote, accepted: stored.accepted });
    return true;
  }
  async function drain(id) {
    if (running.has(id)) return running.get(id);
    const email = owner, gen = generation;
    const task = (async () => {
      while (true) {
        const job = chainOf(id)[0];
        if (!job || !current(email, gen) || !online() || job.state !== 'pending') break;
        const moved = await refresh(job);
        if (!current(email, gen)) return;
        if (moved) { notify(); continue; }
        try {
          const result = await backend(email, job.kind, copy(job.record), copy(job.base));
          if (!current(email, gen)) return;
          job.result = copy(result); job.state = 'synced'; job.error = '';
        } catch (error) {
          if (!current(email, gen)) return;
          if (transient(error)) { job.error = 'Waiting for the connection'; retryLater(id, email, gen); notify(); break; }
          job.state = error.code === 'write-conflict' ? 'conflict' : 'failed';
          job.error = error.message || 'Could not save';
          if (error.remote !== undefined) job.remote = copy(error.remote);
        }
        try { await persist(job); } catch (error) { storageError = error.message; }
        notify();
        if (job.state !== 'synced') break;
        waits.delete(id);
      }
      // Keep a short device history; failed/conflicting/pending records never expire here.
      const old = ordered().filter(x => terminal.has(x.state)).slice(0, -100);
      for (const job of old) { await store.remove(job.key); jobs = jobs.filter(x => x !== job); }
    })().finally(() => {
      if (running.get(id) !== task) return;
      running.delete(id);
      if (current(email, gen) && online() && !waits.get(id)?.timer && chainOf(id)[0]?.state === 'pending') void drain(id).catch(error => { storageError = error.message; notify(); });
    });
    running.set(id, task); return task;
  }
  // back off 2 s, 4 s … up to a minute; going online (kick) tries at once
  function retryLater(id, email, gen) {
    const wait = waits.get(id) || { tries: 0 }; wait.tries++; waits.set(id, wait);
    const timer = wait.timer = {};
    delay(Math.min(60000, 1000 * 2 ** wait.tries)).then(() => {
      if (wait.timer !== timer) return; wait.timer = null;
      if (current(email, gen)) void drain(id).catch(error => { storageError = error.message; notify(); });
    });
  }
  async function activate(email) {
    if (owner === email && loading) return loading;
    owner = email; const gen = ++generation; jobs = []; running.clear(); waits.clear(); storageError = '';
    loading = (async () => {
      try { const found = await store.list(email); if (current(email, gen)) jobs = found; }
      catch (error) { if (current(email, gen)) storageError = error.message; }
      if (current(email, gen)) { notify(); kick(); }
    })();
    return loading;
  }
  function kick() { for (const wait of waits.values()) wait.timer = null; if (owner && getOwner() === owner) for (const id of new Set(jobs.map(keyOf))) void drain(id).catch(error => { storageError = error.message; notify(); }); }
  async function save(kind, email, record, base = null) {
    record = copy(normalize(kind, copy(record))); base = copy(base);
    if (getOwner() !== email) throw new Error('Account changed; the editor has not been saved');
    await activate(email); const gen = generation, id = kind + ':' + record.id;
    let moved = false;
    for (const x of chainOf(id)) moved = await refresh(x) || moved;
    if (!current(email, gen)) throw new Error('Account changed; the editor has not been saved');
    if (moved) notify();
    const chain = chainOf(id), previous = chain.at(-1), conflict = chain.find(x => x.state === 'conflict');
    // After a conflict nothing more is sent until the resident chooses in Recent changes: a later save waited behind it
    // for good, said 'Saved locally', and either conflict button set it aside (14 Oct 2026). Made on the other copy
    // (the version shown), it takes the stopped chain's place; unchanged, it changes nothing (opening a record is no
    // choice). Made on this device's own version, it is kept as one more conflict and fails, so the editor keeps it.
    const over = !!conflict && same(base, conflict.remote), held = !!conflict && !over;
    if (over && same(record, base)) return copy(record);
    // a failed save, or a held copy (never sent), is replaced by the next one
    const stale = !over && previous && (previous.state === 'failed' || held && previous.state === 'conflict' && previous !== chain[0]) ? previous : null;
    let job;
    if (stale && same(stale.record, record)) {
      job = stale; if (!held) { job.state = 'pending'; job.error = ''; }
    } else {
      job = { key: email + ':' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2), owner: email,
        kind, record: copy(record), base: copy(stale?.state === 'failed' ? stale.base : base), state: held ? 'conflict' : 'pending', accepted: false, at: Math.max(Date.now(), ...jobs.map(x => x.at + 1)) };
      if (held) { job.remote = copy(conflict.remote ?? null); job.error = conflict.error; }
    }
    try { await persist(job); storageError = ''; }
    catch { storageError = 'Local storage is unavailable. Your input has not been cleared.'; notify(); throw new Error(storageError); }
    if (!current(email, gen)) throw new Error('Account changed; the editor has not been saved');
    // set aside once the new save is stored: the one it replaces, or (made on the other copy) the whole stopped chain
    for (const x of over ? chain : stale && stale !== job ? [stale] : []) { x.state = 'archived'; await persist(x); }
    if (!jobs.includes(job)) jobs.push(job);
    notify();
    if (held) throw failure(job);
    await Promise.race([drain(keyOf(job)), delay(180)]);
    if (!current(email, gen)) throw new Error('Account changed; the editor has not been saved');
    if (job.state === 'failed' || job.state === 'conflict') throw failure(job);
    job.accepted = true; await persist(job); notify();
    return copy(job.result || job.record);
  }
  function overlay(kind, email, list) {
    if (email !== owner) return list;
    const result = new Map(list.map(r => [r.id, r]));
    for (const id of new Set(jobs.filter(x => x.kind === kind).map(x => x.record.id))) {
      const group = chainOf(kind + ':' + id), conflicts = group.filter(x => x.state === 'conflict');
      if (conflicts.length) {
        // The list is the server's copy (the sync engine), so an edit or delete made elsewhere since the conflict shows;
        // it showed the copy found at the conflict, and counted it (parked seed 285932884). That copy shows only while
        // the list still has this device's own unsynced version (or the one it started from), or its delete took it off.
        const cur = result.get(id), sig = recordSignature(cur || null);
        if (cur ? group.some(x => recordSignature(x.record) === sig || recordSignature(x.base) === sig) : group.some(x => x.record._deleted)) {
          const { remote } = conflicts[0]; if (remote) result.set(id, remote); else result.delete(id);
        } else if (cur) for (const x of conflicts) if (recordSignature(x.remote) !== sig) x.remote = copy(cur);   // Recent changes' other copy
      } else { const latest = group.filter(x => x.accepted).at(-1); if (latest) { if (latest.record._deleted) result.delete(id); else result.set(id, latest.record); } }
    }
    return [...result.values()];
  }
  async function retry(key) {
    const job = jobs.find(x => x.key === key), email = owner, gen = generation;
    if (!job || getOwner() !== owner || job.state === 'conflict') return;
    if (await refresh(job)) notify();
    if (!current(email, gen) || (job.state !== 'failed' && job.state !== 'pending')) return;
    if (chainOf(keyOf(job))[0]?.state === 'conflict') throw new Error('An earlier save of this record met a change made elsewhere: choose a version there first');
    job.state = 'pending'; job.error = ''; await persist(job); notify(); await drain(keyOf(job));
  }
  // sets aside that save and older ones, never a newer save (it is sent next, or meets the conflict again)
  async function archive(key) {
    const job = jobs.find(x => x.key === key); if (!job || getOwner() !== owner) return;
    const chain = chainOf(keyOf(job));
    for (const item of chain.slice(0, chain.indexOf(job) + 1)) { item.state = 'archived'; await persist(item); }
    notify();
    void drain(keyOf(job)).catch(error => { storageError = error.message; notify(); });
  }
  async function forget() {
    const old = owner; owner = null; ++generation; loading = null; jobs = []; running.clear(); waits.clear(); storageError = ''; notify();
    if (old) await store.forget(old);
  }
  return { activate, save, overlay, retry, archive, forget, kick,
    configure(config) { if (config.backend) backend = config.backend; if (config.getOwner) getOwner = config.getOwner; if (config.normalize) normalize = config.normalize; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    entries: () => copy(ordered().reverse()),
    pending: () => jobs.filter(x => !terminal.has(x.state)).length,
    async flush(ms = 4000) {
      kick(); await Promise.race([Promise.all([...running.values()]), delay(ms)]);
      if (jobs.some(x => !terminal.has(x.state))) return false;
      // changes another tab (or the home-screen app) has not synced yet are in the same store: signing out deletes them
      if (!owner) return true;
      try { const mine = new Set(jobs.map(x => x.key)); return !(await store.list(owner)).some(x => !mine.has(x.key) && !terminal.has(x.state)); }
      catch { return true; }
    },
    error: () => storageError,
    status(kind, id) { return [...ordered()].reverse().find(x => x.kind === kind && x.record.id === id)?.state || ''; },
  };
}
export const writes = createWriteQueue({ store: recoveryStore, online: () => typeof navigator === 'undefined' || navigator.onLine !== false });
if (typeof window !== 'undefined') window.addEventListener('online', () => writes.kick());
