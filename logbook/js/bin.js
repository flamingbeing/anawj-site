// Recycle bin: deleted cases, reflections and notes are kept for 30 days, then purged.
//   logbooks/{email}/bin/{id} = { id, kind: 'case' | 'reflection' | 'note', data: <the item>, deletedAt }   owner only
// A binned reflection's figures stay in logbooks/{email}/images until its bin entry is purged or
// deleted forever, so a restore brings the figures back too.
//
// moveToBin(kind, item | items)  copy into the bin, then delete the original (cases also leave S.cases at once)
// restoreFromBin(binId)          write it back (same id, or a new one if a live item already has that id)
// deleteForever(binId)           drop the entry (and a reflection's images) now
// purgeExpired()                 drop entries older than 30 days; app.js runs it once after sign-in
// renderBin() / openBin()        the bin view (element) / the same in a dialog

import { S, h, toast, modal, confirmBox, cloud, writes, fill, removeCase, deleteMany, restoreCase, miniChips, resetters } from './ui-core.js';
import { cleanNote, noteTitle, MAX_NOTES } from './notepad.js';
import { cleanCase } from './demo-backend.js';
import { cleanReflection } from './reflections.js';
import { REFLECTION_HEADINGS } from './categories.js';
import { uid, fmtDate, caseText } from './engine.js';

export const BIN_DAYS = 30;
const DAY = 864e5;
const mine = () => S.user.email;

// ---- pure helpers (node-tested) ----

export const binId = (kind, id, now = Date.now()) => `${kind === 'case' ? 'c' : kind === 'note' ? 'n' : 'r'}_${String(id).slice(0, 60)}_${now.toString(36)}`;
export const daysAgo = (deletedAt, now = Date.now()) => Math.max(0, Math.floor((now - deletedAt) / DAY));
export const daysLeft = (deletedAt, now = Date.now()) => Math.max(0, Math.ceil((deletedAt + BIN_DAYS * DAY - now) / DAY));
export const isExpired = (e, now = Date.now()) => !(Number(e.deletedAt) > now - BIN_DAYS * DAY);
export const imageIdsOf = e => (e && e.kind === 'reflection' && Array.isArray(e.data && e.data.figures))
  ? e.data.figures.map(f => f && f.id).filter(Boolean) : [];
export function binLabel(e, now = Date.now()) {
  const ago = daysAgo(e.deletedAt, now), left = daysLeft(e.deletedAt, now);
  return `deleted ${ago === 0 ? 'today' : ago === 1 ? '1 day ago' : ago + ' days ago'} · ${left} day${left === 1 ? '' : 's'} left`;
}
export function binEntry(kind, item, now = Date.now()) {
  if (kind !== 'case' && kind !== 'reflection' && kind !== 'note') throw new Error('Unknown bin kind: ' + kind);
  const data = kind === 'case' ? cleanCase(item, item.updatedAt || now) : kind === 'note' ? cleanNote(item, item.updatedAt || now) : cleanReflection(item);
  return { id: binId(kind, data.id, now), kind, data, deletedAt: now };
}

// ---- moving in and out ----

let binCache = [];   // last list seen by a bin watcher (for undo lookups); refreshed on demand
resetters.push(() => { binCache = []; });   // never hand one user's deleted cases to the next

