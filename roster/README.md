# OT Roster

A static page for drafting the OT section of the daily anaesthesia roster (seniors, juniors, premed cover) and downloading it as an `.xlsx` in the department's layout.

Everything runs in the browser. Staff lists, leave and case notes stay in the browser's local storage and are never uploaded. Rosterers share setup by passing a **team file** (JSON) between them, and share the finished roster as the downloaded Excel file (for example on SharePoint / Excel Online).

## Flow

1. **Staff**: import the master staff sheet (`Name`, `Short name`, `Role`, `Grade`, `Posting`, `Subspecs`, `Doesn't do` columns, found by header name), or *Learn from past rosters* to build the list from old roster files. Tick each senior's subspecs.
2. **Day setup**: load the admin draft roster (rooms, case notes, leave, post call and upper-half duties are read from it), or tick rooms and paste names by hand. Mark leave times, liver standby, and juniors who were away on the previous working day.
3. **Roster**: generate, edit cells, re-check, then download.

## Rules implemented

- Seniors: required subspecs (paeds, cardiac, neuro, thoracic by default) only go to seniors with that subspec. "Doesn't do" keywords are excluded. Liver standby seniors avoid complex or subspec lists. People who leave early avoid lists that run late.
- Double cover happens only when seniors are short. Both rooms must be in the same complex, and complex lists are excluded. Pairs are chosen to keep the overall assignment best.
- Juniors: posting matches (RA, P, L, SR, Neu) are preferred. Residents go to complex lists and MOPEX to simpler ones. Baby MOs never go to a double-covered room. Extra juniors are doubled up.
- Premed cover: needed when a room's junior was away on the previous working day. It's filled by a second junior in the same room if one was around, otherwise by a resident or MOPEX who was around, with a per-person cap.

## Code

- `js/engine.js`: name matching, case-note flags, assignment (Hungarian algorithm) and checks. No DOM.
- `js/xlsxio.js`: reading rosters and staff sheets, and writing the roster workbook (ExcelJS).
- `js/app.js`: UI.
- `vendor/exceljs.min.js`: ExcelJS 4.4.0 (MIT).
- `test/engine.test.mjs`: run with `node roster/test/engine.test.mjs`. It uses fake names only.
