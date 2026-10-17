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
and edits in the app at any time** (the owner's main ask: rules and combination restrictions keep changing after
launch) and can **fill the calls and shifts automatically** (Auto-fill).

- Address: <https://ntfroster.anawj.com/> (own subdomain because it saves data; `worker/routes.js` maps it to
  `ntf-roster/`). Practice with a made-up department: <https://ntfroster.anawj.com/?demo>.
- Static, vanilla ES modules, no build step, no framework. Phone (390 px) and laptop.
- Reference products for the quality bar: QGenda, Amion, Lightning Bolt, RosterLab, Deputy (colour-coded duty
  chips, sticky grid, request layer, live rule checks, fairness counts, one-click auto-fill with preview).

## The department (what the sheets showed; the owner confirms)

Learned from department sheets the owner shared (read in a session scratchpad only, never committed; details in the
owner's private notes).

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

About 60 people a month. Names on the sheet can carry a
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
   - `label`, `icon` (an emoji), `help`, `example`: the words on the "Add rule" picker.
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
third of the tries. On the practice department, November's 82 must-fix problems go to 0 in about 0.6 s on a laptop.
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
  most rows): the rows in the grid's window go in first, then the rest over the next frames; rows above the window
  wait in a spacer (`tr.r-spacer`) sized from the last drawing, and the scroll position is corrected when they arrive.
  Code that needs a row that may not be drawn yet calls `flushRows()` (`selBtn()`, keyboard moves and paint already
  do). The first screen after the app starts is drawn whole.
- **The rule check** (`evaluate`, about 5 ms a month on a laptop) rules out most person-days with one bit test per
  code list (`compileCodes`) and lists each person's request days once (`requests` rules), which also made Auto-fill's
  search about twice as fast with identical results.
- **Start-up**: the first screen's modules are fetched side by side; weekdays and the duty map are memoised in
  `model.js`. The Google Fonts stylesheet in `index.html` is render-blocking (it held the first paint by ~0.4 s on a
  slow connection in testing): self-hosted fonts with `font-display: swap`, or a non-blocking link, remove that.
- **Guard**: `node ntf-roster/test/perf.e2e.mjs` (Playwright, phone size, CPU 4x slower) times tap a cell → editor,
  tap a code → grid, and switch month, against budgets of about 2x the Oct 2026 numbers. Not in the Checks workflow.
- Measured in Chromium at 390 px with the CPU 4x slower (medians, before → after): switch month 0.75 s → 0.32 s
  until the new month shows (about 0.8 s until every row is in, as before); tab to Roster 0.83 s → 0.35 s; tap a code
  → grid 0.35 s → 0.26 s; rule builder live check 0.16 s → 0.07 s; Auto-fill to the preview 3.4 s → 1.1 s (laptop
  2.8 s → 0.7 s). On a laptop: switch month 150 → 70 ms, tab to Roster 150 → 67 ms, tap a code 66 → 43 ms.

## Screens

Roster (the grid: cell editor as a popover on laptops and a bottom sheet on phones, paint mode for leave blocks,
keyboard entry, person view, coverage rows, fairness counts), Day (phone default: who is on what, away, requests,
notes, problems), People (staff, groups, tags, duty codes), Rules (list, schema-driven builder with a live check,
templates, rules log, rules JSON), Check (problems by rule, fairness, coverage), More (Excel import with a review,
Excel/PDF/CSV/ICS export, backup and restore, settings and public holidays, team sharing, the app version lines).

Hash routes (the month comes from `m`, else from `d`; changing month writes `m` into the link):
`#roster?m=2026-11&p=<staffId>`, `#day?d=2026-11-03`, `#people?s=staff|groups|tags|codes`,
`#rules?edit=<ruleId>|new`, `#check?rule=<ruleId>&v=fairness|coverage`, `#more`.

## Walkthrough (first-time help: `js/guide.js`, `js/tour.js`)

The owner asked for a walkthrough for a first-time user (15 Oct 2026). Four parts, all in the NUHS look (square panels
with a navy top rule, navy titles and primary buttons, only controls rounded), like the NUH roster's Practice tour:

- **Getting started** (your own roster only, never practice): the welcome screen of an empty roster, then a card at the
  top of Roster with six steps that tick themselves off: staff added; People › Duty codes opened; a rule opened in
  Rules; any leave or request; an Auto-fill applied (auto codes in the cells); an export, print or backup. The three
  that the data can't show, plus Hide and "finished", are kept in `state.settings.onboarding` (so they travel with
  backups and team sharing) through `store.mark()`, which is not an undo step. All six done: "All set" for a few
  seconds, then the card goes; Help › Getting started checklist shows it again. Laptops show the steps as a row with
  the open one's words below; phones and the welcome screen as a list. Folded or open is per device
  (`ntf-roster-guide`; folded by default on phones). Edit the steps in `STEPS` at the top of `guide.js`.
- **The tour** (coach marks): `TOUR_STEPS` at the top of `tour.js` is the step list: `{ id, title, text, target, tab,
  maxH, count, only, phone, laptop }` (`only: 'laptop'` for a stop that is only at that size, like People). `target` is the value of a `data-tour="…"` attribute (add one to the control you want
  lit), or a list where the first is the step's own control and the rest are lit too (the tab that leads there);
  `phone` / `laptop` replace fields at that size; a step whose control isn't on screen is skipped. It switches tabs as it
  goes (replacing the history entry, so Back still works) and its own history entry means the phone's Back ends it; at
  the end the app is back where the tour started and focus returns to the button that opened it. Keys: → or Enter
  next, ← back, Esc skips. The card docks above the tab bar on phones. Practice opens it once per device; your own
  roster offers "Take the 1-minute tour" on the checklist (with no staff yet it opens practice in a new tab, where every
  control has something to point at). Seen or skipped: localStorage `ntf-roster-tour` = `{ v, done }`; bump `TOUR_V`
  to show a changed tour to everyone again. It never touches roster data, and the app's own keys (Ctrl+Z included)
  wait while it is open. Next takes focus (with its ring) only for keyboard use; after a tap, or when practice opens it
  by itself, the card itself does. Crossing 720 px mid-tour redoes the step at the new size.
- **Try it yourself** (practice only): three tasks in a small card, each ticked from store changes: give someone leave,
  add a "never on call together" rule for two named juniors (Rules › Add rule › Between two people, which now starts
  as never on Call), Auto-fill next month and Apply. "Show me" lights the control to tap next, inside a window too: the
  task card sits above windows (z-index 81, below the tour), which make room for it underneath. A tick's few seconds
  start once no window is open, so it is seen. `?demo&try` starts it,
  `?demo&tour` the tour (links from your own roster's Help).
- **Help**: the "?" in the header (on phones too) opens a sheet: Take the tour · Try it yourself · Getting started
  checklist · Keyboard shortcuts (not on touch-only phones; the `?` key still opens them). On phones Getting started
  also shows above Day, where the app opens. More › Help has "Show the walkthrough".
- Test: `test/tour.e2e.mjs` (in Checks). `test/e2e.mjs` and `test/perf.e2e.mjs` mark the tour as seen first, so practice
  doesn't open it under them.

Lesson (17 Oct 2026): a closed sheet or picker stays in the page for a moment with `.out` on its backdrop. Any code that
looks for "the open sheet" (Show me in `js/guide.js`) must skip elements inside `.out`, or it picks the closing one and
the tour test flakes on slow CI.

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
