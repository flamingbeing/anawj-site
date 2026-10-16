# NUH Junior Monthly: notes

A helper for the rosterer who does the NUH anaesthesia **monthly junior roster** in the department's Google Sheet.
The sheet (its formulas, colours and tabs) stays the source of truth: the app reads the month's grid tab, helps fill
calls with rules the rosterer can change at any time, and gives back only the day cells to paste over the same block.
Built on the NTF roster app (`ntf-roster/`: rules engine, rule builder, problem flags, auto-fill), in the NUHS design.
First job: cardiac (C3) and ICU (R1B) calls (owner, 15 Oct 2026).

Public repo: no real names, rosters or sheet extracts here. The real sheets, the analysis of two years of rosters and
the scripts that read them are in the owner's private repo `flamingbeing/life` (`data/nuh-junior-monthly/`).

- Address: `nuhjuniormonthly.anawj.com` (own subdomain: it keeps data), practice department at `?demo`.
- Static, vanilla ES modules, no build step. Data in this browser (`localStorage` `nuhjm-v1`; practice `nuhjm-demo`).
  Team sync code from the NTF app is there but off (no Firebase project).
- Design: the NUHS app kit (`../nuhsdesign/app.css` + `app.js`, linked after `tokens.css`, cached by `sw.js`; 15 Oct
  2026, as the NUH roster): the four-quarter band in the `.a-bar`, the kit's tab bar (bottom on phones up to 720 px, a
  strip on tablets, an icon rail at 1000–1599 px so a whole month of the grid fits beside it, the full sidebar from
  1600 px), white rounded groups on the grey ground, the kit's switch, segmented controls, sheets and toast look, phone
  font. The app scrolls inside `#main`, not the page, so `style.css` turns the kit's fixed bars into parts of the flex
  layout. One filled button per screen (Auto-fill steps back to tinted on Rules and More). Light only.

## The department's sheet (what the app reads and writes)

- One spreadsheet per month with a grid tab: a header row `S/N | Grade | Name | 1 … 30 | 1st of next month` (weekday
  names in the row above), one row per person, one code per day, then the 1st of next month (for carrying post call
  over). Below: count rows (each call should be 1 a day) and manpower totals; to the right, points and totals per
  person. The other tabs are formulas over this grid and the day cells hold values only, so pasting values back over
  them is safe. (Exact layout in the owner's private notes; the app finds the header row itself.)
- Grades: AC, R, RES3, RES2, RES1, NHG (TTSH cardiac residents), RP, HC, LOC, MOPEX, RR (rotating residents, the home
  department in brackets after the name), Fellow. Seniors (HOD, SC, C) are left alone on import.
- Codes: postings `C` cardiac (`C-e` echo week, `C-p` perfusion week: no calls), `ICU`, `CP`, `AP`, `OG1`, `OG2`, `LI`,
  `LivOT`, `AH`/`AH1–3`, out-rotations `KKH`, `TTSH`, `NTF`; calls `R1` `R2` `R3` (MO1–3), `S1`, `S1B`, `R1B` (ICU),
  `C3` (cardiac), `OGC`, `OGN`, `OGD`; `PC` post call, `PPC` the day off after an ICU post call; leave `AL SL TL MC ML PL
  HL FCL CCL NS 0.5`; requests `X` no call, `NP` no premed, `(XX)` blocked by the planner, `R` / `R__` call request;
  `Z` not on the roster; `WE`/`PH` are the date (ignored). A sheet cell shows one thing: the call wins over the posting.

## How the app models it

- **Postings** are codes of kind `posting` in each day's cell, planned by the week on the **Postings** tab (people ×
  weeks; Paste rotations takes names down and Mondays across from the rotation sheet). The grid shows the posting as
  the cell colour. Postings vary by year: edit them on People › Codes.
- **PC** is worked out (internal code `x`) the day after any `overnight` call. **PPC** is worked out two days after a
  duty marked `rest2` (R1B) when the person is still on the same posting that day (no PPC after the last Saturday of a
  posting). Both count as days off (`x` token, `@away`). PC/PPC typed on day 1–2 of an imported month (carried over from
  last month) stay as plain codes `PC` / `PPC`.
