// Fake data only. More → Notes → Select and Bulk edit… (log2 9b, 15 Oct 2026): press and hold (or Select) starts
// selecting; Bulk edit adds in front of titles and unlinks, with Undo; a daily note keeps its day; Merge into one (in
// date order; Undo brings the originals back); Move to the bin; a note's own bin while selecting.
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
    const D = await import('./js/demo-backend.js'), t = Date.now();
    D.saveNote('demo@example.com', { id: 'fake-n1', date: '2020-03-01', title: 'Fakenote one', body: 'Fake body one', caseId: 'fake-case', createdAt: t, updatedAt: t });
    D.saveNote('demo@example.com', { id: 'fake-n2', date: '2020-03-05', title: 'Fakenote two', body: 'Fake body two', createdAt: t + 1, updatedAt: t + 1 });
    D.saveNote('demo@example.com', { id: 'fake-n3', date: '2020-03-03', title: 'Fakenote three', body: 'Fake body three', createdAt: t + 2, updatedAt: t + 2 });
    D.saveNote('demo@example.com', { id: 'day-2020-03-04', date: '2020-03-04', title: '', body: 'Fakenote daily', createdAt: t + 3, updatedAt: t + 3 });
  });
  const note = id => p.evaluate(async id => ((await import('./js/demo-backend.js')).notesOf('demo@example.com') || []).find(n => n.id === id) || null, id);
  const bar = p.locator('.sel-bar'), dlg = p.locator('dialog[open]');
  const toastSays = re => poll(async () => re.test(await p.locator('#toast').innerText()), 'toast ' + re);
  const rows = () => p.locator('ul.notes-rows > li');
  const row = t => p.locator('ul.notes-rows > li', { hasText: t });
  await p.evaluate(() => { location.hash = '#notes'; });
  await p.getByLabel('Search notes').fill('Fakenote');
  await poll(async () => (await rows().count()) === 4, 'four fake notes');

  // start
  if (width === 390) {
    const box = await row('Fakenote one').boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + 12); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up(); await p.waitForTimeout(800);
  } else {
    await p.locator('button.notes-selbtn').click();
    await row('Fakenote one').click();
  }
  await bar.waitFor();
  assert.match(await bar.innerText(), /1 selected/);
  // each note has its own bin while selecting: one tap moves it to the bin, Undo brings it back (16 Oct 2026)
  await row('Fakenote three').getByRole('button', { name: 'Delete Fakenote three' }).click();
  await toastSays(/Note moved to the recycle bin/);
  await poll(async () => (await rows().count()) === 3, 'the binned note gone');
  assert.match(await bar.innerText(), /1 selected/, 'the selection stays');
  await p.locator('#toast').getByRole('button', { name: 'Undo' }).click();
  await poll(async () => (await rows().count()) === 4, 'Undo brings it back');
  assert.equal(await p.locator('.note-editor').count(), 0, 'no editor opened');
  await row('Fakenote two').click();
  assert.match(await bar.innerText(), /2 selected/);
  await bar.getByRole('button', { name: /^Select all 4( found)?$/ }).click();
  assert.match(await bar.innerText(), /4 selected/);

  // bulk edit: add in front of the title, unlink, set the date (the daily note keeps its day); then Undo
  await bar.getByRole('button', { name: 'Bulk edit…' }).click();
  await dlg.locator('h2', { hasText: 'Bulk edit 4 notes' }).waitFor();
  await dlg.getByLabel('Title', { exact: true }).selectOption('prefix');
  await dlg.getByLabel('Text to add in front').fill('ICU:');
  await dlg.getByLabel('Linked case').selectOption('unlink');
  await dlg.getByLabel('Date', { exact: true }).selectOption('set');
  await dlg.getByLabel('New date').fill('2020-04-01');
  await dlg.getByRole('button', { name: 'Review changes' }).click();
  await dlg.locator('h3', { hasText: 'Change 4 notes' }).waitFor();
  assert.match(await dlg.locator('.bulk-lines').innerText(), /daily notes keep their day/);
  await dlg.locator('.bulk-warn').waitFor();
  await dlg.getByRole('button', { name: 'Save' }).click();
  await toastSays(/4 notes updated/);
  await poll(async () => { const n = await note('fake-n1'); return n && n.title === 'ICU: Fakenote one' && !n.caseId && n.date === '2020-04-01'; }, 'saved');
  const d = await note('day-2020-03-04');
  assert.equal(d.date, '2020-03-04', 'the daily note keeps its day'); assert.equal(d.title, 'ICU:');
  await p.locator('#toast button', { hasText: 'Undo' }).click();
  await toastSays(/4 notes put back/);
  await poll(async () => { const n = await note('fake-n1'); return n && n.title === 'Fakenote one' && n.caseId === 'fake-case' && n.date === '2020-03-01'; }, 'undone');

  // merge two into one (date order), then Undo
  await p.locator('button.notes-selbtn').click();
  await row('Fakenote two').click(); await row('Fakenote three').click();
  await bar.getByRole('button', { name: 'Bulk edit…' }).click();
  await dlg.getByRole('button', { name: 'Merge into one' }).click();
  await toastSays(/2 notes merged into one/);
  await poll(async () => !(await note('fake-n2')) && !(await note('fake-n3')), 'originals in the bin');
  const merged = await p.evaluate(async () => ((await import('./js/demo-backend.js')).notesOf('demo@example.com') || []).find(n => /^Merged: /.test(n.title)));
  assert.equal(merged.title, 'Merged: Fakenote three');
  assert.ok(merged.body.indexOf('Fakenote three') < merged.body.indexOf('Fakenote two'), 'date order');
  assert.equal(merged.date, '2020-03-03');
  await p.locator('#toast button', { hasText: 'Undo' }).click();
  await poll(async () => (await note('fake-n2')) && (await note('fake-n3')) && !(await note(merged.id)), 'merge undone');

  // move to the bin
  await poll(async () => (await rows().count()) === 4, 'four again');
  await p.locator('button.notes-selbtn').click();
  await row('Fakenote three').click();
  await bar.getByRole('button', { name: 'Bulk edit…' }).click();
  await dlg.getByRole('button', { name: 'Move to the bin' }).click();
  await toastSays(/Note moved to the recycle bin|1 note/);
  await poll(async () => !(await note('fake-n3')), 'binned');
  assert.ok(await bar.isHidden(), 'selecting stops');
  assert.equal(await p.locator('.sel-box').count(), 0);

  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log('PASS notes select ' + (width === 390 ? 'phone' : 'desktop'));
} } finally { await b.close(); }
