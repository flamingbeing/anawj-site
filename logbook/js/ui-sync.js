// Sync (Settings → Sync; a Sync button on the Logbook tab once a place is set up): one Markdown file per day in
// the user's own Google Drive, Dropbox or GitHub repository: the day's cases and notes in their Markdown format
// (Settings → Markdown). Only days changed since the last sync are sent, and only on a tap. Off until set up.
//
// What's kept where (the logbook doc's settings are readable by the app owner, so nothing private goes there):
//   settings().sync      where to sync (no tokens): may travel in the settings file
//   localStorage         per account: the ledger (fingerprints and file versions), the GitHub token
//   IndexedDB            per account: the text each day had when last synced (the base for merging edits)
// Sign-out forgets all three on this device. What to write is decided in sync-md.js; the calls are in sync-remote.js.

import { S, h, toast, modal, settings, patchLogbook, okNoIds } from './ui-core.js';
import { fmtDate } from './engine.js';
import { cleanSync, cleanTarget, targetReady, targetPath, placePath, reflectionFiles, changedRefls, planDay, fingerprint, changedDays, cleanSyncLedger, markSynced, reconcileSyncState, KIND_NAMES, MAX_TARGETS, DEFAULT_FILE, DRIVE_DIR, DROPBOX_DIR } from './sync-md.js';
import { mdDay } from './markdown.js';
import { mdFormat, mdCtx } from './share.js';
import { notesOn } from './notepad.js';
import { ensureNotes, notesIndex, notesFromServer } from './ui-notepad.js';
import { demo } from './cloud.js';
import { FOLDER } from './backup-targets.js';
import { driveReady, dropboxReady, cloudToken, signInFor, forgetCloudToken } from './cloud-save.js';
import { driveRemote, dropboxRemote, githubRemote, resetSyncRemote } from './sync-remote.js';
import { LEDGER, TOKEN, DB, wipeSyncDevice } from './sync-forget.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const syncSettings = () => cleanSync(settings().sync);
export const syncTargets = () => syncSettings().targets.filter(targetReady);

// the places a settings file would add, for the import question
export const syncPlaces = v => cleanSync(v).targets.map(t => (t.kind === 'github' ? `GitHub ${t.owner}/${t.repo}` : KIND_NAMES[t.kind]));

// ---- this device's bookkeeping, per account ----

// a run passes the account it started with (a), so nothing it records lands under the next person's name
const acct = () => (demo ? 'demo:' : '') + String((S.user && S.user.email) || (S.logbook && S.logbook.email) || 'local').toLowerCase();
// "cloud" in the names keeps them out of the device-settings file (settings-file.js) like the sign-in state
function readState(a = acct()) {
  try {
    const s = JSON.parse(localStorage.getItem(LEDGER + a) || '{}') || {}, obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    return { ledger: cleanSyncLedger(s.ledger), at: obj(s.at), places: obj(s.places) };
  } catch { return { ledger: {}, at: {}, places: {} }; }
}
const writeState = (s, a = acct()) => { try { localStorage.setItem(LEDGER + a, JSON.stringify(s)); } catch { /* storage full or blocked: the next sync reads the files again */ } };
export const ghToken = (id, a = acct()) => { try { return localStorage.getItem(`${TOKEN}${a}:${id}`) || ''; } catch { return ''; } };
// false: storage is blocked (said so, unless quiet: Save says it in its own message)
const setGhToken = (id, v, quiet = false) => { try { if (v) localStorage.setItem(`${TOKEN}${acct()}:${id}`, v); else localStorage.removeItem(`${TOKEN}${acct()}:${id}`); return true; } catch { if (!quiet) toast('This browser won’t keep the token (private mode?)'); return false; } };

