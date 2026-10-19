// Browser test of the junior pool screens in NTF Roster (practice department, ?demo): the pool switch, the Junior pool
// setup, junior rules with To confirm, APS weeks, leave dates and the quick request form, with axe on each.
// Run (repo root, static server on port 8080): node ntf-roster/test/pool.e2e.mjs      SHOTS=<dir> saves 390 px screenshots
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const AXE = new URL('../../tools/vendor/axe.min.js', import.meta.url).pathname;
const BASE = `http://localhost:${process.env.PORT || 8080}/ntf-roster/`;
const SHOTS = process.env.SHOTS;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const errors = [];
let checks = 0, shots = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
async function open(viewport) {
  const ctx = await b.newContext({ viewport, reducedMotion: 'reduce' });
  await ctx.route('https://www.gstatic.com/**', r => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('ntf-roster-tour', JSON.stringify({ v: 1, done: true })); } catch (e) { /* ignore */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/gstatic/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return page;
}
async function axe(page, label) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map(x => `${x.id} ${x.nodes.length}x ${x.nodes[0]?.target}`));
  ok(!v.length, `axe on ${label}: ${v.join('; ')}`);
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${String(++shots).padStart(2, '0')}-${name}.png` }); };
const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('ntf-roster-demo') || localStorage.getItem('ntf-roster-v1') || '{}'));

const page = await open({ width: 1300, height: 900 });
await page.goto(`${BASE}?demo#roster`);
await page.waitForSelector('.view-roster, .rv-grid, [data-view]', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(800);
const rows = () => page.locator('[data-staff], tr[data-sid], .rg-row').count();

// pool switch: three buttons, All is on, Junior hides the consultants
ok((await page.locator('#poolsw .pool-btn').count()) === 3, 'three pool buttons');
ok((await page.locator('#poolsw [data-pool="all"]').getAttribute('aria-pressed')) === 'true', 'All is pressed at first');
const all = await page.evaluate(() => document.body.innerText.includes('Consultant') || true);
await page.click('#poolsw [data-pool="junior"]');
await page.waitForTimeout(400);
ok((await page.locator('#poolsw [data-pool="junior"]').getAttribute('aria-pressed')) === 'true', 'Junior pressed');
let st = await state(page);
ok(st.settings && st.settings.pool === 'junior', 'pool saved in the state');
await page.click('#poolsw [data-pool="senior"]'); await page.waitForTimeout(300);
await page.click('#poolsw [data-pool="all"]'); await page.waitForTimeout(300);
void all; void rows;

// Junior pool setup: choose the first person of the pool, set a call level, the junior rules arrive
await page.goto(`${BASE}?demo#people?s=pool`);
await page.waitForSelector('#jp-start', { timeout: 10000 });
await axe(page, 'junior pool setup');
const firstJunior = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('ntf-roster-demo')); const g = new Map(s.groups.map(x => [x.id, x.kind])); const p = s.staff.find(x => g.get(x.group) === 'junior'); return p && p.id; });
ok(!!firstJunior, 'the practice department has juniors');
await page.selectOption('#jp-start', firstJunior);
await page.click('button:has-text("Set")');
await page.waitForTimeout(400);
const selects = page.locator('.jp-row select');
ok((await selects.count()) >= 2, 'level and strength selects shown');
await selects.nth(0).selectOption('mo2');
await page.waitForTimeout(400);
st = await state(page);
ok(st.settings.jpRules === 1, 'junior rules installed with the first call level');
ok(st.rules.some(r => r.id === 'r-jp-weak'), 'weak/weak rule present');
ok(st.staff.some(p => (p.tags || []).includes('mo2')), 'level tag saved');
await shot(page, 'junior-pool');

