# Logbook status

Short and current: what is happening now, what waits on the owner, what is next, and the decisions made along the way.
Lasting rules and lessons go in `NOTES.md`; finished work leaves "Recently done" after a few PRs (git history keeps it).
Each session edits only its own line under **Now**. Update this file when a task finishes, a decision is made, or
before compacting (`/save-state` in Claude Code, `$save-state` in Codex).

Last updated: 2026-10-12 by Claude Code, Logbook 2 (log2).

## Now

- **Claude Code, Logbook 1 (log1)** (branch `claude/clever-gates-pm6sas`, no open PR): idle after #186. Firebase CLI
  signed in for this session, unused (each use needs the owner's OK).
- **Claude Code, Logbook 3 (log3)** (branch `ccr-2994049c-4e5tlt`): idle, nothing half-done. Still signed in to the
  Firebase CLI (usage counts only; each use needs the owner's OK). Owns the axe check, PR previews and the Codex /
  Firebase plugin setup.
- **Claude Code, Logbook 2 (log2)** (branch `ccr-afac5e7a-99esax`, no open PR): idle after #189; the owner's batch
  of 8 is done (#180, #184, #189). Codex plugin and Firebase CLI signed in for this session, both unused (each use
  needs the owner's OK). Next for log2: profiles (Next, item 1), waiting on the owner's go.
- **Codex**: no open logbook task (handed its remaining batch to Claude on #163).

## Waiting on the owner

- Try on a real phone: pins (now also the Reflections search, with sticky topic names), swipe between tabs (now on by
  default, follows the finger), keyboard behaviour; Notes; Basic mode; formatting buttons; the new Analytics parts.
- Admin → Advanced → "Fix initials in older cases" (one-off).
- Dropbox developer console: tick `files.metadata.read` so "Keep backups for…" can remove old Dropbox files.
- Dropbox: apply for production approval when ready (only listed accounts can use it until then).
- MCP connector: test `node server.mjs login` on a computer.
- Optional: send the AY2023 evaluations tracking spreadsheet for `apmes/originals/` (checked for names first).
- Residents who exported a Word portfolio with Female selected before #183: the box was left unticked; re-export.

## Next (agreed queue)

1. **Profiles** (log2; planned 12 Oct, parked until Basic mode landed, now ready to revisit; needs the owner's go
   and answers first). One account setting under Settings → Profile; switching never changes data:
   - Basic APMES = today's Basic mode (#172), Advanced APMES = today's app (the default for new accounts).
   - Admin (admins and PDs only; layout, not access: the rules stay the gatekeeper): opens on programme analytics built
     from `summaries/` (per residency year: tags on track / due / behind, reflection headings met, who's behind,
     spread strips). PDs can already read summaries, so no rules change.
   - Generic (no APMES requirements: no APMES tags, targets, Still needed, reflection headings, Word portfolio or
     Totals; no summary written). Largest and riskiest: plan in detail before building.
   - Order: A the switch (Basic / Advanced), B Admin, C Generic. Open questions for the owner: anything to add to or
     drop from Basic; PDs get Admin too?; can Generic save a case with no tags?
2. Later, low priority: lazy-load rarely used modules (admin, portfolio, importer, xlsxio, backup, progress) to cut
   first-visit time (now 3.5–4.2 s on a slow phone; repeat visits 0.6–0.8 s). Measure before and after.
3. Parked ideas, only if asked:
   - Changed-records-only sync for cases (`syncAt` + delete tombstones; plan in chat on 12 Oct). Firestore usage
     12 Oct: busiest day 23.6k reads / 16.7k writes (bulk work), normal day ~4k reads; free tier 50k/20k a day.

## Recently done

- #189 Analytics (Advanced only): pace forecast and Off pace, Gone quiet, Reflection to-dos, tags and month bars
  open their cases.
- #184 Page width (Full), header can hide in the demo, Leave / Reset demo by Sign out, swipe on by default and
  following the finger.
- #180 Reflections tab: topics as headings, one-line header, pinned search with sticky topics.
- #186 EPA Guidebook v8 PDF in `apmes/originals/` (cover with names replaced, file details removed).
- #183 APMES documents in `/apmes/`; blank portfolio template in the repo; Word export ticks Female (was never ticked).
- #181 Notes review fixes: note index moved to owner-only `meta/noteIndex` (rules deployed), bin restore keeps the
  100-note limit, notes listener metadata, 34 new rules tests; previews no longer break on reload (service workers
  key the page by `'./'`).
- #169 / #171 / #174 PR previews on Cloudflare Workers (`<branch>-anawj-preview.kohwenjun.workers.dev`).
- #165 axe-core accessibility check (`test/e2e/a11y.mjs`, on demand); #168 shared instructions moved to AGENTS.md.

## Decisions log

- 2026-10-12: Reflections list: topics as headings with a count pill (owner); "+ New" instead of "+ New reflection";
  "Pin the search box" covers Reflections too, with sticky topic names.
- 2026-10-12: "Line width" renamed "Page width" with a Full choice; the demo no longer forces the header back; Leave /
  Reset demo sit by Sign out.
- 2026-10-12: Heatmap days in Analytics aren't links (9 px, too small to tap); month bars and tag names are.

- 2026-10-12: The EPA Guidebook v8 PDF goes in `apmes/originals/` as a cleaned copy: the cover page's contributor and
  acknowledgement names replaced by a plain cover, file details (staff names, SingHealth sensitivity label) removed.
- 2026-10-12: Session names: Logbook 1 / 2 / 3 (log1 / log2 / log3). log1 = branch `claude/clever-gates-pm6sas`,
  log2 = `ccr-afac5e7a-99esax`, log3 = `ccr-2994049c-4e5tlt`. Each renames its own line under Now; the session
  titles in the app are "Logbook 1 (log1)" etc.
- 2026-10-12: When the owner types `/compact` the session gets no turn to save first: the owner says "save state"
  (or `/save-state`) before `/compact`.
- 2026-10-12: APMES programme documents aren't secret: they live in `/apmes/` at the repo root (guidebook, data,
  blank portfolio template; originals may be added). No faculty names (the MedHub guide stays out unless blacked
  out); published authors cited in the guidebook are fine.
- 2026-10-12: Batch from the "APMES Logbook 2" session: new Analytics parts (pace forecast over the last 6 months,
  gone quiet, tap-through, reflection to-dos) are Advanced only, not in Basic mode; swipe between tabs on by default
  for everyone (its switch also in Show or hide); merge each PR once tests pass.

- 2026-10-12: The local Firestore emulator (fake accounts, demo project) may be used without asking; signing in to
  or touching the live projects still needs the owner's OK. One-command checks: `tools/test-logbook.sh`, `tools/test-rules.sh`.
- 2026-10-12: Owner working preferences moved to AGENTS.md "Working with the owner" (all apps, Claude and Codex).
- 2026-10-12: The owner approved building Codex's remaining list (Show or hide, Basic mode, CSV, formatting buttons)
  and merging each without asking, once tests pass.
- 2026-10-12: Never run Codex, or use the Firebase plugin / CLI, without the owner's OK in that session (CLAUDE.md).
- 2026-10-12: Shared instructions live in `AGENTS.md`; `CLAUDE.md` only adds Claude-specific rules.
- 2026-10-12: Notes: under More by default, max 100, today's date, undated first, no identifier check (residents
  know), `{{notes}}` in the day export; light Markdown, no images; no toolbar in Notes.
- 2026-10-12: Case sync (fetch only changed cases) parked: cost is small at current scale.
- 2026-10-12: No Vercel; GitHub Pages hosts, Cloudflare Workers gives PR previews, Firebase is the backend.
- 2026-10-12: Firebase CLI sign-in in the "Logbook code editing" session approved by the owner, to read usage counts
  only (Cloud Monitoring; no documents read).
- 2026-10-12: Notes index moves out of the logbook doc (app owner can read it) into owner-only `meta/noteIndex`;
  the "Logbook code editing" session makes the review's fix PR.
- 2026-10-12: Auto-delete head branches on merge is on; session branches are recreated on their next push.
