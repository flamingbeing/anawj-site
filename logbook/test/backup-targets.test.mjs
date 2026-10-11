// Save to Google Drive / Dropbox: the pure helpers (js/backup-targets.js). The sign-ins and uploads need the
// owner's ids and a browser, so they are checked by hand (README).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cleanCloudBackup, backupDue, pkcePair, dropboxAuthUrl, dropboxArg, driveQuery, isDropboxReturn, DRIVE_SCOPE, REMIND_DAYS } from '../js/backup-targets.js';

assert.equal(DRIVE_SCOPE, 'https://www.googleapis.com/auth/drive.file');   // only the files the app makes
assert.deepEqual(cleanCloudBackup(null), { remind: false, md: false, lastAt: 0, lastTo: '' });
assert.deepEqual(cleanCloudBackup({ remind: 1, md: 'yes', lastAt: -5, lastTo: 'ftp', extra: 1 }), { remind: true, md: true, lastAt: 0, lastTo: '' });

// the reminder: only when asked for, and the last backup is older than a week (or there was none)
const day = 864e5, now = 100 * day;
assert.equal(REMIND_DAYS, 7);
assert.equal(backupDue({ remind: false, lastAt: 0 }, now), false);
assert.equal(backupDue({ remind: true, lastAt: 0 }, now), true);
assert.equal(backupDue({ remind: true, lastAt: now - 6 * day }, now), false);
assert.equal(backupDue({ remind: true, lastAt: now - 8 * day }, now), true);

// PKCE: S256 of the verifier, base64url without padding
const { verifier, challenge } = await pkcePair(n => new Uint8Array(n).fill(7));
assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));

const u = new URL(dropboxAuthUrl({ appKey: 'k', redirectUri: 'https://anawj.com/logbook/', challenge: 'c', state: 'dbx-1' }));
assert.equal(u.origin + u.pathname, 'https://www.dropbox.com/oauth2/authorize');
assert.deepEqual(Object.fromEntries(u.searchParams), { client_id: 'k', response_type: 'code', code_challenge: 'c', code_challenge_method: 'S256', redirect_uri: 'https://anawj.com/logbook/', state: 'dbx-1', token_access_type: 'online' });

// Dropbox's header must be ASCII; Drive queries escape quotes
assert.equal(dropboxArg({ path: '/APMES Logbook/café.json' }), '{"path":"/APMES Logbook/caf\\u00e9.json"}');
assert.deepEqual(JSON.parse(dropboxArg({ path: '/é' })), { path: '/é' });
assert.equal(driveQuery("O'Neil", { folder: true }), "name = 'O\\'Neil' and trashed = false and mimeType = 'application/vnd.google-apps.folder'");
assert.equal(driveQuery('a.json', { parent: 'F1' }), "name = 'a.json' and trashed = false and 'F1' in parents");

// the popup's return is recognised only in a popup, with our state
assert.equal(isDropboxReturn('?code=x&state=dbx-12', true), true);
assert.equal(isDropboxReturn('?code=x&state=dbx-12', false), false);
assert.equal(isDropboxReturn('?code=x&state=other', true), false);

console.log('backup targets tests passed');
