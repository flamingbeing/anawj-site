# Logbook: working on it (tests, checks, lessons)

Part of the logbook working notes; index in [../NOTES.md](../NOTES.md).

- Checks: `node tools/check.mjs`; ESM syntax: `for f in logbook/js/*.js; do node --input-type=module --check < $f; done`
  (plain `node --check` misses ESM errors); unit tests: `for f in logbook/test/*.test.mjs; do node "$f"; done`.
- Pull-down-to-refresh is off (`overscroll-behavior-y: none` on html, body).
- New JS files go in `sw.js` SHELL. No hand bump of `VERSION` (13 Oct 2026): the deploy stamps it with a hash of the
  SHELL files (`tools/stamp-versions.mjs`), so installed phones update whenever those files change. Change the base
  (`logbook-v40`) only when the service worker's own logic changes.
- Start-up speed (13 Oct 2026): only the Add tab's modules load with the app (`index.html` modulepreloads exactly
  those); every other page's module loads the first time it opens, then the rest in idle moments (`app.js`, "pages
  that load on first use": `MODS`, `page()`, `warmUp()`). So: the Case-tab modules (`ui-log.js`, `ui-notepad.js`,
  `ui-core.js`, `cloud.js` and what they import) must not import a page module statically. Device display settings
  live in `display.js`, the settings rows in `settings-rows.js` and More's cards in `more-cards.js`; sync's device
  wipe in `sync-forget.js` and the reflection drafts' wipe in `ui-core.js` (sign-out leaves nothing on the device
  even before those pages' code loads: anything a lazy module keeps on the device needs an eager wipe); the field
  whitelists in `clean.js` (the demo backend loads only in `?demo`, the Firebase SDK only outside it). A new page:
  `page(['mod'], m => m.mod.renderX())` in TABS. `#app[data-page]` names the page once drawn (tests wait on it).
  `logbook/test/e2e/lazy-load.mjs` checks the Add tab's modules, every page, every page offline with the
  service worker, the sign-out wipe before warm-up and the reload after a failed load. A failed module import
  stays failed until the page reloads (the browser keeps it), so the "didn’t load" card's button reloads, and the
  warm-up stops at its first failure. Version skew (an old page loading a newer module after an update): the
  existing `controllerchange` reload in `registerSW()` reloads every open page when a new worker takes over, so a
  page never mixes versions for long; a skewed import that fails shows the same card. Measured (CPU 4x, cold): demo
  case box ~780 -> ~660 ms; real-user time to the landing UI ~710 -> ~590 ms (first contentful paint itself is
  unchanged: the gain is in time to a usable screen).
- Rules: `logbook/firestore.rules` deploys on merge. Emulator: copy rules and
  `logbook/test/rules.emulator.mjs` + `evals/test/rules.emulator.mjs` into a folder with firebase-tools, then
  `firebase emulators:exec --only firestore --project demo-logbook "node logbook/test/rules.emulator.mjs; node evals/test/rules.emulator.mjs"`.
- e2e: `logbook/test/e2e/e2e.mjs` (Playwright, demo mode, phone and desk profiles; see the header for
  how to run). Phone and desk run at once, about 1.5 minutes in all; each step prints its time and the
  slowest five are listed. `E2E_ONLY=calendar` runs every step up to the last one whose name has that word
  (the earlier steps set the stage), e.g. 4 s to 50 s instead of the whole run: use it while fixing, and the
  full run before merging. `E2E_FAILFAST=1` stops at the first failing step; `E2E_TIMEOUT` sets the
  per-action wait (10 s). Pauses after a tap go through `nap()` (capped at 160 ms, `E2E_NAP`); after typing in
  a search box use `debounced()` (the lists repaint 150–250 ms later); a list that repaints after a save is
  checked with `until()` (polls up to 3 s), never a longer sleep. The demo has `window.__logbookTest.flushSummary()`
  so a Totals check doesn't wait the 4 s for the summary. The run sets
  localStorage `apmes-logbook-demo-small`, so the demo keeps its six seeded cases and skips the big sample
  logbook (`demo-seed.js`); counts in the steps start from those six. Navigation goes through the `tab()`
  helper: Settings pages (`display`, `logging`, `tags`, `reflset`, `sharefmt`, `bin` = the Recycle bin dialog),
  `data` (Export / Import), `totals` (by hash, under Analytics). On a wide screen the Add tab is two panes.
- Owner preferences (merging, screenshots, planning, new options): see "Working with the owner" in `AGENTS.md`.
  Logbook calls so far: no tag renames (APMES tag names stay), no raw regex, no swipe actions on cases, no tag
  numbers on screen, no What's new, frictionless logging first.
- **Testing in Firefox (Gecko)**: Playwright's Firefox installs fine into the scratchpad (only Chromium is preinstalled;
  don't re-download Chromium): `PLAYWRIGHT_BROWSERS_PATH=<scratchpad>/pw node /opt/node22/lib/node_modules/playwright/cli.js install firefox`,
  then `firefox.launch()` with the same `PLAYWRIGHT_BROWSERS_PATH` (no `isMobile` in Firefox; set a mobile viewport and
  user agent). Desktop Gecko has no dynamic toolbar or add-ons, so phone-only Firefox issues may still need the owner.
