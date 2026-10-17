// Browser test of CCC 360 in demo mode at phone size, with an axe accessibility check on each screen.
// Run from the repo root (no server needed: files are served from this checkout by route):
//   node 360/test/e2e.mjs            SHOTS=<dir> also saves phone screenshots
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
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const outside = [];
await ctx.route(/^https:\/\/apmes\.anawj\.com\//, async route => {
  const u = new URL(route.request().url());
  let rel = decodeURIComponent(u.pathname).replace(/^\//, '');
  if (!/^(360|evals|nuhsdesign)\//.test(rel)) return route.fulfill({ status: 404, body: 'not found' });
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(root, rel);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
  await route.fulfill({ status: 200, contentType: MIME[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(f) });
});
// nothing else may be reached: Firebase and Google are never touched in the demo
await ctx.route(/^https:\/\/(?!apmes\.anawj\.com|fonts\.)/, route => { outside.push(route.request().url()); route.abort(); });
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
const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('ccc-demo-store') || '{}'));
const setStore = fn => page.evaluate(src => { const d = JSON.parse(localStorage.getItem('ccc-demo-store') || '{}'); new Function('d', src)(d); localStorage.setItem('ccc-demo-store', JSON.stringify(d)); }, fn.toString().replace(/^[^{]*\{|\}\s*$/g, ''));

// 1. A resident opens the demo round
await page.goto(BASE + '360/?demo=reset');
await page.getByRole('heading', { name: 'CCC round (demo)' }).waitFor();
assert.equal(await page.locator('.e-list .e-row').count(), 2);
assert.match(await page.textContent('main'), /Only the programme coordinators and directors see this/);
await axe('home'); await shot('1-home');

// 2. Scholarly projects: add one, fill it, add lines; it is saved on the device as they type
await page.getByRole('button', { name: /Scholarly projects/ }).click();
await page.getByRole('heading', { name: 'Projects you are doing now' }).waitFor();
await page.getByRole('button', { name: 'Add a project' }).click();
await page.getByLabel('Title').fill('Audit of postoperative nausea');
await page.getByLabel('Supervisor').fill('Dr Demo Faculty');
await page.getByLabel('Status').selectOption('Completed');
await page.getByLabel('Started').fill('2026-03');
await page.getByLabel('Expected end or ended').fill('2026-09');
await page.getByLabel('Progress or notes').fill('Data collected; poster accepted.');
await page.getByLabel('Committee / admin work').fill('Quality committee, member\n\nResident forum, secretary');
await page.getByLabel('Conference presentations').fill('<img src=x onerror=window.__xss=1> Anaesthesia meeting, poster');
await page.getByText('Saved on this device. Not sent yet.').waitFor();
assert.equal(await page.locator('#cc-na').isDisabled(), true, 'the “none” box is off while a project exists');
assert.equal(await page.evaluate(() => window.__xss), undefined, 'typed text is never run as HTML');
await axe('projects'); await shot('2-projects');

// 3. Nominees: pick a senior from the faculty list; add an allied-health nominee without an email
await page.getByRole('button', { name: 'Next: feedback nominees' }).click();
await page.getByRole('heading', { name: 'Who should give you feedback?' }).waitFor();
await page.locator('[data-add=senior]').click();
await page.getByLabel('Senior doctor name').fill('hana');
await page.getByRole('button', { name: 'Dr Hana Lee' }).click();
assert.equal(await page.getByLabel('Senior doctor email').inputValue(), 'dr.hana.lee@example.com', 'the picker fills the email');
await page.locator('[data-add=allied]').click();
await page.getByLabel('Allied health name').fill('Nurse Example');
await page.locator('[data-add=peer]').click();
await page.getByLabel('Peer name').fill('Peer One');
await page.locator('[data-add=peer]').click();
await page.getByLabel('Peer name').nth(1).fill('Peer Two');
assert.equal(await page.locator('[data-add=peer]').isDisabled(), true, 'two peers at most');
await axe('nominees'); await shot('3-nominees');

// 4. Review: an allied-health nominee needs an email, so Send is off until it is added
await page.getByRole('button', { name: 'Review and send' }).click();
await page.getByRole('heading', { name: /Feedback nominees \(4\)/ }).waitFor();
assert.match(await page.textContent('main'), /Nurse Example: allied health nominees need an email/);
assert.equal(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled(), true);
await axe('review problems'); await shot('4-review-problems');
await page.getByRole('link', { name: 'Fix' }).first().click();
await page.getByLabel('Allied health email').fill('nurse.example@example.com');
await page.getByRole('button', { name: 'Review and send' }).click();
await page.getByRole('heading', { name: /Feedback nominees \(4\)/ }).waitFor();
assert.equal(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled(), false);
assert.match(await page.textContent('main'), /Audit of postoperative nausea/);
assert.match(await page.textContent('main'), /Quality committee, member; Resident forum, secretary/, 'blank lines are dropped');
await axe('review'); await shot('5-review');

// 5. Send: stored, and home says so
await page.getByRole('button', { name: 'Send', exact: true }).click();
await page.getByText(/^Sent on /).waitFor();
let st = await store();
const key = 'demo|resident@example.com';
assert.equal(st.entries[key].projects[0].title, 'Audit of postoperative nausea');
assert.equal(st.entries[key].projects[0].status, 'Completed');
assert.equal(st.msf[key].nominees.length, 4);
assert.deepEqual(st.msf[key].nominees.map(n => n.group).sort(), ['allied', 'peer', 'peer', 'senior']);
assert.equal(st.msf[key].nominees.find(n => n.group === 'senior').fac, 'dr.hana.lee@example.com');
assert.equal(await page.evaluate(() => localStorage.getItem('ccc-demo-draft-demo-resident@example.com')), null, 'the device draft is cleared once sent');
await shot('6-sent');

// 6. It is all still there after a reload; change something and the page says it is not sent yet
await page.reload();
await page.getByText(/^Sent on /).waitFor();
await page.getByRole('button', { name: /Scholarly projects/ }).click();
assert.equal(await page.getByLabel('Title').inputValue(), 'Audit of postoperative nausea');
await page.getByLabel('Title').fill('Audit of postoperative nausea and vomiting');
await page.getByText('Saved on this device. Not sent yet.').waitFor();
await page.getByRole('button', { name: 'Back', exact: true }).click();
await page.getByText('You have changes that are not sent yet.').waitFor();
await page.getByRole('button', { name: 'Review and send again' }).click();
await page.getByRole('button', { name: 'Send again' }).click();
await page.getByText(/^Sent on /).waitFor();
st = await store();
assert.equal(st.entries[key].projects[0].title, 'Audit of postoperative nausea and vomiting');

// 7. Nothing to report: the box needs no projects, and a new round carries last round's projects but not its nominees
await setStore(() => { d.rounds.demo.status = 'closed'; d.rounds.demo.updatedAt = 1; d.rounds.next = { round: 'next', title: 'Next CCC round', status: 'open', deadline: '', updatedAt: Date.now() }; });
await page.reload();
await page.getByRole('heading', { name: 'Next CCC round' }).waitFor();
assert.match(await page.textContent('main'), /carried over from “CCC round \(demo\)”/);
await page.getByRole('button', { name: /Scholarly projects/ }).click();
assert.equal(await page.getByLabel('Title').inputValue(), 'Audit of postoperative nausea and vomiting', 'projects carry over');
await page.getByRole('button', { name: 'Back', exact: true }).click();
await page.getByText(/0 senior doctors · 0 peers/).waitFor();   // nominees start empty

// 8. A closed round can be read but not changed
await setStore(() => { d.rounds.next.status = 'closed'; d.rounds.next.updatedAt = 1; d.rounds.demo.updatedAt = 2; });
await page.reload();
await page.getByText(/This round is closed/).waitFor();
assert.equal(await page.getByRole('button', { name: /Review and send/ }).count(), 0);
await page.getByRole('button', { name: /Feedback nominees/ }).click();
assert.equal(await page.getByRole('button', { name: /^Add / }).count(), 0, 'no add buttons on a closed round');
assert.equal(await page.getByLabel('Senior doctor name').isDisabled(), true);
await axe('closed');

// 9. Staff are not residents: they see the coordinators' placeholder, not the resident form
await page.goto(BASE + '360/?demo=admin');
await page.getByText('The coordinators’ view is coming').waitFor();
assert.equal(await page.locator('.e-list .e-row').count(), 0);
await axe('staff');

assert.deepEqual(outside, [], 'the demo reaches nothing outside the site');
assert.deepEqual(errors, [], 'no console errors');
await b.close();
console.log('ccc 360 e2e: all checks passed');
