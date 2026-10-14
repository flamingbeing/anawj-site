// Many devices, one account, against the real rules (Firestore and Auth emulators, demo project, fake account): each
// round, every device does a random action at the same moment (log, edit, delete one, delete several, restore from the
// recycle bin) on cases no other device touches that round; then every device reopens and must show exactly what the
// server holds, and every action that said it worked must be on the server (a delete gone, an edit's text there).
// Run by tools/test-multidevice.sh. Env: DEVICES (5), ROUNDS (8), SEED (random), BROWSER (chromium|webkit|firefox),
// SLOW=1 (Chromium only: throttled network, about slow 3G).
// Written 14 Oct 2026 after a single delete never reached the server (PLAN-go-live-bugfix.md).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const pw = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const PORT = process.env.PORT || 8080, FS = process.env.READS_FS_PORT || 8087, AUTH = process.env.READS_AUTH_PORT || 9097;
const SDK_DIR = process.env.SDK_DIR || `${process.env.HOME}/.cache/anawj-rules/node_modules/firebase`;
const BASE = `http://localhost:${PORT}/logbook/?emulator=${FS}:${AUTH}`;
const DEVICES = Number(process.env.DEVICES) || 5, ROUNDS = Number(process.env.ROUNDS) || 8;
const SEED = Number(process.env.SEED) || Math.floor(Math.random() * 1e9);
const BROWSER = process.env.BROWSER || 'chromium', SLOW = process.env.SLOW === '1';
const E = 'fake.multi@example.com';
const DB = `http://127.0.0.1:${FS}/v1/projects/demo-logbook/databases/(default)/documents`;
const H = { Authorization: 'Bearer owner', 'content-type': 'application/json' };
console.log(`multidevice: ${DEVICES} devices, ${ROUNDS} rounds, seed ${SEED}, ${BROWSER}${SLOW ? ', slow network' : ''}`);

// seeded random (mulberry32), so a failing run can be repeated with SEED=…
let s = SEED >>> 0;
const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = list => list[Math.floor(rnd() * list.length)];

// ---- the server's copy (REST, "Bearer owner" skips the rules) ----
const val = v => Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : typeof v === 'number' ? { integerValue: String(v) } : v === null ? { nullValue: null } : { stringValue: String(v) };
async function put(path, doc) {
  const r = await fetch(`${DB}/${path}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, val(v)])) }) });
  if (!r.ok) throw new Error(`seed ${path}: ${r.status}`);
}
async function serverCases() {
  const out = new Map();
  let token = '';
  do {
    const r = await (await fetch(`${DB}/logbooks/${E}/cases?pageSize=300${token ? '&pageToken=' + token : ''}`, { headers: H })).json();
    for (const d of r.documents || []) out.set(d.name.split('/').pop(), d.fields.details?.stringValue ?? '');
    token = r.nextPageToken || '';
  } while (token);
  return out;
}
await fetch(`http://127.0.0.1:${FS}/emulator/v1/projects/demo-logbook/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:${AUTH}/emulator/v1/projects/demo-logbook/accounts`, { method: 'DELETE' });
const old = Date.now() - 2 * 864e5;
await put(`logbooks/${E}`, { email: E, name: 'Fake Multi', rid: null, updatedAt: old });
for (let i = 0; i < 12; i++) await put(`logbooks/${E}/cases/seed${i}`, { id: 'seed' + i, date: '2026-10-01', initials: 'AB', details: `fake seed case ${i}`, cats: ['08'], createdAt: old, updatedAt: old, source: 'app' });

// ---- the devices: one browser profile each (own IndexedDB, own sign-in) ----
const b = await pw[BROWSER].launch(BROWSER === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const errors = [];
async function device(n) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route(/https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z]+\.js)$/, r => {
    const file = r.request().url().split('/').pop();
    r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(`${SDK_DIR}/${file}`, 'utf8').replace(/firebasejs\/[\d.]+\//g, 'firebasejs/10.12.2/') });
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`device ${n}: ${e.message}`));
  if (SLOW && BROWSER === 'chromium') {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50000, uploadThroughput: 25000 });
  }
  await p.goto(BASE + '#logbook');
  await p.getByRole('button', { name: 'Sign in with Google' }).waitFor({ timeout: 30000 });
  await p.evaluate(async e => (await import('./js/cloud.js')).emulatorSignIn(e), E);
  await synced(p);
  return { n, p };
}
async function synced(p, timeout = 60000) {
  for (const t = Date.now(); !(await p.evaluate(async () => (await import('./js/ui-core.js')).S.casesSynced).catch(() => false)); await p.waitForTimeout(150))
    if (Date.now() - t > timeout) throw new Error('never synced');
}
const ids = p => p.evaluate(async () => (await import('./js/ui-core.js')).S.cases.map(c => [c.id, c.details]));

