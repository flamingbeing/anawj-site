# Now: Claude Code, Logbook 1 (log1)

**Claude Code, Logbook 1 (log1)** (branch `claude/clever-gates-pm6sas`): **6-hour build session** (owner away, started 13 Oct
~16:40 UTC). Snapshots before it: branches `snapshot/2026-10-13-before-send` (before #402) and `snapshot/2026-10-13-start-6h`
(main at the start). Plan: `logbook/PLAN-personal-log.md` (build order) plus the queue below, one PR at a time, each merged
before the next (rules changes, if any, wait for the owner in their own PR).

Queue (update as each merges):
1. Receive shares (Android): chooser (case / today's note / new note), `.md` / `.txt` files.
2. Sync engine: local store + filtered listeners (`updatedAt > lastSync - skew`), deletes via the recycle bin; notes first;
   read-count test; notes cap raised in the app (rules unchanged).
3. Daily note + day page; paste cleaner (rich text to Markdown); phone formatting bar.
4. Cases and reflections on the sync engine.
5. Profiles as presets of settings; a Personal (generic) profile; settings reorganised, no toggle removed.
6. Labelled parts (`lp:` / `dt:`), off by default.
7. Sync to Drive / Dropbox with the ledger (file per day, managed block).
8. GitHub destination + three-way merge.
9. Logging speed and friction pass; lazy-load rare modules.
10. Bug hunt and stress tests; code tidy.
Progress (20:10 UTC): wave 1 built, reviewed and tested on branches `wt/sync-engine`, `wt/logging-speed`, `wt/file-sync`,
`wt/profiles`, `wt/daily-note` (local only). An integrator agent is merging them into `integ/wave1` (worktree
`/home/user/wt/integ`) with a full test run; then it goes to main as one PR. Wave 2 running from wave-1 bases: F labelled
parts / case templates / pasted lists (`wt/labelled-parts`), G phone UX + cross-browser bugs (`wt/phone-ux`); H lazy loading
starts from `integ/wave1`. Specs, maps and the bug list are in the session scratchpad (lost if the container resets: the
branches are the record; if the session dies, push the `wt/*` and `integ/*` branches and open PRs from them).
Design notes: no `firestore.rules` change needed for 1–10 (deletes come from `bin/`, daily note = a note with id `day-<date>`,
caps are app-side). Read this file first after a compaction.
