# Logbook status

Short and current: what is happening now, what waits on the owner, what is next, and the decisions made along the way.
Lasting rules and lessons go in `NOTES.md`. "Recently done" is updated at save-state only, not in every PR (the PR
list, filtered by the app's label, has the rest).
Each session edits only its own file under `status/` (see **Now**). Update this file when a task finishes, a decision is made, or
before compacting (`/save-state` in Claude Code, `$save-state` in Codex).

Last updated: 2026-10-17 by Claude Code, Logbook 3 (log3): handover to APMES Logbook (`status/log3.md`).

## Now

Each session keeps its own line in `status/<session>.md` (`log1.md`, `log2.md`, `log3.md`, `codex.md`; a new session adds
its own file), so sessions never edit the same lines. Read them all before starting; edit only yours.

## Waiting on the owner

- **Don't re-import the old Form workbook from Admin for now** (15 Oct): three verified bugs only bite on a re-import (deleted Form
  cases come back, redated or edited ones double). Fixes are queued in `status/wip/README.md`.
- **Paste the new `form-script/Outbox.gs`** into the response sheet's Apps Script (`LogbookOutbox` file; #589). First search that
  project for `getScriptLock`: the outbox now holds the script lock for each run. Steps: `form-script/OUTBOX-README.md`.
- Later, before the Form backfill is next run: paste the new `form-script/Code.gs` into the Form's Apps Script (#587;
  `form-script/CHANGES-PENDING.md`). Read the sheet's Apps Script **Executions** for
  `logbookOutboxRun`, `logbookOutboxTotalsCheck` and `onFormSubmit` (Firetop can't reach them).
- **Nightly Totals check:** the owner installed it (15 Oct). Confirm the Script property `LOGBOOK_TOTALS_FIX` is `on` (until then it
  only reports) and that `logbookOutboxTotalsSetup` added the 03:00 trigger. Matters because "Allow response editing" stays ON
  (owner, 14 Oct): the sheet's `onFormSubmit` appends Database rows again for an edited response; the nightly check repairs that.
- Optional, to finish the sync check: look at the sheet's Apps Script Executions page for `logbookOutboxRun` (no errors) and log a
  case while a Form response arrives. The app → sheet sync itself worked on 15 Oct (drift check in sync).
- A weekly drift check runs on the home computer and messages the owner's phone (details in the owner's private notes).
- **Delete the test "ZZ" case again** (14 Oct): its first delete hit the zombie-delete bug (fixed in #519); after the
  site updates, reload and delete it once more (the old attempt sits as a conflict in Recent changes on that phone).
- The response sheet's public link was closed (16 Oct, owner OK): glance once at its Apps Script Executions page (`onFormSubmit`, `logbookOutboxRun`) and say "fine" or the error. Other log3 items: `status/log3.md`.
- **Try the 6-hour build** (13–14 Oct): Settings → Profile → Personal; Logbook day → + Daily note; Settings → Advanced
  logging → Labelled parts; Settings → Sync (GitHub / Drive / Dropbox); Send to. Everything new is off until switched on.
  Notes with text open in Preview (⋯ → Edit to type): say if they should open ready to type instead.

- Answer the questions in `logbook/PLAN-personal-log.md` and `logbook/PLAN-labelled-parts.md` (13 Oct), then say go.
- Get the Obsidian vault into the private repo `flamingbeing/life` (Obsidian Git plugin or GitHub Desktop; steps on request).
- Dropbox production form: website `https://apmes.anawj.com/logbook/` (13 Oct; text was given in chat).
- Try the polish batch's new looks on a phone (Advanced display: Flat, button style, icons, plain calendar, page
  titles, shorter rows; Accessibility: press and hold) and the colour picker.
