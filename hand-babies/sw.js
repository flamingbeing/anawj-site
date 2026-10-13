// Offline copy of the hand assessment page (pattern from prewarm/sw.js). Bump VERSION whenever any SHELL file
// changes. A new version switches itself on as soon as it has cached the page (no data here, so nothing to lose);
// the page then offers "Update available: tap to reload", which only reloads. (Waiting for a tap to activate failed
// on some phones: the tap did nothing, 12 Oct 2026.)

const VERSION = 'hand-babies-v7';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'hand3d.js', 'vendor/three.module.min.js', 'edit.html', '../design/tokens.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(
    SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});

// Older pages ask a waiting worker to take over (kept so they can still switch to this version).
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // only this app's caches: other apps on the same origin keep theirs
    for (const k of await caches.keys()) if (k.startsWith('hand-babies-') && k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    // navigations: the cached page, keyed by the folder (see prewarm/sw.js for why not 'index.html')
    // (only the page itself: edit.html is a separate page and must not get the shell)
    const shell = req.mode === 'navigate' && /\/(index\.html)?$/.test(url.pathname);
    const key = shell ? './' : req;
    const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(key, res.clone());
      return res;
    } catch (err) {
      const page = shell && await cache.match('./');
      if (page) return page;
      throw err;
    }
  })());
});
