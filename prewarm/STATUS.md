# Prewarming study app status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-12 by Claude Code, Prewarming Webapp.

## Now

- **Claude Code, Prewarming Webapp** (branch `ccr-13264f37-d28edu`, PR #192): plan approved; PR 1 built (offline app on
  one phone) in the same PR as the plan. Unit, browser and axe tests pass.

## Waiting on the owner

- Try it on a phone (preview link on PR #192, `?demo`).
- Hospital names or codes for the sites.
- Confirm the Firebase console steps not yet checked: Firestore in `asia-southeast1` (production mode), Anonymous and
  Google sign-in on, `anawj.com` an authorised domain; optionally limit the API key to `anawj.com` / `localhost`
  referrers. (Project `prewarm-study` exists, config is on main, Rules Admin granted.)

## Recently done

- #193: `prewarm/js/firebase-config.js`, web config for Firebase project `prewarm-study` (no Analytics).

## Next

1. PR 2: sharing (join code per hospital, Firestore sync, rules with emulator tests, deploy workflow entry).
2. PR 3: admin (codes, members), export across hospitals, polish.

## Decisions

- 12 Oct 2026: scope is op-day bedside data; template timepoints; intraop 0 min = induction; entry screen option B;
  join code, new Firebase project, several hospitals; group shown only on the pre-warming screen; Subject ID in the
  Enrollment ID column; vitals baseline-only by default; keep data until the study ends. Full list in `PLAN.md`.
- 12 Oct 2026: Firebase project `prewarm-study` created by the owner; web config on main without Analytics
  (`measurementId` dropped); `firebase-rules-deployer@apmes-logbook` has Firebase Rules Admin on it (owner confirmed).
