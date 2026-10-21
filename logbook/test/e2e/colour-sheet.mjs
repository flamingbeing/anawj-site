// Fake data only. The colour sheet (TE S2, 21 Oct 2026): Themes → Colour → More colours opens a grid of shades
// (radio buttons with names like "Teal, shade 5"), arrows move along a row and up or down a hue, a pastel shows its
// deeper text shade, the page changes as you pick and Cancel puts it back, Use this colour saves the snapped colour and
// keeps it in Recent; a typed hex stays as typed; the icon tint uses the same sheet; no axe violations in the sheet.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const AXE = fileURLToPath(new URL('../../../tools/vendor/axe.min.js', import.meta.url));
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const poll = async (fn, what, ms = 8000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw new Error('timed out: ' + what); await new Promise(r => setTimeout(r, 100)); } };
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  await p.evaluate(() => { location.hash = '#themes'; }); await p.locator('section.my-themes').waitFor();
  const dsp = () => p.evaluate(async () => (await import('./js/display.js')).display());
  const accentVar = () => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  const sheet = p.locator('dialog.colour-sheet[open]');
  const before = await accentVar();

  await p.getByRole('button', { name: 'More colours', exact: true }).click();
  await sheet.waitFor();
  const cells = sheet.getByRole('radio');
  assert.equal(await cells.count(), 104, '12 hues × 8 shades and a grey row');
  assert.equal(await sheet.getByRole('radio', { name: 'Teal, shade 5' }).count(), 1);
  assert.equal(await sheet.getByRole('radio', { name: 'White' }).count(), 1);
  assert.ok(await sheet.locator('.cs-cell.deep').count() > 20, 'pastels show their deeper text shade');
  // a pick changes the page at once; arrows move right along the row and down to the next hue
  await sheet.getByRole('radio', { name: 'Teal, shade 5' }).check({ force: true });
  await poll(async () => (await accentVar()) !== before, 'live preview');
  assert.match(await sheet.getByRole('status').innerText(), /Text and buttons: #[0-9a-f]{6} in light \(\d+\.\d:1 on white\)/);
  await p.keyboard.press('ArrowRight');
  assert.equal(await p.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Teal, shade 6');
  await p.keyboard.press('ArrowDown');
  assert.equal(await p.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Cyan, shade 6');
  assert.equal(await sheet.locator('.cs-hexbox').inputValue(), await sheet.getByRole('radio', { name: 'Cyan, shade 6' }).getAttribute('value'));
  if (width === 390) {
    await p.addScriptTag({ path: AXE });
    const res = await p.evaluate(async () => (await axe.run(document.querySelector('dialog.colour-sheet'), { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map(v => v.id + ': ' + v.nodes.length));
    assert.deepEqual(res, [], 'axe in the sheet');
  }
  // Cancel: the page goes back to how it was and nothing is saved
  await sheet.getByRole('button', { name: 'Cancel' }).click(); await sheet.waitFor({ state: 'detached' });
  await poll(async () => (await accentVar()) === before, 'cancel puts it back');
  assert.equal((await dsp()).accent ?? null, null);

  // Use this colour: saved as picked (already snapped), and in Recent next time
  await p.getByRole('button', { name: 'More colours', exact: true }).click();
  await sheet.getByRole('radio', { name: 'Purple, shade 3' }).check({ force: true });
  const purple = await sheet.getByRole('radio', { name: 'Purple, shade 3' }).getAttribute('value');
  await sheet.getByRole('button', { name: 'Use this colour' }).click(); await sheet.waitFor({ state: 'detached' });
  await poll(async () => (await dsp()).accent === purple, 'saved');
  await p.getByRole('button', { name: /^More colours \(now / }).click();
  await sheet.getByRole('button', { name: 'Recent ' + purple }).waitFor();
  assert.equal(await sheet.getByRole('radio', { name: 'Purple, shade 3' }).isChecked(), true, 'the colour now is ticked');
  // a typed hex is kept exactly; the phone's own picker is still there, last
  await sheet.getByLabel('Hex colour').fill('#1f6f5d');
  assert.equal(await sheet.getByRole('radio', { checked: true }).count(), 0, 'not a grid colour');
  assert.equal(await sheet.getByLabel('The phone’s own colour picker').count(), 1);
  await sheet.getByRole('button', { name: 'Use this colour' }).click(); await sheet.waitFor({ state: 'detached' });
  await poll(async () => (await dsp()).accent === '#1f6f5d', 'typed hex');

  // the icon tint (Advanced theme settings → App-style details) uses the same sheet
  await p.evaluate(() => { location.hash = '#themesadv'; });
  await p.getByRole('button', { name: 'Icon tint colour' }).click();
  await sheet.getByRole('radio', { name: 'Orange, shade 5' }).check({ force: true });
  const orange = await sheet.getByRole('radio', { name: 'Orange, shade 5' }).getAttribute('value');
  await sheet.getByRole('button', { name: 'Use this colour' }).click(); await sheet.waitFor({ state: 'detached' });
  await poll(async () => (await dsp()).iconTint === orange, 'icon tint');
  // no picker the phone draws is left on the Themes pages
  for (const page of ['#themes', '#themesadv']) {
    await p.evaluate(h => { location.hash = h; }, page); await p.waitForTimeout(300);
    assert.equal(await p.locator('#app input[type=color]').count(), 0, page + ': the phone’s picker still on the page');
  }
  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log(`ok ${width}px`);
} } finally { await b.close(); }
console.log('PASS colour-sheet');
