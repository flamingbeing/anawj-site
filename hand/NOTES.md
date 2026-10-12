# Hand assessment notes

Lasting decisions for `hand/`. Status and next steps: `STATUS.md`.

## Purpose and audience

- Readers: MOs who were house officers last month, first week in hand surgery, often on a phone in ED.
- Aim: accurate bedside exam (sensation distal to the wound, 2PD done properly, each tendon isolated, Kanavel's
  signs) and photos a senior can decide from (always wide + close-up). Practical content over looks.
- Owner's emphasis (12 Oct 2026): 2PD, sensation, individual tendon tests, "no point testing proximal to the cut",
  2 photo views (zoomed in + zoomed out), Kanavel's signs, depends on the clinical picture.

## Content rules

- One long page, sticky section chips; scenarios are `<details>` cards (open from a link like `#pic-infect`).
- Plain words, short. Each scenario: Examine / Photos / Call now if / Common miss.
- Generic to any hospital: "per unit protocol" for drugs and splints; no hospital-specific numbers or names.
- Figures are drawn in `app.js` from one hand geometry (`FINGERS`, `shapes()`); the hand is a LEFT hand palm side so
  radial is on the left. Label radial/ulnar on any new figure.
- Figures animate (owner, 12 Oct 2026): each `FIGS.x(s)` draws time s of a loop of `dur` seconds and must end on
  a hold showing the complete diagram; that frame is the still (reduced motion, paused, print). They play only on
  screen, with a Pause/Play button (WCAG 2.2.2). After changing a figure, regenerate `gifs/` with
  `hand/tools/make-gifs.mjs`.
- Clinical content is a teaching aid, not a protocol; the footer says so.
