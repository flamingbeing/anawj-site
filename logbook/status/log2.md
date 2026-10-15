# Now: Claude Code, Logbook 2 (log2)

**Claude Code, Logbook 2 (log2)** (branch `ccr-afac5e7a-99esax`): **planning with the owner; build nothing until he says
go** (15 Oct). Merged today: #599–#603 (Totals tab for everyone, Analytics in More; Faculty / PCs: Totals, Admin, More;
frozen names row, Category column ≤ ⅓ width, all-years zip, no tooltips; app version at the bottom of More).

Agreed queue (one PR each, in order, once he says go):
1. **Paeds age + paste ticks:** an age ≤ 16 ticks Paeds (EPA 9: 3 to 16 years); an age > 16 drops every Paeds guess,
   shorthand ones too (bug: "circumcision" shorthand ticked Paeds on an 18/M; suggest.js adult branch only drops
   `why: 'keyword'`); no age: trigger words still suggest. Pasted lists follow Settings → Logging → "Tick confident
   suggestions automatically" (off by default) instead of always ticking (`parseBulk` STRONG), plus a "Tick all
   suggestions" button. Fake test case: an adult with "circumcision".
2. **Detection settings** (Settings → Logging → Detection): highlight what was detected (initials, age, BMI) in the
   review and tap to undo (Todoist-style); a list of starts to skip before initials (`===`, `Pt:`); "Allow one-letter
   initials" (I and A still need an age, "/" or "(" after them); detection off switch. Later, maybe, a typed template
   (`=== {initials} ({age}/{sex}, …`).
3. **Reset all settings** button at the bottom of Settings: This device / My account too (tag list kept unless ticked);
   never cases, reflections, notes or drafts; asks, offers a settings-file backup, Undo.
4. **Bulk select and edit:** press and hold (desktop: a Select button) in List and in Calendar's day list; bar: N
   selected, Select all (whole search, across pages), Select none, Bulk edit…, Done. Bulk edit: a row per field
   (date, initials, case summary replace / append / find-replace, APMES tags and own tags add / remove / replace,
   ☆ Interesting), each starts "unchanged"; a warning saying what gets overwritten; Undo in the toast and in Recent
   changes (skips cases changed elsewhere since); through `updateMany`. Folds in today's "Tag N cases…". Open: a second
   confirm above some number of cases?
5. **Grid as a spreadsheet:** thin lines, no boxed inputs; drag to resize columns (per device, double-tap resets);
   lines per row 1 / 2 / 3 / Fit to content.
6. **Paging by default** (owner's call, 15 Oct): 100 per page, choice of 25 / 50 / 100 / 300 / All (per device); "‹ Page
   2 of 14 ›" with a jump list showing each page's dates; a search goes back to page 1; Calendar stays monthly.

Earlier work (all merged): the reliability fixes (#569–#589; follow-ups in `status/wip/README.md`), the app → sheet sync,
the drift-check skill and the private dashboard "Logbook Sync Check" (claude.ai/artifact/TFa1Dvn9b4uA4oAedz5111).
The 14 Nov reminder `trig_01XdhSrpiJ31pLuSdwXAKb3V` (turn off "anyone with the link" on the response sheet) is still scheduled.
Messages to Firetop that ask for LIVE changes are blocked by the permission classifier: give the owner paste-ready wording.
