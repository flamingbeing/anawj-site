# Prewarming study app status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-12 by Claude Code, Prewarming Webapp.

## Now

- **Claude Code, Prewarming Webapp** (branch `ccr-13264f37-d28edu`, PR #192): plan approved; PR 1 built (offline app on
  one phone) in the same PR as the plan. Unit, browser and axe tests pass.

## Waiting on the owner

- Try it on a phone (preview link on PR #192, `?demo`).
- Before PR 2: web config is in (#193, project `prewarm-study`); still confirm Anonymous + Google sign-in are on, `anawj.com` is an authorised domain, and the rules deployer has Firebase Rules Admin on the project.

## Next

1. PR 2: sharing (join code per hospital (NTF, NUH, SGH, CGH, TTSH, KTPH, WH), Firestore sync, rules with emulator tests, deploy workflow entry).
2. PR 3: admin (codes, members), export across hospitals, polish.

## Decisions

- 12 Oct 2026: scope is op-day bedside data; template timepoints; intraop 0 min = induction; entry screen option B;
  join code, new Firebase project, several hospitals; group shown only on the pre-warming screen; Subject ID in the
  Enrollment ID column; vitals baseline-only by default; keep data until the study ends. Full list in `PLAN.md`.
