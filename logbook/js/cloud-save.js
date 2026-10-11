// Save to Google Drive / Dropbox (More → Export / Import → Backup). One tap writes the backup file, and if
// chosen the notes zip, into an "APMES Logbook" folder in the user's own Drive or Dropbox. No server and no
// background sync: each save is a tap while signed in (an optional reminder offers one when the last backup is
// over a week old). Tokens are kept in memory for this visit only.

import { S, h, toast, todayISO, settings, patchLogbook } from './ui-core.js';
import { GOOGLE_CLIENT_ID, DROPBOX_APP_KEY, DRIVE_SCOPE, FOLDER, cleanCloudBackup, backupDue, pkcePair, dropboxAuthUrl, dropboxArg, driveQuery } from './backup-targets.js';
import { makeBackup } from './backup.js';
import { makeNotesZip } from './ui-notes.js';

export const driveReady = () => !!GOOGLE_CLIENT_ID;
export const dropboxReady = () => !!DROPBOX_APP_KEY;

// what goes up: the backup file, and the notes zip if chosen
async function filesToSave() {
  const data = await makeBackup();
  const out = [{ name: `logbook-backup-${todayISO()}.json`, type: 'application/json', blob: new Blob([JSON.stringify(data)], { type: 'application/json' }) }];
  if (cleanCloudBackup(settings().cloudBackup).md) out.push({ name: `apmes-logbook-notes-${todayISO()}.zip`, type: 'application/zip', blob: (await makeNotesZip()).blob });
  return { files: out, cases: data.cases.length };
}
async function saved(to, n) {
  await patchLogbook({ settings: { cloudBackup: { ...cleanCloudBackup(settings().cloudBackup), lastAt: Date.now(), lastTo: to } } });
  toast(`Saved to ${to === 'drive' ? 'Google Drive' : 'Dropbox'}: ${n} file${n === 1 ? '' : 's'} in “${FOLDER}”`);
}

// ---- Google Drive: Google Identity Services token client, drive.file ----