- Try on a real phone: pins (now also the Reflections search, with sticky topic names), swipe between tabs (cards that
  slide in with the finger, also on the background; #191), keyboard behaviour; Notes; Basic mode; formatting buttons; the new Analytics parts.
- Admin → Advanced → "Fix initials in older cases" (one-off).
- Add the programme coordinators (PCs) as admins in the Firebase console (`admins/{email}`); they then get the
  Faculty / PCs profile with the Admin tab. Your own account opens in Faculty / PCs unless you pick a profile.
- Try the profiles on a phone (Settings → Profiles or hide items): Basic (now the default), Basic: logbook only,
  Advanced, Faculty / PCs (Case logs, Analytics, Admin).
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

0. **Data-safety bug hunt: first round done and merged (#523), then parked at the owner's request ("come back to
   bugfixing later", 14 Oct).** Left in `logbook/PLAN-go-live-bugfix.md` ("Parked findings"): imports (item 7) and an app
   left open for days (item 9) untested; Firefox random seed 285932884 (a device keeps a stale copy of a case after its edit
   conflicted; replay command in the plan); WebKit `TEST=conflicts` `editVsDelete` (needs a Mac or Linux WebKit run, Windows
   WebKit can't reach the emulator reliably); known limits (a phone clock >10 min slow; a sign-out not made from the button).
   Tools: `tools/test-multidevice.sh` (random, `DEVICES/ROUNDS/SEED/BROWSER/SLOW`) and `TEST=conflicts` (fixed scenarios).
0b. **App → response-sheet sync is live (14 Oct); first end-to-end check pending** (needs a programme resident: see
   "Waiting on the owner"). (Verified 15 Oct: see Waiting on the owner.)
1. Subdomains: **all steps done 13 Oct** (`SUBDOMAINS.md`); the logbook is at `apmes.anawj.com/logbook/`. Nothing queued here.
2. **Waiting on the owner's answers** (13 Oct): the owner wants the logbook to also be his own log (daily note, learning points,
   knowledge-note review, a generic profile; residents may follow). Plans, consequences and the open questions:
   `logbook/PLAN-personal-log.md` (the public, personal-details-free version; the personal version is in his private
   repo) and `logbook/PLAN-labelled-parts.md` (`LP:` / `DT:` / `LP1:` parts, one account switch, off by default).
   Notes (beta) stays and becomes the base. Nothing built; start only when he says go.
3. (Polish batch done 13 Oct: #250, #254, #268, #272, #274, #264, #289, #295. Owner to try the new looks on a phone.)
4. Later, low priority: lazy-load rarely used modules (admin, portfolio, importer, xlsxio, backup, progress) to cut
   first-visit time (now 3.5–4.2 s on a slow phone; repeat visits 0.6–0.8 s). Measure before and after.
5. Parked ideas, only if asked:
   - Changed-records-only sync for cases (`syncAt` + delete tombstones; plan in chat on 12 Oct). Firestore usage
     12 Oct: busiest day 23.6k reads / 16.7k writes (bulk work), normal day ~4k reads; free tier 50k/20k a day.

## Recently done

- #487 APMES People (`people/`, shared resident/faculty/PD lists; `people/NOTES.md`). #684 #685 #687 #688 the public/private split: private details moved to the owner's private repo, neutral pointers left, sessions load it at start. #720 the save-state skill covers the split.
- #583 #584 #586 #587 #589 Logbook reliability fixes from the 15 Oct audit: saves after a conflict sync or say so and devices show
  the server's copy; bulk tag/merge/re-import through the queue; backup restore never overwrites newer work; reflection bin deletes
  check the version; deleted Form cases stay deleted (rules `formGone`); fewer doubled edited Form responses; the sheet outbox never
  stalls on skipped entries, runs one at a time, and re-queues restored cases (rules: late outbox delete). Both rules deploys ✓.
- #569 Logbook: an admin re-import never overwrites a case already in the logbook (it used to for cases written by another route, e.g.
  the 72 rows re-imported on 14 Oct). #571, #574 multidevice harness fixes (real offline under a slow network, partial multi-delete,
  edits that conflict after reconnecting). Reliability hour (15 Oct): 10-area audit, ~25 verified findings, 5 fix branches paused
  (`status/wip/`).
- #549, #550 Logbook: a drift check of the app against the response sheet (run on the home computer; drift check: ask the owner);
  #551 the sheet script's nightly Totals check (report-only until `LOGBOOK_TOTALS_FIX` = on). 14 Oct data work, all
  owner-approved: missing Form rows re-imported (the app and sheet then agreed, after the owner's 26iv line in
  `Categories.gs` and Rebuild Database / Rebuild AY Reports).
- #546 Logbook: the sheet outbox switched on (`SHEET_OUTBOX_ON = true`): a programme resident's new app case goes to the old Form's
  response sheet within ~5 minutes (Case tab with `app:<id>` in column J, Database, resident report, AY totals). #527 (rules
  `sheetOutbox`, app side, sheet script `form-script/Outbox.gs`, import skips `app:` rows) and #532 (the script holds the sheet's
  document lock in small pieces; per-step timings) came first; owner installed the script and raised the Form handler's
  lock wait to 60 s. #547: the pending end-to-end check recorded.
