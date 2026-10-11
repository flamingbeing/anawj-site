// Browser history for app screens. Only route names/scroll positions go into history,
// never account details or case data. The demo's query string stays on every route.
export function createNavigation({ history, location, parents, allowed, onNavigate, getScroll = () => 0 }) {
  const base = () => location.pathname + location.search;
  const url = tab => base() + '#' + tab;
  let active = null;
  const read = () => {
    const n = history.state && history.state.logbookNav;
    return n && n.base === base() && allowed(n.tab) && Array.isArray(n.trail) ? n : null;
  };
  const write = (n, replace = false) => {
    history[replace ? 'replaceState' : 'pushState']({ ...(history.state || {}), logbookNav: n }, '', url(n.tab));
    active = n;
  };
  const entry = (tab, trail = [], scroll = 0) => ({ base: base(), tab, trail: trail.slice(-100), scroll });
  function initialize(tab) {
    const existing = read();
    if (existing && existing.tab === tab) { active = existing; return; }
    // A direct link gets a finite parent trail: Display -> Settings -> More -> exit.
    // The main tabs get no artificial entry, so Back at the start can leave normally.
    const chain = [tab], seen = new Set(chain);
    while (parents[chain[0]] && allowed(parents[chain[0]]) && !seen.has(parents[chain[0]])) {
      const parent = parents[chain[0]]; seen.add(parent); chain.unshift(parent);
    }
    write(entry(chain[0]), true);
    for (const next of chain.slice(1)) write(entry(next, [...active.trail, { tab: active.tab, scroll: 0 }]));
  }
  function remember() {
    if (!active || location.hash !== '#' + active.tab) return;
    const current = read();
    if (!current || current.tab !== active.tab) return;
    write({ ...current, scroll: getScroll() }, true);
  }
  function go(tab, { replace = false } = {}) {
    if (!allowed(tab) || active?.tab === tab) return false;
    remember();
    const trail = active ? [...active.trail, { tab: active.tab, scroll: active.scroll }] : [];
    write(entry(tab, replace ? active?.trail || [] : trail), replace);
    onNavigate(tab, 0);
    return true;
  }
  function sync(tab) {
    if (!allowed(tab)) return;
    const changed = active?.tab !== tab;
    let n = read();
    if (!n || n.tab !== tab) {
      // A native hash change (including callers outside app.js) already pushed
      // an entry. Tag it rather than adding a second entry for the same click.
      const trail = active ? [...active.trail, { tab: active.tab, scroll: active.scroll }] : [];
      n = entry(tab, trail); write(n, true);
    }
    active = n;
    if (changed) onNavigate(tab, n.scroll || 0);
  }
  function backTarget(parent) {
    const previous = active?.trail.at(-1)?.tab;
    return previous && allowed(previous) ? previous : parent;
  }
  function back(parent) {
    const previous = active?.trail.at(-1)?.tab;
    if (previous && allowed(previous)) history.back();
    else if (parent) go(parent, { replace: true });
  }
  return { initialize, go, sync, remember, back, backTarget };
}
