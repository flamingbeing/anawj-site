# NTF Roster: notes

What the app is, what we know about the NTF anaesthesia department's monthly roster, how the app is built and the
decisions behind it. Read this before changing `ntf-roster/`. `SPEC.md` is the module contract (state shape, exports,
rule types); `STATUS.md` is what is happening now.

The repo is public: never commit real staff names, rosters, leave or the department's sheets. Demo and tests use
made-up names only.

## What it is

The monthly duty roster of the Department of Anaesthesia, Ng Teng Fong General Hospital (NTFGH): calls, PM shifts,
clinics and other duties together with leave and requests, on one grid like the department's "ALL STAFF LEAVE
REQUEST" sheet (staff by grade group down the side, days across). It checks the roster against **rules the owner adds
and edits in the app at any time** (the owner's main ask: "I will need to constantly add rules and combination
restrictions after the app is published") and can **fill the calls and shifts automatically** (Auto-fill).

- Address: <https://ntfroster.anawj.com/> (own subdomain because it saves data; `worker/routes.js` maps it to
  `ntf-roster/`). Practice with a made-up department: <https://ntfroster.anawj.com/?demo>.
- Static, vanilla ES modules, no build step, no framework. Phone (390 px) and laptop.
- Reference products for the quality bar: QGenda, Amion, Lightning Bolt, RosterLab, Deputy (colour-coded duty
  chips, sticky grid, request layer, live rule checks, fairness counts, one-click auto-fill with preview).

## The department (what the sheets showed; the owner confirms)

Learned from the department's monthly "ALL STAFF LEAVE REQUEST" sheets (Jan to Dec 2026), the Dept Ops admin leave
plan and a teaching programme the owner uploaded (read in a session scratchpad only, never committed).

### Groups (sheet order)

| id | Section on the sheet | Kind |
|---|---|---|
| `cons` | SENIOR CONSULTANTS / CONSULTANTS | senior |
| `ac` | ASSOCIATE CONSULTANTS | senior |
| `ext` | NUH / NTFGH / ICU CONSULTANTS | senior |
| `vc` | VISITING CONSULTANTS | senior |
| `sr` | SENIOR RESIDENTS | junior |
| `srp` | SENIOR RESIDENT PHYSICIAN(S) | junior |
| `rp` | RESIDENT PHYSICIANS | junior |
| `jr` | JUNIOR RESIDENTS | junior |
| `locum` | LOCUM / LOCUMS | junior |
| `mo` | MEDICAL OFFICERS | junior |

About 61 to 65 people a month (Dec 2026: 11, 6, 2, 3, 4, 2, 4, 7, 7, 15 by section). Names on the sheet can carry a
bracket note with the posting and its dates, e.g. "Name (R4-SR1 25/5/26-13/9/26)" or "Name (B) 6/5/26-7/9/26".

Tags (app-only labels): `babymo` Baby MO (a new MO, never on call alone), `parttime`, `pain` (APS), `icu`.

### Codes

Kinds: **shift** (work), **leave** (away), **request** (a wish, not an assignment), **other** (away from the NTF pool,
or note-like), **derived** (worked out, never stored).

| Code | Meaning | Kind | Notes |
|---|---|---|---|
| C | Call | shift | overnight (gives x next day); auto-filled |
| P | PM shift | shift | auto-filled |
| SMO | Stepdown MO call | shift | overnight; auto-filled |
| OTC | OT consultant | shift | **guess** at the meaning; auto-filled; seniors only (rule `r-otc`) |
| PHD | Public holiday day shift | shift | auto-filled; 1 junior on each public holiday is a **guess** |
| W | Weekend duty | shift | **guess** at the meaning; overnight assumed |
| Creg | Call tag-on | shift | **guess** at the meaning |
| APS | Acute pain service | shift | |
| Clinic, Inj | Clinic, injection list | shift | |
| AL, AAL, CL, TL, EL, RS, MC, HL, ML, NPL, OIL, FCL, CCL, SPL | Annual, advance annual, conference/training, training, exam, reservist, medical, hospitalisation, maternity, no pay, off in lieu, family care, childcare, special leave | leave | |
| Cr, Nc, Wr, Nw, Pr, NP | Call request, no call, weekend shift request, no weekend shift, PM request, no PM shift | request | |
| NUH, ICM, LT, Mtg, Teach | At NUH, ICU posting, liver transplant, meeting, teaching | other | |
| x | Post call | derived | the day after an overnight shift; never stored, ignored on import |

