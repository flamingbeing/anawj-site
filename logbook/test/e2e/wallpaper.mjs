// Fake data only. Themes → Wallpaper, colours from it, icon tint and an icon per tab (theme-revamp S4): all off by
// default; a pattern or a photo shows behind every page under solid cards; text on the bare page never falls under
// 4.5:1 in light, dark or OLED (its own backing, TE S3, so the photo keeps the dim you chose); pattern strength and
// see-through cards (TE S3) keep every text at 4.5:1 too; the photo stays on this device (IndexedDB) and survives a
// reload.
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

  // pattern strength: the slider (patterns only) makes the ink stronger; every pattern at its strongest, with
  // see-through cards, keeps text at 4.5:1 on the page (with its backing) and on cards, light, dark and OLED, phone and desk
  await card.getByLabel('Pattern strength').fill('36');
  assert.match((await look()).image, /\/ 0\.36\)|36%/, 'the strongest ink');
  await p.setViewportSize({ width: 1280, height: 900 });
  const worst = await p.evaluate(async () => {
    const D = await import('./js/display.js'), W = await import('./js/wallpaper.js'), C = await import('./js/colors.js'), out = [];
    for (const k of Object.keys(W.PATTERNS)) for (const mode of ['light', 'dark', 'oled']) {
      D.applyDisplay(D.setDisplay({ wallpaper: k, wallFrost: true })); D.applyTheme(mode);
      const pal = D.pagePalette(), r = D.wallDim();
      for (const s of W.patternSamples(k, pal, 36)) for (const t of ['ink', 'muted']) {
        const under = C.mix(s, pal.bg, r.dim);
        out.push([`${k} ${mode} ${t} page`, C.contrast(pal[t], C.mix(under, pal.bg, r.scrim))], [`${k} ${mode} ${t} card`, C.contrast(pal[t], C.mix(under, pal.panel, r.frost))]);
      }
    }
    D.applyTheme('light'); D.applyDisplay(D.setDisplay({ wallpaper: 'dots', wallFrost: null, wallInk: null }));
    return out.sort((a, b) => a[1] - b[1])[0];
  });
  assert.ok(worst[1] >= 4.5 - 1e-9, `${worst[0]}: ${worst[1].toFixed(2)}:1`);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.evaluate(() => { location.hash = '#log'; }); await p.evaluate(() => { location.hash = '#themes'; }); await card.waitFor();

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
  assert.ok(l.floor >= 0.5, 'stripes this busy need a strong backing for text: ' + l.floor);
  assert.ok(Math.abs(l.dim - 0.4) < 1e-6, `the photo keeps the dim chosen (40% unless set), not the floor: ${l.dim}`);
  assert.ok(l.scrim > 0 && 1 - 0.6 * (1 - l.scrim) >= l.floor - 1e-9, `the text backing with the dim reaches the floor: ${l.scrim}`);
  // kept small, on this device only
  const kept = await p.evaluate(async () => { const r = await (await import('./js/wallpaper.js')).getPhoto(); return { type: r.blob.type, size: r.blob.size, samples: r.samples.length }; });
  assert.deepEqual({ ...kept, size: 0 }, { type: 'image/jpeg', size: 0, samples: 1024 });
  assert.ok(kept.size < 400 * 1024, 'stored small: ' + kept.size);

  // text on the page stays at 4.5:1 over every sample in light, dark and OLED, even with the slider at 0: on the
  // bare page through its backing (a real one: the version line on More), on see-through cards through the card colour
  await card.getByLabel('Dim the wallpaper').fill('0');
  const check = () => p.evaluate(async () => {
    const out = {};
    const D = await import('./js/display.js'), W = await import('./js/wallpaper.js'), C = await import('./js/colors.js');
    for (const mode of ['light', 'dark', 'oled']) {
      D.applyTheme(mode);
      const pal = D.pagePalette(), rec = await W.getPhoto(), cs = document.documentElement.style;
      const dim = Number(cs.getPropertyValue('--wall-dim')), scrim = parseFloat(cs.getPropertyValue('--wall-scrim')) / 100;
      const frost = document.documentElement.classList.contains('wall-frost') ? parseFloat(cs.getPropertyValue('--card-alpha')) / 100 : 1;
      let page = 99, cards = 99;
      for (const s of rec.samples) for (const t of ['ink', 'muted']) {
        const under = C.mix(s, pal.bg, dim);
        page = Math.min(page, C.contrast(pal[t], C.mix(under, pal.bg, scrim)));
        cards = Math.min(cards, C.contrast(pal[t], C.mix(under, pal.panel, frost)));
      }
      out[mode] = { page, cards, dim, scrim, frost };
    }
    D.applyTheme('light');
    return out;
  });
  for (const [mode, r] of Object.entries(await check())) {
    assert.equal(r.dim, 0, mode + ': the slider at 0 stays at 0');
    assert.ok(r.page >= 4.5 - 1e-9, `${mode}: text on the page at ${r.page.toFixed(2)}:1 (backing ${r.scrim})`);
    assert.equal(r.frost, 1, 'cards solid unless see-through');
  }
  assert.match(await card.locator('[aria-live]').first().textContent(), /soft backing/);
  // the backing is real: the version line at the foot of More has the page colour behind it at --wall-scrim
  await p.evaluate(() => { location.hash = '#more'; });
  const backing = await p.locator('p.app-ver').evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, scrim: getComputedStyle(document.documentElement).getPropertyValue('--wall-scrim').trim() }));
  assert.match(backing.bg, /\/ 0\.\d+\)|rgba?\(.*, 0?\.\d+\)/, 'a see-through page-colour backing: ' + backing.bg);
  assert.ok(parseFloat(backing.scrim) > 0, backing.scrim);
  await p.evaluate(() => { location.hash = '#themes'; }); await card.waitFor();

  // see-through cards: frosted (blurred), never under 80% of the card colour, every text on them at 4.5:1
  await card.getByRole('switch', { name: 'See-through cards' }).check();
  const frosted = await p.evaluate(() => { const c = getComputedStyle(document.querySelector('section.card')); return { bg: c.backgroundColor, blur: c.backdropFilter || c.webkitBackdropFilter }; });
  assert.match(frosted.blur, /blur\(14px\)/, 'blurred behind: ' + frosted.blur);
  assert.match(frosted.bg, /\/ 0\.[89]\d*\)|, 0\.[89]\d*\)/, 'the card colour at 80% or more: ' + frosted.bg);
  for (const [mode, r] of Object.entries(await check())) {
    assert.ok(r.frost >= 0.8 && r.frost < 1, `${mode}: see-through at ${r.frost}`);
    assert.ok(r.cards >= 4.5 - 1e-9, `${mode}: text on cards at ${r.cards.toFixed(2)}:1 (cover ${r.frost})`);
  }
  // Flat cards put text on the picture, so there the whole dim goes up to the floor and cards aren't frosted
  await p.evaluate(async () => { const D = await import('./js/display.js'); D.applyDisplay(D.setDisplay({ flat: true })); });
  l = await look();
  assert.ok(Math.abs(l.dim - l.floor) < 1e-6 && l.frost === 1, `flat: dim ${l.dim} = floor ${l.floor}, no frost`);
  await p.evaluate(async () => { const D = await import('./js/display.js'); D.applyDisplay(D.setDisplay({ flat: null, wallFrost: null, wallDim: null })); });

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
  await p.evaluate(() => { location.hash = '#themesadv'; });
  await p.locator('details.tab-icons').evaluate(d => { d.open = true; });
  await p.getByLabel('Icon for Logbook').selectOption('heart');
  const { TAB_ICONS } = await import('../../js/theme-engine.js');
  await p.waitForFunction(d => document.querySelector('.tabs [data-tab="logbook"] path')?.getAttribute('d') === d, TAB_ICONS.heart[1]);

  // a reload: the photo is still there (first paint has the class), the tab icon too
  await p.reload(); await p.waitForSelector('section.card.fine-tune');
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
