# NUH Roster status

Short and current: what is happening now, what waits on the owner, what is next, and the decisions made along the way.
Lasting rules and lessons go in `NOTES.md`. "Recently done" is updated at save-state only, not in every PR.
Each session edits only its own file under `status/` (see **Now**). Update this file when a task finishes, a decision
is made, or before compacting (`/save-state` in Claude Code, `$save-state` in Codex).

Last updated: 2026-10-13 by Claude Code, NUH Roster session (roster).

## Now

Each session keeps its own line in `status/<session>.md` (`roster.md` so far; a new session adds its own file), so
sessions never edit the same lines. Read them all before starting; edit only yours.

## Waiting on the owner

- Try the viewer role once with a test account (Settings › members › Viewer): it should see only My day and the roster
  saved for the team, and saving should be refused. The rules are live; this path can't be tested without signing in.
- Check the header's "Saved to the team" / "Changes not saved to the team" state once while signed in (untested for
  the same reason).
- Real staff names in Google Cloud: approval (PDPA, hospital policy) before the team uses real data. Until then the
  roster holds no live data.
- Send a real rotation Excel file when there is one, so the importer (`js/rotations.js`) can be checked against it.
  It expects names down the first column and each week's Monday across the top.
- When a specific flow between the roster and APMES is wanted, decide how people are linked across the apps: work
  emails on the roster's staff records, or a mapping kept on the APMES side.

## Next (agreed queue)

Nothing agreed. The 13 Oct review (`REVIEW-2026-10.md`) ranks about 60 ideas in batches A–I, safety first
(silent save failure, live checks, a role allowlist in the rules with emulator tests, team-doc conflicts); the owner
picks from it. Parked, only if asked:
1. A read-only bridge to APMES (owner's question, 13 Oct): residents and supervisors as roster viewers, and APMES pages
   reading `rosters/{date}` (room, consultant, case notes for a logbook entry; who supervised whom for evaluations;
   the week's posting from `team/rotations`). Each app keeps its own Firebase project and rules.
2. UX ideas from the 11 Oct checklist that weren't picked: shorter help text with "How do I…?" links, words for the
   symbols plus a key, gentler labels, a printable quick guide, a "What changed" note after updates.
3. Known limits in `NOTES.md` (lone-time comments read as leaving times; AOH and liver duties don't make anyone post call).

## Recently done

- #361 Moved to `nuhroster.anawj.com` (subdomains step 4); the old address redirects, with "Download everything" for a browser with saved data. Sign-in checked by the owner.
- #349 Viewer members (read-only, in the rules) and My day (`#myday`).
- #348 Phone room cards, bottom-sheet person box, image for WhatsApp, one-page print, learning from hand changes.
- #346 Tap to move or swap, ranked + picker, Select several, keyboard shortcuts, Practice mode with a tour.
- #343 Weekly junior rotations in Monthly › Rotations (Excel in and out, one-day "Posting today").
- #110 Steps strip, Problems card with fix buttons, Do it all, Undo instead of "are you sure?".
- #109 Person chips on Calls and clinics (blank a monthly name; "↺ monthly").
- #108 Fuller demo: every monthly roster, real-sized department.

## Decisions log

- 2026-10-11 Git history isn't rewritten to remove the real names in old commits (owner: no need). Current files use made-up names only.
- 2026-10-11 UX ideas were picked from a checklist page and built in five batches: quick wins, guided flow, rotations, speed, phones and viewers.
- 2026-10-11 Rotations: weekly, planned for the year as an Excel grid with weeks across. A one-day change lives in the day's record (`day.staff[id].posting`), not in the rotation.
- 2026-10-11 "My day" is for a new viewer member type; "Send to WhatsApp" sends an image of the sheet.
- 2026-10-11 Demo start day: 5 on leave and 2 seniors on an admin day.
- 2026-10-13 The roster stays separate from APMES (own Firebase project and rules). Data flows later through a narrow read-only bridge, not a merge.
- 2026-10-13 The roster moved to its own subdomain, `nuhroster.anawj.com` (owner: other rosters may get their own later).
- 2026-10-13 Twenty read-only reviews ranked improvements into `REVIEW-2026-10.md`; recommended order: safety (Batch A) before new features.
