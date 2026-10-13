// Browser test of the hand log at phone size, with an axe accessibility check.
// Run from the repo root (no server needed: files are served from this checkout by route):
//   node hand-log/test/e2e.mjs            SHOTS=<dir> also saves phone screenshots
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const AXE = new URL('../../tools/vendor/axe.min.js', import.meta.url).pathname;
const root = new URL('../../', import.meta.url).pathname;
const BASE = 'https://hand.anawj.com/handlog/';
const SHOTS = process.env.SHOTS;
const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', json: 'application/json', png: 'image/png', webmanifest: 'application/manifest+json' };

const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') && !fs.statSync('/opt/pw-browsers/chromium').isDirectory() ? '/opt/pw-browsers/chromium' : null);
const b = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
// service workers blocked: routed files can't feed a worker, and the test is about the app, not offline
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', acceptDownloads: true });
// anawj.com serves the whole repo (GitHub Pages); hand.anawj.com as the Worker maps it (/handlog/ -> hand-log/)
await ctx.route(/^https:\/\/((www\.)?anawj\.com|hand\.anawj\.com)\//, async route => {
  const u = new URL(route.request().url());
  let rel = decodeURIComponent(u.pathname).replace(/^\//, '');
  if (u.hostname === 'hand.anawj.com') {
    if (rel.startsWith('handlog/')) rel = 'hand-log/' + rel.slice(8);
    else if (!rel.startsWith('nuhsdesign/')) return route.fulfill({ status: 404, body: 'not found' });
  }
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const f = path.join(root, rel);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
  await route.fulfill({ status: 200, contentType: MIME[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(f) });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', d => d.accept());

const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `hand-log-${name}.png`), fullPage: true }); } };
const axe = async label => {
  if (!fs.existsSync(AXE)) return;
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const r = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }));
  const bad = r.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  assert.equal(bad.length, 0, `axe (${label}): ` + bad.map(v => v.id + ' ' + v.nodes[0]?.target).join('; '));
};
const count = () => page.locator('#entries li.entry').count();

// fill and save the form currently shown
async function fillAndSave() {
  await page.locator('#entry-form').waitFor();
  await page.fill('#f-date', '2026-10-01');
  await page.selectOption('#f-item', { index: 1 });
  await page.fill('#f-assessor', 'Consultant A');
  for (const sel of ['#f-setting', '#f-complexity']) {
    const opts = await page.$$eval(sel + ' option', os => os.filter(o => o.value).map(o => o.value));
    if (opts.length) await page.selectOption(sel, opts[0]);
  }
  const groups = await page.$$eval('#entry-form input[type=radio][name^="d-"]', rs => [...new Set(rs.map(r => r.name))]);
  assert.ok(groups.length > 0, 'form has domain rating groups');
  // big radio pills hide the input under the sticky save bar's hit area, so click it in the DOM
  for (const name of groups) {
    const r = page.locator(`#entry-form input[type=radio][name="${name}"]`).first();
    await r.evaluate(el => el.click()); // pill-styled radios hide the input itself
    assert.ok(await r.isChecked(), name + ' rated');
  }
  const glob = await page.$$eval('#f-global option', os => os.filter(o => o.value).map(o => o.value));
  await page.selectOption('#f-global', glob[glob.length - 1]);
  await page.fill('#f-good', 'Good exposure');
  await page.fill('#f-improve', 'Tourniquet time');
  await page.fill('#f-action', 'Read up on zones');
  await page.locator('#entry-form').getByRole('button', { name: 'Save' }).click();
}

