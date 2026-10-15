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
   initials" (I and A still need an age, "/" or "(" after them); detection off switch. Later, maybe, a typed template.
3. **Reset all settings** at the bottom of Settings: This device / My account too (tag list kept unless ticked); never
   cases, reflections, notes or drafts; asks, offers a settings-file backup, Undo.
4. **Full Analytics for every profile:** the `analytics` switch on by default everywhere. Exceptions kept (owner):
   Personal stays without the APMES parts; Basic: logbook only stays without the Reflections card.
5. **Analytics Edit mode:** Edit at the top; cards fold to rows; drag handle (plus Move up / down) to reorder; eye to
   hide, a "Hidden cards" list to bring back; Reset layout; Done. Saved for the account. Cards a profile can't use
   aren't listed.
5b. **More Analytics cards** (owner: build them all, show only the most important by default; the rest start hidden in
   the Edit mode's "Hidden cards"). Shown by default: Finish line (per tag, the date your pace reaches its target vs
   its due year), This posting / this month (cases, top tags, new tags, targets met), Reflection material (☆ cases by
   the heading they'd fit, for headings still short), Milestones (firsts, round numbers, targets met, dated). Hidden by
   default: Patient ages, ASA mix, Elective vs emergency and GA vs regional (marked "estimated", with "from N of M
   cases"), Logging habits (how soon after the case, streak). Faculty / PCs: Year comparison (each year's median per
   target, residents well behind it highlighted), shown by default in their Analytics.
6. **More page:** group 1 (hidden tabs, Recover, Export / Import, Settings last); group 2 "Account and help" (Account,
   Send feedback, Feedback, Admin portal; owner: Account moves here) with its own heading; privacy and credits as plain matching fine print
   (no cards) at the very bottom, after Install and Sign out, before the app version. Privacy text (owner agreed):
   "Privacy · Only you can read your cases (and the app owner, for the old Google Form import). Log initials only,
   never names or NRIC. Programme residents share counts per tag, never details. Sign out on shared devices."
7. **Default bottom bars** (owner, 15 Oct; with the Edit mode below): logbook only Case · Logbook · Totals · More;
   Basic + Reflections; Advanced + Reflections · Analytics; Personal Case · Logbook · Notes · Reflections · Analytics ·
   More (Notes in Totals' place, the owner uses Personal); Faculty / PCs Totals · Admin · More. Notes (beta) in More
   elsewhere. No Totals off the programme list. Devices arranged by hand keep their arrangement.
   **More page Edit mode:** pin a row to put it on the bar or take it off (a full bar asks which it replaces); drag to
   reorder the More list and the bar strip; Done. Per device. Arrange tabs in Settings stays and links here.
8. **Profile page:** Profile card; "Show or hide" as a section heading, not a card; groups in tab order: Case tab,
   Logbook (Grid moves here), Reflections (Reflect buttons / ☆, figures and references move here), Analytics (the
   analytics extras move here), Header and tabs, Tips and help, APMES last. The Extras card goes (owner).
8b. **One "Recover" page** (in More; can go on the bar), replacing Recent changes / Recover drafts and the Settings →
   Data Recycle bin (no link left there: alpha, no old habits; owner). Sections, each folded with a count and a line
   saying all devices or this device: Needs attention (only when any: unsynced / clashing changes, Retry, Keep mine /
   theirs), Recently deleted (the bin, all devices, 30 days), Unfinished drafts (this device), Earlier versions (this
   device, last 100; folded by default).
9. **Bulk select and edit:** press and hold (desktop: a Select button) in List and in Calendar's day list; bar: N
   selected, Select all (whole search, across pages), Select none, Bulk edit…, Done. Bulk edit: a row per field (date,
   initials, case summary replace / append / find-replace, APMES and own tags add / remove / replace, ☆ Interesting),
   each starts "unchanged"; a warning saying what gets overwritten; Undo in the toast and in Recent changes (skips
   cases changed elsewhere since); through `updateMany`. Second step at 20+ cases for overwriting changes only
   (replace date / initials / summary, remove or replace tags, Interesting off): 3 sample before → after and a button
   naming the size. Folds in "Tag N cases…".
10. **Grid as a spreadsheet:** thin lines, no boxed inputs; drag to resize columns (per device, double-tap resets);
    lines per row 1 / 2 / 3 / Fit to content.
11. **Paging by default** (owner's call, 15 Oct): 100 per page, 25 / 50 / 100 / 300 / All (per device); "‹ Page 2 of
    14 ›" with a jump list showing each page's dates; a search goes back to page 1; Calendar stays monthly.
12. **More Send to presets** (iPhone users especially): Apple Notes via a Shortcut (setup steps or a shared Shortcut
    link), Email (mailto), Telegram, Drafts, Bear, Things, Day One; a line for apps with no link (Keep, Notion, OneNote):
    use Share. Check each link on a real iPhone first (owner or Firetop).

No batching (owner, 15 Oct): build and merge in order, each PR on its own (bulk edit still gets the full tests and a
Firetop run on a test account). All the Send to presets above are in. The app is alpha with almost no users (owner, 15 Oct): no compatibility
links or migration niceties needed for moved pages.

Earlier work (all merged): the reliability fixes (#569–#589; follow-ups in `status/wip/README.md`), the app → sheet sync,
the drift-check skill and the private dashboard "Logbook Sync Check" (claude.ai/artifact/TFa1Dvn9b4uA4oAedz5111).
The 14 Nov reminder `trig_01XdhSrpiJ31pLuSdwXAKb3V` (turn off "anyone with the link" on the response sheet) is still scheduled.
Messages to Firetop that ask for LIVE changes are blocked by the permission classifier: give the owner paste-ready wording.
