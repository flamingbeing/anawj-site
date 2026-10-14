# OT simulator: the patient model

The physiology and pharmacology the simulator implements: state, equations, default numbers, sources and the
calibration targets the tests check. Written 14 Oct 2026 as part of the plan (`DESIGN.md`) and revised the same day
after two reviews, prototypes of the riskiest parts (`research/prototypes.md`) and a source check of every number that
was marked unverified. Nothing is built yet. The research behind it, with every PMID and what could not be checked, is
in `research/` (`pk.md`, `pd.md`, `resp.md`, `cardio.md`, `crises.md`, `prototypes.md`).

**Status of each number.** [V] checked in the primary paper's abstract or full text, a drug label or SmPC, or a
guideline; [S] from a named secondary source (a review, an open-source implementation that cites the paper, a textbook
convention); [U] not yet checked; [D] a design or calibration choice of ours, including values tuned in the prototypes.
Nothing here is clinically reviewed: the owner reads each milestone's numbers before any is described as reviewed.

**Units.** mmHg for blood pressures and gas partial pressures (no kPa), cmH2O for airway and pleural pressure inside
`resp.js`, °C, mL and L, mg / mcg / ng, minutes for rate constants. 1 cmH2O = 0.735 mmHg: any pressure crossing from
`resp` to `cardio` is converted at the boundary (field names carry the unit: `resp.pplMmHg`). A synthetic adult unless
a scenario says otherwise.

## 0. Contract between subsystems

Each subsystem owns one slice of `state`, reads the others' previous-step values only through these fields, and is the
only writer of its slice (`DESIGN.md`, the model loop):

| Owner | Fields others read |
|---|---|
| `patient` | `age, sex, weightKg, heightCm, bmi, lbm, bsa, ibw, frc0, bloodVol0, ihr, q` (sensitivity quantile), PK multipliers |
| `pk` | `pk[drug].{cp, ce, ceHaemo}`, `pk.roc.{ceThumb, ceDiaphragm, ceAirway, ceLarynx}`, `pk.sgx.free`, `pump[drug].{predCp, predCe, rate}` |
| `volatile` | `vol.fi[agent]` (circuit inspired), `vol.ce[agent]`, `vol.mac` (age-adjusted MAC fraction, immobility), `vol.pv[agent]` (mixed venous partial pressure) |
| `pd` | `pd.{asleep, pAsleep, bisLike, pNoMove[stim], auto, ventDrug, nmb:{t1, tofCount, tofr, ptc, diaphragm, upperAirway, larynx}}` |
| `rhythm` | `rh.{rhythm, events[]}` (timed atrial and ventricular events in this step) |
| `cardio` | `cv.{hr, sv, co, map, sbp, dbp, cvp, svr, bloodVol, rbcMass, hb, ppv, pi, beatSV[]}` |
| `resp` | `resp.{mode, vt, rr, mv, va, ppeak, pplat, peep, autoPeep, compliance, resistance, spont, pplMmHg, breaths[]}` |
| `gas` | `gas.{fa[species], fio2, pao2, sao2, paco2, etco2, pvo2, svo2, ph, hco3, be, lactate, k, ica, shunt, vdAlvFrac, uptake[agent]}` |
| `airway` | `aw.{device, patent, obstruction, seal, leak, cuff, position, view, laryngospasm}` |
| `temp` | `t.{core, periph, ambient, warming}` |
| `cond` | `cond[name].{level, ...}` (the disease processes, section 11), `cond.haem.coag.{fibrinogen, platelets}` |
| `resus` | `rs.{cpr, quality, coFraction, lastShock, paced, capture}` |
| `monitor` | `mon.{shown values, alarms[], nibp state, probe states}` |

Gas ownership: `gas.js` owns the lung store for **every** species (O2, CO2, N2, agents, N2O) and the
alveolar–capillary exchange; `volatile.js` owns the vaporiser, the circuit's inspired composition, agent in blood and
tissue groups, and the agent effect sites. They meet only through `vol.fi`, `vol.pv` and `gas.uptake`.

## 1. The patient

**Default patient** (tests and free run): man, 40 y, 70 kg, 170 cm, BMI 24.2. Awake: HR 72, BP 120/75 (MAP 90), SpO2
98%, RR 14, Vt 7 mL/kg, EtCO2 38 mmHg, core 36.8 °C, Hb 150 g/L (women 135) [D]. Small seeded noise on displayed
values (SD about 1 beat/min, 1–2 mmHg, 0.3% SpO2) [D].

| Covariate | Formula | Worked example (default patient) | Status |
|---|---|---|---|
| Lean body mass | James: man 1.1·W − 128·(W/H)², woman 1.07·W − 148·(W/H)² (W kg, H cm) | 55.3 kg | [V] (Schnider, Minto) |
| Body surface area | Mosteller: √(H·W/3600) | 1.82 m² | [V] Mosteller 1987 |
| Ideal body weight | Devine: man 50 + 0.9055·(H − 152.4), woman 45.5 + 0.9055·(H − 152.4); not below about 152 cm | 65.9 kg | [V] Devine 1974 via Pai 2000 |
| Blood volume | 70 mL/kg (women 65) at normal BMI; obese: 70/√(BMI/22) mL/kg × weight (Lemmens 2006) | 4.9 L | [S] Nadler 1962; Lemmens [S] |
| FRC (O2 store) | 30 mL/kg × IBW (about 2.0 L); the GA loss of lung volume is modelled as shunt, not a smaller store; obesity: × max(0.5, 1 − 0.025·(BMI − 25)) | 2.0 L | [D] calibrated to the apnoea targets (section 8); Pelosi 1996 GA 1.69 L, obese 0.67 L [V] |
| Intrinsic heart rate | 118.1 − 0.57·age (after full autonomic block), between-patient spread about ±15% | 95.3 /min | [V] Jose & Collison 1970 (as quoted; Opthof 2000) |

- **The James paradox.** James LBM peaks and then falls in obesity (about 124 kg at 170 cm for a man), which drives
  Schnider clearance up [V, Absalom 2009]. First version: above BMI 35 (women) or 42 (men) the patient's Schnider
  covariates use the LBM at the James peak, as pumps restrict the model there [D]. Eleveld (its own PK and PD) is a later
  option (question 2 in `DESIGN.md`); mixing Eleveld PK with PD fitted on Schnider is not allowed.
- **Between-patient variation**, drawn once per patient from the seed (sub-stream `patient`), fixable by a scenario:
  PK multipliers on V1 and clearance (log-normal, SD about 0.25) [D], so the pump's prediction and the patient's true
  level differ; one **sensitivity quantile q** (uniform 0–1) used for every yes/no endpoint (asleep, moves, tolerates
  laryngoscopy), so a resistant patient is resistant everywhere, with continuous effects (BIS-like, haemodynamics)
  using the matching population quantile, not a second independent draw [D]; baroreflex gain ±25% [D]; intrinsic heart
  rate ±15% [V spread]; airway features (section 9). Teaching point: the same dose does not do the same thing in every
  patient.
- **Warm start:** 300 s of simulated time at creation with no drugs, so every subsystem starts at steady state. The
  circulation's unstressed volumes and filling constants are solved from the targets, not hand-tuned (section 5).

## 2. Intravenous drugs: pharmacokinetics

Mammillary models (1 to 3 compartments) plus effect sites, stepped by Euler at 0.1 s (prototype: matches RK4 at 0.01 s
to 2–3 decimals for every drug). Boluses enter the central compartment at once; infusions in mg/h or mcg/kg/min.
Details and cross-checks: `research/pk.md`.

