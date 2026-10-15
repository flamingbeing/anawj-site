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
- Next in DESIGN.md: M3.1 airway (`airway.js`), M3.2 case flow (`presets.js`, the elective GA), M3.3 alarms, then M4.x
  (scenario drugs + crises).
