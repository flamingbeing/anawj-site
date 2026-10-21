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
  // Full palette editor (Advanced theme settings): live checks reject a failing pair without changing saved settings.
  // Each colour opens the colour sheet (TE S2): a typed hex stays exactly as typed, its contrast shows as it changes.
  await p.evaluate(() => { location.hash = '#themesadv'; });
  const editor = () => p.locator('section.card').filter({ has: p.getByRole('heading', { name: 'Edit colours', exact: true }) });
  const sheet = p.locator('dialog.colour-sheet[open]');
  const token = async (mode, name, hex) => {
    await editor().getByRole('button', { name: `${mode} ${name}`, exact: true }).click();
    await sheet.getByLabel('Hex colour').fill(hex);
    const said = await sheet.getByRole('status').innerText();
    await sheet.getByRole('button', { name: 'Use this colour' }).click();
    await sheet.waitFor({ state: 'detached' });
    return said;
  };
  assert.match(await token('Light', 'ink', '#ffffff'), /ink on bg: 1\.\d+:1 \(needs 4\.5:1\)/, 'the sheet says the contrast as it changes');
  assert.match(await editor().getByRole('status').innerText(), /ink on bg: 1\./);
  await editor().getByRole('button', { name: 'Save colours', exact: true }).click();
  assert.match(await editor().getByRole('status').innerText(), /Colours not saved.*Light ink on bg/);
  assert.equal(await p.evaluate(async () => (await import('./js/display.js')).display().colours ?? null), null);
  await editor().getByRole('button', { name: 'Reset ink', exact: true }).click();
  await token('Light', 'bg', '#ffffff');
  await editor().getByRole('button', { name: 'Dark', exact: true }).click();
  await token('Dark', 'line', '#556677');
  await editor().getByRole('button', { name: 'Save colours', exact: true }).click();
  assert.match(await now(), /Custom/);
  const palettes = { light: { bg: '#ffffff' }, dark: { line: '#556677' } };
  assert.deepEqual(await p.evaluate(async () => (await import('./js/display.js')).display().colours), palettes);
  const cssVar = key => p.evaluate(k => getComputedStyle(document.documentElement).getPropertyValue('--' + k).trim(), key);
  assert.equal(await cssVar('bg'), '#ffffff');
  // The cached sheet has the overrides before the app's module code runs on reload.
  await p.route('**/logbook/js/app.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await p.reload();
  assert.equal(await cssVar('bg'), '#ffffff');
  await p.unroute('**/logbook/js/app.js');
  await p.reload(); await editor().waitFor();
  for (const mode of ['dark', 'oled', 'auto']) {
    await p.emulateMedia({ colorScheme: 'dark' });
    await p.evaluate(async mode => (await import('./js/display.js')).applyTheme(mode), mode);
    assert.equal(await cssVar('line'), '#556677', mode);
    assert.notEqual(await cssVar('bg'), '#ffffff', 'light bg never leaks into dark');
  }
  await p.evaluate(async () => (await import('./js/display.js')).applyTheme('auto'));
  await p.emulateMedia({ colorScheme: 'light' });
  assert.equal(await cssVar('bg'), '#ffffff');
  await p.getByRole('button', { name: 'Reset this page' }).click(); await p.locator('dialog[open]').getByRole('button', { name: 'Reset', exact: true }).click();
  assert.equal(await now(), 'NUHS');
  if (width === 390 && process.env.E2E_OUT) {
    await editor().scrollIntoViewIfNeeded();
    await p.screenshot({ path: process.env.E2E_OUT + '/colours-phone.png' });
  }
  // change something (Advanced theme settings): Custom, and the card on Themes asks to save it
  await p.locator('input[type=range][aria-label="Corners"]').fill('0');
  await p.getByRole('radio', { name: /Outlined: thin lines/ }).check({ force: true });
  await poll(async () => /Custom/.test(await now()), 'custom');
  await p.evaluate(() => { location.hash = '#themes'; }); await card.waitFor();
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
  // Keep when changing theme (look-schema.js): wallpaper and layout on; switching Layout off lets a theme bring its rows
  const keep = name => p.getByRole('switch', { name, exact: true });
  assert.ok(await keep('Wallpaper').isChecked() && await keep('Layout').isChecked() && !(await keep('Fonts and text').isChecked()));
  const dsp = () => p.evaluate(async () => (await import('./js/display.js')).display());
  await p.evaluate(async () => { const m = await import('./js/display.js'); m.setDisplay({ rowLayout: 'timeline' }); });
  await keep('Layout').click();
  await poll(async () => JSON.stringify((await dsp()).themeKeep) === '["wallpaper"]', 'Layout off');
  assert.equal((await dsp()).rowLayout, 'timeline', 'switching it off changes nothing on its own');
  await keep('Layout').click();
  await poll(async () => JSON.stringify((await dsp()).themeKeep) === '["wallpaper","layout"]', 'Layout on again');
  assert.deepEqual(errors, []);
  await ctx.close();
  console.log('ok', width);
} } finally { await b.close(); }
console.log('PASS my-themes');
