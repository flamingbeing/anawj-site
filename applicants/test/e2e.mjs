// Browser test of Applicants in demo mode at phone size, with an axe accessibility check on each screen.
// Run from the repo root (no server needed: files are served from this checkout by route):
//   node applicants/test/e2e.mjs            SHOTS=<dir> also saves phone screenshots
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
  let rel = decodeURIComponent(u.pathname).replace(/^\//, '');
  if (!/^(applicants|people|evals|logbook|nuhsdesign)\//.test(rel)) return route.fulfill({ status: 404, body: 'not found' });
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
await page.goto(BASE + 'applicants/?demo=reset');
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
await page.getByText('Applicant 3 of 6').waitFor();
await page.getByRole('radio', { name: /2\s*Below par/ }).check({ force: true });
await page.goBack(); await page.goBack(); await page.goBack();
await page.goto(BASE + 'applicants/?demo#review');
await page.getByText('Worth a second look').waitFor();
assert.match(await page.textContent('main'), /Casey Example.*has a score but no comment/);
assert.match(await page.textContent('main'), /1 scored with a comment/);
await axe('review'); await shot('3-review');

// 5. Send (the demo keeps it on the device and posts nothing)
await page.getByRole('button', { name: 'Send', exact: true }).click();
await page.getByText('Sent. Thank you.').waitFor();
assert.equal(posted.length, 0, 'the demo never posts to the form');
await axe('done'); await shot('4-done');
await page.goto(BASE + 'applicants/?demo#');
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
await page.getByRole('button', { name: 'Make a private link' }).click();
const link = await page.locator('textarea[aria-label="Private link"]').inputValue();
assert.match(link, /applicants\/#r=/);
await axe('setup'); await shot('6-setup');
const other = await ctx.newPage();
other.on('pageerror', e => errors.push(String(e)));
await other.goto(link.replace(/^[^#]*applicants\//, BASE + 'applicants/?demo=resident') );
await other.getByRole('button', { name: /Zoë Tan/ }).waitFor();
assert.equal(await other.locator('.e-list .e-row').count(), 2, 'repeated names are dropped');
assert.match(await other.textContent('main'), /Test round/);
await other.close();

// 8. The shared store: an admin publishes the round and adds a committee member; a resident answers; the PD reads it
await page.goto(BASE + 'applicants/?demo=admin#setup');
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('sel-demo')) localStorage.removeItem(k); });
await page.reload();
await page.fill('#su-names', 'Pat One\nPat Two');
await page.fill('#su-title', 'Shared round');
await page.fill('#su-cycle', '2027');
await page.getByRole('button', { name: 'Publish to everyone' }).click();
await page.locator('dialog[open]').getByRole('button', { name: 'Publish' }).click();
await page.getByText('Published (open)').waitFor();
await page.fill('#cm-email', 'cm@example.com'); await page.fill('#cm-name', 'Cm Member');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.getByText('Cm Member').waitFor();
await axe('setup shared'); await shot('7-setup-shared');
await page.goto(BASE + 'applicants/?demo=resident#');
await page.getByRole('button', { name: /Pat One/ }).waitFor();
assert.match(await page.textContent('main'), /Shared round/);
assert.equal(await page.getByRole('tab', { name: 'Results' }).count(), 0, 'a resident has no Results tab');
await page.getByRole('button', { name: /Pat One/ }).click();
await page.getByRole('radio', { name: /5\s*Best fit/ }).check({ force: true });
await page.fill('#sl-comment', 'Led the handover well.');
await page.waitForTimeout(450);
await page.goto(BASE + 'applicants/?demo=resident#review');
await page.getByText(/Nobody else can read them/).waitFor();
await page.getByRole('button', { name: 'Send', exact: true }).click();
await page.getByText('Sent. Thank you.').waitFor();
await page.goto(BASE + 'applicants/?demo=resident#results');
assert.equal(await page.getByText('Mean').count(), 0, 'a resident cannot open Results');
await page.goto(BASE + 'applicants/?demo=admin#results');
await page.getByText(/Shared round \(open\): 1 response/).waitFor();
assert.match(await page.textContent('main'), /Led the handover well\..*Demo Resident/);
await axe('results shared'); await shot('8-results-shared');
// close it: the resident can no longer send
await page.goto(BASE + 'applicants/?demo=admin#setup');
await page.getByRole('button', { name: 'Close the round' }).click();
await page.getByText('Published (closed)').waitFor();
await page.goto(BASE + 'applicants/?demo=resident#review');
await page.getByText(/round is closed/).first().waitFor();
assert.ok(await page.getByRole('button', { name: /^Send/ }).isDisabled());

assert.deepEqual(errors, []);
await b.close();
console.log('applicants e2e: passed');
