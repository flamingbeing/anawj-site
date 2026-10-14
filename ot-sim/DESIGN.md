# OT simulator: technical plan

How the simulator will be built: the code's shape, the screens, the tests and the PR-by-PR order. Written 14 Oct 2026
(plan only, nothing built yet). Read with `PLAN.md` (the brief: milestones, guardrails, autonomy rules), `MODEL.md`
(the physiology and pharmacology, every number with its source) and `SCENARIOS.md` (the crises). Defaults chosen here
are proposals until the owner says go; the open questions are at the end, each with the default a build session uses
if there is no answer yet.

## In short (for the owner)

- One synthetic patient whose numbers all come from one model: drugs go in, effect-site levels rise, blood pressure,
  breathing, oxygen and CO2 follow, and the monitor draws what the model says. A crisis changes the model (anaphylaxis
  lowers vascular tone, narrows the airways and leaks fluid), and the trainee's drugs act on the same model, so a
  sensible but unscripted response works and a wrong one has consequences.
- Built in 7 milestones, as about 30 small PRs, each tested and merged before the next: skeleton and monitor (M0),
  drugs (M1), heart, lungs and ventilator (M2), a whole elective GA from pre-op to extubation (M3), the crisis engine
  and 12 scenarios (M4), the debrief (M5), sound and polish (M6).
- The first thing a resident can use is the end of M3 (a full elective GA). The first crisis is the first PR of M4.
- Changes from the brief: the Marsh example test is corrected (it mixed two versions of the model); waveforms are
  drawn at real pace even at 20x so they stay readable (the numbers still run 20x); links can open a scenario at a set
  moment (`?case=anaphylaxis&at=300`) so previews and PR screenshots show mid-crisis screens; sevoflurane MAC is 2.05%
  at age 40 (the US label and a 2020 meta-regression), not the older pooled 1.80%.
- Guidelines that moved since the brief: DAS published its 2025 intubation guideline (BJA 2026); the Association of
  Anaesthetists' 2024 blood components guideline replaced the 2016 one; ERC and AHA 2025 made no major change to
  adult ALS; Singapore's SRFAC 2021 gives atropine 0.6 mg up to 2.4 mg. The scenarios use these.
- What you would decide: the monitor look, the propofol model for TCI, the local airway and resuscitation algorithms,
  the drug strengths and products stocked at NUH, and the scenario order (questions at the end; the build starts with
  the defaults).

## Architecture

### Files

```
ot-sim/
  index.html              shell, styles, screen containers (no inline clinical text beyond the intro)
  js/main.js              boot: reads the URL, builds the sim and the UI, runs the frame loop
  js/model/               pure simulation: no DOM, no Date, no Math.random; importable by Node tests
    rng.js                seeded generator (sfc32) with named sub-streams
    fmath.js              exp, log, pow, sin written with + - * / only, so a run is bit-identical on every browser
    sim.js                Sim: state, fixed-step loop, action queue, log, snapshot/replay
    patient.js            patient profile -> covariates (LBM, BSA, FRC, blood volume ...) and between-patient variation
    drugs.js              drug catalogue: presentation, doses, PK model, effects, sources (data, no logic)
    pk.js                 compartment models (3-compartment + effect site), boluses, infusions, TCI controller
    pd.js                 effect models: hypnosis, analgesia (response surface), block, CV and breathing effects
    volatile.js           vaporiser, circuit (fresh gas, rebreathing), uptake to lung, blood and tissue groups
    cardio.js             lumped circulation: volumes, preload, contractility, SVR, HR, baroreflex, fluids, bleeding
    rhythm.js             atrial clock, AV node, ventricular clock: fires the beats cardio.js turns into stroke volumes
    resp.js               mechanics, ventilator modes, spontaneous breathing and its CO2 drive
    gas.js                O2/CO2/N2/agent stores in lung and blood, shunt and dead space, SaO2, EtCO2
    airway.js             airway state machine: patency, mask, SAD, ETT (and misplacement), laryngoscopy grades
    temp.js               core and peripheral temperature, heat loss, warming
    conditions.js         disease processes a crisis switches on (mediator level, hypermetabolism, pleural air ...)
    events.js             scenario runner: triggers, timed changes, expected-action matching
    monitor.js            what the monitor reports: NIBP cycle, SpO2 averaging and lag, alarm limits and priorities
  js/ui/
    loop.js               rAF loop, speed, accumulator, pause on hidden tab
    lanes.js              sweeping canvas lanes (ECG, pleth, ABP, CO2, Paw)
    synth.js              waveform synthesis from model state (beat and breath templates)
    numerics.js           numeric boxes (DOM text, updated about once a second)
    alarms.js             alarm bar, silence, aria-live text
    controls/*.js         drugs, airway, breathing, circulation, help, examine
    screens/*.js          library, pre-op, theatre, debrief
    sound.js              (M6) SpO2 tone and alarm tones, off by default
  js/scenarios/*.js       one module per scenario (data with source comments)
  test/*.test.mjs         model tests in Node (fast; run by CI on every PR)
  test/model.check.mjs    calibration table: every tuning target in MODEL.md with its value and pass/fail
  test/soak.mjs           hours of simulated time for firetop (not *.test.mjs, so CI does not run it)
  test/e2e.mjs            browser test, phone and desktop, axe
```

