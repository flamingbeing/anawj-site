// where storage is blocked, reading window.localStorage itself throws: then reads find nothing and saves throw (the
// caller says the draft isn't saved)
const NONE = Object.freeze({ getItem: () => null, setItem() { throw new Error('storage unavailable'); }, removeItem() {} });
const local = () => { try { return globalThis.localStorage || NONE; } catch { return NONE; } };
const sessionStore = () => { try { return globalThis.sessionStorage || NONE; } catch { return NONE; } };
// Each browser document owns its slot. Reload restores that slot; other tabs
// retain independent drafts, including duplicated tabs inheriting sessionStorage.
// move: the old slot is taken over, not copied (the case box: one draft at a time). Reflections keep the copy: a
// new reflection reuses the slot, so the copy is how the earlier draft stays recoverable.
export function createDraftSlot(prefix, owner, storage = local(), session = sessionStore(), { move = false } = {}) {
  const pointer = prefix + ':active:' + owner;
  let previous = null;
  try { previous = session.getItem(pointer); } catch { /* storage may be denied */ }
  const key = prefix + ':' + owner + ':' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2);
  // a slot's document set it down (the page hidden or unloading): the next document to open it may take it over
  const released = k => prefix + ':released:' + k.slice(prefix.length + 1);
  const from = previous || prefix + ':' + owner;
  let initial = null;
  try { initial = JSON.parse(storage.getItem(from) || 'null'); } catch { /* readable storage unavailable */ }
  // Copy on open rather than reusing the old slot: two documents can never
  // overwrite one another even when the browser clones session storage.
  const remember = () => { try { session.setItem(pointer, key); } catch { /* recoverable through Recent changes */ } };
  if (initial !== null) {
    try {
      storage.setItem(key, JSON.stringify(initial)); remember();
      // the old slot moves over rather than staying behind as a copy (a reload, or the phone unloading the app,
      // would otherwise leave one each time, listed later as an unfinished draft after the case was saved); a slot
      // another document still holds (a duplicated tab) stays
      if (move && (!previous || storage.getItem(released(from)) != null)) { storage.removeItem(from); storage.removeItem(released(from)); }
    } catch { /* keep the previous pointer until a successful write */ }
  }
  const release = () => { try { storage.setItem(released(key), '1'); } catch { /* as above */ } };
  const hold = () => { try { storage.removeItem(released(key)); } catch { /* as above */ } };
  if (move && typeof document !== 'undefined' && typeof addEventListener === 'function') {
    addEventListener('pagehide', release);
    document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? release() : hold()));
  }
  return {
    key, initial, release,
    save(value) { storage.setItem(key, JSON.stringify(value)); remember(); hold(); },
    clear() { storage.removeItem(key); hold(); },
  };
}
export function listDrafts(prefix, owner, storage = local()) {
  return Object.keys(storage).filter(k => k.startsWith(prefix + ':' + owner + ':'))
    .map(key => { try { return { key, value: JSON.parse(storage.getItem(key)) }; } catch { return null; } }).filter(Boolean);
}
