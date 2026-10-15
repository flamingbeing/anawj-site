# Now: Claude Code, Logbook 2 (log2)

**Claude Code, Logbook 2 (log2)** (branch `ccr-afac5e7a-99esax`): **paused (15 Oct, 00:50 UTC, owner's usage limit)** in the middle
of the reliability hour (owner: "spend the next 1hr maximizing reliability and sync data integrity… cast a wide net", with Firetop).

**Resume from `logbook/status/wip/README.md`.** It holds the restore steps for the bundle, the merge order and the state of each of the
5 fix branches (`tmp-writes`, `tmp-bulktag`, `tmp-backup`, `tmp-form`, `tmp-outbox`), the queued follow-ups, and Firetop's soak results.
`findings/*.json` holds about 25 verified audit findings.

Done in the hour: #569 (an admin re-import never overwrites a case already in the logbook), #571 and #574 (multidevice harness:
real offline under a slow network, partial multi-delete, newest queue job, edits that conflict after reconnecting).
Firetop: drift check IN SYNC (16,020 cases); a read-only integrity scan (no duplicates, nothing both live and in the bin, no unknown
categories, no inbox or outbox backlog; 38 imported cases have no date and 11 have a future or pre-2015 date, the residents' own entries;
8 counts summaries are stale, and each heals when that resident opens the app). Firetop can't read the sheet's Apps Script Executions
(its OAuth scopes are too narrow): the owner reads them.

Next on resume, in order:
1. `tmp-writes`: fix the blocking `restore()` regression (see the README), review or drop the WIP commit, full `tools/test-logbook.sh`,
   multidevice seeds, PR, merge.
2. Then `tmp-bulktag` and `tmp-backup` (merge main in, test, PR; possibly one PR with `tmp-writes`).
3. `tmp-form` (rules change) and `tmp-outbox` (rules change; review the second pass first).
4. Queued follow-ups (atomic delete, sameResponse, re-import rules).
5. Ask Firetop to rerun the failing seeds on merged main.

Earlier work (all merged): the app → sheet sync (#527, #532, #546), the drift-check skill (#549, #550), the nightly Totals check (#551),
the save-state commits (#553, #564), and the private dashboard "Logbook Sync Check" (claude.ai/artifact/TFa1Dvn9b4uA4oAedz5111).
The 14 Nov reminder `trig_01XdhSrpiJ31pLuSdwXAKb3V` (turn off "anyone with the link" on the response sheet) is still scheduled.
A stray remote branch `fix/import-no-overwrite` (same commit as #569) couldn't be deleted from here (the proxy refused): harmless.
Messages to Firetop that ask for LIVE changes are blocked by the permission classifier: give the owner paste-ready wording.
