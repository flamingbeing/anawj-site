// Sync (Settings → Sync): one Markdown file per day in the user's own Google Drive, Dropbox or GitHub repo.
// The app owns only a marked block in each file, so anything the user writes around it is kept; when they
// edit inside the block too, the app's changes are merged line by line (both kept, marked, where they clash).
// No DOM and no network here, so it is unit-tested (test/sync-md.test.mjs). The calls are in sync-remote.js,
// the page and the run in ui-sync.js.

import { fill, cleanMarkdown, reflectionPath, reflectionNote } from './markdown.js';
import { fingerprint } from './destinations.js';
import { merge3, MINE_MARK, SPLIT_MARK, THEIRS_MARK } from './merge3.js';

export { fingerprint };
export const START = '<!-- logbook:start -->';
// the start mark carries the fingerprint of the app's text written there (<!-- logbook:start fp=… -->), so any
// device, even one that never synced this day, can tell an untouched block from one the user edited
const START_RE = /<!-- logbook:start(?: fp=([\w.]{1,40}))? -->/;
export const END = '<!-- logbook:end -->';
export const KINDS = ['drive', 'dropbox', 'github'];
export const KIND_NAMES = { drive: 'Google Drive', dropbox: 'Dropbox', github: 'GitHub' };
export const MAX_TARGETS = 6;
export const DEFAULT_FILE = '{date}.md';
export const DRIVE_DIR = 'Daily';     // under the "APMES Logbook" folder the backups use
export const DROPBOX_DIR = '/Daily';  // in the Dropbox app folder (Apps/APMES Logbook)
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const lf = t => String(t ?? '').replace(/\r\n?/g, '\n');
const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n) : '');

// ---- the app's block in a file ----

export const wrapBlock = (text, fp = '') => `${fp ? START.replace(' -->', ` fp=${fp} -->`) : START}\n${lf(text).replace(/\n+$/, '')}\n${END}`;

// { before, inner, after, fp } around the first block, or null when the file has none. A start mark whose end mark
// was deleted runs to the end of the file (so what follows is merged as the user's, never dropped).
export function extractBlock(fileText) {
  const t = String(fileText ?? '');
  const sm = START_RE.exec(t);
  if (!sm) return null;
  const s = sm.index;
  let from = s + sm[0].length;
  if (t.startsWith('\r\n', from)) from += 2; else if (t[from] === '\n') from += 1;
  const e = t.indexOf(END, from);
  const to = e < 0 ? t.length : e;
  return { before: t.slice(0, s), inner: lf(t.slice(from, to)).replace(/\n$/, ''), after: e < 0 ? '' : t.slice(e + END.length), fp: sm[1] || '' };
}

// the file with its block replaced by newBlock (added at the end when it has none); the user's text outside the
// block is left exactly as it was, and the block takes the file's line endings
export function replaceBlock(fileText, newBlock) {
  const t = String(fileText ?? '');
  const block = /\r\n/.test(t) ? lf(newBlock).replace(/\n/g, '\r\n') : lf(newBlock);
  const nl = /\r\n/.test(t) ? '\r\n' : '\n';
  if (!t.trim()) return block + nl;
  const b = extractBlock(t);
  if (b) return b.before + block + (b.after || nl);
  return t.replace(/(\r?\n)*$/, '') + nl + nl + block + nl;
}

// ---- three-way merge, line by line (merge3.js; daily notes use it too) ----

export { merge3, MINE_MARK, SPLIT_MARK, THEIRS_MARK };
const lines = s => (s === '' ? [] : lf(s).split('\n'));

// every line of x, in order, is in y (y only adds lines to x)
function within(x, y) {
  let j = 0;
  for (const l of y) if (j < x.length && x[j] === l) j++;
  return j === x.length;
}

