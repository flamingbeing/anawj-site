// Fake data only. Labelled parts (Settings → Advanced logging; off by default): the switch and the label editor,
// the case box's read-back and marks, learning points kept out of suggestions, bold labels on Logbook rows (a hidden
// label left out), the "Has …" filter and has:lp, the Learning points page, Bold labels in Copy (Settings → Markdown),
// the case template (cursor after the first label, untouched lines not saved), a pasted list split by bold first
// lines with a labelled block kept with its case, and a case over 2000 characters with the rest in a linked note.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const out = process.env.E2E_OUT || '';
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  // the app's state for waitForFunction, which needs a plain (not async) test: an async one passes at once
  // (top frame only: sandboxed frames have origin 'null', and WebKit wants a full address)
  await ctx.addInitScript(() => { if (window !== top || location.origin === 'null') return; window.addEventListener('load', () => import(location.origin + '/logbook/js/ui-core.js').then(m => { window.__core = m; })); });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const st = () => p.evaluate(async () => (await import('./js/ui-core.js')).settings());
  const cases = () => p.evaluate(async () => (await import('./js/ui-core.js')).S.cases.map(c => ({ id: c.id, initials: c.initials, details: c.details, date: c.date })));
  // screenshots for the owner (phone width), once the screen has settled; and never a sideways scroll
  const shot = async name => {
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll on ' + name);
    if (!out || width !== 390) return;
    await p.waitForTimeout(450);
    await p.evaluate(() => document.querySelectorAll('#toast').forEach(t => { t.style.visibility = 'hidden'; }));
    await p.screenshot({ path: `${out}/parts-${name}.png` });
    await p.evaluate(() => document.querySelectorAll('#toast').forEach(t => { t.style.visibility = ''; }));
  };
  const dialog = () => p.locator('dialog[open]').last();
  // the Logbook's filter panel stays as it was left: open it only when closed
  const openFilter = async () => { const f = p.getByRole('button', { name: /^Filter/ }); if ((await f.getAttribute('aria-expanded')) !== 'true') await f.click(); };
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  await p.waitForFunction(() => window.__core?.S.cases.length > 0);   // the demo's cases load after the first drawing
  const n0 = (await cases()).length;

  // off by default: nothing reads labels, the Logbook has no learning points link
  assert.equal((await st()).labelParts, undefined);
  await p.goto(base + '?demo#logbook');
  await openFilter();
  assert.equal(await p.locator('.lb-points').count(), 0);
  assert.equal(await p.locator('select[aria-label="Filter by flag"] option[value^="part:"]').count(), 0);

  // the grouped Settings menu: Advanced logging names labelled parts, and Search settings finds the switch there
  await p.goto(base + '?demo#settings');
  assert.match(await p.locator('.settings-menu a[data-go=loggingadv]').innerText(), /labelled parts/);
  await p.getByLabel('Search settings').fill('labelled parts');
  await p.locator('.settings-search a[data-go=loggingadv]').filter({ hasText: 'Labelled parts in the case summary' }).first().waitFor();
  // the result opens Advanced logging at the switch (scrolled to, flashing), not at the page's top
  await p.locator('.settings-search a[data-go=loggingadv]').filter({ hasText: 'Labelled parts in the case summary' }).first().click();
  await p.waitForFunction(() => { const f = document.querySelector('label.flash'); if (!f || !/Labelled parts in the case summary/.test(f.textContent)) return false; const r = f.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, null, { timeout: 3000 });

  // Settings → Advanced logging: switch on, add Plan (hidden in lists) and ASA
  await p.goto(base + '?demo#loggingadv'); await p.getByRole('heading', { name: 'Advanced logging' }).waitFor();
  assert.equal(await p.locator('.label-editor').isHidden(), true);
  await p.getByRole('switch', { name: 'Labelled parts in the case summary' }).check();
  await p.waitForFunction(() => window.__core?.settings().labelParts === true);
  await p.locator('.label-editor').waitFor();
  assert.deepEqual(await p.locator('.label-card input[aria-label$="what you type"]').evaluateAll(els => els.map(e => e.value)), ['lp', 'dt']);
  await p.getByLabel('New label').fill('1bad');
  await p.getByRole('button', { name: '+ Add label' }).click();
  assert.match(await p.locator('#toast').innerText(), /letters first/);
  for (const w of ['Plan', 'ASA']) { await p.getByLabel('New label').fill(w); await p.getByLabel('New label').press('Enter'); }
  await p.getByLabel('Label 3: what you type').waitFor();
  await p.locator('.label-card').nth(2).getByRole('checkbox', { name: 'Hide in lists' }).check();
  await p.waitForFunction(() => { const l = window.__core?.settings().partLabels || []; return l.length === 4 && l[2].hide === true; });
  assert.deepEqual((await st()).partLabels.map(l => l.k), ['lp', 'dt', 'Plan', 'ASA']);
  await shot('settings');

  // the Add tab: the box marks each label, the line under it says which parts it read
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  const ta = p.locator('textarea.details');
  await ta.fill('AB 72M lap chole\nASA 2: HTN\nPlan: GA ETT\nlp: check the cuff before any craniotomy');
  await p.waitForFunction(() => document.querySelector('.parsed .parts-read')?.textContent.includes('Learning point'));
  assert.equal(await p.locator('.parsed .parts-read').textContent(), 'Parts ASA · Plan · Learning point');
  await p.waitForFunction(() => document.querySelectorAll('.box-marks mark.m-lab').length === 3);
  // a learning point never suggests a tag: what "craniotomy" alone suggests is not offered
  await p.waitForTimeout(250);
  const fromPoint = await p.evaluate(async () => { const { suggest } = await import('./js/suggest.js'); return suggest('craniotomy').map(s => s.code); });
  const offered = await p.locator('.sugg-row .chip[data-code]').evaluateAll(els => els.map(e => e.dataset.code));
  assert.ok(fromPoint.length && fromPoint.every(c => !offered.includes(c)), `offered ${offered} vs ${fromPoint}`);
  await shot('case');
  await p.locator('.sugg-row .chip[data-code]').first().click();
  await p.getByRole('button', { name: /^Save/ }).last().click();
  await p.waitForFunction(n => window.__core?.S.cases.length === n + 1, n0);
  // the emptied box keeps neither the marks nor the "Parts …" line (they used to stay until the box was touched)
  await p.waitForFunction(() => !document.querySelector('.parsed .parts-read') && (document.querySelector('.box-marks')?.hidden ?? true), null, { timeout: 3000 });
  const saved = (await cases()).find(c => c.details.includes('check the cuff'));
  assert.equal(saved.details, '72M lap chole\nASA 2: HTN\nPlan: GA ETT\nlp: check the cuff before any craniotomy');   // stored as typed

  // Logbook rows: labels in bold, Plan (hidden in lists) left out
  await p.goto(base + '?demo#logbook');
  await p.locator('main .seg button').filter({ hasText: /^List$/ }).click();
  const row = p.locator('ul.cases li').filter({ hasText: 'check the cuff' });
  await row.waitFor();
  assert.deepEqual(await row.locator('.t b.part-l').allInnerTexts(), ['ASA 2:', 'Learning point:']);
  assert.equal(await row.locator('.t').innerText(), '72M lap chole\nASA 2: HTN\nLearning point: check the cuff before any craniotomy');
  // the filter: "Has learning point (1)", and has:lp in the search
  await openFilter();
  const flag = p.locator('select[aria-label="Filter by flag"]');
  assert.equal(await flag.locator('option[value="part:lp"]').innerText(), 'Has learning point (1)');
  await flag.selectOption('part:lp');
  await p.waitForFunction(() => document.querySelectorAll('ul.cases li:not(.monthhead)').length === 1);
  await flag.selectOption('');
  await p.getByLabel('Search cases').fill('has:lp chole');
  await p.waitForFunction(() => document.querySelectorAll('ul.cases li:not(.monthhead)').length === 1);
  await p.getByLabel('Search cases').fill('has:dt');
  await p.locator('.empty-state').filter({ hasText: 'No cases match' }).waitFor();
  await p.getByLabel('Search cases').fill('');
  await shot('logbook');

  // the Learning points page: one point, its case opens with a tap
  await p.locator('.lb-points a').click();
  await p.getByRole('heading', { name: 'Learning points' }).waitFor();
  assert.equal(await p.locator('.points-list li.point-row').count(), 1);
  assert.match(await p.locator('.points-list').innerText(), /Learning point: check the cuff before any craniotomy/);
  await shot('points');
  await p.locator('.points-list .point-btn').first().click();
  await dialog().getByRole('heading', { name: 'Edit case' }).waitFor();
  await dialog().getByRole('button', { name: 'Cancel' }).click();
  await p.getByLabel('Which part').selectOption('ASA');
  assert.match(await p.locator('.points-list').innerText(), /ASA 2: HTN/);

  // Settings → Markdown → Bold labels: Copy writes **Label:** text
  await p.goto(base + '?demo#sharefmt'); await p.getByRole('heading', { name: 'Markdown', exact: true }).waitFor();
  await p.getByRole('checkbox', { name: /Bold labels/ }).check();
  assert.match(await p.locator('pre[aria-label="Preview of one case"]').innerText(), /\*\*Learning point:\*\* check the cuff/);
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForFunction(() => window.__core?.settings().markdown?.boldLabels === true);
  const md = await p.evaluate(async id => { const { S } = await import('./js/ui-core.js'); const { caseText } = await import('./js/share.js'); return caseText(S.cases.find(c => c.id === id)); }, saved.id);
  assert.match(md, /\nAB\n72M lap chole\n\*\*ASA 2:\*\* HTN\n\*\*Plan:\*\* GA ETT\n\*\*Learning point:\*\* check the cuff/);

  // the case template: put in an empty box on focus, cursor after the first label; untouched lines not saved
  await p.goto(base + '?demo#loggingadv'); await p.getByRole('heading', { name: 'Advanced logging' }).waitFor();
  await p.getByRole('switch', { name: 'Start each case from a template' }).check();
  await p.getByLabel('Case template').fill('ASA :\nPE :\nPlan :');
  await p.getByLabel('Case template').blur();
  await p.waitForFunction(() => { const s = window.__core?.settings() || {}; return s.caseTplOn === true && s.caseTpl === 'ASA :\nPE :\nPlan :'; });
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  await ta.click();
  await p.waitForFunction(() => document.querySelector('textarea.details').value === 'ASA :\nPE :\nPlan :');
  assert.equal(await ta.evaluate(t => t.selectionStart), 5);
  await p.evaluate(() => document.activeElement.blur());              // left untouched: the template goes again
  await p.waitForFunction(() => document.querySelector('textarea.details').value === '');
  assert.equal(await p.evaluate(async () => { const { recoverableCaseDrafts } = await import('./js/ui-log.js'); return recoverableCaseDrafts().length; }), 0);
  await ta.focus();
  await p.keyboard.type(' 3');
  await p.keyboard.press('Control+End');
  await p.keyboard.type(' spinal');
  await p.keyboard.press('Control+Home');
  await p.keyboard.type('CD 40F hernia\n');
  assert.equal(await ta.inputValue(), 'CD 40F hernia\nASA : 3\nPE :\nPlan : spinal');
  await shot('template');
  await p.locator('.picker input[type=search]').fill('13');
  await p.locator('.picker input[type=search]').press('Enter');
  await p.getByRole('button', { name: /^Save/ }).last().click();
  await p.waitForFunction(n => window.__core?.S.cases.length === n + 2, n0);
  assert.equal((await cases()).find(c => c.initials === 'CD' && c.details.includes('hernia')).details, '40F hernia\nASA : 3\nPlan : spinal');   // "PE :" left empty: dropped
  await p.waitForFunction(() => document.querySelector('textarea.details').value === 'ASA :\nPE :\nPlan :');   // ready for the next one
  // Same as last with only the template in the box: the procedure (main text only) on line 2, the template kept
  await p.locator('.chip.recent').first().click();
  assert.equal(await ta.inputValue(), '\nhernia\nASA :\nPE :\nPlan :');
  // an untouched label heading lines typed under it is kept, so those lines stay in its part
  await ta.fill('KL 50M hernia\nASA : 2\nPE :\nPlan :\n- spinal\n- TAP block');
  await p.getByRole('button', { name: /^Save/ }).last().click();
  await p.waitForFunction(n => window.__core?.S.cases.length === n + 3, n0);
  assert.equal((await cases()).find(c => c.initials === 'KL').details, '50M hernia\nASA : 2\nPlan :\n- spinal\n- TAP block');
  await p.waitForFunction(() => document.querySelector('textarea.details').value === 'ASA :\nPE :\nPlan :');
  await p.evaluate(() => document.activeElement.blur());
  await p.waitForFunction(() => document.querySelector('textarea.details').value === '');

  // a pasted list: bold first lines split cases, a labelled block after a blank line stays with its case, bold
  // labels kept plain; one case over the limit
  await p.locator('.mode-seg button[data-mode=bulk]').click();
  const long = 'GH 60M Whipple\n' + Array.from({ length: 50 }, (_, i) => `line ${i} fake long note ` + 'x'.repeat(30)).join('\n');
  await p.locator('textarea.details').fill(`**EF 72M lap chole**\nASA 2: HTN\n\nlp: first fake point\n**IJ 30F LSCS**\n**Plan:** spinal\n\n${long}`);
  await p.getByRole('button', { name: 'Review' }).click();
  await p.locator('table.bulk tbody tr').nth(2).waitFor();
  assert.equal(await p.locator('table.bulk tbody tr').count(), 3);
  const rowText = i => p.locator('table.bulk tbody tr').nth(i).getByLabel('Case summary').inputValue();
  assert.equal(await rowText(0), '72M lap chole\nASA 2: HTN\nlp: first fake point');
  assert.equal(await rowText(1), '30F LSCS\nPlan: spinal');
  assert.match(await p.locator('table.bulk tbody tr').nth(2).locator('.too-long').innerText(), /over the 2000 a case holds/);
  assert.equal(await p.locator('table.bulk tbody tr').nth(0).locator('.too-long').isHidden(), true);
  await shot('paste');
  await p.getByRole('button', { name: /^Save all 3/ }).click();
  for (let i = 0; i < 3; i++) {   // "no tag" (if any), then the 2000-character question
    const d = dialog();
    await d.waitFor();
    const h = await d.locator('h2, h3').first().innerText();
    if (/Longer than a case can hold/.test(h)) { await d.getByRole('button', { name: 'Move the rest to a note' }).click(); break; }
    await d.getByRole('button', { name: 'Save all' }).click();
  }
  await p.waitForFunction(n => window.__core?.S.cases.length === n + 6, n0);
  // one toast: the note is said in it and Undo stays
  assert.match(await p.locator('#toast').innerText(), /Saved 3 cases · the rest is in a linked note/);
  const gh = (await cases()).find(c => c.initials === 'GH');
  assert.ok(gh.details.length <= 2000 && gh.details.length > 1000, String(gh.details.length));
  await p.waitForFunction(id => (window.__core?.S.notes || []).some(n => n.caseId === id), gh.id, { timeout: 8000 });
  const note = await p.evaluate(async id => { const { S } = await import('./js/ui-core.js'); return S.notes.find(n => n.caseId === id); }, gh.id);
  assert.equal(note.title, 'Rest of the case · GH');
  assert.equal(gh.details + '\n' + note.body, long.replace(/^GH /, ''));   // nothing lost
  // Undo takes the cases away and bins the note with them (no note left linked to a missing case)
  await p.locator('#toast').getByRole('button', { name: 'Undo' }).click();
  await p.waitForFunction(n => window.__core?.S.cases.length === n + 3, n0);
  await p.waitForFunction(id => !(window.__core?.S.notes || []).some(n => n.caseId === id), gh.id, { timeout: 8000 });

  // switched off: plain text again, nothing bold, the page says how to turn it on
  await p.goto(base + '?demo#loggingadv'); await p.getByRole('heading', { name: 'Advanced logging' }).waitFor();
  await p.getByRole('switch', { name: 'Labelled parts in the case summary' }).uncheck();
  await p.waitForFunction(() => window.__core && !window.__core.settings().labelParts);
  await p.goto(base + '?demo#logbook');
  await p.locator('main .seg button').filter({ hasText: /^List$/ }).click();
  await row.waitFor();
  assert.equal(await row.locator('b.part-l').count(), 0);
  assert.match(await row.locator('.t').innerText(), /Plan: GA ETT\nlp: check the cuff/);
  await p.goto(base + '?demo#points');
  await p.getByRole('link', { name: 'Advanced logging settings' }).waitFor();

  assert.deepEqual(errors, []);
  await ctx.close();
  console.log(`ok ${width}`);
} console.log('PASS parts'); } finally { await b.close(); }
