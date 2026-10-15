# OT simulator notes

Lasting decisions for `ot-sim/`. Status and next steps: `STATUS.md`. The build brief for autonomous sessions: `PLAN.md`.

## Purpose and audience

- A teaching simulator of an anaesthetic in the operating theatre: induce, maintain and wake a synthetic patient with a
  general anaesthetic, watch a vitals monitor respond to what you do, and manage crisis scenarios (owner, 14 Oct 2026).
- For anaesthesia residents and new MOs. It teaches recognition and first response; it is not a clinical tool and never
  gives advice for a real patient. Say so on the page.
- One static site: no data, no sign-in, no storage beyond per-device settings. All patients are synthetic.
  Public repo: no real patient, case or hospital data, and no names.
- Lives at `anaes.anawj.com/ot/` (topic subdomain, shared with `/bis/`; `worker/routes.js`). Unlisted: `noindex`, never
  linked from the homepage. Relative paths only.
- Related: `bis-dsa/` (processed EEG; reuse its engine ideas, fonts and monitor look rather than redoing them).

## Principles

- **Physiology first, scenes second.** One patient model (pharmacokinetics and pharmacodynamics, haemodynamics,
  respiration and gas exchange, temperature) drives every number and waveform. A crisis is an event that changes the
  model (anaphylaxis lowers vascular resistance and raises airway pressure), never a canned script of numbers. The same
  model must therefore behave sensibly when the trainee does something unexpected.
- **Deterministic and seedable.** The model takes a seed and a fixed time step (`dt`), so a run replays exactly and
  tests can assert on it. Rendering reads the model; the model never reads the screen.
- **Faster than real time** is a feature (a 4-hour case in minutes) but the speed multiplier must not change the
  outcome, only how often the model steps (fixed `dt`, more steps per frame).
- **Teach, don't test, by default.** A debrief after each scenario: timeline of events and actions, what was missed,
  and the teaching points, with sources. No scores that reward speed over safety.
- **Sources for every clinical number.** Doses, thresholds, drug parameters and crisis management steps cite a
  source in code comments, with the spec and its sources in `MODEL.md` and `SCENARIOS.md` (published PK/PD models; the AAGBI/ANZCA/SAGES/Difficult Airway Society and
  resuscitation guideline pages; Miller; Morgan & Mikhail). Flag anything unsure for the owner's clinical read-through;
  the owner checks all clinical content before it is described as reviewed.
- Singapore practice by default (owner is at NUH): units mmHg, kPa not used; temperatures °C; drugs by generic name;
  Mallampati, ASA, Cormack-Lehane as taught here. Metric doses (mg, mcg).
- Dark monitor, like the BIS page: near-black screens, standard colour coding (ECG green, SpO2 cyan, NIBP/ABP red/white,
  EtCO2 yellow/white, resp white, temperature). No standard sets monitor colours (APSF): agents follow the ISO 5360
  vaporiser and bottle code (sevoflurane yellow, desflurane blue, isoflurane purple), gases the ISO 32 cylinder colours
  (O2 white, N2O blue, air black/white), and syringe labels ISO 26825. Phone first (390 px) then desktop, tablet
  landscape works.
- Accessibility: axe clean; every alarm has a text message as well as sound/colour; respects `prefers-reduced-motion`;
  sound is off until the user turns it on (browsers block autoplay anyway).

## Layout of the code (intended; the full plan is DESIGN.md, the model MODEL.md, the crises SCENARIOS.md)

- `index.html`: shell and styles; `js/` ES modules, no build step, no dependencies (GitHub Pages / Workers serve files
  as they are; the editor and previews need that).
- `js/model/` (pure simulation, no DOM, importable by Node tests), `js/ui/` and `js/scenarios/` (one data module per
  scenario, format in `SCENARIOS.md`): the file list and responsibilities are in `DESIGN.md` "Files", which supersedes
  the first sketch here (14 Oct 2026).
- `test/*.test.mjs`: model tests in Node (fast, no browser). `test/e2e.mjs`: browser smoke and flows with axe.

## How to test

- `tools/test-ot-sim.sh` runs the repo check, the model tests and the browser test (starts its own static server).
- `node ot-sim/test/<name>.test.mjs` for one model test. Browser: Playwright is preinstalled in cloud sessions
  (`PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright/index.mjs`, Chromium in `/opt/pw-browsers`; do not run
  `playwright install`).
