# anawj.com

Instructions for every AI assistant working here (Codex reads this file; Claude Code reads it through
`CLAUDE.md`, which adds only Claude-specific notes).

Static site on GitHub Pages (public repo: no names, patient data or real evaluation data). Apps share one origin:

- `evals/`: APMES workplace-based assessments. Start with `evals/NOTES.md` (decisions, MedHub, forms, operations), then `evals/README.md`.
- `logbook/`: APMES case logbook. Start with `logbook/NOTES.md` (principles, words, screens, tags, demo, how to test), then `logbook/README.md`.
- `people/`: APMES People, the one place to keep the resident, faculty and PD lists that logbook and evals share
  (add a yearly intake, year check, CSV), at `apmes.anawj.com/people/`; admins and PDs only. It reuses evals' code. Start
  with `people/NOTES.md`.
- `nuh-roster/`: NUH anaesthesia daily roster (own Firebase project `nuh-roster`), at `nuhroster.anawj.com` (the old `anawj.com/nuh-roster/` redirects). Start with `nuh-roster/NOTES.md`: its department section (grades, postings, roster sheet, notation, HMS monthly rosters, short names) applies to any app dealing with NUH anaesthesia staff.
- `prewarm/`: prewarming study op-day data collection (temperatures every 5 min, export to the study's Excel template); served at `prewarmstudy.anawj.com`. Start with `prewarm/NOTES.md`, then `prewarm/PLAN.md`.
- `bis-dsa/`: BIS to DSA teaching simulator for anaesthesia residents (one static page, synthetic EEG, no data), at
  `anaes.anawj.com/bis/`. Start with `bis-dsa/NOTES.md`.
- `ot-sim/`: anaesthesia operating-theatre simulator for teaching (a general anaesthetic, the vitals monitor and
  crisis scenarios; one static site, synthetic physiology, no data), at `anaes.anawj.com/ot/`. Start with
  `ot-sim/NOTES.md`, then `ot-sim/PLAN.md` (the build brief for autonomous sessions).
- `hand-babies/`: hand surgery exam crash course for new MOs (one static page, no data), at `hand.anawj.com/babies/`. Start with `hand-babies/NOTES.md`.
- `hand-log/`: hand surgery DOPS and Mini-CEX log (data on the device only, CSV/JSON export), at `hand.anawj.com/handlog/`. Start with `hand-log/NOTES.md`.
- `edit/`: the page editor for any page on the site (`edit.anawj.com/<path>` redirects to it). Suggested edits arrive as
  GitHub issues titled `Page edits:`; how to apply them: `edit/NOTES.md`. A daily routine ("Page edits check", 8:58 am
  Singapore) drafts one PR for new ones and never merges: the owner approves page edits.
- `ask/`: Ask Claude, the owner's one-step change request at `ask.anawj.com` (behind Cloudflare Access; API in
  `worker/ask.js`). How it works and its setup: `edit/NOTES.md`, "Ask Claude".
- `apmes/`: APMES programme documents (not secret): the EPA Guidebook v8 and requirements transcribed (the evals
  data is built from them), and the blank portfolio template the logbook tests use. See `apmes/README.md`.
  Before adding a programme file, check its cover/contributor pages and file details (author, embedded files) for
  names; add a cleaned copy.
- `nuhsdesign/tokens.css`: shared design tokens; `nuhsdesign/README.md` is the NUHS-style guide (`nuhsdesign/STATUS.md`
  for its status). Every subdomain serves `/nuhsdesign/` (the old `/design/` path was retired 13 Oct 2026; link `../nuhsdesign/tokens.css`). Every app's top band is four equal quarters: orange `#e57200`, red `#e4002b`, blue `#178fd7` (not cyan),
  navy `#002f6c`. Focus rings are navy on light grounds (cyan on white is only 2.7:1).

Rules that bite:

- Accounts, settings, costs, the pre-launch checklist and how to hand over: [OPERATIONS.md](OPERATIONS.md). Update
  it when an account, setting or cost changes.
