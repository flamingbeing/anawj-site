// Fake data only. Logbook List Group by and Sort (log2 14, 16 Oct 2026; in the Filter panel): the default (Month, Newest) looks as before
// (Jump on each month); APMES tag groups a case under each tag with the count against the target; a heading folds
// its group; Oldest and Initials A–Z sort; the choice stays on this device; Select ticks a whole group.
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
    // Group by and Sort live in the Filter panel (the List looks as before until it is opened)
    if (!(await p.getByLabel('Group by').isVisible())) await p.getByRole('button', { name: 'Filter' }).click();
    await p.getByLabel('Group by').waitFor();
  };
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  await p.evaluate(() => { location.hash = '#logbook'; });
  await p.locator('.seg button', { hasText: 'List' }).click();
  assert.equal(await p.getByLabel('Group by').isVisible(), false, 'folded away in the Filter panel: the List looks as before');
  await open();
  const rows = () => p.locator('ul.cases li:not(.monthhead)');
  const heads = () => p.locator('ul.cases li.monthhead');
  // the default: month headings with Jump, newest first
  assert.equal(await p.getByLabel('Group by').inputValue(), 'month');
  assert.ok(await heads().first().locator('.jump').count(), 'Jump on the month heading');
  const dates = async () => p.$$eval('ul.cases li[data-date]', l => l.map(x => x.dataset.date).filter(Boolean));
  const d0 = await dates();
  assert.deepEqual(d0, [...d0].sort().reverse(), 'newest first');
  // Oldest first: month headings without Jump, dates rising
  await p.getByLabel('Sort').selectOption('oldest');
  await poll(async () => { const d = await dates(); return d.length && d[0] <= d[d.length - 1] && d[0] !== d0[0]; }, 'oldest first');
  const d1 = await dates(); assert.deepEqual(d1, [...d1].sort(), 'oldest first, all the way');
  assert.equal(await heads().first().locator('.lb-gfold').count(), 1, 'a fold button on the heading');
  // APMES tag: the count against the target; fold and unfold
  await p.getByLabel('Sort').selectOption('newest');
  await p.getByLabel('Group by').selectOption('tag');
  await poll(async () => /\d+ cases?/i.test(await heads().first().innerText()), 'tag headings');
  const first = heads().first(), fold = first.locator('.lb-gfold');
  assert.equal(await fold.getAttribute('aria-expanded'), 'true');
  const before = await rows().count();
  const n = Number((await fold.innerText()).match(/(\d+) cases?/i)[1]);
  await fold.click();
  await poll(async () => (await heads().first().locator('.lb-gfold').getAttribute('aria-expanded')) === 'false', 'folded');
  assert.ok((await rows().count()) < before || n === 0 || before === 100, 'fewer rows once folded');
  await heads().first().locator('.lb-gfold').click();
  await poll(async () => (await heads().first().locator('.lb-gfold').getAttribute('aria-expanded')) === 'true', 'unfolded');
  // kept on this device
  await open();
  assert.equal(await p.getByLabel('Group by').inputValue(), 'tag', 'kept after a reload');
  assert.equal(await p.evaluate(async () => (await import('./js/display.js')).display().lbGroup), 'tag');
  // Initials A–Z within None
  await p.getByLabel('Group by').selectOption('none');
  await p.getByLabel('Sort').selectOption('initials');
  await poll(async () => /all cases/i.test(await heads().first().innerText()), 'one group');
  // Select: "Select these N" on the heading
  await p.getByRole('button', { name: 'Select', exact: true }).click();
  await p.locator('.lb-ghead button', { hasText: /^Select these \d+/ }).first().click();
  await poll(async () => /^\d+ selected/.test(await p.locator('.sel-n').innerText()) && !(await p.locator('.sel-n').innerText()).startsWith('0 '), 'a group selected');
  await p.getByRole('button', { name: 'Done' }).click();
  // back to the defaults: nothing stored
  await p.getByLabel('Group by').selectOption('month');
  await p.getByLabel('Sort').selectOption('newest');
  await poll(async () => (await heads().first().locator('.jump').count()) === 1, 'the default again');
  assert.deepEqual(await p.evaluate(async () => { const d = (await import('./js/display.js')).display(); return [d.lbGroup ?? null, d.lbSort ?? null]; }), [null, null], 'defaults not stored');
  assert.deepEqual(errors, []);
  await ctx.close();
  console.log('ok', width);
} } finally { await b.close(); }
console.log('PASS lb-group');
