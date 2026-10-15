# Now: Claude Code, Logbook 2 (log2)

**Claude Code, Logbook 2 (log2)** (branch `ccr-afac5e7a-99esax`): the reliability hour's fixes are **all merged** (15 Oct):
#569 (re-import never overwrites), #571 and #574 (multidevice harness), #583 (save queue: saves after a conflict, conflicts show the
server's copy, a second window never resends), #584 (bulk tag / merge / re-import through the queue), #586 (backup restore never
overwrites, reflection bin deletes check the version, backups use server notes), #587 (Form inbox; rules `formGone`, deploy ✓),
#589 (sheet outbox paging, script lock, restores re-queue; rules late outbox delete). Owner steps for #587 / #589 are under
"Waiting on the owner" in `logbook/STATUS.md`.

Next, in order: the follow-ups in `logbook/status/wip/README.md` (sameResponse one-liner, atomic delete, re-import rules, smaller
items). Local worktrees `/home/user/wt-*` are merged leftovers.

Earlier work (all merged): the app → sheet sync (#527, #532, #546), the drift-check skill (#549, #550), the nightly Totals check (#551),
the save-state commits (#553, #564), and the private dashboard "Logbook Sync Check" (claude.ai/artifact/TFa1Dvn9b4uA4oAedz5111).
The 14 Nov reminder `trig_01XdhSrpiJ31pLuSdwXAKb3V` (turn off "anyone with the link" on the response sheet) is still scheduled.
A stray remote branch `fix/import-no-overwrite` (same commit as #569) couldn't be deleted from here (the proxy refused): harmless.
Messages to Firetop that ask for LIVE changes are blocked by the permission classifier: give the owner paste-ready wording.
