# APMES CCC 360 status

Last updated: 2026-10-17 by Claude Code (360).

## Now

Each session edits only its own file in `status/`. This session (`status/360.md`) built the rules and handed the People changes to the People session (below); the resident app is not started.

## Waiting on the owner

- The PCs' current sheet headings (columns only, never data), to match the export.
- Who the Clinical Competency Committee (CCC) members are (to tick `ccc` on faculty); the NUH and NTF contact lists (names only), for any missing faculty.
- Once People's Access pane exists: add the PCs and Admin staff there (their **Google sign-in** emails; the NUHS work emails and names are in the owner's private notes).
- A handover PR waits for the owner's approval before it merges (`AGENTS.md`, Claude Code–Codex handovers).

## Next (in order)

1. **People › Access pane** (handed to the People session; plan in `people/NOTES.md`, "Roles", and the handover below).
2. **People › faculty ticks and paste boxes:** `core`, `ccc`, `workEmail` on faculty records (rules already allow them); paste boxes that tick core/CCC by name or email and add PCs, matching on sign-in email, work email, then exactly one name (`parseAccessPaste` in `people/js/access.js` does the matching).
3. **360 resident app** (`360/`): store with a demo twin, `model.js` with unit tests, e2e with axe at 390 px. Screens: round list, projects (title, supervisor, status, start, end, note; "nothing to report"; committee/admin, teaching, conferences as lines), nominees (senior doctors up to 6 from the faculty list, peers up to 2 from residents, allied health up to 4 typed in with email, other), review and submit. Nominee picker: core faculty first, "CCC" badge; fills `workEmail` if set, else the sign-in email. Active faculty and residents only. Nominees start empty each round (no copy from last round). Show only to active residents.
4. **PC view:** all entries and nominees, mark ok or swap (`review/`), CSV (formula-safe) and one `mailto:` per nominee, close round, delete nominees 60 days after a round closes (and delete a round's nominees before deleting the round). Render user text with `textContent` only.
5. Retire `owners/`, `admins/`, `pds/` after a quiet week (a planned job; the rules read both for now).

## Handover: People › Access pane (to the People session)

- **Goal:** edit roles in the app (no console or home-computer session): owners, Admin staff, programme coordinators (PCs, same powers as Admin staff) and PDs, in a new Access tab in People.
- **Done and live:** the rules and tests (#748, #751 merged; deploy runs succeeded). The firetop copy of the old lists into `access/` was done by the owner's home-computer session on 17 Oct.
- **Done in this checkpoint:** `people/js/access.js` (roles, `mayChange` mirroring the rules, `changeText`, `parseAccessPaste`) and `people/test/access.test.mjs` (passing). Nothing else is built.
- **To build:**
  - `evals/js/cloud.js` + `demo-backend.js` (demo twin, same checks as the rules): `listAccess()`, `saveAccess({ email, name, roles, change })` and `removeAccess(email, change)` each in one write batch with an `accessLog` entry (`{ by, to, change, at }`; `updatedAt`/`at` are `serverTimestamp()`, `updatedBy` is the writer's email), `listAccessLog()`. `getRoles` must also read `access/{email}` and `owners/{email}`: `admin` = admins doc or role admin/pc, `pd` = pds doc or role pd, plus `owner` and `pc`.
  - `people/js/access-ui.js` and an Access tab in `people/js/app.js`: rows with role chips, Add a person, edit (checkbox per role; hide Owner unless the user is an owner), remove, the paste box (pick a role, show the match for each line, ask before saving), recent changes from the log. PDs may open it read-only. Use `mayChange` to disable what the rules would refuse.
  - Tests: extend `people/test/e2e.mjs` (demo, axe at 390 px); the rules already have `people/test/rules.emulator.mjs`.
  - Docs: `people/NOTES.md` (Roles: mark the Access pane built).
- **Careful:** rules fail closed past 1000 expressions per request; `isAdmin()`, `isPD()` and `isAppOwner()` already look at `access/`, so do not add more lookups there. PCs and Admin staff never read residents' logbooks, reflections or assessment comments.
- **Blockers:** none. The sender (this session) stops writing to `people/` from this handover.

## Decisions

- 2026-10-17: see `NOTES.md` (rounds, fields, review, retention; no "copy last round's nominees"; roles in the app, PC = Admin staff powers; faculty stays `faculty`; keep the apmes-logbook project; Google sign-in email versus NUHS work email).
- 2026-10-17: owner approved the access rules ("approve the access rules as described"); firetop copied the lists.
- 2026-10-17: People changes handed to the People session; the 360 session continues with the resident app once the Access pane and faculty ticks exist.

## Recently done

- #748 CCC 360: rules and emulator tests for rounds, projects, nominees and PCs.
- #751 People: roles kept in the app (`access/`), PCs with Admin staff's powers, faculty ticks (rules).
