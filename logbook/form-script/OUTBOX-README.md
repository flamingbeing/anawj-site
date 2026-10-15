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
   5-minute trigger (`logbookOutboxRun`). Safe to run again from the same Google account (only one person sets it up: it
   can't see another account's triggers). **On a copy, don't run it** (its trigger would take real entries
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

## Updating the script after a change

When `Outbox.gs` changes in the repo, the owner pastes it again (the sheet runs its own copy, not the repo's):
**Extensions → Apps Script → the `LogbookOutbox` file → select all, paste the whole new [`Outbox.gs`](Outbox.gs) → Save.**
Nothing else: the triggers and Script properties stay. If Google asks to authorise again, allow.
Before pasting the 15 Oct version, search the sheet's own Apps Script files for `getScriptLock`: the outbox run now holds
the script lock for its whole run (and the nightly rebuild), so any other code there that takes it would wait or fail
meanwhile. Entries keep the rid they were queued with: if a wrong id waiting in the outbox is another resident's real
id, those cases would be added under that resident (rare; check `logbookOutboxCheck` after fixing ids).

- **15 Oct 2026 (two changes, one paste):** paste the whole current file once; it holds both.
  - Paging and skipped entries: before, every run read only the outbox's first 12 entries, so once 12 entries were
    waiting for residents who aren't on the Residents tab, other residents' cases stopped reaching the sheet. Now each run
    carries on from where the last stopped (Script property `LOGBOOK_OUTBOX_CURSOR`, made by the script; leave it), and
    the nightly Totals check reports skipped entries and fails when one has waited over a day.
  - One run at a time: two runs at once (a second account's trigger, or Run pressed during a trigger run) could add a
    case twice. Now a run that finds another still going does nothing, and each piece looks in column J again just before
    adding a row. The nightly check takes the same lock (5-minute runs skip while it holds it; the next one catches up).
  - `logbookOutboxDropRid` (new, by hand): deletes entries stuck under a resident id the sheet will never have (see
    "Entries under a wrong id" below).
  - Optional check after pasting: run `logbookOutboxCheck` (changes nothing): it lists what waits and why.

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
- A case is never added twice: column J's `app:<caseId>` is checked first, and again just before each row is added, under
  the lock (a run that stopped before deleting the entry just deletes it next time). Runs never overlap: the script lock
  covers every account's trigger and Run in the editor, so a run that finds another going does nothing. Deleting a Case
  row by hand doesn't update the Database or reports (same as for Form rows): use the menu's Rebuild commands.
- A resident whose id isn't on the Residents sheet is skipped: their entries wait in the outbox and their cases don't reach the
  sheet until a PC adds the resident (name and 6-digit id) to the Residents tab; the next runs then add them. If the id
  itself is wrong, see "Entries under a wrong id" below. Each run reads one page of 12 entries in id order, from where the
  last run stopped (Script property `LOGBOOK_OUTBOX_CURSOR`), and goes back to the start at the end, so skipped entries
  never hold other residents' cases back and a run reads one page (two when it goes back to the start; a read per entry:
  about 3,700 reads a day at most). The 5-minute run only logs a skip (it never fails for one); the nightly
  Totals check reports them once a day (count, ids, oldest age) and **fails when one has waited over a day**, so Google's
  failure email reaches the trigger's owner. `logbookOutboxCheck` (by hand, changes nothing) lists them too.
- The logbook's Admin workbook import skips rows with `app:` in column J (they're already in the logbook).
- **Off switch:** delete the trigger (Triggers ⏰), or set `SHEET_OUTBOX_ON = false` in the app.
- Failures show in Apps Script → Executions, and Google emails the trigger's owner a daily summary. The trigger runs as the
  person who created it; if they lose edit access to the sheet it stops: recreate it from another editor (that editor runs
  `logbookOutboxSetup`; then delete the old trigger in Triggers ⏰ if it is still listed).
- If the Form gets a new question, check that its answers don't land in column J (a Form adds columns to the right).
- Change the bot's password (Authentication → Users → ⋮ → Reset password) in **both** projects' Script properties when an
  editor leaves.