- A PR that changes any `firestore.rules` deploys live on merge. Sessions may merge it themselves (owner, 14 Oct 2026: rules
  and data are his biggest headache; he does not want to intervene), carefully: run `tools/test-rules.sh` first, merge only
  when the Checks are green, confirm the "Deploy Firestore rules" run succeeded, and say in the report which rules changed
  and what they now allow or deny. Never loosen rules on real-data collections (logbook, evals, prewarm, roster) just to
  make a test pass.
- **Blocked by the cloud environment?** (no Google Cloud sign-in, the owner's real documents, a long test run, a
  secret): hand it to the owner's home-computer session instead of stopping. How and what to send: `OPERATIONS.md`,
  "The home computer". It changes live projects only with the owner's OK.

- The homepage (`index.html`) only shows whether the server is up or down (owner, Oct 2026). Apps stay unlisted:
  never link them from the homepage, and give each app page `<meta name="robots" content="noindex, nofollow">`
  (GitHub Pages ignores `_headers`, so the meta tag is what keeps anawj.com out of search engines).
- Subdomains (owner, 13 Oct 2026; plan and progress in [SUBDOMAINS.md](SUBDOMAINS.md)): an app that saves data or
  signs people in gets its own subdomain (apps sharing data or sign-in share one, like `apmes.` for logbook and
  evals); static pages share a subdomain by topic (`hand.`). Never put a data app on a subdomain with apps it doesn't
  need to share with. Name subdomains for what they're for, once.

- `logbook/firestore.rules` is the one rules file for both logbook and evals (Firebase project `apmes-logbook`). It deploys automatically on merge to main; never ask the owner to paste rules.
- `nuh-roster/firestore.rules` (Firebase project `nuh-roster`) and `prewarm/firestore.rules` (project `prewarm-study`) deploy the same way.
  How: `.github/workflows/deploy-firestore-rules.yml` deploys a changed file to its project on merge to main
  (check the "Deploy Firestore rules" run in Actions). It compiles the rules first, so a syntax error fails the run
  and leaves the live rules as they were. It signs in with the `FIREBASE_SERVICE_ACCOUNT` secret (service account
  `firebase-rules-deployer@apmes-logbook.iam.gserviceaccount.com`, Firebase Rules Admin on both projects); sessions
  never need the secret. A manual run (Run workflow) deploys both files over the live rules: ask the owner first.
  A new Firestore-backed app needs a matrix entry and paths filter in the workflow, and the owner grants that
  service account Firebase Rules Admin on the new project.
