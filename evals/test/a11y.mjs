// Accessibility check of evals in demo mode (axe-core, WCAG 2.2 A/AA rules), light and dark, phone size.
// Fake data only. Run after UI changes (needs a static server on the repo root, as for e2e.spec.mjs):
//   npx http-server . -p 8110 -s &   then   node evals/test/a11y.mjs
// Serious and critical problems fail the run; moderate and minor ones are listed only.
// axe-core is vendored in tools/vendor/axe.min.js (shared with the logbook's a11y test).
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const AXE = new URL('../../tools/vendor/axe.min.js', import.meta.url).pathname;
const BASE = process.env.BASE || 'http://localhost:8110/evals/';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const FAIL = new Set(['serious', 'critical']);

// [name, role (?demo=…), hash]. The form screen opens the first evaluation waiting for the demo assessor.
const SCREENS = [
  ['Home', 'resident', 'home'], ['Requests', 'resident', 'requests'], ['Progress', 'resident', 'progress'],
  ['New request', 'resident', 'new'], ['More', 'resident', 'more'], ['How evals work', 'assessor', 'how'],
  ['My record', 'resident', 'summary'], ['Evaluations', 'assessor', 'pending'], ['Form', 'assessor', 'FORM'],
  ['Overview', 'admin', 'admin'], ['People', 'admin', 'people'],
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
let failed = 0;
for (const theme of ['light', 'dark']) {
  for (const [name, role, hash] of SCREENS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(t => { try { localStorage.setItem('evals-theme', t); } catch {} }, theme);
    const p = await ctx.newPage();
    await p.goto(`${BASE}?demo${role === 'resident' ? '' : '=' + role}#${hash === 'FORM' ? 'pending' : hash}`);
    await p.waitForSelector('main#app > *', { timeout: 15000 });
    await p.waitForTimeout(800);
    if (hash === 'FORM') {
      const link = p.locator('a[href^="#e/"]').first();
      await link.click();
      await p.waitForSelector('.e-q', { timeout: 10000 });
      await p.waitForTimeout(500);
    }
    await p.addScriptTag({ path: AXE });
    const res = await p.evaluate(tags => window.axe.run(document, { runOnly: { type: 'tag', values: tags } }), TAGS);
    const bad = res.violations.filter(v => FAIL.has(v.impact));
    const soft = res.violations.filter(v => !FAIL.has(v.impact));
    const label = `${name} (${theme})`;
    if (bad.length) {
      failed += bad.length;
      console.log(`FAIL ${label}`);
      for (const v of bad) console.log(`  ${v.impact}: ${v.id} — ${v.help}\n    ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join('\n    ')}`);
    } else console.log(`  ok  ${label}${soft.length ? ` (${soft.map(v => v.id).join(', ')})` : ''}`);
    await ctx.close();
  }
}
await browser.close();
if (failed) { console.log(`${failed} serious/critical accessibility problem(s)`); process.exit(1); }
console.log('a11y: no serious or critical problems');
