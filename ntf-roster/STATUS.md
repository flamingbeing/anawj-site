# NTF Roster: status

Short and current: what is happening now, what waits on the owner, what is next, and the decisions made along the way.
Lasting rules and lessons go in `NOTES.md`. Each session edits only its own file under `status/` (see **Now**).
Update this file when a task finishes, a decision is made, or before compacting (`/save-state`).

Last updated: 2026-10-15 by Claude Code (NTF Roster build session, branch `claude/practical-pasteur-ff2uqp`; speed and
design merged, then the second review's fixes).

## The request (owner, 15 Oct 2026)

"Make an NTF roster web app for NTF anaesthesia, usable from both phone and laptop. No restrictions on the interface;
reference high-quality rostering apps. No need to be the same logic or interface as my NUH roster app. I will need to
constantly add rules and combination restrictions after the app is published, so build that in too." His uploads
(the department's monthly leave request sheets, the Dept Ops leave plan, a teaching programme) hold real names: they
were read in a session scratchpad only and are **never committed**. What was learned is in `NOTES.md`.

## Now

Each session keeps its own line in `status/<session>.md` (`build.md` so far). Read them all before starting; edit
only yours.

The first version is built and integrated (all modules wired, unit, browser and emulator tests green), now with the
speed work and the NTF app design language; not yet merged or live.

## Waiting on the owner

- Try the practice department (`?demo`) on a phone and a laptop once the PR preview is up (new look, faster).
- Look at the new default duty colours (warm and earthy, no blue, teal or purple: Call brick red, SMO chestnut, OTC
  umber, PHD dark olive, W charcoal brown; leave rose, requests outlined in wine). Only new installs and the practice
  department get them; a saved roster keeps its colours (People › Duty codes).
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
4. Known limits in `NOTES.md` if they bite (cell editor length; a full grid redraw is still about 1 s of work on a
   slowed phone, though the rows on screen show in about 0.4 s).

## Recently done

- 2026-10-15: **second review of the speed and design work, fixed**. Bugs: Auto-fill on a tight department left more
  must-fix problems than the first version (it now searches on, hot, while any remain: 60 test runs back to the first
  version's total); going back to a month, or to the Roster tab, with the remembered cell low in the list drew every
  row at once (now that row is drawn first: 0.6–0.9 s → 0.25 s on a slowed phone); Clear in the paint bar couldn't be
  chosen; the import review was unreadable on phones. Speed: month switch 0.47 → 0.38 s, tap a code 0.22 → 0.20 s,
  paint 0.26 → 0.21 s (no colour fade on the editor's tiles). Design: on phones the roster's month sits in the top bar
  and Auto-fill leads the chip row (the grid starts ~100 px higher), other screens keep one head row (tap the month for
  today); back buttons in the bar for one person's month and People (People now always under More: five tabs); the
  fresh start shows its buttons first and no Auto-fill or month; rule rows lose Edit/Copy/Delete (in the rule's footer
  now) and the switch gets a 44 px area; the rule builder starts with a hint and puts errors under the field; Check is
  one centred column on laptops; 44 px grid rows and targets on touch screens; code names wrap; default duty colours
  without blue, teal or purple; selected day blush; one close on read-only sheets (cell editor: Done); warning toasts
  ink; "1 rule"; holiday names as row titles.

- 2026-10-15: **speed** (owner: "a bit too slow?"), on a phone-sized screen with the CPU 4x slower, first version →
  now: switch month 0.76 s → 0.39 s until the new month shows; tab to Roster 0.71 → 0.46 s; tap a code → grid 0.40 →
  0.31 s; paint 3 cells 1.08 → 0.78 s; rule builder live check 0.17 → 0.07 s; Auto-fill to its preview 3.2 → 0.95 s
  (laptop 3.0 → 0.77 s). How: the grid swaps only changed cells and draws big redraws progressively (rows on screen
  first), a faster rule check, a shorter Auto-fill search that stops once converged (same quality), sheets over the
  grid open non-modal (a modal dialog restyled the whole grid: +0.25 s each way), and no `body:has()` rule. New
  `test/perf.e2e.mjs` guards tap, code and month switch, in the Checks workflow (fails only if a second run is over).
- 2026-10-15: **NTF app design language** (owner: "use the new NTF design language for webapps"): anantf-site's app
  kit vendored as `css/app.css`, Inter, Fraunces and JetBrains Mono self-hosted in `fonts/` (no Google Fonts), kit top
  bar with the practice badge, large titles, bottom tabs (a left rail with People from 1024 px), `<dialog>` sheets,
  grouped lists, chips and segmented controls on every screen, line icons instead of emoji, warm default duty colours,
  light only. The NUHS band and tokens are not used in this app. Built in parallel worktrees and merged.

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

- 2026-10-15: People sits under More at every size (the NTF app kit allows five tabs); on phones the roster grid's
  month goes in the top bar; Auto-fill searches on while must-fix problems remain (up to the first version's budget).

- 2026-10-15: NTF Roster uses the NTF app design language (anantf-site `DESIGN-APP.md`, kit in `css/app.css`, copied
  as is), not the NUHS look; default duty colours are warm and earthy (data: saved rosters keep theirs).
- 2026-10-15: speed budgets are a check (`perf.e2e.mjs` in the Checks workflow); Auto-fill's 3/6/15 s options are now
  upper bounds ("Search for at most") and its rosters differ from the first version's for the same seed; sheets over
  the roster grid open non-modal for speed, elsewhere they stay the kit's modal sheet.
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
