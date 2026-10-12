// Fake data only. Settings → Show or hide (grouped switches, a reset per group).
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const st = () => p.evaluate(async () => { const { settings } = await import('./js/ui-core.js'); const { display } = await import('./js/ui-settings.js'); return { s: settings(), d: display() }; });
  const group = name => p.locator(`.showhide [data-group=${name}]`);
  await p.goto(base + '?demo#settings'); await p.locator('a[data-go=showhide]').click();
  await p.getByRole('heading', { name: 'Show or hide', exact: true }).waitFor();

  // switches change the same settings as their own pages
  await group('tips').getByLabel('Show tips and help text').uncheck();
  await p.waitForFunction(() => document.body.classList.contains('no-help'));
  await group('case').getByLabel('Plan for later').uncheck();
  await group('case').getByLabel('Still needed').uncheck();
  await p.waitForFunction(async () => { const { settings } = await import('./js/ui-core.js'); return (settings().caseHide || []).length === 2; });
  await group('logbook').getByLabel('Copy and Reflect buttons on each case').uncheck();
  await group('bar').getByLabel('Notes on the tab bar').check();
  await p.locator('[role=tab][data-tab=notes]').waitFor();
  await group('bar').getByLabel('Analytics on the tab bar').uncheck();
  await p.waitForFunction(() => !document.querySelector('[role=tab][data-tab=progress]'));
  assert.equal((await st()).d.rowMenu, true);

  // resetting one group leaves the others alone
  await group('case').getByRole('button', { name: 'Reset this group' }).click();
  await p.locator('dialog[open]').getByRole('button', { name: 'Reset' }).click();
  await p.waitForFunction(async () => { const { settings } = await import('./js/ui-core.js'); return !settings().caseHide; });
  let now = await st();
  assert.equal(now.s.hideTips, true); assert.equal(now.d.rowMenu, true);
  await group('bar').getByRole('button', { name: 'Reset this group' }).click();
  await p.locator('dialog[open]').getByRole('button', { name: 'Reset' }).click();
  await p.locator('[role=tab][data-tab=progress]').waitFor();
  await p.waitForFunction(() => !document.querySelector('[role=tab][data-tab=notes]'));
  now = await st();
  assert.equal(now.s.hideTips, true); assert.equal(now.d.rowMenu, true);
  await group('tips').getByRole('button', { name: 'Reset this group' }).click();
  await p.locator('dialog[open]').getByRole('button', { name: 'Reset' }).click();
  await p.waitForFunction(() => !document.body.classList.contains('no-help'));
  await group('logbook').getByRole('button', { name: 'Reset this group' }).click();
  await p.locator('dialog[open]').getByRole('button', { name: 'Reset' }).click();
  await p.waitForFunction(async () => { const { display } = await import('./js/ui-settings.js'); return !display().rowMenu; });

  assert.deepEqual(errors, []); await ctx.close(); console.log(`PASS show or hide ${width === 390 ? 'phone' : 'desktop'}`);
} } finally { await b.close(); }
