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

- Medtronic screen fidelity pass (14 Oct 2026, local commit, not pushed): DSA rebuilt (1 px columns, display scale, suppression gaps), 1 hour time axis with 10 min labels, alarm that sounds and gates like the manual (Target Range now Inactive by default, Trend Time Scale default 1 hour: the owner may want either back; both are one-line changes in `MT` / `mtDefaults`), menu and sensor-check details. Detail: `NOTES.md`, "Fidelity pass".

- Two-sided screens (BIS Advance style, SedLine style) with a right-hemisphere engine and a one-sided slowing control (14 Oct 2026). Menu made functional (on-screen list, alarm limits). Queued: photos of Advance and SedLine screens to tighten the layouts; DSA suppression and artefact marks for SedLine.

- BIS VISTA-style screen as the default (owner's photos, 14 Oct 2026); the earlier layout stays as "Teaching layout". Queued: relaxant top-up with PTC/TOF readout, long vs short case emergence, machine switch.

- Effect-site lag fast up (12 s) and slow down (120 s) so emergence unzips slowly and induction is quick, plus an Emergence key; depth slider shows the target BIS (forecast), effect-site marker and a green 40-60 band; relaxant default "At induction" (Off / On now keys); suppression and BIS<40 time box.

- `anaes.anawj.com/bis/` live (owner added the domain, 14 Oct 2026); `anawj.com/bis-dsa/` forwards to it.

- Phase 2 (14 Oct 2026, branch ccr-0e0d2acf-njkx9t): relaxant two-stage fall, remifentanil and Bruhn rules, drug
  spectra refit, `test/engine.check.mjs`; SQI/EMG/messages like the monitor; trend, DSA MF, EEG scale, smoothing;
  new scenarios (forced-air warmer, blinks, surgical stimulus button, case story with incision, diathermy and blinks;
  13th library card); clinical wording corrected with sources, new pitfalls and a "What the trials say" table.
- #495: graphs blank on phones fixed (canvas height grew every frame); always dark; BIS-style readout.
- Monitor like a BIS screen: DSA above, EEG below, view toggle, EMG trend.

- First version: live monitor, five-step "how one DSA column is made" animation, pattern library, quiz, pitfalls.
