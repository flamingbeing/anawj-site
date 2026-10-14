# OT simulator status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-14 by Claude Code (build session: M0.1 model loop).

## Now

Each session keeps its own line in `status/<session>.md`. Read them before starting; edit only yours.

## Waiting on the owner

- Answers to the 11 questions at the end of `DESIGN.md` (monitor brand, TCI model, airway and resuscitation
  algorithms, crisis guideline defaults, NUH drugs and products including dantrolene, sevoflurane MAC, fentanyl ke0,
  scenario order, scores, processed EEG). The build can start on the defaults given there.
- Clinical read-through of drug parameters, thresholds and crisis management steps as each milestone lands
  (`MODEL.md` tags every number: checked, secondary, unverified or our design choice; `SCENARIOS.md` tags the doses
  and windows that are not checked, and `research/crises.md` holds each dose's source).

## Next

1. M0.2 (first monitor: theatre shell, loop, lanes, synthetic sinus waveforms, numerics), then the PR order in
   `DESIGN.md`, one PR at a time, each merged before the next.

## Recently done

- M0.1 (14 Oct 2026): `js/model/` loop (`sim.js`, fixed 0.1 s Jacobi step, snapshot, replay, event ring, trends,
  300 s warm start), `rng.js` (sfc32, named streams), `fmath.js` (exact exp, log, pow, sin, cos), `patient.js`
  (covariates and variation), a placeholder `vitals.js`; tests for maths, determinism, purity and the patient.
- Build plan (14 Oct 2026): `DESIGN.md`, `MODEL.md`, `SCENARIOS.md`, `research/`; brief corrected (Marsh example);
  revised after two reviews, prototypes of the riskiest models and a source check (`research/prototypes.md`).
- Environment prepared: folder, address, labels, CI hooks, test runner, smoke test, build brief (14 Oct 2026).
