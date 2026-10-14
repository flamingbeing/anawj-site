// Browser test of the page editor (edit/) at phone size: comment with the "versions" and "everywhere" options, the
// privacy check before Send, and what the GitHub issue would contain. Serves this checkout as https://anawj.com.
// Run from the repo root: node edit/test/e2e.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', gif: 'image/gif', svg: 'image/svg+xml', json: 'application/json', png: 'image/png' };
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.route(/^https:\/\/anawj\.com\//, async route => {
  let rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const f = path.join(root, rel);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
  await route.fulfill({ status: 200, contentType: MIME[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(f) });
});
await ctx.route(/^https:\/\/(?!anawj\.com\/)/, route => route.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

try {
  await page.goto('https://anawj.com/edit/?page=/privacy/');
  const frame = page.frameLocator('#frame');
  await frame.locator('p').first().waitFor();
  assert.ok(await page.isHidden('#live'), 'no subdomain link for a page on anawj.com');
  // Share: a QR code of the short address that opens the editor on this page
  await page.click('#share');
  await page.locator('#qr svg path').waitFor();
  assert.equal(await page.textContent('#shareLink'), 'https://edit.anawj.com/privacy/');
  if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'edit-share.png') });
  await page.click('#shareClose');
  // the comment dialog offers speaking (where the browser can) and the two options
  await frame.locator('p').first().click();
  await page.click('#aComment');
  assert.ok(await page.isVisible('#optOptions') && await page.isVisible('#optEverywhere'), 'comment options shown');
  await page.fill('#noteText', 'Patient Tan said S1234567A was wrong');
  await page.check('#optOptions');
  await page.click('#noteDlg button[value=ok]');
  await page.waitForFunction(() => document.getElementById('count').textContent === '1');
  assert.equal(await page.textContent('#count'), '1');
  // "Add below" doesn't offer the comment-only options
  await frame.locator('p').nth(1).click();
  await page.click('#aAdd');
  assert.ok(!(await page.isVisible('#optOptions')), 'options are for comments only');
  await page.click('#noteDlg button[value=cancel]');
  await page.click('#aCancel');

  // the editor's own screens pass an accessibility check (axe, WCAG 2.2 AA; the page being edited is not counted)
  await page.addScriptTag({ path: new URL('../../tools/vendor/axe.min.js', import.meta.url).pathname });
  const axe = async () => (await page.evaluate(() => window.axe.run(document, { iframes: false, runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })))
    .violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`);
  assert.deepEqual(await axe(), [], 'editor bar');

  // Send: the privacy check flags the NRIC and the name, and blocks sending until ticked
  await page.click('#send');
  await page.fill('#who', 'Test sender');
  assert.ok(await page.isVisible('#privacy'), 'privacy warning shown');
  const warn = await page.textContent('#privacy');
  assert.match(warn, /NRIC/); assert.match(warn, /name/);
  assert.deepEqual(await axe(), [], 'send dialog');
  await page.evaluate(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; });
  await page.click('#openIssue');
  assert.equal((await page.evaluate(() => window.__opened)).length, 0, 'not sent before the tick');
  await page.check('#privacyTick');
  await page.click('#openIssue');
  const [url] = await page.evaluate(() => window.__opened);
  const body = new URL(url).searchParams.get('body');
  assert.match(body, /Wants options: make 2–3 clearly different versions/);
  assert.doesNotMatch(body, /Everywhere:/);
  assert.match(new URL(url).searchParams.get('title'), /^Page edits: \/privacy\/ \(Test sender\)$/);
  await page.click('#sendClose');

  // a batch with nothing private shows no warning
  await page.evaluate(() => { localStorage.setItem('anawj-editor-v1', JSON.stringify([{ id: 'x', type: 'comment', page: '/privacy/', view: '', title: '', heading: '', element: 'paragraph', locator: 'p', before: 'x', text: 'Make this shorter, please', everywhere: true }])); });
  await page.reload();
  await frame.locator('p').first().waitFor();
  await page.click('#send');
  assert.ok(!(await page.isVisible('#privacy')), 'no warning for a plain comment');
  assert.match(await page.inputValue('#preview'), /Everywhere: apply this wherever it occurs/);
  if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'edit-send.png') });
  await page.click('#sendClose');
  // a page that lives on a subdomain offers the feedback button there
  await page.fill('#path', '/hand-babies/'); await page.press('#path', 'Enter');
  await page.locator('#live a').waitFor();
  assert.equal(await page.getAttribute('#live a', 'href'), 'https://hand.anawj.com/babies/?feedback=1');
  assert.deepEqual(errors, []);
  console.log('edit e2e: ok');
} finally { await b.close(); }
