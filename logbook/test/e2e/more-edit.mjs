// Fake data only. More's Edit mode (15 Oct 2026): pin a page on the tab bar and take it off, reorder the bar and the
// More list (arrows and dragging), Reset; per device.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?demo#more'); await p.locator('.more-list').first().waitFor();
  const bar = () => p.locator('.tabs [role=tab]').evaluateAll(els => els.map(e => e.dataset.tab));
  const moreRows = () => p.locator('.more-edit .an-edit-list').nth(1).locator('li').evaluateAll(els => els.map(e => e.dataset.tab));
  const start = await bar();
  await p.locator('.more-head').getByRole('button', { name: 'Edit' }).click();
  // pin a page from More (the first one that can go on the bar), then take it off again
  const pin = p.locator('.more-edit button', { hasText: /^Pin$/ }).first();
  const id = await pin.evaluate(b => b.closest('li').dataset.tab);
  await pin.click();
  await p.waitForFunction(x => !!document.querySelector(`.tabs [data-tab=${x}]`), id);
  assert.equal((await bar()).at(-1), 'more', 'More stays last');
  await p.locator(`.more-edit li[data-tab=${id}] button`, { hasText: 'Take off' }).click();
  await p.waitForFunction(x => !document.querySelector(`.tabs [data-tab=${x}]`), id);
  // the bar's order: Logbook first
  await p.getByRole('button', { name: 'Move Logbook up' }).click();
  assert.deepEqual((await bar()).slice(0, 2), ['logbook', 'log']);
  // More's order: the third one to the top by dragging (rows below the tab bar can't be reached on a phone)
  const rows = await moreRows();
  const list = p.locator('.more-edit .an-edit-list').nth(1).locator('li');
  await list.first().scrollIntoViewIfNeeded();
  const g = await list.nth(2).locator('.an-grip').boundingBox(), top = await list.first().boundingBox();
  await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await p.mouse.down();
  await p.mouse.move(g.x + g.width / 2, top.y + 4, { steps: 8 }); await p.mouse.up();
  await p.waitForFunction(id => document.querySelectorAll('.more-edit .an-edit-list')[1]?.querySelector('li')?.dataset.tab === id, rows[2]);
  await p.getByRole('button', { name: 'Done' }).click();
  assert.equal(await p.locator('.more-list').first().locator('a').first().getAttribute('data-go'), rows[2], 'More shows the new order');
  // Reset puts the profile's bar and More's order back
  await p.locator('.more-head').getByRole('button', { name: 'Edit' }).click();
  await p.getByRole('button', { name: 'Reset' }).click();
  assert.deepEqual(await bar(), start);
  assert.deepEqual(await moreRows(), rows);
  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log(`PASS more edit ${width < 600 ? 'phone' : 'desktop'}`);
} } finally { await b.close(); }
