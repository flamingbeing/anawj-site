// Browser test of Selection 360 in demo mode at phone size, with an axe accessibility check on each screen.
// Run from the repo root (no server needed: files are served from this checkout by route):
//   node selection/test/e2e.mjs            SHOTS=<dir> also saves phone screenshots
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const AXE = new URL('../../tools/vendor/axe.min.js', import.meta.url).pathname;
const root = new URL('../../', import.meta.url).pathname;
const BASE = 'https://apmes.anawj.com/';
const SHOTS = process.env.SHOTS;
const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', json: 'application/json', png: 'image/png', webmanifest: 'application/manifest+json', md: 'text/markdown' };

const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') && !fs.statSync('/opt/pw-browsers/chromium').isDirectory() ? '/opt/pw-browsers/chromium' : null);
const b = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', acceptDownloads: true });
const posted = [];
await ctx.route(/^https:\/\/apmes\.anawj\.com\//, async route => {
  const u = new URL(route.request().url());
  let rel = decodeURIComponent(u.pathname).replace(/^\//, '').replace(/^360\//, 'selection/');
  if (!/^(selection|people|evals|logbook|nuhsdesign)\//.test(rel)) return route.fulfill({ status: 404, body: 'not found' });
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(root, rel);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
  await route.fulfill({ status: 200, contentType: MIME[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(f) });
});
// the Google Form: never reached; a send to it is recorded here
await ctx.route(/^https:\/\/docs\.google\.com\//, route => { posted.push({ url: route.request().url(), body: route.request().postData() }); route.fulfill({ status: 200, body: '' }); });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });

const axe = async (label, pg = page) => {
  if (!fs.existsSync(AXE)) return;
  if (!(await pg.evaluate(() => !!window.axe))) await pg.addScriptTag({ path: AXE });
  await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }));
  const bad = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  assert.equal(bad.length, 0, `axe (${label}): ` + bad.map(v => v.id + ' ' + v.nodes[0]?.target).join('; '));
};
const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); } };

// 1. A resident opens the demo round
await page.goto(BASE + '360/?demo=reset');
await page.getByRole('button', { name: /Alex Demo/ }).waitFor();
assert.equal(await page.locator('.e-list .e-row').count(), 6);
assert.match(await page.textContent('main'), /Confidential/);
await axe('home'); await shot('1-home');

// 2. Score and comment on the first applicant; it is saved as they go
await page.getByRole('button', { name: /Alex Demo/ }).click();
await page.getByText('Applicant 1 of 6').waitFor();
await page.getByRole('radio', { name: /4\s*Good/ }).check({ force: true });
await page.fill('#sl-comment', 'Calm during a difficult airway; asked for help early.');
await page.getByText('Saved on this device').waitFor();
await axe('applicant'); await shot('2-applicant');
await page.waitForTimeout(450);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sel-demo-ans-demo-resident@example.com')));
assert.equal(saved.a.a1.score, 4);
assert.match(saved.a.a1.comment, /difficult airway/);

// 3. Next applicant: "haven't worked with them" turns the inputs off
await page.getByRole('button', { name: /Bao ›/ }).click();
await page.getByText('Applicant 2 of 6').waitFor();
await page.getByLabel('I haven’t worked with this applicant').check();
assert.ok(await page.locator('#sl-comment').isDisabled());
assert.ok(await page.getByRole('radio', { name: /5\s*Best fit/ }).isDisabled());

// 4. A score with no comment is flagged on the review screen, but doesn't block sending
await page.getByRole('button', { name: /Casey ›/ }).click();
await page.getByRole('radio', { name: /2\s*Below par/ }).check({ force: true });
await page.goBack(); await page.goBack(); await page.goBack();
await page.goto(BASE + '360/?demo#review');
await page.getByText('Worth a second look').waitFor();
assert.match(await page.textContent('main'), /Casey Example.*has a score but no comment/);
assert.match(await page.textContent('main'), /1 scored with a comment/);
await axe('review'); await shot('3-review');

// 5. Send (the demo keeps it on the device and posts nothing)
await page.getByRole('button', { name: 'Send', exact: true }).click();
await page.getByText('Sent. Thank you.').waitFor();
assert.equal(posted.length, 0, 'the demo never posts to the form');
await axe('done'); await shot('4-done');
await page.goto(BASE + '360/?demo#');
await page.getByText(/· sent/).waitFor();

// 6. The admin sees the result and can download it
await page.getByRole('button', { name: 'Account' }).click();
await page.locator('dialog[open] select').selectOption('admin');
await page.waitForLoadState('load');
await page.getByRole('tab', { name: 'Results' }).waitFor();
await page.getByRole('tab', { name: 'Results' }).click();
await page.getByText(/1 response was sent/).waitFor();
await axe('results'); await shot('5-results');
const dl = page.waitForEvent('download');
await page.getByRole('button', { name: 'Download CSV' }).click();
const csv = fs.readFileSync(await (await dl).path(), 'utf8');
assert.match(csv, /Alex Demo,Demo Resident/);
assert.match(csv, /difficult airway/);

// 7. Setup: paste names, make the private link, and open it as someone else
await page.getByRole('tab', { name: 'Set up' }).click();
await page.fill('#su-names', '1. Zoë Tan\n2. Lee Wei\nZoë Tan');
await page.fill('#su-title', 'Test round');
await page.getByRole('button', { name: 'Make the private link' }).click();
const link = await page.locator('textarea[aria-label="Private link"]').inputValue();
assert.match(link, /360\/#r=/);
await axe('setup'); await shot('6-setup');
const other = await ctx.newPage();
other.on('pageerror', e => errors.push(String(e)));
await other.goto(link.replace(/^[^#]*360\//, BASE + '360/?demo=resident') );
await other.getByRole('button', { name: /Zoë Tan/ }).waitFor();
assert.equal(await other.locator('.e-list .e-row').count(), 2, 'repeated names are dropped');
assert.match(await other.textContent('main'), /Test round/);
await other.close();

assert.deepEqual(errors, []);
await b.close();
console.log('selection e2e: passed');
