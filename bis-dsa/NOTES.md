# BIS to DSA notes

Lasting decisions for `bis-dsa/`. Status and next steps: `STATUS.md`.

## Purpose and audience

- Anaesthesia residents learning processed EEG: how the frontal EEG becomes the BIS number and the density spectral
  array (DSA), and how to read the DSA for propofol, sevoflurane, ketamine and dexmedetomidine (owner, 14 Oct 2026).
- One static page, no data, no sign-in, no storage. Synthetic EEG only.
- Always dark, like an anaesthetic monitor (owner, 14 Oct 2026); BIS big on the left, SR/SEF95/EMG stacked on the right.
- Screen order like a BIS monitor (owner, 14 Oct 2026): BIS and EMG trends, then DSA above, raw EEG below; a view
  toggle (DSA + EEG, DSA, EEG) shows one large. Displayed EMG is the 30–47 Hz power + 16 dB on a 25–55 dB bar
  (`emgShow`); ketamine's gamma also lifts it, as real high-frequency power would.
- Monitor look (owner, 14 Oct 2026): bezel, status line, BIS with SQI and EMG segment bars, SR/SEF/TP/BC row, soft keys
  for the view. SQI = 98 − 160 × share of artefact seconds (any sample over 300 µV) in the last 30 s; artefact seconds
  are left out of BIS, SR, EMG and TP. As on the monitor, BIS shows hollow under SQI 50 and `--` under 15. The
  Diathermy toggle injects interference bursts to show this.
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
  30–47 Hz fraction, slow and alpha fractions, minus 0.25 × SR, stretched, then smoothed over about 15 s.
  **Bruhn rule** (Bruhn 2000): below SR 40% the features set BIS; from SR 40% BIS is at most `50 − SR/2`. So
  suppression often shows with BIS in the 30s–40s, as in practice.
- SR as in the BIS manual: each second is split into four 0.25-s sub-blocks; a sub-block is suppressed if it stays within
  ±5 µV of its mean; SR is the suppressed share over the last 63 s (`features().supFrac`). BC (bursts per minute) shows
  `--` when SR is under 5 or SQI under 50.
- Burst suppression gate (`Engine`): bursts last 0.5–3 s; flat runs last 1–3 s at `bs` 0.5, growing to 10–30 s near 1;
  above 0.97 the EEG is isoelectric. Propofol suppression starts after depth 0.8 in a young adult (0.68 when older).
- **Proxies (teaching-model honesty):** the stand-in BIS formula above; 128 samples/s (the real monitor samples faster);
  EMG from a parametric muscle term and 30–47 Hz power, not the monitor's 70–110 Hz band.
- Check the tuning with `node bis-dsa/test/engine.check.mjs` (runs the engine in Node, no browser, about 20 s; also in
  the Checks workflow). It prints the table below; rows marked "later" (EMG and SQI model) are not enforced yet.
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
  ×0.05, beta ×0.3), overriding "Facial muscle activity". Stage 2 (`Engine.nmbS`): 60 s after the relaxant, while the
  hypnotic depth is under 0.3, a slow state rises with τ 120 s (falls with τ 30 s once the relaxant is off): beta and
  gamma fall further, beta slows, slow and delta power appear. Awake + relaxant: ~83 at 60 s, ~52 at 5 min, back above
  85 two minutes after reversal. This follows the volunteer studies: about 80 at once, then 44–47 minutes later
  (Schuller 2015), as low as 33, and 9 in one repeat (Messner 2003). Teaching point: a low BIS does not prove
  unconsciousness in a paralysed patient.

## Tuning targets (steady state, mean of the last 30 s; `test/engine.check.mjs`)

| State | BIS | Other |
|---|---|---|
| Propofol awake | 90–97 | SR 0; EEG RMS 8–12 µV; EMG 35–45 dB (later) |
| Propofol 0.17 | 80–95 | beta (13–25 Hz) above awake |
| Propofol 0.57 | 40–55 | SEF95 12–17 Hz; RMS 25–40 µV and ≥ 3× awake |
| Propofol 0.76 | 30–42 | SR under 5 |
| Propofol 0.90 | 22–42 | SR 15–55; not capped while SR < 40 |
| Propofol 1.0 | 0–12 | SR 80 or more |
| Sevo 0.55 | 40–55 | theta peak 4.5–5.5 Hz; alpha 1–3 dB above propofol 0.55 |
| Sevo 1.0 | 15–40 | SR at most 60 (never flat) |
| Ketamine 0.65 | 65–82 | SEF95 ≥ 25; 13–24 Hz not above awake |
| Mix ketamine 1.0 vs single 1.0 | within 6 | |
| Propofol + ketamine preset | 58–70 | |
| Dex 0.4 / 1.0 | 55–72 / 40–58 | 0.4: 0.5–1 Hz ≥ 10 dB below propofol 0.57 |
| Older, propofol 0.57 | young +6 to +12 | 8–12 Hz 8–10 dB lower; alpha peak 0.7–1.3 Hz lower |
| Older, propofol 0.80 | | SR above 0 (young: about 0) |
| Awake + relaxant at 60 s / 300 s | 75–85 / 45–62 | relaxant off again: above 85 after 120 s |
| Propofol 3 ± remi 4 | within 3 | |
| Sevo 0.8 + N₂O 0.6 vs sevo 0.8 | −2 to +3 | |
| Propofol 0.55 + EMG / + relaxant | 62–85 / 40–55 | |

## Lessons

- `fit()` reads each canvas's logical height once (`c._lh`): setting `canvas.height` rewrites the `height` attribute,
  so reading it every frame made the graphs grow until blank on high-density phones (14 Oct 2026). The test runs the
  phone at 3x density for that reason.

## Content

- Clinical text (state descriptions, pattern library, pitfalls, the case story) is in `app.js` and `index.html`.
  Facts to check with the owner before changing: BIS ranges, the age effect on alpha, ketamine and N2O behaviour.
