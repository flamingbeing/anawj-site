// Fake data only. Every Inspired look renders its two palettes and system icons in the real app.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { THEMES } from '../../js/themes.js';
import { ICON_SETS } from '../../js/theme-engine.js';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const shots = process.env.E2E_OUT;
if (shots) mkdirSync(shots, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?demo#log');
  await page.locator('textarea.details').waitFor();
  await page.evaluate(() => { location.hash = '#logbook'; });
  await page.locator('main .seg button', { hasText: /^List$/ }).first().click();
  await page.locator('ul.cases').waitFor();
  for (const theme of THEMES.filter(t => t.group === 'inspired')) {
    for (const side of ['light', 'dark']) {
      const actual = await page.evaluate(async ({ id, side }) => {
        const d = await import('./js/display.js'), t = await import('./js/themes.js');
        const ui = await import('./js/ui-core.js');
        d.applyTheme(side);
        d.applyDisplay(d.setDisplay(t.themePatch(t.themeById(id))));
        ui.hooks.render();
        const root = document.documentElement, style = getComputedStyle(root);
        const tokens = Object.fromEntries(['bg', 'panel', 'ink', 'muted', 'line', 'accent', 'accent-ink'].map(k => [k, style.getPropertyValue('--' + k).trim()]));
        return { tokens, status: Object.fromEntries(['ok', 'warn', 'err'].map(k => [k, style.getPropertyValue('--' + k).trim()])), mode: root.dataset.theme, icons: root.dataset.icons,
          logPath: document.querySelector('.tabs button[data-tab="logbook"] .ico path')?.getAttribute('d'),
          heading: getComputedStyle(document.querySelector('.top h1')).color,
          activeTab: getComputedStyle(document.querySelector('.tabs button[aria-selected="true"]')).color,
          overflow: root.scrollWidth > innerWidth + 1,
          custom: t.themeState(d.display()).custom };
      }, { id: theme.id, side });
      const tokens = { ...theme.look.colours[side], 'accent-ink': theme.look.colours[side].accentInk };
      delete tokens.accentInk;
      for (const k of ['ok', 'warn', 'err']) {
        if (tokens[k]) assert.equal(actual.status[k], tokens[k], `${theme.id} ${side}: ${k} status token`);
        delete tokens[k];
      }
      assert.deepEqual(actual.tokens, tokens, `${theme.id} ${side}: effective palette`);
      assert.equal(actual.mode, side, `${theme.id}: keeps appearance choice`);
      assert.equal(actual.icons, theme.look.iconSet, theme.id);
      assert.equal(actual.custom, false, `${theme.id}: selected look survives saving`);
      assert.equal(actual.overflow, false, `${theme.id} ${side}: fits phone width`);
      const cssRgb = hex => 'rgb(' + [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')';
      assert.equal(actual.heading, cssRgb(theme.look.headerStyle === 'filled' ? tokens['accent-ink'] : tokens.ink), `${theme.id} ${side}: heading tone`);
      assert.equal(actual.activeTab, cssRgb(theme.look.tabTone === 'ink' ? tokens.ink : tokens.accent), `${theme.id} ${side}: active tab tone`);
      assert.ok(actual.logPath, `${theme.id}: rendered Logbook icon`);
      if (ICON_SETS[actual.icons]?.paths?.logbook) {
        assert.equal(actual.logPath, ICON_SETS[actual.icons].paths.logbook, `${theme.id}: tab drawing`);
      }
      if (shots && ['apple', 'pixel', 'discord', 'duolingo', 'github', 'netflix', 'applenotes', 'starbucks'].includes(theme.id)) {
        await page.screenshot({ path: `${shots}/${theme.id}-${side}.png`, animations: 'disabled' });
      }
    }
  }
  // Reload uses the same palette, then choosing NUHS removes all the Inspired styling again.
  await page.reload();
  await page.locator('main .seg button', { hasText: /^List$/ }).first().waitFor();
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()), THEMES.at(-1).look.colours.dark.bg);
  await page.evaluate(async () => {
    const d = await import('./js/display.js'), t = await import('./js/themes.js');
    d.applyDisplay(d.setDisplay(t.themePatch(t.themeById('nuhs'))));
  });
  assert.equal(await page.locator('#look-css').textContent(), '');
  assert.deepEqual(errors, []);
  console.log('PASS Inspired themes: 92 looks, light and dark, palettes, layout and reload');
  await context.close();
} finally { await browser.close(); }
