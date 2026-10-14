// "Ask Claude" (edit/NOTES.md): the API behind ask.anawj.com, the owner's page for asking for a change in one step.
//   POST /api/ask          {page, on, locator, text, options, everywhere} -> opens a "Page edits:" issue as the owner,
//                          which starts the instant page-edits workflow (.github/workflows/page-edits.yml) -> {issue, url}
//   GET  /api/ask?issue=N  -> {issue, pr, prUrl, preview} once the workflow has drafted its PR
// Only on ask.anawj.com, which Cloudflare Access puts behind the owner's sign-in; every request is checked again here
// (the Access token's signature and audience). Secrets, set in Cloudflare (never in this repo): GITHUB_ISSUES_TOKEN
// (a fine-grained token: this repo only, Issues read/write, Pull requests read), ACCESS_TEAM, ACCESS_AUD.
// Without them it answers 503 "not set up". It stores nothing.

export const ASK_HOST = 'ask.anawj.com';
const REPO = 'flamingbeing/anawj-site';
const PREVIEW = 'anawj-preview.kohwenjun.workers.dev';
const LIMIT = { page: 500, on: 2000, locator: 500, text: 4000 };

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });

export async function handleAsk(request, env, fetchImpl = fetch) {
  // which secrets the Worker can't see (names only, never values), so a setup slip is easy to find
  const missing = ['GITHUB_ISSUES_TOKEN', 'ACCESS_TEAM', 'ACCESS_AUD'].filter(k => !env[k]);
  if (missing.length) return json({ error: `Ask Claude is not set up yet: the Worker has no ${missing.join(', ')} (Cloudflare → anawj-preview → Settings → Variables and Secrets; type Secret, then Deploy).` }, 503);
  const who = await verifyAccess(request.headers.get('Cf-Access-Jwt-Assertion'), env, fetchImpl);
  if (!who) return json({ error: 'Sign in first (this page is only for the owner).' }, 401);
  const url = new URL(request.url);
  if (request.method === 'POST') {
    // only from the page itself (a form on another site can't use the owner's sign-in to post here)
    const origin = request.headers.get('Origin');
    if (origin && origin !== `https://${ASK_HOST}`) return json({ error: 'Wrong origin.' }, 403);
    let b;
    try { b = await request.json(); } catch (e) { return json({ error: 'Not JSON.' }, 400); }
    const field = (k) => typeof b[k] === 'string' ? b[k].trim() : '';
    const page = field('page'), text = field('text');
    if (!text) return json({ error: 'Say what should change.' }, 400);
    for (const [k, n] of Object.entries(LIMIT)) if (field(k).length > n) return json({ error: `${k} is too long.` }, 400);
    let pageUrl;
    try { pageUrl = new URL(page); } catch (e) { return json({ error: 'Which page? (a full address)' }, 400); }
    if (!/(^|\.)anawj\.com$|\.workers\.dev$/.test(pageUrl.hostname)) return json({ error: 'Only pages on anawj.com.' }, 400);
    const res = await gh(fetchImpl, env, `/repos/${REPO}/issues`, { method: 'POST', body: JSON.stringify({ title: issueTitle(pageUrl), body: issueBody(b, pageUrl) }) });
    if (!res.ok) return json({ error: `GitHub said ${res.status}.` }, 502);
    const issue = await res.json();
    return json({ issue: issue.number, url: issue.html_url });
  }
  if (request.method === 'GET') {
    const n = Number(url.searchParams.get('issue'));
    if (!Number.isInteger(n) || n <= 0) return json({ error: 'Which issue?' }, 400);
    const res = await gh(fetchImpl, env, `/repos/${REPO}/issues/${n}/comments?per_page=50`);
    if (!res.ok) return json({ error: `GitHub said ${res.status}.` }, 502);
    // the workflow comments the PR's link on the issue
    const linked = (await res.json()).map(c => c.body || '').join('\n').match(new RegExp(`https://github\\.com/${REPO}/pull/(\\d+)`));
    if (!linked) return json({ issue: n, pr: null });
    const pr = Number(linked[1]);
    const pres = await gh(fetchImpl, env, `/repos/${REPO}/pulls/${pr}`);
    const head = pres.ok ? (await pres.json()).head?.ref : '';
    return json({ issue: n, pr, prUrl: `https://github.com/${REPO}/pull/${pr}`, preview: head ? previewOf(head, url.searchParams.get('page')) : null });
  }
  return json({ error: 'Method not allowed.' }, 405);
}

const gh = (fetchImpl, env, path, init = {}) => fetchImpl('https://api.github.com' + path, {
  ...init, headers: { Authorization: `Bearer ${env.GITHUB_ISSUES_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'anawj-ask', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
});

// the PR's preview of the same page: Workers Builds names a branch's preview after it ("page-edits/issue-9" ->
// page-edits-issue-9-anawj-preview…); pages on a subdomain are reached through /_sites/<host>/ there (worker/routes.js)
export function previewOf(branch, page) {
  const base = `https://${branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${PREVIEW}`;
  try {
    const u = new URL(page);
    const path = u.pathname + u.search;
    return u.hostname === 'anawj.com' || u.hostname === 'www.anawj.com' || u.hostname.endsWith('.workers.dev') ? base + path : `${base}/_sites/${u.hostname}${path}`;
  } catch (e) { return base + '/'; }
}

export function issueTitle(u) { return `Page edits: ${u.host}${u.pathname} (owner, Ask Claude)`.slice(0, 200); }

export function issueBody(b, u) {
  const q = s => String(s).split('\n').map(l => '> ' + l).join('\n');
  let out = `Suggested by: the owner\nSent with Ask Claude (ask.anawj.com), 1 change.\n\n## Page: ${u.href}\n\n### 1. Comment${b.kind ? ` (${String(b.kind).slice(0, 40)})` : ''}\n`;
  if (b.on) out += `On:\n${q(String(b.on).trim())}\n`;
  out += `Comment:\n${q(String(b.text).trim())}\n`;
  if (b.options) out += 'Wants options: make 2–3 clearly different versions to choose from, each with its own preview link.\n';
  if (b.everywhere) out += 'Everywhere: apply this wherever it occurs on the site, and list every place changed.\n';
  if (b.locator) out += `Locator: \`${String(b.locator).trim().replace(/`/g, '')}\`\n`;
  return out;
}

// ---- Cloudflare Access: the signed token Access adds to every request it lets through
let certs = null, certsAt = 0;
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
export async function verifyAccess(token, env, fetchImpl = fetch, now = Date.now()) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let head, claims;
  try { head = JSON.parse(new TextDecoder().decode(b64u(parts[0]))); claims = JSON.parse(new TextDecoder().decode(b64u(parts[1]))); } catch (e) { return null; }
  if (head.alg !== 'RS256') return null;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(env.ACCESS_AUD) || !(claims.exp * 1000 > now)) return null;
  if (claims.iss && claims.iss !== `https://${env.ACCESS_TEAM}.cloudflareaccess.com`) return null;
  if (!certs || now - certsAt > 3600e3) {
    const r = await fetchImpl(`https://${env.ACCESS_TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`);
    if (!r.ok) return null;
    certs = (await r.json()).keys || []; certsAt = now;
  }
  const jwk = certs.find(k => k.kid === head.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  return ok ? (claims.email || 'signed in') : null;
}
export function resetAccessCache() { certs = null; certsAt = 0; }
