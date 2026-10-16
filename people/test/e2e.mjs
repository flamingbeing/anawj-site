// Browser test of the People app in demo mode at phone size, with an axe accessibility check on each screen.
// Run from the repo root (no server needed: files are served from this checkout by route):
//   node people/test/e2e.mjs            SHOTS=<dir> also saves phone screenshots
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
// apmes.anawj.com as the Worker maps it (worker/routes.js): /people/, /evals/, /logbook/ and the shared design files
await ctx.route(/^https:\/\/apmes\.anawj\.com\//, async route => {
  const u = new URL(route.request().url());
  let rel = decodeURIComponent(u.pathname).replace(/^\//, '');
  if (!/^(people|evals|logbook|nuhsdesign|feedback|apmes\/guidebook)\//.test(rel)) return route.fulfill({ status: 404, body: 'not found' });
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(root, rel);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
  await route.fulfill({ status: 200, contentType: MIME[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(f) });
});
// nuhjuniormonthly.anawj.com as the Worker maps it: the app's folder at its root, plus the shared design files
await ctx.route(/^https:\/\/nuhjuniormonthly\.anawj\.com\//, async route => {
  let rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
  if (!/^nuhsdesign\//.test(rel)) rel = 'nuh-junior-monthly/' + rel;
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(root, rel);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
  await route.fulfill({ status: 200, contentType: MIME[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(f) });
});
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });

const axe = async label => {
  if (!fs.existsSync(AXE)) return;
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  await page.waitForTimeout(300);   // let a toast finish fading in (0.2 s): half-faded text reads as low contrast
  const r = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }));
  const bad = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  assert.equal(bad.length, 0, `axe (${label}): ` + bad.map(v => v.id + ' ' + v.nodes[0]?.target).join('; '));
};
const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); } };

// 1. Residents (the demo opens as the admin)
await page.goto(BASE + 'people/?demo=reset');
await page.getByRole('link', { name: 'Add a new intake' }).waitFor();
assert.match(await page.textContent('main'), /logbook.*evals/);
await axe('residents'); await shot('1-residents');

// 2. A new intake: two new people and one already listed
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('apmes-evals-demo-v1') || '{}').residents || {});
const existing = Object.values(before)[0];
assert.ok(existing, 'the demo has residents');
await page.getByRole('link', { name: 'Add a new intake' }).click();
await page.locator('#p-paste').waitFor();
await page.fill('#p-intake', '2026');
await page.fill('#p-paste', `Name, Email\nQuinn Newintake, quinn.newintake@example.com\nRory Newintake <rory.newintake@example.com>\nAgain, ${existing.email}`);
await page.getByText('Already on the resident list, skipped').waitFor();
await axe('intake'); await shot('2-intake');
await page.getByRole('button', { name: 'Add 2 to intake 2026' }).click();
await page.locator('dialog[open]').getByRole('button', { name: 'Add' }).click();
await page.getByRole('link', { name: 'Add a new intake' }).waitFor();
await page.getByText('Quinn Newintake').waitFor();
const added = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('apmes-evals-demo-v1')).residents)
  .filter(r => /newintake/.test(r.email)));
assert.equal(added.length, 2);
assert.ok(added.every(r => r.intake === 2026 && r.status === 'ACTIVE' && r.rYear == null), JSON.stringify(added));

// 3. The same list in evals (one list for both apps)
const ev = await ctx.newPage();
await ev.goto(BASE + 'evals/?demo=admin#people/residents');
await ev.getByText('Quinn Newintake').waitFor();
await ev.close();

// 4. Year check: give someone a set year with no intake, then fix it from the check
await page.evaluate(() => {
  const k = 'apmes-evals-demo-v1';
  const s = JSON.parse(localStorage.getItem(k));
  const r = Object.values(s.residents).find(x => /quinn/.test(x.email));
  r.intake = null; r.rYear = 2; localStorage.setItem(k, JSON.stringify(s));
});
await page.goto(BASE + 'people/?demo=admin#check');
await page.reload();   // the URL only changed its # (the demo keeps ?demo=admin), so load the edited store again
await page.getByText('with no intake year').waitFor();
await axe('check'); await shot('3-check');
const fix = page.locator('.p-issue', { hasText: 'Quinn Newintake' }).getByRole('button');
await fix.click();
await page.waitForFunction(() => !document.querySelector('main').textContent.includes('Quinn Newintake'));

