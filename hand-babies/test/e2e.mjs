// Browser test of the hand assessment page at phone size, with an axe accessibility check.
// Run from the repo root with a static server on port 8080 (python3 -m http.server 8080):
//   node hand-babies/test/e2e.mjs            SHOTS=<dir> also saves phone screenshots of each section
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const AXE = new URL('../../tools/vendor/axe.min.js', import.meta.url).pathname;
const BASE = `http://localhost:${process.env.PORT || 8080}/hand-babies/`;
const SHOTS = process.env.SHOTS;

const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

try {
  await page.goto(BASE);
  // every figure drew
  const figs = await page.$$eval('[data-fig]', els => els.map(e => [e.dataset.fig, !!e.querySelector('svg')]));
  assert.ok(figs.length >= 9, 'figures present');
  for (const [name, ok] of figs) assert.ok(ok, `figure ${name} drew`);
  // every in-page link has a target
  const missing = await page.$$eval('a[href^="#"]', as => as.map(a => a.getAttribute('href').slice(1)).filter(id => !document.getElementById(id)));
  assert.deepEqual(missing, [], 'in-page links resolve');
  // no horizontal scroll at phone width
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');
  // figures animate: the picture changes over time, Pause stops it on the complete diagram, Play restarts it
  const fig = '[data-fig="distal"]';
  await page.$eval(fig, e => e.scrollIntoView());
  await page.waitForTimeout(300);
  const f1 = await page.$eval(fig + ' .fig-art', e => e.innerHTML);
  await page.waitForTimeout(1200);
  assert.notEqual(await page.$eval(fig + ' .fig-art', e => e.innerHTML), f1, 'figure animates');
  assert.match(await page.textContent(fig + ' .fig-btn'), /Pause/);
  await page.click(fig + ' .fig-btn');
  assert.match(await page.textContent(fig + ' .fig-btn'), /Play/);
  const paused = await page.$eval(fig + ' .fig-art', e => e.innerHTML);
  await page.waitForTimeout(500);
  assert.equal(await page.$eval(fig + ' .fig-art', e => e.innerHTML), paused, 'paused stays still');
  assert.match(paused, /AND HERE/, 'paused shows the complete diagram');
  // every figure has its GIF
  for (const [name] of figs) {
    const r = await page.request.get(BASE + `gifs/${name}.gif`);
    assert.ok(r.ok() && (await r.body()).subarray(0, 3).toString() === 'GIF', `gifs/${name}.gif`);
  }
  // reduced motion: still pictures, nothing plays
  const rm = await (await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })).newPage();
  await rm.goto(BASE);
  assert.match(await rm.textContent('[data-fig="nerves"] .fig-btn'), /Play/);
  await rm.close();

  // the 10 rules are there
  assert.equal(await page.$$eval('ol.rules > li', l => l.length), 10);

  if (fs.existsSync(AXE)) {
    await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
    await page.addScriptTag({ path: AXE });
    const r = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }));
    const bad = r.violations.filter(v => ['serious', 'critical'].includes(v.impact));
    assert.equal(bad.length, 0, bad.map(v => v.id + ' ' + v.nodes[0]?.target).join('; '));
    await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = false; }));
  }

  // a scenario link opens its card
  await page.goto(BASE + '#pic-infect');
  assert.ok(await page.$eval('#pic-infect', d => d.open), 'hash opens scenario');

  if (SHOTS) {
    await page.goto(BASE);
    for (const id of ['rules', 'picture', 'sensation', 'tendons', 'infection', 'photos', 'call']) {
      if (id === 'picture') await page.$eval('#pic-cut', d => { d.open = true; });
      await page.evaluate(() => document.querySelectorAll('.fig-btn').forEach(b => { if (/Pause/.test(b.textContent)) b.click(); }));
      const s = await page.$(`#${id}`);
      await s.screenshot({ path: `${SHOTS}/${id}.png` });
    }
    await page.goto(BASE);
    await page.screenshot({ path: `${SHOTS}/00-top.png` });
  }
  assert.deepEqual(errors, [], 'no console errors');
  console.log('hand e2e: ok');
} finally {
  await b.close();
}
