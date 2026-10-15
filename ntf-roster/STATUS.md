# NTF Roster: status

Short and current: what is happening now, what waits on the owner, what is next, and the decisions made along the way.
Lasting rules and lessons go in `NOTES.md`. Each session edits only its own file under `status/` (see **Now**).
Update this file when a task finishes, a decision is made, or before compacting (`/save-state`).

Last updated: 2026-10-15 by Claude Code (NTF Roster build session, branch `claude/practical-pasteur-ff2uqp`).

## The request (owner, 15 Oct 2026)

"Make an NTF roster web app for NTF anaesthesia, usable from both phone and laptop. No restrictions on the interface;
reference high-quality rostering apps. No need to be the same logic or interface as my NUH roster app. I will need to
constantly add rules and combination restrictions after the app is published, so build that in too." His uploads
(the department's monthly leave request sheets, the Dept Ops leave plan, a teaching programme) hold real names: they
were read in a session scratchpad only and are **never committed**. What was learned is in `NOTES.md`.

## Now

Each session keeps its own line in `status/<session>.md` (`build.md` so far). Read them all before starting; edit
only yours.

The first version is built and integrated (all modules wired, unit, browser and emulator tests green); not yet
merged or live.

## Waiting on the owner

- Try the practice department (`?demo`) on a phone and a laptop once the PR preview is up.
- Confirm the numbers the default rules guess: 2 juniors and 1 senior on call each night, 1 PM shift each weekday,
  at most 7 calls a month (juniors), 1 PHD on public holidays, at least 3 days between calls.
- Confirm the code meanings marked as guesses: OTC, W, Creg; and say what HC, NS, AH, JR (as a cell code) and "(B)"
  after an MO's name mean.
- For team sharing, later: create Firebase project `ntf-roster` (Google sign-in, Firestore), fill
  `js/firebase-config.js`, add `ntfroster.anawj.com` to Authentication › Authorised domains, add yourself as the first
  admin, grant the rules deployer Firebase Rules Admin, then add the matrix entry to
  `.github/workflows/deploy-firestore-rules.yml`. PDPA and hospital policy before real names go to Google Cloud.
- After merge: Cloudflare custom domain `ntfroster.anawj.com` on the `anawj-preview` Worker (`SUBDOMAINS.md`).

## Next (agreed queue)

1. Open the PR (`NTF roster: first version`), check the preview, merge once the Checks are green.
2. The owner's answers above: adjust the default rules and codes (they are data; new installs and the demo pick them
   up, existing rosters change in the Rules tab).
3. Import a real month (in the owner's browser only) and tune Auto-fill against it.
4. Known limits in `NOTES.md` if they bite (cell editor length, month-switch redraw time).

## Recently done

- 2026-10-15: back to the NUHS design system (owner, after trying NTF's app design in #605): the look is the first
  version's again; the speed work from #605 stays (grid patches cells, progressive month redraw, live rule checks once per
  frame, Auto-fill about 3x faster with the tight-department fix), plus the paint Clear fix; `test/perf.e2e.mjs` in Checks.
- 2026-10-15: #580 first version merged; #605 (NTF app design language + speed) merged, then its look reverted.
- 2026-10-15: fixed what three reviews (engine, phone UX, robustness) found: hard rules now always beat soft ones in
  Auto-fill; month-edge checks (long rolling windows, weekend requests and post call across the month boundary,
  last month's excess); malformed rules or backups no longer switch checks off or break screens; a stored XSS through a
  duty code's kind closed; two tabs no longer overwrite each other; a damaged save is kept aside; touch-safe paint mode,
  Back closes sheets, confirms before removing people or rules, grid key, Combination restriction in Add a rule.
  Feature-sized review items left are in `NOTES.md`, Known limits.

- 2026-10-15: first version built by five parallel builders against `SPEC.md` (engine; shell and roster; rules,
  people and check screens; Excel, demo and More; team sharing and offline app), then integrated: service worker
  wired, injected styles moved into `style.css`, the browser test `test/e2e.mjs` written, docs.

## Decisions log

- 2026-10-15: this app follows the NUHS design system (`../nuhsdesign/tokens.css`, the four-colour band), like the other
  anawj.com apps. NTF's app design language (anantf-site `DESIGN-APP.md`) was tried in #605 and reverted the same day at the
  owner's request; don't switch again without asking.
- 2026-10-15: home is anawj-site, `ntf-roster/` at `ntfroster.anawj.com` (sibling of nuh-roster; anantf.com's rules
  keep rotas off that site). Own subdomain because it saves data.
- 2026-10-15: one monthly grid like the department's leave request sheet (staff by grade group × days), assignments
  and requests kept apart in each cell, post call (x) derived from overnight duties, never stored.
- 2026-10-15: every rule is data the owner edits in the app (10 rule types: cover, limit, sequence, sameDay, together,
  maxRun, requests, spread, eligible, standing; hard or soft with weight; who/when filters); a new rule *type* is one
  entry in `RULE_TYPES` plus a test (`NOTES.md`, "How to add a new rule type").
- 2026-10-15: local first (`localStorage` `ntf-roster-v1`, practice `ntf-roster-demo`), JSON backup; Firebase team
  sync built but off until the owner creates the project.
- 2026-10-15: Auto-fill places only duties marked `auto` (C, P, SMO, OTC, PHD by default), keeps locked cells and
  anything entered by hand, runs in a Web Worker, and shows a preview before Apply (one undo step).
- 2026-10-15: phones open on Day, laptops on Roster; People sits under More on phones.
- 2026-10-15: Excel import replaces leave, requests and other codes for the people and months in the sheet, but keeps
  shifts already planned in the app unless the sheet has a shift that day.
