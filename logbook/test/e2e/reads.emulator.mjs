// Firestore reads per open with the sync engine (js/sync.js): the real app (?emulator) against the local Firestore
// and Auth emulators, the real rules, a made-up account and fake cases. Run by tools/test-reads.sh (which starts the
// emulators and a static server). Each open is a new page in the same browser profile, so this device's copy
// (IndexedDB) and the sign-in persist between opens, as on a phone.
//
// What is counted (window.__reads, cloud.js): "billed" = each listener's first server result in full (at least one
// document per query; what Firestore charges a listener started cold, e.g. after more than 30 minutes) plus every
// change after it. Before the engine, every open listened to the whole collections: 50 cases = 50+ reads each time.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const PORT = process.env.PORT || 8080, FS = process.env.READS_FS_PORT || 8086, AUTH = process.env.READS_AUTH_PORT || 9098;
const SDK_DIR = process.env.SDK_DIR || `${process.env.HOME}/.cache/anawj-rules/node_modules/firebase`;
const BASE = `http://localhost:${PORT}/logbook/?emulator=${FS}:${AUTH}`;
const E = 'fake.reader@example.com';
const DB = `http://127.0.0.1:${FS}/v1/projects/demo-logbook/databases/(default)/documents`;

// ---- seeding through the emulator's REST API ("Bearer owner" skips the rules) ----
const val = v => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'object' ? { mapValue: { fields: fields(v) } } : { stringValue: String(v) };
const fields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const H = { Authorization: 'Bearer owner', 'content-type': 'application/json' };
async function put(path, doc) {
  const r = await fetch(`${DB}/${path}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: fields(doc) }) });
  if (!r.ok) throw new Error(`seed ${path}: ${r.status} ${await r.text()}`);
}
const del = path => fetch(`${DB}/${path}`, { method: 'DELETE', headers: H });
const lb = `logbooks/${E}`;
const now = Date.now(), old = now - 2 * 864e5;
await fetch(`http://127.0.0.1:${FS}/emulator/v1/projects/demo-logbook/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:${AUTH}/emulator/v1/projects/demo-logbook/accounts`, { method: 'DELETE' });
await put(lb, { email: E, name: 'Fake Reader', rid: null, settings: { mode: 'advanced' }, templates: [], updatedAt: old });
const day = i => new Date(old - i * 864e5).toISOString().slice(0, 10);
for (let i = 0; i < 50; i++) await put(`${lb}/cases/c${i}`, { id: 'c' + i, date: day(i), initials: 'AB', details: `${20 + i}F fake case ${i}`, cats: ['08'], createdAt: old, updatedAt: old, source: 'app' });
for (let i = 0; i < 3; i++) await put(`${lb}/notes/n${i}`, { id: 'n' + i, date: day(i), title: 'Fake note ' + i, body: 'Fake text', createdAt: old, updatedAt: old });

// ---- the browser: the SDK from the local copy (no network), service workers off ----
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await ctx.route(/https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z]+\.js)$/, r => {
  const file = r.request().url().split('/').pop();
  // the app pins an older version; the API it uses is the same, and the files import each other by this URL
  const body = fs.readFileSync(`${SDK_DIR}/${file}`, 'utf8').replace(/firebasejs\/[\d.]+\//g, 'firebasejs/10.12.2/');
  r.fulfill({ contentType: 'text/javascript', body });
});
const errors = [];
// poll an async check in the page (waitForFunction treats an async function's promise as already true)
async function until(p, fn, arg, timeout = 30000) {
  for (const t = Date.now(); !(await p.evaluate(fn, arg)); await p.waitForTimeout(100)) if (Date.now() - t > timeout) throw new Error('Timed out: ' + fn);
}
const reads = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__reads || {})));
const billed = (r, c) => (r[c] && r[c].billed) || 0;
// wait until the counts stop moving (listeners settled, the engine's writes done)
async function quiet(p) {
  let last = '', same = 0;
  for (let i = 0; i < 80 && same < 6; i++) {
    await p.waitForTimeout(250);
    const now = JSON.stringify(await reads(p));
    same = now === last ? same + 1 : 0; last = now;
  }
  await p.evaluate(async () => (await import('./js/cloud.js')).syncFlush());
}
async function open(label, { signIn = false, notes = false, check } = {}) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(label + ': ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/permission|Missing or insufficient/i.test(m.text())) errors.push(label + ': ' + m.text()); });
  await p.goto(BASE + '#logbook');
  if (signIn) {
    await p.getByRole('button', { name: 'Sign in with Google' }).waitFor();
    await p.evaluate(async e => (await import('./js/cloud.js')).emulatorSignIn(e), E);
  }
  await p.waitForFunction(() => document.body.dataset.cases && document.body.dataset.cases !== '0', null, { timeout: 30000 });
  await until(p, async () => (await import('./js/ui-core.js')).S.casesSynced);
  if (notes) {
    await p.evaluate(() => { location.hash = '#notes'; });
    await p.locator('.notes-count').waitFor({ timeout: 30000 });
  }
  await quiet(p);
  const r = await reads(p);
  console.log(`open ${label}: reads ${['cases', 'reflections', 'notes', 'bin'].map(c => `${c} ${billed(r, c)}`).join(', ')}`);
  if (check) await check(p, r);
  await p.close();
  return r;
}
const S = (p, f) => p.evaluate(async src => { const { S } = await import('./js/ui-core.js'); return new Function('S', 'return ' + src)(S); }, f);

