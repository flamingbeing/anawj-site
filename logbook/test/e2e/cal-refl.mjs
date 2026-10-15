// Fake data only. Logbook calendar → Show reflections (15 Oct 2026; this device, off by default): a mark on days with a
// reflection, each reflection under its case in the day's list, a tap opens it.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  // a fake reflection on a fake case, today
  const today = await p.evaluate(async () => {
    const { S, createCase, todayISO } = await import('./js/ui-core.js');
    const c = await createCase({ date: todayISO(), details: 'ZW 40F fake thyroidectomy', cats: ['04'] });
    const { cloud } = await import('./js/ui-core.js');
    await cloud.saveReflection(S.user.email, { id: 'fake-cal-refl', caseId: c.id, headingId: 'thyroid', initials: 'ZW', date: todayISO(), title: 'Fake calendar reflection', summary: 'fake', status: 'draft' });
    return todayISO();
  });
  await p.waitForFunction(async () => (await import('./js/ui-core.js')).S.reflections?.some(r => r.id === 'fake-cal-refl'));
  await p.evaluate(() => { location.hash = '#logbook'; }); await p.locator('.lb-cal').waitFor();
  assert.equal(await p.locator('.lb-refl').count(), 0, 'off by default');
  await p.getByLabel('Show reflections').check();
  await p.locator(`.lb-day[aria-label*="has a reflection"]`).first().waitFor();
  assert.ok(await p.locator('.lb-refl').count() >= 1);
  // today's list: the reflection under its case; a tap opens it
  const row = p.locator('li.refl-under', { hasText: 'Fake calendar reflection' });
  await row.waitFor();
  await row.locator('button').click();
  await p.waitForURL(/#reflect$/);
  await p.waitForFunction(() => document.querySelector('.refl-editor input[placeholder="Title"]')?.value === 'Fake calendar reflection');
  // remembered on this device
  assert.equal(await p.evaluate(async () => (await import('./js/display.js')).display().calRefl), true);
  assert.ok(today);
  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log(`PASS calendar reflections ${width < 600 ? 'phone' : 'desktop'}`);
} } finally { await b.close(); }
