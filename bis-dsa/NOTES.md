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
  column (turbo colour map, -2 to 31 dB).
- BIS shown is a **teaching model**, not the proprietary algorithm: a linear fit on SEF95, fast-power fraction,
  30–47 Hz fraction, slow and alpha fractions, stretched, capped by `50 − SR/2` when there is suppression, then
  smoothed over about 15 s. SR is the share of flat seconds (RMS under 4 µV) in the last 63 s. Tuned so typical states
  land in published ranges: awake ~90, propofol GA ~45, deep ~32, burst suppression under 30, ketamine ~75–80,
  dexmedetomidine ~45–60, EMG raises GA to ~70. Retune with a quick Node run if states change.
- The footer says it is a teaching approximation; keep that.

## Drug mix (owner, 14 Oct 2026)

- "Mix drugs" mode: sliders for propofol (effect-site µg/ml), sevoflurane (MAC), remifentanil (ng/ml), ketamine and
  dexmedetomidine (share of an anaesthetic / deep-sedation dose) and N₂O (%), plus presets. `mixTarget()`: propofol
  (×0.155 per µg/ml) and sevo (×0.55 per MAC) add into one hypnotic depth (capped 0.95), blended between the two
  drugs' keyframes; remi, dex and N₂O add a little depth; then ketamine (gamma, beta, less alpha, no suppression),
  dex (spindles, slow, less fast), remi (a little delta, fewer arousal/EMG) and N₂O (fast power) add their own
  signatures. Teaching approximation, tuned so: propofol 3 + remi 4 ≈ propofol 3.5 alone (~47); propofol 3.5 +
  ketamine 40% ~62; sevo 0.8 + N₂O 60% a few points above sevo alone; propofol 2.5 + dex 50% ~49.

## Lessons

- `fit()` reads each canvas's logical height once (`c._lh`): setting `canvas.height` rewrites the `height` attribute,
  so reading it every frame made the graphs grow until blank on high-density phones (14 Oct 2026). The test runs the
  phone at 3x density for that reason.

## Content

- Clinical text (state descriptions, pattern library, pitfalls, the case story) is in `app.js` and `index.html`.
  Facts to check with the owner before changing: BIS ranges, the age effect on alpha, ketamine and N2O behaviour.