- `evals/js/catalogue.js` and `evals/js/forms.js` are generated. Edit `apmes/` (the transcribed APMES documents) or `evals/tools/build-data.mjs`, then run `node evals/tools/build-data.mjs`.
- Don't bump an app's `sw.js` `VERSION` by hand: the deploy stamps it with a hash of the app's files
  (`tools/stamp-versions.mjs`, run by `.github/workflows/pages.yml`), so PRs leave `sw.js` alone unless its code
  changes. Change the base (`logbook-v40`) only when the service worker's own logic changes. The deployed name is
  `<app>-<date>-<hash>` (`logbook-2026-10-14-3f9a2c1d`: the day the app's files last changed, then the hash).
- **App version and "Get the latest version"** (owner, 14 Oct 2026; prewarm's settings are the model): every app with a
  service worker ends its settings screen (or, with no settings screen, its page footer) with two lines of small muted
  text. First, `App version 2026-10-14 (3f9a2c1d)`, read from the app's cache name (`caches.keys()`, the one starting
  `<app>-`; show the rest as it is if it isn't dated; show nothing without one). Second, a link-styled button
  `Not updating? Get the latest version`: it fetches the app's `sw.js` with `cache: 'no-store'` first (no signal: say so and
  change nothing), then unregisters only this app's service worker, deletes only caches starting `<app>-` and reloads.
  It never touches saved data (localStorage, IndexedDB, sign-in). A browser test checks both lines. The same goes for
  apps in other repos (anantf.com's `babymo/`).
- One repo, one PR number sequence for every app: start PR titles with the app ("Logbook: …", "Prewarm: …"); a
  workflow labels each PR by the folders it touches (`.github/labeler.yml`), so filter the PR list by label. Outside
  an app's own files, write PRs as `#295 (logbook)`.

Before merging, run (GitHub runs these too on every PR, plus the editor, feedback-button and hand browser tests: the
"Checks" workflow; a red check means don't merge):

```
node tools/check.mjs
for f in evals/test/*.test.mjs logbook/test/*.test.mjs nuh-roster/test/*.test.mjs prewarm/test/*.test.mjs people/test/*.test.mjs worker/test/*.test.mjs feedback/test/*.test.mjs; do node "$f"; done
```

- Logbook changes: `tools/test-logbook.sh` runs all of the above plus the full e2e and every focused browser test
  (about 10 min; `quick` skips the full e2e). Its portfolio-template steps use `apmes/templates/portfolio-template-blank.docx`. After UI changes also run `node logbook/test/e2e/a11y.mjs` (accessibility).
- Rules changes (`logbook/firestore.rules`, `prewarm/firestore.rules`, `nuh-roster/firestore.rules`): `tools/test-rules.sh` runs the logbook, evals, prewarm and roster rules suites in the
  local emulator (fake accounts, demo project; no sign-in, never the live projects).
- Evals UI changes: also run the e2e test (see `evals/README.md`).
- Prewarming UI changes: `tools/test-prewarm.sh` runs the repo check, prewarm unit tests and the three browser tests
  (`prewarm/test/e2e.mjs`, `edge.e2e.mjs`, `fullcase.e2e.mjs`) side by side in about 1½ minutes (see `prewarm/README.md`).
- Hand assessment changes: run `node hand-babies/test/e2e.mjs` (see `hand-babies/README.md`).
- NUH roster changes: run `node nuh-roster/test/e2e.mjs` (Practice in a browser, desktop and phone, axe on every tab;
  under a minute; also in the Checks workflow).
- Hand log changes: run `node hand-log/test/e2e.mjs`.
- OT simulator changes: run `tools/test-ot-sim.sh` (model tests, repo check, browser test; see `ot-sim/NOTES.md`).
- BIS to DSA changes: run `node bis-dsa/test/e2e.mjs` and `node bis-dsa/test/engine.check.mjs` (engine tuning, no browser).
- People changes, and evals changes to `cloud.js`, `ui-core.js` or the People panes in `ui-admin.js`: run `node people/test/e2e.mjs`.
- Page editor changes (`edit/`): run `node edit/test/e2e.mjs` and `node hand-babies/test/e2e.mjs` (it opens the editor).
- Feedback button or Worker changes (`feedback/`, `worker/`): run `node feedback/test/e2e.mjs` (through the real Worker).
- Ask Claude changes (`ask/`, `worker/ask.js`): run `node ask/test/e2e.mjs` (the API's tests are in `worker/test/`).
- New or moved pages and documents: `node tools/proofread.mjs` (broken links, missing `noindex`, titles, alt text; also weekly).

## Working with the owner

- **Working with the owner day to day:** instructions mostly arrive from a phone, and sessions carry on agentically
  in between, so work through a request to the end without waiting to be watched, ask only when a decision is
  genuinely the owner's, keep each PR small and finished on its own, and keep `STATUS.md` current so the next session
  can pick up from the files alone. A ready-to-paste snippet, with exactly where it goes, is fine when that's the
  quickest route. Use the real technical terms, and explain each briefly the first time (an everyday or clinical
  comparison helps), so explanations double as small lessons.
- **Speed vs care:** the owner favours speed and merges to main freely while exploring what AI coding can do. That
  holds for most apps. **Vital apps get more care:** `prewarm/` (live study data) and `logbook/` (live soon): full
  tests before merging, preview links for the owner, and nothing merged into them while a prewarm case is being
  collected if the owner has said one is running.
- **Goal now:** find diverse use cases. Ideas and the longer-term direction are in [ROADMAP.md](ROADMAP.md).
- **Merging:** merge your own PRs once the checks above pass, then report (with the PR link). Merge by the number the
  PR's creation returned, never a guessed next number (13 Oct 2026: a guess merged another session's PR early). Exceptions: Claude
  Code–Codex handover PRs wait for the owner's explicit approval (`firestore.rules` PRs do not any more: see Rules that bite); the owner may say "auto-merge" for a batch, or
  "no e2e yet" (then unit tests and quick browser checks).
- **Planning:** for multi-part work, say the plan first and wait when asked; the owner plans in batches, then it's
  built PR by PR, each merged before the next. When the owner asks "should we / can we", answer and propose.
  While another session or Codex works in an area, plan only and don't merge into it.
- **Show it:** phone screenshots (390 px) of UI changes, plus preview links once a PR has one (see PR previews). Every
  PR also gets an automatic before-and-after comment of the first screen of each app it changes
  (`.github/workflows/pr-screenshots.yml`); for other screens add a line `Screens: /logbook/?demo#notes` to the PR body.
- **New options:** optional settings, off by default, per device unless they belong to the account; existing
  defaults stay exactly as they look now.
- **Writing for the owner:** plain words, short; say what changed for residents and what the owner needs to do.
- **Keep the repo public-safe:** fake data only; never commit secrets, tokens or credentials (the owner commits
  any needed public client IDs themselves).
  **Personal notes** (how the owner works through his own day, his own notes, thoughts, private plans) go in his private
  repo `flamingbeing/life`, never here: write the personal version there first and keep only a plain product version in
  this repo. Never copy anything from `life` into this repo.

## Status and decisions (before compacting)

Site-wide work (homepage, subdomains, operations, repo rules) is tracked in the root `STATUS.md`. Each app keeps a short `STATUS.md` beside its `NOTES.md` (start: `logbook/STATUS.md`): what each session is doing
now, what waits on the owner, the agreed next steps, recently merged PRs and a dated decisions log.

- Read the app's `STATUS.md` (then `NOTES.md`) before starting work, and after any context compaction.
- Update it when a task finishes, a decision is made, before compacting and before a session ends: the
  [save-state skill](.agents/skills/save-state/SKILL.md) (`/save-state` in Claude Code, `$save-state` in Codex).
- Edit only your own session's file under "Now" (`<app>/status/<session>.md`). Lasting rules and lessons go in `NOTES.md` (or here, if they apply
  to the whole repo).

## PR previews

Every PR gets a preview of the whole site on Cloudflare (Workers Builds; [PREVIEWS.md](PREVIEWS.md): setup,
limits; config in `wrangler.jsonc`, `.assetsignore`, `_headers`). For a PR that changes anything visible, find its
preview link (the Workers Builds check or comment on the PR) and give the owner direct demo-mode links to the
changed screens, e.g. `<preview>/logbook/?demo#notes`. Previews can't sign in (by design): check signed-in
behaviour with tests or the emulator, and never add preview domains to Firebase or the Google / Dropbox OAuth
clients. If no preview appears, Cloudflare isn't connected yet: say so and fall back to screenshots.

## Claude Code–Codex handovers

Both assistants run in separate cloud environments. Use
[the shared handover skill](.agents/skills/claude-codex-handover/SKILL.md)
and GitHub PRs to exchange pushed code and task context.

- Review a checkpoint without changing its branch or owner; report the reviewed SHA.
- Take over only after the sender/human confirms all writers have stopped. Continue
  on your own session branch and link its PR to the original.
- Include the branch/PR, goal, completed work, test results, blockers and next steps.
- Handover tasks require explicit human approval before merge or auto-merge, even
  where a general rule allows immediate merging.
- New cloud sessions get the skill through the repository clone. Do not modify an
  active Claude branch just to install these instructions.
