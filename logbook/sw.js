// Offline app shell for the APMES Logbook. Bump VERSION whenever any shell file changes:
// the new worker installs alongside the old one and the app offers "Update available — reload".
// Firebase traffic (auth, Firestore) always goes to the network; Firestore keeps its own offline
// cache in IndexedDB. The Firebase SDK files themselves (versioned, never change) are cached here,
// so the app still starts with no signal after the phone has cleared its HTTP cache.

const VERSION = 'logbook-v41';
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const SDK_FILES = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => SDK + f);
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/app.js', 'js/navigation.js', 'js/transients.js', 'js/ui-core.js', 'js/ui-log.js', 'js/ui-logbook.js', 'js/ui-progress.js', 'js/ui-settings.js', 'js/ui-admin.js', 'js/ui-reflect.js', 'js/reflections.js', 'js/portfolio.js',
  'js/categories.js', 'js/engine.js', 'js/suggest.js', 'js/keywords.js', 'js/importer.js', 'js/xlsxio.js',
  'js/recovery-store.js', 'js/writes.js', 'js/store.js', 'js/sync.js', 'js/drafts.js', 'js/ui-recovery.js', 'js/cloud.js', 'js/demo-backend.js', 'js/demo-seed.js', 'js/firebase-config.js', 'js/bin.js', 'js/destinations.js', 'js/ui-send.js', 'js/reflect-import.js', 'js/ui-reflect-import.js', 'js/ui-account.js', 'js/profile.js', 'js/share.js', 'js/share-format.js', 'js/markdown.js', 'js/ui-notes.js', 'js/backup-targets.js', 'js/cloud-save.js', 'js/fonts.js', 'js/custom-css.js', 'js/export-opts.js', 'js/search-ops.js', 'js/settings-file.js', 'js/profiles.js', 'js/moved.js', 'js/colors.js', 'js/glance.js', 'js/analytics.js', 'js/backup.js', 'js/tags.js', 'js/notepad.js', 'js/ui-notepad.js', 'js/backup-csv.js', 'js/ui-caselogs.js', 'js/logging.js', 'js/paste-clean.js', 'js/fmt-bar.js', 'js/share-in.js', 'js/ui-share-in.js', 'js/sync-md.js', 'js/sync-remote.js', 'js/ui-sync.js',
  'vendor/exceljs.min.js', 'vendor/jszip.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', e => {
  // one missing file must not stop the whole install, so cache each on its own
  e.waitUntil(caches.open(VERSION).then(c => Promise.all([
    ...SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})),
    ...SDK_FILES.map(u => c.add(new Request(u, { mode: 'cors' })).catch(() => {})),
  ])));
});

// The page asks a waiting worker to take over when the user taps "reload".
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('logbook-') && k !== VERSION) await caches.delete(k);   // other apps on this site keep their caches
    await self.clients.claim();
  })());
});

const NEVER = /(^|\.)(googleapis\.com|gstatic\.com|firebaseio\.com|firebaseapp\.com|google\.com)$/;

// Shared to the installed app (manifest share_target, POST multipart): text, a title, a link and .md / .txt files.
// Kept in Cache Storage for the page (share-in.js readInbox; the cache's name doesn't start with "logbook-", so a new
// version doesn't clear it), then the app opens on the chooser. Keep the names in step with share-in.js.
const SHARE_CACHE = 'share-inbox-logbook', SHARE_FILE = 'share-inbox.json';
const isTextFile = f => /^text\//i.test(f.type || '') || /markdown/i.test(f.type || '') || /\.(md|markdown|txt)$/i.test(f.name || '');
async function receiveShare(req) {
  try {
    const form = await req.formData(), cut = v => String(v || '').slice(0, 100000);
    const data = { title: cut(form.get('title')), text: cut(form.get('text')), url: cut(form.get('url')), files: [], at: Date.now() };
    for (const f of form.getAll('files')) {
      if (!f || typeof f === 'string' || !isTextFile(f) || f.size > 1024 * 1024 || data.files.length >= 10) continue;
      data.files.push({ name: String(f.name || '').slice(0, 200), type: f.type || '', text: cut(await f.text()) });
    }
    const cache = await caches.open(SHARE_CACHE);
    await cache.put(new URL(SHARE_FILE, self.registration.scope).href, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } }));
  } catch (err) { console.warn('Share not kept', err); }
  return Response.redirect(new URL('./?shared=1#log', self.registration.scope).href, 303);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) { e.respondWith(receiveShare(req)); return; }
  if (req.method !== 'GET') return;
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
