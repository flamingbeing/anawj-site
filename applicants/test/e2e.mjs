// Browser test of Applicants in demo mode at phone size, with an axe accessibility check on each screen.
// Run from the repo root (no server needed: files are served from this checkout by route):
//   node applicants/test/e2e.mjs            SHOTS=<dir> also saves phone screenshots
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AXE = fileURLToPath(new URL('../../tools/vendor/axe.min.js', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
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

// 1. A resident opens the demo: eight made-up applicants with passport-style photos
await page.goto(BASE + 'applicants/?demo=reset');
await page.getByRole('button', { name: /Alex Demo/ }).waitFor();
assert.equal(await page.locator('.sl-grid .sl-tile').count(), 8);
assert.equal(await page.locator('.sl-grid img.sl-photo').count(), 8, 'every applicant has a photo');
assert.match(await page.textContent('main'), /Confidential/);
await axe('home'); await shot('1-home');

// 2. Start goes straight to the first applicant; one tap scores, a comment is optional
await page.getByRole('button', { name: 'Start' }).click();
await page.getByText(/1 of 8/).waitFor();
assert.equal(await page.locator('img.sl-photo--lg').count(), 1);
await page.getByRole('radio', { name: '4' }).check({ force: true });
await page.fill('#q-comment', 'Calm during a difficult airway; asked for help early.');
assert.equal(await page.locator('textarea.sl-ta').count(), 1);
await page.waitForTimeout(450);
await axe('applicant'); await shot('2-applicant');
const KEY = 'sel-demo-ans-demo-resident@example.com';
let saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
assert.equal(saved.a.a1.score, 4);
assert.match(saved.a.a1.comment, /difficult airway/);

// 3. "I haven't worked with them" is one tap and moves on by itself
await page.getByRole('button', { name: 'Next ›' }).click();
await page.getByText(/2 of 8/).waitFor();
await page.getByRole('button', { name: 'I haven’t worked with them' }).click();
await page.getByText(/3 of 8/).waitFor();
saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
assert.equal(saved.a.a2.na, true);

// 4. A score alone completes someone: a comment is never needed
await page.getByRole('radio', { name: '3' }).check({ force: true });
await page.waitForTimeout(100);
await page.getByRole('button', { name: 'Next ›' }).click();
await page.getByText(/4 of 8/).waitFor();
// going back to a skipped applicant shows it as skipped and can be undone
await page.goto(BASE + 'applicants/?demo#a/a2');
await page.getByText(/Skipped: nothing more to answer/).waitFor();
await page.getByRole('button', { name: /Haven’t worked with them ✓/ }).click();
await page.getByRole('radio', { name: '5' }).waitFor();
await page.getByRole('button', { name: 'I haven’t worked with them' }).click();   // skip again
await page.getByText(/3 of 8/).waitFor();

// 5. Review: only people who still need an answer are flagged (not the score without a comment), then one tap sends
await page.goto(BASE + 'applicants/?demo#review');
await page.getByText('Worth a look (you can still send):').waitFor();
const review = await page.textContent('main');
assert.match(review, /3 of 8 answered/);
assert.doesNotMatch(review, /Casey Example[^.]*no comment/);
assert.match(review, /Dani Placeholder not answered yet/);
await axe('review'); await shot('3-review');
await page.getByRole('button', { name: 'Send', exact: true }).click();
await page.getByText('Sent. Thank you.').waitFor();
assert.equal(posted.length, 0, 'the demo never posts to the form');
await axe('done'); await shot('4-done');
await page.goto(BASE + 'applicants/?demo#');
await page.getByText(/· sent/).waitFor();

// 6. The admin reads the results (four made-up respondents and the resident): means, comments with names, CSV
await page.getByRole('button', { name: 'Account' }).click();
await page.locator('dialog[open] select').selectOption('admin');
await page.waitForLoadState('load');
await page.getByRole('tab', { name: 'Results' }).waitFor();
await page.getByRole('tab', { name: 'Results' }).click();
await page.getByText(/5 responses/).waitFor();
assert.match(await page.textContent('main'), /4\.5 \(4\)/, 'Alex Demo: 5, 4, 5 and 4');
assert.match(await page.textContent("main"), /Calm during a difficult airway[\s\S]*Demo Resident/);
await axe('results'); await shot('5-results');
const dl = page.waitForEvent('download');
await page.getByRole('button', { name: 'Download CSV' }).click();
const csv = fs.readFileSync(await (await dl).path(), 'utf8');
assert.match(csv, /Alex Demo,Demo Resident,[^,]+,Overall suitability for residency,4/);
assert.match(csv, /Casey Example,Demo Resident,[^,]+,\(did not work with them\)|Bao Sample,Demo Resident,[^,]+,\(did not work with them\),yes/);

// 7. Set up: photos from a file, photos by file name, and editing the questions
await page.getByRole('tab', { name: 'Set up' }).click();
// the page opens locked: fields and buttons are disabled, so nothing changes by accident; Show on the passcodes still works
await page.getByText(/Locked: nothing here can change/).waitFor();
assert.ok(await page.locator('#su-title').isDisabled(), 'the title is locked');
assert.ok(await page.getByRole('button', { name: 'Save changes' }).isDisabled(), 'Save is locked');
assert.ok(await page.locator('#pc-change-guest').isDisabled(), 'Change passcode is locked');
assert.ok(await page.locator('#pc-show').isEnabled(), 'Show stays available');
await axe('setup locked'); await shot('5-setup-locked');
await page.getByRole('button', { name: 'Unlock to edit' }).click();
await page.getByText(/Unlocked\./).waitFor();
assert.ok(await page.locator('#su-title').isEnabled(), 'unlocked');
const png = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 500; const x = c.getContext('2d'); x.fillStyle = '#3a8'; x.fillRect(0, 0, 600, 500); x.fillStyle = '#fc9'; x.beginPath(); x.arc(300, 200, 90, 0, 7); x.fill(); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Change photo for Alex Demo' }).click()]);
await chooser.setFiles({ name: 'whatever.png', mimeType: 'image/png', buffer: png });
await page.getByText(/1 photo added/).waitFor();
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sel-demo-store')).photos['demo|a1']);
assert.match(stored, /^data:image\/jpeg;base64,/);
const dim = await page.evaluate(src => new Promise(r => { const i = new Image(); i.onload = () => r([i.width, i.height]); i.src = src; }), stored);
assert.deepEqual(dim, [210, 270], 'cropped to a passport-shaped 7:9 picture');
assert.ok(stored.length < 40000, 'a few KB');
await page.setInputFiles('#ph-many', [{ name: 'Bao-Sample.png', mimeType: 'image/png', buffer: png }, { name: 'IMG_0001.png', mimeType: 'image/png', buffer: png }]);
await page.getByText(/1 photo added\. Not used: IMG_0001\.png/).waitFor();
await page.fill('input[aria-label="Question 1: words for 1"]', 'Not suitable');
await page.getByRole('button', { name: 'Add a question' }).click();
await page.fill('input[aria-label="Question 3 text"]', 'Teamwork on the ward');
await page.selectOption('select[aria-label="Question 3 type"]', 'scale');
await page.fill('input[aria-label="Question 3: words for 1"]', 'Poor');
await page.fill('input[aria-label="Question 3: words for 5"]', 'Great');
await page.getByRole('button', { name: 'Remove question 2' }).click();   // drop the comment box
await axe('setup shared'); await shot('6-setup-shared');
await page.getByRole('button', { name: 'Save changes' }).click();
await page.getByText('Saved and published').waitFor();
await page.getByText(/Locked: nothing here can change/).waitFor();   // saving the round locks the page again
assert.ok(await page.locator('#su-title').isDisabled());
await page.goto(BASE + 'applicants/?demo=resident#a/a1');
await page.getByText('Teamwork on the ward').waitFor();
assert.equal(await page.locator('textarea.sl-ta').count(), 0, 'the comment box was removed');
assert.match(await page.textContent('.sl-ends'), /1 Not suitable/);
await page.getByRole('radio', { name: '5' }).last().check({ force: true });
await axe('custom questions'); await shot('7-custom-questions');

// 8. Close the round: nothing more can be sent
await page.goto(BASE + 'applicants/?demo=admin#setup');
await page.getByRole('button', { name: 'Unlock to edit' }).click();
await page.getByRole('button', { name: 'Close the round' }).click();
await page.getByText('Saved and published').or(page.getByText('Closed')).first().waitFor();
await page.goto(BASE + 'applicants/?demo=resident#review');
await page.getByText(/round is closed/).first().waitFor();
assert.ok(await page.getByRole('button', { name: /^Send/ }).isDisabled());

// 8b. Passcodes: admin staff and PDs see and change them on Set up; a role not set here says the Cloudflare one is in use
await page.goto(BASE + 'applicants/?demo=admin#setup');
await page.locator('#pc-show').waitFor();
assert.match(await page.textContent('main'), /Not set here yet: the one saved in Cloudflare is in use/);
await page.getByRole('button', { name: 'Unlock to edit' }).click();
await page.locator('#pc-change-guest').click();
const suggested = await page.inputValue('#pc-guest');
assert.match(suggested, /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/, 'a random passcode is suggested');
await page.fill('#pc-guest', 'abc');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByText('Use at least 6 characters.').waitFor();
await page.fill('#pc-guest', 'Maple Tree 42');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByRole('button', { name: 'Change', exact: true }).last().click();   // the confirmation dialog
await page.getByText('Guest passcode changed').waitFor();
assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('sel-demo-store')).codes.guest)), 'Maple Tree 42');
assert.match(await page.textContent('[data-role="guest"]'), /Maple Tree 42/, 'shown after saving');
await page.locator('#pc-show').click();
assert.doesNotMatch(await page.textContent('[data-role="guest"]'), /Maple/, 'Hide masks it again');
await page.locator('#pc-show').click();
// the committee passcode can't repeat the guest one (the Worker would pick the first match)
await page.locator('#pc-change-committee').click();
await page.fill('#pc-committee', ' maple tree 42 ');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByText(/already the guest passcode/).waitFor();
await axe('setup passcodes'); await shot('5b-passcodes');
// a resident never sees the card
await page.goto(BASE + 'applicants/?demo=resident');
await page.getByRole('button', { name: /Alex Demo/ }).waitFor();
assert.equal(await page.getByRole('tab', { name: 'Set up' }).count(), 0);

