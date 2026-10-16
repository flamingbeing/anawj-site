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

Every month is locked until someone unlocks it (the padlock at the top), and **an unlock lasts one visit**: every month is
locked again whenever the app opens and when it is closed (`store.lockAll`, at start and on `pagehide`; owner, 16 Oct 2026). A
month with no entry yet gets a locked one when it is opened (`store.ensureLocked`). Reading a month in from Google or the
sheet unlocks that one month (it is deliberate). Not in Practice. A month the cloud copy holds as unlocked comes in unlocked
and is locked again at the next close or start. The stored status values are unchanged (`published` = locked), so no rules change.

## Growing beyond cardiac and ICU calls (owner, 16 Oct 2026)

The owner wants the app to take over the department's other monthly sheet tabs one at a time, so the move off the sheet is smooth:
the **leave waitlist**, the **WR / premed roster**, the **junior call roster** (EOT calls: emergency theatre calls manned by R1 to R3
and S1) and later more. Each new area is a module of its own (data, a reader for its Google Sheet tab, a screen, rules, and later
a write-back of just its cells), not a special case in the main grid. The terms follow the NUH daily roster app
(`nuh-roster/NOTES.md`); the ICU call is R1B.

Built so far (step 1): `js/waitlist.js` (pure: reads the Leave Waitlist tab's rows of `{ v, bg }` into entries with a status, matches
names to the staff list), `gsheets.js` `readColoured` (text plus fill colour only, read only) and `findTab`, `ui-leave.js` (the
**Leave** tab, `#leave`; on phones a card in More). Stored per month in `state.waitlist[month]` on the device (not in the cloud
copy yet). Nothing is written to the sheet from it.

The leave waitlist's **status is only a cell colour** in the sheet (orange waitlisted from an application, no fill ad hoc, green
expedited approved, blue approved, red bad day or rejected, cyan roster drafted and closed). The app reads the nearest legend colour
and writes the status on every chip (colour is never the only sign).

Decided for the next steps: the **daily rosterers** (who run the NUH daily roster, a different group from the monthly rosterers)
change a waitlist status, letting waitlisted people go when manpower is good, so there will be a separate member **role** for them
(waitlist status only; read everything else), kept in its own cloud collection so the rules can allow just that. Late requests
(within 5 working days of the leave date) get a flag. Real tab contents, names and screenshots stay in the private repo.
Order: (1) the shared structure and the read-only leave tab (done), (2) status changes with write-back and the role,
(3) the WR / premed roster, (4) the junior call roster and EOT calls, (5) their rules and Fill. Open question for the owner: what
the columns of the headerless Junior Call Roster tab are.

### The Junior Call Roster tab (columns worked out from the November sheet, 16 Oct 2026)

One row per day of the month, no header row, no formulas (typed or pasted names). Each column was identified by looking at what
the people in it hold in the main grid that day (it matched on all 30 days for every column below):

| Column | What it is | Main-grid code of the person that day |
|---|---|---|
| A, B, C | the three EOT calls (emergency theatre): R1, R2, R3 | R1, R2, R3. Some names carry a tag such as `(GA)` |
| D | a divider (orange fill), empty | |
| E | obstetric day: OGD on weekdays, OGC on weekends and holidays | OGD or OGC |
| F | obstetric night: OGN on weekdays, OGC on weekends and holidays | OGN or OGC |
| G | the ICU call (R1B) with the person's specialty in brackets: `(ICU)`, `(ED)`, `(Uro)`, `(ENT)`, `(Ortho)` | R1B |
| H and on | an orange block, empty | |

Weekend and public holiday rows are filled (green in A to C, red in E and F). S1 and S1B are not on this tab (S1 is only in the main
grid). So the EOT calls (R1 to R3) are the MO team's calls, and the tab can be rebuilt from the main grid.

## Screening requests and the strong / weak pools (the R1 to R3 rosterer's rules, 16 Oct 2026)

The R1 to R3 rosterer opens the sheet's Request tab to the juniors, who type their requests in the grid (`R` or `R_` call
request, `X` no call, `NP` no premed, `X/NP` both in one cell). She wants the problems found and settled by hand **before**
anything is assigned. Built as ordinary rules, so they show on Check and in the sheet:
- `r-req-load`: at most 4 requests a month (call requests, X, NP). `X/NP` is one request (the rule counts days, not codes).
- `r-req-npload`: at most 2 no-premed requests a month. Premed duties (P1 to P6) are not counted yet: they are not on the sheet
  until the premed roster is planned (step 3 of the expansion).
- `r-pool-1/2/3`: at most one call request a day from the MO1 pool (strong and weak), the MO2 pool, and strong MO2 with weak MO3.
  Off until the pool list is imported. Which of the clashing people gets the call is settled by hand, by the reason for the request.