// Returns the bin entry (or entries, for an array). Never deletes the original if the copy failed.
export async function moveToBin(kind, item, extra = {}) {
  const items = Array.isArray(item) ? item : [item];
  if (!items.length) return [];
  const owner = mine(), now = Date.now();
  const entries = items.map((it, i) => binEntry(kind, it, now + i));   // distinct ids for same-id items
  // in parallel: offline, each write waits up to ACK_WAIT before it counts as queued
  await Promise.all(entries.map(e => cloud.saveBinEntry(owner, e)));
  if (S.user?.email !== owner) throw new Error('Account changed; the original record has not been deleted');
  binCache = [...entries, ...binCache];
  if (kind === 'case') {
    if (entries.length === 1) await removeCase(entries[0].data.id);
    else await deleteMany(entries.map(e => e.data.id));
  } else if (kind === 'note') {
    // through the write queue, so it works offline; the open notes list drops them at once
    await Promise.all(entries.map(e => writes.save('note', owner, { id: e.data.id, _deleted: true }, items.find(x => x.id === e.data.id) || null)));
    if (Array.isArray(S.notes)) { const gone = new Set(entries.map(e => e.data.id)); S.notes = S.notes.filter(n => !gone.has(n.id)); }
  } else {
    await Promise.all(entries.map(e => cloud.deleteReflection(mine(), e.data.id)));
    if (Array.isArray(S.reflections)) {
      const gone = new Set(entries.map(e => e.data.id));
      S.reflections = S.reflections.filter(r => !gone.has(r.id));
    }
  }
  if (extra.toast) {
    const n = entries.length, what = kind === 'case' ? 'case' : kind === 'note' ? 'note' : 'reflection';
    toast(`${n === 1 ? what[0].toUpperCase() + what.slice(1) : n + ' ' + what + 's'} moved to the recycle bin`, {
      action: 'Undo', onaction: () => Promise.all(entries.map(e => restoreFromBin(e.id))).catch(err => toast('Could not restore: ' + err.message)),
    });
  }
  return Array.isArray(item) ? entries : entries[0];
}

async function findEntry(id) {
  let e = binCache.find(x => x.id === id);
  if (!e) { binCache = await cloud.listBin(mine()); e = binCache.find(x => x.id === id); }
  return e || null;
}

// Restores the item; returns it (with its id, which is new if the old one was taken).
export async function restoreFromBin(id) {
  const e = await findEntry(id);
  if (!e) throw new Error('Not in the recycle bin any more');
  let out;
  if (e.kind === 'case') {
    out = { ...e.data };
    if (S.cases.some(c => c.id === out.id)) out.id = uid();
    await restoreCase(out);    // updates S.cases, the counts and the summary
  } else if (e.kind === 'note') {
    // the notes may not be loaded yet (they load on first use): load them, so the limit and the id check hold
    const have = (await (await import('./ui-notepad.js')).ensureNotes().catch(() => null)) || S.notes || [];
    if (have.length >= MAX_NOTES) throw new Error(`you already have ${MAX_NOTES} notes; delete one first`);
    out = { ...e.data };
    if (have.some(n => n.id === out.id)) out.id = uid();
    out = await writes.save('note', mine(), out, null);
  } else {
    out = { ...e.data };
    if ((S.reflections || []).some(r => r.id === out.id)) out.id = uid();
    out = await cloud.saveReflection(mine(), out);
  }
  await cloud.deleteBinEntry(mine(), e.id);
  binCache = binCache.filter(x => x.id !== e.id);
  return out;
}

export async function deleteForever(id) {
  const e = await findEntry(id);
  await cloud.deleteBinEntry(mine(), id);
  binCache = binCache.filter(x => x.id !== id);
  if (e) await dropImages([e]);
}

// images still used by a live reflection (e.g. a restored copy) are kept
async function dropImages(entries) {
  const live = new Set((S.reflections || []).flatMap(r => (r.figures || []).map(f => f && f.id)));
  const keepBin = new Set(binCache.filter(x => !entries.includes(x)).flatMap(imageIdsOf));
  for (const img of entries.flatMap(imageIdsOf)) {
    if (live.has(img) || keepBin.has(img)) continue;
    await cloud.deleteImage(mine(), img).catch(err => console.warn('Could not delete image', img, err));
  }
}

const purged = new Set();
// It reads the whole bin, so at most once a day per account on this device (and once per page load); entries a day
// past their 30 are hidden from the view anyway. Wiped at sign-out with the other device copies (cloud.forgetLocal).
export const PURGED_KEY = 'apmes-logbook-purged:';
const lastPurge = who => { try { return Number(localStorage.getItem(PURGED_KEY + who)) || 0; } catch { return 0; } };
// Returns the number of entries purged.
export async function purgeExpired({ now = Date.now(), force = false } = {}) {
  if (!S.user) return 0;
  const who = mine();
  if ((purged.has(who) || Math.abs(now - lastPurge(who)) < DAY) && !force) return 0;
  purged.add(who);
  binCache = await cloud.listBin(who);
  try { localStorage.setItem(PURGED_KEY + who, String(now)); } catch { /* storage blocked */ }
  const old = binCache.filter(e => isExpired(e, now));
  if (!old.length) return 0;
  for (const e of old) await cloud.deleteBinEntry(who, e.id);
  binCache = binCache.filter(e => !old.includes(e));
  await dropImages(old);
  return old.length;
}

