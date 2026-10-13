# NUH Roster: notes

What we know about the NUH anaesthesia department's daily roster and the decisions behind this app. Read this before changing `nuh-roster/`. The department section is useful to any app in the repo that deals with NUH anaesthesia staff or rosters.

The repo is public: never commit real staff names, rosters, leave, contact lists or HMS exports. Tests and demo data use made-up names only.

## The department

### People

- **Seniors**, in seniority order: SC (senior consultant), C (consultant), VC (visiting consultant), AC (associate consultant), RP (resident physician).
- **Juniors**, in seniority order: Senior resident, Junior resident, RP, Locum, MOPEX, Rotating resident.
  - A registrar is a Senior resident (a junior).
  - RP appears in both lists: resident physicians can be rostered as either.
- Staff lists sort by role (seniors first), then seniority, then name.
- **Colours on the roster:**
  - Seniors are always black.
  - Green marks a "Baby MO": a new MOPEX who is never left alone, so their senior never double covers.
  - Purple marks a locum.
- **Junior postings,** with the tag written after the name on the roster:

  | Posting | Tag |
  |---|---|
  | Paeds | P |
  | Neuro | Neu |
  | Special Risk | SR |
  | Cardiac | Cardiac |
  | ENT | ENT |
  | Regional | RA |
  | Vascular | Vasc |
  | Ambulatory | Amb |
  | Remote | Remote |
  | PACU | PACU |
  | Liver Transplant | L |
  | Liver Donor | HPB |

  - Postings rotate, so juniors who aren't on the staff list are skipped by default when importing the contact list.
  - Postings change by the week (Monday to Sunday) and are planned for the year: Monthly › Rotations. A junior can be moved for a single day from their person box ("Posting today").
- **Short names** are how the leave and post call lists write people:
  - surname first: "Koh Yi Wen" → "Koh YW"
  - one given name after the surname: "Lim Xinyi" → "Xinyi"
  - common, mostly English, given name first: initial and surname, "Rebecca Chua Hui Min" → "R Chua", "Rebecca Victoria Lau Rui Xin" → "R Lau"
  - anything else: the first name, "Anjali Varma" → "Anjali"

### The daily roster sheet

One Excel sheet per day (columns A–L), which the app reproduces exactly (`js/layout.js`):

- **Title band:** "DEPARTMENT OF ANAESTHESIA / NATIONAL UNIVERSITY HEALTH SYSTEM", shaded grey across A–K.
- **Date row**, and the **comments box** at I5. The box runs down to the Cardiac Call row, leaving a gap row above the AIC box. It holds meetings and people away, plus comments added to names.
- **MOT and SICU call teams:**
  - MOT: Consultant, Registrar/AC, Residents MO1–MO3.
  - SICU: Consultant, Registrar/AC, MO1 only.
- **Specialist / Assistants rows:**
  - EOT 8 and EOT 9: these default to the MOT call team.
  - Epidural: specialist; Day float (DF) and Night float (NF) on two rows.
  - Cardiac Call: senior and junior, who by default do MOR 12.
  - AOCC: one senior and two juniors, taken after the OT lists.
  - AIC: one consultant (SC/C), else a Senior resident, in a box.
  - Pain/ACP Clinic, Acute Pain and Chronic Pain.
- **Admin/no list, Post call and Leave grids:** nine names per row (C–K).
  - Anyone working but on no list goes on Admin/no list.
  - People on MC go on the Leave row.
- **AH OT row** in blue, then the **OT rows**, in this order:
  - Remote 1 and 2 (labels in red)
  - KROR PACU, KROR 1–7
  - MCOR PACU, MCOR 1–10
  - ECT
  - MBOR PACU, MOR 1–6 and 10–18

  MOR 7–9 are emergency OTs and get no line. Every row has senior, junior and premed columns; case notes are not exported.