// the base texts: IndexedDB (a day can be long and there may be years of them)
let opened = null;
function db() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('no IndexedDB'));
  opened ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('base', { keyPath: 'key' });
    r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); opened = null; }; resolve(d); };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('blocked'));
  }).catch(err => { opened = null; throw err; });
  return opened;
}
const baseKey = (a, id, date) => `${a}|${id}|${date}`;
async function getBase(a, id, date) {
  try {
    const d = await db();
    return await new Promise(res => { const q = d.transaction('base').objectStore('base').get(baseKey(a, id, date)); q.onsuccess = () => res(q.result ? q.result.text : null); q.onerror = () => res(null); });
  } catch { return null; }   // no base: a day edited inside its block keeps both versions, marked
}
async function putBase(a, id, date, text) {
  try {
    const d = await db();
    await new Promise(res => { const tx = d.transaction('base', 'readwrite'); tx.objectStore('base').put({ key: baseKey(a, id, date), text }); tx.oncomplete = tx.onerror = tx.onabort = res; });
  } catch { /* as above */ }
}
// every base of one place (it was removed, or now writes somewhere else)
async function dropBases(id, a = acct()) {
  try {
    const d = await db(), from = baseKey(a, id, '');
    await new Promise(res => { const tx = d.transaction('base', 'readwrite'); tx.objectStore('base').delete(IDBKeyRange.bound(from, from + '\uffff')); tx.oncomplete = tx.onerror = tx.onabort = res; });
  } catch { /* as above */ }
}
// sign-out, account switch, demo reset: a shared device keeps nothing of the last person's sync, and a run still
// going stops (gen) before it records anything more
let gen = 0;
export function forgetSync() {
  gen++;
  // this visit's Drive and Dropbox sign-ins were the last person's (the page doesn't reload on a switch)
  forgetCloudToken('drive'); forgetCloudToken('dropbox'); resetSyncRemote();
  const close = opened; opened = null;
  wipeSyncDevice(close);
}

// ---- which days to sync ----

const tidy = t => String(t).replace(/\r\n?/g, '\n').replace(/\n+$/, '');
// the days each place needs: for every day with cases or notes (and every day synced before, which may now be
// empty), its text now against the ledger. A run (full) always waits for the server's notes: a day sent without
// its notes would overwrite them in the file. The button's count reads notes only when there are some to read.
async function work(targets, { full = false, a = acct() } = {}) {
  const days = new Map();
  for (const c of S.cases || []) if (ISO.test(c.date || '')) (days.get(c.date) || days.set(c.date, []).get(c.date)).push(c);
  const notes = full ? await notesFromServer() : notesIndex().days.length || S.notes ? (await ensureNotes().catch(() => [])) || [] : [];
  for (const n of notes) if (ISO.test(n.date || '') && !days.has(n.date)) days.set(n.date, []);
  // a place pointed somewhere else meanwhile (another device, a settings file), or removed: its ledger goes
  const { state, drop } = reconcileSyncState(readState(a), syncSettings().targets);
  if (drop.length || JSON.stringify(state.places) !== JSON.stringify(readState(a).places)) { writeState(state, a); for (const id of drop) await dropBases(id, a); }
  const { ledger } = state;
  const fmt = mdFormat(), ctx = mdCtx(), texts = new Map();
  // reflection notes, for the places that sync them too: there, a day's Link and Embed point at them
  const refls = targets.some(t => t.reflections) ? reflectionFiles(S.reflections || [], fmt) : [];
  const pathOf = new Map(refls.map(x => [x.id, x.path]));
  const linked = { ...ctx, reflPath: r => pathOf.get(r.id) || '' };
  const text = (date, withRefl = false) => {
    const k = (withRefl ? 'r|' : '') + date;
    if (!texts.has(k)) texts.set(k, tidy(mdDay(date, [...(days.get(date) || [])].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)), fmt, withRefl ? linked : ctx, notesOn(notes, date))));
    return texts.get(k);
  };
  const plan = targets.map(t => {
    const fps = {};
    for (const d of new Set([...days.keys(), ...Object.keys(ledger[t.id] || {}).filter(k => ISO.test(k))])) if (!t.from || d >= t.from) fps[d] = fingerprint(text(d, !!t.reflections));
    const mine = t.reflections ? refls.filter(x => !t.from || !x.date || x.date >= t.from) : [];
    return { target: t, days: changedDays(ledger, t.id, fps), refls: changedRefls(ledger, t.id, mine, Object.fromEntries(mine.map(x => [x.key, fingerprint(tidy(x.text))]))) };
  });
  return { plan, text };
}
const waitLoaded = async () => {
  for (const t0 = Date.now(); !S.casesSynced; await new Promise(r => setTimeout(r, 250)))
    if (Date.now() - t0 > 30e3) throw new Error('your logbook didn’t finish loading (no signal?). Tap Sync again.');
};
// how many days wait (any place); null while the logbook is still loading
export async function daysToSync() {
  const targets = syncTargets();
  if (!targets.length || !S.casesSynced) return null;
  const { plan } = await work(targets);
  return new Set(plan.flatMap(p => p.days)).size + new Set(plan.flatMap(p => p.refls.map(x => x.key))).size;
}

