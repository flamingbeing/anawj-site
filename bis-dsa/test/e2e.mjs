// Browser test of the BIS to DSA page at phone and desktop size, with an axe accessibility check.
// Run from the repo root with a static server on port 8080 (python3 -m http.server 8080): node bis-dsa/test/e2e.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';

const AXE = new URL('../../tools/vendor/axe.min.js', import.meta.url).pathname;
const BASE = `http://localhost:${process.env.PORT || 8080}/bis-dsa/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const errors = [];
const bis = p => p.$eval('#vBis', e => +e.textContent);
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const page = await b.newPage({ viewport });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
    await page.goto(BASE);
    // opens in propofol GA after a warm start: BIS in the GA range, two bands described
    await page.waitForFunction(() => /^\d+$/.test(document.querySelector('#vBis').textContent));
    const ga = await bis(page);
    assert.ok(ga >= 35 && ga <= 60, `propofol GA BIS ${ga}`);
    assert.equal(await page.textContent('#rName'), 'General anaesthesia');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'no sideways scroll');
    // library strips and quiz drawn
    await page.waitForFunction(() => document.querySelectorAll('#lib canvas').length === 10 && document.querySelectorAll('#opts button').length === 4);
    await page.click('#opts button');
    assert.ok((await page.textContent('#fb')).length > 10, 'quiz feedback');
    // ketamine at 10x speed: BIS climbs well above the GA value
    await page.click('#speedSeg [data-speed="10"]');
    await page.click('[data-drug="ketamine"]');
    await page.$eval('#depth', e => { e.value = 65; e.dispatchEvent(new Event('input')); });
    await page.waitForFunction(g => +document.querySelector('#vBis').textContent > g + 15, ga, { timeout: 20000 });
    assert.equal(await page.textContent('#rName'), 'Ketamine anaesthesia');
    // explainer steps respond
    await page.click('#steps button[data-i="3"]');
    assert.match(await page.textContent('#exCap'), /on its side/);
    if (viewport.width === 390) {
      await page.addScriptTag({ path: AXE });
      const r = await page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] }));
      assert.deepEqual(r.violations.map(v => `${v.id}: ${v.nodes.length}`), [], 'axe');
    }
    await page.close();
  }
  assert.deepEqual(errors, [], 'page errors');
  console.log('bis-dsa e2e: ok');
} finally { await b.close(); }
