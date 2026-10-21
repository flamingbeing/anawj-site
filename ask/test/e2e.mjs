// Browser test of Ask Claude (ask/index.html) at phone size, served from ask/ as ask.anawj.com (owner-tools serves it live), with its
// API (worker/ask.js; tested in worker/test/ask.test.mjs) stood in for: prefilled from the address, the privacy check,
// sending, and following the ask to its PR and preview. Run from the repo root: node ask/test/e2e.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const ASSETS = { async fetch(req) {
  const f = path.join(root, decodeURIComponent(new URL(req.url).pathname));
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return new Response('nope', { status: 404 });
  return new Response(fs.readFileSync(f), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
} };
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const posted = [];
let drafted = false;
await ctx.route('https://ask.anawj.com/api/ask**', async route => {
  const req = route.request();
  if (req.method() === 'POST') { posted.push(JSON.parse(req.postData())); return route.fulfill({ json: { issue: 501, url: 'https://github.com/flamingbeing/anawj-site/issues/501' } }); }
  return route.fulfill({ json: drafted ? { issue: 501, pr: 502, prUrl: 'https://github.com/flamingbeing/anawj-site/pull/502', preview: 'https://page-edits-issue-501-anawj-preview.kohwenjun.workers.dev/_sites/hand.anawj.com/babies/' } : { issue: 501, pr: null } });
});
await ctx.route(/^https:\/\/ask\.anawj\.com\/(?!api\/)/, async route => {
  const res = await ASSETS.fetch(new Request('https://ask.anawj.com/ask' + new URL(route.request().url()).pathname.replace(/\/$/, '/index.html')));
  await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
});
await ctx.route(/^https:\/\/(?!ask\.anawj\.com)/, r => r.abort());
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto('https://ask.anawj.com/?' + new URLSearchParams({ page: 'https://hand.anawj.com/babies/', kind: 'paragraph', on: 'Tap the one in front of you.', locator: '#x > p', text: 'Make this a table', options: '1' }));
  assert.equal(await page.inputValue('#page'), 'https://hand.anawj.com/babies/');
  assert.equal(await page.textContent('#on'), 'paragraph: Tap the one in front of you.');
  assert.equal(await page.inputValue('#text'), 'Make this a table');
  assert.ok(await page.isChecked('#optOptions'));
  // the privacy check holds a send with something like an NRIC in it
  await page.fill('#text', 'Pt Tan says S1234567A');
  await page.click('#send');
  assert.ok(await page.isVisible('#privacy'));
  assert.equal(posted.length, 0, 'held');
  await page.fill('#text', 'Make this a table');
  await page.click('#send');
  await page.locator('.asks li').waitFor();
  assert.deepEqual(posted[0], { page: 'https://hand.anawj.com/babies/', text: 'Make this a table', on: 'Tap the one in front of you.', kind: 'paragraph', locator: '#x > p', options: true, everywhere: false });
  assert.match(await page.textContent('.asks li'), /hand\.anawj\.com\/babies\/ · issue #501 · Claude is drafting/);
  assert.equal(await page.inputValue('#text'), '', 'cleared for the next ask');
  // the PR is drafted: the preview link appears (followed every 20 s, and when the page opens again)
  drafted = true;
  await page.reload();
  await page.locator('.asks a', { hasText: 'open the preview' }).waitFor();
  assert.equal(await page.getAttribute('.asks a >> text=open the preview', 'href'), 'https://page-edits-issue-501-anawj-preview.kohwenjun.workers.dev/_sites/hand.anawj.com/babies/');
  assert.match(await page.textContent('.asks li'), /PR #502/);
  if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'ask.png') });
  // the page passes an accessibility check (axe, WCAG 2.2 AA)
  await page.addScriptTag({ path: path.join(root, 'tools/vendor/axe.min.js') });
  const v = (await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }))).violations.map(x => x.id);
  assert.deepEqual(v, []);
  assert.deepEqual(errors, []);
  console.log('ask e2e: ok');
} finally { await b.close(); }
