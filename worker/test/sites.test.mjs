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

// apmes.anawj.com moved to the apmes repo (21 Oct 2026): this Worker no longer lists it or its beta twin
import { SITES } from '../routes.js';
assert.equal(SITES['apmes.anawj.com'], undefined); assert.equal(SITES['beta-apmes.anawj.com'], undefined);
// a one-app host: the app at the root, with the folder-index page, noindex header, trailing-slash redirect (query kept) and 404s
let r = await get('https://ntfroster.anawj.com/');
assert.equal(r.status, 200); assert.match(await text(r), /<html/i);
assert.equal(r.headers.get('X-Robots-Tag'), 'noindex, nofollow');
r = await get('https://ntfroster.anawj.com/sw.js'); assert.equal(r.status, 200);
r = await get('https://ntfroster.anawj.com/ntf-roster/'); assert.equal(r.status, 200);
r = await get('https://ntfroster.anawj.com/ntf-roster?x=1'); assert.equal(r.status, 301); assert.equal(r.headers.get('Location'), 'https://ntfroster.anawj.com/ntf-roster/?x=1');
// a missing file and a missing folder are 404s
r = await get('https://ntfroster.anawj.com/nothing.js'); assert.equal(r.status, 404);
r = await get('https://ntfroster.anawj.com/nothing'); assert.equal(r.status, 404);
// a subdomain never serves another app's files, the repo's notes or the root
for (const [h, p] of [['nuhjuniormonthly.anawj.com', '/logbook/index.html'], ['nuhjuniormonthly.anawj.com', '/AGENTS.md'], ['nuhjuniormonthly.anawj.com', '/hand-babies/'],
  ['design.anawj.com', '/nuh-roster/index.html'], ['design.anawj.com', '/nuh-roster/'], ['ntfroster.anawj.com', '/nuh-roster/index.html'], ['nuhroster.anawj.com', '/logbook/index.html'], ['nuhroster.anawj.com', '/AGENTS.md'],
  ['nuhroster.anawj.com', '/prewarm/'], ['nuhroster.anawj.com', '/logbook/js/app.js'], ['design.anawj.com', '/v1/..%2flogbook/index.html'], ['design.anawj.com', '/v1/%2e%2e/prewarm/index.html']]) {
  r = await get(`https://${h}${p}`);
  assert.equal(r.status, 404, `${h}${p} -> ${r.status}`);
}
// one-app hosts: the app at the root, its own folder name too
r = await get('https://nuhroster.anawj.com/'); assert.equal(r.status, 200);
r = await get('https://nuhroster.anawj.com/sw.js'); assert.equal(r.status, 200);
r = await get('https://nuhroster.anawj.com/nuh-roster/sw.js'); assert.equal(r.status, 200);
r = await get('https://nuhroster.anawj.com/nuh-roster'); assert.equal(r.status, 301);
r = await get('https://nuhroster.anawj.com/'); assert.equal(r.status, 200);
// the shared design folder is served on every subdomain (apps link ../nuhsdesign/tokens.css); the old /design/ is gone
for (const h of ['nuhjuniormonthly.anawj.com', 'ntfroster.anawj.com', 'nuhroster.anawj.com', 'nuhroster.anawj.com']) {
  r = await get(`https://${h}/nuhsdesign/tokens.css`); assert.equal(r.status, 200, h);
  r = await get(`https://${h}/nuhsdesign`); assert.equal(r.status, 301, h);
  assert.equal(r.headers.get('Location'), `https://${h}/nuhsdesign/`);
  r = await get(`https://${h}/nuhsdesign/..%2flogbook/index.html`); assert.equal(r.status, 404, h);
  r = await get(`https://${h}/design/tokens.css`); assert.equal(r.status, 404, h);
}
// design.anawj.com/v1/: the kit, with a CORS header so pages on other hosts can load it (other files get none)
for (const u of ['https://design.anawj.com/v1/tokens.css', 'https://design.anawj.com/v1/app.js', 'https://design.anawj.com/v1/feedback/overlay.js',
  'https://anawj-preview.example.workers.dev/_sites/design.anawj.com/v1/tokens.css', 'https://nuhroster.anawj.com/nuhsdesign/tokens.css']) {
  r = await get(u); assert.equal(r.status, 200, u); assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*', u);
}
r = await get('https://design.anawj.com/v1'); assert.equal(r.status, 301); assert.equal(r.headers.get('Location'), 'https://design.anawj.com/v1/');
r = await get('https://design.anawj.com/logbook/'); assert.equal(r.status, 404);
r = await get('https://ntfroster.anawj.com/'); assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
// ntfroster.anawj.com also serves Firebase's sign-in helper pages at /__/auth/ (handler is handler.html, as on GitHub Pages)
r = await get('https://ntfroster.anawj.com/__/auth/handler?apiKey=x&mode=y'); assert.equal(r.status, 200);
r = await get('https://ntfroster.anawj.com/__/auth/handler.js'); assert.equal(r.status, 200);
r = await get('https://ntfroster.anawj.com/__/auth/iframe?apiKey=x'); assert.equal(r.status, 200);
r = await get('https://ntfroster.anawj.com/__/firebase/init.json'); assert.equal(r.status, 200);
assert.equal(JSON.parse(await r.text()).authDomain, 'ntfroster.anawj.com');
assert.equal((await get('https://ntfroster.anawj.com/__/auth/handler.html')).status, 200);
for (const u of ['https://nuhroster.anawj.com/apmes/guidebook/dops-expectations.md', 'https://ntfroster.anawj.com/apmes/guidebook/dops-expectations.md']) {
  assert.equal((await get(u)).status, 404, u);
}
// ... and only there, only those two folders
for (const u of ['https://nuhroster.anawj.com/__/auth/handler', 'https://nuhroster.anawj.com/__/firebase/init.json', 'https://design.anawj.com/__/auth/handler', 'https://ntfroster.anawj.com/__/', 'https://ntfroster.anawj.com/ntf-auth/firebase/init.json']) {
  assert.equal((await get(u)).status, 404, u);
}
// only GET and HEAD
r = await get('https://nuhroster.anawj.com/', 'POST'); assert.equal(r.status, 405);
r = await get('https://nuhroster.anawj.com/', 'HEAD'); assert.equal(r.status, 200);

