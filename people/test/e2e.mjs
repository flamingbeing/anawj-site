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

// 5. PDs: the admin adds one
await page.goto(BASE + 'people/?demo=admin#pds');
await page.getByRole('button', { name: 'Add PD' }).click();
await page.locator('dialog[open] input').nth(0).fill('Pat Director');
await page.locator('dialog[open] input').nth(1).fill('Pat.Director@example.com');
await page.locator('dialog[open]').getByRole('button', { name: 'Add' }).click();
await page.getByText('pat.director@example.com').waitFor();
await axe('pds'); await shot('4-pds');

// 6. Faculty and applications render (evals' own screens)
await page.goto(BASE + 'people/?demo=admin#faculty');
await page.getByRole('button', { name: 'Paste list' }).waitFor();
await axe('faculty');
await page.goto(BASE + 'people/?demo=admin#applications');
await page.getByRole('tab', { name: /Applications/ }).waitFor();
await axe('applications');

// 7. Export CSV
await page.goto(BASE + 'people/?demo=admin#residents');
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
const csv = fs.readFileSync(await dl.path(), 'utf8');
assert.match(csv, /^﻿list,id,name,email/);
assert.match(csv, /pd,,Pat Director,pat\.director@example\.com/);

// 8. A resident (not an admin or PD) is turned away
await page.goto(BASE + 'people/?demo=resident');
await page.evaluate(() => {});   // the app switches the demo to the admin; switch back by hand to check the gate
await page.evaluate(async () => { const c = await import('/evals/js/cloud.js'); c.setDemoRole('resident'); });
await page.getByText('For admins and PDs').waitFor();

assert.deepEqual(errors, []);
await b.close();
console.log('people e2e: ok');
