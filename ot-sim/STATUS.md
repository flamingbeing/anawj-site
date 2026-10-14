# OT simulator status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-14 by Claude Code (plan session: build plan written; no simulator yet).

## Now

Each session keeps its own line in `status/<session>.md`. Read them before starting; edit only yours.

## Waiting on the owner

- **Go-ahead to start building** (the owner asked for a plan first, 14 Oct 2026). Read `DESIGN.md` "In short".
- Answers to the 10 questions at the end of `DESIGN.md` (monitor brand, TCI model, airway and resuscitation
  algorithms, NUH drugs and products, sevoflurane MAC, fentanyl ke0, scenario order, scores, processed EEG). The build
  can start on the defaults given there.
- Clinical read-through of drug parameters, thresholds and crisis management steps as each milestone lands
  (`MODEL.md` and `SCENARIOS.md` tag every number: checked, secondary, unverified or our design choice).

## Next

1. On the owner's go: M0.1 (model loop, seeded RNG, `fmath.js`, patient covariates, determinism tests), then the PR
   order in `DESIGN.md`, one PR at a time, each merged before the next.

## Recently done

- Build plan (14 Oct 2026): `DESIGN.md`, `MODEL.md`, `SCENARIOS.md`, `research/`; brief corrected (Marsh example).
- Environment prepared: folder, address, labels, CI hooks, test runner, smoke test, build brief (14 Oct 2026).
