// Bulk edit… for Notes (More → Notes → Select): the shared popup (ui-bulk.js) with the notes' fields: date (set or
// clear), title (replace / add in front / find and replace), text (add to the end / find and replace), unlink from the
// case. Actions: merge the selected notes into one (in date order; the originals go to the bin, Undo brings them back),
// copy / share / send / download just these, move them to the bin. Saves go through the write queue with the version
// each change was made from, as a typed save does; Undo puts back the notes nobody has changed since.
import { bulkDialog, exportButtons, textFields, field, plural } from './ui-bulk.js';
import { applyNoteChange, noteOverwrites, noteChangeLines, noteMissing, noteNone, noteEmpty, mergeNotes } from './note-bulk.js';
import { notesMd, noteTitle, cleanNote, MAX_NOTES, cappedNotes } from './notepad.js';
import { S, h, toast, writes } from './ui-core.js';
import { fmtDate, uid } from './engine.js';
import { moveToBin, restoreFromBin } from './bin.js';
import { notesChanged, downloadNoteFiles } from './ui-notepad.js';

const word = 'note';
const summary = n => [n.date ? fmtDate(n.date) : 'No date', noteTitle(n).slice(0, 60), n.caseId ? '↗ case' : ''].filter(Boolean).join(' · ');
const same = (a, b) => ['date', 'title', 'body', 'caseId'].every(k => (a?.[k] ?? null) === (b?.[k] ?? null));

// Save notes: each through the write queue with its base; this device's list changes at once. -> { saved, failed, error }
export async function saveNotes(pairs) {
  const me = S.user && S.user.email;
  if (!me) return { saved: 0, failed: pairs.length, error: new Error('Not signed in') };
  const r = await Promise.allSettled(pairs.map(p => writes.save('note', me, cleanNote(p.next, p.next.updatedAt), p.base)));
  const done = new Map(), out = { saved: 0, failed: 0, error: null };
  r.forEach((x, i) => { if (x.status === 'fulfilled') { out.saved++; done.set(pairs[i].next.id, x.value || cleanNote(pairs[i].next, pairs[i].next.updatedAt)); } else { out.failed++; out.error = out.error || x.reason; } });
  if (S.user?.email === me && Array.isArray(S.notes)) S.notes = S.notes.map(n => done.get(n.id) || n);
  notesChanged();
  return out;
}
const said = (r, text) => (r.failed ? `${text}; ${r.failed} not saved (${r.error?.message || 'error'})` : text);

export function notesBulkDialog(notes, { onDone = () => {} } = {}) {
  if (!notes.length) return toast('Select some notes first');
  const ch = noteNone();
  const these = () => notes.map(n => (S.notes || []).find(x => x.id === n.id)).filter(Boolean);
  return bulkDialog({
    title: `Bulk edit ${plural(notes.length, word)}`, word, ch, count: notes.length,
    rows: row => [
      row('Date', [['set', 'Set to…'], ['clear', 'Clear']], v => {
        ch.date = v === 'clear' ? { clear: true } : v ? { set: '' } : null;
        return v === 'set' ? field({ type: 'date', 'aria-label': 'New date' }, x => { ch.date.set = x; }) : null;
      }),
      row('Title', [['replace', 'Replace with…'], ['prefix', 'Add in front…'], ['find', 'Find and replace…']], v => {
        ch.title = v ? { mode: v, text: '', find: '', with: '' } : null;
        return v ? textFields(v, ch.title, { what: v === 'replace' ? 'New title' : 'Text to add in front' }) : null;
      }),
      row('Text', [['append', 'Add to the end…'], ['find', 'Find and replace…']], v => {
        ch.body = v ? { mode: v, text: '', find: '', with: '' } : null;
        return v ? textFields(v, ch.body, { what: 'Text to add' }) : null;
      }),
      row('Linked case', [['unlink', 'Unlink']], v => { ch.unlink = v ? true : null; })],
    empty: noteEmpty,
    missing: noteMissing,
    plan: now => {
      const pairs = [], list = these();
      let long = 0;
      for (const n of list) {
        const next = applyNoteChange(n, ch, now);
        if (next && next.tooLong) long++; else if (next) pairs.push({ base: n, next });
      }
      const skipped = list.length - pairs.length;
      return { pairs, skipped, why: long ? `${long} would be longer than a note can hold` : skipped ? 'already as chosen, or daily notes keeping their day' : '' };
    },
    lines: c => noteChangeLines(c, { day: fmtDate }), overwrites: noteOverwrites, summary,
    actions: close => exportButtons(close, {
      count: () => these().length, text: () => notesMd(these()), word,
      extra: [
        h('button', { class: 'small', onclick: async () => { await close(); merge(these(), onDone); } }, 'Merge into one'),
        h('button', { class: 'small', onclick: async () => { await close(); downloadNoteFiles(these()); } }, 'Download (zip)')],
      bin: async () => { const list = these(); if (!list.length) return; await moveToBin('note', list, { toast: true }); onDone(); notesChanged(); } }),
    save: async pairs => {
      const r = await saveNotes(pairs);
      onDone();
      toast(said(r, `${plural(r.saved, word)} updated`), r.saved ? { action: 'Undo', onaction: () => undo(pairs) } : {});
    },
  });
}
export async function undo(pairs) {
  const now = Date.now(), back = [];
  let moved = 0;
  for (const p of pairs) {
    const cur = (S.notes || []).find(x => x.id === p.next.id);
    if (cur && same(cur, p.next)) back.push({ base: cur, next: { ...p.base, updatedAt: now } }); else moved++;
  }
  if (!back.length) return toast('Nothing to undo: they have all changed since');
  const r = await saveNotes(back);
  toast(said(r, `${plural(r.saved, word)} put back${moved ? ` (${moved} changed since, left as ${moved === 1 ? 'it is' : 'they are'})` : ''}`));
}

// Merge into one: a new note with each selected one under its title (date order), then the originals to the bin
async function merge(list, onDone) {
  const r = mergeNotes(list, { id: uid() });
  if (r.error) return toast(r.error);
  const me = S.user && S.user.email;
  if (!me) return;
  if (cappedNotes(S.notes || []).length >= MAX_NOTES) return toast(`You have ${MAX_NOTES} notes, the most allowed. Delete some first.`);
  try {
    const made = await writes.save('note', me, cleanNote(r.note, r.note.updatedAt), null);
    if (Array.isArray(S.notes)) S.notes = [made || r.note, ...S.notes];
    const binned = await moveToBin('note', list, { toast: false });
    onDone(); notesChanged();
    toast(`${list.length} notes merged into one`, { action: 'Undo', onaction: async () => {
      try {
        await Promise.all(binned.map(e => restoreFromBin(e.id)));
        const cur = (S.notes || []).find(n => n.id === r.note.id);
        if (cur) await moveToBin('note', cur, { toast: false });
        notesChanged();
      } catch (err) { toast('Could not undo: ' + err.message); }
    } });
  } catch (err) { toast('Could not merge: ' + err.message); }
}
