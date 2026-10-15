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
// A deleted Form case is listed for good (logbooks/{email}/formGone/{caseId}, cloud.addFormGone, written when it goes
// to the bin and again when its bin entry goes), so an edited or re-sent response never brings it back.
//
// Pure functions (no DOM, no Firebase; pickUp takes cloud.js as an argument), tested in Node: test/form-inbox.test.mjs,
// test/form-pickup.test.mjs.

import { codeOf } from './categories.js';
import { parseDate, splitInitials, caseParts, sortCodes, ID_RE } from './engine.js';
import { importDocId } from './clean.js';
import { splitLabels } from './importer.js';

// the case made from a response keeps its id, so an edited response finds it again
export const formCaseId = responseId => importDocId('form:' + responseId);
// importKey 'form:<responseId>~<submittedAt>@<ms the case was last written from the Form>': a case edited in the app
// since then (updatedAt later than that) is the resident's, and an edited response no longer replaces it.
// submittedAt is the response's newest submit (an edit changes it, and the sheet row's timestamp with it), so a re-run of
// the workbook import still knows the row (withoutFormCases). Keys written before 15 Oct 2026 have no '~<submittedAt>'.
// cloud.commitFormPickup sets the '@<ms>' to the updatedAt it writes (its loop waits for the server after each entry).
const keyOf = (responseId, at, submittedAt) => `form:${responseId}${submittedAt ? '~' + submittedAt : ''}@${at}`;
const SAVE_SLACK = 10000;
const syncedAt = c => { const m = /^form:.*@(\d+)$/.exec(String(c && c.importKey || '')); return m ? Number(m[1]) : null; };
const lastSubmit = c => { const m = /^form:[^~@]*~(\d+)@\d+$/.exec(String(c && c.importKey || '')); return m ? Number(m[1]) : null; };

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
    cats: sortCodes(cats), source: 'form', importKey: keyOf(e.id, now, Number(e.submittedAt) || 0),
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
// A response from before the inbox (imported from the workbook) that is edited in the Form arrives with the edit's
// time, which the import never saw, so isImportOf misses it. FormApp gives only the newest submit time (the first one
// needs the Forms API and a new sign-in scope for the script), so an imported case on the same day, with the same
// initials and categories and from no later than this response, is taken to be it: the entry isn't added again, and
// the resident is told (pickupMessage), in case it was another patient.
const catsKey = c => JSON.stringify([...(c.cats || [])].sort());
export const looksLikeImportOf = (c, e, entryCase) => !!(c && c.source === 'import' && entryCase.initials && sameDay(c, entryCase)
  && caseParts(c).initials.toUpperCase() === entryCase.initials.toUpperCase() && catsKey(c) === catsKey(entryCase)
  && Number(e.submittedAt) >= (Number(c.createdAt) || 0) - 14 * 3600e3 - 1000);

// what a pick-up would change on a case the Form wrote before (nothing: leave it, no write)
const SAME_KEYS = ['date', 'dateText', 'initials', 'details'];
const unchanged = (had, c) => SAME_KEYS.every(k => String(had[k] ?? '') === String(c[k] ?? ''))
  && JSON.stringify([...(had.cats || [])].sort()) === JSON.stringify([...(c.cats || [])].sort());

// at most this many entries per pick-up; the rest wait for the next one
export const PICKUP_MAX = 50;

