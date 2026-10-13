// Accessibility check of the logbook in demo mode (axe-core, WCAG 2.2 A/AA rules). Fake data only.
// Not part of the everyday e2e: run it after UI changes, or before a release.
// Run (from the repo root, with a static server on the repo root at port 8080, e.g. python3 -m http.server 8080):
//   node logbook/test/e2e/a11y.mjs [phone|desk]
// Every screen is checked in light mode at both sizes; dark mode only on the main screens (A11Y_DARK=all: every
// screen). Serious and critical problems fail the run; moderate and minor ones are listed only.
// A11Y_ONLY=<words>: only the screens whose name has the words. A11Y_VERBOSE=1: every element, not the first three.
// axe-core is vendored and pinned in tools/vendor/axe.min.js (MPL-2.0); update it by replacing that file.
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const AXE = new URL('../../../tools/vendor/axe.min.js', import.meta.url).pathname;
const BASE = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const only = process.argv[2];
if (only && !['phone', 'desk'].includes(only)) throw new Error('Profile must be phone or desk');
const ONLY = process.env.A11Y_ONLY ? new RegExp(process.env.A11Y_ONLY, 'i') : null;
const ALL_DARK = process.env.A11Y_DARK === 'all';
const VERBOSE = !!process.env.A11Y_VERBOSE;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const FAIL = new Set(['serious', 'critical']);

// [name, open it, checked in dark mode by default]. A screen opens by its #hash; a dialog or editor by the app's
// own functions, as in usability.mjs.
const hash = id => async p => { await p.evaluate(h => { location.hash = '#' + h; }, id); };
const SCREENS = [
  ['Case', hash('log'), true],
  ['Logbook calendar', hash('logbook'), true],
  ['Logbook list', async p => { await hash('logbook')(p); await p.locator('main .seg button', { hasText: /^List$/ }).first().click(); }, false],
  ['Reflections', hash('reflect'), true],
  ['Analytics', hash('progress'), true],
  ['Totals', hash('totals'), false],
  ['More', hash('more'), true],
  ['Account', hash('account'), false],
  ['Settings', hash('settings'), false],
  ['Display', hash('display'), true],
  ['Advanced display', hash('displayadv'), false],
  ['Logging', hash('logging'), false],
  ['Profiles or hide items', hash('showhide'), false],
  ['Advanced logging', hash('loggingadv'), false],
  ['Tag editor', hash('tags'), false],
  ['Reflection settings', hash('reflset'), false],
  ['Markdown', hash('sharefmt'), false],
  ['Send to', async p => {
    await hash('sendto')(p);
    await p.getByLabel('Add a place to send to').selectOption('obsidian');
  }, true],
  ['Send menu', async p => {
    await hash('sendto')(p);
    await p.getByLabel('Add a place to send to').selectOption('whatsapp');
    await p.getByRole('button', { name: 'Save', exact: true }).click();
    await p.waitForFunction(async () => ((await import('./js/ui-core.js')).S.logbook.settings.destinations || []).length === 1);
    await hash('logbook')(p);
    await p.evaluate(async () => { const { openSend } = await import('./js/ui-send.js'); openSend({ text: 'Fake day', date: '2026-10-10' }); });
    await p.waitForSelector('dialog[open]');
  }, true],
  ['Export / Import', hash('data'), false],
  ['Recover drafts', hash('recovery'), false],
  ['Admin portal', hash('admin'), false],
  ['Admin residents', hash('adminresidents'), false],
  ['Advanced admin', hash('adminadv'), false],
  ['Case logs', hash('caselogs'), false],
  ['Case log', async p => { await hash('caselogs')(p); await p.locator('.caselog-list a').first().click(); await p.locator('table.totals').waitFor(); }, false],
  ['Edit case dialog', async p => {
    await hash('logbook')(p);
    await p.evaluate(async () => { const { S } = await import('./js/ui-core.js'); const { editCaseDialog } = await import('./js/ui-log.js'); editCaseDialog(S.cases[0]); });
    await p.waitForSelector('dialog[open]');
  }, true],
  ['Notes', hash('notes'), true],
  ['Note editor', async p => {
    await hash('notes')(p);
    await p.getByRole('button', { name: '+ New note' }).click();
    await p.getByLabel('Note title').fill('Fake a11y note');
    await p.getByLabel('Note text').fill('# Fake heading\n- [ ] fake to-do\n[fake link](https://example.com)');
    await p.waitForSelector('.note-editor');
  }, true],
  ['Note preview', async p => {
    await hash('notes')(p);
    await p.getByRole('button', { name: '+ New note' }).click();
    await p.getByLabel('Note text').fill('# Fake heading\n- [ ] fake to-do\n- [x] fake done\n**bold** [fake link](https://example.com)');
    await p.getByRole('button', { name: 'More options' }).click();
    await p.getByRole('menuitem', { name: 'Preview' }).click();
    await p.waitForSelector('.note-view:not([hidden])');
  }, false],
  ['Note settings', hash('notesset'), false],
  ['Daily note on the Logbook', async p => {
    await hash('logbook')(p);
    await p.locator('main .seg button', { hasText: /^Calendar$/ }).first().click();   // an earlier screen left the list on
    await p.locator('.lb-calbar').getByRole('button', { name: 'Today', exact: true }).click();
    await p.getByRole('button', { name: '+ Daily note' }).click();
    await p.getByLabel('Note text').fill('Fake day\n- [ ] fake to-do\n*fake italic*');
    await p.waitForFunction(async () => (await import('./js/ui-core.js')).S.notes?.some(n => n.id.startsWith('day-')), null, { timeout: 8000 });
    await p.getByRole('button', { name: 'Done' }).click();
    await p.locator('.lb-daynote').waitFor();
  }, true],
  ['Note editor with formatting buttons', async p => {
    await p.evaluate(async () => { const m = await import('./js/ui-settings.js'); m.setDisplay({ noteToolbar: true }); });
    await hash('notes')(p);
    await p.getByRole('button', { name: '+ New note' }).click();
    await p.getByRole('toolbar', { name: 'Formatting' }).waitFor();
  }, false],
  ['Case tab daily note', async p => {
    await p.evaluate(async () => { const { patchLogbook, hooks } = await import('./js/ui-core.js'); await patchLogbook({ settings: { dayNoteOnCase: true } }); hooks.render(); });
    await p.locator('.day-note-box summary').click();
    await p.waitForSelector('.day-note-text:not([disabled])');
  }, false],
  ['Shared with the app', async p => {
    await p.evaluate(() => sessionStorage.setItem('logbook-shared', 'AB 40M fake lap chole\nFake second line'));
    await hash('share')(p);
    await p.locator('.share-preview').waitFor();
  }, true],
  ['Reflection editor', async p => {
    await hash('reflect')(p);
    await p.evaluate(async () => { const { reflectOnCase } = await import('./js/ui-reflect.js'); await reflectOnCase({ id: 'fake-a11y', date: '2026-10-10', initials: 'ZZ', details: 'Fake case for the accessibility check', cats: ['13'] }); });
    await p.waitForSelector('.refl-editor');
  }, true],
];

