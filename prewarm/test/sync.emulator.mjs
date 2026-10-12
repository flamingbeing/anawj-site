// Two phones sharing a patient through the local Firebase emulators (fake data, demo project "demo-prewarm"; never
// the live project). Run from the repo root with a static server on port 8080 (python3 -m http.server 8080):
//   ~/.cache/anawj-rules/node_modules/.bin/firebase emulators:exec --only firestore,auth --project demo-prewarm \
//     --config <firebase.json with prewarm/firestore.rules, firestore 8085, auth 9099> "node prewarm/test/sync.emulator.mjs"
// tools/test-prewarm-sync.sh does all of that.
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
const SHOTS = process.env.SHOTS;
const BASE = `http://localhost:${process.env.PORT || 8080}/prewarm/?emulator`;
const FS = 'http://127.0.0.1:8085/v1/projects/demo-prewarm/databases/(default)/documents';

// the NUH join code, written past the rules (emulator only)
const put = await fetch(`${FS}/codes/NUH`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { code: { stringValue: 'NUH-TEST-CODE' }, setAt: { integerValue: '1' }, setBy: { stringValue: 'lead@example.com' } } }) });
assert.ok(put.ok, 'seed code: ' + put.status);
const adm = await fetch(`${FS}/admins/lead@example.com`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { name: { stringValue: 'Lead' } } }) });
assert.ok(adm.ok, 'seed admin: ' + adm.status);

const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const errors = [];
async function phone(initials) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(initials + ': ' + e.message));
  await page.goto(BASE + '#/settings');
  await page.waitForSelector('body[data-cloud=ready]');
  await page.fill('#me', initials); await page.dispatchEvent('#me', 'change');
  return page;
}
const toastSays = (page, re) => page.waitForFunction(r => new RegExp(r).test(document.querySelector('#toast')?.textContent || ''), re.source, { timeout: 15000 })
  .catch(async e => { throw new Error(`waited for ${re}, toast says: ${await page.textContent('#toast')}`); });

