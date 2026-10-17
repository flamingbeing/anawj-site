// Send to…: where a day or a case can be sent from the Logbook tab (Settings → Send to). A destination is a
// small saved definition: a name, a link template, and how the file is named. The presets are starting points
// (the app's own link format must be checked against the app); any app with a link can be added.
// No DOM here, so it is unit-tested.
//
// Link templates take {content} {title} {file} {date}, each put in URL-encoded. Nothing is sent without a tap.
// What was sent is remembered per device (the ledger below) so the Logbook can say "changed since sent".

import { fill } from './markdown.js';

export const MAX_DESTINATIONS = 12;
export const MAX_LINK = 6000;          // longer than this and the text is copied instead of put in the link
const BAD_SCHEMES = /^(javascript|data|vbscript|file|blob|about|chrome|intent):/i;

export const PRESETS = [
  { id: 'obsidian', name: 'Obsidian', uri: 'obsidian://new?vault=MyVault&file={file}&content={content}', fileName: 'Logbook/{date}', mode: 'replace',
    hint: 'Change MyVault to your vault’s name. The note is made in the Logbook folder.' },
  { id: 'whatsapp', name: 'WhatsApp', uri: 'https://wa.me/?text={content}', fileName: '{date}', mode: 'replace',
    hint: 'Opens WhatsApp to choose who gets it.' },
  { id: 'upnote', name: 'UpNote', uri: 'upnote://x-callback-url/note/new?text={content}', fileName: '{date}', mode: 'replace',
    hint: 'Check this link against UpNote’s own help before relying on it.' },
  // (log2 12, 16 Oct 2026: iPhone users especially. Each link follows the app's own documented format; check each on
  // a real iPhone before relying on it)
  { id: 'applenotes', name: 'Apple Notes (iPhone, via a Shortcut)', uri: 'shortcuts://run-shortcut?name=Logbook%20to%20Notes&input=text&text={content}', fileName: '{date}', mode: 'replace',
    hint: 'Needs a Shortcut named “Logbook to Notes” on the iPhone: see “Apple Notes on an iPhone” below.' },
  { id: 'email', name: 'Email', uri: 'mailto:?subject={title}&body={content}', fileName: '{date}', mode: 'replace',
    hint: 'Opens your mail app with the text in a new email: you choose who gets it.' },
  { id: 'telegram', name: 'Telegram', uri: 'tg://msg?text={content}', fileName: '{date}', mode: 'replace',
    hint: 'Opens Telegram to choose who gets it (needs the Telegram app).' },
  { id: 'drafts', name: 'Drafts', uri: 'drafts://x-callback-url/create?text={content}', fileName: '{date}', mode: 'replace',
    hint: 'Makes a new draft in Drafts.' },
  { id: 'bear', name: 'Bear', uri: 'bear://x-callback-url/create?title={title}&text={content}', fileName: '{date}', mode: 'replace',
    hint: 'Makes a new note in Bear.' },
  { id: 'things', name: 'Things', uri: 'things:///add?title={title}&notes={content}', fileName: '{date}', mode: 'replace',
    hint: 'Makes a to-do in Things with the text in its notes.' },
  { id: 'dayone', name: 'Day One', uri: 'dayone2://post?entry={content}', fileName: '{date}', mode: 'replace',
    hint: 'Makes a new Day One entry.' },
  { id: 'custom', name: 'Other app', uri: '', fileName: '{date}', mode: 'replace',
    hint: 'Any app that opens from a link: type its template, with {content} where the text goes.' },
];

const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, n) : '');

// the first part of a link, which decides where the text goes ("https://wa.me/…" -> "wa.me", "obsidian://…" -> "obsidian")
export function linkHost(uri) {
  const m = /^\s*([a-z][a-z0-9+.-]*):(?:\/\/)?([^/?#{]*)/i.exec(String(uri || ''));
  if (!m) return '';
  const scheme = m[1].toLowerCase();
  return scheme === 'http' || scheme === 'https' ? (m[2] || '').toLowerCase() : scheme;
}
// a link template can be used when it is a real scheme (not script-like) and puts the text somewhere
export const linkOk = uri => /^\s*[a-z][a-z0-9+.-]*:/i.test(uri || '') && !BAD_SCHEMES.test(String(uri).trim()) && /\{content\}/.test(uri);

// One stored destination, cleaned; null when it is unusable
export function cleanDestination(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const uri = str(d.uri, 600).trim();
  const name = str(d.name, 40).trim();
  if (!name || !linkOk(uri)) return null;
  return {
    id: str(d.id, 20).replace(/[^\w-]/g, '') || Math.random().toString(36).slice(2, 8),
    name, uri,
    fileName: str(d.fileName, 120).trim() || '{date}',
    mode: d.mode === 'append' ? 'append' : 'replace',
  };
}
export function cleanDestinations(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map(cleanDestination).filter(Boolean).filter(d => (seen.has(d.id) ? false : seen.add(d.id))).slice(0, MAX_DESTINATIONS);
}

// The link to open for this destination and text. { url, tooLong }: when the link would be too long for a phone
// to open, the text must be copied and the link opens with no text in it.
// fileDate: the day a case belongs to, for its {file} and {date} (date is set only for a whole day, which the
// ledger remembers). A file name with nothing after its folder ("Logbook/") gets the day, or the title.
export function sendLink(dest, { content = '', title = '', date = '', fileDate = '' } = {}) {
  date ||= fileDate;
  let file = fill(dest.fileName || '{date}', { date }).replace(/\n.*/s, '').trim();
  if (!file || file.endsWith('/')) file += date || String(title || '').replace(/[\\/:*?"<>|#^[\]]+/g, ' ').trim().slice(0, 80) || 'Logbook';
  const build = c => dest.uri.replace(/\{(content|title|file|date)\}/g, (m, k) => encodeURIComponent({ content: c, title, file, date }[k]));
  const url = build(content);
  return url.length > MAX_LINK ? { url: build(''), tooLong: true, file } : { url, tooLong: false, file };
}

// ---- the ledger: what was last sent, per destination and day, on this device ----
// A short fingerprint of the text (not the text itself), so "changed since sent" needs no storage of notes.
export function fingerprint(text) {
  let h = 0x811c9dc5;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36) + '.' + s.length.toString(36);
}
// keep: the destination ids still set up (the rest are dropped)
export const cleanLedger = (l, keep = null) => {
  const out = {};
  if (!l || typeof l !== 'object' || Array.isArray(l)) return out;
  // (the latest places sent to, and each one's latest days: markSent moves a place to the end)
  for (const [id, days] of Object.entries(l).slice(-40)) {
    if (!days || typeof days !== 'object' || Array.isArray(days) || (keep && !keep.includes(id))) continue;
    out[String(id).slice(0, 20)] = Object.fromEntries(Object.entries(days).filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && typeof v === 'string')
      .sort(([x], [y]) => (x < y ? -1 : 1)).slice(-800).map(([d, v]) => [d, v.slice(0, 20)]));
  }
  return out;
};
export function markSent(ledger, destId, date, text) {
  const l = cleanLedger(ledger), was = l[destId] || {};
  delete l[destId];
  l[destId] = { ...was, [date]: fingerprint(text) };
  return l;
}
// 'new' (never sent), 'same' (sent and unchanged) or 'changed' (sent, then edited)
export function sentState(ledger, destId, date, text) {
  const was = ledger && ledger[destId] && ledger[destId][date];
  return !was ? 'new' : was === fingerprint(text) ? 'same' : 'changed';
}
