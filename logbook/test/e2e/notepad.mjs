// Fake data only. Notes (More → Notes): lazy loading, the editor and autosave, search, to-dos, day and case links,
// the day's Copy, Arrange tabs, the recycle bin, the 100-note limit and the backup.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const S = () => p.evaluate(async () => { const { S } = await import('./js/ui-core.js'); return { notes: S.notes, index: S.noteIndex || null }; });
  const today = await p.evaluate(() => 0) || null;
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  const iso = await p.evaluate(async () => (await import('./js/engine.js')).todayISO());
  void today;

  // not read at sign-in, not on the bar, first in More with its one line
  assert.equal((await S()).notes, null);
  assert.equal(await p.locator('[role=tab][data-tab=notes]').count(), 0);
  await p.locator('[role=tab][data-tab=more]').click();
  const moreLink = p.locator('.more-list a[data-go=notes]');
  assert.match(await moreLink.innerText(), /Notes \(beta\)[\s\S]*private, never in your portfolio/);
  await moreLink.click();
  await p.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
  assert.match(await p.locator('.notes-page').innerText(), /No notes yet[\s\S]*Use Reflect instead/);
  assert.equal(await p.locator('[role=tab][aria-selected=true]').getAttribute('data-tab'), 'more');

  // a new note: today's date, saved after a pause in typing, listed with its count
  await p.getByRole('button', { name: '+ New note' }).click();
  assert.equal(await p.getByLabel('Note date').inputValue(), iso);
  await p.getByLabel('Note title').fill('Fake teaching point');
  await p.getByLabel('Note text').fill('Fake dose reminder\n- [ ] fake to-do\n- [x] fake done');
  assert.equal(await p.locator('.notes-status').innerText(), 'Not saved yet');
  await p.waitForFunction(() => document.querySelector('.notes-status')?.textContent === 'Saved', null, { timeout: 6000 });
  // ticking a to-do in Preview (in the ⋯ menu) saves the body
  await p.getByRole('button', { name: 'More options' }).click();
  await p.getByRole('menuitem', { name: 'Preview' }).click();
  await p.locator('.note-view input[type=checkbox]').first().check();
  await p.waitForFunction(async () => { const { S } = await import('./js/ui-core.js'); return S.notes?.[0]?.body.includes('- [x] fake to-do'); });
  await p.getByRole('button', { name: 'Done' }).click();
  await p.locator('ul.notes-rows li').first().waitFor();
  assert.match(await p.locator('.notes-count').innerText(), /^1 of 100$/);
  assert.match(await p.locator('ul.notes-rows').innerText(), /Fake teaching point/);
  assert.deepEqual((await S()).index, { days: [iso], cases: [], n: 1 });
  // the index lives in its own owner-only doc, never in the logbook doc the app owner can read
  assert.equal(await p.evaluate(async () => { const { S } = await import('./js/ui-core.js'); return S.logbook.settings.noteIndex ?? null; }), null);

  // an undated note goes on top; Back closes the editor and keeps what was typed
  await p.getByRole('button', { name: '+ New note' }).click();
  await p.getByLabel('Note text').fill('Fake undated scratch');
  await p.getByRole('button', { name: 'No date' }).click();
  await p.goBack();
  await p.waitForFunction(() => !document.querySelector('.note-editor'));
  // the blur saves it once with today's date, then leaving saves it undated: wait for the second save
  await p.waitForFunction(() => document.querySelectorAll('ul.notes-rows li').length === 2 && /No date[\s\S]*Fake undated scratch/.test(document.querySelector('ul.notes-rows li').innerText));

  // search
  await p.getByLabel('Search notes').fill('dose');
  assert.equal(await p.locator('ul.notes-rows li').count(), 1);
  await p.getByLabel('Search notes').fill('');

  // the Logbook marks today and Copy takes the day's notes too (the day's Copy is off unless switched on)
  assert.equal(await p.getByRole('button', { name: 'Copy this day' }).count(), 0);
  await p.evaluate(async () => { const m = await import('./js/ui-settings.js'); m.applyDisplay(m.setDisplay({ dayCopy: true })); });
  await p.locator('[role=tab][data-tab=logbook]').click();
  const cal = p.locator('main .seg button').filter({ hasText: /^Calendar$/ }); if (await cal.count()) await cal.first().click();
  await p.locator('.lb-day.today .lb-note').waitFor();
  await p.getByRole('button', { name: 'Copy this day' }).click();
  await p.waitForTimeout(300);
  assert.match(await p.evaluate(() => navigator.clipboard.readText()), /## Notes\n\n### Fake teaching point\nFake dose reminder/);
  await p.getByRole('button', { name: 'Notes', exact: true }).click();
  await p.locator('.notes-filter').filter({ hasText: 'Notes on' }).waitFor();
  assert.equal(await p.locator('ul.notes-rows li').count(), 1);

  // link a note to a case: the case row gets a note button that opens it
  await p.locator('ul.notes-rows li').first().click();
  if (await p.locator('.note-view:not([hidden])').count()) { await p.getByRole('button', { name: 'More options' }).click(); await p.getByRole('menuitem', { name: 'Edit' }).click(); }
  await p.getByRole('button', { name: 'Link to a case…' }).click();
  await p.locator('dialog[open] .pick-cases li').first().click();
  await p.locator('.note-link').waitFor();
  await p.getByRole('button', { name: 'Done' }).click();
  await p.waitForFunction(async () => { const { S } = await import('./js/ui-core.js'); return (S.noteIndex?.cases || []).length === 1; });
  const caseId = (await S()).index.cases[0];
  await p.locator('[role=tab][data-tab=logbook]').click();
  const list = p.locator('main .seg button').filter({ hasText: /^List$/ }); await list.first().click();
  await p.getByRole('button', { name: 'Open your notes on this case' }).first().click();
  await p.locator('.notes-filter').waitFor();
  assert.equal(await p.locator('ul.notes-rows li').count(), 1);
  assert.equal((await S()).notes.find(n => n.caseId).caseId, caseId);
  await p.getByRole('button', { name: 'Show all' }).click();

  // delete goes to the recycle bin, and restores
  await p.locator('ul.notes-rows li').filter({ hasText: 'Fake undated scratch' }).click();
  await p.getByRole('button', { name: 'More options' }).click();
  await p.getByRole('menuitem', { name: 'Delete' }).click();
  await p.getByText('Note moved to the recycle bin').waitFor();
  await p.waitForFunction(() => document.querySelectorAll('ul.notes-rows li').length === 1);
  await p.getByRole('button', { name: 'Undo' }).click();
  await p.waitForFunction(() => document.querySelectorAll('ul.notes-rows li').length === 2);

  // the backup holds the notes
  const backup = await p.evaluate(async () => { const { makeBackup } = await import('./js/backup.js'); return (await makeBackup()).notes.map(n => n.title || n.body); });
  assert.equal(backup.length, 2);

  // the Notes page offers the tab bar
  const barTabs = () => p.locator('[role=tab]').evaluateAll(t => t.map(x => x.dataset.tab));
  await p.evaluate(() => { location.hash = '#notes'; });
  await p.getByRole('button', { name: 'Add Notes to the tab bar' }).click();
  await p.locator('[role=tab][data-tab=notes]').waitFor();
  assert.deepEqual(await barTabs(), ['log', 'logbook', 'reflect', 'progress', 'notes', 'more']);
  assert.equal(await p.getByRole('button', { name: 'Add Notes to the tab bar' }).count(), 0);
  // the More pages can go on the bar too, and their own pages select them; seven tabs at most, so an eighth asks
  // which tab it replaces (and takes its place)
  await p.evaluate(() => { location.hash = '#displayadv'; });
  await p.getByLabel('Show Settings', { exact: true }).check();
  await p.locator('[role=tab][data-tab=settings][aria-selected=true]').waitFor();   // Display → Advanced is under Settings
  await p.getByLabel('Show Export / Import', { exact: true }).check();
  await p.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await p.locator('[role=tab][data-tab=data]').count(), 0);
  assert.equal(await p.getByLabel('Show Export / Import', { exact: true }).isChecked(), false);
  await p.getByLabel('Show Export / Import', { exact: true }).check();
  await p.locator('dialog[open]').getByRole('button', { name: 'Notes' }).click();
  await p.locator('[role=tab][data-tab=data]').filter({ hasText: 'Export' }).waitFor();
  assert.deepEqual(await barTabs(), ['log', 'logbook', 'reflect', 'progress', 'data', 'settings', 'more']);
  // More still lists every page; a hidden main tab comes first
  await p.getByLabel('Show Analytics', { exact: true }).uncheck();
  await p.locator('[role=tab][data-tab=more]').click();
  assert.match(await p.locator('.more-list li').first().innerText(), /Analytics/);
  assert.equal(await p.locator('.more-list a[data-go=settings]').count(), 1);
  // over seven (a settings file, say): the last ones before More go to More
  assert.deepEqual(await p.evaluate(async () => { const { arrangeTabs, BAR_TABS } = await import('./js/ui-settings.js');
    return arrangeTabs(BAR_TABS.map(([id]) => id), { tabHidden: [], tabOrder: BAR_TABS.map(([id]) => id) }).shown; }),
    ['caselogs', 'log', 'logbook', 'reflect', 'progress', 'notes', 'more']);
  await p.evaluate(async () => { const { applyDisplay, setDisplay } = await import('./js/ui-settings.js'); applyDisplay(setDisplay({ tabHidden: null, tabOrder: null })); });

  // at 100 notes, no more
  await p.evaluate(async () => {
    const D = await import('./js/demo-backend.js');
    for (let i = 0; i < 98; i++) D.saveNote('demo@example.com', { id: 'fake-' + i, date: null, title: 'Fake filler ' + i, body: '' });
  });
  await p.evaluate(() => { location.hash = '#notes'; });
  await p.locator('.notes-count').filter({ hasText: '100 of 100' }).waitFor();
  await p.getByRole('button', { name: '+ New note' }).click();
  await p.getByText(/You have 100 notes, the most allowed/).first().waitFor();
  assert.equal(await p.locator('.note-editor').count(), 0);

  assert.deepEqual(errors, []); await ctx.close(); console.log(`PASS notes ${width === 390 ? 'phone' : 'desktop'}`);
} } finally { await b.close(); }
