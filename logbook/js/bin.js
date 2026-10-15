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

import { S, h, toast, modal, confirmBox, cloud, writes, fill, removeCase, restoreCase, toSheet, miniChips, resetters } from './ui-core.js';
import { cleanNote, noteTitle, MAX_NOTES, isDayNote, cappedNotes, mergeDayNote } from './notepad.js';
import { cleanCase } from './clean.js';
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
  // data keeps the binned version's updatedAt: other devices remove their copy only if it is that version (sync.js)
  const data = kind === 'case' ? cleanCase(item, item.updatedAt || now) : kind === 'note' ? cleanNote(item, item.updatedAt || now)
    : { ...cleanReflection(item), updatedAt: Number(item.updatedAt) || now };
  return { id: binId(kind, data.id, now), kind, data, deletedAt: now };
}

// ---- moving in and out ----

let binCache = [];   // last list seen by a bin watcher (for undo lookups); refreshed on demand
resetters.push(() => { binCache = []; });   // never hand one user's deleted cases to the next
const deleteBase = new WeakMap();   // bin entry -> the version its delete checked (extra.base), for rollBack

// Returns the bin entry (or entries, for an array). Never deletes the original if the copy failed.
// extra.base (one reflection): the version the delete checks, when it isn't the item itself: the editor bins what it
// shows (unsaved typing too) but the server has the version it last saved. The bin copy takes that version's stamp, so
// other devices remove their copy of it (sync.js).
export async function moveToBin(kind, item, extra = {}) {
  const items = Array.isArray(item) ? item : [item];
  if (!items.length) return [];
  const owner = mine(), now = Date.now();
  const hasBase = kind === 'reflection' && 'base' in extra && items.length === 1;
  const baseOf = it => (hasBase ? extra.base : it);
  const stamped = it => (hasBase && extra.base && Number(extra.base.updatedAt) > (Number(it.updatedAt) || 0) ? { ...it, updatedAt: extra.base.updatedAt } : it);
  const entries = items.map((it, i) => binEntry(kind, stamped(it), now + i));   // distinct ids for same-id items
  if (hasBase) deleteBase.set(entries[0], extra.base);
  // in parallel: offline, each write waits up to ACK_WAIT before it counts as queued. A Google Form case is also listed
  // for good (form-inbox.js), so its response doesn't bring it back once the bin entry has gone; if that fails, the bin
  // entry still stops it, and the list is written again before the entry goes (keepFormGone)
  await Promise.all([...entries.map(e => cloud.saveBinEntry(owner, e)),
    kind === 'case' ? cloud.addFormGone(owner, entries.map(e => e.data.id)).catch(err => console.warn('Deleted Form case not listed yet', err)) : null]);
  if (S.user?.email !== owner) throw new Error('Account changed; the original record has not been deleted');
  binCache = [...entries, ...binCache];
  // if deleting an original fails it is still there: its copy leaves the bin again, or other devices would hide the
  // record (their bin feed removes that version, sync.js) while it still exists. A delete through the write queue can
  // also fail after it was accepted (a connection that only looks online): watched until it is synced.
  const failed = async (ids, err) => { await rollBack(owner, kind, entries.filter(e => ids.includes(e.data.id))); throw err; };
  if (kind === 'case') {
    // each through the write queue with the version being deleted (as it was before its bin copy was saved: the bin
    // feed has already taken it off S.cases), so a case changed elsewhere meanwhile is kept; a blind batch delete lost
    // an edit made on another device at the same moment (14 Oct 2026). Ten at a time.
    const r = [];
    for (let i = 0; i < items.length; i += 10)
      r.push(...await Promise.allSettled(items.slice(i, i + 10).map(it => removeCase(String(it.id), it))));
    const ok = entries.filter((e, i) => r[i].status === 'fulfilled');
    watchDeletes(owner, kind, ok);
    const bad = r.find(x => x.status === 'rejected');
    if (bad) await failed(entries.filter(e => !ok.includes(e)).map(e => e.data.id), bad.reason);
  } else if (kind === 'note') {
    // through the write queue, so it works offline; the open notes list drops them at once
    const r = await Promise.allSettled(entries.map(e => writes.save('note', owner, { id: e.data.id, _deleted: true }, items.find(x => x.id === e.data.id) || null)));
    const ok = new Set(entries.filter((e, i) => r[i].status === 'fulfilled').map(e => e.data.id));
    if (Array.isArray(S.notes)) S.notes = S.notes.filter(n => !ok.has(n.id));
    watchDeletes(owner, kind, entries.filter(e => ok.has(e.data.id)));
    const bad = r.find(x => x.status === 'rejected');
    if (bad) await failed(entries.map(e => e.data.id).filter(id => !ok.has(id)), bad.reason);
  } else {
    // through the write queue with the version being deleted, as cases and notes: a reflection changed on another
    // device meanwhile (finished on the laptop while this phone showed its outline) is kept. A blind delete lost it,
    // and the bin kept only the outline (audit, 14 Oct 2026). The open list drops them at once.
    const r = await Promise.allSettled(entries.map((e, i) => writes.save('reflection', owner, { id: e.data.id, _deleted: true }, baseOf(items[i]))));
    const ok = new Set(entries.filter((e, i) => r[i].status === 'fulfilled').map(e => e.data.id));
    if (Array.isArray(S.reflections)) S.reflections = S.reflections.filter(x => !ok.has(x.id));
    watchDeletes(owner, kind, entries.filter(e => ok.has(e.data.id)));
    const bad = r.find(x => x.status === 'rejected');
    if (bad) await failed(entries.map(e => e.data.id).filter(id => !ok.has(id)), bad.reason);
  }
  if (extra.toast) {
    const n = entries.length, what = kind === 'case' ? 'case' : kind === 'note' ? 'note' : 'reflection';
    toast(`${n === 1 ? what[0].toUpperCase() + what.slice(1) : n + ' ' + what + 's'} moved to the recycle bin`, {
      action: 'Undo', onaction: () => Promise.all(entries.map(e => restoreFromBin(e.id))).catch(err => toast('Could not restore: ' + err.message)),
    });
  }
  return Array.isArray(item) ? entries : entries[0];
}

