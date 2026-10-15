# Form script: changes waiting to be pasted

The Form's Apps Script doesn't update itself from this repo. When `Code.gs` here changes, the copy in the Form needs
the new text pasted in by hand. Delete each item below once it's done.

## 15 Oct 2026: backfill start date (not urgent)

**What changed in `Code.gs`:** only `logbookInboxBackfill`, the function you run by hand to send old responses again.

- Its start date `SINCE` is now **14 Oct 2026** (the day the inbox went live). It was 1 Oct, which sent the
  1–14 Oct responses again even though the workbook import had already brought them in. An imported case a resident
  had deleted could then come back once it had left the recycle bin.
- Its comment now says what is skipped and why the date matters.

Nothing else changed. The automatic part (`logbookInboxSubmit`, the trigger) works the same, so the inbox keeps
working until you paste.

**What to do (2 minutes, on a computer), before you next run `logbookInboxBackfill`:**

1. Open the **Form** (not the sheet) → **⋮ → Apps Script**.
2. Open the file holding the inbox script (`LogbookInbox`, or `Code.gs` if it's the only file).
3. Select all of it and paste the whole of [`Code.gs`](Code.gs) from this repo in its place. Save (💾).
4. Leave the triggers and Script properties as they are. Nothing needs running.

If you never run the backfill, you can skip this.

**Optional, once, only if you'll re-run the workbook import (Admin portal):** after pasting, and once the app update is
live, run `logbookInboxBackfill` with `SINCE` as it is (14 Oct). It sends the responses since then again. Cases already
in the logbook stay as they are; a response edited on 14 or 15 Oct only gets its edit time noted, so a later workbook
re-import doesn't add it twice (a resident may see a one-off "added" or "left as you changed it" message). One
catch: a Form case a resident deleted with "Delete forever" on 14 or 15 Oct (before this update) comes back once;
deleted again, it stays gone.

## Done in the app, no action needed (for reference)

These shipped in the logbook app with the same change. They need nothing from you:

- A deleted Form case stays deleted, even after it leaves the recycle bin, when its response is edited or sent again.
- An old response (from before the inbox) edited in the Form is not added as a second case when the edit keeps its
  day, initials and categories: the app finds the imported case with those, skips the response and tells the
  resident. An edit that changes the day, initials or categories still adds a second case.
- An edited Form response matches its sheet row in a later workbook re-import, once the app has picked up the edit
  (a re-import before the resident next opens the app, or of an edit picked up on 14 or 15 Oct, can still add it
  again).
- A big pick-up on a slow connection no longer marks the later cases as "changed in the app" (cases it already marked
  stay so).