Scenario and drug files are JavaScript modules, not JSON, so each number can carry its source as a comment. No build
step and no dependencies (`NOTES.md`). Each module stays under about 400 lines so a PR touching it reads on a phone.

### The model loop

- `Sim` owns one plain-object `state` (numbers, short arrays, strings for discrete states) and a fixed `dt` of 0.1 s.
  `sim.step(n)` runs `n` steps; each step calls the subsystems in a fixed order: actions due this step -> PK ->
  volatile -> PD -> conditions and scenario events -> airway -> breathing mechanics -> gas exchange -> circulation ->
  temperature -> monitor -> log. Each subsystem reads the previous step's values of the others (no circular solves),
  which is stable at 0.1 s because the fastest time constants (effect-site, baroreflex, lung gas mixing) are 2 s or
  slower. Checked: 3-compartment propofol with Euler steps of 0.1 s matches steps of 0.01 s to 2 decimal places.
- **Determinism.** No `Math.random`, `Date` or frame timing in `js/model/`. Randomness comes from `rng.js`: one seed,
  and a named sub-stream per consumer (`rng.stream('airway')`), so adding a new random consumer in a later PR does not
  shift the numbers of the others and old tests stay valid. Actions are stamped with the step index they apply at.
  Speed changes only how many steps run per frame. Test: the same seed and actions give a deep-equal state whether run
  as 1-step or 200-step chunks, and a replay from `{seed, actions}` reproduces the run.
- Cross-browser: the standard leaves `Math.exp`, `Math.pow`, `Math.log` and `Math.sin` "implementation-approximated", so
  V8 and Safari may differ in the last bit and a long run could drift. `+ - * /` are exact in IEEE 754 (and engines use
  the correctly rounded hardware square root), so `fmath.js` builds exp, log, pow and sin from them (a few dozen
  operations each, tested against `Math` to 1e-12 relative). The model uses only `fmath`; a replay or a shared run link
  then gives the same numbers on any browser. If profiling ever shows a cost, fall back to `Math` and accept "close"
  replays.
- **Snapshots.** `sim.snapshot()` is a structured clone of `state` plus the RNG positions. Uses: the debrief's
  "rewind to here and try again" (M5), the `?at=` deep links, and tests that start from "anaesthetised and intubated".
- **Cost.** 20x is 200 steps a second; a step is a few thousand arithmetic operations (two 20-iteration bisections,
  about a dozen drug models, four agents in three tissue groups, gas stores), so even a slow phone spends well under
  1 ms a frame on it, and a 30-minute fast-forward (18,000 steps) takes a fraction of a second. Rendering is the budget,
  not the model.

### Speed and the waveforms

- Speeds: pause, 1x, 5x, 20x (brief), plus "skip to next event" in the case flow (M3) that runs the model as fast as it
  can until something needs the trainee (with a cap of, say, 30 simulated minutes).
