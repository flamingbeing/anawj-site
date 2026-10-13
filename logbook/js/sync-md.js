// Sync (Settings → Sync): one Markdown file per day in the user's own Google Drive, Dropbox or GitHub repo.
// The app owns only a marked block in each file, so anything the user writes around it is kept; when they
// edit inside the block too, the app's changes are merged line by line (both kept, marked, where they clash).
// No DOM and no network here, so it is unit-tested (test/sync-md.test.mjs). The calls are in sync-remote.js,
// the page and the run in ui-sync.js.

import { fill } from './markdown.js';
import { fingerprint } from './destinations.js';

export { fingerprint };
export const START = '<!-- logbook:start -->';
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

export const wrapBlock = text => `${START}\n${lf(text).replace(/\n+$/, '')}\n${END}`;

// { before, inner, after } around the first block, or null when the file has none. A start mark whose end mark
// was deleted runs to the end of the file (so what follows is merged as the user's, never dropped).
export function extractBlock(fileText) {
  const t = String(fileText ?? '');
  const s = t.indexOf(START);
  if (s < 0) return null;
  let from = s + START.length;
  if (t.startsWith('\r\n', from)) from += 2; else if (t[from] === '\n') from += 1;
  const e = t.indexOf(END, from);
  const to = e < 0 ? t.length : e;
  return { before: t.slice(0, s), inner: lf(t.slice(from, to)).replace(/\n$/, ''), after: e < 0 ? '' : t.slice(e + END.length) };
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

// ---- three-way merge, line by line ----

const lines = s => (s === '' ? [] : lf(s).split('\n'));
// longest common subsequence of two line lists: for each line of a, the matching line of b (or -1)
function lcs(a, b) {
  const n = a.length, m = b.length, match = new Array(n).fill(-1);
  // trim the common start and end first (most edits are small), so the table stays small
  let lo = 0;
  while (lo < n && lo < m && a[lo] === b[lo]) { match[lo] = lo; lo++; }
  let hiA = n, hiB = m;
  while (hiA > lo && hiB > lo && a[hiA - 1] === b[hiB - 1]) { hiA--; hiB--; match[hiA] = hiB; }
  const rows = hiA - lo, cols = hiB - lo;
  if (!rows || !cols) return match;
  if (rows * cols > 4e6) return match;   // a huge rewrite: no middle matches (it merges as one change)
  const w = cols + 1, t = new Uint32Array((rows + 1) * w);
  for (let i = rows - 1; i >= 0; i--)
    for (let j = cols - 1; j >= 0; j--)
      t[i * w + j] = a[lo + i] === b[lo + j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
  for (let i = 0, j = 0; i < rows && j < cols;) {
    if (a[lo + i] === b[lo + j]) { match[lo + i] = lo + j; i++; j++; }
    else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) i++; else j++;
  }
  return match;
}
const same = (x, y) => x.length === y.length && x.every((l, i) => l === y[i]);
const startsWith = (x, y) => y.length <= x.length && y.every((l, i) => l === x[i]);
const endsWith = (x, y) => y.length <= x.length && y.every((l, i) => l === x[x.length - y.length + i]);
// one changed stretch: the side that changed wins; when both changed, lines one side only added before or after
// the old ones go round the other side's edit (the app adds a case under the line the user annotated); lines both
// added at the very end are both kept, the app's first. null = a real clash.
function resolve(co, ca, cb, atEnd) {
  if (same(ca, co)) return cb;
  if (same(cb, co) || same(ca, cb)) return ca;
  if (!co.length) return atEnd ? [...ca, ...cb] : null;
  if (startsWith(ca, co)) return [...cb, ...ca.slice(co.length)];
  if (endsWith(ca, co)) return [...ca.slice(0, ca.length - co.length), ...cb];
  if (startsWith(cb, co)) return [...ca, ...cb.slice(co.length)];
  if (endsWith(cb, co)) return [...cb.slice(0, cb.length - co.length), ...ca];
  return null;
}

export const MINE_MARK = '<<<<<<< logbook';
export const SPLIT_MARK = '=======';
export const THEIRS_MARK = '>>>>>>> your edits';

// merge3(base, mine, theirs) -> { text, conflicts }: changes made on either side since base are both applied;
// where the two changed the same lines differently, both are kept between git-style marks (mine first).
// Line endings come out as \n.
export function merge3(base, mine, theirs) {
  const o = lines(base), a = lines(mine), b = lines(theirs);
  const ma = lcs(o, a), mb = lcs(o, b);
  const out = [];
  let conflicts = 0, i = 0, ia = 0, ib = 0;
  for (;;) {
    // the next base line that both sides kept
    let j = i;
    while (j < o.length && (ma[j] < 0 || mb[j] < 0)) j++;
    const end = j >= o.length;
    const ja = end ? a.length : ma[j], jb = end ? b.length : mb[j];
    const co = o.slice(i, j), ca = a.slice(ia, ja), cb = b.slice(ib, jb);
    const r = resolve(co, ca, cb, end);
    if (r) out.push(...r);
    else { conflicts++; out.push(MINE_MARK, ...ca, SPLIT_MARK, ...cb, THEIRS_MARK); }
    if (end) break;
    out.push(o[j]);
    i = j + 1; ia = ja + 1; ib = jb + 1;
  }
  return { text: out.join('\n'), conflicts };
}

// What to write for one day. remoteText: the file as it is now (null = no file); inner: the day's text from the
// app; last: { fp, base } from the last sync of this day (fp of the app's text then; base = that text, kept on
// this device, may be missing). -> { text, write, conflicts, merged }
export function planDay({ remoteText = null, inner, last = null }) {
  const block = wrapBlock(inner);
  if (remoteText == null) return { text: block + '\n', write: true, conflicts: 0, merged: false };
  const ext = extractBlock(remoteText);
  let text, conflicts = 0, merged = false;
  if (ext && ext.inner === lf(inner).replace(/\n+$/, '')) return { text: remoteText, write: false, conflicts: 0, merged: false };
  if (!ext) text = replaceBlock(remoteText, block);
  else if (last && last.fp === fingerprint(ext.inner)) text = replaceBlock(remoteText, block);   // untouched since the app wrote it
  else {
    // edited inside the block: apply the app's changes since last time onto the user's version
    // (with no base kept on this device, nothing can say which lines are whose: both versions are kept, marked)
    const mine = lf(inner).replace(/\n+$/, '');
    const m = last && typeof last.base === 'string' ? merge3(last.base, mine, ext.inner)
      : !ext.inner.trim() ? { text: mine, conflicts: 0 }
      : { text: [MINE_MARK, mine, SPLIT_MARK, ext.inner, THEIRS_MARK].join('\n'), conflicts: 1 };
    text = replaceBlock(remoteText, wrapBlock(m.text));
    conflicts = m.conflicts; merged = true;
  }
  return { text, write: text !== remoteText, conflicts, merged };
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
export function targetPath(t, date) {
  const name = dayFileName(t.fileName, date);
  if (t.kind === 'dropbox') return `${DROPBOX_DIR}/${name}`;
  if (t.kind === 'github') return (t.folder ? t.folder + '/' : '') + name;
  return `${DRIVE_DIR}/${name}`;
}

// ---- the ledger: what this device last synced, per destination and day ----
// { [targetId]: { [date]: { fp, rev? } } }: fp = fingerprint of the app's text for the day then, rev = the
// file's version at the destination after the write (Drive md5, Dropbox rev, GitHub sha).
export function cleanSyncLedger(l) {
  const out = {};
  if (!l || typeof l !== 'object' || Array.isArray(l)) return out;
  for (const [id, days] of Object.entries(l).slice(0, 40)) {
    if (!days || typeof days !== 'object' || Array.isArray(days)) continue;
    const kept = Object.entries(days).filter(([d, v]) => ISO.test(d) && v && typeof v === 'object' && typeof v.fp === 'string')
      .sort(([x], [y]) => (x < y ? -1 : 1)).slice(-5000)   // the latest dates, if ever that many
      .map(([d, v]) => [d, { fp: v.fp.slice(0, 20), ...(typeof v.rev === 'string' && v.rev ? { rev: v.rev.slice(0, 100) } : {}) }]);
    out[String(id).slice(0, 20)] = Object.fromEntries(kept);
  }
  return out;
}
export function markSynced(ledger, id, date, fp, rev = '') {
  const l = cleanSyncLedger(ledger);
  l[id] = { ...(l[id] || {}), [date]: { fp, ...(rev ? { rev } : {}) } };
  return l;
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
