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
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', acceptDownloads: true });
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
await page.locator('main h2', { hasText: 'CCC round (demo)' }).waitFor();
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
await page.getByLabel('Peer name').fill('aiden');
await page.getByRole('button', { name: 'Aiden Tan' }).click();
assert.equal(await page.getByLabel('Peer email').inputValue(), 'aiden.tan@example.com', 'the peer picker fills the email from the resident list');
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
await page.locator('main h2', { hasText: 'Next CCC round' }).waitFor();
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

// 9. Coordinators: a fresh demo round with two residents who have sent and five who have not
await page.evaluate(() => localStorage.removeItem('ccc-demo-store'));
await page.goto(BASE + '360/?demo=admin');
await page.getByRole('heading', { name: 'Rounds' }).waitFor();
assert.equal(await page.locator('.e-list .e-row').count(), 1);
await axe('rounds'); await shot('7-staff-rounds');
await page.getByRole('button', { name: /CCC round \(demo\)/ }).click();
await page.getByText('2 of 7 active residents have sent · 4 nominees · 4 to check').waitFor();
await axe('round'); await shot('8-staff-round');
await page.getByRole('button', { name: 'Not sent', exact: true }).click();
assert.equal(await page.locator('.e-list .e-row').count(), 5);
assert.match(await page.textContent('main'), /Chandra Rao/);
assert.doesNotMatch(await page.textContent('main'), /Aiden Tan/);
await page.getByRole('button', { name: 'Everyone', exact: true }).click();

// 10. One resident: read the projects, mark a nominee, open the email link (which marks it emailed)
await page.getByRole('button', { name: /Aiden Tan/ }).click();
await page.getByRole('heading', { name: 'Scholarly projects' }).waitFor();
assert.match(await page.textContent('main'), /Audit of ward handover/);
assert.match(await page.textContent('main'), /Intubation workshop/);
await page.getByRole('group', { name: 'Status for Dr Hana Lee' }).getByRole('button', { name: 'Checked' }).click();
await page.getByRole('group', { name: 'Status for Dr Hana Lee' }).getByRole('button', { name: 'Checked' }).and(page.locator('[aria-pressed=true]')).waitFor();
const link = page.getByRole('link', { name: 'Email Bea Lim' });
assert.match(await link.getAttribute('href'), /^mailto:bea\.lim%40example\.com\?subject=Multisource%20feedback%20for%20Aiden%20Tan/);
await link.evaluate(a => a.addEventListener('click', e => e.preventDefault()));   // the test has no mail app
await link.click();
await page.getByRole('group', { name: 'Status for Bea Lim' }).waitFor();
await page.waitForFunction(() => /"bea\.lim@example\.com"[^}]*"sent"|"sent"/.test(localStorage.getItem('ccc-demo-store') || ''));
st = await store();
const marks = Object.values(st.review).find(r => r.email === 'aiden.tan@example.com').marks;
assert.deepEqual(Object.values(marks).sort(), ['ok', 'sent'], 'one checked, one emailed');
await axe('resident detail'); await shot('9-staff-resident');
await page.reload();
await page.getByRole('heading', { name: 'Scholarly projects' }).waitFor();
assert.equal(await page.getByRole('group', { name: 'Status for Dr Hana Lee' }).getByRole('button', { name: 'Checked' }).getAttribute('aria-pressed'), 'true', 'marks are kept');

// 11. Hostile text from a resident is shown as text and made safe in the CSV
await setStore(() => { const k = 'demo|aiden.tan@example.com'; d.msf[k].nominees.push({ id: 'evil', group: 'other', name: '=HYPERLINK("http://x")', email: 'evil@example.com' }, { id: 'evil2', group: 'other', name: '<img src=x onerror=window.__x2=1>', email: 'evil2@example.com' }); });
await page.reload();
await page.getByText('<img src=x onerror=window.__x2=1>').waitFor();
assert.equal(await page.evaluate(() => window.__x2), undefined, 'nominee text is never run as HTML');
await page.getByRole('button', { name: 'Back', exact: true }).click();
await page.locator('main h2', { hasText: 'CCC round (demo)' }).waitFor();
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Nominees (CSV)' }).click()]);
const csv = fs.readFileSync(await dl.path(), 'utf8');
assert.match(csv, /^Round,Resident,Resident email,Group,Nominee,Nominee email,Status\r\n/);
assert.match(csv, /Dr Hana Lee,dr\.hana\.lee@example\.com,Checked/);
assert.match(csv, /"'=HYPERLINK\(""http:\/\/x""\)"/, 'a nominee cannot inject a formula');
assert.equal(dl.suggestedFilename(), 'ccc-nominees-demo.csv');
const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Projects (CSV)' }).click()]);
assert.match(fs.readFileSync(await dl2.path(), 'utf8'), /Scholarly project,Audit of ward handover,Dr Hana Lee,Ongoing,2026-02/);

