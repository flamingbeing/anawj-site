# OT simulator status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-15 by Claude Code (build session: M2.7-M3.2 merged; M3.3 slice 1 alarm engine+bar merged; slice 2 technical alarms).

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

1. M3.3 slice 3: trainee-set alarm limits (an Alarms settings area/menu, per device). Then the Log tab. (A
   ventilator-disconnection technical alarm likely rides with the scenario engine's circuit state.) Then M4.x:
   `conditions.js`/`events.js` scenario engine + crisis scenarios (the "diverse use cases" goal).

## Recently done

- M3.3 slice 2 (15 Oct 2026, #628→next): technical alarms (`monitor.js`) — "No CO₂ — check the tube and circuit"
  (high; ventilating but EtCO₂≈0: oesophageal tube/disconnection/arrest) and "SpO₂ — no pulse detected" (medium;
  non-perfusing rhythm, replaces the numeric SpO₂ alarm). Same engine/bar; logged `tech:true`. MODEL.md §14 +
  `test/alarms.test.mjs` + e2e.
- M3.3 slice 1 (15 Oct 2026, #628): the alarm engine (`monitor.js`) — per-parameter limits (defaults in
  MODEL.md §14), three IEC priorities, onset debounce, 2-min silence, logged in simulated time (onset identical at any
  speed); the alarm bar at the top of the monitor (top alarm, colour/flash, aria-live, +N more, Silence). Physiological
  alarms only; technical alarms and trainee-set limits are slice 2. `test/alarms.test.mjs` + e2e.
- M3.2 slice 4 (15 Oct 2026, #622): the Examine and Help tabs (`ui/examine.js`, `ui/help.js`). Examine is a
  read-only clinical read of the model (chest/breath sounds/skin/pupils/movement) that matches the monitor; Help has
  the four team actions as logged events (call for help, tell the surgeon, airway trolley, major haemorrhage). Finishes
  M3.2. `test/examine.test.mjs` + e2e.
- M3.2 slice 3 (15 Oct 2026, #614): the operation timeline (`ui/timeline.js`). The Patient tab's manual "Surgery
  running" toggle is replaced by an Operation block — Start operation, Skip to next step, live now/next readout —
  driving a scripted surgical-stimulus sequence (incision → steady → deep dissection → closing → finished) through
  `sim.act()` (deterministic). Auto-advances while running; Skip fast-forwards. Not the M4 scenario engine.
  `test/timeline.test.mjs` + e2e.
- M3.2 slice 2 (15 Oct 2026, #612): the pre-op screen (`#preop`, `ui/preop.js`). The Elective GA card opens a
  briefing — patient summary (demographics from the model patient), the case narrative (ASA/airway/history/allergies/
  fasting/plan) and a paraphrased WHO sign-in checklist (tickable, not enforced) — then "Begin the anaesthetic" into
  the theatre, keeping the same patient. `test/preop.test.mjs` + e2e flow.
- M3.2 slice 1 (15 Oct 2026, #608): start presets (`presets.js`: awake/preoxygenated/sedation/induced/maintenance/emergence,
  replayed from awake), `?preset=`/`?case=electiveGA`/`?at=` deep links, an Elective GA library card.
- M3.1 (15 Oct 2026, #607): the airway (`airway.js`): per-patient Cormack-Lehane/mask difficulty; obstruction under
  sedation/paralysis relieved by manoeuvres or a device; mask seal and pre-oxygenation entrainment; tube placement
  (tracheal/oesophageal → no CO2/endobronchial one-lung). An Airway tab. resp/gas calibration unchanged (a patent
  airway delivers fully).
- M2.8 (15 Oct 2026, #604): resuscitation (`resus.js`): chest compressions (output + EtCO2 + DBP by quality),
  defibrillation (time-in-VF success curve → ROSC), transcutaneous pacing (per-patient capture threshold); SpO2 now
  falls in an untreated arrest and recovers with CPR (CO coupled into gas exchange). Resuscitation controls on the
  Patient tab.
- M2.7 (15 Oct 2026, #598): rhythms and the ECG (`rhythm.js`, cardio output gate, `ui/synth.js` morphologies/baselines): the
  blocks, AF, flutter, SVT, VT, torsades, VF, asystole, PEA, bigeminy, paced and hyperkalaemia; a rhythm picker and
  label on the Patient tab. Non-perfusing rhythms decay on the Schipke curve; sinus unchanged (calibration intact).
- M2.2-M2.6 (15 Oct 2026, #582): fluids and bleeding, vasoactive drugs, gas exchange and breathing, volatile agents,
  temperature — the full closed-loop patient model.
- M2.1 (15 Oct 2026): circulation (`cardio.js`, `rhythm.js`): three compartments, beat-latched stroke volumes, the
  baroreflex, empty-ventricle decompensation, propofol, opioid and stimulus drives. Heart rate, blood pressure and the
  waveforms now follow the model; "Behind the monitor" shows output, SVR, CVP and the reflex.
- M1.4 (15 Oct 2026, #577): hypnosis (asleep by one rule for everyone, the patient's own sensitivity), the stimulus response
  (movement unless paralysed), the BIS-like index and the autonomic drive; a Patient tab (talk, stimuli, events).
- M1.3 (15 Oct 2026, #576): neuromuscular block: rocuronium, suxamethonium, sugammadex, neostigmine; TOF on the monitor
  every 15 s, PTC on request; the block by muscle in "Behind the monitor". Tuned to the trials' acceleromyography;
  known misses in MODEL.md.
- M1.2 (15 Oct 2026, #575): syringe pumps with their own predicted model (Schnider, Marsh, Minto), plasma and effect-site
  TCI; the Drugs tab (boluses for the patient's weight, custom doses, infusions, TCI), the Circulation tab (NIBP) and
  "Behind the monitor" (the pump's prediction beside the true level).
- M1.1 (14 Oct 2026, #573): `pk.js` and `drugs.js`: propofol (Schnider, haemodynamic effect site), remifentanil (Minto),
  fentanyl, alfentanil, midazolam, ketamine, Marsh for the pump; boluses and infusions as actions; between-patient
  PK variation. Model only (the Drugs tab comes with M1.2).
- M0.2 (14 Oct 2026, #572): first monitor at `#theatre`: library screen, sweeping ECG, pleth and capnogram lanes (real pace
  at 5x and 20x), HR, SpO2, EtCO2, RR, NIBP (cycle, start/stop) and temperature, speed keys and pause, fonts, the
  old-address forward, `?seed` and `?test`.
- M0.1 (14 Oct 2026, #570): `js/model/` loop (`sim.js`, fixed 0.1 s Jacobi step, snapshot, replay, event ring, trends,
  300 s warm start), `rng.js` (sfc32, named streams), `fmath.js` (exact exp, log, pow, sin, cos), `patient.js`
  (covariates and variation), a placeholder `vitals.js`; tests for maths, determinism, purity and the patient.
- Build plan (14 Oct 2026): `DESIGN.md`, `MODEL.md`, `SCENARIOS.md`, `research/`; brief corrected (Marsh example);
  revised after two reviews, prototypes of the riskiest models and a source check (`research/prototypes.md`).
- Environment prepared: folder, address, labels, CI hooks, test runner, smoke test, build brief (14 Oct 2026).