- Numerics, trends, alarms and the clock run in simulated time at every speed.
- **At 1x the monitor draws the model's own beats and breaths**: `rhythm.js` emits each beat (time, kind, stroke
  volume, conduction) and the ventilator each breath, and `synth.js` turns them into ECG, arterial, pleth and capnogram
  samples, so an ectopic, a dropped beat or a pulse deficit appears exactly when the model has it.
- **At 5x and 20x the waveforms are drawn at real pace from the current state**, not replayed fast: a heart rate of 70
  at 20x would be 23 beats a second across the screen, a blur that teaches nothing. `synth.js` then runs its own beat
  and breath clocks in wall-clock time from the current rhythm, rate, pressures and ventilator settings (rhythm
  details like the exact beat a PVC falls on are not kept). The lane label shows "20x" so nobody reads the sweep as
  real. The model never reads the synthesiser.
- The tab pauses itself when hidden (`visibilitychange`), so a scenario does not run on unseen; a frame catches up at
  most 50 steps (5 s simulated) so a stalled phone does not lurch.

### What the UI reads

The UI reads `sim.state` (read-only by convention) and `sim.log`, and writes only through `sim.act(action)`. Actions
are plain objects (`{type:'bolus', drug:'propofol', mg:140}`, `{type:'vent', mode:'VC', vt:450, rr:12, peep:5}`,
`{type:'airway', do:'insertETT', size:7.5}`), so the same shapes drive the UI, the scenario tests and replays.

### URL and deep links

- `#library`, `#preop`, `#theatre`, `#debrief` select the screen (the page editor and the PR screenshots can reach
  each).
- `?case=<scenario id>` opens that scenario; `?seed=<n>` fixes the patient; `?at=<seconds>` fast-forwards with the
  scenario's "reference actions" (the correct-treatment course its test uses) to that time and pauses, so
  `/ot-sim/?case=anaphylaxis&at=300#theatre` is the same screen every time. Used in PR bodies as `Screens:` lines
  (the screenshot tool waits 1.5 s after load, enough for a fast-forward of 30 simulated minutes).
- `?demo` is not needed (no data, no sign-in).

## Screens

Phone first (390 px portrait), then desktop (1280 px), tablet landscape works. Always dark (monitor convention, as
`bis-dsa`). Top band: the four NUHS quarters (`AGENTS.md`). Fonts: copy `bis-dsa/fonts/` (Arimo, Archivo Narrow), no
font requests.

1. **Library** (`#library`): "Free run" (a healthy adult, you do everything), "Elective GA" (guided case, M3), then the
   scenario cards (title, one line, level, about how long). The teaching-only line is on this screen and in the footer.
2. **Pre-op** (`#preop`): the synthetic patient (age, sex, weight, height, ASA, airway assessment, history, drugs,
   allergies, fasting, plan), and the theatre checklist (sign-in items paraphrased, ticked by the trainee; nothing is
   enforced, but the debrief notes what was skipped).
3. **Theatre** (`#theatre`):
   - Phone: a top bar (simulated clock, speed keys, alarm silence, menu) above the monitor (about 55% of the screen):
     ECG II, pleth, capnogram, and ABP or Paw when present, each lane with its numeric at the right; a numeric row
     under the lanes (NIBP with its age, temperature, FiO2/EtO2, agent Fi/Et/MAC, Paw/PEEP/Vt, TOF, and a BIS-like
     index if the scenario has processed EEG). Alarm bar across the top of the monitor. Under it, a tab bar for the
     controls: **Drugs**, **Airway**, **Breathing** (O2, ventilator, vaporiser), **Circulation** (fluids, blood, NIBP
     cycle, lines), **Help** (call for help, tell the surgeon, get the trolley or kit), **Examine** (chest, skin,
     pupils, movement, breath sounds as text), **Log**. Buttons at least 44 px.
   - Desktop: monitor on the left two thirds, controls on the right, log under the controls.
   - Drugs: one row per drug with the usual doses for this patient's weight already worked out (labelled with the
     ISO 26825 syringe-label colours by class, as on real syringes), a custom dose, infusions (mg/kg/h or mcg/kg/min),
     and TCI (target, model) for propofol and remifentanil. The dose box says "for this synthetic patient".
   - "Behind the monitor" (a panel in the menu, closed by default): plasma and effect-site levels, MAC, cardiac output,
     SVR, stroke volume, PaO2, shunt, the response-surface probabilities. This is where the teaching of mechanism
     happens; the monitor itself shows only what a real one would.
