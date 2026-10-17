// Fake data only. The Grid as a spreadsheet (log2 10, 16 Oct 2026): thin lines and plain cells; a column's width drags
// from its heading's edge (kept on this device, back after a reload; a double-tap resets it); lines per row 1 / 2 / 3 /
// Fit (the summary grows to its text); an edit still saves when the cell is left.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const poll = async (fn, what, ms = 8000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw new Error('timed out: ' + what); await new Promise(r => setTimeout(r, 100)); } };
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const open = async () => {
    await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
    await p.waitForFunction(() => Number(document.body.dataset.cases) > 0);
    await p.evaluate(async () => { const { patchLogbook } = await import('./js/ui-core.js'); await patchLogbook({ settings: { show: { grid: true }, logbookView: 'grid' } }); location.hash = '#logbook'; });
    await p.locator('table.grid.sheet tbody tr').first().waitFor();
  };
  await open();
  const display = () => p.evaluate(async () => (await import('./js/display.js')).display());

  // plain cells: no box around an input
  assert.equal(await p.locator('table.grid.sheet td.ini input').first().evaluate(e => getComputedStyle(e).borderTopWidth), '0px');
  // resize Initials by dragging its heading's edge
  const grip = p.locator('table.grid.sheet th', { hasText: 'Initials' }).locator('.col-grip');
  const g = await grip.boundingBox(), th0 = await p.locator('table.grid.sheet th', { hasText: 'Initials' }).boundingBox();
  await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await p.mouse.down();
  await p.mouse.move(g.x + g.width / 2 + 80, g.y + g.height / 2, { steps: 5 }); await p.mouse.up();
  const w1 = (await display()).gridCols?.ini;
  assert.ok(w1 && Math.abs(w1 - (th0.width + 80)) <= 6, `width kept on this device: ${w1} vs ${th0.width + 80}`);
  await open();
  const th1 = await p.locator('table.grid.sheet th', { hasText: 'Initials' }).boundingBox();
  assert.ok(Math.abs(th1.width - w1) <= 3, `back after a reload: ${th1.width} vs ${w1}`);
  // a double-tap on the edge resets it
  const g2 = await grip.boundingBox();
  await p.mouse.click(g2.x + g2.width / 2, g2.y + g2.height / 2); await p.mouse.click(g2.x + g2.width / 2, g2.y + g2.height / 2);
  await poll(async () => !(await display()).gridCols, 'reset');
  // a keyboard can resize it too (→ wider)
  await p.locator('table.grid.sheet th', { hasText: 'Initials' }).locator('.col-grip').focus();
  await p.keyboard.press('ArrowRight');
  assert.ok((await display()).gridCols?.ini > 0, 'arrow keys resize');
  await open();   // (the Reset button comes with the next drawing)
  await p.getByRole('button', { name: 'Reset column widths' }).click();
  await poll(async () => !(await display()).gridCols, 'reset button');

  // lines per row
  const ta = () => p.locator('table.grid.sheet textarea.g-details').first();
  assert.equal(await ta().getAttribute('rows'), '1');
  await p.getByLabel('Lines per row').selectOption('3');
  await poll(async () => (await ta().getAttribute('rows')) === '3', '3 lines');
  assert.equal((await display()).gridLines, '3');
  await p.getByLabel('Lines per row').selectOption('fit');
  await poll(async () => (await p.locator('table.grid.sheet.fit').count()) === 1, 'fit');
  // an edit in a summary cell still saves when the cell is left; Fit grows the cell to the text
  await ta().fill('Fakegrid edited line one\nline two\nline three\nline four');
  const h4 = await ta().evaluate(e => e.offsetHeight);
  assert.ok(h4 > 80, 'Fit grows the cell: ' + h4);
  await p.locator('table.grid.sheet td.ini input').first().focus();
  await poll(async () => p.evaluate(async () => (await import('./js/ui-core.js')).S.cases.some(c => /^Fakegrid edited/.test(c.details || ''))), 'saved');
  await p.getByLabel('Lines per row').selectOption('1');
  await poll(async () => !(await display()).gridLines, 'back to 1 (the default, not stored)');

  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log('PASS grid sheet ' + (width === 390 ? 'phone' : 'desktop'));
} } finally { await b.close(); }
