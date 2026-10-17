# APMES Selection 360

Residents and faculty give confidential feedback on residency applicants: a 1 to 5 suitability score and a comment for each,
as in the department's Google Form it replaces ("360 feedback on residency applicants"; owner, 17 Oct 2026). At
`apmes.anawj.com/360/` (folder `selection/`; owner, 17 Oct 2026) (`?demo` for made-up applicants). Plan and what comes next: `PLAN.md`.

## Rules

- **No real names in this repo.** Applicants are real people, and the feedback is confidential. The code holds a made-up demo
  round only. The admin pastes the real list in the app; it is kept on the device and travels in a private link
  (`#r=…`, the part after `#` never reaches a server). The source form and the real round file are in the owner's private notes.
- **Same people as the other APMES apps.** Sign-in and roles come from evals' `cloud.js`: a resident (`residents/`), active
  faculty (`faculty/`), PD or admin may answer; PDs and admins also see Set up and Results. Nobody else gets in. No new
  Firebase collection and no rules change in stage 1.
- **Nothing in the original form was required**, so nothing blocks Send here either. The review screen only flags a score
  without a comment (and the reverse), or an applicant not answered. "I haven't worked with this applicant" is the new
  explicit answer for a blank.
- **Autosave on the device** while typing (`sel-ans-<cycle>-<email>`), so a dropped signal or closed tab loses nothing.
  Demo data uses `sel-demo-…` keys and never touches a real round.
- UI is the NUHS app kit through evals' `style.css` (like People): top band, `.a-*` classes, 44px+ targets, axe-checked.

## How it's built

- `js/model.js`: all logic, no page code (`test/model.test.mjs`): applicant list parsing, the round and its link
  (`encodeRound` / `readRoundText`), answers and their status, warnings, the Google Form body (`formBody`, `formUrl`),
  results summary and CSV (formula-safe).
- `js/app.js`: screens (home list, one applicant, review and send, thank you; Set up and Results for staff).
- A round is `{ title, cycle, applicants: [{ id, name, entry? }], form? }`. `form: { id, nameEntry }` plus each applicant's
  `entry: { score, comment }` wires the round to a Google Form's public id and question ids; without them, Send keeps the
  answers on the device.
- **Send** (stage 1) is a `no-cors` POST to the Form's `formResponse` address. The browser can't read the reply, so "sent"
  means handed over; the committee checks the response sheet. Never tested against a live Form from a session (no test
  answers go into the real sheet): the first real send needs a look in the sheet.
- Tests: `node selection/test/model.test.mjs`, `node selection/test/e2e.mjs` (phone size, demo, axe on each screen, the link
  round trip, CSV).
