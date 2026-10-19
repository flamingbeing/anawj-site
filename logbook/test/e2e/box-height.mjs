// Fake data only. The case box's height (15 Oct 2026): it grows as you type (on by default, up to two thirds of the
// screen), the grab bar under it sets a height that is kept after Save and a reload, double-tap resets it. The List box
// (paste a list) has its own bar and height (16 Oct 2026).
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', hasTouch: width < 600 });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  const box = p.locator('textarea.details');
  const height = () => box.evaluate(t => t.offsetHeight);
  const h0 = await height();
  // grows as you type, up to two thirds of the screen
  await box.fill(Array.from({ length: 12 }, (_, i) => `fake line ${i + 1}`).join('\n'));
  const h1 = await height();
  assert.ok(h1 > h0 + 40, `did not grow: ${h0} -> ${h1}`);
  await box.fill(Array.from({ length: 80 }, (_, i) => `fake line ${i + 1}`).join('\n'));
  assert.ok(await height() <= Math.round(844 * 0.66) + 2, 'grew past two thirds of the screen');
  await box.fill('');
  assert.ok(Math.abs(await height() - h0) <= 2, 'did not shrink back');
  // the grab bar: drag 120 px down
  const g = await p.locator('.box-grab').boundingBox();
  await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await p.mouse.down();
  await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + 120, { steps: 6 }); await p.mouse.up();
  const kept = await p.evaluate(async () => (await import('./js/display.js')).display().boxHeight);
  assert.ok(Math.abs(kept - (h0 + 120)) <= 4, `kept ${kept}, wanted about ${h0 + 120}`);
  await p.reload(); await p.waitForSelector('textarea.details'); await p.waitForTimeout(200);
  assert.ok(Math.abs(await height() - kept) <= 2, 'height lost after a reload');
  // Settings shows it; double-tap the bar resets it
  await p.evaluate(() => { location.hash = '#loggingadv'; });
  await p.getByText(`${kept} px`).waitFor();
  await p.evaluate(() => { location.hash = '#log'; }); await p.waitForSelector('textarea.details');
  // Locator clicks wait for the returning page's slide to finish before choosing coordinates.
  await p.locator('.box-grab').click({ clickCount: 2, delay: 80 });
  await p.waitForFunction(async () => !(await import('./js/display.js')).display().boxHeight);
  assert.ok(Math.abs(await height() - h0) <= 2, `reset did not bring the default height back: ${h0} -> ${await height()}`);
  // Grow as I type off: the box keeps its height
  await p.evaluate(async () => (await import('./js/display.js')).setDisplay({ boxGrow: false }));
  await box.fill(Array.from({ length: 12 }, (_, i) => `fake line ${i + 1}`).join('\n'));
  assert.ok(Math.abs(await height() - h0) <= 2, 'grew with the switch off');
  await box.fill('');
  // List (paste a list) has its own grab bar and its own height; the case box's stays as it was
  await p.evaluate(async () => (await import('./js/display.js')).setDisplay({ boxGrow: null }));
  const toList = async () => { await p.locator('button[data-mode="bulk"]').click(); await p.locator('.box-grab').waitFor(); };
  await toList();
  const lh0 = await height();
  const lg = await p.locator('.box-grab').boundingBox();
  await p.mouse.move(lg.x + lg.width / 2, lg.y + lg.height / 2); await p.mouse.down();
  await p.mouse.move(lg.x + lg.width / 2, lg.y + lg.height / 2 + 100, { steps: 6 }); await p.mouse.up();
  const lkept = await p.evaluate(async () => (await import('./js/display.js')).display().listHeight);
  assert.ok(Math.abs(lkept - (lh0 + 100)) <= 4, `list kept ${lkept}, wanted about ${lh0 + 100}`);
  assert.equal(await p.evaluate(async () => (await import('./js/display.js')).display().boxHeight ?? null), null, 'the case box height untouched');
  await p.reload(); await p.waitForSelector('textarea.details'); await p.waitForTimeout(200);
  if (!(await p.locator('button[data-mode="bulk"][aria-pressed="true"]').count())) await toList();
  assert.ok(Math.abs(await height() - lkept) <= 2, 'list height lost after a reload');
  await p.locator('.box-grab').click({ clickCount: 2, delay: 80 });
  await p.waitForFunction(async () => !(await import('./js/display.js')).display().listHeight);
  assert.ok(Math.abs(await height() - lh0) <= 2, 'list reset did not bring the default height back');
  await p.locator('button[data-mode="one"]').click();
  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log(`PASS box height ${width < 600 ? 'phone' : 'desktop'}`);
} } finally { await b.close(); }