**Unconfirmed** (seen on the sheets, meaning not known; the importer offers to add them as kind "other" or keep them
as notes): HC, NS (14 cells in Dec), AH (5), JR (5; as a cell code, not the group), and what "(B)" after an MO's name
means (probably Baby MO). Free text like `3-4.30pm`, `bcls-pm`, `Clinic UG` goes into the cell note.

### Numbers the default rules guess

2 juniors and 1 senior on call each night; 1 PM shift each weekday that isn't a public holiday; at most 7 calls a
month for a junior (scaled by FTE); at most 2 weekend calls a month (soft); at least 3 days between calls (soft);
1 PHD on public holidays. All are ordinary rules the owner can change in the Rules tab.

## Data model

One state object, saved in `localStorage` (`ntf-roster-v1`; practice: `ntf-roster-demo`). Full shape in `SPEC.md`.

- `staff` (with group, tags, FTE, start/end dates, active), `groups`, `tags`, `duties` (the codes, with kind,
  colours, `overnight`, `auto`), `rules`, `rulesLog`, `settings` (department name, public holidays), `months`
  (status), `cells`.
- A cell is `{ a, r, auto, note, lock }`: `a` what the person is doing (assigned codes), `r` what they asked for
  (requests), `auto` the part of `a` Auto-fill placed (re-running it may change those; everything else stays), `lock`
  (Auto-fill never touches the cell). Empty cells and empty days are deleted, so the state stays small.
- Post call (`x`) is derived from an `overnight` code the day before, never stored.
- Dates are local `YYYY-MM-DD` strings; never UTC conversions.
- A practice or fresh state is saved on its first change (until then a reload rebuilds it).

## Rules engine (`js/rules.js`)

Every rule is plain data: `{ id, type, name, enabled, hard, weight, who, when, params, note }`. `who` picks people
(groups, tags, named people, except); `when` picks days (from/to, weekdays, public holidays any/only/exclude). Hard
rules must hold (each break costs 1000); soft rules (preferences) cost their weight (1 to 100).

Ten types, all in `RULE_TYPES`: **cover** (how many people on a code each day), **limit** (per person per week,
month or rolling window, optionally scaled by FTE or days in post), **sequence** (day-after rules: if X then not / must
Y on the next days, or days before), **sameDay** (combinations on one day), **together** (pairing between people:
never together / needs someone), **maxRun** (consecutive days), **requests** (honour a request code, by day or
weekend), **spread** (share fairly; always soft), **eligible** (only these people may have a code), **standing**
(a fixed duty on given weekdays). Code lists may use tokens: `@shift`, `@leave`, `@other`, `@request`, `@away`
(leave, other or post call), `@present` (a shift, or a normal weekday and not away), `@any`, and `x`.

How it checks: `evaluate()` builds a grid of effective codes for the month plus a week either side, or further when a
rule reaches further back (`ruleReach`: the longest day-after offset, rolling window or run) (bit flags per
person-day, so token tests are one AND), compiles each enabled rule into a small evaluator (per day, per person or
global), and collects violations with plain-English messages ("Tue 3 Nov: 1 junior on Call, needs 2"). A month of
80 staff × 31 days × 23 rules takes about 5 to 10 ms, so the app re-checks on every edit. Requests count as codes when
rules are checked (a rule on `Nc` matches people who asked for no call), and post call counts as away (a `standing`
rule is met on a post-call day).

Edges of the month (review, 15 Oct 2026): only what can be changed inside the dates checked counts. Last month's
excess over a week or rolling limit is last month's problem; a minimum for a week or window running into next month's
unplanned days is scaled down (rounded down); a weekend request on Sat 31 Oct covers Sun 1 Nov; a call on the 30th
before a clinic already planned on the 1st is flagged in this month (post call). One duty over a rolling limit costs
one unit however many windows it sits in. Problems about a person's whole month (fair share, a monthly minimum) have
no date: the grid marks the name with a dot and Check's Show opens their month. A rule that can't be checked (a
damaged rule from a file) is skipped and listed (`evaluate().failed`), and the header says "Rule check failed" rather
than "No problems" if the check itself breaks. Rules and duty codes from files, backups and the team are cleaned on the
way in (`cleanRule`, `cleanDuty`, `migrate`).