- Phone screenshots (390 px) of every UI change go in the PR (AGENTS.md "Show it").

## Stubs in place (replaced by their PR, DESIGN.md "PR order")

- `js/model/vitals.js` (M0.1): steady awake SpO2, breathing, EtCO2 and temperature with seeded noise, and breaths.
  Heart rate and blood pressure moved to `rhythm.js` and `cardio.js` (M2.1); the rest moves to `gas.js` and `resp.js`
  (M2.4) and `temp.js` (M2.6). `synth.js` and `monitor.js` read `state.vit` for those until then.
- The Patient tab's stimuli and "Talk" (M1.4): replaced by the airway (M3.1) and the case flow with Examine (M3.2).
- MAC fraction reads `vol.mac` (0 until M2.5), so the volatile terms in `pd.js`, `resp.js`, `gas.js` and `cardio.js`
  stay off until then; the GA tests set `vol.mac` by hand. The airway (`aw.obstruction`) arrives in M3.1; until then
  `resp.open` is true and the Patient tab's obstruction is only reachable in tests.

## Decisions log

- 15 Oct 2026 (M2.4): `gas.js` (one lung store that collapses when obstructed, two blood O2 pools so SaO2 falls at a
  realistic rate, a CO2 body store) and `resp.js` (Bouillon drive with the slope flattened, the ventilator closed-form,
  pleural pressure to the circulation). Apnoea: healthy preox about 8.6 min, air about 1 min, obese 130 kg about 3.5
  min; CO2 about 3-3.4 mmHg/min. Known misses, recorded in MODEL.md: no first-minute CO2 venous-equilibration jump
  (first minute about 3, not 8-12); open-airway apnoeic oxygenation lasts over 20 min (no CO2 feedback into the
  alveolar gas equation yet). VO2 scales with a metabolic weight (IBW plus 0.3 of the excess). The monitor's SpO2 has
  a probe transport delay (25 s, longer at low output) so the displayed fall lags the arterial one. UI: a Breathing
  tab (O2, ventilator), Paw/PEEP/MV on the monitor. `vitals.js` is now only temperature.

- 15 Oct 2026 (M2.3): `vaso.js` holds receptor activations (Emax/EC50 per drug, combined as independent fractions)
  and their mapping to SVR, venous capacity, heart period and contractility; `cardio.js` applies them through the
  existing reflex. PK in `pk.js` MODELS, short and [D] except the cited clearances and half-lives; phenylephrine keeps
  the prototype's 5 L front end and a 20 s transit delay. Ephedrine releases noradrenaline from a store that runs down
  (tachyphylaxis). Vasopressin is dosed in units (`mU` internally). Metaraminol is in the catalogue but hidden (not on
  the HSA register; owner question). Known gaps: a noradrenaline infusion takes about 5 min, not 1-2, to wear off
  (its level sits near the EC50); esmolol slows a resting heart only about 4/min, because resting HR here is mostly
  vagal (it does blunt a stimulated rise, tested). Vasoactive rows sit on the Circulation tab with ISO 26825 colours
  (vasopressors violet, hypotensive agents violet stripes, anticholinergics green).

