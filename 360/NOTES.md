# APMES CCC 360

What the programme coordinators (PCs) collect from residents before a CCC (a residency meeting): the **scholar projects**
each resident is doing, and the people who should give each resident **multisource feedback (MSF)**. It replaces the
department's Google Form "CCC Projects & MSF" (owner, 17 Oct 2026). At `apmes.anawj.com/360/` (folder `360/`; `?demo` for
made-up residents). Same people and sign-in as logbook, evals and People. Not the same as `applicants/`.

## Rules the app follows (decisions in the owner's private notes)

- One **round** per CCC, opened and closed by PCs (or PDs, admins), with a deadline. Residents edit until it closes.
- Projects carry over between rounds; **nominees start empty each round** (the app does not offer last round's list).
- Lists: scholarly projects (title, supervisor, status, start, end, note; "nothing to report" tick), committee / admin work,
  teaching / presentations, conference presentations (free text). Nominees: name, group (senior, peer, allied health, other),
  email (required for allied health, optional for doctors). Limits: 6 seniors (Associate Consultant or above), 2 peers, 4 allied health.
- PCs review nominees (ok or swap) and send emails **outside the app** (CSV export, or one `mailto:` per nominee).
- **Roles live in the app**: `access/{google-email}` holds `{ roles }` (owner, admin, pc, pd). A PC has Admin staff's powers, so
  PDs, Admin staff and PCs read every entry and nominee list; residents see only their own; faculty none. Residents' private
  logbooks, reflections and assessment comments stay out of reach of admin staff and PCs.
- Nominees' contact details are third-party personal data: deleted automatically a year after a round closes (a PC or PD can
  delete earlier); projects stay. Real data never goes in this repo; the demo is made up.

## Data (rules in `logbook/firestore.rules`, "CCC 360"; tests `360/test/rules.emulator.mjs`, run by `tools/test-rules.sh`)

- `access/{email}` `{ name, roles, updatedAt, updatedBy }` and `accessLog/{id}`: see "Roles" in `people/NOTES.md`. Replaces the
  short-lived `cccPCs` (removed 17 Oct 2026, never used).
- `ccc/{round}` `{ round, title, status: open|closed, deadline?, closedAt?, updatedAt }`: read by residents and staff; written by staff
  (staff = PD, Admin staff, PC).
- `ccc/{round}/entries/{email}`: a resident's projects (`noProjects, projects, admin, teaching, conferences`), written by
  them while the round is open; read by them, PCs and PDs; deleted by staff.
- `ccc/{round}/msf/{email}`: a resident's `nominees` list, apart so it can be deleted alone; deleted by the resident while
  open, and by PCs and PDs any time (retention).
- `ccc/{round}/review/{email}` `{ email, marks }`: the PCs' marks on that resident's nominees (by nominee id); PCs and PDs only.
- Rules cannot check the items inside the lists (only their count); the app's `model.js` does.

## Lesson: the rules engine's 1000-expression limit

Rules fail closed (PERMISSION_DENIED) when a request needs more than 1000 expressions. `isAdmin()`, `isPD()` and `isAppOwner()` each
now also look at `access/`, so keep them cheap (`hasAccess` checks `exists` first, then reads `roles`) and run `tools/test-rules.sh`
after any change to them: a first version broke the evals decline and reassign checks this way.

## Who is who (names and emails are in the owner's private notes, never here)

- Real PCs, Admin staff, PDs, APDs and the core faculty list: the owner's private notes.
- Sign-in is Google; the `access`, `faculty` and `pds` ids are the Google email. A person's NUHS work email may differ: faculty
  records gain an optional `workEmail`, which the nominee picker uses for the PCs' emails.

## How it's built (resident half, 17 Oct 2026)

- `js/model.js`: all logic, no page code (`test/model.test.mjs`): cleaning of projects, lists and nominees, the limits (6 senior
  doctors, 2 peers, 4 allied health, 2 others; 20 in all, 30 per list), what blocks Send (a project with no title, a nominee with
  no name or a bad email, an allied-health nominee with no email) and what only warns, carrying projects over, the faculty
  picker (`suggestFaculty`: active faculty whose name starts with each word typed, core faculty first; `contactEmail`: work email
  if set, else the sign-in email) and the document shapes the rules check.
- `js/store.js`: rounds, a resident's own entry and nominees, and Send (both documents in one batch, a plain await so "sent" means the
  server has it). `?demo` uses a localStorage twin (`ccc-demo-store`).
- `js/app.js`: home, Scholarly projects, Feedback nominees, Review and send. Typing is autosaved on the device (`ccc-draft-…`) and
  wins over the server copy until Send; the device copy is cleared on Send. A closed round is read-only. Everything typed is shown
  with `textContent`, never as HTML.
- **Peers are picked from the active residents.** Since 17 Oct 2026 (owner: "residents should be able to see each others emails and see
  the list of residents") any resident may read the ACTIVE residents (names and emails; the query must ask for `status == 'ACTIVE'`; people
  on leave, graduated or attrited stay hidden; writes stay with admins and PDs). Senior doctors are suggested from faculty, peers from
  residents, others from both; anyone can still be typed in. `cloud.listActiveResidents` in evals' `cloud.js` is the call.
- Staff (PD, Admin staff, PC; `S.roles.admin/pd/owner` from `getRoles`, which reads `access/`) who are not residents go straight to the coordinators' view; residents who are also staff get a "Coordinators' view" button.
- Tests: `node 360/test/model.test.mjs`, `node 360/test/e2e.mjs` (demo at 390 px, axe on each screen, a send and a change, carry-over,
  a closed round, nothing outside the site reached).

## The coordinators' view (`js/staff.js`, 17 Oct 2026)

- **Rounds:** open a new round (name, optional send-by date; the id is `r<year>-<month>`, made unique), edit it, close it (asks first; stores
  `closedAt`), reopen it (clears `closedAt`). Residents see the newest open round; the app warns if more than one is open.
- **A round:** who has sent (active residents from People, plus anyone who sent but is not on the list), the nominees to check, a filter
  (Everyone / Not sent / To check), CSV exports of the nominees and of the projects, and a button that copies the emails of residents who
  have not sent (to chase them).
- **One resident:** their projects and lists, and each nominee with Checked / Ask for a different person, kept in `review/`. "Email" is a
  `mailto:` link to the nominee with the text filled in (`mailto` in `model.js`; edit it in the mail app) and marks them Emailed. The app
  never sends mail.
- **Retention:** nominees' contact details are deleted a year after a round closes (was 60 days; changed 17 Oct 2026 by the owner). The check (`purgeExpired`) runs whenever staff open
  the app; a round with no close time is never purged by guesswork. Staff can also delete one resident's nominees, or a round's, at once.
  Projects stay. Deleting a whole round is not offered; if it ever is, delete its nominees first (rules do not cascade).
- **CSV safety:** every cell that starts with `=`, `+`, `-`, `@` or a tab gets a leading apostrophe (`csvCell`); all resident text is put on
  the page as text only. Tested with hostile names.
- **Not built:** a reminder email, the resident's view of the coordinators' marks (deliberately never shown), and a custom email text.

## Lessons

- `tools/test-rules.sh` writes `firebase-debug.log`, `firestore-debug.log` and a `node_modules` link into the repo while it runs and removes them at the end. Do not `git add -A` while it is still running (it happened once and needed a clean-up commit).
- A rules change that widens who can read a collection must update the old test that asserted the narrower rule on purpose, and say so in the PR (#757 did).
