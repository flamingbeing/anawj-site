# Now: Claude Code, Logbook 2 (log2)

**Claude Code, Logbook 2 (log2)** (branch `ccr-afac5e7a-99esax`; docs PR #547 open until merged): the app → response-sheet sync is **live**
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
