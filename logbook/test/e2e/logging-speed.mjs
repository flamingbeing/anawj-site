// Fake data only. Logging speed and friction on the Add tab: Save takes the offered tags like a second Enter (and
// offers only confident ones), Basic's Enter in the empty tag search saves, the suggestions part apart from Same as
// last (an older 'quick' still hides both), ticking confident suggestions automatically (untick sticks), the date
// chips leaving the keyboard alone, several Same as last chips, a pasted list getting your own tags, the draft
// still saved on reload, and the tag list updated in place on a tap.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?demo=reset#log'); await p.waitForSelector('textarea.details');
  await p.waitForFunction(() => Number(document.body.dataset.cases) > 0);   // (the demo's cases load after the first drawing)
  const ta = p.locator('textarea.details');
  const set = async patch => { await p.evaluate(async patch => { const { patchLogbook, hooks } = await import('./js/ui-core.js'); await patchLogbook({ settings: patch }); hooks.render(); }, patch); await p.waitForSelector('textarea.details'); };
  const st = () => p.evaluate(async () => (await import('./js/ui-core.js')).settings());
  const nCases = () => p.evaluate(async () => (await import('./js/ui-core.js')).S.cases.length);
  const newest = () => p.evaluate(async () => { const { S } = await import('./js/ui-core.js'); return [...S.cases].sort((a, b) => b.createdAt - a.createdAt)[0]; });
  const until = async (fn, msg) => { for (let i = 0; i < 40; i++) { if (await fn()) return; await p.waitForTimeout(75); } throw new Error(msg); };
  const settle = () => p.waitForTimeout(250);   // the suggestions' typing pause
  const strongCodes = () => p.locator('.sugg-row .chip.strong[data-code]:not(.all)').evaluateAll(els => els.map(e => e.dataset.code));
  const weakCodes = () => p.locator('.sugg-row .chip.sugg[data-code]:not(.strong)').evaluateAll(els => els.map(e => e.dataset.code));
  const save = p.locator('.savebar button.primary');

  // 1. Advanced, Enter = new line: Save with nothing ticked offers the confident suggestions; a second Save takes them
  await ta.fill('AB 72M ex lap hartmann reversal GA');
  await settle();
  const strong = await strongCodes(), weak = await weakCodes();
  assert.ok(strong.length, 'no confident suggestions for the fixture');
  let n = await nCases();
  // a double tap makes the offer but doesn't take it (the hint gets a moment to show)
  await save.dblclick();
  await p.waitForTimeout(150);
  assert.equal(await nCases(), n, 'a double tap on Save saved with tags nobody looked at');
  assert.match(await p.locator('.enter-suggestion-hint').innerText(), /^Tap Save or press Enter again to add /);
  assert.match(await p.locator('#toast').innerText(), /Tap Save or press Enter again to add the suggested tags/);
  assert.notEqual(await p.evaluate(() => document.activeElement?.type), 'search', 'the search box took the focus');
  await p.waitForTimeout(700);
  await save.click();
  await until(async () => await nCases() === n + 1, 'the second Save did not save');
  let c = await newest();
  assert.ok(strong.every(code => c.cats.includes(code)), 'confident tags missing: ' + c.cats);
  assert.ok(weak.length && weak.every(code => !c.cats.includes(code)), 'a weak guess was saved: ' + c.cats + ' weak ' + weak);
  await until(async () => (await ta.inputValue()) === '', 'box not cleared');
  // Advanced, Enter = new line: Enter in the empty tag search does nothing, as before (a habit Enter after picking)
  {
    await ta.fill('AB 40M fake lap chole GA');
    const search = p.getByRole('combobox', { name: 'Search tags' });
    await search.fill('lscs'); await search.press('Enter');
    n = await nCases();
    await search.press('Enter');
    await p.waitForTimeout(300);
    assert.equal(await nCases(), n, 'Enter in the empty search saved in Advanced / new line');
    await ta.fill(''); await p.locator('.savebar .clear-tags, .savebar .selected .chip[data-code]').first().click(); await settle();
  }

  // 2. Basic: no suggestion row; Save points at the search, whose Enter (empty) saves with the offered tags
  await set({ mode: 'basic' });
  assert.equal(await p.locator('.sugg-row').isVisible(), false, 'Basic shows the suggestions');
  await ta.fill('CD 80F hemiarthroplasty spinal');
  await settle();
  n = await nCases();
  await save.click();
  assert.equal(await nCases(), n);
  assert.equal(await p.evaluate(() => document.activeElement?.type), 'search', 'the search box is not focused');
  const hint = await p.locator('.enter-suggestion-hint').innerText();
  assert.match(hint, /^Tap Save or press Enter again to add /, 'hint ' + hint);
  await p.keyboard.press('Enter');
  await until(async () => await nCases() === n + 1, 'Enter in the empty search did not save');
  assert.ok((await newest()).cats.includes('21'), 'the offered Geriatric tag was not applied');
  // Enter in the empty search with a tag ticked saves at once too
  await ta.fill('EF 40M fake case');
  const search = p.getByRole('combobox', { name: 'Search tags' });
  await search.fill('lscs'); await search.press('Enter');
  assert.equal(await search.inputValue(), '', 'a search Enter still picks the first match');
  n = await nCases();
  await search.press('Enter');
  await until(async () => await nCases() === n + 1, 'Enter in the empty search did not save the ticked case');
  // holding Enter (Enter saves) never takes the offer: the refused save moves the focus to the search, where the
  // key's repeats land
  await set({ enterMode: 'single' });
  await ta.fill('GH 80F hemiarthroplasty spinal'); await settle();
  n = await nCases();
  await ta.focus();
  await p.keyboard.down('Enter'); await p.keyboard.down('Enter'); await p.keyboard.down('Enter');
  await p.keyboard.up('Enter');
  await p.waitForTimeout(300);
  assert.equal(await nCases(), n, 'a held Enter saved with the offered tags');
  await ta.fill(''); await set({ enterMode: null });

  // 3. Basic can keep the suggestions without Same as last; the switch writes the new part names
  await p.goto(base + '?demo#loggingadv'); await p.getByRole('heading', { name: 'Advanced logging' }).waitFor();
  await p.getByRole('switch', { name: 'Suggested tags as you type' }).check();
  await until(async () => ((await st()).basicOn || []).includes('case:sugg'), 'basicOn not written');
  assert.ok(!((await st()).basicOn || []).includes('case:recent'), 'Same as last turned on too');
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  await ta.fill('GH 30F LSCS spinal'); await settle();
  assert.equal(await p.locator('.sugg-row').isVisible(), true, 'suggestions not shown in Basic');
  assert.equal(await p.locator('.quick-rest').isVisible(), false, 'Same as last shown in Basic');
  assert.equal(await p.locator('.quick-label').isVisible(), true);
  // an older basicOn 'case:quick' still brings both back
  await set({ basicOn: ['case:quick'] });
  assert.equal(await p.locator('.quick-rest').evaluate(el => getComputedStyle(el).display !== 'none'), true, 'case:quick no longer means both');
  await set({ mode: 'advanced', basicOn: null, show: null });   // (the switch above saved show['case:sugg'], which wins over caseHide)

  // 4. An older caseHide 'quick' hides both; turning the suggestions back on keeps Same as last hidden
  await set({ caseHide: ['quick'] });
  assert.equal(await p.locator('.sugg-row').isVisible(), false);
  assert.equal(await p.locator('.quick-label').isVisible(), false);
  await p.goto(base + '?demo#loggingadv'); await p.getByRole('heading', { name: 'Advanced logging' }).waitFor();
  assert.equal(await p.getByRole('switch', { name: 'Suggested tags as you type' }).isChecked(), false);
  assert.equal(await p.getByRole('switch', { name: 'Quick picks (Same as last, tag groups)' }).isChecked(), false);
  await p.getByRole('switch', { name: 'Suggested tags as you type' }).check();
  await until(async () => JSON.stringify((await st()).caseHide) === '["recent"]', 'caseHide not rewritten');
  // Same as last: three chips (Settings → Advanced logging)
  await p.getByRole('switch', { name: 'Quick picks (Same as last, tag groups)' }).check();
  await p.locator('fieldset.pick', { hasText: 'Same as last' }).locator('label.pick-opt').filter({ has: p.locator('.pick-l', { hasText: /^3$/ }) }).click();
  await until(async () => (await st()).recentCount === 3, 'recentCount not saved');
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  await until(async () => await p.locator('.quick-rest .chip.recent').count() === 3, 'not three Same as last chips: ' + await p.locator('.quick-rest .chip.recent').count());
  await set({ caseHide: null, recentCount: null });
  assert.equal(await p.locator('.quick-rest .chip.recent').count(), 1, 'the default is one chip');

  // 5. Tick confident suggestions automatically (off by default): ticks follow the text; an unticked one stays off
  assert.ok(!(await st()).autoTick, 'on by default');
  await p.goto(base + '?demo#logging'); await p.getByRole('heading', { name: 'Logging', exact: true }).waitFor();
  await p.getByRole('switch', { name: 'Tick confident suggestions automatically' }).check();
  await until(async () => (await st()).autoTick === true, 'autoTick not saved');
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  await ta.fill('IJ 75M');
  await until(async () => await p.locator('.savebar .selected .chip[data-code="21"]').count() === 1, 'Geriatric not ticked automatically');
  await ta.fill('IJ 45M');
  await until(async () => await p.locator('.savebar .selected .chip[data-code="21"]').count() === 0, 'the automatic tick did not follow the text');
  await ta.fill('IJ 75M');
  await until(async () => await p.locator('.savebar .selected .chip[data-code="21"]').count() === 1, 'not ticked again');
  await p.locator('.savebar .selected .chip[data-code="21"]').click();
  await ta.fill('IJ 75M LSCS spinal'); await settle();
  assert.equal(await p.locator('.savebar .selected .chip[data-code="21"]').count(), 0, 'an unticked suggestion came back');
  n = await nCases();
  await save.click();
  await until(async () => await nCases() === n + 1, 'not saved in one tap with automatic ticks');
  c = await newest();
  assert.ok(!c.cats.includes('21') && c.cats.length, 'saved tags ' + c.cats);
  // Undo puts the case back with the untick kept
  await p.locator('#toast button', { hasText: 'Undo' }).click();
  await until(async () => (await ta.inputValue()) === 'IJ 75M LSCS spinal', 'Undo did not put the case back');
  await settle();
  assert.equal(await p.locator('.savebar .selected .chip[data-code="21"]').count(), 0, 'Undo brought back an unticked suggestion');
  // clearing the box and Undo keeps it too
  await p.locator('.clear-btn').click(); await settle();
  await p.locator('#toast button', { hasText: 'Undo' }).click(); await settle();
  assert.equal(await ta.inputValue(), 'IJ 75M LSCS spinal');
  assert.equal(await p.locator('.savebar .selected .chip[data-code="21"]').count(), 0, 'clear-box Undo brought back an unticked suggestion');
  n = await nCases();
  await save.click();
  await until(async () => await nCases() === n + 1, 'not saved again after Undo');
  assert.ok(!(await newest()).cats.includes('21'));
  // the next case starts afresh: Geriatric is ticked again
  await ta.fill('KL 81F');
  await until(async () => await p.locator('.savebar .selected .chip[data-code="21"]').count() === 1, 'the untick carried over to the next case');
  await ta.fill(''); await settle();
  await set({ autoTick: null });

  // 6. Date chips: a tap from elsewhere doesn't focus the box (no keyboard); while typing it keeps the focus
  await p.evaluate(() => document.activeElement?.blur());
  await p.locator('.datebar .chip.wk:not([hidden])').first().click();
  assert.notEqual(await p.evaluate(() => document.activeElement?.className), 'details', 'a date tap focused the box');
  await ta.focus();
  await p.locator('.datebar .chip', { hasText: 'Today' }).click();
  assert.equal(await p.evaluate(() => document.activeElement?.classList.contains('details')), true, 'the box lost the focus');

  // 7. A tag tap updates the list in place (the same row element, now ticked)
  const before = await p.evaluateHandle(() => document.querySelector('.log-card .picker li[data-code="13"]'));
  await p.locator('.log-card .picker li[data-code="13"]').click();
  assert.equal(await before.evaluate(el => el.isConnected && el.classList.contains('on') && el.getAttribute('aria-selected') === 'true' && el.querySelector('.tick').textContent === '✓'), true, 'the row was rebuilt or not ticked');
  await p.locator('.log-card .picker li[data-code="13"]').click();
  assert.equal(await before.evaluate(el => el.isConnected && !el.classList.contains('on')), true);

  // 8. The draft is written a moment after typing stops, and at once when the page goes
  const stored = text => p.evaluate(t => Object.keys(localStorage).some(k => k.startsWith('logbook-draft-v2:') && !k.includes(':active:') && (localStorage.getItem(k) || '').includes(t)), text);
  await ta.fill('MN 33F fake timer'); await p.waitForTimeout(600);
  assert.equal(await stored('MN 33F fake timer'), true, 'the typing pause did not write the draft');
  await ta.fill('MN 33F fake hash');
  await p.evaluate(() => { location.hash = '#logbook'; });
  await until(() => stored('MN 33F fake hash'), 'moving to another screen did not write the draft');
  await p.evaluate(() => { location.hash = '#log'; }); await p.waitForSelector('textarea.details');
  assert.equal(await ta.inputValue(), 'MN 33F fake hash', 'draft lost moving between screens');
  await ta.fill('MN 33F fake draft');
  await p.reload(); await p.waitForSelector('textarea.details');
  assert.equal(await ta.inputValue(), 'MN 33F fake draft', 'draft lost on reload');
  await ta.fill('');

  // 9. A pasted list gets your own tags from their shorthand (and what they count towards), as a single case would
  await set({ tagSet: await p.evaluate(async () => [...(await import('./js/ui-core.js')).tagSet(), { k: 'u:fakeappy', n: 'Fake appendix', links: ['13'], kw: ['appy'] }]) });
  await p.locator('button[data-mode=bulk]').click();
  await p.locator('textarea.details').fill('OP 20M lap appy GA\n\nQR 30F LSCS spinal');
  await p.getByRole('button', { name: 'Review' }).click();
  const row = p.locator('table.bulk tbody tr').first();
  await row.locator('.chip.tag[data-tag="u:fakeappy"]').waitFor();
  assert.equal(await row.locator('.chip[data-code="13"]').count() >= 1, true, 'the linked tag is not ticked');
  n = await nCases();
  await p.getByRole('button', { name: /^Save all 2/ }).click();
  // (the LSCS row has no tag: a pasted list ticks suggestions only with the auto-tick setting)
  const anyway = p.locator('dialog[open] button', { hasText: 'Save all' });
  await anyway.waitFor({ timeout: 1500 }).then(() => anyway.click(), () => {});
  await until(async () => await nCases() === n + 2, 'list not saved');
  const saved = await p.evaluate(async () => (await import('./js/ui-core.js')).S.cases.filter(c => c.source === 'paste' && /appy|LSCS/.test(c.details)));
  assert.deepEqual(saved.find(c => /appy/.test(c.details)).tags, ['u:fakeappy']);
  assert.equal(saved.find(c => /LSCS/.test(c.details)).tags, undefined);
  await p.locator('button[data-mode=one]').click();

  assert.deepEqual(errors, [], 'console errors at ' + width);
  console.log(`PASS logging speed ${width === 390 ? 'phone' : 'desktop'}`);
  await ctx.close();
} } finally { await b.close(); }
console.log('logging-speed tests passed');
