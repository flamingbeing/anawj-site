# Prewarming study app status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-12 by Claude Code, Prewarming Webapp.

## Now

- **Claude Code, Prewarming Webapp** (branch `ccr-13264f37-d28edu`): admin sign-in moved from Google pop-up (failed on
  phones: "missing initial state") to an emailed link; emulator test covers it.

## Waiting on the owner

- Firebase console (`prewarm-study`) → Authentication → Sign-in method → Email/Password: turn it on and tick
  "Email link (passwordless sign-in)". Then in the app: Settings → "Study admin? Sign in by email" → open the email
  on the same phone → "Join codes and members" → make each hospital's code.
- Try it on a phone: `anawj.com/prewarm/` (real) or `?demo` (fake patients, no sharing).

## Recently done

- #197: main screen = times + all temperatures + links; rules first deployed to `prewarm-study` (run #19).

- #196: sharing (join code per hospital, Firestore sync, rules, admin screen).


- #194: study hospitals (NTF, NUH, SGH, CGH, TTSH, KTPH, WH) in Settings, on patients and in the export.
- #193: `prewarm/js/firebase-config.js`, web config for Firebase project `prewarm-study` (no Analytics).
- #192: plan and PR 1, the offline op-day app.

## Next

1. PR 3: export across hospitals for admins, a members' view of who entered what, polish after phone testing.

## Decisions

- 12 Oct 2026: admins sign in by email link, not Google (phone browsers broke the Google pop-up).

- 12 Oct 2026: main screen = event times (compact) + all temperatures, links to other forms in fill-in order; empty
  temperature taps to 36.5, empty time taps to now.

- 12 Oct 2026: scope is op-day bedside data; template timepoints; intraop 0 min = induction; entry screen option B;
  join code, new Firebase project, several hospitals; group shown only on the pre-warming screen; Subject ID in the
  Enrollment ID column; vitals baseline-only by default; keep data until the study ends. Full list in `PLAN.md`.
- 12 Oct 2026: Firebase project `prewarm-study` created by the owner; web config on main without Analytics
  (`measurementId` dropped); `firebase-rules-deployer@apmes-logbook` has Firebase Rules Admin on it (owner confirmed).
