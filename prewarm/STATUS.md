# Prewarming study app status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-12 by Claude Code, Prewarming Webapp.

## Now

- **Claude Code, Prewarming Webapp** (branch `ccr-13264f37-d28edu`): PR 2 (sharing) built; rules, browser and two-phone
  sync tests pass.

## Waiting on the owner

- Add yourself as the first admin: Firebase console → Firestore → collection `admins`, document ID = your Google
  email in lower case (any field, e.g. `name`). Then in the app: Settings → "Study admin? Sign in with Google" →
  "Join codes and members" → make a code for each hospital and give it to that team.
- Try it on a phone: `anawj.com/prewarm/` (real) or `?demo` (fake patient, no sharing).

## Recently done

- PR 2: sharing (join code per hospital, Firestore sync, rules, admin screen for codes and members).

- #194: study hospitals (NTF, NUH, SGH, CGH, TTSH, KTPH, WH) in Settings, on patients and in the export.
- #193: `prewarm/js/firebase-config.js`, web config for Firebase project `prewarm-study` (no Analytics).
- #192: plan and PR 1, the offline op-day app.

## Next

1. PR 3: export across hospitals for admins, a members' view of who entered what, polish after phone testing.

## Decisions

- 12 Oct 2026: scope is op-day bedside data; template timepoints; intraop 0 min = induction; entry screen option B;
  join code, new Firebase project, several hospitals; group shown only on the pre-warming screen; Subject ID in the
  Enrollment ID column; vitals baseline-only by default; keep data until the study ends. Full list in `PLAN.md`.
- 12 Oct 2026: Firebase project `prewarm-study` created by the owner; web config on main without Analytics
  (`measurementId` dropped); `firebase-rules-deployer@apmes-logbook` has Firebase Rules Admin on it (owner confirmed).
