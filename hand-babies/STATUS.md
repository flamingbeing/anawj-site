# Hand assessment status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-12 by Claude Code, hand assessment session.

## Now

- **Claude Code, hand assessment** (branch `claude/amazing-goodall-erq636`): 3D animations for tendon tests (added FPL, EDC, EIP/EDM, EPL, Elson), kinder wording.
  Nothing half-done.

## Waiting on the owner

- Clinical read-through by the owner / a hand surgeon (2PD cut-offs, index/little FDS caveats, local preferences
  for referral wording, splinting, antibiotics).

## Next (ideas, not agreed)

1. Real clinical photos (consented, de-identified) for good vs bad examples, or short videos of each tendon test.
2. Department-specific bits (who to call, photo app, ED protocol) if the owner wants them.
3. Link from a landing page once one exists.

## Recently done

- #253: removed the 10 rules and the emoji.

- #247: page editor (edit.html, sends GitHub issues).

- #245: page cut to about half, plainer wording.

- #207: first version (one page, 9 figures, quiz, referral template).
- #242: animated figures with Pause/Play, GIF copies in `hand-babies/gifs/` for sharing.
- Moved from `/hand/` to `/hand-babies/`; `/hand/` redirects and its worker clears the old offline copy.

## Decisions

- 2026-10-12: 3D animations (three.js, vendored) for the tendon tests, cascade and nerve map; 2D kept for
  the sensation, 2PD, zones and photo diagrams. Calling example is plain text.

- 2026-10-12: no "10 rules" section and no emoji on the page (owner); the page opens on "By case".

- 2026-10-12: page editor like edit.anantf.com (owner): `hand-babies/edit.html`, issues to flamingbeing/anawj-site.

- 2026-10-12: cut the page (owner): quiz, Words section, privacy guide and referral template removed; calling
  section is one short example.

- 2026-10-12: site and folder renamed `hand-babies` (owner). Keep the `hand/` redirect stub for a while, then delete it.

- 2026-10-12: figures become playable animations, still for reduced motion; GIFs for forwarding (owner asked for
  "gifs or playable animations").

- 2026-10-12: single static page, no data stored, offline via `sw.js`; drawn SVG figures; content prioritised over
  design (owner).
