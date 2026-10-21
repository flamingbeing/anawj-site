// Fake data only. Profiles as presets (profiles.js; Settings → Profile): picking one lists what it changes first
// (Cancel changes nothing), Apply sets the switches and this device's tabs; the Personal profile turns the APMES
// parts off (targets, Still needed, totals, portfolio and Section 1, residency year, reflection headings, the
// "now 4/10" toast, APMES in the name) with Notes on the tab bar; a switch changed after reads "Custom (based on …)",
// and "Back to …" undoes it. Older accounts (mode and basicOn only) look as before. The Settings menu in groups, and
// search finds the profile switches.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const st = () => p.evaluate(async () => (await import('./js/ui-core.js')).settings());
  const tabs = () => p.locator('[role=tab]').evaluateAll(t => t.map(x => x.dataset.tab));
  // (and wait until that page is drawn: most pages' code loads on first use)
  const goHash = h => p.evaluate(x => { location.hash = '#' + x; }, h).then(() => p.waitForFunction(x => document.getElementById('app').dataset.page === x, h));
  const group = name => p.locator(`.showhide [data-group=${name}]`);
  const now = () => p.locator('.profile-now').innerText();
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  assert.equal(await p.title(), 'APMES Logbook');
  const tabsAdvanced = await tabs();   // (the small demo starts in Advanced)

  // the Settings menu, in groups; every page still there
  await goHash('settings');
  assert.deepEqual(await p.locator('.settings-menu h3').allInnerTexts().then(x => x.map(t => t.toLowerCase())), ['profile', 'look', 'logging', 'reflections', 'notes and sharing', 'advanced']);
  for (const id of ['showhide', 'themes', 'layout', 'access', 'logging', 'tags', 'reflset', 'sharefmt', 'sendto', 'loggingadv']) assert.equal(await p.locator(`.settings-menu a[data-go=${id}]`).count(), 1, id);
  // search finds the profile page's switches and the tag editor now
  await p.getByLabel('Search settings').fill('residency year');
  await p.locator('.settings-search li', { hasText: 'Residency year' }).filter({ hasText: 'Profile' }).waitFor();
  // the menu drawn again while typing (the logbook arriving late, as in Safari): the text, results, focus and caret stay
  await p.getByLabel('Search settings').press('ArrowLeft');
  await p.evaluate(async () => (await import('./js/ui-core.js')).hooks.render());
  assert.deepEqual(await p.evaluate(() => { const a = document.activeElement; return [a.getAttribute('aria-label'), a.value, a.selectionStart]; }), ['Search settings', 'residency year', 13]);
  await p.locator('.settings-search li', { hasText: 'Residency year' }).filter({ hasText: 'Profile' }).waitFor({ timeout: 1000 });
  // ...and a change to the cases meanwhile doesn't draw it again at all
  const box = await p.getByLabel('Search settings').elementHandle();
  await p.evaluate(async () => (await import('./js/ui-core.js')).hooks.casesChanged());
  await p.waitForTimeout(400);
  assert.equal(await box.evaluate(el => el.isConnected), true);
  await p.getByLabel('Search settings').fill('tag list file');
  await p.locator('.settings-search li', { hasText: 'Tag editor' }).waitFor();

  // picking Personal: the list of changes first; Cancel changes nothing
  await goHash('showhide');
  assert.equal(await now(), 'Now: Advanced');
  await p.locator('.profile-card input[value=personal]').check();
  const dlg = p.locator('dialog[open]');
  await dlg.getByRole('heading', { name: 'Use Personal' }).waitFor();
  const lines = await dlg.locator('.profile-changes li').allInnerTexts();
  assert.ok(lines.some(l => /^Turns off: Counts against the APMES targets, Still needed/.test(l)), lines.join(' | '));
  assert.ok(lines.some(l => /^Onto the tab bar \(this device\): Notes$/.test(l)), lines.join(' | '));
  // (the dialog's history step comes back late, as in Safari: the radio must go back at once anyway)
  await p.evaluate(() => { const back = history.back.bind(history); history.back = () => setTimeout(back, 600); });
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await p.waitForFunction(() => !document.querySelector('dialog[open]'));
  assert.equal(await p.locator('.profile-card input[value=advanced]').isChecked(), true, 'the radio goes back');
  assert.equal(await p.locator('.profile-card input[value=personal]').isChecked(), false);
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.value), 'advanced', 'and keeps the focus');
  assert.equal((await st()).mode, 'advanced');
  await p.waitForTimeout(700);   // the late step back has come and gone: still Advanced, still focused
  assert.equal(await p.locator('.profile-card input[value=advanced]').isChecked(), true);
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.value), 'advanced');
  await p.evaluate(() => { delete history.back; });
  // ...then Apply
  await p.locator('.profile-card input[value=personal]').check();
  await dlg.getByRole('button', { name: 'Apply' }).click();
  await p.locator('.profile-now', { hasText: 'Now: Personal' }).waitFor();
  assert.equal((await st()).mode, 'personal');
  assert.deepEqual(await tabs(), [...tabsAdvanced.filter(t => t !== 'more' && t !== 'totals'), 'notes', 'more'], 'Notes on the bar; no Totals (totals off)');
  assert.equal(await p.title(), 'Logbook');
  for (const el of await group('apmes').locator('input[role=switch]').all()) assert.equal(await el.isChecked(), false);
  for (const el of await p.locator('.showhide input[data-extra]').all()) assert.equal(await el.isChecked(), true);

  // Personal on screen: counts without targets, no Still needed, a save toast without "now 4/10"
  await p.locator('[role=tab][data-tab=log]').click(); await p.waitForSelector('textarea.details');
  const lscs = p.locator('.picker li[data-code="16"] .ct');
  assert.match(await lscs.innerText(), /^\d+$/);
  assert.equal(await p.locator('.still-needed').count(), 0);
  await p.locator('textarea.details').fill('ZZ fake personal case');
  await p.locator('.picker li[data-code="16"]').click();
  await p.locator('textarea.details').press('Control+Enter');
  await p.locator('#toast', { hasText: /^Saved/ }).waitFor();
  assert.doesNotMatch(await p.locator('#toast').innerText(), /now \d+\/\d+/);
  // Analytics (in More): cases per tag (your own tags too), no year
  await goHash('progress');
  await p.locator('.an-sec summary', { has: p.locator('.an-t', { hasText: /^Tags$/ }) }).click();
  await p.locator('.an-list li', { hasText: 'Lower Segment Caesarean Section' }).first().waitFor();
  assert.equal(await p.locator('.legend.tally').count(), 0);
  assert.equal(await p.getByText('Compare with your intake').count(), 0);
  // Export / Import: no portfolio export or Word upload; Account: no Section 1 or residency year
  await goHash('data');
  await p.getByRole('heading', { name: 'Import', exact: true }).waitFor();
  assert.equal(await p.getByRole('heading', { name: 'Portfolio (Word)' }).count(), 0);
  assert.equal(await p.getByRole('heading', { name: 'Reflections from Word' }).count(), 0);
  await goHash('account');
  await p.getByRole('heading', { name: 'You', exact: true }).waitFor();
  assert.equal(await p.getByRole('heading', { name: 'Portfolio details (Section 1)' }).count(), 0);
  assert.equal(await p.getByRole('heading', { name: 'Residency year' }).count(), 0);
  // Reflections: grouped by month, no Heading grouping
  await goHash('reflect');
  await p.getByLabel('Search reflections').waitFor();
  assert.equal(await p.locator('select[aria-label="Group by"] option[value=heading]').count(), 0);
  // the editor: the APMES heading folded away (kept as saved), no JR note or "What APMES wants covered"
  if (await p.locator('li.refl-row').count()) {
    await p.locator('li.refl-row').first().click();
    await p.locator('.refl-editor details.refl-apmes-heading').waitFor();
    assert.equal(await p.locator('.refl-editor details.refl-guide').count(), 0);
    assert.equal(await p.getByText('marked JR in the Word export').count(), 0);
    await p.getByRole('button', { name: '← Reflections' }).click();
    await p.getByLabel('Search reflections').waitFor();
  }

  // one switch back on: Custom (based on Personal); Back to Personal lists just that, and undoes it
  await goHash('showhide');
  await group('apmes').getByRole('switch', { name: 'Counts against the APMES targets' }).check();
  await p.locator('.profile-now', { hasText: 'Now: Custom (based on Personal)' }).waitFor();
  assert.deepEqual(await p.locator('.profile-card .profile-changes li').allInnerTexts(), ['Turns off: Counts against the APMES targets']);
  await p.locator('[role=tab][data-tab=log]').click();
  assert.match(await lscs.innerText(), /^\d+ \/ \d+ by R\d$/);
  await goHash('showhide');
  await p.locator('.profile-card').getByRole('button', { name: 'Back to Personal' }).click();
  await dlg.getByRole('heading', { name: 'Back to Personal' }).waitFor();
  await dlg.getByRole('button', { name: 'Apply' }).click();
  await p.locator('.profile-now', { hasText: 'Now: Personal' }).waitFor();
  assert.ok(!(await st()).show);
  // a group's reset puts it back to the profile's defaults
  await group('logbook').getByRole('switch', { name: 'The Logbook grid view' }).uncheck();
  await p.locator('.profile-now', { hasText: 'Custom' }).waitFor();
  await group('logbook').getByRole('button', { name: 'Reset this group' }).click();
  await dlg.getByRole('button', { name: 'Reset' }).click();
  await p.locator('.profile-now', { hasText: 'Now: Personal' }).waitFor();
  // a Add tab switch, then another group's reset: the Add tab change stays (the reset reads the settings as they are)
  await group('case').getByRole('switch', { name: /^Quick picks/ }).uncheck();
  await p.locator('.profile-now', { hasText: 'Custom' }).waitFor();
  await group('apmes').getByRole('switch', { name: 'Residency year' }).check();
  await group('apmes').getByRole('button', { name: 'Reset this group' }).click();
  await dlg.getByRole('button', { name: 'Reset' }).click();
  await p.waitForFunction(() => !document.querySelector('dialog[open]'));
  await group('apmes').getByRole('switch', { name: 'Residency year', checked: false }).waitFor();
  assert.equal(await group('case').getByRole('switch', { name: /^Quick picks/ }).isChecked(), false);
  const afterReset = await st();
  assert.equal(afterReset.show['case:recent'], false); assert.deepEqual(afterReset.caseHide, ['recent']);
  assert.notEqual(typeof afterReset.show.year, 'boolean', 'the reset key is cleared (sent as null, as the cloud merges)');
  await group('case').getByRole('button', { name: 'Reset this group' }).click();
  await dlg.getByRole('button', { name: 'Reset' }).click();
  await p.locator('.profile-now', { hasText: 'Now: Personal' }).waitFor();

  // back to Basic: Analytics and Notes into More, the APMES parts back, the extras away
  await p.locator('.profile-card input[value=basic]').check();
  const toBasic = await dlg.locator('.profile-changes li').allInnerTexts();
  assert.ok(toBasic.some(l => /^Turns on: Counts against the APMES targets/.test(l)) && toBasic.some(l => /^Turns off: The Logbook grid view/.test(l)), toBasic.join(' | '));
  assert.ok(toBasic.some(l => /^Into More \(this device\): Notes, Analytics$/.test(l)), toBasic.join(' | '));
  await dlg.getByRole('button', { name: 'Apply' }).click();
  await p.locator('.profile-now', { hasText: 'Now: Basic' }).waitFor();
  assert.deepEqual(await tabs(), tabsAdvanced.filter(t => t !== 'progress'), 'Basic keeps Analytics in More');
  assert.equal(await p.title(), 'APMES Logbook');
  // Notes put on the bar by hand: still plain Basic (tabs no profile moves aren't counted), and it stays on the bar
  // going to Advanced
  await p.evaluate(async () => (await import('./js/ui-settings.js')).setTabOnBar('notes', true));
  await goHash('log'); await goHash('showhide');
  assert.equal(await now(), 'Now: Basic');
  assert.ok((await tabs()).includes('notes'));
  await p.locator('.profile-card input[value=advanced]').check();
  assert.equal(await dlg.getByText(/Into More/).count(), 0);
  await dlg.getByRole('button', { name: 'Apply' }).click();
  await p.locator('.profile-now', { hasText: 'Now: Advanced' }).waitFor();
  const advTabs = await tabs();
  assert.ok(advTabs.includes('notes') && advTabs.includes('totals'), advTabs.join());
  // Settings search: a profile reads as its name
  await goHash('settings');
  await p.getByLabel('Search settings').fill('personal');
  await p.locator('.settings-search li b', { hasText: /^Personal$/ }).first().waitFor();

  // an older account (mode and basicOn only, no switches saved) looks as it did, and reads as Custom
  await p.evaluate(async () => { const { patchLogbook } = await import('./js/ui-core.js'); await patchLogbook({ settings: { mode: 'basic', show: null, basicOn: ['grid', 'case:quick'], caseHide: ['plan'] } }); });
  await goHash('log'); await goHash('showhide');
  await p.locator('.profile-now', { hasText: 'Now: Custom (based on Basic)' }).waitFor();
  assert.equal(await group('logbook').getByRole('switch', { name: 'The Logbook grid view' }).isChecked(), true);
  assert.equal(await group('analytics').getByRole('switch', { name: /^Analytics trends/ }).isChecked(), true, 'full Analytics in every profile');
  assert.equal(await group('reflections').getByRole('switch', { name: 'Figures and references in reflections' }).isChecked(), false);
  assert.equal(await group('case').getByRole('switch', { name: /^Quick picks/ }).isChecked(), true);
  assert.equal(await group('case').getByRole('switch', { name: 'Suggested tags as you type' }).isChecked(), true, 'an older quick turns both halves on');
  assert.equal(await group('case').getByRole('switch', { name: 'Plan for later' }).isChecked(), false);
  assert.equal(await group('apmes').getByRole('switch', { name: 'Counts against the APMES targets' }).isChecked(), true);

  assert.deepEqual(errors, []); await ctx.close(); console.log(`PASS profiles ${width === 390 ? 'phone' : 'desktop'}`);
} } finally { await b.close(); }
