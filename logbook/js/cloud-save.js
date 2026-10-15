// Save to Google Drive / Dropbox (More → Export / Import → Backup). One tap writes the backup file, and if
// chosen the notes zip, into an "APMES Logbook" folder in the user's own Drive or Dropbox. No server and no
// background sync: each save is a tap while signed in (an optional reminder offers one when the last backup is
// over a week old). Tokens are kept in memory for this visit only.
//
// Sign-in leaves the page and comes back (no popups: on phones the popup often loses its link to the app, so
// Drive was left on a blank page and Dropbox did nothing). Before leaving, localStorage keeps what we're
// waiting for (not sessionStorage: a home-screen app may finish the sign-in in a browser tab); index.html
// keeps the answer and returns to #data; resumeCloudSave finishes the save.

import { S, h, toast, todayISO, settings, patchLogbook } from './ui-core.js';
import { GOOGLE_CLIENT_ID, DROPBOX_APP_KEY, FOLDER, KEEP_DAYS, staleBackups, cleanCloudBackup, backupDue, pkcePair, dropboxAuthUrl, googleAuthUrl, parseCloudReturn, dropboxArg, driveQuery } from './backup-targets.js';
import { demo } from './cloud.js';
import { makeBackup, gzipBlob } from './backup.js';
import { makeNotesZip } from './ui-notes.js';

export const driveReady = () => !!GOOGLE_CLIENT_ID;
export const dropboxReady = () => !!DROPBOX_APP_KEY;

// what goes up: the backup file, and the notes zip if chosen. Both as the server has them (the cases, reflections and
// notes, or "Not saved" after 30 s): the file replaces the day's, and this device's notes may be weeks old. The zip
// then reads the same notes.
async function filesToSave() {
  const data = await makeBackup({ fromServer: true });
  const out = [{ name: `logbook-backup-${todayISO()}.json.gz`, type: 'application/gzip', blob: await gzipBlob(JSON.stringify(data)) }];
  if (cleanCloudBackup(settings().cloudBackup).md) out.push({ name: `apmes-logbook-notes-${todayISO()}.zip`, type: 'application/zip', blob: (await makeNotesZip()).blob });
  return { files: out, cases: data.cases.length };
}
// after the upload: remove the app's own backups older than the chosen number of days (a failure there
// never undoes the save; it is only mentioned)
async function saved(to, n, prune) {
  let tidy = '';
  try { const gone = await prune(staleNames => staleBackups(staleNames, todayISO(), cleanCloudBackup(settings().cloudBackup).keepDays)); if (gone) tidy = `; removed ${gone} older`; }
  catch (err) { console.warn('Old backups not removed', err); tidy = ` (old backups not removed: ${err.message})`; }
  await patchLogbook({ settings: { cloudBackup: { ...cleanCloudBackup(settings().cloudBackup), lastAt: Date.now(), lastTo: to } } });
  toast(`Saved to ${to === 'drive' ? 'Google Drive' : 'Dropbox'}: ${n} file${n === 1 ? '' : 's'} in “${FOLDER}”${tidy}`);
}

// ---- leaving for the sign-in, and coming back ----

const PENDING = 'apmes-logbook-cloud-pending', RETURN = 'apmes-logbook-cloud-return', PENDING_MS = 15 * 60e3;
const redirectUri = () => location.origin + location.pathname;   // https://apmes.anawj.com/logbook/ (registered with Google and Dropbox)
const randomState = prefix => prefix + crypto.getRandomValues(new Uint32Array(2)).join('');
// extra: { action: 'sync', back: 'sync', target } when Sync (ui-sync.js) needs the token, not a backup
async function leaveToSignIn(to, extra = {}) {
  const state = randomState(to === 'drive' ? 'gdr-' : 'dbx-');
  const pending = { to, state, demo: !!demo, at: Date.now(), ...extra };
  let url;
  if (to === 'drive') url = googleAuthUrl({ clientId: GOOGLE_CLIENT_ID, redirectUri: redirectUri(), state, loginHint: S.user && S.user.email });
  else {
    const { verifier, challenge } = await pkcePair();
    pending.verifier = verifier;
    url = dropboxAuthUrl({ appKey: DROPBOX_APP_KEY, redirectUri: redirectUri(), challenge, state });
  }
  try { localStorage.setItem(PENDING, JSON.stringify(pending)); } catch { return toast('Not saved: this browser won’t keep the sign-in (private mode?)'); }
  location.assign(url);
}
// (the store is named, not passed: reading window.localStorage itself throws where storage is blocked)
const take = (store, key) => { try { const st = store === 'session' ? sessionStorage : localStorage; const v = JSON.parse(st.getItem(key) || 'null'); st.removeItem(key); return v; } catch { return null; } };

