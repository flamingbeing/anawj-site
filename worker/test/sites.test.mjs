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

// shared host: each app under its path
let r = await get('https://hand.anawj.com/babies/');
assert.equal(r.status, 200); assert.match(await text(r), /<html/i);
assert.equal(r.headers.get('X-Robots-Tag'), 'noindex, nofollow');
r = await get('https://hand.anawj.com/cmcj/'); assert.equal(r.status, 200);
r = await get('https://apmes.anawj.com/logbook/sw.js'); assert.equal(r.status, 200);
r = await get('https://apmes.anawj.com/evals/'); assert.equal(r.status, 200);
// no trailing slash: sent to the address with one, query kept
r = await get('https://hand.anawj.com/babies?x=1'); assert.equal(r.status, 301); assert.equal(r.headers.get('Location'), 'https://hand.anawj.com/babies/?x=1');
// a missing file and a missing folder are 404s
r = await get('https://hand.anawj.com/babies/nothing.js'); assert.equal(r.status, 404);
r = await get('https://hand.anawj.com/babies/nothing'); assert.equal(r.status, 404);
// ... and a folder with an index but no slash redirects
r = await get('https://apmes.anawj.com/logbook'); assert.equal(r.status, 301); assert.equal(r.headers.get('Location'), 'https://apmes.anawj.com/logbook/');
// a subdomain never serves another app's files, the repo's notes or the root
for (const [h, p] of [['hand.anawj.com', '/logbook/index.html'], ['hand.anawj.com', '/'], ['hand.anawj.com', '/AGENTS.md'], ['hand.anawj.com', '/hand-babies/'],
  ['apmes.anawj.com', '/prewarm/index.html'], ['apmes.anawj.com', '/nuh-roster/'], ['prewarmstudy.anawj.com', '/logbook/index.html'], ['prewarmstudy.anawj.com', '/AGENTS.md'],
  ['roster.anawj.com', '/prewarm/'], ['roster.anawj.com', '/logbook/js/app.js'], ['hand.anawj.com', '/cmcj/..%2flogbook/index.html'], ['hand.anawj.com', '/cmcj/%2e%2e/logbook/index.html']]) {
  r = await get(`https://${h}${p}`);
  assert.equal(r.status, 404, `${h}${p} -> ${r.status}`);
}
// one-app hosts: the app at the root, its own folder name too
r = await get('https://prewarmstudy.anawj.com/'); assert.equal(r.status, 200);
r = await get('https://prewarmstudy.anawj.com/sw.js'); assert.equal(r.status, 200);
r = await get('https://prewarmstudy.anawj.com/prewarm/sw.js'); assert.equal(r.status, 200);
r = await get('https://prewarmstudy.anawj.com/prewarm'); assert.equal(r.status, 301);
r = await get('https://roster.anawj.com/'); assert.equal(r.status, 200);
// only GET and HEAD
r = await get('https://roster.anawj.com/', 'POST'); assert.equal(r.status, 405);
r = await get('https://roster.anawj.com/', 'HEAD'); assert.equal(r.status, 200);

// the previews and the copy of main: the whole repo as before, index pages included
r = await get('https://anawj-preview.example.workers.dev/logbook/'); assert.equal(r.status, 200);
r = await get('https://anawj-preview.example.workers.dev/logbook'); assert.equal(r.status, 301);
r = await get('https://anawj-preview.example.workers.dev/'); assert.equal(r.status, 200);
r = await get('https://anawj-preview.example.workers.dev/hand-babies/'); assert.equal(r.status, 200);
r = await get('https://anawj-preview.example.workers.dev/logbook/js/app.js'); assert.equal(r.status, 200);
r = await get('https://anawj-preview.example.workers.dev/nope/'); assert.equal(r.status, 404);
// trying a subdomain on a preview
r = await get('https://anawj-preview.example.workers.dev/_sites/hand.anawj.com/babies/'); assert.equal(r.status, 200);
r = await get('https://anawj-preview.example.workers.dev/_sites/hand.anawj.com/babies'); assert.equal(r.status, 301);
assert.equal(r.headers.get('Location'), 'https://anawj-preview.example.workers.dev/_sites/hand.anawj.com/babies/');
r = await get('https://anawj-preview.example.workers.dev/_sites/hand.anawj.com/logbook/'); assert.equal(r.status, 404);
r = await get('https://anawj-preview.example.workers.dev/_sites/prewarmstudy.anawj.com/'); assert.equal(r.status, 200);
console.log('worker tests passed');