- `R_` is the same as `R` (`sheet.js` strips the underscore); `R1`, `R2`, `R3` are the assigned calls, a different thing.
- The pools are six tags (`mo1s mo1w mo2s mo2w mo3s mo3w`) next to the call level tags `mo1 mo2 mo3`. **People > Tags > Import the
  strong / weak list** takes the department's manpower master list pasted from the sheet (heading row "Strong MO1", "Weak MO1" ...;
  other columns ignored), matches names with the staff list, and gives each person the call level and the pool tag (`js/pools.js`).
  The real list (names) is in the owner's private notes, not here.
- Built next (rules `r-mo-*`, all off until the Rules tab's "Turn on all the R1 to R3 rules" button is pressed, with the other R1 to R3 rules `r-r1/2/3-cover`, `-who`, `r-gap`, `r-fair`): no R1 to R3 call on a posting, obstetric call or rest day; at most one weak MO among a night's R1, R2 and R3 (so a weak R1 gets a strong R2 and R3, and so on); no Friday call six days after a Saturday call; residents 3 to 5 calls a month, fellows 1 to 2, MOPEX 1.
  The other rules she sent are the existing ones: calls followed by PC, leave and Z, X and X/NP, the Saturday cap of 2, no two Saturdays running, no Friday or Saturday after a Sunday.
- Not built yet: no Saturday call after an ICU call on the previous Thursday to Sunday (needs "then on a Saturday" in the sequence rule), the same-week Friday to Sunday cap for one named person (a limit rule with that person picked in Who), and assigning R1/R2/R3 to a request by pool.

## Phone header has no gap (owner, 16 Oct 2026)

On phones the second header row is the month, Today, the lock and Fill. Fill shows on the Roster tab only, so on the other tabs
that slot was an empty hole. The month title now takes the free width (`.month-title { flex: 1 }`), so Today and the lock sit at the
right edge on every tab; a phone test checks it on the Day tab.

Fill is also hidden while the month is locked (owner, 16 Oct 2026), in the header and in the empty-month banner: a locked month can't be changed, so Fill would only
confuse. It returns when the month is unlocked.

## Cell marks (owner, 16 Oct 2026)

The orange corner means a **note**, as in Google Sheets (it used to mark problems, which people read as comments). A problem is a
**ring inside the cell**: must fix is a solid red ring with a soft inner glow, to improve is a thin dashed amber ring. They differ in
shape as well as colour (colour-blind readers), nothing animates, the glow stays inside the cell so it never bleeds into a
neighbour, and in forced-colours (high contrast) mode they become plain solid and dashed borders. The dot after a name (a problem
about the whole month) is unchanged.

## A call on the posting's own day (owner, 16 Oct 2026)

On the sheet a C3 replaces the C that day, so the cell holds no posting code. For the rules (`buildContext` in `js/rules.js`) a C3
(or R1B) day with no posting of its own counts as on that posting when the person has the posting (C, ICU) within three days either
side, in the saved cells too, past the edge of the month. Nothing is written to the roster. So "cardiac call only on a cardiac day"
no longer flags the call itself; a C3 nowhere near a cardiac day still does. The cardiac posting filter and the fair share also count
C3 days (R1B for ICU). The soft preference "no cardiac call on day 1 of the posting" (`r-c3-d1`) does not apply to RES3 and senior
residents (a group limit on the rule; saved rosters get it once).

## Carry-over from earlier months (owner, 16 Oct 2026)

Fairness is judged over a person's run of postings, not one calendar month: on the real rosters (Jan 2025 to Aug 2026) the median
cardiac stint is 11 days and the median ICU stint 15, and 45 to 60% of stints run across a month end, so a month cuts most of them in
half. The "Share fairly" rules for cardiac and ICU therefore add what each person was over (+) or under (-) their share in the months
before: their points minus their posting days times the pool's rate for that month, the last month counting fully and each month
before a quarter less (`carryBalances` in `js/rules.js`; settings "Carry over" 0 to 1, default 0.5, and "Months to look back", default
4). Past months only: next month is not rostered yet, so a symmetric +/- 1 month window was not built. A call day counts as a day on
the posting. Set Carry over to 0 on the rule to switch it off. Backtest (July and August 2026, one real month back): Fill's
single-month spread is slightly worse with it (cardiac 8 against 6, ICU 7 against 5, summed over the two months), because some of
this month's evenness repays last month; the benefit shows over several months, which that backtest cannot show. The analysis is in
the private notes (`data/nuh-junior-monthly/fairwindow-2026-10-16.txt`, `scripts/fairwindow.mjs`).

## Fewer alerts about equal calls (owner, 16 Oct 2026)

The "Share fairly" rules keep aiming for an even share (allowed difference 1 point, so Fill still pushes), but Check and the dot
after a name only mention a gap that is over **Only point it out above** (1 point) **and** over **this % of the average** (40%;
`alert` and `alertPct` on the rule). So a person with few calls, like an MO3, shows up sooner than with a fixed number (1 against an
average of 2 is 50%), and a gap of 2 on an average of 10 does not. Set the percentage to 0 for points only. The R1 to R3 share (off
until confirmed) compares each grade with itself (`byGroup`). Saved rosters get this once (`rulesVersion` 16).

## Colours follow the department sheet (owner, 16 Oct 2026)

People work on the sheet and this app side by side, so a code keeps the sheet's colour family (softened, same hue): calls orange
(C3, R1B, R1 to R3, S1, S1B, OGC), OGN and OGD red, cardiac C magenta, ICU yellow, chronic pain green, acute pain bright green,
liver transplant purple, leave blue, premed and Saturday ward round peach, post call, PPC, Z and NTF grey, blocked, no-call and
no-premed requests red (outlined and tinted), call requests blue, KKH, TTSH, OG1/2 and AH plain. `PALETTE` in `js/model.js`; the
colours before the change are in `BASE_DUTIES`, and a saved duty still in its old colours moves across once (`rulesVersion` 10);
a colour the rosterer chose is kept (until `rulesVersion` 14, which sets every palette colour once; later changes stay). Readable first (owner, 16 Oct 2026: stronger fills made the text hard to read, so the original look came back in the sheet's hues): calls a deep orange with white text, obstetric calls deep red, postings and leave soft tints with bold dark text, requests outlined chips (no fill). Text must still pass axe contrast (the e2e checks), so some are a shade darker than the sheet.
The sheet's cyan "leave requested, not yet approved" is not in the app yet. The screenshots the palette came from are in the
private repo (`data/nuh-junior-monthly/docs/sheet-screenshots/`: real names).

## The cloud (owner, 16 Oct 2026)

**Save and Pull cover all the data** (owner, 16 Oct 2026): the staff list, rules and settings plus every month, each month with its days, status and the imported sheet layout (`months/{m}.layout`, a JSON string, so a second device can write to the sheet and hide people the sheet leaves out). A save writes only the months that changed since this browser last saved or pulled (a fingerprint per month in `nuhjm-team-seen`), each with its own conflict check; a pull brings in every month the cloud holds. Months only this browser has are kept.

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
import and export). No-call requests, strongest first: `XX` blocked by the planner (200: it is already decided, so it
outranks everything), **`X!` must have** (going on holiday, 150), `X` asked (60), **`X?` nice to have** (clearing leave, 20). Call requests have the same levels: **`R!`** must have (100), `R` (10), **`R?`** nice to have (3).
All are soft: a night is never left empty for them. Saved rosters gain the codes and rules once (`rulesVersion` 6; a block saved at the old weight 80 becomes 200).

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

## Header, tabs and Check (owner, 16 Oct 2026)

- **Tabs:** Roster, Check, Day, a separator, then Postings, People, Rules, More (phones: Roster, Check, Day, Rules, More).
  The header has no Help button any more (Help and shortcuts are under More › Help, and `?` opens the shortcuts); the Lock
  button is a padlock icon; Auto-fill reads "Fill" (its name read out is still "Auto-fill"). From tablet width up the header
  stays on one row: the app name shrinks first.
- **Check shows what Fill places.** "Things to improve" lists only preferences that bear on the codes Fill places (C3, R1B): a
  cell it names holds one of them, or its rule is about them. Must-fix problems always show. A switch ("Only C3, R1B"), on by
  default, brings the rest back (`ui-check.js` `relevanceOf`). A list of every call reads "any call" in messages.
- **Sideways scrolling with a mouse:** week buttons in the roster toolbar, the wheel over the dates, dragging the dates, and
  a visible scrollbar.
- **Equal calls matter more:** the cardiac and ICU fairness rules are weight 40 (were 10; an older saved roster still at 10 is
  raised once, `rulesVersion` 7).

## Posting filter (owner, 16 Oct 2026)

The roster toolbar has a posting dropdown (all postings; "C3 postings" and "R1B postings", the postings the fairness rules
count people on; or one posting), and the C3 and R1B column headers at the top right of the grid are buttons that do the same
(press again for everyone). It shows people with that posting on any day of the month (`ui-roster.js` `postingSet`).

## Roles in the cloud (owner, 16 Oct 2026)

Admin: everything a rosterer can do, plus adding and removing members, changing roles, approving people who ask to join, and
deleting a month from the cloud (an admin cannot demote or remove themselves, so one always remains). Rosterer: reads and saves
the roster, rules and months; every save is kept in Earlier saves. Viewer: reads and pulls only. Changing the member list is
the owner's call (live changes go through the owner's home-computer session).