### How to add a new rule type (step by step)

Do this only when the owner wants a kind of rule that none of the ten types can express (most new rules are just a
new rule of an existing type, made in the app). The comment block at the top of `js/rules.js` is the reference.

1. **Name it.** Pick a short camelCase type key (e.g. `minGap`) and the plain-English label the builder shows.
2. **Add one entry to `RULE_TYPES` in `js/rules.js`**, next to a similar type to copy from (`maxRun` is a short
   person-scoped example; `cover` a day-scoped one; `spread` a global one):
   - `label`, `icon` (an emoji; the app doesn't show it, see Design), `help`, `example`: the words on the "Add rule"
     picker. Add the type's line icon to `ICON_PATHS` in `js/ui-rules.js` (24 px line style; without one it gets the
     generic rule icon).
   - `params`: the form, as a list of ParamSpecs (`{ key, label, kind, options?, min?, max?, optional?, help? }`
     with kind `codes`, `code`, `number`, `select`, `who` or `bool`; the `P.codes`, `P.num` and `P.sel` helpers make
     the common ones). The rule builder (`js/ui-rules.js`) draws its form from this list, so no UI code
     is needed. A param that only matters for some settings can be hidden with an entry in `SHOW_IF` in `ui-rules.js`.
   - `defaults()`: a fresh params object.
   - `scope`: `'day'`, `'person'` or `'global'` (what one evaluation covers; the solver re-checks only what a change
     touches). `soft_only: true` if it can never be hard.
   - `describe(rule, T)`: one short sentence, using `T.codes()`, `T.who()` and `withWhen()` like the others.
   - `validate(rule, state)` (optional): problems beyond the generic checks ("At most must be 1 or more").
   - `compile(rule, X)`: returns an evaluator with `day(d, out)`, `person(p, out)` or `global(out)` that returns the
     penalty (`X.u` per unit), bumps `X.ctx.n2` per violation, and only when `out` is given pushes
     `X.V(pen, msg, { date, staffId, dates?, staffIds? })`. Return `null` when the rule can't apply (no codes).
     Report only days between `ctx.lo` and `ctx.hi` (the month on screen); the days around it are context.
3. **Test it** in `test/rules.test.mjs`: a passing and a failing case, the `describeRule` sentence, and a
   `validateRule` case. Run `node ntf-roster/test/rules.test.mjs`, then `node ntf-roster/test/solver.test.mjs`.
4. **Check it in the browser**: Rules › Add rule shows the new card; build one in `?demo` and see its problems in the
   grid and in Check. If Auto-fill should be able to satisfy it (not just score it), check `js/solver.js` step 2: only
   `cover`, `standing` and minimum `limit` rules create demand; everything else is scored.
5. **Document it**: one line in the rule-type list above and in the table in `SPEC.md`.

Nothing else changes: the checker, the builder, Check and the solver all read `RULE_TYPES`.

## Auto-fill (`js/solver.js`, `js/solver-worker.js`)

A pure function run in a Web Worker (the page stays responsive; it falls back to the page if the worker fails). It
places only duties marked `auto` (default C, P, SMO, OTC, PHD), never touches locked cells, manual codes, leave or
requests, and clears only its own earlier codes in the month. Demand comes from `cover` rules on auto codes.
Greedy construction (hardest slots first), then simulated annealing with incremental scoring (moves, swaps, add and
drop), then it drops any duty no rule needs. Hard problems always come first: a move's hard change is scaled far
above any soft change, and the best roster is the one with the fewest hard points, then the fewest soft, so no
preference can buy a must-fix problem. An overnight duty is never placed the day before a fixed code that can't go with
post call. Deterministic for a seed: the search length is a budget of tries (500 per unfilled slot, 12,000 to
100,000, from a cool start, T0 1), and it ends early once it has converged (no must-fix problems left and nothing
better in the last 60% of the budget); the time option (3, 6 or 15 s) is only an upper bound for a slow phone. Tuned on
four practice departments (Oct 2026): the same quality as the first version's 1,500 tries per slot from T0 25, in a
third of the tries. A tight department (the hard rules can only just be met) may still have must-fix problems when
that budget runs out: then the search carries on, hot again (T0 25, like the first version), up to 1,500 tries per
slot (at most 300,000) or the time option. On 60 runs of cut-down practice departments that brings the must-fix total
back to the first version's (162; 176 with the short budget alone), still about 2.5x faster. On the practice department, November's 82 must-fix problems go to 0 in about 0.6 s on a laptop.
The dialog shows the first draft's counts at once. The preview shows shifts added and removed, must-fix and soft counts
before and after, and anything unfilled; Apply is one undo step.

