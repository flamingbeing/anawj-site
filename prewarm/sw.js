// Offline app shell for the prewarming study app (copied from evals/sw.js). Bump VERSION whenever any shell file
// changes: the new worker installs alongside the old one and the app offers "Update available".
// Firebase (added with sharing) will always go to the network; its SDK files are cached here.

const VERSION = 'prewarm-v5';
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const SDK_FILES = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => SDK + f);
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', '../design/tokens.css',
  'js/app.js', 'js/schema.js', 'js/headers.js', 'js/store.js', 'js/xlsx.js', 'js/export.js', 'js/cloud.js', 'js/firebase-config.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', e => {
  // one missing file must not stop the whole install, so cache each on its own
  e.waitUntil(caches.open(VERSION).then(c => Promise.all([
    ...SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})),
    ...SDK_FILES.map(u => c.add(new Request(u, { mode: 'cors' })).catch(() => {})),
  ])));
});

// The page asks a waiting worker to take over when the user taps "Reload".
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // only this app's caches: other apps on the same origin keeps its own
    for (const k of await caches.keys()) if (k.startsWith('prewarm-') && k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

const NEVER = /(^|\.)(googleapis\.com|gstatic\.com|firebaseio\.com|firebaseapp\.com|google\.com)$/;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.url.startsWith(SDK)) {
    // cache first: the URL carries the version
    e.respondWith(caches.open(VERSION).then(async c => (await c.match(req.url)) || fetch(req).then(res => {
      if (res.ok) c.put(req.url, res.clone());
      return res;
    })));
    return;
  }
  if (url.origin !== self.location.origin || NEVER.test(url.hostname)) return;
  if (url.pathname.includes('/__/')) return; // Firebase auth helper pages
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    // navigations: the cached shell, whatever the query (?demo) or hash
    // (keyed by the folder, './': Cloudflare previews answer 'index.html' with a redirect to the folder, and a cached
    // redirect can't be served for a navigation, so reloading failed there; GitHub Pages serves both directly)
    const key = req.mode === 'navigate' ? './' : req;
    const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(key, res.clone());
      return res;
    } catch (err) {
      const shell = req.mode === 'navigate' && await cache.match('./');
      if (shell) return shell;
      throw err;
    }
  })());
});