- #523 Go-live bug hunt, round 1: header follows the save queue ("Save needs attention"), a save cut off by the network retries
  by itself, multi-select delete no longer loses a concurrent edit (it uses the write queue per case) and a delete undone by a
  conflict says so, `tools/test-multidevice.sh` with devices going offline and `TEST=conflicts` scenarios (edit vs edit/delete,
  bin, Form pick-up twice, late offline save, sheet outbox, sign-out), harness works on Windows.
- #519 Fix: a single delete never reached the server (the recycle-bin feed dropped the case first, so the delete saw a
  conflict) while the device said "Synced"; deleted cases came back after sign-in. Since 13 Oct. Plus the first multi-device
  emulator test (`tools/test-multidevice.sh`) and the go-live bug-hunt plan.
- #494, #499, #500, #501, #503, #508 Google Form inbox: the old Google Form stays open (no end date); each response goes to
  `formInbox` (a bot account, `formBots/`) and becomes a case when the resident opens the app; script bound to the Form
  (`form-script/`), live and tested end to end 14 Oct.
- #490 Private feedback queue: residents' More → Send feedback (owner-only `feedback/{id}`, rules change approved by the owner); the owner's More → Feedback (Mark done, Delete, scrubbed Copy as task).
- #485 Bug hunt: 35 confirmed bugs fixed (sync engine data safety, settings merges, daily-note merges, paste cleaner, sync files, logging).
- #484 Late dialog "back" no longer pulls you off a page opened meanwhile (Safari); settings search scrolls to the option; phone polish.
- #483 Rarely used screens load on demand: case box ~35% sooner on a phone connection.
- #482 Cross-browser fixes: settings search keeps typed text, profile Cancel, Sync page redraws, blocked storage.
- #481 Labelled parts (`lp:` etc., off), case templates, pasted case lists, phone fixes (keyboard, tap targets, Safari menu), Request an evaluation (off), Hide the tab bar while typing (Personal).
- #474 Wave 1 of the 6-hour build: cheap-read sync engine (local store + filtered listeners, deletes from the bin, `tools/test-reads.sh`), faster logging (Save takes the suggested tags, Case-tab 'quick' split into suggestions / Same as last, optional auto-tick), Sync to Drive / Dropbox / GitHub (one Markdown file per day, managed block, three-way merge), profiles as presets of visible switches with a new Personal profile and APMES switches, daily note (+ Today's note, paste cleaner, receive shares on Android).
- #402 Send to… (Obsidian, WhatsApp, UpNote or any link).

