// Fake data and fake GitHub / Dropbox / Google Drive only (page routes; nothing leaves the machine). Settings → Sync
// and the Logbook tab's Sync button: one Markdown file per day, only changed days sent, the user's text around the
// block kept, edits inside it merged, a write that lost a race read again and merged, the GitHub token kept on the
// device only, Drive and Dropbox through their sign-in and back, and ID numbers asked about once.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'Dropbox-API-Result' };
const json = (route, body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { ...CORS, ...headers }, body: JSON.stringify(body) });
const preflight = route => route.request().method() === 'OPTIONS' && (route.fulfill({ status: 204, headers: CORS }), true);
const START_RE = /<!-- logbook:start fp=[\w.]+ -->/, END = '<!-- logbook:end -->';
const md5 = t => createHash('md5').update(t).digest('hex');

try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));

  // ---- fake GitHub: files by path, a sha per version; an old sha is refused (409) ----
  const gh = new Map(), ghLog = [];
  let ghN = 0, ghRace = '', ghLimit = false;   // ghLimit: GitHub refuses writes as over its secondary rate limit   // ghRace: a path someone else writes to just before our next PUT to it
  await ctx.route('https://api.github.com/**', async route => {
    if (preflight(route)) return;
    const req = route.request(), u = new URL(req.url());
    assert.equal(req.headers().authorization, 'Bearer FAKE_GH_TOKEN');
    const m = /^\/repos\/fake-user\/fake-notes\/contents\/(.+)$/.exec(u.pathname);
    if (!m) return json(route, { message: 'Not Found' }, 404);
    const path = m[1].split('/').map(decodeURIComponent).join('/');
    if (req.method() === 'GET') {
      assert.equal(u.searchParams.get('ref'), 'main');
      const f = gh.get(path);
      if (!f) return json(route, { message: 'Not Found' }, 404);
      return json(route, { type: 'file', encoding: 'base64', sha: f.sha, content: Buffer.from(f.text).toString('base64').replace(/.{60}/g, '$&\n') });
    }
    if (ghLimit) return json(route, { message: 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.' }, 403);
    const body = JSON.parse(req.postData());
    ghLog.push({ path, sha: body.sha || null });
    assert.equal(body.branch, 'main');
    if (ghRace === path) { ghRace = ''; const f = gh.get(path); gh.set(path, { text: f.text + 'a line from another device\n', sha: 'g' + ++ghN }); }
    const f = gh.get(path);
    if (f && !body.sha) return json(route, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' }, 422);
    if (f && body.sha !== f.sha) return json(route, { message: 'does not match' }, 409);
    gh.set(path, { text: Buffer.from(body.content, 'base64').toString('utf8'), sha: 'g' + ++ghN });
    return json(route, { content: { sha: gh.get(path).sha } }, f ? 200 : 201);
  });

  // ---- fake Dropbox: sign-in, download (with its rev), upload in add / update mode ----
  const dbx = new Map(), dbxLog = [];
  let dbxN = 0;
  await ctx.route('https://www.dropbox.com/oauth2/authorize?*', route => {
    const q = new URL(route.request().url()).searchParams;
    route.fulfill({ status: 302, headers: { location: `${q.get('redirect_uri')}?code=FAKECODE&state=${q.get('state')}` } });
  });
  await ctx.route('https://api.dropboxapi.com/oauth2/token', route => json(route, { access_token: 'DBX', expires_in: 14400 }));
  await ctx.route('https://content.dropboxapi.com/**', route => {
    if (preflight(route)) return;
    const req = route.request(), arg = JSON.parse(req.headers()['dropbox-api-arg']);
    assert.equal(req.headers().authorization, 'Bearer DBX');
    if (req.url().endsWith('/files/download')) {
      const f = dbx.get(arg.path);
      if (!f) return json(route, { error_summary: 'path/not_found/..' }, 409);
      return route.fulfill({ status: 200, contentType: 'application/octet-stream', headers: { ...CORS, 'Dropbox-API-Result': JSON.stringify({ rev: f.rev, name: arg.path.split('/').pop() }) }, body: f.text });
    }
    dbxLog.push({ path: arg.path, mode: arg.mode['.tag'], rev: arg.mode.update || null });
    const f = dbx.get(arg.path);
    if ((arg.mode['.tag'] === 'add' && f) || (arg.mode['.tag'] === 'update' && (!f || f.rev !== arg.mode.update))) return json(route, { error_summary: 'path/conflict/file/..' }, 409);
    dbx.set(arg.path, { text: req.postDataBuffer().toString('utf8'), rev: 'r' + ++dbxN });
    return json(route, { rev: dbx.get(arg.path).rev });
  });

  // ---- fake Google Drive (drive.file): folders and files by id, md5 as the version ----
  const drive = new Map(), driveLog = [];
  let driveN = 0;
  await ctx.route('https://accounts.google.com/o/oauth2/v2/auth?*', route => {
    const q = new URL(route.request().url()).searchParams;
    route.fulfill({ status: 302, headers: { location: `${q.get('redirect_uri')}#state=${q.get('state')}&access_token=FAKE&expires_in=3599&token_type=Bearer` } });
  });
  const meta = f => ({ id: f.id, name: f.name, md5Checksum: f.folder ? undefined : md5(f.text), headRevisionId: 'h' + f.v, trashed: false });
  const multipart = req => {
    const boundary = /boundary=(.+)$/.exec(req.headers()['content-type'])[1];
    const parts = req.postDataBuffer().toString('utf8').split('--' + boundary).slice(1, -1).map(p => p.slice(p.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''));
    return { meta: JSON.parse(parts[0]), text: parts[1] };
  };
  await ctx.route('https://www.googleapis.com/**', route => {
    if (preflight(route)) return;
    const req = route.request(), u = new URL(req.url());
    assert.equal(req.headers().authorization, 'Bearer FAKE');
    const id = (/\/files\/([^/?]+)$/.exec(u.pathname) || [])[1];
    if (u.pathname.startsWith('/upload/')) {
      const { meta: m, text } = multipart(req);
      if (req.method() === 'PATCH') { const f = drive.get(id); f.text = text; f.v++; driveLog.push('update ' + f.name); return json(route, meta(f)); }
      const f = { id: 'F' + ++driveN, name: m.name, parent: m.parents[0], text, v: 1 };
      drive.set(f.id, f); driveLog.push('create ' + f.name); return json(route, meta(f));
    }
    if (req.method() === 'POST') {   // a folder
      const m = JSON.parse(req.postData());
      const f = { id: 'D' + ++driveN, name: m.name, parent: (m.parents || [''])[0], folder: true, v: 1 };
      drive.set(f.id, f); driveLog.push('folder ' + f.name); return json(route, meta(f));
    }
    if (id) {
      const f = drive.get(id);
      if (!f) return json(route, { error: { message: 'not found' } }, 404);
      return u.searchParams.get('alt') === 'media' ? route.fulfill({ status: 200, headers: CORS, body: f.text }) : json(route, meta(f));
    }
    const q = u.searchParams.get('q');
    const name = /name = '((?:[^'\\]|\\.)*)'/.exec(q)[1].replace(/\\(.)/g, '$1');
    const parent = (/'([^']+)' in parents/.exec(q) || [])[1];
    const wantFolder = /mimeType = 'application\/vnd.google-apps.folder'/.test(q);
    return json(route, { files: [...drive.values()].filter(f => f.name === name && !!f.folder === wantFolder && (!parent || f.parent === parent)).map(meta) });
  });

  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  await p.waitForFunction(() => Number(document.body.dataset.cases) > 0);   // (from the device's store, a moment after the first paint)
  const days = await p.evaluate(async () => [...new Set((await import('./js/ui-core.js')).S.cases.map(c => c.date).filter(Boolean))].sort());
  assert.ok(days.length >= 2, 'the demo has dated cases');
  const iso = days[days.length - 1];
  const syncBtn = p.locator('button.lb-sync');
  const toLogbook = async () => { await p.evaluate(() => { location.hash = '#settings'; }); await p.evaluate(() => { location.hash = '#logbook'; }); await p.locator('main .lb-top').waitFor(); };
  const runDone = async () => { await p.getByText(/^Synced \d+ of \d+/).waitFor().catch(async e => { throw new Error(`${e.message}\ntoast: ${await p.locator('#toast').innerText().catch(() => '')}\nerrors: ${errors.join(' | ')}`); }); const t = await p.locator('dialog[open] [role=status]').innerText(); await p.getByRole('button', { name: 'Close', exact: true }).click(); return t; };
  // the fake case is saved in the demo logbook (it must survive the sign-in pages' reloads)
  const setCase = details => p.evaluate(async ([d, details]) => { const cloud = await import('./js/cloud.js'); const { S } = await import('./js/ui-core.js');
    await cloud.saveCase('demo@example.com', { id: 'fake-sync-1', date: d, initials: 'ZZ', details, cats: ['01'], createdAt: Date.now() + 1e9, updatedAt: Date.now(), source: 'app' });
    for (let i = 0; i < 40 && !S.cases.some(c => c.id === 'fake-sync-1' && c.details === details); i++) await new Promise(r => setTimeout(r, 50));
    // other pages draw again 250 ms after a live case change (app.js flushRender): let that land before the next step
    // fills in a form there (Settings → Sync's new place would be drawn away)
    await new Promise(r => setTimeout(r, 400));
  }, [iso, details]);
  const blockOf = text => { const m = START_RE.exec(text); return text.slice(m.index + m[0].length + 1, text.indexOf(END) - 1); };

  // a note on another day, saved where the Logbook's note marks haven't seen it: Sync must still send it
  await p.evaluate(async d => (await import('./js/demo-backend.js')).saveNote('demo@example.com', { id: 'fake-sync-note', date: d, title: 'Fake note', body: 'Fake note body for sync', createdAt: Date.now(), updatedAt: Date.now() }), days[0]);

  // nothing set up: no Sync button anywhere
  await toLogbook();
  assert.equal(await syncBtn.count(), 0);

  // Settings → Sync: add GitHub, with a token
  await p.evaluate(() => { location.hash = '#sync'; }); await p.getByRole('heading', { name: 'Sync', exact: true }).waitFor();
  await p.getByLabel('Add a place to sync to').selectOption('github');
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  await p.getByText(/GitHub needs an owner and a repository/).waitFor();   // not saved half-made
  await p.getByLabel('Owner').fill('fake-user');
  await p.getByLabel('Repository').fill('fake-notes');
  await p.getByLabel('Token').fill('FAKE_GH_TOKEN');
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForFunction(async () => ((await import('./js/ui-core.js')).S.logbook.settings.sync || {}).targets?.length === 1);
  // the token is on this device only: never in the account's settings
  const st = await p.evaluate(async () => ({ settings: JSON.stringify((await import('./js/ui-core.js')).S.logbook.settings), keys: Object.keys(localStorage).filter(k => localStorage.getItem(k).includes('FAKE_GH_TOKEN')) }));
  assert.ok(!st.settings.includes('FAKE_GH_TOKEN'));
  assert.equal(st.keys.length, 1); assert.match(st.keys[0], /^apmes-logbook-cloud-gh:demo:demo@example.com:/);
  assert.equal(await p.getByLabel('Token').getAttribute('placeholder'), 'Saved on this device');
  assert.equal(await p.getByLabel('Folder').inputValue(), 'Daily');

  // the Logbook says how many days wait; Sync writes one file per day
  await toLogbook();
  await p.waitForFunction(n => document.querySelector('button.lb-sync')?.title === `${n} days to sync` && document.querySelector('button.lb-sync').textContent === `Sync (${n})`, days.length);
  await syncBtn.click();
  assert.match(await runDone(), new RegExp(`^Synced ${days.length} of ${days.length} days`));
  assert.deepEqual([...gh.keys()].sort(), days.map(d => `Daily/${d}.md`));
  const first = gh.get(`Daily/${iso}.md`).text;
  assert.match(gh.get(`Daily/${days[0]}.md`).text, /Fake note body for sync/);
  assert.ok(new RegExp('^' + START_RE.source + '\n').test(first) && first.endsWith(END + '\n'), first);
  const startLine = START_RE.exec(first)[0];
  await p.waitForFunction(() => document.querySelector('button.lb-sync')?.textContent === 'Synced');
  // nothing changed: nothing sent
  const puts = ghLog.length;
  await syncBtn.click(); await p.getByText('Everything is synced').waitFor();
  assert.equal(ghLog.length, puts);

  // the user writes around the block and edits a line in it; the logbook then gets a new case that day
  const path = `Daily/${iso}.md`, mine = blockOf(first).split('\n');
  const edited = mine.map((l, i) => (i === mine.length - 1 ? l + ' (my note)' : l)).join('\n');
  gh.set(path, { text: `# My own heading\n\n${startLine}\n${edited}\n${END}\n\nMy thoughts below.\n`, sha: 'g' + ++ghN });
  await setCase('Fake synced case');
  await toLogbook();
  await p.waitForFunction(() => document.querySelector('button.lb-sync')?.title === '1 day to sync');
  ghRace = path;   // and another device writes to the file just before ours: ours is refused, read again, merged
  await syncBtn.click();
  assert.match(await runDone(), /^Synced 1 of 1 day\. Your edits kept in 1 file\.$/);
  const now = gh.get(path).text;
  assert.ok(now.startsWith('# My own heading\n\n<!-- logbook:start fp='), now);
  assert.ok(now.endsWith('My thoughts below.\na line from another device\n'), now);
  assert.match(now, /\(my note\)/); assert.match(now, /Fake synced case/); assert.doesNotMatch(now, /<<<<<<<|>>>>>>>/);
  assert.deepEqual(ghLog.slice(-2).map(x => x.path), [path, path]);   // the refused write, then the merged one
  assert.notEqual(ghLog.at(-1).sha, ghLog.at(-2).sha);

  // an ID number in a day is asked about once, before anything is sent
  await setCase('Fake case S1234567A');
  await toLogbook(); await p.waitForFunction(() => document.querySelector('button.lb-sync')?.title === '1 day to sync');
  const before = ghLog.length;
  await syncBtn.click();
  await p.getByRole('heading', { name: 'Looks like an ID number' }).waitFor();
  await p.locator('dialog').last().getByRole('button', { name: 'Cancel' }).click();
  assert.equal(ghLog.length, before);
  await setCase('Fake synced case, edited');

  // Dropbox: Sync now leaves for its sign-in, comes back to Settings → Sync and syncs that place only
  await p.evaluate(() => { location.hash = '#sync'; }); await p.getByRole('heading', { name: 'Sync', exact: true }).waitFor();
  await p.getByLabel('Add a place to sync to').selectOption('dropbox');
  // the case just saved doesn't draw this page again (it shows no cases): the place being added stays, unsaved
  const dbxNow = await p.getByRole('button', { name: 'Sync now' }).nth(1).elementHandle();
  await p.evaluate(() => document.activeElement?.blur());
  await p.waitForTimeout(1500);
  assert.equal(await dbxNow.evaluate(el => el.isConnected), true, 'the Sync page was drawn again');
  await p.getByRole('button', { name: 'Sync now' }).nth(1).click();
  assert.match(await runDone(), new RegExp(`^Synced ${days.length} of ${days.length} days`));
  assert.match(p.url(), /\?demo#sync$/);
  assert.deepEqual([...dbx.keys()].sort(), days.map(d => `/Daily/${d}.md`));
  assert.ok(dbxLog.every(x => x.mode === 'add'));
  assert.match(dbx.get(`/Daily/${iso}.md`).text, /Fake synced case, edited/);
  // GitHub wasn't part of that run: it still has the edited case waiting
  assert.doesNotMatch(gh.get(path).text, /edited/);
  // the token lasts the visit: a change goes straight up, over the version read ("update" with its rev)
  await setCase('Fake synced case, edited twice');
  await p.getByRole('button', { name: 'Sync now' }).nth(1).click();
  assert.match(await runDone(), /^Synced 1 of 1 day/);
  assert.deepEqual(dbxLog.at(-1), { path: `/Daily/${iso}.md`, mode: 'update', rev: 'r' + days.length });

  // Google Drive: the same through Google's sign-in; folders made once, files in APMES Logbook/Daily
  await p.getByLabel('Add a place to sync to').selectOption('drive');
  await p.getByRole('button', { name: 'Sync now' }).nth(2).click();
  assert.match(await runDone(), new RegExp(`^Synced ${days.length} of ${days.length} days`));
  assert.deepEqual(driveLog.filter(x => x.startsWith('folder')), ['folder APMES Logbook', 'folder Daily']);
  const daily = [...drive.values()].find(f => f.folder && f.name === 'Daily');
  assert.equal(daily.parent, [...drive.values()].find(f => f.name === 'APMES Logbook').id);
  const files = [...drive.values()].filter(f => !f.folder);
  assert.deepEqual(files.map(f => f.name).sort(), days.map(d => `${d}.md`));
  assert.ok(files.every(f => f.parent === daily.id));
  // the user edits a Drive file outside the block; the next change keeps it (an update of the same file)
  const df = files.find(f => f.name === `${iso}.md`);
  df.text = 'Top line by me\n' + df.text; df.v++;
  await setCase('Fake synced case, third');
  await p.getByRole('button', { name: 'Sync now' }).nth(2).click();
  assert.match(await runDone(), /^Synced 1 of 1 day/);
  assert.equal(driveLog.at(-1), `update ${iso}.md`);
  assert.ok(df.text.startsWith('Top line by me\n<!-- logbook:start fp=') &&  /Fake synced case, third/.test(df.text), df.text);

  // one Sync from the Logbook does every place that has days waiting (here GitHub and Dropbox)
  await toLogbook();
  await p.waitForFunction(() => document.querySelector('button.lb-sync')?.title === '1 day to sync');
  await syncBtn.click();
  assert.match(await runDone(), /^Synced 2 of 2 days/);
  assert.match(gh.get(path).text, /Fake synced case, third/); assert.match(gh.get(path).text, /\(my note\)/);

  // the GitHub place moves to another folder: every day is written there again (not "Everything is synced")
  await p.evaluate(() => { location.hash = '#sync'; }); await p.getByRole('heading', { name: 'Sync', exact: true }).waitFor();
  await p.getByLabel('Folder').fill('Logbook/Daily');
  await p.getByRole('button', { name: 'Sync now' }).first().click();
  assert.match(await runDone(), new RegExp(`^Synced ${days.length} of ${days.length} days`));
  for (const d of days) assert.match(gh.get(`Logbook/Daily/${d}.md`)?.text || '', START_RE, d);

  // GitHub limits requests: that place stops, says so once (not as a token problem); Try again redoes that place only
  await p.getByLabel('Folder').fill('Limited');
  ghLimit = true;
  const dbxBefore = dbxLog.length, driveBefore = driveLog.length;
  await p.getByRole('button', { name: 'Sync now' }).first().click();
  await p.getByText(new RegExp(`^Synced 0 of ${days.length} days?; ${days.length} not synced`)).waitFor();
  const errs = await p.locator('dialog[open] .sync-errors li').allInnerTexts();
  assert.equal(errs.length, 1, errs.join('\n')); assert.match(errs[0], /GitHub is limiting requests: try again in about 1 minute/); assert.doesNotMatch(errs[0], /token/);
  ghLimit = false;
  await p.getByRole('button', { name: 'Try again' }).click();
  assert.match(await runDone(), new RegExp(`^Synced ${days.length} of ${days.length} days`));
  assert.ok(gh.has(`Limited/${iso}.md`));
  assert.equal(dbxLog.length, dbxBefore); assert.equal(driveLog.length, driveBefore);

  // reflection notes too (log2 15), on the GitHub place only: one per reflection in Limited/Reflections/, and a day's
  // Link points at its note
  await p.evaluate(async () => {
    const { patchLogbook, S } = await import('./js/ui-core.js'), sync = S.logbook.settings.sync;
    await patchLogbook({ settings: { sync: { ...sync, targets: sync.targets.map(t => (t.kind === 'github' ? { ...t, reflections: true } : t)) }, markdown: { reflInDay: 'link' } } });
  });
  const want = await p.evaluate(async () => {
    const { S } = await import('./js/ui-core.js'), live = (S.reflections || []).filter(r => !r.deleted);
    return { n: live.length, linked: live.some(r => r.caseId && S.cases.some(c => c.id === r.caseId && c.date)) };
  });
  assert.ok(want.n > 0, 'the demo has reflections');
  await toLogbook();
  await p.waitForFunction(() => /to sync \(days and reflection notes\)$/.test(document.querySelector('button.lb-sync')?.title || ''));
  await syncBtn.click();
  assert.match(await runDone(), new RegExp(`\\(\\d+ days? and ${want.n} reflection notes?\\)`));
  const notes = [...gh.keys()].filter(k => k.startsWith('Limited/Reflections/'));
  assert.equal(notes.length, want.n);
  for (const k of notes) assert.ok(START_RE.test(gh.get(k).text) && !gh.get(k).text.startsWith('---'), k);
  if (want.linked) assert.ok([...gh.keys()].some(k => /^Limited\/\d{4}-\d{2}-\d{2}\.md$/.test(k) && /Reflection: \[\[Reflections\//.test(gh.get(k).text)), 'a day links to its reflection note');
  // nothing new for GitHub: nothing sent (the other places now have days waiting: Link gives them the full text)
  const putsR = ghLog.length;
  await p.evaluate(async () => { const { runSync } = await import('./js/ui-sync.js'), { S } = await import('./js/ui-core.js'); await runSync({ only: S.logbook.settings.sync.targets.find(t => t.kind === 'github').id }); });
  await p.getByText('Everything is synced').waitFor();
  assert.equal(ghLog.length, putsR, 'nothing new: nothing sent');

  // the settings file carries where to sync, never the token
  const file = await p.evaluate(async () => { const { settingsFile } = await import('./js/settings-file.js'); return JSON.stringify(settingsFile((await import('./js/ui-core.js')).S.logbook)); });
  assert.match(file, /fake-notes/); assert.match(file, /"reflections":true/); assert.ok(!file.includes('FAKE_GH_TOKEN'));

  // Forget token, and sign-out's clean-up: nothing of the sync stays on the device
  await p.evaluate(() => { location.hash = '#sync'; }); await p.getByRole('heading', { name: 'Sync', exact: true }).waitFor();
  await p.getByRole('button', { name: 'Forget token' }).click();
  assert.equal(await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('apmes-logbook-cloud-gh:')).length), 0);
  assert.equal(await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('apmes-logbook-cloud-sync:')).length), 1);
  await p.evaluate(async () => (await import('./js/ui-sync.js')).forgetSync());
  await p.waitForFunction(async () => !Object.keys(localStorage).some(k => k.startsWith('apmes-logbook-cloud-')) && !(await indexedDB.databases()).some(d => d.name === 'apmes-logbook-sync'));
  // and this visit's Drive / Dropbox sign-ins are forgotten (the next person on the device can't use them)
  assert.deepEqual(await p.evaluate(async () => { const c = await import('./js/cloud-save.js'); return [c.cloudToken('drive'), c.cloudToken('dropbox')]; }), [null, null]);

  assert.deepEqual(errors, []);
  await ctx.close();
  console.log(`ok ${width}`);
}
// storage blocked (a locked-down browser, some private modes): reading window.localStorage itself throws. The app
// still opens, Settings → Sync and Send to work, a token can't be kept (said so), and forgetting the sync is quiet.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    const deny = () => { throw new DOMException("Failed to read the 'localStorage' property from 'Window': Access is denied for this document.", 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', { configurable: true, get: deny });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get: deny });
  });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  assert.equal(await p.evaluate(() => { try { localStorage; return 'readable'; } catch { return 'blocked'; } }), 'blocked');
  await p.waitForFunction(() => Number(document.body.dataset.cases) > 0);
  await p.locator('textarea.details').fill('ZZ fake case, storage blocked');
  await p.evaluate(() => { location.hash = '#sync'; }); await p.getByRole('heading', { name: 'Sync', exact: true }).waitFor();
  await p.getByLabel('Add a place to sync to').selectOption('github');
  await p.getByLabel('Owner').fill('fake-user'); await p.getByLabel('Repository').fill('fake-notes'); await p.getByLabel('Token').fill('FAKE_GH_TOKEN');
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  await p.getByText('Saved, but this browser won’t keep the token (private mode?)').waitFor();
  await p.evaluate(() => { location.hash = '#logbook'; }); await p.locator('main .lb-top').waitFor();
  await p.locator('button.lb-sync').click();
  await p.getByText(/add a GitHub token on this device first/).waitFor();
  await p.evaluate(() => { location.hash = '#sendto'; }); await p.getByRole('heading', { name: 'Send to', exact: true }).waitFor();
  await p.evaluate(async () => { (await import('./js/ui-sync.js')).forgetSync(); await (await import('./js/cloud-save.js')).resumeCloudSave(); });
  await p.evaluate(() => { location.hash = '#log'; }); await p.waitForSelector('textarea.details');
  await p.waitForTimeout(300);
  assert.deepEqual(errors, []);
  await ctx.close();
  console.log('ok storage blocked');
}
console.log('PASS sync'); } finally { await b.close(); }