// one action in the page; returns { kind, id(s), ok, error }
const act = (p, a) => p.evaluate(async a => {
  const ui = await import('./js/ui-core.js'), bin = await import('./js/bin.js'), cloud = await import('./js/cloud.js');
  const find = id => ui.S.cases.find(c => c.id === id);
  try {
    if (a.kind === 'create') { const c = await ui.createCase({ id: a.id, date: '2026-10-14', details: a.text, initials: 'CD', cats: ['08'] }); return { ...a, ok: true, id: c.id }; }
    if (a.kind === 'edit') { const c = find(a.id); if (!c) return { ...a, ok: false, error: 'not here' }; await ui.updateCase({ ...c, details: a.text }); return { ...a, ok: true }; }
    if (a.kind === 'delete') { const c = find(a.id); if (!c) return { ...a, ok: false, error: 'not here' }; await bin.moveToBin('case', c); return { ...a, ok: true }; }
    if (a.kind === 'deleteMany') { const cs = a.ids.map(find).filter(Boolean); if (cs.length < a.ids.length) return { ...a, ok: false, error: 'not here' }; await bin.moveToBin('case', cs); return { ...a, ok: true }; }
    if (a.kind === 'restore') {
      const e = (await cloud.listBin(ui.mine ? ui.mine() : ui.S.user.email)).find(x => x.kind === 'case' && x.data && x.data.id === a.id);
      if (!e) return { ...a, ok: false, error: 'not in the bin' };
      const out = await bin.restoreFromBin(e.id); return { ...a, ok: true, id: out.id, restoredFrom: a.id };
    }
  } catch (err) { return { ...a, ok: false, error: err.message }; }
}, a);

try {
  const devs = [];
  for (let i = 0; i < DEVICES; i++) devs.push(await device(i + 1));
  const binned = [];   // ids deleted earlier (candidates to restore)
  const ledger = new Map();   // id -> { gone: bool, text } from the last action that said it worked
  let made = 0;
  for (let round = 1; round <= ROUNDS; round++) {
    // what's live now (from device 1's view, which every device must agree with at the end of the last round)
    const live = (await ids(devs[0].p)).map(([id]) => id);
    const taken = new Set();
    const free = () => { const left = live.filter(id => !taken.has(id)); if (!left.length) return null; const id = pick(left); taken.add(id); return id; };
    const plan = devs.map(d => {
      const r = rnd();
      if (r < 0.35 || live.length < 6) return { kind: 'create', id: `r${round}d${d.n}x${++made}`, text: `fake case r${round} d${d.n}` };
      if (r < 0.6) { const id = free(); return id ? { kind: 'edit', id, text: `fake edit r${round} d${d.n}` } : { kind: 'create', id: `r${round}d${d.n}x${++made}`, text: 'fake' }; }
      if (r < 0.8) { const id = free(); return id ? { kind: 'delete', id } : { kind: 'create', id: `r${round}d${d.n}x${++made}`, text: 'fake' }; }
      if (r < 0.92) { const a1 = free(), a2 = free(); return a1 && a2 ? { kind: 'deleteMany', ids: [a1, a2] } : { kind: 'create', id: `r${round}d${d.n}x${++made}`, text: 'fake' }; }
      const back = binned.filter(id => !taken.has(id) && !live.includes(id));
      if (!back.length) return { kind: 'create', id: `r${round}d${d.n}x${++made}`, text: 'fake' };
      const id = pick(back); taken.add(id); return { kind: 'restore', id };
    });
    const results = await Promise.all(devs.map((d, i) => act(d.p, plan[i])));
    for (const r of results) {
      if (!r.ok) { if (r.error !== 'not here') errors.push(`round ${round}: ${r.kind} ${r.id || r.ids} said: ${r.error}`); continue; }
      if (r.kind === 'create' || r.kind === 'edit') ledger.set(r.id, { gone: false, text: r.text });
      if (r.kind === 'delete') { ledger.set(r.id, { gone: true }); binned.push(r.id); }
      if (r.kind === 'deleteMany') for (const id of r.ids) { ledger.set(id, { gone: true }); binned.push(id); }
      if (r.kind === 'restore') { ledger.set(r.id, { gone: false }); binned.splice(binned.indexOf(r.restoredFrom), 1); }
    }
    // let the writes land, then every device reopens (as after sign-in on a phone left in a pocket)
    await Promise.all(devs.map(d => d.p.evaluate(async () => (await import('./js/cloud.js')).syncFlush()).catch(() => {})));
    await new Promise(r => setTimeout(r, 1500));
    await Promise.all(devs.map(async d => { await d.p.reload(); await synced(d.p); }));
    await new Promise(r => setTimeout(r, 800));
    const server = await serverCases();
    for (const [id, want] of ledger) {
      if (want.gone) assert.ok(!server.has(id), `round ${round}: ${id} was deleted (said OK) but is still on the server`);
      else { assert.ok(server.has(id), `round ${round}: ${id} said OK but is missing on the server`); if (want.text) assert.equal(server.get(id), want.text, `round ${round}: ${id} has the wrong text on the server`); }
    }
    for (const d of devs) {
      const mine = new Map(await ids(d.p));
      const extra = [...mine.keys()].filter(id => !server.has(id)), missing = [...server.keys()].filter(id => !mine.has(id));
      const stale = [...mine].filter(([id, t]) => server.has(id) && server.get(id) !== t).map(([id]) => id);
      assert.deepEqual({ extra, missing, stale }, { extra: [], missing: [], stale: [] }, `round ${round}: device ${d.n} differs from the server`);
    }
    console.log(`  round ${round}: ${results.map(r => r.kind + (r.ok ? '' : '✗')).join(', ')} — ${server.size} cases, all ${DEVICES} devices agree`);
  }
  assert.deepEqual(errors, []);
  console.log(`PASS multidevice (seed ${SEED})`);
} catch (e) {
  console.log(`FAIL multidevice (seed ${SEED}): ${e.message}`);
  if (errors.length) console.log('  errors: ' + errors.join('\n  '));
  process.exitCode = 1;
} finally { await b.close(); }
