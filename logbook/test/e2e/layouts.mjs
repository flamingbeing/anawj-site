// Fake data only. Theme layout variants keep the original case fields and row interactions.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
let passed = 0;
try { for (const width of [390, 1200]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  const apply = async patch => p.evaluate(async patch => {
    const m = await import('./js/display.js'); m.applyDisplay(m.setDisplay(patch));
    const { hooks } = await import('./js/ui-core.js'); hooks.render();
  }, patch);
  const tab = async id => { await p.evaluate(id => { location.hash = '#' + id; }, id); await p.locator(`#app[data-page="${id}"]`).waitFor(); };
  const audit = async () => {
    await p.addScriptTag({ content: readFileSync('tools/vendor/axe.min.js', 'utf8') });
    const violations = await p.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => v.id));
    assert.deepEqual(violations, []); passed++;
  };
  await p.evaluate(async () => {
    const { S, cloud, setCases } = await import('./js/ui-core.js');
    for (const [i, date] of ['2020-01-02', '2020-01-02', '2020-01-01'].entries()) await cloud.saveCase(S.user.email, { id: 'layout-' + i, date, initials: 'ZQ', details: 'Layout sample ' + i, cats: ['16'], createdAt: 1577959200000 + i, updatedAt: Date.now(), source: 'app' });
    setCases(await cloud.listCases(S.user.email));
  });
  const savedCases = () => p.evaluate(async () => { const { S, cloud } = await import('./js/ui-core.js'); return JSON.stringify(await cloud.listCases(S.user.email)); });
  const beforeCases = await savedCases();
  // Native disclosure sections preserve text and tags when folded, reopened and returned to the page layout.
  await p.locator('textarea.details').fill('ZQ layout draft');
  await apply({ formLayout: 'sections', autoFocus: false });
  assert.equal(await p.locator('.case-section').count(), 2);
  assert.equal(await p.locator('.case-section').first().getAttribute('open'), '');
  assert.equal(await p.locator('textarea.details').inputValue(), 'ZQ layout draft');
  await p.locator('.case-section').nth(1).locator('summary').click();
  assert.ok(await p.locator('.case-section').nth(1).locator('.picker').isVisible());
  await audit();
  await apply({ formLayout: 'page' });
  assert.equal(await p.locator('.case-section').count(), 0);
  assert.equal(await p.locator('textarea.details').inputValue(), 'ZQ layout draft'); passed++;
  await tab('themesadv');
  const layout = p.locator('section.card').filter({ has: p.getByRole('heading', { name: 'Rows and forms', exact: true }) });
  assert.equal(await layout.getByRole('radio').count(), 8);
  await layout.locator('input[value=chat]').check();
  assert.ok(await p.locator('html.rows-chat').count());
  // layout is kept when changing theme (on by default): yours, so the theme isn't Custom
  assert.doesNotMatch(await p.locator('.theme-now').innerText(), /Custom/);
  await layout.locator('input[value=card]').check(); passed++;
  await tab('logbook'); await p.locator('.seg button', { hasText: 'List' }).click();
  await p.getByLabel('Search cases').fill('Layout sample');
  await p.waitForFunction(() => document.querySelectorAll('ul.cases li[data-date]').length === 3);
  for (const rowLayout of ['card', 'compact', 'chat', 'timeline']) {
    await apply({ rowLayout, rowShort: null, rowHold: true });
    const rows = p.locator('ul.cases li[data-date]');
    assert.equal(await rows.count(), 3);
    const first = rows.first();
    const css = await first.evaluate(el => ({ grid: getComputedStyle(el).gridTemplateAreas, border: getComputedStyle(el).borderBottomWidth, bg: getComputedStyle(el).backgroundColor, dot: getComputedStyle(el, '::before').content }));
    if (rowLayout === 'compact' || rowLayout === 'chat') assert.match(css.grid, /ini t dt/);
    if (rowLayout === 'chat') {
      assert.equal(await p.locator('.lb-wrap > section.card:has(ul.cases)').evaluate(el => getComputedStyle(el).boxShadow), 'none');
      assert.equal(css.border, '1px'); assert.equal(await first.locator('.chat-time').isVisible(), true); }
    if (rowLayout === 'timeline') { assert.equal(await p.locator('ul.cases .monthhead').count(), 2); assert.equal(css.dot, '""'); }
    await first.click(); await p.locator('dialog[open] textarea').waitFor();
    await p.locator('dialog[open]').getByRole('button', { name: 'Cancel', exact: true }).click();
    await first.scrollIntoViewIfNeeded();
    const box = await first.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + 12); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up();
    await p.locator('dialog[open] .row-menu-list').waitFor();
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await audit();
    if (process.env.E2E_OUT) { mkdirSync(process.env.E2E_OUT, { recursive: true }); await p.screenshot({ path: `${process.env.E2E_OUT}/layout-${rowLayout}-${width}.png` }); }
    await apply({ rowHold: false });
    await first.scrollIntoViewIfNeeded();
    const selectionBox = await first.boundingBox();
    await p.mouse.move(selectionBox.x + selectionBox.width / 2, selectionBox.y + 12); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up();
    await p.locator('.sel-bar').waitFor();
    assert.match(await p.locator('.sel-bar').innerText(), /1 selected/);
    await p.waitForTimeout(400); await p.locator('.sel-bar').getByRole('button', { name: 'Done', exact: true }).click(); passed++;
  }
  // The alias still works, and turning the layout off restores ordinary cards.
  await apply({ rowLayout: null, rowShort: true });
  assert.ok(await p.locator('html.rows-short').count());
  await apply({ rowLayout: 'card' }); assert.equal(await p.locator('html.rows-short').count(), 0); passed++;
  // Rail reuses the same buttons, order and routing, including hidden tabs.
  await apply({ navStyle: 'rail', tabBar: 'bottom', tabIcons: true, tabOrder: ['logbook', 'log', 'reflect', 'more'], tabHidden: ['reflect'] });
  const ids = await p.locator('#tabs button').evaluateAll(els => els.map(el => el.dataset.tab));
  assert.equal(ids[0], 'logbook'); assert.ok(!ids.includes('reflect'));
  const nav = await p.locator('#tabs').boundingBox();
  assert.equal(width > 900 ? nav.height > nav.width : nav.width > nav.height, true);
  assert.equal(await p.locator('#tabs').getAttribute('aria-orientation'), width > 900 ? 'vertical' : 'horizontal');
  if (width > 900) assert.ok(await p.locator('#tabs .lbl').first().isVisible());
  await p.locator('#tabs button[data-tab="log"]').focus(); await p.keyboard.press('Enter'); await p.locator('textarea.details').waitFor();
  await audit(); passed++;
  if (width > 900) {
    for (const w of [900, 901, 600]) { await p.setViewportSize({ width: w, height: 844 }); const r = await p.locator('#tabs').boundingBox(); assert.equal(w > 900 ? r.height > r.width : r.width > r.height, true); }
    await p.setViewportSize({ width, height: 844 });
  }
  if (process.env.E2E_OUT && width === 390) {
    mkdirSync(process.env.E2E_OUT, { recursive: true });
    await apply({ formLayout: 'sections' });
    await p.screenshot({ path: process.env.E2E_OUT + '/layout-sections-phone.png' });
  }
  assert.equal(await savedCases(), beforeCases, 'layout choices never rewrite cases');
  assert.deepEqual(errors, []);
  await ctx.close();
  console.log(`PASS layouts ${width}px`);
} console.log(`PASS layouts: ${passed} render, interaction and accessibility checks`);
} finally { await b.close(); }
