# Now: Claude Code, Logbook 2 (log2)

**Claude Code, Logbook 2 (log2)** (branch `ccr-afac5e7a-99esax`): the app → response-sheet sync is **live**
(#527, #532, #546 merged; plan `logbook/PLAN-app-to-sheet.md`). The owner installed `form-script/Outbox.gs` on the real sheet,
ran `logbookOutboxSetup` (column J header, 5-minute trigger `logbookOutboxRun`) and raised the Form handler's lock wait to 60 s.

**To do next (needs a programme resident to test with; the owner has none yet, a reminder is scheduled for the morning of
15 Oct, trigger `trig_01AHgj1ztZYjHeJv2H5onoWj`):** the end-to-end check under "Waiting on the owner" in `logbook/STATUS.md`
(new Case-tab row with `app:` in J, Database rows, the sheet's Apps Script Executions page, a Form response during a sync).
If it fails, ask the owner for the Executions error text; entries exist only for a programme member (`logbook.rid` set and a
`residents` entry with that email); check `cloud.queueSheetRows`, the `sheetOutbox` rules and the bot's Script properties
(`LOGBOOK_BOT_EMAIL` / `LOGBOOK_BOT_PASSWORD` in the sheet's project).
Also scheduled: 14 Nov 2026 reminder (`trig_01XdhSrpiJ31pLuSdwXAKb3V`) to turn off "anyone with the link" on the response sheet.

The go-live bug hunt is parked at the owner's request: remaining items and Firetop's findings are in
`logbook/PLAN-go-live-bugfix.md` ("Parked findings"). Firetop (`session_01F92cPiysiT5WAFPXMga7f4`) has no pending job from log2.
Note: messages from here that ask Firetop to change a LIVE system (e.g. edit the real sheet's script) are blocked by the
permission classifier; the owner does those steps themselves or adds a permission rule.

**Drift tooling (14 Oct):** `/drift-check` (asks Firetop to run `bash Projects/jobs/drift-check/drift-check.sh`, read-only, counts
and names in chat only), weekly on Firetop Mondays 08:30 SGT with a phone message, private dashboard "Logbook Sync Check"
(Claude artifact `TFa1Dvn9b4uA4oAedz5111`; refresh from the run's rids-only counts via `ArtifactData`, datasets `run` and
`residents` are uploaded JSON files). Sheet script has the nightly Totals check (owner installs it). Next if asked: app edits and
deletes to the sheet (the `app:` marker finds the row), then sheet edits to the app. A message to Firetop that asks for a LIVE
change is blocked by the permission classifier: give the owner paste-ready wording.

**15 Oct:** app → sheet sync verified with a real resident (drift check IN SYNC 01:34 SGT); the reminder trigger was deleted. resident 202411
revert done (CSV for her pending in Firetop). Nothing half-done on log2's side. Next, only if the owner asks: plan and build app
edits/deletes → sheet (the `app:` marker finds the row; Database and Totals rebuild via the nightly check), refresh the dashboard
after the Monday 19 Oct drift run, `/drift-check` any time.
