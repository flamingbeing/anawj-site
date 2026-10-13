# Hand assessment status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-13 by Claude Code, hand assessment session.

## Now

- **Claude Code, hand assessment** (branch `claude/amazing-goodall-erq636`, no open PR): nothing half-done. Applied
  page-edit issue #302 (update bar removed; page now loads network first).

## Waiting on the owner

- Check the 3D poses on a phone and say which, if any, look anatomically off.
- Clinical read-through by the owner / a hand surgeon (2PD cut-offs, index/little FDS caveats, Elson wording,
  local preferences for splinting and antibiotics).
- Suggested edits arrive as GitHub issues titled `Page edits:`; say "apply the page edits" to have them made.
- edit.anawj.com: add the Cloudflare DNS record and redirect rule (steps in `edit/NOTES.md`).

## Next (ideas, not agreed)

1. Points dropped with the 10 rules (rings off early; a spurting digital artery means the nerve is likely cut):
   add back into the case cards if the owner wants.
2. Real clinical photos (consented, de-identified) or short videos of each tendon test.
3. 3D for the remaining flat diagrams (sensation finger, 2PD, zones) if the owner asks; ✓/✗ marks in figures kept.
4. Delete the `hand/` redirect stub once old links have passed through.

## Recently done

- Page edits #302: no update bar; online visits always get the current page (network first, cache offline).
- #260: updates switch on by themselves; the update bar only reloads (tap did nothing on the owner's phone).
- #258: 3D animations (three.js) for cascade, FDP, FDS, nerve map; new FPL, EDC, EIP/EDM, EPL, Elson; kinder wording.
- #253: removed the 10 rules and the emoji.
- #247: page editor (`edit.html`, sends GitHub issues).
- #245: page cut to about half, plainer local wording; quiz, Words, privacy and template removed.
- #243: moved from `/hand/` to `/hand-babies/` (redirect + cache cleanup at `/hand/`).
- #242: animated figures with Play/Pause, GIF copies in `gifs/`.
- #207: first version.

## Decisions

- 2026-10-13: no update bar; the worker is network first (3 s fallback to cache), so updates need no tap or reload.
- 2026-10-12: new versions activate themselves; the bar only reloads (owner's tap did nothing).
- 2026-10-12: 3D animations (three.js r160, vendored) for tendon tests, cascade and nerve map; 2D kept for the
  sensation, 2PD, palm cut, zones and photo diagrams. Calling example is plain text. Tone instructive, not blunt.
- 2026-10-12: no "10 rules" section and no emoji; the page opens on "By case".
- 2026-10-12: page editor like edit.anantf.com: `hand-babies/edit.html`, issues to flamingbeing/anawj-site.
- 2026-10-12: page cut: no quiz, Words section, privacy guide or referral template; one short calling example.
- 2026-10-12: site and folder renamed `hand-babies`; keep the `hand/` redirect stub for a while.
- 2026-10-12: figures are playable animations (still for reduced motion) with GIFs for forwarding.
- 2026-10-12: single static page, no data stored, offline via `sw.js`; content over design.
