// Sharing cases to your own notes: one case or a day's list as plain text (system share sheet, or
// the clipboard). The layout is the user's (Settings → Markdown, markdown.js); the default has only the date,
// initials and details: no tags (owner's choice).

import { S, toast, settings, catName, catShort, tagName } from './ui-core.js';
import { cleanMarkdown, mdCase, mdDay } from './markdown.js';
import { notesOn } from './notepad.js';
import { labelsOn } from './parts.js';
import { ensureNotes, dayMayHaveNotes } from './ui-notepad.js';

// the user's Markdown format (an older Copy & share format carries over), and the names they see
export const mdFormat = () => cleanMarkdown(settings().markdown, settings().shareFormat);
// labels: the labelled parts in use (Settings → Advanced logging), for Bold labels in Settings → Markdown; a case's
// reflections and linked notes (Settings → Markdown, under each case: off by default). No reflection notes exist
// where this text goes, so Link and Embed give the full text.
export const mdCtx = () => ({ catName, catShort, tagName, labels: labelsOn(settings()),
  reflectionsOf: c => (S.reflections || []).filter(r => r.caseId === c.id), notesOf: c => (Array.isArray(S.notes) ? S.notes : []).filter(n => n.caseId === c.id) });
export const caseText = c => mdCase(c, mdFormat(), mdCtx());
export const dayCases = date => (S.cases || []).filter(c => c.date === date).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
// the day's cases, or the ones given (the Logbook's calendar passes what the filter shows)
export const dayText = (date, cases = null) => mdDay(date, cases ? [...cases].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)) : dayCases(date), mdFormat(), mdCtx());
// the same with that day's notes (More → Notes): they load first if the day has any (the note index, or may have:
// a full index leaves out older days)
export async function dayTextWithNotes(date, cases = null) {
  const notes = dayMayHaveNotes(date) ? notesOn(await ensureNotes().catch(() => []) || [], date) : [];
  return mdDay(date, cases ? [...cases].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)) : dayCases(date), mdFormat(), mdCtx(), notes);
}

export async function copyText(text, what = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(what); return true; }
  catch { toast('Could not copy on this device'); return false; }
}

// The phone's share sheet (WhatsApp, Notes, Obsidian…); the clipboard where there isn't one.
export async function shareText(text, title = 'APMES Logbook') {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; }
    catch (err) { if (err && err.name === 'AbortError') return; }
  }
  await copyText(text, 'Copied: paste it into your notes');
}
