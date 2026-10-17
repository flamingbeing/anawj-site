// Fake data only. Logbook pages (log2 11, 16 Oct 2026): List shows 100 cases a page; ‹ › and a list of the pages with
// their dates; 25 / 50 / 100 / 300 / All a page (this device, kept after a reload); a new search goes back to page 1;
// the Grid pages the same way; the Calendar stays monthly.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const poll = async (fn, what, ms = 8000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw new Error('timed out: ' + what); await new Promise(r => setTimeout(r, 100)); } };
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const open = async () => {
    await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
    await p.waitForFunction(() => Number(document.body.dataset.cases) > 200);
    await p.evaluate(() => { location.hash = '#logbook'; });
    await p.locator('.seg button', { hasText: 'List' }).click();
    await p.locator('ul.cases li:not(.monthhead)').first().waitFor();
  };
  await open();
  const total = await p.evaluate(() => Number(document.body.dataset.cases));
  const rows = () => p.locator('ul.cases li:not(.monthhead)').count();
  const pageSel = () => p.locator('.lb-pager:not(.bottom) .lb-pagesel');
  const pages = Math.ceil(total / 100);
  assert.equal(await rows(), 100, '100 a page');
  assert.match(await pageSel().locator('option:checked').innerText(), new RegExp(`^Page 1 of ${pages} · \\d`), 'the page and its dates');
  const first = await p.locator('ul.cases li:not(.monthhead)').first().innerText();
  await p.locator('.lb-pager:not(.bottom)').getByRole('button', { name: 'Next page' }).click();
  await poll(async () => (await pageSel().inputValue()) === '1', 'page 2');
  assert.notEqual(await p.locator('ul.cases li:not(.monthhead)').first().innerText(), first, 'other cases');
  await pageSel().selectOption(String(pages - 1));
  await poll(async () => (await rows()) === total - (pages - 1) * 100, 'the last page');
  assert.equal(await p.locator('.lb-pager:not(.bottom)').getByRole('button', { name: 'Next page' }).isDisabled(), true);
  // a new search goes back to page 1
  await p.getByLabel('Search cases').fill('lap');
  await poll(async () => (await pageSel().count()) === 0 || (await pageSel().inputValue()) === '0', 'page 1 after a search');
  await p.getByLabel('Search cases').fill('');
  await poll(async () => (await rows()) === 100, 'back to 100');
  // 25 a page, kept on this device; All shows them all
  await p.getByLabel('Cases per page').selectOption('25');
  await poll(async () => (await rows()) === 25, '25 a page');
  await open();
  assert.equal(await rows(), 25, 'kept after a reload');
  assert.equal(await p.evaluate(async () => (await import('./js/display.js')).display().pageSize), 25);
  await p.getByLabel('Cases per page').selectOption('0');
  await poll(async () => (await rows()) === total, 'all');
  assert.equal(await pageSel().count(), 0, 'no page list for one page');
  await p.getByLabel('Cases per page').selectOption('100');
  await poll(async () => (await rows()) === 100, '100 again');
  assert.equal(await p.evaluate(async () => (await import('./js/display.js')).display().pageSize ?? null), null, '100 is the default: not stored');
  // the Grid pages too
  await p.evaluate(async () => { const { patchLogbook } = await import('./js/ui-core.js'); await patchLogbook({ settings: { show: { grid: true } } }); });
  await open();
  await p.locator('.seg button', { hasText: 'Grid' }).click();
  await poll(async () => (await p.locator('table.grid tbody tr').count()) === 100, 'grid: 100');
  await p.locator('.lb-pager:not(.bottom)').getByRole('button', { name: 'Next page' }).click();
  await poll(async () => (await pageSel().inputValue()) === '1', 'grid page 2');
  // the Calendar stays monthly (no pages)
  await p.locator('.seg button', { hasText: 'Calendar' }).click();
  await p.locator('.lb-cal').waitFor();
  assert.equal(await p.locator('.lb-pager').count(), 0);

  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log('PASS paging ' + (width === 390 ? 'phone' : 'desktop'));
} } finally { await b.close(); }
