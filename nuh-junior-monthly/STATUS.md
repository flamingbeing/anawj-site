# NUH Junior Monthly: status

Last updated: 2026-10-17 (later) by Claude Code (jm1).

## Now
- Each session keeps its own line in `status/<session>.md` (`status/jm1.md`); read it before starting, edit only yours.

## Waits on the owner
- **Decision on the Drive permission for generated sheets:** option A (the app makes its own shared folder) or B (the owner picks the existing folder with Google's file picker); see Next 0a. Either way the owner makes a one-time change on the Google consent screen (the app cannot).
- **The owner's go** on building 0a. The rosterers' editor emails go in the app's box (not in this repo).
- Firetop's results (17 Oct 2026): the real-Google dry run passed (28, 30 and 31 days, 14 to 20 people); the Drive sheets are backed up in the private repo; the .xlsx export keeps formulas, colours and conditional-format order but loses protected ranges (details in the owner's private notes).
- Answers for the R1 to R3 rosterer (and the month's sheet from scratch): what the leave bands (SR, JR, non-resident rows in the manpower block) are meant
  to cover; whether a holiday on a Friday or Saturday should add points; where the consultants' rows come from (last month's sheet or People).
- The People app question: who creates the month's sheet (now: copied by hand from last month's) and whether the master rotations sheet's FELLOWS,
  MOPEX and External blocks are enough for the staff list (the owner's trial plan: import the master rotations into People, pull them here, generate the
  base sheet).
- The rosterer signs in once (Google shows an "unverified app" warning: Advanced, then continue). She has the rosterer role (set 16 Oct).
- Roles: whoever only needs to look can be made a viewer (More › Cloud › Members).
- The rosterer's review of the R1 to R3 rules (all off until "Turn on all the R1 to R3 rules"; the pool rules need the strong / weak list imported in
  People › Tags) and of the rules marked To confirm (Confirm / Confirm all on the Rules tab).
- Reminders set for the owner: 23 Oct (balance over a posting that straddles two months), 16 Dec (thinning old saves).

## Next (agreed order)
0a. **Generated sheet: locks, formula tabs, Drive permission (planned with the owner 17 Oct 2026; not built).**
   - *Locks*: the Request tab is locked by default (rosterers can edit) and opened for the juniors while they place requests, then locked again; the Junior Call Roster and WR / Premed Roster tabs are locked all the time; the Leave Waitlist tab is always open. Build: protected ranges in the generated request (`addProtectedRange`; Sheets scope is enough), an editor-emails box in the app (the owner may later give rosterers a role in People; the app can read People only through an agreed route, to plan with the People sessions), and an *Open for requests / Lock* button.
   - *Formula tabs*: the Junior Call Roster and WR / Premed Roster tabs are pure `IFERROR(INDEX(Request!C:C, MATCH("R1", Request!<day column>, 0), 0), "")` lookups (every cell), so the generator writes them as formulas and they fill from the Request tab; the Leave Waitlist tab is empty. Map each block's day columns from a real tab (the private notes have the backups) for 28 to 31 days; keep formulas, never values.
   - *Drive permission*: `drive.file` (files the app created) is the narrow choice. It cannot see existing folders, so either (A, recommended) the app creates its own folder once, sets it to anyone with the link can edit and files each month's sheet in it, or (B) the owner picks the existing folder with Google's file picker (needs a picker developer key). It needs a one-time scope change on the Google consent screen by the owner (give the exact clicks), and each signed-in person approves once.
   - *Still manual*: public holidays, the block rotations until 0b, opening/locking the Request tab, listing editors, checking the legend and month text. A checklist panel after generating should say so. Not yet copied: cell notes, column widths, fonts, number formats, carry-over from last month.
