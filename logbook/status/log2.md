# Now: Claude Code, Logbook 2 (log2)

**Claude Code, Logbook 2 (log2)** (branch `ccr-afac5e7a-99esax`): **planning with the owner; build nothing until he says
go** (15 Oct). Merged today: #599–#603 (Totals tab for everyone, Analytics in More; Faculty / PCs: Totals, Admin, More;
frozen names row, Category column ≤ ⅓ width, all-years zip, no tooltips; app version at the bottom of More).

Agreed queue (one PR each, in order, once he says go):
0. **Bug, first (waiting on the owner's OK to build ahead of the plan):** the reflection editor's "Saved locally ·
   pending sync" is a snapshot taken once after save (ui-reflect.js, `writes.status` read once) while the header follows
   `writes.onChange`, so the editor can say pending under a header that says Synced. Make the editor's status follow the
   queue live (Saving… → pending → Synced, or conflict / failed with its Recover link); check the Notes editor and the
   case edit page for the same snapshot; test: hold the fake server, see pending, release, see Synced in both places.
0b. **Bug: sign-in from the installed app (Firefox Android PWA) leaves a blank tab** (owner, 15 Oct): `cloud.signIn`
   uses `signInWithPopup`; in an installed app the popup opens as a separate browser tab without its opener, so
   /__/auth/handler finishes sign-in (the app shares its storage, so it is signed in) but can't hand back or close
   itself: a blank page until closed. Same cause as the Drive / Dropbox popups (NOTES.md, Oct 2026). Fix: when the app
   runs installed (`display-mode: standalone`) or on Firefox for Android, use `signInWithRedirect` straight away
   (authDomain is our own apmes.anawj.com, so the redirect keeps its storage); keep the popup on desktop browsers;
   `getRedirectResult` is already called on start. Check on a real phone (owner or Firetop): Chrome and Firefox,
   installed and in a tab.
1. **Paeds age + paste ticks:** an age ≤ 16 ticks Paeds (EPA 9: 3 to 16 years); an age > 16 drops every Paeds guess,
   shorthand ones too (bug: "circumcision" shorthand ticked Paeds on an 18/M; suggest.js adult branch only drops
   `why: 'keyword'`); no age: trigger words still suggest. Pasted lists follow Settings → Logging → "Tick confident
   suggestions automatically" (off by default) instead of always ticking (`parseBulk` STRONG), plus a "Tick all
   suggestions" button. Fake test case: an adult with "circumcision".
2. **Detection settings** (Settings → Logging → Detection): highlight what was detected (initials, age, BMI) in the
   review and tap to undo (Todoist-style); a list of starts to skip before initials (`===`, `Pt:`); "Allow one-letter
   initials" (I and A still need an age, "/" or "(" after them); detection off switch. Later, maybe, a typed template.
2b. **The line under the Case box shows the initials too** (owner): "ABM = initials · 72M = 72 years · male", the
   initials as they'll be saved (capitals), in the same blue as their highlight in the box; only when they were read
   from the box (not typed in the Initials field). Tap one to undo it (with item 2). Bug found alongside: the age reading
   takes any 1–3 digits ("544y = 544 years"); `splitAge` / `humanAge` (engine.js) should only take ages up to ~120 years
   (and sane months / weeks / days), as `parseAge` in suggest.js already caps at 110.
   Lighter highlights in the box (owner: hard to read): style.css `.box-marks mark.m-ini` 22% → ~10%, `m-age` 24% →
   ~10%, `m-lab` 18% → ~9%, plus a 2 px underline in the full colour so they still stand out; check contrast in light,
   dark and high-contrast themes (a11y.mjs).
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
6. **More page:** group 1 under the page's own "More" title, no extra heading (hidden tabs, Recover, Export / Import, Settings last); group 2 "Account and help" (Account,
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
9b. **Select and bulk edit in Notes too** (owner): press and hold a note (desktop: Select) in More → Notes; the same bar
   (Select all / none, Bulk edit…, Done). Bulk edit: date (set or clear), title (replace / find and replace / add in
   front), text (add to the end / find and replace), unlink from case, merge the selected notes into one (in date
   order), share or export just these, move to the bin. Same warning, 20+ second step and Undo as cases.
9c. **Select and bulk edit in Reflections too** (owner): the same press and hold / Select and bar. Bulk edit: heading,
   status (draft / complete), in the portfolio export (tick on / off), JR flag, date; export just these (Word portfolio
   or Markdown); move to the bin. Same warning, 20+ second step and Undo.
9d. **Bulk edit popup holds the actions too** (owner): while selecting, the bar is only "N selected · Select all ·
   Select none · Bulk edit… · Done"; the popup has Change (a row per field, each "Unchanged" until chosen) and Actions
   (export or share just these, merge (Notes), move to the bin); Review changes → warning → Save; the same popup on
   Logbook, Notes and Reflections.
9e. **Global search** (owner): a 🔍 in the header on every tab (can also go on the bar; `/` on a computer). The Logbook
   search language (search-ops.js) plus `in:cases|reflections|notes`, `heading:`, `status:draft|complete`,
   `is:interesting|planned`, `has:reflection|note`, `no:tag`, `linked:`; an ⓘ list of them; filter chips (type, dates,
   tags, status, Interesting) kept in step with the typed operators. Results grouped by type with counts, Best match or
   Newest, highlighted snippets, tap opens the item in its tab; a case row links its reflection and notes. Saved
   searches shared with the Logbook. Offline for what's on the device (notes load on first search). Results join bulk
   select (fields shared by the selected types). The Logbook keeps its own box (same engine, cases only).
9f. **Reflections on the Logbook calendar** (owner; off by default): a "Show reflections" toggle on the Calendar view
   itself (per device). Days with a reflection get a small reflection mark beside the notes mark; the day's list shows
   each reflection under its case (or on its own when not linked to a case), tap opens it.
9g. **Case box height that stays** (owner): a dragged height is remembered per device (after Save, tab switches,
   reloads); Settings → Advanced logging → Box height shows it and its reset undoes it. Phones can't drag the
   browser's own corner handle, so add a grab bar under the box (a 44 px touch target, pointer events, works with a
   mouse too; double-tap resets). "Grow as I type" switch, ON by default (owner, 15 Oct): the box grows from the set height as text is added, up to
   about two thirds of the screen, then scrolls; a dragged height is the starting size.
9h. **Totals: Compact** (owner; ON by default, per device): a Compact switch at the top of the Totals card (by the year
   picker and the buttons). Names become initials ("AJ"; a clash adds the next surname letter, "AJi" / "AJa"), set
   across on one line, no year (the page is one year); tapping an initials heading shows the full name in a small bar
   (a tap, never tap and hold), and a key under the table ("AJ = …"). Categories use their short names (the pill names)
   in a column at most a quarter of the screen; tighter cells. Target lines stay on by default, with a "Show targets"
   toggle at the bottom of the table (beside All tags / Towards minimums). Excel downloads keep full names and full
   category names. Compact off: the table as now.
9i. **Suggested colours** (owner, 15 Oct; replaces the 13 Oct "no preset swatches" call in ui-settings.js): Settings →
   Display → Colour shows swatches in two rows (owner, 15 Oct): NUH (navy, the default; orange; red; blue; as they are)
   and muted (desaturated teal, sage, dusty purple, slate); then pastels (blush pink, lavender, mint, peach, powder blue,
   butter yellow: used as the tint, with a deeper shade of the same hue for text and buttons so they stay readable) and a last "Custom…" swatch that opens the device's own picker as now; a tick on the one in use (a custom
   colour shows in the Custom swatch). The same light / dark readability adjustment as today; each suggested colour
   checked for contrast in light, dark and OLED.
