# Logbook status

Short and current: what is happening now, what waits on the owner, what is next, and the decisions made along the way.
Lasting rules and lessons go in `NOTES.md`; finished work leaves "Recently done" after a few PRs (git history keeps it).
Each session edits only its own line under **Now**. Update this file when a task finishes, a decision is made, or
before compacting (`/save-state` in Claude Code, `$save-state` in Codex).

Last updated: 2026-10-12 by Claude Code "APMES Logbook" session.

## Now

- **Claude Code, "APMES Logbook" session** (branch `claude/clever-gates-pm6sas`): idle; signed in to Firebase CLI
  for this session at the owner's request, nothing run with it yet (each use needs the owner's OK).
- **Claude Code, "Logbook code editing" session**: owns the axe accessibility check (`test/e2e/a11y.mjs`), PR
  previews, and the Codex / Firebase plugin setup.
- **Codex**: no open logbook task (handed its remaining batch to Claude on #163).

## Waiting on the owner

- Try on a real phone: pins, swipe between tabs, keyboard behaviour; Notes; Basic mode; formatting buttons.
- Admin → Advanced → "Fix initials in older cases" (one-off).
- Dropbox developer console: tick `files.metadata.read` so "Keep backups for…" can remove old Dropbox files.
- Dropbox: apply for production approval when ready (only listed accounts can use it until then).
- MCP connector: test `node server.mjs login` on a computer.

## Next (agreed queue)

1. Nothing queued. Parked ideas, only if asked:
   - Changed-records-only sync for cases (`syncAt` + delete tombstones; plan in chat on 12 Oct): check Firestore
     usage in a few weeks first.

## Recently done

- #175 Reflection formatting buttons (off by default); Word export shows real bold and bullets.
- #173 Backup as one spreadsheet (CSV); Restore reads it.
- #172 Basic mode (one switch, off by default).
- #170 Settings → Show or hide, a reset per group.
- #166 Notes (private notepad, max 100) and the 3 accessibility fixes.
- #160–#162 Save to Drive / Dropbox fixed (same-page sign-in), compressed `.json.gz`, keep-for-N-days.
- #159 Firebase sign-in helper self-hosted on anawj.com (fixes "missing initial state" on Android).

## Decisions log

- 2026-10-12: The owner approved building Codex's remaining list (Show or hide, Basic mode, CSV, formatting buttons)
  and merging each without asking, once tests pass.
- 2026-10-12: Never run Codex, or use the Firebase plugin / CLI, without the owner's OK in that session (CLAUDE.md).
- 2026-10-12: Shared instructions live in `AGENTS.md`; `CLAUDE.md` only adds Claude-specific rules.
- 2026-10-12: Notes: under More by default, max 100, today's date, undated first, no identifier check (residents
  know), `{{notes}}` in the day export; light Markdown, no images; no toolbar in Notes.
- 2026-10-12: Case sync (fetch only changed cases) parked: cost is small at current scale.
- 2026-10-12: No Vercel; GitHub Pages hosts, Cloudflare Workers gives PR previews, Firebase is the backend.
- 2026-10-12: Auto-delete head branches on merge is on; session branches are recreated on their next push.
