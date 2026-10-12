// The backup as one spreadsheet (More → Export / Import → Backup → "One spreadsheet (CSV)"): every case,
// reflection and note, plus a row for the logbook's settings, tag groups and portfolio details. Photos are left out.
// Readable columns for Excel, and a Data column with each record in full, which Restore reads (so a round trip
// loses nothing). Pure, no DOM (tested in test/backup-csv.test.mjs).

import { parseCsv } from './tags.js';

export const CSV_COLUMNS = ['Kind', 'ID', 'Date', 'Initials', 'Title', 'Text', 'Tags', 'Heading', 'Status', 'Linked case', 'Updated', 'Data'];
// a cell that starts like a formula gets a leading ' so Excel shows it as text (the Data column starts with {)
const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const iso = ms => (Number(ms) > 0 ? new Date(Number(ms)).toISOString().slice(0, 16).replace('T', ' ') : '');

// data: makeBackup()'s object; ctx: { catName(code), headingName(id) } for readable columns
export function backupToCsv(data, ctx = {}) {
  const catName = ctx.catName || (c => c), headingName = ctx.headingName || (id => id || '');
  const rows = [CSV_COLUMNS];
  const { cases = [], reflections = [], notes = [], logbook = {}, ...meta } = data || {};
  rows.push(['logbook', '', '', '', logbook.name || '', '', '', '', '', '', meta.exportedAt || '', JSON.stringify({ ...meta, logbook })]);
  for (const c of cases) rows.push(['case', c.id, c.date || c.dateText || '', c.initials || '', '', c.details || '', (c.cats || []).map(catName).join('; '), '', '', '', iso(c.updatedAt), JSON.stringify(c)]);
  for (const r of reflections) rows.push(['reflection', r.id, r.date || '', r.initials || '', r.title || r.diagnosis || '', [r.summary, ...(r.points || []).map(p => [p.heading, p.text].filter(Boolean).join(': '))].filter(Boolean).join('\n\n'), '', headingName(r.headingId), r.status || '', r.caseId || '', iso(r.updatedAt), JSON.stringify({ ...r, figures: [] })]);
  for (const n of notes) rows.push(['note', n.id, n.date || '', '', n.title || '', n.body || '', '', '', '', n.caseId || '', iso(n.updatedAt), JSON.stringify(n)]);
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// Back to the backup object (what Restore takes). Rows whose Data isn't readable are counted, not guessed at.
export function csvToBackup(text, format = 'apmes-logbook-backup') {
  const rows = parseCsv(text);
  const head = (rows[0] || []).map(h => String(h).trim().toLowerCase());
  const kindAt = head.indexOf('kind'), dataAt = head.indexOf('data');
  if (kindAt < 0 || dataAt < 0) return null;
  const out = { format, version: 1, cases: [], reflections: [], notes: [], logbook: {}, skipped: 0 };
  for (const r of rows.slice(1)) {
    const kind = String(r[kindAt] || '').trim().toLowerCase();
    let d;
    try { d = JSON.parse(r[dataAt]); } catch { if (kind) out.skipped++; continue; }
    if (!d || typeof d !== 'object') { out.skipped++; continue; }
    if (kind === 'logbook') { const { logbook = {}, ...meta } = d; Object.assign(out, meta, { format, logbook }); }
    else if (kind === 'case') out.cases.push(d);
    else if (kind === 'reflection') out.reflections.push(d);
    else if (kind === 'note') out.notes.push(d);
    else out.skipped++;
  }
  return out;
}
export const looksLikeBackupCsv = text => /^﻿?"?Kind"?[,;\t]/.test(String(text || ''));
