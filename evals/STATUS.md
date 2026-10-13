# Evals status

Short and current, like `logbook/STATUS.md` (same layout and rules). Lasting rules and lessons go in `NOTES.md`.
Each session edits only its own line under **Now**; update with `/save-state` (Claude Code) or `$save-state` (Codex).

Last updated: 2026-10-13 by Claude Code, Evals 1 (evals1).

## Now

Each session keeps its own line in `status/<session>.md` (`evals1.md`; a new session adds its own file).
Read them all before starting; edit only yours.

## Waiting on the owner

- Pick from the ease-of-use backlog (`NOTES.md` §7), or say to leave it.
- Nightly Firestore backup: deferred by the owner until the app is finalised.

## Next (agreed queue)

- Nothing queued until the owner picks from the backlog.

## Recently done

- #367 Evals moved to `apmes.anawj.com/evals/` (sign-in domain, forward from `anawj.com/evals/` with path, query and `#` kept); sign-in checked by the owner.
- #157 Logbook learnings moved from `evals/NOTES.md` to `logbook/NOTES.md`; evals notes keep a pointer.
- #156 `evals/NOTES.md`: theme, keyboard, More screen decisions, app internals, working alongside the logbook session, backlog.
- #155 Privacy policy page at anawj.com/privacy/ (who sees what, Drive/Dropbox/Claude connector).
- #204 The app bar's top band: third quarter is the NUHS site's blue `#178fd7`, not cyan (`evals-v18`).
- #183 The APMES reference files moved from `evals/reference/` to `/apmes/` at the repo root; `tools/build-data.mjs`
  and the DOPS checklist read them from there (`evals-v17`). Generated data unchanged.

## Decisions log

- 2026-10-13: Evals lives at `apmes.anawj.com/evals/` with the logbook (one sign-in, `SUBDOMAINS.md` step 5).
- 2026-10-13: `evals/NOTES.md` stays evals-only; logbook roles, photos and integrations live in `logbook/NOTES.md`.
- 2026-10-11: Evals theme is light by default with a per-device Light / Dark / Auto toggle; the Guide and forms card is off More for now.
- 2026-10-12: The top band is four equal quarters, orange, red, blue `#178fd7`, navy (as on nuhs.edu.sg), in every app.
- 2026-10-12: APMES programme documents live in `/apmes/` (shared by evals and logbook), not under `evals/`.
