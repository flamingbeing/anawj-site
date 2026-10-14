// Browser test of the OT simulator at phone and desktop size, with an axe accessibility check.
// Run from the repo root with a static server on port 8080 (python3 -m http.server 8080): node ot-sim/test/e2e.mjs
// (tools/test-ot-sim.sh starts the server for you.)
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';

const AXE = new URL('../../tools/vendor/axe.min.js', import.meta.url).pathname;
const BASE = `http://localhost:${process.env.PORT || 8080}/ot-sim/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const errors = [];
try {
  for (const [viewport, deviceScaleFactor] of [[{ width: 390, height: 844 }, 3], [{ width: 1280, height: 900 }, 1]]) {
    const page = await b.newPage({ viewport, deviceScaleFactor });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
    await page.goto(BASE);
    assert.equal(await page.title(), 'OT Simulator');
    assert.equal(await page.$eval('meta[name=robots]', e => e.content), 'noindex, nofollow');
    assert.ok(await page.$('#status'));
    // no horizontal scroll on a phone
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');
    // accessibility (axe)
    await page.addScriptTag({ content: fs.readFileSync(AXE, 'utf8') });
    const res = await page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] }));
    assert.deepEqual(res.violations.map(v => v.id + ' ' + v.nodes.map(n => n.target).join(',')), [], 'axe violations');
    await page.close();
  }
  assert.deepEqual(errors, [], 'console errors');
  console.log('ot-sim e2e: ok');
} finally { await b.close(); }
