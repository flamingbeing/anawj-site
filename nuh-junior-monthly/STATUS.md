# NUH Junior Monthly: status

Last updated: 2026-10-16 by Claude Code (jm1).

## Now
- Each session keeps its own line in `status/<session>.md` (`status/jm1.md`); read it before starting, edit only yours.

## Waits on the owner
- **A dry run on a copy of a month's sheet** (read from Google, check, Fill, write back, undo, lock). Real Google sign-in
  and the real Sheets API are untested: everything so far used a fake. Do it on a copy, never the rosterer's live sheet.
- The rosterer signs in once (Google shows an "unverified app" warning: Advanced, then continue). She has the rosterer
  role (set 16 Oct).
- Roles: whoever only needs to look can be made a viewer (More › Cloud › Members).
- The rosterer's review of the predicted rules (marked To confirm), and the redone step-by-step guide (private notes).
- Reminders set for the owner: 23 Oct (balance over a posting that straddles two months), 16 Dec (thinning old saves).

## Next (agreed order)
1. **Share the sheet layout in the cloud copy.** `sheets[month]` (which sheet and rows a month came from, who the sheet
   lists, grades) lives only on the device that imported, so a second device cannot write back to Google or hide people
   the sheet leaves out.
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

## Recently done
- No calls until: a date on each person; a hard rule and Fill respect it (People › edit a person).
- #721 Fill lets you pick which calls to draft; #719 shared calls use the rosterer's points and `C-e`/`C-p` do not count as cardiac.
- #716 Tabs reordered, one-row header (no Help button, padlock, "Fill"), Check shows what Fill places, posting filter and
  Clear filters, mouse scrolling, locks reset when the app closes, equal calls weighted 40.
- #714 Blocked by the planner is the strongest request; `R!` and `R?` call requests.
- #713 Grades per month, read from each imported sheet (the sheet is the source of truth).
- #712 Request importance: `X!` must have, `X?` nice to have.
- #711 People the imported sheet leaves out are hidden and left out of Auto-fill; group headers fold.
- #710 Paint cells with Lock; the lock at the top of the cell popup.
- #708 The cloud (Save and Pull to cloud) with a header button showing when it was last saved.
- #707 Every month starts locked. #705 Earlier saves (restore from the cloud history).
- #703 The import moves people to their new grade. #702 A month is saved as one JSON string (index-entry limit).

## Decisions
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