- #204 The top band's third quarter is the NUHS site's blue `#178fd7`, not cyan; Reflections' NUH tab colour too (`logbook-v26`).
- #396, #395 Personal-log plan: written (#395), then made public-safe with the personal version moved to the private repo `flamingbeing/life` and a rule in `AGENTS.md` (#396).
- #392 (site) The old `/design/` path retired; `/nuhsdesign/` is the one shared folder every subdomain serves.
- #370, #371, #373, #368 The logbook (and evals, #367) moved to `apmes.anawj.com`: new sign-in domain, old address forwards, a download page for saved device choices, Drive and Dropbox backups confirmed.
- #352, #354 (site) Cloudflare Worker serves hand., prewarmstudy., nuhroster. and apmes.anawj.com (hosting, step 1 of `SUBDOMAINS.md`).
- #347 Notes: Download notes as files (zip, one .md or .txt each), the linked-case pill opens the case, a Linked row on the case edit page (reflection, notes).
- #325 (tools) context-nudge mod: a reminder to /save-state and /compact at 50% and 75% context (cloud sessions install it).
- #295 Polish 6b: seven clean looks (off by default), calendar day Share / Copy (off) / + Add, back links off the bar, device colour picker.
- #289 Polish 6a: settings pages use switches, ✓ lists and one-line help (ⓘ for more); Advanced pages under headings.

## Decisions log

- 2026-10-17: log1, log2 and log3 merge into one session, APMES Logbook, which carries on from the `status/` files.
- 2026-10-16 (log3): Public/private split (`AGENTS.md`, "Keep the repo public-safe"); git history left as it is on purpose; the shared anantf-site gets only neutral wording; roster example names in tests are made up; the response sheet's public link was closed.
- 2026-10-16 (log3): Live Firebase and Cloudflare changes go as jobs to the home-computer session instead of to the owner
  (`OPERATIONS.md`, "The home computer").
- 2026-10-16 (log1): Where two sessions built the same thing from different instructions, the newer one on main stands (owner, on
  Totals: #661's layout and labels win over the older #581, which was closed). Before pushing an older branch over main, check
  whether main already changed that area, and ask.
- 2026-10-16 (log1): Cloud sessions install Cloudflare's official Claude Code plugin (#673; anantf-site #133). No deploys or
  Cloudflare setting changes through it without the owner's OK; Workers deploy only through Workers Builds.
- 2026-10-15 (log2): Owner: when GitHub's Checks are slow, sessions may run the same checks locally and merge on that (#589 merged
  on the full local logbook suite, rules suite and conflict scenarios; the rules deploy was still confirmed afterwards).
- 2026-10-15 (log2): Reliability hour with Firetop. Live data checked clean. Code audit found real data-loss paths in the save queue, the bin, backup restore, the
  Form inbox, the sheet outbox and the workbook re-import; fixes paused mid-way at the owner's usage limit, saved as a git bundle in
  `status/wip/` with the findings. Residents' blank or mistyped dates are left as they are (theirs).
