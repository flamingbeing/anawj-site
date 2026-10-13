// Sync's calls to Google Drive, Dropbox and GitHub: read a day's file (its text and version) and write it back
// only if nobody changed it meanwhile. Each remote gives { read(path), write(path, text, prev) }:
//   read  -> { text, rev, id? } or null when there's no file;
//   write -> { rev }, or throws an error with .conflict when the file changed since `prev` (the read's answer,
//            or null for a new file) so the run reads it again and merges. .auth = the sign-in or token was refused.
// The page and the run are in ui-sync.js; what to write in sync-md.js.
//
// Drive (scope drive.file) and Dropbox ("App folder") see only files this app made: a file the user edits keeps
// its id and stays visible, but one another app makes in its place can't be seen (a fresh copy is then written).

import { FOLDER, driveQuery, dropboxArg } from './backup-targets.js';
import { forgetCloudToken } from './cloud-save.js';
import { toBase64, fromBase64, paceWait, rateLimitWait } from './sync-md.js';

const fail = (msg, extra = {}) => Object.assign(new Error(msg), extra);
const conflict = () => fail('changed elsewhere meanwhile', { conflict: true });
const split = path => { const parts = path.split('/').filter(Boolean); return { dirs: parts.slice(0, -1), name: parts[parts.length - 1] }; };
const detail = async res => { const t = await res.text().catch(() => ''); try { const j = JSON.parse(t); return j?.error?.message || j?.error_summary || j?.message || t; } catch { return t; } };

// ---- Google Drive ----

const DRIVE = 'https://www.googleapis.com/drive/v3/files', DRIVE_UP = 'https://www.googleapis.com/upload/drive/v3/files';
const FILE_FIELDS = 'id,name,md5Checksum,headRevisionId,trashed';
const folderIds = new Map();   // "APMES Logbook/Daily" -> id, for this visit and this account
// sign-out and account switch (ui-sync.js forgetSync): the next person's Drive has other folders
export function resetSyncRemote() { folderIds.clear(); ghPuts.length = 0; }

