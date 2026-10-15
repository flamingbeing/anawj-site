// Personal backup (More → Export / Import): everything in your logbook as one JSON file you keep, and a
// restore that adds back whatever is missing (it never overwrites or deletes anything). Photos are
// left out (they are for the Word portfolio only); older backups that have them still restore them.

import { S, h, toast, modal, cloud, writes, download, fileButton, saveMany, patchLogbook, todayISO, displayName, catName } from './ui-core.js';
import { cleanCase } from './clean.js';
import { cleanReflection } from './reflections.js';
import { cleanNote, MAX_NOTES, isDayNote, cappedNotes } from './notepad.js';
import { backupToCsv, csvToBackup, looksLikeBackupCsv } from './backup-csv.js';
import { HEADING_BY_ID } from './reflections.js';
import { ensureNotes } from './ui-notepad.js';

const mine = () => S.user.email;
const FORMAT = 'apmes-logbook-backup';

// the note index is rebuilt from the notes, and must never go back into the logbook doc (the app owner can read it)
const noIndex = st => Object.fromEntries(Object.entries(st || {}).filter(([k]) => k !== 'noteIndex'));
export async function makeBackup() {
  const reflections = S.reflections || [];
  const lb = S.logbook || {};
  const notes = (await ensureNotes().catch(() => null)) || [];   // personal notes load on first use
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

// the same backup as one spreadsheet (backup-csv.js): Excel shows it; Restore reads it back
export async function downloadBackupCsv(btn) {
  btn.disabled = true;
  try {
    const data = await makeBackup();
    download(`logbook-backup-${todayISO()}.csv`, new Blob([backupToCsv(data, { catName, headingName: id => (HEADING_BY_ID[id] && HEADING_BY_ID[id].name) || id || '' })], { type: 'text/csv' }));
    toast(`Spreadsheet saved: ${data.cases.length} cases, ${data.reflections.length} reflections, ${data.notes.length} notes`);
  } catch (err) { toast('Could not make the spreadsheet: ' + err.message); }
  btn.disabled = false;
}

export async function downloadBackup(btn) {
  btn.disabled = true;
  try {
    const data = await makeBackup();
    download(`logbook-backup-${todayISO()}.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }));
    toast(`Backup saved: ${data.cases.length} cases, ${data.reflections.length} reflections, ${data.notes.length} notes`);
  } catch (err) { toast('Could not make the backup: ' + err.message); }
  btn.disabled = false;
}

async function restoreBackup(file) {
  let data;
  try { const text = await backupText(file); data = looksLikeBackupCsv(text) ? csvToBackup(text, FORMAT) : JSON.parse(text); } catch { toast('That file is not a logbook backup'); return; }
  if (!data || data.format !== FORMAT || !Array.isArray(data.cases)) { toast('That file is not a logbook backup'); return; }
  const haveCases = new Set((S.cases || []).map(c => c.id));
  const haveRefl = new Set((S.reflections || []).map(r => r.id));
  const cases = data.cases.filter(c => c && c.id && !haveCases.has(c.id)).map(c => cleanCase(c, c.updatedAt || Date.now()));
  const refl = (data.reflections || []).filter(r => r && r.id && !haveRefl.has(r.id)).map(r => cleanReflection(r));
  const imgIds = new Set(refl.flatMap(r => (r.figures || []).map(f => f.id)));
  // notes: only missing ones, and never past the 100-note limit (daily notes don't count, so they always fit)
  const haveNotes = await ensureNotes().catch(() => null) || [];
  const haveNoteIds = new Set(haveNotes.map(n => n.id));
  const room = Math.max(0, MAX_NOTES - cappedNotes(haveNotes).length);
  const missingNotes = (Array.isArray(data.notes) ? data.notes : []).filter(n => n && n.id && !haveNoteIds.has(n.id));
  const missingDaily = missingNotes.filter(isDayNote), missingOther = cappedNotes(missingNotes);
  const notes = [...missingDaily, ...missingOther.slice(0, room)].map(n => cleanNote(n, n.updatedAt || Date.now()));
  const images = Object.values(data.images || {}).filter(img => img && imgIds.has(img.id));
  const tpl = (data.logbook && Array.isArray(data.logbook.templates) ? data.logbook.templates : []);
  const haveTpl = new Set(((S.logbook && S.logbook.templates) || []).map(t => t.id));
  const newTpl = tpl.filter(t => t && t.id && !haveTpl.has(t.id));
  const other = data.email && data.email !== mine() ? h('p', { class: 'tip' }, `This backup is from ${data.email}. Its cases will be added to your logbook (${mine()}).`) : null;
  // portfolio details, name and settings: only what this account doesn't have yet
  const lbNow = S.logbook || {}, bk = data.logbook || {};
  const profile = bk.profile && !lbNow.profile ? bk.profile : null;
  const name = bk.name && !String(lbNow.name || '').trim() ? bk.name : null;
  const setNow = lbNow.settings || {};
  const newSettings = Object.fromEntries(Object.entries(bk.settings && typeof bk.settings === 'object' ? noIndex(bk.settings) : {}).filter(([k]) => !(k in setNow)));
  const extra = [profile ? 'your portfolio details' : '', name ? 'your name' : '', Object.keys(newSettings).length ? 'settings you haven’t set here' : ''].filter(Boolean);
  const nothing = !cases.length && !refl.length && !notes.length && !newTpl.length && !extra.length;
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
        try {
          if (cases.length) await saveMany(cases);
          if (S.resident) for (const img of images) await cloud.saveImage(mine(), img);   // photos: programme residents only (rules)
          for (const r of refl) await cloud.saveReflection(mine(), r);
          // a note with a change made elsewhere still to choose is kept in Recent changes; the rest of the restore goes on
          let held = 0;
          for (const n of notes) await writes.save('note', mine(), n, null).catch(err => { if (writes.status('note', n.id) !== 'conflict') throw err; held++; });
          if (newTpl.length) await patchLogbook({ templates: [...((S.logbook && S.logbook.templates) || []), ...newTpl] });
          if (extra.length) await patchLogbook({ ...(profile ? { profile } : {}), ...(name ? { name } : {}), ...(Object.keys(newSettings).length ? { settings: newSettings } : {}) });
          toast(`Restored ${cases.length} cases, ${refl.length} reflections${notes.length - held ? `, ${notes.length - held} notes` : ''}${held ? ` (${held} changed elsewhere: see Recent changes)` : ''}`);
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
