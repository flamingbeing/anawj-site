# APMES Selection status

Last updated: 2026-10-17 by Claude Code (selection).

## Now

Stage 1 and stage 2 (shared store) built and tested in demo and in the rules emulator (`NOTES.md`, `PLAN.md`). Each session edits only its own file in `status/`.

## Waiting on the owner

- **Try it:** open the preview link's `/360/?demo`, then (real round) paste the round file from the private notes into
  Set up › Load it and make the private link. Check the first real send in the Form's response sheet before telling everyone.
- **Stage 2 is built** (rules change, deploys on merge): add the committee in Set up, then Publish the round; the live check
  of the rules is in the run's report. Decide: retention (when to delete the responses) and reminders.
- Nothing to do in Cloudflare: `apmes.anawj.com/360/` is served by the existing worker route on merge.

## Decisions

- 2026-10-17: clone of the form kept in the owner's private notes; the repo holds no applicant names. Answers go to the
  Google Form in stage 1 (no rules change, no new store). The respondent signs in with the APMES account.
