// Save to Google Drive / Dropbox: the pure helpers (js/backup-targets.js). The sign-ins and uploads need the
// owner's ids and a browser, so they are checked by hand (README).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cleanCloudBackup, backupDue, pkcePair, dropboxAuthUrl, dropboxArg, driveQuery, googleAuthUrl, parseCloudReturn, staleBackups, DRIVE_SCOPE, REMIND_DAYS } from '../js/backup-targets.js';

assert.equal(DRIVE_SCOPE, 'https://www.googleapis.com/auth/drive.file');   // only the files the app makes
assert.deepEqual(cleanCloudBackup(null), { remind: false, md: false, keepDays: 0, lastAt: 0, lastTo: '' });
assert.deepEqual(cleanCloudBackup({ remind: 1, md: 'yes', keepDays: 7, lastAt: -5, lastTo: 'ftp', extra: 1 }), { remind: true, md: true, keepDays: 0, lastAt: 0, lastTo: '' });
assert.equal(cleanCloudBackup({ keepDays: 30 }).keepDays, 30);

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

const g = new URL(googleAuthUrl({ clientId: 'id', redirectUri: 'https://anawj.com/logbook/', state: 'gdr-1', loginHint: 'a@b.c' }));
assert.equal(g.origin + g.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
assert.deepEqual(Object.fromEntries(g.searchParams), { client_id: 'id', redirect_uri: 'https://anawj.com/logbook/', response_type: 'token', scope: DRIVE_SCOPE, state: 'gdr-1', include_granted_scopes: 'true', login_hint: 'a@b.c' });
assert.equal(new URL(googleAuthUrl({ clientId: 'id', redirectUri: 'r', state: 's' })).searchParams.has('login_hint'), false);

// the way back: Dropbox answers in ?query, Google in #fragment; other states aren't ours
assert.deepEqual(parseCloudReturn({ search: '?code=x&state=dbx-12' }), { to: 'dropbox', state: 'dbx-12', code: 'x', error: '' });
assert.deepEqual(parseCloudReturn({ search: '?error=access_denied&error_description=No&state=dbx-12' }), { to: 'dropbox', state: 'dbx-12', code: '', error: 'No' });
assert.deepEqual(parseCloudReturn({ hash: '#state=gdr-9&access_token=T&expires_in=3599&token_type=Bearer' }), { to: 'drive', state: 'gdr-9', token: 'T', expiresIn: 3599, error: '' });
assert.deepEqual(parseCloudReturn({ hash: '#error=access_denied&state=gdr-9' }), { to: 'drive', state: 'gdr-9', token: '', expiresIn: 3600, error: 'access_denied' });
assert.equal(parseCloudReturn({ search: '?code=x&state=other' }), null);
assert.equal(parseCloudReturn({ hash: '#log' }), null);
assert.equal(parseCloudReturn(), null);

// old backups to delete: only the app's dated files, older than the cut-off; 0 keeps everything
const names = ['logbook-backup-2026-10-12.json.gz', 'logbook-backup-2026-09-12.json.gz', 'logbook-backup-2026-09-11.json', 'apmes-logbook-notes-2026-01-01.zip', 'my-notes.txt', 'logbook-backup-2020-01-01.json.bak', 'logbook-backup-2026-09-11.json.gz'];
assert.deepEqual(staleBackups(names, '2026-10-12', 30), ['logbook-backup-2026-09-11.json', 'apmes-logbook-notes-2026-01-01.zip', 'logbook-backup-2026-09-11.json.gz']);
assert.deepEqual(staleBackups(names, '2026-10-12', 90), ['apmes-logbook-notes-2026-01-01.zip']);
assert.deepEqual(staleBackups(names, '2026-10-12', 0), []);

console.log('backup targets tests passed');