try {
  // 1. first open on this device: everything once
  await open('1 (first, new device)', { signIn: true, notes: true, check: async (p, r) => {
    assert.equal(billed(r, 'cases'), 50, 'first open reads every case');
    assert.equal(billed(r, 'notes'), 3);
    assert.ok(billed(r, 'reflections') <= 1 && billed(r, 'bin') <= 1);
    assert.equal(await S(p, 'S.cases.length'), 50);
  } });
  // 2. again, nothing changed: about one read per collection
  await open('2 (no change)', { notes: true, check: async (p, r) => {
    for (const c of ['cases', 'reflections', 'notes', 'bin']) assert.ok(billed(r, c) <= 3, `${c}: ${billed(r, c)} reads with nothing changed`);
    assert.equal(await S(p, 'S.cases.length'), 50);
    assert.equal(await S(p, 'S.notes.length'), 3);
  } });
  // 3. another device edited one case, added one, and moved one to the recycle bin
  const t = Date.now();
  await put(`${lb}/cases/c7`, { id: 'c7', date: day(7), initials: 'AB', details: '27F fake case 7 edited', cats: ['08'], createdAt: old, updatedAt: t });
  await put(`${lb}/cases/new1`, { id: 'new1', date: day(0), initials: 'CD', details: '61M fake new case', cats: ['08'], createdAt: t, updatedAt: t });
  await put(`${lb}/bin/c_c9_x`, { id: 'c_c9_x', kind: 'case', data: { id: 'c9', date: day(9), details: 'fake case 9', cats: ['08'] }, deletedAt: t });
  await del(`${lb}/cases/c9`);
  await put(`${lb}/notes/n1`, { id: 'n1', date: day(1), title: 'Fake note 1 edited', body: 'Fake text', createdAt: old, updatedAt: t });
  await open('3 (one edit, one new, one binned, one note edited)', { notes: true, check: async (p, r) => {
    assert.ok(billed(r, 'cases') >= 2 && billed(r, 'cases') <= 4, `cases: ${billed(r, 'cases')} reads for 2 changes`);
    assert.ok(billed(r, 'notes') <= 2, `notes: ${billed(r, 'notes')} reads for 1 change`);
    assert.ok(billed(r, 'bin') <= 2, `bin: ${billed(r, 'bin')} reads for 1 entry`);
    assert.equal(await S(p, 'S.cases.length'), 50);
    assert.equal(await S(p, 'S.cases.find(c => c.id === "c7").details'), '27F fake case 7 edited');
    assert.equal(await S(p, 'S.cases.some(c => c.id === "c9")'), false, 'binned elsewhere: gone here');
    assert.equal(await S(p, 'S.notes.find(n => n.id === "n1").title'), 'Fake note 1 edited');
  } });
  // 4. this device logs a case (through the write queue); reopening costs about nothing again
  await open('4 (log a case here)', { check: async p => {
    await p.evaluate(async () => { const { createCase, todayISO } = await import('./js/ui-core.js'); await createCase({ date: todayISO(), details: 'EF 33F fake case logged in the test', cats: ['08'] }); });
    await until(p, async () => (await import('./js/ui-core.js')).S.cases.length === 51);
    await quiet(p);
  } });
  // a write made offline that reached the server late (listed when the page closed) is stamped again after the next
  // start, so other devices' "changed since" queries still see it
  {
    const p = await ctx.newPage();
    await p.goto(BASE + '#log');
    await until(p, async () => (await import('./js/ui-core.js')).S.casesSynced);
    await p.evaluate(e => localStorage.setItem('apmes-logbook-late:' + e, JSON.stringify([{ email: e, coll: 'cases', ids: ['c3'], field: 'updatedAt', at: Date.now() - 3600e3 }])), E);
    await p.reload();
    const stampOf = async () => Number((await (await fetch(`${DB}/${lb}/cases/c3`, { headers: H })).json()).fields.updatedAt.integerValue);
    for (const t0 = Date.now(); await stampOf() === old; await p.waitForTimeout(200)) if (Date.now() - t0 > 15000) throw new Error('late write not stamped again');
    assert.equal(await p.evaluate(e => localStorage.getItem('apmes-logbook-late:' + e), E), null);
    await quiet(p); await p.close();
  }
  // nothing changed since; the cases changed in the 10 minutes before the last sync (SKEW, sync.js) are read again
  await open('5 (no change; 4 cases changed in the last 10 minutes)', { check: async (p, r) => {
    const recent = await S(p, 'S.cases.filter(c => c.updatedAt > Date.now() - 11 * 60e3).length');
    assert.equal(recent, 4);
    assert.ok(billed(r, 'cases') <= recent, `cases: ${billed(r, 'cases')} reads`);
    for (const c of ['reflections', 'bin']) assert.ok(billed(r, c) <= 1, `${c}: ${billed(r, c)} reads with nothing changed`);
    assert.equal(await S(p, 'S.cases.length'), 51);
  } });
  // the Google Form inbox (form-inbox.js): an entry from the Form's script becomes a case and leaves the inbox; an
  // edited response replaces that case
  {
    const entry = (details, at) => ({ id: '2_FakeResp1', email: E, date: day(1), details, labels: ['16) Lower Segment Caesarean Section (10 | 20)'], submittedAt: at });
    const inboxEmpty = async () => !(await (await fetch(`${DB}/formInbox/2_FakeResp1`, { headers: H })).json()).fields;
    const formCase = 'S.cases.find(c => c.source === "form")';
    await put('formInbox/2_FakeResp1', entry('GH 29F fake Form case S1234567D', Date.now()));
    await open('Form 1 (a response waiting)', { check: async p => {
      await until(p, async () => (await import('./js/ui-core.js')).S.cases.some(c => c.source === 'form'));
      assert.equal(await S(p, formCase + '.initials'), 'GH');
      assert.equal(await S(p, formCase + '.details'), '29F fake Form case [ID removed]');
      assert.deepEqual(await S(p, formCase + '.cats'), ['16']);
      assert.equal(await S(p, 'S.cases.length'), 52);
      for (const t0 = Date.now(); !(await inboxEmpty()); await p.waitForTimeout(200)) if (Date.now() - t0 > 15000) throw new Error('inbox not emptied');
      await quiet(p);
    } });
    await put('formInbox/2_FakeResp1', entry('GH 29F fake Form case, edited on the Form', Date.now()));
    await open('Form 2 (the response edited)', { check: async p => {
      await until(p, async () => (await import('./js/ui-core.js')).S.cases.some(c => c.source === 'form' && /edited on the Form/.test(c.details)));
      assert.equal(await S(p, 'S.cases.length'), 52);
      for (const t0 = Date.now(); !(await inboxEmpty()); await p.waitForTimeout(200)) if (Date.now() - t0 > 15000) throw new Error('inbox not emptied');
      await quiet(p);
    } });
    // deleting on ANOTHER device (fresh sign-in, empty local copy), through the Delete button's path (recycle bin first),
    // reaches the server: a normal case and the Form case
    {
      const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      await ctx2.route(/https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z]+\.js)$/, r => {
        const file = r.request().url().split('/').pop();
        r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(`${SDK_DIR}/${file}`, 'utf8').replace(/firebasejs\/[\d.]+\//g, 'firebasejs/10.12.2/') });
      });
      const p = await ctx2.newPage();
      p.on('pageerror', e => errors.push('device 2: ' + e.message));
      await p.goto(BASE + '#logbook');
      await p.getByRole('button', { name: 'Sign in with Google' }).waitFor();
      await p.evaluate(async e => (await import('./js/cloud.js')).emulatorSignIn(e), E);
      await until(p, async () => (await import('./js/ui-core.js')).S.casesSynced && (await import('./js/ui-core.js')).S.cases.some(c => c.source === 'form'));
      const id = await S(p, 'S.cases.find(c => c.source === "form").id');
      // a normal app case on the same fresh device first, through the same Delete path
      const appId = await S(p, 'S.cases.find(c => c.source === "app").id');
      const appOut = await p.evaluate(async id => { const { S } = await import('./js/ui-core.js'); const { moveToBin } = await import('./js/bin.js');
        try { await moveToBin('case', S.cases.find(c => c.id === id)); return 'ok'; } catch (e) { return 'ERR ' + e.message; } }, appId);
      let appGone = false; for (const t0 = Date.now(); Date.now() - t0 < 10000; await p.waitForTimeout(300)) if ((appGone = (await fetch(`${DB}/${lb}/cases/${encodeURIComponent(appId)}`, { headers: H })).status === 404)) break;
      const out = await p.evaluate(async id => { const { S } = await import('./js/ui-core.js'); const { moveToBin } = await import('./js/bin.js');
        try { await moveToBin('case', S.cases.find(c => c.id === id)); return 'ok'; } catch (e) { return 'ERR ' + e.message; } }, id);
      const gone = async () => (await fetch(`${DB}/${lb}/cases/${encodeURIComponent(id)}`, { headers: H })).status === 404;
      let ok = false; for (const t0 = Date.now(); Date.now() - t0 < 15000; await p.waitForTimeout(300)) if ((ok = await gone())) break;
      console.log('  device 2 delete: app case', appOut, appGone ? '(gone from the server)' : '(STILL on the server)', '| Form case', out, ok ? '(gone from the server)' : '(STILL on the server)');
      await ctx2.close();
      // 14 Oct 2026: a single delete compared the server's copy with nothing (the bin feed had already dropped the case
      // here), counted it as a conflict and never reached the server, while this device kept hiding it
      if (!appGone || !ok) throw new Error('a delete from a second device never reached the server');
    }
    // the deleted Form case is listed for good (formGone, written through the real rules): once its bin entry has gone
    // (the 30-day purge, Delete forever), an edit of that response still doesn't bring it back, and it leaves the inbox
    {
      const listed = async () => (await fetch(`${DB}/${lb}/formGone/${encodeURIComponent('imp_form~003a2_FakeResp1')}`, { headers: H })).status === 200;
      for (const t0 = Date.now(); !(await listed()); await new Promise(r => setTimeout(r, 200))) if (Date.now() - t0 > 15000) throw new Error('the deleted Form case was never listed in formGone');
      for (const d of (await (await fetch(`${DB}/${lb}/bin`, { headers: H })).json()).documents || []) await fetch(`http://127.0.0.1:${FS}/v1/${d.name}`, { method: 'DELETE', headers: H });
      await put('formInbox/2_FakeResp1', entry('GH 29F fake Form case, edited after it was deleted', Date.now()));
      await open('Form 2b (deleted, bin emptied, response edited)', { check: async p => {
        for (const t0 = Date.now(); !(await inboxEmpty()); await p.waitForTimeout(200)) if (Date.now() - t0 > 15000) throw new Error('inbox not emptied');
        await quiet(p);
        assert.equal(await S(p, 'S.cases.some(c => c.source === "form")'), false, 'the deleted Form case came back');
      } });
    }
    // deleting the Form case in the app reaches the server (it goes to the recycle bin)
    await open('Form 3 (delete the Form case)', { check: async p => {
      const id = await S(p, 'S.cases.find(c => c.source === "form")?.id || null');
      if (!id) return;
      await p.evaluate(async id => (await import('./js/ui-core.js')).removeCase(id), id);
      const gone = async () => (await fetch(`${DB}/${lb}/cases/${encodeURIComponent(id)}`, { headers: H })).status === 404;
      for (const t0 = Date.now(); !(await gone()); await p.waitForTimeout(200)) if (Date.now() - t0 > 15000) throw new Error('Form case delete never reached the server');
      assert.equal(await S(p, 'S.cases.length'), 51);
      await quiet(p);
    } });
  }
  // 6. sign out: this device's copy is deleted
  await open('6 (sign out)', { check: async p => {
    await p.evaluate(async () => (await import('./js/cloud.js')).signOut());
    await p.getByRole('button', { name: 'Sign in with Google' }).waitFor();
    await until(p, async () => !(await indexedDB.databases()).some(d => d.name.startsWith('apmes-logbook-store:')));
  } });
  assert.deepEqual(errors, []);
  console.log('PASS reads (sync engine, emulator)');
} catch (e) {
  console.log('FAIL reads: ' + e.message);
  if (errors.length) console.log('  errors: ' + errors.join('\n  '));
  process.exitCode = 1;
} finally { await b.close(); }
