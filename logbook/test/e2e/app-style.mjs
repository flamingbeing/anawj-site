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
  // the theme engine's newer facets (19 Oct 2026): each on the page, each changes the look, all off is as before
  for (const name of ['Phone status bar', 'Header', 'Fill the current tab’s icon', 'Icon style', 'Moving between pages', 'Pop-up boxes', 'Messages (Saved, Undo)', 'Text boxes', 'Tick boxes']) {
    assert.ok(await p.getByText(name, { exact: false }).count() > 0, name + ' has a setting');
  }
  const ENGINE = { statusBar: 'header', headerStyle: 'filled', tabIconFill: true, iconSet: 'sharp', pageMotion: 'material', sheetStyle: 'ios', toastStyle: 'material', fieldStyle: 'filled', checkStyle: 'round', headingTone: 'ink', tabTone: 'ink' };
  await apply(ENGINE);
  const css2 = await p.evaluate(() => document.getElementById('look-css').textContent);
  for (const re of [/background: var\(--accent\)/, /fill: color-mix/, /stroke-linecap: square/, /--dur: 300ms/, /sheet-up/, /#313033/, /inset 0 -2px 0/, /border-radius: 50%/]) assert.match(css2, re);
  assert.ok(await shot() !== before, 'the engine’s looks changed the page');
  // the status bar takes the header's colour (filled: my colour), and the icon set is on <html>
  const st = await p.evaluate(() => ({ meta: document.querySelector('meta[name="theme-color"]').content, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), icons: document.documentElement.dataset.icons }));
  assert.equal(st.meta, st.accent); assert.equal(st.icons, 'sharp');
  await apply({ headerStyle: null });
  assert.equal(await p.evaluate(() => document.querySelector('meta[name="theme-color"]').content), await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--panel').trim()), 'plain header: the panel colour');
  // a message and a pop-up still open and close in their new styles
  await p.evaluate(async () => { const m = await import('./js/ui-core.js'); m.toast('Fake saved', { action: 'Undo', onaction: () => {} }); });
  await p.locator('#toast.show').waitFor();
  const tb = await p.locator('#toast').boundingBox(); assert.ok(tb.y > 500, 'the snackbar sits at the bottom');
  await p.evaluate(async () => { const m = await import('./js/ui-core.js'); m.confirmBox('Fake title', 'Fake text', 'OK'); });
  await p.locator('dialog[open]').waitFor(); await p.waitForTimeout(450);
  const db = await p.locator('dialog[open]').boundingBox(); assert.ok(db.y + db.height > 830, 'the iOS sheet sits at the bottom');
  await p.getByRole('button', { name: 'Cancel' }).click();
  // a page change with Material motion fades in without errors (then back, as it was)
  await p.evaluate(() => { location.hash = '#display'; }); await p.waitForTimeout(400); await p.goBack();
  await p.locator('section.card', { hasText: 'App-style details' }).waitFor();
  await apply(Object.fromEntries(Object.keys(ENGINE).map(k => [k, null])));
  await p.evaluate(async () => { const c = await import('./js/ui-core.js'); c.clearToast(); c.hooks.render(); window.scrollTo(0, 0); });
  await p.mouse.move(195, 300);   // (off the tab bar, where the sheet's Cancel was)
  assert.equal(await p.evaluate(() => document.getElementById('look-css').textContent), '', 'engine off: no CSS');
  assert.equal(await p.evaluate(() => document.documentElement.dataset.icons), undefined);
  { const now = await shot(); if (now !== before && process.env.SHOTS) { const fs = await import('node:fs'); fs.writeFileSync(process.env.SHOTS + '/a.png', Buffer.from(before, 'base64')); fs.writeFileSync(process.env.SHOTS + '/b.png', Buffer.from(now, 'base64')); } assert.ok(now === before, 'engine off: the same page as before'); }
  // an inspired theme brings its details along, and Undo takes them away
  assert.equal(await p.locator('.theme-grid').nth(1).locator('.theme-card').count(), 8, 'eight Inspired themes on the page');
  assert.equal(await p.locator('.theme-list').count(), 0, 'no scrolling list on the Themes page');
  await p.locator('.theme-card', { hasText: 'Apple-style' }).click();
  assert.match(await p.evaluate(() => document.getElementById('look-css').textContent), /#34c759/);
  // Browse all themes: every theme, searchable, with Suggest a theme
  await p.getByRole('link', { name: 'Browse all themes' }).click();
  await p.locator('.theme-find').fill('Spotify');
  assert.equal(await p.locator('.theme-list .theme-row').count(), 1, 'search narrows the list');
  await p.getByRole('button', { name: 'Suggest a theme' }).waitFor();
  await p.locator('.theme-row', { hasText: 'Spotify-style' }).click();
  assert.match(await p.evaluate(() => document.getElementById('look-css').textContent), /#121212/);
  assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'light', 'a theme leaves Light or dark alone');
  assert.deepEqual(errors, []);
  console.log('PASS app-style details');
} finally { await b.close(); }

// Layout choices share the Themes page and run with its focused suite.
await import('./layouts.mjs');
