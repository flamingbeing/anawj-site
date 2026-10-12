# Logbook status

Short and current: what is happening now, what waits on the owner, what is next, and the decisions made along the way.
Lasting rules and lessons go in `NOTES.md`; finished work leaves "Recently done" after a few PRs (git history keeps it).
Each session edits only its own line under **Now**. Update this file when a task finishes, a decision is made, or
before compacting (`/save-state` in Claude Code, `$save-state` in Codex).

Last updated: 2026-10-12 by Claude Code "Logbook code editing" session.

## Now

- **Claude Code, "APMES Logbook" session** (branch `claude/clever-gates-pm6sas`): idle; signed in to Firebase CLI
  for this session at the owner's request, nothing run with it yet (each use needs the owner's OK).
- **Claude Code, "Logbook code editing" session** (branch `ccr-2994049c-4e5tlt`, no open PR): owns the axe check
  (`test/e2e/a11y.mjs`), PR previews (Cloudflare Workers, `wrangler.jsonc`), and the Codex / Firebase plugin setup.
  Signed in to Firebase CLI (owner's OK) and read Firestore usage only. Ran a Notes security review and a phone
  speed audit; findings under Next, waiting on the owner's two decisions below.
- **Claude Code, "APMES Logbook 2" session** (branch `ccr-afac5e7a-99esax`): owner's batch of 8 in three PRs: A
  Reflections tab (topic headings, one-line header, pinned search + sticky topics), then B (page width, demo header
  and Leave demo, swipe on by default and following the finger), then C (Analytics, Advanced only).
- **Codex**: no open logbook task (handed its remaining batch to Claude on #163).

## Waiting on the owner

- Try on a real phone: pins, swipe between tabs, keyboard behaviour; Notes; Basic mode; formatting buttons.
- Admin → Advanced → "Fix initials in older cases" (one-off).
- Dropbox developer console: tick `files.metadata.read` so "Keep backups for…" can remove old Dropbox files.
- Dropbox: apply for production approval when ready (only listed accounts can use it until then).
- MCP connector: test `node server.mjs login` on a computer.
- Decide: Notes `settings.noteIndex` (counts, dates and case ids of notes) sits in the logbook doc the app owner
  can read. Move it to an owner-only doc, or reword "no app-owner access" to say the owner can see which days have notes?
- Decide: who makes the small fix PR below ("Logbook code editing" or "APMES Logbook").

## Next (agreed queue)

1. Small fix PR (proposed 12 Oct, awaiting the owner's go):
   - **Preview reload bug**: on Cloudflare previews, reloading logbook/evals fails once the service worker runs:
     Cloudflare answers `index.html` with a 307 to the folder, the SW caches that redirect and serves it for
     navigations (`logbook/sw.js:56`, `evals/sw.js:57` use key `'index.html'`). Fix: navigation key `'./'`; bump VERSION.
     anawj.com (GitHub Pages) is unaffected.
   - Notes bin restore skips the 100 cap / id check when notes aren't loaded (`bin.js:95-97`): `await ensureNotes()` first.
   - `watchNotes` (`cloud.js:365`) needs `{ includeMetadataChanges: true }` like `watchReflections`, or markers stay stale.
   - Rules tests for notes: anon/unverified, admin list/write, mixed-case path, field types, other-user updates,
     other users' note bin entries.
2. Later, low priority: lazy-load rarely used modules (admin, portfolio, importer, xlsxio, backup, progress) to cut
   first-visit time (now 3.5–4.2 s on a slow phone; repeat visits 0.6–0.8 s). Measure before and after.
3. Parked ideas, only if asked:
   - Changed-records-only sync for cases (`syncAt` + delete tombstones; plan in chat on 12 Oct). Firestore usage
     12 Oct: busiest day 23.6k reads / 16.7k writes (bulk work), normal day ~4k reads; free tier 50k/20k a day.

## Recently done

- #176 Firebase plugin installed in cloud sessions, ask-first rule; #164 Codex plugin + CLI auto-setup; #167 ask before Codex.
- #169 / #171 / #174 PR previews on Cloudflare Workers (`<branch>-anawj-preview.kohwenjun.workers.dev`).
- #165 axe-core accessibility check (`test/e2e/a11y.mjs`, on demand); #168 shared instructions moved to AGENTS.md.
- #175 Reflection formatting buttons (off by default); Word export shows real bold and bullets.
- #173 Backup as one spreadsheet (CSV); Restore reads it.
- #172 Basic mode (one switch, off by default).
- #170 Settings → Show or hide, a reset per group.
- #166 Notes (private notepad, max 100) and the 3 accessibility fixes.
- #160–#162 Save to Drive / Dropbox fixed (same-page sign-in), compressed `.json.gz`, keep-for-N-days.
- #159 Firebase sign-in helper self-hosted on anawj.com (fixes "missing initial state" on Android).

## Decisions log

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
- 2026-10-12: Auto-delete head branches on merge is on; session branches are recreated on their next push.
