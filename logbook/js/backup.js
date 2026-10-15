// Personal backup (More → Export / Import): everything in your logbook as one JSON file you keep, and a
// restore that adds back whatever is missing (it never overwrites or deletes anything). Photos are
// left out (they are for the Word portfolio only); older backups that have them still restore them.
// Both wait for the server's copy first. A new phone, or one signed in again (signing out wipes the device's copy),
// shows an empty list until it arrives: a restore then counted every case and reflection as missing and wrote the
// backup's older copies over newer ones, and a backup held nothing. Notes load on first use, so this device's copy
// may be weeks old.

import { S, h, toast, modal, cloud, writes, download, fileButton, addMissingCases, patchLogbook, todayISO, displayName, catName } from './ui-core.js';
import { cleanCase } from './clean.js';
import { cleanReflection } from './reflections.js';
import { cleanNote, MAX_NOTES, isDayNote, cappedNotes } from './notepad.js';
import { backupToCsv, csvToBackup, looksLikeBackupCsv } from './backup-csv.js';
import { HEADING_BY_ID } from './reflections.js';
import { ensureNotes, notesFromServer } from './ui-notepad.js';

const mine = () => S.user.email;
const FORMAT = 'apmes-logbook-backup';
const STILL_LOADING = 'Your logbook is still loading (no signal?), try again';

// the server's copy of the cases and reflections has arrived (not only this device's): true, or false after ms (no
// signal) or a sign-out
const loaded = () => !!(S.casesSynced && S.reflectionsSynced);
async function logbookLoaded(ms) {
  const me = S.user && S.user.email;
  for (const t0 = Date.now(); !loaded(); await new Promise(r => setTimeout(r, 250)))
    if (Date.now() - t0 > ms || !me || S.user?.email !== me) return false;
  return true;
}
// the same, with the notes too (saying so when it takes a moment)
async function allFromServer(ms) {
  const t0 = Date.now(), slow = setTimeout(() => toast('Loading your logbook first…'), loaded() ? 1500 : 0);
  try {
    if (!(await logbookLoaded(ms))) return false;
    return await notesFromServer(Math.max(0, ms - (Date.now() - t0))).then(() => true, () => false);
  } finally { clearTimeout(slow); }
}

// the note index is rebuilt from the notes, and must never go back into the logbook doc (the app owner can read it)
const noIndex = st => Object.fromEntries(Object.entries(st || {}).filter(([k]) => k !== 'noteIndex'));
// fromServer: everything as the server has it, or an error after wait ms (Save to Google Drive / Dropbox: they need
// signal anyway, and the file replaces the day's there). Without it: as this device has it now.
export async function makeBackup({ fromServer = false, wait = 30e3 } = {}) {
  if (fromServer) {
    if (!(await logbookLoaded(wait))) throw new Error('your logbook didn’t finish loading (no signal?). Tap Save again.');
    await notesFromServer(wait, 'Save');
  }
  const reflections = S.reflections || [];
  const lb = S.logbook || {};
  // personal notes load on first use; on a new device with a stalled connection their first answer can take long: then
  // the notes this device has (the downloads say the file is this device's copy)
  let timer;
  const notes = (await Promise.race([ensureNotes().catch(() => null), new Promise(r => { timer = setTimeout(r, fromServer ? wait : 5e3); })])) || S.notes || [];
  clearTimeout(timer);
  return {
    format: FORMAT, version: 1, exportedAt: new Date().toISOString(), email: mine(), name: displayName(),
    logbook: { name: lb.name || '', settings: noIndex(lb.settings), templates: lb.templates || [], profile: lb.profile || null },
    cases: S.cases || [], reflections, notes,
  };
}

// gzip (the browser's own CompressionStream): Drive / Dropbox backups are about 4x smaller as .json.gz
export const gzipBlob = (text, type = 'application/gzip') => new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob().then(b => new Blob([b], { type }));
// a backup file's text, plain .json or .json.gz (told apart by gzip's first two bytes, not the name)
export async function backupText(file) {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] !== 0x1f || head[1] !== 0x8b) return file.text();
  return new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

// The downloads: the server's copy if it comes within 10 s. With no signal, this device's copy (a backup made offline
// still helps; the toast says what it is), unless this device has nothing yet: a file with no cases would look like a
// backup. -> { data, full } or null (still loading)
const DEVICE_ONLY = ' (this device’s copy: it may miss recent changes from your other devices)';
async function backupForDownload() {
  const full = await allFromServer(10e3);
  if (!full && !S.casesSynced && !(S.cases || []).length && !(S.reflections || []).length) return null;
  return { data: await makeBackup(), full };
}

