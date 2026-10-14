---
name: drift-check
description: Check whether the logbook app's data and the Google Form response sheet agree (counts per resident and category, missing rows, deletes, waiting Form and sheet entries) by asking the owner's home-computer session (Firetop) to run its read-only drift-check script. Use when the owner asks to check drift, sync or whether the app and the sheet match.
---

# Drift check (logbook app vs response sheet)

Owner (14 Oct 2026): both places are trusted, so a change in either should reach the other, and the app is the
source of truth. This check finds where they have drifted. It is **read-only** and holds no data: the script and its
raw files live on Firetop (the home-computer session, which has the owner's Google access); nothing from it goes into
this public repo.

1. **Ask Firetop to run it** with `send_message` to the Firetop session (`OPERATIONS.md`, "The home computer", has the
   session id), asking it to run `bash Projects/jobs/drift-check/drift-check.sh` (or `drift-check.cmd`) with no arguments and paste
   the output (about 60 s; it prints names, so keep it in chat).
   Say it must stay read-only. A message asking Firetop to change live data may be refused by the permission
   classifier; do not work around that. A live fix needs the owner's own message to Firetop (give them the wording).
2. **Report to the owner in plain words**, in chat only: the verdict (IN SYNC, or how many differences), then the
   differences grouped by cause (waiting in the Form inbox, deleted in the app, category edited on one side, WRONG
   ENTRY, unexplained). Show each resident's **name next to their ID** in chat (owner's request); never put names, case
   text or counts per named resident in a file, PR or issue here.
3. **Know what is not a fault:** edits and deletes made in one place don't yet reach the other (design until the
   two-way sync is built: `logbook/PLAN-app-to-sheet.md`); a case deleted in the app stays in the sheet; the sheet's
   Totals have no 26iv row (its Grand Total counts it); old sheet rows with a blank Timestamp were given the import
   time as `createdAt` in the app, so "created since" counts for the 2023 intake are inflated; the bin keeps 30 days,
   so older deletions can't be seen.
4. **Fixes:** a re-import of the workbook adds only missing rows (each row has a content-based `importKey`; rows
   already in the app or its bin are skipped). It is a live change: the owner approves it, Firetop does a dry run
   first, then writes.
   What it prints: header; one line per resident (cases, sheet rows, totals, differing Totals cells); the row-level gap
   grouped by cause; "Changes to old cases" (edited, deleted, category added or removed, initials, details, date; its
   history file keeps counts only); formInbox / sheetOutbox waiting; a verdict line. A restore looks like an edit, and
   an edit made on the sheet side shows as a missing and an extra row.
5. If the report shows something new (a pattern, a cause), add it to this list; keep the skill short.
