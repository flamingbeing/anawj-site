# APMES People status

Short and current: what is happening now, what waits on the owner, what is next, and the decisions made along the way.
Lasting rules and lessons go in `NOTES.md`. "Recently done" is updated at save-state only, not in every PR (the PR
list, filtered by the `people` label, has the rest).
Each session edits only its own file under `status/` (see **Now**). Update this file when a task finishes, a decision is made, or
before compacting (`/save-state` in Claude Code, `$save-state` in Codex).

Last updated: 2026-10-16 by Claude Code, People app (people); the line before it was the NUH Junior Monthly grade moves session.

## Now

Each session keeps its own line in `status/<session>.md` (`people.md`; a new session adds its own file), so sessions never
edit the same lines. Read them all before starting; edit only yours. People reuses evals' code (`people/NOTES.md`), so
check `evals/` work in progress too.

## Waiting on the owner

- **Try Import from roster with the real lists** (16 Oct): People › Residents › Import from roster › Get the list from NUH
  Junior Monthly (import the newest month's sheet there first, so grades are current; use the browser that has the roster app's data, or sign in to its team sharing; otherwise copy it from
  the roster app's More › Export and paste). Check the name matches and the suggested years before applying, and say if
  the matching misses people or the defaults (what is ticked) should change.

## Next (agreed queue)

1. **Rotations, stage 1: read-only** (owner, 16 Oct 2026; waits on the owner's go). Read the department's master block
   rotation sheet (from Google with the owner's own sign-in, or an uploaded file) in the browser and show rotations,
   who has done what, and manpower. No Firebase, nothing written to the sheet. First import hand-linked (sheet name to
   person), the links kept in the browser. Plus a one-way hand-off of the postings the monthly roster needs (ICU, cardiac,
   the OG floats) in the layout NUH Junior Monthly's Paste rotations takes (names down, Mondays across), named as the
   roster app names people. The roster app **pulls** it (it opens People, which sends after the user taps Send): the
   roster app's side is noted in `nuh-junior-monthly/NOTES.md`, "Rotations from People". The sheet reader should be a standalone module with no screen of its own, so People can reuse
   it. Code meanings and the sheet's layout: the owner's private notes (code key, 66 codes).
2. **Rotations store with access control** (owner, 16 Oct 2026; the project is being created through firetop): see the
   decisions log. Not needed for stage 1.
3. Later, and only with the rotation planner's say: editing rotations in the app (stage 2), then retiring the sheet.

## Recently done

- #699 Import from the monthly roster: NUH Junior Monthly's staff list (one tap, or pasted; the department sheet's grid
  tab works too) gives year changes, graduations, new residents and residents not on the roster, each ticked or not,
  saved only after Apply and a confirm. The roster app's side: `nuh-junior-monthly/js/apmes.js`, More › Export.
- #709 Notes: People becomes the source of truth for grade and postings; match by email; change-of-email merge later.
- #704 Status notes for People and NUH Junior Monthly after #699.
- 13 Oct: APMES People built (new-intake paste, year check, PDs, CSV export; Logbook 3 session).

- #703 (nuh-junior-monthly) The roster app's sheet import now moves people to the group their new grade shows (ticked in
  its review, newest month only), so after July the staff list sent here has the new grades.

## Decisions log

- 16 Oct 2026: residents' years can be brought up to date from NUH Junior Monthly's staff list (owner). Matched by name
  (the roster has no emails); every change listed with a tick; nothing saved until Apply and its confirm.
- 16 Oct 2026: roster grades: RES1–RES3 are R1–R3; R/SR is R4 or R5, picked by the user (R3 now suggests R4); AC means
  graduated; other grades are not APMES residents. Years are fixed through the intake so they keep moving up each July.
- 16 Oct 2026: faculty are not imported from the roster (no consultants on the junior roster, no emails).
- 16 Oct 2026: before sending the list in July, import the new month's sheet in NUH Junior Monthly so everyone's grade is
  current (owner asked the import to move grades; #703).
- 16 Oct 2026: **People will become the source of truth for grade and postings** (owner: "in future i might migrate the grade
  and postings to the peoples app too"). So no two-way sync with NUH Junior Monthly, no email field in the roster app and
  no People → roster direction now: the one-way import (#699) is a bridge until that migration.
- 16 Oct 2026: when linking people across apps, **match by email** (the logbook's official emails are the source; they are
  login keys, so valid and unique) with the resident `rid` as the permanent ID underneath. No new hidden ID. Other apps
  stay on their own Firebase projects and share an ID only where they genuinely need to talk.
- 16 Oct 2026: a **change-of-email merge** is wanted in future (owner), as an explicit admin "Change email" action in People,
  never automatic: copy the logbook to the new email (old kept as backup), rewrite the emails on evaluations, keep previous
  emails; faculty and PDs have no permanent ID yet (give them one or keep a previous-emails list). It touches live data
  (logbook): full tests, emulator, preview, owner approval and probably a job to firetop. Not started.
- 16 Oct 2026: **rotations will live with People** (owner): the master block rotation sheet is both the plan (who is where,
  week by week) and the record (who has done what), and rosters and APMES both need it. Model: a person has an identity
  (ID, name, email, kind), a home (permanent staff belong to one institution; residents belong to the programme) and
  placements (institution, from, to; a rotation is a new placement). Each roster asks "who is placed here this month".
  Grid cells are placements; "who has done what" and manpower are worked out from them, never typed twice.
- 16 Oct 2026: **stage 1 is read-only, in the browser, no Firebase** (owner: the live logbook's data is protected). Shared
  storage (its own Firebase project, never the logbook's) comes only when others need to see the same rotations.
- 16 Oct 2026: the sheet's notation (owner): a `-E` suffix is the elective version of a posting (an elective is not always at
  the base code's place and mostly doesn't count toward manpower); a `KIV` prefix means provisional; a slash joins two
  codes in one week and is ad hoc (resolve each by hand). Some codes are origin tags in the External Residents column
  (where a rotating resident comes from), not postings. The reader must tell those rows apart.
- 16 Oct 2026: the rotation planner's sheet and workflow stay as they are; nothing here edits the sheet, and the planner is
  not involved until the owner says so. The monthly roster's rosterer writes only the critical postings by hand today; the
  export replaces that.
- 16 Oct 2026: **who may see rotations** (owner): PDs, PCs (admins) and rosterers only; faculty and juniors never. No shared
  password: Google sign-in against a named list, as the other apps. Stage 1 stores nothing on a server (it shows what the
  signed-in person's own Google access opens, or a file on their device), and People already lets in only admins and PDs.
  Rosterers are not in People's lists (adding them means a change to the protected logbook project's rules, which we avoid), so
  until the shared store exists an admin or PD sends the critical postings to the roster app (the pull above) and the
  rosterer sees only those.
- 16 Oct 2026: **a separate Firebase project for rotations**, `apmes-rotations` (owner; requested from firetop the same day;
  never the logbook's project). It copies the roster app's pattern: a member list with roles (admin, rosterer, viewer) that
  admins manage inside the app, so only the very first admin is added by hand in the console, once. The owner does not want to
  open Firebase to add rosterers. Rules (member-only read; deploy on merge via the rules workflow) and the app's sign-in
  come when stage 2 is built; reusing the roster app's own project was the other option (its rosterers are already members),
  but signing in from People's address to it needs extra setup that is not yet checked. Where the rotations screen lives
  (People or the roster app) decides this; not decided.

