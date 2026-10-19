// Fake data only. Themes → Your themes (16 Oct 2026): change a theme and the page says Custom and offers to save it;
// a saved look is picked again like any theme; Export writes a file, Import reads it back; × deletes (with Undo).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const poll = async (fn, what, ms = 8000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw new Error('timed out: ' + what); await new Promise(r => setTimeout(r, 100)); } };
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  await p.evaluate(() => { location.hash = '#themes'; });
  const card = p.locator('section.my-themes');
  await card.waitFor();
  const now = () => p.locator('.theme-now b').innerText();
  const rnd = () => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--round').trim());
  assert.equal(await now(), 'NUHS');
  assert.equal(await card.locator('.tip').count(), 0, 'nothing to save yet');
  assert.equal(await card.getByRole('button', { name: 'Export…' }).count(), 1, 'Export is there before anything is saved (it saves the look you have)');
  // change something: Custom, and the card asks to save it
  await p.locator('input[type=range][aria-label="Corners"]').fill('0');
  await p.getByRole('radio', { name: /Outlined/ }).check({ force: true });
  await poll(async () => /Custom/.test(await now()), 'custom');
  await card.locator('.tip', { hasText: 'it’s now Custom' }).waitFor();
  await card.getByLabel('Name for this look').fill('Fake square');
  await card.getByRole('button', { name: 'Save this look' }).click();
  await card.locator('.theme-row', { hasText: 'Fake square' }).waitFor();
  assert.equal(await now(), 'Fake square (yours)');
  assert.deepEqual(await p.evaluate(async () => (await import('./js/display.js')).display().myThemes.map(t => [t.name, t.look.round, t.look.shadows])), [['Fake square', 0, false]]);
  // another theme, then back to yours
  await p.locator('.theme-card').filter({ has: p.locator('b', { hasText: /^Soft$/ }) }).click();
  await poll(async () => (await now()) === 'Soft', 'Soft picked');
  await card.locator('.theme-row', { hasText: 'Fake square' }).click();
  await poll(async () => (await rnd()) === '0', 'your corners back');
  assert.equal(await card.locator('.theme-row', { hasText: 'Fake square' }).getAttribute('aria-pressed'), 'true');
  // export, delete, import
  const [dl] = await Promise.all([p.waitForEvent('download'), card.getByRole('button', { name: 'Export…' }).click()]);
  const file = await dl.path(), data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(data.kind, 'apmes-logbook-themes'); assert.equal(data.themes[0].name, 'Fake square');
  await card.getByRole('button', { name: 'Delete Fake square' }).click();
  await poll(async () => (await card.locator('.theme-row').count()) === 0, 'deleted');
  await card.locator('input[type=file]').setInputFiles(file);
  await card.locator('.theme-row', { hasText: 'Fake square' }).waitFor();
  // kept after a reload; the Themes reset leaves your themes alone
  await p.reload(); await p.waitForSelector('section.my-themes');
  await p.getByRole('button', { name: 'Reset this page' }).click(); await p.locator('dialog[open]').getByRole('button', { name: 'Reset' }).click();
  await poll(async () => (await now()) === 'NUHS', 'reset');
  assert.equal(await p.locator('section.my-themes .theme-row', { hasText: 'Fake square' }).count(), 1, 'your themes kept');
  assert.deepEqual(errors, []);
  await ctx.close();
  console.log('ok', width);
} } finally { await b.close(); }
console.log('PASS my-themes');
