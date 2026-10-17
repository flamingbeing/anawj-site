// Which app version this device runs, and a forced fresh copy (Settings, bottom; owner, 14 Oct 2026, as in the
// prewarming app). The version is the service worker's cache name, stamped at deploy ('logbook-2026-10-14-3f9a2c1d'
// or the older 'logbook-v41-3f9a2c1d'; tools/stamp-versions.mjs).

// '2026-10-14 (3f9a2c1d)' for a stamped name; anything else (a local copy, no service worker) as it is
export function versionLabel(name) {
  const v = String(name || '').replace(/^logbook-/, '');
  const d = /^(\d{4}-\d{2}-\d{2})-([0-9a-f]{8})$/.exec(v);
  return d ? `${d[1]} (${d[2]})` : v || 'unknown';
}

// the saved copy's name ('no-sw' without one): the dated names first, so a leftover older-style copy doesn't win
export async function appVersion() {
  try {
    const ks = (await caches.keys()).filter(k => k.startsWith('logbook-'));
    return ks.filter(k => /^logbook-\d{4}-/.test(k)).sort().pop() || ks.sort().pop() || 'no-sw';
  } catch { return 'no-sw'; }
}

// Throws the saved copy of the app away (this app's service worker and its cache: never the logbook's data, drafts or
// this device's settings, and never the other apps on the site) and reloads from the server. Only when the server
// answers: offline, the saved copy is what lets the app open, so it stays (returns false).
export async function freshCopy() {
  try { if (!(await fetch('index.html', { cache: 'no-store' })).ok) return false; } catch { return false; }
  const scope = new URL('./', location.href).href;
  try { for (const r of await navigator.serviceWorker.getRegistrations()) if (r.scope === scope) await r.unregister(); } catch { /* reload anyway */ }
  try { for (const k of await caches.keys()) if (k.startsWith('logbook-')) await caches.delete(k); } catch { /* reload anyway */ }
  location.reload();
  return true;
}
