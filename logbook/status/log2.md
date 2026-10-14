# Now: Claude Code, Logbook 2 (log2)

**Claude Code, Logbook 2 (log2)**: app → response-sheet sync (`logbook/PLAN-app-to-sheet.md`, owner said go 14 Oct).
PR 1 (branch `ccr-afac5e7a-99esax`): the app side (`js/sheet-outbox.js`, off by `SHEET_OUTBOX_ON = false`), the
`sheetOutbox` rules (**waits for the owner's approval before merging: deploys live**), the Admin import skipping
`app:` rows, tests. The sheet script (`form-script/Outbox.gs`, `OUTBOX-README.md`, test `outbox-script.test.mjs`) is written from
Firetop's read of the real script (see the plan). Next: dry run on a **copy** of the sheet via Firetop (owner's OK
first; `logbookOutboxTryOne`, time how long it holds the lock), then install on the real sheet, then the one-line
switch on.
Open with the owner: column J doesn't exist yet (setup adds a header "App marker"): OK? Same bot account for the Form inbox and the outbox (it gains read and
delete on the outbox only), or a separate one?
The pre-go-live bug hunt (#523, merged) is done except imports and an app left open for days (not tested), and
Firetop's Firefox/WebKit reruns on main (asked; fix anything they find).
