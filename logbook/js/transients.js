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
  // A close's history.back() lands later (WebKit: much later). A page opened in between (location.hash = …) is pushed
  // on top of the closing entry, so the late step lands on that entry and would undo the newer page. Each step on
  // its way is kept here; when one lands on its own closing entry, the newer page is put back without a new entry.
  const steps = [];
  const href = () => location.href ?? location.pathname + location.search + location.hash;
  function goBack(id) { steps.push({ id, from: href(), to: null, at: Date.now() }); history.back(); }
  function repair() {
    // Chromium fires popstate for a hash change too, so a popstate isn't always the step: each step is matched by
    // where it lands (its own closing entry: undo it; the address it left from: landed as asked; else still to come)
    for (const step of [...steps]) {
      const here = ids(), own = here.includes(step.id);
      if (Date.now() - step.at > 10000) { steps.splice(steps.indexOf(step), 1); continue; }   // never landed
      if (!own && href() !== step.from) continue;
      steps.splice(steps.indexOf(step), 1);
      if (!own) continue;
      const state = { ...(history.state || {}), logbookTransient: { base: base(), ids: here.slice(0, here.indexOf(step.id)) } };
      if (step.to) history.replaceState(state, '', step.to);
      else { history.replaceState(state, '', href()); history.forward(); }   // the newer page's address went unseen: step to it
    }
  }
  events.addEventListener('popstate', () => { repair(); sync(); }, true);
  events.addEventListener('hashchange', e => {
    const to = e?.newURL || href();
    for (const step of steps) if (to !== step.from) step.to = to;
    sync();
  }, true);
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
        goBack(id);
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
        goBack(entry.id); await entry.pending;
      } else finish(entry);
    }
  }
  function reset() {
    // Sign-out: callbacks must not write old drafts into the next account.
    for (const entry of entries.splice(0)) { entry.active = false; entry.resolve?.(); }
    steps.length = 0;
    history.replaceState({ ...(history.state || {}), logbookTransient: { base: base(), ids: [] } }, '', location.pathname + location.search + location.hash);
  }
  return { open, dismissAll, reset };
}
export const transients = typeof window === 'undefined' ? null : createTransients({ history: window.history, location: window.location, events: window });
