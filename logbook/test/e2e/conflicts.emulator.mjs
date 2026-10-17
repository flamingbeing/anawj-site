// Two devices, one account, against the real rules (Firestore and Auth emulators, demo project, fake accounts): the
// same record changed in two places at once, the recycle bin, signing out with unsent work, and whether the header's
// "Synced" can be trusted (PLAN-go-live-bugfix.md items 3, 4, 5 and 10). Each scenario is fixed (no randomness); the
// rule throughout: nothing that said it saved may be lost silently. Either it's on the server, or the device that made it
// says "Save needs attention" and keeps it in Recent changes.
// Run by tools/test-multidevice.sh with TEST=conflicts. Env: BROWSER (chromium|webkit|firefox), ONLY (a scenario name).
// Written 14 Oct 2026.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const pw = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const PORT = process.env.PORT || 8080, FS = process.env.READS_FS_PORT || 8087, AUTH = process.env.READS_AUTH_PORT || 9097;
const SDK_DIR = process.env.SDK_DIR || `${process.env.HOME}/.cache/anawj-rules/node_modules/firebase`;
// the page on 127.0.0.1 like the emulators: WebKit blocks localhost → 127.0.0.1 ("access control checks")
const BASE = `http://127.0.0.1:${PORT}/logbook/?emulator=${FS}:${AUTH}`;
const BROWSER = process.env.BROWSER || 'chromium', ONLY = process.env.ONLY || '';
const E = 'fake.multi@example.com', OTHER = 'fake.other@example.com';
const DB = `http://127.0.0.1:${FS}/v1/projects/demo-logbook/databases/(default)/documents`;
const H = { Authorization: 'Bearer owner', 'content-type': 'application/json' };
console.log(`multidevice conflicts: ${BROWSER}`);

// ---- the server's copy (REST, "Bearer owner" skips the rules) ----
const val = v => Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : typeof v === 'number' ? { integerValue: String(v) } : v === null ? { nullValue: null }
  : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } } : { stringValue: String(v) };
