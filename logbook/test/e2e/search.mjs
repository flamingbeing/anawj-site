// Fake data only. Search (log2 9e, 16 Oct 2026): the magnifier in the header (and / on a computer) opens one box over cases,
// reflections and notes; results grouped with counts and the words marked; operators (in:, status:, has:); a tap opens
// the case, the reflection or the note; a case links its reflection.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const poll = async (fn, what, ms = 8000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw new Error('timed out: ' + what); await new Promise(r => setTimeout(r, 100)); } };
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  await p.waitForFunction(() => Number(document.body.dataset.cases) > 0);
  await p.evaluate(async () => {
    const { S, cloud, createCase } = await import('./js/ui-core.js'), D = await import('./js/demo-backend.js');
    const c = await createCase({ id: 'fake-gs-case', date: '2020-06-01', initials: 'ZG', details: 'Fakesrch hernia repair\nfake second line', cats: ['17'] });
    await cloud.saveReflection(S.user.email, { id: 'fake-gs-refl', caseId: c.id, headingId: '', initials: 'ZG', date: '2020-06-02', diagnosis: 'Fakesrch hernia', summary: 'fake', points: [], status: 'draft' });
    D.saveNote('demo@example.com', { id: 'fake-gs-note', date: '2020-06-03', title: 'Fakesrch note', body: 'fake hernia mesh reading', createdAt: Date.now(), updatedAt: Date.now() });
  });
  const box = () => p.getByLabel('Search everything');
  const group = k => p.locator('.gs-group', { has: p.locator('.gs-h', { hasText: k }) });

  // open: the magnifier (and / on a computer)
  if (width === 1280) { await p.locator('body').click({ position: { x: 5, y: 300 } }).catch(() => {}); await p.evaluate(() => document.activeElement?.blur()); await p.keyboard.press('/'); }
  else await p.locator('.who-search').click();
  await box().waitFor();
  assert.equal(await p.evaluate(() => location.hash), '#search');
  await box().fill('fakesrch');
  await poll(async () => (await p.locator('.gs-group').count()) === 3, 'three groups', 10000);
  assert.match(await group('Cases').locator('.gs-h').innerText(), /Cases \(1\)/);
  assert.match(await group('Reflections').locator('.gs-h').innerText(), /Reflections \(1\)/);
  assert.match(await group('Notes').locator('.gs-h').innerText(), /Notes \(1\)/);
  assert.equal(await group('Cases').locator('mark', { hasText: /^Fakesrch$/ }).count(), 1, 'the word marked');
  assert.equal(await group('Cases').getByRole('button', { name: '↗ Its reflection' }).count(), 1, 'the case links its reflection');

  // operators
  await box().fill('fakesrch in:notes'); await poll(async () => (await p.locator('.gs-group').count()) === 1, 'notes only');
  await box().fill('fakesrch status:draft'); await poll(async () => (await p.locator('.gs-group .gs-h').allInnerTexts()).join() === 'Reflections (1)', 'drafts');
  await box().fill('fakesrch has:reflection'); await poll(async () => (await p.locator('.gs-group .gs-h').allInnerTexts()).join() === 'Cases (1)', 'has:reflection');
  await box().fill('statsu:draft'); await p.locator('.gs-note', { hasText: 'did you mean status:' }).waitFor();
  await p.getByRole('button', { name: 'Search operators' }).click();
  await p.locator('.gs-help code', { hasText: 'in:reflections' }).waitFor();

  // chips: add or take out their operator, and light up from the box
  await box().fill('fakesrch');
  const chipBtn = name => p.locator('.gs-chips button', { hasText: new RegExp(`^${name}$`) });
  await chipBtn('Notes').click();
  assert.equal(await box().inputValue(), 'fakesrch in:notes');
  assert.equal(await chipBtn('Notes').getAttribute('aria-pressed'), 'true');
  await poll(async () => (await p.locator('.gs-group').count()) === 1, 'the chip filters');
  await chipBtn('Notes').click();
  assert.equal(await box().inputValue(), 'fakesrch');
  await box().fill('fakesrch status:draft');
  await poll(async () => (await chipBtn('Drafts').getAttribute('aria-pressed')) === 'true', 'typed operator lights the chip');
  await box().fill('fakesrch');
  await chipBtn('Dates').click();
  await p.locator('.gs-dates input[type=date]').first().fill('2020-06-02');
  await poll(async () => /after:2020-06-02/.test(await box().inputValue()), 'From adds after:');
  await poll(async () => (await p.locator('.gs-group').count()) === 2, 'the case (1 June) drops out');
  await box().fill('fakesrch');

  // save it: it shows on the Logbook (magnifier icon) and runs here from there
  p.once('dialog', d => d.accept('Fake everywhere'));
  await p.getByRole('button', { name: 'Save search' }).click();
  await p.locator('.gs-saved .chip', { hasText: 'Fake everywhere' }).waitFor();
  await p.evaluate(() => { location.hash = '#logbook'; });
  await p.locator('.lb-saved .chip', { hasText: 'Fake everywhere' }).click();
  await poll(async () => (await p.evaluate(() => location.hash)) === '#search' && (await box().inputValue()) === 'fakesrch', 'runs in Search');
  await poll(async () => (await p.locator('.gs-group').count()) === 3, 'three groups again');

  // select results of different kinds: Bulk edit shares the date
  await p.locator('.gs-selbtn').click();
  await p.locator('.sel-bar').getByRole('button', { name: /^Select all 3$/ }).click();
  await p.locator('.sel-bar').getByRole('button', { name: 'Bulk edit…' }).click();
  await p.locator('dialog[open] h2', { hasText: 'Bulk edit 3 items' }).waitFor();
  await p.locator('dialog[open]').getByLabel('Date', { exact: true }).selectOption('set');
  await p.locator('dialog[open]').getByLabel('New date').fill('2020-07-07');
  await p.locator('dialog[open]').getByRole('button', { name: 'Review changes' }).click();
  await p.locator('dialog[open]').getByRole('button', { name: 'Save' }).click();
  await poll(async () => /3 items updated/.test(await p.locator('#toast').innerText()), 'toast');
  const dates = await p.evaluate(async () => { const { S } = await import('./js/ui-core.js'); return [S.cases.find(c => c.id === 'fake-gs-case')?.date, S.reflections.find(r => r.id === 'fake-gs-refl')?.date, S.notes.find(n => n.id === 'fake-gs-note')?.date]; });
  assert.deepEqual(dates, ['2020-07-07', '2020-07-07', '2020-07-07']);
  await p.locator('#toast button', { hasText: 'Undo' }).click();
  await poll(async () => (await p.evaluate(async () => (await import('./js/ui-core.js')).S.cases.find(c => c.id === 'fake-gs-case')?.date)) === '2020-06-01', 'undone');
  // one kind: its own popup
  await p.locator('.gs-selbtn').click();
  await group('Notes').locator('.gs-item').first().click();
  await p.locator('.sel-bar').getByRole('button', { name: 'Bulk edit…' }).click();
  await p.locator('dialog[open] h2', { hasText: 'Bulk edit 1 note' }).waitFor();
  await p.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click();
  await p.locator('.sel-bar').getByRole('button', { name: 'Done' }).click();

  // a tap opens: the case (its edit page), the note (back comes back here), the reflection
  await box().fill('fakesrch');
  await group('Cases').locator('.gs-item').first().click();
  await p.locator('dialog[open]').waitFor();
  assert.ok((await p.locator('dialog[open] textarea').evaluateAll(els => els.map(e => e.value).join(' '))).includes('Fakesrch hernia repair'), 'the case opened');
  await p.keyboard.press('Escape'); await poll(async () => !(await p.locator('dialog[open]').count()), 'dialog closed');
  await group('Notes').locator('.gs-item').first().click();
  await poll(async () => (await p.evaluate(() => location.hash)) === '#notes', 'notes');
  await p.locator('.note-editor').waitFor();
  await p.locator('.note-editor').getByRole('button', { name: 'Done' }).first().click();   // (Done goes back to Search)
  await box().waitFor();
  await group('Reflections').locator('.gs-item').first().click();
  await poll(async () => (await p.evaluate(() => location.hash)) === '#reflect', 'reflection editor');

  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log('PASS search ' + (width === 390 ? 'phone' : 'desktop'));
} } finally { await b.close(); }
