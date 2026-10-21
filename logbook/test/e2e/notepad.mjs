// Fake data only. Notes (More → Notes): lazy loading, the editor and autosave, search, to-dos, day and case links,
// the day's Copy, Arrange tabs, the recycle bin, the 2,000-note limit (a page of 100 at a time) and the backup.
import assert from 'node:assert/strict';
import { launch, engine, isChromium, clipboardOpts, portableClipboard, readClipboard, lf, ignorable, until } from './browsers.mjs';
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await launch();
if (!b) { console.log(`SKIP notes (${engine} is not installed here)`); process.exit(0); }
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', ...clipboardOpts() });
  await portableClipboard(ctx);
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  // the list draws after the notes arrive (from the device's store, a moment after the page): wait for the count
  const rowsAre = n => p.waitForFunction(n => document.querySelectorAll('ul.notes-rows li').length === n, n, { timeout: 5000 })
    .catch(async () => { throw new Error(`expected ${n} note rows, saw ${await p.locator('ul.notes-rows li').count()}`); });
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
  await p.locator('.notes-page', { hasText: /No notes yet[\s\S]*Use Reflect instead/ }).waitFor();   // (after "Loading…")
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
  await until(p, async () => { const { S } = await import('./js/ui-core.js'); return S.notes?.[0]?.body.includes('- [x] fake to-do'); }, null, { msg: 'the ticked to-do saved' });
  await p.getByRole('button', { name: 'Done' }).click();
  await p.locator('ul.notes-rows li').first().waitFor();
  assert.match(await p.locator('.notes-count').innerText(), /^1 of 2000$/);
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
  await rowsAre(1);
  await p.getByLabel('Search notes').fill('');

  // the Logbook marks today and Copy takes the day's notes too (the day's Copy is off unless switched on)
  assert.equal(await p.getByRole('button', { name: 'Copy this day' }).count(), 0);
  await p.evaluate(async () => { const m = await import('./js/ui-settings.js'); m.applyDisplay(m.setDisplay({ dayCopy: true })); });
  await p.locator('[role=tab][data-tab=logbook]').click();
  const cal = p.locator('main .seg button').filter({ hasText: /^Calendar$/ }); if (await cal.count()) await cal.first().click();
  await p.locator('.lb-day.today .lb-note').waitFor();
  await p.getByRole('button', { name: 'Copy this day' }).click();
  await p.waitForTimeout(300);
  assert.match(await readClipboard(p), /## Notes\n\n### Fake teaching point\nFake dose reminder/);
  await p.getByRole('button', { name: 'Notes', exact: true }).click();
  await p.locator('.notes-filter').filter({ hasText: 'Notes on' }).waitFor();
  await rowsAre(1);

  // link a note to a case: the case row gets a note button that opens it
  await p.locator('ul.notes-rows li').first().click();
  if (await p.locator('.note-view:not([hidden])').count()) { await p.getByRole('button', { name: 'More options' }).click(); await p.getByRole('menuitem', { name: 'Edit' }).click(); }
  await p.getByRole('button', { name: 'Link to a case…' }).click();
  await p.locator('dialog[open] .pick-cases li').first().click();
  await p.locator('.note-link').waitFor();
  await p.getByRole('button', { name: 'Done' }).click();
  // (polled here: an async check in waitForFunction counts as done at once, before the index has the case)
  let caseId = null;
  for (let i = 0; i < 100 && !caseId; i++) { const idx = (await S()).index; caseId = idx && idx.cases.length === 1 ? idx.cases[0] : null; if (!caseId) await p.waitForTimeout(100); }
  assert.ok(caseId, 'the note index never got the case');
  await p.locator('[role=tab][data-tab=logbook]').click();
  const list = p.locator('main .seg button').filter({ hasText: /^List$/ }); await list.first().click();
  await p.getByRole('button', { name: 'Open your notes on this case' }).first().click();
  await p.locator('.notes-filter').waitFor();
  await rowsAre(1);
  assert.equal((await S()).notes.find(n => n.caseId).caseId, caseId);
  await p.getByRole('button', { name: 'Show all' }).click();

  // the linked case's pill opens the case (its edit page), which links back to the notes and the reflection
  await p.locator('ul.notes-rows li .note-case').first().click();
  await p.locator('dialog[open]').getByText('Edit case', { exact: true }).waitFor();
  assert.equal(await p.locator('.note-editor').count(), 0);
  const linked = p.locator('dialog[open] .case-links');
  assert.match(await linked.innerText(), /linked[\s\S]*reflection[\s\S]*Open the notes/i);
  await linked.getByRole('button', { name: 'Open the notes' }).click();
  await p.locator('.notes-filter').waitFor();
  await rowsAre(1);
  await p.getByRole('button', { name: 'Show all' }).click();
  // ... and so does the pill inside the note
  await p.locator('ul.notes-rows li').filter({ has: p.locator('.note-case') }).first().locator('b').click();
  if (await p.locator('.note-view:not([hidden])').count()) { await p.getByRole('button', { name: 'More options' }).click(); await p.getByRole('menuitem', { name: 'Edit' }).click(); }
  await p.locator('.note-meta button.note-case').click();
  await p.locator('dialog[open]').getByText('Edit case', { exact: true }).waitFor();
  await p.locator('dialog[open] .case-links').getByRole('button', { name: 'Open the notes' }).click();
  await p.locator('.notes-filter').waitFor();
  assert.equal(await p.locator('.note-editor').count(), 0);
  await p.getByRole('button', { name: 'Show all' }).click();

  // every note as its own file in a zip, Markdown or plain text
  const dl = p.waitForEvent('download');
  await p.getByRole('button', { name: 'Download notes as files (zip)' }).click();
  await p.locator('dialog[open]').getByLabel('Plain text (.txt)').check();
  await p.locator('dialog[open]').getByRole('button', { name: 'Download', exact: true }).click();
  const zipPath = await (await dl).path();
  const names = lf((await import('node:child_process')).execFileSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', 'import sys,zipfile; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', zipPath]).toString()).trim().split('\n');
  assert.equal(names.length, 2); assert.ok(names.every(n => n.endsWith('.txt')), names.join('|'));
  assert.ok(names.some(n => /^\d{4}-\d{2}-\d{2} Fake teaching point\.txt$/.test(n)), names.join('|'));

  // from a case with no notes, "Write a note" starts a note linked to it
  await p.locator('[role=tab][data-tab=logbook]').click();
  await p.locator('main li[data-date]').filter({ hasNot: p.locator('.note-flag') }).first().click();
  await p.locator('dialog[open] .case-links').getByRole('button', { name: 'Write a note' }).click();
  await p.locator('.note-editor').waitFor();
  await p.locator('.note-meta button.note-case').waitFor();
  await p.getByRole('button', { name: 'Done' }).click();
  await p.evaluate(() => { location.hash = '#notes'; });
  await p.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
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
  assert.deepEqual(await barTabs(), ['log', 'logbook', 'totals', 'notes', 'reflect', 'progress', 'more']);   // (Advanced: Analytics on the bar; Notes before Reflections)
  assert.equal(await p.getByRole('button', { name: 'Add Notes to the tab bar' }).count(), 0);
  // the More pages can go on the bar too, and their own pages select them; seven tabs at most, so an eighth asks
  // which tab it replaces (and takes its place)
  await p.evaluate(() => { location.hash = '#layout'; });
  await p.getByLabel('Show Analytics', { exact: true }).uncheck();   // (six tabs, as before Advanced put Analytics on the bar)
  await p.waitForFunction(() => !document.querySelector('[role=tab][data-tab=progress]'));
  await p.getByLabel('Show Settings', { exact: true }).check();
  await p.locator('[role=tab][data-tab=settings][aria-selected=true]').waitFor();   // Display → Advanced is under Settings
  await p.getByLabel('Show Export / Import', { exact: true }).check();
  await p.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await p.locator('[role=tab][data-tab=data]').count(), 0);
  assert.equal(await p.getByLabel('Show Export / Import', { exact: true }).isChecked(), false);
  await p.getByLabel('Show Export / Import', { exact: true }).check();
  await p.locator('dialog[open]').getByRole('button', { name: 'Notes' }).click();
  await p.locator('[role=tab][data-tab=data]').filter({ hasText: 'Export' }).waitFor();
  assert.deepEqual(await barTabs(), ['log', 'logbook', 'totals', 'data', 'reflect', 'settings', 'more']);   // (in Notes' place)
  // More still lists every page; a hidden main tab comes first
  await p.getByLabel('Show Totals', { exact: true }).uncheck();
  await p.locator('[role=tab][data-tab=more]').click();
  assert.match(await p.locator('.more-list li').first().innerText(), /Programme totals/);
  assert.equal(await p.locator('.more-list a[data-go=settings]').count(), 1);
  // over seven (a settings file, say): the last ones before More go to More
  assert.deepEqual(await p.evaluate(async () => { const { arrangeTabs, BAR_TABS } = await import('./js/ui-settings.js');
    return arrangeTabs(BAR_TABS.map(([id]) => id), { tabHidden: [], tabOrder: BAR_TABS.map(([id]) => id) }).shown; }),
    ['caselogs', 'log', 'logbook', 'totals', 'notes', 'reflect', 'more']);   // (the tab bar's order: Notes before Reflections)
  await p.evaluate(async () => { const { applyDisplay, setDisplay } = await import('./js/ui-settings.js'); applyDisplay(setDisplay({ tabHidden: null, tabOrder: null })); });

  // at 2,000 notes, no more; the list shows 100 at a time (fillers go into the demo store in one write, then one save
  // tells the sync engine)
  await p.evaluate(async () => {
    const k = 'apmes-logbook-demo-v1', st = JSON.parse(localStorage.getItem(k)), lb = st.logbooks['demo@example.com'], t = Date.now();
    const have = Object.keys(lb.notes || {}).length;
    // the first 150 on days of their own from 1 Jan 2025 (more days than the note index doc holds)
    const day = i => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    for (let i = 0; i < 2000 - have - 1; i++) lb.notes['fake-' + i] = { id: 'fake-' + i, date: i < 150 ? day(i) : null, title: 'Fake filler ' + i, body: '', createdAt: t, updatedAt: t };
    localStorage.setItem(k, JSON.stringify(st));
    (await import('./js/demo-backend.js')).saveNote('demo@example.com', { id: 'fake-last', date: null, title: 'Fake filler last', body: '' });
  });
  await p.evaluate(() => { location.hash = '#notes'; });
  await p.locator('.notes-count').filter({ hasText: '2000 of 2000' }).waitFor({ timeout: 15000 });
  await rowsAre(100);
  await p.getByRole('button', { name: /^Show 100 more/ }).focus();
  await p.keyboard.press('Enter');
  await rowsAre(200);
  assert.equal(await p.evaluate(() => [...document.querySelectorAll('ul.notes-rows > li')].indexOf(document.activeElement)), 100, 'focus on the first row just shown');
  await p.getByRole('button', { name: '+ New note' }).click();
  await p.getByText(/You have 2000 notes, the most allowed/).first().waitFor();
  assert.equal(await p.locator('.note-editor').count(), 0);

  // the note index doc holds the latest 100 days; after a reload a full index makes the notes load, so an older day's
  // notes still come with its shared text and its calendar mark
  await p.waitForFunction(async () => ((await import('./js/ui-core.js')).S.noteIndex?.days?.length || 0) >= 100);
  await p.goto(base + '?demo#logbook'); await p.locator('[role=tab][data-tab=logbook][aria-selected=true]').waitFor();
  const shared = await p.evaluate(async () => (await import('./js/share.js')).dayTextWithNotes('2025-01-01', []));
  assert.match(shared, /Fake filler 0\b/);
  assert.equal(await p.evaluate(async () => (await import('./js/ui-notepad.js')).dayHasNotes('2025-01-01')), true);

  assert.deepEqual(errors, []); await ctx.close(); console.log(`PASS notes ${width === 390 ? 'phone' : 'desktop'}${isChromium ? '' : ' (' + engine + ')'}`);
} } finally { await b.close(); }
