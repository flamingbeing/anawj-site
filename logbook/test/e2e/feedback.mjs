// Fake data only. Private feedback: More → Send feedback (Send blocked until there's text and the "no patient details"
// tick; an ID number asked about first; the record holds only the allowed fields: no email, no screen text, the page's
// name only); the owner's More → Feedback (newest first, New / Done / All, Mark done, Copy as task with names and
// numbers taken out, Delete); a non-owner sees no Feedback page. SHOTS=<dir> saves 390 px screenshots of both pages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, engine, clipboardOpts, portableClipboard, readClipboard, ignorable, until } from './browsers.mjs';
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const KEY = 'apmes-logbook-demo-v1';
const shots = process.env.SHOTS || '';
if (shots) fs.mkdirSync(shots, { recursive: true });
const b = await launch();
if (!b) { console.log(`SKIP feedback (${engine} is not installed here)`); process.exit(0); }
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', ...clipboardOpts() });
  await portableClipboard(ctx);
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  const stored = () => p.evaluate(k => Object.values(JSON.parse(localStorage.getItem(k)).feedback || {}), KEY);
  await p.goto(base + '?demo=reset#log'); await p.waitForSelector('textarea.details');

  // from the Logbook, through More: the entry is there and the page it names is the Logbook
  await p.locator('[role=tab][data-tab=logbook]').click(); await p.waitForFunction(() => document.getElementById('app').dataset.page === 'logbook');
  await p.locator('[role=tab][data-tab=more]').click();
  if (shots && width === 390) await p.waitForTimeout(700), await p.screenshot({ path: `${shots}/more-390.png`, fullPage: true });
  await p.locator('.more-list a[data-go=feedback]').click();
  await p.getByRole('heading', { name: 'Send feedback' }).waitFor();
  const send = p.getByRole('button', { name: 'Send', exact: true });

  // nothing typed, then no tick: Send says why and sends nothing
  await send.click();
  assert.match(await p.locator('.fb-problem').innerText(), /Write your feedback/);
  await p.getByLabel('Your feedback').fill('Fake: the tag picker hides the R2 targets');
  assert.match(await p.locator('#fb-count').innerText(), /^41 \/ 2000$/);
  await send.click();
  assert.match(await p.locator('.fb-problem').innerText(), /no patient details/);
  assert.equal((await stored()).length, 0);
  // the box can't take more than 2000 characters
  assert.equal(await p.getByLabel('Your feedback').getAttribute('maxlength'), '2000');
  assert.equal(await p.getByLabel(/What were you doing/).getAttribute('maxlength'), '300');

  // an ID number: asked first; Cancel sends nothing
  await p.getByLabel('Your feedback').fill('Fake case S1234567A would not save for Mr Fakename');
  await p.getByLabel('This contains no patient details').check();
  if (shots && width === 390) await p.waitForTimeout(700), await p.screenshot({ path: `${shots}/send-feedback-390.png`, fullPage: true });
  await send.click();
  await p.getByRole('heading', { name: 'Looks like an ID number' }).waitFor();
  await p.locator('dialog').last().getByRole('button', { name: 'Cancel' }).click();
  assert.equal((await stored()).length, 0);

  // sent anyway (a resident may mean a version number): the page says who can read it
  await p.getByLabel('Your feedback').fill('Fake: Save was slow for Mdm Testperson, case 12345678');
  await p.getByLabel(/What were you doing/).fill('Logging a fake case');
  await send.click();
  await p.locator('dialog').last().getByRole('button', { name: 'Save anyway' }).click();
  await p.getByText('Sent. Only the programme owner can read this.').waitFor();
  if (shots && width === 390) await p.waitForTimeout(700), await p.screenshot({ path: `${shots}/sent-390.png`, fullPage: true });
  const [rec] = await stored();
  assert.deepEqual(Object.keys(rec).sort(), ['createdAt', 'doing', 'id', 'screen', 'status', 'text', 'ua', 'uid', 'version']);
  assert.equal(rec.uid, 'demo-uid'); assert.equal(rec.status, 'new'); assert.equal(rec.screen, 'logbook');
  assert.ok(!JSON.stringify(rec).includes('demo@example.com'), 'email stored');
  assert.ok(rec.ua.length <= 200 && rec.version.length > 0);
  // Send more: a fresh form; a second one sent from the Add tab (newer)
  await p.getByRole('button', { name: 'Send more feedback' }).click();
  assert.equal(await p.getByLabel('Your feedback').inputValue(), '');
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  await p.evaluate(() => { location.hash = '#more'; }); await p.locator('.more-list a[data-go=feedback]').click();
  await p.getByLabel('Your feedback').fill('Fake idea: a darker tab bar');
  await p.getByLabel('This contains no patient details').check();
  await send.click();
  await p.getByText('Sent. Only the programme owner can read this.').waitFor();
  await until(p, k => Object.keys(JSON.parse(localStorage.getItem(k)).feedback || {}).length === 2, KEY, { msg: 'second feedback' });
  // createdAt differs (newest first needs it)
  await p.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); const [x, y] = Object.values(d.feedback).sort((a, b) => a.createdAt - b.createdAt); x.createdAt = y.createdAt - 60000; localStorage.setItem(k, JSON.stringify(d)); }, KEY);

  // the owner (the demo admin plays the owner): More → Feedback, newest first
  await p.evaluate(() => { location.hash = '#more'; });
  await p.locator('.more-list a[data-go=feedbackinbox]').click();
  await p.getByRole('heading', { name: 'Feedback', exact: true }).waitFor();
  await p.locator('.fb-item').nth(1).waitFor();
  const texts = await p.locator('.fb-item .fb-text').allInnerTexts();
  assert.deepEqual(texts, ['Fake idea: a darker tab bar', 'Fake: Save was slow for Mdm Testperson, case 12345678']);
  assert.match(await p.locator('.fb-item').first().innerText(), /#log/);
  if (shots && width === 390) await p.waitForTimeout(700), await p.screenshot({ path: `${shots}/feedback-inbox-390.png`, fullPage: true });

  // Copy as task: names and numbers out, no uid
  await p.locator('.fb-item').nth(1).getByRole('button', { name: 'Copy as task' }).click();
  const task = await readClipboard(p);
  assert.match(task, /^Logbook feedback \(\d{4}-\d{2}-\d{2}, screen #logbook, version /);
  assert.ok(task.includes('Feedback: Fake: Save was slow for [name], case [number]'), task);
  assert.ok(task.includes('Doing: Logging a fake case'));
  assert.ok(!task.includes('demo-uid') && !task.includes('Testperson') && !task.includes('12345678'));

  // Mark done: off the New list, on Done; the filter counts follow
  await p.locator('.fb-item').first().getByRole('button', { name: 'Mark done' }).click();
  await until(p, () => document.querySelectorAll('.fb-item').length === 1, null, { msg: 'done item left New' });
  assert.equal((await stored()).filter(f => f.status === 'done').length, 1);
  await p.locator('.fb-filter button[data-filter=done]').click();
  assert.equal(await p.locator('.fb-item').count(), 1);
  assert.match(await p.locator('.fb-filter button[data-filter=done]').getAttribute('aria-pressed'), /true/);
  await p.locator('.fb-filter button[data-filter=all]').click();
  assert.equal(await p.locator('.fb-item').count(), 2);

  // Delete asks, then it's gone
  await p.locator('.fb-item').first().getByRole('button', { name: 'Delete' }).click();
  await p.locator('dialog').last().getByRole('button', { name: 'Delete' }).click();
  await until(p, () => document.querySelectorAll('.fb-item').length === 1, null, { msg: 'deleted' });
  assert.equal((await stored()).length, 1);

  // the Admin page links it too (owner)
  await p.evaluate(() => { location.hash = '#admin'; });
  await p.locator('a[data-go=feedbackinbox]').waitFor();

  // not the owner: Send feedback stays, Feedback goes (and its address leads nowhere)
  await p.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); d.admins = {}; localStorage.setItem(k, JSON.stringify(d)); }, KEY);
  await p.goto(base + '?demo#more'); await p.reload(); await p.locator('.more-list a[data-go=feedback]').waitFor();
  assert.equal(await p.locator('.more-list a[data-go=feedbackinbox]').count(), 0);
  await p.evaluate(() => { location.hash = '#feedbackinbox'; }); await p.waitForTimeout(300);
  assert.equal(await p.getByRole('heading', { name: 'Feedback', exact: true }).count(), 0);

  assert.deepEqual(errors, []);
  await ctx.close();
  console.log(`ok ${width}`);
} console.log('PASS feedback'); } finally { await b.close(); }
