// A finite history entry for each dialog/editor. State contains opaque IDs only,
// never the editor's record or account. Back dismisses the top view first.
export function createTransients({ history, location, events }) {
  const entries = [];
  const base = () => location.pathname + location.search;
  const ids = () => history.state?.logbookTransient?.base === base() ? history.state.logbookTransient.ids || [] : [];
  let serial = 0;
  function finish(entry) {
    if (!entry.active) return;
    entry.active = false;
    entries.splice(entries.indexOf(entry), 1);
    try { entry.dismiss(); } finally { entry.resolve?.(); }
  }
  function sync() {
    const present = new Set(ids());
    for (const entry of [...entries].reverse()) if (!present.has(entry.id)) finish(entry);
  }
  events.addEventListener('popstate', sync, true);
  events.addEventListener('hashchange', sync, true);
  function open(dismiss) {
    const previous = ids(), inherited = previous.at(-1);
    const reuse = inherited && !entries.some(x => x.id === inherited);
    const id = reuse ? inherited : 'view-' + Date.now().toString(36) + '-' + ++serial;
    const entry = { id, dismiss, active: true, pending: null };
    if (!reuse) history.pushState({ ...(history.state || {}), logbookTransient: { base: base(), ids: [...ids(), id] } }, '', location.pathname + location.search + location.hash);
    entries.push(entry);
    return {
      get active() { return entry.active; },
      close() {
        if (!entry.active) return Promise.resolve();
        if (entry.pending) return entry.pending;
        if (ids().at(-1) !== id) { finish(entry); return Promise.resolve(); }
        entry.pending = new Promise(resolve => { entry.resolve = resolve; });
        history.back();
        return entry.pending;
      },
    };
  }
  async function dismissAll() {
    while (entries.length) {
      const entry = entries.at(-1);
      if (entry.pending) await entry.pending;
      else if (ids().at(-1) === entry.id) {
        entry.pending = new Promise(resolve => { entry.resolve = resolve; });
        history.back(); await entry.pending;
      } else finish(entry);
    }
  }
  function reset() {
    // Sign-out: callbacks must not write old drafts into the next account.
    for (const entry of entries.splice(0)) { entry.active = false; entry.resolve?.(); }
    history.replaceState({ ...(history.state || {}), logbookTransient: { base: base(), ids: [] } }, '', location.pathname + location.search + location.hash);
  }
  return { open, dismissAll, reset };
}
export const transients = typeof window === 'undefined' ? null : createTransients({ history: window.history, location: window.location, events: window });
