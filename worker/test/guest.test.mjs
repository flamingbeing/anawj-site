// Guest passcode sign-in (worker/guest.js): the passcode check, the signed custom token, the limits. Run: node worker/test/guest.test.mjs
import assert from 'node:assert/strict';
import { handleGuest, customToken, sameSecret } from '../guest.js';
import worker from '../sites.js';

const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pem = '-----BEGIN PRIVATE KEY-----\n' + Buffer.from(await crypto.subtle.exportKey('pkcs8', privateKey)).toString('base64').replace(/(.{64})/g, '$1\n') + '\n-----END PRIVATE KEY-----\n';
const env = { GUEST_PASSCODE: 'Open Sesame', GUEST_SA_EMAIL: 'guest@proj.iam.gserviceaccount.com', GUEST_SA_KEY: pem };
const req = (body, init = {}) => new Request('https://apmes.anawj.com/api/guest', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://apmes.anawj.com' }, body: typeof body === 'string' ? body : JSON.stringify(body), ...init });
let n = 0;
const t = async (name, fn) => { await fn(); n++; };

await t('the right passcode (any case) gets a token signed for Firebase', async () => {
  for (const p of ['Open Sesame', ' open sesame ']) {
    const r = await handleGuest(req({ passcode: p }), env);
    assert.equal(r.status, 200);
    const { token } = await r.json();
    const [h, b, s] = token.split('.');
    assert.equal(JSON.parse(Buffer.from(h, 'base64url')).alg, 'RS256');
    const c = JSON.parse(Buffer.from(b, 'base64url'));
    assert.equal(c.iss, env.GUEST_SA_EMAIL); assert.equal(c.sub, env.GUEST_SA_EMAIL);
    assert.equal(c.aud, 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit');
    assert.match(c.uid, /^g[0-9a-f]{24}$/); assert.deepEqual(c.claims, { guest: true });
    assert.ok(c.exp - c.iat <= 3600);
    assert.ok(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, Buffer.from(s, 'base64url'), new TextEncoder().encode(h + '.' + b)));
  }
});
await t('each guest gets a different id', async () => {
  const a = JSON.parse(Buffer.from((await (await handleGuest(req({ passcode: 'open sesame' }), env)).json()).token.split('.')[1], 'base64url')).uid;
  const b = JSON.parse(Buffer.from((await (await handleGuest(req({ passcode: 'open sesame' }), env)).json()).token.split('.')[1], 'base64url')).uid;
  assert.notEqual(a, b);
});
await t('a wrong, empty or missing passcode is refused', async () => {
  for (const body of [{ passcode: 'nope' }, { passcode: '' }, {}, { passcode: 5 }]) assert.equal((await handleGuest(req(body), env)).status, 401);
  assert.equal((await handleGuest(req('not json'), env)).status, 400);
});
await t('not set up answers 503, never a token', async () => {
  for (const k of Object.keys(env)) assert.equal((await handleGuest(req({ passcode: 'open sesame' }), { ...env, [k]: '' })).status, 503);
});
await t('only POST, only from the page itself', async () => {
  assert.equal((await handleGuest(new Request('https://apmes.anawj.com/api/guest'), env)).status, 405);
  assert.equal((await handleGuest(req({ passcode: 'open sesame' }, { headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' } }), env)).status, 403);
});
await t('the rate limit answers 429 without checking the passcode', async () => {
  const limited = { ...env, GUEST_LIMIT: { limit: async () => ({ success: false }) } };
  assert.equal((await handleGuest(req({ passcode: 'open sesame' }), limited)).status, 429);
});
await t('sameSecret compares by value', async () => {
  assert.equal(await sameSecret('abc', 'abc'), true); assert.equal(await sameSecret('abc', 'abd'), false); assert.equal(await sameSecret('abc', 'abcd'), false);
});
await t('only apmes.anawj.com/api/guest reaches it', async () => {
  const ASSETS = { fetch: async () => new Response('x') };
  assert.equal((await worker.fetch(req({ passcode: 'open sesame' }), { ...env, ASSETS })).status, 200);
  const other = await worker.fetch(new Request('https://nuhroster.anawj.com/api/guest', { method: 'POST', body: '{}' }), { ...env, ASSETS });
  assert.equal(other.status, 405);
});
console.log(`guest sign-in: ${n} groups passed`);