// What to write for one day. remoteText: the file as it is now (null = no file); inner: the day's text from the
// app; last: { fp, base } from this device's last sync of this day (fp of the app's text then; base = that text,
// kept on this device, may be missing). -> { text, write, conflicts, merged }
export function planDay({ remoteText = null, inner, last = null }) {
  const mine = lf(inner).replace(/\n+$/, ''), fp = fingerprint(mine);
  const block = wrapBlock(mine, fp);
  if (remoteText == null) return { text: block + '\n', write: true, conflicts: 0, merged: false };
  const ext = extractBlock(remoteText);
  const keep = { text: remoteText, write: false, conflicts: 0, merged: false };
  if (ext && ext.inner === mine) return keep;
  // the file already holds this very text of the app's, with the user's edits merged in (another device wrote it,
  // or this one before its ledger was cleared): nothing to add
  if (ext && ext.fp === fp) return keep;
  let text, conflicts = 0, merged = false;
  if (!ext) text = replaceBlock(remoteText, block);
  // untouched since the app wrote it (the mark's fingerprint, or this device's ledger, matches what's there)
  else if ((ext.fp && ext.fp === fingerprint(ext.inner)) || (last && last.fp === fingerprint(ext.inner))) text = replaceBlock(remoteText, block);
  else {
    // edited inside the block: apply the app's changes since last time onto the user's version. With no base on
    // this device: if the app's text has every line of the file's block (the user only deleted, or nothing was
    // edited at all), the app's text goes in; otherwise both versions are kept, marked.
    // (this device's base only while the block's mark still has this device's last text: once another device has
    // written the block, the base would count that device's cases as the user's edits, and duplicate them)
    const own = last && typeof last.base === 'string' && (!ext.fp || ext.fp === last.fp);
    const m = own ? merge3(last.base, mine, ext.inner)
      : !ext.inner.trim() || within(lines(ext.inner), lines(mine)) ? { text: mine, conflicts: 0 }
      : { text: [MINE_MARK, mine, SPLIT_MARK, ext.inner, THEIRS_MARK].join('\n'), conflicts: 1 };
    // the mark keeps the app's fingerprint, never the merged text's: so the block reads as edited by the user
    text = replaceBlock(remoteText, wrapBlock(m.text, fp));
    conflicts = m.conflicts; merged = m.text !== mine;
  }
  return { text, write: text !== remoteText, conflicts, merged };
}

// ---- GitHub's limits on writes ----
// GitHub refuses bursts of content writes (a "secondary rate limit", about 80 a minute) with 403 or 429. The run
// keeps under it (paceWait), and stops for that place when it is hit anyway (rateLimitWait).
export const GH_PER_MIN = 60;
export const GH_PER_HOUR = 450;   // (GitHub allows 500 content-creating requests an hour)
// ms to wait before the next write, given the times of recent writes (the last hour's)
export function paceWait(times, now, perMin = GH_PER_MIN, perHour = GH_PER_HOUR) {
  const wait = (span, max) => {
    const recent = times.filter(t => now - t < span).sort((a, b) => a - b);
    return recent.length < max ? 0 : recent[recent.length - max] + span - now;
  };
  return Math.max(wait(60e3, perMin), wait(3600e3, perHour));
}
// a refused request that is a rate limit -> minutes to wait (at least 1); null when it is something else
export function rateLimitWait(status, header, body, now = Date.now()) {
  const get = k => (typeof header === 'function' ? header(k) : null);
  if (status !== 429 && status !== 403) return null;
  const after = Number(get('retry-after')), reset = Number(get('x-ratelimit-reset'));
  if (status === 403 && !/rate limit/i.test(String(body || '')) && get('x-ratelimit-remaining') !== '0' && !(after > 0)) return null;
  // (the reset time is the hourly window's: only when that is used up; a secondary limit says retry-after, or a minute)
  const ms = after > 0 ? after * 1000 : reset > 0 && String(get('x-ratelimit-remaining')) === '0' ? reset * 1000 - now : 60e3;
  return Math.max(1, Math.ceil(ms / 60e3));
}

// ---- file names ----

