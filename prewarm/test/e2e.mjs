// Browser test of the prewarming app in demo mode (fake data only), at phone size, with an axe accessibility check.
// Run (from the repo root, with a static server on the repo root at port 8080, e.g. python3 -m http.server 8080):
//   node prewarm/test/e2e.mjs            SHOTS=<dir> also saves phone screenshots
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fixtureFiles } from './fixture-form.mjs';
const JSZip = createRequire(import.meta.url)('../../logbook/vendor/jszip.min.js');
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
const toastSaysE = re => page.waitForFunction(r => new RegExp(r).test(document.querySelector('#toast')?.textContent || ''), re.source, { timeout: 5000 });
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
  if (SHOTS) await page.screenshot({ path: SHOTS + '/fit.png' });
  // one timepoint fits a 390 x 844 phone: Save is on screen without scrolling
  const sv = await page.locator('#save').boundingBox();
  assert.ok(sv.y + sv.height <= 844, 'Save is below the fold: ' + (sv.y + sv.height));
  await page.click('.chip[data-sat="sat_pre"][data-v="2"]');
  assert.match(await page.textContent('.comfort.done'), /Neutral/);
  assert.ok(await page.$('.chip[data-sat="sat_post"]'), 'post-op comfort at the bottom');
  assert.equal(await page.$('.links a[href$="/form/satis"]'), null, 'no separate satisfaction screen');
  assert.match(await page.textContent('.tabs2 [aria-selected="true"]'), /Pre-warming/);
  assert.match(await page.textContent('.badge'), /10 min pre-warming/, 'group shows with the pre-warming temperatures');
  await page.click('[data-ev="pw_start"]');
  assert.match(await page.textContent('[data-ev="pw_start"] b'), /^\d\d:\d\d$/, 'tapping an empty time sets now');
  assert.match(await page.textContent('#due'), /due \d\d:\d\d/);
  // the 0-min reading is due right now: the due time shows its 'now' state
  await page.waitForFunction(() => document.querySelector('#due')?.dataset.state === 'now', null, { timeout: 5000 });
  // running timer from warming on, and the next event to note (10-min group: warming off 10 min later)
  assert.match(await page.textContent('#clock'), /Prewarm \+\d+:\d\d/);
  assert.match(await page.textContent('#clock'), /Next: Prewarm off \d\d:\d\d/);
  // the app bar's Log button sets the next event to now (then cleared again from its box)
  assert.match(await page.textContent('#lognext'), /Log\s*Prewarm off/);
  await page.click('#lognext');
  assert.match(await page.textContent('[data-ev="ev_wstop"] b'), /^\d\d:\d\d$/, 'Log sets warming off to now');
  await page.click('[data-ev="ev_wstop"]'); await page.click('[data-evclear="ev_wstop"]');
  assert.equal(await page.textContent('[data-ev="ev_wstop"] b'), 'tap');
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
  // previous / next timepoint buttons beside the strip
  const at = () => page.textContent('.strip a.on');
  const before = await at();
  assert.ok(await page.$('span.pn.prev'), 'no previous before the first timepoint');
  await page.click('.pn.next'); await page.waitForFunction(b => document.querySelector('.strip a.on')?.textContent !== b, before);
  await page.click('.pn.prev'); await page.waitForFunction(b => document.querySelector('.strip a.on')?.textContent === b, before);
  await page.click('.num[data-type="chest"]');
  assert.equal((await page.textContent('.num[data-type="chest"]')).trim(), '36.5', 'an empty temperature starts at 36.5');
  // anywhere on an empty temperature's card does the same
  await page.click('.card[data-fill="arm"] .clab');
  assert.equal((await page.textContent('.num[data-type="arm"]')).trim(), '36.5', 'tapping the card label fills 36.5');
  assert.equal(await page.$('.card[data-fill="arm"]'), null, 'a filled card is no longer one big target');
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
  // an empty room temp fills 20.0 when its card is tapped
  await page.click('.card[data-fill="room"] .clab');
  assert.equal((await page.textContent('.num[data-type="room"]')).trim(), '20.0', 'room temp starts at 20');
  await shot('intraop-temps');

  // form view: the paper form's day-of-surgery pages, filled in, with Save as PDF / Print
  await page.click('.textlinks a[href$="/form"]');
  await page.waitForSelector('.fpage');
  assert.equal((await page.$$('.fpage')).length, 4);
  assert.match(await page.textContent('.form'), /PRE-OPERATIVE \(INTERVENTION\)[\s\S]*☒ 10-minute prewarming/);
  assert.ok(await page.$('#print'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'no sideways scroll');
  await axe('form view (print)'); await shot('form-print');
  // the study's Word form (demo: chosen on this tab; live: uploaded by an admin), filled in: shown, downloaded
  assert.match(await page.textContent('main'), /simple version/);
  const zip = new JSZip(); for (const [k, v] of Object.entries(fixtureFiles())) zip.file(k, v);
  await page.setInputFiles('#blankfile', { name: 'blank form.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
  await page.waitForSelector('#doc section.docx', { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('#dl').disabled);
  assert.match(await page.textContent('#doc'), /☒ 10-minute prewarming/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'Word pages fit the phone');
  await shot('form-word');
  const [wdl] = await Promise.all([page.waitForEvent('download'), page.click('#dl')]);
  assert.equal(wdl.suggestedFilename(), 'TEST-02 data collection form.docx');
  const got = await JSZip.loadAsync(fs.readFileSync(await wdl.path()));
  const docXml = await got.file('word/document.xml').async('string');
  assert.match(docXml, /w14:checked w14:val="1"/, 'ticked in the Word file');
  assert.doesNotMatch(await got.file('docProps/core.xml').async('string'), /Test Author/, 'file details removed');
  await page.goBack();

  // other data: the rest of the study's pages, from the small box beside Form view / Sheet view
  await page.click('.textlinks a.minicard');
  await page.waitForSelector('.links.one a');
  assert.equal(await page.$$eval('.links.one a', x => x.length), 8, 'pre-op, meds, bloods, day 1 x2, day 2 x2, discharge');
  await page.click('.links.one a >> nth=0');
  await page.fill('#f-age', '67'); await page.dispatchEvent('#f-age', 'change');
  await page.goBack(); await page.waitForSelector('.links.one a');
  assert.match(await page.textContent('.links.one a >> nth=0'), /1 of \d+ filled/);
  await page.goBack();

  // sheet view
  await page.click('.textlinks a[href$="/sheet"]');
  await page.waitForSelector('.sheet');
  assert.match(await page.textContent('.sheet'), /36\.6/);
  assert.equal(await page.$('#del'), null, 'no delete on the spreadsheet view');
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
  // sub-screens keep the running timer and the Log button in the top bar
  assert.ok(await page.$('#clock'), 'timer on the PACU screen');
  assert.ok(await page.$('#lognext'), 'Log button on the PACU screen');
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
  // screen size: zooms the whole app on this phone, and is remembered
  await page.click('[data-zoom="1.25"]');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).zoom), '1.25');
  await page.reload(); await page.waitForSelector('#me');
  assert.equal(await page.getAttribute('[data-zoom="1.25"]', 'aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).zoom), '1.25');
  await page.click('[data-zoom="1"]');
  // every reading live by default; deleting participants only from Settings
  assert.equal(await page.isChecked('[data-k="haemo15"]'), true, 'BP, HR and BIS every 15 min on by default');
  await page.click('a[href="#/delete"]');
  await page.waitForSelector('.dellist');
  await axe('delete participants'); await shot('delete');
  const delBtn = page.locator('.dellist li', { hasText: 'TEST-02' }).locator('[data-del]');
  await delBtn.click(); await delBtn.click();
  await page.waitForFunction(() => !/TEST-02/.test(document.querySelector('main').textContent));
  await page.goto(BASE + '?demo#/');
  assert.doesNotMatch(await page.textContent('.list'), /TEST-02/, 'deleted from the list');
  // mark data collection complete (bottom of the main screen): shown at the top and in the patient list
  await page.click('.list a:has-text("DEMO-01")');
  await page.waitForSelector('[data-done]');
  assert.equal(await page.$('[data-sign]'), null, 'no per-section mark on the main screen');
  await page.click('[data-done]');
  assert.match(await page.textContent('.donetop'), /Data collection complete\s*TT \d+ \w+ \d{4} \d\d:\d\d/);
  await page.goto(BASE + '?demo#/');
  assert.match(await page.textContent('.list'), /DEMO-01[\s\S]*✓ Data collection complete/);
  // tapping a completed patient warns first, opens on the second tap
  await page.click('.list a:has-text("DEMO-01")');
  assert.match(await page.textContent('.list a.warned'), /marked complete .*Tap again to open/);
  assert.doesNotMatch(page.url(), /#\/p\//, 'still on the list');
  await page.click('.list a:has-text("DEMO-01")');
  await page.waitForSelector('.donetop');
  // locking (demo mode lets anyone try it): select all but the latest, lock; locked rows can't be opened
  await page.goto(BASE + '?demo#/');
  await page.click('#select');
  const latestId = await page.$eval('[data-sel]', c => c.dataset.sel);
  await page.click('#selall');
  assert.equal(await page.isChecked(`[data-sel="${latestId}"]`), false, 'the latest stays out');
  page.once('dialog', d => d.accept());
  await page.click('#lock');
  await page.waitForSelector('.list a.locked');
  assert.match(await page.textContent('.list a.locked'), /Locked by the study admin/);
  await axe('home with locked patients'); await shot('locked');
  // an admin (anyone, in demo mode) opens a locked patient read only
  await page.click('.list a.locked');
  await page.waitForSelector('.board');
  assert.ok(await page.evaluate(() => document.body.classList.contains('ro')), 'read only');
  assert.equal(await page.isVisible('#save'), false, 'no Save');
  assert.equal(await page.isVisible('#lognext'), false, 'no Log');
  await shot('locked-readonly');
  await page.goto(BASE + '?demo#/');
  assert.equal(await page.evaluate(() => document.body.classList.contains('ro')), false);
  // unlock them all again
  await page.click('#select');
  const nSel = await page.$$eval('[data-sel]', x => x.length);
  for (let i = 0; i < nSel; i++) await page.locator('[data-sel]').nth(i).check();
  await page.click('#unlock');
  assert.equal(await page.$('.list a.locked'), null, 'unlocked');
  await page.goto(BASE + '?demo#/');
  assert.equal(await page.$('a[href="#/export"]'), null, 'no export on the home page');
  await page.goto(BASE + '?demo#/settings');
  await page.click('a[href="#/export"]');
  await page.waitForSelector('#xl');
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
