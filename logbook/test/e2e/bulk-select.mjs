// Fake data only. Logbook → Select and Bulk edit… (log2 9 / 9d, 15 Oct 2026): press and hold a row (or Select) starts
// selecting; the bar's Select all takes the whole search; Bulk edit… changes tags and Interesting with Undo; find and
// replace warns; 20+ cases show samples first; Move to the bin; the calendar's day list selects too.
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
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  await p.evaluate(async () => {
    const { S, cloud, setCases } = await import('./js/ui-core.js');
    for (const [i, x] of ['a', 'b', 'c', 'd', 'e'].entries()) await cloud.saveCase(S.user.email, { id: 'fake-sel-' + x, date: `2020-01-0${i + 1}`, initials: 'ZQ', details: 'Fakesel case ' + x, cats: ['16'], createdAt: i + 1, updatedAt: Date.now(), source: 'app' });
    for (let i = 0; i < 21; i++) await cloud.saveCase(S.user.email, { id: 'fake-big-' + i, date: '2020-02-01', initials: 'ZR', details: 'Fakebig case ' + i, cats: ['16'], createdAt: 100 + i, updatedAt: Date.now(), source: 'app' });
    setCases(await cloud.listCases(S.user.email));
  });
  const server = id => p.evaluate(async id => (await (await import('./js/ui-core.js')).cloud.listCases('demo@example.com')).find(c => c.id === id), id);
  const bar = p.locator('.sel-bar');
  const dlg = p.locator('dialog[open]');
  const toastSays = re => poll(async () => re.test(await p.locator('#toast').innerText()), 'toast ' + re);
  await p.evaluate(() => { location.hash = '#logbook'; });
  await p.locator('.seg button', { hasText: 'List' }).click();
  await p.getByLabel('Search cases').fill('Fakesel case');
  const shown = () => p.locator('ul.cases li:not(.monthhead)').count();
  await poll(async () => (await shown()) === 5, 'the search shows the five');

  // start: press and hold a row (phone), or Select (computer)
  const rowA = p.locator('ul.cases li', { hasText: 'Fakesel case a' });
  if (width === 390) {
    const box = await rowA.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + 12); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up(); await p.waitForTimeout(400);   // (the click after a hold is swallowed for 350 ms)
    await bar.waitFor();
    assert.match(await bar.innerText(), /1 selected/, 'the held row is selected');
    assert.equal(await p.locator('dialog[open]').count(), 0, 'the hold opens nothing else');
  } else {
    await p.locator('button.lb-selbtn').click();
    await bar.waitFor();
    assert.match(await bar.innerText(), /0 selected/);
    await rowA.click();
    assert.match(await bar.innerText(), /1 selected/);
  }
  assert.equal(await rowA.locator('.sel-box').isChecked(), true);
  await p.locator('ul.cases li', { hasText: 'Fakesel case b' }).click();
  assert.match(await bar.innerText(), /2 selected/, 'a tap ticks a row');
  assert.equal(await dlg.count(), 0, 'a tap while selecting does not open the case');
  await bar.getByRole('button', { name: /^Select all 5 found$/ }).click();
  assert.match(await bar.innerText(), /5 selected/);
  await bar.getByRole('button', { name: 'Select none' }).click();
  assert.match(await bar.innerText(), /0 selected/);
  assert.equal(await bar.getByRole('button', { name: 'Bulk edit…' }).isDisabled(), true);
  await bar.getByRole('button', { name: /^Select all/ }).click();

  // Bulk edit: add a tag and mark interesting (nothing replaced: no warning), Save, then Undo
  await bar.getByRole('button', { name: 'Bulk edit…' }).click();
  await dlg.locator('h2', { hasText: 'Bulk edit 5 cases' }).waitFor();
  await dlg.getByLabel('Tags', { exact: true }).selectOption('add');
  await dlg.getByLabel('Tag to add').selectOption('c:17');
  await dlg.getByLabel('Interesting', { exact: true }).selectOption('on');
  await dlg.getByRole('button', { name: 'Review changes' }).click();
  await dlg.locator('h3', { hasText: 'Change 5 cases' }).waitFor();
  const lines = await dlg.locator('.bulk-lines').innerText();
  assert.match(lines, /Tags: add /); assert.match(lines, /Interesting: on/);
  assert.equal(await dlg.locator('.bulk-warn').count(), 0, 'adding replaces nothing');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await toastSays(/5 cases updated/);
  assert.ok(await bar.isHidden(), 'selecting stops after a save');
  await poll(async () => { const c = await server('fake-sel-c'); return c.cats.includes('17') && c.reflectTag === true; }, 'tag and star saved');
  await p.locator('#toast button', { hasText: 'Undo' }).click();
  await toastSays(/5 cases put back/);
  await poll(async () => { const c = await server('fake-sel-c'); return JSON.stringify(c.cats) === '["16"]' && !c.reflectTag; }, 'undone');

  // find and replace: a warning before Save
  await p.locator('button.lb-selbtn').click();
  await bar.getByRole('button', { name: /^Select all/ }).click();
  await bar.getByRole('button', { name: 'Bulk edit…' }).click();
  await dlg.getByLabel('Case summary').selectOption('find');
  await dlg.getByLabel('Find', { exact: true }).fill('Fakesel');
  await dlg.getByLabel('Replace with', { exact: true }).fill('Fakeswap');
  await dlg.getByRole('button', { name: 'Review changes' }).click();
  await dlg.locator('.bulk-warn').waitFor();
  assert.equal(await dlg.locator('.bulk-samples li').count(), 3, 'samples, before → after');
  assert.equal(await dlg.getByRole('button', { name: 'Save' }).count(), 1, 'fewer than 20: just Save');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await toastSays(/5 cases updated/);
  await poll(async () => (await server('fake-sel-a')).details === 'Fakeswap case a', 'find and replace saved');

  // 20+ cases and an overwriting change: three samples and a button naming the size
  await p.getByLabel('Search cases').fill('Fakebig case');
  await poll(async () => (await shown()) === 21, 'the search shows the 21');
  await p.locator('button.lb-selbtn').click();
  await bar.getByRole('button', { name: /^Select all 21 found$/ }).click();
  await bar.getByRole('button', { name: 'Bulk edit…' }).click();
  await dlg.getByLabel('Date', { exact: true }).selectOption('set');
  await dlg.getByRole('button', { name: 'Review changes' }).click();
  await poll(async () => /Choose the date/.test(await p.locator('#toast').innerText()), 'a missing date says so');
  await dlg.getByLabel('New date').fill('2020-03-03');
  await dlg.getByRole('button', { name: 'Review changes' }).click();
  await dlg.locator('.bulk-samples').waitFor();
  assert.equal(await dlg.locator('.bulk-samples li').count(), 3);
  await dlg.getByRole('button', { name: 'Change 21 cases' }).waitFor();
  await dlg.getByRole('button', { name: 'Back' }).click();
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await dlg.count(), 0);
  assert.equal((await server('fake-big-0')).date, '2020-02-01', 'nothing saved without Save');

  // Actions: move two to the bin (Undo there brings them back)
  await bar.getByRole('button', { name: 'Select none' }).click();
  const big = n => p.locator('ul.cases li').filter({ has: p.locator('.t', { hasText: new RegExp(`^Fakebig case ${n}$`) }) });
  await big(1).click(); await big(2).click();
  await bar.getByRole('button', { name: 'Bulk edit…' }).click();
  await dlg.getByRole('button', { name: 'Move to the bin' }).click();
  await toastSays(/2 cases moved to the recycle bin/);
  await poll(async () => !(await server('fake-big-1')) && !(await server('fake-big-2')), 'binned');
  await poll(() => bar.isHidden(), 'selecting stops once the move is done');   // (the server can be quicker than the page)

  // the calendar's day list selects too
  await p.getByLabel('Search cases').fill('');
  await p.locator('.seg button', { hasText: 'Calendar' }).click();
  await p.evaluate(async () => { const { createCase, todayISO } = await import('./js/ui-core.js'); await createCase({ date: todayISO(), initials: 'ZT', details: 'Fakeday case', cats: ['16'] }); });
  await p.locator('.lb-daydetail li', { hasText: 'Fakeday case' }).waitFor();
  await p.locator('button.lb-selbtn').click();
  await p.locator('.lb-daydetail li', { hasText: 'Fakeday case' }).click();
  assert.match(await bar.innerText(), /1 selected/);
  await bar.getByRole('button', { name: 'Done' }).click();
  assert.ok(await bar.isHidden());
  assert.equal(await p.locator('.sel-box').count(), 0, 'Done takes the checkboxes away');

  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log('PASS bulk select ' + (width === 390 ? 'phone' : 'desktop'));
} } finally { await b.close(); }
