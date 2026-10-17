# APMES CCC 360 status

Last updated: 2026-10-17 by Claude Code (360).

## Now

The CCC 360 app is built and merged: residents' half (#752) and the coordinators' view (#755). Roles are edited in People › Access (#754). Nothing is in progress in this session; each session edits only its own file in `status/`.

## Waiting on the owner

- Add the PCs and Admin staff in People › Access (their **Google sign-in** emails; names and NUHS work emails are in the owner's private notes), then open the first round in `/360/` (Coordinators' view › Open a new round).
- The PCs' current sheet headings (columns only, never data), so the CSV can match their sheet. Until then it uses the form's fields.
- Who the Clinical Competency Committee (CCC) members are (tick `ccc` on faculty in People › Access); the NUH and NTF contact lists (names only), for any missing faculty.
- Merge the private-notes PR in the owner's private repo, so later sessions can see who the coordinators are.

## Next (in order)

1. After the first real round: look at what the coordinators actually do with the lists and adjust (the email text, the CSV columns, reminders).
2. Optional: a reminder to residents who have not sent (a `mailto:` to the unsent list), and a custom email text kept in the app.
3. Retire `owners/`, `admins/`, `pds/` after a quiet week (a planned job, see `people/NOTES.md`; the rules read both for now).
4. Done 17 Oct 2026: residents may read the ACTIVE residents, and the peer picker uses it.

## Decisions

- 2026-10-17: see `NOTES.md` (rounds, fields, review, retention; no "copy last round's nominees"; roles in the app, PC = Admin staff powers; faculty stays `faculty`; keep the apmes-logbook project; Google sign-in email versus NUHS work email).
- 2026-10-17: owner approved the access rules ("approve the access rules as described"); firetop copied the lists.
- 2026-10-17: People changes handed to the People session (their #754 is merged); the 360 session built the resident app and the coordinators' view.
- 2026-10-17: the nominee clean-up (one year after a round closes; owner changed it from 60 days) runs when staff open the app (no scheduled job); a round with no close time is never purged by guesswork.

## Recently done

- #748 CCC 360: rules and emulator tests for rounds, projects, nominees and PCs.
- #751 People: roles kept in the app (`access/`), PCs with Admin staff's powers, faculty ticks (rules).
- #752 CCC 360: the resident app (projects and feedback nominees).
- #754 People: Access tab (roles, access log, paste people, tick core and CCC) (People session).
- #755 CCC 360: the coordinators' view (rounds, who has sent, marks, email links, CSV, nominee clean-up).