export function driveRemote(token) {
  const call = async (url, init = {}) => {
    const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
    if (res.status === 401) { forgetCloudToken('drive'); throw fail('Google Drive: sign-in expired. Tap Sync again.', { auth: true }); }
    return res;
  };
  const json = async (url, init) => {
    const res = await call(url, init);
    if (!res.ok) throw fail(`Google Drive: ${res.status} ${(await detail(res)).slice(0, 160)}`, { status: res.status });
    return res.json();
  };
  // every match, newest first, page by page (Drive allows two files of one name: the newest is the day's file)
  const findAll = async q => {
    const out = [];
    let pageToken = '';
    do {
      const r = await json(`${DRIVE}?${new URLSearchParams({ q, fields: `nextPageToken,files(${FILE_FIELDS})`, orderBy: 'modifiedTime desc', pageSize: '100', spaces: 'drive', ...(pageToken ? { pageToken } : {}) })}`);
      out.push(...(r.files || []));
      pageToken = r.nextPageToken || '';
    } while (pageToken && out.length < 1000);
    return out;
  };
  // the folder for a path, one level at a time from the app's own "APMES Logbook" folder; made when asked to
  const folder = async (dirs, make) => {
    let parent = '', key = '';
    for (const name of [FOLDER, ...dirs]) {
      key += (key ? '/' : '') + name;
      let id = folderIds.get(key);
      if (!id) {
        const found = (await findAll(driveQuery(name, { folder: true, parent })))[0];
        if (!found && !make) return null;
        id = found ? found.id : (await json(DRIVE, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) }) })).id;
        folderIds.set(key, id);
      }
      parent = id;
    }
    return parent;
  };
  const rev = f => f.md5Checksum || f.headRevisionId || '';
  const upload = (url, method, meta, text) => {
    const body = new FormData();
    body.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    body.append('file', new Blob([text], { type: 'text/markdown' }));
    return json(`${url}${url.includes('?') ? '&' : '?'}${new URLSearchParams({ uploadType: 'multipart', fields: FILE_FIELDS })}`, { method, body });
  };
  return {
    async read(path) {
      const { dirs, name } = split(path);
      const parent = await folder(dirs, false);
      const f = parent && (await findAll(driveQuery(name, { parent })))[0];
      if (!f) return null;
      const res = await call(`${DRIVE}/${encodeURIComponent(f.id)}?alt=media`);
      if (res.status === 404) return null;
      if (!res.ok) throw fail(`Google Drive: ${res.status} ${(await detail(res)).slice(0, 160)}`);
      return { text: await res.text(), rev: rev(f), id: f.id };
    },
    async write(path, text, prev) {
      const { dirs, name } = split(path);
      if (prev) {
        // Drive has no "only if unchanged" upload: check the version just before writing (a second's window)
        const now = await call(`${DRIVE}/${encodeURIComponent(prev.id)}?fields=${FILE_FIELDS}`);
        if (now.status === 404) throw conflict();
        if (!now.ok) throw fail(`Google Drive: ${now.status} ${(await detail(now)).slice(0, 160)}`);
        const meta = await now.json();
        if (meta.trashed || rev(meta) !== prev.rev) throw conflict();
        return { rev: rev(await upload(`${DRIVE_UP}/${encodeURIComponent(prev.id)}`, 'PATCH', {}, text)) };
      }
      let parent = await folder(dirs, true);
      // the folder remembered this visit may have been binned or deleted in Drive since (a file put there would be
      // out of sight, and gone when the bin is emptied): checked, and looked up (or made) again if so
      const there = await call(`${DRIVE}/${encodeURIComponent(parent)}?fields=trashed`);
      if (there.status === 404 || (there.ok && (await there.json()).trashed)) {
        for (const k of [...folderIds.keys()]) if (k === FOLDER || k.startsWith(FOLDER + '/')) folderIds.delete(k);
        parent = await folder(dirs, true);
      }
      if ((await findAll(driveQuery(name, { parent }))).length) throw conflict();   // made by another device meanwhile
      return { rev: rev(await upload(DRIVE_UP, 'POST', { name, parents: [parent], mimeType: 'text/markdown' }, text)) };
    },
  };
}

// ---- Dropbox (paths are inside the app folder) ----

