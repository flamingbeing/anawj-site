# NTF Roster: status

Last updated: 2026-10-15 by Claude Code (NTF Roster session, branch `claude/practical-pasteur-ff2uqp`). **Paused** at the
owner's request (usage limit), part-way through the first build. Nothing is live; nothing merged.

## The request (owner, 15 Oct 2026)

"Make an NTF roster web app for NTF anaesthesia, usable from both phone and laptop. No restrictions on the interface;
reference high-quality rostering apps. No need to be the same logic or interface as my NUH roster app. I will need to
constantly add rules and combination restrictions after the app is published, so build that in too." Inputs he
uploaded (real names: **never commit**; they were read in the session's scratchpad only): the department's monthly
"ALL STAFF LEAVE REQUEST" sheets (Jan–Dec 2026, PDF and one .xlsx), the Dept Ops admin leave plan, the October
teaching programme. What was learned from them is in `SPEC.md` (groups, duty/leave/request codes, sheet layout).

## Now

Built so far (first drafts by parallel build agents, **not yet integrated or tested**):

- `js/model.js`, `js/rules.js` (rule types registry, evaluate), `js/solver.js`, `js/solver-worker.js` (builder A;
  its unit tests `test/rules.test.mjs`, `test/solver.test.mjs` were not written yet)
- `index.html`, `js/app.js`, `js/store.js`, `js/ui-roster.js`, `js/ui-day.js` (builder C; `style.css` not written yet)
- Repo wiring, committed: `worker/routes.js` (`ntfroster.anawj.com` → `ntf-roster/`) and its test, `SUBDOMAINS.md`,
  `.github/labeler.yml`, `checks.yml` (unit tests + `ntf-roster/test/e2e.mjs`), `tools/shots.mjs`, `tools/test-rules.sh`
  (ntf-roster suite), `AGENTS.md` (app entry and test line), `OPERATIONS.md` (Firebase `ntf-roster`, not created).

Not started (builders B, D, E):

- B: `js/ui-rules.js` (rule list + schema-driven rule builder, templates, live "check now", rules log, rules JSON),
  `js/ui-people.js` (staff, groups, tags, duty codes), `js/ui-check.js` (problems by rule, fairness, coverage), `css/rules.css`
- D: `js/io.js` (Excel import/export in the department layout, JSON backup, ICS, CSV), `js/demo.js`, `js/ui-more.js`,
  `vendor/exceljs.min.js` (copy from `../nuh-roster/vendor/` with its licence), `test/io.test.mjs`
- E: `js/cloud.js`, `js/firebase-config.js` (empty), `firestore.rules`, `test/rules.emulator.mjs`, `js/ui-team.js`,
  `sw.js` (`VERSION = 'ntf-roster-v1'`), `manifest.webmanifest`, `icons/`, `js/version.js` (app version lines)
- Then: integration (wire modules, `style.css` if still missing, all unit tests, `node tools/check.mjs`), `test/e2e.mjs`
  (desktop + phone + axe), review (engine correctness, phone UX, robustness/XSS), fixes, `NOTES.md` + `README.md`.

## How to carry on

1. Read `SPEC.md` (the module contract: state, rule types, file owners). It is the source of truth for every module.
2. Re-run the build: `BUILD-WORKFLOW.js` is the Workflow script this session used (builders with full prompts, then
   integrate, review, fix). Run it with builders A and C removed (their drafts are here; add A's unit tests and C's
   `style.css` to the integration step), and tell B, D and E to read the existing files first and keep them.
3. Before merging: `node tools/check.mjs`; `for f in ntf-roster/test/*.test.mjs; do node "$f"; done`;
   `node worker/test/routes.test.mjs`; with `python3 -m http.server 8080` on the repo root, `node ntf-roster/test/e2e.mjs`;
   `node tools/proofread.mjs`. The Checks workflow on the PR stays red until `test/*.test.mjs` and `test/e2e.mjs` exist.

## Waiting on the owner

- Confirm the real numbers the default rules guess: 2 juniors + 1 senior on call per night, 1 PM shift per weekday,
  max 7 calls a month, 1 PHD on public holidays; and what OTC, W, Creg, HC, NS, JR and "(B)" after MO names mean.
- Later, for team sharing: create Firebase project `ntf-roster` (Google sign-in, authorised domain
  `ntfroster.anawj.com`), paste its web config into `js/firebase-config.js`, grant the rules deployer Firebase Rules
  Admin, then add the matrix entry to `.github/workflows/deploy-firestore-rules.yml`.
- After merge: Cloudflare custom domain `ntfroster.anawj.com` on the `anawj-preview` Worker (`SUBDOMAINS.md`).

## Decisions log

- 2026-10-15: home is anawj-site, `ntf-roster/` at `ntfroster.anawj.com` (sibling of nuh-roster; anantf.com's rules
  keep rotas off that site). Own subdomain because it saves data.
- 2026-10-15: one monthly grid like the department's leave request sheet (staff by grade group × days), assignments
  and requests kept apart in each cell, post call (x) derived from overnight duties, never stored.
- 2026-10-15: every rule is data the owner edits in the app (10 rule types: cover, limit, sequence, sameDay, together,
  maxRun, requests, spread, eligible, standing; hard or soft with weight; who/when filters); a new rule *type* is one
  entry in `RULE_TYPES` plus a test.
- 2026-10-15: local-first (`localStorage` `ntf-roster-v1`, demo `ntf-roster-demo`), JSON backup; Firebase team sync
  built but off until the owner creates the project.