## Speed (Oct 2026)

The owner found the first version slow on a phone. What keeps it quick, and what to keep in mind when changing it:

- **Grid edits swap cells, not the grid.** `renderGrid()` builds each person's row from a signature (`rowSig`: their
  cells, the day before the month, problems, details, the selected cell); a row whose signature is unchanged reuses
  last render's HTML, and a changed row swaps only the cells (and footer counts) that differ. The duty-colour
  `<style>`, the toolbar selects and the paint bar are rewritten only when they change (rewriting a `<style>`
  restyles every element on the page). The cell editor is built once and updated in place.
- **Full redraws are progressive** (another month, back from another tab, a filter, Auto-fill or an import changing
  most rows): the rows in the grid's window go in first, then the rest over the next frames (the first of them a frame
  later, so the frame that shows the month is painted first); rows above the window wait in a spacer (`tr.r-spacer`)
  sized from the last drawing (or `rowHeights()`), and the scroll position is corrected when they arrive. The
  remembered cell (`app.selectedCell`) is drawn in that first window: `renderGrid({ focus: staffId })` starts the
  window at that person's row and scrolls there, so going back to a month or to the Roster tab with a cell low in the
  list doesn't draw every row at once. Code that needs a row that may not be drawn yet calls `flushRows()` (keyboard
  moves and paint do; `selBtn()` does as a last resort). The scroller keeps its position through a redraw: it is set
  only when it has to move (setting it lays the grid out). The first screen after the app starts is drawn whole.
- **The rule check** (`evaluate`, about 5 ms a month on a laptop) rules out most person-days with one bit test per
  code list (`compileCodes`) and lists each person's request days once (`requests` rules), which also made Auto-fill's
  search about twice as fast with identical results.
- **Start-up**: the first screen's modules are fetched side by side; weekdays and the duty map are memoised in
  `model.js`. The fonts are self-hosted with `font-display: swap` (Design), so nothing waits on Google Fonts.
- **Sheets over the grid open non-modal** (`sheet()` in `app.js`: `is-nonmodal`, its own `.sheet-scrim` and Tab loop;
  same look and behaviour). A modal `<dialog>` makes everything behind it inert, and the browser then restyles every
  element on the page: with the grid's ~5,000 elements that was about 0.25 s to open the cell editor and again to
  close it on a slowed phone. Other screens keep the kit's modal sheet.
- **No colour fade on the cell editor's code tiles**: a 150 ms background fade repainted the open sheet for several
  frames after each tap (about 100 ms of paint on a slowed phone); on and off now switch at once (the press scale stays).
- **No `:has()` on an ancestor of the grid.** `body:has(.roster…)` made every row or cell the grid added restyle all
  the page's spans (Chrome re-checks a `:has()` anchor on each change inside it). The roster sets `body.roster-grid`
  instead. `:has()` on small parts (toolbar selects, segmented controls) is fine.
- **Guard**: `node ntf-roster/test/perf.e2e.mjs` (Playwright, phone size, CPU 4x slower) times tap a cell → editor,
  tap a code → grid, and switch month, against budgets of about 2x the Oct 2026 numbers. In the Checks workflow,
  where it fails only if a second run is over budget too (timings vary with the machine).