// ---- the run ----

let running = false;
const remoteFor = (t, a) => (t.kind === 'drive' ? driveRemote(cloudToken('drive')) : t.kind === 'dropbox' ? dropboxRemote(cloudToken('dropbox')) : githubRemote(t, ghToken(t.id, a)));
const stopped = () => Object.assign(new Error('stopped: signed out'), { auth: true });
const where = t => (t.kind === 'github' ? `${t.owner}/${t.repo}` : KIND_NAMES[t.kind]);

// one day (or reflection note, key "r:<id>"): read the file, work out the text, write it only if it changed and only
// over the version read (someone else's write meanwhile: read again and merge, twice at most). A reflection note
// under a new name starts afresh there (the old file's base doesn't apply; the old file is left as it is).
async function syncDay(t, remote, date, inner, a, g, file = '') {
  const path = file ? placePath(t, file) : targetPath(t, date);
  const was = readState(a).ledger[t.id]?.[date];
  const last = was && (!file || was.path === file) ? { fp: was.fp, base: await getBase(a, t.id, date) } : null;
  for (let tries = 0; ; tries++) {
    if (g !== gen) throw stopped();
    const cur = await remote.read(path);
    const p = planDay({ remoteText: cur ? cur.text : null, inner, last });
    let rev = cur ? cur.rev : '';
    if (p.write) {
      try { rev = (await remote.write(path, p.text, cur)).rev; }
      catch (err) { if (err.conflict && tries < 2) continue; throw err; }
    }
    if (g !== gen) throw stopped();   // written, but the device has forgotten this person's sync: keep nothing
    await putBase(a, t.id, date, inner);
    const s = readState(a);
    writeState({ ...s, ledger: markSynced(s.ledger, t.id, date, fingerprint(inner), rev, file) }, a);
    return p;
  }
}

