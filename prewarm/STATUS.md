# Prewarming study app status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-12 by Claude Code, Prewarming Webapp.

## Now

- **Claude Code, Prewarming Webapp** (branch `ccr-13264f37-d28edu`, PR #194): hospitals added; next is PR 2 (sharing)
  once the owner confirms the Firebase console steps.

## Waiting on the owner

- Try it on a phone: `anawj.com/prewarm/?demo`.
- Confirm the Firebase console steps not yet checked: Firestore in `asia-southeast1` (production mode), Anonymous and
  Google sign-in on, `anawj.com` an authorised domain; optionally limit the API key to `anawj.com` / `localhost`
  referrers. (Project `prewarm-study` exists, config is on main, Rules Admin granted.)

## Recently done

- #194: study hospitals (NTF, NUH, SGH, CGH, TTSH, KTPH, WH) in Settings, on patients and in the export.
- #193: `prewarm/js/firebase-config.js`, web config for Firebase project `prewarm-study` (no Analytics).
- #192: plan and PR 1, the offline op-day app.

## Next

1. PR 2: sharing (join code per hospital (NTF, NUH, SGH, CGH, TTSH, KTPH, WH), Firestore sync, rules with emulator tests, deploy workflow entry).
2. PR 3: admin (codes, members), export across hospitals, polish.

## Decisions

- 12 Oct 2026: scope is op-day bedside data; template timepoints; intraop 0 min = induction; entry screen option B;
  join code, new Firebase project, several hospitals; group shown only on the pre-warming screen; Subject ID in the
  Enrollment ID column; vitals baseline-only by default; keep data until the study ends. Full list in `PLAN.md`.
- 12 Oct 2026: Firebase project `prewarm-study` created by the owner; web config on main without Analytics
  (`measurementId` dropped); `firebase-rules-deployer@apmes-logbook` has Firebase Rules Admin on it (owner confirmed).