- Measured in Chromium at 390 px with the CPU 4x slower (medians of interleaved runs, first version → speed work and
  NTF design merged): switch month 0.76 s → 0.39 s until the new month shows (about 1 s until every row is in, as
  before); tab to Roster 0.71 s → 0.46 s; tap a cell → editor 0.22 s → 0.17 s; tap a code → grid 0.40 s → 0.31 s;
  paint 3 cells 1.08 s → 0.78 s; rule builder live check 0.17 s → 0.07 s; Auto-fill to the preview 3.2 s → 0.95 s
  (laptop 3.0 s → 0.77 s). On a laptop: switch month 132 → 89 ms, tab to Roster 136 → 82 ms, tap a code 60 → 35 ms.
  The kit's richer screens cost a little: tabs other than Roster open 40 to 80 ms later on the slowed phone (0.08 to
  0.17 s before; 0.12 to 0.23 s now).
- After the second review (same harness, phone, medians, merged speed and design → these fixes): switch month 469 →
  384 ms until it shows; back to a month whose remembered cell is far down 606–874 → 226–291 ms (8 rows first, not
  all 74); tap a code 224 → 196 ms; paint one cell 257 → 207 ms; Apply Auto-fill 459 → 374 ms; first Roster screen
  1.09 → 0.98 s. Taps still spend most of their time in the browser's own painting of the ~5,000-element grid (the
  app's code is about 60 ms of a 200 ms tap).

## Screens

Roster (the grid: cell editor as a popover with a mouse and a bottom sheet on touch screens, paint mode for leave blocks,
keyboard entry, person view, coverage rows, fairness counts), Day (phone default: who is on what, away, requests,
notes, problems), People (staff, groups, tags, duty codes), Rules (list, schema-driven builder with a live check,
templates, rules log, rules JSON), Check (problems by rule, fairness, coverage), More (Excel import with a review,
Excel/PDF/CSV/ICS export, backup and restore, settings and public holidays, team sharing, the app version lines).

Hash routes (the month comes from `m`, else from `d`; changing month writes `m` into the link):
`#roster?m=2026-11&p=<staffId>`, `#day?d=2026-11-03`, `#people?s=staff|groups|tags|codes`,
`#rules?edit=<ruleId>|new`, `#check?rule=<ruleId>&v=fairness|coverage`, `#more`.

## Design (owner, 15 Oct 2026)

The owner asked for "the new NTF design language for webapps": the app follows anantf-site `DESIGN-APP.md` (the NTF
Anaesthesia app language, the phone version of its `DESIGN.md`). The NUHS look (`nuhsdesign/tokens.css`, Open Sans,
navy, the four-colour band) is **not** used in this app; the rest of anawj.com keeps it.

- **The kit is vendored**: `css/app.css` is a copy of anantf-site `assets/app/app.css` (15 Oct 2026; only its font URLs
  changed). Keep it in step: when the kit changes there, copy it again and change nothing else in it. This app's own
  CSS is `style.css` (shell, roster grid, cell editor, person month, day, Auto-fill, More) and `css/rules.css` (Rules,
  People, Check), on the kit's `--app-*` tokens only. Markup uses the kit's classes (`app-row`, `app-btn`, `app-chip`,
  `app-segmented`, `app-switch`, `app-sheet`, `app-badge`, `app-empty`…); add CSS only for content the kit has no part for.
- **Fonts** in `fonts/` (Inter, Fraunces, JetBrains Mono; SIL OFL 1.1, `fonts/LICENSE.md`). The subdomain can only
  reach `ntf-roster/`, so nothing loads from anantf.com or Google Fonts; `sw.js` caches them with the shell. The kit's
  Fraunces italic isn't copied (nothing uses it).
- **Shell**: the kit's top bar (the practice badge on the left opens Reset / Leave; undo and redo on the right), a
  large title per screen that collapses into the bar, with the month and the screen's one primary action beside it
  (`#screenhead`: Auto-fill on Roster, Day and Check), the tab bar (five tabs: at the bottom, a left rail from 1024 px;
  People sits under More at every size, the kit's five-tab limit), sheets as `<dialog>` (grabber, head, body, foot;
  Back, Esc, a tap outside or a drag down closes them; over the roster grid they open non-modal, see Speed), the kit's
  toasts with Undo (a warning is the same ink toast with a warning sign), skeleton rows while a screen loads.
- **Screen head on phones** (second design review): one row, the large title, the month (tap it for today; phones
  have no Today button) and Auto-fill as an icon. On the roster grid the month moves into the always-solid top bar
  (`.bar-month`, `renderHeader()` in `app.js`), the large title is for screen readers only and Auto-fill leads the chip
  row (`.r-af`), so the grid starts about 100 px higher (the page never scrolls there, so a large title could never
  collapse). Under 360 px the practice badge gives the month its room on that screen.
