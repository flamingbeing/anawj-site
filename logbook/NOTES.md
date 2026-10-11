# Logbook: working notes

Decisions, conventions and how to work on the APMES logbook (`logbook/`). Read this, then `README.md`
(data model, Firestore layout, rules). Public repo: never commit real names, emails, case details or
portfolio content.

## Product principles (from the owner)

- **Frictionless APMES logging first.** Most residents only log for the audit requirements. Personal
  "learning logbook" features (personal tags, shorthand, tag groups, analytics, saved searches) are
  secondary and must never get in the way of logging a case.
- No extra structured fields (ASA, supervision, urgency): APMES requirements are already covered.
- Things you might do by accident are links, not buttons, and they ask first (e.g. reset built-in shorthand).
- Rarely used things fold away: Figures (optional), References, More tools, Analytics sections.
- Tags count towards credentialling, so they are picked on purpose: nothing is auto-ticked when
  "Suggest tags as I type" is off, and Save needs at least one tag.
- The demo should look like the real app: no yellow bar, just a small "demo ▾" badge in the header.

## Words used in the app

- "Tags", not categories. **APMES tags** = the programme's categories (built in, count towards
  targets); **personal tags** = your own (may link to APMES tags; under an APMES tag counts towards it).
- **Tag groups** = the old templates (one-tap sets in Quick picks). The programme's ones (Admin portal) are
  only a starting set: each is copied once into the resident's own tag groups (id `sh-<id>`,
  `settings.sharedSeen`), where it can be edited or deleted like any other and doesn't come back.
