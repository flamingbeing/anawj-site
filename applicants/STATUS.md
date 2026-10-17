# APMES Applicants status

Last updated: 2026-10-17 by Claude Code (selection).

## Now

Stage 1 and stage 2 (shared store) built and tested in demo and in the rules emulator (`NOTES.md`, `PLAN.md`). Each session edits only its own file in `status/`.

## Waiting on the owner

- **Try it:** open the preview link's `/applicants/?demo`, then (real round) paste the round file from the private notes into
  Set up › Load it and make the private link. Check the first real send in the Form's response sheet before telling everyone.
- **Stage 2 is built** (rules change, deploys on merge): add the committee in Set up, then Publish the round; the live check
  of the rules is in the run's report. Decide: retention (when to delete the responses) and reminders.
- Nothing to do in Cloudflare: `apmes.anawj.com/applicants/` is served by the existing worker route on merge.

## Update (17 Oct 2026, later)

Added: passport photos, editable questions, a faster questionnaire (fewer taps and scrolls, no comment needed, skip with one tap) and a
fuller demo. This needs a rules change (photos subcollection, `questions` field), live on merge.

## What happened (17 Oct 2026)

Built in one session from the owner's Google Form "360 feedback on residency applicants (2027 intake)" (36 applicants, a 1-5 score and a
comment each; the form clone, applicant list and a wired round file are in the owner's private notes). Stage 1 (round in a private link,
answers to the Google Form or the device) and stage 2 (shared store, committee, Results; rules live since #746) are merged.
Not done: **the real round is not published** (waits on the owner: paste the round file in Set up, or have firetop write `selection/2027`),
the committee is empty, and the first real send is untested. The owner also meant a different form (the CCC scholar-project and
multisource-feedback collection) and sent the wrong file; that is a separate app that will live at `/360/`. This app was moved to
`/applicants/`.

## Decisions

- 2026-10-17: clone of the form kept in the owner's private notes; the repo holds no applicant names. Answers go to the
  Google Form in stage 1 (no rules change, no new store). The respondent signs in with the APMES account.
