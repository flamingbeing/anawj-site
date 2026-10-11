// Sharing cases to your own notes: one case or a day's list as plain text (system share sheet, or
// the clipboard). The layout is the user's (share-format.js). Only the date, initials and details:
// no tags (owner's choice). Never anything else.

import { S, toast, settings } from './ui-core.js';
import { formatCase, formatDay } from './share-format.js';


// the user's format (Settings → Copy & share), or the default
export const caseText = c => formatCase(c, settings().shareFormat);
export const dayCases = date => (S.cases || []).filter(c => c.date === date).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
// the day's cases, or the ones given (the Logbook's calendar passes what the filter shows)
export const dayText = (date, cases = null) => formatDay(date, cases ? [...cases].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)) : dayCases(date), settings().shareFormat);

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
