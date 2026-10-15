// NTF Roster: the installable app's two helpers.
// 1. registerSW(): installs sw.js (the offline app shell) and offers "Update available: Reload" when a new version
//    has downloaded. app.js calls it once at start.
// 2. renderVersion(el): the two small lines that end the settings screen (AGENTS.md, "App version and Get the latest
//    version"): which saved copy this phone runs, and a way out for a phone stuck on an old one. That way out only
//    clears this app's own saved copy (its service worker and its 'ntf-roster-' caches), never the roster saved in
//    this browser (localStorage, IndexedDB) or sign-in.

const PREFIX = 'ntf-roster-';
// the app's folder: '/ntf-roster/' on anawj.com, '/' on ntfroster.anawj.com (this file is in js/)
const APP_ROOT = new URL('../', import.meta.url).href;
const SW_URL = new URL('sw.js', APP_ROOT).href;

// 'ntf-roster-2026-10-14-3f9a2c1d' -> '2026-10-14 (3f9a2c1d)'; an undated name shows as it is; '' when none.
export function versionLabel(cacheNames) {
  const k = (cacheNames || []).find(x => x.startsWith(PREFIX));
  if (!k) return '';
  const v = k.slice(PREFIX.length), d = /^(\d{4}-\d{2}-\d{2})-([0-9a-f]+)$/.exec(v);
  return d ? `${d[1]} (${d[2]})` : v;
}

export async function appVersion() {
  try { return window.caches ? versionLabel(await caches.keys()) : ''; } catch { return ''; }
}

// Check for signal first (sw.js straight from the network); with none, change nothing. Otherwise unregister only
// this app's service worker, delete only this app's caches and reload. Returns false (and changes nothing) offline.
export async function getLatest() {
  try {
    const res = await fetch(SW_URL + '?fresh=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
  } catch {
    return false;
  }
  try {
    const regs = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : [];
    for (const reg of regs) if (reg.scope === APP_ROOT) await reg.unregister(); // other apps on the origin keep theirs
  } catch (e) { console.warn('Could not unregister the service worker', e); }
  try {
    if (window.caches) for (const k of await caches.keys()) if (k.startsWith(PREFIX)) await caches.delete(k);
  } catch (e) { console.warn('Could not clear the saved copy', e); }
  location.reload();
  return true;
}

// The two lines, appended to el, as the kit's grouped rows in small muted text (the kit ends settings with them as
// rows). The version row shows only once there is a cache name. Returns the wrapper.
export function renderVersion(el) {
  const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const wrap = make('div', 'app-section appver');
  const list = make('ul', 'app-list');
  const verItem = make('li');
  verItem.hidden = true;
  const ver = make('div', 'app-row appver-line');
  verItem.append(ver);
  const btn = make('button', 'app-row app-row--action appver-get');
  btn.type = 'button';
  btn.append(make('span', 'app-row-title', 'Not updating? Get the latest version'));
  const getItem = make('li');
  getItem.append(btn);
  list.append(verItem, getItem);
  const msg = make('p', 'app-section-footer appver-msg');
  msg.setAttribute('role', 'status');
  btn.addEventListener('click', async () => {
    btn.disabled = true; msg.textContent = '';
    const ok = await getLatest();
    if (!ok) { msg.textContent = 'No signal: nothing was changed. Try again when you have signal.'; btn.disabled = false; }
  });
  wrap.append(list, msg);
  el.append(wrap);
  appVersion().then(v => {
    if (!v) return;
    ver.replaceChildren(make('span', 'app-row-title', 'App version'), ' ', make('span', 'app-row-value app-mono', v));
    verItem.hidden = false;
  });
  return wrap;
}

// Register sw.js everywhere except ?nosw (and file://). onUpdate(apply) is called once when a new version is
// waiting; call apply() to switch to it (the page reloads). Without onUpdate a small "Update available" bar shows.
// app.js calls registerSW({ onUpdate: apply => toast('Update available', { action: { label: 'Reload', fn: apply }, ms: 0 }) }).
export function registerSW({ onUpdate } = {}) {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:' || new URLSearchParams(location.search).has('nosw')) return Promise.resolve(null);
  let reloading = false, wantReload = false, offered = false;
  const hadController = !!navigator.serviceWorker.controller; // the first install takes control quietly
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !(hadController || wantReload)) return;
    reloading = true; location.reload();
  });
  const offer = w => {
    if (offered) return;
    offered = true;
    const apply = () => { wantReload = true; w.postMessage('skipWaiting'); };
    (typeof onUpdate === 'function' ? onUpdate : updateBar)(apply);
  };
  return navigator.serviceWorker.register(SW_URL, { scope: APP_ROOT }).then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    return reg;
  }).catch(err => { console.warn('Service worker not registered', err); return null; });
}

// Fallback offer, in the app's toast area when there is one.
function updateBar(apply) {
  const box = document.getElementById('toasts');
  const bar = document.createElement('div');
  bar.className = 'toast app-toast is-visible';
  bar.setAttribute('role', 'status');
  bar.id = 'update-bar';
  const text = document.createElement('span');
  text.className = 'app-toast-text';
  text.textContent = 'Update available';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'app-toast-action';
  btn.textContent = 'Reload';
  btn.addEventListener('click', () => { bar.remove(); apply(); });
  bar.append(text, btn);
  if (box) box.append(bar);
  else { bar.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:1000;background:#272722;color:#fffaf0;padding:10px 14px;border-radius:12px;display:flex;gap:12px;align-items:center;justify-content:space-between'; document.body.append(bar); }
}
