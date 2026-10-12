# Prewarming study app status

Short and current. Lasting rules go in `NOTES.md` (once the app exists). Update with `/save-state`.

Last updated: 2026-10-12 by Claude Code, Prewarming Webapp.

## Now

- **Claude Code, Prewarming Webapp** (branch `ccr-13264f37-d28edu`): plan written (`PLAN.md`), waiting for the
  owner's approval and the four "Still to confirm" answers. No app code yet.

## Waiting on the owner

- Approve `PLAN.md`; answer its "Still to confirm" list (blinding, patient ID, sites, keeping data).
- Before PR 2: create the Firebase project and the steps in `PLAN.md` → "What the owner needs to do".

## Next

1. PR 1: offline app on one phone (timeline, option-B reading screen, alerts, op-day forms, settings, Excel export).
2. PR 2: sharing (join code, Firestore sync, rules).
3. PR 3: admin and polish.

## Decisions

- 12 Oct 2026: scope is op-day bedside data only; temperature timepoints as the template; intraop 0 min = induction;
  entry screen option B ("change what moved"); join code, new Firebase project, several hospitals. Full table in
  `PLAN.md`.
