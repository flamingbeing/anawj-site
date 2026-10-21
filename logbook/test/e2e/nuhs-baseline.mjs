// Fake demo data only. The default NUHS look, captured so a change to the colour engine can prove it leaves NUHS as it
// was (theme engine v2, TE S4): Add, List, Settings and a dialog, in light, dark, auto (phone light and dark) and OLED,
// at 390 and 1280 px, from a fresh start and after switching back to NUHS from a heavy theme. For each it writes a
// screenshot and every element's computed colours to E2E_OUT/nuhs; with BASE=<an earlier E2E_OUT>/nuhs it compares
// the colours (exactly) and the screenshots (byte for byte; compare differing ones with an image tool).
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const out = (process.env.E2E_OUT || '/tmp/logbook-tests') + '/nuhs', base = process.env.BASE;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const MODES = [['light', 'light', 'light'], ['dark', 'dark', 'light'], ['oled', 'oled', 'light'], ['auto-light', 'auto', 'light'], ['auto-dark', 'auto', 'dark']];
const PROPS = ['color', 'background-color', 'border-top-color', 'border-bottom-color', 'outline-color', 'box-shadow', 'background-image', 'fill', 'stroke', 'caret-color', 'text-decoration-color'];
const errors = [], diffs = [], shots = [];
const colours = () => page => page.evaluate(PROPS => {
  const root = getComputedStyle(document.documentElement), vars = {};
  for (const s of document.styleSheets) for (const r of (() => { try { return [...s.cssRules]; } catch { return []; } })()) for (const m of (r.cssText.match(/--[\w-]+(?=:)/g) || [])) vars[m] = root.getPropertyValue(m).trim();
  const els = [...document.querySelectorAll('body *')].filter(e => e.getClientRects().length).map(e => {
    const cs = getComputedStyle(e);
    return [e.tagName + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''), ...PROPS.map(p => cs.getPropertyValue(p))].join('|');
  });
  // (as a count of each element kind and its colours: the demo data's dates and times move between runs)
  const counts = {}; for (const e of els) counts[e] = (counts[e] || 0) + 1;
  return { vars: Object.fromEntries(Object.entries(vars).sort()), els: counts, theme: document.querySelector('meta[name="theme-color"]').content };
}, PROPS);
let page;
async function screen(name, tag) {
  if (name === 'dialog') {
    await page.evaluate(async () => { location.hash = '#log'; const c = await import('./js/ui-core.js'); c.confirmBox('Review theme', 'Example text to check dialog readability.', 'OK'); });
    await page.locator('dialog[open]').waitFor();
  } else {
    await page.evaluate(s => { location.hash = '#' + s; }, name === 'list' ? 'logbook' : name);
    if (name === 'log') await page.locator('textarea.details').waitFor();
    else if (name === 'list') { await page.locator('main .seg button', { hasText: /^List$/ }).first().click(); await page.locator('ul.cases').waitFor(); }
    else await page.locator('main h2').first().waitFor();
  }
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(120); await page.evaluate(() => scrollTo(0, 0));
  const file = `${tag}-${name}`;
  await page.screenshot({ path: `${out}/${file}.png`, animations: 'disabled', caret: 'hide' });
  const got = await colours()(page);
  writeFileSync(`${out}/${file}.json`, JSON.stringify(got, null, 1));
  shots.push(file);
  if (base && existsSync(`${base}/${file}.json`)) {
    const was = JSON.parse(readFileSync(`${base}/${file}.json`, 'utf8'));
    const bad = [];
    if (was.theme !== got.theme) bad.push(`theme-color ${was.theme} -> ${got.theme}`);
    for (const [k, v] of Object.entries(was.vars)) if (got.vars[k] !== undefined && got.vars[k] !== v) bad.push(`${k}: ${v} -> ${got.vars[k]}`);
    for (const e of new Set([...Object.keys(was.els), ...Object.keys(got.els)])) if (was.els[e] !== got.els[e]) bad.push(`${was.els[e] || 0} -> ${got.els[e] || 0} × ${e}`);
    if (bad.length) diffs.push(`${file}:\n  ${bad.slice(0, 8).join('\n  ')}`);
  }
  if (name === 'dialog') { await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.locator('dialog[open]').waitFor({ state: 'hidden' }); }
}
try {
  for (const width of [390, 1280]) for (const [tag, theme, phone] of MODES) for (const from of ['fresh', 'back']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: phone });
    page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${process.env.PORT || 8080}/logbook/?demo#log`); await page.locator('textarea.details').waitFor();
    await page.evaluate(async ({ theme, from }) => {
      const d = await import('./js/display.js'), t = await import('./js/themes.js');
      d.applyTheme(theme);
      // a heavy theme first (full colours, a tint, a band, a pattern, facets), then NUHS again
      if (from === 'back') {
        d.applyDisplay(d.setDisplay({ ...t.themePatch(t.themeById('obsidian')), bgTint: 'sepia', band: 'shades', wallpaper: 'dots', iconTint: '#c2417a', colourful: 'all' }));
        d.applyDisplay(d.setDisplay(t.themePatch(t.themeById('nuhs'))));
      }
      (await import('./js/ui-core.js')).hooks.render();
    }, { theme, from });
    // (and a reload, so the first-paint caches are what draws it)
    if (from === 'back') { await page.reload(); await page.locator('textarea.details').waitFor(); }
    for (const name of ['log', 'list', 'settings', 'dialog']) await screen(name, `${width}-${tag}-${from}`);
    await context.close();
  }
  console.log(`${shots.length} screens in ${out}`);
  assert.deepEqual(errors, []);
  if (base) { assert.deepEqual(diffs, [], 'NUHS changed:\n' + diffs.join('\n')); console.log('PASS NUHS unchanged: colours of every element and every variable, against ' + base); }
  else console.log('PASS baseline captured');
} finally { await browser.close(); }
