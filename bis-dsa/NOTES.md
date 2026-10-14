# BIS to DSA notes

Lasting decisions for `bis-dsa/`. Status and next steps: `STATUS.md`.

## Purpose and audience

- Anaesthesia residents learning processed EEG: how the frontal EEG becomes the BIS number and the density spectral
  array (DSA), and how to read the DSA for propofol, sevoflurane, ketamine and dexmedetomidine (owner, 14 Oct 2026).
- One static page, no data, no sign-in, no storage. Synthetic EEG only.
- Always dark, like an anaesthetic monitor (owner, 14 Oct 2026); BIS big on the left, SR/SEF95/EMG stacked on the right.

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

## Lessons

- `fit()` reads each canvas's logical height once (`c._lh`): setting `canvas.height` rewrites the `height` attribute,
  so reading it every frame made the graphs grow until blank on high-density phones (14 Oct 2026). The test runs the
  phone at 3x density for that reason.

## Content

- Clinical text (state descriptions, pattern library, pitfalls, the case story) is in `app.js` and `index.html`.
  Facts to check with the owner before changing: BIS ranges, the age effect on alpha, ketamine and N2O behaviour.
