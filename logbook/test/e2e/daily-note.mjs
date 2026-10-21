// Fake data only. Daily notes (one note a day): the Logbook day's preview and "+ Daily note", Notes' "Today's note"
// and Daily notes chip, the #today shortcut, the day's Copy text, the Add tab box (Settings → Notes); the paste
// cleaner and Clean up; the full formatting bar; things shared to the app (GET, the chooser, the service worker's POST).
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const saved = p => p.waitForFunction(() => document.querySelector('.notes-status')?.textContent === 'Saved', null, { timeout: 8000 });
const dayNote = (p, iso) => p.evaluate(async iso => { const { S } = await import('./js/ui-core.js'); return (S.notes || []).find(n => n.id === 'day-' + iso) || null; }, iso);
const setting = (p, patch) => p.evaluate(async patch => { const { patchLogbook } = await import('./js/ui-core.js'); await patchLogbook({ settings: patch }); }, patch);
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', ...(width < 600 ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?demo#logbook');
  await p.locator('.lb-calbar').waitFor();
  const iso = await p.evaluate(async () => (await import('./js/engine.js')).todayISO());

  // the Logbook's day: "+ Daily note" under the heading (no notes read for it), opening the editor straight in Edit
  await p.locator('.lb-calbar').getByRole('button', { name: 'Today', exact: true }).click();
  await p.getByRole('button', { name: '+ Daily note' }).click();
  await p.locator('.note-editor').waitFor();
  assert.equal(await p.locator('.note-meta .note-date').innerText(), await p.evaluate(async iso => (await import('./js/engine.js')).fmtDate(iso), iso));
  assert.match(await p.locator('.note-back').innerText(), /‹\s*Logbook/);
  await p.waitForFunction(() => document.activeElement?.classList.contains('note-body'));
  await p.getByLabel('Note text').fill('Fake day: **busy** list\n- [ ] read about TIVA');
  await saved(p);
  assert.equal((await dayNote(p, iso)).title, '');
  assert.equal((await dayNote(p, iso)).date, iso);
  // Done goes back to the Logbook's day, now with the note's preview and Edit
  await p.getByRole('button', { name: 'Done' }).click();
  await p.locator('.lb-daynote').waitFor();
  assert.equal(await p.evaluate(() => location.hash), '#logbook');
  assert.match(await p.locator('.lb-daynote').innerText(), /Daily note[\s\S]*Fake day: busy list[\s\S]*read about TIVA/);
  assert.equal(await p.locator('.lb-daynote input[type=checkbox]').isDisabled(), true);   // a preview: ticks in the editor
  // the day's Copy / Share text has it as the day's notes (first, no heading of its own)
  assert.match(await p.evaluate(async iso => (await import('./js/share.js')).dayTextWithNotes(iso, []), iso), /## Notes\n\nFake day: \*\*busy\*\* list/);
  // Edit opens the same note (never a second one)
  await p.getByRole('button', { name: 'Edit the daily note' }).click();
  await p.locator('.note-editor').waitFor();
  assert.match(await p.getByLabel('Note text').inputValue(), /^Fake day/);
  await p.getByRole('button', { name: 'Done' }).click();
  await p.locator('.lb-daynote').waitFor();

  // a daily note keeps its day: no date box, no "No date"
  await p.getByRole('button', { name: 'Edit the daily note' }).click();
  await p.locator('.note-editor').waitFor();
  assert.equal(await p.locator('.note-editor input[type=date]').count(), 0);
  assert.equal(await p.locator('.note-meta').getByRole('button', { name: 'No date' }).count(), 0);
  await p.getByRole('button', { name: 'Done' }).click();
  await p.locator('.lb-daynote').waitFor();

  // another device's copy: a blank daily note opened before the server's copy came gets the server's copy in its
  // place; one already typed in is merged with it on saving (never a write conflict)
  const remote = (id, body) => p.evaluate(async ([id, body]) => { const demo = await import('./js/demo-backend.js'); demo.saveNote('demo@example.com', { id: 'day-' + id, date: id, title: '', body, createdAt: 1 }); }, [id, body]);
  const openDay = d => p.evaluate(async d => (await import('./js/ui-notepad.js')).openDayNote(d), d);
  await openDay('2025-01-06');
  await p.locator('.note-editor').waitFor();
  assert.equal(await p.getByLabel('Note text').inputValue(), '');
  await remote('2025-01-06', 'Fake laptop note');
  await p.waitForFunction(() => document.querySelector('.note-body')?.value === 'Fake laptop note');
  await p.getByRole('button', { name: 'Done' }).click();
  // Done steps back twice (the editor, then the Notes page it passed through): let it reach the Logbook first
  await p.waitForFunction(async () => !document.querySelector('.note-editor') && (await import('./js/ui-core.js')).S.tab === 'logbook' && location.hash === '#logbook');
  await openDay('2025-01-05');
  await p.locator('.note-editor').waitFor();
  await p.getByLabel('Note text').fill('Fake phone line');
  await remote('2025-01-05', 'Fake laptop line');
  await saved(p);
  assert.equal((await dayNote(p, '2025-01-05')).body, 'Fake laptop line\n\nFake phone line');
  assert.equal(await p.getByLabel('Note text').inputValue(), 'Fake laptop line\n\nFake phone line');
  assert.equal(await p.evaluate(async () => (await import('./js/ui-core.js')).writes.entries().filter(x => x.state === 'conflict').length), 0);
  await p.getByRole('button', { name: 'Done' }).click();
  // on a slow connection the save is accepted (180 ms) before the server answers: the conflict found later is still
  // merged with what was typed (bug: it was merged against the just-accepted copy, and the new line was lost)
  await p.evaluate(async () => { const { writes, cloud } = await import('./js/ui-core.js'); writes.configure({ backend: async (...a) => { await new Promise(r => setTimeout(r, 600)); return cloud.commitRecord(...a); } }); });
  await openDay('2025-01-07');
  await p.locator('.note-editor').waitFor();
  await p.getByLabel('Note text').fill('Fake phone A');
  await saved(p);
  const jobState = () => p.evaluate(async () => (await import('./js/ui-core.js')).writes.entries().find(x => x.record.id === 'day-2025-01-07')?.state);
  for (let i = 0; i < 50 && await jobState() !== 'synced'; i++) await p.waitForTimeout(100);
  assert.equal(await jobState(), 'synced');
  await p.getByLabel('Note text').fill('Fake phone A\nFake phone C');
  await remote('2025-01-07', 'Fake phone A\n\nFake laptop B');
  for (let i = 0; i < 100 && !/Fake laptop B[\s\S]*Fake phone C/.test((await dayNote(p, '2025-01-07'))?.body || ''); i++) await p.waitForTimeout(100);
  await saved(p);
  assert.equal((await dayNote(p, '2025-01-07')).body, 'Fake phone A\n\nFake laptop B\n\nFake phone C');
  assert.equal(await p.getByLabel('Note text').inputValue(), 'Fake phone A\n\nFake laptop B\n\nFake phone C');
  await p.evaluate(async () => { const { writes, cloud } = await import('./js/ui-core.js'); writes.configure({ backend: cloud.commitRecord }); });
  await p.getByRole('button', { name: 'Done' }).click();

  // Notes: Today's note, the Daily notes chip, and daily notes not counted in MAX_NOTES (2,000)
  await p.goto(base + '?demo#notes');
  await p.getByRole('button', { name: 'Today’s note' }).waitFor();
  await p.waitForFunction(() => /^0 of 2000$/.test(document.querySelector('.notes-count')?.textContent || ''));
  await p.getByRole('button', { name: '+ New note' }).click();
  await p.getByLabel('Note title').fill('Fake other note');
  await p.getByRole('button', { name: 'Done' }).click();
  await p.waitForFunction(() => document.querySelectorAll('ul.notes-rows li').length === 5);
  assert.match(await p.locator('.notes-count').innerText(), /^1 of 2000$/);
  await p.getByRole('button', { name: 'Daily notes' }).click();
  assert.equal(await p.locator('ul.notes-rows li').count(), 4);
  assert.match(await p.locator('ul.notes-rows li').first().innerText(), /Daily note/);
  assert.match(await p.locator('.notes-filter').innerText(), /Daily notes/);
  await p.getByRole('button', { name: 'Show all' }).click();
  assert.equal(await p.locator('ul.notes-rows li').count(), 5);
  await p.getByRole('button', { name: 'Today’s note' }).click();
  await p.locator('.note-editor').waitFor();
  assert.match(await p.getByLabel('Note text').inputValue(), /^Fake day/);
  assert.match(await p.locator('.note-back').innerText(), /‹\s*Notes/);
  await p.getByRole('button', { name: 'Done' }).click();

  // the app's "Today's note" shortcut (./#today)
  await p.goto(base + '?demo#today');
  await p.locator('.note-editor').waitFor();
  assert.match(await p.getByLabel('Note text').inputValue(), /^Fake day/);
  assert.equal(await p.evaluate(() => location.hash), '#notes');

  // Clean up (⋯ menu): stray escapes, double spaces, symbol bullets; Undo puts it back
  await p.getByLabel('Note text').fill('1\\. one\n\n2\\. two\n•  bullet  here');
  await p.getByRole('button', { name: 'More options' }).click();
  await p.getByRole('menuitem', { name: 'Clean up' }).click();
  assert.equal(await p.getByLabel('Note text').inputValue(), '1. one\n2. two\n- bullet here');
  await p.locator('#toast').getByRole('button', { name: 'Undo' }).click();
  assert.equal(await p.getByLabel('Note text').inputValue(), '1\\. one\n\n2\\. two\n•  bullet  here');

  // the paste cleaner: off by default (the paste goes in as it is), on in Settings → Notes
  const paste = () => p.evaluate(() => {
    const ta = document.querySelector('.note-body'), dt = new DataTransfer();
    dt.setData('text/html', '<h2>Fake</h2><p><b>bold</b>&nbsp;and <i>it</i></p><ul><li>one</li><li>two</li></ul>');
    dt.setData('text/plain', 'Fake bold and it one two');
    ta.focus(); ta.setSelectionRange(0, ta.value.length);
    return !ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  assert.equal(await paste(), false);   // not taken over
  await p.getByRole('button', { name: 'Done' }).click();
  await p.goto(base + '?demo#notesset');
  await p.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
  for (const name of ['Show the daily note on the Add tab', 'Clean rich text when pasting', 'Formatting buttons in notes', 'Ask what to do with shared text']) assert.equal(await p.getByRole('switch', { name }).isChecked(), false);
  await p.getByRole('switch', { name: 'Clean rich text when pasting' }).check();
  await p.getByRole('switch', { name: 'Formatting buttons in notes' }).check();
  await p.waitForFunction(async () => { const { settings } = await import('./js/ui-core.js'); return settings().pasteClean === true; });
  await p.goto(base + '?demo#today');
  await p.locator('.note-editor').waitFor();
  assert.equal(await paste(), true);
  assert.equal(await p.getByLabel('Note text').inputValue(), '## Fake\n\n**bold** and *it*\n\n- one\n- two');
  await saved(p);
  assert.equal((await dayNote(p, iso)).body, '## Fake\n\n**bold** and *it*\n\n- one\n- two');

  // the full formatting bar: bold around the selection, a to-do line, Undo
  const bar = p.getByRole('toolbar', { name: 'Formatting' });
  await bar.waitFor();
  await p.getByLabel('Note text').fill('word');
  await p.evaluate(() => { const ta = document.querySelector('.note-body'); ta.focus(); ta.setSelectionRange(0, 4); });
  await bar.getByRole('button', { name: 'Bold' }).click();
  assert.equal(await p.getByLabel('Note text').inputValue(), '**word**');
  await bar.getByRole('button', { name: 'To-do' }).click();
  assert.equal(await p.getByLabel('Note text').inputValue(), '- [ ] **word**');
  await bar.getByRole('button', { name: 'Undo' }).click();
  assert.equal(await p.getByLabel('Note text').inputValue(), '**word**');
  if (width < 600) {
    // on a phone, typing: the bar sits fixed on the keyboard (just above the tab bar)
    await p.evaluate(() => { document.body.classList.add('typing'); document.querySelector('.note-body').focus(); });
    assert.equal(await bar.evaluate(el => getComputedStyle(el).position), 'fixed');
    await p.evaluate(() => document.body.classList.remove('typing'));
  }
  await p.getByLabel('Note text').fill('Fake day: case tab');
  await saved(p);
  await p.getByRole('button', { name: 'Done' }).click();

  // the Add tab's box (Settings → Notes, off by default): today's note, saving as you type
  await p.goto(base + '?demo#log');
  await p.locator('textarea.details').waitFor();
  assert.equal(await p.locator('.day-note-box').count(), 0);
  await setting(p, { dayNoteOnCase: true });
  await p.evaluate(async () => (await import('./js/ui-core.js')).hooks.render());
  await p.locator('.day-note-box summary').click();
  const box = p.getByLabel('Today’s note');
  await p.waitForFunction(() => document.querySelector('.day-note-text') && !document.querySelector('.day-note-text').disabled);
  assert.equal(await box.inputValue(), 'Fake day: case tab');
  await box.fill('Fake day: case tab\nmore from the Add tab');
  await p.waitForFunction(() => document.querySelector('.day-note-box .notes-status')?.textContent === 'Saved', null, { timeout: 8000 });
  assert.equal((await dayNote(p, iso)).body, 'Fake day: case tab\nmore from the Add tab');
  // a re-render keeps the box open with what's in it
  await p.evaluate(async () => (await import('./js/ui-core.js')).hooks.render());
  assert.equal(await p.locator('.day-note-box').getAttribute('open'), '');
  assert.equal(await box.inputValue(), 'Fake day: case tab\nmore from the Add tab');
  // Open in Notes straight after typing: the editor has what was typed, and goes on saving the same note
  await box.fill('Fake day: case tab\nmore from the Add tab\ntyped in box');
  await p.getByRole('button', { name: 'Open in Notes' }).click();
  await p.locator('.note-editor').waitFor();
  assert.equal(await p.getByLabel('Note text').inputValue(), 'Fake day: case tab\nmore from the Add tab\ntyped in box');
  await p.getByLabel('Note text').fill('Fake day: case tab\nmore from the Add tab\ntyped in box\ntyped in editor');
  // a title added in the editor: the box takes the new copy, so its next line saves (no conflict)
  await p.getByLabel('Note title').fill('Fake title');
  await saved(p);
  await p.getByRole('button', { name: 'Done' }).click();
  await p.locator('.day-note-box').waitFor();
  assert.equal(await p.evaluate(() => location.hash), '#log');
  await p.waitForFunction(() => !document.querySelector('.day-note-text')?.disabled);
  await box.fill(await box.inputValue() + '\nsecond box line');
  await box.blur();
  await p.waitForFunction(() => document.querySelector('.day-note-box .notes-status')?.textContent === 'Saved', null, { timeout: 8000 });
  const both = await dayNote(p, iso);
  assert.equal(both.title, 'Fake title');
  assert.equal(both.body, 'Fake day: case tab\nmore from the Add tab\ntyped in box\ntyped in editor\nsecond box line');
  // only the title changed on another device: the box takes that copy too (not only when the text differs)
  await p.evaluate(async iso => {
    const { S, hooks } = await import('./js/ui-core.js'); const cloud = await import('./js/demo-backend.js');
    const n = S.notes.find(x => x.id === 'day-' + iso);
    cloud.saveNote('demo@example.com', { ...n, title: 'Fake title 2' });
    hooks.render();
  }, iso);
  await p.waitForFunction(() => !document.querySelector('.day-note-text')?.disabled);
  await box.fill(await box.inputValue() + '\nthird');
  await box.blur();
  await p.waitForFunction(() => document.querySelector('.day-note-box .notes-status')?.textContent === 'Saved', null, { timeout: 8000 });
  assert.equal((await dayNote(p, iso)).title, 'Fake title 2');
  assert.match((await dayNote(p, iso)).body, /second box line\nthird$/);
  assert.equal(await p.evaluate(async () => (await import('./js/ui-core.js')).writes.entries().filter(x => x.state === 'conflict').length), 0);

  // shared to the app, the old GET way, with the chooser off: straight into paste-a-list, as before
  await p.goto(base + '?demo&share_text=AB%2040M%20fake%20lap%20chole');
  await p.waitForFunction(() => /AB 40M fake lap chole/.test(document.querySelector('textarea.details')?.value || ''));
  assert.equal(await p.evaluate(() => location.search + location.hash), '?demo#log');
  // a POST share of text only (what sw.js keeps), with the chooser off: also straight into paste-a-list, no chooser
  await p.evaluate(async () => {
    const c = await caches.open('share-inbox-logbook');
    await c.put(new URL('share-inbox.json', location.href).href, new Response(JSON.stringify({ title: '', text: 'EF 30M fake appendix', url: '', files: [] })));
  });
  await p.goto(base + '?demo&shared=1#log');
  await p.waitForFunction(() => /EF 30M fake appendix/.test(document.querySelector('textarea.details')?.value || ''));
  assert.equal(await p.evaluate(() => location.search + location.hash), '?demo#log');
  assert.equal(await p.getByRole('heading', { name: 'Shared with the app' }).count(), 0);
  // with Ask on: the chooser; "Add to today's note" appends it to the daily note
  await setting(p, { shareAsk: true });
  await p.goto(base + '?demo&share_text=Fake%20shared%20line');
  await p.getByRole('heading', { name: 'Shared with the app' }).waitFor();
  assert.equal(await p.evaluate(() => location.hash), '#share');
  assert.match(await p.locator('.share-preview').innerText(), /Fake shared line/);
  await p.getByRole('button', { name: 'Add to today’s note' }).click();
  await p.locator('.note-editor').waitFor();
  assert.match(await p.getByLabel('Note text').inputValue(), /second box line\nthird\n\nFake shared line$/);
  await saved(p);
  assert.match((await dayNote(p, iso)).body, /Fake shared line$/);
  await p.getByRole('button', { name: 'Done' }).click();

  // a POST share (files): what the service worker keeps, read once by the page; "New note" starts a note with it
  await p.evaluate(async () => {
    const c = await caches.open('share-inbox-logbook');
    await c.put(new URL('share-inbox.json', location.href).href, new Response(JSON.stringify({ title: '', text: '', url: '', files: [{ name: 'fake.md', type: 'text/markdown', text: '# Fake file\nline' }] })));
  });
  await p.goto(base + '?demo&shared=1#log');
  await p.getByRole('heading', { name: 'Shared with the app' }).waitFor();
  await p.waitForFunction(() => /Fake file/.test(document.querySelector('.share-preview')?.textContent || ''));
  assert.match(await p.locator('.share-in').innerText(), /from 1 file/);
  assert.equal(await p.evaluate(() => location.search), '?demo');
  await p.getByRole('button', { name: 'New note' }).click();
  await p.locator('.note-editor').waitFor();
  assert.equal(await p.getByLabel('Note text').inputValue(), '# Fake file\nline');
  await saved(p);
  assert.equal(await p.evaluate(async () => (await (await caches.open('share-inbox-logbook')).keys()).length), 0);   // read once
  // "Add as case(s)" goes to paste-a-list
  await p.getByRole('button', { name: 'Done' }).click();
  await p.goto(base + '?demo&share_text=CD%2050F%20fake%20TKR');
  await p.getByRole('button', { name: 'Add as case(s)' }).click();
  await p.waitForFunction(() => /CD 50F fake TKR/.test(document.querySelector('textarea.details')?.value || ''));
  assert.equal(await p.evaluate(() => location.hash), '#log');

  // New note with MAX_NOTES (2,000) notes already: the shared text isn't lost, the chooser comes back with it
  await p.evaluate(async () => { const cloud = await import('./js/demo-backend.js'), { MAX_NOTES } = await import('./js/notepad.js'); for (let i = 0; i < MAX_NOTES; i++) cloud.saveNote('demo@example.com', { id: 'fake' + i, date: '2025-02-01', title: 'Fake ' + i, body: '', createdAt: i }); });
  await p.goto(base + '?demo&share_text=Fake%20kept%20text');
  await p.getByRole('heading', { name: 'Shared with the app' }).waitFor();
  await p.getByRole('button', { name: 'New note' }).click();
  await p.locator('#toast').getByText(/2000 notes/).waitFor();
  await p.getByRole('heading', { name: 'Shared with the app' }).waitFor();
  assert.match(await p.locator('.share-preview').innerText(), /Fake kept text/);

  assert.deepEqual(errors, []);
  console.log(`PASS daily note ${width < 600 ? 'phone' : 'desktop'}`);
  await ctx.close();
}

// the service worker takes a POST share at ./share-target, keeps it and opens the chooser (a context with workers on)
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(base + '?demo#log');
  await p.evaluate(async () => { await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; });
  await p.reload();
  await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  const res = await p.evaluate(async () => {
    const f = new FormData();
    f.append('title', 'Fake title'); f.append('text', 'Fake posted text');
    f.append('files', new File(['- fake item'], 'fake.md', { type: 'text/markdown' }));
    f.append('files', new File(['x'], 'fake.png', { type: 'image/png' }));
    const r = await fetch('./share-target', { method: 'POST', body: f, redirect: 'manual' });
    const c = await caches.open('share-inbox-logbook');
    const hit = await c.match(new URL('share-inbox.json', location.href).href);
    return { type: r.type, status: r.status, kept: hit ? await hit.json() : null };
  });
  assert.equal(res.type, 'opaqueredirect');
  assert.equal(res.kept.text, 'Fake posted text');
  assert.equal(res.kept.title, 'Fake title');
  assert.deepEqual(res.kept.files.map(f => f.name), ['fake.md']);   // only files the app can read
  await ctx.close();
  console.log('PASS daily note service worker (POST share)');
}
} finally { await b.close(); }
