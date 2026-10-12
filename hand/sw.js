// The hand assessment page moved to /hand-babies/. This worker replaces the old offline copy at /hand/ on phones
// that opened it: it clears the old caches (never hand-babies-*), unregisters itself and reloads into the redirect.
// Keep it a while; delete hand/ once old visitors have passed through (check.mjs reads VERSION and SHELL here).

const VERSION = 'hand-v3';
const SHELL = ['./', 'index.html'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('hand-') && !k.startsWith('hand-babies-')) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
  })());
});