// after sign-in on the page Google or Dropbox sent us back to: finish the save (or the sync) that was waiting
export async function resumeCloudSave() {
  const back = take('session', RETURN);
  const r = back && parseCloudReturn(back);
  if (!r) return;
  const p = take('local', PENDING), pending = p && Date.now() - (p.at || 0) < PENDING_MS ? p : null;
  const where = r.to === 'drive' ? 'Google Drive' : 'Dropbox';
  const sync = !!(pending && pending.action === 'sync'), what = sync ? 'synced' : 'saved';
  if (!pending || pending.to !== r.to || pending.state !== r.state) return toast(`Not ${what} to ${where}: the sign-in didn’t match. Tap ${sync ? 'Sync' : 'Save'} again.`);
  if (r.error) return toast(`Not ${what} to ${where}: ${/denied/i.test(r.error) ? 'sign-in was cancelled' : r.error}`);
  if (!sync) toast(`Saving to ${where}…`);
  try {
    // the backup must hold everything: wait for the server's copy of the cases and reflections
    for (const t0 = Date.now(); !(S.casesSynced && S.reflectionsSynced); await new Promise(res => setTimeout(res, 250)))
      if (Date.now() - t0 > 30e3) throw new Error(`your logbook didn’t finish loading (no signal?). Tap ${sync ? 'Sync' : 'Save'} again.`);
    if (r.to === 'drive') driveToken = { token: r.token, exp: Date.now() + r.expiresIn * 1000 };
    else {
      const res = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', body: new URLSearchParams({ code: r.code, grant_type: 'authorization_code', client_id: DROPBOX_APP_KEY, redirect_uri: redirectUri(), code_verifier: pending.verifier || '' }) });
      const t = await res.json().catch(() => ({}));
      if (!res.ok || !t.access_token) throw new Error('Dropbox: ' + (t.error_description || t.error || res.status));
      dbxToken = { token: t.access_token, exp: Date.now() + (Number(t.expires_in) || 14400) * 1000 };
    }
    if (sync) return (await import('./ui-sync.js')).resumeSync(pending);
    if (r.to === 'drive') await uploadDrive(driveToken.token); else await uploadDropbox(dbxToken.token);
  } catch (err) { toast(`Not ${what}: ` + err.message); }
}

// for Sync (ui-sync.js): this visit's token while it has a minute left, or null (then signInFor leaves to get one)
export const cloudToken = to => { const t = to === 'drive' ? driveToken : dbxToken; return t && t.exp > Date.now() + 60e3 ? t.token : null; };
export const forgetCloudToken = to => { if (to === 'drive') driveToken = null; else dbxToken = null; };
export const signInFor = (to, extra) => leaveToSignIn(to, extra);

// ---- Google Drive: OAuth token for drive.file (the app sees only the files it made) ----

let driveToken = null;
async function driveApi(token, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (res.status === 401) driveToken = null;
  if (!res.ok) throw new Error(`Google Drive: ${res.status} ${(await res.json().catch(() => ({})))?.error?.message || res.statusText}`);
  return res.json();
}
async function driveFind(token, q) {
  const r = await driveApi(token, `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, fields: 'files(id,name)', spaces: 'drive' })}`);
  return (r.files || [])[0] || null;
}
async function driveUpload(token, file, parent) {
  const existing = await driveFind(token, driveQuery(file.name, { parent }));
  const meta = existing ? {} : { name: file.name, parents: [parent], mimeType: file.type };
  const body = new FormData();
  body.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  body.append('file', file.blob);
  const url = existing ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  return driveApi(token, url, { method: existing ? 'PATCH' : 'POST', body });
}
async function uploadDrive(token) {
  const { files } = await filesToSave();
  let folder = await driveFind(token, driveQuery(FOLDER, { folder: true }));
  folder ||= await driveApi(token, 'https://www.googleapis.com/drive/v3/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }) });
  for (const f of files) await driveUpload(token, f, folder.id);
  await saved('drive', files.length, async pick => {
    if (!cleanCloudBackup(settings().cloudBackup).keepDays) return 0;
    const r = await driveApi(token, `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q: `'${folder.id}' in parents and trashed = false`, fields: 'files(id,name)', pageSize: '1000', spaces: 'drive' })}`);
    const stale = new Set(pick((r.files || []).map(f => f.name)));
    let gone = 0;
    for (const f of (r.files || []).filter(f => stale.has(f.name))) {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok && res.status !== 404) throw new Error(`Google Drive: ${res.status}`);
      gone++;
    }
    return gone;
  });
}
export async function saveToDrive(btn) {
  if (!driveReady()) return toast('Google Drive isn’t set up for this app yet');
  if (!(driveToken && driveToken.exp > Date.now() + 60e3)) return leaveToSignIn('drive');
  if (btn) btn.disabled = true;
  try { await uploadDrive(driveToken.token); } catch (err) { toast('Not saved: ' + err.message); }
  if (btn) btn.disabled = false;
}

