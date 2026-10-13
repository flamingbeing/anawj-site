# Logbook status

Short and current: what is happening now, what waits on the owner, what is next, and the decisions made along the way.
Lasting rules and lessons go in `NOTES.md`; finished work leaves "Recently done" after a few PRs (git history keeps it).
Each session edits only its own line under **Now**. Update this file when a task finishes, a decision is made, or
before compacting (`/save-state` in Claude Code, `$save-state` in Codex).

Last updated: 2026-10-13 by Claude Code, Logbook 1 (log1).

## Now

- **Claude Code, Logbook 1 (log1)** (branch `claude/clever-gates-pm6sas`, no open PR): idle, nothing half-done. The
  polish batch is finished (PRs 1–5, #264, 6a #289, 6b #295; full suite and a11y green on main).
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

1. (Polish batch done 13 Oct: #250, #254, #268, #272, #274, #264, #289, #295. Owner to try the new looks on a phone.)
2. Later, low priority: lazy-load rarely used modules (admin, portfolio, importer, xlsxio, backup, progress) to cut
   first-visit time (now 3.5–4.2 s on a slow phone; repeat visits 0.6–0.8 s). Measure before and after.
3. Parked ideas, only if asked:
   - Changed-records-only sync for cases (`syncAt` + delete tombstones; plan in chat on 12 Oct). Firestore usage
     12 Oct: busiest day 23.6k reads / 16.7k writes (bulk work), normal day ~4k reads; free tier 50k/20k a day.

## Recently done

- #295 Polish 6b: seven clean looks (off by default), calendar day Share / Copy (off) / + Add, back links off the bar, device colour picker.
- #289 Polish 6a: settings pages use switches, ✓ lists and one-line help (ⓘ for more); Advanced pages under headings.
- #274 Polish 5: the note editor reads like a page (‹ Notes, ⋯ menu with Preview and Delete, Done; no boxes; one info line).
- #272 Polish 4: the initials and age/sex marked inside the case box; the line under it says only what the age means.
- #268 Polish 3: initials over the date on case rows, one-line tags, thin month headers, calmer Analytics cards.
- #264 Reflections list: "JR 0/1" beside each heading's count (the JR rule left the note); word counts can be hidden.
- #254 Polish 2: "‹ Settings" in the header, pages slide in, iPhone edge swipe back, Settings → Accessibility, month picker.
- #250 Polish 1: tap feedback, smooth folds, line icons instead of emoji, tidier Case screen, empty screens, row Copy off by default.

## Decisions log

- 2026-10-13: The Logbook calendar day's buttons read Share, Copy and + Add; Copy for a day is off by default
  (Advanced display → Copy button for each day). The More list calls Notes "Notes (beta)". Every page off the
  tab bar has a back link to the page before it. Colour: the device's own picker, no preset swatches. Owner's requests.
- 2026-10-13: Polish PR 6 layout approved as proposed (Display basics unchanged but Borders gains a Flat end;
  Advanced display and logging regrouped under headings; switches, ✓ lists, one-line help); built as 6a (regroup)
  then 6b (seven new options, off by default). Owner: "agree and merge". Also: the age read-back under the case box
  stays (only the age meaning) as the 6m/6mo check; JR rule shown as a "JR 0/1" pill; word counts can be hidden.
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
