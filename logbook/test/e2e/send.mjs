// Fake data only. Settings → Send to and the Send button on the Logbook tab: add a place from a preset, edit and
// save it, see Send appear, send a day (the link opened, the text URL-encoded), "changed since sent" after an
// edit, refused link kinds, ID numbers asked about, and a long day copied instead of put in the link.
import assert from 'node:assert/strict';
import { launch, engine, clipboardOpts, portableClipboard, readClipboard, ignorable } from './browsers.mjs';
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await launch();
if (!b) { console.log(`SKIP send (${engine} is not installed here)`); process.exit(0); }
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', ...clipboardOpts() });
  await portableClipboard(ctx);
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  // every link the app opens is caught here, not followed
  await p.addInitScript(() => {
    window.__opened = [];
    document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href]'); if (a && /^(obsidian|upnote|myapp|shortcuts|https:\/\/wa\.me)/.test(a.getAttribute('href'))) { e.preventDefault(); window.__opened.push(a.getAttribute('href')); } }, true);
  });
  const opened = () => p.evaluate(() => window.__opened);
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  // the demo's day with two cases (the cases arrive from the device's store a moment after the first paint)
  await p.waitForFunction(() => Number(document.body.dataset.cases) > 0);
  const iso = await p.evaluate(async () => (await import('./js/ui-core.js')).S.cases[0].date);
  const dayCell = () => p.locator('button.lb-day[aria-label$=": 2 cases"]').first();

  // no place to send to yet: no Send button
  await p.locator('[role=tab][data-tab=logbook]').click();
  const cal = p.locator('main .seg button').filter({ hasText: /^Calendar$/ }); if (await cal.count()) await cal.first().click();
  await dayCell().click();
  await p.getByRole('button', { name: 'Share this day' }).waitFor();
  assert.equal(await p.getByRole('button', { name: 'Send this day' }).count(), 0);

  // Settings → Send to: add Obsidian from the preset, point it at a made-up vault, save
  await p.goto(base + '?demo#sendto'); await p.getByRole('heading', { name: 'Send to', exact: true }).waitFor();
  await p.getByLabel('Add a place to send to').selectOption('obsidian');
  await p.getByLabel('Name', { exact: true }).fill('Fake Obsidian');
  await p.getByLabel('Link', { exact: true }).fill('obsidian://new?vault=FakeVault&file={file}&content={content}');
  // a script-like link is refused, with a reason
  await p.getByLabel('Add a place to send to').selectOption('custom');
  await p.getByLabel('Link', { exact: true }).nth(1).fill('javascript:alert({content})');
  await p.getByLabel('Name', { exact: true }).nth(1).fill('Bad');
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  assert.match(await p.locator('#toast').innerText(), /not allowed/);
  assert.equal(await p.evaluate(async () => (await import('./js/ui-core.js')).S.logbook.settings.destinations ?? null), null);
  await p.getByRole('button', { name: 'Remove' }).nth(1).click();
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForFunction(async () => ((await import('./js/ui-core.js')).S.logbook.settings.destinations || []).length === 1);
  // "Try it" opens the link with a test text
  await p.getByRole('button', { name: 'Try it' }).click();
  assert.match((await opened())[0], /^obsidian:\/\/new\?vault=FakeVault&file=Logbook%2Ftest&content=Test%20from%20the%20Logbook$/);
  // the iPhone presets (log2 12): Apple Notes runs the "Logbook to Notes" Shortcut with the text; its setup steps are here
  await p.getByLabel('Add a place to send to').selectOption('applenotes');
  await p.getByRole('button', { name: 'Try it' }).nth(1).click();
  assert.equal((await opened())[1], 'shortcuts://run-shortcut?name=Logbook%20to%20Notes&input=text&text=Test%20from%20the%20Logbook');
  await p.locator('summary', { hasText: 'Apple Notes on an iPhone' }).click();
  await p.getByText('Name the shortcut exactly “Logbook to Notes”.').waitFor();
  await p.getByRole('button', { name: 'Remove' }).nth(1).click();
  await p.evaluate(() => { window.__opened.length = 1; });

  // the Send button now shows; sending opens the link with the day's Markdown, encoded
  await p.goto(base + '?demo#logbook');
  if ((await dayCell().getAttribute('aria-pressed')) !== 'true') await dayCell().click();   // the day stays picked
  await p.getByRole('button', { name: 'Send this day' }).waitFor().catch(async e => { await p.screenshot({ path: '/tmp/send-fail.png', fullPage: true }); throw e; });
  await p.getByRole('button', { name: 'Send this day' }).click();
  assert.match(await p.locator('.row-menu-list').innerText(), /Fake Obsidian\s+obsidian/);
  await p.getByRole('button', { name: /Fake Obsidian/ }).click();
  await p.waitForFunction(() => window.__opened.length === 2);
  const url = (await opened())[1];
  assert.ok(url.startsWith(`obsidian://new?vault=FakeVault&file=${encodeURIComponent("Logbook/" + iso)}&content=`), url);
  assert.match(decodeURIComponent(url.split('content=')[1]), /LSCS under sp/);
  // sent: the menu says so; an edit makes it "changed since sent"
  await p.getByRole('button', { name: 'Send this day' }).click();
  assert.match(await p.locator('.row-menu-list').innerText(), /sent, unchanged/);
  await p.getByRole('button', { name: 'Cancel' }).click();
  await p.evaluate(async () => { const { S } = await import('./js/ui-core.js'); S.cases[0].details += ' edited'; });
  await p.getByRole('button', { name: 'Send this day' }).click();
  assert.match(await p.locator('.row-menu-list').innerText(), /changed since sent/);
  await p.getByRole('button', { name: 'Cancel' }).click();

  // a long day: copied to the clipboard and the link opens without the text
  await p.evaluate(async () => { const { S } = await import('./js/ui-core.js'); S.cases[0].details = 'fake long case ' + 'x'.repeat(7000); });
  await p.getByRole('button', { name: 'Send this day' }).click();
  await p.getByRole('button', { name: /Fake Obsidian/ }).click();
  await p.waitForFunction(() => window.__opened.length === 3);
  assert.match((await opened())[2], /content=$/);
  assert.ok((await readClipboard(p)).includes('fake long case'));

  // an ID number is asked about before anything leaves
  await p.evaluate(async () => { const { S } = await import('./js/ui-core.js'); S.cases[0].details = 'fake case S1234567A'; });
  await p.getByRole('button', { name: 'Send this day' }).click();
  await p.getByRole('button', { name: /Fake Obsidian/ }).click();
  await p.getByRole('heading', { name: 'Looks like an ID number' }).waitFor();
  await p.locator('dialog').last().getByRole('button', { name: 'Cancel' }).click();   // the menu stays open behind it
  assert.equal((await opened()).length, 3);

  assert.deepEqual(errors, []);
  await ctx.close();
  console.log(`ok ${width}`);
} console.log('PASS send'); } finally { await b.close(); }