// ---- Dropbox: OAuth with PKCE, "App folder" access ----

let dbxToken = null;
async function uploadDropbox(token) {
  const { files } = await filesToSave();
  for (const f of files) {
    const res = await fetch('https://content.dropboxapi.com/2/files/upload', { method: 'POST', body: f.blob, headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': dropboxArg({ path: `/${FOLDER}/${f.name}`, mode: 'overwrite', mute: true }) } });
    if (res.status === 401) dbxToken = null;
    if (!res.ok) throw new Error(`Dropbox: ${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`);
  }
  await saved('dropbox', files.length, async pick => {
    if (!cleanCloudBackup(settings().cloudBackup).keepDays) return 0;
    const rpc = async (path, body) => {
      const res = await fetch(`https://api.dropboxapi.com/2/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: dropboxArg(body) });
      if (!res.ok) throw new Error(`Dropbox: ${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`);
      return res.json();
    };
    const list = await rpc('files/list_folder', { path: `/${FOLDER}`, limit: 2000 });
    const stale = pick((list.entries || []).filter(e => e['.tag'] === 'file').map(e => e.name));
    for (const name of stale) await rpc('files/delete_v2', { path: `/${FOLDER}/${name}` });
    return stale.length;
  });
}
export async function saveToDropbox(btn) {
  if (!dropboxReady()) return toast('Dropbox isn’t set up for this app yet');
  if (!(dbxToken && dbxToken.exp > Date.now() + 60e3)) return leaveToSignIn('dropbox');
  if (btn) btn.disabled = true;
  try { await uploadDropbox(dbxToken.token); } catch (err) { toast('Not saved: ' + err.message); }
  if (btn) btn.disabled = false;
}

// ---- the Backup card's section, and the reminder on open ----

export function cloudSaveSection() {
  const c = cleanCloudBackup(settings().cloudBackup);
  const set = patch => patchLogbook({ settings: { cloudBackup: { ...cleanCloudBackup(settings().cloudBackup), ...patch } } });
  const drive = h('button', { disabled: !driveReady(), onclick: () => saveToDrive(drive) }, 'Save to Google Drive');
  const dbx = h('button', { disabled: !dropboxReady(), onclick: () => saveToDropbox(dbx) }, 'Save to Dropbox');
  const when = c.lastAt ? `Last saved ${new Date(c.lastAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} to ${c.lastTo === 'drive' ? 'Google Drive' : 'Dropbox'}.` : 'Not saved to Google Drive or Dropbox yet.';
  return [
    h('h3', { style: 'margin-top:16px' }, 'Google Drive and Dropbox'),
    h('p', { class: 'hint help' }, `Writes a compressed backup file (.json.gz, which Restore reads) into an “${FOLDER}” folder in your own Drive or Dropbox. The app can see only the files it made there. Nothing runs in the background: each save is a tap. The first save each visit goes to Google or Dropbox to sign in, then comes back here.`),
    !driveReady() || !dropboxReady() ? h('p', { class: 'hint' }, !driveReady() && !dropboxReady() ? 'Google Drive and Dropbox aren’t set up for this app yet (the app owner registers them once).'
      : `${driveReady() ? 'Dropbox' : 'Google Drive'} isn’t set up for this app yet (the app owner registers it once).`) : null,
    h('div', { class: 'bar' }, drive, dbx),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: c.md, onchange: e => set({ md: e.target.checked }) }), 'Also save the notes zip (Markdown)'),
    h('label', {}, 'Keep backups in Drive / Dropbox for ', h('select', { 'aria-label': 'Keep backups in Drive / Dropbox for', onchange: e => set({ keepDays: Number(e.target.value) }) },
      ...KEEP_DAYS.map(d => h('option', { value: String(d), selected: c.keepDays === d }, d ? `${d} days` : 'always')))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: c.remind, onchange: e => set({ remind: e.target.checked }) }), 'Remind me to back up when I open the app and the last backup is over 7 days old'),
    h('p', { class: 'hint', style: 'margin:4px 0 0' }, when),
  ];
}

// once per visit, after sign-in: a one-tap reminder (the save itself is a tap: it may go to the sign-in page)
let reminded = false;
export function remindBackup() {
  if (reminded || !S.user || !backupDue(settings().cloudBackup) || (!driveReady() && !dropboxReady())) return;
  reminded = true;
  const c = cleanCloudBackup(settings().cloudBackup);
  const to = c.lastTo === 'dropbox' && dropboxReady() ? 'dropbox' : driveReady() ? 'drive' : 'dropbox';
  setTimeout(() => toast(c.lastAt ? `Your last backup was over ${7} days ago` : 'Back up your logbook to the cloud?', {
    action: to === 'drive' ? 'Save to Drive' : 'Save to Dropbox', ms: 15000,
    onaction: () => (to === 'drive' ? saveToDrive() : saveToDropbox()),
  }), 1500);
}
