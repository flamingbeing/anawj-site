# Hand assessment notes

Lasting decisions for `hand-babies/`. Status and next steps: `STATUS.md`.

## Purpose and audience

- Readers: MOs who were house officers last month, first week in hand surgery, often on a phone in ED.
- Aim: accurate bedside exam (sensation distal to the wound, 2PD done properly, each tendon isolated, Kanavel's
  signs) and photos a senior can decide from (always wide + close-up). Practical content over looks.
- Owner's emphasis (12 Oct 2026): 2PD, sensation, individual tendon tests, "no point testing proximal to the cut",
  2 photo views (zoomed in + zoomed out), Kanavel's signs, depends on the clinical picture.

## Address

- Lives at `anawj.com/hand-babies/` (moved from `/hand/`, 12 Oct 2026). `hand/` holds only a redirect and a worker
  that clears the old `hand-*` caches; its cache cleanup must never touch `hand-babies-*` (same prefix start).

## Content rules

- One long page, sticky section chips; scenarios are `<details>` cards (open from a link like `#pic-infect`).
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
- Clinical content is a teaching aid, not a protocol; the footer says so.
