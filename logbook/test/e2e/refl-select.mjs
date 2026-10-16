// Fake data only. Reflections → Select and Bulk edit… (log2 9c, 16 Oct 2026): press and hold a row (or Select) starts
// selecting; the bar's Select all; Bulk edit marks complete (ones missing something stay drafts and the review says
// why), leaves out of the export, with Undo; moves to a heading; Move to the bin.
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
  const heading = await p.evaluate(async () => {
    const { S, cloud } = await import('./js/ui-core.js'), { REFLECTION_HEADINGS } = await import('./js/categories.js');
    const hd = REFLECTION_HEADINGS[0].id, pt = [{ heading: 'Fake point', text: 'Fake text' }];
    await cloud.saveReflection(S.user.email, { id: 'fake-r1', headingId: '', initials: 'ZQ', date: '2020-05-01', diagnosis: 'Fakerefl one', summary: 'fake', points: pt, status: 'draft' });
    await cloud.saveReflection(S.user.email, { id: 'fake-r2', headingId: '', initials: 'ZW', date: '2020-05-02', diagnosis: 'Fakerefl two', summary: 'fake', points: pt, status: 'draft' });
    await cloud.saveReflection(S.user.email, { id: 'fake-r3', headingId: '', initials: '', date: '2020-05-03', diagnosis: 'Fakerefl three', summary: 'fake', points: pt, status: 'draft' });
    return hd;
  });
  const refl = id => p.evaluate(async id => ((await import('./js/ui-core.js')).S.reflections || []).find(r => r.id === id) || null, id);
  const bar = p.locator('.sel-bar'), dlg = p.locator('dialog[open]');
  const toastSays = re => poll(async () => re.test(await p.locator('#toast').innerText()), 'toast ' + re);
  const row = t => p.locator('li.refl-row', { hasText: t });
  await p.evaluate(() => { location.hash = '#reflect'; });
  await p.getByLabel('Search reflections').fill('Fakerefl');
  await poll(async () => (await p.locator('li.refl-row').count()) === 3, 'three fake reflections');
  await p.waitForTimeout(400);   // (the search repaints after a quarter second)

  if (width === 390) {
    const box = await row('Fakerefl one').boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + 12); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up(); await p.waitForTimeout(800);
  } else {
    await p.locator('main button', { hasText: /^Select$/ }).first().click();
    await row('Fakerefl one').click();
  }
  await bar.waitFor();
  assert.match(await bar.innerText(), /1 selected/);
  assert.equal(await p.locator('.refl-editor, .reflect-editor').count(), 0, 'no editor opened');
  await row('Fakerefl two').click();
  assert.match(await bar.innerText(), /2 selected/);
  await bar.getByRole('button', { name: /^Select all 3( found)?$/ }).click();
  assert.match(await bar.innerText(), /3 selected/);

  // complete + left out of the export: the one without initials stays a draft, and the review says why
  await bar.getByRole('button', { name: 'Bulk edit…' }).click();
  await dlg.locator('h2', { hasText: 'Bulk edit 3 reflections' }).waitFor();
  await dlg.getByLabel('Status', { exact: true }).selectOption('complete');
  await dlg.getByLabel('Portfolio export', { exact: true }).selectOption('out');
  await dlg.getByRole('button', { name: 'Review changes' }).click();
  await dlg.locator('h3', { hasText: 'Change 3 reflections' }).waitFor();
  assert.match(await dlg.locator('.bulk-lines').innerText(), /Status: complete[\s\S]*Portfolio export: left out/);
  await dlg.getByRole('button', { name: 'Save' }).click();
  await toastSays(/3 reflections updated/);
  await poll(async () => (await refl('fake-r1'))?.status === 'complete' && (await refl('fake-r1')).export === false, 'r1 saved');
  const r3 = await refl('fake-r3');
  assert.equal(r3.status, 'draft', 'missing initials: still a draft'); assert.equal(r3.export, false, 'but left out of the export');
  await p.locator('#toast button', { hasText: 'Undo' }).click();
  await toastSays(/3 reflections put back/);
  await poll(async () => (await refl('fake-r1'))?.status === 'draft' && (await refl('fake-r1')).export !== false, 'undone');

  // complete alone on the one missing initials: nothing to change, and it says why
  await p.locator('main button', { hasText: /^Select$/ }).first().click();
  await row('Fakerefl three').click();
  await bar.getByRole('button', { name: 'Bulk edit…' }).click();
  await dlg.getByLabel('Status', { exact: true }).selectOption('complete');
  await dlg.getByRole('button', { name: 'Review changes' }).click();
  await toastSays(/None of them would change|still missing initials/);
  await dlg.getByRole('button', { name: 'Cancel' }).click();

  // move to a heading
  await row('Fakerefl two').click();
  await bar.getByRole('button', { name: 'Bulk edit…' }).click();
  await dlg.getByLabel('Heading', { exact: true }).selectOption('move');
  await dlg.getByLabel('Move to heading').selectOption(heading);
  await dlg.getByRole('button', { name: 'Review changes' }).click();
  await dlg.locator('.bulk-warn').waitFor();
  await dlg.getByRole('button', { name: 'Save' }).click();
  await toastSays(/2 reflections updated/);
  await poll(async () => (await refl('fake-r2'))?.headingId === heading && (await refl('fake-r3'))?.headingId === heading, 'moved');

  // move to the bin
  await p.locator('main button', { hasText: /^Select$/ }).first().click();
  await row('Fakerefl one').click();
  await bar.getByRole('button', { name: 'Bulk edit…' }).click();
  await dlg.getByRole('button', { name: 'Move to the bin' }).click();
  await toastSays(/1 reflection moved to the recycle bin/);
  await poll(async () => !(await refl('fake-r1')), 'binned');
  assert.equal(await bar.count(), 0, 'selecting stops');

  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log('PASS reflections select ' + (width === 390 ? 'phone' : 'desktop'));
} } finally { await b.close(); }
