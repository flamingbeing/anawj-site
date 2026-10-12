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
  // the patient opens on the main screen: times, then pre-warming temperatures
  await page.waitForSelector('.times');
  // pre-op comfort at the top, one line once answered; post-op comfort at the bottom
  assert.match(await page.textContent('.comfort'), /before surgery/);
  await page.click('.chip[data-sat="sat_pre"][data-v="2"]');
  assert.match(await page.textContent('.comfort.done'), /Neutral/);
  assert.ok(await page.$('.chip[data-sat="sat_post"]'), 'post-op comfort at the bottom');
  assert.equal(await page.$('.links a[href$="/form/satis"]'), null, 'no separate satisfaction screen');
  assert.match(await page.textContent('.tabs2 [aria-selected="true"]'), /Pre-warming/);
  assert.match(await page.textContent('.badge'), /10 min pre-warming/, 'group shows with the pre-warming temperatures');
  await page.click('[data-ev="pw_start"]');
  assert.match(await page.textContent('[data-ev="pw_start"] b'), /^\d\d:\d\d$/, 'tapping an empty time sets now');
  assert.match(await page.textContent('#due'), /due \d\d:\d\d/);
  // the 0-min reading is due now: the banner shows and hides on a tap
  await page.waitForSelector('#banner:not([hidden])');
  await page.click('#banner');
  // changing a set time
  await page.click('[data-ev="pw_start"]');
  await page.waitForSelector('#evtime');
  await axe('patient'); await shot('patient');
  await page.fill('#evtime', '07:30');
  assert.equal(await page.textContent('[data-ev="pw_start"] b'), '07:30');

  // pre-warming reading, option B: empty temp taps to 36.5, type core, nudge chest, pick sensation, save
  assert.match(await page.textContent('.tp'), /0 min/);
  await page.click('.num[data-type="chest"]');
  assert.equal((await page.textContent('.num[data-type="chest"]')).trim(), '36.5', 'an empty temperature starts at 36.5');
  await page.click('.num[data-type="core"]');
  await page.click('.num[data-type="core"]');
  await page.fill('input.num', '366');
  await page.keyboard.press('Enter');
  assert.equal((await page.textContent('.num[data-type="core"]')).trim(), '36.6', '366 is read as 36.6');
  await page.click('[data-step="-1"][data-c="chest"]');
  assert.equal((await page.textContent('.num[data-type="chest"]')).trim(), '36.4');
  await page.click('.chip[data-c="ts"][data-v="1"]');
  await axe('reading'); await shot('reading');
  await page.click('#save');
  await page.waitForFunction(() => /5 min/.test(document.querySelector('.tp')?.textContent || ''));
  assert.equal((await page.textContent('.num[data-type="core"]')).trim(), '36.6', 'carried over from the last reading');
  await page.click('[data-step="1"][data-c="core"]');
  assert.equal((await page.textContent('.num[data-type="core"]')).trim(), '36.7');
  await shot('reading-next');

  // warming stopped: set temp becomes NA for later timepoints
  await page.click('[data-ev="ev_wstop"]');
  await page.click('[data-ev="ev_wstop"]');
  await page.fill('#evtime', '07:31');
  await page.click('.strip a:has-text("10")');
  await page.waitForFunction(() => /10 min/.test(document.querySelector('.tp')?.textContent || ''));
  await page.waitForFunction(() => document.querySelector('.chip[data-c="set"][data-v="NA"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5000 });

  // intra-op tab: group not shown
  await page.click('.tabs2 a:has-text("Intra-op")');
  await page.waitForFunction(() => /Baseline/.test(document.querySelector('.tp')?.textContent || ''));
  assert.doesNotMatch(await page.textContent('main'), /10 min pre-warming/, 'group hidden outside the pre-warming temperatures');
  await shot('intraop-temps');

  // form view: the paper form's day-of-surgery pages, filled in, with Save as PDF / Print
  await page.click('.textlinks a[href$="/form"]');
  await page.waitForSelector('.fpage');
  assert.equal((await page.$$('.fpage')).length, 4);
  assert.match(await page.textContent('.form'), /PRE-OPERATIVE \(INTERVENTION\)[\s\S]*☒ 10-minute prewarming/);
  assert.ok(await page.$('#print'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'no sideways scroll');
  await axe('form view (print)'); await shot('form-print');
  await page.goBack();

  // spreadsheet view
  await page.click('.textlinks a[href$="/sheet"]');
  await page.waitForSelector('.sheet');
  assert.match(await page.textContent('.sheet'), /36\.6/);
  await axe('form view'); await shot('form-view');
  await page.goBack();

  // intra-op details: TXA total worked out, transfusion volumes
  await page.click('.links a[href$="/form/intraop"]');
  await page.click('.chip[data-f="io_txa"][data-v="1"]');
  await page.fill('#f-io_txa_bolus', '1000'); await page.dispatchEvent('#f-io_txa_bolus', 'change');
  await page.fill('#f-io_txa_inf', '500'); await page.dispatchEvent('#f-io_txa_inf', 'change');
  assert.equal(await page.inputValue('#f-io_txa_total'), '1500');
  await page.fill('input[data-f="io_rbc"]', '2'); await page.dispatchEvent('input[data-f="io_rbc"]', 'change');
  await page.click('#addix');
  await axe('intra-op'); await shot('intraop');
  await page.goBack();

  // PACU: NuDESC total
  await page.click('.links a[href$="/form/pacu"]');
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