// the previews and the copy of main: the whole repo as before, index pages included
r = await get('https://anawj-preview.example.workers.dev/logbook/'); assert.equal(r.status, 200);
r = await get('https://anawj-preview.example.workers.dev/logbook'); assert.equal(r.status, 301);
r = await get('https://anawj-preview.example.workers.dev/'); assert.equal(r.status, 200);
r = await get('https://anawj-preview.example.workers.dev/hand-babies/'); assert.equal(r.status, 200);
r = await get('https://anawj-preview.example.workers.dev/logbook/js/app.js'); assert.equal(r.status, 200);
r = await get('https://anawj-preview.example.workers.dev/nope/'); assert.equal(r.status, 404);
// trying a subdomain on a preview
r = await get('https://anawj-preview.example.workers.dev/_sites/ntfroster.anawj.com/js/app.js'); assert.equal(r.status, 200);
r = await get('https://anawj-preview.example.workers.dev/_sites/ntfroster.anawj.com/ntf-roster'); assert.equal(r.status, 301);
assert.equal(r.headers.get('Location'), 'https://anawj-preview.example.workers.dev/_sites/ntfroster.anawj.com/ntf-roster/');
r = await get('https://anawj-preview.example.workers.dev/_sites/design.anawj.com/prewarm/'); assert.equal(r.status, 404);
r = await get('https://anawj-preview.example.workers.dev/_sites/nuhroster.anawj.com/'); assert.equal(r.status, 200);
console.log('worker tests passed');

// the feedback button (edit/NOTES.md): every page of a PR preview gets the script; the real addresses only when
// that browser turned it on (?feedback=1 sets a cookie, ?feedback=0 clears it); never on non-HTML files
{
  const TAG = '<script src="/feedback/overlay.js" defer></script>';
  const prev = 'https://claude-x-anawj-preview.kohwenjun.workers.dev';
  r = await get(prev + '/hand-babies/'); assert.ok((await text(r)).includes(TAG + '</body>'), 'preview page has the button');
  assert.equal(r.headers.get('Set-Cookie'), null);
  r = await get(prev + '/hand-babies/app.js'); assert.ok(!(await text(r)).includes(TAG), 'not in scripts');
  r = await get('https://ntfroster.anawj.com/'); assert.ok(!(await text(r)).includes(TAG), 'off by default on the real address');
  assert.equal(r.headers.get('Set-Cookie'), null);
  r = await get('https://ntfroster.anawj.com/?feedback=1'); assert.ok((await text(r)).includes(TAG), 'on with ?feedback=1');
  assert.match(r.headers.get('Set-Cookie'), /^anawj-feedback=1; Max-Age=2592000; Path=\/; Secure; SameSite=Lax$/);
  assert.equal(r.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  const withCookie = (url, cookie) => worker.fetch(new Request(url, { headers: { Cookie: cookie } }), { ASSETS });
  r = await withCookie('https://nuhroster.anawj.com/', 'a=b; anawj-feedback=1'); assert.ok((await text(r)).includes(TAG), 'on with the cookie');
  r = await withCookie('https://nuhroster.anawj.com/?feedback=0', 'anawj-feedback=1'); assert.ok(!(await text(r)).includes(TAG), 'off with ?feedback=0');
  assert.match(r.headers.get('Set-Cookie'), /^anawj-feedback=; Max-Age=0;/);
  r = await withCookie('https://nuhroster.anawj.com/', 'anawj-feedback=0'); assert.ok(!(await text(r)).includes(TAG));
  // the script itself is served on every subdomain (a shared folder, like the design files)
  for (const h of ['nuhjuniormonthly.anawj.com', 'ntfroster.anawj.com', 'nuhroster.anawj.com', 'nuhroster.anawj.com']) {
    r = await get(`https://${h}/feedback/overlay.js`); assert.equal(r.status, 200, h);
  }
}
console.log('feedback button: ok');
