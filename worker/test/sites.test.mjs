// worker/sites.js with the repo's files standing in for Cloudflare's ASSETS: folder index pages, redirects to the
// trailing slash, 404s, headers, and that a subdomain never serves another app's files. Run: node worker/test/sites.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../sites.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
// like the Worker's assets with html_handling "none": exactly the files that exist, nothing else
const ASSETS = { async fetch(req) {
  const p = decodeURIComponent(new URL(req.url).pathname).replace(/^\//, '');
  const f = path.join(root, p);
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return new Response('nope', { status: 404 });
  return new Response(fs.readFileSync(f), { headers: { 'Content-Type': 'text/html' } });
} };
const get = (url, method = 'GET') => worker.fetch(new Request(url, { method, redirect: 'manual' }), { ASSETS });
const text = async r => (await r.text());

// every app moved to its own repo and Worker (repo split, 21 Oct 2026): only the kit and the anaes forwards are left
import { SITES } from '../routes.js';
assert.deepEqual(Object.keys(SITES).sort(), ['anaes.anawj.com', 'design.anawj.com']);
// design.anawj.com/v1/: the kit, with a CORS header so pages on other hosts can load it, noindex, folder index page
for (const u of ['https://design.anawj.com/v1/tokens.css', 'https://design.anawj.com/v1/app.js', 'https://design.anawj.com/v1/feedback/overlay.js',
  'https://anawj-preview.example.workers.dev/_sites/design.anawj.com/v1/tokens.css', 'https://design.anawj.com/nuhsdesign/tokens.css']) {
  let r = await get(u); assert.equal(r.status, 200, u); assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*', u);
  assert.equal(r.headers.get('X-Robots-Tag'), 'noindex, nofollow');
}
let r = await get('https://design.anawj.com/v1/'); assert.equal(r.status, 200); assert.match(await text(r), /<html/i);
r = await get('https://design.anawj.com/v1?x=1'); assert.equal(r.status, 301); assert.equal(r.headers.get('Location'), 'https://design.anawj.com/v1/?x=1');
// a missing file, the root, the repo's notes and old app paths are 404s
for (const p of ['/v1/nothing.js', '/', '/AGENTS.md', '/logbook/', '/nuh-roster/index.html', '/privacy/', '/v1/..%2fAGENTS.md', '/v1/%2e%2e/index.html', '/__/auth/handler', '/v2/']) {
  r = await get('https://design.anawj.com' + p); assert.equal(r.status, 404, p);
}
// anaes.anawj.com forwards to anantf.com, path kept
r = await get('https://anaes.anawj.com/bis/app.js'); assert.equal(r.status, 301); assert.equal(r.headers.get('Location'), 'https://anantf.com/bis/app.js');
r = await get('https://anaes.anawj.com/'); assert.equal(r.status, 404);
// only GET and HEAD
r = await get('https://design.anawj.com/v1/', 'POST'); assert.equal(r.status, 405);
r = await get('https://design.anawj.com/v1/', 'HEAD'); assert.equal(r.status, 200);
// any other host (local checks): the repo as it is, index pages included
r = await get('https://anawj-preview.example.workers.dev/privacy/'); assert.equal(r.status, 200);
r = await get('https://anawj-preview.example.workers.dev/privacy'); assert.equal(r.status, 301);
r = await get('https://anawj-preview.example.workers.dev/'); assert.equal(r.status, 200);
r = await get('https://anawj-preview.example.workers.dev/nope/'); assert.equal(r.status, 404);
console.log('worker tests passed');

// the feedback button (edit/NOTES.md): every page of a PR preview gets the script; the real addresses only when
// that browser turned it on (?feedback=1 sets a cookie, ?feedback=0 clears it); never on non-HTML files
{
  const TAG = '<script src="/feedback/overlay.js" defer></script>';
  const prev = 'https://claude-x-anawj-preview.kohwenjun.workers.dev';
  r = await get(prev + '/privacy/'); assert.ok((await text(r)).includes(TAG + '</body>'), 'preview page has the button');
  assert.equal(r.headers.get('Set-Cookie'), null);
  r = await get(prev + '/nuhsdesign/app.js'); assert.ok(!(await text(r)).includes(TAG), 'not in scripts');
  r = await get('https://design.anawj.com/v1/'); assert.ok(!(await text(r)).includes(TAG), 'off by default on the real address');
  assert.equal(r.headers.get('Set-Cookie'), null);
  r = await get('https://design.anawj.com/v1/?feedback=1'); assert.ok((await text(r)).includes(TAG), 'on with ?feedback=1');
  assert.match(r.headers.get('Set-Cookie'), /^anawj-feedback=1; Max-Age=2592000; Path=\/; Secure; SameSite=Lax$/);
  assert.equal(r.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  const withCookie = (url, cookie) => worker.fetch(new Request(url, { headers: { Cookie: cookie } }), { ASSETS });
  r = await withCookie('https://design.anawj.com/v1/', 'a=b; anawj-feedback=1'); assert.ok((await text(r)).includes(TAG), 'on with the cookie');
  r = await withCookie('https://design.anawj.com/v1/?feedback=0', 'anawj-feedback=1'); assert.ok(!(await text(r)).includes(TAG), 'off with ?feedback=0');
  assert.match(r.headers.get('Set-Cookie'), /^anawj-feedback=; Max-Age=0;/);
  r = await withCookie('https://design.anawj.com/v1/', 'anawj-feedback=0'); assert.ok(!(await text(r)).includes(TAG));
  // the script itself is served with the kit
  for (const h of ['design.anawj.com']) {
    r = await get(`https://${h}/v1/feedback/overlay.js`); assert.equal(r.status, 200, h);
  }
}
console.log('feedback button: ok');
