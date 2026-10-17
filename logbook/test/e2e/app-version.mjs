// Fake data only. More, bottom: the app version, and "Get the latest version" (throws the saved copy of the app
// away and reloads; never the logbook's data). Service workers on, as on a phone.
import assert from 'node:assert/strict';
import { launch, engine } from './browsers.mjs';
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await launch();
if (!b) { console.log(`SKIP app version: ${engine} not installed`); process.exit(0); }
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?demo#log'); await p.waitForFunction(() => Number(document.body.dataset.cases) > 0);
  await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 20000 });
  const sw = await p.evaluate(async () => (await caches.keys()).find(k => k.startsWith('logbook-')));
  await p.evaluate(() => { location.hash = '#more'; });
  const line = p.locator('.app-ver');
  await p.waitForFunction(() => /App version [^…]/.test(document.querySelector('.app-ver')?.textContent || ''));
  assert.ok((await line.innerText()).includes(sw.replace(/^logbook-/, '')), 'shows the saved copy’s version');
  // a change still sending: it waits
  await p.evaluate(async () => { (await import('./js/ui-core.js')).S.pending = true; });
  await line.getByRole('button', { name: 'Get the latest version' }).click();
  await p.getByText(/still sending/).waitFor();
  assert.equal(await p.locator('dialog[open]').count(), 0, 'no question while a change is sending');
  await p.evaluate(async () => { (await import('./js/ui-core.js')).S.pending = false; });
  // Cancel keeps everything
  await line.getByRole('button', { name: 'Get the latest version' }).click();
  await p.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click();
  assert.ok(await p.evaluate(async () => (await caches.keys()).some(k => k.startsWith('logbook-'))), 'Cancel kept the saved copy');
  // Get it: reloads, and the app opens again on its data with a fresh saved copy
  const cases = await p.evaluate(() => document.body.dataset.cases);
  await p.evaluate(() => caches.open('evals-fake').then(c => c.put('fake.txt', new Response('x'))));   // another app on the site
  await line.getByRole('button', { name: 'Get the latest version' }).click();
  await Promise.all([p.waitForEvent('load'), p.locator('dialog[open]').getByRole('button', { name: 'Get it' }).click()]);
  await p.waitForFunction(() => Number(document.body.dataset.cases) > 0);
  assert.equal(await p.evaluate(() => document.body.dataset.cases), cases, 'the logbook is all there');
  await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 20000 });
  assert.ok(await p.evaluate(async () => (await caches.keys()).some(k => k.startsWith('logbook-'))), 'saved again for offline');
  assert.ok(await p.evaluate(async () => (await caches.keys()).includes('evals-fake')), 'another app’s saved copy is left alone');
  assert.deepEqual(errors, [], 'no console errors');
  console.log('PASS app version');
} finally { await b.close(); }