// 9. A round that isn't published (a private link): names with a repeat, opened as someone else
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('sel-demo')) localStorage.removeItem(k); localStorage.setItem('sel-demo-store', JSON.stringify({ seeded: true })); });
await page.goto(BASE + 'applicants/?demo=admin#setup');
await page.getByRole('button', { name: 'Unlock to edit' }).click();
await page.fill('#su-names', '1. Zoë Tan\n2. Lee Wei\nZoë Tan');
await page.fill('#su-title', 'Test round');
await page.getByRole('button', { name: 'Make a private link' }).click();
const link = await page.locator('textarea[aria-label="Private link"]').inputValue();
assert.match(link, /applicants\/#r=/);
const other = await ctx.newPage();
other.on('pageerror', e => errors.push(String(e)));
await other.goto(link.replace(/^[^#]*applicants\//, BASE + 'applicants/?demo=resident'));
await other.getByRole('button', { name: /Zoë Tan/ }).waitFor();
assert.equal(await other.locator('.sl-grid .sl-tile').count(), 2, 'repeated names are dropped');
assert.match(await other.textContent('main'), /Test round/);
assert.equal(await other.locator('img.sl-photo').count(), 0, 'no photos without a published round');
await other.close();

assert.deepEqual(errors, []);
await b.close();
console.log('applicants e2e: passed');
