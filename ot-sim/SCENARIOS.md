# OT simulator: crisis scenarios

The 12 scenarios from `PLAN.md` (M4), in build order, each with the physiology the model must produce, the expected
actions and their debrief windows, the wrong actions worth modelling, and the teaching points with sources. Written
14 Oct 2026 as part of the plan; nothing is built yet. The full research, with every dose's source, the licence of
each guideline and the 22 points where guidelines differ, is `research/crises.md`.

**Rules for this file and the scenario modules.** Teaching only, for a synthetic patient. Wording is our own: the
guidelines are cited and linked, never copied (the QRH is CC BY-NC-SA, the Stanford Emergency Manual and the Vortex
CC BY-NC-ND, the ANZAAG cards all rights reserved). Doses here are the defaults for a 70 kg synthetic adult; the owner
checks them for NUH practice before any scenario is called reviewed. **Debrief windows are our teaching suggestions,
not guideline times**, except where a source is named.

**Singapore defaults** (proposed; owner to confirm, `DESIGN.md` questions): resuscitation by SRFAC 2021 (atropine 0.6 mg
boluses to 2.4 mg), with the theatre changes from ERC/RCUK 2025 and NAP7 (compressions when SBP stays under 50 mmHg;
small adrenaline doses with an arterial line); airway by DAS 2025; anaphylaxis by the ANZAAG–ANZCA 2022 graded ladder
with cefazolin among the culprits; bleeding by the Association of Anaesthetists 2024 blood components guideline;
malignant hyperthermia 2.5 mg/kg dantrolene then 1 mg/kg every 5 min to the QRH end points (Dantrium 20 mg vials
assumed); local anaesthetic toxicity by the QRH 2023 lipid regimen; needle decompression 4th/5th intercostal space
just anterior to the mid-axillary line (ATLS 10).

## Scenario module format

One file per scenario in `js/scenarios/`, a plain object (numbers carry source comments):

```js
export default {
  id: 'anaphylaxis', title: 'Anaphylaxis after the antibiotic', level: 'core', minutes: 20,
  patient: { age: 45, sex: 'F', weightKg: 62, heightCm: 158, asa: 2, airway: { mallampati: 2 },
             history: ['hypertension on amlodipine'], fixed: { sensHyp: 1.0 } },
  start: 'intubated-maintenance',          // a preset snapshot: 'awake', 'preoxygenated', 'intubated-maintenance', 'emergence'
  steps: [                                 // what happens to the patient, in model terms (MODEL.md section 11)
    { id: 'trigger', when: { action: 'give', drug: 'cefazolin' } },
    { id: 'onset', after: 'trigger', delay: 90, cond: 'anaphylaxis', set: { level: 0.8, rise: 120 } },
  ],
  expected: [                              // what a trainee should do, with debrief windows from a reference point
    { id: 'adrenaline', match: { give: 'adrenaline', route: 'iv', mcg: [10, 200] }, from: 'recognisable', within: 180,
      why: 'Small titrated IV adrenaline boluses are the treatment (ANZAAG 2022; QRH 3-1).' },
  ],
  wrong: [ { match: { give: 'adrenaline', route: 'iv', mcg: [500, Infinity] }, note: '1 mg IV is the arrest dose ...' } ],
  reference: [ /* the correct-treatment action list the tests and ?at= deep links replay */ ],
  teaching: [ { text: '...', source: 'NAP6 (RCoA 2018)', url: 'https://doi.org/10.1016/j.bja.2018.04.015' } ],
  simplified: [ 'Skin signs are text in Examine, not drawn.' ],
};
```

- `from: 'recognisable'` is the moment a competent trainee could notice (the scenario defines it per condition: first
  alarm, first numeric past a limit). Windows run from there, not from the hidden onset.
