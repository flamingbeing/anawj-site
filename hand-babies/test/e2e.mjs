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
  // every figure drew: drawn diagrams as SVG, the 3D ones (hand3d.js) on a canvas with a real picture in it
  await page.waitForFunction(() => [...document.querySelectorAll('[data-fig]')].every(e => e.querySelector('.fig-art svg, .fig-art canvas')));
  const figs = await page.$$eval('[data-fig]', els => els.map(e => [e.dataset.fig, e.querySelector('canvas') ? 'canvas' : 'svg']));
  assert.ok(figs.length >= 14, 'figures present');
  const threeD = figs.filter(f => f[1] === 'canvas').map(f => f[0]);
  assert.deepEqual(threeD.sort(), ['cascade', 'edc', 'eipedm', 'elson', 'epl', 'fdp', 'fds', 'fpl', 'nerves']);
  for (const name of threeD) {
    const shades = await page.$eval(`[data-fig="${name}"] canvas`, c => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
      return seen.size;
    });
    assert.ok(shades > 40, `3D figure ${name} has a picture (${shades} shades)`);
  }
  // dragging turns a 3D figure, without pausing it
  {
    const c = await page.$('[data-fig="fdp"] canvas'); await c.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.handFigs.renderAt('fdp', 2));
    const before = await c.evaluate(el => el.toDataURL());
    const box = await c.boundingBox();
    await page.mouse.move(box.x + 100, box.y + 150); await page.mouse.down(); await page.mouse.move(box.x + 220, box.y + 150, { steps: 5 }); await page.mouse.up();
    assert.notEqual(await c.evaluate(el => el.toDataURL()), before, 'drag turns the hand');
  }
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

  // no 10 rules, no emoji
  assert.equal(await page.$('#rules'), null);
  assert.doesNotMatch(await page.evaluate(() => document.body.innerText), /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{25B6}\u{275A}]/u);

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

  // page editor: tap a line, change it, see it in the message that would be sent as a GitHub issue
  const ed = await ctx.newPage();
  ed.on('pageerror', e => errors.push('edit: ' + e.message));
  await ed.goto(BASE + 'edit.html');
  const fr = ed.frameLocator('#frame');
  await fr.locator('#picture .lead').waitFor();
  await ed.waitForTimeout(300);
  // figures are stopped inside the editor so they can be selected
  assert.match(await fr.locator('[data-fig="distal"] .fig-btn').textContent(), /Play/);
  await fr.locator('#picture .lead').click();
  await ed.click('#aEdit');
  await fr.locator('#picture .lead').evaluate(el => { el.textContent = 'Tap the case in front of you. Edited line.'; });
  await ed.click('#eSave');
  assert.equal(await ed.textContent('#count'), '1');
  await fr.locator('#t-look').click();
  await ed.click('#aComment');
  await ed.fill('#noteText', 'Add a photo of a real cascade');
  await ed.click('#noteDlg button[value=ok]');
  await ed.waitForFunction(() => document.getElementById('count').textContent === '2');
  // a figure can take a comment but not a text edit
  await fr.locator('[data-fig="nerves"] canvas').click();
  assert.equal(await ed.isHidden('#aEdit'), true, 'no text edit on a figure');
  await ed.click('#aCancel');
  await ed.click('#send');
  await ed.fill('#who', 'Test MO');
  const preview = await ed.inputValue('#preview');
  assert.match(preview, /Suggested by: Test MO/);
  assert.match(preview, /## Page: \/hand-babies\//);
  assert.match(preview, /Was:\n> Tap the one in front of you\./);
  assert.match(preview, /Now:\n> Tap the case in front of you\. Edited line\./);
  assert.match(preview, /Comment:\n> Add a photo of a real cascade/);
  await ed.evaluate(() => { window.open = u => { window.__opened = u; }; });
  await ed.click('#openIssue');
  const issue = await ed.evaluate(() => window.__opened);
  assert.match(issue, /^https:\/\/github\.com\/flamingbeing\/anawj-site\/issues\/new\?title=Page%20edits%3A%20%2Fhand-babies%2F/);
  if (SHOTS) { await ed.click('#sendClose'); await fr.locator('#picture .lead').click(); await ed.screenshot({ path: `${SHOTS}/edit.png` }); }
  // the old address forwards to the one editor for the whole site (/edit/)
  assert.equal(new URL(ed.url()).pathname, '/edit/');
  // any page on the site opens; the apps open in their demo (sign-in can't happen inside the editor)
  await ed.click('#sendClose');
  await ed.fill('#path', '/logbook/');
  await ed.press('#path', 'Enter');
  await ed.waitForTimeout(800);
  const inFrame = new URL(await fr.locator('body').evaluate(() => location.href));
  assert.equal(inFrame.pathname, '/logbook/');
  assert.equal(inFrame.searchParams.has('demo'), true, 'app not opened in its demo');
  // never the editor inside itself
  await ed.fill('#path', '/edit/');
  await ed.press('#path', 'Enter');
  await ed.waitForTimeout(500);
  assert.equal(new URL(await fr.locator('body').evaluate(() => location.href)).pathname, '/');
  await ed.close();

  if (SHOTS) {
    await page.goto(BASE);
    for (const id of ['picture', 'sensation', 'tendons', 'infection', 'photos', 'call']) {
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
