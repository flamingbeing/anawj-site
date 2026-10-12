import { recoveryStore, recordSignature } from './recovery-store.js';
const copy = value => JSON.parse(JSON.stringify(value));
const keyOf = job => job.kind + ':' + job.record.id;
const terminal = new Set(['synced', 'archived']);
export function createWriteQueue({ store, backend, getOwner = () => null, online = () => true, delay = ms => new Promise(r => setTimeout(r, ms)) }) {
  let owner = null, generation = 0, jobs = [], loading = null, storageError = '';
  const running = new Map(), listeners = new Set();
  const notify = () => { for (const fn of listeners) fn(); };
  const current = (email, gen) => owner === email && generation === gen && getOwner() === email;
  const ordered = () => [...jobs].sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
  async function persist(job) { await store.put(copy(job)); }
  async function drain(id) {
    if (running.has(id)) return running.get(id);
    const email = owner, gen = generation;
    const task = (async () => {
      for (const job of ordered().filter(x => keyOf(x) === id && !terminal.has(x.state))) {
        if (!current(email, gen) || !online() || job.state !== 'pending') break;
        try {
          const result = await backend(email, job.kind, copy(job.record), copy(job.base));
          if (!current(email, gen)) return;
          job.result = copy(result); job.state = 'synced'; job.error = '';
        } catch (error) {
          if (!current(email, gen)) return;
          job.state = error.code === 'write-conflict' ? 'conflict' : 'failed';
          job.error = error.message || 'Could not save';
          if (error.remote !== undefined) job.remote = copy(error.remote);
        }
        try { await persist(job); } catch (error) { storageError = error.message; }
        notify();
        if (job.state !== 'synced') break;
      }
      // Keep a short device history; failed/conflicting/pending records never expire here.
      const old = ordered().filter(x => terminal.has(x.state)).slice(0, -100);
      for (const job of old) { await store.remove(job.key); jobs = jobs.filter(x => x !== job); }
    })().finally(() => { if (running.get(id) === task) running.delete(id); });
    running.set(id, task); return task;
  }
  async function activate(email) {
    if (owner === email && loading) return loading;
    owner = email; const gen = ++generation; jobs = []; running.clear(); storageError = '';
    loading = (async () => {
      try { const found = await store.list(email); if (current(email, gen)) jobs = found; }
      catch (error) { if (current(email, gen)) storageError = error.message; }
      if (current(email, gen)) { notify(); kick(); }
    })();
    return loading;
  }
  function kick() { if (owner && getOwner() === owner) for (const id of new Set(jobs.map(keyOf))) void drain(id).catch(error => { storageError = error.message; notify(); }); }
  async function save(kind, email, record, base = null) {
    record = copy(record); base = copy(base);
    if (getOwner() !== email) throw new Error('Account changed; the editor has not been saved');
    await activate(email); const gen = generation;
    const previous = [...ordered()].reverse().find(x => x.kind === kind && x.record.id === record.id && !terminal.has(x.state));
    let job;
    if (previous && previous.state === 'failed' && recordSignature(previous.record) === recordSignature(record)) {
      job = previous; job.state = 'pending'; job.error = '';
    } else {
      job = { key: email + ':' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2), owner: email,
        kind, record: copy(record), base: copy(previous?.state === 'failed' ? previous.base : base), state: 'pending', accepted: false, at: Math.max(Date.now(), ...jobs.map(x => x.at + 1)) };
    }
    try { await persist(job); storageError = ''; }
    catch { storageError = 'Local storage is unavailable. Your input has not been cleared.'; notify(); throw new Error(storageError); }
    if (!current(email, gen)) throw new Error('Account changed; the editor has not been saved');
    if (previous && previous !== job && previous.state === 'failed') { previous.state = 'archived'; await persist(previous); }
    if (!jobs.includes(job)) jobs.push(job);
    notify();
    await Promise.race([drain(keyOf(job)), delay(180)]);
    if (!current(email, gen)) throw new Error('Account changed; the editor has not been saved');
    if (job.state === 'failed' || job.state === 'conflict') throw new Error(job.error + ' — a copy is kept in Recent changes');
    job.accepted = true; await persist(job); notify();
    return copy(job.result || job.record);
  }
  function overlay(kind, email, list) {
    if (email !== owner) return list;
    const result = new Map(list.map(r => [r.id, r]));
    for (const id of new Set(jobs.filter(x => x.kind === kind).map(x => x.record.id))) {
      const group = ordered().filter(x => x.kind === kind && x.record.id === id && !terminal.has(x.state));
      const conflict = group.find(x => x.state === 'conflict');
      if (conflict) { if (conflict.remote) result.set(id, conflict.remote); else result.delete(id); }
      else { const latest = group.filter(x => x.accepted).at(-1); if (latest) { if (latest.record._deleted) result.delete(id); else result.set(id, latest.record); } }
    }
    return [...result.values()];
  }
  async function retry(key) {
    const job = jobs.find(x => x.key === key); if (!job || getOwner() !== owner || job.state === 'conflict') return;
    job.state = 'pending'; job.error = ''; await persist(job); notify(); await drain(keyOf(job));
  }
  async function archive(key) {
    const job = jobs.find(x => x.key === key); if (!job || getOwner() !== owner) return;
    for (const item of jobs.filter(x => keyOf(x) === keyOf(job) && !terminal.has(x.state))) { item.state = 'archived'; await persist(item); }
    notify();
  }
  async function forget() {
    const old = owner; owner = null; ++generation; loading = null; jobs = []; running.clear(); storageError = ''; notify();
    if (old) await store.forget(old);
  }
  return { activate, save, overlay, retry, archive, forget, kick,
    configure(config) { backend = config.backend; getOwner = config.getOwner; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    entries: () => copy(ordered().reverse()),
    pending: () => jobs.filter(x => !terminal.has(x.state)).length,
    async flush(ms = 4000) { kick(); await Promise.race([Promise.all([...running.values()]), delay(ms)]); return !jobs.some(x => !terminal.has(x.state)); },
    error: () => storageError,
    status(kind, id) { return [...ordered()].reverse().find(x => x.kind === kind && x.record.id === id)?.state || ''; },
  };
}
export const writes = createWriteQueue({ store: recoveryStore, online: () => typeof navigator === 'undefined' || navigator.onLine !== false });
if (typeof window !== 'undefined') window.addEventListener('online', () => writes.kick());
