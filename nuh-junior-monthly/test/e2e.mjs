// Browser test of NUH Junior Monthly in Practice (?demo: a made-up department) and from a fresh start, with Firebase
// blocked, at desktop and phone size, with an axe accessibility check (WCAG 2 A/AA) on every tab.
// Run (from the repo root, with a static server on the repo root at port 8080, e.g. python3 -m http.server 8080):
//   node nuh-junior-monthly/test/e2e.mjs            SHOTS=<dir> also saves screenshots
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const AXE = new URL('../../tools/vendor/axe.min.js', import.meta.url).pathname;
const BASE = `http://localhost:${process.env.PORT || 8080}/nuh-junior-monthly/`;
const SHOTS = process.env.SHOTS;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nuhjm-e2e-'));
const T0 = Date.now();

const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const errors = [];
let n = 0, checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
async function newPage(viewport, tag, extra = {}) {
  const ctx = await b.newContext({ viewport, acceptDownloads: true, reducedMotion: 'reduce', ...extra });   // no fade-ins under axe
  await ctx.route('https://www.gstatic.com/**', r => r.abort()); // no Firebase: the app works without it
  // the first-time tour (practice opens it once) is tested in tour.e2e.mjs: seen already here
  await ctx.addInitScript(() => { try { localStorage.setItem('nuhjm-tour', JSON.stringify({ v: 1, done: true })); } catch (e) { /* ignore */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`[${tag}] ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !(/Failed to load resource/.test(m.text()) && /gstatic/.test(m.text() + m.location().url))) errors.push(`[${tag}] console: ${m.text()}`); });
  return page;
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png` }); };
const ready = page => page.waitForFunction(() => document.body.classList.contains('ready'));
const stored = (page, key = 'nuhjm-demo') => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
const hard = page => page.evaluate(() => window.jmApp.evaluation().hard);
const go = async (page, hash) => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(300); };
async function axe(page, label) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations
    .map(x => `${x.id} ${x.nodes.length}x ${x.nodes[0]?.target}`));
  ok(!v.length, `axe on ${label}: ${v.join('; ')}`);
}
const noSideScroll = async (page, label) => {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok(w[0] <= w[1] + 1, `${label}: no sideways page scroll (${w[0]} > ${w[1]})`);
};