- **Import** (More): paste the whole grid tab copied from Google Sheets, or a downloaded .xlsx. A call, PC or PPC typed
  over a posting day gets the posting from the days around it. The layout and every cell's text are kept per month
  (`state.sheets[month]`). **A new grade** (16 Oct 2026): someone already on People whose Grade in the sheet belongs to
  another group (the July change-over, RES1 → RES2) moves to the end of that group on Import. The review lists each move,
  ticked; untick anyone who should stay. Only from the newest month imported so far (`latestImported`): an older month
  never moves anyone back (the review says who differs). Someone listed twice moves to the grade of the row that is kept.
- **Staff list for APMES People** (`js/apmes.js`; 16 Oct 2026): APMES People (`apmes.anawj.com/people/` › Import from
  roster) opens this app with `?send=apmes`; a sheet asks, then sends Grade, Name, From, Until for everyone in post (no
  roster, no notes) to the tab that opened it by `postMessage` (to `apmes.anawj.com` or this origin only) and closes.
  More › Export › Copy the staff list for APMES People gives the same text to paste there. The grade is the group's
  first sheet grade (RES2, R, AC…); the first line names the last month imported from the sheet. People's side:
  `people/NOTES.md`.
- **Put it back** (More): the block from day 1 of the first person row to the 1st of next month of the last row, as
  tab-separated text to paste at that top-left cell. Cells whose meaning didn't change go back exactly as typed;
  seniors' rows come back untouched; the list of changed cells is shown. Import again just before pasting if others edit.

## Rules (Rules tab; the rosterer changes them)

Cardiac and ICU rules come from past rosters (a C3 and an R1B every night; C3 → PC → back to C; R1B → PC → PPC → ICU;
first calls by experience as in a senior's SICU list). The rest are predictions from the
department's roster guide, marked **To confirm** (note "Predicted…"); the R1–R3 cover and level rules are off until
the rosterer uses the app for them. New rule type here: **`postingStart`** ("no calls in the first N days of a
posting": no ICU call on day 1, new to ICU from day 4 (tag `icunew`), Ortho/HRM residents from day 8 (tag `rrlate`)).
`spread` has an optional `among` (only people on that posting, their share by days on it). Tags `mo1`–`mo3` are the
call levels; `supernum` = in ICU without calls.

**Backtest (15 Oct 2026)**: the app's import, rules and Auto-fill were run on past real rosters (scripts and numbers
in the owner's private notes). The real rosters break the must-hold rules only in genuine exceptions (a cardiac call
covered by someone not on cardiac, a call on the first day of a posting); Auto-fill breaks them only on nights with
nobody eligible, which it flags, and shares calls more evenly. Import then copy-back gives every month back cell for
cell except post calls the sheet was missing. Changes it led to: a cardiac call may fall in an echo/perfusion week (a preference against); the
Ortho/HRM day-8 ICU rule is a preference; MedHub Sun-then-Fri/Sat weight 2 and liver OT week weight 5 (real rosters
break them often); fair shares weight 10, counting echo/perfusion weeks as cardiac days; import keeps the posting
under leave and blank days inside a posting and across the month boundary; someone listed twice keeps the row with
their roster; copy-back never writes a posting the sheet didn't show, and leave beats PC.

**Owner's rulings, 16 Oct 2026** (the order of what gives way): (1) a night with nobody on cardiac or ICU call is never
acceptable; (2) post call as a day off (and the ICU day off after it) is a must-hold that is never waived; (3) call
requests (X) and planner blocks (XX) are preferences (weights 60 and 80), kept when there is room and given up first when
a night would otherwise be empty; (4) "new to ICU: calls from day 4" is a must-hold only for rotating residents and
MOPEXes (rule `r-r1b-new`, `who.onlyGroups`: the person must be in one of those groups and also match the tags); for
anaesthesia residents it is a preference (`r-r1b-new-res`, weight 30). Saved states from before get this once
(`rulesVersion` 2 in `model.js`). **EOD call** (owner, 16 Oct 2026): a call right after the post call day. Never a call on the post call day itself (must-hold,
`r-postcall`, `r-r1b-gap`, `r-c3-gap`). The day off after an ICU post call (PPC) and the 3-day cardiac gap give way only as a
last resort: `r-ppc` and `r-c3-eod` are preferences at weight 500, so Auto-fill uses an EOD call only when no one else can cover
the night, and Check lists each one. (Same-day rules now see the PPC day off: before this, PPC in a same-day rule matched
nothing.) Saved states get this once (`rulesVersion` 3). A call on the first day of ICU (`r-r1b-d1`) is also a last resort now (preference, weight 400): at a rotation change everyone on ICU can
be on day 1. Import last month's tab first so postings that carry over are not mistaken for new ones (the import review says
so when last month is missing). A night with nobody eligible at all is still left empty and flagged.