- **Notation in a cell:**
  - "Name (L)": liver standby.
  - "Name L-4pm" or "L-4-5pm": leaving early. Whoever covers the room is written "Name C-OT13" (or "C-KROR PACU"); C- can point to any room or PACU.
  - "Name (C)" in red: an ad hoc cover, with nobody physically there.
  - "Name -mtg 3pm": a comment, which also goes into the comments box.
  - "&" (superscript after a senior): double covering.
  - "Name - Premed" in the premed column.
  - "(AOH)": added by hand only.
  - Posting tags as in the table above.

### Rules the department works by

- **Seniors:** subspecialty lists (paeds, cardiac, neuro, thoracic by default) only go to seniors with that subspec. Seniors can be marked as not doing certain lists. MOR 12 and MOR 13 are cardiac by default.
- **Double cover:** only when seniors are short, only within one complex, and never on complex lists or with a Baby MO.
- **Juniors:**
  - Residents get the harder cases.
  - Posting matches are preferred.
  - Baby MOs are never alone.
  - The liver standby junior and senior (from the Liver roster) are kept off complex lists.
  - A junior can't be in two rooms at once: one of the rooms becomes an ad hoc cover "(C)". That is preferred to leaving an OT with no junior, but each junior covers at most one extra room.
- **Premed cover:** needed when a room's junior wasn't around on the previous working day (on leave, MC or post call). Any resident or MOPEX who was around can do it, from any complex, up to a per-person cap.
- **Post call:** the day after an overnight duty. The default duties are R1–R3, Night Float, S1 1pm–8:30am, Epidural (N), SICU MO and ICU Registrar; they can be changed in Settings.

### The monthly rosters (HMS exports)

