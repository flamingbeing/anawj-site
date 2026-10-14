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
  // the phone runs at 3x pixel density: at 1x a canvas-size bug (graphs growing every frame) never showed
  for (const [viewport, deviceScaleFactor] of [[{ width: 390, height: 844 }, 3], [{ width: 1280, height: 900 }, 1]]) {
    const page = await b.newPage({ viewport, deviceScaleFactor });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
    await page.goto(BASE);
    // opens on an awake patient: BIS in the 80s-90s
    await page.waitForFunction(() => /^\d+$/.test(document.querySelector('#vBis').textContent));
    const awake = await bis(page);
    assert.ok(awake >= 80, `awake BIS ${awake}`);
    assert.equal(await page.textContent('#rName'), 'Awake');
    assert.equal(await page.$eval('#depth', e => e.value), '0');
    // the relaxant is on by default, given at induction: the awake patient is not paralysed (BIS stays in the 90s)
    assert.equal(await page.$eval('#nmbSeg [data-nmb="auto"]', e => e.getAttribute('aria-pressed')), 'true');
    // move the depth target to GA at 1x: the effect site follows slowly, so the screen still shows an awake patient, and the
    // slider shows the BIS the dose will settle on
    await page.$eval('#depth', e => { e.value = 57; e.dispatchEvent(new Event('input')); });
    assert.match(await page.textContent('#tgtSub'), /settling/);
    assert.equal(await page.textContent('#rName'), 'Awake');
    await page.waitForFunction(() => { const m = /≈ (\d+)/.exec(document.querySelector('#tgtBis').textContent); return m && +m[1] >= 35 && +m[1] <= 60; }, null, { timeout: 8000 });
    await page.waitForFunction(() => !document.querySelector('#zoneBand').hidden && document.querySelector('#zoneBand').getBoundingClientRect().width > 8, null, { timeout: 15000 });
    assert.match(await page.textContent('#zoneText'), /BIS 40–60/);
    // the effect-site marker is still left of the slider thumb, then catches up; BIS falls into 35-60 and the bands are described
    assert.ok(await page.$eval('#effMark', m => parseFloat(m.style.left.replace(/[^0-9.]/g, '')) >= 0), 'marker placed');
    await page.click('#speedSeg [data-speed="10"]');
    await page.waitForFunction(() => document.querySelector('#rName').textContent === 'General anaesthesia', null, { timeout: 40000 });
    assert.match(await page.textContent('#rText'), /relaxant on board/);
    await page.waitForFunction(() => /at target/.test(document.querySelector('#tgtSub').textContent), null, { timeout: 40000 });
    await page.waitForFunction(() => +document.querySelector('#vBis').textContent <= 60, null, { timeout: 40000 });
    await page.waitForTimeout(3000);
    const ga = await bis(page);
    assert.ok(ga >= 30 && ga <= 60, `propofol GA BIS ${ga}`);
    await page.click('#speedSeg [data-speed="1"]');
    // graphs keep their size and have something drawn on them
    const heights = () => page.$$eval('.screen canvas', cs => cs.map(c => c.clientHeight));
    const h0 = await heights();
    await page.waitForTimeout(1500);
    assert.deepEqual(await heights(), h0, 'canvas heights stable');
    assert.ok(await page.$eval('#cEeg', c => c.clientHeight) >= 90);
    const lit = await page.$eval('#cDsa', c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++; return n / (d.length / 4); });
    assert.ok(lit > 0.3, `DSA drawn (${lit})`);
    assert.ok(await page.$eval('#err', e => e.hidden), 'no display error');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'no sideways scroll');
    // screen order like a BIS monitor: trends, DSA above, EEG below; the view toggle shows one large
    const order = await page.$$eval('.screen .lane', ls => ls.map(l => l.id));
    assert.deepEqual(order, ['wTrend', 'wDsa', 'wEeg']);
    const dsa0 = await page.$eval('#cDsa', c => c.clientHeight), eeg0 = await page.$eval('#cEeg', c => c.clientHeight);
    await page.click('#viewSeg [data-view="dsa"]');
    await page.waitForFunction(h => document.querySelector('#cDsa').clientHeight > h + 50, dsa0);
    assert.ok(await page.$eval('#wEeg', e => e.hidden && getComputedStyle(e).display === 'none' && e.offsetHeight === 0), 'EEG hidden in DSA view');
    await page.click('#viewSeg [data-view="eeg"]');
    await page.waitForFunction(h => document.querySelector('#cEeg').clientHeight > h + 50, eeg0);
    assert.ok(await page.$eval('#wDsa', e => e.hidden && getComputedStyle(e).display === 'none' && e.offsetHeight === 0), 'DSA hidden in EEG view');
    await page.click('#viewSeg [data-view="both"]');
    await page.waitForFunction(([d, e]) => document.querySelector('#cEeg').clientHeight === e && document.querySelector('#cDsa').clientHeight === d, [dsa0, eeg0]);
    // monitor first: on a phone the monitor and the drug and depth controls are near the top
    if (viewport.width === 390) assert.ok(await page.$eval('#monitor .screen', e => e.getBoundingClientRect().top + scrollY) < 80, 'monitor at the top');
    // facial EMG raises the EMG reading (no relaxant on board)
    await page.click('#nmbSeg [data-nmb="off"]');
    const emg0 = await page.$eval('#vEmg', e => +e.textContent);
    await page.click('#speedSeg [data-speed="10"]');
    await page.check('#mEmg');
    await page.waitForFunction(e0 => +document.querySelector('#vEmg').textContent >= e0 + 6, emg0, { timeout: 20000 });
    // a muscle relaxant takes the EMG away again
    const emgHi = await page.$eval('#vEmg', e => +e.textContent);
    await page.click('#nmbSeg [data-nmb="auto"]');
    await page.waitForFunction(e1 => +document.querySelector('#vEmg').textContent <= e1 - 6, emgHi, { timeout: 20000 });
    assert.match(await page.textContent('#rText'), /Muscle relaxant/);
    await page.uncheck('#mEmg');
    // forced-air warmer: high-frequency pickup raises the EMG reading; blinks and the surgical stimulus are described
    await page.waitForFunction(() => +document.querySelector('#vEmg').textContent <= 32, null, { timeout: 20000 });
    const emgW = await page.$eval('#vEmg', e => +e.textContent);
    await page.check('#mWarm');
    await page.waitForFunction(e0 => +document.querySelector('#vEmg').textContent >= e0 + 6, emgW, { timeout: 20000 });
    assert.match(await page.textContent('#rText'), /Forced-air warmer/);
    await page.uncheck('#mWarm');
    await page.check('#mBlink');
    assert.match(await page.textContent('#rText'), /Blinks/);
    await page.uncheck('#mBlink');
    await page.click('#stimBtn');
    assert.equal(await page.$eval('#stimBtn', e => e.getAttribute('aria-pressed')), 'true');
    assert.match(await page.textContent('#rText'), /Surgical stimulus/);
    // SQI: high on a clean signal; diathermy drops it and the BIS number shows hollow or blank, like the monitor
    assert.ok(await page.$eval('#vSqi', e => +e.textContent) >= 90, 'clean SQI');
    await page.check('#mDia');
    await page.waitForFunction(() => +document.querySelector('#vSqi').textContent < 60, null, { timeout: 30000 });
    await page.waitForFunction(() => { const b = document.querySelector('#vBis'); return b.classList.contains('hollow') || b.textContent === '--'; }, null, { timeout: 30000 });
    await page.uncheck('#mDia');
    await page.click('#speedSeg [data-speed="1"]');
    // library strips and quiz drawn
    await page.waitForFunction(() => document.querySelectorAll('#lib canvas').length === 13 && document.querySelectorAll('#opts button').length === 4);
    await page.click('#opts button');
    assert.ok((await page.textContent('#fb')).length > 10, 'quiz feedback');
    // suppression timer: deep propofol brings burst suppression, the suppression time box counts up, Reset clears it
    await page.click('#speedSeg [data-speed="10"]');
    await page.click('#tReset');
    await page.waitForFunction(() => document.querySelector('#vSupT').textContent === '0:00');
    await page.$eval('#depth', e => { e.value = 93; e.dispatchEvent(new Event('input')); });
    await page.waitForFunction(() => document.querySelector('#vSupT').textContent !== '0:00' && +document.querySelector('#vSr').textContent >= 5, null, { timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('#vLowT').textContent !== '0:00', null, { timeout: 60000 }); // BIS under 40 counts too
    await page.click('#tReset');
    await page.waitForFunction(() => document.querySelector('#vSupT').textContent === '0:00');
    await page.$eval('#depth', e => { e.value = 57; e.dispatchEvent(new Event('input')); });
    // emergence button: stops the drugs (slider to 0), the effect site falls slowly, the patient wakes and the relaxant is reversed
    await page.click('#wakeBtn');
    assert.equal(await page.$eval('#depth', e => e.value), '0');
    assert.match(await page.textContent('#storyCap'), /Emergence/);
    assert.match(await page.textContent('#tgtSub'), /settling/);
    assert.notEqual(await page.textContent('#rName'), 'Awake', 'still under right after stopping (slow emergence)');
    await page.waitForFunction(() => document.querySelector('#rName').textContent === 'Awake', null, { timeout: 90000 });
    await page.waitForFunction(() => +document.querySelector('#vBis').textContent >= 80, null, { timeout: 60000 });
    // mix mode: propofol + ketamine reads higher than propofol alone; back to one drug restores the single controls
    await page.click('#speedSeg [data-speed="10"]');
    await page.click('#modeSeg [data-mode="mix"]');
    assert.ok(await page.$eval('#depthCtl', e => e.hidden) && !(await page.$eval('#mixCtl', e => e.hidden)), 'mix controls shown');
    await page.click('#presetSeg [data-preset="propket"]');
    assert.equal(await page.$eval('#o-ketamine', e => e.textContent), '40');
    assert.match(await page.textContent('#rName'), /propofol \+ ketamine/);
    await page.waitForFunction(() => /≈ \d+/.test(document.querySelector('#tgtMix').textContent), null, { timeout: 8000 });
    await page.waitForFunction(g => +document.querySelector('#vBis').textContent > g + 8, ga, { timeout: 30000 });
    await page.click('#modeSeg [data-mode="single"]');
    assert.ok(!(await page.$eval('#depthCtl', e => e.hidden)), 'single controls back');
    // ketamine at 10x speed: BIS climbs well above the GA value
    await page.click('#speedSeg [data-speed="10"]');
    await page.click('[data-drug="ketamine"]');
    await page.$eval('#depth', e => { e.value = 65; e.dispatchEvent(new Event('input')); });
    await page.waitForFunction(g => +document.querySelector('#vBis').textContent > g + 15, ga, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('#rName').textContent === 'Ketamine anaesthesia', null, { timeout: 30000 });
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
