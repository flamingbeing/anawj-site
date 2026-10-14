# BIS to DSA notes

Lasting decisions for `bis-dsa/`. Status and next steps: `STATUS.md`.

## Purpose and audience

- Anaesthesia residents learning processed EEG: how the frontal EEG becomes the BIS number and the density spectral
  array (DSA), and how to read the DSA for propofol, sevoflurane, ketamine and dexmedetomidine (owner, 14 Oct 2026).
- One static page, no data, no sign-in, no storage. Synthetic EEG only.
- Always dark, like an anaesthetic monitor (owner, 14 Oct 2026); BIS big on the left, SR/SEF95/EMG stacked on the right.
- Screen order like a BIS monitor (owner, 14 Oct 2026): BIS and EMG trends, then DSA above, raw EEG below; a view
  toggle (DSA + EEG, DSA + BIS, EEG) shows one large.
- Monitor look (owner, 14 Oct 2026; made closer to a BIS Complete/VISTA, Oct 2026): bezel, status line ("BIS · Case
  AH5F", message region, clock), BIS with SQI and EMG segment bars, SR/SEF/TP/BC row, soft keys.
- **SQI** = 98 − 160 × share of artefact seconds in the last 63 s; 5 bars of 20 (green ≥ 50, amber 15–49, red < 15).
  An artefact second has any sample over 300 µV, or a diathermy burst or its 1-s settling tail. Artefact seconds are
  left out of BIS, SR, SEF and TP (TP holds). BIS shows hollow under SQI 50; under 15 BIS, SEF, SR, TP and BC show `--`
  and the BIS trend line breaks. 15 is the conventional blanking threshold; it is not stated in the Covidien manual.
- **EMG** (dB re 0.0001 µV², shown like the monitor's 70–110 Hz band): a parametric muscle term,
  `27 + 10·log10(1 + 12·tone + 52·emg + 250·diathermy share)` ± 1.5 dB. Tone is 1 awake (hypnotic depth under 0.3),
  falling to a residual 0.12 by depth 0.5, and 0.05 when paralysed (τ 5 s). Levels: awake ~38, GA ~31, relaxant ~29,
  facial EMG ~52, diathermy bursts +15–25 dB. Ketamine's gamma does not count. Not held during artefact. 4-bar bar:
  empty under 30 dB, then 30–38, 39–47, 48–55, over 55. The 30–47 Hz EMG power is still injected into the EEG, which is
  what pushes BIS up.
- **Diathermy**: 1–2.5 s bursts every 4–8 s of broadband noise clipping at ±400 µV, each followed by a 1-s decaying
  offset; bright DSA stripes; SQI settles around 15–35 (hollow, sometimes `--`).
- **Blinks and eye movement** (checkbox, off by default; Medtronic BIS reference guide): one-sided 300-ms deflections
  of 110–190 µV every 2–6 s (1 in 12 is 310–370 µV and trips the 300 µV artefact flag), plus a slow drift (SD 12 µV,
  τ 0.8 s). The DSA and raw EEG show them; BIS, SEF and SR use the epoch after the monitor's blink rejection, modelled
  as taking away 85% of the blink and drift the engine added (`EYE_REJ`; a proxy, the real detector is proprietary).
  Awake: SQI ~94, BIS ~89 (−4 to −6), 0.5–2 Hz much brighter. On in the case's pre-induction and emergence steps.
- **Surgical stimulus** (button; García 2021, Hight 2019): `Engine.stimulus(kind)`, a 100-s arousal applied to the
  target each sample. Blunting b = remi/4 (mix mode only; single drugs b = 0). Hypnotic depth under 0.5: beta at 18 Hz
  (`ar` term, +8·(1−b)) and facial EMG (unless paralysed), BIS +10–20. Depth 0.5 or more: alpha ×10^(−0.35·(1−b)) (an
  alpha dropout, about −3 dB in 8–12 Hz), or 1 in 10 a paradoxical delta arousal (delta ×2, beta ×0.5; BIS falls). The
  button shows pressed while it runs and the reading adds a sentence.
- **Messages** (`monMsg()`, wording from the BIS Complete manual): high (red, flashing; solid with reduced motion):
  "Isoelectric EEG Detected" (every second flat for 60 s), "BIS Out of Target Range – Low/High" (shown BIS outside
  40–60 for 10 s with a GA-level propofol/sevo hypnotic, depth ≥ 0.44, so not for sedation, dex or ketamine; once
  shown it clears only when BIS is back inside 42–58; only with the target band on); low (yellow): "Data unavailable due
  to poor signal quality" (SQI < 15), "Excessive Artifact Detected in Signal" (SQI < 50); info (grey): "Smoothing Rate
  Changed to xx Seconds" for 5 s. `#vMsg` is `aria-live`, updated only when the text changes.
- **Trend**: BIS thick white on a 0–100 left axis, EMG thin green on a 30–80 dB right axis, artefact bar along the time
  axis (amber SQI < 50, yellow blanked), clock times (hh:mm) at both ends. The monitor clock is sim time (the warm
  start ends at the real time), so the axis matches at any speed. Target band 40–60 "set by user" is a teaching
  default; real monitors default to Inactive.
- **DSA**: SEF95 white line and MF (SEF50, 50% of 0.5–30 Hz power) purple `#b47cff` line, numbers top right, δ θ α β
  labels on the right edge. SEF and MF (lines, numbers, SEF tile) are a moving mean over the smoothing window of
  unsuppressed, clean seconds, and blank (`--`) after 30 s without one (a long flat EEG). MF is drawn thinner at 70%.
- **EEG lane**: ±100 µV full height by default (50 µV/div; at ±50 about 11% of propofol GA samples clipped), soft key cycles ±25/50/100/250; about 5 s across on a
  phone, 8 s on a desktop, 1-s ticks; "ARTIFACT" (amber) during artefact seconds.
- **Smoothing** soft key 10/15/30 s (default 15): a moving average of the last N artefact-free raw values.
- **Teaching labels** (Display checkbox, on by default, per device in `localStorage` `bisdsa.teach`): the zone pill,
  the newest-2-s box, the newest-column outline, the colour key and the target band. Zone wording: over 90 Awake, 80–90
  Light/moderate sedation, 60–80 Sedation, 40–60 General anaesthesia, 20–40 Deep hypnotic state, under 20 Burst
  suppression / flat; "Suppression (SR n%)" whenever SR is above 0.
- Opens on an awake patient (owner, 14 Oct 2026): 5 min of awake EEG pre-run so the DSA is full; slider at Awake.
- Monitor first (owner, 14 Oct 2026): the page opens on the monitor (a small title above it), depth slider then drug
  right under it, smaller lanes on phones (`laneH`); the teaching intro follows.

## Address

- `anaes.anawj.com/bis/` (topic subdomain for anaesthesia teaching pages; `worker/routes.js`); custom domain added by
  the owner and checked 14 Oct 2026 (`/bis/` 200, `/` and other folders 404). PR previews: `<preview>/bis-dsa/` or
  `<preview>/_sites/anaes.anawj.com/bis/`.
- The old `anawj.com/bis-dsa/` (GitHub Pages) forwards to it with a top-level-only script at the top of `index.html`
  (path, query and `#` kept; no-op on the subdomain, previews and localhost).
- Relative paths only (the subdomain serves only this folder).
- First published as a private claude.ai artifact; this folder is now the copy to edit.

## How it works (`app.js`)

- `Engine`: a bank of oscillators every 0.5 Hz (0.5–47 Hz) with phase jitter, shaped by a spectral profile per state
  (1/f background plus slow, delta, theta, alpha, spindle, beta, gamma and EMG terms; burst suppression gates the
  signal). `DRUGS` holds keyframes along the depth slider; the live state glides to the target (about 8 s).
- 128 samples/s; every second the newest 2 s (256 samples) gets a Hann window and an FFT; bins 0–30 Hz become one DSA
  column (turbo colour map, -3 to 31 dB: awake is dim blue with speckle).
- Awake EEG is small (about 10 µV RMS, one shared `AWAKE` keyframe); propofol GA is about 3× the amplitude (Purdon
  2015: anaesthetised EEG has 5–20× the power).
- BIS shown is a **teaching model**, not the proprietary algorithm: a linear fit on SEF95, fast-power fraction,
  30–47 Hz fraction, slow and alpha fractions, pulled towards 30 by √(SR/40) while SR is under 40 (Bruhn 2000: BIS about flat there, near
  30, and never rising with depth), stretched, then averaged over the last 15 clean seconds. **Bruhn rule**: from SR
  40% BIS is at most `50 − SR/2`, which meets the pull at 30 with no jump. Suppression shows with BIS in the 30s.
- SR as in the BIS manual: each second is split into four 0.25-s sub-blocks; a sub-block is suppressed if it stays within
  ±5 µV of its mean; SR is the suppressed share over the last 63 s (`features().supFrac`). BC (bursts per minute) shows
  `--` when SR is under 5 or SQI under 50.
- Burst suppression gate (`Engine`): bursts last 0.5–3 s; flat runs last 1–3 s at `bs` 0.5, growing to 10–30 s near 1;
  above 0.97 the EEG is isoelectric. Propofol suppression starts after depth 0.8 in a young adult (0.68 when older).
- **Proxies (teaching-model honesty):** the stand-in BIS formula above; 128 samples/s (the real monitor samples faster);
  the EMG readout is a parametric muscle term, not the monitor's measured 70–110 Hz band (the 30–47 Hz muscle power in
  the EEG is what moves BIS; the intro and explainer step 1 say so); blink rejection as a fixed 85% subtraction; the
  warmer as a fixed noise term. SQI blanking at 15 is a convention, not in the Covidien manual.
- Check the tuning with `node bis-dsa/test/engine.check.mjs` (runs the engine in Node, no browser, about a minute; also in
  the Checks workflow). It prints the table below, plus SQI, messages, MF and smoothing rows.
- The footer says it is a teaching approximation; keep that.

## Drug mix (owner, 14 Oct 2026)

- "Mix drugs" mode: sliders for propofol (effect-site µg/ml), sevoflurane (MAC), remifentanil (ng/ml), ketamine and
  dexmedetomidine (share of an anaesthetic / deep-sedation dose) and N₂O (%), plus presets. `mixTarget()`: propofol
  (×0.155 per µg/ml) and sevo (MAC → depth: 0.3→0.30, 0.5→0.44, 1.0→0.60, 1.5→0.76, 2.0→0.88; `sevoDepth`) add into
  one hypnotic depth (capped 0.95, 0.90 for sevo), blended between the two drugs' keyframes; dex and N₂O add a little
  depth; then ketamine, dex, remi and N₂O add their own signatures. Teaching approximation.
- Remifentanil barely moves BIS at rest (Guignard 2000); it blunts EMG and arousal. Only above 4 ng/ml does it add a
  little depth, and above 6 ng/ml some delta and slow power.
- Ketamine with a hypnotic: gamma and ~31 Hz beta on top, less alpha, less slow and theta; with little or no hypnotic it
  blends to the single-drug ketamine keyframes, so mix ketamine 100% reads like single ketamine. Ketamine anaesthesia
  alternates gamma bursts and slow-delta every 2–5 s (Akeju 2016).
- Dex: spindles 0.5–2 s every 3–8 s, centre 11–14 Hz per burst; much weaker slow power than propofol (Akeju 2014).
- N₂O: a little 30-Hz-ish gamma and beta, slightly less alpha and slow (Hirota 2006; Foster & Liley 2011), plus a little
  depth; sevo + N₂O reads within a few points of sevo alone.
- Older patient (Purdon 2015): all power lower, alpha about 9 dB lower and 1 Hz slower (0.5 Hz with sevo), and
  suppression appears at a lighter depth (the `bs` term is taken from depth + 0.12).

## Muscle relaxant (owner, 14 Oct 2026)

- "Muscle relaxant (paralysed)" removes the EMG term and most of the awake fast activity at once (stage 1: gamma
  ×0.05, beta ×0.25), overriding "Facial muscle activity". Stage 2 (`Engine.nmbS`): 60 s after the relaxant, while the
  hypnotic depth is under 0.3, a slow state rises with τ 120 s (falls with τ 30 s once the relaxant is off): beta and
  gamma fall further, beta slows, slow and delta power appear. Awake + relaxant: ~83 at 60 s, ~52 at 5 min, back above
  85 two minutes after reversal. This follows the volunteer studies: about 80 at once, then 44–47 minutes later
  (Schuller 2015), as low as 33, and 9 in one repeat (Messner 2003). Teaching point: a low BIS does not prove
  unconsciousness in a paralysed patient.

## Tuning targets (steady state, mean of the last 30 s; `test/engine.check.mjs`)

| State | BIS | Other |
|---|---|---|
| Propofol awake | 90–97 | SR 0; EEG RMS 8–12 µV; EMG 35–45 dB |
| Propofol 0.17 | 80–95 | beta (13–25 Hz) above awake |
| Propofol 0.57 | 40–55 | SEF95 12–17 Hz; RMS 25–40 µV and ≥ 3× awake |
| Propofol 0.76 | 30–42 | SR under 5 |
| Propofol 0.90 | 25–36, not above 0.76 | SR 15–55; not capped while SR < 40 |
| Propofol 0.57 > 0.76 > 0.88 > 0.95 | falls at each step | 3 seeds |
| Propofol 1.0 | 0–12 | SR 80 or more |
| Sevo 0.55 | 40–55 | theta peak 4.5–5.5 Hz; alpha 1–3 dB above propofol 0.55 |
| Sevo 1.0 | 15–40 | SR at most 60 (never flat) |
| Ketamine 0.65 | 65–82 | SEF95 ≥ 25; 13–24 Hz not above awake; EMG within 3 dB of awake-paralysed |
| Mix ketamine 1.0 vs single 1.0 | within 6 | |
| Propofol + ketamine preset | 58–70 | |
| Dex 0.4 / 1.0 | 55–72 / 40–58 | 0.4: 0.5–1 Hz ≥ 10 dB below propofol 0.57 |
| Older, propofol 0.57 | young +6 to +12 | 8–12 Hz 8–10 dB lower; alpha peak 0.6–1.4 Hz lower |
| Older, propofol 0.80 / 0.90 | | SR above 0 (young: about 0) / SR 40–95, not isoelectric |
| Awake + relaxant at 60 s / 300 s | 75–85 / 45–62 | EMG under 30 at 60 s; relaxant off again: above 85 after 120 s |
| Propofol 3 ± remi 4 | within 3 | |
| Sevo 0.8 + N₂O 0.6 vs sevo 0.8 | −2 to +3 | |
| Propofol 0.55 + EMG / + relaxant | 62–85 / 40–55 | EMG 48–58 / 25–30 dB; relaxant at 0.45 and 0.55 moves BIS ≤ 3 |
| Clean / diathermy 120 s | | SQI ≥ 90 / under 50; EMG in bursts ≥ 10 dB over clean |
| Propofol 1.0 for 120 s | | SR 100 and "Isoelectric EEG Detected" |
| Propofol 0.8 / propofol 0.35, dex 0.4, ketamine 0.3 | | "Out of Target Range – Low" ≥ 80% of 60 s / never |
| Every state | | MF < SEF95; propofol 0.57 MF 2–8 Hz |
| Smoothing 10 vs 30 s, awake → 0.57 | | within 5 of final ≥ 5 s sooner with 10 s |
| Awake + blinks | 80 or more | SQI ≥ 85; 0.5–2 Hz brighter |
| Surgical stimulus, propofol 0.57 / 0.3 | / rise ≥ 10 | 0.57: 8–12 Hz −2.5 to −4.5 dB; mix remi 4: rise under a third; delta arousal: BIS falls |

## Case story (`STORY`)

Pre-induction with blinks → propofol bolus (paradoxical excitation) → loss of consciousness (two bands) → too deep
(propofol 0.93: burst suppression; BIS in the 30s, under 30 once SR passes 40%, about 60 s in) → infusion reduced → incision with no opioid (alpha
dips, facial EMG, BIS up; surgical stimulus) → analgesia topped up (EMG gone; relaxant only if surgery needs it) →
diathermy for 60 s at 400 s (hollow, `--`, artefact bar; the spec asked for 20 s, but SQI looks back 63 s and only
falls under 50 after about a minute of diathermy) → emergence with blinks → end (570 s).

## Clinical wording and evidence (14 Oct 2026)

- Every clinical sentence follows the research pass (spec phase 2, WS6): relaxant in awake volunteers about 80 at once,
  then mid-40s (Schuller 2015; 33 and 9 in Messner 2003); older patients 2–3× smaller amplitude, alpha ~9 dB lower and
  ~1 Hz slower (Purdon 2015); Bruhn rule (SR 40%); remifentanil no BIS effect at rest (Guignard 2000); ketamine gamma
  27–40 Hz mostly above the 0–30 Hz DSA (Akeju 2016); dex spindles 9–15 Hz; sevo theta ~5 Hz from about 1 MAC; sevo
  at the slider end is "Very deep (over 2 MAC)" (SR 40–60, epileptiform spikes not simulated); single-drug sevo ticks
  read the mix MAC map backwards (0.5 ≈ 0.7 MAC, 0.75 ≈ 1.5 MAC, 1.0 over 2 MAC); BIS lag 15 s to over 2 min (Pilge 2006).
- Pitfall cards each end with a source line (DOI or PubMed links). New cards: "Read SR, not just BIS" (Bruhn 2000) and
  "Validated in adults" (Cornelissen 2015, infants).
- "What the trials say" table, each row linked by DOI: B-Aware 2004, B-Unaware 2008 / BAG-RECALL 2011, NAP5 2014,
  ENGAGES 2019, Balanced 2021 (delirium sub-study; primary outcome 1-year mortality no different, Short 2019), AAGBI/SIVA TIVA guideline 2018, NICE DG6.

## Effect site, target slider, relaxant default, timers (owner, 14 Oct 2026)

- **Fast induction, slow emergence ("unzipping"):** the slider and the mix sliders set a *target* dose. The engine's `de`
  (effect site) follows it with a first-order lag that is fast going up and slow coming down: `TAU_UP` = 12 s (a bolus)
  and `TAU_DOWN` = 120 s (waking takes a few minutes: BIS about 77 two minutes after stopping propofol from GA, above
  90 by five; real half-times are 2-3 min and longer after long infusions). Spectrum then glides to the effect-site state
  with a further 8 s, BIS smooths over 10/15/30 s; 4x/10x speed shortens it. Descriptions, the relaxant, the
  out-of-target alarm and the stimulus follow `de`, not the target. A drug change or a switch between one drug and the mix
  snaps `de`; the story's first step and `snap()` jump it. The **Emergence** key stops every drug (slider to 0, or the mix
  cleared) and shows the wake-up in the caption.