// ---- the view ----

const HEADING = Object.fromEntries(REFLECTION_HEADINGS.map(x => [x.id, x.name]));

function row(e) {
  const d = e.data || {};
  const isCase = e.kind === 'case', isNote = e.kind === 'note';
  const what = isCase ? 'case' : isNote ? 'note' : 'reflection';
  const title = isCase ? (caseText(d) || '(no details)') : isNote ? noteTitle(d) : (d.title || d.diagnosis || '(untitled reflection)');
  const sub = isCase
    ? [h('span', {}, d.date ? fmtDate(d.date) : (d.dateText || 'no date')), ' ', miniChips(d.cats)]
    : isNote ? [h('span', {}, d.date ? fmtDate(d.date) : 'No date')]
    : [h('span', {}, [HEADING[d.headingId] || d.headingId || '', d.date ? ' · ' + fmtDate(d.date) : ''].join(''))];
  return h('li', { class: 'bin-row' },
    h('span', { class: 'bin-kind ' + e.kind, title: what[0].toUpperCase() + what.slice(1) }, isCase ? 'Case' : isNote ? 'Note' : 'Refl'),
    h('div', { class: 'bin-main' },
      h('div', { class: 'bin-title' }, title),
      h('div', { class: 'bin-sub' }, sub),
      h('div', { class: 'bin-when hint' }, binLabel(e))),
    h('div', { class: 'bin-actions' },
      h('button', { class: 'small primary', onclick: async ev => {
        ev.target.disabled = true;
        try { await restoreFromBin(e.id); toast(what[0].toUpperCase() + what.slice(1) + ' restored'); }
        catch (err) { ev.target.disabled = false; toast('Could not restore: ' + err.message); }
      } }, 'Restore'),
      h('button', { class: 'small danger', onclick: async () => {
        if (!(await confirmBox('Delete forever', `Delete this ${what} for good? This cannot be undone.`, 'Delete forever', true))) return;
        try { await deleteForever(e.id); toast('Deleted for good'); } catch (err) { toast('Could not delete: ' + err.message); }
      } }, 'Delete forever')));
}

// A live view of the bin (stops listening once removed from the page).
export function renderBin({ title = true } = {}) {
  const list = h('div', {}, h('p', { class: 'empty' }, 'Loading…'));
  const el = h('section', { class: title ? 'card bin-view' : 'bin-view' },
    title ? h('h2', {}, 'Recycle bin') : null,
    h('p', { class: 'hint' }, `Deleted cases, reflections and notes are kept for ${BIN_DAYS} days, then removed for good.`),
    list);
  if (!S.user) { fill(list, h('p', { class: 'empty' }, 'Sign in to see your recycle bin.')); return el; }
  let seen = false, stop = null;
  stop = cloud.watchBin(mine(), entries => {
    if (seen && !el.isConnected) { if (stop) stop(); return; }
    seen = true;
    binCache = entries;
    const live = entries.filter(e => !isExpired(e));
    fill(list, live.length
      ? h('ul', { class: 'bin-list' }, live.map(row))
      : h('p', { class: 'empty' }, 'The recycle bin is empty.'));
  });
  // stop listening when the view goes away
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(() => {
    if (seen && !el.isConnected) { if (stop) stop(); mo.disconnect(); }
  }) : null;
  if (mo) setTimeout(() => mo.observe(document.body, { childList: true, subtree: true }), 0);
  return el;
}

export function openBin() {
  return modal('Recycle bin', [renderBin({ title: false }), h('div', { class: 'bar' }, h('span', { class: 'grow' }), h('button', { onclick: ev => ev.target.closest('dialog').close() }, 'Close'))]);
}
