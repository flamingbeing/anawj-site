// Fake data only. Detection (Settings → Logging → Detection; 15 Oct 2026): the line under the Case box shows what was
// read, and a tap keeps it as text for that case (initials and age); starts to skip, one-letter initials, off.
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
  await p.waitForFunction(() => Number(document.body.dataset.cases) > 0);
  const box = p.locator('textarea.details');
  const saveCase = async () => {
    await p.locator('.picker [data-code="13"]').click();
    await p.locator('.savebar button.primary').click();
    await p.waitForFunction(() => !document.querySelector('textarea.details').value, null, { timeout: 5000 }).catch(async e => { console.log('DIALOG', await p.locator('dialog[open]').innerText().catch(() => '-'), 'TOAST', await p.locator('#toast').innerText()); throw e; });
    return p.evaluate(async () => { const { S } = await import('./js/ui-core.js'); const c = [...S.cases].sort((a, b) => b.createdAt - a.createdAt)[0]; return { initials: c.initials, details: c.details }; });
  };
  const set = patch => p.evaluate(async x => { const { patchLogbook } = await import('./js/ui-core.js'); await patchLogbook({ settings: x }); }, patch);

  // tap the initials on the line: they stay in the case text; tap again: initials again
  await box.fill('ZQ 45F fake hernia repair');
  const ini = p.locator('.parsed button.pi-ini');
  assert.equal(await ini.innerText(), 'ZQ = initials');
  await ini.click();
  assert.equal(await ini.getAttribute('aria-pressed'), 'true');
  assert.match(await ini.innerText(), /ZQ · not initials/);
  // (the box's marks repaint just after the tap: wait for it, as a check made at once raced it on a busy machine)
  await p.waitForFunction(() => !document.querySelector('.box-marks mark.m-ini'), null, { timeout: 3000 }).catch(() => { throw new Error('still marked in the box'); });
  await ini.click(); assert.equal(await ini.innerText(), 'ZQ = initials');
  // the BMI is marked in the box too, in order with the initials and age (log2 2)
  await box.fill('ZQ 45F BMI 42 fake sleeve gastrectomy');
  await p.waitForFunction(() => [...document.querySelectorAll('.box-marks mark')].map(m => m.className + ':' + m.textContent).join() === 'm-ini:ZQ,m-age:45F,m-bmi:BMI 42', null, { timeout: 3000 })
    .catch(async () => { throw new Error('marks: ' + await p.evaluate(() => [...document.querySelectorAll('.box-marks mark')].map(m => m.className + ':' + m.textContent).join())); });
  await box.fill('ZQ 45F fake hernia repair');
  await ini.click();
  assert.deepEqual(await saveCase(), { initials: '', details: 'ZQ 45F fake hernia repair' });
  // the next case reads initials again
  await box.fill('ZQ 45F fake hernia repair');
  assert.equal(await p.locator('.parsed button.pi-ini').innerText(), 'ZQ = initials');
  // tap the age: no age-based Geriatric for a 78M once it's text
  await box.fill('ZK 78M fake hernia repair');
  await p.locator('.sugg[data-code="21"]').first().waitFor();
  await p.locator('.parsed button.pi-age').click();
  await p.waitForFunction(() => !document.querySelector('.sugg[data-code="21"]'));
  assert.match(await p.locator('.parsed button.pi-age').innerText(), /78M · not the age/);
  await box.fill('');

  // starts to skip
  await set({ skipStarts: '===, Pt:' });
  await box.fill('=== ZW 50M fake hernia repair');
  assert.equal(await p.locator('.parsed button.pi-ini').innerText(), 'ZW = initials');
  assert.deepEqual(await saveCase(), { initials: 'ZW', details: '50M fake hernia repair' });
  // one-letter initials
  await box.fill('J fake hernia repair');
  assert.equal(await p.locator('.parsed button.pi-ini').count(), 0);
  await set({ oneLetterInitials: true });
  await box.fill('J fake hernia repair ');
  await p.locator('.parsed button.pi-ini', { hasText: 'J = initials' }).waitFor();
  await box.fill('I fake hernia repair');
  await p.waitForFunction(() => !document.querySelector('.parsed button.pi-ini'));
  // off: nothing read
  await set({ detectInitials: false });
  await box.fill('ZV 45F fake hernia repair');
  await p.waitForFunction(() => !document.querySelector('.parsed button.pi-ini'));
  assert.deepEqual(await saveCase(), { initials: '', details: 'ZV 45F fake hernia repair' });
  // the settings page shows them, and Reset puts the defaults back
  await p.evaluate(() => { location.hash = '#logging'; });
  assert.equal(await p.getByLabel('Read initials from the start of the case box').isChecked(), false);
  assert.equal(await p.getByLabel('Allow one-letter initials').isChecked(), true);
  assert.equal(await p.getByLabel('Skip these at the start').inputValue(), '===, Pt:');
  await p.getByRole('button', { name: 'Reset these logging defaults' }).click();
  await p.waitForFunction(async () => { const { settings } = await import('./js/ui-core.js'); const s = settings(); return s.detectInitials == null && !s.oneLetterInitials && !s.skipStarts; });
  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log(`PASS detection ${width < 600 ? 'phone' : 'desktop'}`);
} } finally { await b.close(); }