| Drug | Model in the patient | Key numbers (default patient) | Source |
|---|---|---|---|
| Propofol | **Schnider** 1998/1999 | V1 4.27, V2 18.9 − 0.391(age−53), V3 238 L; CL1 1.89 + 0.0456(W−77) − 0.0681(LBM−59) + 0.0264(H−177), CL2 1.29 − 0.024(age−53), CL3 0.836 L/min; ke0 0.456; haemodynamic effect site t½ke0 5.7 min (20–39 y), 5.9 (40–59), 8.9 (60–69), 10.2 (70–85) | [V] Schnider 1998, 1999; Kazama 1999 |
| Remifentanil | **Minto** 1997 | V1 5.1 − 0.0201(age−40) + 0.072(LBM−55); V2 9.82 − 0.0811(age−40) + 0.108(LBM−55); V3 5.42 L; CL1 2.6 − 0.0162(age−40) + 0.0191(LBM−55); CL2 2.05 − 0.0301(age−40); CL3 0.076 − 0.00113(age−40) L/min; ke0 0.595 − 0.007(age−40) | [V] Minto 1997 |
| Fentanyl | **Shafer** 1990 (STANPUMP set) | V1 6.09 L; k10 0.0827, k12 0.471, k13 0.225, k21 0.102, k31 0.006; ke0 **0.147** (time to peak 3.2 min; 0.117 gives the published 3.6) | [V] PK; ke0 disputed (owner question 8) |
| Alfentanil | Maitre 1987 (later, optional) | V1 0.111·W; CL 0.356 L/min (falls after 40 y); k12 0.104, k13 0.017, k21 0.0673, k31 0.0126; ke0 0.77 | [V] |
| Midazolam | Albrecht 1999 | V1 7.9 L; CL1 0.399; k12 0.19, k13 0.065, k21 0.06, k31 0.0083; ke0 0.11 (time to peak about 6 min in this model vs about 2.8 min in Miller's table: record, don't tune) | [V] |
| Ketamine | Domino 1982 | V1 0.063·W; k10 0.438, k12 0.592, k13 0.590, k21 0.247, k31 0.0146; ke0 0.652 (chosen by opentiva for a time to peak about 1 min) | PK [S]; ke0 [D] |
| Rocuronium | **Kleijn** 2011 PK (2 compartments, holds the sugammadex binding) with **directional effect sites** | V1 4.73·(W/70), V2 6.76·(W/70) L; CL 0.269·(W/70)^0.75, Q2 0.279·(W/70)^0.75 L/min. Thumb (adductor pollicis): ke0 0.3/min while Ce rises, 1.2/min while it falls; Ce50 0.95 mcg/mL (bromide); Hill 3.5; under sevoflurane Ce50 × 0.605 (Kleijn). Diaphragm Ce50 × 1.9 (rocuronium ED50 0.26 vs 0.14 mg/kg, Cantineau 1994), recovers sooner. Upper-airway dilator muscles Ce50 × 0.7 (more sensitive than the thumb). Larynx (intubating conditions) Ce50 × 1.73 with faster equilibration (Plaud 1995: 1.42 vs 0.82 mcg/mL, t½ke0 2.7 vs 4.4 min) | PK [V]; one symmetric ke0 could not meet both onset and sugammadex reversal in the prototype, so the directional ke0, Ce50 and Hill are [D] tuned to the label; site ratios [V] (diaphragm, larynx) and [D] (upper airway) |
| Suxamethonium | Roy 2002 1-compartment | V 0.038 L/kg; hydrolysis k 0.97/min; ke0 **0.29** (Roy's 0.058 gives T1 90% at about 22 min, twice the Lee 2009 time); Ce50 825 ng/mL; Hill 4; cholinesterase variants scale k: heterozygous × 0.5 (about 15 min), homozygous × 0.01 (about 8 h); phase II block (fade) after 3–5 mg/kg total; potassium +0.5 mmol/L | PK [V]; ke0, Ce50, Hill [D] tuned; K+ [S] (Thapa & Brull 2000); phase II [V] Lee 1975 |
| Sugammadex | Kleijn 2011 | 1:1 complex with free rocuronium, KD 0.0559 µM, **solved as equilibrium each step** (quadratic for free rocuronium from totals and KD, written in its numerically stable form); complex cleared like free sugammadex (CL about 88 mL/min, t½ about 2 h); MW rocuronium bromide 609.7, sugammadex 2178 | [V]; equilibrium method [D] (an explicit reaction blew up at realistic on-rates) |
| Neostigmine | Effect model | Peak antagonism about 5 min (4.6 min warm, 5.6 min mildly cold; Heier 2002), a ceiling (no effect on deep block); raises the effective rocuronium Ce50 by up to about × 3 [D]; usual 40–50 mcg/kg, never over 5 mg (label maximum 50 mcg/kg UK, 70 mcg/kg US); muscarinic slowing of HR and secretions unless glycopyrrolate about 10 mcg/kg (0.2 mg per 1 mg neostigmine) or atropine 15–20 mcg/kg | [V] timing, labels; size [D] calibrated to Kopman 2005 and Naguib 1993 (below) |
| Local anaesthetics | 2-compartment plus an absorption compartment per block site; intravascular injection goes to the central compartment | lidocaine, bupivacaine, ropivacaine. **Gap: volumes, clearances, absorption rates and free fractions (bupivacaine about 0.05, ropivacaine about 0.06, lidocaine about 0.3 [U]) need a research step before the LAST scenario PR.** Thresholds must be compared on the same basis (free or total) | [U] |
| Vasoactive drugs | Section 5 | — | — |

**The pump is not the patient.** Each syringe pump has its own predicted model in `state`, stepped with the same dt:
Schnider effect-site by default, or Marsh (V1 0.228 L/kg, V2 0.463 L/kg, V3 2.893 L/kg; k10 0.119, k12 0.112, k13
0.0419, k21 0.055, k31 0.0033; ke0 1.2 or 0.26; Marsh 1991, Struys 2000 [V]) in plasma or effect-site mode, and Minto
for remifentanil. The patient runs the model above with its PK multipliers, so "Behind the monitor" shows a prediction
beside a true level that differs. Controller [D]: every 10 s choose the rate (by superposition: simulate 10 s at zero
and at unit rate) that brings the predicted target site to the target, clamped to [0, maximum]; effect-site targeting
in the manner of Shafer & Gregg 1992 [V citation] (prototype: updating every 10 s and every 1 s gave the same course);
when the target is lowered the pump stops until the prediction falls to it. Defaults [D]: propofol 10 mg/mL,
remifentanil 50 mcg/mL, maximum 1200 mL/h (confirm with NUH pumps). Different pumps run the "same" model differently
(Alaris derives Schnider's ke0 from a 1.6 min time to peak; others fix 0.456) [S].

**PK calibration targets** (tests; the prototype reached all of these with the parameters above):

| Check | Target | Prototype |
|---|---|---|
| Marsh 70 kg, 2 mg/kg (140 mg) | Cp at once 8.8 mcg/mL; **ke0 0.26: Ce peak 3.2 at 3.9 min; ke0 1.2: Ce peak 5.7 at 1.6 min** (corrects the brief's example) | 8.77; 3.21 at 3.92; 5.70 at 1.62 |
| Schnider bolus | time to peak effect 1.5–1.6 min (paper 1.6–1.7); 1.45 → 1.71 min from 25 to 75 y | 1.52; 1.45 / 1.71 |
| Minto bolus | time to peak effect about 1.4 min (1.23 at 20 y, 2.26 at 80 y) | 1.43 |
| Fentanyl, ke0 0.147 | time to peak effect 3.2 min | 3.16 |
| Context-sensitive half-time after 1 / 3 / 8 h | Schnider about 2 / 3 / 8 min; Minto about 2 min flat (measured 3.2 min, Kapila 1995: tolerance to 4); fentanyl about 18 / 70 / 256 min | 2.0 / 3.1 / 8.0; 2.1; 17.8 / 70.1 / 256 |
| Effect-site TCI, Schnider target 4 mcg/mL | effect site within 5% of target by about 1.3 min with no effect-site overshoot; plasma peaks about 3.4 × target (report it) | 1.26 min; plasma × 3.35 |
| Rocuronium 0.6 mg/kg | maximum block about 1.8 min (label median; Magorian 1993 onset 89 ± 33 s); T1 25% about 31 min (label, range 15–85) | 1.79; 27 |
| Rocuronium 1.2 mg/kg | onset about 1.0 min; T1 25% about 60–67 min | 0.79; 59 |
| Sugammadex | 2 mg/kg at T2 → TOFR 0.9 in about 1.5 min (Blobner 2010); 4 mg/kg at 1–2 PTC → about 2.9 min (Jones 2008); 16 mg/kg 3 min after 1.2 mg/kg → T1 10% about 1.4 min later (4.4 min from rocuronium, Lee 2009) | 1.46; 2.0; 1.31 |
| Suxamethonium 1 mg/kg | onset under 1 min; T1 10% 7.1 min, T1 90% 10.9 min (Lee 2009) | 7.08; 10.89 |
| Neostigmine | at T1 about 10%, ED50 17 and ED80 33 mcg/kg for recovery at 10 min (Naguib 1993); profound block with 50 mcg/kg: TOFR 0.55 / 0.71 / 0.81 at 10 / 15 / 20 min (Kopman 2005) | not prototyped |
| Post-tetanic count | first PTC response to first TOF response about 16 min in adults (Baykara 2002) | not prototyped |

**TOF readout** [V for the mapping, D for the fade factors]: T1 = 1/(1 + (Ce/EC50)^γ); later twitches more sensitive,
Tn with EC50 × fn (f2 0.85, f3 0.7, f4 0.59); a twitch counts above 3–5% of control; TOFR = T4/T1; fade cannot be felt
above a TOFR of about 0.4 (Viby-Mogensen 1985) [V]; acceleromyography reads TOFR 0.9 at T1 about 86% (Kopman 2002) [V].
Hypothermia (34.5 °C roughly doubles vecuronium duration, Heier 1991) and magnesium (40 mg/kg: about −25% ED50,
Fuchs-Buder 1995) prolong the block [V]; volatiles potentiate it [S].

## 3. Inhaled agents

- **Circuit** [S, D]: circle system 8 L, well mixed; fresh gas flow (O2, air, N2O) and the vaporiser dial; overflow =
  max(0, FGF − agent and N2O uptake − VO2), leaving at circuit concentration; inspired = circuit composition; expired
  return = dead space × FI + VA × FA; if overflow reaches 0 (minimal flow) the circuit volume falls and the bag warning
  shows. CO2 absorber exhaustion raises inspired CO2 as a fault.
- **Uptake** [V, De Wolf 2012 Gas Man groups]: vessel-rich group 6 L at 75.8% of cardiac output, muscle 33 L at 18%,
  fat 14.5 L at 6%; perfusion-limited, dP/dt = Q·λblood·(Part − P)/(V·λtissue); ventilation continuous (per-breath only
  for drawing the agent waveform; prototype: end-tidal differences 0.01–0.05). **Concentration effect** required:
  inspired alveolar flow = VA + net uptake with FRC constant (without it N2O reaches only 0.92 at 30 min).
- **Partition coefficients** (37 °C) [V, Yasuda, Targ & Eger 1989 via two textbook tables; the Gas Man set gives the
  same FA/FI within 0.01]:

| Agent | blood:gas | brain:blood | muscle:blood | fat:blood | MAC at 40 y |
|---|---|---|---|---|---|
| Sevoflurane | 0.65 | 1.7 | 3.1 | 47.5 | **1.80%** default (Mapleson; Japanese adults 1.68–1.71%) or 2.05% (US label; Cooter 2020) — owner question 7 |
| Desflurane | 0.42 | 1.3 | 2.0 | 27.2 | 6.6% [V] |
| Isoflurane | 1.4 | 1.6 | 2.9 | 44.9 | 1.17% [V] |
| Nitrous oxide | 0.47 | 1.1 | 1.2 | 2.3 | 104% [V] |

- **Age:** MAC(age) = MAC40 × 10^(−0.00269·(age − 40)), about −6% a decade [V, Mapleson 1996] (computed with `fmath`).
- **Effect site:** a separate effect compartment driven by arterial partial pressure (= FA with no shunt), ke0 0.48/min
  for sevoflurane [V, Mourisse 2007], scaled by brain:blood relative to sevoflurane for the others (desflurane 0.63,
  isoflurane 0.51, N2O 0.74/min) [D]. The vessel-rich group is only the uptake store: its time constant (2.7 min for
  sevoflurane) is about 30% slower than that ke0.
- **MAC fraction** = Σ agents (effect-site partial pressure / age-adjusted MAC): additive for immobility including N2O
  [V, Nakahara 1997; Hendrickx 2008 (N2O with isoflurane possibly less than additive)]. Not for hypnosis: N2O does not
  add to MAC-awake the same way, so the hypnosis rule (section 4) leaves N2O out [V].
- **Calibration** (fixed FI, no N2O, VA 4 L/min, CO 5 L/min, FRC 2.5 L; tolerance ±0.03 at 30 min, ±0.02 washout):

| Check | Target | Prototype |
|---|---|---|
| FA/FI at 30 min | desflurane 0.90, sevoflurane 0.85, isoflurane 0.73 (Yasuda 1991) | 0.913, 0.858, 0.736 |
| FA/FI N2O at 30 min | 0.97 ± 0.02 (Yasuda measured 0.99, which needs VA about 10 L/min: a known miss) | 0.973 |
| FA/FA0 5 min after stopping | sevoflurane 0.157, isoflurane 0.22 (Yasuda); desflurane 0.14 tested loosely (0.08–0.15): known miss of the structure, never tuned by distorting desflurane's coefficients | 0.148, 0.238, 0.089 |
| Order | wash-in iso < sevo < des; washout des < sevo < iso | yes |
| Wash-in at 1 / 5 / 10 min | regression values only (Yasuda's figures could not be read): des 0.63/0.84/0.89, sevo 0.55/0.74/0.81, iso 0.40/0.57/0.66 [D] | — |
| Low flow, sevoflurane dial 2%, 120 min (Johansson 2002) | Et/FI 0.88 ± 0.03 at 1 and 2 L/min; FI/dial and Et/dial about 0.09 higher at 2 than at 1 L/min; absolute FI/dial 0.73 / 0.82 and Et/dial 0.64 / 0.73 within ±0.10 (the model reads about 0.09 high) | 0.89–0.90; gap 0.09; 0.82 / 0.91 |
| Teaching check | holding Et at 1 MAC at 1 L/min after a 6 L/min wash-in needs the dial about 2.9% at 30–60 min [D] | — |

Yasuda gave the potent agents with 65–70% N2O; with that the model overshoots (sevoflurane 0.89–0.91), so the tests
use the plain wash-in [V for the protocol].

## 4. Drug effects: hypnosis, stimulus response, processed EEG

- **Opioids on one scale.** Hypnotic-sparing and analgesic effects use a remifentanil-equivalent Ce:
  CeR_eq = CeR + 0.82·CeF (Lang 1996: 50% isoflurane MAC reduction at remifentanil 1.37 and fentanyl 1.67 ng/mL) [V
  ratio]; alfentanil later. Breathing uses each opioid's own C50 (section 7).
- **Hypnosis (asleep or not), one rule for everything that asks "does the patient respond to voice":**
  U_h = CeP/C50LOC(age) + CeS/(0.34·MAC(age)), times (1 + 0.15·CeR_eq/1.36); P(no response) = 1/(1 + U_h^−γ); asleep
  when P > q (the patient's quantile). C50LOC = 2.90 − 0.022·age mcg/mL (fits Schnider 1999's 2.35 / 1.80 / 1.25 at
  25 / 50 / 75 y exactly) [V fit]; MAC-awake / MAC 0.34 (Katoh 1993; with the 1.80% default, 0.61% at 40 y, close to
  Katoh's measured 0.62%) [V]; γ 4.5 [D] (Schnider's slope not yet read; gives a 5–95% range of 1.05–3.9 mcg/mL at 40
  y); the opioid weight 0.15 gives fentanyl 3 ng/mL about −21% MAC-awake (Katoh & Ikeda 1998: −24%) [V target, D
  weight]. N2O is left out (section 3).
- **Stimulus response** (laryngoscopy, intubation, incision, ongoing surgery), the Hannivoort 2016 triple model in its
  reduced-Greco form [S: the form is inferred from the abstract and van den Berg 2021]:
  U_s = (CeP·a(age)/(7.58·I_s) + CeS/(0.98·MAC(age)·I_s))·(1 + CeR_eq/1.36); P(no response) = 1/(1 + U_s^−5.22).
  The volatile term is tied to age-adjusted MAC so sevoflurane alone gives no movement at incision in half at 1.0 MAC
  (the definition of MAC; 0.98 = 1/1.02) [D]; a(age) = 10^(0.00269·(age − 40)) scales propofol the same way [D].
  Intensities I_s relative to laryngoscopy [V ratios from Kazama 1997 Cp50s; their use as multipliers D]: tetanus 0.95,
  laryngoscopy 1.00, incision 1.02, tracheal intubation 1.78, ongoing surgery 0.6–1.0 by phase [D]. Voice is not in
  this list (hypnosis above answers it).
  - **Movement:** the patient moves at stimulus onset if P(no response) < q, unless paralysed.
  - **Autonomic drive** `pd.auto` (0–1): a second surface needing about 1.6× the hypnotic Ce50 with the opioid
    relatively more potent (MAC-BAR is about 1.5–2 MAC; fentanyl 3 ng/mL cuts sevoflurane MAC-BAR by 83% but MAC by
    61%) [V ratios, D form]. `cardio.js` turns it into sympathetic drive, calibrated in M2.1 so laryngoscopy at P_TOL
    0.9 gives SBP +19 to +32 mmHg and HR +6 to +10 (van den Berg 2021) [V]; rise over 30–60 s, fade over 3–5 min for
    brief stimuli, held during surgery [D].
  - Light-anaesthesia signs in Examine: sweating and tears (two of Evans' PRST signs), pupils dilating with a noxious
    stimulus, less so with opioid (Larson 1996, 1997), movement if not paralysed [S].
  - **Targets:** P_TOL 0.9 isobole propofol 6.65 / 4.67 / 2.93 / 1.68 mcg/mL with remifentanil 1 / 2 / 4 / 8 ng/mL
    (Hannivoort parameters); van den Berg's own pairs (8.6 / 5.9 / 3.6 / 2.0) give P_TOL 0.95–0.98 here (they came
    from the Bouillon re-fit 8.48 / 1.16 / 3.46) [V]; propofol alone for 50% no response to intubation about 13.5
    mcg/mL (Kazama Cp50 17.4) [D check]; remifentanil 32 ng/mL reduces MAC about 96% (Lang 91%); the fentanyl ceiling
    (Katoh about 76% at 10 ng/mL) is not captured [D].
- **BIS-like index** (only when a scenario has processed EEG): Bouillon 2004 surface, U = CeP/4.47 + CeS/2.14 +
  CeR/19.3; index = 97.4/(1 + U^1.43) [S: Bouillon's values via the PAS transcription; the sevoflurane C50 2.14 is
  Mourisse's 1.29 rescaled by Bouillon's propofol C50 over Mourisse's own propofol EC50, D]. Smoothing 15 s (the
  monitor's default) plus a processing delay of 20–60 s, longer for large jumps (independent measurements: 14–155 s,
  Pilge 2006; 24–122 s, Zanner 2009) [V]. Arousal adds +3 to +11 (van den Berg 2021) [V]. Targets: propofol 2 / 3 / 4 /
  6 mcg/mL alone 74 / 62 / 53 / 39; with remifentanil 4 ng/mL 63 / 53 / 45 / 34; sevoflurane 1 MAC 49–55 [D table,
  prototype values]. The remifentanil term may be too strong at high remifentanil and low propofol (Nieuwenhuijs 2003
  found no BIS effect up to 2 ng/mL) [U]: flagged. A teaching proxy, labelled so, as on the BIS page.

## 5. Circulation

Hybrid design (`research/cardio.md` section 1, prototyped in `research/prototypes.md`): a mean-value core stepped at
0.1 s, a beat engine that sets each beat's stroke volume, display-only waveforms.

- **Compartments:** systemic arteries, systemic veins, pulmonary; P = (V − Vu)/C. Every flow is computed once per step
  and moved from its source to its destination (flux transfer), pumped and bled volumes are capped at the volume
  available and pressures floored at 0, so blood volume is conserved to rounding (prototype: drift 3e-11 mL an hour).
- **Beats:** at each ventricular event (exact time from `rhythm.js`; the step is split at beat times) stroke volume is
  latched from the pressure-loaded end-systolic relation SV = EDV − V0 − (P_downstream − Ppl)/Ees, with EDV from the
  end-diastolic relation at the atrial transmural pressure; it is delivered as constant flow SV/RR until the next beat
  [V, Sunagawa 1983; Kelly 1992; Chen 1998; form D]. Right atrial pressure then follows from venous return:
  Pra = Psv − Rvr·Q_rv, floored at the collapse pressure (0 breathing spontaneously, about Ppl under positive pressure);
  with no output (arrest, PEA, asystole) Pra = Psv. Left side likewise from the pulmonary compartment. Filling-time loss
  at short RR; atrial kick (share of filling when a P wave precedes the QRS) about 0.20 at 25 y rising to about 0.37 at
  70 y (Pearson 1991, Doppler mitral inflow) [V], so older patients lose more in AF or junctional rhythm.
- **Defaults** (inputs: MAP 90, CO 5.4 L/min, HR 72, CVP 4, LAP 8, pulmonary compartment 12 mmHg; compliances
  arterial 1.5, venous 122.5, pulmonary 25 mL/mmHg; LV Ees 1.58 mmHg/mL; RV V0d 40, β 0.025, V0 50, Ees 0.6) [S/D].
  Derived at creation: unstressed volumes and end-diastolic constants (A_lv 0.181, A_rv 0.312), stressed volume 1310 mL
  systemic (1550 with the pulmonary bed), systemic mean filling pressure 10.4, venous compartment 9.4 mmHg, Rvr =
  (Psv − CVP)/CO, systemic resistance 0.896 mmHg·s/mL; displayed SVR (MAP − CVP)/CO = 15.9 Wood units (1270
  dyn·s·cm⁻⁵; 1000–1200 dyn is 12.5–15 Wood units). Prototype: HR 72.0, SV 75.0, CO 5.40, 120/75, CVP 4.0, LAP 8.0.
- **Critical closing pressure** [D, not yet prototyped]: Q_sys = (Psa − max(Psv, Pcrit))/R with Pcrit about 20 mmHg
  engaging only at low flow, plus a small leak so pressures still equalise over minutes. Target (after VF starts):
  arterial pressure falls with τ about 3 s to about 24 mmHg at 13 s while CVP rises to about 11, then both converge on
  the mean filling pressure (Schipke 2003) [V]. Without it the model decays with τ 1.4 s towards about 11 mmHg.
- **Baroreflex** (Ursino 1998 structure, simplified) [V for the HR and Ees limbs; D for the rest]: filtered MAP (τ 2 s)
  → one sigmoid (width k 12 mmHg) → sympathetic s and vagal v = 1 − s → effectors, each a delay plus a first-order lag:
  heart period vagal (0.2 s, τ 1.5 s) and sympathetic (2 s, τ 2 s); SVR (2 s, τ 6 s, gain 1.0); venous unstressed
  volume (5 s, τ 20 s, gain 2000 mL, the largest early defence against bleeding; within Magder's up to 18 mL/kg); Ees
  (2 s, τ 8 s, gain 0.6). Vagal and sympathetic heart-period amplitudes (0.66 s and 0.2525 s at age 40, T0 0.63 s) are
  solved per patient so resting HR comes out at 72 [D]. Open-loop sensitivity at the set point 19 ms/mmHg (awake human
  pressor test 22.5, Tanaka 1999 [V]); a pressor test inside the closed-loop model reads 10–12 (a known difference;
  tested as such).
- **Anaesthetic blunting:** two gains driven by total MAC fraction and propofol effect: one on the HR limbs (about 0.25
  of awake at about 1.6 total MAC: Tanaka's 4–6 ms/mmHg was at 2% sevoflurane with 67% N2O) [V], a milder one on the
  vascular limbs (0.5) [D]. Propofol also lowers sympathetic tone (MSNA −76% at induction, Ebert 1992) and resets the
  set point lower (Cullen 1987) [V]. β-blockade scales the sympathetic HR and Ees limbs; atropine the vagal limb, so HR
  rises towards the intrinsic rate.
- **Empty-ventricle decompensation** (awake only; anaesthesia removes it) [D]: dc = 1/(1 + exp((EDV − 0.53·EDV0)/1.5
  mL)) multiplies sympathetic drive to the HR and SVR limbs by (1 − 0.8·dc) and adds 0.7·dc vagal drive. It produces
  the second phase of haemorrhage (Schadt & Ludbrook 1991) that the baroreflex alone never does.
- **Drug drives** [V where cited; mapping D]:
  - Propofol (haemodynamic effect site above): E = CeH/(CeH + 1.0 mcg/mL); sympathetic tone × (1 − 0.3E), SVR ×
    (1 − 0.15E), venous unstressed volume + 100E mL, Ees × (1 − 0.1E), reflex gain × (1 − 0.3E), set point − 15E mmHg.
    Prototype: 2 mg/kg gives SBP −17.9 mmHg at 2 min with HR +3 (Rolly 1985: −13 to −19, HR little changed); steady
    Ce 1 mcg/mL MAP −11.4% (Nieuwenhuijs: −9.9%). An age term is still needed so the elderly fall further as well as
    later (Kazama 1999) [D, to tune].
  - Remifentanil: raises vagal tone upstream of the baroreflex, saturating (no linear extrapolation); calibrate to HR
    about 60 at 4–8 ng/mL with propofol at P_TOL 0.9 (van den Berg 2021) [V target]; a small direct MAP effect (−3.7%
    per ng/mL at low doses, Nieuwenhuijs 2003) [V], saturating; the propofol-remifentanil induction target (SAP −32%,
    HR −22% at 5 min, Sjøen 2026 placebo arm) [V] is checked once both drives exist. Garraza-Obaldia 2024 (Emax 0.69,
    C50 4.57 ng/mL on HR, plasma-driven, hysteroscopy) is context, not used directly.
  - Sevoflurane: SVR down, a dose-dependent MAP fall with HR about unchanged (label; Malan 1995; Ebert 1995) [V]; tune to
    about −20–25% MAP at 1 MAC, −30–35% at 1.5 MAC, unstimulated [D].
  - Ketamine: indirect sympathomimetic (SBP +10–50%) [V label]; direct depression when catecholamines are depleted [S].
  - After induction HR and SBP drift towards about 63/min and 88 mmHg whatever the agent (Roizen 1981) [V]: a sanity
    check.
- **Fluids and blood** [V/D, Hahn]: intravascular volume is only the three compartments. Bleeding removes whole blood
  at the current haematocrit from the veins. Crystalloid: Hahn's two-compartment volume kinetics applied as flows
  between the veins and an interstitial state (and urine), with MAP-dependent rate constants (k12 0.037 and k10 0.009/min
  at MAP 110; 0.008 and 0.001 at MAP 60; k21 about 0 during induction hypotension) [S, derived from Hahn 2021
  half-lives]; check: 1 L over 30 min at MAP 70 leaves 83% intravascular and Hb 150 → 129 g/L. Colloid stays (t½
  2–3 h). Red cells in additive solution: about 280 mL, haematocrit about 0.6 (other services 0.50–0.70, mean 0.58–0.60;
  HSA's product details not found) [S]. Red-cell mass and Hb mass are tracked; Hb = Hb mass / blood volume. Cold fluids
  cool (section 10). Capillary leak (anaphylaxis) is a flow out of the veins.
- **Haemorrhage targets** [D, prototype passed]: awake 10% loss HR +0–10, MAP −0–5%; 20% HR +15–25, MAP −5–10%; near
  30% decompensation (HR peaks about 104 at 28–30%, then 89 at 35%, 61 at 40%; MAP −19% at 30%, −59% at 40%); a volume
  load at 32% restores MAP. Under GA hypotension from about 10–15% (−9% at 10%, −15% at 15%, −22% at 20%) with HR +2
  to +6. ATLS classes fit few real patients (9.3%, Mutschler 2013) [V]: the debrief says so.
- **Pulse pressure variation** emerges: pleural pressure = 0.4 × alveolar pressure (PEEP included) in mmHg
  (transmission measured 0.33 pericardial to 0.55 pleural in ventilated patients, Lansdorp 2014) [V]; it raises right
  atrial pressure and lowers venous return; the left ventricle feels it 2–3 beats later; the size follows the Starling
  slope. PPV is measured per breath from beat pulse pressures. Targets (prototype): normovolaemic, Vt 8 mL/kg 5.6%
  (5–10% [D]); at Vt 6 mL/kg 3.6%; under GA after 10 / 15 / 20% loss 11 / 16.5 / 24.5%. 13% is the classic responder
  threshold (Michard 2000), 9–13% a grey zone (Cannesson 2011); valid only with Vt ≥ 8 mL/kg, sinus rhythm and
  controlled ventilation (De Backer 2005) [V]. No alveolar squeeze on the pulmonary bed in the first version (it
  overshoots).
- **Vasoactive drugs** act through receptor activations (α1, β1, β2, V1, muscarinic, noradrenaline release from a finite
  store for ephedrine's tachyphylaxis) mapped onto SVR, venous tone, HR and Ees [D, `research/pd.md` section 6]. Targets
  (populations named; wide tolerances):

| Drug | Dose (synthetic adult) | Effect to reproduce | Source |
|---|---|---|---|
| Phenylephrine | 50 / 100 / 200 mcg | MAP +11.6 / +15.6 / +18.0 mmHg; CO −0.6 to −0.8 L/min; reflex bradycardia (cardiac surgical patients). Prototype: 2-compartment PK with a front-end blood volume, 14–20 s transit, ke0 1.5/min, EC50 3–6 ng/mL; peak about 42 s only with a weak vascular reflex; about 45% of the peak remains at 5 min (Anderson's slow decline), so "wanes in about 5 min" is a known miss | Schwinn & Reves 1989; Anderson 2017 [V]; mapping [D] |
| Noradrenaline | bolus about 10 mcg (ED50 in spinal caesarean prophylaxis, 8 mcg ≈ phenylephrine 100 mcg); infusion 0.05–0.15 mcg/kg/min | gone 1–2 min after stopping | Ngan Kee 2017; SmPC [V] |
| Ephedrine | 3–6 mg, repeat; tachyphylaxis | 0.1 mg/kg at induction kept SAP −20% vs −32% placebo and CO better than phenylephrine | Sjøen 2026; SmPC [V] |
| Adrenaline | 10–200 mcg boluses (anaphylaxis ladder); 1 mg (arrest); infusion 3–40 mcg/min | β at low doses (HR up, DBP down), α at high | Clutter 1980; SmPC; ANZAAG 2022 [V] |
| Vasopressin | 0.5–1 unit (ACE-inhibitor vasoplegia), 1–2 units then 2 units/h (refractory anaphylaxis) | V1 vasoconstriction, not blunted by ACE inhibitors; avoid in LAST | Stanford manual; ANZAAG 2022 [V] |
| Atropine | 0.6 mg boluses to 2.4 mg (SRFAC 2021; 0.5 mg ERC, 1 mg AHA as configurable alternatives); 0.3–0.6 mg routine | peak HR at 2–4 min, lasts hours; under about 0.4 mg a brief, small slowing first | SRFAC 2021; SmPC [V]; size [S/D] |
| Glycopyrrolate | 0.2–0.4 mg; 10 mcg/kg with neostigmine | slower than atropine (t½ke0 about 18 min vs 3.8) | Scheinin 1999 [V] |
| Esmolol | 0.5 mg/kg over 1 min, then 50–200 mcg/kg/min | t½ 9 min | SmPC [V] |
| Labetalol | 10–20 mg, then 5–10 mg increments (hypotensive anaesthesia); severe hypertension 50 mg over 1 min, to 200 mg | maximum by 5 min; 20–25 mg lasts about 50 min under anaesthesia | SmPC [V] |
| GTN | 50–100 mcg bolus (off-label); infusion 10–200 mcg/min | onset 1–3 min, offset 5–10 min, preload falls first | Stengert 1978; SmPC [V] |
| Metaraminol | 0.5–1 mg (off by default: not on the HSA register) | onset 1–2 min, lasts 20–60 min | SmPC [V]; HSA listing checked 14 Oct 2026 |

## 6. Rhythms and the ECG

- A rhythm engine with an atrial clock (sinus, AF, flutter, ectopic, none), an AV-node state (1:1, first degree,
  Wenckebach, Mobitz II, fixed ratio, dissociated, AF conduction), a ventricular clock (conducted, junctional escape
  40–60, ventricular escape 20–40, VT, torsades, ectopics, paced) and refractoriness; event times are exact (not rounded
  to steps), so PR intervals, Wenckebach increments and the atrial kick resolve; each ventricular event fires a beat
  (section 5); PEA is organised electrical activity with SV about 0 [V for the rate ranges, D for the design;
  `research/cardio.md` section 4].
- Rhythms for the scenarios: sinus (brady, tachy), junctional, AF, flutter, SVT, VT, torsades, VF (dominant frequency
  about 5 Hz, coarse to fine over minutes), asystole and P-wave asystole, PEA, AV blocks, ectopics (bigeminy, couplets),
  paced, ST changes, hyperkalaemia stages (peaked T → wide QRS → sine wave; the ECG is insensitive for potassium,
  Montague 2008 [V]).
- Vagal bradycardia starts within seconds of the stimulus (oculocardiac reflex 1–2.5 s) and HR recovers with a time
  constant of about 2–5 s once vagal drive stops (animal transfer-function data, Nakahara 1998) [S]; the clinical 30–60 s
  includes the time to stop the stimulus (deflating the abdomen) [D].
- The ECG is synthesised for display from template beats (sums of Gaussian kernels; lead II seeds in
  `research/cardio.md`), with Fridericia QT and PR shortening with rate. Not the ECGSYN model (needs fast integration,
  PR and QT scale wrongly, GPL code).

## 7. Breathing: mechanics, ventilator, drive

- **Mechanics:** total respiratory compliance under GA 60 mL/cmH2O by default (band 50–80; Pelosi 1996 lung 107 and
  chest wall 191 in series give about 68) [V/D]. Resistance = native airway (about 1–2 cmH2O·L⁻¹·s) + tube by Rohrer,
  R_tube = K1 + K2·|flow|, with K2 in cmH2O·L⁻²·s² (7.0 mm 9.17, 7.5 mm 6.01, 8.0 mm 4.65; Flevari 2011) [V] and K1
  [D, about 3–5]; LMA or face mask instead of a tube. Time constant τ (s) = R (cmH2O·L⁻¹·s) × C (L/cmH2O): C in mL/cmH2O
  ÷ 1000.
- **Ventilator** (closed-form within each breath): manual bag (APL valve, squeeze), volume control (Ppeak = PEEP +
  flow·R + Vt/C, Pplat = PEEP + Vt/C), pressure control (Vt = ΔP·C·(1 − e^(−Ti/τ))), pressure support for spontaneous
  breaths, CPAP; I:E, RR, PEEP, FiO2; auto-PEEP when expiry is shorter than about 3τ; leak with a deflated cuff or a
  poorly seated LMA; disconnection and obstruction alarms [V for the formulas]. Breath events (start, Ti, Vt, pressures)
  for display; gas exchange uses continuous alveolar ventilation (section 8).
- **Conditions** change C and R as relative changes of the model's own values [V sources, D sizes]: pneumoperitoneum
  12 mmHg lowers static compliance about 30–45%, so Pplat rises about 5–7 cmH2O at Vt 8 mL/kg (Suh 2010 measured −12
  mL/cmH2O dynamic from its own baseline, Ppeak +6, Pplat +7); head-down about −20%, with pneumoperitoneum −30% more
  (Hirvonen 1995); obesity (Pelosi 1996); bronchospasm (R up several-fold, auto-PEEP); endobronchial intubation (one
  lung: C halves, shunt rises); tension pneumothorax (rising pressures, falling Vt in PC). Pneumoperitoneum's CO2 load
  and circulation effects are a condition (section 11).
- **Drive** (spontaneous breathing): Bouillon's indirect-response model with CO2 feedback [V]: VE = VE0·(1 −
  E)·(PeCO2/PaCO2,0)^Feff, PeCO2 following PaCO2 with ke0,CO2 0.92–0.95/min, F about 4.3, flattened by drug effect as
  Feff = F·(1 − E)^1.5 [D] (with constant F the model gives resting falls of only 13% and 9% at the doses below).
  E = U^γ/(1 + U^γ), U = CeP/1.33 + CeR/0.92 + CeF/2.3 + (volatile term) + α·(CeP/1.33)·(CeR/0.92): remifentanil C50
  0.92 ng/mL γ 1.25 (Bouillon 2003), propofol 1.33 mcg/mL γ 1.68 (Bouillon 2004), fentanyl 2.3 ng/mL (van Lemmen 2025;
  1.5–3 Cartwright 1983) [V]; strong synergy (Nieuwenhuijs 2003) [V], α and the volatile term [D]. Apnoeic threshold:
  apnoea when PeCO2 < PaCO2,0 − 4 + kAT·E·PaCO2,0, kAT 0.11–0.12, plus a fixed opioid shift [D]. Hypoxic drive small,
  abolished by volatile agents (Knill & Gelb 1978) [V]. Pattern: opioids slow the rate with tidal volume kept;
  volatiles fast and shallow [S, Pattinson 2008]. Diaphragm function follows the diaphragm block (section 2); a curare
  cleft shows when weak efforts return.
- **Targets:** propofol 2 mg/kg induction apnoea median about 24 s (Drummond 1997; prototype 24–29 s) [V]; with opioid
  co-induction often over 60 s (the Diprivan label: apnoea over 60 s in 12% after 2–2.5 mg/kg alone) [V], 1–3 min as
  our expectation [D]; resting ventilation with PeCO2 free (prototype with Feff): remifentanil 1 ng/mL −27%, propofol 1
  mcg/mL −14% (Nieuwenhuijs 2003: −28% and −13%) [V]; with PeCO2 clamped at 55 mmHg: −58% and −44% [V].

## 8. Gas exchange, oxygen and CO2

Prototyped (`research/prototypes.md`): one alveolar store, arterial and venous O2 pools, CO2 stores.

- **Lung store** of volume FRC holding O2, CO2, N2, agents and N2O (fractions sum to 1), continuous alveolar
  ventilation. **Net flux rule:** each step the net uptake (O2 + N2O + agents − CO2) is replaced by bulk inflow of the
  airway-opening gas (room air, mask or circuit gas, high-flow nasal oxygen) while the airway is patent; when obstructed
  the store volume falls (floor at a minimum lung volume) and is tracked. A species mass-balance test runs over a
  30-minute apnoea. The alveolar gas equation uses the store's own CO2, so rising CO2 eventually displaces O2 during
  apnoeic oxygenation.
- **Blood:** end-capillary content from PAO2 by **Severinghaus 1979** (S = 1/(23400/(P³ + 150P) + 1)) [V] with the
  Okada 1977 virtual-PO2 shift for pH, temperature and base excess (check the sign convention) [V]; dissolved 0.03
  mL/L/mmHg; shunt mixes venous blood in; Fick for the venous pool.
- **Defaults** [V/S/D]: VO2 3.5 mL/kg/min awake, about −25 to −35% under GA (Jakobsson 2021), about 210–230 mL/min
  in apnoea under GA; RQ 0.8; shunt 2–5% awake, 0.08 under GA (atelectasis; up to 0.17; Tokics 1987, Hedenstierna 2010),
  lowered by PEEP and recruitment [D]; obese 0.15, term pregnant 0.10 [D]; effective venous and tissue O2 store 5200
  mL [D]; anatomical dead space 2 mL/kg; alveolar dead-space fraction 0.06–0.09 (PaCO2 − EtCO2 2.4–3.6 mmHg) [D].
- **CO2:** a fast store with capacitance 0.84 mL/kg/mmHg (59 mL/mmHg), which gives +3.4 mmHg/min in apnoea at VCO2
  200 mL/min, plus a saturating venous-equilibration transient (up to 8.5 mmHg, τ 22 s) for the first minute [D]; a slow
  store (hours) [S, Farhi & Rahn 1955]. Target: PaCO2 with an occluded airway +8–12 mmHg in the first minute, then
  +3.4 mmHg/min (Stock 1989; prototype +11.3) [V]; with high-flow nasal oxygen 1.1–1.8 mmHg/min (Patel 2015; Gustafsson
  2017) [V].
- **Acid-base and electrolytes:** pH from Henderson–Hasselbalch (HCO3 24 at rest); lactate when O2 delivery falls below
  a critical level, from MH and massive transfusion; potassium from suxamethonium, MH, stored blood and acidosis, lowered
  by insulin with glucose (about 0.6–1 mmol/L over 30–60 min [U]); ionised calcium falls with rapid citrate (blood
  products) [D]. Blood gases on request after a 2-minute point-of-care delay [D].
- **Apnoea targets** (full pre-oxygenation unless stated; prototype in the last column):

| Patient | Time to SaO2 90% | Source | Prototype |
|---|---|---|---|
| Healthy 70 kg | about 8 min | Benumof 1997 [V]; DAS 2015 | 8.5 min |
| Healthy, breathing air | 1–2 min (SpO2, including the oximeter delay) | DAS 2015 [V] | 34 s raw, about 1 min displayed |
| Moderately ill adult | about 5 min | Benumof 1997 [V] | — |
| Morbidly obese | 196 s vs 595 s (Berthoud 1991); 163 s vs 364 s (Jense 1991) | [V] | 3.4 min |
| Term pregnant | 4 min 52 s vs 7 min 25 s | McClelland 2008 (model) [V] | 5.0 min |
| Below 90% | about 30%/min (open airway 26, obstructed 33) | Hardman & Wills 2006 [V] | 27–36%/min |
| Open airway, 100% O2 | time to SaO2 50% about 66 min (Hardman 2000 model); high-flow nasal O2 median 14 min apnoea without desaturation (Patel 2015) | [V] | needs the CO2 coupling above |

- **Pre-oxygenation:** FAO2 approaches FiO2 with half-time 0.693·FRC/VA (prototype within 1 s) [V, Benumof 1999];
  target EtO2 ≥ 0.9 after about 3 min of tidal breathing or 8 deep breaths in 60 s (Baraka 1999); a leak lowers it.
- **Pulse oximeter** (in `monitor.js`): transport delay finger 20–30 s, ear 10 s, longer with low cardiac output,
  vasoconstriction or cold (scaled by CO0/CO and perfusion) [S/D]; averaging 8–10 s; display every 1–2 s; MacLeod 2005's
  finger response time 130 → 215 s with mild hypothermia is an end-to-end check, not a parameter [V]; accuracy falls
  below 80% (reads low around 55%) [V]; perfusion index under GA 1.5–3% by default, rising with vasodilation; "low
  perfusion" below about 0.3%, no reading below about 0.2% [D] (Lima 2002's 1.4% is a healthy median and an ICU cut-off,
  context only) [V]. Skin pigmentation bias and methaemoglobin (reads towards 85%) are teaching notes, not modelled at
  first [V].
- **Capnography:** EtCO2 = PACO2 diluted by alveolar dead space; PaCO2 − EtCO2 2–5 mmHg normally, about 0 in pregnancy
  [V, Shankar]; the gap widens when pulmonary perfusion falls (EtCO2 tracks cardiac output at fixed ventilation, slope
  0.73, Isserles & Breen 1991) [V]. Shapes for the synthesiser (from EtCO2 and breath events): normal, bronchospasm
  shark fin, rebreathing (raised baseline), curare cleft, oesophageal intubation (a few falling breaths then nothing,
  Linko 1983), MH (rising despite more ventilation). CPR: typical compressions about 10–20 mmHg, better ones higher;
  under 10 suggests poor compressions; aim over 20 (ERC 2025 physiology targets EtCO2 ≥ 25 with DBP ≥ 30 are reachable
  with excellent compressions); a sudden sustained rise to about 35–40 suggests return of circulation (Falk 1988; Meaney
  2013) [S].

## 9. The airway

- **Assessment features** per patient (Mallampati, mouth opening, thyromental distance, neck movement, BMI, teeth,
  beard, history) → hidden true difficulty: mask ventilation grade, laryngoscopy view (Cormack-Lehane) by direct and
  video laryngoscope, SAD seal, front-of-neck anatomy. Drawn from the `airway` sub-stream given the features [D];
  incidence anchors in `research/crises.md`.
- **State machine:** patent → partial obstruction (sedation: the pharynx collapses as propofol deepens, abruptly near
  loss of consciousness; Eastwood 2005, Hillman 2009 [V]; the upper-airway muscles' block, section 2) → complete
  obstruction; relieved by jaw thrust, chin lift, oro- or nasopharyngeal airway, CPAP, a device. Devices: face mask
  (seal), SAD (size, seal pressure, leak), tracheal tube (size, depth, cuff; oesophageal or endobronchial placement
  possible), front-of-neck access. A laryngoscopy attempt takes 15–40 s with an easy airway and 60 s or more when
  difficult or for a novice (trials: Macintosh 8–24 s mean) [S], without ventilation; each attempt adds trauma that
  worsens later views [D].
- **Laryngospasm:** risk rises with stimulation in a light plane, secretions, blood, extubation; closure is complete or
  partial; desaturation in more than 60% of reported events, bradycardia 6% (23% in infants), pulmonary oedema 4%
  (Visvanathan 2005) [V]; the time to desaturate comes from the apnoea model with the extra O2 use of obstructed efforts
  (no published timing found) [D]; negative-pressure pulmonary oedema after forceful efforts against a closed glottis
  [V].

## 10. Temperature

- Two compartments: core (trunk and head, about 66% of mass) and periphery, with a core-peripheral conductance that
  rises with vasodilation [S, Sessler]. Heat production about 1 kcal/kg/h awake (about 80 W at 70 kg), about 30% lower
  under GA (range 20–40%) [S, WFSA Update 2008; Sessler]; losses by exposure, ambient temperature (theatre default
  21 °C [D]), cold fluids (1 L at 21 °C lowers mean body temperature about 0.28 °C, from specific heat 0.83 kcal/kg/°C
  [D arithmetic]); forced-air warming adds about 40–64 W net (Bräuer 2002) [V].
- **Targets** [V]: core −0.5 to −1.5 °C in the first 30–60 min (−1.6 °C in hour 1, 81% from redistribution, Matsukawa
  1995); then −0.5 to −1 °C/h; a plateau near the anaesthetised vasoconstriction threshold (about 34.5 °C, Kurz 1995);
  with forced-air warming a nadir about 35.7 °C in the first hour, then rising (Sun 2015). Propofol lowers the
  vasoconstriction threshold about 0.6 °C per mcg/mL (Matsukawa 1995).
- **MH heat:** by energy balance, VO2 × 2–3 (section 11) gives only about 0.2–0.4 °C per 5 min even with heat loss
  blocked (1 °C per 5 min in 70 kg needs about 800 W net, 8–10 × basal). Reviews quote "1–2 °C every 5 min" (Rosenberg
  2007, 2015) [V quote], which energy balance does not support. The model uses energy balance and aims at about 1 °C
  per 15–20 min when fulminant, with the registry's median maximum 39.1 °C (Larach 2010) as a check [D, flagged for the
  owner].

## 11. Conditions (what a crisis switches on)

Each is a small process in `conditions.js` with a level and its effects on the subsystems above; scenarios set its
onset and size; treatments act on the process or on the physiology (never on the monitor numbers). Signatures,
expected actions and doses: `SCENARIOS.md`.

| Condition | Process | Effects |
|---|---|---|
| Anaphylaxis | mediator level rising after the trigger, decaying slowly; adrenaline lowers release and reverses effects | SVR and venous tone fall, capillary leak (plasma loss), bronchospasm (R up), tachycardia, rash and oedema (Examine) |
| Bronchospasm | airway resistance multiplier | Ppeak up (Pplat less), shark-fin capnogram, auto-PEEP, falling Vt in PC, hypoxaemia |
| Laryngospasm | glottic closure (partial or complete) | no ventilation, desaturation, bradycardia in children, possible pulmonary oedema |
| Haemorrhage | bleed rate (mL/min) from the veins; surgical control lowers it | volumes fall; reflexes respond; Hb falls with dilution; a simple coagulation timeline (fibrinogen first to fall, then platelets) moved by products and TXA [D] |
| Malignant hyperthermia | hypermetabolism level: whole-body VO2 and VCO2 × 2–3 when fulminant (swine: whole body almost × 2, muscle almost × 3; Gronert & Theye 1976, Roewer 1995) [V], VCO2 rising faster early (lactic acid buffered by bicarbonate); rigidity; potassium; acidosis; dantrolene lowers the level over minutes | EtCO2 rises despite ventilation, tachycardia, arrhythmias, temperature (section 10) |
| LAST | plasma local anaesthetic (PK, section 2, gap noted); CNS and cardiac effects by concentration [V thresholds: lidocaine CNS signs from about 6 mcg/mL total, cardiovascular over 10; bupivacaine about 0.3 mg/L free, ropivacaine about 0.6 mg/L free]; acidosis and hypoxia worsen it; lipid adds a sink and raises clearance 1.5–2× [S/D] | CNS signs (Examine) and seizures, QRS widening, bradycardia, VT/VF, contractility down |
| Tension pneumothorax | pleural air volume growing faster with positive pressure; decompression lets it out, a drain stops it re-forming | compliance falls, venous return falls (pleural pressure), shunt rises, distended neck veins and absent breath sounds (Examine) |
| Pneumoperitoneum | intra-abdominal pressure; insufflation is a vagal trigger | exogenous CO2 load (VCO2 up about 20–30%; minute ventilation need about +30%, PaCO2 − EtCO2 +1.5, Hirvonen 1995) [V], compliance down (section 7), SVR up and venous return changes by IAP [D] |
| Airway difficulty | the hidden airway features | CICO when mask, SAD and tube all fail |
| Endobronchial / one-lung | one-lung ventilation | shunt up, compliance down |
| Residual block | patient relaxant sensitivity, late top-up, cold | weak breathing, upper-airway obstruction, low TOFR after extubation |
| Awareness risk | delivery failures: vaporiser empty or not seated, IV line tissued or disconnected, pump stopped, empty syringe | effect sites fall, autonomic signs, movement if not paralysed |
| Vagal reflexes | insufflation, oculocardiac, second suxamethonium dose | bradycardia to asystole (section 6) |
| Arrest | from any of the above, or primary | VF / PEA / asystole; resuscitation in section 13 |

## 12. Scenario drugs and products (`drugs.js`, PR M4.0)

The crises need these beyond sections 2 and 5. Doses are from `SCENARIOS.md` and `research/crises.md` [V]; effect sizes
and timings are [D] unless stated, calibrated so the scenario's correct course works.

| Drug or product | Acts on | Notes |
|---|---|---|
| Glucagon 1–2 mg, repeat every 5 min | Ees and HR independent of β-receptors | β-blocked anaphylaxis |
| Salbutamol (MDI 4–12 puffs into the circuit, 5 mg nebulised, IV 250 mcg then 5–20 mcg/min) | airway resistance (β2), some HR rise, potassium down | bronchospasm; nebuliser upstream of the filter does nothing (a wrong action) |
| Magnesium 2 g over 20 min | airway resistance; potentiates relaxant (section 2) | |
| Ketamine (section 2) | airway resistance; sympathomimetic | |
| Amiodarone 300 mg, then 150 mg | probability of VF/VT termination after a shock; slows AF; hypotension if fast | SRFAC: after 3 shocks |
| Calcium chloride 10% 10 mL (or gluconate 10% 20 mL) | ionised calcium, Ees; membrane stabilisation in hyperkalaemia | |
| Insulin 10 units with 50 mL 50% glucose | potassium down 0.6–1 mmol/L over 30–60 min [U] | |
| Sodium bicarbonate 50 mmol | HCO3, pH; CO2 load | |
| Tranexamic acid 1 g | coagulation timeline (less fibrinolysis) | non-trauma surgical bleeding: before and after; CRASH-2 timing is trauma |
| FFP, platelets, cryoprecipitate | coagulation timeline; volume; citrate (ionised calcium) | arrive after a delay once the protocol is activated [D] |
| Dantrolene (Dantrium 20 mg + 60 mL water per vial by default) | MH level decays over minutes after an adequate dose (2.5 mg/kg) | each vial takes helpers time to mix [D]; product is owner question 6 |
| Lipid emulsion 20% | LAST free fraction (sink) and clearance | QRH 3-10 regimen |
| Cefazolin, other antibiotics, rocuronium, chlorhexidine | anaphylaxis trigger | culprit list in `SCENARIOS.md` |
| Steroid, antihistamine | no acute effect | logged as "first-line" errors when given before adrenaline |

## 13. Resuscitation (`resus.js`, PR M2.8)

All [D] unless stated, calibrated to the CPR targets in section 8: compressions give a fraction of normal cardiac
output by quality (poor about 0.1, typical 0.2–0.25, excellent 0.3–0.35), so EtCO2 reads about 10–20 with typical
compressions and over 25 with excellent ones, DBP over 30 then reachable with adrenaline; a pause drops flow at once and
coronary perfusion recovers over 30–60 s of compressions; adrenaline raises SVR during CPR (DBP up); defibrillation
success for VF falls with minutes in VF and with poor perfusion before the shock (first-minute success high, falling
several percent a minute) [U shape]; amiodarone raises it after repeated shocks; return of circulation needs an
organised rhythm with enough output (shockable: a successful shock; non-shockable: the cause reversed); transcutaneous
pacing capture threshold drawn per patient (about 50–90 mA [U]), output set about 10 mA above capture (QRH 2-6) [V].

## What is not modelled (first version)

Children and pregnancy (parameters exist; scenarios later), regional and neuraxial blocks other than the LAST scenario,
renal and hepatic drug handling beyond the fixed models, coagulation beyond a simple timeline for the haemorrhage
scenario, cerebral physiology, the EEG (the BIS page does that), cardiac output monitors, transfusion reactions, drug
errors other than the scripted awareness scenario, the surgeon, the Eleveld propofol model, and obese pharmacodynamics
beyond the capped Schnider covariates. Known misses of the planned structure, kept visible rather than tuned away:
desflurane washout faster than measured, N2O at 30 min slightly low, phenylephrine wearing off more slowly than "about
5 min", the closed-loop pressor-test baroreflex slope about half the awake human value. Each scenario's debrief lists
what it simplifies.
