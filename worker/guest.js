// Guest passcode sign-in for the applicants app (applicants/NOTES.md): POST apmes.anawj.com/api/guest {passcode} answers
// {token}, a Firebase custom token that signs the person in as an anonymous guest (claim guest: true, no email). The rules
// (logbook/firestore.rules, isGuest) let a guest read the selection round and write only their own response there, nothing else.
// Secrets, set in Cloudflare (never in this repo): GUEST_PASSCODE, GUEST_SA_EMAIL and GUEST_SA_KEY (the PEM private key of a
// service account in the Firebase project that has no roles: it only signs the tokens). Optional binding GUEST_LIMIT (a Workers
// rate limit) caps tries per address. Without the secrets it answers 503. It stores nothing.

export const GUEST_HOST = 'apmes.anawj.com';
export const GUEST_PATH = '/api/guest';
const AUD = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text64 = s => b64url(new TextEncoder().encode(s));

// compares two strings without leaking where they differ (both hashed first, so the length doesn't leak either)
export async function sameSecret(a, b) {
  const h = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([h(String(a)), h(String(b))]);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export async function customToken(env, uid, now = Math.floor(Date.now() / 1000)) {
  const pem = env.GUEST_SA_KEY.replace(/\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const head = text64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = text64(JSON.stringify({ iss: env.GUEST_SA_EMAIL, sub: env.GUEST_SA_EMAIL, aud: AUD, iat: now, exp: now + 3600, uid, claims: { guest: true } }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

export async function handleGuest(request, env) {
  if (request.method !== 'POST') return json({ error: 'POST only.' }, 405);
  const missing = ['GUEST_PASSCODE', 'GUEST_SA_EMAIL', 'GUEST_SA_KEY'].filter(k => !env[k]);
  if (missing.length) return json({ error: 'Guest sign-in is not set up yet.' }, 503);
  const origin = request.headers.get('Origin');
  if (origin && origin !== `https://${GUEST_HOST}`) return json({ error: 'Wrong origin.' }, 403);
  if (env.GUEST_LIMIT) {
    const { success } = await env.GUEST_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
    if (!success) return json({ error: 'Too many tries.' }, 429);
  }
  let b;
  try { b = await request.json(); } catch { return json({ error: 'Not JSON.' }, 400); }
  const given = typeof b?.passcode === 'string' ? b.passcode.trim().slice(0, 100) : '';
  if (!given || !(await sameSecret(given.toLowerCase(), String(env.GUEST_PASSCODE).trim().toLowerCase()))) return json({ error: 'Wrong passcode.' }, 401);
  const uid = 'g' + Array.from(crypto.getRandomValues(new Uint8Array(12)), x => x.toString(16).padStart(2, '0')).join('');
  try { return json({ token: await customToken(env, uid) }); }
  catch (e) { console.error('guest token failed', e?.name, e?.message); return json({ error: 'Couldn’t sign in (' + (e?.name || 'error') + ': ' + String(e?.message || '').slice(0, 120) + ').' }, 500); }
}
