// Offline copy of the hand assessment page. Bump VERSION whenever any SHELL file changes.
// Network first: online, every visit gets the current page (no update bar, owner 13 Oct 2026); the cache is only
// for offline or a network slower than NET_WAIT. A new version switches itself on once it has cached the page.

const VERSION = 'hand-babies-v9';
const NET_WAIT = 3000; // ms before falling back to the cached copy
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
    // navigations: the page, cached under by the folder (see prewarm/sw.js for why not 'index.html')
    // (only the page itself: edit.html is a separate page and must not get the shell)
    const shell = req.mode === 'navigate' && /\/(index\.html)?$/.test(url.pathname);
    const key = shell ? './' : req;
    const cached = () => cache.match(key, { ignoreSearch: req.mode === 'navigate' });
    const net = fetch(req).then(res => {
      if (res.ok && res.type === 'basic') cache.put(key, res.clone());
      return res;
    });
    // slow network: show the cached copy rather than wait (the fetch still refreshes the cache for next time)
    const slow = new Promise(r => setTimeout(r, NET_WAIT)).then(cached).then(hit => hit || net);
    slow.catch(() => {}); // offline: handled below
    try {
      return await Promise.race([net, slow]);
    } catch (err) {
      const hit = await cached() || (shell && await cache.match('./'));
      if (hit) return hit;
      throw err;
    }
  })());
});
