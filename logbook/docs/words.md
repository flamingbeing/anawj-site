# Logbook: words used in the app

Part of the logbook working notes; index in [../NOTES.md](../NOTES.md).

- "Tags", not categories. **APMES tags** = the programme's categories (built in, count towards
  targets); **personal tags** = your own (may link to APMES tags; under an APMES tag counts towards it).
- **Tag groups** = the old templates (one-tap sets in Quick picks). The programme's ones (Admin portal) are
  only a starting set: each is copied once into the resident's own tag groups (id `sh-<id>`,
  `settings.sharedSeen`), where it can be edited or deleted like any other and doesn't come back.
- Logbook **Case summary** (the case box). Reflection **Case details** (prefilled from the case summary).
- **☆ Interesting** = the star on a case (`reflectTag`; was "Possible reflection"): a bookmark for interesting cases.
  Logbook rows show "☆ interesting", Filter → Show has "Interesting", the Reflections tab offers them first.
- **Analytics** = the old Progress tab (`#progress`), in More. **Totals** (`#totals`, Programme totals) is its own tab
  (owner, 15 Oct 2026): the bar starts Case, Logbook, Totals, Reflections, More (Analytics, Case logs, Notes in More);
  Totals shows to programme residents, faculty, PDs and admins with the totals switch on. Its table scrolls inside the
  card so the names row and the Category column (at most a third of the width) stay frozen; no tooltips on the
  counts (tap and hold clashed with selecting text); All tags / Towards minimums sit below the table; Download all
  years (zip) saves one Excel file per residency year.
  Reflection progress credits at most one complete JR reflection per heading (two for Paediatrics).
  Extra JR reflections remain saved, with a note explaining why they do not count. Heading bars,
  overall progress and shared summary counts use this same cap. Required JR cases and sub-types remain reminders.
- **Back navigation** (`navigation.js`): tab buttons, menu items and screen links add browser history
  consistently. Browser Back/Forward restore screens; a screen's Back link retraces the same history
  without adding a loop. Direct child-page links get a finite parent trail (Layout → Settings → More);
  reload preserves it. The root screen can leave the app normally. The demo query stays on every screen.
  Pending Account/profile edits flush and Admin editing state clears on all screen transitions,
  including browser Back.
- More → **Export / Import** (`#data`): **Export** = the Word portfolio only (it holds everything APMES needs);
  **Import** = reflections from Word (`#reflimport`) and the logbook from Excel/CSV; **Backup** = backup file and
  restore, Excel spreadsheet. Keep that wording. The Logbook and Reflections tabs have no More tools cards.
- **Backup file and restore** (`backup.js`; unit `test/backup.test.mjs`, e2e `bugfixes.mjs`; audit, 14 Oct 2026): both
  wait for the server's copy first (`S.casesSynced && S.reflectionsSynced`, then `notesFromServer`). A new phone, or
  one signed in again (sign-out wipes the device copy), shows an empty list until it comes, and a restore then counted
  every case and reflection as missing and wrote the backup's older copies over newer ones with blind sets. Restore
  waits up to 30 s ("Your logbook is still loading (no signal?), try again"), works out what's missing again when
  Restore is tapped (`restorePlan`; toast "Restoring…"), and writes cases and reflections only where the server has no
  document with that id (`cloud.addMissing`: ids looked up on the server 30 at a time with `documentId() in`, four
  lookups at once, a read per one found, then batches; it needs signal); notes go through the write queue with base
  null. Save to Google Drive / Dropbox takes
  everything as the server has it (`makeBackup({ fromServer: true })`, "Not saved" after 30 s; the notes zip then
  reads the same notes). Download backup and the spreadsheet wait 10 s, then save this device's copy and say so in
  the toast (a backup made offline still helps), or stop if the device has nothing yet.
- **Excel backup** (`export-opts.js`, tested; dialog in `ui-logbook.js` `downloadExcel`): logbook + reflections
  (or one), date range, columns ticked and ordered, tag/date style, Summary sheet; saved as
  `settings.excelExport`. The Cases sheet keeps a hidden id column and a veryHidden "Export info" sheet
  (export time, date range): uploading back never deletes cases outside the range or newer than the file.
- **Advanced search** (`search-ops.js`, tested; Settings → Logging, `settings.searchOps`, **off by default**):
  initials: title: (first line) case: tag: "phrase" -word OR/| AND; a "?" by the box lists them (tap one to add it at the cursor); a misspelt operator is searched as
  text with a "did you mean" note. No raw regex (owner's choice). Reflections search has its own
  operators (REFL_FIELDS: initials: heading: title: diagnosis: case:). Logbook More also has "Case sensitive"
  (`settings.lbCase`, off by default; tag: always ignores case).
- Future dates are allowed (Log date picker, calendar "+ Add"); they show as "upcoming".
