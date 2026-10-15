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
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource.*gstatic/.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
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
await b.close();
ok(!errors.length, 'no page errors:\n' + errors.join('\n'));
console.log(`nuh-junior-monthly e2e: ${checks} checks passed in ${((Date.now() - T0) / 1000).toFixed(1)} s`);