// 5. Import from the monthly roster: the made-up list (two year changes, one graduated, two new residents)
await page.goto(BASE + 'people/?demo=admin#residents');
await page.getByRole('link', { name: 'Import from roster' }).click();
await page.getByRole('button', { name: 'Fill in a made-up list' }).click();
await page.getByText('Changes (3)').waitFor();
assert.ok(await page.getByRole('checkbox', { name: /Chandra Rao: R2 → R3/ }).isChecked());
assert.ok(await page.getByRole('checkbox', { name: /Bea Lim: R1 → R2/ }).isChecked());
await page.getByRole('checkbox', { name: /Gabriel Wong: On leave → Graduated/ }).uncheck();   // untick one
assert.ok(await page.getByRole('checkbox', { name: 'Add Noor Example' }).isDisabled(), 'a new resident waits for an email');
await page.getByLabel('Who is Noor Example?').selectOption({ label: 'Add as a new resident' });
await page.locator('.p-pick', { hasText: 'Noor Example' }).getByLabel('Google account email').fill('noor.example@example.com');
assert.ok(await page.getByRole('checkbox', { name: 'Add Noor Example' }).isChecked());
await page.getByLabel('Who is Priya Example?').selectOption({ label: 'Add as a new resident' });
const priya = page.locator('.p-pick', { hasText: 'Priya Example' });
await priya.getByLabel('Google account email').fill('aiden.tan@example.com');   // already on the list
await priya.getByText('already on the list as Aiden Tan').waitFor();
await priya.getByLabel('Google account email').fill('priya.example@example.com');
assert.ok(await page.getByRole('checkbox', { name: 'Add Priya Example' }).isDisabled(), 'a senior resident waits for R4 or R5');
await priya.getByLabel('Senior resident: which year?').selectOption('5');
await page.getByRole('button', { name: 'Apply 4 changes' }).waitFor();
await axe('roster'); await shot('5-roster');
await page.getByRole('button', { name: 'Apply 4 changes' }).click();
assert.match(await page.locator('dialog[open]').textContent(), /Priya Example: add as R5 \(priya\.example@example\.com\)/);
await page.locator('dialog[open]').getByRole('button', { name: 'Apply' }).click();
await page.getByRole('link', { name: 'Import from roster' }).waitFor();
await page.getByText('Noor Example').waitFor();
const ay = (() => { const d = new Date(Date.now() + 8 * 3600e3); return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; })();
const after = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('apmes-evals-demo-v1')).residents));
const who = n => after.find(r => r.name === n);
assert.deepEqual([who('Chandra Rao').intake, who('Chandra Rao').rYear], [ay - 2, null]);
assert.deepEqual([who('Bea Lim').intake, who('Bea Lim').rYear], [ay - 1, null]);
assert.equal(who('Gabriel Wong').status, 'ON LEAVE');   // unticked: unchanged
assert.deepEqual([who('Noor Example').email, who('Noor Example').intake, who('Noor Example').status], ['noor.example@example.com', ay, 'ACTIVE']);
assert.equal(who('Priya Example').intake, ay - 4);
assert.equal(new Set(after.map(r => r.rid)).size, after.length, 'new residents get unused IDs');

// 6. One tap: People opens NUH Junior Monthly (practice), which asks, sends its staff list back and closes
await page.goto(BASE + 'people/?demo=admin#roster');
const [jm] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: 'Get the list from NUH Junior Monthly' }).click()]);
jm.on('pageerror', e => errors.push('NUH Junior Monthly: ' + e));
assert.match(jm.url(), /^https:\/\/nuhjuniormonthly\.anawj\.com\/\?demo&send=apmes#people$/);
const send = jm.getByRole('button', { name: /^Send \d+ people$/ });
await send.waitFor();
const closed = jm.waitForEvent('close');
await send.click();
await closed;
await page.getByText('On the roster, not on the list here').waitFor();   // the practice department's made-up names
assert.match(await page.inputValue('#p-roster'), /^NUH Junior Monthly staff, roster month \d{4}-\d{2}/);

// 7. PDs: the admin adds one
await page.goto(BASE + 'people/?demo=admin#pds');
await page.getByRole('button', { name: 'Add PD' }).click();
await page.locator('dialog[open] input').nth(0).fill('Pat Director');
await page.locator('dialog[open] input').nth(1).fill('Pat.Director@example.com');
await page.locator('dialog[open]').getByRole('button', { name: 'Add' }).click();
await page.getByText('pat.director@example.com').waitFor();
await axe('pds'); await shot('4-pds');

// 8. Faculty and applications render (evals' own screens)
await page.goto(BASE + 'people/?demo=admin#faculty');
await page.getByRole('button', { name: 'Paste list' }).waitFor();
await axe('faculty');
await page.goto(BASE + 'people/?demo=admin#applications');
await page.getByRole('tab', { name: /Applications/ }).waitFor();
await axe('applications');

// 9. Export CSV
await page.goto(BASE + 'people/?demo=admin#residents');
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
const csv = fs.readFileSync(await dl.path(), 'utf8');
assert.match(csv, /^﻿list,id,name,email/);
assert.match(csv, /pd,,Pat Director,pat\.director@example\.com/);

// 10. A resident (not an admin or PD) is turned away
await page.goto(BASE + 'people/?demo=resident');
await page.evaluate(() => {});   // the app switches the demo to the admin; switch back by hand to check the gate
await page.evaluate(async () => { const c = await import('/evals/js/cloud.js'); c.setDemoRole('resident'); });
await page.getByText('For admins and PDs').waitFor();

assert.deepEqual(errors, []);
await b.close();
console.log('people e2e: ok');