9j. **Themes page above Display** (owner; with 9i): Settings → Themes holds the look: ready-made themes as preview
   cards (NUHS, the default as today; Flat; Soft; Paper; Dark navy; OLED; High contrast), each a bundle of light /
   dark, colour, Colourful, corners, borders / shadows and font; picking one sets those, and changing any of them
   after shows "Custom (based on …)" as profiles do. Below the cards, the parts themselves moved out of Display and
   Advanced display: Light or dark, Colour (the swatches and Custom), Colourful, corners, borders, shadows, fonts and
   line spacing. Display keeps the layout: compact, start tab, header and tab bar, Logbook rows, Case tab layout,
   Plain calendar, icons on buttons. Per device, as now. Reset this page on each.
10. **Grid as a spreadsheet:** thin lines, no boxed inputs; drag to resize columns (per device, double-tap resets);
    lines per row 1 / 2 / 3 / Fit to content.
11. **Paging by default** (owner's call, 15 Oct): 100 per page, 25 / 50 / 100 / 300 / All (per device); "‹ Page 2 of
    14 ›" with a jump list showing each page's dates; a search goes back to page 1; Calendar stays monthly.
12. **More Send to presets** (iPhone users especially): Apple Notes via a Shortcut (setup steps or a shared Shortcut
    link), Email (mailto), Telegram, Drafts, Bear, Things, Day One; a line for apps with no link (Keep, Notion, OneNote):
    use Share. Check each link on a real iPhone first (owner or Firetop).

14. **Group by and Sort in the Logbook List view** (as Reflections has): Group by Month (default) / Day / Week / Residency
    year / APMES tag (a case under each of its tags; heading shows count vs target) / Your tags / Flags (No tag yet,
    ☆ Interesting, Plan for later) / None; Sort Newest / Oldest / Initials A–Z / Most tags. Headings fold with counts;
    per device. Pages count cases ("(continued)" on a split group); when selecting, a group heading selects the
    group (a case in several groups is selected once). After paging.
15. **Markdown, one PR** (Copy / Share, Send to, Sync, the notes zip, all alike): Settings → Markdown → "Reflections in
    the day's note": None / Link / Embed (Obsidian `![[…]]`) / Full text (copied under its case); the same for linked
    notes. **Sync also writes the reflection notes** (a Reflections folder, same names and folders as the zip) so Link
    and Embed work in a synced vault. Where no reflection note can exist (Copy / Share, Send to apps other than
    Obsidian) Link and Embed fall back to Full text. **Day heading** default becomes plain (`2026-10-10`, not
    `[[…]]`); choice Plain / Heading (`#`) / Link (`[[…]]`) / Custom template. **Date format** presets (2026-10-10,
    20261010, 10 Oct 2026, Sat 10 Oct 2026, 10/10/2026) plus a Custom pattern (YYYY YY MM M DD D MMM MMMM ddd dddd)
    with a live preview; link targets and file names follow it, file names can have their own. One preview box shows a
    sample day with a case and a reflection. markdown.js (`mdDay`, `caseNotes`), ui-sync.js, unit tests.

No batching (owner, 15 Oct): build and merge in order, each PR on its own (bulk edit still gets the full tests and a
Firetop run on a test account). All the Send to presets above are in. The app is alpha with almost no users (owner, 15 Oct): no compatibility
links or migration niceties needed for moved pages.

Earlier work (all merged): the reliability fixes (#569–#589; follow-ups in `status/wip/README.md`), the app → sheet sync,
the drift-check skill and the private dashboard "Logbook Sync Check" (claude.ai/artifact/TFa1Dvn9b4uA4oAedz5111).
The 14 Nov reminder `trig_01XdhSrpiJ31pLuSdwXAKb3V` (turn off "anyone with the link" on the response sheet) is still scheduled.
Messages to Firetop that ask for LIVE changes are blocked by the permission classifier: give the owner paste-ready wording.
