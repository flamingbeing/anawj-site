// The Google Form inbox: residents who prefer the old APMES Google Form can keep using it. A small Apps Script on
// the Form's response sheet (PR 2) sends each response, as it comes in or is edited, to formInbox/{responseId}
// through a bot account that the rules let only add there. When the resident next opens the logbook, the app turns
// their entries into ordinary cases marked "from the Form" (source 'form') and empties them from the inbox.
// One way only: nothing goes back to the Form or its sheet; the logbook is the record.
//
// Inbox entry (written by the script, checked by firestore.rules validFormEntry):
//   { id: responseId, email (the Google sign-in the Form required, lower case), date ('YYYY-MM-DD' or null),
//     dateText (the answer when it isn't a date), details (the initials and case details answer),
//     labels: [category answers, e.g. "16) GA", "20iii) …"], submittedAt (ms; changes when the response is edited) }
//
// Pure functions (no DOM, no Firebase), tested in Node: test/form-inbox.test.mjs.

import { codeOf } from './categories.js';
import { parseDate, splitInitials, sortCodes, ID_RE } from './engine.js';
import { importDocId } from './clean.js';
import { splitLabels } from './importer.js';

// the case made from a response keeps its id, so an edited response finds it again
export const formCaseId = responseId => importDocId('form:' + responseId);
// importKey 'form:<responseId>@<ms the case was last written from the Form>': a case edited in the app since then
// (updatedAt later than that) is the resident's, and an edited response no longer replaces it
const keyOf = (responseId, at) => `form:${responseId}@${at}`;
const SAVE_SLACK = 10000;
const syncedAt = c => { const m = /^form:.*@(\d+)$/.exec(String(c && c.importKey || '')); return m ? Number(m[1]) : null; };

// Identifiers never reach the logbook: an NRIC/FIN or a long number in the Form's text is replaced.
export const maskIds = text => String(text || '').replace(new RegExp(ID_RE.source, 'gi'), '[ID removed]');

// one entry -> { case, unknown: [labels not recognised], masked: bool }
export function entryToCase(e, now) {
  const labels = (Array.isArray(e.labels) ? e.labels : []).flatMap(l => splitLabels(l));
  const cats = [], unknown = [];
  for (const l of labels) { const code = codeOf(l); if (!code) unknown.push(l); else if (!cats.includes(code)) cats.push(code); }
  const raw = String(e.details || '').trim();
  const clean = maskIds(raw);
  const { initials, details } = splitInitials(clean);
  const date = parseDate(e.date) || null;
  const dateText = date ? '' : String(e.dateText || e.date || '').trim().slice(0, 200);
  const c = {
    id: formCaseId(e.id), date, initials, details: unknown.length ? `${details}${details ? '\n' : ''}(Form tags not recognised: ${unknown.join(', ')})` : details,
    cats: sortCodes(cats), source: 'form', importKey: keyOf(e.id, now),
    createdAt: Number(e.submittedAt) || now, updatedAt: now,
  };
  if (dateText) c.dateText = dateText;
  return { case: c, unknown, masked: clean !== raw };
}

// The same response imported from the Form's workbook (Admin portal, source 'import'): that import reads the sheet's
// zoneless local timestamp as UTC, so its createdAt is the true moment shifted by the sheet's time zone (+8 h in
// Singapore). Same day of the case and the same second once a whole number of quarter-hours (up to 14 h, any zone)
// is taken off.
export function sameResponse(importedAt, submittedAt) {
  const d = Math.round((Number(importedAt) - Number(submittedAt)) / 1000);
  if (!isFinite(d) || Math.abs(d) > 14 * 3600 + 1) return false;
  const q = Math.round(d / 900) * 900;
  return Math.abs(d - q) <= 1;
}
const sameDay = (a, b) => (a.date || null) === (b.date || null) && (a.date || String(a.dateText || '') === String(b.dateText || ''));
export const isImportOf = (c, e, entryCase) => c && c.source === 'import' && sameDay(c, entryCase) && sameResponse(c.createdAt, e.submittedAt);

