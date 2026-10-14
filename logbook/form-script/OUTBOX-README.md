# The response sheet's outbox script (setup)

New cases residents log **in the app** are also added to the old Google Form's response sheet (the "Case" tab), so the
sheet keeps working for the programme (its Database tab, resident reports and AY totals) and is a rough backup if the app
ever fails. How it works and why: `../PLAN-app-to-sheet.md`. The app writes each new case to `sheetOutbox/{caseId}`
(`../js/sheet-outbox.js`, switched on by `SHEET_OUTBOX_ON`); this script, inside the **response sheet's own** Apps Script
project, turns each entry into a Case-tab row every 5 minutes and deletes it. New cases only: edits and deletions in the
app never reach the sheet. About 10 minutes on a computer, once. **Try it on a copy of the sheet first** (File → Make a
copy; a copy brings the script but not its triggers).

## 1. The sheet script

1. Open the response sheet → **Extensions → Apps Script** (the project that holds Menu, Controller, Database…). Don't
   change anything there. **＋ → Script**, name it `LogbookOutbox`, paste the whole of [`Outbox.gs`](Outbox.gs). Save.
2. **Project settings (⚙) → Script properties → Add**: `LOGBOOK_BOT_EMAIL` and `LOGBOOK_BOT_PASSWORD` = the Form bot's email
   and password (the same account as the Form inbox, `README.md`). Only editors of this project can see them; never paste
   them into the file or into chat.
3. **On the real sheet: Editor → run `logbookOutboxSetup`.** Google asks you to authorise the script (the sheet, and connecting
   to an external service): allow. It checks the bot can sign in, puts the header **App marker** in column J of the Case tab
   (the marker column: rows made by the app carry `app:<caseId>` there; the sheet's own script reads only A–H), and adds the
   5-minute trigger (`logbookOutboxRun`). Safe to run again. **On a copy, don't run it** (its trigger would take real entries
   into the copy): run `logbookOutboxCheck` instead (signs in and counts the entries, changes nothing).
4. **Dry run, on a copy only.** A copy keeps the real residents' own report spreadsheet ids (Residents column G), and the
   sheet's `updateResidentReport` rewrites that spreadsheet's "Case Log". So first, on the **copy's** Residents sheet, point
   one test resident's column G at a blank throwaway spreadsheet and put that spreadsheet's id in
   `LOGBOOK_OUTBOX_TRY_SAFE_IDS` at the top of `logbookOutboxTryOne` (the function refuses to run otherwise). Then run
   `logbookOutboxTryOne('<that resident's 6-digit id>')`: it adds one made-up case exactly as a real entry would be, runs the
   Database, resident report and AY totals update and the sort, and doesn't touch the outbox. Check the new row at the top of
   the Case tab (A resident text, B a real date, C `XY 34F fake test case, ignore`, D–G categories, H timestamp, J
   `app:try…`), a row for each category in the Database tab, the throwaway spreadsheet's Case Log, and the AY totals. Time
   how long it takes: it holds the sheet's lock for that long, and the sheet's own `onFormSubmit` waits only 10 seconds for it.
   Delete the copy when done.
5. `logbookOutboxDryRun` lists what waiting entries would add, without writing anything.

## Good to know

- A script that adds rows itself doesn't fire the sheet's `onFormSubmit`, so this runs the same chain: `updateDatabase`
  (before the sort, with the new row's number), `updateResidentReport`, `updateAYSummaryReport`, then
  `sortByTimestampDescending_`, one entry per hold of the document lock.
- A case is never added twice: column J's `app:<caseId>` is checked first (a run that stopped before deleting the entry
  just deletes it next time). Deleting a Case row by hand doesn't update the Database or reports (same as for Form rows):
  use the menu's Rebuild commands.
- A resident whose id isn't on the Residents sheet is skipped (their entries wait in the outbox; the log says so).
- The logbook's Admin workbook import skips rows with `app:` in column J (they're already in the logbook).
- **Off switch:** delete the trigger (Triggers ⏰), or set `SHEET_OUTBOX_ON = false` in the app.
- Failures show in Apps Script → Executions, and Google emails the trigger's owner a daily summary. The trigger runs as the
  person who created it; if they lose edit access to the sheet it stops: recreate it from another editor.
- If the Form gets a new question, check that its answers don't land in column J (a Form adds columns to the right).
- Change the bot's password (Authentication → Users → ⋮ → Reset password) in **both** projects' Script properties when an
  editor leaves.
- Tests: `node logbook/test/outbox-script.test.mjs` (the row mapping against `js/categories.js`, the sheet's expectations and
  the logbook's import, and the order of the update chain, with fakes).
