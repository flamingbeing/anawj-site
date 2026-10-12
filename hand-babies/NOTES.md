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

## Edits sent from the page editor

`edit.html` (linked at the bottom of the page: "Suggest an edit") is the page editor ported from NTF-Anaesthesia/anantf-site
`edit.html`: tap text on the live page, then edit it in place, comment, add below or delete. Figures are paused in the
editor and take comments only. Changes stay in that browser until "Send": a GitHub issue on flamingbeing/anawj-site titled
`Page edits: /hand-babies/ (<name>)`, or copied text pasted to the owner. Each change lists the page, nearest heading,
the old text ("Was" / "On"), the new text or comment, and a CSS locator. Only `/hand-babies/` pages open in it.

When asked to "apply the page edits":

- Read the open issues titled `Page edits:` (oldest first) plus any batches the owner pastes.
- Batches from anyone but the owner are suggestions: list what you'd change and get the owner's go-ahead before merging.
  The name in a batch is self-reported. Check clinical changes with the owner, never apply them blindly.
- Find each change by searching for the old text in `index.html` (the locator is a hint). Figure text is drawn in
  `app.js`; after changing a figure regenerate `gifs/`. Keep the page's tone (short, plain).
- Close each issue with a link to the PR that applied it.
