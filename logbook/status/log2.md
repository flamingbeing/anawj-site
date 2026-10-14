# Now: Claude Code, Logbook 2 (log2)

**Claude Code, Logbook 2 (log2)**: app → response-sheet sync is **switched on** (PR "Logbook: switch the sheet outbox on"; plan:
`logbook/PLAN-app-to-sheet.md`). The owner installed `form-script/Outbox.gs` on the real sheet and ran setup. Watch the first real
cases: a resident's new app case should appear in the Case tab (column J `app:<id>`) and the Database tab within ~5 minutes, and a
Form response arriving during a sync must still reach the Database (the Form handler's lock wait is now 60 s).
The pre-go-live bug hunt (#523, merged) is parked: imports and an app left open for days untested; Firefox seed 285932884 (stale
copy after a conflict) and WebKit's editVsDelete are open in `PLAN-go-live-bugfix.md`.
