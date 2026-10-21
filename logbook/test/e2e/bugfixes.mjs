// Fake data only. Regressions from the bug hunt of 13 Oct 2026 that need a browser: a move to the recycle bin whose
// delete fails takes its copy out of the bin again (at once, or when it fails after being accepted); Edit N cases (Bulk edit), a tag
// merge and a spreadsheet's changed rows keep a case changed on another device (audit, 14 Oct 2026); Settings search
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

  // ---- the response sheet's outbox: a new case deleted and brought back is queued again ----
  // (a programme resident's new cases; the demo keeps the outbox in memory)
  const outboxEntry = id => p.evaluate(async id => (await import('./js/demo-backend.js')).sheetOutbox().find(e => e.id === id) || null, id);
  const newId = await p.evaluate(async () => {
    const { S, createCase } = await import('./js/ui-core.js');
    S.resident = { rid: '209901', name: 'Fake Resident', email: S.user.email }; S.logbook = { ...S.logbook, rid: '209901' };
    return (await createCase({ details: 'QR 33F fake LSCS spinal', cats: ['16', '28'] })).id;
  });
  assert.ok(await outboxEntry(newId), 'queued when logged');
  // deleted as the edit dialog's Delete does, then Undo on the toast
  await p.evaluate(async id => { const { S } = await import('./js/ui-core.js'), { moveToBin } = await import('./js/bin.js'); await moveToBin('case', S.cases.find(c => c.id === id), { toast: true }); }, newId);
  assert.equal(await outboxEntry(newId), null, 'taken out with the delete');
  await p.locator('#toast button', { hasText: 'Undo' }).click();
  await poll(async () => await hasCase(newId) && !!(await outboxEntry(newId)), 'Undo put the case and its outbox entry back');
  // a delete that loses to an edit made on another device: that version is kept, and goes back into the outbox
  const keptId = await p.evaluate(async () => {
    const { S, createCase, writes, cloud } = await import('./js/ui-core.js'), { moveToBin } = await import('./js/bin.js');
    const c = await createCase({ details: 'ST 50M fake hernia repair', cats: ['13'] });
    writes.configure({ backend: async (email, kind, rec, bs) => {
      if (!rec._deleted) return cloud.commitRecord(email, kind, rec, bs);
      await new Promise(r => setTimeout(r, 600));
      const remote = await cloud.saveCase(email, { ...c, details: 'fake hernia repair, edited on another device', updatedAt: Date.now() });
      throw Object.assign(new Error('This record changed elsewhere. Both versions are kept in Recover'), { code: 'write-conflict', remote });
    } });
    await moveToBin('case', S.cases.find(x => x.id === c.id));
    return c.id;
  });
  assert.equal(await outboxEntry(keptId), null, 'taken out once the delete was accepted');
  await poll(async () => /edited on another device/.test((await outboxEntry(keptId))?.details || ''), 'the kept version went back into the outbox');
  await p.evaluate(async () => { const { writes, cloud, S } = await import('./js/ui-core.js'); writes.configure({ backend: cloud.commitRecord }); S.resident = null; });
  // ---- Edit N cases (Bulk edit), a tag merge and a spreadsheet's changed rows keep a case changed on another device (audit, 14 Oct
  // 2026: they put this device's stale copy over it). The other device's edit goes straight into the demo store, so
  // this page doesn't hear of it, as a phone offline in theatre wouldn't. ----
  await p.evaluate(async () => {
    const { S, cloud, patchLogbook, tagSet } = await import('./js/ui-core.js');
    for (const [i, x] of ['a', 'b', 'c', 'd', 'e'].entries()) await cloud.saveCase(S.user.email, { id: 'fake-bulk-' + x, date: `2020-01-0${i + 1}`, initials: 'ZZ', details: 'Fakebulk case ' + x, cats: ['16'], createdAt: i + 1, updatedAt: Date.now(), source: 'app' });
    await patchLogbook({ settings: { tagSet: [...tagSet(), { k: 'u:fakeone', n: 'Fake one' }, { k: 'u:faketwo', n: 'Fake two' }, { k: 'u:fakethree', n: 'Fake three' }] } });
  });
  const elsewhere = x => p.evaluate(id => { const k = 'apmes-logbook-demo-v1', s = JSON.parse(localStorage.getItem(k)); Object.assign(s.logbooks['demo@example.com'].cases[id], { details: 'Fakebulk changed elsewhere', cats: ['16', '17'], updatedAt: Date.now() }); localStorage.setItem(k, JSON.stringify(s)); }, 'fake-bulk-' + x);
  const onServer = x => p.evaluate(async id => (await (await import('./js/ui-core.js')).cloud.listCases('demo@example.com')).find(c => c.id === id), 'fake-bulk-' + x);
  const toastSays = async re => { await poll(async () => re.test(await p.locator('#toast').innerText()), 'toast ' + re); };
  await elsewhere('a');
  await goHash('logbook');
  await p.getByLabel('Search cases').fill('Fakebulk case');
  await p.getByRole('button', { name: 'Filter' }).click();
  await p.locator('button.lb-fold', { hasText: 'More' }).click();
  await p.locator('button', { hasText: /^Edit 5 cases/ }).click();
  await p.locator('dialog[open]').getByLabel('Tags', { exact: true }).selectOption('add');
  await p.locator('dialog[open]').getByLabel('Tag to add').selectOption('u:fakeone');
  await p.locator('dialog[open]').getByRole('button', { name: 'Review changes' }).click();
  await p.locator('dialog[open]').getByRole('button', { name: 'Save' }).click();
  await toastSays(/4 cases updated\. 1 kept as it was changed on another device \(keep that version in Recover, then edit them again\)/);
  assert.equal((await onServer('a')).details, 'Fakebulk changed elsewhere', 'Tag N cases: the edit made elsewhere stays');
  assert.equal((await onServer('a')).tags, undefined); assert.deepEqual((await onServer('b')).tags, ['u:fakeone']);
  const fakeTags = () => p.evaluate(async () => (await import('./js/ui-core.js')).tagSet().filter(x => /^u:fake/.test(x.k)).map(x => x.k));
  const merge = async (from, to) => {
    await goHash('tags');
    await p.locator(`.te-list li[data-k="${from}"] .te-name`).click();
    await p.locator('dialog.tag-info').getByRole('button', { name: 'Edit', exact: true }).click();
    await p.locator('dialog[open]').getByRole('button', { name: 'Merge…', exact: true }).click();
    await p.locator('dialog[open]').getByLabel('Merge into').selectOption(to);
    await p.locator('dialog[open]').getByRole('button', { name: 'Merge', exact: true }).click();
  };
  // merged with every case saved: the old tag comes off the list
  await merge('u:fakeone', 'u:faketwo');
  await toastSays(/Merged into Fake two: 4 cases updated/);
  assert.deepEqual(await fakeTags(), ['u:faketwo', 'u:fakethree']);
  // one changed elsewhere: kept, and the old tag stays on the list (that case still has it)
  await elsewhere('c');
  await merge('u:faketwo', 'u:fakethree');
  await toastSays(/Merged into Fake three: 3 of 4 cases; “Fake two” stays on your list\. 1 kept .*then merge again/);
  assert.deepEqual(await fakeTags(), ['u:faketwo', 'u:fakethree']);
  assert.equal((await onServer('c')).details, 'Fakebulk changed elsewhere', 'merge: the edit made elsewhere stays');
  assert.deepEqual((await onServer('c')).tags, ['u:faketwo']); assert.deepEqual((await onServer('b')).tags, ['u:fakethree']);
  // a spreadsheet's changed rows (an ID column): the same
  await elsewhere('e');
  await goHash('data');
  const csv = 'ID,Date,Initials,Case summary,Tags\r\nfake-bulk-d,4/1/2020,ZZ,Fakebulk case d from the sheet,16\r\nfake-bulk-e,5/1/2020,ZZ,Fakebulk case e from the sheet,16\r\n';
  await p.locator('label', { hasText: 'Upload Excel/CSV' }).locator('input').setInputFiles({ name: 'fake-cases.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await p.locator('dialog[open]', { hasText: 'match the columns' }).getByRole('button', { name: 'Review changes' }).click();
  const rev = p.locator('dialog[open]', { hasText: 'Review changes' });
  assert.match(await rev.locator('p').first().innerText(), /^2 changed, 0 new, 0 deleted/);
  await rev.getByRole('button', { name: 'Apply' }).click();
  await toastSays(/Applied: 1 changed, 0 new, 0 deleted\. 1 kept as it was changed on another device(?! \()/);   // (no "tag again": a row is no transform)
  assert.equal((await onServer('d')).details, 'Fakebulk case d from the sheet');
  assert.equal((await onServer('e')).details, 'Fakebulk changed elsewhere', 'import: the edit made elsewhere stays');
  await p.evaluate(async () => { const { writes } = await import('./js/ui-core.js'); for (const j of writes.entries().filter(x => x.state === 'conflict')) await writes.archive(j.key); });

  // ---- Settings search: the Settings page's own cards, the bin, and Account ----
  await goHash('settings');
  const search = async (q, text, page) => {
    await p.getByLabel('Search settings').fill(q);
    await p.locator('.settings-search li', { hasText: text }).filter({ hasText: page }).first().waitFor({ timeout: 5000 });
  };
  await search('export settings', 'Settings file', 'Settings');
  await search('import settings', 'Settings file', 'Settings');
  await search('connect claude', 'Connect an AI assistant', 'Settings');
  await search('codex', 'Connect an AI assistant', 'Settings');
  await search('recycle', 'Recycle bin', 'More');
  await search('delete account', 'Delete account', 'Account');
  await search('section 1', 'Portfolio details (Section 1)', 'Account');
  // (the year picker is on Account for people not on the programme list)
  if (!(await p.evaluate(async () => !!(await import('./js/ui-core.js')).S.resident))) await search('residency', 'Residency year', 'Account');
  // a result on this page scrolls to its card; the bin is Recover's Recently deleted
  await p.getByLabel('Search settings').fill('export settings');
  await p.locator('.settings-search li a', { hasText: 'Settings file' }).click();
  await p.locator('section.flash h2', { hasText: 'Settings file' }).waitFor();
  await p.getByLabel('Search settings').fill('recycle');
  await p.locator('.settings-search li a', { hasText: 'Recycle bin' }).click();
  await p.locator('.recover-sec[data-sec=deleted][open] .bin-view').waitFor();
  await p.evaluate(() => { location.hash = '#settings'; });

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
    applyDisplay(setDisplay({ tabHidden: ['caselogs', 'progress', 'notes', 'account', 'settings', 'recovery', 'data', 'admin'] }));   // arranged by hand
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
  await apmes.getByRole('switch', { name: 'Programme totals (the Totals tab, You and your year)' }).waitFor();
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

  // ---- someone put on the programme list after using the app: the logbook takes their rid in that same session ----
  // (this device remembers "not on the list" and opens from that; before, only the next start saved the rid, so that
  // session's new cases never reached the response sheet's outbox)
  const DEMO = 'apmes-logbook-demo-v1', WHO = 'apmes-logbook-who:demo:demo@example.com';
  await p.evaluate(([DEMO, WHO]) => {
    const s = JSON.parse(localStorage.getItem(DEMO));
    s.offList = s.residents.DEMO01; delete s.residents.DEMO01; s.logbooks['demo@example.com'].doc.rid = null;
    localStorage.setItem(DEMO, JSON.stringify(s)); localStorage.removeItem(WHO);
  }, [DEMO, WHO]);
  await p.reload(); await p.waitForSelector('textarea.details');
  await poll(() => p.evaluate(WHO => JSON.parse(localStorage.getItem(WHO) || '{}').resident === null, WHO), 'this device remembers: not on the list');
  await p.evaluate(DEMO => { const s = JSON.parse(localStorage.getItem(DEMO)); s.residents.DEMO01 = s.offList; delete s.offList; localStorage.setItem(DEMO, JSON.stringify(s)); }, DEMO);   // an admin adds them
  await p.reload(); await p.waitForSelector('textarea.details');
  const rids = () => p.evaluate(async DEMO => { const { S } = await import('./js/ui-core.js'); return [S.resident?.rid, S.logbook?.rid, JSON.parse(localStorage.getItem(DEMO)).logbooks['demo@example.com'].doc.rid]; }, DEMO);
  await poll(async () => (await rids()).every(x => x === 'DEMO01'), 'the rid set here and saved, in this session');
  const lateId = await p.evaluate(async () => (await (await import('./js/ui-core.js')).createCase({ details: 'UV 45M fake lap chole', cats: ['08'] })).id);
  assert.ok(await outboxEntry(lateId), "this session's new case is queued for the sheet");
  // ======== round 3 (audit, 14 Oct 2026) ========
  const core = fn => p.evaluate(fn);
  // ---- restore while the logbook is still loading (a new phone looks empty): it waits for the server's copy ----
  await goHash('data');
  for (const sm of await p.locator('details:not([open]) > summary').all()) await sm.click().catch(() => {});
  const backupJson = await core(async () => JSON.stringify(await (await import('./js/backup.js')).makeBackup()));
  const editedId = await core(async () => {
    const { S, cloud, setCases } = await import('./js/ui-core.js');
    const c = S.cases[0];
    await cloud.saveCase(S.user.email, { ...c, details: c.details + ' EDITED ON THE LAPTOP' });   // after the backup
    S.casesSynced = false; setCases([]);   // still loading
    return c.id;
  });
  const restoreInput = p.locator('input[type=file][accept*=".gz"]');
  const restoreFile = { name: 'logbook-backup.json', mimeType: 'application/json', buffer: Buffer.from(backupJson) };
  await restoreInput.setInputFiles(restoreFile);
  await p.locator('#toast', { hasText: 'Loading your logbook first' }).waitFor();
  await p.waitForTimeout(600);
  assert.equal(await p.locator('dialog[open]').count(), 0, 'no restore dialog while loading');
  await core(async () => { const { S, cloud, setCases } = await import('./js/ui-core.js'); setCases(await cloud.listCases(S.user.email)); S.casesSynced = true; });
  await p.locator('dialog[open]').filter({ hasText: 'Everything in this backup is already in your logbook.' }).waitFor();
  await p.locator('dialog[open]').getByRole('button', { name: 'Close' }).click();
  // a list that misses a case the server has: the restore never writes over it (only what the server lacks goes)
  await core(async () => { const { S, setCases } = await import('./js/ui-core.js'); setCases(S.cases.slice(1)); });
  await restoreInput.setInputFiles(restoreFile);
  await p.locator('dialog[open]').filter({ hasText: 'Add 1 case' }).waitFor();
  await p.locator('dialog[open]').getByRole('button', { name: 'Restore', exact: true }).click();
  await p.locator('#toast', { hasText: 'Restored 0 cases, 0 reflections' }).waitFor();
  const serverCase = await p.evaluate(async id => { const { S, cloud } = await import('./js/ui-core.js'); return (await cloud.listCases(S.user.email)).find(c => c.id === id); }, editedId);
  assert.match(serverCase.details, /EDITED ON THE LAPTOP/, 'the newer copy kept');
  await core(async () => { const { S, cloud, setCases } = await import('./js/ui-core.js'); setCases(await cloud.listCases(S.user.email)); });

  // ---- Download backup waits for the server's copy; with no signal it saves this device's and says so ----
  await core(async () => { (await import('./js/ui-core.js')).S.reflectionsSynced = false; });
  let dl = p.waitForEvent('download');
  await p.getByRole('button', { name: 'Download backup' }).click();
  await p.locator('#toast', { hasText: 'Loading your logbook first' }).waitFor();
  await p.waitForTimeout(500);
  await core(async () => { (await import('./js/ui-core.js')).S.reflectionsSynced = true; });
  await dl;
  await p.locator('#toast', { hasText: /^Backup saved: \d+ cases/ }).waitFor();
  assert.doesNotMatch(await p.locator('#toast').innerText(), /this device’s copy/);
  if (width < 600) {
    await core(async () => { (await import('./js/ui-core.js')).S.casesSynced = false; });
    dl = p.waitForEvent('download', { timeout: 20000 });
    await p.getByRole('button', { name: 'Download as one spreadsheet' }).click();
    await dl;
    await p.locator('#toast', { hasText: 'this device’s copy: it may miss recent changes' }).waitFor();
    await core(async () => { (await import('./js/ui-core.js')).S.casesSynced = true; });
  }

  // ---- a reflection deleted in the editor with unsaved typing: it goes (no false "changed elsewhere"), and the bin
  // keeps what was on screen ----
  const reflId = await core(async () => {
    const { S, cloud } = await import('./js/ui-core.js');
    const r = await cloud.saveReflection(S.user.email, { id: 'fake-refl-del', headingId: 'thyroid', initials: 'ZZ', title: 'Fake to delete', summary: 'saved text', status: 'draft' });
    (await import('./js/ui-reflect.js')).openReflection(r);
    return r.id;
  });
  await p.waitForSelector('.refl-editor input[placeholder="Title"]');
  await p.locator('.refl-editor input[placeholder="Title"]').fill('Fake to delete, typed');
  await p.locator('.refl-editor button.danger', { hasText: 'Delete' }).click();
  await p.locator('dialog[open]').getByRole('button', { name: 'Move to bin' }).click();
  await p.locator('#toast', { hasText: 'Reflection moved to the recycle bin' }).waitFor();
  const afterDel = await p.evaluate(async id => {
    const { S, cloud, writes } = await import('./js/ui-core.js');
    const D = await import('./js/demo-backend.js');
    return { server: D.reflectionsOf(S.user.email.toLowerCase()).some(r => r.id === id), shown: S.reflections.some(r => r.id === id),
      bin: (await cloud.listBin(S.user.email)).find(e => e.data.id === id)?.data.title, stuck: writes.entries().filter(x => x.record.id === id && x.state !== 'synced' && x.state !== 'archived').length };
  }, reflId);
  assert.deepEqual(afterDel, { server: false, shown: false, bin: 'Fake to delete, typed', stuck: 0 });
  // ---- one changed on another device since this one last saw it: the delete is refused and the newer one stays ----
  const refused = await core(async () => {
    const { S, cloud } = await import('./js/ui-core.js'), { moveToBin } = await import('./js/bin.js');
    const old = await cloud.saveReflection(S.user.email, { id: 'fake-refl-stale', headingId: 'thyroid', initials: 'ZZ', title: 'Fake stale', summary: 'outline', status: 'draft' });
    await cloud.saveReflection(S.user.email, { ...old, summary: '900 finished words' });   // the laptop
    try { await moveToBin('reflection', old); return 'moved'; } catch (err) { return err.message; }
  });
  assert.match(refused, /changed elsewhere/);
  await p.locator('#toast', { hasText: 'was changed on another device, so it was kept' }).waitFor();
  await poll(() => p.evaluate(async () => (await import('./js/ui-core.js')).S.reflections.some(r => r.id === 'fake-refl-stale' && r.summary === '900 finished words')), 'the newer reflection shows');
  assert.equal(await p.evaluate(async () => { const { S, cloud } = await import('./js/ui-core.js'); return (await cloud.listBin(S.user.email)).filter(e => e.data.id === 'fake-refl-stale').length; }), 0, 'no copy left in the bin');

  // ---- the reflection editor's save line follows the queue: pending while the server is held, then Synced (it was
  // read once after the save, so it said pending under a header that said Synced; 15 Oct 2026) ----
  await core(async () => {
    const { S, cloud, writes } = await import('./js/ui-core.js');
    let release; window.__held = new Promise(r => { release = r; }); window.__release = release;
    writes.configure({ backend: async (...a) => { await window.__held; return cloud.commitRecord(...a); } });
    const r = await cloud.saveReflection(S.user.email, { id: 'fake-refl-live', headingId: 'thyroid', initials: 'ZY', title: 'Fake live', summary: 'saved text', status: 'draft' });
    (await import('./js/ui-reflect.js')).openReflection(r);
  });
  await p.waitForSelector('.refl-editor input[placeholder="Title"]');
  await p.locator('.refl-editor input[placeholder="Title"]').fill('Fake live, typed');
  const line = p.locator('.refl-editor span[aria-live="polite"]', { hasText: /pending sync|Synced|Saving/ }).first();
  await line.filter({ hasText: 'Saved locally · pending sync' }).waitFor({ timeout: 6000 });
  await core(async () => { const { writes, cloud } = await import('./js/ui-core.js'); window.__release(); writes.configure({ backend: cloud.commitRecord }); });
  await poll(async () => (await line.textContent()) === 'Synced', 'the save line did not follow the queue to Synced');

  assert.deepEqual(errors, [], 'console errors');
  await ctx.close();
  console.log(`PASS bug fixes ${width < 600 ? 'phone' : 'desktop'}`);
}
} finally { await b.close(); }
