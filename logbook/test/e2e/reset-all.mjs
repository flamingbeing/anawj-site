// Fake data only. Settings → Reset all settings (15 Oct 2026): this device only, or the account too (tags only when
// ticked); your year, profile and places stay; cases are never touched; a settings file first; Undo.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  await p.waitForFunction(() => Number(document.body.dataset.cases) > 0);
  const state = () => p.evaluate(async () => {
    const { S, settings } = await import('./js/ui-core.js'), { display } = await import('./js/display.js');
    const st = settings();
    return { accent: display().accent ?? null, borders: display().borders ?? null, mode: document.documentElement.dataset.theme, autoTick: st.autoTick ?? null,
      rYear: st.rYear, tags: !!st.tagSet, cases: S.cases.length };
  });
  await p.evaluate(async () => {
    const { patchLogbook, tagSet } = await import('./js/ui-core.js'), D = await import('./js/display.js');
    D.applyTheme('dark'); D.applyDisplay(D.setDisplay({ accent: '#8a7a9e', borders: 1 }));
    await patchLogbook({ settings: { autoTick: true, rYear: 3, tagSet: tagSet() } });
  });
  // a wallpaper photo (theme-revamp S4): Reset clears it from the device, Undo puts it back
  const photo = () => p.evaluate(async () => !!(await (await import('./js/wallpaper.js')).getPhoto()));
  await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 40; c.height = 30; c.getContext('2d').fillRect(0, 0, 20, 30);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const W = await import('./js/wallpaper.js'), D = await import('./js/display.js');
    D.photoChanged(await W.savePhoto(new File([blob], 'w.png', { type: 'image/png' }))); D.applyDisplay(D.setDisplay({ wallpaper: 'photo' }));
  });
  assert.equal(await photo(), true);
  const before = await state();
  assert.deepEqual({ ...before, cases: 0 }, { accent: '#8a7a9e', borders: 1, mode: 'dark', autoTick: true, rYear: 3, tags: true, cases: 0 });
  const reset = async ({ account = false, tags = false, file = true } = {}) => {
    await p.evaluate(() => { location.hash = '#settings'; });
    const card = p.locator('section.reset-all');
    await card.locator(`input[name=reset-scope][value=${account ? 'account' : 'device'}]`).check();
    if (account) await card.getByLabel('Also reset my tags and shorthand')[tags ? 'check' : 'uncheck']();
    await card.getByLabel(/Save a settings file first/)[file ? 'check' : 'uncheck']();
    const dl = file ? p.waitForEvent('download') : null;
    await card.getByRole('button', { name: 'Reset all settings…' }).click();
    await p.locator('dialog[open]').getByRole('button', { name: 'Reset' }).click();
    if (dl) assert.match((await dl).suggestedFilename(), /^logbook-settings-.*\.json$/);
    await p.locator('#toast', { hasText: 'All settings reset' }).waitFor();
  };
  // this device only: the look goes, the account's settings stay; Undo brings the look back
  await reset();
  assert.deepEqual(await state(), { ...before, accent: null, borders: null, mode: 'light' });
  assert.equal(await photo(), false, 'the wallpaper photo is cleared');
  assert.equal(await p.evaluate(() => document.documentElement.classList.contains('wall')), false);
  await p.locator('#toast button', { hasText: 'Undo' }).click();
  await p.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  assert.deepEqual(await state(), before);
  assert.equal(await photo(), true, 'Undo puts the photo back');
  await p.waitForFunction(() => /blob:/.test(getComputedStyle(document.documentElement, '::before').backgroundImage));
  // the account too, tags kept: logging preferences go, the year and tags stay
  await reset({ account: true, file: false });
  assert.deepEqual(await state(), { ...before, accent: null, borders: null, mode: 'light', autoTick: null });
  await p.locator('#toast button', { hasText: 'Undo' }).click();
  await p.locator('#toast', { hasText: 'Settings put back' }).waitFor();
  assert.deepEqual(await state(), before);
  // and the tags when ticked
  await reset({ account: true, tags: true, file: false });
  assert.deepEqual(await state(), { ...before, accent: null, borders: null, mode: 'light', autoTick: null, tags: false });
  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log(`PASS reset all settings ${width < 600 ? 'phone' : 'desktop'}`);
} } finally { await b.close(); }