- 15 Oct 2026 (M2.2): `fluids.js` is called by `cardio.js` (state `cv.fl`), so volume stays in one slice; everything
  enters or leaves through the veins. Crystalloid excess `cx` leaves to the interstitium and urine at Hahn's
  MAP-dependent rates (k21 taken as 0); colloid leaves with t½ 2.5 h; red cells add 280 mL and 56 g of Hb; bleeding
  removes whole blood (Hb, crystalloid and colloid in proportion). Bags run at 50 mL/min, a red-cell unit over about
  10 min [D]. Haemorrhage reproduces the prototype awake; the GA haemorrhage test sets `vol.mac` 1.6 by hand until
  M2.5 (sevoflurane's own drives get tuned there). Stub until scenarios (M4): surgical bleeding on the Patient tab.

- 15 Oct 2026 (M2.1): `cardio.js` as in MODEL.md section 5 (as-built notes there): the prototype's structure and
  numbers reproduce (steady state exact, propofol 2 mg/kg SBP −17.9 at 2 min, steady Ce 1 −10.5%). `pd.auto` became a
  graded response, because a probability could not give the laryngoscopy rise; brief stimuli now last 60 s. Beat
  events now come from `cardio.js` (with stroke volume and pressures); `rhythm.js` keeps exact beat times with 1.5%
  beat-to-beat variation. `createSim` takes `dt` for tests. Cost about 13 µs a step with two pumps running (2.6 ms of
  CPU a second at 20x).

- 15 Oct 2026 (M1.4): `pd.js` holds hypnosis (asleep when P(no response to voice) > the patient's q), the stimulus
  surface (movement at stimulus onset when P(no response) < q and the thumb twitch is over 10%), the BIS-like index
  (arousal adds up to 8) and `pd.auto` (a second surface at 1.6 x with the opioid C50 0.5 ng/mL, from the MAC-BAR
  ratios; rises with a 20 s and fades with a 90 s time constant; brief stimuli last 30 s, surgery runs until stopped,
  intensity 0.6-1.0, default 0.8). The volatile term reads `vol.ce.sevoflurane` once M2.5 exists (MAC40 1.80%). Stub
  until M3.1/M3.2: the Patient tab (talk, stimuli, events); "Talk" reads the state and logs nothing. Midazolam and
  ketamine have no hypnotic effect yet: MODEL.md section 4 gives no surface for them (a research step before the
  case flow, M3.2).

- 15 Oct 2026 (M1.3): neuromuscular drugs live in `nmb.js` (state `pk.nm`), the readout in `pd.js` (`pd.nmb`), the TOF
  module in `monitor.js` (every 15 s; PTC on request, once per 2 min). The TOF readout is fitted to acceleromyography,
  because every reversal trial used it; that forced a retune: rocuronium ke0 0.2 on / 0.9 off (onset: 80% block at
  0.92 min; sugammadex 2 mg/kg at T2 1.36 min, 4 mg/kg at PTC 1 2.2, 16 mg/kg 1.5), neostigmine max x 2, EC50 20.
  Known misses, recorded in MODEL.md: spontaneous T2 to TOFR 0.9 50 vs 21 min (Sorgenfrei 2006, small placebo arm),
  neostigmine from a deep block 32 vs 50 min (Jones 2008). Suxamethonium: cholinesterase as `patient.che` (profile
  `che`: 0.5 heterozygous, 0.01 homozygous); phase II fades from 3 mg/kg total. Glycopyrrolate and atropine (with
  neostigmine) come with the vasoactive drugs (M2.3); suxamethonium's potassium rise comes with `gas.js` (M2.4).

- 14 Oct 2026 (M1.2): the pump's effect-site TCI runs in two phases. While loading it targets the predicted
  effect-site peak (Shafer & Gregg style); once the prediction reaches the target it holds plasma at the target.
  Peak-targeting alone switched between bursts and zero every 10 s. A running pump keeps its model. Syringes are
  propofol 10 mg/mL and remifentanil 50 mcg/mL, maximum 1200 mL/h (to confirm with NUH pumps). Drug rows carry the
  ISO 26825 class colour as a stripe, with the class written beside the name. The Drugs and Circulation tabs follow
  the ARIA tabs pattern (arrow keys, Home, End). "Behind the monitor" is closed by default and remembered per device
  (`otsim.behind`). The monitor does not respond to drugs until M1.4 and M2.1.

- 14 Oct 2026 (M1.1): `pk.js` steps only drugs that have been given. Amounts are in mg (propofol, ketamine) or mcg
  (opioids, midazolam), so concentrations read in the papers' units. The patient's PK multipliers act on V1 and the
  metabolic clearance only (inter-compartment clearances stay). Context-sensitive half-times are tested as Hughes
  1992 defines them (plasma held constant, then stopped); a constant-rate infusion gives a shorter 8 h value.
  Alfentanil (Maitre PK, ke0 0.77) peaks at about 2.6 min, not Miller's 1.4 (Scott PK): recorded, not tuned, like
  midazolam; on the clinical read-through list.

- 14 Oct 2026 (M0.2): the default seed is 1 when the URL has no `?seed`, so first frames (and PR screenshots) repeat;
  free runs with a new patient each time can come with the library (M3.2). The warm start keeps its last events with
  negative times, so the lanes have a full sweep of history at t = 0. The lanes draw at device-pixel resolution and
  keep the extreme value within each pixel (otherwise R waves vary in height on phones). The ResizeObserver refills a
  lane only when its canvas size changes (numbers changing must not wipe the sweep). Pause is an icon button (the
  phone top bar fits on one line). NIBP: 5-minute cycle by default, a reading takes 30 s, a manual start restarts the
  cycle timer. In browser tests, wipe and count a canvas inside one `page.evaluate`: Chrome can repaint a GPU canvas
  between evaluations.

- 14 Oct 2026 (M0.1): the owner said go. Blood volume indexing starts above BMI 25 (not 22) so the default patient is
  4.9 L. `vitals.js` is a placeholder (steady values plus noise, beats and breaths) that later PRs replace system by
  system. `tools/test-ot-sim.sh` runs every `test/*.test.mjs`, so new model tests need no wiring.

- 14 Oct 2026: folder `ot-sim/`, address `anaes.anawj.com/ot/`, plain ES modules with no build step, model separate
  from UI so Node tests can run it. Environment prepared (routes, labels, checks, test runner, build brief).
- 14 Oct 2026 (plan, owner asked for a plan before any build): technical plan in `DESIGN.md`, model spec in `MODEL.md`,
  crises in `SCENARIOS.md`, sourced research notes in `research/`. Its choices are proposals until the owner says go;
  the open questions and their defaults are at the end of `DESIGN.md`. Main ones: a lumped mean-value circulation with
  per-beat stroke volume (not a pulsatile solver); waveforms drawn from the model's beats at 1x and at real pace from
  the current state at 5x and 20x; `fmath.js` so replays match on every browser; the patient runs Schnider and Minto
  while the TCI pump runs the model the trainee picks; sevoflurane MAC40 2.05%; Singapore defaults SRFAC 2021, DAS 2025,
  ANZAAG 2022, Association of Anaesthetists blood components 2024. The brief's Marsh example was corrected (it mixed
  ke0 0.26 and 1.2).
- 14 Oct 2026 (plan revised after two reviews, prototypes and a source check; `research/prototypes.md`): sevoflurane
  MAC40 default 1.80% (Japanese adults 1.68–1.71% are the closest data to a mostly Chinese population; 2.05% the US
  label); metaraminol off by default and the dantrolene product an owner question (neither is on the HSA register);
  SRFAC 2021 gives adrenaline early, not tied to a shock number; rocuronium needs a directional effect site and
  suxamethonium a faster ke0 than Roy 2002 to meet published times; sugammadex binding solved as equilibrium; one
  hypnosis rule and one sensitivity quantile per patient; gas.js owns the lung store for every species; Jacobi step
  (every subsystem reads the previous step); `fmath.js` measured bit-identical on V8 and JavaScriptCore; the PR order
  now puts gas exchange before volatile agents and adds scenario drugs (M4.0) and resuscitation (M2.8). "What is not
  modelled" and the known misses are kept in `MODEL.md`.

## Permissions for unattended sessions (14 Oct 2026)

`.claude/settings.json` allows what a milestone loop needs without a prompt: the test scripts (`tools/test-*.sh`,
`node ot-sim/test/*` and other apps' tests), local static servers and `curl` to localhost, `git add/commit/checkout/
merge origin/main/pull`, pushes to `claude/*` branches, reading sources (web search and fetch, PubMed tools), and the
PR loop (open, update, read checks, merge your own PR). Sessions may edit `.claude/settings.json` to keep this list
current (owner's OK, 14 Oct 2026); widen it only for what the work needs, and say what you added in the PR.
It still **asks** for Codex, Firebase and anything that signs in to a live project (`CLAUDE.md`); never add allow rules
for a force-push to `main`, secrets or live-project sign-in.
Firestore rules (owner, 14 Oct 2026): a session may merge a PR that changes a `firestore.rules` without waiting for the
owner, because rules and data are the owner's biggest headache and he does not want to intervene. Do it carefully: run
`tools/test-rules.sh` (local emulator, fake accounts) first, merge only when the Checks are green, then confirm the
"Deploy Firestore rules" run succeeded, and say in the report which rules changed and what they now allow or deny. The
deploy compiles the rules first, so a syntax error leaves the live rules as they were. `ot-sim/` itself has no
Firestore (no data, no sign-in).
The permission *mode* is set in the app, not in the repo: pick **Auto** from the mode dropdown when starting the build
session. Settings are read from `main`, so they apply to new sessions once the PR is merged.
Network (checked 14 Oct 2026): GitHub, npm, PubMed/NCBI, ANZCA and MHAUS are reachable. If a guideline site is denied,
the owner adds the host under Allowed domains in the environment settings.