- **Pushed screens have a back button in the bar** (`#back`): one person's month ("‹ Roster", the person's name as the
  large title, no Auto-fill; the person arrows carry the neighbours' names) and People ("‹ More"). Views set this with
  `app.setHead({ title, back, noAutofill })` (null for the tab's own head); on phones the back button takes the
  practice badge's place.
- **Sheets**: one way to close a read-only sheet (the X: Key, Keyboard shortcuts, Rules log); the cell editor saves as
  you go, so its head has "Done" (`sheet({ closeLabel })`) and no footer. The cell editor is a sheet on phones and any
  touch screen (`pointer: coarse`), the floating panel only with a mouse. Rule rows have no buttons: tap the row to
  open the rule; Delete (red) and Copy are in the rule's footer, the switch has a 44 px tap area. A new rule opens with
  a neutral hint; errors show after the first change or on Add rule, under the field (`.app-field-error`,
  `aria-invalid` on inputs, `aria-describedby` on code lists).
- **Targets**: grid rows are 44 px on touch screens (`max-width: 720px` or `pointer: coarse`; days stay 38 px wide);
  paint codes, picked-person pills and the laptop code tiles are drawn 36 px inside 44 px targets; names in the code
  tiles and the rule builder's chips wrap (never cut off). The selected day on Day is blush with a wine edge (the kit's
  selected), not a wine fill; the grid's keyboard-position box shows only with a mouse.
- **Light only**; wine `#633d3c` is the one interface accent; no blue, teal or purple interface colours (nor in the
  default duty colours); public holidays on the kit's warm tone (`--app-warn-bg`); no emoji
  (rule types and templates show line icons from `ICON_PATHS` in `ui-rules.js`). One primary button per screen;
  inputs at least 16 px (no iOS zoom); nothing under 12 px; targets at least 44 px.
- **Dense data stays dense**: the roster grid and Check's tables use 12 px Inter with tabular figures (counts in
  JetBrains Mono), hairline rules, weekends on inset, public holidays on the banner tone with a wine dot, today in
  blush under a wine header; small square-ish chips are fine there (content, like a spreadsheet). A 31-day month fits
  1300 px beside the rail (day columns 32 px; long codes like "Clinic" are set tight to fit).
- **Duty colours are data**, like clinical codes. The default palette (`DEFAULT_DUTIES` in `model.js`) is warm and
  earthy, told apart by hue and lightness, with every ink at least 4.5:1 on its fill: Call the strongest (brick red),
  PM burnt orange, SMO chestnut, OTC umber, PHD dark olive, W charcoal brown, Creg soft brick, APS green, Clinic olive,
  Inj ochre; leave rose, requests outlined in wine, other codes on the kit's fill grey. A code with no valid colour
  falls back to the kit's fill and ink. Saved rosters keep their own colours; only new installs and the practice
  department use the defaults (the second review swapped SMO plum, OTC slate blue, PHD teal, W violet and Creg rose).

## Excel (`js/io.js`)

Import reads the department sheet: the month row in column A (`DECEMBER 2026`) with day numbers across, including the
end of the month before and a trailing `JAN` block, mapped to real dates; section rows map to groups; names matched
ignoring case, spaces and titles; count rows, the legend and the MEETING REQUESTS block skipped (meetings become day
notes). For the people and months in the sheet, leave, requests and other codes come from the sheet; shifts already
planned in the app stay unless the sheet has a shift that day; dates from the neighbouring months only fill empty
cells. A review sheet shows people (matched or new), cells per month and unknown codes before anything changes, and
Apply is one undo step. Export writes the same layout (one sheet per month, whole weeks, colours, x after calls,
counts, legend); exporting and re-importing gives the same cells (the browser test checks it). ExcelJS is loaded
only when Excel is used.

## Storage, practice and team sharing

- Local first: everything lives in this browser until team sharing is switched on; Backup (JSON) moves it.
- Two tabs (or the installed app and a tab) share one saved copy: each save bumps `<key>-rev`, a tab never saves over
  a newer revision, and another tab's save reloads this one ("Updated with changes from another tab"). A saved copy
  that can't be read is kept as `<key>-damaged-<date>` and nothing is saved over it until the person chooses (bar:
  Download damaged copy / Start again).