- **Depth slider = BIS target:** under the slider, "Target BIS ≈ n" is a forecast: a throwaway `Engine` started at the
  target, 36 sim-s, same features and `bisRaw` (`forecastBis`, ~70 ms, 180 ms after the last change). Where suppression
  is expected (`bs` over 0.02) it runs 90 s and uses the gate's long-run share for SR (mean flat run 2·10^(2(bs−0.5)) s,
  mean burst 1.75 s, 1/bs bursts a cycle), because flat runs last up to 30 s. It is within a few points of what the
  live monitor settles on. A green band on the track marks depths that settle at BIS 40-60 (17 short forecasts at depths
  0-0.8, one per timeout; recomputed when the drug, older-patient, facial-EMG or relaxant mode changes; none for ketamine
  alone). The ▲ under the track is the effect site; "settling" / "at target" says where it is.
- **Drag bubble:** while the depth slider is dragged (or moved by keyboard), a bubble over the thumb shows "BIS ≈ n" (green inside 40-60), read off a 21-point table (depths 0, 0.05 … 1.0) the zone computation now keeps, or a throttled forecast until the table is ready; it hides about a second after release. One-drug mode only: the mix sliders update the Target BIS line when they stop.
- **EEG sweep and DSA colour range (owner, 14 Oct 2026):** soft key cycles the EEG lane sweep auto/4/8/16 s (buffer 16 s); two sliders set the monitor DSA's colour floor and ceiling in dB (`mon.dbLo/dbHi`, default -3…31, at least 6 dB apart): raise the floor for bluer, lower the ceiling for redder. `dbToX` follows the user's range; `dbToXd` (default) is used by the teaching strips, quiz and explainer. Both are kept per device in `localStorage` (`bisdsa.disp`).
- **Relaxant on by default:** three modes (`mods.nmbMode`). **At induction** (default): given when the induced depth reaches
  0.3 (propofol/sevo depth, ketamine 0.45 dose, mix hypnotic or ketamine; dex alone never) and reversed under 0.25, so the
  awake patient still opens at BIS 90s and the awake paralysis is not on show; **Off** (EMG teaching); **On now** (the
  awake-paralysis pitfall). The engine derives `mods.nmb` from the mode each sample (`updNmb`); the Node checks set
  `mods.nmb` directly and leave `nmbMode` unset.
