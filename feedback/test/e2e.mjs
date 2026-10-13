// Browser test of the feedback button (feedback/overlay.js) at phone size, served through the real Worker
// (worker/sites.js) with this checkout standing in for Cloudflare's files: on a PR preview it's on for every page and
// finds the preview's PR; on a real address it's off until ?feedback=1, and on a live app it never copies screen text.
// Run from the repo root: node feedback/test/e2e.mjs        SHOTS=<dir> saves phone screenshots
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../../worker/sites.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', gif: 'image/gif', png: 'image/png', webmanifest: 'application/manifest+json' };
// a page with versions to choose from, as a "show me versions" PR would add (edit/NOTES.md)
const VARIANT_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="anawj-variants" content="a,b,c"><title>Versions</title>
<script>document.documentElement.dataset.variant = new URLSearchParams(location.search).get('variant') || 'a'</script>
<style>[data-variant=b] h1{color:red}</style></head><body><h1>Heading</h1><p>Text</p></body></html>`;
const ASSETS = { async fetch(req) {
  const p = decodeURIComponent(new URL(req.url).pathname).replace(/^\//, '');
  if (p === 'zz-variants/index.html') return new Response(VARIANT_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  const f = path.join(root, p);
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return new Response('nope', { status: 404 });
  return new Response(fs.readFileSync(f), { headers: { 'Content-Type': MIME[f.split('.').pop()] || 'application/octet-stream' } });
} };
const PREVIEW = 'https://claude-try-feedback-anawj-preview.kohwenjun.workers.dev';
const SHOTS = process.env.SHOTS;

const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
await ctx.route(/^https:\/\/([a-z0-9-]+\.kohwenjun\.workers\.dev|(hand|apmes|prewarmstudy|nuhroster)\.anawj\.com)\//, async route => {
  const req = route.request();
  const res = await worker.fetch(new Request(req.url(), { headers: req.headers(), redirect: 'manual' }), { ASSETS });
  const headers = Object.fromEntries(res.headers);
  await route.fulfill({ status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) });
});
// the preview's PR, as GitHub's API lists it
await ctx.route('https://api.github.com/repos/flamingbeing/anawj-site/pulls?state=open&per_page=100', route => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify([{ number: 7, title: 'Something else', head: { ref: 'claude/other' }, html_url: 'https://github.com/flamingbeing/anawj-site/pull/7' },
    { number: 9, title: 'A longer branch name', head: { ref: 'claude/try-feedback-2' }, html_url: 'https://github.com/flamingbeing/anawj-site/pull/9' },
    { number: 412, title: 'Try the feedback button', head: { ref: 'claude/try-feedback' }, html_url: 'https://github.com/flamingbeing/anawj-site/pull/412' }]) }));
await ctx.route(/^https:\/\/(?!api\.github\.com|[a-z0-9-]+\.kohwenjun\.workers\.dev|(hand|apmes|prewarmstudy|nuhroster)\.anawj\.com)/, r => r.abort());

const fb = page => page.locator('[data-anawj-feedback]');
try {
  // ---- a PR preview: the button is there on a static page
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(PREVIEW + '/hand-babies/');
  await fb(page).locator('#fab').waitFor();
  // the first visit says what the button is for, once
  assert.match(await fb(page).locator('#tip').textContent(), /preview of a change/);
  // on a preview: links to the page as it is now and to the PR's changes
  await fb(page).locator('#fab').click();
  assert.ok(await fb(page).locator('#tip').isHidden());
  await fb(page).locator('#cmpPr').waitFor();
  assert.equal(await fb(page).locator('#cmpNow').getAttribute('href'), 'https://anawj-preview.kohwenjun.workers.dev/hand-babies/');
  assert.equal(await fb(page).locator('#cmpPr').getAttribute('href'), 'https://github.com/flamingbeing/anawj-site/pull/412/files');
  // the button's menu and comment box pass an accessibility check (axe, WCAG 2.2 AA), only our own parts counted
  await page.addScriptTag({ path: new URL('../../tools/vendor/axe.min.js', import.meta.url).pathname });
  const ours = async () => (await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })))
    .violations.map(v => ({ id: v.id, nodes: v.nodes.filter(n => JSON.stringify(n.target).includes('anawj-feedback')).map(n => JSON.stringify(n.target)) })).filter(v => v.nodes.length);
  assert.deepEqual(await ours(), [], 'menu');
  await fb(page).locator('#mPage').click();
  assert.deepEqual(await ours(), [], 'comment box');
  await fb(page).locator('#noteCancel').click();
  await page.reload(); await fb(page).locator('#fab').waitFor();
  assert.ok(await fb(page).locator('#tip').isHidden(), 'the hint shows once');
  // while picking, the page's own taps are held back
  await page.evaluate(() => { window.__clicks = 0; document.addEventListener('click', () => window.__clicks++); });
  await fb(page).locator('#fab').click();
  await fb(page).locator('#mPick').click();
  assert.ok(await fb(page).locator('#banner').isVisible(), 'picking banner');
  await page.evaluate(() => { window.__clicks = 0; });   // (the button's own taps bubble up; count from here)
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'feedback-pick.png') });
  await page.locator('p').first().click();
  assert.equal(await page.evaluate(() => window.__clicks), 0, 'the page never saw the tap');
  const on = await fb(page).locator('#onText').textContent();
  assert.match(on, /^On: paragraph “.+”/);
  await fb(page).locator('#noteText').fill('Make this one line shorter');
  await fb(page).locator('#optEverywhere').check();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'feedback-comment.png') });
  await fb(page).locator('#noteSave').click();
  assert.equal(await fb(page).locator('#badge').textContent(), '1');
  assert.equal(await page.locator('[data-anawj-fb]').count(), 0, 'highlight removed');
  // a comment on the whole screen too
  await fb(page).locator('#fab').click();
  await fb(page).locator('#mPage').click();
  await fb(page).locator('#noteText').fill('Pt Tan says the colours are too pale');
  await fb(page).locator('#noteSave').click();
  // the comments survive a reload (kept in this browser until sent)
  await page.reload();
  await fb(page).locator('#fab').waitFor();
  assert.equal(await fb(page).locator('#badge').textContent(), '2');
  // Send: finds PR #412 from the preview's address; the privacy check holds it until ticked
  await page.evaluate(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; });
  await fb(page).locator('#fab').click();
  await fb(page).locator('#mSend').click();
  await fb(page).locator('#toPr').waitFor();
  assert.equal(await fb(page).locator('#toPr').textContent(), 'Comment on PR #412');
  await fb(page).locator('#who').fill('Test sender');
  assert.ok(await fb(page).locator('#privacy').isVisible(), 'privacy warning for "Pt Tan"');
  await fb(page).locator('#toPr').click();
  assert.equal((await page.evaluate(() => window.__opened)).length, 0, 'held until ticked');
  await fb(page).locator('#privacyTick').check();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'feedback-send.png') });
  await fb(page).locator('#toPr').click();
  assert.deepEqual(await page.evaluate(() => window.__opened), ['https://github.com/flamingbeing/anawj-site/pull/412']);
  const rep = await fb(page).locator('#report').inputValue();
  assert.match(rep, /^Suggested by: Test sender\nSent from the feedback button on claude-try-feedback-anawj-preview\.kohwenjun\.workers\.dev \(a PR preview\), 2 comments\./);
  assert.match(rep, /## Page: https:\/\/claude-try-feedback-anawj-preview\.kohwenjun\.workers\.dev\/hand-babies\//);
  assert.match(rep, /Everywhere: apply this wherever/);
  assert.match(rep, /Locator: `/);
  // ... or as a "Page edits:" issue
  await fb(page).locator('#toIssue').click();
  const issue = new URL((await page.evaluate(() => window.__opened))[1]);
  assert.equal(issue.pathname, '/flamingbeing/anawj-site/issues/new');
  assert.equal(issue.searchParams.get('title'), 'Page edits: claude-try-feedback-anawj-preview.kohwenjun.workers.dev/hand-babies/ (Test sender)');
  assert.deepEqual(errors, []);

  // ---- "Something's wrong": the last taps and screens and any errors go with the report, never the screen's text
  const bug = await ctx.newPage();
  await bug.goto(PREVIEW + '/hand-babies/');
  await bug.evaluate(() => caches.open('hand-babies-v9-abcdef12'));   // as the app's service worker names its copy
  await fb(bug).locator('#fab').waitFor();
  await bug.locator('nav a, [role=tab], button').filter({ visible: true }).nth(1).click();
  await bug.evaluate(() => { setTimeout(() => { throw new Error('boom in test'); }); });
  await bug.waitForTimeout(100);
  await fb(bug).locator('#fab').click();
  await fb(bug).locator('#mBug').click();
  await fb(bug).locator('#onText', { hasText: /^Problem report/ }).waitFor();
  await fb(bug).locator('#noteText').fill('I tapped a tab and the page jumped');
  await fb(bug).locator('#noteSave').click();
  await fb(bug).locator('#fab').click();
  await fb(bug).locator('#mSend').click();
  await fb(bug).locator('#who').fill('Test sender');
  const bugRep = await fb(bug).locator('#report').inputValue();
  assert.match(bugRep, /### \d+\. Something's wrong \(screen /);
  assert.match(bugRep, /What happened:\n> I tapped a tab and the page jumped/);
  assert.match(bugRep, /Device: 390×844, online, /);
  assert.match(bugRep, /App version \(offline copy\): hand-babies-/, 'the app version is in the report');
  assert.match(bugRep, /\ds tap [a-z ]+ /, 'the tap is in the steps');
  assert.match(bugRep, /Errors:\n- .*boom in test/);
  if (SHOTS) await bug.screenshot({ path: path.join(SHOTS, 'feedback-bug.png') });

  // ---- drawing: a circle round a paragraph and an arrow from a heading to it become marks on those parts of the page
  const dr = await ctx.newPage();
  await dr.goto(PREVIEW + '/hand-babies/');
  await fb(dr).locator('#fab').waitFor();
  await fb(dr).locator('#fab').click();
  await fb(dr).locator('#mDraw').click();
  const box = await dr.locator('p').first().boundingBox();
  const cx = box.x + Math.min(box.width, 200) / 2, cy = box.y + box.height / 2, rx = Math.min(box.width, 200) / 2 + 6, ry = box.height / 2 + 6;
  await dr.mouse.move(cx + rx, cy); await dr.mouse.down();
  for (let k = 1; k <= 24; k++) await dr.mouse.move(cx + rx * Math.cos(k / 24 * 2 * Math.PI), cy + ry * Math.sin(k / 24 * 2 * Math.PI));
  await dr.mouse.up();
  const hb = await dr.locator('h2').first().boundingBox();
  await dr.mouse.move(hb.x + 20, hb.y + hb.height / 2); await dr.mouse.down();
  await dr.mouse.move(hb.x + 20, (hb.y + cy) / 2, { steps: 5 }); await dr.mouse.move(cx, cy, { steps: 5 }); await dr.mouse.up();
  if (SHOTS) await dr.screenshot({ path: path.join(SHOTS, 'feedback-draw.png') });
  await fb(dr).locator('#drawDone').click();
  const drew = await fb(dr).locator('#onText').textContent();
  assert.match(drew, /^You drew: circled paragraph “Tap the one in front of you\.”; arrow from heading “By case” to paragraph “Tap the one/);
  await fb(dr).locator('#noteText').fill('Put the heading closer to this');
  await fb(dr).locator('#noteSave').click();
  await fb(dr).locator('#fab').click();
  await fb(dr).locator('#mSend').click();
  const drRep = await fb(dr).locator('#report').inputValue();
  assert.match(drRep, /### \d+\. Drawing \(390×844 screen, scrolled 0px\)\nMarks:\n- Circled paragraph “Tap the one in front of you\.” \(`#picture > p:nth-of-type\(1\)`\)\n- Arrow from heading/);
  await fb(dr).locator('#sendClose').click();

  // ---- Share: a QR code of this page (on a real address, with the button switched on)
  await fb(dr).locator('#fab').click();
  await fb(dr).locator('#mShare').click();
  await fb(dr).locator('#qr svg path').waitFor();
  assert.equal(await fb(dr).locator('#shareLink').textContent(), PREVIEW + '/hand-babies/');
  await fb(dr).locator('#shareClose').click();

  // ---- versions to choose from: flip between them on the preview, then choose one
  const ver = await ctx.newPage();
  await ver.goto(PREVIEW + '/zz-variants/?keep=1');
  await fb(ver).locator('#fab').waitFor();
  assert.equal(await fb(ver).locator('#ver').textContent(), 'Version A');
  await fb(ver).locator('#fab').click();
  assert.equal(await fb(ver).locator('#vers button').count(), 3);
  await fb(ver).locator('#vers button', { hasText: 'B' }).click();
  await ver.waitForURL(/\?keep=1&variant=b$/);
  await fb(ver).locator('#fab').waitFor();
  assert.equal(await ver.evaluate(() => document.documentElement.dataset.variant), 'b');
  assert.equal(await fb(ver).locator('#ver').textContent(), 'Version B');
  await fb(ver).locator('#fab').click();
  if (SHOTS) await ver.screenshot({ path: path.join(SHOTS, 'feedback-versions.png') });
  assert.equal(new URL(await fb(ver).locator('#cmpNow').getAttribute('href')).search, '?keep=1', '"how it is now" drops only ?variant');
  await fb(ver).locator('#choose').click();
  // change of mind: choose A instead (the later choice replaces the earlier one)
  await ver.goto(PREVIEW + '/zz-variants/?variant=a&keep=1');
  await fb(ver).locator('#fab').click();
  await fb(ver).locator('#choose').click();
  await fb(ver).locator('#fab').click();
  await fb(ver).locator('#mSend').click();
  const verRep = await fb(ver).locator('#report').inputValue();
  assert.match(verRep, /## Page: https:\/\/claude-try-feedback-anawj-preview\.kohwenjun\.workers\.dev\/zz-variants\/\?keep=1\n\n### 1\. Version chosen\nChoose version A \(of A, B, C\)\. Keep that one/);
  assert.doesNotMatch(verRep, /version B/, 'only the latest choice');
  // pages without versions don't show the chooser
  assert.ok(await bug.evaluate(() => document.querySelector('[data-anawj-feedback]').shadowRoot.getElementById('verBox').hidden));

  // ---- two tabs of the same site: a comment from each is kept
  const t1 = await ctx.newPage(), t2 = await ctx.newPage();
  await t1.goto(PREVIEW + '/privacy/'); await t2.goto(PREVIEW + '/privacy/');
  for (const [t, words] of [[t1, 'from tab one'], [t2, 'from tab two']]) {
    await fb(t).locator('#fab').waitFor(); await fb(t).locator('#fab').click();
    await fb(t).locator('#mPage').click(); await fb(t).locator('#noteText').fill(words); await fb(t).locator('#noteSave').click();
  }
  const kept = await t1.evaluate(() => JSON.parse(localStorage.getItem('anawj-feedback-v1')).map(c => c.text));
  assert.ok(kept.includes('from tab one') && kept.includes('from tab two'), 'both tabs\' comments kept: ' + kept);
  await t1.close(); await t2.close();

  // ---- a real address: off unless turned on
  const live = await ctx.newPage();
  await live.goto('https://hand.anawj.com/babies/');
  await live.waitForLoadState('load');
  assert.equal(await fb(live).count(), 0, 'off by default');
  await live.goto('https://hand.anawj.com/babies/?feedback=1');
  await fb(live).locator('#fab').waitFor();
  await live.goto('https://hand.anawj.com/cmcj/');           // the cookie keeps it on for the whole host
  await fb(live).locator('#fab').waitFor();
  await fb(live).locator('#fab').click();
  await fb(live).locator('#mShare').click();
  await fb(live).locator('#qr svg path').waitFor();
  assert.match(await fb(live).locator('#shareLink').textContent(), /^https:\/\/hand\.anawj\.com\/cmcj\/\?feedback=1(#\w+)?$/);
  await fb(live).locator('#shareClose').click();
  await fb(live).locator('#fab').click();
  await fb(live).locator('#mOff').click();                  // "Turn off" clears it
  await live.goto('https://hand.anawj.com/babies/');
  await live.waitForLoadState('load');
  assert.equal(await fb(live).count(), 0, 'turned off');

  // ---- a live app: comments never include the screen's text
  await live.goto('https://prewarmstudy.anawj.com/?feedback=1');
  await fb(live).locator('#fab').waitFor();
  assert.match(await fb(live).locator('#where').textContent(), /Live app/);
  await fb(live).locator('#fab').click();
  await fb(live).locator('#mPick').click();
  await live.locator('h1:visible, h2:visible, button:visible').first().click();
  assert.match(await fb(live).locator('#onText').textContent(), /^On: [a-z ]+$/, 'no screen text on a live app');
  if (SHOTS) await live.screenshot({ path: path.join(SHOTS, 'feedback-live-app.png') });
  await fb(live).locator('#noteText').fill('Heading too big');
  await fb(live).locator('#noteSave').click();
  // the address's query and record ids, and things the app logs, never reach a report from a live app
  await live.goto('https://prewarmstudy.anawj.com/?secretq=abc#patient/rec123');
  await fb(live).locator('#fab').waitFor();
  await live.evaluate(() => { location.hash = '#patient/rec123'; console.error({ initials: 'QZX' }, new Error('write failed')); });
  await fb(live).locator('#fab').click();
  await fb(live).locator('#mBug').click();
  await fb(live).locator('#onText', { hasText: /^Problem report/ }).waitFor();
  await fb(live).locator('#noteText').fill('Save did nothing');
  await fb(live).locator('#noteSave').click();
  await fb(live).locator('#fab').click();
  await fb(live).locator('#mSend').click();
  const liveRep = await fb(live).locator('#report').inputValue();
  assert.match(liveRep, /## Page: https:\/\/prewarmstudy\.anawj\.com\/\n/);
  assert.match(liveRep, /console: write failed/);
  for (const secret of ['secretq', 'rec123', 'QZX', 'Prewarming study']) assert.ok(!liveRep.includes(secret), `live report leaks ${secret}`);
  // hand-log keeps people's names on the phone: a live app too
  await live.goto('https://hand.anawj.com/handlog/?feedback=1');
  await fb(live).locator('#fab').waitFor();
  assert.match(await fb(live).locator('#where').textContent(), /Live app/);
  console.log('feedback e2e: ok');
} finally { await b.close(); }