- Logbook **Case summary** (the case box). Reflection **Case details** (prefilled from the case summary).
- **Possible reflection** = the ☆ flag on a case (just a bookmark; missing it doesn't matter).
- **Analytics** = the old Progress tab (`#progress`). Totals is under it ("Compare with your intake").
- More → **Export / Import** (`#data`): **Export** = the Word portfolio only (it holds everything APMES needs);
  **Import** = reflections from Word (`#reflimport`) and the logbook from Excel/CSV; **Backup** = backup file and
  restore, Excel spreadsheet. Keep that wording. The Logbook and Reflections tabs have no More tools cards.
- **Excel backup** (`export-opts.js`, tested; dialog in `ui-logbook.js` `downloadExcel`): logbook + reflections
  (or one), date range, columns ticked and ordered, tag/date style, Summary sheet; saved as
  `settings.excelExport`. The Cases sheet keeps a hidden id column and a veryHidden "Export info" sheet
  (export time, date range): uploading back never deletes cases outside the range or newer than the file.
- **Advanced search** (`search-ops.js`, tested; Settings → Logging, `settings.searchOps`, **off by default**):
  initials: title: (first line) case: tag: "phrase" -word OR/| AND; a "?" by the box lists them (tap one to add it at the cursor); a misspelt operator is searched as
  text with a "did you mean" note. No raw regex (owner's choice). Reflections search has its own
  operators (REFL_FIELDS: initials: heading: title: diagnosis: case:). Logbook More also has "Case sensitive"
  (`settings.lbCase`, off by default; tag: always ignores case).
- Future dates are allowed (Log date picker, calendar "+ Log a case"); they show as "upcoming".

## Where things are (screens)

- **Log** (`ui-log.js`): the case box (aligned example lines; Paste button; "Draft saved" sits on the
  Possible reflection line), Quick picks (suggestions + your shorthand tags, Same as last, your tag
  groups), All tags, Still needed, "Save these tags as a tag group" under the tag list, pinned bar (chosen tags, Save, keep date | Save).
  Paste-a-list (List mode), Plan for later. `editCaseDialog` (full screen on phones, pinned
  Delete/Cancel/Save, 6-line growing box, Tags + "Add tags"; also "New case" from the reflection picker).
- **Logbook** (`ui-logbook.js`): Calendar (default) | List | Grid. Calendar day: + Log a case (opens Log
  on that date), Share day, Copy. Rows: Copy, Reflect (no swipe actions). Filter (Show, Search in; then Dates | Tags | More toggles, each open while in use; More = fuzzy, case sensitive, Save search, Tag N cases; saved searches one slim scrolling row): has all of / has none of
  tags, dates, flag, search scope, fuzzy; Reset (everything); × in the search box clears just the text; saved searches (text, filters, "Search in"; not fuzzy); Tag N cases (bulk add/remove). Search text
  cached per case (`hayCache`, reset when the tag set changes).
- **Reflections** (`ui-reflect.js`): list by heading, editor (Case details, learning points,
  References and Figures as folded white cards), Export page (summary + Mark ready) and Choose page
  (ticks, Quick actions). Draft kept per account. Only a small "Rules for reflections" (no card) at the bottom.
- **Analytics** (`ui-progress.js`): header tally, folded sections (Needs attention, Logbook,
  Reflections with ⓘ requirements, Trends), Compare with your intake (Totals). EPA view and Download summary removed (owner: not useful).
- **More** (`app.js`): Account (with Residency year for non-programme users; Delete account at the bottom,
  greyed out for residents on the programme list: a programme admin takes them off first; `cloud.deleteAccount`
  wipes cases, reflections, images, bin, submission, members entry, logbook, then the Google sign-in), Settings, Export &
  backup, Admin portal; Privacy, Credits, What's new (`WHATS_NEW` in app.js; update each release), Sign out at the very bottom.
- **Colour** (Display): one accent (`settings.accent`, null = NUHS navy): 8 suggested swatches + any colour.
  `colors.js` (tested) works out light, dark and OLED palettes with contrast floors (light accent 4.5:1 with white;
  dark accent 7:1 on cards, near-white text, neutral grey backgrounds) and writes them into <style id="accent-css">,
  cached for the first paint (index.html). Light / Dark / OLED (pure black: data-oled on top of dark) / Auto is
  separate, per device. (Fixed named themes were tried and dropped: they read as shades of one colour.)
- **Settings**: a menu of Display (incl. the tab the app opens on, `settings.startTab`; a #hash still wins),
  Logging, Tag editor (`#tags`), Reflections (`#reflset`: new reflections in the export, photo sizes), Copy & share format (`#sharefmt`), Recycle bin;
  then a "Settings file" card: export / import settings, tags, tag groups, formats as JSON (`settings-file.js`, tested; never cases or portfolio).
- **Copy & share** (`share-format.js`, tested): templates in `settings.shareFormat` (dayHead, dayCase, oneCase)
  with {date} {day} {weekday} {count} {n} {initials} {case}. Default day: `[[YYYY-MM-DD]]`, then
  `1. AB` / case, a blank line between cases (none for a one-line case format). No tags, ever.
- **Tag editor** (`ui-settings.js`): List | Pills (drag; hold on phones), search, case counts, edit
  dialog (name, long name, sits under, counts towards, shorthand with built-in defaults and words
  learned from your cases, hide, merge), CSV download/load, Tag groups card.

## Tags and suggestions (`tags.js`, `suggest.js`)

- Tag set: `settings.tagSet` on the logbook doc (per account, synced). Cases keep APMES codes in
  `cats` and personal tag keys in `tags`. The 300 cap counts personal tags and headers only.
- Shorthand: `DEFAULT_SHORTHAND` per APMES code (editable; an APMES tag with `kw` replaces the
  built-in list, `[]` turns it off). `apmesShorthand(set)` feeds `suggest(text, { extra })`; a word
  inside a longer match steps aside ("lap" in "ex lap"). Leading capitals before an age are initials.
- `learnShorthand(cases, key)`: words frequent in a tag's cases and rare elsewhere; offered, never applied.
- Tag CSV: Type (APMES / Personal / Header), Name, Full name, Under, APMES tags, Shorthand, Hidden, ID.
  Import is forgiving (column names, title row, separators, codes or names, Under anywhere, IDs kept by
  name) and reports what didn't line up.

## Demo (`demo-backend.js`, `demo-seed.js`)

- `?demo` (local storage), `?demo=reset` (wipes, reseeds, then the address becomes `?demo`).
- Demo user is an R3. ~350 generated cases over two years plus 32 sample reflections invented by the
  owner (initials and dates made up) load on demand from `demo-seed.js`, so real users never download it.

## Working on it

- Checks: `node tools/check.mjs`; ESM syntax: `for f in logbook/js/*.js; do node --input-type=module --check < $f; done`
  (plain `node --check` misses ESM errors); unit tests: `for f in logbook/test/*.test.mjs; do node "$f"; done`.
- Any change to a file in `sw.js` SHELL: bump `VERSION` (`logbook-v18…`). New JS files go in SHELL.
- Rules: `logbook/firestore.rules` deploys on merge. Emulator: copy rules and
  `logbook/test/rules.emulator.mjs` + `evals/test/rules.emulator.mjs` into a folder with firebase-tools, then
  `firebase emulators:exec --only firestore --project demo-logbook "node logbook/test/rules.emulator.mjs; node evals/test/rules.emulator.mjs"`.
- e2e: `logbook/test/e2e/e2e.mjs` (Playwright, demo mode, phone and desk profiles; see the header for
  how to run). About 15 minutes per profile. Steps for the latest Settings/More reorganisation still
  need updating (Settings menu pages, Export & backup page, Totals under Analytics, Residency year on
  Account, Logbook search only under Filter, reflection settings at #reflset).
- Owner preferences: merge your own PRs once unit tests and e2e pass, then report. The owner may say
  "no e2e yet": then only unit tests and quick browser checks. Show phone screenshots of UI changes.
- Branch work: after a merge, restart the branch from `origin/main`.

## Review findings fixed (Oct 2026), worth not regressing

- Saved searches must store copies of filter arrays; flag select resets with Clear.
- Case rows have no swipe actions (owner: off); per-case Copy, not Share.
- Diff keys compare tags with parents; pasted export rows (hidden id) aren't read as initials.
- Removed personal tags show as "Removed tag" and stay filterable / bulk-removable.
- Per-user state resets on sign-out (`resetters`), including Analytics, Reflections view, drafts;
  async loads (Totals, ready portfolio) are dropped after sign-out (`gen` counters).
- Pill drag uses the pressed element; CSV Under uses IDs when names repeat; roman sub-codes (26ii).
