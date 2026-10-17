# Reliability hour, 15 Oct 2026 (log2): what's left

All five fix branches are merged: #583 (save queue), #584 (bulk tags), #586 (backup restore, reflection bin), #587 (Form inbox,
rules `formGone`), #589 (sheet outbox, rules late delete). The verified audit findings (scenario, consequence, fix, verifiers'
corrections) stay in `findings/*.json` for the follow-ups below. Delete this folder once they're done or dropped.

## Follow-ups, not started (in order)

1. **sameResponse (high, one line):** `form-inbox.js` matches any whole quarter-hour, so a second Form response for the same date
   sent 15, 45… minutes after an imported one is dropped silently. Accept only the sheet's +8 h offset (`findings/time.json` #1).
2. **Atomic delete (high):** moving to the bin is two writes up to 3 s apart offline; a kill in between hides the case everywhere
   for up to 30 days, and Restore is a no-op (`findings/lifecycle.json` #1, `listeners.json` #3). Put the bin entry on the delete
   job and write both in `commitRecord`'s transaction.
3. **Workbook re-import (high):** brings back deleted Form cases, duplicates redated ones, and gives an edited Case-tab row a new
   key. Skip rows stamped after the inbox went live by default; identify rows by (rid, timestamp second) (`findings/import.json`).
   Until then, **don't re-import the workbook**.
4. Smaller: Recent changes can't restore a note version (`backup.json` #2); an Excel upload from a stale copy reverts edits
   (`time.json` #3); pasted-list sheet entries and duplicates on re-save (`lifecycle.json` #2); Plan for later drops the oldest
   plans at 100 (`rules.json` #3); a re-queue refused while the old outbox entry still exists shows a false sync error.
5. Design gap for the owner: a Form-only resident's cases stay in the inbox (and their counts summary goes stale) until they
   open the app.

## Soak runs (the owner's private helper, local emulator)

Final, on d195cdd (#583's tip): **12 of 12 pass**. Firefox 358733102, 76113342, 835480189, 561493112, 642390865 (the round-7
stall didn't repeat), 119100182 (failed on the old main); Chromium SLOW=1 76113342, 440929881, 457040346, 638535459, 194105582,
131229630 (failed on the old main); plus local Chromium 419136196 and 46813064. WebKit conflicts gave no result. Nothing is
queued on the owner's private helper; its summary stays on that computer.
