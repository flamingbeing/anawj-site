# OT simulator: the patient model

The physiology and pharmacology the simulator implements: state, equations, default numbers, sources and the
calibration targets the tests check. Written 14 Oct 2026 as part of the plan (`DESIGN.md`); nothing is built yet.
The detailed research notes behind it, with every PMID and what could not be checked, are in `research/`
(`pk.md`, `pd.md`, `resp.md`, `cardio.md`, `crises.md`).

**Status of each number.** [V] checked this session in the primary paper's abstract or full text, a drug label or
SmPC; [S] from a named secondary source (a review, or an open-source implementation that cites the paper); [U]
textbook or memory, check before relying on it; [D] a design or calibration choice of ours, not a published value.
Nothing here is clinically reviewed: the owner reads each milestone's numbers before any is described as reviewed.

**Units.** mmHg (CO2 and O2 too; no kPa), °C, mL and L, cmH2O for airway pressure, mg / mcg / ng, minutes for
rate constants. A synthetic adult unless a scenario says otherwise.

## 0. Contract between subsystems

Each subsystem owns a slice of `state` and reads others only through these named fields (the previous step's
values), so PRs can be tested alone:

| Owner | Fields others read |
|---|---|
| `patient` | `age, sex, weightKg, heightCm, lbm, bsa, ibw, frc0, bloodVol0, ihr, sens` (per-patient sensitivity draws) |
| `pk` | `pk[drug].{cp, ce, ceHaemo}`; amounts per compartment; `pk.roc.free`, `pk.sgx` |
| `volatile` | `vol[agent].{fi, fa, et, vrg}`, `vol.mac` (age-adjusted MAC fraction sum), `vol.n2o` |
| `pd` | `pd.{hyp, bisLike, pNoMove[stim], auto, ventDep, nmb:{t1, tofCount, tofr, ptc, diaphragm, airway}}` |
| `cardio` | `cv.{hr, sv, co, map, sbp, dbp, cvp, svr, bloodVol, hb, ppv, rhythm, pi, beat}` (beat = the last beat's event) |
| `resp` | `resp.{mode, vt, rr, mv, ppeak, pplat, peep, autoPeep, compliance, resistance, spont, paw(t) params}` |
| `gas` | `gas.{fio2, fao2, pao2, sao2, paco2, etco2, pvo2, svo2, ph, hco3, be, lactate, k, shunt, vdAlv}` |
| `airway` | `aw.{device, patent, obstruction, seal, leak, cuff, position, view, laryngospasm}` |
| `temp` | `t.{core, periph, ambient, warming}` |
| `cond` | `cond[name].{level, ...}` (the disease processes, section 11) |
| `monitor` | `mon.{shown values, alarms[], nibp state, probe states}` |

## 1. The patient

- Covariates: lean body mass by **James** (male 1.1·W − 128·(W/H)², female 1.07·W − 148·(W/H)²) for Schnider and
  Minto [V]; BSA (Mosteller) [U]; ideal body weight (Devine) [U]. The James formula peaks and then falls in obesity
  (about 124 kg for a 170 cm man), which drives Schnider clearance up [V, Absalom 2009]: obese patients (BMI over
  35 female, 42 male) use the Eleveld model instead (section 2) [D].
- FRC: 30 mL/kg upright, −20% supine, −20% more under GA [S, Wahba 1991]; obesity lowers it further (Pelosi 1996: 0.67
  vs 1.69 L under GA) [V].
- Blood volume 70 mL/kg (women 65) [U]; Hb 150 g/L (women 135) [D].
- Intrinsic heart rate (no autonomic tone) = 118.1 − 0.57·age [U, Jose & Collison 1970].
- **Between-patient variation**, drawn once per patient from the seed (sub-stream `patient`): PD sensitivity
  multipliers (hypnotic Ce50 ±20%, opioid ±30%, relaxant ±20%), baroreflex gain ±25%, airway features, a "movement
  quantile" q for the stimulus model (section 4) [D]. Scenarios can fix any of them. Teaching point: the same dose
  does not do the same thing in every patient.
- A warm start: 300 s of simulated time at creation with no drugs, so every subsystem starts at its steady state
  (as `bis-dsa` warms its EEG) [D].

## 2. Intravenous drugs: pharmacokinetics

All are mammillary compartment models (1 to 3 compartments) plus an effect site with `ke0`, stepped by Euler at
0.1 s (checked: identical to 0.01 s steps to 2 decimals for propofol and remifentanil). Boluses go into the central
compartment at once; infusions are mg/h or mcg/kg/min. Details and the reference implementations used to cross-check:
`research/pk.md`.

| Drug | Model in the patient | Key numbers (70 kg, 40 y, 170 cm man) | Source |
|---|---|---|---|
| Propofol | **Schnider** 1998/1999 | V1 4.27, V2 18.9 − 0.391(age−53), V3 238 L; CL1 1.89 + 0.0456(W−77) − 0.0681(LBM−59) + 0.0264(H−177), CL2 1.29 − 0.024(age−53), CL3 0.836 L/min; ke0 0.456 | [V] Schnider 1998 (PMID 9605675), 1999 (PMID 10360845) |
| Propofol, obese | **Eleveld** 2018 | Reference V1 6.28, V2 25.5, V3 273 L, CL 1.79, Q2 1.75, Q3 1.11 L/min; ke0 0.146·(W/70)^−0.25; full θ list in `research/pk.md` | [V] reference values (PMID 29661412); θ list [S] |
| Remifentanil | **Minto** 1997 | V1 5.1 − 0.0201(age−40) + 0.072(LBM−55); V2 9.82 − 0.0811(age−40) + 0.108(LBM−55); V3 5.42 L; CL1 2.6 − 0.0162(age−40) + 0.0191(LBM−55); CL2 2.05 − 0.0301(age−40); CL3 0.076 − 0.00113(age−40) L/min; ke0 0.595 − 0.007(age−40) | [V] Minto 1997 (PMID 9009935) |
| Fentanyl | **Shafer** 1990 (STANPUMP set) | V1 6.09 L; k10 0.0827, k12 0.471, k13 0.225, k21 0.102, k31 0.006; ke0 **0.147** (t½ke0 4.7 min) | [V] PK (PMID 2248388); ke0 is disputed: Scott & Stanski 1985 gives 0.11. Flag for the owner |
| Alfentanil | Maitre 1987 | V1 0.111·W; CL 0.356 L/min; k12 0.104, k13 0.017, k21 0.0673, k31 0.0126; ke0 0.77 | [V] PMID 3099604 |
| Midazolam | Albrecht 1999 | V1 7.9 L; CL1 0.399; k12 0.19, k13 0.065, k21 0.06, k31 0.0083; ke0 0.11 | [V] PMID 10391668 |
| Ketamine | Domino 1982 | V1 0.063·W; k10 0.438, k12 0.592, k13 0.590, k21 0.247, k31 0.0146; ke0 0.652 | [S] (PMID 7198883, constants via opentiva) |
| Dexmedetomidine | Hannivoort 2015 (later, if wanted) | V1 1.78, V2 30.3, V3 52.0 L; CL 0.686, Q2 2.98, Q3 0.602 L/min; ke0 0.0428 | [V] PMID 26068206; ke0 Colin 2017 |
| Rocuronium | **Kleijn** 2011 PK (2-compartment, holds the sugammadex binding) with **Plaud** 1995 effect sites | V1 4.73·(W/70), V2 6.76·(W/70) L; CL 0.269·(W/70)^0.75, Q2 0.279·(W/70)^0.75 L/min. Adductor pollicis: ke0 0.16 (t½ 4.4 min), Ce50 0.82 mcg/mL; laryngeal muscles: t½ke0 2.7 min, Ce50 1.42 mcg/mL | [V] Kleijn 2011 (PMID 21535448), Plaud 1995 (PMID 7648768) |
| Suxamethonium | Roy 2002 (1-compartment) | V 0.038 L/kg; k (hydrolysis) 0.97/min; ke0 0.058; Ce50 734 ng/mL; Hill 3–6 | [V] PMID 12411790 |
| Sugammadex | Kleijn 2011 | 1:1 complex with free rocuronium, KD 0.0559 µM; complex cleared like free sugammadex (CL about 88 mL/min, t½ about 2 h); MW rocuronium bromide 609.7, sugammadex 2178 | [V] |
| Neostigmine | Simple effect model [D] | Antagonism raises the rocuronium Ce50 at the effect site by up to ×3, onset to peak 7–10 min, ceiling at deep block; muscarinic effects (bradycardia, secretions) unless glycopyrrolate given | [U] (ASA 2023 guideline for the use limits, `research/crises.md`) |
| Local anaesthetics | 2-compartment with an absorption compartment per block site; an inadvertent intravascular injection goes straight to the central compartment | lidocaine, bupivacaine, ropivacaine; see section 11 (LAST) | [S]/[D] |
| Vasoactive drugs | 1- or 2-compartment with plasma t½ (section 6) | phenylephrine 2-compartment (CL 160 L/h, V1 13.3 L, Q 25.3 L/h, V2 225 L); noradrenaline and adrenaline t½ 1–3 min; atropine and glycopyrrolate with their own ke0 (atropine t½ke0 about 3.8 min, glycopyrrolate about 18 min) | [V] Anderson 2017, Beloeil 2005, Scheinin 1999 |

**The pump is not the patient.** TCI and the "predicted Ce" a pump shows use the model the trainee picks (Schnider
effect-site by default; Marsh with ke0 1.2 or 0.26, plasma or effect-site; Minto for remifentanil), while the patient
runs the model above plus the between-patient variation. "Behind the monitor" shows both, which teaches that a pump's number is
a prediction [D]. TCI controller: plasma target by exact compartment inversion; effect-site target by the Shafer and
Gregg approach (bolus to reach the target at the time of peak effect, then infusions), recomputed every 10 s [U,
Shafer & Gregg 1992, check].

**PK calibration targets** (tests; my own and the research agent's integrations agree):

| Check | Target |
|---|---|
| Marsh 70 kg, 2 mg/kg (140 mg) | Cp at once about 8.8 mcg/mL; **ke0 0.26: Ce peak 3.2 mcg/mL at 3.9 min; ke0 1.2: Ce peak 5.7 at 1.6 min** (corrects the brief's example) |
| Schnider 40 y, bolus | time to peak effect 1.5–1.6 min (paper 1.6–1.7); 1.45 → 1.71 min from age 25 to 75 |
| Minto 40 y, bolus | time to peak effect about 1.4 min (1.23 at 20 y, 2.26 at 80 y) |
| Fentanyl Shafer, ke0 0.147 | time to peak effect 3.2 min (published 3.6 min implies ke0 0.117; record the choice) |
| Context-sensitive half-time after 1 / 3 / 8 h | Schnider about 2 / 3 / 8 min; Minto about 2–4 min flat (measured 3.2 min, Kapila 1995); fentanyl about 18 / 70 / 256 min |
| Rocuronium 0.6 mg/kg | maximum block at about 1.8 min (label median; 89 ± 33 s to onset, Magorian 1993); T1 25% at about 31 min (label; range 15–85) |
| Rocuronium 1.2 mg/kg | onset about 1.0 min; T1 25% at about 67 min |
| Suxamethonium 1 mg/kg | onset under 1 min; T1 10% at 7.1 min, T1 90% at 10.9 min (Lee 2009); heterozygous cholinesterase variant (k ×0.2) about 15–30 min; homozygous (k ×0.01) hours |
| Sugammadex | 2 mg/kg at T2 → TOFR 0.9 in about 1.5 min (Blobner 2010); 4 mg/kg at 1–2 PTC → 2.9 min (Jones 2008); 16 mg/kg 3 min after 1.2 mg/kg → T1 10% about 1.2 min later (Lee 2009) |

## 3. Inhaled agents

- **Circuit:** circle system volume 8 L [S, Gas Man set]; fresh gas flow (FGF) and its O2/air/N2O mix; vaporiser
  dial (agent %); rebreathing share falls as FGF rises (inspired = FGF mix + rebreathed exhaled gas); CO2 absorber
  (exhaustion raises inspired CO2 as a fault).
- **Uptake:** lung (FRC store, section 8) plus three perfusion-limited tissue groups [V, De Wolf 2012 Gas Man table]:
  vessel-rich group 6 L at 75.8% of cardiac output, muscle 33 L at 18%, fat 14.5 L at 6%. Each:
  dP/dt = Q·λblood·(Part − P)/(V·λtissue). Partition coefficients (37 °C) [V, Yasuda/Targ/Eger 1989 via two textbook
  tables]:

| Agent | blood:gas | brain:blood | muscle:blood | fat:blood | MAC at 40 y |
|---|---|---|---|---|---|
| Sevoflurane | 0.65 | 1.7 | 3.1 | 47.5 | **2.05%** [V, US label 2.1%, Cooter 2020 2.03%] |
| Desflurane | 0.42 | 1.3 | 2.0 | 27.2 | 6.6% [V] |
| Isoflurane | 1.4 | 1.6 | 2.9 | 44.9 | 1.17% [V] |
| Nitrous oxide | 0.47 | 1.1 | 1.2 | 2.3 | 104% [V] |

- **Age:** MAC(age) = MAC40 × 10^(−0.00269·(age − 40)), about −6% a decade [V, Mapleson 1996]. Mapleson's pooled
  sevoflurane MAC40 is 1.80% (it mixes US and Japanese data, which differ: US 2.05–2.6%, Japanese 1.58–1.71%); we use
  2.05% [D, owner to confirm for a Singapore population].
- **Effect site:** the vessel-rich group partial pressure (its time constant, about 2.7 min for sevoflurane, is close to
  the published BIS ke0 0.48/min, Mourisse 2007) [D, V].
- **MAC fraction** = Σ agents (VRG partial pressure / age-adjusted MAC), additive for volatiles and N2O [U, standard
  teaching].
- **Calibration** (Yasuda 1991, human, VA about 4 L/min): FA/FI at 30 min N2O 0.99, desflurane 0.90, sevoflurane 0.85,
  isoflurane 0.73; FA/FA0 5 min after stopping desflurane 0.14, sevoflurane 0.157, isoflurane 0.22 [V]. The 1, 5 and
  10 min wash-in points are in the papers' figures, not the abstracts: read them before writing those tests.

## 4. Drug effects: hypnosis, analgesia, stimulus response

- **Hypnosis (asleep or not).** Probability of no response to voice from the hypnotic effect: propofol C50 for loss
  of response 2.35 / 1.80 / 1.25 mcg/mL at 25 / 50 / 75 y [V, Schnider 1999]; sevoflurane MAC-awake 0.34 MAC [V, Katoh
  1993]; opioids shift it only a little (fentanyl 3 ng/mL −24% for MAC-awake) [V]. The patient is "asleep" when this
  probability passes their own quantile (one draw per patient), so loss and return of consciousness are repeatable.
- **BIS-like index** (only when the scenario has processed EEG): Bouillon 2004 surface, U = CeP/4.47 + CeR/19.3 +
  CeS/1.29 (sevoflurane BIS EC50, Mourisse 2007), index = 97.4 − 97.4·U^1.43/(1 + U^1.43) [S, PAS transcription of
  Bouillon; sevoflurane term [V] but its addition to the surface is ours, D]; plus +3 to +11 during an arousal response
  (section 4, stimulus) [V, van den Berg 2021]; a 15 s lag and 15 s smoothing [U]. A teaching proxy, labelled so, as on
  the BIS page.
- **Stimulus response** (laryngoscopy, intubation, incision, ongoing surgery). Reduced-Greco hierarchical form
  [V, Hannivoort 2016 triple model]:
  U_s = (CeP/(7.58·I_s) + CeS/(2.59·I_s))·(1 + w_s·CeR/1.36), P_noResponse = U_s^5.22/(1 + U_s^5.22).
  Stimulus intensity I_s relative to laryngoscopy [V ratios from Kazama 1997 Cp50s; their use as multipliers is D]:
  voice 0.45, tetanus 0.95, laryngoscopy 1.00, incision 1.02, tracheal intubation 1.78; ongoing surgery 0.6–1.0 by
  phase [D]. Opioid weight w_s = 0.15 for voice, 1 for noxious stimuli [D].
  - **Movement**: the patient moves at stimulus onset if P_noResponse < q (their quantile), unless paralysed [D].
  - **Autonomic response**: a second surface needing about 1.6× the hypnotic Ce50 with the opioid relatively more
    potent (MAC-BAR is about 1.5–2 MAC; fentanyl 3 ng/mL cuts sevoflurane MAC-BAR by 83% but MAC by 61%) [V for the
    ratios, D for the form]. Response size scales with (1 − P_auto): calibrate so laryngoscopy at P_TOL 0.9 gives SBP
    +19 to +32 mmHg, HR +6 to +10, BIS-like +3 to +11 [V, van den Berg 2021]. Rise over 30–60 s, fade over 3–5 min for
    brief stimuli; sustained surgery holds it while the stimulus lasts [D].
  - Light-anaesthesia signs as text in Examine: lacrimation, sweating, pupils dilate, movement if not paralysed [U].

## 5. Circulation

Hybrid design (`research/cardio.md` section 1): a mean-value core stepped at 0.1 s, a beat engine that sets each
beat's stroke volume, and display-only waveforms.

- **Compartments** (volume conserved exactly): systemic arteries, systemic veins (optionally splanchnic and
  peripheral), pulmonary. P = (V − Vu)/C. Systemic flow (Psa − Psv)/SVR; venous return (Psv − max(Pra, Pcollapse))/Rvr;
  right and left atrial pressures solved each step by bisection (20 fixed iterations; deterministic).
- **Beats:** each ventricular event from the rhythm engine (section 7) takes SV from ventricular–arterial coupling:
  EDV from the end-diastolic pressure-volume relation, SV = (EDV − V0)·Ees/(Ees + Ea), Ea ≈ R/T [V, Sunagawa 1983,
  Kelly 1992, Chen 1998]; delivered as flow over the next RR interval. Short diastole loses filling; atrial kick
  +15–25% when a P wave precedes the QRS [U].
- **Defaults** (70 kg, awake, supine) [V/S/D as in `research/cardio.md`]: blood volume 4900 mL, stressed volume
  1400 mL, mean systemic filling pressure 10 mmHg, venous compliance 120–125 mL/mmHg, arterial 1.5 mL/mmHg, pulmonary
  20 mL/mmHg, Rvr 1.0 mmHg·min/L; HR 72, SV 75 mL, CO 5.4 L/min, MAP 90, CVP 4; SVR about 15.9 Wood units
  (1270 dyn·s·cm⁻⁵). (Correction to an earlier note: 1000–1200 dyn·s·cm⁻⁵ is 12.5–15 Wood units.) Unstressed volumes
  are solved from the targets at patient creation, not hand-tuned.
- **Baroreflex** (Ursino 1998 structure, simplified) [V for the HR and Ees limbs, D for the rest]: filtered MAP
  (τ 2 s) → one sigmoid (slope about 12 mmHg) → sympathetic s and vagal v = 1 − s → four effectors, each a delay plus
  a first-order lag: heart period vagal (0.2 s, τ 1.5 s) and sympathetic (2 s, τ 2 s); SVR (2 s, τ 6 s); venous
  unstressed volume (5 s, τ 20 s; the largest early defence against bleeding); Ees (2 s, τ 8 s). Gains give HR 72 at
  rest, a range of about 47–158, and a resting sensitivity of about 19 ms/mmHg (awake human 22.5, Tanaka 1999 [V]).
  Anaesthetic blunting: sevoflurane to about a quarter at 1–1.2 MAC (4–6 ms/mmHg) [V, Tanaka 1999]; propofol lowers
  sympathetic tone (MSNA −76% at induction, Ebert 1992 [V]) and resets the set point lower [V, Cullen 1987]; β-blockade
  scales the sympathetic HR and Ees limbs; atropine scales the vagal limb, so HR rises towards the intrinsic rate.
- **Anaesthetic effects** [V where cited; the mapping onto SVR, venous tone and Ees is D]:
  - Propofol: a separate, slower haemodynamic effect site (t½ke0 for SBP 5.7 min at 20–39 y, 5.9 at 40–59, 8.9 at
    60–69, 10.2 at 70–85; Kazama 1999), acting on SVR, venous tone and a little on Ees, and on sympathetic tone.
    Targets: 2 mg/kg in a healthy adult lowers SBP 13–19 mmHg at 2 min with little HR change (Rolly 1985); a
    propofol-remifentanil TCI induction lowers SAP about 32% and HR about 22% in 5 min (Sjøen 2026 placebo arm); the
    elderly fall further and later.
  - Sevoflurane: SVR down with a dose-dependent MAP fall, HR about unchanged (label; Malan 1995; Ebert 1995); tune to
    about −20–25% MAP at 1 MAC and −30–35% at 1.5 MAC unstimulated [D].
  - Remifentanil: vagotonic HR fall (Emax 0.69, C50 4.57 ng/mL, γ 1.2 on HR; Garraza-Obaldia 2024 [V]) and a small
    direct MAP effect (−3.7% per ng/mL, Nieuwenhuijs 2003 [V]).
  - Ketamine: indirect sympathomimetic (SBP +10–50%), direct depression when catecholamines are depleted [V label, U].
  - After induction, HR and SBP drift towards about 63/min and 88 mmHg whatever the agent (Roizen 1981) [V]: a
    sanity check for the whole set.
- **Fluids and blood** [V/D, Hahn]: bleeding removes whole blood at the current haematocrit from the veins.
  Crystalloid uses two-compartment volume kinetics with MAP-dependent rate constants (k12 0.037 and k10 0.009/min at
  MAP 110; 0.008 and 0.001 at MAP 60; k21 about 0 during induction hypotension) [S, derived from Hahn 2021 half-lives];
  check: 1 L over 30 min at MAP 70 leaves 83% intravascular and Hb 150 → 129 g/L. Colloid stays (t½ 2–3 h). Packed red
  cells add red cells and volume (haematocrit about 0.55–0.65 [U]). Hb = Hb mass / blood volume. Cold fluids cool
  (section 10).
- **Haemorrhage targets** [D, from ATLS classes, Schadt & Ludbrook 1991, Pulse validation]: awake, MAP held to about
  20% loss with HR rising (class II picture at 15–30%), then a decompensation phase near 30% (sympathetic withdrawal,
  relative bradycardia, steep fall); under GA hypotension from about 10–15% loss and a smaller HR rise. ATLS fits few
  real patients (9.3%, Mutschler 2013) [V]: the debrief says so.
- **Pulse pressure variation** emerges: pleural pressure follows airway pressure (transmission 0.3–0.5 [U]), raises
  right atrial pressure, lowers venous return; the left ventricle feels it 2–3 beats later; the size depends on the
  Starling slope. Targets [V thresholds, D values]: normovolaemic, Vt 8 mL/kg, PPV 5–10%; after 15–20% loss under GA,
  15–25%; 13% is the classic responder threshold (Michard 2000), 9–13% a grey zone (Cannesson 2011); valid only with Vt
  ≥ 8 mL/kg, sinus rhythm and controlled ventilation (De Backer 2005).
- **Vasoactive drugs** act through receptor activations (α1, β1, β2, muscarinic, noradrenaline release from a finite
  store for ephedrine's tachyphylaxis) mapped onto SVR, venous tone, HR and Ees [D, `research/pd.md` section 6].
  Targets [V unless marked]:

| Drug | Dose (synthetic 70 kg) | Effect to reproduce | Source |
|---|---|---|---|
| Phenylephrine | 50 / 100 / 200 mcg | MAP +11.6 / +15.6 / +18.0 mmHg, peak about 42 s, wanes in about 5 min; CO −0.6 to −0.8 L/min; reflex bradycardia | Schwinn & Reves 1989 |
| Noradrenaline | bolus ED50 about 10 mcg (8 mcg ≈ phenylephrine 100 mcg); infusion 0.05–0.15 mcg/kg/min | gone 1–2 min after stopping | Ngan Kee 2017; SmPC |
| Ephedrine | 3–6 mg, repeat; tachyphylaxis | 0.1 mg/kg at induction kept SAP −20% vs −32% placebo, CO better than phenylephrine | Sjøen 2026; SmPC |
| Metaraminol | 0.5–1 mg | onset 1–2 min, lasts 20–60 min; direct α plus indirect | SmPC |
| Adrenaline | 10–50 mcg (anaphylaxis); 1 mg (arrest); infusion | β at low doses (HR up, DBP down), α at high | Clutter 1980; SmPC |
| Atropine | 0.3–0.6 mg; 1 mg in arrest-adjacent bradycardia per algorithm | peak HR at 2–4 min, lasts hours; small doses may slow HR first [U] | SmPC; Scheinin 1999 |
| Glycopyrrolate | 0.2–0.4 mg | slower than atropine (t½ke0 about 18 min) | Scheinin 1999 |
| Esmolol | 0.5 mg/kg over 1 min, then 50–200 mcg/kg/min | t½ 9 min | SmPC |
| Labetalol | 5–10 mg increments [U]; up to 50 mg | maximum by 5 min, hours | SmPC |
| GTN | 50–100 mcg bolus [U]; 10–200 mcg/min | venodilation first | SmPC |

## 6. Rhythms and the ECG

- A rhythm engine with an atrial clock (sinus, AF, flutter, ectopic, none), an AV-node state (1:1, first degree,
  Wenckebach, Mobitz II, fixed ratio, dissociated, AF conduction), a ventricular clock (conducted, junctional escape
  40–60, ventricular escape 20–40, VT, torsades, ectopics, paced) and refractoriness. Each ventricular event fires a
  mechanical beat (section 5); PEA is organised electrical activity with SV about 0 [V for the rate ranges, D for the
  design; `research/cardio.md` section 4].
- Rhythms for the scenarios: sinus (brady, tachy), junctional, AF, flutter, SVT, VT, torsades, VF (dominant frequency
  about 5 Hz, coarse to fine over minutes), asystole and P-wave asystole, PEA, AV blocks, ectopics (bigeminy,
  couplets), paced, ST changes, hyperkalaemia stages (peaked T → wide QRS → sine wave; the ECG is insensitive for
  potassium, Montague 2008 [V]).
- After VF starts, arterial pressure decays with τ about 3 s towards about 24 mmHg while CVP rises (Schipke 2003) [V].
- The ECG is synthesised for display from template beats (sums of Gaussian kernels; lead II seeds in
  `research/cardio.md`), with Fridericia QT and PR shortening with rate. Not the ECGSYN model (needs fast integration,
  PR and QT scale wrongly, GPL code).

## 7. Breathing: mechanics, ventilator, drive

- **Mechanics:** total respiratory compliance under GA 60 mL/cmH2O by default (teaching band 50–80; Pelosi 1996 lung
  107 and chest wall 191 in series) [V/D]; resistance = native airway (about 1–2) + tube (Rohrer, flow-dependent; K2
  for 7.0 mm 9.17, 7.5 mm 6.01, 8.0 mm 4.65 cmH2O·L⁻¹·s) [V, Flevari 2011] or LMA or face mask; time constant τ = R·C.
- **Ventilator:** manual bag (APL valve, squeeze), volume control (Ppeak = PEEP + flow·R + Vt/C, Pplat = PEEP + Vt/C),
  pressure control (Vt = ΔP·C·(1 − e^(−Ti/τ))), pressure support for spontaneous breaths, CPAP; I:E, RR, PEEP, FiO2;
  auto-PEEP when expiry is shorter than about 3τ; leak with a deflated cuff or a poorly seated LMA; disconnection and
  obstruction alarms [V for the formulas].
- **Conditions** change C and R [V]: pneumoperitoneum 12 mmHg (dynamic compliance −12 mL/cmH2O, Ppeak +6, Pplat +7,
  EtCO2 +5; Suh 2010), head-down (−20%, with pneumoperitoneum −30% more; Hirvonen 1995), obesity (Pelosi 1996),
  bronchospasm (R up several-fold, auto-PEEP), endobronchial intubation (one lung: C halves, shunt rises), tension
  pneumothorax (rising pressures, falling Vt in PC).
- **Drive** (spontaneous breathing): Bouillon's indirect-response model with CO2 feedback [V]:
  VE = VE0·(1 − E)·(PeCO2/PaCO2,0)^F, where PeCO2 follows PaCO2 with ke0,CO2 0.92–0.95/min, F about 4.3, and E is
  the combined drug effect U^γ/(1 + U^γ) with U = CeP/1.33 + CeR/0.92 + (volatile term) + α·(CeP/1.33)·(CeR/0.92)
  (remifentanil C50 0.92 ng/mL γ 1.25, Bouillon 2003; propofol C50 1.33 mcg/mL γ 1.68, Bouillon 2004; strong synergy,
  Nieuwenhuijs 2003; α and the volatile term are D). Apnoea below a threshold PeCO2 of resting − 4 mmHg, raised by
  opioids [D]. Breathing pattern: opioids slow and deep, volatiles and propofol fast and shallow [U]. Hypoxic drive
  small and abolished by volatile agents (Knill & Gelb 1978) [V]. Diaphragm function falls with neuromuscular block
  (the diaphragm is less sensitive than the thumb muscle [U]). A curare cleft appears in the capnogram when weak
  efforts return.
- **Targets:** propofol induction apnoea median 24 s alone (longer if hypocapnic; Drummond 1997) [V], 1–3 min with an
  opioid [U]; remifentanil 1 ng/mL lowers resting ventilation about 28%, propofol 1 mcg/mL about 13% (Nieuwenhuijs
  2003) [V].

## 8. Gas exchange, oxygen and CO2

The structure checked in this plan (a throwaway script gave about 9 min to SaO2 90% after pre-oxygenation, about
1 min on air, about 4 min when obese; published figures below): one alveolar store, arterial and venous blood pools,
tissues.

- **Lung store** of volume FRC holding O2, CO2, N2, agents and N2O (fractions sum to 1); each breath mixes inspired gas
  in; uptake to blood by the end-capillary equilibrium. Alveolar dead space dilutes expired gas.
- **Blood:** end-capillary content from PAO2 by **Severinghaus 1979** (S = 1/(23400/(P³ + 150P) + 1)) [V] with the
  Okada 1977 virtual-PO2 shift for pH, temperature and base excess (check the sign convention on implementation) [V];
  dissolved 0.03 mL/L/mmHg; shunt mixes venous blood in; Fick for the venous pool.
- **Defaults** [V/S]: VO2 3.5 mL/kg/min awake, −25 to −35% under GA (Jakobsson 2021); RQ 0.8; shunt 2–5% awake,
  5–10% (up to 17%) under GA from atelectasis (Tokics 1987; Hedenstierna 2010), lowered by PEEP and recruitment [D];
  anatomical dead space 2 mL/kg; Vd/Vt about 0.3.
- **CO2 stores:** a fast store (blood and vessel-rich tissue, capacitance chosen so apnoea gives about 3.4 mmHg/min)
  and a slow store (hours) [S, Farhi & Rahn 1955; D for the values]. In apnoea, alveolar CO2 rises to venous within the
  first minute, then everything climbs together. Targets: +12 mmHg in the first minute, then +3.4 mmHg/min (Stock 1989)
  [V]; with high-flow nasal oxygen, about 1.1–1.8 mmHg/min (Patel 2015; Gustafsson 2017) [V].
- **Acid-base:** pH from Henderson–Hasselbalch (HCO3 24 at rest); metabolic acid from lactate when O2 delivery falls
  below a critical level, from MH and from massive transfusion; potassium from suxamethonium (+0.5 mmol/L [U]), MH,
  transfusion and acidosis [D]. Blood gases on request after a 2-minute point-of-care delay [D].
- **Apnoea targets** (healthy adults, full pre-oxygenation unless stated):

| Patient | Time to SaO2 90% | Source |
|---|---|---|
| Healthy 70 kg | about 8 min | Benumof 1997 [V]; DAS 2015 |
| Healthy, breathing air | 1–2 min | DAS 2015 [V] |
| Moderately ill adult | about 5 min | Benumof 1997 [V] |
| Morbidly obese | 196 s vs 595 s in controls (Berthoud 1991); 163 s vs 364 s (Jense 1991) | [V] |
| Term pregnant | 4 min 52 s vs 7 min 25 s | McClelland 2008 (model) [V] |
| Below 90% | falls about 30%/min (open airway 26, obstructed 33) | Hardman & Wills 2006 [V] |
| Open airway, 100% O2 (apnoeic oxygenation) | time to SaO2 50% 66 min vs 11 min (Hardman 2000 model); high-flow nasal O2 median 14 min apnoea without desaturation (Patel 2015) | [V] |

- **Pre-oxygenation:** FAO2 approaches FiO2 with τ = FRC/alveolar ventilation (FRC 2.5 L: half-time about 26 s at
  4 L/min) [V, Benumof 1999]; target EtO2 ≥ 0.9 after about 3 min of tidal breathing or 8 deep breaths in 60 s (Baraka
  1999); a leak (beard, poor seal) lowers it [V].
- **Pulse oximeter:** finger delay about 30 s (ear or forehead 10–20 s), longer with low cardiac output,
  vasoconstriction or cold (finger 130 → 215 s with mild hypothermia, MacLeod 2005); averaging about 8 s; display every
  1–2 s; accuracy falls below 80% (reads low around 55%); no reading when perfusion index is very low (healthy median
  1.4%; under 1.4 poor perfusion, Lima 2002) [V, values rounded]. Skin pigmentation bias and methaemoglobin (reads
  towards 85%) are teaching notes, not modelled at first [V].
- **Capnography:** EtCO2 = PACO2 diluted by alveolar dead space; PaCO2 − EtCO2 normally 2–5 mmHg, about 0 in pregnancy
  [V, Shankar]; the gap widens when pulmonary perfusion falls (EtCO2 tracks cardiac output at fixed ventilation,
  slope 0.73, Isserles & Breen 1991 [V]). Waveform shapes for the synthesiser: normal (phases I-III, plateau with a
  slight slope), bronchospasm shark fin, rebreathing (raised baseline), curare cleft, oesophageal intubation (a few
  falling breaths then nothing, Linko 1983), CPR (under 10 mmHg = poor compressions, aim over 20; a jump at ROSC, Falk
  1988; Meaney 2013), MH (rising despite more ventilation) [V].

## 9. The airway

- **Assessment features** per patient (Mallampati, mouth opening, thyromental distance, neck movement, BMI, teeth,
  beard, history) → hidden true difficulty: mask ventilation grade, laryngoscopy view (Cormack-Lehane) by direct and
  video laryngoscope, SAD seal, front-of-neck anatomy. Drawn from the `airway` sub-stream given the features [D];
  incidence anchors are in `research/crises.md`.
- **State machine:** patent → partial obstruction (sedation: the pharynx collapses as propofol deepens, abruptly near
  loss of consciousness; Eastwood 2005, Hillman 2009 [V]) → complete obstruction; relieved by jaw thrust, chin lift,
  oropharyngeal or nasopharyngeal airway, CPAP, a device. Devices: face mask (seal quality), SAD (size, seal pressure,
  leak), tracheal tube (size, depth, cuff; oesophageal or endobronchial placement possible), front-of-neck access.
  Laryngoscopy takes time (20–40 s attempts [U]) during which there is no ventilation; each attempt adds airway trauma
  that worsens later views [D].
- **Laryngospasm:** risk rises with stimulation in a light plane, secretions, blood, extubation; closure is complete or
  partial; desaturation in more than 60% of reported events, bradycardia 6% (23% in infants), pulmonary oedema 4%
  (Visvanathan 2005) [V]; negative-pressure pulmonary oedema follows forceful efforts against a closed glottis [V].

## 10. Temperature

- Two compartments: core (trunk and head, about 66% of mass) and periphery, with a core-peripheral heat conductance
  that rises with vasodilation [S, Sessler]. Heat production about 1 kcal/kg/h awake, lower under GA [U]; losses by
  exposure, ambient temperature (theatre default 21 °C [D]), cold fluids (1 L at 21 °C lowers mean body temperature
  about 0.28 °C, from specific heat 0.83 kcal/kg/°C [D arithmetic]); forced-air warming adds about 40–64 W net (Bräuer
  2002) [V].
- **Targets** [V]: core −0.5 to −1.5 °C in the first 30–60 min (−1.6 °C in hour 1, 81% from redistribution, Matsukawa
  1995); then −0.5 to −1 °C/h; a plateau near the anaesthetised vasoconstriction threshold (about 34.5 °C, Kurz 1995);
  with forced-air warming a nadir about 35.7 °C in the first hour, then rising (Sun 2015). Propofol lowers the
  vasoconstriction threshold about 0.6 °C per mcg/mL (Matsukawa 1995).
- MH: core rises 1–2 °C every 5 min when fulminant (Rosenberg 2007, 2015) [V], later than the CO2 rise.

## 11. Conditions (what a crisis switches on)

Each is a small process in `conditions.js` with a level and its effects on the subsystems above; scenarios set its
onset and size, treatments act on the process or on the physiology (never on the monitor numbers). Signatures,
expected actions and doses: `SCENARIOS.md`.

| Condition | Process | Effects |
|---|---|---|
| Anaphylaxis | mediator level rising after the trigger, decaying slowly; adrenaline lowers release and reverses effects | SVR and venous tone fall, capillary leak (plasma loss), bronchospasm (R up), tachycardia, rash and oedema (Examine) |
| Bronchospasm | airway resistance multiplier | Ppeak up (Pplat less), shark-fin capnogram, auto-PEEP, falling Vt in PC, hypoxaemia |
| Laryngospasm | glottic closure (partial or complete) | no ventilation, desaturation, bradycardia in children, possible pulmonary oedema |
| Haemorrhage | bleed rate (mL/min) from the veins | volumes fall; reflexes respond; Hb falls with dilution |
| Malignant hyperthermia | hypermetabolism level (VO2 and VCO2 ×2–5 [U]), rigidity, potassium, acidosis; dantrolene stops it | EtCO2 rises despite ventilation, tachycardia, arrhythmias, later temperature |
| LAST | plasma local anaesthetic (PK); CNS and cardiac effects by concentration [V thresholds: lidocaine CNS signs from about 6 mcg/mL, cardiovascular over 10; bupivacaine free about 0.3 mg/L, ropivacaine free about 0.6 mg/L]; lipid adds a sink and raises clearance 1.5–2× [S/D] | CNS signs (Examine) and seizures, QRS widening, bradycardia, VT/VF, contractility down |
| Tension pneumothorax | pleural air volume growing with positive pressure | compliance falls, venous return falls (pleural pressure), shunt rises, distended neck veins and absent breath sounds (Examine) |
| Airway difficulty | the hidden airway features above | CICO when mask, SAD and tube all fail |
| Endobronchial / one-lung | one-lung ventilation | shunt up, compliance down |
| Residual block | patient relaxant sensitivity, late top-up | weak breathing, upper-airway obstruction, low TOFR after extubation |
| Awareness risk | delivery failures: vaporiser empty, IV line tissued or disconnected, pump stopped | effect sites fall, autonomic signs, movement if not paralysed |
| Vagal reflexes | pneumoperitoneum insufflation, oculocardiac, second suxamethonium dose | bradycardia to asystole |
| Arrest | from any of the above, or primary | VF / PEA / asystole; CPR gives a fraction of normal CO (EtCO2 10–20 mmHg with good compressions [V]) |

## What is not modelled (first version)

Children and pregnancy (parameters exist; scenarios later), regional and neuraxial blocks other than the LAST
scenario, renal and hepatic drug handling beyond the fixed models, coagulation (only a simple TXA and products
timeline in the haemorrhage scenario), cerebral physiology, the EEG (the BIS page does that), cardiac output monitors,
transfusion reactions, drug errors other than the scripted awareness scenario, and the surgeon. Each scenario's
debrief lists what it simplifies.
