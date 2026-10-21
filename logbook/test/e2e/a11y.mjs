// Accessibility check of the logbook in demo mode (axe-core, WCAG 2.2 A/AA rules). Fake data only.
// Not part of the everyday e2e: run it after UI changes, or before a release.
// Run (from the repo root, with a static server on the repo root at port 8080, e.g. python3 -m http.server 8080):
//   node logbook/test/e2e/a11y.mjs [phone|desk]
// Every screen is checked in light mode at both sizes; dark mode only on the main screens (A11Y_DARK=all: every
// screen). Serious and critical problems fail the run; moderate and minor ones are listed only.
// A11Y_ONLY=<words>: only the screens whose name has the words. A11Y_VERBOSE=1: every element, not the first three.
// axe-core is vendored and pinned in tools/vendor/axe.min.js (MPL-2.0); update it by replacing that file.
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const { fileURLToPath } = await import('node:url');
const AXE = fileURLToPath(new URL('../../../tools/vendor/axe.min.js', import.meta.url));
const BASE = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const only = process.argv[2];
if (only && !['phone', 'desk'].includes(only)) throw new Error('Profile must be phone or desk');
const ONLY = process.env.A11Y_ONLY ? new RegExp(process.env.A11Y_ONLY, 'i') : null;
const ALL_DARK = process.env.A11Y_DARK === 'all';
const VERBOSE = !!process.env.A11Y_VERBOSE;
// A11Y_WALL=<dots|grid|paper|gradient>: every screen with that wallpaper behind it (Themes → Wallpaper)
const WALL = process.env.A11Y_WALL || '';
// with it, A11Y_INK=<6..36> its strength and A11Y_FROST=1 see-through cards (TE S3)
const WALL_LOOK = { wallInk: Number(process.env.A11Y_INK) || null, wallFrost: process.env.A11Y_FROST ? true : null };
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const FAIL = new Set(['serious', 'critical']);