- Tests: `node logbook/test/outbox-script.test.mjs` (the row mapping against `js/categories.js`, the sheet's expectations and
  the logbook's import, the order of the update chain, and paging past skipped entries against a fake of Firestore's
  runQuery, with fakes).

## The nightly Totals check (optional, same file)

The sheet's Database tab is built one response at a time and the AY Totals tabs are built from the Database, so a response
whose update timed out, one added twice, or a Case row changed by hand leaves the Totals out of step with the Case tab
(Oct 2026: three residents' totals were 1-2 off). `Outbox.gs` also holds a check that compares, by counts only, Case tab ->
Database -> each AY Totals tab, and can run the same two rebuilds the sheet's own menu has.

- `logbookOutboxTotalsReport` (run by hand, any time): lists the differing cells in the log; changes nothing.
- `logbookOutboxTotalsSetup` (run once by hand): adds a daily trigger at about 03:00 (`logbookOutboxTotalsCheck`). It only
  **reports** until you set the Script property `LOGBOOK_TOTALS_FIX` to `on` (Project settings → Script properties).
- With the property on, a difference triggers **Rebuild Database** (only if the Database differs from the Case tab) and then
  **Rebuild AY Reports**, each alone in a hold of the document lock, then checks again. It never rebuilds twice in a night, skips
  the night if a case arrived in the last 10 minutes or if fewer than 1,000 Case rows were read, and never touches the Case or
  Residents tabs or a resident's own spreadsheet. A category the Totals tabs have no row for (before 26iv was added to
  `Categories.gs`) is ignored, not a difference. The last result is kept in the Script property `LOGBOOK_TOTALS_LAST`.
- Measure first: run `logbookOutboxTotalsReport`, then run the menu's Rebuild commands by hand once and note how long each
  takes (the 6-minute limit applies to the nightly run, which runs both).
- **What waits in the outbox.** The nightly run also reads the whole outbox once (signing in as the bot, as the 5-minute run
  does) and adds a line to `LOGBOOK_TOTALS_LAST`, e.g. `Outbox: 4 waiting, 3 skipped (202701: 2, R2: 1; oldest 1.3 days).`
  It **fails** (so Google emails the trigger's owner) when an entry has been skipped for over a day (its resident isn't on the
  Residents tab, or the id isn't 6 digits), when the outbox can't be read, or, as before, when the Totals still differ after a
  rebuild. The line also counts entries for residents who *are* on the Residents tab but were logged over a day ago (not a
  failure: a case logged offline can arrive late, but many of these mean the 5-minute run has stopped: check
  `logbookOutboxRun` in Executions).
  The check holds the script lock, as the 5-minute run does; if a run is still going after 30 seconds, that night it only
  reports (no rebuild) and says so.
- **Fix for skipped entries.** If the id is right, add the resident (name and that 6-digit id) to the Residents tab: the
  next runs add the cases. If the id is wrong, see below.

## Entries under a wrong id

Each outbox entry keeps the resident id it was queued with. So when a resident's id is wrong (not 6 digits, like `R2`, or
a 6-digit id that was wrong and has since been corrected in the app's People list), correcting it in People only changes
the cases logged **after** the fix: the entries already waiting keep the old id, are skipped for good, and the nightly
check fails every night. Clear them by hand (Extensions → Apps Script, the `LogbookOutbox` file):

1. **Project settings (⚙) → Script properties → Add** `LOGBOOK_OUTBOX_DROP_RID` = the old id (as the nightly email names it).
2. Editor → run **`logbookOutboxDropRid`**. It deletes nothing: the log lists each waiting entry under that id (date,
   initials and details, categories), so the cases can be added to the sheet by hand (or sent through the Form) if the
   sheet needs them. It refuses an id that is on the Residents tab (those entries are on their way to the sheet).
3. To delete them: add the Script property `LOGBOOK_OUTBOX_DROP_CONFIRM` = the same id, and run `logbookOutboxDropRid`
   again. It deletes them and removes both properties. The cases stay in the app.
