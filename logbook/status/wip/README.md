# Reliability hour, 15 Oct 2026 (log2): paused work

The owner paused the session at a usage limit. Nothing here is live. The fixes are saved as git branches in
`log2-reliability-2026-10-15.bundle`; the verified audit findings (scenario, consequence, fix and the verifiers'
corrections) are in `findings/*.json`. Delete this folder once every branch below is merged or dropped.

## Restore the branches

```
git fetch origin main
git bundle verify logbook/status/wip/log2-reliability-2026-10-15.bundle
git fetch logbook/status/wip/log2-reliability-2026-10-15.bundle 'refs/heads/*:refs/heads/wip/*'
git branch --list 'wip/*'    # wip/tmp-writes, wip/tmp-bulktag, wip/tmp-backup, wip/tmp-form, wip/tmp-outbox
```

Each branch starts from main as it was then (8ee197c, or a696b49 for tmp-backup). Merge main into each one before testing.

## The branches, in the order to merge them

| Branch | What it fixes | State when paused |
| --- | --- | --- |
| `tmp-writes` | **High.** A save made after a conflict says "saved" but never syncs, and either conflict button then archives it. A conflict keeps showing the server's copy as it was at the conflict, so a device keeps a case deleted elsewhere: this is the multidevice "extra after own conflict" failure and parked seed 285932884. A second app window re-sends a save another window already sent. Files: `writes.js`, `ui-recovery.js`, `ui-notepad.js`, `ui-reflect.js`. | Built (bf0256f). The review found 1 blocking regression: in `ui-recovery.js` `restore()`, a chain [failed, pending…] gets one more pending job behind the failed one and never syncs. Fix: when the chain has a failed job and no conflict, save with base = the oldest chain job's base, then archive. The second pass was stopped part-way: the top commit `WIP …` is untested; review it or drop it. |
| `tmp-bulktag` | **High.** Bulk Add/Remove tag, the Settings tag merge and the spreadsheet re-import's Changed rows overwrite cases blindly with a stale copy; they now go through the write queue with a base (`ui-core.js` `updateMany`). | Built and reviewed. The second pass (dc4b57f) skips cases already in conflict, waits for each batch's outcome and repaints once a batch. Its correctness depends on `tmp-writes`, so merge it after that. |
| `tmp-backup` | **High.** Restoring a backup while the logbook is still loading overwrote newer cases and reflections. A reflection moved to the bin was a blind delete. Backups took notes from an old device copy. | Built, reviewed and polished (70e4d68; restoring from the bin waits behind a queued delete). It also adds `jobKey` / `stateOf` to `writes.js`, so merge it after `tmp-writes`. Tests passed: units, bugfixes, notepad, sync-engine, TEST=conflicts (16). |
| `tmp-form` | **High.** A deleted Form case came back once its bin entry was gone (new owner-only `logbooks/{email}/formGone/{id}`: **a rules change**). Edited responses doubled cases (key now carries the newest submit; a stopgap match by day + initials + categories). Late cases in a slow pick-up looked app-edited. `Code.gs` backfill SINCE is 14 Oct. | Built, reviewed and polished (96c6d2e). tools/test-rules.sh 343/343; the full `tools/test-logbook.sh` passed. On merge, check the "Deploy Firestore rules" run. The owner pastes `Code.gs` later (`form-script/CHANGES-PENDING.md`). |
| `tmp-outbox` | **High.** The sheet script read only the first 12 outbox entries, and skipped entries (residents not on the Residents tab) were never removed, so others' cases stopped reaching the sheet. Now: a cursor (`LOGBOOK_OUTBOX_CURSOR`) and a nightly report that fails when an entry has been skipped for over a day. Also: delete then Undo re-queues; the admin count check counts app rows. | First pass built and reviewed: ship (63b2dad). Second pass 7377451 (one run at a time, a by-hand tool for entries under a wrong id, rid set mid-session, an offline delete no longer reported as failed: **a rules change**, `resource == null`). Not yet reviewed. The top commit `WIP …` is untested. The owner pastes `Outbox.gs` into the response sheet after merge (OUTBOX-README "Updating the script after a change"). |

## Not started (queued follow-ups)

- **Atomic delete (high):** moving to the bin is two writes up to 3 s apart offline. A kill in between hides the case everywhere for up to 30 days, and Restore is a no-op (`findings/lifecycle.json` #1, `listeners.json` #3). Put the bin entry on the delete job and write both in `commitRecord`'s transaction.
- **sameResponse (high, one line):** it matches any whole quarter-hour, so a second Form response for the same date sent 15, 45 … minutes after an imported one is dropped silently. Accept only the sheet's +8 h offset (`findings/time.json` #1).
- **Workbook re-import (high):** it brings back deleted Form cases, duplicates redated ones, and gives an edited Case-tab row a new key. Skip rows stamped after the inbox went live by default, and identify rows by (rid, timestamp second) (`findings/import.json`). Until then, **don't re-import the workbook**.
- Recent changes can't restore a note version (`backup.json` #2); Excel upload from a stale copy reverts edits (`time.json` #3); pasted-list sheet entries and duplicates on re-save (`lifecycle.json` #2); Plan for later drops the oldest plans at 100 (`rules.json` #3).
- Design gap for the owner: a Form-only resident's cases stay in the inbox (and their counts summary goes stale) until they open the app.

## Firetop's soak runs (local emulator)

On main after #574 (harness fixes): Firefox 76343995 and 440929881 PASS. Every remaining failure has the
`tmp-writes` shape: Chromium 419136196, 46813064, 76113342 and 440929881 (on 2dfe503); Firefox 76113342 (on 2dfe503).
Firefox 358733102 still needs a clean rerun (static-server flake). Rerun all of them on `tmp-writes` once it's merged.
