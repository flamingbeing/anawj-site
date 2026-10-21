// Fake data only. Settings → Profile (profiles as presets; grouped switches, a reset per group), and the backup as one
// spreadsheet (CSV download and restore).
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const st = () => p.evaluate(async () => { const { settings } = await import('./js/ui-core.js'); const { display } = await import('./js/ui-settings.js'); return { s: settings(), d: display() }; });
  const group = name => p.locator(`.showhide [data-group=${name}]`);
  await p.goto(base + '?demo#settings'); await p.locator('a[data-go=showhide]').click();
  await p.getByRole('heading', { name: 'Show or hide', exact: true }).waitFor();

  // switches change the same settings as their own pages
  await group('tips').getByLabel('Show tips and help text').uncheck();
  await p.waitForFunction(() => document.body.classList.contains('no-help'));
  await group('case').getByLabel('Plan for later').uncheck();
  await group('apmes').getByLabel('Still needed (on the Add tab)').uncheck();
  await p.waitForFunction(async () => { const { settings } = await import('./js/ui-core.js'); return (settings().caseHide || []).length === 2; });
  await group('logbook').getByLabel('Copy and Reflect buttons on each case').uncheck();
  await group('bar').getByLabel('Notes on the tab bar').check();
  await p.locator('[role=tab][data-tab=notes]').waitFor();
  // Advanced puts Analytics on the bar (Case, Logbook, Totals, Reflections, Analytics, More; owner, 15 Oct 2026)
  assert.equal(await p.locator('[role=tab][data-tab=progress]').count(), 1);
  await group('bar').getByLabel('Analytics on the tab bar').check();
  await p.locator('[role=tab][data-tab=progress]').waitFor();
  assert.equal((await st()).d.rowMenu, true);

  // resetting one group leaves the others alone
  await group('case').getByRole('button', { name: 'Reset this group' }).click();
  await p.locator('dialog[open]').getByRole('button', { name: 'Reset' }).click();
  await p.waitForFunction(async () => { const { settings } = await import('./js/ui-core.js'); return (settings().caseHide || []).join() === 'still'; });
  await group('apmes').getByRole('button', { name: 'Reset this group' }).click();
  await p.locator('dialog[open]').getByRole('button', { name: 'Reset' }).click();
  await p.waitForFunction(async () => { const { settings } = await import('./js/ui-core.js'); return !settings().caseHide; });
  let now = await st();
  assert.equal(now.s.hideTips, true); assert.equal(now.d.rowMenu, true);
  await group('bar').getByRole('button', { name: 'Reset this group' }).click();
  await p.locator('dialog[open]').getByRole('button', { name: 'Reset' }).click();
  await p.waitForFunction(() => !document.querySelector('[role=tab][data-tab=notes]'));
  assert.deepEqual((await p.locator('[role=tab]').evaluateAll(t => t.map(x => x.dataset.tab))), ['log', 'logbook', 'totals', 'reflect', 'progress', 'more'], 'Advanced: Case, Logbook, Totals, Reflections, Analytics, More');
  now = await st();
  assert.equal(now.s.hideTips, true); assert.equal(now.d.rowMenu, true);
  await group('tips').getByRole('button', { name: 'Reset this group' }).click();
  await p.locator('dialog[open]').getByRole('button', { name: 'Reset' }).click();
  await p.waitForFunction(() => !document.body.classList.contains('no-help'));
  await group('logbook').getByRole('button', { name: 'Reset this group' }).click();
  await p.locator('dialog[open]').getByRole('button', { name: 'Reset' }).click();
  await p.waitForFunction(async () => { const { display } = await import('./js/ui-settings.js'); return !display().rowMenu; });

  // Profiles (top of Settings → Profile, the only place). Basic is the default (these tests start in Advanced).
  // Basic keeps the tabs and buttons where they are without the extras, Analytics in More; it hides interface items
  // only (never settings), and each can be turned back on
  const tabsNow = () => p.locator('[role=tab]').evaluateAll(t => t.map(x => x.dataset.tab));
  const pickProfile = async k => { await p.evaluate(() => { location.hash = '#showhide'; }); await p.locator(`.profile-card input[value=${k}]`).check(); await p.locator('dialog[open]').getByRole('button', { name: 'Apply' }).click(); };
  assert.equal(await p.evaluate(async () => { const { S, profile } = await import('./js/ui-core.js'); const was = S.logbook.settings; S.logbook.settings = { ...was, mode: null }; const out = profile(); S.logbook.settings = was; return out; }), 'basic', 'Basic is the default');
  await p.evaluate(() => { location.hash = '#settings'; });
  assert.equal(await p.locator('.profile-card, .basic-card').count(), 0, 'the profile is in Settings → Profile only');
  const tabsAdvanced = await tabsNow();
  await pickProfile('basic');
  await p.waitForFunction(() => document.body.classList.contains('basic'));
  assert.deepEqual(await tabsNow(), tabsAdvanced.filter(t => t !== 'progress'), 'Basic: Analytics goes into More');
  await p.locator('[role=tab][data-tab=more]').click();
  await p.locator('.more-list a[data-go=progress]').waitFor();
  // settings stay: the advanced settings links and cards are all there
  await p.evaluate(() => { location.hash = '#logging'; });
  await p.locator('a[data-go=loggingadv]').waitFor();
  await p.evaluate(() => { location.hash = '#settings'; });
  await p.locator('section:has(h2:text("Connect an AI assistant (advanced)"))').waitFor();
  await p.locator('[role=tab][data-tab=log]').click(); await p.waitForSelector('textarea.details');
  await p.locator('textarea.details').fill('ZZ 30F fake LSCS spinal');
  assert.doesNotMatch(await p.locator('main').innerText(), /quick picks|still needed|interesting/i);
  await p.locator('textarea.details').fill('');
  await p.locator('[role=tab][data-tab=logbook]').click();
  assert.equal(await p.locator('main .seg button').filter({ hasText: /^Grid$/ }).count(), 0);
  await p.evaluate(() => { location.hash = '#progress'; });
  await p.locator('.an-sec').first().waitFor();
  // full Analytics in every profile, Basic too (owner, 15 Oct 2026)
  await p.locator('.an-sec summary').filter({ hasText: 'Trends' }).waitFor();
  await p.evaluate(async () => { const { reflectOnCase } = await import('./js/ui-reflect.js'); await reflectOnCase({ id: 'fake-basic', date: '2026-10-10', initials: 'ZZ', details: 'Fake basic case', cats: ['13'] }); });
  await p.waitForSelector('.refl-editor');
  assert.equal(await p.locator('.refl-editor summary').filter({ hasText: /Figures|References/ }).count(), 0);
  await p.goBack(); await p.waitForFunction(() => !document.querySelector('.refl-editor'));
  // ...and back on, one by one
  await p.evaluate(() => { location.hash = '#showhide'; });
  assert.equal(await group('reflections').getByRole('switch', { name: /^Reflect buttons/ }).isChecked(), true, 'Basic keeps the reflections');
  await p.locator('.profile-now', { hasText: 'Now: Basic' }).waitFor();
  await group('logbook').getByRole('switch', { name: 'The Logbook grid view' }).check();
  await p.locator('.profile-now', { hasText: 'Custom (based on Basic)' }).waitFor();
  await group('analytics').getByRole('switch', { name: /^Analytics trends/ }).check();
  await group('reflections').getByRole('switch', { name: 'Figures and references in reflections' }).check();
  await group('case').getByLabel(/Quick picks/).check();
  await group('case').getByLabel('Suggested tags as you type').check();
  await group('bar').getByLabel('Analytics on the tab bar').check();
  await p.locator('[role=tab][data-tab=progress]').waitFor();
  await p.locator('[role=tab][data-tab=logbook]').click();
  await p.locator('main .seg button').filter({ hasText: /^Grid$/ }).waitFor();
  await p.locator('[role=tab][data-tab=progress]').click();
  await p.locator('.an-sec summary').filter({ hasText: 'Trends' }).waitFor();
  await p.evaluate(async () => { const { reflectOnCase } = await import('./js/ui-reflect.js'); await reflectOnCase({ id: 'fake-basic2', date: '2026-10-10', initials: 'ZZ', details: 'Fake basic case', cats: ['13'] }); });
  await p.locator('.refl-editor summary').filter({ hasText: /References/ }).waitFor();
  await p.goBack(); await p.waitForFunction(() => !document.querySelector('.refl-editor'));
  { const s = (await st()).s.show; assert.ok(s['case:recent'] === true && s['case:sugg'] === true); }

  // Basic: logbook only: Basic without reflections (picking a profile starts from its defaults)
  await pickProfile('logbook');
  await p.waitForFunction(() => document.body.classList.contains('logbook-only'));
  assert.ok(!(await st()).s.show, 'picking a profile starts from its defaults');
  assert.deepEqual(await tabsNow(), tabsAdvanced.filter(t => t !== 'reflect' && t !== 'progress'), 'Case, Logbook, Totals, More');
  await p.locator('[role=tab][data-tab=logbook]').click();
  await p.locator('main .seg button').filter({ hasText: /^List$/ }).click();
  await p.locator('ul.cases li').first().waitFor();
  assert.equal(await p.locator('main button[aria-label*="reflection on this case"]').count(), 0);
  // Copy on each row is off by default (Layout), so a logbook-only row has no buttons
  assert.equal(await p.locator('main button[aria-label="Copy this case"]').count(), 0);
  await p.locator('[role=tab][data-tab=more]').click();
  await p.locator('.more-list a[data-go=reflect]').click();
  await p.locator('main h2').filter({ hasText: 'Reflections' }).first().waitFor();
  // everything back on, one by one, is Advanced again
  await p.evaluate(() => { location.hash = '#showhide'; });
  for (const el of await p.locator('.showhide input[data-extra]').all()) await el.check();
  await group('apmes').getByLabel('Still needed (on the Add tab)').check();
  for (const el of await group('case').locator('input[role=switch]').all()) await el.check();
  await group('bar').getByLabel('Reflections on the tab bar').check();
  await group('bar').getByLabel('Analytics on the tab bar').check();
  await p.waitForFunction(() => document.querySelector('[role=tab][data-tab=reflect]') && document.querySelector('[role=tab][data-tab=progress]'));
  await p.locator('[role=tab][data-tab=logbook]').click();
  await p.locator('main button[aria-label*="reflection on this case"]').first().waitFor();
  await p.locator('main .seg button').filter({ hasText: /^Grid$/ }).waitFor();

  await pickProfile('advanced');
  await p.waitForFunction(() => !document.body.classList.contains('basic') && !document.body.classList.contains('logbook-only'));
  assert.equal((await st()).s.mode, 'advanced');
  await p.locator('.profile-now', { hasText: 'Now: Advanced' }).waitFor();
  assert.deepEqual(new Set(await tabsNow()), new Set(tabsAdvanced));
  await p.evaluate(async () => { const { patchLogbook } = await import('./js/ui-core.js'); await patchLogbook({ settings: { caseHide: null } }); });

  // Faculty / PCs (faculty, PDs and admins; the demo user is an admin): Totals, Admin, More (Case logs, Analytics first in it)
  await pickProfile('faculty');
  await p.waitForFunction(() => document.body.classList.contains('faculty-profile'));
  assert.deepEqual(await tabsNow(), ['totals', 'admin', 'more'], 'admins get the Admin portal left of More');
  await p.locator('[role=tab][data-tab=totals]').click();
  await p.getByRole('heading', { name: 'Programme totals' }).waitFor();
  await p.locator('table.totals td.n').first().waitFor();
  // Totals: Category column, names row frozen, no tap-and-hold tooltips, the count switch below the table, every year as a zip
  assert.equal(await p.locator('table.totals thead th').first().innerText(), 'Category');
  assert.equal(await p.locator('table.totals thead th').nth(1).evaluate(e => getComputedStyle(e).position), 'sticky');
  assert.equal(await p.locator('table.totals td.n[title]').count(), 0);
  // a long category: wraps in Compact (on by default: no sideways scroll nobody can reach by keyboard, #663), scrolls
  // sideways without it
  assert.deepEqual(await p.locator('table.totals td.cat .cat-in').first().evaluate(e => [getComputedStyle(e).overflowX, getComputedStyle(e).overflowWrap]), ['visible', 'anywhere'], 'Compact: a long category wraps');
  assert.equal(await p.locator('table.totals td[title]').count(), 0, 'no tooltips');
  assert.ok(await p.evaluate(() => { const t = document.querySelector('table.totals'), sw = [...document.querySelectorAll('main .seg button')].find(b => /All tags/.test(b.textContent)); return !!sw && !!(t.compareDocumentPosition(sw) & Node.DOCUMENT_POSITION_FOLLOWING); }), 'All tags / Towards minimums below the table');
  const zipDl = p.waitForEvent('download'); await p.getByRole('button', { name: 'Download all years (zip)' }).click();
  assert.match((await zipDl).suggestedFilename(), /^totals-all-years-\d{4}-\d{2}-\d{2}\.zip$/);
  await p.locator('[role=tab][data-tab=admin]').click();
  await p.locator('a[data-go=adminresidents]').click();
  assert.equal(await p.locator('[role=tab][data-tab=admin]').getAttribute('aria-selected'), 'true', 'Admin portal pages sit under its tab');
  await p.locator('[role=tab][data-tab=more]').click();
  assert.equal(await p.locator('.more-list li a').first().getAttribute('data-go'), 'caselogs', 'Case logs first in More');
  await p.locator('.more-list a[data-go=caselogs]').click();
  await p.locator('.caselog-list li').filter({ hasText: 'Resident A' }).waitFor();
  assert.match(await p.locator('.caselog-list li').filter({ hasText: 'Resident A' }).innerText(), /\d+ cases/);
  await p.getByLabel('Find a resident').fill('resident b');
  assert.equal(await p.locator('.caselog-list li').count(), 1);
  await p.locator('.caselog-list a').first().click();
  await p.getByRole('heading', { name: 'Resident B' }).waitFor();
  await p.locator('table.totals td.n').first().waitFor();
  await p.getByRole('heading', { name: /^Reflections · \d+ of \d+ headings met$/ }).waitFor();
  assert.equal(await p.locator('[role=tab][data-tab=more]').getAttribute('aria-selected'), 'true', 'a case log sits under Case logs, in More');
  const logDl = p.waitForEvent('download'); await p.getByRole('button', { name: 'Download Excel' }).click();
  assert.match((await logDl).suggestedFilename(), /^case-log-Resident-B-\d{4}-\d{2}-\d{2}\.xlsx$/);
  // then Analytics (the programme's: who's behind, no totals) and their own Case, Logbook and Reflections in More
  await p.locator('[role=tab][data-tab=more]').click();
  const moreIds = await p.locator('.more-list li a').evaluateAll(as => as.map(a => a.dataset.go));
  assert.deepEqual(moreIds.slice(0, 4), ['caselogs', 'progress', 'log', 'logbook']);
  assert.ok(moreIds.slice(4, 6).includes('reflect'), 'their Reflections too (after Notes, in the tab bar’s order): ' + moreIds);
  await p.locator('.more-list a[data-go=progress]').click();
  await p.getByRole('heading', { name: 'Programme analytics' }).waitFor();
  // the Year comparison: each target tag's median in the year (log2 5b)
  await p.getByRole('heading', { name: 'Year comparison' }).waitFor();
  assert.ok(await p.locator('.yc-table tbody tr').count() > 10, 'a row per target tag');
  assert.equal(await p.getByRole('heading', { name: 'Programme totals' }).count(), 0, 'no totals in Analytics');
  await pickProfile('advanced');
  await p.waitForFunction(() => !document.body.classList.contains('faculty-profile'));
  assert.deepEqual(new Set(await tabsNow()), new Set(tabsAdvanced));
  // residents never see the profile
  assert.equal(await p.evaluate(async () => { const { S, facultyRole } = await import('./js/ui-core.js'); const was = [S.admin, S.pd, S.faculty]; Object.assign(S, { admin: false, pd: false, faculty: false }); const out = facultyRole(); [S.admin, S.pd, S.faculty] = was; return out; }), false);

  // reflection formatting buttons: off by default, on from Show or hide; they write Markdown the Word export formats
  await p.evaluate(async () => { const { reflectOnCase } = await import('./js/ui-reflect.js'); await reflectOnCase({ id: 'fake-fmt', date: '2026-10-10', initials: 'ZZ', details: 'Fake formatting case', cats: ['13'] }); });
  await p.waitForSelector('.refl-editor');
  assert.equal(await p.locator('.fmt-bar').count(), 0);
  await p.goBack(); await p.waitForFunction(() => !document.querySelector('.refl-editor'));
  await p.evaluate(() => { location.hash = '#showhide'; });
  await group('reflections').getByLabel('Formatting buttons (this device)').check();
  await p.evaluate(async () => { const { reflectOnCase } = await import('./js/ui-reflect.js'); await reflectOnCase({ id: 'fake-fmt2', date: '2026-10-10', initials: 'ZZ', details: 'Fake formatting case', cats: ['13'] }); });
  await p.waitForSelector('.refl-editor .fmt-bar');
  const box = p.getByLabel('Learning point 1 text', { exact: true });
  await box.fill('first idea\nsecond idea');
  await box.evaluate(t => t.setSelectionRange(0, t.value.length));
  const bar = box.locator('xpath=preceding-sibling::div[contains(@class,"fmt-bar")][1]');
  await bar.getByRole('button', { name: 'Bullet list' }).click();
  assert.equal(await box.inputValue(), '- first idea\n- second idea');
  await box.evaluate(t => t.setSelectionRange(2, 7));
  await bar.getByRole('button', { name: 'Bold' }).click();
  assert.equal(await box.inputValue(), '- **first** idea\n- second idea');
  await p.goBack(); await p.waitForFunction(() => !document.querySelector('.refl-editor'));
  await p.evaluate(() => { location.hash = '#showhide'; });
  await group('reflections').getByRole('button', { name: 'Reset this group' }).click();
  await p.locator('dialog[open]').getByRole('button', { name: 'Reset' }).click();
  await p.waitForFunction(async () => { const { display } = await import('./js/ui-settings.js'); return !display().reflToolbar; });

  // the backup as one spreadsheet: it downloads, and Restore reads it (adding only what's missing)
  await p.evaluate(() => { location.hash = '#data'; });
  for (const sm of await p.locator('details:not([open]) > summary').all()) await sm.click().catch(() => {});
  const dl = p.waitForEvent('download');
  await p.getByRole('button', { name: 'Download as one spreadsheet' }).click();
  const file = await dl;
  assert.match(file.suggestedFilename(), /^logbook-backup-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await p.evaluate(async () => {
    const { makeBackup } = await import('./js/backup.js'); const { backupToCsv } = await import('./js/backup-csv.js');
    const d = await makeBackup();
    d.cases = [...d.cases, { id: 'fake-csv-case', date: '2026-10-01', initials: 'ZZ', details: 'Fake CSV case', cats: ['01'], createdAt: 1, updatedAt: 1, source: 'app' }];
    d.notes = [...d.notes, { id: 'fake-csv-note', date: null, title: 'Fake CSV note', body: 'x', createdAt: 1, updatedAt: 1 }];
    return backupToCsv(d);
  });
  await p.locator('input[type=file][accept*=".gz"]').setInputFiles({ name: 'logbook-backup.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await p.locator('dialog[open]').filter({ hasText: /Add 1 case, 0 reflections, 1 note/ }).waitFor();
  await p.locator('dialog[open]').getByRole('button', { name: 'Restore', exact: true }).click();
  await p.getByText(/Restored 1 cases, 0 reflections, 1 notes/).waitFor();

  assert.deepEqual(errors, []); await ctx.close(); console.log(`PASS show or hide ${width === 390 ? 'phone' : 'desktop'}`);
} } finally { await b.close(); }