// the same backup as one spreadsheet (backup-csv.js): Excel shows it; Restore reads it back
export async function downloadBackupCsv(btn) {
  btn.disabled = true;
  try {
    const got = await backupForDownload();
    if (!got) toast(STILL_LOADING);
    else {
      const { data, full } = got;
      download(`logbook-backup-${todayISO()}.csv`, new Blob([backupToCsv(data, { catName, headingName: id => (HEADING_BY_ID[id] && HEADING_BY_ID[id].name) || id || '' })], { type: 'text/csv' }));
      toast(`Spreadsheet saved: ${data.cases.length} cases, ${data.reflections.length} reflections, ${data.notes.length} notes${full ? '' : DEVICE_ONLY}`);
    }
  } catch (err) { toast('Could not make the spreadsheet: ' + err.message); }
  btn.disabled = false;
}

export async function downloadBackup(btn) {
  btn.disabled = true;
  try {
    const got = await backupForDownload();
    if (!got) toast(STILL_LOADING);
    else {
      const { data, full } = got;
      download(`logbook-backup-${todayISO()}.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }));
      toast(`Backup saved: ${data.cases.length} cases, ${data.reflections.length} reflections, ${data.notes.length} notes${full ? '' : DEVICE_ONLY}`);
    }
  } catch (err) { toast('Could not make the backup: ' + err.message); }
  btn.disabled = false;
}

// What a backup adds: only what this logbook doesn't have (the lists as they are now: worked out again when Restore
// is tapped). Exported for the tests.
export function restorePlan(data) {
  const haveCases = new Set((S.cases || []).map(c => c.id));
  const haveRefl = new Set((S.reflections || []).map(r => r.id));
  const cases = data.cases.filter(c => c && c.id && !haveCases.has(c.id)).map(c => cleanCase(c, c.updatedAt || Date.now()));
  const refl = (data.reflections || []).filter(r => r && r.id && !haveRefl.has(r.id)).map(r => cleanReflection(r));
  const imgIds = new Set(refl.flatMap(r => (r.figures || []).map(f => f.id)));
  // notes: only missing ones, and never past the note limit (daily notes don't count, so they always fit)
  const haveNotes = S.notes || [];
  const haveNoteIds = new Set(haveNotes.map(n => n.id));
  const room = Math.max(0, MAX_NOTES - cappedNotes(haveNotes).length);
  const missingNotes = (Array.isArray(data.notes) ? data.notes : []).filter(n => n && n.id && !haveNoteIds.has(n.id));
  const missingDaily = missingNotes.filter(isDayNote), missingOther = cappedNotes(missingNotes);
  const notes = [...missingDaily, ...missingOther.slice(0, room)].map(n => cleanNote(n, n.updatedAt || Date.now()));
  const images = Object.values(data.images || {}).filter(img => img && imgIds.has(img.id));
  const tpl = (data.logbook && Array.isArray(data.logbook.templates) ? data.logbook.templates : []);
  const haveTpl = new Set(((S.logbook && S.logbook.templates) || []).map(t => t.id));
  const newTpl = tpl.filter(t => t && t.id && !haveTpl.has(t.id));
  // portfolio details, name and settings: only what this account doesn't have yet
  const lbNow = S.logbook || {}, bk = data.logbook || {};
  const profile = bk.profile && !lbNow.profile ? bk.profile : null;
  const name = bk.name && !String(lbNow.name || '').trim() ? bk.name : null;
  const setNow = lbNow.settings || {};
  const newSettings = Object.fromEntries(Object.entries(bk.settings && typeof bk.settings === 'object' ? noIndex(bk.settings) : {}).filter(([k]) => !(k in setNow)));
  const extra = [profile ? 'your portfolio details' : '', name ? 'your name' : '', Object.keys(newSettings).length ? 'settings you haven’t set here' : ''].filter(Boolean);
  const nothing = !cases.length && !refl.length && !notes.length && !newTpl.length && !extra.length;
  return { cases, refl, notes, missingNotes, images, newTpl, profile, name, newSettings, extra, nothing };
}

async function restoreBackup(file) {
  let data;
  try { const text = await backupText(file); data = looksLikeBackupCsv(text) ? csvToBackup(text, FORMAT) : JSON.parse(text); } catch { toast('That file is not a logbook backup'); return; }
  if (!data || data.format !== FORMAT || !Array.isArray(data.cases)) { toast('That file is not a logbook backup'); return; }
  // what's missing is worked out against the whole logbook as the server has it (the notes too), never a list still
  // loading
  if (!(await allFromServer(30e3))) { toast(STILL_LOADING); return; }
  const { cases, refl, notes, missingNotes, newTpl, extra, nothing } = restorePlan(data);
  const other = data.email && data.email !== mine() ? h('p', { class: 'tip' }, `This backup is from ${data.email}. Its cases will be added to your logbook (${mine()}).`) : null;
  const m = modal('Restore from backup', [
    other,
    h('p', {}, nothing ? 'Everything in this backup is already in your logbook.'
      : `Add ${cases.length} case${cases.length === 1 ? '' : 's'}, ${refl.length} reflection${refl.length === 1 ? '' : 's'}, ${notes.length} note${notes.length === 1 ? '' : 's'} and ${newTpl.length} tag group${newTpl.length === 1 ? '' : 's'} that are missing here${extra.length ? ', and ' + extra.join(', ') : ''}?`),
    missingNotes.length > notes.length ? h('p', { class: 'tip' }, `${missingNotes.length - notes.length} note${missingNotes.length - notes.length === 1 ? '' : 's'} won’t fit: you can keep ${MAX_NOTES} notes.`) : null,
    h('p', { class: 'hint' }, `Backup from ${data.exportedAt ? new Date(data.exportedAt).toLocaleString() : 'an unknown date'}. Nothing already in your logbook is changed or deleted.`),
    h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, nothing ? 'Close' : 'Cancel'),
      nothing ? null : h('button', { class: 'primary', onclick: async () => {
        m.close();
        toast('Restoring…');   // (first a look at what the server has: a moment for a big logbook)
        // again now: the lists may have changed while the dialog was open. Cases and reflections are written only
        // where the server has none with that id (cloud.addMissing), so even a list that missed one never overwrites it
        const p = restorePlan(data);
        try {
          const added = p.cases.length ? await addMissingCases(p.cases) : [];
          if (S.resident) for (const img of p.images) await cloud.saveImage(mine(), img);   // photos: programme residents only (rules)
          const addedRefl = p.refl.length ? await cloud.addMissing(mine(), 'reflection', p.refl) : [];
          // a note with a change made elsewhere still to choose is kept in Recent changes; the rest of the restore goes on
          let held = 0;
          for (const n of p.notes) await writes.save('note', mine(), n, null).catch(err => { if (writes.status('note', n.id) !== 'conflict') throw err; held++; });   // (base null: never over an existing note)
          if (p.newTpl.length) await patchLogbook({ templates: [...((S.logbook && S.logbook.templates) || []), ...p.newTpl] });
          if (p.extra.length) await patchLogbook({ ...(p.profile ? { profile: p.profile } : {}), ...(p.name ? { name: p.name } : {}), ...(Object.keys(p.newSettings).length ? { settings: p.newSettings } : {}) });
          toast(`Restored ${added.length} cases, ${addedRefl.length} reflections${p.notes.length - held ? `, ${p.notes.length - held} notes` : ''}${held ? ` (${held} changed elsewhere: see Recent changes)` : ''}`);
        } catch (err) { toast('Restore stopped: ' + err.message); }
      } }, 'Restore')),
  ]);
}

// extra: more ways to keep a copy, shown under the backup file (the Excel spreadsheet)
export function backupCard(...extra) {
  const btn = h('button', { onclick: () => downloadBackup(btn) }, 'Download backup');
  const csvBtn = h('button', { onclick: () => downloadBackupCsv(csvBtn) }, 'Download as one spreadsheet');
  return h('section', { class: 'card' },
    h('h2', {}, 'Backup'),
    extra.length ? h('h3', {}, 'Backup file') : null,
    h('p', { class: 'hint help' }, 'Keep your own copy of your cases, reflections, notes, tag groups, settings and portfolio details as one file. Photos are not included. Restoring adds back anything missing and never deletes.'),
    h('div', { class: 'bar', style: 'margin-bottom:0' }, btn, fileButton('Restore from backup…', '.json,.gz,.csv,application/json,application/gzip,text/csv', restoreBackup)),
    h('h3', { style: 'margin-top:16px' }, 'One spreadsheet (CSV)'),
    h('p', { class: 'hint help' }, 'The same backup as one spreadsheet you can open in Excel: a row for each case, reflection and note (photos left out). Restore from backup reads it too, using its Data column, so keep that column as it is.'),
    h('div', { class: 'bar', style: 'margin-bottom:0' }, csvBtn),
    ...extra);
}