- `?demo` is the practice department (`js/demo.js`): 65 invented people, leave, requests, clinics, APS weeks and
  meetings for this month and next; this month filled with no must-fix problems, next month left for Auto-fill. It
  never signs in and saves under its own key.
- Team sharing (`js/cloud.js`, `js/ui-team.js`, `firestore.rules`): off until `js/firebase-config.js` is filled. Then
  Google sign-in; `team/main` holds staff, codes, rules and settings, `months/{YYYY-MM}` one month's cells; every save
  checks nobody else saved since you loaded (conflict: load theirs or save anyway) and keeps a permanent copy
  (`versions`). The rules allow only `{ email, name }` stamps with the saver's own email (the app shows the email
  beside the name) and no save times more than 10 minutes in the future. Members are admin, rosterer (both save) or viewer (reads). Rules tested in the emulator
  (`tools/test-rules.sh`, project `demo-ntf-roster`).
- Installable and offline (`sw.js`, `manifest.webmanifest`); More ends with the app version and "Get the latest
  version" (AGENTS.md).

## Decisions

- 2026-10-15: own app in anawj-site at `ntfroster.anawj.com`, not on anantf.com (that site keeps rotas off it) and
  not shared with the NUH roster (different department, logic and data).
- 2026-10-15: one monthly grid like the department sheet; assignments and requests kept apart in each cell; post
  call derived, never stored.
- 2026-10-15: every rule is data the owner edits in the app; ten generic types with who/when filters, hard or soft
  with a weight; a new type is one `RULE_TYPES` entry plus a test.
- 2026-10-15: local first with JSON backup; Firebase team sync built but off until the owner creates the project.
- 2026-10-15: built by five parallel builders against `SPEC.md`, then integrated and tested in one pass.
- 2026-10-15: the NTF app design language (anantf-site `DESIGN-APP.md`, kit vendored in `css/app.css`) instead of
  the NUHS look, at the owner's request; the NUHS band is not used in this app (Design, above).
- 2026-10-15: speed work after the owner found it "a bit too slow" (Speed, above): the grid patches cells and draws
  big redraws progressively, Auto-fill searches shorter and stops once converged (same quality, different rosters
  than before for a seed), sheets over the grid open non-modal, and `perf.e2e.mjs` guards it in the Checks workflow.
- 2026-10-15: second review of speed and design: Auto-fill searches on (hot, up to the first version's budget) while
  must-fix problems remain; People under More at every size (five tabs, as the kit says); on phones the roster's month
  sits in the top bar; pushed screens get a back button in the bar; duty colours without blue, teal or purple.

Phone details (review, 15 Oct 2026): paint mode paints by tap on touch screens (a swipe scrolls) and has a "Done
painting" button; Back closes an open sheet, and the rule builder asks before discarding changes; removing a person or
deleting a rule asks first; the roster toolbar has a Key for the grid's marks; Add a rule starts with "Combination
restriction" (same day, following days, between two people, and ready-made ones).

## Known limits

- The cell editor lists every code (long, but it scrolls).
- The grid is one big table (about 2,000 cells for 65 people): on a slow phone a full redraw still takes about a
  second of work in total, though the rows on screen show first (Speed, above).
- `spread` is always soft; `sameDay` forbid needs two different code lists (`@shift` + `@shift` means two shifts).
- The solver may meet a `standing` rule by putting the person on call the day before (post call counts as away).
- On phones the fairness table scrolls sideways with the name column fixed (cards for 60 people were too long).
- Not done yet from the 15 Oct review (features): a "who's free" picker to fill a gap, ghost chips for the Auto-fill
  preview and per-group spread, a compact phone rules list, drag to reorder and multi-group bulk add in People, a day
  stepper in the phone cell editor, folding past public holidays in Settings.
- The rules log records who changed a rule only when signed in to team sharing.
- The 2027 dates for Hari Raya Puasa, Hari Raya Haji, Vesak and Deepavali in `demo.js` are from memory: check them
  against the Ministry of Manpower list before relying on them ("Load Singapore public holidays" uses them).
- Team sharing is untested against a live project (emulator only) until the owner creates it.
