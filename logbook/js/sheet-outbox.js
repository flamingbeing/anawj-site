// New app cases → the old Google Form's response sheet (teething phase; PLAN-app-to-sheet.md). When a programme
// resident logs a case in the app, a copy goes to sheetOutbox/{caseId}; a script on the response sheet (form-script/
// Outbox.gs) turns each entry into a row of the sheet's Case tab a few minutes later and deletes it. One way, new
// cases only: edits and deletions in the app don't reach the sheet (it is a backup, not a mirror). A case deleted
// before the script has picked it up is taken out of the outbox again, and put back if it is restored (Undo, the recycle
// bin, or a delete that failed or lost to an edit elsewhere) with the same id.
//
// Entry (checked by firestore.rules validOutbox):
//   { id: caseId, email, rid, date ('YYYY-MM-DD' or null), dateText?, initials, details (identifiers masked),
//     cats: [codes], createdAt (ms) }
//
// Pure functions (no DOM, no Firebase), tested in Node: test/sheet-outbox.test.mjs.

import { ID_RE } from './engine.js';

// identifiers never leave the logbook: an NRIC/FIN or a long number is replaced (as form-inbox.js maskIds does)
const maskIds = text => String(text || '').replace(new RegExp(ID_RE.source, 'gi'), '[ID removed]');

// On since 14 Oct 2026, once the sheet script (form-script/Outbox.gs) was installed on the response sheet. Off switch: set
// this to false (the app stops writing entries), or delete the sheet script's trigger.
export const SHEET_OUTBOX_ON = true;
let override = null;
export const outboxOn = () => override == null ? SHEET_OUTBOX_ON : override;
export function setOutboxOn(v) { override = v; }   // tests

// only cases made in the app (typed or pasted): never ones that came from the Form or the workbook import
export const SHEET_SOURCES = ['app', 'paste'];
// and only cases made since the outbox went live (#546 switched it on at 22:13 Singapore time, 14 Oct 2026): an older app
// case restored from the recycle bin has no "app:<id>" row in the sheet to match, so it would be added late, or twice if
// the resident also sent it through the Form back then
export const SHEET_OUTBOX_SINCE = Date.parse('2026-10-14T14:15:00Z');

// who: { email, rid } of the signed-in programme resident (the logbook names their rid), or null
export function outboxEntry(c, who) {
  if (!c || !c.id || !who || !who.rid || !who.email) return null;
  if (!SHEET_SOURCES.includes(c.source || 'app')) return null;
  const createdAt = Number(c.createdAt) || Date.now();
  if (createdAt < SHEET_OUTBOX_SINCE) return null;
  const e = {
    id: String(c.id), email: String(who.email).trim().toLowerCase(), rid: String(who.rid),
    date: c.date || null, initials: String(c.initials || '').slice(0, 20),
    details: maskIds(c.details).slice(0, 2000), cats: [...new Set((c.cats || []).map(String))].slice(0, 40),
    createdAt,
  };
  if (!e.date && c.dateText) e.dateText = String(c.dateText).slice(0, 200);
  return e;
}
export const outboxEntries = (cases, who) => (cases || []).map(c => outboxEntry(c, who)).filter(Boolean);
