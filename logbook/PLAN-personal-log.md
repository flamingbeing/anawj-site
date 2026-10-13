# Plan: a personal log mode for the logbook

Status: **plan agreed, build order below; nothing built yet** (13 Oct 2026). Folds in `PLAN-labelled-parts.md` (learning points, `dt:`). Nobody uses
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
- The export to notes apps stays one-way (a zip of Markdown files): other apps can't write into a notes app's own sync.
  Storage and cost are settled below.

## Storage and cost (decided 13 Oct 2026, pending "go")

- **Firestore stays the main store.** A web app's on-device storage can be wiped (Safari clears idle sites, clearing browser
  data, a reset), so it is never the only copy. Notes are safe if a phone is lost.
- **Writes and storage are cheap**: 100 residents writing a note a day is about 100 writes a day (free allowance about
  20,000), a year of notes is about 200 MB (free 1 GB). **Reads are the only real cost**, and the app is opened many times
  a day.
- **Incremental sync, written by us** (not Firestore's built-in cache, which re-charges the whole result when the app was
  closed more than about 30 minutes): the phone keeps a local copy; each open shows it at once, then asks "what changed
  since my last check?" (notes stamped with a server update time) and downloads only those. An open with no changes costs
  about one read. Deleted notes leave a "deleted" marker so other devices learn of them. Updates arrive on open or
  pull-to-refresh, not live.
- **Required test**: an emulator test that counts reads, proving 100 opens with no changes cost about 100 reads, not
  thousands. Also a budget alert on the Google Cloud project (owner) so a bug cannot run up a bill.
- **Caps** (100 notes, 20 KB) are our own and get relaxed; the case summary cap is in `firestore.rules` (owner's approval).
- **Backup** to the user's own Google Drive / Dropbox stays as an extra copy (already built).

## Direction (proposed; the agreed build order is below)

**Stage 1: a day-centred personal log.**
- A **day page**: that day's cases plus a free-text daily note in a proper Markdown editor (the Notes editor, better),
  one big note per day.
- **Labelled parts** in the case summary (`lp:` learning points, `dt:` case details; details in `PLAN-labelled-parts.md`).
- A **personal / generic profile** (off by default): own tags and counts; APMES categories, targets and progress hidden.
- Higher caps for it (more and bigger notes), with the incremental sync above (build and test it first).

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

## Send and Sync (destinations): decided 13 Oct 2026

What exists: Copy / Share (`share.js`: share sheet or clipboard, text from the Markdown format in Settings), backup to Google
Drive / Dropbox (optional Markdown copy, weekly reminder), and the settings file. This extends them in three layers.

1. **Format**: what the text looks like. The Markdown settings gain a file-name template (`Logbook/{date}.md`), optional
   frontmatter (`date`, `tags`, `source`), templates for day, case, note and reflection, and named formats.
2. **Destination**: where it goes. Each is a small saved definition (kept in settings, so it travels in the settings
   file): share sheet, clipboard, zip, **link (URI) destinations** with an editable template where `{content}`, `{title}`,
   `{file}`, `{date}` are filled in and URL-encoded, and **file destinations** (Drive, Dropbox, GitHub). Presets: Obsidian
   (`obsidian://new?vault=…&file={file}&content={content}`), WhatsApp (`https://wa.me/?text={content}`), UpNote
   (`upnote://x-callback-url/note/new?text={content}`), Tasker (custom). Each preset's exact format must be checked
   against that app before it ships. A tech-savvy user can add any app that has a link.
3. **Ledger**: what has been sent. Per destination and day, a fingerprint of the text last sent. The sync button reads
   "3 days changed since last send" and sends only those; an edited day shows as changed, and one file per day means no
   duplicates. Pressed whenever the user remembers (the existing reminder idea).

**Edits after sending** (no duplication, no lost edits):
- A **managed block** (`<!-- logbook -->` … `<!-- /logbook -->`) in each daily file: the app replaces only that block.
- Destinations the app can read back (Drive, Dropbox, GitHub): if the remote file differs from the last sent version, a
  **three-way merge** (last sent, remote, mine); clean merges apply, real clashes keep both with markers.
- Link destinations cannot be read back: replace the day, or append a revision (a per-destination choice).

**GitHub destination**: a personal access token limited to one repo (contents write), kept on the device only, never in
the settings file or Firestore; the screen says plainly what a leaked token could do. A Worker holding the token
instead is possible for one owner, not for residents.

**Safety**: importing a destination from a colleague shows its exact host and asks first; nothing is ever sent without a
tap; the patient-ID check runs before any send. New options are off by default; destinations are per device unless
they belong to the account.

## Receiving shares

The installed app already takes shared text (manifest `share_target`, GET `?share_text=`; it opens in paste-a-list). To
extend: a chooser for what the share becomes (a case, today's note, a new note); a POST target so shared `.md` / `.txt`
files arrive too (the service worker reads the form data). Limits: Web Share Target works for the installed app on
Android (Chrome); iPhone Safari does not support it, so there the paste cleaner and Copy are the route.

## Reconfigure the storage: cache, daily note, case notes, reflections

Today `cloud.js` keeps a live Firestore listener on cases, reflections and notes with Firestore's offline cache. That cache
only charges changed documents if the listener resumes within about 30 minutes; a longer gap re-reads the whole
collection, and a busy day means many opens. So:

- **Measure first**: an emulator test that counts reads for N opens with no changes, on today's code (baseline).
- **Incremental sync** (ours): a local copy per collection; on open show it, then query `updatedAt > lastSync` (server
  time stamp) and apply only changes; deletions leave a marker (`deleted: true`; cases already use a bin). No live
  updates between devices: refresh on open or pull-to-refresh. A gate in the test: 100 opens with no changes cost about
  100 reads.
- **Daily note**: one document per day (Markdown), the day page showing that day's cases beside it; **case notes**: any
  number linked to a case; **reflections** stay individual documents. All three use the same incremental sync.
- **Caps** raised (100 notes / 20 KB → much higher; the 1 MB document limit stays): the notes caps and the case summary
  cap are in `firestore.rules`: that change waits for the owner's approval. A budget alert on the Google Cloud project is
  the owner's to set.
- **Risk**: cases and reflections are the vital data. Keep the current listeners until the new path passes the emulator
  and browser tests; offline writes, sign-out wipe (a shared PC keeps nothing) and multi-tab behaviour are re-tested.

## Build order (agreed 13 Oct 2026: small PRs, each merged before the next, previews and 390 px screenshots)

1. **Send, part 1**: destination model, formats, ledger (pure code, unit-tested), then the Send UI with the Obsidian,
   WhatsApp, UpNote and custom link presets, the host confirmation and the ID check. Try it on existing day text.
2. **Receive shares**: the chooser and file shares.
3. **Read-count baseline test** for today's listeners.
4. **Notes on incremental sync + the daily note and day page** (rules change: owner's approval first).
5. **Sync to Drive / Dropbox** with the ledger, one file per day and the managed block.
6. **GitHub destination**, then the three-way merge for read-back destinations.
7. **Reflections, then cases on incremental sync** (vital data: full tests, owner reviews the preview first).
Later: images and files; searching an external vault from the logbook; getting value back out (search, "this day in
earlier years"); the labelled parts (`PLAN-labelled-parts.md`, on hold).

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
