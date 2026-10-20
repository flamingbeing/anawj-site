// Scan pages, live camera, in demo mode with a fake camera (a canvas stream drawn in the page, fake image only): the coach
// line, the auto photo once the page is still, the blur check with Retake, the manual shutter, the torch, the camera
// turned off on leaving, and the fallback when the camera will not open. Needs the site served on :8080 like e2e.mjs.
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const fails = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
// the fake camera: window.__cam.scene is 'none' (carpet only), 'cut' (page off the left edge) or 'page'; __cam.blur blurs it
await ctx.addInitScript(() => {
  const W = 1600, H = 1200, cam = window.__cam = { scene: 'none', blur: false, deny: false, torch: [], tracks: [] };
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const scene = document.createElement('canvas'); scene.width = W; scene.height = H; const y = scene.getContext('2d');
  let drawn = '';
  const paint = () => { // the scene is drawn again only when it changes (a blur every frame starves the page)
    const key = cam.scene + cam.blur;
    if (key !== drawn) {
      drawn = key; y.filter = 'none'; y.fillStyle = '#3a302a'; y.fillRect(0, 0, W, H);
      if (cam.scene !== 'none') {
        const dx = cam.scene === 'cut' ? -500 : 0;
        y.save(); y.beginPath(); y.moveTo(380 + dx, 120); y.lineTo(1180 + dx, 190); y.lineTo(1260 + dx, 1060); y.lineTo(300 + dx, 980); y.closePath(); y.clip();
        y.fillStyle = '#e8e8e2'; y.fillRect(0, 0, W, H); y.fillStyle = '#202020';
        for (let i = 0; i < 9; i++) y.fillRect(420 + dx + i * 8, 260 + i * 80, 600, 10);
        y.restore();
      }
      if (cam.blur) { const t = document.createElement('canvas'); t.width = W; t.height = H; const tx = t.getContext('2d'); tx.filter = 'blur(5px)'; tx.drawImage(scene, 0, 0); y.drawImage(t, 0, 0); }
    }
    x.drawImage(scene, 0, 0);
    setTimeout(paint, 50);
  };
  paint();
  navigator.mediaDevices.getUserMedia = async () => {
    if (cam.deny) throw new DOMException('Permission denied', 'NotAllowedError');
    const s = c.captureStream(30), t = s.getVideoTracks()[0];
    t.getCapabilities = () => ({ torch: true });
    t.applyConstraints = async k => { cam.torch.push(k.advanced[0].torch); };
    cam.tracks.push(t);
    return s;
  };
});
const pg = await ctx.newPage();
pg.on('pageerror', e => fails.push('page error: ' + e.message));
pg.on('dialog', d => d.accept());
const ok = (c, m) => { if (!c) fails.push(m); };
const cam = (k, v) => pg.evaluate(([k, v]) => { window.__cam[k] = v; }, [k, v]);
const coach = () => pg.textContent('#sccoach');
const waitCoach = (re, ms = 5000) => pg.waitForFunction(r => new RegExp(r).test(document.querySelector('#sccoach').textContent), re.source, { timeout: ms });
const pages = () => pg.evaluate(() => new Promise(ok => {
  const r = indexedDB.open('prewarm-scan'); r.onsuccess = () => { const q = r.result.transaction('pages').objectStore('pages').getAll(); q.onsuccess = () => ok(q.result.map(p => ({ label: p.label, still: p.still, check: p.check }))); };
}));
try {
  await pg.goto('http://localhost:8080/prewarm/?demo#/settings'); await pg.waitForTimeout(800);
  await pg.check('#scanon');
  await pg.click('a[href="#/scan"]');
  await pg.fill('#scsub', 'DEMO-02');
  ok(!(await pg.isChecked('#sccamapp')), 'live camera is the default (camera app switch off)');

  // the camera button opens the live view; no page yet, then a page with a corner cut off
  await pg.click('#scshotlbl');
  await pg.waitForSelector('#sclive:not([hidden])');
  await waitCoach(/Looking for the page/);
  ok(/Camera 1600×1200/.test(await pg.textContent('#sclivesize')), 'camera size shown: ' + await pg.textContent('#sclivesize'));
  ok(!(await pg.$eval('#sctorch', e => e.hidden)), 'torch button shown when the camera has one');
  await pg.click('#sctorch');
  ok(/Torch on/.test(await pg.textContent('#sctorch')), 'torch on');
  await cam('scene', 'cut');
  await waitCoach(/cut off/);

  // the whole page, held still: the photo is taken by itself and the crop step opens (sharp, so no retake question)
  await cam('scene', 'page');
  await pg.waitForSelector('#scedit:not([hidden]) #sccrop:not([hidden])', { timeout: 8000 });
  ok(await pg.$eval('#sclive', e => e.hidden), 'live view closed after the photo');
  ok(await pg.$eval('#scbar0', e => e.hidden), 'no retake question for a sharp photo');
  ok(await pg.evaluate(() => window.__cam.tracks.every(t => t.readyState === 'ended')), 'camera off while editing');
  ok(/Page 1/.test(await pg.textContent('#sctitle')), 'editing page 1');
  await pg.click('#scflat');
  await pg.waitForSelector('#screv:not([hidden])');
  await pg.click('#scok');

  // Accept and next opens the live camera again for page 2; a blurry photo asks "Retake?"
  await pg.waitForSelector('#sclive:not([hidden])');
  ok(/Page 2/.test(await pg.textContent('#sclivetitle')), 'live view moves on to page 2');
  await pg.waitForTimeout(500); // the save runs beside the camera
  const p1 = (await pages()).find(p => p.label === '1');
  ok(p1 && p1.still?.w === 1600 && p1.still?.h === 1200 && p1.still?.how === 'frame', 'page 1 kept the photo size: ' + JSON.stringify(p1?.still));
  await cam('blur', true);
  await pg.waitForSelector('#scedit:not([hidden]) #scbar0:not([hidden])', { timeout: 8000 });
  ok(/blurry/.test(await pg.textContent('#schint')), 'blurry photo flagged: ' + await pg.textContent('#schint'));
  await pg.click('#scretake0');
  await pg.waitForSelector('#sclive:not([hidden])');
  ok(/Page 2/.test(await pg.textContent('#sclivetitle')), 'retake is still page 2');

  // auto photo off: nothing happens until the shutter; then the crop step
  await cam('blur', false);
  await pg.click('#scauto');
  ok(/Auto photo off/.test(await pg.textContent('#scauto')), 'auto photo turned off');
  await waitCoach(/tap Take photo/);
  await pg.waitForTimeout(1500);
  ok(await pg.$eval('#scedit', e => e.hidden), 'no photo by itself with auto off');
  await pg.click('#scsnap');
  await pg.waitForSelector('#scedit:not([hidden]) #sccrop:not([hidden])', { timeout: 8000 });
  ok(/Page 2/.test(await pg.textContent('#sctitle')), 'manual photo is page 2');
  await pg.click('#scflat'); await pg.waitForSelector('#screv:not([hidden])'); await pg.click('#scok');
  await pg.waitForSelector('#sclive:not([hidden])');
  ok(/Auto photo off/.test(await pg.textContent('#scauto')), 'auto photo choice remembered on this phone');
  await pg.click('#scauto');

  // leaving the screen turns the camera off
  await pg.evaluate(() => { location.hash = '#/settings'; });
  await pg.waitForTimeout(400);
  ok(await pg.evaluate(() => window.__cam.tracks.every(t => t.readyState === 'ended')), 'camera off after leaving Scan pages');
  const saved = await pages();
  ok(saved.length === 2 && saved.some(p => p.label === '2'), 'two pages kept: ' + JSON.stringify(saved.map(p => p.label)));

  // a camera that will not open: the reason and the camera app button, not just a toast
  await pg.click('a[href="#/scan"]');
  await pg.fill('#scsub', 'DEMO-02');
  await cam('deny', true);
  await pg.click('#scshotlbl');
  await pg.waitForSelector('#sclivefail:not([hidden])');
  ok(/NotAllowedError/.test(await pg.textContent('#sclivewhy')), 'says why the camera did not open');
  ok(await pg.isVisible('#scfallback'), 'camera app button offered');
  await pg.click('#sclivedone');

  // the per-phone camera app switch: the button no longer opens the live view, and it is remembered
  await pg.check('#sccamapp');
  await pg.reload(); await pg.waitForSelector('#scsub');
  ok(await pg.isChecked('#sccamapp'), 'camera app switch remembered');
} catch (e) { fails.push('crashed: ' + e.message); }
await b.close();
if (fails.length) { console.error('scan live e2e FAILED:\n' + fails.join('\n')); process.exit(1); }
console.log('scan live e2e passed');