**Google Sheet in and out, straight from the browser** (owner, 16 Oct 2026; `js/gsheets.js`, `ui-more.js`). More has "Read from
Google" (paste the sheet link, sign in; scope `spreadsheets` through Firebase Auth's Google pop-up, access token kept in memory
only) and, for a month read that way, "Check, then write" and "Undo that write in Google". Safety, because the sheet must stay
exactly as it is plus the calls: it writes only the changed cells, as plain values (RAW), after (1) re-reading the whole imported
block and checking every name and day cell is still exactly what was read (a moved row or an edit stops it and names the cells),
(2) refusing any cell that holds a formula, (3) a confirmation listing every cell (was, will become), and (4) reading the cells
back. The write is recorded (`sheets[month].lastWrite`) so "Undo" puts back what was there, but only in cells that still hold what
was written. It acts as the signed-in person, so the sheet's sharing and protected ranges still apply. A month read from a paste or
.xlsx has no Google source and keeps the copy-and-paste way. Needs the Sheets API on the Google Cloud project and the scope on the consent screen
(In production, unverified-app notice, 100-user limit): see `OPERATIONS.md`. Untested against real Google in CI (a fake Sheets API in the unit and browser tests).

**Lock a month** (owner, 16 Oct 2026): the Lock button at the top sets the month's status to `published`, which the team copy already
stores (no rules change). While locked, `store.commit` refuses any change to that month's days (calls, Auto-fill, import, copy back)
and says why; unlocking asks first. Undo/redo and Restore are not blocked.

**Days around the month** (owner, 16 Oct 2026): the Roster grid shows greyed, read-only columns before and after the month (back to
the first working day before it, at least two days; on to the first working day after it), so you can see where people come from,
where they go next and who is post call. They show what is in the app for those dates (so import last month too). "Days around"
in the toolbar turns them off (per device). They are not part of editing, Auto-fill or the copy back to the sheet.

**Team copy of a month = one JSON string** (16 Oct 2026): Save to team failed with "too many index entries for entity /months/…/versions/…":
Firestore indexes every field of a map, and a month's days (days × people × codes) went over its limit of 40,000 index entries a
document. `cells` is now saved as one JSON string (`cloud.js` `cellsFromDoc` reads either form; the rules accept a map or a string
up to 900,000 characters). More shows Team sharing first, with Save to team and Pull from team.

How to add a rule type: as in `ntf-roster/NOTES.md` ("How to add a new rule type"); the engine is the same file.

## Tests

`node nuh-junior-monthly/test/app.test.mjs` (rules, PPC, auto-fill, sheet round trip) and
`node nuh-junior-monthly/test/e2e.mjs` (static server on port 8080: every tab on desktop and phone, axe, Postings,
Auto-fill). Both run in the Checks workflow.

## Earlier saves (owner, 16 Oct 2026)

More > Team sharing > **Earlier saves** lists the last 20 saves of the month on screen, or of the staff list and rules, with
who saved and when. **Restore** brings that copy into the browser only (Undo puts the current one back); it reaches the team
at the next Save to team. Every save is kept for good for now. Thinning (a Firestore TTL policy on an `expireAt` field: about
60 days, keeping the first save of each week) is planned but not built; the owner asked for a reminder in December 2026.

## Months start locked (owner, 16 Oct 2026)

Every month is locked until someone unlocks it (the Locked button at the top). A month with no entry yet gets a locked one
when it is opened (`store.ensureLocked`); the first time this version starts on a device, every existing month is locked
once (`settings.lockedByDefault`, `store.lockAllOnce`). Reading a month in from Google or the sheet unlocks that one month
(it is deliberate). Not in Practice. A month the team copy holds as unlocked stays unlocked when pulled. The stored
status values are unchanged (`published` = locked), so no rules change.