// Sync now: every place (or only one). Drive and Dropbox tokens last the visit (memory only), so a place with days
// waiting and no token first leaves for its sign-in, and the run starts again when it comes back (resumeSync).
// Coming back reloads the page, so another place's token is gone again: a resumed run never leaves a second time
// (no loop between two sign-ins); that place waits for the next tap.
export async function runSync({ only = '', resumed = false } = {}) {
  if (running) return toast('Sync is already running');
  const targets = syncTargets().filter(t => !only || t.id === only);
  const a = acct(), g = gen;
  if (!targets.length) return toast('No place to sync to yet', { action: 'Set up', onaction: () => { location.hash = '#sync'; } });
  for (const t of targets) {
    if (t.kind === 'github' && !ghToken(t.id, a)) return toast(`${t.name}: add a GitHub token on this device first`, { action: 'Set up', onaction: () => { location.hash = '#sync'; } });
    if ((t.kind === 'drive' && !driveReady()) || (t.kind === 'dropbox' && !dropboxReady())) return toast(`${KIND_NAMES[t.kind]} isn’t set up for this app yet`);
  }
  running = true;
  try {
    await waitLoaded();
    const { plan, text } = await work(targets, { full: true, a });
    if (g !== gen) return;
    const unsigned = plan.filter(x => (x.days.length || x.refls.length) && x.target.kind !== 'github' && !cloudToken(x.target.kind));
    if (unsigned.length && !resumed) {
      running = false;
      return signInFor(unsigned[0].target.kind, { action: 'sync', back: /^#(sync|logbook)$/.test(location.hash) ? location.hash.slice(1) : 'logbook', only });
    }
    const jobs = plan.flatMap(x => (unsigned.includes(x) ? [] : [...x.days.map(date => ({ t: x.target, date })), ...x.refls.map(refl => ({ t: x.target, refl }))]));
    const later = unsigned.map(x => x.target.name);
    if (!jobs.length) { toast(later.length ? `${later.join(' and ')}: tap Sync again to sign in` : 'Everything is synced'); return; }
    // asked once for the whole run, not per day
    if (!(await okNoIds(...new Set(jobs.map(j => (j.refl ? j.refl.text : text(j.date, !!j.t.reflections)))))) || g !== gen) return;
    await showRun(jobs, text, { later, only, a, g });
  } catch (err) { toast('Not synced: ' + err.message); }
  finally { running = false; paintButtons(); }
}
// back from the Google / Dropbox sign-in (cloud-save.js): carry on with the run that was waiting
export async function resumeSync(pending) {
  await runSync({ only: pending && typeof pending.only === 'string' ? pending.only : '', resumed: true });
}

async function showRun(jobs, text, { later = [], only = '', a = acct(), g = gen } = {}) {
  // "3 days" or "3 days and 2 reflection notes"
  const nRefl = jobs.filter(j => j.refl).length, nDay = jobs.length - nRefl;
  const what = [nDay ? `${nDay} day${nDay === 1 ? '' : 's'}` : '', nRefl ? `${nRefl} reflection note${nRefl === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
  const renamed = jobs.filter(j => j.refl && j.refl.renamed).length;
  const status = h('p', { role: 'status', 'aria-live': 'polite', style: 'margin:0 0 8px' }, `Syncing ${what}…`);
  const bar = h('progress', { max: String(jobs.length), value: '0', 'aria-label': 'Sync progress', style: 'width:100%' });
  const errs = h('ul', { class: 'sync-errors', style: 'margin:8px 0 0;padding-left:18px' });
  const retry = h('button', { hidden: true, onclick: async () => { await m.close(); runSync({ only }); } }, 'Try again');   // after the dialog's history step is undone
  const close = h('button', { class: 'primary', onclick: () => m.close() }, 'Hide');
  const m = modal('Sync', [status, bar, errs, h('div', { class: 'bar', style: 'margin:12px 0 0' }, h('span', { class: 'grow' }), retry, close)]);
  let done = 0, failed = 0, merged = 0, clashes = 0;
  const dead = new Map();   // a place whose sign-in or token failed: its other days aren't tried
  const now = Date.now();
  for (const { t, date, refl } of jobs) {
    if (g !== gen) break;   // signed out meanwhile: stop at once
    const remote = dead.has(t.id) ? null : remoteFor(t, a);
    try {
      if (!remote) throw dead.get(t.id);
      const p = refl ? await syncDay(t, remote, refl.key, tidy(refl.text), a, g, refl.path) : await syncDay(t, remote, date, text(date, !!t.reflections), a, g);
      if (p.merged) merged++;
      clashes += p.conflicts;
    } catch (err) {
      failed++;
      // a refused sign-in or token, or a rate limit: that place's other days aren't tried, and it's said once
      if (err.auth && dead.has(t.id)) { done++; bar.value = done; continue; }
      if (err.auth) dead.set(t.id, err);
      errs.append(h('li', {}, `${refl ? refl.path : fmtDate(date)} (${t.name}): ${err.message}`));
    }
    done++;
    bar.value = done;
    status.textContent = `Syncing: ${done} of ${jobs.length}${failed ? `, ${failed} not synced` : ''}`;
  }
  if (g !== gen) { m.close(); return; }
  const s = readState(a);
  for (const t of new Set(jobs.map(j => j.t))) if (!dead.has(t.id)) s.at[t.id] = now;
  writeState(s, a);
  status.textContent = (jobs.length === nDay ? `Synced ${done - failed} of ${what}` : `Synced ${done - failed} of ${jobs.length} (${what})`) + (failed ? `; ${failed} not synced (below)` : '')
    + (renamed ? `. ${renamed} reflection note${renamed === 1 ? '' : 's'} under a new name: the old file${renamed === 1 ? ' is' : 's are'} left as ${renamed === 1 ? 'it was' : 'they were'}` : '')
    + (merged ? `. Your edits kept in ${merged} file${merged === 1 ? '' : 's'}` : '') + (clashes ? `; ${clashes} place${clashes === 1 ? '' : 's'} where both changed are marked <<<<<<< in the file${clashes === 1 ? '' : 's'}` : '') + '.';
  if (later.length) status.textContent += ` ${later.join(' and ')}: tap Sync again to sign in.`;
  retry.hidden = !failed && !later.length;
  close.textContent = 'Close';
  if (!m.el?.open) toast(status.textContent);
}

// ---- the Logbook tab's button, and the reminder on open ----

const buttons = new Set();
// "3 days to sync"; with reflection notes synced somewhere, "3 to sync (days and reflection notes)"
const toSync = n => (syncTargets().some(t => t.reflections) ? `${n} to sync (days and reflection notes)` : `${n} day${n === 1 ? '' : 's'} to sync`);
function paintButtons() {
  for (const b of [...buttons]) if (!b.isConnected) buttons.delete(b);
  if (!buttons.size) return;
  daysToSync().then(n => {
    for (const b of buttons) {
      // short on the button (it shares a row with the view switch on a phone), in full for screen readers
      b.querySelector('.lb-sync-l').textContent = n == null ? 'Sync' : n ? `Sync (${n})` : 'Synced';
      b.title = n ? toSync(n) : 'Sync';
      if (n) b.setAttribute('aria-label', `Sync (${n}): ${b.title}`); else b.removeAttribute('aria-label');
    }
  }).catch(() => {});
}
// null when no place is set up (so nothing changes for anyone who hasn't)
export function syncButton() {
  if (!syncTargets().length) return null;
  const b = h('button', { class: 'small lb-sync', title: 'Sync', onclick: () => runSync() }, h('span', { class: 'lb-sync-l' }, 'Sync'));
  buttons.add(b);
  setTimeout(paintButtons, 0);
  return b;
}

let reminded = false;
export function remindSync() {
  if (reminded || !S.user || !syncSettings().remind || !syncTargets().length) return;
  reminded = true;
  (async () => {
    await waitLoaded();
    // after any other reminder on screen (the backup one) has gone
    for (let i = 0; i < 60 && document.querySelector('#toast.show'); i++) await new Promise(r => setTimeout(r, 500));
    const n = await daysToSync();
    if (n) toast(toSync(n), { action: 'Sync', ms: 15000, onaction: () => runSync() });
  })().catch(() => {});
}

// ---- Settings → Sync ----

const NEW = { drive: { name: 'Google Drive' }, dropbox: { name: 'Dropbox' }, github: { name: 'GitHub', branch: 'main', folder: 'Daily' } };
export function renderSyncSettings() {
  const sv = syncSettings();
  let list = sv.targets.map(t => ({ ...t }));
  const tokens = new Map();   // typed here, kept on this device on Save
  const box = h('div', {});
  const field = (t, k, label, hint, attrs = {}) => h('label', { class: 'field', style: 'margin-top:8px' }, label,
    h('input', { type: 'text', value: t[k] || '', spellcheck: 'false', autocapitalize: 'off', 'aria-label': label, oninput: e => { t[k] = e.target.value; }, ...attrs }),
    hint ? h('span', { class: 'hint help' }, hint) : null);
  const draw = (lastAt = readState().at) => box.replaceChildren(...list.map((t, i) => h('div', { class: 'card', style: 'margin:10px 0;box-shadow:none;border:1px solid var(--line, #ccc)' },
    h('h3', { style: 'margin:0' }, KIND_NAMES[t.kind]),
    t.kind === 'drive' ? h('p', { class: 'hint', style: 'margin:4px 0 0' }, `Files go in “${FOLDER}/${DRIVE_DIR}” in your Drive.${driveReady() ? '' : ' Google Drive isn’t set up for this app yet (the app owner registers it once).'}`)
      : t.kind === 'dropbox' ? h('p', { class: 'hint', style: 'margin:4px 0 0' }, `Files go in Apps/APMES Logbook${DROPBOX_DIR} in your Dropbox.${dropboxReady() ? '' : ' Dropbox isn’t set up for this app yet (the app owner registers it once).'}`) : null,
    field(t, 'name', 'Name'),
    t.kind === 'github' ? [
      field(t, 'owner', 'Owner', 'Your GitHub user or organisation name.'),
      field(t, 'repo', 'Repository'),
      field(t, 'branch', 'Branch'),
      field(t, 'folder', 'Folder', 'Inside the repository, like Daily or Journal/Logbook. Empty: the top.'),
      h('label', { class: 'field', style: 'margin-top:8px' }, 'Token',
        h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Token', placeholder: ghToken(t.id) ? 'Saved on this device' : 'github_pat_…', oninput: e => tokens.set(t.id, e.target.value.trim()) }),
        h('span', { class: 'hint help' }, 'A fine-grained personal access token for this one repository, with Contents: Read and write. It is kept only in this browser on this device: never in your account, backups or settings file. Sign-out forgets it.')),
      h('p', { class: 'hint' }, 'Use a private repository: the files hold your cases, and anything in a public repository can be read by anyone.'),
      ghToken(t.id) ? h('button', { class: 'small', onclick: () => { setGhToken(t.id, ''); tokens.delete(t.id); toast('Token forgotten on this device'); draw(); } }, 'Forget token') : null,
    ] : null,
    field(t, 'fileName', 'File name', `One file a day. {date} is the day (2026-10-13); also {year}, {month}, {day}; a / makes folders. Default ${DEFAULT_FILE}.`),
    h('label', { class: 'check', style: 'margin-top:8px' }, h('input', { type: 'checkbox', checked: !!t.reflections, onchange: e => { t.reflections = e.target.checked; } }), 'Also sync reflection notes'),
    h('p', { class: 'hint help', style: 'margin:0' }, 'One note per reflection in a Reflections folder beside the day files, named as the Markdown export names them, so Link and Embed (Settings → Markdown) work there. A reflection renamed gets a new file; the old one is left as it is.'),
    h('label', { class: 'field', style: 'margin-top:8px' }, 'Start from',
      h('input', { type: 'date', value: t.from || '', 'aria-label': 'Start from', onchange: e => { t.from = e.target.value; } }),
      h('span', { class: 'hint help' }, 'Only days from this date. Empty: every day.')),
    h('p', { class: 'hint', style: 'margin:6px 0 0' }, lastAt[t.id] ? `Last synced ${new Date(lastAt[t.id]).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} on this device.` : 'Not synced from this device yet.'),
    h('div', { class: 'bar', style: 'margin:10px 0 0' },
      h('button', { class: 'small', onclick: async () => { if (await save()) runSync({ only: t.id }); } }, 'Sync now'),
      h('span', { class: 'grow' }),
      h('button', { class: 'small linkish', onclick: () => { list.splice(i, 1); draw(); } }, 'Remove')))));
  draw();
  const add = kind => {
    if (list.length >= MAX_TARGETS) return toast('That is the most places to sync to');
    list.push({ id: Math.random().toString(36).slice(2, 8), kind, fileName: DEFAULT_FILE, from: '', ...NEW[kind] });
    draw();
  };
  const remind = h('input', { type: 'checkbox', checked: sv.remind });
  async function save() {
    const bad = list.find(t => t.kind === 'github' && !targetReady(cleanTarget(t)));
    if (bad) { toast('GitHub needs an owner and a repository (letters, digits, - . _)'); return false; }
    const clean = list.map(cleanTarget).filter(Boolean);
    // places removed: their ledger and token go too. A place that now writes somewhere else (another repository,
    // branch, folder or file name) starts again: every day is new there, and the old files' bases don't apply
    const keep = new Set(clean.map(t => t.id)), s = readState();
    const place = t => JSON.stringify(['kind', 'owner', 'repo', 'branch', 'folder', 'fileName'].map(k => t[k] || ''));
    const was = new Map(sv.targets.map(t => [t.id, place(t)]));
    const moved = clean.filter(t => was.has(t.id) && was.get(t.id) !== place(t)).map(t => t.id);
    for (const id of new Set([...Object.keys(s.ledger), ...Object.keys(s.at)])) if (!keep.has(id) || moved.includes(id)) { delete s.ledger[id]; delete s.at[id]; }
    writeState(s);
    for (const id of [...sv.targets.map(t => t.id).filter(id => !keep.has(id)), ...moved]) await dropBases(id);
    for (const t of sv.targets) if (!keep.has(t.id)) setGhToken(t.id, '', true);
    let kept = true;
    for (const [id, v] of tokens) if (v && keep.has(id)) kept = setGhToken(id, v, true) && kept;
    tokens.clear();
    await patchLogbook({ settings: { sync: clean.length || remind.checked ? { targets: clean, remind: remind.checked } : null } });
    sv.targets = clean;
    list = clean.map(t => ({ ...t }));
    draw();   // the token field now says it's kept
    toast(kept ? 'Saved' : 'Saved, but this browser won’t keep the token (private mode?)');
    return true;
  }
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Sync'),
      h('p', { class: 'hint help', style: 'margin:0' }, 'Keeps one Markdown file per day (that day’s cases and notes, in your Markdown format) in your own Google Drive, Dropbox or GitHub repository, for Obsidian or any notes app. Only days that changed since the last sync are sent, and only when you tap Sync (on the Logbook tab).'),
      h('p', { class: 'hint' }, 'The logbook writes between two marks in each file (<!-- logbook:start … --> and <!-- logbook:end -->). Write above or below them and it’s kept. Edit between them and your edits are merged in; where yours and the logbook’s change the same line, both are kept, marked <<<<<<<.'),
      h('p', { class: 'hint' }, 'Google Drive and Dropbox let the app see only the files it made. Editing those files is fine; a file another app makes in their place can’t be seen, and a fresh copy is written beside it.'),
      h('p', { class: 'hint' }, 'The files hold your case details: keep them de-identified, and check hospital policy before keeping cases in a cloud drive or on GitHub.'),
      box,
      h('div', { class: 'bar', style: 'margin:10px 0 0' },
        h('label', { class: 'field', style: 'margin:0' }, 'Add',
          h('select', { 'aria-label': 'Add a place to sync to', onchange: e => { const v = e.target.value; e.target.value = ''; if (v) add(v); } },
            h('option', { value: '' }, 'Choose…'), Object.entries(KIND_NAMES).map(([k, n]) => h('option', { value: k }, n))))),
      h('label', { class: 'check' }, remind, 'Remind me when I open the app and days are waiting to sync'),
      h('div', { class: 'bar', style: 'margin:10px 0 0' }, h('span', { class: 'grow' }), h('button', { class: 'primary', onclick: save }, 'Save'))));
}
