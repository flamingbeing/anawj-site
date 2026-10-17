# Hand assessment status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-13 by Claude Code, hand assessment session (save-state).

## Now

Each session keeps its own line in `status/<session>.md` (`hand.md`). Read them before starting; edit only yours.

## Waiting on the owner

- Open `hand.anawj.com/babies/` on your phone once (and the old `anawj.com/hand-babies/` to see it forward).
- Check the 3D poses on a phone and say which, if any, look anatomically off.
- Clinical read-through by the owner / a hand surgeon (2PD cut-offs, index/little FDS caveats, Elson wording,
  local preferences for splinting and antibiotics).
- Suggested edits arrive as GitHub issues titled `Page edits:`; say "apply the page edits" to have them made.

## Next (ideas, not agreed)

1. Points dropped with the 10 rules (rings off early; a spurting digital artery means the nerve is likely cut):
   add back into the case cards if the owner wants.
2. Real clinical photos (consented, de-identified) or short videos of each tendon test.
3. 3D for the remaining flat diagrams (sensation finger, 2PD, zones) if the owner asks; ✓/✗ marks in figures kept.

## Recently done

- 2026-10-15: app kit (native look): app bar with section chips, large title, sections as cards, cases as grouped rows; links `../nuhsdesign/` again (every subdomain serves it).

- #312: tendon tests checked; EDC now all fingers then press each; EIP and EDM one at a time against resistance.
- #309: Elson figure: finger rests on the table, middle joint over the edge (no clipping); see-through table.
- #306: no-WebGL phones (Firefox) get the GIFs instead of blank boxes; checked in Firefox.
- #305: no update bar; online visits always get the current page (network first, cache offline); page edit #302.
- #260: updates switch on by themselves (tap did nothing on the owner's phone).
- #258: 3D animations (three.js) for cascade, FDP, FDS, nerve map; new FPL, EDC, EIP/EDM, EPL, Elson; kinder wording.
- #253: removed the 10 rules and the emoji.
- #247: page editor (now the site-wide `/edit/`, #301).

## Decisions

- 2026-10-16: cloud changes (Firebase, Cloudflare, GitHub secrets) go to the firetop session as jobs; recorded in `AGENTS.md` (owner confirmed).
- 2026-10-13: moved to `hand.anawj.com/babies/` (SUBDOMAINS.md step 2); old address redirects by a top-level-only host check; `hand/` folder deleted; tokens.css link dropped (not served there).
- 2026-10-13: no Z-Anatomy / MakeHuman models (owner: too much effort); keep the primitive 3D hand.
- 2026-10-13: EDC tested with all fingers straight, pressing each in turn (ring can't straighten alone); EIP and EDM tested separately.
- 2026-10-13: owner uses Firefox; test there too. No WebGL: show the figure's GIF.
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
