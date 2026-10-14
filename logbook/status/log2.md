# Now: Claude Code, Logbook 2 (log2)

**Claude Code, Logbook 2 (log2)** (branch `ccr-afac5e7a-99esax`, open PR **#523**, not to merge yet): pre-go-live
data-safety bug hunt (`logbook/PLAN-go-live-bugfix.md`). #523 has the header fix (repaints on every save-queue change,
so it says "Save needs attention" instead of "Synced" when a save conflicts) and offline devices in
`tools/test-multidevice.sh` (`test/e2e/multidevice.emulator.mjs`). Half-done: some random runs failed with an edit or a
delete made offline that didn't land after reconnecting (timing-dependent; one seed passed on rerun). Resume: run
`DEVICES=5 ROUNDS=10 tools/test-multidevice.sh` a few times; a failure now prints the case's history and every
device's save-queue entries; find the cause, fix with the test, then merge #523. Don't run the full suite and the
multi-device test at the same time (they share port 8080 and flake).
Firetop (home computer) has jobs: A = full suite incl. WebKit + rules + reads + a11y on main (after #519); B = soak runs
of the multi-device test (Chromium 50 rounds, WebKit/Firefox 30, SLOW=1 20). It reports by message.
Then: the rest of the bug-hunt list (same-record conflicts, sign-out with unsent changes, "Synced" honesty), then the
app → sheet sync (`logbook/PLAN-app-to-sheet.md`, waiting for the owner's go).
