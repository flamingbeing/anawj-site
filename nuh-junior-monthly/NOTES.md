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

- One spreadsheet per month; the grid tab is "1 - 30 Nov 26 Request" (newer months just "Request"). Header row (row 6):
  `S/N | Grade | Name | 1 … 30 | 1-Dec`; the weekday names are in the row above. One row per person, one code per day,
  then the 1st of next month (for carrying post call over). Below: count rows (R1, R2, R3, R1B, C3, … each should be 1)
  and manpower totals. Right of the days: points (Fri/Sun/PH 1.5, Sat 2) and totals per person. Every other tab
  ("Junior Call Roster", "WR/ Premed Roster") is formulas over this grid. The day cells hold values only (no formulas;
  checked on Dec 2026), so pasting values back over them is safe.
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
  (`state.sheets[month]`).
- **Put it back** (More): the block from day 1 of the first person row to the 1st of next month of the last row, as
  tab-separated text to paste at that top-left cell (D7). Cells whose meaning didn't change go back exactly as typed;
  seniors' rows come back untouched; the list of changed cells is shown. Import again just before pasting if others edit.

## Rules (Rules tab; the rosterer changes them)

Cardiac and ICU rules come from two years of rosters (2025–2026: a C3 and an R1B every night; C3 → PC → back to C;
R1B → PC → PPC → ICU; first calls by experience as in Dr Yanni's SICU list). The rest are predictions from the
department's roster guide, marked **To confirm** (note "Predicted…"); the R1–R3 cover and level rules are off until
the rosterer uses the app for them. New rule type here: **`postingStart`** ("no calls in the first N days of a
posting": no ICU call on day 1, new to ICU from day 4 (tag `icunew`), Ortho/HRM residents from day 8 (tag `rrlate`)).
`spread` has an optional `among` (only people on that posting, their share by days on it). Tags `mo1`–`mo3` are the
call levels; `supernum` = in ICU without calls.

**Backtest (15 Oct 2026)**: the app's import, rules and Auto-fill were run on 22 months of the real rosters (the
scripts and results are in the private repo, `life/data/nuh-junior-monthly/`). The real rosters break the must-hold
rules 25 times (genuine exceptions: a cardiac call covered by someone not on cardiac, a call on the first day of a
posting); Auto-fill twice (nights with nobody eligible, which it flags), with fairer shares of calls and weekend
calls than the real rosters. Import then copy-back gives every month back cell for cell except the PC / PPC the
sheet was missing. Changes it led to: a cardiac call may fall in an echo/perfusion week (a preference against); the
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
(`rulesVersion` 2 in `model.js`). Still to build: when nobody is eligible, Auto-fill should name the least-bad person
(the one breaking only preferences) instead of leaving the night empty; waits on what an "EOD call" is.

How to add a rule type: as in `ntf-roster/NOTES.md` ("How to add a new rule type"); the engine is the same file.

## Tests

`node nuh-junior-monthly/test/app.test.mjs` (rules, PPC, auto-fill, sheet round trip) and
`node nuh-junior-monthly/test/e2e.mjs` (static server on port 8080: every tab on desktop and phone, axe, Postings,
Auto-fill). Both run in the Checks workflow.
