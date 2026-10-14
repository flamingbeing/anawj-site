# Plan: new app cases → the programme's response sheet (teething phase)

Owner, 14 Oct 2026. Status: **owner said go (14 Oct 2026)**; the app side, rules and tests are built (PR 1, off by a constant until the sheet script is live); the sheet script is written and unit-tested (`form-script/Outbox.gs`, setup in `form-script/OUTBOX-README.md`) but not installed anywhere: next is a dry run on a **copy** of the sheet (owner's OK first). Product version only (no names or
case data here).

## Why

While the logbook is new, every case logged **in the app** is also appended to the old Google Form's response sheet
(the "Case" tab), so the sheet keeps working for the programme coordinators (its own script builds the Database tab,
resident reports and AY totals from it) and doubles as a rudimentary backup if the app ever fails completely.
The other direction already exists: Form → logbook (`form-script/`, `js/form-inbox.js`).

## Decisions (owner)

- On for **every** resident (on the residents list), no setting.
- A delay of a few minutes is fine; MOs are told not to log the same case in both places.
- Only **new** cases: edits and deletions in the app don't reach the sheet (it can drift; it's a backup, not a mirror).
- Rows made by the app carry `app` in **column J** (the sheet's script reads only A–H, so nothing changes for it;
  the workbook import uses J to skip them). Assumed yes; confirm.
- The response sheet stays "anyone with the link can view" for now; reminder set for 14 Nov 2026 to restrict it.

## What exists today (read-only check, 14 Oct)

- App-made cases the sheet doesn't have: 2, both 12 Oct, in two accounts not on the residents list (no rid): nothing
  to back-fill.
- The sheet's category labels (columns D–G) are exactly the app's 49 `categories.js` labels. Column A is always
  `<name> (<6-digit id>)`. Columns: A Resident, B Date, C Initials/Case Details, D Category, E Neurosurgical
  (15i/15ii), F Paediatric (20i–iv), G Peripheral nerve blocks (26i–iv), H Timestamp, I Email Address (Form).
- The Case tab is sorted newest first by the sheet's own script; ~3,200 old rows have no Timestamp (blank H) at the
  bottom.

## Design

1. **App** (`js/sheet-outbox.js`, new): when a resident with a rid creates a case in the app (source `app` or
   `paste`, never `form` or `import`), it also writes `sheetOutbox/{caseId}` = `{ id, email, rid, date, initials,
   details, cats, createdAt }` (details with identifiers masked, as the Form inbox does).
2. **Rules** (`firestore.rules`, needs the owner's approval): the resident creates only their own entry (email ==
   me, rid matches their residents entry, keys and sizes checked); the Form bot (`formBots/{uid}`) reads and deletes;
   nobody else reads.
3. **Sheet script** (a new file `LogbookOutbox` in the response sheet's **existing** Apps Script project, every name
   prefixed `logbookOutbox`, nothing of the existing code changed; pushed by firetop with clasp): a time trigger
   every 5 minutes, under the sheet's document lock (as its `onFormSubmit` uses), signs in as the bot, lists the
   outbox, and for each entry:
   - skips it if a row with `app:<caseId>` in column J already exists (safe to run twice);
   - appends a row: A = the exact existing column-A text ending in `(<rid>)` (else `<name> (<rid>)` from
     `residents/`), B = date, C = `INITIALS details`, D = main category labels, E/F/G = sub-category labels
     (15i–ii / 20i–iv / 26i–iv), H = createdAt, J = `app:<caseId>`; labels joined with ", " as the Form does;
   - then calls the sheet's own functions exactly as its `onFormSubmit` does: `updateDatabase(sheet, row, caseRow)`,
     `updateResidentReport(rid)`, `updateAYSummaryReport(ay)`, `setMetadataValue_`/`updateMetadata`, and the sort;
   - deletes the outbox entry.
   A setup function adds the trigger and checks the bot's sign-in; the owner runs it once.
4. **Workbook import** (Admin portal): skips rows whose column J starts with `app:` (they're already in the logbook).
5. Tests: unit tests for the row mapping (labels, columns, resident text), rules emulator tests, an emulator browser
   test (log a case → outbox entry), and a dry run on a **copy** of the sheet before going live.

## Risks

- The sheet script now calls the existing script's functions: tested on a copy first; if those functions change
  names, the outbox stops (failures emailed to the trigger's owner, entries wait in the outbox).
- Two places to log during the teething phase: a case logged in both shows twice in the sheet (and once in each
  place in the logbook if the Form one is picked up): MOs are told to use one.
- Off switch: delete the trigger, or remove `formBots/{uid}` (also stops the Form inbox).

## Rollout order

1. PR 1 (this): app side (`js/sheet-outbox.js`, `SHEET_OUTBOX_ON = false`), the `sheetOutbox` rules (**waits for the
   owner's approval**: it deploys live on merge), the Admin import skipping `app:` rows, tests.
2. The sheet script in a **copy** of the sheet (dry run, with the owner's OK to make the copy), then the real sheet.
3. One line: `SHEET_OUTBOX_ON = true` in `js/sheet-outbox.js`. Until then no entries are written, so none pile up.
Off switch afterwards: delete the script's trigger, or set the constant back to false.

One thing the owner should know: the sheet script signs in as the **same bot** as the Form inbox. With these rules that
bot can also read and delete `sheetOutbox` entries (case text with identifiers masked, and the resident's rid and
email); it still can't read logbooks, cases or the Form inbox. A separate bot account would keep the two apart.

## What Firetop found in the real sheet's script (read-only, 14 Oct)

- The sheet's script is container-bound ("APMES Case Numbers", owner account, V8, Asia/Singapore). Its `onFormSubmit`
  (installable on-form-submit trigger) takes the document lock (10 s wait), reads the new row **only** from
  `event.range` (A–H), then `updateDatabase`, `updateResidentReport(rid)`, `updateAYSummaryReport(ay)`, metadata, and
  re-sorts the whole Case tab by H descending. A script that adds rows itself does **not** fire it, so `Outbox.gs` runs the
  same chain under the same lock (one entry per hold, pausing between, so a Form response isn't missed).
- Database rows are one per category, from D–G split on commas; `B` must be a real date (else Year/Month/Week are blank);
  the AY comes from the resident id's first four digits. The Case tab has 9 columns (A–I); **column J doesn't exist yet**
  (setup adds the header "App marker"); the sheet's script uses no Script properties.
- Deleting or editing a Case row doesn't update Database or reports (only the menu's Rebuild does): same for app rows.