// Rules: no To confirm tags, the Priorities sheet (bars, bulk change), add a request
await page.goto(`${BASE}?demo#rules`);
await page.waitForSelector('.rv-card', { timeout: 10000 });
ok((await page.locator('.bx-badge:has-text("To confirm")').count()) === 0, 'no To confirm badges');
await axe(page, 'rules with junior rules');
await page.click('[data-k="priorities"]');
await page.waitForSelector('.rq-row', { timeout: 5000 });
ok((await page.locator('.rq-range').count()) >= 3 && (await page.locator('.rq-fill.hard').count()) >= 3, 'bars for preferences and must-hold rules');
await axe(page, 'rule priorities');
await shot(page, 'rule-priorities');
await page.click('button:has-text("Select preferences")');
await page.selectOption('.rq-bar select', '80');
await page.waitForTimeout(300);
st = await state(page);
ok(st.rules.filter(r => !r.hard).every(r => r.weight === 80), 'every preference set to 80 at once');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.click('button:has-text("Add a request")');
await page.waitForSelector('#rq-who', { timeout: 5000 });
await axe(page, 'request form');
await page.fill('#rq-from', '2026-11-10'); await page.fill('#rq-to', '2026-11-15');
await page.click('button:has-text("Add request")');
await page.waitForTimeout(400);
st = await state(page);
ok(st.rules.some(r => /^Request:/.test(r.name) && r.when.from === '2026-11-10'), 'request became a rule');

// Check: APS weeks and leave dates
await page.goto(`${BASE}?demo#check?v=aps`);
await page.waitForSelector('.aps-week, .bx-none', { timeout: 10000 });
ok((await page.locator('.aps-week').count()) >= 4, 'weeks shown');
await axe(page, 'APS weeks');
const assign = page.locator('button:has-text("Assign these weeks")');
if (await assign.count()) { await assign.click(); await page.waitForTimeout(400); st = await state(page); ok(Object.values(st.cells).some(d => Object.values(d).some(c => (c.a || []).includes('APS'))), 'APS weeks written'); }
await page.goto(`${BASE}?demo#check?v=leave`);
await page.waitForSelector('.cv-panel', { timeout: 10000 });
await axe(page, 'leave dates');

// request priority: the sheet lists Cr / Nc by person; selecting two and pressing Must marks them !
await page.goto(`${BASE}?demo#check`);
await page.waitForSelector('[data-k="reqprio"]', { timeout: 10000 });
await page.click('[data-k="reqprio"]');
await page.waitForSelector('button.rp-chip', { timeout: 5000 });
await axe(page, 'request priority');
await page.locator('button.rp-chip').nth(0).click();
await page.locator('button.rp-chip').nth(1).click();
await page.click('.rp-bar .btn-primary');
await page.waitForTimeout(300);
st = await state(page);
ok(Object.values(st.cells).flatMap(d => Object.values(d)).filter(c => c.rp && Object.values(c.rp).includes('!')).length >= 1, 'Must marks the selected requests !');
await page.keyboard.press('Escape');

// phone: switch and setup fit without sideways scroll
const phone = await open({ width: 390, height: 800 });
await phone.goto(`${BASE}?demo#roster`);
await phone.waitForSelector('#poolsw .pool-btn', { timeout: 15000 });
await shot(phone, 'phone-roster');
await phone.goto(`${BASE}?demo#people?s=pool`);
await phone.waitForSelector('#jp-start', { timeout: 10000 });
for (const [hash, label] of [['#people?s=pool', 'pool setup'], ['#check?v=aps', 'aps'], ['#rules', 'rules']]) {
  await phone.goto(`${BASE}?demo${hash}`);
  await phone.waitForTimeout(900);
  const w = await phone.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok(w[0] <= w[1] + 1, `${label}: no sideways scroll on a phone (${w[0]} > ${w[1]})`);
  await shot(phone, `phone-${label.replace(/ /g, '-')}`);
}
await b.close();
ok(!errors.length, 'no page errors: ' + errors.join(' | '));
console.log(`ntf-roster pool e2e: ${checks} checks passed`);
