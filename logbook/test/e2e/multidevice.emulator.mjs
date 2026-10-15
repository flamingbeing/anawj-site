// Many devices, one account, against the real rules (Firestore and Auth emulators, demo project, fake account): each
// round, every device does a random action at the same moment (log, edit, delete one, delete several, restore from the
// recycle bin) on cases no other device touches that round; then every device reopens and must show exactly what the
// server holds, and every action that said it worked must be on the server (a delete gone, an edit's text there).
// Devices drop off the network at random (OFFLINE, default on): one offline keeps working (logs, edits, deletes on cases
// only it touches until it's back), isn't compared while offline, and everything it said it saved must reach the server
// once it reconnects.
// Run by tools/test-multidevice.sh. Env: DEVICES (5), ROUNDS (8), SEED (random), BROWSER (chromium|webkit|firefox),
// SLOW=1 (Chromium only: throttled network, about slow 3G), OFFLINE=0 (all devices stay online).
// Written 14 Oct 2026 after a single delete never reached the server (PLAN-go-live-bugfix.md).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const pw = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const PORT = process.env.PORT || 8080, FS = process.env.READS_FS_PORT || 8087, AUTH = process.env.READS_AUTH_PORT || 9097;
const SDK_DIR = process.env.SDK_DIR || `${process.env.HOME}/.cache/anawj-rules/node_modules/firebase`;
// the page on 127.0.0.1 like the emulators: WebKit blocks localhost → 127.0.0.1 ("access control checks")
const BASE = `http://127.0.0.1:${PORT}/logbook/?emulator=${FS}:${AUTH}`;
const DEVICES = Number(process.env.DEVICES) || 5, ROUNDS = Number(process.env.ROUNDS) || 8;
const SEED = Number(process.env.SEED) || Math.floor(Math.random() * 1e9);
const BROWSER = process.env.BROWSER || 'chromium', SLOW = process.env.SLOW === '1', OFFLINE = process.env.OFFLINE !== '0';
const E = 'fake.multi@example.com';
const DB = `http://127.0.0.1:${FS}/v1/projects/demo-logbook/databases/(default)/documents`;
const H = { Authorization: 'Bearer owner', 'content-type': 'application/json' };
console.log(`multidevice: ${DEVICES} devices, ${ROUNDS} rounds, seed ${SEED}, ${BROWSER}${SLOW ? ', slow network' : ''}${OFFLINE ? ', devices go offline' : ''}`);

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
  let cdp = null;
  if (SLOW && BROWSER === 'chromium') {
    cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.emulateNetworkConditions', SLOW_NET(false));
  }
  await p.goto(BASE + '#logbook');
  await p.getByRole('button', { name: 'Sign in with Google' }).waitFor({ timeout: 30000 });
  await p.evaluate(async e => (await import('./js/cloud.js')).emulatorSignIn(e), E);
  await synced(p);
  return { n, p, ctx, cdp, offline: false, held: new Set() };
}
// the slow network's own DevTools session keeps its conditions (offline: false) after ctx.setOffline(true): the page
// then reads navigator.onLine false (the save queue waits) while Firestore's open connection still reaches the server,
// a state no real phone is in (seed 419136196). Going offline therefore cuts that session too.
const SLOW_NET = offline => ({ offline, latency: 400, downloadThroughput: 50000, uploadThroughput: 25000 });
async function setOffline(d, offline) {
  await d.ctx.setOffline(offline);
  if (d.cdp) await d.cdp.send('Network.emulateNetworkConditions', SLOW_NET(offline));
  d.offline = offline;
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

async function explain(id) {
  const jobs = await Promise.all(allDevs.map(async d => [d.n, await d.p.evaluate(async id => (await import('./js/writes.js')).writes.entries().filter(j => j.record.id === id).map(j => `${j.record._deleted ? 'delete' : 'save'}:${j.state}${j.error ? ' (' + j.error + ')' : ''}`), id).catch(() => '?')]));
  return `  history: ${history.filter(h => h[4].split('+').includes(id)).map(h => `r${h[0]} d${h[1]}${h[2] ? '⊘' : ''} ${h[3]} ${h[5] ? 'ok' : 'ERR ' + h[6]}`).join(' | ')}\n  queues: ${jobs.map(([n, j]) => `d${n}: ${JSON.stringify(j)}`).join(' ')}`;
}
async function check(round, devs) {
  const server = await serverCases();
  for (const [id, want] of ledger) {
    const bad = want.gone ? (server.has(id) ? 'was deleted (said OK) but is still on the server' : '')
      : !server.has(id) ? 'said OK but is missing on the server' : want.text && server.get(id) !== want.text ? `has "${server.get(id)}" on the server, not "${want.text}"` : '';
    if (bad) throw new Error(`round ${round}: ${id} ${bad}\n${await explain(id)}`);
  }
  for (const d of devs) {
    const mine = new Map(await ids(d.p));
    const extra = [...mine.keys()].filter(id => !server.has(id)), missing = [...server.keys()].filter(id => !mine.has(id));
    const stale = [...mine].filter(([id, t]) => server.has(id) && server.get(id) !== t).map(([id]) => id);
    if (extra.length || missing.length || stale.length) {
      const odd = [...extra, ...missing, ...stale];
      throw new Error(`round ${round}: device ${d.n} differs from the server: ${JSON.stringify({ extra, missing, stale })}\n${(await Promise.all(odd.slice(0, 3).map(explain))).join('\n')}`);
    }
  }
}
const history = [];   // [round, device, offline, kind, ids, ok, error] for failure reports
const ledger = new Map();   // id -> { gone, text } from the last action that said it worked (offline: once back online)
const binned = [];   // ids deleted earlier (candidates to restore)

let allDevs = [];
try {
  const devs = [];
  for (let i = 0; i < DEVICES; i++) devs.push(await device(i + 1));
  allDevs = devs;
  let made = 0, conflicts = 0;
  const held = () => new Set(devs.flatMap(d => [...d.held]));   // cases an offline device has touched: nobody else's
  const pending = [];   // { dev, r } said OK while that device was offline: checked once it is back
  const record = r => {
    if (r.kind === 'create' || r.kind === 'edit') ledger.set(r.id, { gone: false, text: r.text });
    if (r.kind === 'delete') { ledger.set(r.id, { gone: true }); binned.push(r.id); }
    if (r.kind === 'deleteMany') for (const id of r.ids) { ledger.set(id, { gone: true }); binned.push(id); }
    if (r.kind === 'restore') { ledger.set(r.id, { gone: false }); binned.splice(binned.indexOf(r.restoredFrom), 1); }
  };
  // an offline change that met a change made elsewhere meanwhile becomes a conflict when it lands: the app keeps both
  // versions (Recent changes) and the header must say "Save needs attention". Anything else must have landed.
  // each case's latest save-queue entry on a device: [state, error]
  const latest = async d => new Map((await d.p.evaluate(async () => (await import('./js/writes.js')).writes.entries().map(j => [j.record.id, j.state, j.error || ''])))
    .reverse().map(([id, st, err]) => [id, [st, err]]));
  // a delete that met a change made elsewhere is undone (bin.js rollBack: the other version stays, the job is set aside,
  // a toast says so): it lost, as a conflict does, and the header has nothing left to flag
  const isUndone = ([st, err] = []) => st === 'archived' && /changed elsewhere/.test(err);
  async function land(d, items, round) {
    let states = await latest(d);
    const failed = [...states].filter(([, [st]]) => st === 'failed');
    if (failed.length) errors.push(`round ${round}: device ${d.n} has failed saves after reconnecting: ${failed.map(([id]) => id).join(', ')}`);
    const conflicted = new Set([...states].filter(([, [st]]) => st === 'conflict').map(([id]) => id));
    if (conflicted.size) {
      await d.p.waitForTimeout(300);
      states = await latest(d);
      const header = await d.p.evaluate(() => document.querySelector('a.sync')?.textContent || '');
      if ([...states.values()].some(([st]) => st === 'conflict') && !/needs attention/i.test(header)) errors.push(`round ${round}: device ${d.n} has conflicts but the header says "${header}"`);
    }
    for (const x of items) {
      const hit = (x.r.ids || [x.r.id]).filter(id => conflicted.has(id) || isUndone(states.get(id)));
      if (hit.length) { conflicts += hit.length; for (const id of hit) ledger.delete(id); if (x.r.ids) { for (const id of x.r.ids.filter(id => !hit.includes(id))) { ledger.set(id, { gone: true }); binned.push(id); } } }
      else record(x.r);
    }
  }
  // an edit on a device just back online can be accepted (saved here) and only meet the change made elsewhere when it
  // drains: a conflict, kept in Recent changes, as for an offline device (seed 419136196). On a device that was already
  // up to date it would be a real fault.
  async function conflictedOnline(d, r) {
    const st = (await latest(d)).get(r.id);
    if (!st || st[0] !== 'conflict') return;
    if (d.stale) { conflicts++; ledger.delete(r.id); }
    else errors.push(`round ${r.round}: device ${d.n} edit ${r.id} met a conflict on a device that was up to date`);
  }
  // an online device's delete can be undone the same way, once it lands (a change made elsewhere reached the server first)
  async function undoneOnline(d, r) {
    const states = await latest(d);
    for (const id of (r.ids || [r.id]).filter(id => isUndone(states.get(id)))) { conflicts++; ledger.delete(id); if (binned.includes(id)) binned.splice(binned.indexOf(id), 1); }
  }
  async function reconnect(d) {
    await setOffline(d, false); d.stale = true;
    await d.p.evaluate(async () => { await (await import('./js/writes.js')).writes.flush(8000); await (await import('./js/cloud.js')).syncFlush(); }).catch(() => {});
  }
  for (let round = 1; round <= ROUNDS; round++) {
    // devices drop off or come back (never all offline: device 1 stays online as the reference)
    const back = [];
    if (OFFLINE) for (const d of devs.slice(1)) {
      if (!d.offline && rnd() < 0.25) await setOffline(d, true);
      else if (d.offline && rnd() < 0.5) { await reconnect(d); back.push(d); }
    }
    const live = (await ids(devs[0].p)).map(([id]) => id);
    const taken = held();
    const freeFor = (list) => { const left = list.filter(id => !taken.has(id)); if (!left.length) return null; const id = pick(left); taken.add(id); return id; };
    const plan = await Promise.all(devs.map(async d => {
      const pool = d.offline ? (await ids(d.p)).map(([id]) => id).filter(id => live.includes(id)) : live;
      const mk = () => ({ kind: 'create', id: `r${round}d${d.n}x${++made}`, text: `fake case r${round} d${d.n}${d.offline ? ' offline' : ''}` });
      const r = rnd();
      if (r < 0.35 || pool.length < 6) return mk();
      if (r < 0.6) { const id = freeFor(pool); return id ? { kind: 'edit', id, text: `fake edit r${round} d${d.n}${d.offline ? ' offline' : ''}` } : mk(); }
      if (r < 0.8) { const id = freeFor(pool); return id ? { kind: 'delete', id } : mk(); }
      if (r < 0.92) { const a1 = freeFor(pool), a2 = freeFor(pool); return a1 && a2 ? { kind: 'deleteMany', ids: [a1, a2] } : mk(); }
      if (d.offline) return mk();   // the recycle bin is read from the server
      const backIds = binned.filter(id => !taken.has(id) && !live.includes(id));
      if (!backIds.length) return mk();
      const id = pick(backIds); taken.add(id); return { kind: 'restore', id };
    }));
    const results = await Promise.all(devs.map((d, i) => act(d.p, plan[i])));
    results.forEach((r, i) => history.push([round, devs[i].n, devs[i].offline, r.kind, (r.ids || [r.id]).join('+'), r.ok, r.error || '']));
    // a delete of several cases where one met a change made elsewhere (entries() lists the newest job first): that one is kept (and the action says so), the
    // others were deleted (moved to the bin) all the same (seed 76343995)
    const doneIds = await Promise.all(results.map((r, i) => !r.ok && r.kind === 'deleteMany' && /changed elsewhere/.test(r.error)
      ? devs[i].p.evaluate(async ids => { const w = (await import('./js/writes.js')).writes.entries();
        return ids.filter(id => { const j = w.find(x => x.record.id === id); return j && j.record._deleted && j.state === 'synced'; }); }, r.ids).catch(() => [])
      : []));
    results.forEach((r, i) => {
      const d = devs[i];
      for (const id of doneIds[i]) { if (d.offline) d.held.add(id); else { ledger.set(id, { gone: true }); binned.push(id); } }
      // a device that was offline may act on a case changed elsewhere before its copy caught up: the app refuses and keeps
      // both versions (Recent changes). That's the right outcome, as long as it says so (it did: r.ok is false).
      if (!r.ok && /changed elsewhere/.test(r.error) && (d.offline || d.stale)) { conflicts++; return; }
      if (!r.ok) { if (r.error !== 'not here') errors.push(`round ${round}: device ${d.n}${d.offline ? ' (offline)' : ''} ${r.kind} ${r.id || r.ids} said: ${r.error}`); return; }
      if (d.offline) { for (const id of r.ids || [r.id]) d.held.add(id); pending.push({ dev: d, r }); }
      else record(r);
    });
    // what offline devices did lands once they're back
    for (const d of back) await land(d, pending.filter(x => x.dev === d), round);
    pending.splice(0, pending.length, ...pending.filter(x => !back.includes(x.dev)));
    // let the writes land, then every online device reopens (as after sign-in on a phone left in a pocket)
    const online = devs.filter(d => !d.offline);
    await Promise.all(online.map(d => d.p.evaluate(async () => (await import('./js/cloud.js')).syncFlush()).catch(() => {})));
    await Promise.all(online.map(d => d.p.evaluate(async () => (await import('./js/writes.js')).writes.flush(8000)).catch(() => {})));
    for (const [i, r] of results.entries()) if (r.ok && /^delete/.test(r.kind) && !devs[i].offline) await undoneOnline(devs[i], r);
    for (const [i, r] of results.entries()) if (r.ok && r.kind === 'edit' && !devs[i].offline) await conflictedOnline(devs[i], { ...r, round });
    await new Promise(r => setTimeout(r, 2000));
    await Promise.all(online.map(async d => { await d.p.reload(); await synced(d.p); }));
    for (const d of back) d.held.clear();
    for (const d of online) d.stale = false;
    await new Promise(r => setTimeout(r, 800));
    await check(round, online);
    console.log(`  round ${round}: ${results.map((r, i) => (devs[i].offline ? '⊘' : '') + r.kind + (r.ok ? '' : '✗')).join(', ')}${back.length ? ` (back online: ${back.map(d => d.n).join(', ')})` : ''} — all ${online.length} online devices agree`);
  }
  // everyone back online: nothing said OK offline may be missing
  const last = devs.filter(d => d.offline);
  for (const d of last) await reconnect(d);
  for (const d of last) await land(d, pending.filter(x => x.dev === d), 'end');
  for (const d of devs) d.held.clear();
  await new Promise(r => setTimeout(r, 2000));
  await Promise.all(devs.map(async d => { await d.p.reload(); await synced(d.p); }));
  await new Promise(r => setTimeout(r, 800));
  await check('end', devs);
  console.log(`  end: all ${DEVICES} devices online and agree${conflicts ? ` (${conflicts} reported conflict${conflicts === 1 ? '' : 's'} from devices back online, kept in Recent changes)` : ''}`);
  assert.deepEqual(errors, []);
  console.log(`PASS multidevice (seed ${SEED})`);
} catch (e) {
  console.log(`FAIL multidevice (seed ${SEED}): ${e.message}`);
  if (errors.length) console.log('  errors: ' + errors.join('\n  '));
  process.exitCode = 1;
} finally { await b.close(); }
