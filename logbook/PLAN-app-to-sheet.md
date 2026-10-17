# App cases to the programme's response sheet (design)

Status: **live since 14 Oct 2026** (`SHEET_OUTBOX_ON` in `js/sheet-outbox.js`; sheet script `form-script/Outbox.gs`, setup in `form-script/OUTBOX-README.md`). Off switch: set the constant to false, or delete the script's time trigger. Rollout history, decisions and the dry-run findings are in the owner's private notes. Product version only (no names or case data).

## Why

While the logbook is new, every case logged **in the app** is also appended to the old Google Form's response sheet
(the "Case" tab), so the sheet keeps working for the programme coordinators (its own script builds the Database tab,
resident reports and AY totals from it) and doubles as a rudimentary backup if the app ever fails completely.
The other direction already exists: Form → logbook (`form-script/`, `js/form-inbox.js`).

## Sheet columns

- The sheet's category labels (columns D–G) are exactly the app's 49 `categories.js` labels. Column A is always
  `<name> (<6-digit id>)`. Columns: A Resident, B Date, C Initials/Case Details, D Category, E Neurosurgical
  (15i/15ii), F Paediatric (20i–iv), G Peripheral nerve blocks (26i–iv), H Timestamp, I Email Address (Form).

## Design

1. **App** (`js/sheet-outbox.js`, new): when a resident with a rid creates a case in the app (source `app` or
   `paste`, never `form` or `import`), it also writes `sheetOutbox/{caseId}` = `{ id, email, rid, date, initials,
   details, cats, createdAt }` (details with identifiers masked, as the Form inbox does).
2. **Rules** (`firestore.rules`, needs the owner's approval): the resident creates only their own entry (email ==
   me, rid matches their residents entry, keys and sizes checked); the Form bot (`formBots/{uid}`) reads and deletes;
   nobody else reads.
3. **Sheet script** (a new file `LogbookOutbox` in the response sheet's **existing** Apps Script project, every name
   prefixed `logbookOutbox`, nothing of the existing code changed; pushed with clasp): a time trigger
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