export function dropboxRemote(token) {
  const rpc = async (path, body) => {
    const res = await fetch(`https://api.dropboxapi.com/2/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: dropboxArg(body) });
    if (res.status === 401) { forgetCloudToken('dropbox'); throw fail('Dropbox: sign-in expired. Tap Sync again.', { auth: true }); }
    if (!res.ok) throw fail(`Dropbox: ${res.status} ${(await detail(res)).slice(0, 160)}`);
    return res.json();
  };
  return {
    async read(path) {
      const res = await fetch('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': dropboxArg({ path }) } });
      if (res.status === 401) { forgetCloudToken('dropbox'); throw fail('Dropbox: sign-in expired. Tap Sync again.', { auth: true }); }
      if (res.status === 409) { const d = await detail(res); if (/not_found/.test(d)) return null; throw fail(`Dropbox: ${d.slice(0, 160)}`); }
      if (!res.ok) throw fail(`Dropbox: ${res.status} ${(await detail(res)).slice(0, 160)}`);
      const text = await res.text();
      let rev = '';
      try { rev = JSON.parse(res.headers.get('Dropbox-API-Result') || '{}').rev || ''; } catch { /* asked below */ }
      if (!rev) rev = (await rpc('files/get_metadata', { path })).rev || '';
      return { text, rev };
    },
    async write(path, text, prev) {
      // "update" only replaces the version we read, "add" only makes a new file: anything else is a 409 conflict
      const mode = prev ? { '.tag': 'update', update: prev.rev } : { '.tag': 'add' };
      const res = await fetch('https://content.dropboxapi.com/2/files/upload', { method: 'POST', body: new Blob([text]), headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': dropboxArg({ path, mode, autorename: false, mute: true, strict_conflict: true }) } });
      if (res.status === 401) { forgetCloudToken('dropbox'); throw fail('Dropbox: sign-in expired. Tap Sync again.', { auth: true }); }
      if (res.status === 409) { const d = await detail(res); if (/conflict/.test(d)) throw conflict(); throw fail(`Dropbox: ${d.slice(0, 160)}`); }
      if (!res.ok) throw fail(`Dropbox: ${res.status} ${(await detail(res)).slice(0, 160)}`);
      return { rev: (await res.json()).rev || '' };
    },
  };
}

// ---- GitHub (contents API: the file's sha is its version; a PUT with an old sha is refused) ----

const ghPuts = [];   // when this visit's recent writes went (all GitHub places: the limit is per user)
export function githubRemote(target, token) {
  const url = path => `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const check = async res => {
    if (res.status === 401) throw fail('GitHub: the token was refused (expired or wrong). Enter a new one in Settings → Sync.', { auth: true });
    if (res.status === 403 || res.status === 429) {
      const d = await detail(res), wait = rateLimitWait(res.status, k => res.headers.get(k), d);
      // a limit, not the token: this place stops for the run (the days done are kept), and says when to try again
      if (wait) throw fail(`GitHub is limiting requests: try again in about ${wait} minute${wait === 1 ? '' : 's'}. The days already synced are kept.`, { auth: true, limited: true });
      // (the token's rights or the repository are wrong: every other day would fail the same way, so the place stops)
      throw fail(`GitHub: not allowed (${d.slice(0, 120)}). The token needs Contents: read and write on ${target.owner}/${target.repo}.`, { auth: true });
    }
    // (a read's 404 is "no file yet"; a write's means the repository or branch is missing, or hidden from the token)
    if (res.status === 404) throw fail(`GitHub: ${target.owner}/${target.repo} (branch ${target.branch}) not found, or the token can’t see it.`, { auth: true });
    if (!res.ok) throw fail(`GitHub: ${res.status} ${(await detail(res)).slice(0, 160)}`);
    return res.json();
  };
  return {
    async read(path) {
      // no-store: the browser may otherwise answer from a minute-old copy, with an old sha
      const res = await fetch(`${url(path)}?${new URLSearchParams({ ref: target.branch })}`, { headers, cache: 'no-store' });
      if (res.status === 404) return null;
      const j = await check(res);
      if (Array.isArray(j) || j.type !== 'file') throw fail(`GitHub: ${path} is a folder`);
      if (j.encoding !== 'base64') throw fail(`GitHub: ${path} is too big to sync`);
      return { text: fromBase64(j.content), rev: j.sha };
    },
    async write(path, text, prev) {
      // keep under GitHub's limit on bursts of writes (a first sync of a year is hundreds of commits)
      for (let ms; (ms = paceWait(ghPuts, Date.now())) > 0;) await new Promise(r => setTimeout(r, ms));
      ghPuts.push(Date.now());
      if (ghPuts.length > 600) ghPuts.splice(0, ghPuts.length - 600);   // (an hour's worth, for paceWait)
      const res = await fetch(url(path), { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ message: `Logbook: ${path.split('/').pop()}`, content: toBase64(text), branch: target.branch, ...(prev ? { sha: prev.rev } : {}) }) });
      // 409: the sha is old; 422 "sha wasn't supplied": a file appeared meanwhile
      if (res.status === 409) throw conflict();
      if (res.status === 422) { const d = await detail(res); if (/sha/i.test(d)) throw conflict(); throw fail(`GitHub: ${d.slice(0, 160)}`); }
      return { rev: (await check(res)).content.sha };
    },
  };
}
