# BIS to DSA status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-14 by Claude Code (first version).

## Now

Each session keeps its own line in `status/<session>.md`. Read them before starting; edit only yours.

## Waiting on the owner

- Clinical read-through of the wording and BIS ranges.

## Next (ideas, not agreed)

1. More states: nitrous oxide, opioid-heavy, hypothermia; a left/right (SedLine-style) view.

## Recently done

- `anaes.anawj.com/bis/` live (owner added the domain, 14 Oct 2026); `anawj.com/bis-dsa/` forwards to it.

- Phase 2 (14 Oct 2026, branch ccr-0e0d2acf-njkx9t): relaxant two-stage fall, remifentanil and Bruhn rules, drug
  spectra refit, `test/engine.check.mjs`; SQI/EMG/messages like the monitor; trend, DSA MF, EEG scale, smoothing;
  new scenarios (forced-air warmer, blinks, surgical stimulus button, case story with incision, diathermy and blinks;
  13th library card); clinical wording corrected with sources, new pitfalls and a "What the trials say" table.
- #495: graphs blank on phones fixed (canvas height grew every frame); always dark; BIS-style readout.
- Monitor like a BIS screen: DSA above, EEG below, view toggle, EMG trend.

- First version: live monitor, five-step "how one DSA column is made" animation, pattern library, quiz, pitfalls.
