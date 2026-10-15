- ot-sim build (14-15 Oct 2026, branch `claude/magical-turing-oifbz6`): building in `DESIGN.md` PR order. Merged to
  main: M0.1 #570, M0.2 #572, M1.1 #573, M1.2 #575, M1.3 #576, M1.4 #577, M2.1 #578, and M2.2-M2.6 bundled in #582
  (fluids/bleeding, vasoactive drugs, gas exchange and breathing, volatile agents, temperature).
- M2.7 (rhythms) built on this branch (restarted from main after #582 merged): the full `rhythm.js` engine (atrial/AV/
  ventricular clocks, the blocks, AF, flutter, SVT, VT, torsades, VF, asystole, PEA, bigeminy, paced, hyperkalaemia),
  cardio's output gate, the ECG morphologies and baselines in `ui/synth.js`, a rhythm picker + label on the Patient
  tab, and `test/rhythm.test.mjs`. All green under `tools/test-ot-sim.sh` locally (incl. e2e + axe). Sinus output 1, so
  M2.1-M2.6 calibration and tests are unchanged.
- Next in DESIGN.md: M2.8 resuscitation (`resus.js`: CPR → output, defibrillation, pacing capture, ROSC; adds the
  SpO2-during-arrest coupling that M2.7 lists as a known miss), then M3.x (airway, case flow, alarms) and M4.x
  (scenario drugs + crises).
