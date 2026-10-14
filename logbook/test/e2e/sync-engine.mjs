// Fake data only. The sync engine (js/sync.js) on the demo backend: this device's copy (IndexedDB, one store per
// account), reopening reads about nothing, two tabs stay in step (a case logged, a case binned), the demo reset
// reads everything again, and signing out deletes the copy in every tab. Firestore's own read counts are checked
// against the emulator by tools/test-reads.sh.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const STORE = 'apmes-logbook-store:demo:demo@example.com';
// poll an async check in the page (waitForFunction treats an async function's promise as already true)
async function until(p, fn, arg, timeout = 15000) {
  for (const t = Date.now(); !(await p.evaluate(fn, arg)); await p.waitForTimeout(50)) if (Date.now() - t > timeout) throw new Error('Timed out: ' + fn);
}
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const errors = [];
  const page = async (hash = '#log') => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(base + '?demo' + hash);
    await until(p, async () => (await import('./js/ui-core.js')).S.casesSynced);
    return p;
  };
  const n = p => p.evaluate(async () => (await import('./js/ui-core.js')).S.cases.length);
  const reads = (p, c) => p.evaluate(c => (window.__reads && window.__reads[c] && window.__reads[c].billed) || 0, c);
  const flush = p => p.evaluate(async () => (await import('./js/cloud.js')).syncFlush());
  // what this device's copy holds (straight from IndexedDB)
  const stored = p => p.evaluate(name => new Promise(res => {
    const r = indexedDB.open(name);
    r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('cases')) { db.close(); return res(null); } const q = db.transaction('cases').objectStore('cases').count(); q.onsuccess = () => { db.close(); res(q.result); }; };
    r.onerror = () => res(null);
  }), STORE);
  const stores = p => p.evaluate(async () => (await indexedDB.databases()).map(d => d.name).filter(x => x.startsWith('apmes-logbook-store:')));

  // first open: the demo's 6 cases, read once and kept on the device
  const p = await page('=reset#log');
  assert.equal(await n(p), 6);
  await flush(p);
  assert.equal(await stored(p), 6);
  assert.deepEqual(await stores(p), [STORE]);

  // reopening: the stored list, then only what changed (nothing: one read for the empty answer)
  await p.reload(); await until(p, async () => (await import('./js/ui-core.js')).S.casesSynced);
  assert.equal(await n(p), 6);
  assert.ok(await reads(p, 'cases') <= 1, 'cases read again on reopen: ' + await reads(p, 'cases'));
  assert.ok(await reads(p, 'reflections') <= 1);

  // a second tab: a case logged in one shows in the other, and so does a case moved to the bin
  const q = await page('#logbook');
  await p.evaluate(async () => { const { createCase, todayISO } = await import('./js/ui-core.js'); await createCase({ date: todayISO(), details: 'ZZ 40F fake synced case', cats: ['08'] }); });
  await until(q, async () => (await import('./js/ui-core.js')).S.cases.some(c => /fake synced case/.test(c.details)));
  await q.evaluate(async () => { const { S } = await import('./js/ui-core.js'); const { moveToBin } = await import('./js/bin.js'); await moveToBin('case', S.cases.find(c => /fake synced case/.test(c.details))); });
  await until(p, async () => !(await import('./js/ui-core.js')).S.cases.some(c => /fake synced case/.test(c.details)));
  assert.equal(await n(p), 6); assert.equal(await n(q), 6);
  await flush(p); await flush(q);
  assert.equal(await stored(p), 6);
  // the header's count (the page, not only the state) follows too
  await q.waitForFunction(() => document.body.dataset.cases === '6');

  // the demo reset replaces the data wholesale: read in full again, nothing stale kept
  await p.evaluate(async () => { const { createCase, todayISO } = await import('./js/ui-core.js'); await createCase({ date: todayISO(), details: 'ZZ 41F fake case before reset', cats: ['08'] }); });
  await until(p, async () => (await import('./js/ui-core.js')).S.cases.length === 7);
  await p.goto(base + '?demo=reset#log'); await until(p, async () => (await import('./js/ui-core.js')).S.casesSynced);
  await until(p, async () => (await import('./js/ui-core.js')).S.cases.length === 6);
  await flush(p);
  assert.equal(await stored(p), 6);

  // signing out deletes this device's copy, in this tab and the other
  await p.evaluate(async () => (await import('./js/cloud.js')).signOut());
  await p.getByRole('button', { name: 'Sign in with Google' }).waitFor();
  await q.getByRole('button', { name: 'Sign in with Google' }).waitFor();
  await until(p, async () => !(await indexedDB.databases()).some(d => d.name.startsWith('apmes-logbook-store:')));
  // and signing in again reads it all once more
  await p.getByRole('button', { name: 'Sign in with Google' }).click();
  await until(p, async () => (await import('./js/ui-core.js')).S.casesSynced);
  assert.equal(await n(p), 6);

  assert.deepEqual(errors, []); await ctx.close(); console.log(`PASS sync engine ${width === 390 ? 'phone' : 'desktop'}`);
} } finally { await b.close(); }
