# Hand assessment notes

Lasting decisions for `hand-babies/`. Status and next steps: `STATUS.md`.

## Purpose and audience

- Readers: MOs who were house officers last month, first week in hand surgery, often on a phone in ED.
- Aim: accurate bedside exam (sensation distal to the wound, 2PD done properly, each tendon isolated, Kanavel's
  signs) and photos a senior can decide from (always wide + close-up). Practical content over looks.
- Owner's emphasis (12 Oct 2026): 2PD, sensation, individual tendon tests, "no point testing proximal to the cut",
  2 photo views (zoomed in + zoomed out), Kanavel's signs, depends on the clinical picture.

## Address

- Lives at `hand.anawj.com/babies/` (moved from `anawj.com/hand-babies/`, 13 Oct 2026, SUBDOMAINS.md step 2). The repo
  folder stays `hand-babies/`; the Worker maps the address (`worker/routes.js`). Never use absolute `/hand-babies/…`,
  `/design/…` or `/edit/…` paths in the page: the subdomain serves only this folder (`/design/` and `/edit/` are 404s there).
- The old `anawj.com/hand-babies/` is the same folder on GitHub Pages: a script at the top of `index.html` sends a
  top-level visit to the new address (path, query, `#` kept). It skips frames, so the page editor (`/edit/`, on
  anawj.com until SUBDOMAINS.md step 5) can still open the old copy to edit its text. The old `/hand/` redirect folder
  is gone (nobody used it).
- The "Suggest an edit" link and `edit.html` go to `https://anawj.com/edit/?page=%2Fhand-babies%2F` (editor on anawj.com).

## Updates (offline worker)

Network first: online, every visit gets the current files; the cache is only used offline or when the network takes
over 3 s. No "Update available" bar (owner, 13 Oct 2026: "why is this still here"). A new version still activates
itself (`skipWaiting` in install); never go back to waiting for a tap (on a phone the tap did nothing, 12 Oct 2026). No hand bump of `VERSION`: the deploy stamps it with a hash of the SHELL files (`tools/stamp-versions.mjs`; AGENTS.md).

## Content rules

- No emoji, no "10 rules" box (owner, 12 Oct 2026). One long page, sticky section chips; scenarios are `<details>` cards (open from a link like `#pic-infect`).
- Short, plain, practical (owner, 12 Oct 2026): not textbook; good English the way Singapore doctors talk (MO,
  ED, OT, TW, ATT, nec fasc). No quiz, no privacy guide, no referral template: one short example message only.
- Plain words, short. Each scenario: Examine / Photos / Call now if / Common miss.
- Generic to any hospital: "per unit protocol" for drugs and splints; no hospital-specific numbers or names.
- Figures are drawn in `app.js` from one hand geometry (`FINGERS`, `shapes()`); the hand is a LEFT hand palm side so
  radial is on the left. Label radial/ulnar on any new figure.
- Figures animate (owner, 12 Oct 2026): each `FIGS.x(s)` draws time s of a loop of `dur` seconds and must end on
  a hold showing the complete diagram; that frame is the still (reduced motion, paused, print). They play only on
  screen, with a Pause/Play button (WCAG 2.2.2). After changing a figure, regenerate `gifs/` with
  `hand-babies/tools/make-gifs.mjs`.
- 3D figures (owner, 12 Oct 2026: "more 3 dimensional"): tendon tests, cascade and nerve map are posed on a 3D hand
  in `hand3d.js` (left hand; palm faces +Y, fingers -Z, thumb -X; flexion = +rotation about a joint's X; thumb `lift`
  about the long axis = EPL retropulsion). One WebGL renderer draws each figure, then 2D labels go on top. Users can
  drag sideways to turn. GIFs hold the camera still (`HAND_GIF`) to stay small; regenerate after any change.
- Tone: instructive and kind, never scolding ("so a normal result there doesn't tell you…", not "is wrong").
- Clinical content is a teaching aid, not a protocol; the footer says so.

## Browsers

The owner uses Firefox (Gecko) on their phone: check changes in Firefox as well as Chromium. Playwright's Firefox
(`npx playwright install firefox` into a scratch `PLAYWRIGHT_BROWSERS_PATH`) has no WebGL headless; run it headed
under `xvfb-run` with `LIBGL_ALWAYS_SOFTWARE=1` to see the 3D figures. Where WebGL is blocked, hand3d.js shows each
3D figure's GIF instead (no Play button), so keep `gifs/` current (`tools/make-gifs.mjs`).

## Figures: lessons

- Tendon tests follow standard technique (checked 13 Oct 2026): FDP hold middle phalanx; FDS hold the other fingers
  straight; FPL hold the thumb proximal phalanx; EPL lift off a flat palm; EDC all fingers straight then press each
  (the ring can't straighten alone); EIP and EDM separately from a fist; Elson with the PIP over the table edge.
  Change a figure and its page text together.
- `tools/make-gifs.mjs edc elson` remakes just those GIFs. After splicing code in `hand3d.js`, check for duplicate
  figure keys (a later one silently wins). Render frames at several camera turns before merging.
- No Z-Anatomy / MakeHuman models (owner: too much effort); the hand stays primitives.

## Edits sent from the page editor

The page editor is now site-wide: `/edit/` (`edit/NOTES.md`, which also says how to apply `Page edits:` issues). The
page's "Suggest an edit" link and the old `edit.html` open it on `/hand-babies/`. Figures are paused inside it
(`handFigs.pauseAll`) and take comments only; figure text is drawn in `app.js`, so regenerate `gifs/` after changing it.