4. **Debrief** (`#debrief`, M5): timeline, expected actions met or missed with their times, teaching points with
   sources, "rewind to here".

Accessibility: numerics are DOM text (screen readers can read them), canvases are `aria-hidden` with a text summary;
the alarm bar is an `aria-live` region updated only when the message changes (assertive for high priority, polite
otherwise); colour is never the only signal (priority words and shapes); `prefers-reduced-motion` stops flashing (solid
colour instead) and keeps sweeps (a monitor without moving traces would mislead) but at a lower frame rate.

## Monitor and alarms (summary; numbers in MODEL.md)

- Numerics update about once a second with monitor-like averaging (SpO2 over a few seconds, HR over a few beats,
  EtCO2 per breath), computed in `monitor.js` in simulated time, so alarm timing is the same at every speed and tests
  can assert it.
- NIBP: off, manual, or cycles of 1, 2.5, 3, 5 min; a measurement takes about 30 s and shows the time since; it fails
  ("NIBP --") in severe hypotension or arrhythmia, as real ones do.
- Alarms: limits per parameter with defaults, three priorities with the IEC 60601-1-8 conventions (colour and flash),
  2-minute silence, technical alarms (probe off, disconnection, no CO2 detected), and a text message for each.

## Testing

- **Model tests** (`test/*.test.mjs`, Node, run in CI's unit job, which has a 10-minute limit shared with every other
  app: keep ours under 60 s in total): determinism; each drug model against its published numbers; physiology
  calibration (apnoea times, haemorrhage classes, ventilator pressures); each scenario's three courses (untreated,
  correct, wrong). Seeds fixed in tests.
- **Calibration table** (`test/model.check.mjs`, like `bis-dsa/test/engine.check.mjs`): prints every tuning target from
  `MODEL.md` with the value reached and pass/fail; also a `*.test.mjs` wrapper asserts the table passes, so CI catches
  drift.
- **Browser test** (`test/e2e.mjs`, grows each PR): loads at 390 and 1280 px (3x density on the phone, the
  `bis-dsa` canvas lesson), axe on every screen and every control tab, no horizontal scroll, no console errors, no
  network requests outside the folder, speed keys, an induction by clicks with the numbers moving the right way, a deep
  link, the alarm bar's text.
- **Soak** (`test/soak.mjs`, firetop or a long local run): 8 simulated hours of maintenance at 20x per scenario seed,
  checking no NaN, no negative volumes, values inside physiological bounds, memory flat.
- `tools/test-ot-sim.sh` already runs the repo check, the route test, the model tests and the browser test.

## PR order

Each PR: branch from latest `main`, title "OT sim: ...", `tools/test-ot-sim.sh` green, phone and desktop screenshots,
"Needs clinical read-through" list for new numbers, `NOTES.md` and `STATUS.md` updated, merged by the session (PLAN.md).
Sizes are rough (lines of new code and data, tests included).

