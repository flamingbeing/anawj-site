// Save to Google Drive / Dropbox: the app's public ids (set once by the app owner; see README "Firebase
// setup", step 6) and the pure helpers (no DOM; tested in test/backup-targets.test.mjs).
//
// Neither id is a secret: Drive uses a web OAuth client (Google Identity Services token client, scope
// drive.file: the app sees only the files it made), Dropbox a public app key with PKCE ("App folder" access:
// the app sees only Apps/<app name>/). No server: the phone talks to Google and Dropbox directly.
// Empty = not set up yet: the buttons say so.

export const GOOGLE_CLIENT_ID = '';
export const DROPBOX_APP_KEY = '';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const FOLDER = 'APMES Logbook';
export const REMIND_DAYS = 7;

// Settings → the stored choice ({ remind, md, lastAt, lastTo }), cleaned
export function cleanCloudBackup(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  return {
    remind: !!o.remind, md: !!o.md,
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

// The popup's return (?code=…&state=dbx-…): the page in the popup hands it to the page that opened it and closes
export const isDropboxReturn = (search, hasOpener) => hasOpener && /^dbx-/.test(new URLSearchParams(search).get('state') || '');