// entries: the resident's inbox; existing: their cases ({ id: case } or a Map); now: the write time;
// binned: their cases in the recycle bin (the case data, or just ids); gone: ids of Form cases they deleted
// (cloud.listFormGone). A deleted case doesn't come back.
// -> { save: [cases to write], mark: [{ id, importKey, updatedAt }: the newest submit noted on a case kept as the app has
//      it], done: [inbox ids to delete], kept: [ids whose case was edited in the app], dupes: [ids already in the logbook
//      from the workbook import], similar: [those of them matched by day, initials and categories], gone: [ids of
//      deleted cases], binLike: [ids added that look like an imported case in the bin], masked, unknown, left }
export function mergeFormEntries(entries, existing, now, { binned = [], gone = [] } = {}) {
  const all = existing instanceof Map ? [...existing.values()] : Object.values(existing || {});
  const byId = new Map(all.map(c => [c && c.id, c]));
  const binCases = (binned || []).filter(b => b && typeof b === 'object');
  const deleted = new Set([...(binned || []).map(b => String(b && typeof b === 'object' ? b.id : b)), ...(gone || []).map(String)]);
  const list = (entries || []).filter(e => e && e.id);
  const out = { save: [], mark: [], done: [], kept: [], dupes: [], similar: [], gone: [], binLike: [], masked: 0, unknown: 0, left: Math.max(0, list.length - PICKUP_MAX) };
  for (const e of list.slice(0, PICKUP_MAX)) {
    const id = String(e.id), cid = formCaseId(e.id);
    out.done.push(id);
    const had = byId.get(cid);
    const r = entryToCase(e, now);
    if (!had) {
      // deleted: the Form case, or the imported case this response is (still in the bin: the same response time)
      if (deleted.has(cid) || binCases.some(c => isImportOf(c, e, r.case))) { out.gone.push(id); continue; }
      if (all.some(c => isImportOf(c, e, r.case))) { out.dupes.push(id); continue; }
      if (all.some(c => looksLikeImportOf(c, e, r.case))) { out.dupes.push(id); out.similar.push(id); continue; }
      // only like an imported case in the bin (day, initials, categories): added, as nothing in the logbook has it (a
      // corrected copy sent after deleting a wrong one, another patient); the toast says so, in case it is that case's
      // old response edited in the Form
      if (binCases.some(c => looksLikeImportOf(c, e, r.case))) out.binLike.push(id);
    } else {
      const at = syncedAt(had), sub = Number(e.submittedAt) || 0, rec = lastSubmit(had);
      const newer = sub > (rec ?? (Number(had.createdAt) || 0));   // (older keys: createdAt is the first submit)
      if (at == null) { out.kept.push(id); continue; }   // a case with that id the Form didn't write: never replaced
      if (rec != null && sub && sub < rec) continue;   // an older copy of the response than the case has (sent out of order)
      // edited in the app since the Form last wrote it: the app's version stays (saving stamps updatedAt a moment after
      // `now`: SAVE_SLACK allows for that). The response's newest submit is still noted, keeping the key's time.
      if ((Number(had.updatedAt) || 0) > at + SAVE_SLACK) {
        out.kept.push(id);
        if (newer) out.mark.push({ id: cid, importKey: keyOf(id, at, sub), updatedAt: Math.max(now, (Number(had.updatedAt) || 0) + 1) });
        continue;
      }
      if (!newer && unchanged(had, r.case)) continue;   // the same response sent again (a backfill): nothing to write
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

// One pick-up (app.js): the resident's inbox entries (read from the server) become cases. The recycle bin and the
// deleted Form cases are read from the server too, and if either can't be read nothing is written: the entries wait for
// the next pick-up (with no bin, a deleted case would come back). io: cloud.js; cases(): the logbook's cases now;
// still(): false once another account has signed in. -> mergeFormEntries' result with save = the cases written, or null
export async function pickUp(io, email, entries, { cases, still = () => true, now = null }) {
  const [bin, gone] = await Promise.all([io.listBin(email, { server: true }), io.listFormGone(email)]);
  if (!still()) return null;
  const binned = (bin || []).filter(b => b && b.kind === 'case' && b.data && b.data.id).map(b => b.data);
  const r = mergeFormEntries(entries, new Map((cases() || []).map(c => [c.id, c])), now ?? Date.now(), { binned, gone });
  const byCase = new Map(r.save.map(c => [c.id, c])), marks = new Map(r.mark.map(m => [m.id, m]));
  const items = r.done.map(id => ({ id, case: byCase.get(formCaseId(id)) || null, mark: marks.get(formCaseId(id)) || null }));
  const done = new Set(await io.commitFormPickup(email, items));
  // only what reached the server is told: the rest is still in the inbox, and the next pick-up tells it once
  const ok = ids => ids.filter(id => done.has(id)), byEntry = new Map((entries || []).filter(e => e && e.id).map(e => [String(e.id), e]));
  const save = items.filter(it => it.case && done.has(it.id)), flags = save.map(it => entryToCase(byEntry.get(it.id) || { id: it.id }, 0));
  return { ...r, save: save.map(it => it.case), done: ok(r.done), kept: ok(r.kept), dupes: ok(r.dupes), similar: ok(r.similar), gone: ok(r.gone),
    binLike: ok(r.binLike), mark: items.filter(it => it.mark && done.has(it.id)).map(it => it.mark),
    masked: flags.filter(f => f.masked).length, unknown: flags.filter(f => f.unknown.length).length };
}

// The Admin portal's workbook import, once the inbox is on: rows that the inbox already brought in (a Form case with
// the same day and response second: its first submit, or its newest, which an edit puts on the sheet row) are left out,
// so a re-import doesn't count them twice.
// rows: the import's cases ({ date, dateText, createdAt (the sheet timestamp) }); existing: the logbook's cases.
export function withoutFormCases(rows, existing) {
  const form = (existing || []).filter(c => c && c.source === 'form');
  if (!form.length) return { rows: rows || [], dropped: 0 };
  const same = (row, c) => sameResponse(row.createdAt, c.createdAt) || (lastSubmit(c) != null && sameResponse(row.createdAt, lastSubmit(c)));
  const kept = (rows || []).filter(row => !form.some(c => sameDay(c, row) && same(row, c)));
  return { rows: kept, dropped: (rows || []).length - kept.length };
}

// the toast after a pick-up
export function pickupMessage(r) {
  const n = r.save.length, sim = (r.similar || []).length, bin = Math.min(n, (r.binLike || []).length);
  if (!n && !r.kept.length && !sim) return '';
  const parts = [];
  if (n) parts.push(`${n} case${n === 1 ? '' : 's'} from the Google Form added to your logbook`);
  if (bin) parts.push(`${n === 1 ? 'it has' : `${bin} of them ${bin === 1 ? 'has' : 'have'}`} the same day, initials and categories as a case in your recycle bin (if ${bin === 1 ? 'it is' : 'one is'} the case you deleted, delete it again)`);
  if (r.kept.length) parts.push(`${r.kept.length} edited Form response${r.kept.length === 1 ? '' : 's'} left as you changed ${r.kept.length === 1 ? 'it' : 'them'} here`);
  if (sim) parts.push(`${sim} Form response${sim === 1 ? '' : 's'} not added: your logbook already has ${sim === 1 ? 'a case' : 'cases'} with the same day, initials and categories (if ${sim === 1 ? 'it was' : 'one was'} another patient, log it here in the app: the Form would skip it again)`);
  if (r.masked) parts.push(`an ID number was removed from ${r.masked}`);
  if (r.unknown) parts.push(`${r.unknown} with a tag to check`);
  if (r.left) parts.push(`${r.left} more next time`);
  return parts.join('; ') + '.';
}
