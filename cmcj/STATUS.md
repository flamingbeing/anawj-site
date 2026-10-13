# Thumb CMC Trainer status

Short and current: what is happening now, what waits on the owner, what is next, and the decisions made along the way.
Lasting rules and lessons go in `NOTES.md`. "Recently done" is updated at save-state only.
Each session edits only its own file under `status/` (see **Now**). Update this file when a task finishes, a decision
is made, or before compacting (`/save-state` in Claude Code, `$save-state` in Codex).

Last updated: 2026-10-13 by Claude Code, CMC trainer 1 (cmcj1).

## Now

Each session keeps its own line in `status/<session>.md` (`cmcj1.md`; a new session adds its own file). Read them all
before starting; edit only yours.

## Waiting on the owner

- Tune burring by feel on a phone: hemitrapeziectomy target (≥ 2 mm off 30% of the distal trapezial surface) and
  osteophyte target (≥ 50% of those reachable from the portals). Say faster/slower or stricter/looser.
- Try the whole app on a real phone GPU (all testing so far: headless Chromium, software rendering).
- Check the exam viva model answers in `js/content.js` (`VIVA`), especially: arthrodesis position (35–40° palmar
  abduction, 10–20° radial abduction, slight pronation), MCP hyperextension thresholds (< 30°, 30–40°, > 40°),
  coexisting carpal tunnel "up to ~40%", MC1 extension osteotomy ~30°.
- GitHub Pages HTTPS certificate for anawj.com was pending (DNS correct: Cloudflare DNS-only, apex A to Pages IPs,
  www CNAME to flamingbeing.github.io). Tick "Enforce HTTPS" once issued.

## Next (agreed queue)

1. Apply the owner's burr tuning and any viva corrections once they report back.
2. Investigate (unproven): an exact ray test flags ~3% of burr samples as inside bone although the burr centre stays
   ≥ 0.76 mm from every vertex (head 0.78 mm). Likely the parity test misreading carved geometry; confirm before
   changing the collision code (`window.__cmcj.insideTruth`).

## Recently done

- #8 Exam viva card (21 questions: anatomy, OA & imaging, arthroscopy, management) with Show me scene set-up,
  self-marking and repeat of missed ones; mode in the URL hash (`#oa`, `#arthro`); Esc closes popups.
- #5 Burr tuning, radial carving, BVH-accelerated raycasts.
- #1–#4 The trainer: anatomy, osteoarthritis and arthroscopy modes, phone touch controls, WebGL diagnostics.

## Decisions log

- 2026-10-10: Exam teaching lives in an "Exam viva" card (all modes) rather than a fourth tab; questions are plain
  data in `content.js` so clinicians can edit them. Missed questions come back within three questions.
- 2026-10-10: The mode is kept in the URL hash so teachers can share a link straight to a mode.
