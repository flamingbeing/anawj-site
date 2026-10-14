// Ask Claude's API (worker/ask.js): the Access sign-in check, opening the issue as the owner, and following it to its
// PR and preview. GitHub and Cloudflare Access are stood in for. Run: node worker/test/ask.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { handleAsk, verifyAccess, previewOf, resetAccessCache } from '../ask.js';
import worker from '../sites.js';

// a key pair standing in for Cloudflare Access, and tokens signed with it
const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' };
const b64u = x => Buffer.from(typeof x === 'string' ? x : new Uint8Array(x)).toString('base64url');
async function token(claims, kid = 'k1', key = privateKey) {
  const head = b64u(JSON.stringify({ alg: 'RS256', kid })), body = b64u(JSON.stringify(claims));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + body));
  return `${head}.${body}.${b64u(sig)}`;
}
const env = { GITHUB_ISSUES_TOKEN: 'test-token', ACCESS_TEAM: 'team', ACCESS_AUD: 'aud1' };
const later = Math.floor(Date.now() / 1000) + 600;
const good = await token({ aud: ['aud1'], exp: later, iss: 'https://team.cloudflareaccess.com', email: 'owner@example.com' });

// GitHub and Access, as fetch sees them
const calls = [];
const fake = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url) === 'https://team.cloudflareaccess.com/cdn-cgi/access/certs') return Response.json({ keys: [jwk] });
  if (String(url).endsWith('/issues') && init.method === 'POST') return Response.json({ number: 501, html_url: 'https://github.com/flamingbeing/anawj-site/issues/501' }, { status: 201 });
  if (String(url).includes('/issues/501/comments')) return Response.json([{ body: 'Drafted: https://github.com/flamingbeing/anawj-site/pull/502 (preview soon)' }]);
  if (String(url).includes('/issues/600/comments')) return Response.json([]);
  if (String(url).endsWith('/pulls/502')) return Response.json({ head: { ref: 'page-edits/issue-501' } });
  return new Response('nope', { status: 404 });
};
const req = (method, body, headers = {}, q = '') => new Request('https://ask.anawj.com/api/ask' + q, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
const ask = { page: 'https://hand.anawj.com/babies/', text: 'Make this a table', on: 'Tap the one in front of you.', kind: 'paragraph', locator: '#x > p', options: true };

// not set up: 503, nothing sent
let r = await handleAsk(req('POST', ask, { 'Cf-Access-Jwt-Assertion': good }), {}, fake);
assert.equal(r.status, 503);
// the Access token is checked: missing, wrong audience, expired, wrong signer, unknown key
for (const t of [null, await token({ aud: ['other'], exp: later }), await token({ aud: ['aud1'], exp: 1 }),
  await token({ aud: ['aud1'], exp: later }, 'k1', (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign'])).privateKey),
  await token({ aud: ['aud1'], exp: later }, 'k9'), 'not.a.token']) {
  resetAccessCache();
  r = await handleAsk(req('POST', ask, t ? { 'Cf-Access-Jwt-Assertion': t } : {}), env, fake);
  assert.equal(r.status, 401, 'refused: ' + String(t).slice(0, 20));
}
assert.ok(!calls.some(c => c.url.includes('api.github.com')), 'nothing reaches GitHub without a valid sign-in');
assert.equal(await verifyAccess(good, env, fake), 'owner@example.com');

// a post from another site is refused; bad input is refused
r = await handleAsk(req('POST', ask, { 'Cf-Access-Jwt-Assertion': good, Origin: 'https://evil.example' }), env, fake); assert.equal(r.status, 403);
r = await handleAsk(req('POST', { ...ask, text: '  ' }, { 'Cf-Access-Jwt-Assertion': good }), env, fake); assert.equal(r.status, 400);
r = await handleAsk(req('POST', { ...ask, page: 'https://example.com/' }, { 'Cf-Access-Jwt-Assertion': good }), env, fake); assert.equal(r.status, 400);
r = await handleAsk(req('POST', { ...ask, text: 'x'.repeat(5000) }, { 'Cf-Access-Jwt-Assertion': good }), env, fake); assert.equal(r.status, 400);

// a good ask opens one "Page edits:" issue as the owner (the token's account), in the editor's report format
calls.length = 0;
r = await handleAsk(req('POST', ask, { 'Cf-Access-Jwt-Assertion': good, Origin: 'https://ask.anawj.com' }), env, fake);
assert.equal(r.status, 200);
assert.deepEqual(await r.json(), { issue: 501, url: 'https://github.com/flamingbeing/anawj-site/issues/501' });
const sent = calls.find(c => c.url === 'https://api.github.com/repos/flamingbeing/anawj-site/issues');
assert.equal(sent.init.headers.Authorization, 'Bearer test-token');
const issue = JSON.parse(sent.init.body);
assert.equal(issue.title, 'Page edits: hand.anawj.com/babies/ (owner, Ask Claude)');
assert.match(issue.body, /^Suggested by: the owner\nSent with Ask Claude/);
assert.match(issue.body, /## Page: https:\/\/hand\.anawj\.com\/babies\/\n\n### 1\. Comment \(paragraph\)\nOn:\n> Tap the one in front of you\.\nComment:\n> Make this a table\nWants options:/);
assert.match(issue.body, /Locator: `#x > p`/);

// following it: no PR yet, then the PR and its preview of the same page
r = await handleAsk(req('GET', null, { 'Cf-Access-Jwt-Assertion': good }, '?issue=600'), env, fake);
assert.deepEqual(await r.json(), { issue: 600, pr: null });
r = await handleAsk(req('GET', null, { 'Cf-Access-Jwt-Assertion': good }, '?issue=501&page=' + encodeURIComponent(ask.page)), env, fake);
assert.deepEqual(await r.json(), { issue: 501, pr: 502, prUrl: 'https://github.com/flamingbeing/anawj-site/pull/502',
  preview: 'https://page-edits-issue-501-anawj-preview.kohwenjun.workers.dev/_sites/hand.anawj.com/babies/' });
assert.equal(previewOf('page-edits/issue-9', 'https://anawj.com/privacy/'), 'https://page-edits-issue-9-anawj-preview.kohwenjun.workers.dev/privacy/');

// through the Worker: only ask.anawj.com/api/ask takes a POST; the page itself is served there
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const ASSETS = { async fetch(rq) { const f = path.join(root, decodeURIComponent(new URL(rq.url).pathname));
  return fs.existsSync(f) && fs.statSync(f).isFile() ? new Response(fs.readFileSync(f), { headers: { 'Content-Type': 'text/html' } }) : new Response('nope', { status: 404 }); } };
r = await worker.fetch(new Request('https://ask.anawj.com/api/ask', { method: 'POST', body: '{}' }), { ASSETS });
assert.equal(r.status, 503, 'not set up without secrets');
r = await worker.fetch(new Request('https://hand.anawj.com/api/ask', { method: 'POST', body: '{}' }), { ASSETS });
assert.equal(r.status, 405, 'no API anywhere else');
r = await worker.fetch(new Request('https://ask.anawj.com/'), { ASSETS });
assert.equal(r.status, 200); assert.match(await r.text(), /<title>Ask Claude<\/title>/);
r = await worker.fetch(new Request('https://ask.anawj.com/logbook/'), { ASSETS });
assert.equal(r.status, 404, 'ask.anawj.com serves only its own page');
console.log('ask tests passed');
