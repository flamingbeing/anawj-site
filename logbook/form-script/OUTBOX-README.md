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
   `LOGBOOK_OUTBOX_TRY_SAFE_IDS` at the top of `logbookOutboxTryOne` (the function refuses to run otherwise). Keep the project's original file order (a file that uses another's constants at load time fails otherwise: Menu, Controller,
   Categories, Residents, Database, Resident Reports, AY Reports, Metadata, Admin, Triggers, Test) and put `LogbookOutbox`
   after them. Then run `logbookOutboxTryOne('<that resident's 6-digit id>')`: it adds one made-up case exactly as a real entry would be, runs the
   Database, resident report and AY totals update and the sort, and doesn't touch the outbox. Check the new row at the top of
   the Case tab (A resident text, B a real date, C `XY 34F fake test case, ignore`, D–G categories, H timestamp, J
   `app:try…`), a row for each category in the Database tab, the throwaway spreadsheet's Case Log, and the AY totals. The log
   prints how long each hold of the lock lasts (`holds`: adding and sorting, the resident's report, the AY totals): the sheet's own
   `onFormSubmit` waits only 10 seconds for it.
   Delete the copy when done.
5. `logbookOutboxDryRun` lists what waiting entries would add, without writing anything.

## Good to know

- A script that adds rows itself doesn't fire the sheet's `onFormSubmit`, so this runs the same chain: `updateDatabase`
  (before the sort, with the new row's number), `updateResidentReport`, `updateAYSummaryReport`, then
  `sortByTimestampDescending_`.
- **The document lock (the one thing to decide).** On the real data the resident report and the AY totals take 10-40
  seconds each to rebuild (a dry run on a copy: 25-42 s for one case, all steps). The sheet's own `onFormSubmit` takes the same
  lock and **waits only 10 seconds** for it, then throws: a Form response arriving while anything holds the lock longer loses its
  Database and report update (the row stays in the Case tab; the menu's Rebuild commands fix it). That is already true for
  two Form responses close together. This script therefore holds the lock in small pieces (3 entries' rows + Database + one
  sort; then each rebuild alone, with a pause between), which cuts the wait a Form response can meet from the whole 25-42 s to
  one piece, but a piece can still be over 10 s. The fix is one line in the existing `onFormSubmit` (Triggers.gs):
  `lock.waitLock(10000)` → `lock.waitLock(60000)`. That edits the existing script, so it's the owner's call; without it, keep
  the 5-minute trigger but expect an occasional missed Form response during a run, or restrict the trigger to quiet hours.
- Rebuilds still owed are written to the Script property `LOGBOOK_OUTBOX_PENDING` before an entry is deleted, so a run that
  stops half way loses nothing; the next run does them first. A run stops starting new work after 4.5 minutes.
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
