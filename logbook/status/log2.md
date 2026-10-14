# Now: Claude Code, Logbook 2 (log2)

**Claude Code, Logbook 2 (log2)** (branch `ccr-afac5e7a-99esax`, open PR **#523**): pre-go-live data-safety bug hunt
(`logbook/PLAN-go-live-bugfix.md`, progress at its end). #523 has: the header following the save queue; a save cut off by
the network retrying by itself; multi-select delete going through the write queue (it lost a concurrent edit); a toast
when a delete is undone by a conflict; `tools/test-multidevice.sh` (random, 5 devices, offline) and `TEST=conflicts`
(fixed two-device scenarios, all passing); the harness works on Windows.
Before merging: Firetop's Firefox/WebKit runs on the new head (asked), then the full `tools/test-logbook.sh` (not at the
same time as a multi-device run: they share port 8080), then merge #523.
Open: Firetop's slow-network seed 196651587 (a seeded case missing on device 1 in round 1; didn't repeat here); one
cloud run hung for 25 min with no output (seed unknown). Then: imports (item 7), app left open for days (item 9), and
the app → sheet sync (`logbook/PLAN-app-to-sheet.md`, waiting for the owner's go).