| # | PR | What it adds | Tests |
|---|---|---|---|
| M0.1 | Model loop | `rng.js`, `fmath.js`, `sim.js`, `patient.js` (covariates), a placeholder patient with steady vitals plus small seeded noise | Determinism (1x vs 200-step chunks, replay), `fmath` against `Math` to 1e-12, covariates (James LBM, BSA) against worked examples |
| M0.2 | First monitor | Theatre screen shell, `loop.js`, `lanes.js`, `synth.js` (sinus ECG, pleth, capnogram), numerics, speed keys | e2e: lanes draw, numerics present, speed keys, axe, 3x density |
| M1.1 | IV PK engine | `pk.js` (3-compartment + ke0, bolus, infusion), `drugs.js` with propofol (Marsh, Schnider), remifentanil (Minto), fentanyl | Published values per model (MODEL.md table) |
| M1.2 | TCI | Effect-site and plasma TCI controller (Shafer-Gregg style) for propofol and remifentanil | Target reached within published time, no overshoot beyond limits |
| M1.3 | Neuromuscular block | Rocuronium, suxamethonium, sugammadex, neostigmine; TOF count, TOFR, PTC | Onset and duration targets; sugammadex reversal times |
| M1.4 | Volatile uptake | Vaporiser, circuit, FGF, uptake groups, age-adjusted MAC, sevoflurane, desflurane, isoflurane, N2O | FA/FI curves against human data; MAC by age |
| M1.5 | Hypnosis and analgesia | `pd.js`: hypnotic effect (propofol plus volatile), BIS-like index, the reduced-Greco stimulus surface, movement and autonomic response | Loss of response C50 by age (Schnider 1999); P_TOL 0.9 pairs (van den Berg 2021); MAC-awake 0.34 |
| M1.6 | Drug controls | Drugs tab: boluses, infusions, TCI, vaporiser dial and FGF on the Breathing tab; "Behind the monitor" panel | e2e: give propofol, Ce rises, index falls |
| M2.1 | Circulation | `cardio.js`: compartments, venous return, per-beat SV (ventricular-arterial coupling), baroreflex; `rhythm.js` with sinus rhythm only; anaesthetic effects on SVR, venous tone, Ees and sympathetic tone | Steady state hits the MODEL.md defaults; propofol induction SBP fall in range (Rolly 1985, Sjøen 2026); baroreflex sensitivity about 19 ms/mmHg awake |
| M2.2 | Fluids and bleeding | Crystalloid and colloid kinetics, blood, Hb dilution, haemorrhage classes, PPV | Haemorrhage class table; fluid bolus response; PPV with hypovolaemia |
| M2.3 | Vasoactive drugs | Phenylephrine, ephedrine, metaraminol, noradrenaline, adrenaline, atropine, glycopyrrolate, esmolol (receptor-effect model) | Bolus effect size and duration per drug |
| M2.4 | Gas exchange | `gas.js`: lung and blood O2/CO2 stores, shunt, dead space, Severinghaus, SpO2 lag, EtCO2 | Apnoea desaturation times (healthy, obese, air), CO2 rise in apnoea, pre-oxygenation curve |
| M2.5 | Ventilator and breathing | `resp.js`: compliance, resistance, VC, PC, PS/spontaneous, manual bag; CO2-driven spontaneous breathing and its depression by drugs | Pressures from formulas; apnoea after induction and return of breathing |
| M2.6 | Temperature | `temp.js`: redistribution, heat loss, warming | Core temperature curve for the first 3 h |
| M2.7 | Rhythms | The rest of `rhythm.js` (AV blocks, AF, flutter, SVT, VT, torsades, VF, asystole, PEA, ectopics, pacing, hyperkalaemia stages) and their ECG templates; the circulation's response to each | e2e: each rhythm draws; model: VF gives no output and arterial pressure decays with τ about 3 s |
| M3.1 | Airway | `airway.js`: obstruction under sedation, adjuncts, mask ventilation quality, SAD, laryngoscopy (Cormack-Lehane from the airway assessment plus a seeded draw), bougie, videolaryngoscope, ETT (oesophageal, endobronchial), cuff | Seeded grade distribution; oesophageal ETT shows no CO2 after the first breaths |
| M3.2 | Case flow | Library, pre-op, checklist, the elective GA from pre-oxygenation to extubation, surgical stimulus timeline | Whole case runs untouched by a scripted trainee in a test; e2e flow |
| M3.3 | Alarms and log | `monitor.js` limits, priorities, silence, technical alarms; event log | Alarm onset times in simulated time at 1x and 20x identical |
| M4.1 | Crisis engine + scenario 1 | `conditions.js`, `events.js`, scenario format, expected-action matching; hypotension after induction | Three courses for scenario 1 |
| M4.2-M4.7 | Scenarios 2-12, two per PR | In the `PLAN.md` order unless the owner reorders | Three courses each |
| M5.1 | Debrief | Timeline, actions vs expected, time to treatment, teaching points with sources | e2e: debrief after scenario 1 |
| M5.2 | Hints and replay | Hint ladder (off by default), rewind to a snapshot, replay a run from seed and actions, share a run as a link | Replay equality |
| M6.1 | Sound | SpO2 tone, alarm tones (off by default) | e2e: no audio until turned on |
| M6.2 | Performance and access | Frame budget on a mid-range phone at 20x, reduced motion, full axe pass, keyboard use | e2e timing budget |
| M6.3 | Finish | Library cards polished, page editor compatibility (`edit/NOTES.md`), offline copy only if the owner asks | Proof-read, editor test |