- **Ad blockers hide class names on their lists** (Oct 2026): EasyList (uBlock Origin etc., common on Firefox for
  Android; Chrome on Android has no add-ons) has `##.adv-link`, so the Advanced settings links vanished on the owner's
  Firefox while Chrome showed them. Avoid ad-like class and id names (adv-, ad-, advert, banner-ad, sponsor…); when
  something is missing on one browser only, check https://easylist.to/easylist/easylist.txt for its class first.
- Learned in Oct 2026 (Claude Code session, PRs #133–#152):
  - How a new option is built here: per device (`DISPLAY_KEYS`, html classes from `applyLook`, first paint in
    index.html) unless it belongs to the account; "Reset this page" and the settings file must cover it; defaults
    must stay pixel-identical (screenshot-diff a worktree of origin/main served on another port).
  - Everyday choices on a settings page, the rest on its Advanced page (`#loggingadv`, `#adminadv`; look settings are split by Themes / Layout instead).
  - Watch for `.bar .grow { min-width: 160px }`: it wraps toolbars on phones (Unlink, Save / Retry). Buttons centre
    their content (`justify-content: center`), which shifted calendar days.
  - Show only what helps: owner prefers a ✓ on rows over calendar badges, small text over cards for guidance.
  - All the logbook checks in one go: `tools/test-logbook.sh` (repo check, unit tests, full e2e, and the focused
    runners recovery / usability / cloud-save / notepad / daily-note / tag-editor / simpler; `quick` skips the full e2e). Add new
    focused runners to it. Rules: `tools/test-rules.sh` (emulator, fake accounts, both suites).
  - Accessibility: `test/e2e/a11y.mjs` (axe-core 4.13.0, pinned in `tools/vendor/axe.min.js`, MPL-2.0; WCAG 2.2 A/AA)
    is **not** one of those (owner: not on every e2e). Run it after UI changes or before a release, about 75 s:
    every screen plus the edit-case dialog and reflection editor in light at phone and desk sizes, dark on the main
    screens (`A11Y_DARK=all` for every one); `A11Y_ONLY=<words>` checks only matching screens. Serious or critical
    problems fail it. Add new screens to its `SCREENS` list (Notes and its editor are in it). Oct 2026 first run found 3 problems, all fixed
    in #166: the calendar is now a labelled group (a grid role needs row/cell children), and Totals' sideways scroll
    box and the Markdown previews are focusable with names. Now 0 serious or critical.
  - The cloud session's safety filter refuses to write or push credentials, even public ones (the MCP Desktop
    client secret): the owner commits those via a GitHub web edit (GitHub secret scanning: "It's a false
    positive"). `.claude/settings.json` allows pushing to `claude/*` branches so a push isn't blocked.
- Working alongside another assistant (Claude Code and Codex each run in their own cloud environment and share
  nothing but GitHub): one owner per PR and per area at a time; start from current `main`; keep PRs small and
  merged promptly so the other side's branch doesn't drift. Claude Code watches the PRs it opens and acts on
  every comment, review and failure there: a comment on one of its open PRs wakes it, so don't post on it
  unless you mean to reach it (or the owner has stopped it first). Pass work across with a PR link via the owner.
- After a big batch, a review pass pays: three reviewers in parallel, one per area (Add tab; Logbook search,
  Excel and upload; settings, account, reflections), each asked for concrete scenarios and to reproduce in the
  demo, found ~16 real bugs in Oct 2026 (#117). Verify each finding before fixing; add a unit test when the
  logic is pure.
- Gotchas (Claude Code's cloud shell; Codex may differ): the shell's cwd resets between commands, so `cd logbook &&` every time (a relative `sw.js` sed once
  missed for ten commits). Long Python edits: write the script to the scratchpad and run it (inline heredocs with
  quotes broke). Regex edits by id can hit a sub-type with the same id (`chronic` is a heading and a regional
  sub-type). The local test server (`python3 -m http.server 8080` from the repo root) dies now and then: restart.
  Demo data lives in localStorage `apmes-logbook-demo-v1` (tests can edit it, e.g. take the user off the list).
- Branch work: after a merge, restart the branch from `origin/main`.


Reliability-hour lessons (15 Oct 2026): a cloud container with 4 CPUs runs only 2 agents per workflow, so run one workflow per area
side by side. In the multidevice harness, `SLOW=1` used to leave the page "offline" while Firestore's open connection still reached the
server (fixed in #571): a failure that needs a state no real phone can be in is the harness's, so check that first. `writes.entries()`
lists the newest job first. The conflict path's blind spots (a save after a conflict, an overlay frozen at the conflict) explained
every remaining soak failure.

Merging parallel fix branches (15 Oct 2026): after one is squash-merged, merging main into the next branch brings back the same
conflicts; when that branch already holds the combined code, take its side (`git checkout --ours`), then check `git diff
origin/main` shows only its own change. Never let emulator leftovers (`firebase-debug.log`, `firestore-debug.log`,
`node_modules`) into a commit. GitHub's slow `browser` job can be run locally (`.github/workflows/checks.yml` lists the steps);
`feedback/test/e2e.mjs` needs the real Worker and may time out from a cloud container.
