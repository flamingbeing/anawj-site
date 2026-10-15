// Fake data only. Analytics Edit mode (15 Oct 2026): move cards with the arrows or by dragging, hide and show them,
// Reset layout; saved for the account.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', hasTouch: width < 600 });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?demo#progress'); await p.locator('.an-sec').first().waitFor();
  const cards = () => p.locator('details.an-sec .an-t').allInnerTexts().then(a => a.map(t => t.replace(/ \([^)]*\)$/, '')));
  const rows = () => p.locator('.an-edit-list').first().locator('.an-edit-name').allInnerTexts();
  const start = await cards();
  assert.ok(start.includes('Trends') && start.includes('Logbook'), start.join());
  await p.getByRole('button', { name: 'Edit', exact: true }).click();
  assert.deepEqual(await rows(), start);
  // the less important cards start hidden; Show puts one on the page
  for (const n of ['Patient ages', 'Case mix', 'Logging habits']) await p.getByRole('button', { name: 'Show ' + n }).waitFor();
  assert.match(await p.locator('.an-editbar, .an-edit').first().innerText(), /Arrange Analytics/);
  await p.getByRole('button', { name: 'Show Logging habits' }).click();
  await p.getByRole('button', { name: 'Hide Logging habits' }).click();
  // arrows
  await p.getByRole('button', { name: 'Move Logbook up' }).click();
  const i = start.indexOf('Logbook'), up = [...start]; up.splice(i - 1, 0, ...up.splice(i, 1));
  assert.deepEqual(await rows(), up);
  // hide and show
  await p.getByRole('button', { name: 'Hide Trends' }).click();
  assert.ok(!(await rows()).includes('Trends'));
  await p.getByRole('button', { name: 'Show Trends' }).waitFor();
  // drag the last card to the top
  const list = p.locator('.an-edit-list').first().locator('li');
  const last = list.last(), lastName = await last.locator('.an-edit-name').innerText();
  const g = await last.locator('.an-grip').boundingBox(), top = await list.first().boundingBox();
  await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await p.mouse.down();
  await p.mouse.move(g.x + g.width / 2, top.y + 4, { steps: 8 }); await p.mouse.up();
  await p.waitForFunction(n => document.querySelector('.an-edit-list .an-edit-name')?.textContent === n, lastName);
  const arranged = await rows();
  await p.getByRole('button', { name: 'Done' }).click();
  assert.deepEqual(await cards(), arranged);
  assert.match(await p.locator('.an-editbar').innerText(), /4 cards hidden/, 'Trends and the three that start hidden');
  // saved for the account: still so after a reload
  assert.deepEqual(await p.evaluate(async () => (await import('./js/ui-core.js')).settings().anLayout.hidden), ['habits', 'trends']);
  await p.reload(); await p.locator('.an-sec').first().waitFor();
  assert.deepEqual(await cards(), arranged);
  // Reset layout
  await p.getByRole('button', { name: 'Edit', exact: true }).click();
  await p.getByRole('button', { name: 'Reset layout' }).click();
  await p.getByRole('button', { name: 'Done' }).click();
  assert.deepEqual(await cards(), start);
  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log(`PASS analytics edit ${width < 600 ? 'phone' : 'desktop'}`);
} } finally { await b.close(); }
