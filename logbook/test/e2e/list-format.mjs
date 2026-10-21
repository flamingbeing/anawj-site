// Fake data only. Pasted list format (Settings → Logging; 19 Oct 2026): a start text splits a list that has no empty lines,
// the "Try it" box shows the cases found, and the List box's Review uses the same format.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const blob = '1. === AAB (60/M, ASA II) ===Op: knee scopeIssue: OA2. === CDE (40/F, ASA I) ===Op: lap cholePlan: GA3. === FGH (7/M) ===Op: circumcision, caudal';
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?demo#logging'); await p.waitForSelector('.set-page');
  await p.getByLabel('A case starts with').fill('{n}. === {initials} (');
  await p.getByLabel('A case starts with').dispatchEvent('change');
  await p.getByLabel('Drop these from the end of each case').fill('--');
  await p.getByLabel('Drop these from the end of each case').dispatchEvent('change');
  await p.getByLabel('Try it: paste a sample list').fill(blob);
  await p.waitForFunction(() => /3 cases found/.test(document.querySelector('.list-format-try')?.textContent || ''), null, { timeout: 5000 });
  assert.match(await p.locator('.list-format-try').innerText(), /1\. AAB/);
  // a start text of only {…} parts is refused, with a reason
  await p.getByLabel('A case starts with').fill('{n}');
  await p.getByLabel('A case starts with').dispatchEvent('change');
  assert.match(await p.locator('.set-page').innerText(), /Add some fixed text/);
  await p.getByLabel('A case starts with').fill('{n}. === {initials} (');
  await p.getByLabel('A case starts with').dispatchEvent('change');
  // teach it from an example: mark the start and the initials, then use the learned format
  await p.evaluate(async () => { const { patchLogbook } = await import('./js/ui-core.js'); await patchLogbook({ settings: { listFormat: null } }); });
  await p.goto(base + '?demo#logging'); await p.waitForSelector('.set-page');
  await p.locator('.list-teach summary').click();
  const ta = p.getByLabel('Sample list', { exact: true });
  await ta.fill(blob);
  const sel = (needle) => ta.evaluate((el, n) => { const i = el.value.indexOf(n); el.setSelectionRange(i, i + n.length); }, needle);
  await sel('1. === AAB ('); await p.locator('.list-teach').getByRole('button', { name: 'Case starts here' }).click();
  await sel('AAB'); await p.locator('.list-teach').getByRole('button', { name: 'Initials', exact: true }).click();
  await p.waitForFunction(() => /3 cases found in the sample/.test(document.querySelector('.list-teach')?.textContent || ''), null, { timeout: 5000 });
  await p.getByRole('button', { name: 'Use this format' }).click();
  await p.waitForFunction(async () => { const { settings } = await import('./js/ui-core.js'); return settings().listFormat?.start === '{n}. === {initials} ('; }, null, { timeout: 5000 });
  // the List box on the Add tab uses it
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  await p.locator('button[data-mode="bulk"]').click();
  await p.locator('textarea.details').fill(blob);
  await p.getByRole('button', { name: 'Review', exact: true }).click();
  await p.waitForSelector('table.bulk tbody tr');
  assert.equal(await p.locator('table.bulk tbody tr').count() >= 3, true);
  assert.deepEqual(errors, []);
  await ctx.close();
  console.log('PASS list format ' + (width < 600 ? 'phone' : 'desktop'));
} } finally { await b.close(); }
