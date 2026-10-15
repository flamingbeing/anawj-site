- ot-sim build (14-15 Oct 2026, branch `claude/magical-turing-oifbz6`): building in `DESIGN.md` PR order. Merged to
  main: M0.1 #570, M0.2 #572, M1.1 #573, M1.2 #575, M1.3 #576, M1.4 #577, M2.1 #578, and M2.2-M2.6 bundled in #582
  (fluids/bleeding, vasoactive drugs, gas exchange and breathing, volatile agents, temperature).
- M2.7 (rhythms) merged in #598: the full `rhythm.js` engine (atrial/AV/ventricular clocks, blocks, AF, flutter, SVT,
  VT, torsades, VF, asystole, PEA, bigeminy, paced, hyperkalaemia), cardio's output gate, ECG morphologies/baselines in
  `ui/synth.js`, a rhythm picker + label. Sinus output 1 → M2.1-M2.6 calibration unchanged. (#598 was briefly blocked by
  an unrelated bis-dsa colour test red on main, fixed by #597; merged the fixed main in and merged.)
- M2.8 (resuscitation) built on this branch (restarted from main after #598 merged): new `resus.js` (CPR output by
  quality + coronary build-up, defibrillation with a time-in-VF success curve, transcutaneous pacing capture at a
  per-patient threshold, ROSC via a successful shock); cardio reads `resus.cprFrac`; gas couples CO2 clearance and O2
  stagnation to cardiac output (gated below normal CO, so earlier calibration is intact) — closing the M2.7
  SpO2-in-arrest miss; a Resuscitation block on the Patient tab; `test/resus.test.mjs`. All green under
  `tools/test-ot-sim.sh` locally.
- M3.1 (airway) built on this branch (restarted from main after #604 merged): new `airway.js` (per-patient Cormack-
  Lehane/mask difficulty from an `airway` sub-stream; obstruction under sedation/paralysis relieved by manoeuvres or a
  device; mask seal → delivery + pre-ox entrainment; tube placement tracheal/oesophageal/endobronchial). resp.js reads
  `aw.toLungs`/entrain/oneLung; gas.js reads `resp.shuntAdd` (one lung). Airway tab; `test/airway.test.mjs`; two gas
  tests updated to the real airway. All green under `tools/test-ot-sim.sh` locally.
- M3.2 (case flow) is being delivered in slices. Slice 1 built on this branch (from main after #607): `presets.js`
  (awake/preoxygenated/sedation/induced/maintenance/emergence start states, replayed from awake; `applyPreset`),
  `?preset=`/`?case=electiveGA`/`?at=` deep links, an Elective GA library card, `test/presets.test.mjs`. All green
  under `tools/test-ot-sim.sh`.
- M3.2 slice 2 built on this branch (from main after #608 merged): the pre-op screen (`#preop`, `ui/preop.js`). The
  Elective GA card now opens a briefing — the synthetic patient's summary (demographics read from `sim.state.patient`
  so they match the monitor) and the case narrative (ASA/airway/history/allergies/fasting/plan), then a paraphrased
  WHO sign-in checklist (tickable, nothing enforced; the debrief in M5 will note skips), then "Begin the anaesthetic"
  into the theatre. Begin keeps the whole query and changes only the hash, so the theatre uses the same patient (and
  it's a hashchange, not a reload). `test/preop.test.mjs`; e2e covers the card → pre-op → theatre flow, the checklist,
  axe on the screen, and the unknown-case fallback. `tools/test-ot-sim.sh` green.
- M3.2 slice 3 built on this branch (from main after #612 merged): the operation timeline (`ui/timeline.js`). A
  standard general-surgery case as an ordered surgical-stimulus script (`OPERATION`: incision → steady surgery → deep
  dissection → closing → finished) at offsets from surgery start. The Patient tab's old manual "Surgery running"
  toggle is replaced by an **Operation** block: "Start operation", "Skip to next step", and a live now/next readout.
  A small UI scheduler (`surgTick`) fires each step via `sim.act()` as model time passes (auto-advance while running,
  in `frame()` and the test step helper); "Skip" fast-forwards model time with `sim.runTo` to the next step. Driven
  through real actions, so it stays deterministic and replayable. **Not** the M4 scenario engine — only the surgical
  stimulus over time, for the guided case and free run. `test/timeline.test.mjs` (script well-formed, `phaseAt`, a
  real sim driven through it, determinism); e2e drives Start → Skip through every step → ends. `tools/test-ot-sim.sh`,
  check and proofread green.
- M3.2 slice 4 built on this branch (from main after #614 merged): the Examine and Help tabs (`ui/examine.js`,
  `ui/help.js`), finishing M3.2. **Examine** is a read-only clinical read of the model (chest movement, breath sounds,
  skin colour/temperature/sweat, pupils, movement/tone) derived from `gas`/`aw`/`pd`/`temp`/`resp`, refreshed live in
  `panels()` so it always agrees with the monitor. **Help** has the four actions (call for help, tell the surgeon, get
  the difficult-airway trolley, major haemorrhage protocol) as logged `{type:'help',do}` actions — they confirm, show
  in the events feed (eventsHtml extended) and are there for the M5 debrief; no physiological effect in M3.2 (the
  scenarios give them meaning in M4). Two new tabs; `test/examine.test.mjs`; e2e covers both tabs + axe. Footer and a
  stale comment updated. `tools/test-ot-sim.sh`, check, proofread green.
- **M3.2 is complete.**
- M3.3 (alarms) is being delivered in slices. Slice 1 built on this branch (from main after #622 merged): the alarm
  engine in `monitor.js` — per-parameter limits (`ALARM_LIMITS`, defaults tagged [D] in MODEL.md §14), three IEC
  60601-1-8 priorities, an onset debounce (high 3 s / medium 5 s / low 10 s), and a 2-minute silence, all evaluated in
  simulated time and logged (`{kind:'alarm',…}`) so onset timing is identical at every speed. The **alarm bar** at the
  top of the monitor shows the highest-priority alarm with its colour/flash, aria-live assertive for high, a "+N more"
  count, and the Silence button/countdown. `test/alarms.test.mjs` (limits well-formed, SpO2 high alarm on apnoea,
  onset-time identical bulk vs one-by-one, silence); e2e drives hypoxia and checks the bar + silence + axe.
  `tools/test-ot-sim.sh`, check, proofread green.
- M3.3 still to come (slice 2+): trainee-set limits and technical alarms (probe off, disconnection, no CO₂ detected);
  then the Log tab (slice 3). Then M4.x (`conditions.js`/`events.js` scenario engine + the crisis scenarios — the
  "diverse use cases" goal).
