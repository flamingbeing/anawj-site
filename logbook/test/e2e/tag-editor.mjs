// Fake data only. Select-before-edit, insertion anchors, Back and stale-layout protection.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
    await context.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://localhost:${process.env.PORT || 8080}/logbook/?demo#tags`);
    await page.waitForSelector('.te-name');
    await page.evaluate(async () => {
      const { patchLogbook, hooks } = await import('./js/ui-core.js');
      const { defaultTagSet } = await import('./js/tags.js');
      await patchLogbook({ settings: { tagSet: [...defaultTagSet({}), { k: 'u:anchor', n: 'Teaching' }, { k: 'u:child', n: 'Checklist', p: 'u:anchor' }] } }); hooks.render();
    });
    const row = key => page.locator(`.te-list li[data-k="${key}"]`);
    const readLayout = () => page.evaluate(async () => (await import('./js/ui-core.js')).tagSet());
    await row('u:anchor').locator('.te-name').click();
    assert.equal(await row('u:anchor').locator('.te-name').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('dialog input').count(), 0);
    assert.match(await page.locator('dialog').innerText(), /Personal tag/);
    const out = process.env.E2E_OUT;
    if (out && width === 390) { fs.mkdirSync(out, { recursive: true }); await page.screenshot({ path: `${out}/tag-info-390.png` }); }
    await page.goBack();
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    assert.equal(await row('u:anchor').locator('.te-name').getAttribute('aria-pressed'), 'true');
    const before = await readLayout();
    await page.getByRole('button', { name: '+ Personal tag', exact: true }).click();
    assert.equal(await page.getByLabel('Place after', { exact: true }).inputValue(), 'u:anchor');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    assert.deepEqual(await readLayout(), before);
    await row('u:anchor').locator('.te-name').click();
    await page.getByRole('button', { name: 'Add after', exact: true }).click();
    await page.getByLabel('Name (pill)', { exact: true }).fill('Revision');
    await page.getByLabel('Find a placement tag', { exact: true }).fill('Teaching');
    assert.equal(await page.getByLabel('Place after', { exact: true }).inputValue(), 'u:anchor');
    if (out && width === 390) await page.screenshot({ path: `${out}/tag-placement-390.png` });
    await page.locator('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    const saved = await readLayout(), newTag = saved.find(x => x.n === 'Revision');
    assert.equal(saved.findIndex(x => x.k === newTag.k), saved.findIndex(x => x.k === 'u:child') + 1);
    await page.getByRole('button', { name: '+ Personal tag', exact: true }).click();
    await page.getByLabel('Name (pill)', { exact: true }).fill('Inside');
    await page.getByLabel('Sits under', { exact: true }).selectOption('u:anchor');
    assert.equal(await page.getByLabel('Place after', { exact: true }).inputValue(), '$end');
    await page.getByLabel('Place after', { exact: true }).selectOption('$start');
    await page.locator('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    const inside = await readLayout();
    assert.equal(inside.find(x => x.n === 'Inside').p, 'u:anchor');
    assert.equal(inside.findIndex(x => x.n === 'Inside'), inside.findIndex(x => x.k === 'u:anchor') + 1);
    // No overwritten layout if another writer changes it with a dialog open.
    await page.getByRole('button', { name: '+ Section header', exact: true }).click();
    await page.getByLabel('Header', { exact: true }).fill('Stale');
    await page.evaluate(async () => {
      const { patchLogbook, tagSet } = await import('./js/ui-core.js');
      await patchLogbook({ settings: { tagSet: [...tagSet(), { k: 'u:other', n: 'Elsewhere' }] } });
    });
    await page.locator('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    assert.equal(await page.locator('dialog[open]').count(), 1);
    assert(!(await readLayout()).some(x => x.n === 'Stale'));
    assert((await readLayout()).some(x => x.k === 'u:other'));
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    await page.locator('.tag-editor .seg').getByRole('button', { name: 'Pills', exact: true }).click();
    await row('u:anchor').focus(); await page.keyboard.press('Space');
    await page.waitForSelector('dialog.tag-info');
    await page.locator('dialog[open]').getByRole('button', { name: 'Edit', exact: true }).click();
    assert.equal(await page.getByLabel('Name (pill)', { exact: true }).inputValue(), 'Teaching');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    assert.equal(await page.evaluate(() => document.activeElement.dataset.k), 'u:anchor');
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS tag editor ${width === 390 ? 'phone' : 'desktop'}`);
  }
} finally { await browser.close(); }
