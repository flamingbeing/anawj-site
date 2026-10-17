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
- PCs are a list kept by admins and PDs (`cccPCs`). PCs and PDs read everything; a resident sees only their own; plain
  admins and faculty see none of it.
- Nominees' contact details are third-party personal data: deleted automatically 60 days after a round closes (a PC or PD
  can delete earlier); projects stay. Real data never goes in this repo; the demo is made up.

## Data (rules in `logbook/firestore.rules`, "CCC 360"; tests `360/test/rules.emulator.mjs`, run by `tools/test-rules.sh`)

- `cccPCs/{email}` `{ name }`: the PCs. Read by admins and PDs; a PC can check their own entry.
- `ccc/{round}` `{ round, title, status: open|closed, deadline?, closedAt?, updatedAt }`: read by residents, PCs, PDs, admins;
  written by PCs, PDs, admins.
- `ccc/{round}/entries/{email}`: a resident's projects (`noProjects, projects, admin, teaching, conferences`), written by
  them while the round is open; read by them, PCs and PDs; deleted by PDs.
- `ccc/{round}/msf/{email}`: a resident's `nominees` list, apart so it can be deleted alone; deleted by the resident while
  open, and by PCs and PDs any time (retention).
- `ccc/{round}/review/{email}` `{ email, marks }`: the PCs' marks on that resident's nominees (by nominee id); PCs and PDs only.
- Rules cannot check the items inside the lists (only their count); the app's `model.js` does.