## The cloud (owner, 16 Oct 2026)

"Team sharing" became **the cloud** (Save to cloud, Pull from cloud): there is one shared copy, not a group. A **cloud button in
the header** (hidden in Practice and until Firebase is set up) says Saved 2:14 pm, Not saved, Cloud is newer or Cloud differs,
with a dot when something needs doing; it opens the cloud panel (the same panel as More > Cloud: sign in, Save, Pull, Earlier
saves, who saved last and when, when this browser last changed). `js/cloudstate.js` keeps the three times per device
(browser changed, last synced, cloud last known); `ui-team.js` `checkCloud` asks the cloud quietly (4 s after start and when the
tab comes back, once the cloud has been used here). Auto-fill shows only on the Roster tab; a locked month says so on the
roster with an Unlock button. After a verified write to the Google Sheet a toast offers to open the cloud. No autosync: the
status is the safeguard (owner, 16 Oct 2026).

## Locking cells (owner, 16 Oct 2026)

A cell's lock (Auto-fill leaves it alone) is the first thing in the cell popup, and Paint has a **Lock** chip: tap or drag
across cells to lock them, tap a locked cell to unlock it. Not to be confused with locking a month (header button).

## People not in the imported sheet, and folding groups (owner, 16 Oct 2026)

An import records who the sheet lists (`sheets[month].inSheet`) and who was on the staff list at that moment (`known`).
Anyone known but not listed is **hidden from that month and treated as not in post** (`model.js` `notInSheet`: the roster,
Day, Check, exports and, through `act` in `rules.js`, Auto-fill and the rules). Someone added after the import is not in
`known`, so they stay visible. The roster toolbar says "N not in the sheet" and shows them again (setting
`hideNotInSheet`, default on). Months with no imported sheet hide nobody. `sheets` is not part of the cloud copy, so a device
that has not imported the month shows everyone. Group headers in the roster fold (`ui.collapsed`, kept per device).

## Request importance (owner, 16 Oct 2026)

Requests come from the sheet as plain codes, so importance is a code, not a per-cell setting (it would be lost on every
import and export). No-call requests: **`X!` must have** (going on holiday, weight 150), `XX` blocked by the planner (80),
`X` asked (60), **`X?` nice to have** (clearing leave, 20). `R` (call wanted, 10) stays the low "wants more calls" request.
All are soft: a night is never left empty for them. Saved rosters gain the codes and rules once (`rulesVersion` 4).

## Beyond cardiac and ICU: things to remember (owner, 16 Oct 2026; the department's own words are in the owner's private notes)

Not built; recorded so the next session designs for them.
- **Leave approval is a different problem** from filling calls: it needs how many junior staff each theatre day requires.
  Associate consultants count towards the senior side. Green MOs (baby MOs included) cannot be left alone in theatre but
  still count for something. The department's sheet has a second "actual manpower" row and a formula for this; read it
  before designing. Cardiac and ICU juniors do not count towards OT cover (they are not in OT and cannot cover lists).
- **R1 to R3 calls** (junior residents, year 3 and below; SRs and ACs have their own calls, managed by another rosterer):
  a chronic pain junior takes no calls during their posting week and cannot be post call into it (weekends are fair game);
  OG float people take no calls; none of these people may be post call into their posting, and nobody should be post call
  into annual leave.
- Per-person ability is a ladder (R1 most senior, R3 most junior, cumulative); the default is the highest call a person can do,
  a step-down call needs explicit approval; baby MOs take no calls until they pass the test; very new people are not given
  calls (a per-person "no calls until" date is the planned home for both).

## Grades come from the sheet, per month (owner, 16 Oct 2026)

Each import records the grade (group) every person has in that month's sheet (`sheets[month].grades`). A month shows, and
the rules and Auto-fill use, the grade its own sheet gave (`model.js` `gradeIn`, `personIn`, used by `staffInMonth` and the
rule context), so a promotion changes only the months from then on and an old month keeps the grade it had. People
and a month with no sheet use the current grade (`staff[].group`), which still moves only when the newest month is imported
(the review's ticks); an unticked move stays in People but the month still shows what its sheet said. Someone listed twice
takes the grade of the row that is kept. Not done: a dated change in the middle of a month, and showing "from February" in
People for a future month's sheet.