try {
  // the old address sends you on to hand.anawj.com/handlog/, keeping the #
  await page.goto('https://anawj.com/hand-log/#summary');
  await page.waitForURL(BASE + '#summary');
  await page.goto(BASE + '#list');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#entries').waitFor({ state: 'attached' });
  assert.equal(await count(), 0, 'starts empty');
  await shot('list-empty');
  await axe('empty list');

  await page.goto(BASE + '#new-dops');
  await page.locator('#entry-form').waitFor();
  await shot('form-dops');
  await axe('DOPS form');
  await fillAndSave();
  await page.waitForFunction(() => document.querySelectorAll('#entries li.entry').length === 1);
  assert.match(await page.locator('#entries li.entry').first().innerText(), /DOPS/);

  await page.goto(BASE + '#new-minicex');
  await page.locator('#entry-form').waitFor();
  await axe('Mini-CEX form');
  await fillAndSave();
  await page.waitForFunction(() => document.querySelectorAll('#entries li.entry').length === 2);
  await shot('list-two');
  await axe('list with entries');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');

  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#entries li.entry').length === 2);
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('handlog.entries')).length === 2), 'saved under handlog.entries');

  await page.goto(BASE + '#summary');
  await page.locator('#export-csv').waitFor();
  await shot('summary');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-csv')]);
  assert.match(dl.suggestedFilename(), /\.csv$/, 'CSV download');

  await page.goto(BASE + '#list');
  await page.locator('#entries li.entry').first().waitFor();
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('handlog.entries'))[0].id);
  await page.goto(BASE + '#entry/' + encodeURIComponent(id));
  await page.locator('#delete').waitFor();
  await shot('entry');
  await page.click('#delete');
  if (!/#list|#$|\/$/.test(page.url())) await page.goto(BASE + '#list');
  await page.waitForFunction(() => document.querySelectorAll('#entries li.entry').length === 1);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('handlog.entries')).length), 1, 'deleted from storage');

  // speed-of-entry features: each check skips if the feature isn't there
  const has = async sel => (await page.locator(sel).count()) > 0;
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('handlog.draft.')) localStorage.removeItem(k); });
  await page.goto(BASE + '#new-dops');
  await page.locator('#entry-form').waitFor();
  if (await has('#f-assessor')) {
    assert.equal(await page.inputValue('#f-assessor'), 'Consultant A', 'assessor remembered from last save');
    console.log('  remembered assessor: ok');
  }
  if (await has('.quick-all')) {
    const q = page.locator('.quick-all').first();
    await q.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await q.click();
    const unrated = await page.$$eval('#entry-form input[type=radio][name^="d-"]', rs => {
      const names = [...new Set(rs.map(r => r.name))];
      return names.filter(n => !rs.some(r => r.name === n && r.checked));
    });
    assert.deepEqual(unrated, [], 'rate-all button checks every domain');
    console.log('  rate all domains: ok');
  } else console.log('  rate all domains: skipped (no .quick-all)');

  const remaining = await page.evaluate(() => JSON.parse(localStorage.getItem('handlog.entries'))[0]);
  await page.goto(BASE + '#entry/' + encodeURIComponent(remaining.id));
  await page.locator('#delete').waitFor();
  if (await has('button#log-again')) {
    await page.click('button#log-again');
    await page.locator('#entry-form').waitFor();
    assert.equal(await page.inputValue('#f-item'), remaining.item ?? (await page.inputValue('#f-item')), 'log again keeps the item');
    assert.ok(await page.inputValue('#f-item'), 'log again preselects an item');
    console.log('  log again: ok');
  } else console.log('  log again: skipped (no button#log-again)');

  await page.goto(BASE + '#list');
  await page.locator('#entries li.entry').first().waitFor();
  if (await has('input#list-filter')) {
    await page.fill('#list-filter', 'zzz-no-match');
    await page.waitForFunction(() => [...document.querySelectorAll('#entries li.entry')].every(li => li.hidden || getComputedStyle(li).display === 'none'));
    await page.fill('#list-filter', '');
    await page.waitForFunction(() => [...document.querySelectorAll('#entries li.entry')].some(li => !li.hidden && getComputedStyle(li).display !== 'none'));
    console.log('  list filter: ok');
  } else console.log('  list filter: skipped (no input#list-filter)');

  assert.deepEqual(errors, [], 'no console errors');
  console.log('hand-log e2e: ok');
} finally {
  await b.close();
}