## Shared calls: the rosterer's points, and what counts as cardiac (owner, 16 Oct 2026)

- **Points for "share fairly"** (`scheme: 'offdays'`, the default for cardiac, ICU and R1 to R3): a weekday 1, Friday 1.5, Saturday 2,
  Sunday 1.5, a public holiday 1.5 and 2 when the day after is also a day off. In general: 1, plus 0.5 when the day is a day off
  (weekend or public holiday), plus 0.5 when the day after is one (`rules.js` `dayOffWeight`; the two 0.5s are editable on the rule).
  The older fixed weights (weekend x2, holiday x1.5) stay available as `scheme: 'fixed'`. To be confirmed with the rosterer on a
  public holiday that follows a day off.
- **Echo and perfusion weeks (`C-e`, `C-p`) take no calls, so they do not count towards the cardiac share**: the cardiac fairness rule
  counts people on `C` days only (`among: ['C']`), and so does the C3 posting filter (it reads that rule's `among`). A week of
  perfusion plus a couple of `C` days in a month is below the share threshold (15% of the month), so that person is not compared.
  Saved rosters in the old form are updated once (`rulesVersion` 8).

## Choosing what Fill drafts (owner, 16 Oct 2026)

The Fill dialog lists the auto-fill calls (C3 and R1B today) with a tick each (the choice is remembered on the device). Only the
ticked calls are drafted (`solve(..., { only: [...] })`, `applyAssignments(..., only)`); every other call, posting, leave and
request stays exactly as it is, but the solver still counts them for all rules (post call, gaps, who is already on call,
cover), so a cardiac-only fill respects the ICU calls already there. Start is off until something is ticked.

## No calls until (owner, 16 Oct 2026)

Each person can have a **No calls until** date (People › edit a person; blank = calls allowed; a button sets it a month after
their start date, for a baby MO or a very new person). The hard rule `r-nocalls` (type `noCallsUntil`, on every call) makes a
call before the date a must-fix problem, and Fill never places one (`solver.js` `hardUntil`). Their leave and postings are
planned as usual (leave can be projected as if they pass the test); if one fails, move the date. The staff list in the cloud copy
carries the date (`staff[].noCallsUntil`, `YYYY-MM-DD`); the rule type is in `rules.js`. Saved rosters gain the rule once
(`rulesVersion` 9).

## Phone header, filters and banners (owner, 16 Oct 2026)

On phones (320 to 720 px) the header is two rows: the name (it gives way, with an ellipsis) beside the cloud, undo and redo
buttons, then month back / Oct 2026 / forward / Today, the lock and Fill. Every header control is 44 px high with one radius and one
icon size; below 360 px Today and Fill become icons and the cloud button loses its word (their names are still read out). The
roster's filter row is Paint, Find and one **Filters** button (with a count) that opens a sheet holding the group, tag, posting and
highlight selects and the Requests, Days around and Key buttons (the same elements move between the row and the sheet when the
window crosses 720 px). The locked-month and empty-month banners are one slim line each (40 px); the full wording is on
desktop and in their description. `test/e2e.mjs` checks 320, 360, 390 and 430 px: nothing clipped or overlapping, 44 px,
slim banners, axe on the header and the Filters sheet.


## Rotations from People (planned; owner, 16 Oct 2026)

APMES People will hold the department's rotations (who is placed where, week by week), read at first from the master
block rotation sheet (plan and decisions: `people/STATUS.md`, Next and decisions log; the sheet's real details are in the
owner's private notes). The owner wants **this app to pull** them, to help plan future months, not People to push them:

- The staff-list hand-off (`js/apmes.js`), reversed: this app opens People with a request, People shows what it would send,
  and sends it by `postMessage` only after the user taps Send, only to this app's own address. No shared database is needed
  for People's first stage (it works in the browser); if People later gets a shared store, this app could read it directly.
- It carries only the postings this app uses: ICU, cardiac (`C`, `C-e`, `C-p`) and the OG floats; people named as this app names
  them (People holds the link from the sheet's name to the person); weeks as Mondays. The layout is the one Postings › Paste
  rotations already reads (names down, Mondays across), so `parseRotations` should take it unchanged.
- Not built, and not to be built before People's side exists. Until then the rosterer types these postings by hand.
- Open questions for when it is built: how provisional weeks (the sheet's `KIV` prefix) and elective weeks (`-E` suffix, mostly
  not counted toward manpower) show on Postings; whether the OG floats (`OGDF`, `OGNF1`, `OGNF2`) are postings or calls here.

