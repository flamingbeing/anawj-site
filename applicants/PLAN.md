# Applicants app: plan

Built 17 Oct 2026 in one hour from the owner's request: clone the Google Form, make a web app from it, for the same residents
as the other APMES apps, in the NUHS design, with room to join them later.

## Stage 1 (built): the form as an app

Phone-first respondent flow with autosave and a review screen, PD/admin Set up (paste names, private link) and Results (this
device only, CSV). Sign-in with the APMES account. Answers go to the department's Google Form when the round is wired to it, so
the response sheet and anyone's existing way of reading it keep working. Why this way: a shared store needs a rules change and
a decision on who may read confidential feedback, and neither should be rushed in an hour.

Known limits: results from Google-Form sends are not visible in the app; "sent" can't be confirmed from the browser; the
round (with names) lives in a link and on devices; one device's Results screen only shows what was sent from that device.

## Stage 2: a shared store (built 17 Oct 2026; text below is the plan it followed)

Decided by the owner: PDs and the selection committee read every response, with names. Built as proposed below, in the
logbook project: rounds, one response per respondent (readable by them too), a committee list kept by admins and PDs. Still
open: reminders to people who haven't answered, open/close dates, retention (delete responses after the intake is decided).

- **Where:** a new collection in the logbook project (`apmes-logbook`), like evals, or its own project (the owner keeps the
  logbook's Firebase protected: ask first). Proposed shape: `selection/{cycle}` (title, applicants, open/closed) written by
  admins and PDs; `selection/{cycle}/responses/{email}` one document per respondent with every answer, written only by that
  respondent (create or update while the round is open); read only by admins and PDs (or a named committee).
- **Rules to write, with emulator tests (`tools/test-rules.sh`):** respondents can't read other responses or even their own after
  sending if the owner wants strict confidentiality; nobody edits after the round closes; applicants never see anything. Ask:
  should PDs see who said what, or only the committee?
- The app swaps `deliver()` and `subs()` for the store; screens stay. The round then comes from the store, not a link, so names
  leave devices and links.
- Open/close dates, reminders to those who haven't answered (a list from People: who is active faculty or a resident), and a
  "who has answered" view for the PD (names only, no scores).

## Stage 3: joining the other apps

- **People:** the respondent list (active residents, faculty) already comes from People; add "applicants" as a fourth list there
  only if the owner wants the same list used elsewhere (it's real data about outsiders: separate collection, short retention).
- **Evals:** a selected applicant becomes a resident through People's new-intake import, so their later evals and logbook start
  from the same record. The link back: keep `cycle` = intake year, matching a resident's `intake`.
- **Logbook:** a "Selection" card on the home screen when a round is open and the user hasn't finished; no data shared.
- **Roster apps:** none; the rotation sheet stays in People.
- The Google Form stays as the fallback until stage 2 has run one real round.

## Not doing

Applicant photos (the form has small ones on 19 of 36 applicants; not downloaded: faces are personal data and not needed),
anonymous answers (the committee wants to know who said what), changing scores after a round closes.