// the bin entries of originals whose delete failed come out again; a failed delete in the write queue is set aside
// (archived), so a later Retry can't delete the record with no copy in the bin. The bin feed may already have hidden
// the record (here and on other devices: its tombstone is that version), so it is saved again, stamped after that
// version; not after a conflict (the record changed elsewhere: that newer copy already shows everywhere). A case goes
// back into the response sheet's outbox either way (the delete took its entry out: sheet-outbox.js).
async function rollBack(owner, kind, entries) {
  if (S.user?.email !== owner) return;   // (signed out or switched: the old account's bin can't be reached)
  for (const e of entries) {
    try { await cloud.deleteBinEntry(owner, e.id); binCache = binCache.filter(x => x.id !== e.id); }
    catch (err) { console.warn('Bin entry left after a failed delete', e.id, err); }
    const job = writes.entries().find(x => x.kind === kind && x.record.id === e.data.id && (x.state === 'failed' || x.state === 'conflict'));
    if (job) await writes.archive(job.key).catch(() => {});
    // the record changed elsewhere first: that version stays, so the delete is undone; say so, or the case seems to
    // come back by itself
    if (job && job.state === 'conflict') {
      // archive() keeps newer saves (writes.js), but a restore from the bin queued behind this delete is the binned,
      // older copy: it goes too, or it would meet the newer version as one more conflict
      const latest = writes.jobKey(kind, e.data.id);
      if (latest && latest !== job.key && writes.stateOf(latest) !== 'synced') await writes.archive(latest).catch(() => {});
      // the version kept: the server's copy the conflict reported (or this device's, once it shows again)
      if (kind === 'case') { const kept = job.remote || S.cases.find(c => c.id === e.data.id); if (kept) toSheet([kept]); }
      toast(`A ${kind} you deleted was changed on another device, so it was kept`); continue;
    }
    try {
      if (kind === 'case') { await restoreCase({ ...e.data }, e.data); toSheet([e.data]); }
      else if (kind === 'note') await writes.save('note', owner, { ...e.data }, e.data);
      // (never a blind save: the server may hold a newer version)
      else await writes.save('reflection', owner, { ...e.data }, deleteBase.has(e) ? deleteBase.get(e) : e.data);
    } catch (err) { console.warn('Could not save the record again after a failed delete', e.data.id, err); }
  }
}

// each delete's own job is followed (the latest for that record when it was queued), not the record's latest: a restore
// from the bin queued behind a delete still waiting for signal is a later job, and while it waits the delete's refusal
// would go unseen
function watchDeletes(owner, kind, entries) {
  const left = new Map(entries.map(e => [e.data.id, e]));
  if (!left.size) return;
  const keys = new Map([...left.keys()].map(id => [id, writes.jobKey(kind, id)]));
  let off = null;
  const check = () => {
    for (const [id, e] of [...left]) {
      const st = writes.stateOf(keys.get(id));
      if (st === 'pending') continue;
      left.delete(id);
      if (st === 'failed' || st === 'conflict') rollBack(owner, kind, [e]).catch(err => console.warn('Bin entry left after a failed delete', err));
    }
    if (!left.size && off) { off(); off = null; }
  };
  off = writes.onChange(check);
  check();
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
    const sameId = !S.cases.some(c => c.id === out.id);
    if (!sameId) out.id = uid();
    await restoreCase(out);    // updates S.cases, the counts and the summary
    // back into the response sheet's outbox (the delete took its entry out); never under a new id (a second sheet row)
    if (sameId) toSheet([out]);
  } else if (e.kind === 'note') {
    // the notes may not be loaded yet (they load on first use): load them, so the limit and the id check hold
    const have = (await (await import('./ui-notepad.js')).ensureNotes().catch(() => null)) || S.notes || [];
    out = { ...e.data };
    const now = have.find(n => n.id === out.id);
    // a daily note whose day has a new one since is merged into it (one note a day, and never past the limit)
    if (now && isDayNote(out)) out = await writes.save('note', mine(), mergeDayNote(out, null, now), now);
    else {
      if (cappedNotes(have).length >= MAX_NOTES && !isDayNote(out)) throw new Error(`you already have ${MAX_NOTES} notes; delete one first`);
      if (now) out.id = uid();
      out = await writes.save('note', mine(), out, null);
    }
  } else {
    out = { ...e.data };
    if ((S.reflections || []).some(r => r.id === out.id)) out.id = uid();
    // through the write queue, as notes and cases (base null: never over a copy the server has): queued behind a delete
    // still waiting for signal, so it shows at once and lands after it. A blind save went ahead of that delete, which
    // then removed the restored copy (its content matches the version deleted), with the bin entry already gone
    out = await writes.save('reflection', mine(), out, null);
  }
  await cloud.deleteBinEntry(mine(), e.id);
  binCache = binCache.filter(x => x.id !== e.id);
  return out;
}

// a Form case's id is listed (again) before its bin entry goes for good: the listing at delete time may have failed, or
// the case was deleted before the list existed. If it can't be, the entry stays.
const keepFormGone = (who, entries) => cloud.addFormGone(who, entries.filter(e => e && e.kind === 'case' && e.data).map(e => e.data.id));

export async function deleteForever(id) {
  const e = await findEntry(id);
  if (e) await keepFormGone(mine(), [e]);
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
  await keepFormGone(who, old);
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
