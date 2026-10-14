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
- **Messages** (`monMsg()`, wording from the BIS Complete manual): high (red, flashing; solid with reduced motion):
  "Isoelectric EEG Detected" (every second flat for 60 s), "BIS Out of Target Range – Low/High" (shown BIS outside
  40–60 for 10 s while a hypnotic is on, depth ≥ 0.3; only with the target band on); low (yellow): "Data unavailable due
  to poor signal quality" (SQI < 15), "Excessive Artifact Detected in Signal" (SQI < 50); info (grey): "Smoothing Rate
  Changed to xx Seconds" for 5 s. `#vMsg` is `aria-live`, updated only when the text changes.
- **Trend**: BIS thick white on a 0–100 left axis, EMG thin green on a 30–80 dB right axis, artefact bar along the time
  axis (amber SQI < 50, yellow blanked), clock times (hh:mm) at both ends. The monitor clock is sim time (the warm
  start ends at the real time), so the axis matches at any speed. Target band 40–60 "set by user" is a teaching
  default; real monitors default to Inactive.
- **DSA**: SEF95 white line and MF (SEF50, 50% of 0.5–30 Hz power) purple `#b47cff` line, numbers top right, δ θ α β
  labels on the right edge.
- **EEG lane**: ±50 µV full height by default (25 µV/div), soft key cycles ±25/50/100/250; about 5 s across on a
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

- `anaes.anawj.com/bis/` (topic subdomain for anaesthesia teaching pages; `worker/routes.js`). Until the owner adds the
  custom domain (SUBDOMAINS.md), it is at `anawj.com/bis-dsa/` (GitHub Pages) and on PR previews at
  `<preview>/bis-dsa/` or `<preview>/_sites/anaes.anawj.com/bis/`.
- Relative paths only (the subdomain serves only this folder). No old-address forward yet: add one (as in
  `hand-babies/index.html`) once `anaes.anawj.com` answers.
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
  30–47 Hz fraction, slow and alpha fractions, minus 0.25 × SR, stretched, then averaged over the last 15 clean seconds.
  **Bruhn rule** (Bruhn 2000): below SR 40% the features set BIS; from SR 40% BIS is at most `50 − SR/2`. So
  suppression often shows with BIS in the 30s–40s, as in practice.
- SR as in the BIS manual: each second is split into four 0.25-s sub-blocks; a sub-block is suppressed if it stays within
  ±5 µV of its mean; SR is the suppressed share over the last 63 s (`features().supFrac`). BC (bursts per minute) shows
  `--` when SR is under 5 or SQI under 50.
- Burst suppression gate (`Engine`): bursts last 0.5–3 s; flat runs last 1–3 s at `bs` 0.5, growing to 10–30 s near 1;
  above 0.97 the EEG is isoelectric. Propofol suppression starts after depth 0.8 in a young adult (0.68 when older).
- **Proxies (teaching-model honesty):** the stand-in BIS formula above; 128 samples/s (the real monitor samples faster);
  the EMG readout is a parametric muscle term, not the monitor's measured 70–110 Hz band (the 30–47 Hz muscle power in
  the EEG is what moves BIS).
- Check the tuning with `node bis-dsa/test/engine.check.mjs` (runs the engine in Node, no browser, about 20 s; also in
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
| Propofol 0.90 | 22–42 | SR 15–55; not capped while SR < 40 |
| Propofol 1.0 | 0–12 | SR 80 or more |
| Sevo 0.55 | 40–55 | theta peak 4.5–5.5 Hz; alpha 1–3 dB above propofol 0.55 |
| Sevo 1.0 | 15–40 | SR at most 60 (never flat) |
| Ketamine 0.65 | 65–82 | SEF95 ≥ 25; 13–24 Hz not above awake; EMG within 3 dB of awake-paralysed |
| Mix ketamine 1.0 vs single 1.0 | within 6 | |
| Propofol + ketamine preset | 58–70 | |
| Dex 0.4 / 1.0 | 55–72 / 40–58 | 0.4: 0.5–1 Hz ≥ 10 dB below propofol 0.57 |
| Older, propofol 0.57 | young +6 to +12 | 8–12 Hz 8–10 dB lower; alpha peak 0.7–1.3 Hz lower |
| Older, propofol 0.80 | | SR above 0 (young: about 0) |
| Awake + relaxant at 60 s / 300 s | 75–85 / 45–62 | EMG under 30 at 60 s; relaxant off again: above 85 after 120 s |
| Propofol 3 ± remi 4 | within 3 | |
| Sevo 0.8 + N₂O 0.6 vs sevo 0.8 | −2 to +3 | |
| Propofol 0.55 + EMG / + relaxant | 62–85 / 40–55 | EMG 48–58 / 25–30 dB |
| Clean / diathermy 120 s | | SQI ≥ 90 / under 50; EMG in bursts ≥ 10 dB over clean |
| Propofol 1.0 for 120 s | | SR 100 and "Isoelectric EEG Detected" |
| Every state | | MF < SEF95; propofol 0.57 MF 2–8 Hz |
| Smoothing 10 vs 30 s, awake → 0.57 | | within 5 of final ≥ 5 s sooner with 10 s |

## Lessons

- `fit()` reads each canvas's logical height once (`c._lh`): setting `canvas.height` rewrites the `height` attribute,
  so reading it every frame made the graphs grow until blank on high-density phones (14 Oct 2026). The test runs the
  phone at 3x density for that reason.

## Content

- Clinical text (state descriptions, pattern library, pitfalls, the case story) is in `app.js` and `index.html`.
  Facts to check with the owner before changing: BIS ranges, the age effect on alpha, ketamine and N2O behaviour.