const runs = [];
for (const [label, viewport] of [['phone', { width: 390, height: 844 }], ['desk', { width: 1280, height: 900 }]])
  if (!only || only === label) for (const theme of ['light', 'dark']) runs.push({ label, viewport, theme });

const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
let failed = 0, warned = 0;
const t0 = Date.now();
try {
  for (const { label, viewport, theme } of runs) {
    const screens = SCREENS.filter(([name, , dark]) => (!ONLY || ONLY.test(name)) && (theme === 'light' || dark || ALL_DARK));
    if (!screens.length) continue;
    const ctx = await b.newContext({ viewport, colorScheme: theme, serviceWorkers: 'block' });
    await ctx.addInitScript(t => { try { localStorage.setItem('apmes-logbook-demo-small', '1'); localStorage.setItem('apmes-logbook-theme', t); } catch { /* none */ } }, theme);
    for (const [name, open] of screens) {
      // a fresh page per screen, so a dialog or editor left open never leaks into the next check
      const p = await ctx.newPage();
      await p.goto(BASE + '?demo#log');
      await p.waitForSelector('textarea.details');
      await open(p);
      await p.waitForTimeout(400);
      await p.addScriptTag({ path: AXE });
      const { violations } = await p.evaluate(tags => globalThis.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] }), TAGS);
      const bad = violations.filter(v => FAIL.has(v.impact)), minor = violations.filter(v => !FAIL.has(v.impact));
      failed += bad.length; warned += minor.length;
      console.log(`${bad.length ? 'FAIL' : 'ok  '} ${label} ${theme} · ${name}${violations.length ? ` · ${bad.length} serious, ${minor.length} minor` : ''}`);
      for (const v of violations) {
        console.log(`     ${FAIL.has(v.impact) ? '✗' : '·'} [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
        for (const n of VERBOSE ? v.nodes : v.nodes.slice(0, 3)) console.log(`         ${n.target.join(' ')}${n.failureSummary ? ' — ' + n.failureSummary.split('\n').slice(1).join('; ').trim() : ''}`);
      }
      await p.close();
    }
    await ctx.close();
  }
} finally { await b.close(); }
console.log(`\n${failed} serious or critical, ${warned} moderate or minor · ${Math.round((Date.now() - t0) / 1000)} s`);
if (failed) process.exit(1);
