# NUH Roster status

Short and current: what is happening now, what waits on the owner, what is next, and the decisions made along the way.
Lasting rules and lessons go in `NOTES.md`. "Recently done" is updated at save-state only, not in every PR.
Each session edits only its own file under `status/` (see **Now**). Update this file when a task finishes, a decision
is made, or before compacting (`/save-state` in Claude Code, `$save-state` in Codex).

Last updated: 2026-10-13 (evening) by Claude Code, NUH Roster session (roster).

## Now

Each session keeps its own line in `status/<session>.md` (`roster.md` so far; a new session adds its own file), so
sessions never edit the same lines. Read them all before starting; edit only yours.

## Waiting on the owner

- **Approve the rules PR** (role allowlist, member shape, stamped writes, date ids, staff-list history): the last PR of
  the 13 Oct session. It deploys live on merge; 56 emulator checks pass (17 fail on today's rules). After merging,
  check the "Deploy Firestore rules" run, then sign in and press Save for the team once.
- Try the viewer role once with a test account (Settings › Team members › Viewer, and "On the staff list as"): it
  should see only My day (its own day, "your account") and the roster saved for the team; saving is refused.
- Check the header's "Saved to the team" state and "Save for the team" once while signed in (both untested live).
- On a real phone: Add to Home Screen, then open it with mobile data off (offline shell, #467); the person box above
  the keyboard (#419).
- Real staff names in Google Cloud: approval (PDPA, hospital policy) before the team uses real data.
- Send a real rotation Excel file and a real HMS monthly PDF when there is one, to check the importers again.
- Decide on per-person history and fairness (review Batch I: "who did what" report, a fairness term in the generator):
  needs the PDPA view first.

## Next (agreed queue)

The 13 Oct review (`REVIEW-2026-10.md`) is mostly built (its "Done" section lists what). Left, only if asked:
1. Batch I (history and fairness): owner and PDPA decision first.
2. Team documents: a "restore a staff-list version" screen once the rules PR is in (the versions are written by then).
3. Splitting `app.js` (4,350 lines) one tab per PR; `store.js` and `help.js` were the first steps.
4. A read-only bridge to APMES (owner's question, 13 Oct); "Copy for logbook" on My day is the first, safe step.
5. Known limits in `NOTES.md`.

## Recently done

13 Oct: about 30 PRs from the review (#407–#473); the full list is in `REVIEW-2026-10.md` › Done on 13 Oct. The main ones:
- #473 / #446 Generate prefers SC/C for complex lists and double covers, says why, keeps a consultant for AIC.
- #467 Installable on a phone's home screen; opens with poor signal.
- #466 / #449 Start a day from the last roster; several-day statuses; save then send.
- #458 / #465 / #471 Key and help, printable guide, What's new.
- #453 The browser test in the repo and in CI.
- #425 / #459 Team saves check for a newer save; a second tab can't write over the first.
- #414 / #450 My day opens on today, My week, add to calendar, copy for logbook.
- #407 / #408 A warning when the browser stops saving; live checks for double cover with no junior and more.

## Decisions log

- 2026-10-11 Git history isn't rewritten to remove the real names in old commits (owner: no need). Current files use made-up names only.
- 2026-10-11 UX ideas were picked from a checklist page and built in five batches: quick wins, guided flow, rotations, speed, phones and viewers.
- 2026-10-11 Rotations: weekly, planned for the year as an Excel grid with weeks across. A one-day change lives in the day's record (`day.staff[id].posting`), not in the rotation.
- 2026-10-11 "My day" is for a new viewer member type; "Send to WhatsApp" sends an image of the sheet.
- 2026-10-11 Demo start day: 5 on leave and 2 seniors on an admin day.
- 2026-10-13 The roster stays separate from APMES (own Firebase project and rules). Data flows later through a narrow read-only bridge, not a merge.
- 2026-10-13 The roster moved to its own subdomain, `nuhroster.anawj.com` (owner: other rosters may get their own later).
- 2026-10-13 Twenty read-only reviews ranked improvements into `REVIEW-2026-10.md`; recommended order: safety (Batch A) before new features.
- 2026-10-13 The review was built in one evening, PR by PR (owner: "spend the next 5 hours improving this app"); the rules change is the last PR and waits for the owner.
- 2026-10-13 Generate prefers SC/C seniors for complex lists, double covers and rooms with a Baby MO or MOPEX; AOCC leaves the last free consultant for AIC.
- 2026-10-13 My day opens on today until 2pm, then tomorrow.