// 12. Close the round (residents are locked out of editing), reopen it, edit it
await page.getByRole('button', { name: 'Close the round' }).click();
await page.getByRole('button', { name: 'Close the round' }).last().click();
await page.getByText(/Nominees' contact details are deleted on /).waitFor();
assert.equal((await store()).rounds.demo.status, 'closed');
assert.ok((await store()).rounds.demo.closedAt > 0);
await page.getByRole('button', { name: 'Reopen' }).click();
await page.getByText(/deleted a year after you close the round/).waitFor();
assert.equal((await store()).rounds.demo.closedAt, undefined, 'reopening clears the close time');
await page.getByRole('button', { name: 'Edit', exact: true }).click();
await page.getByLabel('Name').fill('CCC round, renamed');
await page.getByRole('button', { name: 'Save' }).click();
await page.locator('main h2', { hasText: 'CCC round, renamed' }).waitFor();

// 13. Open a new round
await page.getByRole('button', { name: 'Back', exact: true }).click();
await page.getByRole('button', { name: 'Open a new round' }).click();
await page.getByLabel('Name').fill('CCC round, next');
await page.getByRole('button', { name: 'Open the round' }).click();
await page.locator('main h2', { hasText: 'CCC round, next' }).waitFor();
st = await store();
assert.equal(Object.keys(st.rounds).length, 2);
assert.match(Object.keys(st.rounds).find(k => k !== 'demo'), /^r\d{4}-\d{2}/);

// 14. Delete one resident's nominees, then the rest of a round's
await page.getByRole('button', { name: 'Back', exact: true }).click();
await page.getByRole('button', { name: /CCC round, renamed/ }).click();
await page.getByRole('button', { name: /Bea Lim/ }).click();
await page.getByRole('button', { name: 'Delete these nominees now' }).click();
await page.getByRole('button', { name: 'Delete', exact: true }).click();
await page.locator('main h2', { hasText: 'CCC round, renamed' }).waitFor();
st = await store();
assert.equal(st.msf['demo|bea.lim@example.com'], undefined);
assert.ok(st.entries['demo|bea.lim@example.com'], 'projects are kept');
await page.getByRole('button', { name: 'Delete nominees now' }).click();
await page.getByRole('button', { name: 'Delete', exact: true }).click();
await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('ccc-demo-store')).msf).length === 0);

// 15. The one-year clean-up: a round closed 366 days ago loses its nominees when staff open the app; projects stay
await page.evaluate(() => localStorage.removeItem('ccc-demo-store'));
await page.goto(BASE + '360/?demo=admin');
await page.getByRole('heading', { name: 'Rounds' }).waitFor();
await setStore(() => { d.rounds.demo.status = 'closed'; d.rounds.demo.closedAt = Date.now() - 366 * 86400000; });
await page.reload();
await page.getByText(/Deleted 2 nominee lists from rounds closed more than a year ago/).waitFor();
st = await store();
assert.deepEqual(Object.keys(st.msf), [], 'old nominees are gone');
assert.equal(Object.keys(st.entries).length, 2, 'projects are kept');
await page.evaluate(() => localStorage.removeItem('ccc-demo-store'));
await page.goto(BASE + '360/?demo=admin');
await setStore(() => { d.rounds.demo.status = 'closed'; d.rounds.demo.closedAt = Date.now() - 364 * 86400000; });
await page.reload();
await page.getByRole('heading', { name: 'Rounds' }).waitFor();
assert.equal(Object.keys((await store()).msf).length, 2, 'a round closed 364 days ago keeps its nominees');

// 16. A resident does not see the coordinators' view, even by typing the address
await page.evaluate(() => localStorage.removeItem('ccc-demo-store'));
await page.goto(BASE + '360/?demo');
await page.locator('main h2', { hasText: 'CCC round (demo)' }).waitFor();
assert.equal(await page.getByRole('link', { name: /Coordinators/ }).count(), 0);
await page.goto(BASE + '360/?demo#staff');
await page.locator('main h2', { hasText: 'CCC round (demo)' }).waitFor();
assert.equal(await page.getByRole('heading', { name: 'Rounds' }).count(), 0);

assert.deepEqual(outside, [], 'the demo reaches nothing outside the site');
assert.deepEqual(errors, [], 'no console errors');
await b.close();
console.log('ccc 360 e2e: all checks passed');
