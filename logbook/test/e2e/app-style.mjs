// Fake data only. Themes → App-style details (19 Oct 2026): every new look is its own switch or choice, off by default;
// with all of them off the page looks exactly as before, and each one changes something when chosen.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const OPTIONS = { barBlur: true, tabActiveLabel: true, tabStyle: 'indicator', listStyle: 'inset', titleAlign: 'centre', switchStyle: 'ios', pressStyle: 'highlight', iconWeight: 'thin', typeStyle: 'ios' };
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  await p.evaluate(() => { location.hash = '#themes'; });
  await p.locator('section.card', { hasText: 'App-style details' }).waitFor();
  const shot = async () => { await p.waitForTimeout(500); return (await p.screenshot({ animations: 'disabled', caret: 'hide' })).toString('base64'); };
  const before = await shot();
  // each setting is on the page
  for (const name of ['See-through header and tab bar', 'Name only the tab you’re on', 'Header title', 'List style', 'Type style', 'Icon line weight', 'Switches', 'When you press', 'Tab bar style']) {
    assert.ok(await p.getByText(name, { exact: false }).count() > 0, name + ' has a setting');
  }
  // choose them all (through the stored settings, as the controls do), the look changes, then back to the defaults
  const apply = async o => { await p.evaluate(async o => { const m = await import('./js/display.js'); m.applyDisplay(m.setDisplay(o)); }, o); };
  await apply(OPTIONS);
  const css = await p.evaluate(() => document.getElementById('look-css').textContent);
  for (const re of [/backdrop-filter/, /\.lbl \{ display: none/, /padding: 4px 18px/, /overflow: hidden/, /text-align: center/, /#34c759/, /opacity: 1/, /1\.4/, /-0\.02em/]) assert.match(css, re);
  assert.ok(await shot() !== before, 'the look changed');
  await apply(Object.fromEntries(Object.keys(OPTIONS).map(k => [k, null])));
  assert.equal(await p.evaluate(() => document.getElementById('look-css').textContent), '', 'all off: no CSS');
  assert.ok(await shot() === before, 'all off: the same page as before');
  // an inspired theme brings its details along, and Undo takes them away
  await p.locator('.theme-find').fill('iOS Settings');
  await p.locator('.theme-row', { hasText: 'iOS Settings-style' }).click();
  assert.match(await p.evaluate(() => document.getElementById('look-css').textContent), /#34c759/);
  assert.deepEqual(errors, []);
  console.log('PASS app-style details');
} finally { await b.close(); }
