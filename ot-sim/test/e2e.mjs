// Browser test of the OT simulator at phone and desktop size, with an axe accessibility check.
// Run from the repo root with a static server on port 8080 (python3 -m http.server 8080): node ot-sim/test/e2e.mjs
// (tools/test-ot-sim.sh starts the server for you.) ?test exposes window.otsim so the test steps the model directly.
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';

const AXE = new URL('../../tools/vendor/axe.min.js', import.meta.url).pathname;
const ORIGIN = `http://localhost:${process.env.PORT || 8080}`;
const BASE = `${ORIGIN}/ot-sim/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const errors = [], outside = [];

async function axe(page, what) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: fs.readFileSync(AXE, 'utf8') });
  const res = await page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] }));
  assert.deepEqual(res.violations.map(v => v.id + ' ' + v.nodes.map(n => n.target).join(',')), [], `axe violations (${what})`);
}
// lit pixels in a lane canvas (anything drawn)
const lit = (page, id) => page.$eval(id, c => {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return n;
});

try {
  for (const [viewport, deviceScaleFactor, name] of [[{ width: 390, height: 844 }, 3, 'phone'], [{ width: 1280, height: 900 }, 1, 'desktop']]) {
    const page = await b.newPage({ viewport, deviceScaleFactor });
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
    page.on('request', r => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) outside.push(r.url()); });

    // library (the default screen)
    await page.goto(BASE);
    assert.equal(await page.title(), 'OT Simulator');
    assert.equal(await page.$eval('meta[name=robots]', e => e.content), 'noindex, nofollow');
    assert.equal(page.url(), BASE, 'the old-address forward does nothing here');
    assert.ok(await page.isVisible('#library') && !(await page.isVisible('#theatre')));
    await axe(page, `${name} library`);
    await page.click('a.card[href="#theatre"]');
    await page.waitForSelector('#theatre', { state: 'visible', timeout: 3000 });

    // theatre, driven by the test hooks
    await page.goto(BASE + '?test&seed=3#theatre');
    await page.waitForFunction(() => window.otsim && document.getElementById('n-hr').textContent !== '--');
    await page.waitForTimeout(400);
    for (const id of ['#c-ecg', '#c-pleth', '#c-co2']) assert.ok((await lit(page, id)) > 500, `${name}: ${id} draws`);
    // backing store at device density (capped at 2x), not grown each frame
    const dims = await page.$eval('#c-ecg', c => [c.width, c.clientWidth, c.height, c.clientHeight]);
    const dpr = Math.min(2, deviceScaleFactor);
    assert.equal(dims[0], Math.round(dims[1] * dpr)); assert.equal(dims[2], Math.round(dims[3] * dpr));
    await page.waitForTimeout(300);
    assert.equal((await page.$eval('#c-ecg', c => c.height)), dims[2], 'canvas height stable');

    // numerics are numbers in a sensible range
    const n = await page.evaluate(() => ['n-hr', 'n-spo2', 'n-etco2', 'n-rr', 'n-temp'].map(id => parseFloat(document.getElementById(id).textContent)));
    assert.ok(n[0] > 50 && n[0] < 100 && n[1] >= 94 && n[1] <= 100 && n[2] > 30 && n[2] < 45 && n[3] > 8 && n[3] < 20 && n[4] > 36 && n[4] < 37.5, `${name}: numerics ${n}`);

    // pause: the model stops
    await page.click('#pause');
    assert.equal(await page.getAttribute('#pause', 'aria-label'), 'Resume');
    const t0 = await page.evaluate(() => otsim.state.t);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => otsim.state.t), t0, 'paused model does not move');
    // wipe the lane, resume and pause again, count, all in one evaluation (Chrome may repaint a GPU canvas between
    // evaluations): the lane is refilled from history, not left blank
    const [wiped, refilled] = await page.evaluate(() => {
      const c = document.getElementById('c-ecg'), x = c.getContext('2d');
      const count = () => { const d = x.getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) k++; return k; };
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); x.restore();
      const w = count();
      document.getElementById('pause').click(); document.getElementById('pause').click();
      return [w, count()];
    });
    assert.equal(wiped, 0);
    assert.ok(refilled > 500, `${name}: lane refilled after pause`);
    await page.click('#pause'); // running again

    // speed keys: 20x runs the model about 20 times faster, shows the note, and is remembered on the device
    await page.click('[data-speed="20"]');
    assert.equal(await page.getAttribute('[data-speed="20"]', 'aria-pressed'), 'true');
    assert.ok(await page.isVisible('#fastnote'));
    const s0 = await page.evaluate(() => otsim.state.t);
    await page.waitForTimeout(1000);
    const ds = (await page.evaluate(() => otsim.state.t)) - s0;
    assert.ok(ds > 8 && ds < 30, `${name}: 20x ran ${ds} s in about 1 s`);
    assert.equal(await page.evaluate(() => localStorage.getItem('otsim.speed')), '20');
    assert.ok((await lit(page, '#c-pleth')) > 500, `${name}: pleth draws at 20x`);
    await page.click('[data-speed="1"]');
    assert.ok(!(await page.isVisible('#fastnote')));

    // five simulated minutes by the test hook: the clock and an NIBP reading
    await page.click('#pause');
    await page.evaluate(() => otsim.step(3000));
    const clock = await page.textContent('#clock');
    assert.match(clock, /^0[5-9]:\d\d$/, `${name}: clock ${clock}`);
    assert.match(await page.textContent('#n-nibp'), /^\d{2,3}\/\d{2,3}$/);
    // the button stops a running measurement and starts an idle one
    if ((await page.textContent('#nibp-go')) === 'Stop NIBP') await page.click('#nibp-go');
    assert.equal(await page.textContent('#nibp-go'), 'Start NIBP');
    await page.click('#nibp-go');
    assert.equal(await page.textContent('#nibp-go'), 'Stop NIBP');
    assert.match(await page.textContent('#n-nibp-age'), /Measuring/);
    await page.selectOption('#nibp-cycle', '0');
    await page.evaluate(() => otsim.step(400));
    assert.match(await page.textContent('#n-nibp-age'), /min ago|just now/);
    assert.ok(!/cycle/.test(await page.textContent('#n-nibp-age')), 'manual mode shows no cycle');

    // no horizontal scroll; axe on the paused theatre
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no horizontal scroll`);
    await axe(page, `${name} theatre`);

    // an unknown screen falls back to the library
    await page.goto(BASE + '#nowhere');
    await page.waitForSelector('#library', { state: 'visible', timeout: 3000 });
    await page.close();
  }
  assert.deepEqual(errors, [], 'console errors');
  assert.deepEqual(outside, [], 'no requests outside the folder');
  console.log('ot-sim e2e: ok');
} finally { await b.close(); }