// what a pick-up would change on a case the Form wrote before (nothing: leave it, no write)
const SAME_KEYS = ['date', 'dateText', 'initials', 'details'];
const unchanged = (had, c) => SAME_KEYS.every(k => String(had[k] ?? '') === String(c[k] ?? ''))
  && JSON.stringify([...(had.cats || [])].sort()) === JSON.stringify([...(c.cats || [])].sort());

// at most this many entries per pick-up; the rest wait for the next one
export const PICKUP_MAX = 50;

// entries: the resident's inbox; existing: their cases ({ id: case } or a Map); now: the write time;
// binned: ids of their cases in the recycle bin (a Form case they deleted doesn't come back).
// -> { save: [cases to write], done: [inbox ids to delete], kept: [ids whose case was edited in the app],
//      dupes: [ids already in the logbook from the workbook import], gone: [ids of deleted cases], masked, unknown, left }
export function mergeFormEntries(entries, existing, now, { binned = [] } = {}) {
  const all = existing instanceof Map ? [...existing.values()] : Object.values(existing || {});
  const byId = new Map(all.map(c => [c && c.id, c]));
  const inBin = new Set((binned || []).map(String));
  const list = (entries || []).filter(e => e && e.id);
  const out = { save: [], done: [], kept: [], dupes: [], gone: [], masked: 0, unknown: 0, left: Math.max(0, list.length - PICKUP_MAX) };
  for (const e of list.slice(0, PICKUP_MAX)) {
    const id = String(e.id), cid = formCaseId(e.id);
    out.done.push(id);
    const had = byId.get(cid);
    const r = entryToCase(e, now);
    if (!had) {
      if (inBin.has(cid)) { out.gone.push(id); continue; }
      if (all.some(c => isImportOf(c, e, r.case))) { out.dupes.push(id); continue; }
    } else {
      const at = syncedAt(had);
      // edited in the app since the Form last wrote it (or not a Form case at all): the app's version stays
      // (saving stamps updatedAt a moment after `now`: SAVE_SLACK allows for that)
      if (at == null || (Number(had.updatedAt) || 0) > at + SAVE_SLACK) { out.kept.push(id); continue; }
      if (unchanged(had, r.case)) continue;   // the same response sent again (a backfill): nothing to write
      r.case.createdAt = Number(had.createdAt) || r.case.createdAt;
      // keep what only the app adds (a linked reflection, the interesting star, personal tags)
      for (const k of ['reflectionId', 'reflectTag', 'tags']) if (had[k] != null) r.case[k] = had[k];
    }
    out.save.push(r.case);
    if (r.masked) out.masked++;
    if (r.unknown.length) out.unknown++;
  }
  return out;
}

// The Admin portal's workbook import, once the inbox is on: rows that the inbox already brought in (a Form case with
// the same day and response second) are left out, so a re-import doesn't count them twice.
// rows: the import's cases ({ date, dateText, createdAt (the sheet timestamp) }); existing: the logbook's cases.
export function withoutFormCases(rows, existing) {
  const form = (existing || []).filter(c => c && c.source === 'form');
  if (!form.length) return { rows: rows || [], dropped: 0 };
  const kept = (rows || []).filter(row => !form.some(c => sameDay(c, row) && sameResponse(row.createdAt, c.createdAt)));
  return { rows: kept, dropped: (rows || []).length - kept.length };
}

// the toast after a pick-up
export function pickupMessage(r) {
  const n = r.save.length;
  if (!n && !r.kept.length) return '';
  const parts = [];
  if (n) parts.push(`${n} case${n === 1 ? '' : 's'} from the Google Form added to your logbook`);
  if (r.kept.length) parts.push(`${r.kept.length} edited Form response${r.kept.length === 1 ? '' : 's'} left as you changed ${r.kept.length === 1 ? 'it' : 'them'} here`);
  if (r.masked) parts.push(`an ID number was removed from ${r.masked}`);
  if (r.unknown) parts.push(`${r.unknown} with a tag to check`);
  if (r.left) parts.push(`${r.left} more next time`);
  return parts.join('; ') + '.';
}
