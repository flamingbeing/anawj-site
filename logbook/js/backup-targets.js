// Save to Google Drive / Dropbox: the app's public ids (set once by the app owner; see README "Firebase
// setup", step 6) and the pure helpers (no DOM; tested in test/backup-targets.test.mjs).
//
// Neither id is a secret: Drive uses a web OAuth client (Google Identity Services token client, scope
// drive.file: the app sees only the files it made), Dropbox a public app key with PKCE ("App folder" access:
// the app sees only Apps/<app name>/). No server: the phone talks to Google and Dropbox directly.
// Empty = not set up yet: the buttons say so.

export const GOOGLE_CLIENT_ID = '474134277199-c97g6vd5s79c7muk50qghq5urederrqn.apps.googleusercontent.com';
export const DROPBOX_APP_KEY = 'tsuusabolodgy0y';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const FOLDER = 'APMES Logbook';
export const REMIND_DAYS = 7;

// Settings → the stored choice ({ remind, md, lastAt, lastTo }), cleaned
export const KEEP_DAYS = [0, 90, 30];   // how long the app's own Drive / Dropbox backups are kept (0 = all)
export function cleanCloudBackup(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  return {
    remind: !!o.remind, md: !!o.md, keepDays: KEEP_DAYS.includes(o.keepDays) ? o.keepDays : 0,
    lastAt: Number.isFinite(o.lastAt) && o.lastAt > 0 ? o.lastAt : 0,
    lastTo: o.lastTo === 'drive' || o.lastTo === 'dropbox' ? o.lastTo : '',
  };
}
// a reminder is due when it's on and the last backup (to either) is older than REMIND_DAYS, or there was none
export const backupDue = (v, now = Date.now(), days = REMIND_DAYS) => { const c = cleanCloudBackup(v); return c.remind && now - c.lastAt > days * 864e5; };

// PKCE (RFC 7636): a random verifier and its S256 challenge, base64url without padding
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function pkcePair(random = n => crypto.getRandomValues(new Uint8Array(n))) {
  const verifier = b64url(random(32));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

export function dropboxAuthUrl({ appKey, redirectUri, challenge, state }) {
  const q = new URLSearchParams({ client_id: appKey, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', redirect_uri: redirectUri, state, token_access_type: 'online' });
  return `https://www.dropbox.com/oauth2/authorize?${q}`;
}
// the Dropbox-API-Arg header must be ASCII: anything else as \uXXXX (Dropbox's documented way)
export const dropboxArg = obj => JSON.stringify(obj).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
// the folder search for Drive (drive.file only lists what this app made); quotes in names escaped
export const driveQuery = (name, { folder = false, parent = '' } = {}) =>
  [`name = '${String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`, 'trashed = false', folder ? "mimeType = 'application/vnd.google-apps.folder'" : '', parent ? `'${parent}' in parents` : ''].filter(Boolean).join(' and ');

// Google's OAuth page for a Drive token (implicit grant: the token comes back in the address's #fragment)
export function googleAuthUrl({ clientId, redirectUri, state, loginHint = '' }) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'token', scope: DRIVE_SCOPE, state, include_granted_scopes: 'true' });
  if (loginHint) q.set('login_hint', loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

// Coming back from Google or Dropbox (index.html keeps the raw address): Dropbox puts its answer in ?query,
// Google in #fragment. Our states start dbx- / gdr-; anything else isn't ours (null).
export function parseCloudReturn({ search = '', hash = '' } = {}) {
  const q = new URLSearchParams(search), f = new URLSearchParams(String(hash).replace(/^#/, ''));
  const qs = q.get('state') || '', fs = f.get('state') || '';
  if (/^dbx-/.test(qs)) return { to: 'dropbox', state: qs, code: q.get('code') || '', error: q.get('error_description') || q.get('error') || '' };
  if (/^gdr-/.test(fs)) return { to: 'drive', state: fs, token: f.get('access_token') || '', expiresIn: Number(f.get('expires_in')) || 3600, error: f.get('error_description') || f.get('error') || '' };
  return null;
}

// The app's own dated files (backup .json / .json.gz and the notes zip) older than keepDays before today, to
// delete after a save. Today's files and anything else in the folder are never chosen; keepDays 0 keeps all.
const DATED = /^(?:logbook-backup-(\d{4}-\d{2}-\d{2})\.json(?:\.gz)?|apmes-logbook-notes-(\d{4}-\d{2}-\d{2})\.zip)$/;
export function staleBackups(names, today, keepDays) {
  if (!keepDays) return [];
  const cut = new Date(Date.parse(today + 'T00:00:00Z') - keepDays * 864e5).toISOString().slice(0, 10);
  return names.filter(n => { const m = DATED.exec(n); return m && (m[1] || m[2]) < cut; });
}
