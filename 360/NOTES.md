# APMES CCC 360

What the programme coordinators (PCs) collect from residents before a CCC (a residency meeting): the **scholar projects**
each resident is doing, and the people who should give each resident **multisource feedback (MSF)**. It replaces the
department's Google Form "CCC Projects & MSF" (owner, 17 Oct 2026). At `apmes.anawj.com/360/` (folder `360/`; `?demo` for
made-up residents). Same people and sign-in as logbook, evals and People. Not the same as `applicants/`.

## Decisions (owner, 17 Oct 2026; defaults accepted unless noted)

- One **round** per CCC: opened and closed by PCs (or PDs, admins), with a deadline. Residents edit until it closes.
- Projects carry over between rounds (the resident only updates them). **Nominees start empty each round; the app does not
  offer last round's list** (owner).
- The form's lists, kept: scholarly projects (title, supervisor, status, start, end, note; "nothing to report" tick),
  committee / admin work, teaching / presentations, conference presentations (free-text lines).
- Nominees: name, group (senior, peer, allied health, other), email (required for allied health, optional for doctors), note.
  Limits as on the form: 6 seniors (Associate Consultant or above), 2 peers (registrars, residents, MOPEX), 4 allied health.
- PCs review nominees (mark ok or swap) and send the emails **outside the app** (CSV export, or one `mailto:` per nominee).
  Nominees do not reply in the app.
- **Roles live in the app** (owner, 17 Oct 2026: firetop won't always be there): `access/{google-email}` holds `{ roles }` with
  owner, admin (Admin staff: non-medical, non-residency), pc (programme coordinator) and pd. **A PC has Admin staff's powers**
  (owner), so PDs, Admin staff and PCs all read every entry and nominee list; residents see only their own; faculty none.
  Residents' private logbooks, reflections and assessment comments stay out of reach of admin staff and PCs (as before).
- Nominees' contact details are third-party personal data: deleted automatically 60 days after a round closes (a PC or PD
  can delete earlier); projects stay. Real data never goes in this repo; the demo is made up.

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

- Real PCs, Admin staff, PDs, APDs and the core faculty list: the owner's private notes (`data/ccc-360/`).
- Sign-in is Google; the `access`, `faculty` and `pds` ids are the Google email. A person's NUHS work email may differ: faculty
  records gain an optional `workEmail`, which the nominee picker uses for the PCs' emails.
