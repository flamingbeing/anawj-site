# APMES People status

Short and current: what is happening now, what waits on the owner, what is next, and the decisions made along the way.
Lasting rules and lessons go in `NOTES.md`. "Recently done" is updated at save-state only, not in every PR (the PR
list, filtered by the `people` label, has the rest).
Each session edits only its own file under `status/` (see **Now**). Update this file when a task finishes, a decision is made, or
before compacting (`/save-state` in Claude Code, `$save-state` in Codex).

Last updated: 2026-10-16 by Claude Code, People app (people).

## Now

Each session keeps its own line in `status/<session>.md` (`people.md`; a new session adds its own file), so sessions never
edit the same lines. Read them all before starting; edit only yours. People reuses evals' code (`people/NOTES.md`), so
check `evals/` work in progress too.

## Waiting on the owner

- **Try Import from roster with the real lists** (16 Oct): People › Residents › Import from roster › Get the list from NUH
  Junior Monthly (use the browser that has the roster app's data, or sign in to its team sharing; otherwise copy it from
  the roster app's More › Export and paste). Check the name matches and the suggested years before applying, and say if
  the matching misses people or the defaults (what is ticked) should change.

## Next (agreed queue)

Nothing queued. Ideas: `NOTES.md`, "Ideas for later".

## Recently done

- #699 Import from the monthly roster: NUH Junior Monthly's staff list (one tap, or pasted; the department sheet's grid
  tab works too) gives year changes, graduations, new residents and residents not on the roster, each ticked or not,
  saved only after Apply and a confirm. The roster app's side: `nuh-junior-monthly/js/apmes.js`, More › Export.
- 13 Oct: APMES People built (new-intake paste, year check, PDs, CSV export; Logbook 3 session).

## Decisions log

- 16 Oct 2026: residents' years can be brought up to date from NUH Junior Monthly's staff list (owner). Matched by name
  (the roster has no emails); every change listed with a tick; nothing saved until Apply and its confirm.
- 16 Oct 2026: roster grades: RES1–RES3 are R1–R3; R/SR is R4 or R5, picked by the user (R3 now suggests R4); AC means
  graduated; other grades are not APMES residents. Years are fixed through the intake so they keep moving up each July.
- 16 Oct 2026: faculty are not imported from the roster (no consultants on the junior roster, no emails).
