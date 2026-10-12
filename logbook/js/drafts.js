// Each browser document owns its slot. Reload restores that slot; other tabs
// retain independent drafts, including duplicated tabs inheriting sessionStorage.
export function createDraftSlot(prefix, owner, storage = localStorage, session = sessionStorage) {
  const pointer = prefix + ':active:' + owner;
  let previous = null;
  try { previous = session.getItem(pointer); } catch { /* storage may be denied */ }
  const key = prefix + ':' + owner + ':' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2);
  let initial = null;
  try { initial = JSON.parse(storage.getItem(previous || prefix + ':' + owner) || 'null'); } catch { /* readable storage unavailable */ }
  // Copy on open rather than reusing the old slot: two documents can never
  // overwrite one another even when the browser clones session storage.
  const remember = () => { try { session.setItem(pointer, key); } catch { /* recoverable through Recent changes */ } };
  if (initial !== null) { try { storage.setItem(key, JSON.stringify(initial)); remember(); } catch { /* keep the previous pointer until a successful write */ } }
  return {
    key, initial,
    save(value) { storage.setItem(key, JSON.stringify(value)); remember(); },
    clear() { storage.removeItem(key); },
  };
}
export function listDrafts(prefix, owner, storage = localStorage) {
  return Object.keys(storage).filter(k => k.startsWith(prefix + ':' + owner + ':'))
    .map(key => { try { return { key, value: JSON.parse(storage.getItem(key)) }; } catch { return null; } }).filter(Boolean);
}
