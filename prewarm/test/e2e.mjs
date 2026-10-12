// Browser test of the prewarming app in demo mode (fake data only), at phone size, with an axe accessibility check.
// Run (from the repo root, with a static server on the repo root at port 8080, e.g. python3 -m http.server 8080):
//   node prewarm/test/e2e.mjs            SHOTS=<dir> also saves phone screenshots
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const AXE = new URL('../../tools/vendor/axe.min.js', import.meta.url).pathname;
const BASE = `http://localhost:${process.env.PORT || 8080}/prewarm/`;
const SHOTS = process.env.SHOTS;

const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
let n = 0;
const shot = async name => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true }); };
const axe = async name => {
  if (!fs.existsSync(AXE)) return;
  await page.addScriptTag({ path: AXE });
  const r = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }));
  const bad = r.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  assert.equal(bad.length, 0, `${name}: ${bad.map(v => v.id + ' ' + v.nodes[0]?.target).join('; ')}`);
};

try {
  await page.goto(BASE + '?demo');
  await page.waitForSelector('.list a');
  assert.match(await page.textContent('.list'), /DEMO-01/);
  await axe('home'); await shot('home');

  // new patient
  await page.click('#new');
  await page.fill('#sid', 'TEST-02');
  await page.click('.seg .chip[data-v="2"]');
  await page.click('button[type=submit]');
  await page.waitForSelector('.tiles');
  await page.click('[data-now="pw_start"]');
  assert.match(await page.inputValue('input[data-f="pw_start"]'), /^\d\d:\d\d$/);
  await axe('patient'); await shot('patient');

  // pre-warming reading, option B: type core, nudge chest, pick sensation, save
  await page.click('a[href$="/read/prewarm"]');
  await page.waitForSelector('.board');
  assert.match(await page.textContent('.tp'), /0 min/);
  assert.match(await page.textContent('.badge'), /10 min pre-warming/, 'group shows on the pre-warming screen');
  await page.click('.num[data-type="core"]');
  await page.fill('input.num', '366');
  await page.keyboard.press('Enter');
  assert.equal((await page.textContent('.num[data-type="core"]')).trim(), '36.6', '366 is read as 36.6');
  await page.click('[data-step="1"][data-c="chest"]');
  await page.click('.chip[data-c="ts"][data-v="1"]');
  await axe('reading'); await shot('reading');
  await page.click('#save');
  await page.waitForFunction(() => /5 min/.test(document.querySelector('.tp')?.textContent || ''));
  assert.equal((await page.textContent('.num[data-type="core"]')).trim(), '36.6', 'carried over from the last reading');
  await page.click('[data-step="1"][data-c="core"]');
  assert.equal((await page.textContent('.num[data-type="core"]')).trim(), '36.7');
  await shot('reading-next');

  // warming stopped: set temp becomes NA for later timepoints
  await page.goBack(); await page.goBack();
  await page.waitForSelector('.tiles');
  await page.fill('input[data-f="ev_wstop"]', '00:00');
  await page.dispatchEvent('input[data-f="ev_wstop"]', 'change');

  // group is not shown on the hub
  assert.doesNotMatch(await page.textContent('main'), /10 min pre-warming/, 'group hidden outside the pre-warming screen');

  // form view
  await page.click('a[href$="/sheet"]');
  await page.waitForSelector('.sheet');
  assert.match(await page.textContent('.sheet'), /36\.6/);
  await axe('form view'); await shot('form-view');
  await page.goBack();

  // intra-op details: TXA total worked out, transfusion volumes
  await page.click('a[href$="/form/intraop"]');
  await page.click('.chip[data-f="io_txa"][data-v="1"]');
  await page.fill('#f-io_txa_bolus', '1000'); await page.dispatchEvent('#f-io_txa_bolus', 'change');
  await page.fill('#f-io_txa_inf', '500'); await page.dispatchEvent('#f-io_txa_inf', 'change');
  assert.equal(await page.inputValue('#f-io_txa_total'), '1500');
  await page.fill('input[data-f="io_rbc"]', '2'); await page.dispatchEvent('input[data-f="io_rbc"]', 'change');
  await page.click('#addix');
  await axe('intra-op'); await shot('intraop');
  await page.goBack();

  // PACU: NuDESC total
  await page.click('a[href$="/form/pacu"]');
  await page.click('.chip[data-f="nd_dis"][data-v="1"]');
  await page.click('.chip[data-f="nd_psy"][data-v="2"]');
  assert.equal(await page.inputValue('#f-pacu_nudesc'), '3');
  await axe('pacu'); await shot('pacu');

  // settings and export
  await page.goto(BASE + '?demo#/settings');
  await page.fill('#me', 'tt'); await page.dispatchEvent('#me', 'change');
  await page.click('[data-site="NUH"]');
  assert.equal(await page.getAttribute('[data-site="NUH"]', 'aria-pressed'), 'true');
  await axe('settings'); await shot('settings');
  await page.goto(BASE + '?demo#/export');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#xl')]);
  const file = await dl.path();
  const head = fs.readFileSync(file).subarray(0, 2).toString();
  assert.equal(head, 'PK', 'export is a zip (xlsx)');
  if (SHOTS) fs.copyFileSync(file, `${SHOTS}/export.xlsx`);

  assert.deepEqual(errors, []);
  console.log('prewarm e2e: ok');
} finally {
  await b.close();
}
