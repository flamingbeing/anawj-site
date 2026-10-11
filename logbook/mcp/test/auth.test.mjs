// Run with: node logbook/mcp/test/auth.test.mjs  (no network: fetch is stubbed; temp token file)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { readToken, writeToken, deleteToken, makeSession, refreshIdToken, pkce, authUrl, login, NotSignedInError } from '../lib/auth.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apmes-mcp-test-'));
const file = path.join(dir, 'sub', 'token.json');

// token file: only refresh token + email, mode 0600
assert.equal(readToken(file), null);
writeToken({ refreshToken: 'R1', email: 'Res@Example.com', idToken: 'never stored' }, file);
assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { refreshToken: 'R1', email: 'res@example.com' });
if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
assert.deepEqual(readToken(file), { refreshToken: 'R1', email: 'res@example.com' });

// refresh
const calls = [];
let clock = 0;
const fetch = async (url, init) => {
  calls.push({ url, init });
  const body = new URLSearchParams(init.body);
  if (body.get('refresh_token') === 'BAD') return { ok: false, status: 400, json: async () => ({ error: { message: 'INVALID_REFRESH_TOKEN' } }) };
  return { ok: true, status: 200, json: async () => ({ id_token: `ID${calls.length}`, refresh_token: 'R2', expires_in: '3600' }) };
};
const r = await refreshIdToken({ fetch, apiKey: 'KEY', refreshToken: 'R1' });
assert.deepEqual(r, { idToken: 'ID1', refreshToken: 'R2', expiresIn: 3600 });
assert.equal(calls[0].url, 'https://securetoken.googleapis.com/v1/token?key=KEY');
assert.equal(new URLSearchParams(calls[0].init.body).get('grant_type'), 'refresh_token');

const s = makeSession({ fetch, apiKey: 'KEY', tokenFile: file, now: () => clock });
assert.equal(s.email, 'res@example.com');
assert.equal(await s.getIdToken(), 'ID2');
assert.equal(await s.getIdToken(), 'ID2', 'cached');
assert.equal(readToken(file).refreshToken, 'R2', 'rotated refresh token saved');
clock = 3600_000 - 30_000;   // within a minute of expiry
assert.equal(await s.getIdToken(), 'ID3');
assert.equal(await s.getIdToken(true), 'ID4', 'force refresh');

writeToken({ refreshToken: 'BAD', email: 'res@example.com' }, file);
await assert.rejects(() => makeSession({ fetch, apiKey: 'KEY', tokenFile: file }).getIdToken(), NotSignedInError);

assert.equal(deleteToken(file), true);
assert.equal(deleteToken(file), false);
assert.throws(() => makeSession({ fetch, apiKey: 'KEY', tokenFile: file }), NotSignedInError);

// PKCE and the auth URL
const p = pkce();
assert.match(p.verifier, /^[A-Za-z0-9_-]{43}$/);
assert.equal(p.challenge, crypto.createHash('sha256').update(p.verifier).digest('base64url'));
assert.notEqual(p.state, pkce().state);
const u = new URL(authUrl({ clientId: 'CID', redirectUri: 'http://127.0.0.1:5555', challenge: p.challenge, state: p.state }));
assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
assert.equal(u.searchParams.get('scope'), 'openid email');
assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
assert.equal(u.searchParams.get('redirect_uri'), 'http://127.0.0.1:5555');
assert.equal(u.searchParams.get('state'), p.state);

// login: loopback redirect on 127.0.0.1 (local only), Google + Firebase stubbed
const seen = [];
const stub = async (url, init) => {
  seen.push({ url, body: init.body });
  if (url === 'https://oauth2.googleapis.com/token') return { ok: true, status: 200, json: async () => ({ id_token: 'GOOGLE_ID' }) };
  if (url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=KEY')) {
    return { ok: true, status: 200, json: async () => ({ idToken: 'FB_ID', refreshToken: 'FB_R', email: 'Res@Example.com', expiresIn: '3600' }) };
  }
  throw new Error('unexpected ' + url);
};
const redirectTo = (params) => async url => {
  const a = new URL(url);
  const back = new URL(a.searchParams.get('redirect_uri'));
  for (const [k, v] of Object.entries(params(a))) back.searchParams.set(k, v);
  await globalThis.fetch(back).then(r => r.text());
};
const out = await login({ clientId: 'CID', clientSecret: 'CSECRET', apiKey: 'KEY', fetch: stub, tokenFile: file, log: () => {},
  open: redirectTo(a => ({ code: 'CODE', state: a.searchParams.get('state') })) });
assert.deepEqual(out, { email: 'res@example.com' });
assert.deepEqual(readToken(file), { refreshToken: 'FB_R', email: 'res@example.com' });
const ex = new URLSearchParams(seen[0].body);
assert.equal(ex.get('code'), 'CODE'); assert.equal(ex.get('client_secret'), 'CSECRET');
assert.equal(ex.get('grant_type'), 'authorization_code'); assert.match(ex.get('code_verifier'), /^[A-Za-z0-9_-]{43}$/);
assert.match(ex.get('redirect_uri'), /^http:\/\/127\.0\.0\.1:\d+$/);
const idp = JSON.parse(seen[1].body);
assert.deepEqual(idp, { postBody: 'id_token=GOOGLE_ID&providerId=google.com', requestUri: 'http://localhost', returnSecureToken: true });
await assert.rejects(() => login({ clientId: 'CID', clientSecret: 'S', apiKey: 'KEY', fetch: stub, tokenFile: file, log: () => {},
  open: redirectTo(() => ({ code: 'CODE', state: 'forged' })) }), /state mismatch/);

fs.rmSync(dir, { recursive: true, force: true });
console.log('auth.test.mjs: ok');
