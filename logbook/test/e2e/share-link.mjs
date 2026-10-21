// Fake data only. Themes that travel (theme-revamp S5): Share as a link (short, with a QR code), opening one (preview, Cancel, Use, a broken
// link), the night theme on Auto, case text size, and an uploaded font carried by an exported theme.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const poll = async (fn, what, ms = 8000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw new Error('timed out: ' + what); await new Promise(r => setTimeout(r, 100)); } };
const open = async (width, hash = '#log') => {
  const ctx = await b.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?demo' + hash);
  return { ctx, p, errors };
};
const dsp = p => p.evaluate(async () => (await import('./js/display.js')).display());
const cssVar = (p, k) => p.evaluate(k => getComputedStyle(document.documentElement).getPropertyValue('--' + k).trim(), k);
try { for (const width of [390, 1280]) {
  // 1. share: the look now, as a link
  let { ctx, p, errors } = await open(width);
  await p.waitForSelector('textarea.details');
  await p.evaluate(async () => { const m = await import('./js/display.js'); m.applyDisplay(m.setDisplay({ round: 0, spacing: 'roomy', fontUi: 'nunito', accent: '#1f6f5c' })); location.hash = '#themes'; });
  await p.locator('section.my-themes').waitFor();
  await p.getByRole('button', { name: 'Share as a link…' }).click();
  const box = p.locator('dialog[open] input.theme-link');
  const link = await box.inputValue();
  assert.match(link, /\/logbook\/#t=[A-Za-z0-9_-]+$/);
  assert.ok(link.length - link.indexOf('#') < 100, 'short: a few changes from a bundled theme ' + link);
  await p.locator('dialog[open] .theme-qr svg').waitFor();   // and its QR code, drawn on the phone
  await p.locator('dialog[open]').getByRole('button', { name: 'Close' }).click();
  assert.deepEqual(errors, []);
  await ctx.close();
  const hash = link.slice(link.indexOf('#'));

  // 2. a colleague opens it: shown at once, Cancel puts their look back and keeps nothing
  ({ ctx, p, errors } = await open(width, hash));
  const offer = p.locator('dialog[open].theme-offer');
  await offer.waitFor();
  assert.match(await offer.locator('h2').innerText(), /^Theme: Custom/);
  assert.equal(new URL(p.url()).hash, '#themes', 'the link is tidied away');
  assert.equal(await cssVar(p, 'round'), '0', 'previewed');
  assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-ui').includes('Nunito')), true, 'bundled font travels');
  assert.equal((await dsp(p)).round ?? null, null, 'nothing saved while trying it');
  await offer.getByRole('button', { name: 'Cancel' }).click();
  await poll(async () => (await cssVar(p, 'round')) !== '0', 'cancel restores');
  assert.equal(cleanList((await dsp(p)).myThemes).length, 0);
  // 3. again, from inside the app (a link tapped while it is open), then Use: set and kept in Your themes
  await p.evaluate(h => { location.hash = h; }, hash);
  await offer.waitFor();
  await offer.getByRole('button', { name: 'Use' }).click();
  await poll(async () => (await dsp(p)).round === 0, 'used');
  const d = await dsp(p);
  assert.equal(d.spacing, 'roomy'); assert.equal(d.fontUi, 'nunito'); assert.equal(d.accent, '#1f6f5c');
  assert.equal(cleanList(d.myThemes).length, 1, 'kept in Your themes');
  await p.locator('section.my-themes .theme-row').first().waitFor();
  // 4. a broken link: a message, nothing applied
  await p.evaluate(() => { location.hash = '#t=gA'; });
  await poll(() => p.locator('#toast').innerText().then(t => /broken or cut short/.test(t)).catch(() => false), 'broken link message');

  // 5. day and night: Auto, a night theme from Your themes; the phone going dark swaps the look
  await p.evaluate(async () => { const m = await import('./js/display.js'); m.applyDisplay(m.setDisplay({ round: 3, accent: '#aa3300' })); m.applyTheme('auto'); location.hash = '#themes'; });
  await p.emulateMedia({ colorScheme: 'light' });
  await p.evaluate(() => { location.hash = '#access'; }); await p.evaluate(() => { location.hash = '#themes'; });
  const night = p.getByLabel('Theme when the phone is dark');
  await night.waitFor();
  const mineId = cleanList((await dsp(p)).myThemes)[0].id;
  await night.selectOption('mine:' + mineId);
  assert.equal(await cssVar(p, 'round'), '1.7', 'day look by day');
  await p.emulateMedia({ colorScheme: 'dark' });
  await poll(async () => (await cssVar(p, 'round')) === '0', 'night theme when dark');
  await p.evaluate(() => { location.hash = '#access'; }); await p.evaluate(() => { location.hash = '#themes'; });
  await p.getByText(/The phone is dark, so you’re seeing/).waitFor();
  assert.equal((await dsp(p)).round, 3, 'the day look is untouched');
  await p.emulateMedia({ colorScheme: 'light' });
  await poll(async () => (await cssVar(p, 'round')) === '1.7', 'day again');
  await p.evaluate(async () => (await import('./js/display.js')).applyTheme('light'));

  // 6. case text size, apart from the interface text size
  await p.evaluate(() => { location.hash = '#access'; });
  await p.getByRole('group', { name: 'Case text size' }).getByText('Largest').click();
  assert.equal(await cssVar(p, 'cs'), '1.5');
  await p.evaluate(() => { location.hash = '#log'; }); await p.waitForSelector('textarea.details');
  const fs16 = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('textarea.details')).fontSize));
  assert.ok(fs16 >= 24, 'the case box is bigger: ' + fs16);
  assert.equal(await p.evaluate(() => getComputedStyle(document.body).fontSize), '15px', 'the rest stays');
  await p.reload(); await p.waitForSelector('textarea.details');
  assert.equal(await cssVar(p, 'cs'), '1.5', 'first paint keeps it');
  assert.deepEqual(errors, []);
  await ctx.close();

  // 7. an uploaded font travels in an exported theme, and comes back with it
  if (width === 390) {
    ({ ctx, p, errors } = await open(width));
    await p.waitForSelector('textarea.details');
    await p.evaluate(async () => {
      const f = await import('./js/fonts.js'), m = await import('./js/display.js');
      const blob = await (await fetch('fonts/lexend-400.woff2')).blob();
      await f.saveUserFont('ui', new File([blob], 'Fake Own.woff2'));
      m.applyDisplay(m.setDisplay({ fontUi: 'file', round: 1 })); location.hash = '#themes';
    });
    const card = p.locator('section.my-themes');
    await card.getByRole('textbox', { name: 'Name for this look' }).fill('Fake own font');
    await card.getByRole('button', { name: 'Save this look' }).click();
    await card.locator('.theme-row', { hasText: 'Fake own font' }).waitFor();
    const [dl] = await Promise.all([p.waitForEvent('download'), card.getByRole('button', { name: 'Export…' }).click()]);
    const file = fs.readFileSync(await dl.path(), 'utf8');
    const t = JSON.parse(file).themes.find(x => x.name === 'Fake own font');
    assert.equal(t.fonts.ui.name, 'Fake Own.woff2'); assert.ok(t.fonts.ui.data.length > 1000);
    assert.deepEqual(errors, []);
    await ctx.close();
    ({ ctx, p, errors } = await open(width, '#themes'));
    await p.locator('section.my-themes').waitFor();
    const tmp = (process.env.E2E_OUT || '/tmp') + '/fake-themes-font.json'; fs.writeFileSync(tmp, file);
    await p.locator('section.my-themes input[type=file]').setInputFiles(tmp);
    const row = p.locator('section.my-themes .theme-row', { hasText: 'Fake own font' });
    await row.waitFor(); await row.click();
    await poll(() => p.evaluate(async () => (await (await import('./js/fonts.js')).getUserFont('ui'))?.name === 'Fake Own.woff2'), 'font kept on the new phone');
    await poll(() => p.evaluate(() => [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Logbook own font' && f.status === 'loaded')), 'font in use');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  console.log('ok', width);
} } finally { await b.close(); }
function cleanList(l) { return Array.isArray(l) ? l : []; }
console.log('PASS share-link');