- **Suppression time box:** cumulative seconds with the shown SR at 5% or more, and with BIS under 40, this case (clean
  seconds only); Reset clears them and the case story starts them at 0. Not on the real monitor: a teaching aid for
  cumulative burst-suppression time (linked to postoperative delirium in observational data; trials are mixed).

## BIS VISTA screen is the default (owner, 14 Oct 2026)

The owner's own monitor is a Covidien (now Medtronic) BIS VISTA-family 2-channel monitor (photos; the model and software
version are not shown in them: ask for Menu > About or the back label). The page opens on a copy of that screen: BIS box
with SQI bars, EMG bar, ST (suppression time, h:mm:ss) and SR boxes, the EEG window (25 mm/sec, 25 µV/division),
message bar with Dismiss, SILENT / MENU / SENSOR CHECK keys, and the DSA with dotted lines at 4/8/13 Hz, white SEF and
purple MF lines, band names, H-L colour bar and the BIS trend under it. Layout is absolute in container units (`cqw`),
from the photos. Menu opens the extra row (smoothing, EEG scale, sweep, trend 5/15/60 min, bottom lane: BIS, BIS + EMG,
BIS + SR). Numbers the real screen does not show (SQI %, EMG dB, TP, BC, zone) sit in the strip under it; "Teaching
layout" in Display is the earlier screen (kept; the e2e test uses it for most checks). `HIST` holds 60 min of columns.
Fonts: bundled look-alikes (`fonts/README.md`): Arimo, Archivo Narrow; the manufacturer's font is not published.
Still to do for the machine switch (BIS Advance, SedLine): left/right engine, ASYM, PSI.