// the day's file path from the name pattern: {date} (2026-10-13), {year}, {month}, {day}; "/" makes folders.
// Each part is made safe for Drive, Dropbox and GitHub alike; a pattern with no date in it still gives one file a day.
export function dayFileName(fmt, date) {
  const [year, month, day] = String(date).split('-');
  let pattern = String(fmt || '').replace(/\n.*/s, '').trim() || DEFAULT_FILE;
  const has = k => new RegExp(`\\{\\{?${k}\\}\\}?`).test(pattern);
  if (!has('date') && !(has('year') && has('month') && has('day'))) pattern = pattern.replace(/(\.md)?$/i, ' {date}$1');
  const name = fill(pattern, { date, year, month, day });
  const parts = name.split('/').map(p => p.replace(/[\\:*?"<>|\u0000-\u001f\u007f]/g, '').replace(/^\.+$/, '').trim()).filter(Boolean);
  return parts.join('/') || `${date}.md`;
}

// ---- where to sync (account setting, may travel in the settings file; never tokens) ----

const NAME_RE = /^[\w.-]{1,100}$/, BRANCH_RE = /^[\w./-]{1,100}$/;
export function cleanTarget(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t) || !KINDS.includes(t.kind)) return null;
  const out = {
    id: str(t.id, 20).replace(/[^\w-]/g, '') || Math.random().toString(36).slice(2, 8),
    kind: t.kind,
    name: str(t.name, 40) || KIND_NAMES[t.kind],
    fileName: str(t.fileName, 120) || DEFAULT_FILE,
    from: ISO.test(t.from || '') ? t.from : '',
    // also a note per reflection (log2 15; off unless chosen), so the day's Link and Embed find them
    ...(t.reflections === true ? { reflections: true } : {}),
  };
  if (t.kind === 'github') {
    out.owner = NAME_RE.test(str(t.owner, 100)) ? str(t.owner, 100) : '';
    out.repo = NAME_RE.test(str(t.repo, 100)) ? str(t.repo, 100) : '';
    out.branch = BRANCH_RE.test(str(t.branch, 100)) ? str(t.branch, 100) : 'main';
    out.folder = str(t.folder, 100).split('/').map(p => p.replace(/[\\:*?"<>|]/g, '').replace(/^\.+$/, '').trim()).filter(Boolean).join('/');
  }
  return out;
}
export const targetReady = t => !!t && (t.kind !== 'github' || !!(t.owner && t.repo));
export function cleanSync(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const seen = new Set();
  const targets = (Array.isArray(o.targets) ? o.targets : []).map(cleanTarget).filter(Boolean)
    .filter(t => (seen.has(t.id) ? false : seen.add(t.id))).slice(0, MAX_TARGETS);
  return { targets, remind: !!o.remind };
}
// the path of the day's file inside the destination
export const targetPath = (t, date) => placePath(t, dayFileName(t.fileName, date));
// a file's path inside the destination (beside the day files)
export function placePath(t, name) {
  if (t.kind === 'dropbox') return `${DROPBOX_DIR}/${name}`;
  if (t.kind === 'github') return (t.folder ? t.folder + '/' : '') + name;
  return `${DRIVE_DIR}/${name}`;
}

// ---- reflection notes (Sync → "Also sync reflection notes"; log2 15) ----
// One file per reflection, named and foldered as the Markdown export names them (Reflections/2026-10/…), beside the
// day files, so the day's Link and Embed (Settings → Markdown) find them. In a stable order, so a reflection keeps its
// name between runs while its date, heading and title stay. No front matter (it must open a file, and the app writes
// inside its marked block) and no figures. Ledger keys are "r:<id>"; a reflection renamed gets a new file and the
// old one is left as it is (sync never deletes a file); a deleted reflection's file stays too.
export const REFL_KEY = /^r:[\w-]{1,40}$/;
export function reflectionFiles(reflections, m) {
  const f = { ...cleanMarkdown(m), frontMatter: false }, used = new Set();
  const order = [...(reflections || [])].filter(r => r && r.id && !r.deleted)
    .sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')) || (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
  return order.map(r => { const path = reflectionPath(r, f, used); return { key: 'r:' + String(r.id).replace(/[^\w-]/g, '').slice(0, 40), id: r.id, date: r.date || '', path, text: reflectionNote(r, f, { path }) }; });
}
// the reflection notes to write for one place: new, changed, or under a new name -> [{ key, path, renamed }]
export function changedRefls(ledger, id, files, fps) {
  const was = (ledger && ledger[id]) || {};
  return files.filter(x => !(was[x.key] && was[x.key].fp === fps[x.key] && was[x.key].path === x.path))
    .map(x => ({ ...x, renamed: !!(was[x.key] && was[x.key].path && was[x.key].path !== x.path) }));
}

// ---- the ledger: what this device last synced, per destination and day ----
// { [targetId]: { [date]: { fp, rev? } } }: fp = fingerprint of the app's text for the day then, rev = the
// file's version at the destination after the write (Drive md5, Dropbox rev, GitHub sha).
export function cleanSyncLedger(l) {
  const out = {};
  if (!l || typeof l !== 'object' || Array.isArray(l)) return out;
  for (const [id, days] of Object.entries(l).slice(0, 40)) {
    if (!days || typeof days !== 'object' || Array.isArray(days)) continue;
    const ok = ([d, v]) => v && typeof v === 'object' && typeof v.fp === 'string';
    const entry = ([d, v]) => [d, { fp: v.fp.slice(0, 20), ...(typeof v.rev === 'string' && v.rev ? { rev: v.rev.slice(0, 100) } : {}), ...(typeof v.path === 'string' && v.path ? { path: v.path.slice(0, 300) } : {}) }];
    const kept = [...Object.entries(days).filter(([d, v]) => ISO.test(d) && ok([d, v]))
      .sort(([x], [y]) => (x < y ? -1 : 1)).slice(-5000),   // the latest dates, if ever that many
    ...Object.entries(days).filter(([k, v]) => REFL_KEY.test(k) && ok([k, v])).slice(0, 2000)].map(entry);   // reflection notes
    out[String(id).slice(0, 20)] = Object.fromEntries(kept);
  }
  return out;
}
export function markSynced(ledger, id, date, fp, rev = '', path = '') {
  const l = cleanSyncLedger(ledger);
  l[id] = { ...(l[id] || {}), [date]: { fp, ...(rev ? { rev } : {}), ...(path ? { path } : {}) } };
  return l;
}
// Which place a target id's ledger was written for. This device's ledger and bases follow a target id, but the
// target can be pointed somewhere else from another device (account settings) or a settings file: the old ledger
// would then say every day is synced there. state = { ledger, at, places }; targets = every place set up now.
// -> { state, drop }: ids whose ledger (and bases) no longer apply (removed, or now another place) are dropped.
export const placeOf = t => JSON.stringify(['kind', 'owner', 'repo', 'branch', 'folder', 'fileName'].map(k => (t && t[k]) || ''));
export function reconcileSyncState(s, targets) {
  const now = new Map((targets || []).map(t => [t.id, placeOf(t)]));
  const ledger = { ...(s && s.ledger) }, at = { ...(s && s.at) }, places = { ...(s && s.places) }, drop = [];
  for (const id of new Set([...Object.keys(ledger), ...Object.keys(at), ...Object.keys(places)]))
    if (!now.has(id) || (places[id] && places[id] !== now.get(id))) { drop.push(id); delete ledger[id]; delete at[id]; delete places[id]; }
  for (const [id, p] of now) places[id] = p;
  return { state: { ...s, ledger, at, places }, drop };
}
// the days to sync for one destination: fps = { date: fingerprint of the day's text now }; a day the ledger
// has but fps doesn't (all its cases deleted) is the caller's to include, with its now-empty text
export const changedDays = (ledger, id, fps) => Object.keys(fps || {}).filter(d => ISO.test(d) && !(ledger && ledger[id] && ledger[id][d] && ledger[id][d].fp === fps[d])).sort();

// ---- UTF-8 base64 (GitHub's contents API) ----
export function toBase64(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export const fromBase64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(String(b64 || '').replace(/\s+/g, '')), c => c.charCodeAt(0)));