// [name, open it, checked in dark mode by default]. A screen opens by its #hash; a dialog or editor by the app's
// own functions, as in usability.mjs.
const hash = id => async p => { await p.evaluate(h => { location.hash = '#' + h; }, id); };
const SCREENS = [
  ['Case', hash('log'), true],
  ['Logbook calendar', hash('logbook'), true],
  ['Paste a list review', async p => {
    await p.locator('.datebar button[data-mode="bulk"]').click();
    await p.locator('textarea.details').fill('AB 30F\nLSCS spinal\n\nCD 40M\nlap chole GA');
    await p.getByRole('button', { name: 'Review', exact: true }).click();
    await p.waitForSelector('table.bulk');
    // reviewed from the bottom, as a list is (above it, the last rows sit under the Save all bar)
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  }, false],
  ['Logbook list', async p => { await hash('logbook')(p); await p.locator('main .seg button', { hasText: /^List$/ }).first().click(); }, false],
  ['Logbook grid', async p => {
    await p.evaluate(async () => { const { patchLogbook } = await import('./js/ui-core.js'); await patchLogbook({ settings: { show: { grid: true }, logbookView: 'grid' } }); });
    await hash('logbook')(p); await p.locator('table.grid.sheet tbody tr').first().waitFor();
  }, true],
  ['Logbook selecting', async p => {
    await hash('logbook')(p); await p.locator('main .seg button', { hasText: /^List$/ }).first().click();
    await p.locator('button.lb-selbtn').click();
    await p.locator('ul.cases li:not(.monthhead)').nth(1).click();
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  }, true],
  ['Bulk edit', async p => {
    await hash('logbook')(p); await p.locator('main .seg button', { hasText: /^List$/ }).first().click();
    await p.locator('button.lb-selbtn').click();
    await p.locator('ul.cases li:not(.monthhead)').nth(1).click();
    await p.locator('.sel-bar').getByRole('button', { name: 'Bulk edit…' }).click();
    await p.locator('dialog[open]').getByLabel('Case summary').selectOption('find');
    await p.locator('dialog[open]').getByLabel('Tags', { exact: true }).selectOption('replace');
  }, true],
  ['Reflections', hash('reflect'), true],
  ['Reflections selecting', async p => {
    await hash('reflect')(p); await p.locator('li.refl-row').first().waitFor();
    await p.locator('main button', { hasText: /^Select$/ }).first().click();
    await p.locator('li.refl-row').first().click();
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  }, true],
  ['Reflections bulk edit', async p => {
    await hash('reflect')(p); await p.locator('li.refl-row').first().waitFor();
    await p.locator('main button', { hasText: /^Select$/ }).first().click();
    await p.locator('li.refl-row').first().click();
    await p.locator('.sel-bar').getByRole('button', { name: 'Bulk edit…' }).click();
    await p.locator('dialog[open]').getByLabel('Heading', { exact: true }).selectOption('move');
  }, false],
  ['Analytics', hash('progress'), true],
  ['Totals', hash('totals'), false],
  ['More', hash('more'), true],
  ['Account', hash('account'), false],
  ['Settings', hash('settings'), false],
  ['Themes', hash('themes'), true],
  ['Advanced theme settings', hash('themesadv'), true],
  ['Colour sheet', async p => { await hash('themes')(p); await p.getByRole('button', { name: 'More colours', exact: true }).click(); await p.waitForSelector('dialog.colour-sheet[open]'); }, true],
  ['Layout', hash('layout'), false],
  ['Accessibility', hash('access'), false],
  ['Logging', hash('logging'), false],
  ['Profile', hash('showhide'), false],
  ['Profile dialog', async p => { await hash('showhide')(p); await p.locator('.profile-card input[value=personal]').check(); await p.waitForSelector('dialog[open]'); }, false],
  // the targets switched off (in memory only: the demo store is shared by the next screens)
  ['Analytics without targets', async p => { await hash('progress')(p); await p.evaluate(async () => { const { S, hooks } = await import('./js/ui-core.js'); S.logbook.settings = { ...S.logbook.settings, show: { targets: false, totals: false, year: false } }; hooks.render(); }); await p.locator('.an-sec summary', { has: p.locator('.an-t', { hasText: /^Tags$/ }) }).waitFor(); }, false],
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
  ['Sync', async p => {
    await hash('sync')(p);
    await p.getByLabel('Add a place to sync to').selectOption('github');
    await p.getByLabel('Add a place to sync to').selectOption('drive');
  }, true],
  ['Sync run', async p => {
    await hash('logbook')(p);
    await p.evaluate(async () => {
      const { patchLogbook } = await import('./js/ui-core.js');
      await patchLogbook({ settings: { sync: { targets: [{ id: 'gh1', kind: 'github', owner: 'fake-user', repo: 'fake-notes' }] } } });
      localStorage.setItem('apmes-logbook-cloud-gh:demo:demo@example.com:gh1', 'FAKE');
    });
    // GitHub answers from here, no network: every day is new, every write accepted
    await p.route('https://api.github.com/**', route => route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
      : route.request().method() === 'GET'
      ? route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' })
      : route.fulfill({ status: 201, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ content: { sha: 'fake' } }) }));
    await hash('settings')(p); await hash('logbook')(p);
    await p.locator('button.lb-sync').click();
    await p.getByText(/^Synced \d+ of/).waitFor();
  }, true],
  ['Export / Import', hash('data'), false],
  ['Recover', hash('recovery'), false],
  ['Admin portal', hash('admin'), false],
  ['Send feedback', async p => { await hash('feedback')(p); await p.getByLabel('Your feedback').waitFor(); }, true],
  ['Feedback (owner)', async p => {
    await p.evaluate(async () => { const { cloud } = await import('./js/ui-core.js'); await cloud.sendFeedback({ uid: 'demo-uid', text: 'Fake: the tag picker is slow', doing: 'Logging a fake case', screen: 'log', version: 'logbook-v41-fake', ua: 'Fake browser', status: 'new' }); });
    await hash('feedbackinbox')(p); await p.locator('.fb-item').first().waitFor();
  }, true],
  ['Admin residents', hash('adminresidents'), false],
  ['Advanced admin', hash('adminadv'), false],
  ['Case logs', hash('caselogs'), false],
  ['Case log', async p => { await hash('caselogs')(p); await p.locator('.caselog-list a').first().click(); await p.locator('table.totals').waitFor(); }, false],
  ['Edit case dialog', async p => {
    await hash('logbook')(p);
    await p.waitForFunction(() => Number(document.body.dataset.cases) > 0);   // the demo's cases load after the first drawing
    await p.evaluate(async () => { const { S } = await import('./js/ui-core.js'); const { editCaseDialog } = await import('./js/ui-log.js'); editCaseDialog(S.cases[0]); });
    await p.waitForSelector('dialog[open]');
  }, true],
  ['Search', async p => {
    await hash('search')(p); await p.getByLabel('Search everything').fill('lap');
    await p.locator('.gs-group').first().waitFor();
    await p.getByRole('button', { name: 'Search operators' }).click();
  }, true],
  ['Search selecting', async p => {
    await hash('search')(p); await p.getByLabel('Search everything').fill('lap');
    await p.locator('.gs-group').first().waitFor();
    await p.locator('.gs-selbtn').click(); await p.locator('.gs-item').first().click();
    await p.locator('.gs-chips button', { hasText: /^Dates$/ }).click();
  }, false],
  ['Notes', hash('notes'), true],
  ['Notes selecting', async p => {
    await p.evaluate(async () => { const D = await import('./js/demo-backend.js'), t = Date.now(); for (const i of [1, 2]) D.saveNote('demo@example.com', { id: 'fake-a11y-' + i, date: '2020-03-0' + i, title: 'Fake a11y note ' + i, body: 'Fake', createdAt: t + i, updatedAt: t + i }); });
    await hash('notes')(p); await p.locator('ul.notes-rows > li').first().waitFor();
    await p.locator('button.notes-selbtn').click(); await p.locator('ul.notes-rows > li').first().click();
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  }, true],
  ['Notes bulk edit', async p => {
    await p.evaluate(async () => { const D = await import('./js/demo-backend.js'), t = Date.now(); for (const i of [1, 2]) D.saveNote('demo@example.com', { id: 'fake-a11y-' + i, date: '2020-03-0' + i, title: 'Fake a11y note ' + i, body: 'Fake', createdAt: t + i, updatedAt: t + i }); });
    await hash('notes')(p); await p.locator('ul.notes-rows > li').first().waitFor();
    await p.locator('button.notes-selbtn').click(); await p.locator('ul.notes-rows > li').first().click();
    await p.locator('.sel-bar').getByRole('button', { name: 'Bulk edit…' }).click();
    await p.locator('dialog[open]').getByLabel('Title', { exact: true }).selectOption('find');
  }, false],
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
  ['Note editor menu (long title)', async p => {
    await hash('notes')(p);
    await p.getByRole('button', { name: '+ New note' }).click();
    await p.getByLabel('Note title').fill('Fake long title that wraps onto a second line on a phone screen');
    await p.getByRole('button', { name: 'More options' }).click();
    await p.locator('.note-menu:not([hidden])').waitFor();
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
  ['Add tab daily note', async p => {
    await p.evaluate(async () => { const { patchLogbook, hooks } = await import('./js/ui-core.js'); await patchLogbook({ settings: { dayNoteOnCase: true } }); hooks.render(); });
    await p.locator('.day-note-box summary').click();
    await p.waitForSelector('.day-note-text:not([disabled])');
  }, false],
  ['Shared with the app', async p => {
    await p.evaluate(() => sessionStorage.setItem('logbook-shared', 'AB 40M fake lap chole\nFake second line'));
    await hash('share')(p);
    await p.locator('.share-preview').waitFor();
  }, true],
  // Labelled parts on (Settings → Advanced logging): the label editor and case template, bold labels on Logbook rows,
  // the Learning points page
  ['Advanced logging, labelled parts', async p => {
    await p.evaluate(async () => { const { patchLogbook } = await import('./js/ui-core.js'); await patchLogbook({ settings: { labelParts: true, caseTplOn: true, caseTpl: 'ASA :\nPlan :' } }); });
    await hash('loggingadv')(p);
    await p.locator('.label-editor:not([hidden])').waitFor();
  }, false],
  ['Logbook list, labelled parts', async p => {
    await p.evaluate(async () => { const { patchLogbook, createCase, todayISO } = await import('./js/ui-core.js'); await patchLogbook({ settings: { labelParts: true } }); await createCase({ date: todayISO(), details: 'Fake a11y case\nPlan: GA\nlp: fake learning point', cats: ['13'] }); });
    await hash('logbook')(p); await p.locator('main .seg button', { hasText: /^List$/ }).first().click();
    await p.locator('ul.cases .part-l').first().waitFor();
  }, true],
  ['Learning points', async p => {
    await p.evaluate(async () => { const { patchLogbook, createCase, todayISO } = await import('./js/ui-core.js'); await patchLogbook({ settings: { labelParts: true } }); await createCase({ date: todayISO(), details: 'Fake a11y case\nlp: fake learning point', cats: ['13'] }); });
    await hash('points')(p);
    await p.locator('.point-row').first().waitFor();
  }, true],
  ['Reflection editor', async p => {
    await hash('reflect')(p);
    await p.evaluate(async () => { const { reflectOnCase } = await import('./js/ui-reflect.js'); await reflectOnCase({ id: 'fake-a11y', date: '2026-10-10', initials: 'ZZ', details: 'Fake case for the accessibility check', cats: ['13'] }); });
    await p.waitForSelector('.refl-editor');
  }, true],
  // last: it turns on the row menu and Request an evaluation for the rest of the run
  ['Case menu with Request an evaluation', async p => {
    await p.evaluate(async () => {
      const { setShown } = await import('./js/ui-core.js'); await setShown('evalRequest', true);
      const m = await import('./js/ui-settings.js'); m.applyDisplay(m.setDisplay({ rowMenu: true }));
    });
    await hash('logbook')(p);
    await p.locator('main .seg button', { hasText: /^List$/ }).first().click();
    await p.locator('ul.cases li[data-date] .row-more').first().click();
    await p.locator('dialog[open] .row-menu-list').waitFor();
  }, false],
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
    await ctx.addInitScript(([t, wall, look]) => { try { localStorage.setItem('apmes-logbook-demo-small', '1'); localStorage.setItem('apmes-logbook-theme', t); if (wall && !localStorage.getItem('apmes-logbook-display')) localStorage.setItem('apmes-logbook-display', JSON.stringify({ v: 2, wallpaper: wall, ...look })); } catch { /* none */ } }, [theme, WALL, WALL_LOOK]);
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