## Lessons

- `fit()` reads each canvas's logical height once (`c._lh`): setting `canvas.height` rewrites the `height` attribute,
  so reading it every frame made the graphs grow until blank on high-density phones (14 Oct 2026). The test runs the
  phone at 3x density for that reason.

## Content

- Clinical text (state descriptions, pattern library, pitfalls, the case story) is in `app.js` and `index.html`.
  Facts to check with the owner before changing: BIS ranges, the age effect on alpha, ketamine and N2O behaviour.

- 14 Oct 2026 (owner): the forced-air warmer control and library card and the "Paradoxical excitation" card were removed (rarely seen); the engine still supports `mods.warmer` but nothing sets it. "Deep sevoflurane" card is now "Sevoflurane" (the depth is in the picture). The d<0.24 state is called "Very light sedation".

## Block readout and case length (owner, 14 Oct 2026)

- **Neuromuscular block** (`nm*` in `app.js`): rocuronium, effective concentration in ED50 units, two-exponential decay
  (fa 0.85, τ 10 and 70 min), Hill slope 4, effect-site lag; timed 6 times faster than real (`NM_K`) and labelled so.
  0.6 mg/kg gives T1 under 6% at about 25 min, 25% at 36 min, 95% at 90 min (real minutes). TOF count, TOFr and PTC are
  read from T1 (an approximation, stated as such). Buttons: rocuronium 0.6, top-up 0.15 mg/kg, sugammadex 2 and 4 mg/kg
  (each mg/kg removes 0.85 units, so deep block is only partly reversed by 2 mg/kg). "At induction" doses once when the
  patient goes under; Off clears the block; Infusion holds a full block. `mods.nmbK` (0-1) scales the EEG effects;
  Emergence gives sugammadex 2 mg/kg. The Node checks set `mods.nmb` directly and ignore `nm`.
