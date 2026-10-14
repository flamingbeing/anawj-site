# Now: Claude Code, Logbook 2 (log2)

**Claude Code, Logbook 2 (log2)**: app → response-sheet sync (`logbook/PLAN-app-to-sheet.md`, owner said go 14 Oct).
PR 1 (branch `ccr-afac5e7a-99esax`): the app side (`js/sheet-outbox.js`, off by `SHEET_OUTBOX_ON = false`), the
`sheetOutbox` rules (**waits for the owner's approval before merging: deploys live**), the Admin import skipping
`app:` rows, tests. Next: the sheet script (`form-script/Outbox.gs`) once Firetop has read the sheet's existing
script (asked, read-only); dry run on a copy of the sheet (owner's OK first); then the one-line switch on.
Open with the owner: column J confirmed free? Same bot account for the Form inbox and the outbox (it gains read and
delete on the outbox only), or a separate one?
The pre-go-live bug hunt (#523, merged) is done except imports and an app left open for days (not tested), and
Firetop's Firefox/WebKit reruns on main (asked; fix anything they find).
