// Fake data only. Themes → Wallpaper, colours from it, icon tint and an icon per tab (theme-revamp S4): all off by
// default; a pattern or a photo shows behind every page under solid cards; the dim never lets text on the page fall
// under 4.5:1 in light, dark or OLED; the photo stays on this device (IndexedDB) and survives a reload.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  const look = () => p.evaluate(async () => {
    const D = await import('./js/display.js'), cs = getComputedStyle(document.documentElement, '::before');
    return { wall: document.documentElement.classList.contains('wall'), image: cs.backgroundImage, dim: Number(getComputedStyle(document.documentElement, '::after').opacity), ...D.wallDim() };
  });
  // off by default: nothing behind the page, the body paints its own colour as before
  assert.deepEqual((await look()).wall, false);
  assert.notEqual(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgba(0, 0, 0, 0)');

  await p.evaluate(() => { location.hash = '#themes'; });
  const card = p.locator('section.wallpaper');
  await card.waitFor();
  // a pattern: chosen on the page, drawn behind it, the body see-through, cards still solid
  await card.locator('input[name=pick-wallpaper][value=dots]').check();
  let l = await look();
  assert.ok(l.wall && /radial-gradient/.test(l.image), 'dots behind the page: ' + l.image);
  assert.equal(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.notEqual(await p.evaluate(() => getComputedStyle(document.querySelector('section.card')).backgroundColor), 'rgba(0, 0, 0, 0)', 'cards stay solid');
  assert.ok(l.dim >= l.floor - 1e-6, 'the dim is at least the floor');

  // a photo: black and white stripes with a blue block, picked through the page's own file button
  const png = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d');
    for (let i = 0; i < 20; i++) { x.fillStyle = i % 2 ? '#000000' : '#ffffff'; x.fillRect(i * 20, 0, 20, 300); }
    x.fillStyle = '#1e6fb4'; x.fillRect(0, 0, 400, 120);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await card.locator('input[name=pick-wallpaper][value=photo]').check();
  await card.locator('input[type=file]').setInputFiles({ name: 'stripes.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await p.locator('#toast', { hasText: 'Wallpaper kept on this device' }).waitFor();
  await p.waitForFunction(() => /blob:/.test(getComputedStyle(document.documentElement, '::before').backgroundImage));
  l = await look();
  assert.ok(l.floor >= 0.5, 'stripes this busy need a strong dim: ' + l.floor);
  assert.ok(Math.abs(l.dim - Math.max(0.4, l.floor)) < 1e-6, `dim ${l.dim} = max(40%, floor ${l.floor})`);
  // kept small, on this device only
  const kept = await p.evaluate(async () => { const r = await (await import('./js/wallpaper.js')).getPhoto(); return { type: r.blob.type, size: r.blob.size, samples: r.samples.length }; });
  assert.deepEqual({ ...kept, size: 0 }, { type: 'image/jpeg', size: 0, samples: 1024 });
  assert.ok(kept.size < 400 * 1024, 'stored small: ' + kept.size);

  // text on the page stays at 4.5:1 over every sample in light, dark and OLED, even with the slider at 0
  await card.getByLabel('Dim the wallpaper').fill('0');
  for (const mode of ['light', 'dark', 'oled']) {
    const res = await p.evaluate(async mode => {
      const D = await import('./js/display.js'), W = await import('./js/wallpaper.js'), C = await import('./js/colors.js');
      D.applyTheme(mode);
      const pal = D.pagePalette(), rec = await W.getPhoto(), dim = Number(document.documentElement.style.getPropertyValue('--wall-dim'));
      let worst = 99;
      for (const s of rec.samples) for (const t of ['ink', 'muted']) worst = Math.min(worst, C.contrast(pal[t], C.mix(s, pal.bg, dim)));
      return { worst, dim, note: document.querySelector('section.wallpaper [aria-live]').textContent };
    }, mode);
    assert.ok(res.worst >= 4.5 - 1e-9, `${mode}: text at ${res.worst.toFixed(2)}:1 (dim ${res.dim})`);
  }
  await p.evaluate(async () => (await import('./js/display.js')).applyTheme('light'));
  assert.match(await card.locator('[aria-live]').textContent(), /raised so text stays easy to read/);

  // colours from the photo: its main colour, then one tapped on it (the blue band at the top, a white stripe below)
  await card.getByRole('button', { name: 'Use its main colour' }).click();
  await p.locator('#toast', { hasText: 'Colour from the photo' }).waitFor();
  const accent = () => p.evaluate(async () => (await import('./js/display.js')).display().accent);
  const blue = await accent();
  assert.ok(/^#[0-9a-f]{6}$/.test(blue) && parseInt(blue.slice(5), 16) > parseInt(blue.slice(1, 3), 16), 'a blue: ' + blue);
  const thumb = p.locator('section.wallpaper img.wall-thumb');
  await thumb.waitFor();
  const box = await thumb.boundingBox();
  await thumb.click({ position: { x: box.width * 0.025, y: box.height * 0.8 } });   // the first stripe: white
  await p.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('#ffffff') || document.querySelector('#toast')?.textContent.includes('#fefefe') || document.querySelector('#toast')?.textContent.includes('#fdfdfd'));
  await p.evaluate(async () => { const D = await import('./js/display.js'); D.applyDisplay(D.setDisplay({ accent: null })); });

  // icon tint: every icon but the current tab's takes the colour; an icon per tab redraws that tab
  await p.evaluate(async () => { const D = await import('./js/display.js'); D.applyDisplay(D.setDisplay({ iconTint: '#c2417a' })); });
  const strokes = await p.evaluate(() => [...document.querySelectorAll('.tabs button')].map(b => [b.getAttribute('aria-selected'), getComputedStyle(b.querySelector('.ico')).stroke, getComputedStyle(b).color]));
  for (const [sel, stroke, colour] of strokes) if (sel === 'true') assert.equal(stroke, colour, 'the current tab keeps its colour'); else assert.notEqual(stroke, colour, 'tinted');
  await p.evaluate(() => { location.hash = '#themes'; });
  await p.locator('details.tab-icons').evaluate(d => { d.open = true; });
  await p.getByLabel('Icon for Logbook').selectOption('heart');
  const { TAB_ICONS } = await import('../../js/theme-engine.js');
  await p.waitForFunction(d => document.querySelector('.tabs [data-tab="logbook"] path')?.getAttribute('d') === d, TAB_ICONS.heart[1]);

  // a reload: the photo is still there (first paint has the class), the tab icon too
  await p.reload(); await p.waitForSelector('section.wallpaper');
  assert.ok(await p.evaluate(() => document.documentElement.classList.contains('wall')));
  await p.waitForFunction(() => /blob:/.test(getComputedStyle(document.documentElement, '::before').backgroundImage));
  assert.equal(await p.locator('.tabs [data-tab="logbook"] path').getAttribute('d'), TAB_ICONS.heart[1]);

  // picking a theme keeps the photo (it is this device's); Remove deletes it
  await p.evaluate(async () => { const T = await import('./js/themes.js'), D = await import('./js/display.js'); D.applyDisplay(D.setDisplay(T.themePatch(T.themeById('soft'), D.display()))); });
  assert.equal(await p.evaluate(async () => (await import('./js/display.js')).display().wallpaper), 'photo');
  await p.evaluate(() => { location.hash = '#log'; }); await p.evaluate(() => { location.hash = '#themes'; });
  await p.locator('section.wallpaper').getByRole('button', { name: 'Remove' }).click();
  await p.locator('#toast', { hasText: 'Photo removed' }).waitFor();
  assert.equal(await p.evaluate(async () => !!(await (await import('./js/wallpaper.js')).getPhoto())), false);
  assert.equal(await p.evaluate(() => document.documentElement.classList.contains('wall')), false);

  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log('PASS wallpaper, colours from it, icon tint and tab icons');
} finally { await b.close(); }