- **Case length** (short / medium / long, default medium): the effect site empties with τ 120 s × (1 + (L−1)·sensitivity),
  L = 1, 2.5, 5; sensitivity propofol and dexmedetomidine 0.9, sevoflurane 0.5, ketamine 0.4, remifentanil and N₂O 0.
  A thin dashed "effect site" line on the trend lane (teaching labels on) shows the unzipping.

## Two-sided screens: BIS Advance style and SedLine style (owner, 14 Oct 2026)

- Pick the monitor in Display > Screen layout: BIS VISTA, BIS Advance (two-sided), Masimo SedLine, Teaching layout.
- A second engine `R` runs the right hemisphere beside the left (the page's own variables). `swapCh()` exchanges the two
  sets of per-channel state around `step()` (`stepR`), so the single-channel code serves both. The right engine reads the
  page's settings through `modsR = Object.create(mods)` with its own `side`.
- "One-sided EEG slowing" (None / Left / Right) slows the chosen hemisphere (alpha and beta ×0.35–0.45, slow and delta up)
  so ASYM rises. ASYM here = 100·|PL−PR|/(PL+PR) over the last 30 s total power, shown as a bar.
- Both screens draw L and R EEG, L and R DSA and a trend. Advance: BIS L and R boxes with SQI bars, SR, EMG bars, ASYM, two
  trend lines. SedLine: PSi (a straight-line stand-in, `psiOf`: BIS 40–60 → PSi 25–50; not Masimo's algorithm), SR, EMG and
  ARTF per side, ASYM, PSi trend with the 25–50 band. Layouts come from published descriptions, not photos: the owner can
  send photos to tighten them. Only two of SedLine's four channels are modelled; suppression and artefact marks on the DSA
  are not drawn.

## The Menu is functional (owner, 14 Oct 2026)

The MENU key (VISTA screen, and the Menu button under the two-sided screens) opens an on-screen list; tapping an item steps
through its values: smoothing rate, EEG scale and sweep, trend window, bottom trend, DSA colour range (four presets), BIS
alarm low (20–50) and high (50–80) that set the "BIS Out of Target Range" message (`mon.alo`, `mon.ahi`; the message
also needs the teaching labels on), alarm audio, teaching labels, suppression timers (reset), sensor check, and the monitor
(VISTA, Advance, SedLine). Escape or Close shuts it. The soft-key row is only shown in the Teaching layout now.

- SedLine screen tightened against Masimo's own quick reference guide (PLM-10355D: a figure of the display, 14 Oct 2026):
  EEG traces are yellow on dark blue (default 30 mm/s, 5 µV/mm, four channels L1 R1 L2 R2; we draw L and R), the PSi is a
  yellow number inside an arc gauge (white 25–50, red outside, needle), with ARTF %, SEFL and SEFR under it, stacked L and R
  DSAs with an ASYM strip between them (0–30 Hz, upper limit adjustable to 40), and a PSi trend with a green target band,
  blue under it and orange over it. No photos of the BIS Advance screen were found in public material (Medtronic's pages
  describe it only: bilateral DSA, ASYM, left and right BIS, Dual BIS trend); that layout is still from descriptions.