async function put(path, doc) {
  const r = await fetch(`${DB}/${path}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, val(v)])) }) });
  if (!r.ok) throw new Error(`seed ${path}: ${r.status}`);
}
async function list(email, coll) {
  const out = [];
  let token = '';
  do {
    const r = await (await fetch(`${DB}/logbooks/${email}/${coll}?pageSize=300${token ? '&pageToken=' + token : ''}`, { headers: H })).json();
    out.push(...(r.documents || []));
    token = r.nextPageToken || '';
  } while (token);
  return out;
}
const topList = async coll => ((await (await fetch(`${DB}/${coll}?pageSize=300`, { headers: H })).json()).documents || []);
const serverCases = async (email = E) => new Map((await list(email, 'cases')).map(d => [d.name.split('/').pop(), d.fields.details?.stringValue ?? '']));
const serverBin = async () => (await list(E, 'bin')).map(d => ({ id: d.name.split('/').pop(), caseId: d.fields.data?.mapValue?.fields?.id?.stringValue }));
await fetch(`http://127.0.0.1:${FS}/emulator/v1/projects/demo-logbook/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:${AUTH}/emulator/v1/projects/demo-logbook/accounts`, { method: 'DELETE' });
const old = Date.now() - 2 * 864e5;
await put(`logbooks/${E}`, { email: E, name: 'Fake Multi', rid: null, updatedAt: old });
// E is on the programme list (the sheet outbox is for residents only)
await put('residents/R9', { rid: 'R9', name: 'Fake Multi', email: E, status: 'ACTIVE', intake: 2024, rYear: 2 });
await put(`logbooks/${E}`, { email: E, name: 'Fake Multi', rid: 'R9', updatedAt: old });
await put(`logbooks/${OTHER}`, { email: OTHER, name: 'Fake Other', rid: null, updatedAt: old });
let seeded = 0;
async function seedCase(text) {
  // stamped now: devices already signed in pick up changes newer than their last sync
  const id = 'case' + (++seeded), now = Date.now();
  await put(`logbooks/${E}/cases/${id}`, { id, date: '2026-10-01', initials: 'AB', details: text, cats: ['08'], createdAt: now, updatedAt: now, source: 'app' });
  return id;
}

// ---- the devices: one browser profile each (own IndexedDB, own sign-in) ----
const b = await pw[BROWSER].launch(BROWSER === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const errors = [];
async function device(name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route(/https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z]+\.js)$/, r => {
    const file = r.request().url().split('/').pop();
    r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(`${SDK_DIR}/${file}`, 'utf8').replace(/firebasejs\/[\d.]+\//g, 'firebasejs/10.12.2/') });
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  const log = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.push(m.text().slice(0, 200)); });
  await p.goto(BASE + '#logbook');
  await signIn(p, E);
  return { name, p, ctx, log };
}
async function signIn(p, email) {
  await p.getByRole('button', { name: 'Sign in with Google' }).waitFor({ timeout: 30000 });
  await p.evaluate(async e => (await import('./js/cloud.js')).emulatorSignIn(e), email);
  await synced(p);
}
async function synced(p, timeout = 60000) {
  for (const t = Date.now(); !(await p.evaluate(async () => (await import('./js/ui-core.js')).S.casesSynced).catch(() => false)); await p.waitForTimeout(150))
    if (Date.now() - t > timeout) throw new Error('never synced');
}
const reopen = async d => { await d.p.reload(); await synced(d.p); await d.p.waitForTimeout(500); };
const casesOn = async d => new Map(await d.p.evaluate(async () => (await import('./js/ui-core.js')).S.cases.map(c => [c.id, c.details])));
const jobs = d => d.p.evaluate(async () => (await import('./js/writes.js')).writes.entries().map(j => ({ id: j.record.id, state: j.state, deleted: !!j.record._deleted, text: j.record.details, error: j.error })));
const header = d => d.p.evaluate(() => document.querySelector('a.sync, span.sync')?.textContent || '');
const settle = async (...devs) => {
  await Promise.all(devs.map(d => d.p.evaluate(async () => { await (await import('./js/writes.js')).writes.flush(8000); await (await import('./js/cloud.js')).syncFlush(); }).catch(() => {})));
  await new Promise(r => setTimeout(r, 1500));
};

// one action in the page; returns { ok, error, id }
const act = (d, a) => d.p.evaluate(async a => {
  const ui = await import('./js/ui-core.js'), bin = await import('./js/bin.js'), cloud = await import('./js/cloud.js');
  const find = id => ui.S.cases.find(c => c.id === id);
  try {
    if (a.kind === 'create') { const c = await ui.createCase({ id: a.id, date: '2026-10-14', details: a.text, initials: 'CD', cats: ['08'] }); return { ok: true, id: c.id }; }
    if (a.kind === 'edit') { const c = find(a.id); if (!c) return { ok: false, error: 'not here' }; await ui.updateCase({ ...c, details: a.text }); return { ok: true }; }
    if (a.kind === 'delete') { const c = find(a.id); if (!c) return { ok: false, error: 'not here' }; await bin.moveToBin('case', c); return { ok: true }; }
    if (a.kind === 'deleteMany') { const cs = a.ids.map(find); if (cs.some(c => !c)) return { ok: false, error: 'not here' }; await bin.moveToBin('case', cs); return { ok: true }; }
    if (a.kind === 'restore') {
      const e = (await cloud.listBin(ui.S.user.email)).find(x => x.kind === 'case' && x.data && x.data.id === a.id);
      if (!e) return { ok: false, error: 'not in the bin' };
      const out = await bin.restoreFromBin(e.id); return { ok: true, id: out.id };
    }
    if (a.kind === 'purge') return { ok: true, n: await bin.purgeExpired({ force: true }) };
  } catch (err) { return { ok: false, error: err.message }; }
}, a);
const must = r => assert.ok(r.ok, r.error);
const both = (d1, a1, d2, a2) => Promise.all([act(d1, a1), act(d2, a2)]);

// a change that said it saved and isn't on the server must be a conflict on its device, with the header saying so
async function owned(d, id, what) {
  const j = (await jobs(d)).filter(x => x.id === id && (x.state === 'conflict' || x.state === 'failed'));
  if (!j.length) return `${d.name}'s ${what} of ${id} said it saved, isn't on the server, and isn't in Recent changes`;
  await d.p.waitForTimeout(300);
  const h = await header(d);
  if (!/needs attention/i.test(h)) return `${d.name} keeps ${id} in Recent changes but the header says "${h}"`;
  return '';
}

const scenarios = {
  // both devices edit the same case at the same moment: one lands, the other must say so
  async editVsEdit(A, B) {
    const id = await seedCase('fake case: edit vs edit'); await reopen(A); await reopen(B);
    const [ra, rb] = await both(A, { kind: 'edit', id, text: 'fake edit from A' }, B, { kind: 'edit', id, text: 'fake edit from B' });
    await settle(A, B);
    const on = (await serverCases()).get(id);
    for (const [d, r, text] of [[A, ra, 'fake edit from A'], [B, rb, 'fake edit from B']])
      if (r.ok && on !== text) { const bad = await owned(d, id, 'edit'); assert.equal(bad, '', bad); }
    assert.ok(['fake edit from A', 'fake edit from B'].includes(on), `server has "${on}"`);
    return `server kept "${on}"; the other device: ${on === 'fake edit from A' ? (rb.ok ? 'conflict in Recent changes' : rb.error) : (ra.ok ? 'conflict in Recent changes' : ra.error)}`;
  },
  // the loser of an edit clash chooses its own version in Recent changes: it lands, and the header clears
  async conflictResolves(A, B) {
    const id = await seedCase('fake case: resolve'); await reopen(A); await reopen(B);
    await A.ctx.setOffline(true);
    must(await act(A, { kind: 'edit', id, text: 'fake edit offline' }));
    must(await act(B, { kind: 'edit', id, text: 'fake edit online' }));
    await settle(B);
    await A.ctx.setOffline(false); await settle(A);
    const j = (await jobs(A)).find(x => x.id === id && x.state === 'conflict');
    assert.ok(j, 'the offline edit meets the online one: a conflict');
    assert.match(await header(A), /needs attention/i);
    await A.p.evaluate(() => { location.hash = '#recovery'; });
    await A.p.getByRole('button', { name: 'Restore my version' }).first().click();
    await A.p.getByRole('button', { name: 'Restore', exact: true }).click();
    await settle(A); await reopen(A);
    assert.equal((await serverCases()).get(id), 'fake edit offline', 'my version, chosen in Recent changes, is on the server');
    assert.doesNotMatch(await header(A), /needs attention/i);
    return 'chosen version landed; header cleared';
  },
  // one edits, the other deletes, at once: either the edit or the delete lands, the other one says so; never a live
  // case with a stale copy left in the bin, never a deleted case whose edit said Synced
  async editVsDelete(A, B) {
    const id = await seedCase('fake case: edit vs delete'); await reopen(A); await reopen(B);
    const [ra, rb] = await both(A, { kind: 'edit', id, text: 'fake edit vs delete' }, B, { kind: 'delete', id });
    await settle(A, B);
    const on = await serverCases(), bin = (await serverBin()).filter(e => e.caseId === id);
    if (on.has(id)) {
      if (rb.ok) { const bad = await owned(B, id, 'delete'); assert.equal(bad, '', bad); }
      assert.equal(bin.length, 0, `${id} is live and in the bin too`);
    } else {
      if (ra.ok) { const bad = await owned(A, id, 'edit'); assert.equal(bad, '', bad); }
      assert.equal(bin.length, 1, `${id} is deleted: one copy in the bin`);
    }
    return on.has(id) ? `edit landed (${on.get(id)}); delete: ${rb.ok ? 'conflict' : rb.error}` : `delete landed; edit: ${ra.ok ? 'conflict in Recent changes' : ra.error}`;
  },
  // same as above but the delete is a multi-select (two cases)
  async editVsDeleteMany(A, B) {
    const id = await seedCase('fake case: edit vs multi-delete'), id2 = await seedCase('fake case: multi-delete partner'); await reopen(A); await reopen(B);
    const [ra, rb] = await both(A, { kind: 'edit', id, text: 'fake edit vs multi-delete' }, B, { kind: 'deleteMany', ids: [id, id2] });
    await settle(A, B);
    const on = await serverCases(), bin = (await serverBin()).filter(e => e.caseId === id);
    if (on.has(id)) {
      if (rb.ok) { const bad = await owned(B, id, 'delete'); assert.equal(bad, '', bad); }
      assert.equal(bin.length, 0, `${id} is live and in the bin too`);
    } else {
      if (ra.ok) { const bad = await owned(A, id, 'edit'); assert.equal(bad, '', bad); }
      assert.equal(bin.length, 1, `${id} is deleted: one copy in the bin`);
      const kept = (await list(E, 'bin')).find(d => d.fields.data?.mapValue?.fields?.id?.stringValue === id);
      const text = kept?.fields.data.mapValue.fields.details?.stringValue;
      if (ra.ok && text !== 'fake edit vs multi-delete') assert.fail(`A's edit said it saved; the case was deleted and the bin holds "${text}", not the edit`);
    }
    return on.has(id) ? 'edit landed' : 'delete landed';
  },
  // both devices restore the same bin entry at once: one case back, same id, no duplicate
  async restoreTwice(A, B) {
    const id = await seedCase('fake case: restore twice'); await reopen(A); await reopen(B);
    must(await act(A, { kind: 'delete', id }));
    await settle(A, B); await reopen(B);
    const [ra, rb] = await both(A, { kind: 'restore', id }, B, { kind: 'restore', id });
    await settle(A, B);
    const copies = [...(await serverCases())].filter(([, t]) => t === 'fake case: restore twice');
    assert.deepEqual(copies.map(([k]) => k), [id], `restored ${copies.length} times: ${copies.map(([k]) => k)} (A: ${ra.ok || ra.error}, B: ${rb.ok || rb.error})`);
    assert.equal((await serverBin()).filter(e => e.caseId === id).length, 0, 'bin entry gone after the restore');
    return 'one copy, same id';
  },
  // delete, restore, delete again; then restore again: the right text comes back, one bin entry at a time
  async deleteRestoreDelete(A, B) {
    const id = await seedCase('fake case: round trip'); await reopen(A); await reopen(B);
    must(await act(A, { kind: 'delete', id })); await settle(A);
    must(await act(A, { kind: 'restore', id })); await settle(A);
    must(await act(A, { kind: 'delete', id })); await settle(A, B);
    assert.ok(!(await serverCases()).has(id), 'deleted again');
    assert.equal((await serverBin()).filter(e => e.caseId === id).length, 1, 'one bin entry');
    await reopen(B); assert.ok(!(await casesOn(B)).has(id), 'gone on the other device');
    must(await act(B, { kind: 'restore', id })); await settle(B, A);
    assert.equal((await serverCases()).get(id), 'fake case: round trip');
    await reopen(A); assert.equal((await casesOn(A)).get(id), 'fake case: round trip', 'back on the first device');
    return 'ok';
  },
  // restore when a live case has that id: it comes back under a new id, both kept
  async restoreIdInUse(A) {
    const id = await seedCase('fake case: id in use (binned)'); await reopen(A);
    must(await act(A, { kind: 'delete', id })); await settle(A);
    must(await act(A, { kind: 'create', id, text: 'fake case: id in use (new)' })); await settle(A);
    const r = await act(A, { kind: 'restore', id }); assert.ok(r.ok, r.error); await settle(A);
    const on = await serverCases();
    assert.notEqual(r.id, id, 'a new id');
    assert.equal(on.get(id), 'fake case: id in use (new)');
    assert.equal(on.get(r.id), 'fake case: id in use (binned)');
    return 'both kept';
  },
  // entries past 30 days go; younger ones stay
  async purge(A) {
    const now = Date.now();
    const entry = (n, days) => ({ id: `c_purge${n}_x`, kind: 'case', deletedAt: now - days * 864e5,
      data: { id: `purge${n}`, date: '2026-09-01', initials: 'EF', details: `fake binned ${days} days`, cats: ['08'], createdAt: old, updatedAt: old, source: 'app' } });
    await put(`logbooks/${E}/bin/c_purge1_x`, entry(1, 31)); await put(`logbooks/${E}/bin/c_purge2_x`, entry(2, 29));
    const r = await act(A, { kind: 'purge' }); assert.ok(r.ok, r.error);
    const left = (await serverBin()).map(e => e.id);
    assert.ok(!left.includes('c_purge1_x'), '31 days: purged'); assert.ok(left.includes('c_purge2_x'), '29 days: kept');
    return `purged ${r.n}`;
  },
  // a Form response picked up on one device, then edited there; a second device that read the inbox before the pick-up
  // tries it too: it must not put the Form's version back over the edit (the rules refuse deleting an entry that is
  // gone, so the second pick-up's batch fails whole). Through form-inbox.js pickUp, as the app does it: it reads the
  // recycle bin and formGone from the server through the real rules
  async formTwice(A, B) {
    await put('formInbox/2_FakeTwice', { id: '2_FakeTwice', email: E, date: '2026-10-14', details: 'GH fake Form case twice', labels: ['16) Lower Segment Caesarean Section (10 | 20)'], submittedAt: Date.now() });
    const pick = d => d.p.evaluate(async () => {
      const cloud = await import('./js/cloud.js'), { S } = await import('./js/ui-core.js'), { formCaseId } = await import('./js/form-inbox.js');
      // what this device knows now (the inbox, its cases), kept for its pick-up below
      window.__formTwice = { entries: await cloud.listFormEntries(S.user.email), cases: S.cases.slice() };
      return formCaseId('2_FakeTwice');
    });
    const [id] = await Promise.all([pick(A), pick(B)]);   // both read the inbox before either picks up
    const commit = d => d.p.evaluate(async () => {
      const cloud = await import('./js/cloud.js'), { S } = await import('./js/ui-core.js'), { pickUp } = await import('./js/form-inbox.js');
      const { entries, cases } = window.__formTwice;
      return (await pickUp(cloud, S.user.email, entries, { cases: () => cases })).done;
    });
    assert.deepEqual(await commit(A), ['2_FakeTwice'], 'device A picks it up');
    await settle(A); await reopen(A);
    must(await act(A, { kind: 'edit', id, text: 'fake Form case, edited in the app' })); await settle(A);
    assert.deepEqual(await commit(B), [], 'device B finds it already picked up');
    await settle(B);
    assert.equal((await serverCases()).get(id), 'fake Form case, edited in the app', 'the app edit stays');
    return 'picked up once; the edit stays';
  },
  // a case logged offline reaches the server half an hour later: a device that synced meanwhile must still get it (it
  // reads only what changed since its last sync, less 10 minutes)
  async lateOffline(A, B) {
    await reopen(A); await reopen(B);
    await A.ctx.setOffline(true);
    await A.p.evaluate(() => { const real = Date.now; window.__realNow = real; Date.now = () => real() - 30 * 60e3; });
    must(await act(A, { kind: 'create', id: 'late1', text: 'fake case logged offline 30 min ago' }));
    await A.p.evaluate(() => { Date.now = window.__realNow; });
    must(await act(B, { kind: 'create', id: 'late2', text: 'fake case on B meanwhile' })); await settle(B); await reopen(B);
    await A.ctx.setOffline(false); await settle(A);
    assert.ok((await serverCases()).has('late1'), 'on the server');
    await reopen(B);
    assert.equal((await casesOn(B)).get('late1'), 'fake case logged offline 30 min ago', 'device B sees the late case');
    return 'late case reaches the other device';
  },
  // new app cases go to the response sheet's outbox (sheet-outbox.js), pasted ones too; an edit doesn't, and a case
  // deleted before the script picked it up is taken out again
  async sheetOutbox(A) {
    await reopen(A);
    await A.p.evaluate(async () => (await import('./js/sheet-outbox.js')).setOutboxOn(true));
    const outbox = async () => new Map((await topList('sheetOutbox')).map(d => [d.name.split('/').pop(), d.fields]));
    const until = async (fn, what) => { for (const t0 = Date.now(); !(await fn()); await A.p.waitForTimeout(200)) if (Date.now() - t0 > 15000) throw new Error('timed out: ' + what); };
    must(await act(A, { kind: 'create', id: 'sheet1', text: 'AB 34F fake case S1234567D for the sheet' }));
    await until(async () => (await outbox()).has('sheet1'), 'entry for sheet1');
    const f = (await outbox()).get('sheet1');
    assert.equal(f.rid.stringValue, 'R9'); assert.equal(f.email.stringValue, E);
    assert.doesNotMatch(f.details.stringValue, /S1234567D/, 'identifiers masked');
    // an edit changes nothing in the outbox
    must(await act(A, { kind: 'edit', id: 'sheet1', text: 'AB fake edit afterwards' })); await settle(A);
    assert.match((await outbox()).get('sheet1').details.stringValue, /for the sheet/, 'edits do not reach the sheet');
    // deleted before the script picked it up: the entry goes
    must(await act(A, { kind: 'delete', id: 'sheet1' }));
    await until(async () => !(await outbox()).has('sheet1'), 'entry for sheet1 removed');
    // a pasted list goes too
    await A.p.evaluate(async () => { const ui = await import('./js/ui-core.js'); const now = Date.now();
      await ui.saveMany([1, 2].map(i => ({ id: 'sheetp' + i, date: '2026-10-14', initials: 'EF', details: 'fake pasted ' + i, cats: ['08'], createdAt: now + i, updatedAt: now + i, source: 'paste' })), { sheet: true }); });
    await until(async () => (await outbox()).has('sheetp1') && (await outbox()).has('sheetp2'), 'pasted entries');
    // restoring a backup (saveMany without { sheet }) does not
    await A.p.evaluate(async () => { const ui = await import('./js/ui-core.js'); const now = Date.now();
      await ui.saveMany([{ id: 'sheetr1', date: '2026-10-14', initials: 'GH', details: 'fake restored', cats: ['08'], createdAt: now, updatedAt: now, source: 'app' }]); });
    await settle(A); await A.p.waitForTimeout(800);
    assert.ok(!(await outbox()).has('sheetr1'), 'a restore is not a new case');
    await A.p.evaluate(async () => (await import('./js/sheet-outbox.js')).setOutboxOn(false));
    must(await act(A, { kind: 'create', id: 'sheet2', text: 'fake case while it is off' })); await settle(A); await A.p.waitForTimeout(800);
    assert.ok(!(await outbox()).has('sheet2'), 'off: nothing queued');
    return 'queued, masked, edit ignored, removed on delete, paste yes, restore no, off';
  },
  // a reflection finished on B while A, offline, still shows the outline and moves it to the bin: back online the
  // delete is refused, B's text stays (on the server and on A), and no copy is left in the bin (audit, 14 Oct 2026)
  async reflectionBinStale(A, B) {
    const now = Date.now();
    await put(`logbooks/${E}/reflections/refl1`, { id: 'refl1', headingId: 'thyroid', initials: 'AB', title: 'Fake reflection', summary: 'outline', status: 'draft', createdAt: now, updatedAt: now });
    await reopen(A); await reopen(B);
    const summaryOn = d => d.p.evaluate(async () => (await import('./js/ui-core.js')).S.reflections.find(x => x.id === 'refl1')?.summary ?? null);
    for (const d of [A, B]) for (const t = Date.now(); (await summaryOn(d)) !== 'outline'; await d.p.waitForTimeout(150)) if (Date.now() - t > 15000) throw new Error(d.name + ' never showed the reflection');
    await A.ctx.setOffline(true);
    await B.p.evaluate(async () => { const { S, writes } = await import('./js/ui-core.js'); const r = S.reflections.find(x => x.id === 'refl1'); await writes.save('reflection', S.user.email, { ...r, summary: '900 finished words' }, r); });
    await settle(B);
    const ra = await A.p.evaluate(async () => {
      const { S } = await import('./js/ui-core.js'), bin = await import('./js/bin.js');
      try { await bin.moveToBin('reflection', S.reflections.find(x => x.id === 'refl1')); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
    });
    await A.ctx.setOffline(false); await settle(A); await A.p.waitForTimeout(1500); await settle(A);
    const server = (await list(E, 'reflections')).find(d => d.name.endsWith('/refl1'));
    assert.equal(server?.fields.summary?.stringValue, '900 finished words', 'B’s finished text is on the server');
    assert.equal((await list(E, 'bin')).filter(d => d.fields.data?.mapValue?.fields?.id?.stringValue === 'refl1').length, 0, 'no copy left in the bin');
    await reopen(A);
    assert.equal(await summaryOn(A), '900 finished words', 'A shows the finished text');
    return `delete ${ra.ok ? 'accepted offline, then refused' : 'refused: ' + ra.error}; finished text kept`;
  },
  // Restore from a backup writes only what the server lacks (cloud.addMissing: ids looked up 30 at a time), never the
  // backup's older copy over a case that is there; with no signal it says so and writes nothing
  async restoreAddsOnlyMissing(A) {
    // its own reflection on the server (not one an earlier scenario left), changed since the backup was made
    const stamp = Date.now();
    await put(`logbooks/${E}/reflections/reflKeep`, { id: 'reflKeep', headingId: 'thyroid', initials: 'AB', title: 'Fake reflection', summary: 'newer on the server', status: 'draft', createdAt: stamp, updatedAt: stamp });
    await reopen(A);
    const ids = [];
    for (let i = 0; i < 32; i++) ids.push(await seedCase('fake case: restore keeps ' + i));
    const r = await A.p.evaluate(async ids => {
      const cloud = await import('./js/cloud.js'), { S } = await import('./js/ui-core.js');
      const backup = [...ids, 'restored1'].map(id => ({ id, date: '2026-10-01', initials: 'AB', details: id === 'restored1' ? 'fake case only in the backup' : 'fake OLD backup copy', cats: ['08'], createdAt: 1, updatedAt: 1, source: 'app' }));
      const added = await cloud.addMissing(S.user.email, 'case', backup);
      const refl = await cloud.addMissing(S.user.email, 'reflection', [{ id: 'reflKeep', headingId: 'thyroid', initials: 'AB', title: 'Fake reflection', summary: 'old backup text', status: 'draft' },
        { id: 'reflR', headingId: 'thyroid', initials: 'AB', title: 'Fake restored', summary: 'only in the backup', status: 'draft' }]);
      return { added: added.map(c => c.id), refl: refl.map(x => x.id) };
    }, ids);
    await settle(A);
    assert.deepEqual(r.added, ['restored1']);
    const on = await serverCases();
    ids.forEach((id, i) => assert.equal(on.get(id), 'fake case: restore keeps ' + i, id + ' was written over'));
    assert.equal(on.get('restored1'), 'fake case only in the backup');
    const refls = new Map((await list(E, 'reflections')).map(d => [d.name.split('/').pop(), d.fields.summary?.stringValue]));
    assert.deepEqual(r.refl, ['reflR']);
    assert.equal(refls.get('reflKeep'), 'newer on the server', 'reflKeep was written over');
    assert.equal(refls.get('reflR'), 'only in the backup');
    await A.ctx.setOffline(true);
    const off = await A.p.evaluate(async () => {
      const cloud = await import('./js/cloud.js'), { S } = await import('./js/ui-core.js');
      try { await cloud.addMissing(S.user.email, 'case', [{ id: 'restored2', date: '2026-10-01', initials: 'AB', details: 'fake offline restore', cats: ['08'], createdAt: 1, updatedAt: 1, source: 'app' }]); return 'written'; }
      catch (e) { return e.message; }
    });
    await A.ctx.setOffline(false); await settle(A);
    assert.match(off, /no signal/);
    assert.ok(!(await serverCases()).has('restored2'), 'nothing written offline');
    return '1 of 33 cases and 1 of 2 reflections added; offline: ' + off.slice(0, 40);
  },
  // a reflection moved to the bin offline, then restored from the bin while still offline: it shows at once, and after
  // signal (the delete, then the restore) it is on the server and still shows here, also after reopening (the delete's
  // tombstone is older than the restored copy). Review, 15 Oct 2026: a blind restore was hidden here by that tombstone
  async reflectionBinRestoreOffline(A) {
    const now = Date.now();
    await put(`logbooks/${E}/reflections/reflRB`, { id: 'reflRB', headingId: 'thyroid', initials: 'AB', title: 'Fake bin restore', summary: 'keep me', status: 'draft', createdAt: now, updatedAt: now });
    await reopen(A);
    const shows = () => A.p.evaluate(async () => !!(await import('./js/ui-core.js')).S.reflections.find(x => x.id === 'reflRB'));
    for (const t = Date.now(); !(await shows()); await A.p.waitForTimeout(150)) if (Date.now() - t > 15000) throw new Error('reflRB never showed');
    await A.ctx.setOffline(true);
    const r = await A.p.evaluate(async () => {
      const { S } = await import('./js/ui-core.js'), bin = await import('./js/bin.js');
      const e = await bin.moveToBin('reflection', S.reflections.find(x => x.id === 'reflRB'));
      const back = await bin.restoreFromBin(e.id);
      return { back: back.id, listed: !!S.reflections.find(x => x.id === 'reflRB') };
    });
    await A.ctx.setOffline(false); await settle(A); await A.p.waitForTimeout(3000); await settle(A);
    const server = (await list(E, 'reflections')).some(d => d.name.endsWith('/reflRB'));
    const binLeft = (await list(E, 'bin')).filter(d => d.fields.data?.mapValue?.fields?.id?.stringValue === 'reflRB').length;
    const listedAfter = await shows();
    await reopen(A);
    for (const t = Date.now(); !(await shows()); await A.p.waitForTimeout(150)) if (Date.now() - t > 8000) break;
    const listedReopen = await shows();
    const msg = `restored as ${r.back}; listed at once: ${r.listed}; on the server: ${server}; bin copies: ${binLeft}; listed after: ${listedAfter}; after reopening: ${listedReopen}`;
    assert.ok(r.back === 'reflRB' && r.listed && server && !binLeft && listedAfter && listedReopen, msg);
    return msg;
  },
  // the same with flaky signal (the browser says online, the server can't be reached): the queued delete must not run
  // after the restore and delete the restored copy (review, 15 Oct 2026: it did, with the bin entry already gone)
  async reflectionBinRestoreFlaky(A) {
    const now = Date.now();
    await put(`logbooks/${E}/reflections/reflRF`, { id: 'reflRF', headingId: 'thyroid', initials: 'AB', title: 'Fake bin restore flaky', summary: 'keep me', status: 'draft', createdAt: now, updatedAt: now });
    await reopen(A);
    const shows = () => A.p.evaluate(async () => !!(await import('./js/ui-core.js')).S.reflections.find(x => x.id === 'reflRF'));
    for (const t = Date.now(); !(await shows()); await A.p.waitForTimeout(150)) if (Date.now() - t > 15000) throw new Error('reflRF never showed');
    const block = r => r.abort('internetdisconnected');
    await A.ctx.route(`http://127.0.0.1:${FS}/**`, block);
    const r = await A.p.evaluate(async () => {
      const { S } = await import('./js/ui-core.js'), bin = await import('./js/bin.js');
      const e = await bin.moveToBin('reflection', S.reflections.find(x => x.id === 'reflRF'));
      const back = await bin.restoreFromBin(e.id);
      return { back: back.id, listed: !!S.reflections.find(x => x.id === 'reflRF') };
    });
    await A.p.waitForTimeout(8000);
    await A.ctx.unroute(`http://127.0.0.1:${FS}/**`, block);
    const q = () => A.p.evaluate(async () => (await import('./js/writes.js')).writes.entries().filter(j => j.record.id === 'reflRF').map(j => j.state + (j.record._deleted ? ':delete' : ':save')));
    for (const t = Date.now(); (await q()).some(x => x.startsWith('pending')); await A.p.waitForTimeout(500)) if (Date.now() - t > 90000) break;
    await A.p.waitForTimeout(3000);
    const server = (await list(E, 'reflections')).some(d => d.name.endsWith('/reflRF'));
    const binLeft = (await list(E, 'bin')).filter(d => d.fields.data?.mapValue?.fields?.id?.stringValue === 'reflRF').length;
    const msg = `listed at once: ${r.listed}; on the server: ${server}; bin copies: ${binLeft}; listed after: ${await shows()}; queue: ${(await q()).join(', ')}`;
    assert.ok(r.listed && server && await shows(), msg);
    return msg;
  },
  // signing out with unsent work asks first; Cancel keeps it and it lands later; "Sign out anyway" leaves nothing for the
  // next account on the device
  async signOut(A) {
    await reopen(A);
    await A.ctx.setOffline(true);
    must(await act(A, { kind: 'create', id: 'unsent1', text: 'fake unsent case 1' }));
    await A.p.evaluate(() => { location.hash = '#more'; });
    await A.p.getByRole('button', { name: 'Sign out' }).click();
    const dialog = A.p.getByRole('dialog').filter({ hasText: 'Not synced yet' });
    await dialog.waitFor({ timeout: 10000 });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await A.ctx.setOffline(false); await settle(A);
    assert.equal((await serverCases()).get('unsent1'), 'fake unsent case 1', 'kept after Cancel and landed once back online');
    await A.ctx.setOffline(true);
    must(await act(A, { kind: 'create', id: 'unsent2', text: 'fake unsent case 2' }));
    await A.p.getByRole('button', { name: 'Sign out' }).click();
    await dialog.waitFor({ timeout: 10000 });
    await dialog.getByRole('button', { name: 'Sign out anyway' }).click();
    await A.ctx.setOffline(false);
    await signIn(A.p, OTHER);
    const leaked = [...(await casesOn(A)).keys()], queue = await jobs(A);
    assert.deepEqual(leaked, [], 'the next account sees none of the last one\'s cases');
    assert.deepEqual(queue, [], 'and none of its unsent changes');
    assert.equal((await serverCases(OTHER)).size, 0, 'nothing was written to the next account');
    await A.p.evaluate(async () => (await import('./js/cloud.js')).signOut());
    await signIn(A.p, E);
    return 'asks first; Cancel keeps; no leak to the next account';
  },
};

const results = [];
try {
  const A = await device('device A'), B = await device('device B');
  for (const [name, fn] of Object.entries(scenarios)) {
    if (ONLY && !ONLY.split(',').includes(name)) continue;
    try { results.push([name, true, await fn(A, B)]); }
    catch (e) {
      const screen = await A.p.evaluate(() => document.querySelector('main, #app')?.innerText.replace(/\s+/g, ' ').slice(0, 200)).catch(() => '?');
      results.push([name, false, `${e.message.split('\n')[0]} (device A shows: ${screen})\n    console: ${A.log.slice(-6).join('\n    ')}`]);
    }
    // a scenario that failed half-way leaves conflicts: clear them so the next starts clean
    await Promise.all([A, B].map(async d => { await d.ctx.setOffline(false); await d.p.evaluate(async () => { const { writes } = await import('./js/writes.js'); const left = writes.entries().filter(j => j.state !== 'synced' && j.state !== 'archived'); for (const j of left) if (left.some(x => x.record.id === j.record.id && (x.state === 'conflict' || x.state === 'failed'))) await writes.archive(j.key); }).catch(() => {}); }));
    const [name2, ok, note] = results.at(-1);
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name2}: ${note}`);
  }
  const bad = results.filter(r => !r[1]);
  assert.deepEqual(errors, []);
  if (bad.length) throw new Error(`${bad.length} scenario${bad.length === 1 ? '' : 's'} failed: ${bad.map(r => r[0]).join(', ')}`);
  console.log('PASS multidevice conflicts');
} catch (e) {
  console.log(`FAIL multidevice conflicts: ${e.message}`);
  if (errors.length) console.log('  errors: ' + errors.join('\n  '));
  process.exitCode = 1;
} finally { await b.close(); }
