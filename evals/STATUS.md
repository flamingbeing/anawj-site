# Evals status

Short and current, like `logbook/STATUS.md` (same layout and rules). Lasting rules and lessons go in `NOTES.md`.
Each session edits only its own line under **Now**; update with `/save-state` (Claude Code) or `$save-state` (Codex).

Last updated: 2026-10-14 by Claude Code, Evals 1 (evals1).

## Now

Each session keeps its own line in `status/<session>.md` (`evals1.md`; a new session adds its own file).
Read them all before starting; edit only yours.

## Waiting on the owner

- Approve (or not) the rules PR #428: PD-only notes keep their author; the item can't change under a started
  assessment. Emulator: evals 201/201, logbook 227/227, prewarm 116/116.
- Decide the assessment-design ideas in `IMPROVEMENTS.md` ("Later or bigger"): they change the programme's own
  forms, so they're for the PD, not the app.
- Optional: a weekly email digest (Trigger Email extension) if completion stays low with WhatsApp/Email reminders.
- Nightly Firestore backup: deferred by the owner until the app is finalised.

## Next (agreed queue)

- Left from `IMPROVEMENTS.md` (each one small PR; see the "Done" notes there):
  1. Scale (year 3+): academic-year field and filtered PD listener (M), with `firestore.indexes.json`.
  2. Code health: split `ui-request.js` shared helpers and `FormScreen`; one clipboard helper.
  3. Look: merge the old navy base styles into the logbook-theme block; motion tokens.
  4. Exports: resident Word portfolio pages; PD per-cohort Excel; MedHub format (needs their template).
  5. Logbook link: a "Request an evaluation" button on a logbook case (logbook session's call; the evals link
     `?date=&initials=#new` is ready, #431).

## Recently done

- 14 Oct batch (5 h improvement run, all merged unless noted): #406 don't lose unsent work, plain errors;
  #409 assessor sign-in from a link (WhatsApp browser, `?as=`, wrong account); #411 Email/WhatsApp reminders;
  #412 Progress "Ask for next", filter, early-R1 deadline; #413 PD cohort sort, committee CSV, flags by resident,
  stuck requests; #416 faster first open; #421 a11y fixes, `a11y.mjs`, `edge.e2e.mjs`; #423 `schema.js`;
  #431 quicker request (Today/Yesterday, case link); #434 How evals work, install card; #437 My record (print, CSV);
  #438 settings switch; #440 assessor time-savers; #441 edit case details. #428 (rules) waits for approval.
- #367 Evals moved to `apmes.anawj.com/evals/` (sign-in domain, forward from `anawj.com/evals/` with path, query and `#` kept); sign-in checked by the owner.
- #157 Logbook learnings moved from `evals/NOTES.md` to `logbook/NOTES.md`; evals notes keep a pointer.
- #156 `evals/NOTES.md`: theme, keyboard, More screen decisions, app internals, working alongside the logbook session, backlog.
- #155 Privacy policy page at anawj.com/privacy/ (who sees what, Drive/Dropbox/Claude connector).
- #204 The app bar's top band: third quarter is the NUHS site's blue `#178fd7`, not cyan (`evals-v18`).
- #183 The APMES reference files moved from `evals/reference/` to `/apmes/` at the repo root; `tools/build-data.mjs`
  and the DOPS checklist read them from there (`evals-v17`). Generated data unchanged.

## Decisions log

- 2026-10-14: The improvement run stays inside the APMES forms and requirements: no question moved, pre-ticked or
  answered by the resident, no scale changed. Those ideas go to the PD.
- 2026-10-14: The early-R1 group (EPA 2 DOPS, "first 2 months of R1") counts as overdue in R1 from September.
- 2026-10-14: Assessor links carry the assessor's email (`?as=`) so sign-in suggests the right account.
- 2026-10-13: Improvement ideas live in `IMPROVEMENTS.md` (ranked batches); `NOTES.md` §7 keeps only the short list.
- 2026-10-13: Evals lives at `apmes.anawj.com/evals/` with the logbook (one sign-in, `SUBDOMAINS.md` step 5).
- 2026-10-13: `evals/NOTES.md` stays evals-only; logbook roles, photos and integrations live in `logbook/NOTES.md`.
- 2026-10-11: Evals theme is light by default with a per-device Light / Dark / Auto toggle; the Guide and forms card is off More for now.
- 2026-10-12: The top band is four equal quarters, orange, red, blue `#178fd7`, navy (as on nuhs.edu.sg), in every app.
- 2026-10-12: APMES programme documents live in `/apmes/` (shared by evals and logbook), not under `evals/`.
