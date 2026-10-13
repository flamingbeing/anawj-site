// Edge cases the main e2e doesn't cover (demo mode, fake data only):
//   1. the old anawj.com/evals/ address forwards to apmes.anawj.com/evals/ with path, query and # kept,
//      and doesn't forward inside a frame (the page editor) or anywhere else;
//   2. signing out removes the assessor's unsent answers kept on the phone (shared ward computers);
//   3. dark theme: the main screens have no sideways scroll and no unreadable toast;
//   4. an assessor link opened signed out says what it is, and in WhatsApp's browser explains how to sign in.
// Run like e2e.spec.mjs: a static server on the repo root at 8110, then  node evals/test/edge.e2e.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const { readFileSync } = await import('node:fs');
const B = process.env.BASE || 'http://localhost:8110/evals/';
const ROOT = new URL('../../', import.meta.url).pathname;

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('  ok  ' + msg); else { fails++; console.log('  FAIL ' + msg); } };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const phone = (extra = {}) => browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', ...extra });

// 1. forward from anawj.com, served from this checkout
{
  const ctx = await phone();
  const p = await ctx.newPage();
  const seen = [];
  await ctx.route(/^https:\/\/(www\.)?anawj\.com\//, route => {
    const path = new URL(route.request().url()).pathname;
    const file = ROOT + path.replace(/^\//, '') + (path.endsWith('/') ? 'index.html' : '');
    try { route.fulfill({ body: readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : undefined }); }
    catch { route.fulfill({ status: 404, body: '' }); }
  });
  await ctx.route(/^https:\/\/apmes\.anawj\.com\//, route => { seen.push(route.request().url()); route.fulfill({ body: '<p>apmes</p>', contentType: 'text/html' }); });
  await p.goto('https://anawj.com/evals/?as=dr%40x.com#e/abc123');
  await p.waitForURL(/apmes\.anawj\.com/, { timeout: 10000 }).catch(() => {});
  ok(p.url() === 'https://apmes.anawj.com/evals/?as=dr%40x.com#e/abc123', 'anawj.com/evals/ forwards with path, query and # kept');
  const p2 = await ctx.newPage();
  await p2.goto('https://anawj.com/');
  await p2.setContent('<iframe src="https://anawj.com/evals/#pending"></iframe>');
  await p2.waitForTimeout(1500);
  ok(p2.frames().some(f => /anawj\.com\/evals\//.test(f.url()) && !/apmes/.test(f.url())), 'no forward inside a frame (page editor)');
  await ctx.close();
}

// 2. sign-out clears the assessor's unsent answers on this phone
{
  const ctx = await phone();
  const p = await ctx.newPage();
  await p.goto(B + '?demo=assessor#pending');
  await p.waitForSelector('a[href^="#e/"]', { timeout: 15000 });
  await p.locator('a[href^="#e/"]').first().click();
  await p.waitForSelector('.e-q', { timeout: 10000 });
  await p.locator('.e-q input[type="radio"]').first().check({ force: true });
  await p.waitForTimeout(400);
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const before = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('evals-draft-')).length);
  ok(before > 0, 'an answer is kept on the phone while filling the form');
  await p.evaluate(() => { location.hash = '#more'; });
  await p.getByRole('button', { name: /Sign out/ }).click();
  await p.waitForTimeout(800);
  const after = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('evals-draft-')).length);
  ok(after === 0, 'signing out removes the unsent answers kept on the phone');
  await ctx.close();
}

// 3. dark theme: no sideways scroll; toast text readable
{
  const ctx = await phone();
  await ctx.addInitScript(() => { try { localStorage.setItem('evals-theme', 'dark'); } catch {} });
  const p = await ctx.newPage();
  for (const [role, hash] of [['', 'home'], ['', 'progress'], ['=assessor', 'pending'], ['=admin', 'admin']]) {
    await p.goto(`${B}?demo${role}#${hash}`);
    await p.waitForTimeout(1200);
    const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!wide, `dark ${hash}: no sideways scroll`);
  }
  const contrast = await p.evaluate(() => {
    const t = document.getElementById('toast') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'toast' }));
    const cs = getComputedStyle(t);
    const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const L = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const a = L(rgb(cs.color)), b = L(rgb(cs.backgroundColor));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  ok(contrast >= 4.5, `dark toast contrast ${contrast.toFixed(1)}:1`);
  await ctx.close();
}

// 4. assessor link, signed out (the real sign-in page, not the demo)
{
  const wa = 'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 WhatsApp/2.24';
  for (const [ua, inApp] of [[null, false], [wa, true]]) {
    const ctx = await phone(ua ? { userAgent: ua } : {});
    const p = await ctx.newPage();
    await p.goto(B + '?as=dr.tan%40example.com#e/abc123');
    await p.waitForSelector('.e-landing', { timeout: 15000 }).catch(() => {});
    const text = (await p.textContent('body')) || '';
    ok(/A resident asked you for an evaluation/.test(text) && /dr\.tan@example\.com/.test(text), `${inApp ? 'WhatsApp' : 'browser'}: assessor landing names the account`);
    ok(/Open this in Chrome or Safari/.test(text) === inApp, `${inApp ? 'WhatsApp' : 'browser'}: ${inApp ? 'shows' : 'no'} "Open in Chrome or Safari"`);
    await ctx.close();
  }
}

await browser.close();
console.log(fails ? `${fails} of ${checks} edge checks FAILED` : `${checks} edge checks passed`);
process.exit(fails ? 1 : 0);
