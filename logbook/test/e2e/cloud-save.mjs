// Fake data and fake Google / Dropbox only. Save to Drive / Dropbox leaves for the sign-in page and comes back:
// the save finishes on return, the address is tidied to #data, demo mode survives, and a mismatched state saves nothing.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const uploads = [];
  let tamper = false;
  // the sign-in pages answer at once, the way Google (#fragment) and Dropbox (?query) do
  await ctx.route('https://accounts.google.com/o/oauth2/v2/auth?*', route => {
    const q = new URL(route.request().url()).searchParams;
    route.fulfill({ status: 302, headers: { location: `${q.get('redirect_uri')}#state=${tamper ? 'gdr-wrong' : q.get('state')}&access_token=FAKE&expires_in=3599&token_type=Bearer` } });
  });
  await ctx.route('https://www.dropbox.com/oauth2/authorize?*', route => {
    const q = new URL(route.request().url()).searchParams;
    assert.equal(q.get('code_challenge_method'), 'S256');
    route.fulfill({ status: 302, headers: { location: `${q.get('redirect_uri')}?code=FAKECODE&state=${q.get('state')}` } });
  });
  await ctx.route('https://www.googleapis.com/**', route => {
    const req = route.request(), url = req.url();
    assert.equal(req.headers().authorization, 'Bearer FAKE');
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/upload/')) { uploads.push('drive'); return json(route, { id: 'F' }); }
    if (req.method() === 'POST') return json(route, { id: 'DIR' });
    return json(route, { files: [] });
  });
  await ctx.route('https://api.dropboxapi.com/oauth2/token', route => {
    assert.match(route.request().postData(), /code=FAKECODE/);
    assert.match(route.request().postData(), /code_verifier=[A-Za-z0-9_-]{43}/);
    json(route, { access_token: 'DBX', expires_in: 14400 });
  });
  await ctx.route('https://content.dropboxapi.com/**', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    assert.equal(route.request().headers().authorization, 'Bearer DBX');
    uploads.push('dropbox'); json(route, { name: 'x' });
  });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  const openBackup = async () => { await p.waitForURL(/\?demo#data$/); for (const s of await p.locator('details:not([open]) > summary').all()) await s.click().catch(() => {}); };
  await p.goto(base + '?demo#data'); await p.waitForSelector('main'); await openBackup();

  await p.getByRole('button', { name: 'Save to Google Drive', exact: true }).click();
  await p.getByText(/Saved to Google Drive: 1 file/).waitFor();
  await openBackup();
  assert.deepEqual(uploads, ['drive']);
  assert.equal(await p.evaluate(() => sessionStorage.length + (localStorage.getItem('apmes-logbook-cloud-pending') ? 1 : 0)), 0);
  // the token lasts the visit: a second save goes straight up
  await p.getByRole('button', { name: 'Save to Google Drive', exact: true }).click();
  await p.waitForFunction(() => document.body.innerText.includes('Saved to Google Drive'));
  await p.waitForTimeout(500); assert.deepEqual(uploads, ['drive', 'drive']); assert.match(p.url(), /\?demo#data$/);

  await p.getByRole('button', { name: 'Save to Dropbox', exact: true }).click();
  await p.getByText(/Saved to Dropbox: 1 file/).waitFor();
  await openBackup();
  assert.deepEqual(uploads, ['drive', 'drive', 'dropbox']);

  // a state that isn't the one we sent saves nothing
  await p.reload(); await openBackup(); tamper = true;
  await p.getByRole('button', { name: 'Save to Google Drive', exact: true }).click();
  await p.getByText(/the sign-in didn’t match/).waitFor();
  assert.equal(uploads.length, 3);

  assert.deepEqual(errors, []); await ctx.close(); console.log(`PASS cloud save ${width === 390 ? 'phone' : 'desktop'}`);
} } finally { await b.close(); }