- 2026-10-15 (log2): Rule: a change found in the drift check is the resident's until they say otherwise; ask before restoring
  (a real case taught it; details in the owner's private notes). App edits and deletes still do not reach the sheet
  (next candidate build: app edits/deletes → sheet via the `app:` marker; sheet edits → app is harder, no row ids).
- 2026-10-14 (log2): Two-way direction (owner): the app is the source of truth AND the Form / response sheet stays trusted, so
  changes in either should reach the other; built so far: drift check, re-import, nightly Totals check; not built: app
  edits/deletes to the sheet, sheet edits/deletes to the app (`logbook/PLAN-app-to-sheet.md`, "Two-way drift"). 26iv "Other
  blocks" stays an APMES category (it is a live Form option), added to the sheet script's CATEGORIES. "Allow response editing"
  stays ON. Names may appear in chat, never in the repo. A resident testing the app changes real data.
- 2026-10-14 (log2): App → sheet sync decided and built: on for every programme resident, new cases only, a few minutes' delay
  fine, the same bot account as the Form inbox (it also reads/deletes `sheetOutbox`), column J "App marker" with `app:<caseId>`. Dry run on a copy of the sheet showed one case holds the
  sheet's document lock 25–42 s while the Form handler waited only 10 s: the owner raised that wait to 60 s and the script
  holds the lock in pieces. Bug hunt parked at the owner's request; Firetop's findings are in the plan.
- 2026-10-14 (log2): The old Google Form stays open as a simple way in, no end date; one way only (Form → logbook);
  residents use the same Google account for both. No "Google sign-ins only" rule for now (small single-hospital Form, no
  patient identifiers). Next: new app cases appended to the response sheet as a rudimentary backup during the teething
  phase (on for everyone). Before go-live: a data-safety bug hunt (multi-device, offline, conflicts) against the real
  rules in the emulator, with firetop running long soak runs and WebKit.

- 2026-10-14: Residents send feedback only through the logbook's private queue (owner-only in Firestore), never the site's
  public 💬 / page-editor routes, which make public GitHub issues. In demo the demo admin plays the owner.

- 2026-10-13: 6-hour build process that worked: map the code with parallel readers, build independent tracks in separate git
  worktrees, review each with independent lenses, fix, integrate with a merge agent, then a find → double-verify → fix bug
  hunt; real devices / other browsers via the home-computer session (firetop). Full suite on main after: ALL PASSED.

- 2026-10-13: The owner's own main profile is the new generic Personal profile; residents keep Basic / Advanced. Every
  difference between profiles is a visible switch; picking a profile only applies a preset (owner). Storage: Firestore stays
  the main store with a local copy and filtered listeners for cheap reads (no rules change). Daily note = a note with id
  `day-YYYY-MM-DD`. Notes cap 2,000 (app-side).

- 2026-10-13: A private GitHub repo `flamingbeing/life` holds the owner's personal notes (daily log, knowledge notes, plans with
  personal details); cloud sessions may attach it only when he asks. Split rule (`AGENTS.md`): personal material goes
  there first and only a plain product version stays in this public repo; nothing is ever copied from `life` into it.
  The earlier version of `PLAN-personal-log.md` stays in this repo's git history (not scrubbed; owner can ask).
- 2026-10-13: Direction: the logbook as the owner's own log too (daily note, learning points, knowledge notes with a review
  status, generic profile), possibly adopted by residents. The Firebase limits he met are our own caps (pay-as-you-go
  plan: no hard wall); Notes (beta) is kept as the base, not dropped or renamed. Obsidian Sync can't be written to by the
  app, so the export stays one-way. Plans: `PLAN-personal-log.md`, `PLAN-labelled-parts.md`.
- 2026-10-13: The page editor stays at `anawj.com/edit/`; `/design/` retired (`/nuhsdesign/` only); the logbook and evals are at
  `apmes.anawj.com` (steps in `SUBDOMAINS.md`).
- 2026-10-13: Notes keep their 100-note limit (reads, index doc size and the list all assume it); raising it to ~1,000
  would need a paged list and a bigger index cap. A note's linked-case pill opens the case; the case edit page has a
  Linked row. Notes can be downloaded as one .md or .txt file each in a zip (owner's requests, #347).
- 2026-10-13: Case learning points stay in the one summary field, marked by a `Learning:` line; reflections keep their
  Numbered | Free text switch (owner: "fair to keep everything in 1 field").
- 2026-10-13: Cloud sessions install the context-nudge mod (reminder at 50% / 75% context to /save-state then
  /compact; it never compacts for the owner). Owner asked for it; messages sent to the other open sessions (#325).
- 2026-10-12: Faculty / PCs shows the Admin portal on the tab bar, left of More, for admins only (PDs and faculty
  never see it). A tab missing from a saved tab order goes just before More. The profile list runs from the most
  hidden: Basic: logbook only, Basic, Advanced, Faculty / PCs (owner).
- 2026-10-12: Admins are the owner and the admin staff (PCs) only, added by the owner in the console; removing
  yourself from admins keeps only the app-owner reads (logbooks and cases), not the Admin portal.
- 2026-10-13: Site deploys through GitHub Actions (Pages source switched by the owner); service-worker VERSION is
  stamped at deploy, PRs are labelled by app, each session's Now line lives in `status/<session>.md` (#307). The owner
  declined CI tests on PRs and branch protection: sessions' own e2e runs are the check, as before.
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