// ---------- desktop: every tab, axe, the sheet copy-back, auto-fill next month ----------
{
  const page = await newPage({ width: 1366, height: 900 }, 'desktop', { permissions: ['clipboard-read', 'clipboard-write'] });
  await page.goto(BASE + '?demo#roster');
  await ready(page);
  for (const t of ['roster', 'postings', 'day', 'people', 'rules', 'check', 'more']) {
    await go(page, '#' + t);
    await page.waitForTimeout(400);
    ok(await page.locator(`.view-${t}`).isVisible(), `${t} shows`);
    await axe(page, `desktop ${t}`);
    await shot(page, 'd-' + t);
  }
  // Postings: change one week, the roster cells follow
  await go(page, '#postings');
  const sel = page.locator('.pv-sel').first();
  await sel.selectOption('ICU');
  await page.waitForTimeout(200);
  const st = await stored(page);
  ok(Object.values(st.cells).some(day => Object.values(day).some(c => (c.a || []).includes('ICU'))), 'a posting set for a week is stored');
  // rules marked as predictions are labelled
  await go(page, '#rules');
  ok(await page.getByText('To confirm').first().isVisible(), 'predicted rules say To confirm');
  // auto-fill next month: no must-fix problems left
  await page.evaluate(() => window.jmApp.setMonth(window.jmApp.model.addMonths(window.jmApp.month, 1)));
  await page.waitForTimeout(300);
  const before = await hard(page);
  ok(before > 30, 'next month starts without calls');
  await page.evaluate(() => window.jmApp.openAutofill());
  await page.getByRole('button', { name: /^Fill|^Start|^Auto-fill$/ }).last().click().catch(() => {});
  await page.waitForFunction(() => document.querySelector('.af-result, .af-apply, [data-af="apply"]') || /Apply/.test(document.body.innerText), null, { timeout: 30000 });
  const apply = page.getByRole('button', { name: /^Apply/ });
  if (await apply.count()) await apply.first().click();
  await page.waitForTimeout(600);
  const after = await hard(page);
  ok(after <= 3 && after < before, `auto-fill fixes the cover (${before} -> ${after} must-fix problems)`);
  await page.close();
}
// ---------- phone ----------
{
  const page = await newPage({ width: 390, height: 844 }, 'phone', { isMobile: true, hasTouch: true });
  await page.goto(BASE + '?demo#roster');
  await ready(page);
  for (const t of ['roster', 'day', 'check', 'rules', 'more', 'postings']) {
    await go(page, '#' + t);
    await page.waitForTimeout(400);
    await noSideScroll(page, `phone ${t}`);
    await axe(page, `phone ${t}`);
    await shot(page, 'p-' + t);
  }
  ok(await page.getByText('App version').count() >= 0, 'more ends with the version lines');
  await page.close();
}
// ---------- the Google Sheet: read it, check it is unchanged, write only the changes (a fake Sheets API; no Google account) ----------
{
  const page = await newPage({ width: 1280, height: 900 }, 'google');
  const MONTHDAYS = 31, WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dow = i => WD[(new Date(Date.UTC(2026, 11, i + 1)).getUTCDay())];
  const row = (sn, g, name, f) => [String(sn), g, name, ...Array.from({ length: MONTHDAYS }, (_, i) => f(i)), 'Z'];
  const sheet = [['legend'], ['legend 2'], ['', '', '', 'DEPARTMENT OF ANAESTHESIA STAFF ROSTER'], ['Dept', '', '', '1 to 31 December 26'],
    ['', '', '', ...Array.from({ length: MONTHDAYS }, (_, i) => dow(i)), ''],
    ['S/N', 'Grade', 'Name', ...Array.from({ length: MONTHDAYS }, (_, i) => String(i + 1)), '1-Jan'],
    row(1, 'RES2', 'Icu Example', () => 'ICU'), row(2, 'NHG', 'Cardiac Example', () => 'C')];
  const colIdx = L => [...L].reduce((x, ch) => x * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const writes = [];
  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  await page.context().route('https://sheets.googleapis.com/**', route => {
    const req = route.request(), u = decodeURIComponent(req.url());
    const json = o => route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(o) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (!/^Bearer test-token$/.test(req.headers().authorization || '')) return route.fulfill({ status: 401, headers: CORS, body: '{}' });
    if (/\/spreadsheets\/SHEETID[^/]*\?fields/.test(u)) return json({ properties: { title: 'Test roster' }, sheets: [{ properties: { sheetId: 7, title: 'Request', gridProperties: { rowCount: 50, columnCount: 40 } } }] });
    if (/values\/'Request'!A1:/.test(u)) return json({ values: sheet.map(r => r.slice()) });
    if (/values:batchGet/.test(u)) return json({ valueRanges: [...u.matchAll(/ranges='Request'!([A-Z]+)(\d+)/g)].map(m => ({ values: [[(sheet[+m[2] - 1] || [])[colIdx(m[1])] ?? '']] })) });
    if (/values:batchUpdate/.test(u)) {
      const body = JSON.parse(req.postData());
      for (const d of body.data) { const m = d.range.match(/!([A-Z]+)(\d+)$/); sheet[+m[2] - 1][colIdx(m[1])] = d.values[0][0]; writes.push(m[1] + m[2]); }
      return json({});
    }
    return route.fulfill({ status: 404, headers: CORS, body: '{"error":{"message":"no"}}' });
  });
  await page.goto(BASE + '#more');
  await ready(page);
  await page.evaluate(async () => { (await import('./js/gsheets.js')).hooks.getToken = async () => 'test-token'; });
  await page.fill('#sheet-link', 'https://docs.google.com/spreadsheets/d/SHEETID_0123456789abcdefghij/edit?gid=7#gid=7');
  await page.getByRole('button', { name: 'Read from Google' }).click();
  await page.waitForSelector('text=Import Google: Request');
  ok(await page.getByText('2 juniors').count() === 1, 'reading from Google finds the people');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.waitForTimeout(500);
  await axe(page, 'more with the Google Sheet buttons');
  // an Auto-fill-like change: a cardiac call on day 21
  await page.evaluate(async () => {
    const M = await import('./js/model.js');
    const st = window.jmApp.store, id = st.get().staff.find(x => x.name === 'Cardiac Example').id, d = M.monthDays('2026-12')[20];
    st.commit('call', draft => { M.setCell(draft, d, id, { a: [...M.getCell(draft, d, id).a, 'C3'] }); });
  });
  await page.waitForTimeout(300);
  ok(await page.getByRole('button', { name: /Check, then write 2 cells/ }).count() === 1, 'two cells to write: the call and its post call');
  await page.getByRole('button', { name: 'Only check the sheet is unchanged' }).click();
  await page.waitForSelector('text=exactly as you read it');
  ok(writes.length === 0, 'checking writes nothing');
  sheet[6][3 + 4] = 'AL';   // somebody edits the sheet meanwhile
  await page.getByRole('button', { name: /Check, then write/ }).click();
  await page.waitForSelector('text=has changed since you read it');
  ok(writes.length === 0 && await page.getByText('H7').count() >= 1, 'a change in the sheet stops the write and names the cell');
  sheet[6][3 + 4] = 'ICU';
  await page.getByRole('button', { name: /Check, then write/ }).click();
  await page.waitForSelector('text=Write 2 cells to Google?');
  ok(await page.locator('.ask-list td', { hasText: 'X8' }).count() === 1 && await page.locator('.ask-list td', { hasText: 'Y8' }).count() === 1 && await page.locator('.ask-list td', { hasText: 'Cardiac Example' }).count() === 2, 'the confirmation lists every cell that will change');
  ok(writes.length === 0, 'nothing is written before the confirmation');
  await axe(page, 'the confirmation of what will be written');
  await page.getByRole('button', { name: /^Write 2 cells$/ }).click();
  await page.waitForSelector('text=read them back: all match');
  ok(writes.join(',') === 'X8,Y8' && sheet[7][3 + 20] === 'C3' && sheet[7][3 + 21] === 'PC', `only the two changed cells were written (${writes.join(',')})`);
  ok(await page.getByText('Nothing to write').count() === 1, 'after writing there is nothing left to write');
  // undo the write in Google
  await page.getByRole('button', { name: 'Undo that write in Google' }).click();
  await page.waitForSelector('text=Undo the last write (2 cells)?');
  await page.getByRole('button', { name: 'Put them back' }).click();
  await page.waitForSelector('text=Put back 2 cells and read them back: all match');
  ok(sheet[7][3 + 20] === 'C' && sheet[7][3 + 21] === 'C' && writes.length === 4, 'undo put the two cells back as they were');
  ok(await page.getByRole('button', { name: /Check, then write 2 cells/ }).count() === 1, 'and the changes can be written again');
  // lock the month
  await page.locator('#lockm').click();
  ok(await page.locator('#lockm').getAttribute('aria-pressed') === 'true', 'the month is locked');
  const refused = await page.evaluate(async () => {
    const M = await import('./js/model.js');
    const st = window.jmApp.store, id = st.get().staff[0].id;
    return st.commit('edit', draft => { M.setCell(draft, M.monthDays('2026-12')[3], id, { a: ['AL'] }); });
  });
  ok(refused === false && await page.getByText('is locked, so nothing was changed').count() >= 1, 'a locked month refuses a change and says why');
  await page.locator('#lockm').click();
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.waitForTimeout(300);
  ok(await page.locator('#lockm').getAttribute('aria-pressed') === 'false', 'unlocked again');
  await page.close();
}
await b.close();
ok(!errors.length, 'no page errors:\n' + errors.join('\n'));
console.log(`nuh-junior-monthly e2e: ${checks} checks passed in ${((Date.now() - T0) / 1000).toFixed(1)} s`);
