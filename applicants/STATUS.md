# APMES Applicants status

Last updated: 2026-10-17 by Claude Code (applicants).

## Now

Nothing in progress. Each session edits only its own file in `status/` (`status/applicants.md`).

## Waiting on the owner

- **Photos and a last look:** the real round is published (seen 17 Oct). Add the photos (Set up › Photos: per person, or many at once named
  after each applicant), check the questions, add the committee members' emails, then tell residents and faculty. Try `/applicants/?demo` first
  if useful.
- **First real answer:** check it shows in Results (PDs and committee). Neither the live app nor a real send has been tried from a session;
  only the rules deploys were confirmed (runs for #746 and #753 succeeded).
- **Decide:** how long to keep responses and photos (delete after the intake is decided?), and whether people who haven't answered get a reminder.

## Next (not started, in order)

1. Import the old Google Form's responses (a CSV the PD pastes or uploads on Results, read in the browser only; the app can't read the form's
   sheet itself). Offered to the owner, not built.
2. Reminders: list who hasn't answered (active residents and faculty from People) for the PD.
3. Retention: a PD action to delete a round's responses and photos once the intake is decided.
4. Open and close dates for a round.
5. Joining the other apps (`PLAN.md`, stage 3): a card in the logbook while a round is open; the chosen applicants into People's new intake.

## Recently done

- #745 first version: the form as a phone app (round in a private link, answers to the Google Form or the device).
- #746 shared store: publish, close, committee, Results; rules live (PDs and the committee read responses).
- #747 moved the app from `/360/` to `/applicants/` (`/360/` is the CCC collection form, another session's app).
- #753 passport photos, editable questions, faster questionnaire (one-tap skip, fixed Next bar, no comment needed), seeded demo; rules live.

## Decisions

- 2026-10-17: the repo holds no applicant names; the real list stays in the owner's private notes.
- 2026-10-17: PDs and the selection committee read every response, with names; plain admins don't (owner: "committee and PDs").
- 2026-10-17: comments are never required unless the admin marks a question required; "I haven't worked with them" skips an applicant in one tap.
- 2026-10-17: photos are shown to everyone who answers (they need them to know who is who); admins and PDs add them.
- 2026-10-17: the Firestore collections keep the names `selection`, `selectionCommittee` after the move to `/applicants/` (renaming = a live rules change).
