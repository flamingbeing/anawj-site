// Bulk edit for Notes (More → Notes → Select → Bulk edit…): the changes chosen in the popup, applied to one note at a
// time, and merging the selected notes into one. Pure (test/note-bulk.test.mjs); the case version is bulk-change.js.
//
// ch: {
//   date: { set: '2026-10-01' } | { clear: true } | null   (a daily note keeps its day: its id is the date)
//   title: { mode: 'replace' | 'find' | 'prefix', text, find, with } | null
//   body: { mode: 'append' | 'find', text, find, with } | null
//   unlink: true | null   (from its case)
// }
// Find and replace matches capitals exactly (as for cases).
import { LIMITS, isDayNote, sortNotes, noteTitle } from './notepad.js';

export const noteNone = () => ({ date: null, title: null, body: null, unlink: null });
export const noteEmpty = ch => !ch || Object.values(ch).every(v => v == null);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const swap = (s, find, rep) => s.replace(new RegExp(escapeRe(String(find)), 'g'), String(rep ?? ''));

// -> the changed note, null when nothing changes for it, or { tooLong: true }
export function applyNoteChange(n, ch, now = Date.now()) {
  const was = { date: n.date || '', title: String(n.title || ''), body: String(n.body || ''), caseId: n.caseId || '' };
  const next = { ...was };
  if (ch.date && !isDayNote(n)) { if (ch.date.clear) next.date = ''; else if (ISO.test(ch.date.set || '')) next.date = ch.date.set; }
  if (ch.title) {
    const t = ch.title, text = String(t.text || '').trim();
    if (t.mode === 'replace' && text) next.title = text;
    else if (t.mode === 'prefix' && text) next.title = next.title.trim() ? `${text} ${next.title.trim()}` : text;
    else if (t.mode === 'find' && t.find) next.title = swap(next.title, t.find, t.with).trim();
  }
  if (ch.body) {
    const b = ch.body, text = String(b.text || '').trim();
    if (b.mode === 'append' && text) next.body = next.body.trim() ? `${next.body.replace(/\s+$/, '')}\n${text}` : text;
    else if (b.mode === 'find' && b.find) next.body = swap(next.body, b.find, b.with);
  }
  if (ch.unlink) next.caseId = '';
  if (next.title.length > LIMITS.title || next.body.length > LIMITS.body) return { tooLong: true };
  if (Object.keys(was).every(k => was[k] === next[k])) return null;
  const out = { ...n, title: next.title, body: next.body, updatedAt: now };
  if (next.date) out.date = next.date; else out.date = null;
  if (next.caseId) out.caseId = next.caseId; else delete out.caseId;
  return out;
}

// Does it replace or take away what is there? (adding to the end or in front does not)
export const noteOverwrites = ch => !!((ch.date) || (ch.title && ch.title.mode !== 'prefix') || (ch.body && ch.body.mode !== 'append') || ch.unlink);

export function noteChangeLines(ch, { day = d => d } = {}) {
  const out = [];
  if (ch.date) out.push(ch.date.clear ? 'Date: cleared (daily notes keep their day)' : `Date: set to ${day(ch.date.set)} (daily notes keep their day)`);
  if (ch.title) out.push(ch.title.mode === 'replace' ? `Title: replaced with “${ch.title.text}”` : ch.title.mode === 'prefix' ? `Title: “${ch.title.text}” added in front`
    : `Title: “${ch.title.find}” replaced with “${ch.title.with || ''}”${ch.title.with ? '' : ' (taken out)'}`);
  if (ch.body) out.push(ch.body.mode === 'append' ? `Text: “${ch.body.text}” added to the end` : `Text: “${ch.body.find}” replaced with “${ch.body.with || ''}”${ch.body.with ? '' : ' (taken out)'}`);
  if (ch.unlink) out.push('Linked case: unlinked');
  return out;
}

export function noteMissing(ch) {
  if (ch.date && !ch.date.clear && !ISO.test(ch.date.set || '')) return 'Choose the date';
  for (const [k, what] of [['title', 'title'], ['body', 'text']]) {
    const x = ch[k]; if (!x) continue;
    if (x.mode === 'find' ? !x.find : !String(x.text || '').trim()) return x.mode === 'find' ? 'Type what to find' : `Type the ${what}`;
  }
  return '';
}

// Merge (Actions): the selected notes as one, in date order: each under its title as a heading. The earliest date; the
// case when they all share one. -> { note } or { error }
export function mergeNotes(list, { id, now = Date.now() } = {}) {
  if (list.length < 2) return { error: 'Select two or more notes to merge' };
  const order = sortNotes(list).slice().reverse();   // sortNotes is newest first
  const body = order.map(n => [`## ${noteTitle(n)}${n.date ? ` (${n.date})` : ''}`, String(n.body || '').trim()].filter(Boolean).join('\n')).join('\n\n');
  if (body.length > LIMITS.body) return { error: `Too long for one note (${body.length} of ${LIMITS.body} characters)` };
  const dates = order.map(n => n.date).filter(Boolean).sort();
  const cases = new Set(order.map(n => n.caseId || ''));
  const note = { id, date: dates[0] || null, title: `Merged: ${noteTitle(order[0])}`.slice(0, LIMITS.title), body, createdAt: now, updatedAt: now };
  if (cases.size === 1 && order[0].caseId) note.caseId = order[0].caseId;
  return { note };
}
