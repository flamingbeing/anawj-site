# Logbook status

Short and current: what is happening now, what waits on the owner, what is next, and the decisions made along the way.
Lasting rules and lessons go in `NOTES.md`; finished work leaves "Recently done" after a few PRs (git history keeps it).
Each session edits only its own line under **Now**. Update this file when a task finishes, a decision is made, or
before compacting (`/save-state` in Claude Code, `$save-state` in Codex).

Last updated: 2026-10-13 by Claude Code, Logbook 1 (log1).

## Now

- **Claude Code, Logbook 1 (log1)** (branch `claude/clever-gates-pm6sas`): polish batch from the owner's Apple-apps
  review (Next, item 1), PR 1 of 6 open (small fixes for everyone). Owner's picks are in the artifact
  https://claude.ai/artifact/8Kfho8SPgupTbqe6t2g5bi (store `picks/owner`). Also doing the Reflections rows (log2's
  area, owner's OK 13 Oct: log2 has stopped).
- **Claude Code, Logbook 3 (log3)** (branch `ccr-2994049c-4e5tlt`): idle, nothing half-done. Still signed in to the
  Firebase CLI (usage counts only; each use needs the owner's OK). Owns the axe check, PR previews and the Codex /
  Firebase plugin setup.
- **Claude Code, Logbook 2 (log2)** (branch `ccr-afac5e7a-99esax`): Faculty / PCs profile PR (rules: active faculty
  read summaries). Codex plugin and Firebase CLI signed in, both unused (each use needs the owner's OK).
- **Codex**: no open logbook task (handed its remaining batch to Claude on #163).

## Waiting on the owner

- Try on a real phone: pins (now also the Reflections search, with sticky topic names), swipe between tabs (cards that
  slide in with the finger, also on the background; #191), keyboard behaviour; Notes; Basic mode; formatting buttons; the new Analytics parts.
- Admin → Advanced → "Fix initials in older cases" (one-off).
- Dropbox developer console: tick `files.metadata.read` so "Keep backups for…" can remove old Dropbox files.
- Dropbox: apply for production approval when ready (only listed accounts can use it until then).
- MCP connector: test `node server.mjs login` on a computer.
- Optional: send the AY2023 evaluations tracking spreadsheet for `apmes/originals/` (checked for names first).
- Residents who exported a Word portfolio with Female selected before #183: the box was left unticked; re-export.
- Optional: add Playwright Firefox to the environment's setup script so new sessions can test in Gecko:
  `PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/pw-firefox" npx --yes playwright@1.56.1 install firefox || true`.
- Installed app (Firefox/Chrome on Android): Google sign-in ends on a "missing initial state" page, but closing it
  leaves you signed in. Left as is unless residents complain (fix idea: full-page sign-in in the installed app).

## Next (agreed queue)

1. **Polish batch** (log1; owner's Apple-apps review and picks, 13 Oct; one PR each, merged before the next):
   1. Small fixes for everyone: tap feedback, smooth folds, line icons instead of emoji, "pick one above", Paste /
      Clear as a round icon in the case box's corner, one status line (star · Draft saved · Recover), one wide Save
      with "Save, keep date" as small text, smaller date chips, + Log a case at the right, Copy on each row off by
      default (Advanced display / Show or hide bring it back), empty screens with an icon and a hint.
   2. Moving around: "‹ Settings" replaces the app name in the header on sub-pages; pages slide in and out; edge
      swipe back only in the iPhone home-screen app (switchable); a new Accessibility page (text size, zoom,
      contrast, motion, bigger taps, swipe between tabs, edge swipe back, press and hold); tap the month title to
      pick a month; Filter opens smoothly, dropdowns styled to match; settings use switches and checkmark lists, help
      cut to one line plus ⓘ.
   3. Lists and Analytics: initials beside the date on every case row (like Reflections), for everyone; thin sticky
      month headers you tap to jump; tags on one line that scrolls sideways; Reflection rows stop wrapping (dates,
      headings); each Analytics card shows one number and one bar, the detail inside.
   4. Recognised words highlighted inside the case box (replaces the read-back line under it).
   5. Note editor: no boxes, one grey info line (date, linked case), Delete and Preview in a ⋯ menu.
   6. Seven separate settings, all off by default, in Advanced display / logging (regrouped and reordered then):
      flat look (a new end of the Borders slider that also drops page cards), page titles in the header,
      filled / tinted / plain buttons, calendar as plain numbers with counts, shorter case rows, press and hold a row
      for its menu (no swipe: swipe changes tabs), icons instead of words on common buttons.
   Skipped by the owner: the selected tab's look, text styles, dark mode default (stays Light), segmented switches.
2. Later, low priority: lazy-load rarely used modules (admin, portfolio, importer, xlsxio, backup, progress) to cut
   first-visit time (now 3.5–4.2 s on a slow phone; repeat visits 0.6–0.8 s). Measure before and after.
3. Parked ideas, only if asked:
   - Changed-records-only sync for cases (`syncAt` + delete tombstones; plan in chat on 12 Oct). Firestore usage
     12 Oct: busiest day 23.6k reads / 16.7k writes (bulk work), normal day ~4k reads; free tier 50k/20k a day.

## Recently done

- #217 Basic the default profile; hidden items can be turned back on; no settings hidden; Profiles or hide items; soft
  shadows by default; the Display preview marked clearly.
- #214 Profiles: Advanced, Basic, Basic: logbook only (replaces Basic mode), at the top of Show or hide.
- #210 Tab bar: up to seven tabs; any More page (Account, Settings, Recover drafts, Export / Import, Admin
  portal) can be a tab; an eighth asks which tab it replaces; Add Notes to the tab bar on the Notes page.
- #200 Advanced display / logging links were hidden by ad blockers (EasyList `##.adv-link`, owner's Firefox): class
  renamed; Basic mode now says it hides them, with a way to turn it off.
- #191 Swipe between tabs like cards (next page follows the finger, steady tab bar, also on the background); Notes:
  Enter in the title moves on, Formatting fold; shorter Logbook search hint; Interesting on one line.
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

## Decisions log

- 2026-10-13: Polish batch from the Apple-apps review (Next, item 1). Seven new looks are separate settings, off by
  default, not one "Clean" switch. Initials beside the date for everyone. Edge swipe back only in the iPhone
  home-screen app (Android's own Back gesture uses the edges). Copy on each Logbook row is off by default. log1 may
  change the Reflections rows (log2's area).
- 2026-10-12: Tab bar holds up to 7 tabs (More included); every More page can be a tab (owner).
- 2026-10-12: Faculty / PCs profile (was "Admin profile") for faculty, PDs and admins; their default. PCs are added
  as admins (no PC role). Case logs = counts per tag per resident (no case details); active faculty may read the
  counts summaries (rules). Generic profile dropped.
- 2026-10-12: Soft shadows around cards are the default (lines are the option). The Display preview is marked
  clearly as a preview.
- 2026-10-12: Basic is the default profile for everyone (existing accounts too, unless they pick Advanced). Profiles
  hide interface items only, never settings, and every hidden item can be turned back on. Show or hide renamed
  "Profiles or hide items".
- 2026-10-12: Profiles replace Basic mode: Advanced (default, hides nothing), Basic, Basic: logbook only (Basic
  without reflections, for those submitting reflections separately). One place: top of Show or hide. Basic moves
  Analytics into More and drops reflection figures and references. Admin profile next; Generic dropped.
- 2026-10-12: UX review vs Bear: the owner wants better usability and clearer design, not a "cleaner look" option.
- 2026-10-12: Swipe between tabs works like cards: the next page follows the finger (a still copy of the page, or a
  loading card for a tab not opened yet), no gap, no popping in, the tab bar never moves; works on the background too.
- 2026-10-12: Basic mode never hides silently: where it hides something, say so with a way to turn it off. Two Basic
  switches (Settings, Show or hide) confused the owner; profiles (log2) should have one place only.
- 2026-10-12: Installed-app sign-in error page ("missing initial state") left as is for now: sign-in still works.
- 2026-10-12: The top band's third quarter is the NUHS site's blue `#178fd7`, not cyan (owner): the site's stripe is four
  equal quarters (orange, red, blue, navy). Logbook, evals, roster, privacy and `design/` all use it; NUH tab colours too.
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
