# Plan: a personal log mode for the logbook

Status: **discussion, nothing built** (13 Oct 2026). Folds in `PLAN-labelled-parts.md` (learning points, `dt:`). Nobody uses
the logbook yet, so there is room to change its shape. The owner wants to use it as his own log, outside APMES too (a
generic profile), and let residents follow if they see fit. The personal side of this discussion (how he uses his own
notes today) is kept in his private notes, not here.

## What it comes down to

- The hard problems for a personal log are **remembering to log** and **getting value back out** (retrieval), more than capture.
- Knowledge notes need a **review process** (raw, rewritten, vetted), not a bigger storage box.
- The limits met so far (100 notes, 20 KB a note, 2,000 characters a case summary) are **our own caps**, set for a shared
  app. The Firebase project is on pay-as-you-go, so there is no hard wall; the only true limit is 1 MB per document.
  Caps can be relaxed for a personal profile (the case summary cap is in `firestore.rules`: a rules change needs the
  owner's approval).
- The export to notes apps stays one-way (a zip of Markdown files; Dropbox / Drive can hold loose files): other apps can't
  write into a notes app's own sync.

## Direction (proposed, in stages; each its own small PR)

**Stage 1: a day-centred personal log.**
- A **day page**: that day's cases plus a free-text daily note in a proper Markdown editor (the Notes editor, better),
  one big note per day.
- **Labelled parts** in the case summary (`lp:` learning points, `dt:` case details; details in `PLAN-labelled-parts.md`).
- A **personal / generic profile** (off by default): own tags and counts; APMES categories, targets and progress hidden.
- Higher caps for it (more and bigger notes).

**Stage 2: getting value back out.**
- Search across cases, learning points and notes; tags.
- **Resurfacing**: "this day in earlier years", a random old learning point, a weekly digest (a weekly digest setting exists).
- Gentle prompts to log (a static app can't push notifications; ideas to test).

**Stage 3: knowledge notes with a review workflow.**
- Notes get a **status**: raw, rewritten, vetted; a "to vet" queue, one at a time.
- Rewriting with AI **as a collaboration**: the owner reads, edits and accepts each one. Where the AI runs is open (the
  read-only "Connect Claude" connector could gain a write side, or a Claude session works on exported notes). Nothing in a
  static app can hold an AI key.
- Possibly spaced review of vetted notes.

## Things to keep in mind

- Residents may adopt it: the personal profile and learning points must stay simple and optional (off by default).
- Privacy: free-text daily notes can drift into patient details. The case box already checks for ID numbers; extend that
  check to daily notes and say plainly what to keep out. No real names or patient data in this public repo or in demos.
- Scope: don't rebuild a notes app. Pick the parts that matter (daily note, links to cases, search, tags, review status)
  and skip the rest (graph view, plugins).
- Notes (beta) today: a private list of notes, linked to a day or a case, 100 limit, 20 KB each. It stays for now and
  becomes the base of Stages 1 and 3.

## Open questions for the owner

1. Which note-app features matter most: `[[links]]` with backlinks, tags, images, search?
2. Is the daily note the main thing to write in, with the day's cases beside it?
3. Where should AI rewriting run: a Claude chat or session he starts, or inside the app through the connector?
4. Relax the caps for a personal profile (the case summary cap needs a rules change and his approval)?
5. Learning points: the three questions in `PLAN-labelled-parts.md`.
