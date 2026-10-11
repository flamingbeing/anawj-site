// Sharing cases to your own notes: one case or a day's list as plain text (system share sheet, or
// the clipboard where sharing isn't available) or as Markdown (Obsidian and similar notebooks).
// Only what the logbook holds: date, initials, details, categories. Never anything else.

import { BY_CODE } from './categories.js';
import { fmtDate, caseParts, sortCodes } from './engine.js';
import { S, toast } from './ui-core.js';

const catNames = c => sortCodes(c.cats || []).map(code => `${code} ${(BY_CODE[code] && BY_CODE[code].name) || ''}`.trim());
const oneLine = s => String(s || '').replace(/\s*\n\s*/g, ' · ').trim();

// "AB 34F LSCS spinal (16 LSCS, 28 Subarachnoid blocks)"
export function caseLine(c) {
  const p = caseParts(c);
  const names = catNames(c);
  return [p.initials, oneLine(p.details)].filter(Boolean).join(' ') + (names.length ? ` (${names.join(', ')})` : '');
}

export function caseText(c) {
  return `${c.date ? fmtDate(c.date) : (c.dateText || 'No date')}\n${caseLine(c)}`;
}

export const dayCases = date => (S.cases || []).filter(c => c.date === date).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

export function dayText(date) {
  const list = dayCases(date);
  return `${fmtDate(date)} · ${list.length} case${list.length === 1 ? '' : 's'}\n` + list.map((c, i) => `${i + 1}. ${caseLine(c)}`).join('\n');
}

// Markdown for a notebook: a heading per day linking the daily note ([[2026-10-10]]), one bullet per
// case, categories as tags (#apmes/16).
export function dayMarkdown(date) {
  const list = dayCases(date);
  const tag = code => `#apmes/${code}`;
  return `## [[${date}]] Cases (${list.length})\n` + list.map(c => {
    const p = caseParts(c);
    return `- ${[p.initials ? `**${p.initials}**` : '', oneLine(p.details)].filter(Boolean).join(' ')} ${sortCodes(c.cats || []).map(tag).join(' ')}`.trim();
  }).join('\n') + '\n';
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