let gis = null, driveToken = null;
export function loadGis() {
  if (!driveReady()) return Promise.resolve(null);
  return (gis ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => { gis = null; reject(new Error('Could not load Google sign-in (offline?)')); };
    document.head.append(s);
  }));
}
// asks for a token: the popup has to open straight from the tap, so this never awaits before requesting
function driveAuth() {
  if (driveToken && driveToken.exp > Date.now() + 60e3) return Promise.resolve(driveToken.token);
  if (!window.google?.accounts?.oauth2) return Promise.reject(new Error('Google is still loading: tap again in a moment'));
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID, scope: DRIVE_SCOPE,
      callback: r => { if (r.error) return reject(new Error(r.error_description || r.error)); driveToken = { token: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 }; resolve(r.access_token); },
      error_callback: e => reject(new Error(e && e.type === 'popup_closed' ? 'Google sign-in was closed' : (e && (e.message || e.type)) || 'Google sign-in failed')),
    });
    client.requestAccessToken({ prompt: '', login_hint: S.user && S.user.email });
  });
}
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
export async function saveToDrive(btn) {
  if (!driveReady()) return toast('Google Drive isn’t set up for this app yet');
  const auth = driveAuth();   // first: the popup must open from the tap itself
  if (btn) btn.disabled = true;
  try {
    const token = await auth;
    const { files } = await filesToSave();
    let folder = await driveFind(token, driveQuery(FOLDER, { folder: true }));
    folder ||= await driveApi(token, 'https://www.googleapis.com/drive/v3/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }) });
    for (const f of files) await driveUpload(token, f, folder.id);
    await saved('drive', files.length);
  } catch (err) { toast('Not saved: ' + err.message); }
  if (btn) btn.disabled = false;
}

// ---- Dropbox: OAuth with PKCE in a popup, "App folder" access ----

let dbxToken = null;
const redirectUri = () => location.origin + location.pathname;   // https://anawj.com/logbook/ (registered in the Dropbox app)
function dropboxAuth() {
  if (dbxToken && dbxToken.exp > Date.now() + 60e3) return Promise.resolve(dbxToken.token);
  // the popup opens at once (from the tap); its address is set after the PKCE challenge is worked out
  const win = window.open('about:blank', 'dropbox-auth', 'width=560,height=720');
  if (!win) return Promise.reject(new Error('the sign-in window was blocked: allow pop-ups for this site'));
  return (async () => {
    const { verifier, challenge } = await pkcePair();
    const state = 'dbx-' + crypto.getRandomValues(new Uint32Array(2)).join('');
    win.location.href = dropboxAuthUrl({ appKey: DROPBOX_APP_KEY, redirectUri: redirectUri(), challenge, state });
    const code = await new Promise((resolve, reject) => {
      const done = (fn, v) => { removeEventListener('message', onMsg); clearInterval(timer); fn(v); };
      const onMsg = e => {
        if (e.origin !== location.origin || !e.data || !e.data.dbx || e.data.dbx.state !== state) return;
        e.data.dbx.code ? done(resolve, e.data.dbx.code) : done(reject, new Error(e.data.dbx.error || 'Dropbox sign-in was cancelled'));
      };
      addEventListener('message', onMsg);
      const timer = setInterval(() => { if (win.closed) done(reject, new Error('Dropbox sign-in was closed')); }, 700);
    });
    const res = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', body: new URLSearchParams({ code, grant_type: 'authorization_code', client_id: DROPBOX_APP_KEY, redirect_uri: redirectUri(), code_verifier: verifier }) });
    const t = await res.json().catch(() => ({}));
    if (!res.ok || !t.access_token) throw new Error('Dropbox: ' + (t.error_description || t.error || res.status));
    dbxToken = { token: t.access_token, exp: Date.now() + (Number(t.expires_in) || 14400) * 1000 };
    return dbxToken.token;
  })();
}
export async function saveToDropbox(btn) {
  if (!dropboxReady()) return toast('Dropbox isn’t set up for this app yet');
  const auth = dropboxAuth();
  if (btn) btn.disabled = true;
  try {
    const token = await auth;
    const { files } = await filesToSave();
    for (const f of files) {
      const res = await fetch('https://content.dropboxapi.com/2/files/upload', { method: 'POST', body: f.blob, headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': dropboxArg({ path: `/${FOLDER}/${f.name}`, mode: 'overwrite', mute: true }) } });
      if (res.status === 401) dbxToken = null;
      if (!res.ok) throw new Error(`Dropbox: ${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`);
    }
    await saved('dropbox', files.length);
  } catch (err) { toast('Not saved: ' + err.message); }
  if (btn) btn.disabled = false;
}

// ---- the Backup card's section, and the reminder on open ----

export function cloudSaveSection() {
  const c = cleanCloudBackup(settings().cloudBackup);
  if (driveReady()) loadGis().catch(() => {});   // ready before the tap, so the popup isn't blocked
  const set = patch => patchLogbook({ settings: { cloudBackup: { ...cleanCloudBackup(settings().cloudBackup), ...patch } } });
  const drive = h('button', { disabled: !driveReady(), onclick: () => saveToDrive(drive) }, 'Save to Google Drive');
  const dbx = h('button', { disabled: !dropboxReady(), onclick: () => saveToDropbox(dbx) }, 'Save to Dropbox');
  const when = c.lastAt ? `Last saved ${new Date(c.lastAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} to ${c.lastTo === 'drive' ? 'Google Drive' : 'Dropbox'}.` : 'Not saved to Google Drive or Dropbox yet.';
  return [
    h('h3', { style: 'margin-top:16px' }, 'Google Drive and Dropbox'),
    h('p', { class: 'hint help' }, `Writes the backup file into an “${FOLDER}” folder in your own Drive or Dropbox. The app can see only the files it made there. Nothing runs in the background: each save is a tap.`),
    !driveReady() || !dropboxReady() ? h('p', { class: 'hint' }, !driveReady() && !dropboxReady() ? 'Google Drive and Dropbox aren’t set up for this app yet (the app owner registers them once).'
      : `${driveReady() ? 'Dropbox' : 'Google Drive'} isn’t set up for this app yet (the app owner registers it once).`) : null,
    h('div', { class: 'bar' }, drive, dbx),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: c.md, onchange: e => set({ md: e.target.checked }) }), 'Also save the notes zip (Markdown)'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: c.remind, onchange: e => set({ remind: e.target.checked }) }), 'Remind me to back up when I open the app and the last backup is over 7 days old'),
    h('p', { class: 'hint', style: 'margin:4px 0 0' }, when),
  ];
}

// once per visit, after sign-in: a one-tap reminder (the save itself still needs the tap, for the sign-in popup)
let reminded = false;
export function remindBackup() {
  if (reminded || !S.user || !backupDue(settings().cloudBackup) || (!driveReady() && !dropboxReady())) return;
  reminded = true;
  const c = cleanCloudBackup(settings().cloudBackup);
  const to = c.lastTo === 'dropbox' && dropboxReady() ? 'dropbox' : driveReady() ? 'drive' : 'dropbox';
  if (to === 'drive') loadGis().catch(() => {});
  setTimeout(() => toast(c.lastAt ? `Your last backup was over ${7} days ago` : 'Back up your logbook to the cloud?', {
    action: to === 'drive' ? 'Save to Drive' : 'Save to Dropbox', ms: 15000,
    onaction: () => (to === 'drive' ? saveToDrive() : saveToDropbox()),
  }), 1500);
}