try {
  const a = await phone('AA');
  // wrong code is refused
  await a.fill('#code', 'WRONG-CODE'); await a.click('#join');
  await toastSays(a, /isn’t a join code/);
  await a.fill('#code', 'NUH-WRONG123'); await a.click('#join');
  await toastSays(a, /isn’t right for NUH/);
  if (!(await a.$('#code'))) throw new Error('after wrong code: ' + (await a.textContent('main')).replace(/\s+/g, ' ').slice(0, 300));
  if (SHOTS) await a.screenshot({ path: SHOTS + '/sync-join.png', fullPage: true });
  await a.fill('#code', 'nuh-test-code'); await a.click('#join');
  await toastSays(a, /Joined the NUH team/);
  assert.match(await a.textContent('main'), /Sharing with the NUH team/);
  if (SHOTS) await a.screenshot({ path: SHOTS + '/sync-joined.png' });

  // phone A starts a patient and saves the 0-min pre-warming reading
  await a.goto(BASE + '#/new');
  await a.fill('#sid', 'SYNC-01'); await a.click('.seg .chip[data-v="1"]'); await a.click('button[type=submit]');
  await a.waitForSelector('.times');
  await a.click('.num[data-type="core"]'); await a.click('.num[data-type="core"]'); await a.fill('input.num', '366'); await a.keyboard.press('Enter');
  await a.click('#save');
  await toastSays(a, /0 min saved/);

  // phone B joins and sees it
  const bb = await phone('BB');
  await bb.fill('#code', 'NUH-TEST-CODE'); await bb.click('#join');
  await toastSays(bb, /Joined the NUH team/);
  await bb.goto(BASE + '#/');
  await bb.waitForFunction(() => /SYNC-01/.test(document.querySelector('.list')?.textContent || ''), null, { timeout: 15000 });
  await bb.click('.list a');
  await bb.click('.textlinks a[href$="/sheet"]');
  await bb.waitForFunction(() => /36\.6/.test(document.querySelector('.sheet')?.textContent || ''), null, { timeout: 15000 });

  // phone B adds the 5-min reading; phone A gets it
  await bb.goto(bb.url().replace('/sheet', '/prewarm/5'));
  await bb.click('[data-step="1"][data-c="core"]');
  await bb.click('#save');
  await a.goto(BASE + '#/');
  await a.click('.list a'); await a.click('.textlinks a[href$="/sheet"]');
  await a.waitForFunction(() => /36\.7/.test(document.querySelector('.sheet')?.textContent || ''), null, { timeout: 15000 });

  // an admin signs in with an emailed link and makes a join code
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const ad = await ctx.newPage();
  ad.on('pageerror', e => errors.push('admin: ' + e.message));
  await ad.goto(BASE + '#/settings');
  await ad.waitForSelector('body[data-cloud=ready]');
  await ad.click('#adminin');
  await ad.fill('#adminemail', 'Lead@Example.com');
  await ad.click('#adminsend');
  await ad.waitForFunction(() => /Sign-in link sent/.test(document.querySelector('main').textContent), null, { timeout: 15000 });
  const oob = await (await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-prewarm/oobCodes')).json();
  const link = oob.oobCodes.filter(c => c.requestType === 'EMAIL_SIGNIN').pop();
  assert.equal(link.email, 'lead@example.com');
  await ad.goto(BASE + '&adminlink&mode=signIn&lang=en&apiKey=fake-api-key&oobCode=' + encodeURIComponent(link.oobCode));
  await ad.waitForFunction(() => /NUH-TEST-CODE/.test(document.querySelector('main')?.textContent || '') && location.hash === '#/admin', null, { timeout: 20000 })
    .catch(async () => { throw new Error('admin page: ' + ad.url() + ' | ' + (await ad.textContent('main')).replace(/\s+/g, ' ').slice(0, 300) + ' | toast: ' + await ad.textContent('#toast')); });
  assert.doesNotMatch(ad.url(), /oobCode/, 'the one-time code leaves the address bar');
  assert.match(await ad.textContent('main'), /NUH-TEST-CODE/);
  assert.match(await ad.textContent('main'), /AA/, 'members listed');
  await ad.click('[data-newcode="WH"]');
  await ad.waitForFunction(() => /WH-[A-Z2-9]{8}/.test(document.querySelector('main').textContent), null, { timeout: 15000 });
  // QR code and join link for WH
  await ad.click('[data-qr="WH"]');
  await ad.waitForSelector('#qr-WH svg');
  if (SHOTS) await ad.screenshot({ path: SHOTS + '/admin.png', fullPage: true });
  const wh = (await ad.textContent('main')).match(/WH-[A-Z2-9]{8}/)[0];
  // a new phone opens the WH join link: no code to type
  const c = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  c.on('pageerror', e => errors.push('C: ' + e.message));
  await c.goto(`${BASE}#/join/WH/${wh}`);
  await c.waitForSelector('#joinlink');
  await c.waitForSelector('body[data-cloud=ready]');
  if (SHOTS) await c.screenshot({ path: SHOTS + '/join-link.png' });
  await c.fill('#me', 'cc');
  await c.click('#joinlink');
  await toastSays(c, /Joined the WH team/);
  assert.doesNotMatch(c.url(), /WH-/, 'the code leaves the address bar');
  await c.goto(BASE + '#/settings');
  await c.waitForFunction(() => /Sharing with the WH team/.test(document.querySelector('main')?.textContent || ''), null, { timeout: 15000 });
  // a wrong link is refused
  const d = await (await b.newContext()).newPage();
  await d.goto(`${BASE}#/join/WH/WH-WRONG123`);
  await d.waitForSelector('body[data-cloud=ready]');
  await d.fill('#me', 'dd'); await d.click('#joinlink');
  await toastSays(d, /isn’t right for WH/);
  // the admin sees the NUH patient
  await ad.goto(BASE + '#/');
  await ad.waitForFunction(() => /SYNC-01/.test(document.querySelector('.list')?.textContent || ''), null, { timeout: 15000 });

  assert.deepEqual(errors, []);
  console.log('prewarm sync: ok (two phones, join code, readings both ways, admin email-link sign-in, codes, join link and QR)');
} finally {
  await b.close();
}
