// Fake data only. Settings pages (theme-revamp S3, 21 Oct 2026): Themes (how it looks), Layout (how it works) and
// Accessibility took over Display and Advanced display. Every setting is on exactly one of them, Themes opens with
// "kept on this device only" and Export, and old links, copied links and Settings search land on the new page.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
// every setting that was on Display, Advanced display or Accessibility, and the page it is on now
// (TE S2, 21 Oct 2026: Themes keeps the essentials, the rest is on Advanced theme settings)
const HOME = {
  themes: ['Light or dark', 'Background', 'Wallpaper'],
  themesadv: ['Spacing', 'Line strength', 'Corners', 'Button style', 'Icons instead of words on common buttons', 'Plain calendar', 'Name in the header',
    'Page titles in the header', 'Hide the header (the app name bar)', 'Icons only in the tab bar', 'Shorter Logbook rows', 'Custom CSS (advanced)', 'Colourful', 'Top band', 'Navigation layout'],
  layout: ['Open the app on', 'Tab bar', 'Tabs on the bar', 'Fewer buttons on Logbook rows (a ⋯ menu)', 'Copy button on each Logbook row', 'Copy button for each day',
    'Page width', 'Add tab upside down (phones)', 'Pin the case box at the top of the Add tab', 'Pin the search box at the top of the Logbook and Reflections',
    'Swipe left or right to change tab', 'Swipe from the left edge to go back (iPhone app)', 'Press and hold a Logbook row for its menu', 'Hide the tab bar while typing'],
  access: ['Interface zoom', 'Text size', 'Bigger tap targets on the Add tab', 'Contrast', 'Motion'],
};
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const page = () => p.evaluate(() => document.getElementById('app').dataset.page);
  const open = async (hash, id) => { await p.evaluate(h => { location.hash = h; }, hash); await p.waitForFunction(x => document.getElementById('app').dataset.page === x, id); };
  // the option's text as Settings search reads it (a switch's label, a field's own words, a ✓ list's legend)
  const options = () => p.evaluate(() => [...document.querySelectorAll('#app label.check, #app label.field, #app legend, #app summary, #app .tab-arranger > span')]
    .map(n => (n.matches('label.field') ? [...n.childNodes].filter(c => c.nodeType === 3).map(c => c.textContent).join(' ') : n.textContent).replace(/\s+/g, ' ').trim()));
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');

  // the menu: Themes, Layout, Accessibility under Look; Display and Advanced display gone
  await open('#settings', 'settings');
  for (const id of ['themes', 'layout', 'access']) assert.equal(await p.locator(`.settings-menu a[data-go=${id}]`).count(), 1, id + ' in the menu');
  for (const id of ['display', 'displayadv']) assert.equal(await p.locator(`a[data-go=${id}]`).count(), 0, id + ' still linked');

  // every setting in exactly one place
  const found = {};
  for (const id of Object.keys(HOME)) { await open('#' + id, id); found[id] = await options(); }
  for (const [id, names] of Object.entries(HOME)) for (const name of names) {
    const where = Object.keys(found).filter(k => found[k].includes(name));
    assert.deepEqual(where, [id], `${name}: on ${where.join(', ') || 'no page'}`);
  }

  // Themes links to Advanced theme settings in one row; that page goes Back to Themes and has the preview too
  await open('#themes', 'themes');
  await p.locator('.more-settings a[data-go=themesadv]').click();
  await p.waitForFunction(() => document.getElementById('app').dataset.page === 'themesadv');
  assert.equal(await p.locator('#app .display-preview').count(), 1, 'preview on Advanced');
  assert.equal(await p.locator('.back-link').innerText().then(t => t.replace(/\W+/g, ' ').trim()), 'Themes');
  await p.locator('.back-link').click();
  await p.waitForFunction(() => document.getElementById('app').dataset.page === 'themes');

  // Themes opens with the device-only line and Export (your themes, or this look, as a file)
  await open('#themes', 'themes');
  const top = p.locator('#app .set-page > :not(.display-preview)').first();
  assert.match(await top.innerText(), /Themes are kept on this device only\./);
  const [dl] = await Promise.all([p.waitForEvent('download'), top.getByRole('button', { name: 'Export…' }).click()]);
  assert.equal(dl.suggestedFilename(), 'my-logbook-themes.json');

  // old links and bookmarks: the page, then a copied link to one setting, which flashes on its new page
  for (const [hash, id] of [['#display', 'layout'], ['#displayadv', 'themes'], ['#themesadv', 'themesadv']]) {
    await open('#log', 'log'); await p.evaluate(h => { location.hash = h; }, hash);
    await p.waitForFunction(x => document.getElementById('app').dataset.page === x, id);
    assert.equal(await p.evaluate(() => location.hash), '#' + id, hash + ': address not moved on');
  }
  for (const [hash, id, text] of [['#displayadv?find=Page%20width', 'layout', 'Page width'], ['#displayadv?find=Hide%20the%20header%20(the%20app%20name%20bar)', 'themesadv', 'Hide the header'],
    ['#themes?find=Corners', 'themesadv', 'Corners'], ['#themes?find=Background', 'themes', 'Background'],
    ['#access?find=Swipe%20left%20or%20right%20to%20change%20tab', 'layout', 'Swipe left or right'], ['#display?find=Compact%20mode%20(Tight%20spacing)', 'themesadv', 'Spacing'],
    ['#access?find=Text%20size', 'access', 'Text size']]) {
    await open('#log', 'log'); await p.evaluate(h => { location.hash = h; }, hash);
    await p.waitForFunction(x => document.getElementById('app').dataset.page === x, id);
    await p.locator('#app .flash', { hasText: text }).first().waitFor({ timeout: 5000 });
    assert.equal(await page(), id, hash);
  }

  // Settings search: the result names the new page, opens it, and its copied link points there
  await open('#settings', 'settings');
  for (const [q, text, label] of [['page width', 'Page width', 'Layout'], ['hide the header', 'Hide the header', 'Advanced theme settings'], ['background', 'Background', 'Themes'], ['swipe left', 'Swipe left or right', 'Layout'], ['text size', 'Text size', 'Accessibility']]) {
    await p.getByLabel('Search settings').fill(q);
    // (a few, like the swipe, are also gathered on Profile)
    await p.locator('.settings-search li', { hasText: text }).filter({ has: p.locator('small', { hasText: new RegExp(`^${label}$`) }) }).first().waitFor({ timeout: 5000 });
  }
  await p.getByLabel('Search settings').fill('display');
  await p.waitForTimeout(300);
  assert.equal(await p.locator('.settings-search li small', { hasText: /^(Display|Advanced display)$/ }).count(), 0, 'search still names Display');
  await p.getByLabel('Search settings').fill('page width');
  await p.locator('.settings-search li a', { hasText: 'Page width' }).first().click();
  await p.waitForFunction(() => document.getElementById('app').dataset.page === 'layout');
  await p.locator('fieldset.pick.flash', { hasText: 'Page width' }).waitFor();

  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log(`PASS settings pages ${width}px`);
} } finally { await b.close(); }