- Matching is generous (dose ranges, any route listed) and order-free unless `after` is given; the debrief shows what
  was done, when, and what was expected, never a score (`NOTES.md`: teach, don't test).
- Each scenario ships with a model test running three courses: **untreated** (the physiology runs its course: the
  scenario states the expected end, such as PEA by about 12 min), **correct** (`reference` actions: stabilises by a
  stated time), **wrong** (one listed wrong action: the stated consequence happens).

## 1. Hypotension after induction

- **Patient:** 78-year-old, 60 kg, hypertensive on an ACE inhibitor, mildly dry (fasting, bowel prep): blood volume
  −10%, baroreflex gain low. **Start:** awake, pre-oxygenated.
- **Model:** the trainee's own induction drives it: propofol's slower haemodynamic effect site (t½ke0 about 9–10 min
  at this age, MODEL.md section 5) brings the trough 3–6 min after induction, deeper with hypovolaemia; laryngoscopy
  gives a transient rise, then a second trough during prep and draping (5–15 min). ACE-inhibitor vasoplegia: the
  response to phenylephrine and ephedrine is halved; vasopressin works [V Stanford; D size]. An arterial line shows it
  at once; without one, the NIBP cycle delays recognition (pleth amplitude and EtCO2 fall first).
- **Expected:** NIBP cycling every 1–2 min around induction; recognise within one cycle; reduce the anaesthetic
  without going light; leg raise; fluid 250 mL boluses; phenylephrine 50–100 mcg when HR is normal or high, ephedrine
  3–6 mg when low; noradrenaline 5–10 mcg or an infusion if repeated; vasopressin 0.5–1 unit if refractory; call for help
  after 2–3 doses without response. MAP ≥ 65 (or within 20% of baseline) within about 5 min. Show cumulative minutes
  with MAP under 65 in the debrief [D].
- **Wrong:** phenylephrine repeated in bradycardia (CO falls); ephedrine past tachyphylaxis; anaesthetic off (awareness
  signs); NIBP left at 5 min; a "young adult" induction dose.
- **Teaching:** harm scales with depth × duration (POQI-3, Sessler 2019); match the pressor to the heart rate;
  hypotension is often a sign of something else (QRH 2-4 checklist); titrate induction to age and volume; ACE-inhibitor
  vasoplegia may need vasopressin. Sources: QRH 2-4; Stanford #16; Südfeld 2017.

## 2. Laryngospasm

- **Patient:** 30-year-old, smoker with a recent cold, LMA for a short case. **Start:** emergence. A variant with a
  6-year-old comes later (children's parameters are not in the first model).
- **Model:** `laryngospasm` condition triggered by stimulation (suction, device removal) while the hypnotic effect is
  between "asleep" and "awake" [D]; partial (stridor text, small ragged capnogram, low Vt) or complete (no capnogram,
  no bag movement, chest efforts); SpO2 falls after about 1–3 min in a pre-oxygenated adult [U]; tachycardia then
  hypoxic bradycardia; negative-pressure pulmonary oedema (shunt up, pink froth in Examine) in a minority after
  relief [V Visvanathan 2005, 4%].
- **Expected:** call for help, stop the stimulus, suction under vision; jaw thrust with Larson's manoeuvre and CPAP
  with 100% O2 within about 10–15 s; propofol 0.5–1 mg/kg (QRH 0.25–0.5) within about 30 s if not resolving or SpO2
  under 90%; suxamethonium 0.5 mg/kg IV (1–2 mg/kg to intubate; 4 mg/kg IM without IV access) within about 60 s if
  SpO2 keeps falling or at once with bradycardia; intubate if it recurs; watch for NPPE.
- **Wrong:** vigorous positive pressure (gastric distension, worse seal); extubating or suctioning in a light plane;
  more propofol in a hypoxic, bradycardic patient instead of suxamethonium; mistaking silent complete spasm for apnoea.
- **Teaching:** extubate deep or fully awake; the ladder CPAP → propofol → suxamethonium; a tracheal tube excludes
  laryngospasm; bradycardia means hypoxia; look for NPPE. Sources: QRH 3-6; Hampson-Evans 2008; Larson 1998.

## 3. Anaphylaxis

- **Patient:** 45-year-old woman, 62 kg, on a β-blocker in the harder variant. **Start:** intubated, maintenance;
  cefazolin given at the scenario's start (or rocuronium in a variant).
- **Model:** `anaphylaxis` mediator level rising over 1–3 min after the trigger: SVR and venous tone fall, capillary
  leak removes plasma over 10–30 min, bronchospasm in some (resistance up: Ppeak up, upsloping capnogram), HR up (down
  when β-blocked or severe), EtCO2 falls with cardiac output, SpO2 later; skin signs often absent (Examine says
  so). First features in NAP6: hypotension 46%, bronchospasm 18%, tachycardia 10%; every patient became hypotensive
  [V]. Adrenaline acts on receptors and lowers mediator release; glucagon counters β-blockade.
- **Expected:** call for help, stop surgery, remove the trigger; 100% O2; IV adrenaline: moderate 10–20 mcg then 50,
  life-threatening 50–100 mcg then 200, every 1–2 min (ANZAAG 2022; QRH: 50 mcg repeated) with the first dose within
  2–3 min of unexplained hypotension or bronchospasm; infusion after 3 boluses (3 mg in 50 mL, 3–40 mL/h) by about
  10 min; crystalloid 1000 mL then 20 mL/kg repeats; compressions as soon as SBP stays under 50; refractory:
  noradrenaline 3–40 mcg/min and/or vasopressin 1–2 units, glucagon 1–2 mg every 5 min if β-blocked; tryptase at once,
  1–2 h and after 24 h; allergy label and referral.
- **Wrong:** treating it as post-induction hypotension with repeated phenylephrine; no or late adrenaline; 1 mg IV
  with a circulation (hypertension, arrhythmia); antihistamine or steroid first; leaving the culprit running; no
  compressions at SBP under 50.
- **Teaching:** unexplained hypotension or bronchospasm under anaesthesia is anaphylaxis until proven otherwise; small
  titrated IV adrenaline, infusion early; CPR at SBP under 50; large fluid volumes; three tryptase samples and
  referral. Sources: ANZAAG–ANZCA 2022; QRH 3-1 v5; NAP6 (Harper 2018); Garvey 2019; NAP7 (Cook 2024).

## 4. Can't intubate, can't oxygenate

- **Patient:** 52-year-old, BMI 34, Mallampati 3, limited neck movement (hidden truth: Cormack-Lehane 4 by direct and
  3b by video laryngoscopy, mask ventilation difficult, SAD seal poor). **Start:** awake; the trainee induces.
- **Model:** apnoea physiology (MODEL.md section 8: obese, so 3–4 min to 90% even pre-oxygenated); no capnogram is the
  first sign; SpO2 lag 20–60 s; tachycardia, then hypoxic bradycardia, hypotension, PEA. DAS 2025 scenarios give the
  shape: SpO2 94 → 88 → 70 → 60% over failed plans A–C with HR to about 120, then about 50 and BP 70/30; after
  front-of-neck access a square capnogram (about 52 mmHg) and recovery [V].
- **Expected:** call for help by the first failed attempt; plan A at most 3 + 1 laryngoscopy attempts, videolaryngoscope
  first, nasal O2 throughout, declare "failed intubation"; plan B SAD (up to 3 attempts) within about 60 s; plan C
  two-person facemask; declare CICO as soon as B and C fail with SpO2 falling (not waiting for bradycardia); give full
  neuromuscular block; scalpel–bougie–tube (size 10 blade, bougie, cuffed 6.0 tube) with skin incision within about
  30–60 s of the declaration and capnography confirmed within 60–90 s of incision (DAS 2025; QRH 3-3).
- **Wrong:** "one more go"; skipping the SAD; waking on suxamethonium expecting rescue (desaturation comes first,
  Benumof 1997); letting the block wear off; cannula technique with a high-pressure source and no exit; no
  capnography after FONA; watching SpO2 while the capnogram is flat.
- **Teaching:** no trace = wrong place; limit attempts and declare each failure aloud; prime for front-of-neck access
  early; one practised technique; human factors (NAP4). Vortex and ANZCA PG61(A) as other cognitive aids. Sources: DAS
  2025 (Ahmad 2026, doi 10.1016/j.bja.2025.10.006); DAS 2015; QRH 3-3; NAP4.

## 5. Massive haemorrhage

- **Patient:** 60-year-old, 75 kg, open abdominal surgery. **Start:** intubated, maintenance; a vessel injury at
  minute 2: bleeding 150–300 mL/min, controllable by the surgeon when asked [D].
- **Model:** `haemorrhage` bleed rate (MODEL.md section 5): HR up, pulse pressure narrower, PPV up, pleth smaller,
  EtCO2 falls, hypotension earlier under GA; Hb lags until dilution; lactate and base deficit rise; ionised calcium falls
  with rapid citrate (blood products) [D]; potassium rises with stored blood [D]; temperature falls with cold fluids
  (MODEL.md section 10). Coagulation is a simple timeline (fibrinogen first to fall) [D], not a model.
- **Expected:** call for help; tell the surgeon (pressure, packing); activate the major haemorrhage protocol within
  about 5 min; tranexamic acid 1 g within 10 min of activation; first blood within 10–15 min; RBC:FFP about 1:1 in
  trauma (1:1–1:1.5 otherwise); targets Hb 70–90 g/L, fibrinogen > 1.5 g/L, platelets > 50 (> 100 in trauma or head
  injury), ionised calcium > 1.0 mmol/L (10 mL 10% calcium chloride); warm everything; cell salvage; blood gas every
  30 min or every 4 units; limit crystalloid.
- **Wrong:** crystalloid only or red cells only; late protocol or TXA; no calcium; cold blood; vasopressors in an empty
  patient; not talking to the surgeon.
- **Teaching:** recognise from trends (HR, PPV, EtCO2) and declare; haemostatic resuscitation; the lethal triad (cold,
  acid, coagulopathy, plus low calcium); surgical control is definitive; one person talks to the blood bank. Sources:
  Association of Anaesthetists blood components 2024 (Shah 2025, CC BY); European trauma guideline 2023; CRASH-2; QRH
  3-2 (older targets, noted).

## 6. Bronchospasm (and one-lung hypoxaemia, later)

- **Patient:** 35-year-old asthmatic, intubated in a light plane. **Start:** just intubated.
- **Model:** `bronchospasm` resistance rising over 1–2 min: in volume control Ppeak rises more than Pplat; in pressure
  control Vt falls; expiratory flow does not finish (auto-PEEP), which lowers venous return and BP (a brief
  disconnection restores BP); shark-fin capnogram, wider PaCO2–EtCO2 gap, a near-flat trace when severe; SpO2 falls
  over minutes. Volatile agents, salbutamol, adrenaline, magnesium and ketamine lower resistance [D sizes].
- **Expected:** 100% O2; systematic check including hand ventilation and isolating the equipment within about 60 s
  (suction catheter down the tube, check tube position, exclude anaphylaxis and pneumothorax); deepen (sevoflurane up,
  or propofol); salbutamol (MDI 4–12 puffs into the circuit, or 5 mg nebulised; IV 250 mcg then 5–20 mcg/min per QRH)
  within 2–3 min; adrenaline 10–100 mcg IV once SpO2 is under 90% or BP falls; magnesium 2 g over 20 min; ketamine;
  ventilate for exhalation (low RR, I:E 1:3–1:4, accept high CO2).
- **Wrong:** raising RR or Vt to clear CO2 (more trapping, hypotension, arrest); more relaxant for "fighting the
  ventilator"; nebulising upstream of the filter; missing a kinked or bronchial tube; fluids instead of disconnecting.
- **Teaching:** exclude mechanical causes first; volatiles bronchodilate; ventilate for exhalation; escalate in steps; a
  silent chest or flat capnogram is severe. One-lung hypoxaemia (FiO2 1, check the tube with a scope, recruit, CPAP to
  the other lung, two-lung ventilation if severe) is a later variant. Sources: QRH 3-4, 2-2, 2-3; Stanford #6, #17;
  Woods & Sladen 2009; Shum 2023.

## 7. Malignant hyperthermia

- **Patient:** 22-year-old, 70 kg, sevoflurane maintenance, suxamethonium at induction in a variant (masseter spasm).
  **Start:** intubated, 20 min into maintenance.
- **Model:** `mh` hypermetabolism level rising over 10–20 min: VO2 and VCO2 ×2–5 [U], so EtCO2 rises despite more
  ventilation (first sign), tachycardia, soda lime exhausts; rigidity; respiratory then metabolic acidosis; potassium
  rises (peaked T, VT/VF late); core temperature 1–2 °C every 5 min when fulminant, which can be among the first three
  signs (63.5% in the registry, Larach 2010) [V]. Dantrolene switches the process off over minutes; recrudescence in
  about 20% (a later variant).
- **Expected:** suspect within 5–10 min of an EtCO2 rise that ignores more ventilation; call for help and the MH kit;
  vaporiser off and removed, 100% O2 at ≥ 10 L/min, hyperventilate 2–3× within 1–2 min (do not change the machine
  first); TIVA; dantrolene 2.5 mg/kg (Dantrium 20 mg vials with 60 mL water each: 9 vials for 70 kg, several people
  mixing) with the first dose within 10–15 min, then 1 mg/kg every 5 min until EtCO2 < 45 mmHg and temperature
  < 38.5 °C; cool; treat potassium (calcium, insulin 10 units with 50 mL 50% glucose, bicarbonate); avoid calcium
  channel blockers; ICU.
- **Wrong:** calling it light anaesthesia and turning the volatile up; changing the machine before dantrolene; one small
  dose; reconstituting in saline; no hyperventilation; verapamil or diltiazem.
- **Teaching:** rising EtCO2 plus tachycardia without another cause is MH until proven otherwise; dantrolene is the only
  specific treatment, know your product and assign mixers; remove triggers and hyperventilate; treat potassium;
  follow-up and family testing. Each 30 min of delay raised complications 1.6-fold (Larach 2010). Sources: Hopkins 2021
  (Association of Anaesthetists MH 2020); QRH 3-8; MHAUS; Glahn 2020 (dantrolene availability); Larach 1994 grading
  scale (point values to be checked before any score is shown).

## 8. Local anaesthetic systemic toxicity

- **Patient:** 68-year-old, 55 kg, sedated for a regional block (bupivacaine at or above the maximum dose, or an
  intravascular injection). **Start:** sedation, block being performed.
- **Model:** local anaesthetic PK (MODEL.md section 2) with the site's absorption or a direct intravascular dose; CNS
  signs by concentration (perioral numbness, tinnitus, agitation in Examine; then seizures with acidosis); cardiac
  effects (early hypertension and tachycardia if adrenaline-containing, then bradycardia, QRS widening, ectopy, VT/VF,
  hypotension, asystole); under GA or deep sedation the cardiac signs may come first; about 40% present atypically or
  late (Di Gregorio 2010) [V]. Lipid raises clearance and adds a sink; acidosis and hypoxia worsen toxicity.
- **Expected:** stop injecting (and any infusion); call for help and the lipid kit within about 30 s; 100% O2, airway,
  avoid hypercapnia; seizures: midazolam 2–4 mg (small propofol doses only if stable); lipid 20% 1.5 mL/kg over 2–3 min
  (about 80 mL here) within about 2–3 min of serious toxicity, then 15 mL/kg/h; repeat bolus at 5 and 10 min or double
  the infusion; maximum 12 mL/kg (QRH 3-10; ASRA 2020 gives the fixed 100 mL equivalent above 70 kg); in arrest,
  adrenaline ≤ 1 mcg/kg, no vasopressin, no lidocaine, prolonged CPR, call for ECMO.
- **Wrong:** standard 1 mg adrenaline; vasopressin; lidocaine for VT; β-blocker or calcium channel blocker; propofol as
  the "lipid"; a large propofol dose for seizures in an unstable patient; lipid only after arrest; over 12 mL/kg.
- **Teaching:** suspect it with any CNS or cardiac change after local anaesthetic, including late and under GA; oxygen
  and ventilation first; lipid early, by weight; the changed arrest drugs; prevention (dose limits, aspiration,
  incremental injection, ultrasound). Sources: QRH 3-10 (2023); ASRA checklist 2020 (Neal 2021); Neal 2018 advisory;
  El-Boghdadly 2018 (maximum doses).

## 9. Tension pneumothorax

- **Patient:** 55-year-old with COPD after a right subclavian line, volume-controlled ventilation. **Start:**
  intubated, maintenance.
- **Model:** `pneumothorax` pleural air growing faster with positive pressure: Ppeak and Pplat both rise (compliance
  falls; in pressure control Vt falls); shunt rises (SpO2 falls); venous return falls (HR up, BP down, CVP up, PPV
  bigger), EtCO2 falls with output; Examine: absent breath sounds and chest movement on one side, hyper-resonance,
  distended neck veins (may be absent if hypovolaemic), surgical emphysema; tracheal deviation late; PEA at the end.
  Decompression lets the air out; a drain stops it re-accumulating [D].
- **Expected:** 100% O2, call for help, hand-ventilate to feel the pressure; quick exclusions (tube depth and breath
  sounds for endobronchial placement, suction catheter for a blocked tube, brief disconnection for auto-PEEP); if
  unstable, decompress without waiting for imaging within 1–2 min of suspicion: 4th/5th intercostal space just anterior
  to the mid-axillary line (needle 14–16 G, or finger thoracostomy in a ventilated adult [U]); chest drain within about
  10–15 min; lower Vt and PEEP; stop N2O.
- **Wrong:** waiting for a chest X-ray; treating it as bronchospasm or with pressors only; raising PEEP or Vt; the wrong
  side; a needle at the 2nd space too medial or too short; no drain.
- **Teaching:** rising airway pressure with hypoxaemia and hypotension under positive pressure is tension pneumothorax
  until shown otherwise; a clinical diagnosis; know both sites and their trade-offs; the needle is a bridge to a drain.
  Sources: ATLS 10th ed. (site change; not open); Stanford #22; WJES 2025 meta-analysis.

## 10. Bradycardia and cardiac arrest

- **Patients and starts:** (a) laparoscopy, insufflation causes vagal bradycardia to asystole (the stimulus must stop);
  (b) VF during maintenance (an ischaemic patient); (c) PEA from a cause (bleeding or hypoxia) chosen by the seed.
- **Model:** vagal bradycardia is abrupt and settles 30–60 s after the stimulus stops [U]; the rhythm engine draws VF,
  PEA, asystole; CPR gives a fraction of normal cardiac output: EtCO2 10–20 mmHg with good compressions, more with
  better ones, a jump at ROSC (Falk 1988) [V]; defibrillation success falls with time in VF [D]; adrenaline raises
  coronary perfusion during CPR [D]. NAP7: 3 per 10,000 anaesthetics, 82% non-shockable, causes led by bleeding (17%),
  bradyarrhythmia (9%) and ischaemia (7%); bradycardic arrests do best [V].
- **Expected (bradycardia):** ask the surgeon to stop (desufflate, release traction) first; atropine 0.6 mg (SRFAC; to
  2.4 mg) within 1 min; glycopyrrolate, ephedrine or adrenaline 10–100 mcg; pacing pads early.
- **Expected (arrest):** declare it and note the time; compressions within 10 s of pulselessness or of SBP staying under
  50 mmHg; first shock within 2 min (aim under 1 min for monitored VF); pauses under 5 s; adrenaline 1 mg every 3–5 min
  (non-shockable as soon as possible; VF after the 3rd shock in ERC, after the 2nd in AHA: configurable until the SRFAC
  figure is checked); with an arterial line, start with 50–100 mcg (RCUK 2025); amiodarone 300 mg then 150 mg; turn the
  anaesthetic off, 100% O2, 500 mL fluid; the 4 Hs and 4 Ts plus theatre causes (vagal, drug error, LAST, anaphylaxis,
  bleeding, embolism, tamponade, tension pneumothorax, auto-PEEP, high spinal, MH); use EtCO2 and the arterial line to
  guide CPR (ERC 2025: DBP ≥ 30, EtCO2 ≥ 25 mmHg).
- **Wrong:** phenylephrine for bradycardic hypotension; not asking the surgeon to stop; waiting for a pulse check at SBP
  40; 1 mg adrenaline peri-arrest with an arterial line (hypertension, VF); a pulse check straight after a shock;
  hyperventilation in CPR; volatile left on.
- **Teaching:** in theatre, arrest usually follows a trend and is non-shockable: treat the cause; bradycardia: stop the
  stimulus, atropine, adrenaline, pacing; compress at SBP under 50; algorithms differ on doses and timing, know the
  local one. Sources: SRFAC 2021 (Ching 2021); ERC 2025 ALS (no major change from 2021); RCUK 2025; AHA 2020/2025;
  NAP7; QRH 2-1, 2-6.

## 11. Light anaesthesia and awareness

- **Patient:** 32-year-old, TIVA with rocuronium (the NAP5 high-risk combination). **Start:** intubated, maintenance.
- **Model:** a hidden delivery failure chosen by the seed: the propofol line disconnected or the cannula tissued, the
  pump stopped or the syringe empty, a vaporiser empty or not seated (in the volatile variant, end-tidal agent falls over
  2–5 min, faster at high FGF); effect sites fall; autonomic signs (tachycardia, hypertension, lacrimation, sweating)
  are blunted by opioids; no movement because paralysed; BIS-like index over 60 if processed EEG is on.
- **Expected:** check delivery within 2 min (pump, syringe, line to the cannula, the cannula itself; agent analyser,
  dial, vaporiser level); deepen within 1–2 min of the first sign (propofol 0.5–1 mg/kg or volatile ≥ 1 age-adjusted MAC;
  opioid if a painful stimulus); consider midazolam; talk to the patient; no more relaxant until depth is assured;
  document; NAP5 Awareness Support Pathway afterwards.
- **Wrong:** β-blocker or antihypertensive without deepening; more relaxant; blaming the monitor; ignoring the agent
  alarm.
- **Teaching:** neuromuscular block is the main risk factor, so use processed EEG with TIVA and relaxant (Association of
  Anaesthetists monitoring standards 2021); induction, emergence and transfers are the dangerous moments; check delivery
  before deepening; talk to the patient and follow up. Incidence 1 in 19,600 overall, 1 in 8,200 with relaxants, 1 in
  670 at caesarean; 51% of experiences were distressing (NAP5) [V]. Sources: NAP5 (Pandit 2014, Cook 2014); Klein 2021.

## 12. Residual neuromuscular block at emergence

- **Patient:** 70-year-old, 50 kg, rocuronium top-up 25 min before the end, mildly cold (35.5 °C). **Start:** emergence.
- **Model:** the block (MODEL.md section 2): the thumb's TOFR lags; the diaphragm recovers earlier; the upper-airway
  muscles are more sensitive, so after extubation at a TOFR under 0.9: rapid shallow breathing, upper-airway
  obstruction, SpO2 falling, CO2 rising, weak cough, distress (a weak, aware patient) [D sizes]. Fade can't be felt
  above a TOFR of about 0.4 [U]. Hypothermia, volatiles and magnesium prolong the block [U].
- **Expected:** quantitative TOF at the adductor pollicis before reversal and before extubation; reverse by depth
  (sugammadex 2 mg/kg at TOF count ≥ 2, 4 mg/kg at PTC 1–2, 16 mg/kg for immediate reversal; neostigmine 40–50 mcg/kg
  (max 5 mg) with glycopyrrolate only at minimal block: TOFR ≥ 0.4 by ASA 2023, > 0.2 by ESAIC 2023); extubate at TOFR
  ≥ 0.9; recheck within 2–3 min of sugammadex; if extubated and weak: O2, airway support, measure, sugammadex, reassure,
  reintubate if needed.
- **Wrong:** extubating on clinical signs or time since the dose; neostigmine at deep block; neostigmine over 5 mg;
  under-dosed sugammadex (recurarisation); sugammadex for atracurium; monitoring at the eye.
- **Teaching:** clinical tests can't exclude residual block: measure; TOFR ≥ 0.9 at the thumb before extubation; match
  drug and dose to the measured depth; neostigmine has a ceiling and a late peak; residual block causes hypoxaemia,
  aspiration and distress (Murphy 2008: PACU respiratory events at a mean TOFR of 0.62). Sources: ASA 2023 (Thilen);
  ESAIC 2023 (Fuchs-Buder); Klein 2021.