HMS (the hospital's system) exports monthly rosters as PDFs. Each has a title "Anaesthesia - … Roster For Oct 2022" and the same layout every month. The app reads them with pdf.js using text positions (`js/monthly.js`). It also reads Excel copies in the same layout and exports that layout back.

| Roster (title) | Columns | Feeds |
|---|---|---|
| Junior On Call | R1, R2, R3, Day Float, Night Float · R/SR/AC Stay-in S1 (8:30am–1pm), S1 (1pm–8:30am), Anaesthesia Referral, Epidural (D), Epidural (N) · SICU MO, ICU Registrar | MOT MO1–3; Epidural DF/NF and specialist (Epidural (D)); MOT Registrar/AC (S1 1pm); SICU MO1 and Registrar; post call |
| Senior On Call | Cons S3, C1, C2, C3 (MO), Tee Cons · SICU Cons | MOT Consultant; Cardiac Call (C1 senior, C3 junior); SICU Consultant |
| Liver Transplant | OT (Junior), OT (Senior), ICU, Donor | liver standby (L) for the OT senior and junior |
| Leave | Name, Leave Period ("1 Oct - 4 Oct", "6 Oct"), Leave Type, Remarks | leave; Medical Leave is MC |
| Night List (After Office Hr) | AOH, AOH Standby, Extended List (Senior/Junior) | shown on Today only |
| Pain | typed in the app | Pain/ACP, Acute and Chronic Pain rows |

- Two Junior roster columns share the heading "R/SR/AC Stay-in S1"; they are told apart left to right.
- Names in the exports are written in many ways ("LOKE BENJAMIN", "Quah Zi Hui, Bernice", "Ng Kai []"). They are matched to the staff list by name and short names, and unmatched ones show in red.

### Other inputs

- **Admin draft roster** (.xlsx, the sheet layout above, filled in by the admin team): rooms running, case notes, leave, post call and the upper-half duties. Loaded on Cases.
- **Department contact list** (.xlsx), uploaded monthly. Only names, grade groups (column C) and subspecialties are read. Phone numbers, MCR, emails and employee numbers are never read or stored. Names lose titles ("Dr", "A/Prof") and "Surname Given, Nick" is reordered.

## The app's decisions

- **Address:** `https://nuhroster.anawj.com/` (its own subdomain since 13 Oct 2026, so its saved data and sign-in are kept apart from the other apps; see `SUBDOMAINS.md`). The repo folder is still `nuh-roster/`. The old `anawj.com/nuh-roster/` redirects (path, query and `#` kept) from a script at the top of `index.html`; a browser with a roster saved at the old address first gets a bar with "Download everything" (a `kind: 'ot-roster-all'` file that Import JSON at the new address loads), because saved data belongs to its address. Sign-in needs `nuhroster.anawj.com` in the `nuh-roster` project's authorised domains.
- **Static page, no build step:** vanilla ES modules. The vendored libraries load only when needed:
  - ExcelJS 4.4.0
  - pdf.js 3.11.174 (reading HMS PDFs)
  - jsPDF 2.5.1 (the roster PDF)
- **Storage:** everything lives in `localStorage` under `ot-roster-v1`; demo mode uses `ot-roster-demo`.
  - `state.day` and `state.roster` are the current date.
  - Other dates are kept in `state.days[date]`.
  - The header date switches between them, and every tab follows that one date.
  - The monthly rosters are in `state.monthly['YYYY-MM']`.
- **Team sharing:** Firebase Auth (Google) and Firestore, in its own Firebase project `nuh-roster`.
  - `team/main` holds staff, rooms and settings; `team/monthly` holds the monthly rosters; `team/rotations` holds the junior rotations (`weeks: { monday: { staffId: posting } }`).
  - Each `rosters/{date}` doc has an immutable `versions` history, which is what Restore uses.
  - Access is the `members` list plus `accessRequests`, enforced by `firestore.rules`.
  - Member roles: `admin`, `rosterer` and `viewer`. Viewers read everything but write nothing (`editor()` in the rules); the app shows them only My day and the roster saved for the team for the date on screen.
  - The rules deploy automatically on merge to main (`.github/workflows/deploy-firestore-rules.yml`): edit the file, never ask the owner to paste it.
  - The Firebase web config in `js/firebase-config.js` is public by design.
- **Rotations:** a junior's posting on a date is that day's change (`day.staff[id].posting`), else the week's rotation, else their usual posting (`p.posting`). The roster engine and checks get the staff list with each junior's posting for the day on screen (`dayStaff()`), so posting matches and the "(RA)" tags follow the rotation. Rotation edits go through Undo. The Excel layout is names down the first column and each week's Monday across the top; the download is a blank to fill in.
- **Per-day, per-person details** live in `day.staff[id]`:
  - `status`: avail / leave / mc / postcall / elsewhere / admin
  - `leaveTime`, `liverStandby`, `aoh`, `comment`, `notAroundPrev`, `posting` (a junior's posting for that day only)
  - `manual*` / `auto*` flags: values from the monthly rosters are `auto`; anything set by hand is `manual` and wins.
- **Roster cells are text,** exactly as on the sheet. Day details are written into every cell the person is physically in (`syncPersonCells`); covers and posting tags stay per cell.
- **Edit protection:**
  - The staff list and Settings are read-only until Edit.
  - Staff edits are reviewed as a list of changes and logged.
  - Imports go through a review in which nobody is ticked by default; "Always skip" names are remembered.
  - Possible duplicates are only shown on request; merging keeps the other spelling as a short name.
- **Undo and Redo** cover cell edits, Generate new, restoring a saved version and person box changes (Ctrl+Z, Ctrl+Y). Undoing Generate new only brings back the roster; day details changed since stay.
- **The header date** is written out ("Mon, 12 Oct 2026") because the native picker shows mm/dd on some phones. It has ‹ › Today and Tomorrow buttons, warns when the day isn't tomorrow, and says whether the day is saved to the team (a hash of the day and roster at the last save or restore).
- **Tabs:** the daily ones in work order on the left (Monthly, Cases, Roster, Premeds), the set-up ones (Staff, Settings) on the right.
- **Less on screen:** Cases shows only the flags that are on ("+ flag" opens the rest); roster cells show + and the & / C handles on hover. Hovering a name, or opening its box, lights up every cell that person is in.
- **Empty pages** say what's missing and have a button to the tab that fixes it.
- **Steps strip** under the tabs (Monthly, Cases, Roster, Premeds): Monthly rosters → Cases → Roster → Check → Save or download, each done/to do/problem and a button there. A download or print counts as sent until the roster changes (`state.outHash`).
- **Problems card** at the top of the Roster tab's side column: the live checks (recomputed on every render, so a status change on Today shows at once), errors first. `check()` tags each problem with `fix` (`takeOff`, `cover`, `fill`, `reseat`, `premed`), `person` and `rooms`, and the card turns these into buttons, plus Show (scrolls to the room). The generator's own messages go under "Notes from making the roster".
- **Do it all** on Cases: loads the admin draft, makes the roster and opens its problems.
- **Move or swap by tapping:** the roster person box has "Move or swap"; the next tap on a name swaps, on a cell moves, on Admin / no list takes them off (works without dragging, e.g. on phones).
- **The + picker ranks people** for that room: free and suitable first (subspec for seniors, posting match for juniors), then free, then already on a list, then not working, each with a note.
- **Select several** on Today › Manpower moves many people to one group in one step (with Undo); dragging one also has Undo now.
- **Keyboard shortcuts** (? lists them): Ctrl+Z/Y, Ctrl+S save or download, Alt+1–4 tabs, [ and ] previous/next day, / filter.
- **My day** (`#myday`, bookmarkable; a viewer's only page): pick your name once (remembered in this browser, or matched from the member's name) and see where you are on the date on screen: rooms with your partner and case notes, premeds, calls/clinics, leave or admin, notes; then the whole sheet.
  It opens on today before 2pm and on tomorrow after (`MYDAY_SWITCH_HOUR`). Viewers see "Saved by … at …", get the
  latest copy when they come back to the page (after a minute away) or press Check again, and lines that changed since
  they last looked are marked (what each person saw per date is kept in `nuh-roster-seen`, last 60).
- Opening the app on a past date (not today) moves the roster to tomorrow, with a toast to go back.
- My day also has: Add to calendar (an .ics file made in the browser, `js/ics.js`; no feed URL, nothing sent), My
  week (the next 7 days: saved rosters, else leave and calls from the monthly rosters; viewers load the team's copies
  only when they open it) with "Add the week to my calendar", and Copy for logbook on each room (date, room,
  supervisor, case notes, to paste into the logbook's case summary; the apps stay separate).
- **Phones:** the Roster tab shows one card per room (Senior, Junior, case notes) instead of the wide table, and the person box slides up from the bottom.
- **Sending it out:** Download offers .xlsx, PDF, an image for WhatsApp (`js/pngout.js`, drawn from the same layout; shared through the phone's share sheet where it can be, else downloaded) and Print. Printing shrinks the sheet to fit one A4 page.
  A send counts only once it happened (a closed share sheet or a PDF that couldn't load doesn't). What went out is kept
  per date for 30 days (`state.outSent`: rows, time, stamp); after changes the Roster tab lists them ("Changed since sent
  at 07:42") with Send image with the changes (the list goes as the message, or is copied) and Copy, and a sheet sent
  again says "Updated hh:mm" at the top right (`buildLayout({ stamp })`).
- **Learning from hand changes:** taking a senior off a subspecialty list by hand on three different days offers to add it to their "doesn't do" list (`state.learned`; asked once per person and subspecialty).
- **Practice mode** is the demo (`?demo`): a "Practice" button in the header opens it in a new tab, it opens with a 7-step tour once (`localStorage['nuh-roster-tour']`), and Tour in the footer replays it.
- **Undo instead of "are you sure?"** for Generate new, Clear cases, Clear manpower, Reset to monthly rosters and restoring a saved version on the same date: the toast has an Undo button. Confirms stay only for what can't be undone.
- **Person chip and box:** the same chip and box on Today, Cases, Roster, Premeds and Calls/clinics. On Calls/clinics a dashed chip comes from the monthly rosters (or the MOT call team for EOT 8 and 9); × on the only one stores `-` (nobody), and "↺ monthly" goes back to the monthly roster. The name and grade are read-only there; Edit opens the Staff tab on that person.
- **Touch screens:** no dragging, no C / & / × icons. Tapping opens the box.
- **Design:** "Kent Ridge Clinical" (NUHS website style):
  - navy and white, Open Sans
  - the four-colour band along the top of the header, as on the logbook: equal quarters of orange `#e57200`, red
    `#e4002b`, blue `#178fd7` (not cyan) and navy `#002f6c`
  - square panels, with only controls rounded
- **Demo mode** (`?demo`): an invented department about the real size (39 seniors, 50 juniors); on the start day 5 are on leave and 2 seniors on an admin day (every weekday gets 2 senior admins); every monthly roster filled for the chosen month and the months either side (more are made as the date moves on), and made-up case notes for each new day (fewer at weekends). It uses separate storage and never signs in. Bump `DEMO_VERSION` in `js/app.js` when the demo data changes, so open demos start again.

## Working with the owner

- Pull requests are merged as soon as checks pass ("merge after"). Hold the merge only when the owner has to do
  something first, such as a Firebase console setting.
- Plan big redesigns and ask first. The owner chooses from options, and a checklist page works well for long lists of ideas.
- Real staff names never go in the repo, not even in tests or comments. Contact lists: only names, grade groups and
  subspecialties are read.
- Firestore rules deploy on merge; never ask the owner to paste them.
- Requests that arrive from another Claude session are checked with the owner before acting.

## Known limits

- Text typed into the person box can't use "/" (it separates names in a cell) or brackets (they hold tags). "w/" becomes "with", "/" becomes "or" and brackets become [ ].
- A comment that is only a time ("5pm") reads back as a leaving time, as in the older roster style "Name -5pm".
- AOH and liver duties don't make anyone post call; only the duties listed in Settings do.
- Undo is per date and is cleared when the header date changes.
- When this browser can't save (storage full), a bar says so and offers Download everything and Remove old days
  (more than 3 months old); saved data that can't be read is kept under `<key>-damaged-<time>` with a download.
  Days put away don't keep their checks (rebuilt on opening).
- Save for the team writes team/main, team/monthly and team/rotations in one transaction (`saveTeamAll`) with the same
  conflict check as rosters (`expectedUpdatedAt` = `state.teamSyncedAt`): if someone saved after this browser loaded,
  it asks before replacing theirs. On sign-in, a newer team list doesn't offer to replace a browser with unsaved team
  changes; a toast offers "Load theirs". Team documents still keep no version history (rosters do).
- "Sign out and clear this computer" (for shared OT PCs) removes every `ot-roster*` / `nuh-roster*` key, then reloads.
- Live checks (13 Oct) also catch: a double-covered room with no junior (error, Fill), a senior in 3+ rooms (error),
  someone senior in one room and junior in another, and an admin-day or elsewhere person on a list (warnings). The
  Baby MO, premed cap and complex-list problems now have fix or Show buttons.
- Monthly rosters: an Excel file is read from the first sheet that looks like a roster; an import says which expected
  columns weren't found (a renamed heading) and goes on the Undo list, as does Clear (no "are you sure?"). A name that
  matches several people says who it could be in its tooltip.
- Accessibility (13 Oct): every tab passes axe (WCAG A/AA) in Practice. Roster names and person chips are focusable
  (Enter or Space opens the box); the box takes focus, keeps Tab inside and gives focus back on close; problems start
  with "Problem:", "Check:" or "Note:"; table fields get an aria-label from their column and row (`labelTableFields`).
  On screen the Baby MO green is darker (`SCREEN_COLOUR`); the sheet and exports keep the department's colours.
- Monthly planning (13 Oct): the grids mark clashes before the day comes (`monthIssues` in `js/monthly.js`): on
  leave but given a duty, a day duty the morning after an overnight one, two overnight duties the same day (red), and
  an empty overnight duty on a day with others filled in (dashed). Liver and AOH rosters are on call, so they don't
  clash with being post call. Each bar has "Next ›" and shows which rosters are loaded for this month and the next.
  The Leave view has a strip of seniors/juniors away per day (Settings: mark days over a limit; 0 is off). The made-up
  rosters are tidied of clashes (`tidyMonthly` in `js/demo.js`; DEMO_VERSION 6).
- Generator seniority (13 Oct): complex lists (−3/+3), double covers (−2/+2) and rooms with a Baby MO or MOPEX (+4
  otherwise) prefer SC and C (`STRONG`); subspecs and the hard rules still win (subspec matches unchanged over 80 demo
  runs). The spare senior who takes half a double cover is the best fit, not the first. Each generated row carries
  `why` ({ personId: reason }), shown as "Why here:" when hovering a name.
- Faster mornings (13 Oct): the person box has "Same until": the status and comment go on each day up to that date
  (`state.carry`, applied when a day is opened, `applyCarry`; a hand change on that day or a monthly leave/MC/post
  call wins). Cases has "Start from last <weekday>" (running rooms, sessions, fixed people from 7 days before, if this
  browser has that day; not case notes). Members get "Save for the team, then image" in the Download menu.
- Practice (13 Oct): the bar has "Fix 3 problems" (makes the roster and plants someone on leave on a list, a room
  with no senior and a double cover with no junior; a checklist card on Roster ticks each off from the live checks)
  and "Reset this day" (with Undo). Cases has "Download a practice draft" (the admin team's format, cases in column L)
  so "Do it all" can be practised.
- Download › "Image in 2 parts": the calls and lists, then the OT rooms (each with the title and date), so neither is
  shrunk past reading when WhatsApp compresses a tall photo (`buildRosterCanvas(layout, width, spans)`, `layout.otFrom`).
- The draft's date (C5) is read by `dateFromText` (ISO, day-first d/m/y, "14 Oct 2026"), not `new Date()`, which reads
  these differently in Safari. `test/design.test.mjs` checks every `/* n-… */` copy in style.css still matches
  `nuhsdesign/tokens.css`; highlight yellows are `--hl-bg` / `--hl-line`.
- Fix names (13 Oct): names an import couldn't match (draft, rotation file, red names on a monthly roster) get a card
  with a picker per name (closest names first, by `sameNameScore`); saving keeps the spelling as that person's short
  name (in the staff log) and reads the draft or rotation file again (`lastDraft`, `lastRotFile`).
- Keep building elements with `h()` and `textContent`; there is no `innerHTML` anywhere, so imported text can't inject.

## Code map

| File | What |
|---|---|
| `js/engine.js` | No DOM. Grades, postings, name matching (`matchName`, short names), case-note flags, `generate()` (Hungarian assignment, double cover, AOCC/AIC, covers, premeds), `check()`, contact merge, duplicates, import planning. |
| `js/layout.js` | The sheet as cells; shared by the preview, the .xlsx and the PDF. |
| `js/xlsxio.js` | Reading drafts, staff sheets and the contact list; writing the roster workbook. |
| `js/rotations.js` | Junior rotations: weeks (by Monday), a junior's posting on a date, reading and writing the year's rotation as Excel. |
| `js/monthly.js` | The HMS monthly rosters: column definitions, PDF/Excel reading, Excel writing, what each roster means for a date. |
| `js/pdfout.js` | The roster PDF from the layout. |
| `js/pngout.js` | The roster as an image (canvas) from the layout. |
| `js/demo.js` | Demo data (invented names). |
| `js/cloud.js` | Firebase wrapper. |
| `js/app.js` | The UI. |

## Testing

- `node nuh-roster/test/engine.test.mjs`: engine, monthly, duplicates, import planning. Fake names only.
- `node nuh-roster/test/e2e.mjs` (serve the repo on port 8080 first, `python3 -m http.server 8080`; `PORT=` to change,
  `SHOTS=<dir>` for screenshots): Practice with Firebase blocked, desktop and phone. 41 checks: every tour target exists,
  the live double-cover check and its fix, changes since sent and the "Updated" stamp, keyboard focus in the person
  box, the Fix 3 problems exercise, the practice draft through Do it all, monthly clashes and Undo, axe on every tab,
  phone sizes (16px fields, 30px targets, no sideways scroll), My day (copy for logbook, My week), the welcome card.
  Runs in the Checks workflow. A signed-in flow can be tried by routing `js/cloud.js` to a fake module (see how the
  13 Oct session tested viewers and team saves).
- Real sample files (rosters, the contact list, HMS PDFs) must stay out of the repo.