Order inside a milestone can change if a later PR needs an earlier hook; a PR may land a small stub of a later
subsystem (for example a fixed cardiac output for M2.4 if M2.1 slipped) as long as the stub is marked in `NOTES.md`.

## Risks and how the plan handles them

- **Clinical accuracy.** Every number has a source in `MODEL.md`; each PR lists new numbers for the owner; the page says
  teaching only and never "reviewed" until the owner has read it.
- **Scope.** A full physiology engine can grow without end. The model is lumped (one heart, two lungs' worth of
  stores, a few tissue groups) and each subsystem has calibration targets: when they pass, stop.
- **Coupling.** Subsystems talk only through named state fields listed in `MODEL.md` (`cardio.co`, `gas.paCO2`...), so
  each PR can be tested alone.
- **Phone performance.** Incremental canvas drawing (only the new strip each frame, like a real sweep), DPR capped at
  2, numerics updated once a second, no layout work per frame.
- **Cross-browser replay.** Exact on every browser through `fmath.js` (above); tests compare golden runs exactly.
- **Two sessions at once.** One session per milestone; others plan only (`AGENTS.md`).

## Questions for the owner (with the default used until answered)

1. **Monitor look.** Which monitor is in NUH theatres (Philips IntelliVue, GE Carescape, Mindray, Dräger)? Default: a
   generic layout in the common conventions (Philips-like colours on black), no brand. A photo would let it match, as
   the BIS page did.
2. **Propofol model for TCI.** Which do NUH pumps run: Marsh (ke0 1.2/min, or 0.26), Schnider, or Eleveld? Default:
   the patient runs Schnider; the pump defaults to Schnider effect-site, with Marsh as options; "Behind the monitor"
   shows the pump's prediction beside the patient's true level.
3. **Airway algorithm.** DAS 2025 (published in BJA 2026), the Vortex, ANZCA PG61, or a local NUH one? Default: DAS
   2025, with the Vortex and ANZCA as other cognitive aids in the teaching points.
4. **Resuscitation.** SRFAC 2021 (atropine 0.6 mg to 2.4 mg), ERC or AHA? Default: SRFAC with the theatre changes
   from ERC/RCUK 2025 and NAP7. Open point: the SRFAC 2021 figure for when the first adrenaline goes in VF (after the
   2nd or 3rd shock); configurable until checked.
5. **Drugs at NUH.** Strengths and syringes (phenylephrine, ephedrine, noradrenaline, adrenaline); is metaraminol
   stocked; which dantrolene product (Dantrium 20 mg vials assumed); the massive haemorrhage pack contents. Default:
   common dilutions, labelled as such.
6. **Sevoflurane MAC.** 2.05% at age 40 (US label; Cooter 2020) or 1.80% (Mapleson's pooled value, closer to the lower
   Japanese figures)? Default 2.05%.
7. **Fentanyl effect-site speed.** ke0 0.147/min (time to peak 3.2 min) or 0.12 (closer to the published 3.6 min)?
   Default 0.147, flagged.
8. **Scenario order.** Default: the `PLAN.md` order.
9. **Scores.** None by default (teach, don't test): the debrief shows what was done and when, not a mark. Keep?
10. **Processed EEG.** Show a BIS-like number on the monitor in TIVA scenarios (from the hypnotic model, not the
    `bis-dsa` EEG engine)? Default: yes, as an optional module the scenario turns on.
