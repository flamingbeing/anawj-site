# Plan: pre-go-live bug hunt (data safety first)

Owner, 14 Oct 2026: "this is a pretty breaking issue … we are close to go live, so we should do some major bug
fixing". Status: **agreed priority, not started**. Do this before residents start using the app for real.

## Why

On 14 Oct a single delete never reached the server (fixed in #519): the recycle-bin step dropped the case from the
device first, so the delete compared the server's copy with nothing, called it a conflict and gave up, while the
device kept hiding the case and said "Synced". Signing out and in brought it back. It came from two pieces that
were each tested alone (the 13 Oct sync engine's bin feed, the 11–12 Oct delete-with-base check). The e2e tests run
in demo mode, which skips the server-side checks, so they never saw it. Lesson: **test data paths against the real
rules in the emulator, across devices**, not only in demo mode.

## What to test (emulator: `tools/test-reads.sh` harness, real rules, fake accounts; N browser contexts = N devices)

1. **Many devices, one account (4–5):** each logs, edits and deletes cases (single and multi-select), reflections
   and notes, online; then every device reopens and must show exactly the same list, and the server must match.
2. **Offline and back:** a device logs/edits/deletes offline for a while, another edits the same case online; both
   reconnect. Expected: no loss, conflicts land in Recent changes with both versions, nothing silently dropped.
3. **Same record, two devices:** edit vs edit, edit vs delete, delete vs restore from the bin, at the same time.
4. **Sign-out / sign-in / switch account** on a device with unsynced work: nothing lost, nothing leaks to the next
   account.
5. **Recycle bin:** delete → restore → delete again; purge after 30 days; restore when the id is in use.
6. **Google Form inbox:** pick-up on two devices at once; a Form case edited in the app then edited on the Form;
   delete then the Form response edited.
7. **Imports and paste:** workbook import while the resident is logging; paste list; duplicates finder.
8. **Late writes and clocks:** a device with a wrong clock; a write that reaches the server >5 min late
   (`restampIfLate`); the 10-minute re-read window.
9. **Long-running app:** an installed app left open for days (listeners, pick-up re-check, token refresh).
10. **Every write path reports failure honestly:** any rejected write (rules, conflict, quota) must show, never
    "Synced". Add a check that the "Synced" badge means the write queue has no failed/conflict jobs.

Each finding: a failing emulator test first, then the fix, then the test passing (as #519 did).

## Who runs it

- **Cloud sessions** build the multi-device tests and fixes (the emulator runs here; about 1–2 minutes a run).
- **Firetop** (the owner's home computer) can run the long ones: many repeats ("soak" runs, e.g. 50 rounds of random
  actions on 5 devices), real-browser checks (Safari/WebKit isn't installed in the cloud), and a slow-network
  profile. Emulator only: never the live project, never real accounts.
