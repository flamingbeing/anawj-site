// Fake data only. Lazy loading (app.js "pages that load on first use"): the Add tab opens with only its own modules
// (no Settings, Reflections, Logbook or Analytics code, no Firebase SDK in the demo); every page then opens, from a
// link or straight from the address; the Logbook's view hooks work before its code has loaded; and with the service
// worker, the app still opens every page offline after a reload; sign-out wipes reflection drafts before that page's
// code loads; a page that failed to load comes back with the card's Reload.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
// every page the demo admin can open (its id is the address: #layout …)
const PAGES = ['log', 'logbook', 'reflect', 'progress', 'notes', 'more', 'caselogs', 'totals', 'points', 'account', 'settings', 'recovery', 'data',
  'reflimport', 'themes', 'layout', 'access', 'loggingadv', 'sendto', 'sync', 'sharefmt', 'showhide', 'logging', 'notesset', 'reflset',
  'export', 'choose', 'admin', 'admintotals', 'adminresidents', 'adminadv', 'tags', 'feedback', 'feedbackinbox'];
const LAZY = ['ui-settings', 'ui-reflect', 'ui-logbook', 'ui-progress', 'ui-admin', 'ui-caselogs', 'ui-account', 'ui-sync', 'ui-send', 'portfolio', 'cloud-save', 'markdown', 'ui-parts', 'ui-feedback'];
const loaded = p => p.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).filter(n => /\.js(\?|$)/.test(n)));
const name = u => u.replace(/^.*\/(js\/)?/, '').replace(/\.js.*$/, '');
const goHash = (p, id) => p.evaluate(x => { location.hash = '#' + x; }, id).then(() => p.waitForFunction(x => document.getElementById('app').dataset.page === x, id)).catch(err => { throw new Error(`${id}: ${err.message}`); });

try {
  for (const width of [390, 1280]) {
    const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
    const p = await ctx.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const asked = []; p.on('request', r => asked.push(r.url()));

    // the Add tab: its own modules only, and the demo never asks for the Firebase SDK
    await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
    const first = (await loaded(p)).map(name);
    for (const m of LAZY) assert.ok(!first.includes(m), `${m} loaded with the Add tab`);
    assert.ok(first.includes('ui-log') && first.includes('display') && first.includes('demo-backend'));
    assert.equal(asked.filter(u => /gstatic\.com\/firebasejs/.test(u)).length, 0, 'Firebase SDK fetched in the demo');
    // typing works at once
    await p.locator('textarea.details').fill('AB 72M fake lap chole');
    assert.equal(await p.locator('textarea.details').inputValue(), 'AB 72M fake lap chole');
    await p.locator('textarea.details').fill('');

    // the Logbook's view is set (Analytics → a month's cases) even before its code has loaded
    assert.ok(!(await loaded(p)).map(name).includes('ui-logbook'));
    await p.evaluate(async () => { const { hooks } = await import('./js/ui-core.js'); hooks.showCases({ from: '2020-01-01', to: '2020-01-31' }); location.hash = '#logbook'; });
    await p.waitForFunction(() => document.getElementById('app').dataset.page === 'logbook');
    assert.equal(await p.locator('main input[type=date]').first().inputValue(), '2020-01-01');

    // every page opens from the address, drawn in full
    for (const id of PAGES) {
      await goHash(p, id);
      assert.equal(await p.locator('#app .lazy-wait').count(), 0, id);
    }
    // a lazy page straight from the address (a reload, a shortcut)
    for (const id of ['layout', 'reflect', 'admin']) {
      await p.goto(base + '?demo#' + id);
      await p.waitForFunction(x => document.getElementById('app').dataset.page === x, id);
    }
    // the settings search still finds options on every settings page
    await goHash(p, 'settings');
    await p.getByLabel('Search settings').fill('undo');
    await p.locator('.settings-search li a').first().waitFor();
    // in idle time the rest load, so changing tab later is instant
    await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
    await p.waitForFunction(() => performance.getEntriesByType('resource').some(e => /ui-admin\.js/.test(e.name)), null, { timeout: 15000 });
    assert.deepEqual(errors, []);
    console.log('PASS lazy load ' + (width < 600 ? 'phone' : 'desktop'));
    await ctx.close();
  }

  // sign-out before Reflections' code has loaded still wipes the last person's unsaved reflection draft
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('apmes-logbook-demo-small', '1'); localStorage.setItem('apmes-logbook-reflection-draft:demo:demo@example.com', JSON.stringify({ diagnosis: 'Fake draft' })); } });
    const p = await ctx.newPage();
    await p.goto(base + '?demo#more');
    await p.getByRole('button', { name: 'Sign out', exact: true }).click();
    await p.waitForFunction(() => !Object.keys(localStorage).some(k => k.startsWith('apmes-logbook-reflection-draft')), null, { timeout: 5000 });
    assert.ok(!(await loaded(p)).map(name).includes('ui-reflect'), 'ui-reflect loaded before sign-out; the test proves nothing');
    console.log('PASS sign-out wipes reflection drafts before ui-reflect loads');
    await ctx.close();
  }

  // a page whose module failed to load: the card's button reloads, and the page then draws
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
    let fail = true;
    await ctx.route(/\/js\/ui-progress\.js/, r => (fail ? r.abort() : r.continue()));
    const p = await ctx.newPage();
    await p.goto(base + '?demo#progress');
    await p.getByText('This page didn’t load').waitFor();
    fail = false;   // keep retries failing until the explicit reload
    await p.getByRole('button', { name: 'Reload' }).click();
    await p.waitForFunction(() => document.getElementById('app')?.dataset.page === 'progress', null, { timeout: 15000 });   // (?.: it may run mid-reload)
    assert.doesNotMatch(await p.locator('#app').innerText(), /didn’t load/);
    console.log('PASS a failed page load recovers with Reload');
    await ctx.close();
  }

  // offline with the service worker: load once (it caches the shell), go offline, reload, every page opens
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
    const p = await ctx.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
    // the worker has installed and cached the whole shell (every module, lazy ones too)
    await p.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration(); if (!reg || !reg.active) return false;
      const keys = await caches.keys(); const c = keys.find(k => k.startsWith('logbook-')); if (!c) return false;
      const got = (await (await caches.open(c)).keys()).map(r => r.url);
      return ['ui-settings.js', 'ui-reflect.js', 'ui-admin.js', 'display.js', 'clean.js', 'settings-rows.js'].every(f => got.some(u => u.endsWith('/js/' + f)));
    }, null, { timeout: 30000 });
    await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });   // (it claims the open page)
    await ctx.setOffline(true);
    await p.reload(); await p.waitForSelector('textarea.details');
    assert.equal(await p.evaluate(() => navigator.onLine), false);
    for (const id of PAGES) {
      await goHash(p, id);
      assert.equal(await p.locator('#app .lazy-wait').count(), 0, id);
      assert.doesNotMatch(await p.locator('#app').innerText(), /didn’t load/, id);
    }
    assert.deepEqual(errors, []);
    console.log('PASS lazy load offline (service worker)');
    await ctx.close();
  }
} finally { await b.close(); }
