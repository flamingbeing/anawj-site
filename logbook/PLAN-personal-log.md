# Plan: the logbook as the owner's own log (and for residents who want it)

Status: **discussion, nothing built** (owner, 13 Oct 2026). Folds in `PLAN-labelled-parts.md` (learning points, `dt:`).
Nobody uses the logbook yet, so there is room to change its shape. The owner wants to use it himself, outside APMES too
(a generic profile), and let residents follow if they see fit; he is more likely to keep improving an app he uses.

## What the owner uses Obsidian for today (his words, summarised)

1. **Daily notes, one Markdown file per day.** Retrieved only sporadically; improving that is the main goal. He also
   often forgets to log. Learning points have been sparse; mostly copied case summaries other people send him.
2. **Anaesthesia knowledge notes.** Written for the exams, now seldom opened except for certain topics. Much of it is
   leftover from medical school and pasted handbooks he has never read (for example Eye). Broad coverage, but a lot is
   copy-paste, which he dislikes. Wants AI to help rewrite them **one at a time, collaboratively**: he must vet each one,
   because vetting is part of internalising ("if I want a quick answer I can already google").
3. **Daily-life notes.**

He finds editing in Obsidian slightly cumbersome and wants full control of the interface. His vault (Obsidian Sync,
Windows: `C:\Users\wenjun\Documents\Life`) is on his own computer, not reachable from cloud sessions.

## What this tells us

- The hard problems are **remembering to log** and **getting value back out** (retrieval), more than capture.
- The knowledge notes need a **review process** (raw, rewritten, vetted), not a bigger storage box.
- The "Firebase limits" the owner met are mostly **our own caps** (100 notes, 20 KB a note, 2,000 characters a case
  summary), set for a shared app. The project is on pay-as-you-go (Blaze), so there is no hard wall; a single person's
  text costs cents. The only real limit is 1 MB per document. Caps can be relaxed for a personal profile (the case
  summary cap is in `firestore.rules`: a rules change needs the owner's approval).
- Obsidian Sync cannot be written to by other apps, so the app can't push into the vault: the export stays one-way
  (zip of Markdown files; Dropbox / Drive can hold loose files) as an archive.

## Direction (proposed, in stages; each its own small PR)

**Stage 1: a day-centred personal log.**
- A **day page**: that day's cases plus a free-text daily note in a proper Markdown editor (the Notes editor, better), one
  big note per day.
- **Labelled parts** in the case summary (`lp:` learning points, `dt:` case details; details in `PLAN-labelled-parts.md`).
- A **personal / generic profile** (off by default): own tags and counts, APMES categories, targets and progress hidden.
- Higher caps for it (more and bigger notes).

**Stage 2: getting value back out** (the owner's main aim).
- Search across cases, learning points and notes; tags.
- **Resurfacing**: "this day in earlier years", a random old learning point, a weekly digest (a weekly digest setting exists).
- Gentle prompts to log (what is possible on a static app: no server push; ideas to test).

**Stage 3: knowledge notes with a review workflow.**
- Notes get a **status**: raw, rewritten, vetted; a "to vet" queue, one at a time.
- Rewriting with AI **as a collaboration**: the owner reads, edits and accepts each one. Where the AI runs is open: the
  existing read-only "Connect Claude" connector could gain a write side, or the work happens in a Claude session
  against exported notes. Nothing in the static app can hold an AI key.
- Possibly spaced review of vetted notes.

**Alongside (needs no app change): tidy the existing vault with Claude, one note at a time** (keep / delete / rewrite), run
by the owner's home-computer session if it can reach the vault (`OPERATIONS.md`, "The home computer": it reads the owner's
real documents locally and nothing enters this repo).

## Things to keep in mind

- Residents may adopt it: the personal profile and the learning points must stay simple and optional (off by default).
- Privacy: free-text daily notes can drift into patient details. The case box already checks for ID numbers; extend that
  check to daily notes and say plainly what to keep out. No real names or patient data in the public repo or in demos.
- Scope: don't rebuild Obsidian. Pick the parts that matter (daily note, links to cases, search, tags, review status) and
  skip the rest (graph view, plugins).
- Notes (beta) today: private list of notes, linked to a day or a case, 100 limit, 20 KB each. It stays for now and becomes
  the base of Stage 1 and 3 rather than being dropped or renamed (reversing the earlier "drop or rename Scratchpad" idea).

## Open questions for the owner

1. Which Obsidian features would you miss most: `[[links]]` with backlinks, tags, images, search?
2. Is the daily note the main thing to write in, with the day's cases beside it?
3. Where should AI rewriting run: a Claude chat or session you start, or inside the app through the connector?
4. Is the always-on home computer the PC with the vault (or can it reach it)? If so, start the vault tidy there.
5. Relax the caps for a personal profile (the case summary cap needs a rules change and your approval)?
6. Learning points: the three questions in `PLAN-labelled-parts.md` (cap 2,000 or 4,000; filter chip and insert buttons; `lp:`
   with `lp1:`).
