// Fake data only. Regressions from the bug hunt of 13 Oct 2026 that need a browser: a move to the recycle bin whose
// delete fails takes its copy out of the bin again (at once, or when it fails after being accepted); Settings search
// finds the Settings page's own cards and Account; a settings file from before the `show` map wins over the account's
// switches, and one that changes the profile moves this device's tabs as picking it does; the APMES switches that need
// the targets' counts say so while those are off.
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
  const goHash = h => p.evaluate(x => { location.hash = '#' + x; }, h);
  const poll = async (fn, what) => { for (let i = 0; i < 60; i++) { if (await fn()) return; await p.waitForTimeout(100); } assert.fail(what); };
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');

  // ---- the recycle bin: a delete that fails leaves no copy in the bin ----
  const binHas = id => p.evaluate(async id => { const { cloud, S } = await import('./js/ui-core.js'); return (await cloud.listBin(S.user.email)).some(e => e.data.id === id); }, id);
  const hasCase = id => p.evaluate(async id => (await import('./js/ui-core.js')).S.cases.some(c => c.id === id), id);
  const ids = await p.evaluate(async () => (await import('./js/ui-core.js')).S.cases.slice(0, 2).map(c => c.id));
  // refused at once (a rules error): the move throws, the case stays, its bin entry goes
  const quick = await p.evaluate(async id => {
    const { writes, cloud, S } = await import('./js/ui-core.js'), { moveToBin } = await import('./js/bin.js');
    writes.configure({ backend: async (email, kind, rec, bs) => { if (rec._deleted) throw Object.assign(new Error('Fake refusal'), { code: 'permission-denied' }); return cloud.commitRecord(email, kind, rec, bs); } });
    try { await moveToBin('case', S.cases.find(c => c.id === id)); return 'moved'; } catch (err) { return err.message; } finally { writes.configure({ backend: cloud.commitRecord }); }
  }, ids[0]);
  assert.match(quick, /Fake refusal/);
  assert.equal(await binHas(ids[0]), false, 'no copy left in the bin');
  assert.equal(await hasCase(ids[0]), true);
  // accepted, then failing (a connection that only looks online): the copy leaves the bin when it fails
  await p.evaluate(async id => {
    const { writes, cloud, S } = await import('./js/ui-core.js'), { moveToBin } = await import('./js/bin.js');
    writes.configure({ backend: async (email, kind, rec, bs) => { if (!rec._deleted) return cloud.commitRecord(email, kind, rec, bs); await new Promise(r => setTimeout(r, 600)); throw new Error('Fake: the client is offline'); } });
    await moveToBin('case', S.cases.find(c => c.id === id));
  }, ids[1]);
  assert.equal(await binHas(ids[1]), true, 'in the bin while the delete is under way');
  await poll(async () => !(await binHas(ids[1])), 'the bin entry of the failed delete was removed');
  await p.evaluate(async () => { const { writes, cloud } = await import('./js/ui-core.js'); writes.configure({ backend: cloud.commitRecord }); });
  await poll(() => hasCase(ids[1]), 'the case shows again');
  // the failed delete is set aside (no Retry without a copy in the bin), and the case saved again after the binned
  // version, so devices whose bin feed hid it show it again
  const jobs = await p.evaluate(async id => (await import('./js/ui-core.js')).writes.entries().filter(x => x.record.id === id).map(x => [x.state, !!x.record._deleted]), ids[1]);
  assert.deepEqual(jobs[0], ['synced', false]); assert.ok(jobs.some(([s, del]) => s === 'archived' && del), JSON.stringify(jobs));

  // ---- Settings search: the Settings page's own cards, the bin, and Account ----
  await goHash('settings');
  const search = async (q, text, page) => {
    await p.getByLabel('Search settings').fill(q);
    await p.locator('.settings-search li', { hasText: text }).filter({ hasText: page }).first().waitFor({ timeout: 5000 });
  };
  await search('export settings', 'Settings file', 'Settings');
  await search('import settings', 'Settings file', 'Settings');
  await search('connect claude', 'Connect Claude', 'Settings');
  await search('recycle', 'Recycle bin', 'Settings');
  await search('delete account', 'Delete account', 'Account');
  await search('section 1', 'Portfolio details (Section 1)', 'Account');
  // (the year picker is on Account for people not on the programme list)
  if (!(await p.evaluate(async () => !!(await import('./js/ui-core.js')).S.resident))) await search('residency', 'Residency year', 'Account');
  // a result on this page scrolls to its card; the bin opens
  await p.getByLabel('Search settings').fill('export settings');
  await p.locator('.settings-search li a', { hasText: 'Settings file' }).click();
  await p.locator('section.flash h2', { hasText: 'Settings file' }).waitFor();
  await p.getByLabel('Search settings').fill('recycle');
  await p.locator('.settings-search li a', { hasText: 'Recycle bin' }).click();
  await p.locator('dialog[open]').getByText('Recycle bin', { exact: true }).first().waitFor();
  await p.locator('dialog[open]').getByRole('button', { name: 'Close' }).click();

  // ---- a settings file from before `show` (basicOn, caseHide) wins over the account's switches ----
  await p.evaluate(async () => {
    const { patchLogbook } = await import('./js/ui-core.js');
    await patchLogbook({ settings: { mode: 'basic', show: { grid: false, 'case:plan': false }, basicOn: null, caseHide: null } });
  });
  const importFile = async settings => {
    await goHash('settings');
    await p.locator('label', { hasText: 'Import settings…' }).locator('input[type=file]').setInputFiles({ name: 'fake-settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ kind: 'apmes-logbook-settings', settings })) });
    await p.locator('dialog[open]').getByRole('button', { name: 'Import' }).click();
    await p.locator('#toast', { hasText: 'Settings imported' }).waitFor();
  };
  await importFile({ mode: 'basic', basicOn: ['grid', 'case:plan'], caseHide: [] });
  assert.deepEqual(await p.evaluate(async () => { const { shows } = await import('./js/ui-core.js'); return [shows('grid'), shows('case:plan')]; }), [true, true]);

  // ---- a file that changes the profile moves this device's tabs too (as picking the profile does) ----
  await p.evaluate(async () => {
    const { patchLogbook } = await import('./js/ui-core.js'), { applyDisplay, setDisplay } = await import('./js/ui-settings.js');
    await patchLogbook({ settings: { mode: 'advanced', show: null, basicOn: null } });
    applyDisplay(setDisplay({ tabHidden: ['caselogs', 'notes', 'account', 'settings', 'recovery', 'data', 'admin'] }));   // arranged by hand
  });
  await importFile({ mode: 'personal' });
  assert.equal((await st()).mode, 'personal');
  const hidden = await p.evaluate(async () => (await import('./js/ui-settings.js')).display().tabHidden);
  assert.ok(!hidden.includes('notes'), 'Notes onto the tab bar: ' + hidden.join());
  await p.locator('[role=tab][data-tab=notes]').waitFor();

  // ---- with the targets' counts off, a switch that needs them says so ----
  await p.evaluate(async () => { const { patchLogbook } = await import('./js/ui-core.js'); await patchLogbook({ settings: { mode: 'advanced', show: { targets: false } } }); });
  await goHash('showhide');
  const apmes = p.locator('.showhide [data-group=apmes]');
  await apmes.getByRole('switch', { name: 'Programme totals (Compare with your intake)' }).waitFor();
  assert.equal(await apmes.getByText('Shows only with Counts against the APMES targets on.').count(), 4, 'Still needed, totals, year and the save toast');
  await apmes.getByRole('switch', { name: 'Counts against the APMES targets' }).check();
  await p.waitForFunction(() => !document.querySelector('.showhide [data-group=apmes]').textContent.includes('Shows only with Counts'));

  // ======== round 2 ========
  // ---- a daily-note conflict that arrives after the note was closed is merged; later saves aren't stuck ----
  await p.evaluate(async () => {
    const { writes, cloud, S } = await import('./js/ui-core.js'), np = await import('./js/ui-notepad.js');
    await np.ensureNotes();
    const me = S.user.email, id = 'day-2025-01-05';
    const first = await writes.save('note', me, { id, date: '2025-01-05', title: '', body: 'Phone line 1', createdAt: 1 }, null);
    for (let i = 0; i < 60 && writes.status('note', id) !== 'synced'; i++) await new Promise(r => setTimeout(r, 50));
    await cloud.commitRecord(me, 'note', { ...first, body: 'Phone line 1\n\nLaptop line' }, first);   // another device
    // a slow connection: the save is accepted, and its conflict comes after the note was closed
    writes.configure({ backend: async (...a) => { await new Promise(r => setTimeout(r, 600)); return cloud.commitRecord(...a); } });
    await writes.save('note', me, { ...first, body: 'Phone line 1\nPhone line 2' }, first);
    setTimeout(() => writes.configure({ backend: cloud.commitRecord }), 700);
  });
  const dayNote = () => p.evaluate(async () => {
    const { S, writes } = await import('./js/ui-core.js');
    return { body: (S.notes || []).find(n => n.id === 'day-2025-01-05')?.body || '', stuck: writes.entries().filter(x => x.record.id === 'day-2025-01-05' && (x.state === 'conflict' || x.state === 'pending')).length };
  });
  await poll(async () => { const d = await dayNote(); return /Laptop line/.test(d.body) && /Phone line 2/.test(d.body) && !d.stuck; }, 'the closed daily note merged: ' + JSON.stringify(await dayNote()));

  // ---- shared text longer than a note: New note takes what fits, the rest waits in the inbox ----
  await p.evaluate(async () => { (await import('./js/share-in.js')).keepShared(Array.from({ length: 3000 }, (_, i) => 'Fake shared line ' + i).join('\n'), 1); });
  await goHash('share');
  await p.getByRole('button', { name: 'New note', exact: true }).click();
  await p.waitForSelector('textarea.note-body');
  const noteBody = await p.locator('textarea.note-body').inputValue();
  const leftOver = await p.evaluate(async () => (await import('./js/share-in.js')).peekShared());
  assert.ok(noteBody.length <= 20000 && noteBody.length > 15000, 'the note holds what fits: ' + noteBody.length);
  assert.ok(leftOver.startsWith('Fake shared line ') && (noteBody + '\n' + leftOver).endsWith('Fake shared line 2999'), 'the rest is kept');
  assert.equal(noteBody.split('\n').length + leftOver.split('\n').length, 3000, 'no line lost');
  await p.getByRole('button', { name: 'Done', exact: true }).click();
  await p.evaluate(async () => { (await import('./js/share-in.js')).popShared(); });

  // ---- paste a list: text added after Review is never saved with the old rows, nor wiped ----
  await goHash('log'); await p.waitForSelector('textarea.details');
  await p.locator('.datebar button[data-mode="bulk"]').click();
  const bulkBox = p.locator('textarea.details');
  await bulkBox.fill('AB 30F\nLSCS spinal');
  await p.getByRole('button', { name: 'Review', exact: true }).click();
  await p.waitForSelector('table.bulk');
  await bulkBox.fill('AB 30F\nLSCS spinal\n\nZZ 40M\nlap chole GA ETT');
  await p.getByText('The list has changed: tap Review again.').waitFor();
  assert.equal(await p.locator('table.bulk').count(), 0, 'the stale rows are gone');
  await p.getByRole('button', { name: 'Review', exact: true }).click();
  await p.getByRole('button', { name: 'Save all 2' }).click();
  const anyway = p.locator('dialog[open] button', { hasText: 'Save all' });
  if (await anyway.count()) await anyway.click();
  await poll(() => p.evaluate(async () => (await import('./js/ui-core.js')).S.cases.some(c => /^ZZ/i.test(c.initials || '') || /lap chole GA ETT/.test(c.details))), 'ZZ saved');
  await p.locator('.datebar button[data-mode="one"]').click();

  // ---- auto-ticked tags cleared and put back keep following the text ----
  await p.evaluate(async () => { const { patchLogbook } = await import('./js/ui-core.js'); await patchLogbook({ settings: { autoTick: true } }); });
  const caseBox = p.locator('textarea.details');
  const picked = () => p.locator('.savebar .selected .chip[data-code], .selected .chip[data-code]').evaluateAll(els => [...new Set(els.map(e => e.dataset.code))]);
  await caseBox.fill('AB 30F LSCS spinal');
  await poll(async () => (await picked()).length >= 2, 'auto-ticked');
  const auto = await picked();
  await p.getByRole('button', { name: 'Clear all tags' }).click();
  await p.getByRole('button', { name: 'Undo' }).last().click();
  await poll(async () => (await picked()).length === auto.length, 'put back');
  await caseBox.fill('AB 72M TKR adductor canal block');
  await p.waitForTimeout(600);
  assert.deepEqual((await picked()).filter(c => auto.includes(c)), [], 'the LSCS ticks followed the text away');
  await caseBox.fill('');
  await p.evaluate(async () => { const { patchLogbook } = await import('./js/ui-core.js'); await patchLogbook({ settings: { autoTick: null } }); });

  // ---- Separate initials box, left empty: a first word stays in the details ----
  await p.evaluate(async () => { const { setDisplay, applyDisplay } = await import('./js/ui-settings.js'); applyDisplay(setDisplay({ firstField: 'initials' })); });
  await p.reload(); await p.waitForSelector('textarea.details');
  await p.locator('textarea.details').fill('Mum declined epidural, LSCS GA');
  await p.waitForTimeout(1200);
  await p.reload(); await p.waitForSelector('textarea.details');
  assert.equal(await p.getByLabel('Patient initials', { exact: true }).inputValue(), '');
  assert.equal(await p.locator('textarea.details').inputValue(), 'Mum declined epidural, LSCS GA');
  await p.locator('textarea.details').fill('');
  await p.evaluate(async () => { const { setDisplay, applyDisplay } = await import('./js/ui-settings.js'); applyDisplay(setDisplay({ firstField: null })); });

  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log(`PASS bug fixes ${width < 600 ? 'phone' : 'desktop'}`);
}
} finally { await b.close(); }