0. **Waitlist step 2: revisit in a week (owner, 16 Oct 2026: "maybe in a week"; about 23 Oct).** The plan: the Leave tab (read only, #733) gets
   status changes (a person's waitlist colour set from the app, written back to the sheet with the same "check nothing changed" safeguard
   and an undo) and a new **daily rosterer** member role who may change waitlist status only (the daily rosterers run the NUH daily
   roster, a different group from the monthly rosterers; the owner adds those members himself). Kept in its own cloud collection so
   the Firestore rules can allow just that; a rules change deploys live on merge, so run `tools/test-rules.sh`, explain what it allows
   and denies, and never loosen the real-data collections. A late-request flag (within 5 working days of the leave date) is planned.
   Then (3) the WR / premed roster, (4) the junior call roster and EOT calls, (5) their rules and Fill.
   Also open: where the staff list comes from for a future month (People for residents, the roster app for fellows, MOPEX, RR, NHG and
   locums; the sheet stays the truth), which the owner is still thinking about (asks: who creates the month's sheet, and does the rotations
   document cover fellows and MOPEX).
0b. **Start a month from the master rotations (the owner's trial, 17 Oct 2026).** Built so far: the whole sheet can be generated for any people, rows and month
   length, formulas included (`js/sheetgen*.js`, More › Make this month's sheet from scratch; NOTES.md "Making the month's sheet from scratch"). Next: (a) the
   month's staff list from the master rotations sheet (People's reader; residents, fellows, MOPEX, external residents; grade from the section), seniors'
   rows from last month; (b) every posting the sheet shows mapped from the master codes with People's code key (write the mapping table for the owner to
   confirm); (c) feed (a) and (b) into `specFromState`; (d) the other tabs (WR / premed, call roster, leave waitlist) and the rest of the sheet's leave and
   request cells stay typed in the sheet. The People side belongs to the People sessions: plan with them, do not merge into their files.
1. ~~Share the sheet layout in the cloud copy~~ done with Save/Pull covering every month (see Recently done). Rules deployed.
2. ~~A per-person "no calls until" date~~ done (see Recently done). Still to do: a suggested date for new people read from the
   sheet (first month they appear).
3. **Highest call per person** (R1 most senior, R3 most junior, cumulative; default the highest, a lower one is a
   step-down needing explicit approval), inferred from 6 months of imported sheets, shown "inferred" with Confirm; a
   settings box "What the app fills" (default cardiac and ICU only); R1 to R3 Auto-fill last (rules in NOTES, "Beyond
   cardiac and ICU").
4. **Balance over the whole posting stint across months** (calls in proportion to weeks in the posting), and check how
   leave inside a posting counts towards the share.
5. Grade: a dated change in the middle of a month; People showing "from February" for a future month's sheet.
6. Cloud: thin old saves (Firestore TTL on `expireAt`, keep the first save of each week; needs a small rules change and a
   firetop job). Autosync was deliberately not built: the header cloud button shows the state instead.

7. **Pull rotations from APMES People** (built 16 Oct 2026, owner's plan): Postings › Pull from APMES People… brings the
   ICU, cardiac and OG float postings for the weeks shown into Paste rotations to look over and Apply. Still to do: a real run
   with the owner's sheet and the real roster. Design in NOTES.md, "Rotations from People".

## Recently done
- #749 The monthly sheet can be built from scratch (any month length and number of people, formulas and colour rules), as an Excel file or a new Google Sheet;
  #750 the real-Google dry-run script. #744 Confirm / Confirm all take the To confirm tag off rules. #743 Fill on the Check tab, R1 to R3 ticks in Fill (they turn the
  R1 to R3 rules on), Try again / Try 5 more compare drafts by score, preferences read "Priority n" and Check can order by it. #741 unlocking a month no longer asks to confirm.
- #735 request screening (more than 4 requests, more than 2 no-premed, same-day pool clashes), the strong / weak MO pools and their import (People › Tags);
  #736 the Rules tab explains the order things happen in and groups rules by topic, and the R1 to R3 rosterer's rules (all off until "Turn on all
  the R1 to R3 rules"); then the Saturday-after-ICU rule, the Fri to Sun call cap (a tag) and pool call requests gets its call.
- No calls until: a date on each person; a hard rule and Fill respect it (People › edit a person).
- #721 Fill lets you pick which calls to draft; #719 shared calls use the rosterer's points and `C-e`/`C-p` do not count as cardiac.
- #716 Tabs reordered, one-row header (no Help button, padlock, "Fill"), Check shows what Fill places, posting filter and
  Clear filters, mouse scrolling, locks reset when the app closes, equal calls weighted 40.
- #714 Blocked by the planner is the strongest request; `R!` and `R?` call requests.
- #713 Grades per month, read from each imported sheet (the sheet is the source of truth).
- #712 Request importance: `X!` must have, `X?` nice to have.
- #711 People the imported sheet leaves out are hidden and left out of Auto-fill; group headers fold.
- #710 Paint cells with Lock; the lock at the top of the cell popup.
- #724 Save and Pull cover every month and its sheet layout (rules deployed). (this PR) Colours follow the sheet's legend.
- (this PR) Carry-over from earlier months in the cardiac and ICU fair-share rules. #727 a call that replaced its posting counts as on it; no day-1 preference for RES3 and SR. #726 notes are an orange corner, problems rings. #725 colours follow the sheet.
- (this PR) Step 1 of growing past cardiac and ICU: the read-only Leave tab (the sheet's Leave Waitlist) and the shared tab-reading structure.
- #708 The cloud (Save and Pull to cloud) with a header button showing when it was last saved.
- #707 Every month starts locked. #705 Earlier saves (restore from the cloud history).
- #703 The import moves people to their new grade. #702 A month is saved as one JSON string (index-entry limit).

## Decisions
- 17 Oct 2026: generated sheets should copy the department's locks (Request locked by default and opened for requests; call roster and WR / premed tabs locked; Leave Waitlist open) and make the call roster and WR / premed tabs as formulas that read the Request tab; the owner wants the Drive permission added first because the app needs more permissions to work on its own (option A or B still to choose) (owner).
- 17 Oct 2026: no separate "good to have" tier: a preference's weight is its priority (Check can order by it); rules get sets that switch off together later (e.g. MedHub), not built yet (owner).
- 17 Oct 2026: the R1 to R3 rosterer's rules: `R_` is the same as `R`; `X/NP` counts as one request; more than 4 requests or more than 2 no-premed in a month is flagged; at most one call request a
  day from a pool; strong / weak MO1, MO2 and MO3 pools come from her manpower list (People › Tags import); Fill's R1 to R3 ticks turn the R1 to R3 rules on (owner).
- 17 Oct 2026: rebuild the whole monthly form from scratch rather than copy last month's, to find out early whether it is doable; Create a new Google Sheet needs only the Sheets scope the app already has;
  the real-Google dry run and the Drive backup go to firetop (owner).
- 17 Oct 2026: the master rotations sheet has FELLOWS, MOPEX and External Residents blocks, so the month's staff list can come from it; People's APMES list stays residents, faculty and PDs (owner's trial plan, to confirm).
- 15 Oct 2026: own app, own subdomain, NUHS design; fill the existing Google Sheet rather than replace it (owner).
- 15 Oct 2026: "weekend" in the fellows' ICU limit means Saturday and Sunday (owner).
- 16 Oct 2026: the sheet import moves people to the group their new grade shows (ticked in the review, newest month
  only); APMES People reads it for residents' years (owner). Later the same day the sheet became the source of truth for
  grade month by month (`sheets[month].grades`), so a promotion changes only later months.
- 16 Oct 2026: the staff list goes to APMES People (names, grades, start and leave dates only), only after Send is tapped
  here, and only to `apmes.anawj.com` (owner).
- 16 Oct 2026: requests and blocks are soft; post call as a day off is hard; "new to ICU" is strict only for rotating
  residents and MOPEXes; an "EOD call" (right after the post call day) is the last resort so a night is never empty (owner).
- 16 Oct 2026: request strength, strongest first: blocked by the planner (200), `X!` must have (150), `X` (60), `X?` nice
  to have (20); call requests `R!` (100), `R` (10), `R?` (3). They are codes so they survive the sheet (owner).
- 16 Oct 2026: every month is locked whenever the app opens or closes; an unlock lasts one visit; reading a month in
  unlocks that month (owner).
- 16 Oct 2026: Save to cloud and Pull from cloud cover all data: the staff list, rules and every month (days, status and the imported sheet layout); a save writes only months changed since the last save or pull (owner).
- 16 Oct 2026: "Team sharing" is "the cloud"; no autosync (the roster is one rosterer's, with the owner looking); the header
  button says Saved, Not saved or Cloud is newer (owner).
- 16 Oct 2026: Check shows only preferences that bear on what Fill places (C3, R1B), with a switch for the rest; equal calls
  weigh 40 (owner).
- 16 Oct 2026: people the imported sheet leaves out are hidden and not given calls (owner).
- 16 Oct 2026: shared calls use the rosterer's points (weekday 1, Fri 1.5, Sat 2, Sun 1.5, public holiday 1.5 or 2 when the next day is
  off too), and echo and perfusion weeks (`C-e`, `C-p`, no calls) do not count as cardiac for the share or the posting filter (owner).
- 16 Oct 2026: Fill lets you pick which calls to draft; the rest stay as they are but every rule still counts them (owner).
- 16 Oct 2026: the R1 to R3 ladder, step-down calls, baby MOs, chronic pain and OG float rules, and leave approval needing OT
  manpower are recorded for later (NOTES.md "Beyond cardiac and ICU"; the department's own words are in the owner's private
  notes). Roles: admin manages members and can delete a month in the cloud; a rosterer reads and saves; a viewer reads.

- 16 Oct 2026: this app will **pull** rotations from APMES People, not have People push them (owner). Same tab-to-tab hand-off
  as the staff list, reversed; People stage 1 (read-only, browser) comes first. Nothing to build here yet.
