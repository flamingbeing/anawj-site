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
- **☆ Interesting** = the star on a case (`reflectTag`; was "Possible reflection"): a bookmark for interesting cases.
  Logbook rows show "☆ interesting", Filter → Show has "Interesting", the Reflections tab offers them first.
- **Analytics** = the old Progress tab (`#progress`). Totals is under it ("Compare with your intake").
  Reflection progress credits at most one complete JR reflection per heading (two for Paediatrics).
  Extra JR reflections remain saved, with a note explaining why they do not count. Heading bars,
  overall progress and shared summary counts use this same cap. Required JR cases and sub-types remain reminders.
- **Back navigation** (`navigation.js`): tab buttons, menu items and screen links add browser history
  consistently. Browser Back/Forward restore screens; a screen's Back link retraces the same history
  without adding a loop. Direct child-page links get a finite parent trail (Display → Settings → More);
  reload preserves it. The root screen can leave the app normally. The demo query stays on every screen.
  Pending Account/profile edits flush and Admin editing state clears on all screen transitions,
  including browser Back.
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

- **Show tips and help text** (Settings → Logging, `settings.hideTips` true = off): an experienced-user mode. Off adds
  `body.no-help`, hiding every `.help` explanation (mark new how-to paragraphs `class: 'hint help'`) and the tag tips.
  The inline privacy and safety notes (reflection editor, photo rules) are `.help` too (owner). Status lines, the
  ID-number check, the delete-account warning and the Privacy card on More stay.
- **Case** tab (id `log`, `ui-log.js`; the bar label was "Log"): the case box (aligned example lines; Paste button; "Draft saved" sits on the
  Interesting line), Quick picks (suggestions + your shorthand tags, Same as last, your tag
  groups), All tags, Still needed, "Save these tags as a tag group" under the tag list, pinned bar (chosen tags, Save, keep date | Save).
  Paste-a-list (List mode), Plan for later. `editCaseDialog` (full screen on phones, pinned
  Delete/Cancel/Save, 6-line growing box, Tags + "Add tags"; also "New case" from the reflection picker).
- **Logging preferences**: First field (Case summary by default, Initials or Date) is per device (`display.firstField`). Initials adds an optional input before the case box; Enter moves to the summary. Opening Case and saving focus the chosen field. `settings.detectAgeSex` is on by default: off hides the age/gender preview and stops age-based suggestions in Case and List review, while preserving text and manual/keyword tags. Case/List examples follow autodetection and the separate initials field without changing typed text. `M` and `m` both mean male in years (`6m` = six-year-old male, `3m` = three-year-old male); use `mo` for months (`3mo` = three months). Unambiguous compounds such as `2m2w` retain months + weeks.
- **Enter key** (Settings → Logging, `settings.enterMode`): New line (default; Ctrl/Cmd+Enter saves), Press Enter twice
  (Enter on an empty line saves; also via beforeinput for phone keyboards), or Enter saves. Old `enterSaves` = single.
  A no-tag save highlights suggestions; an additional Enter accepts the suggested tags and saves
  (the third Enter in double-Enter mode). This requires suggestions to be on. Editing or manually
  selecting tags cancels the offer; Shift+Enter remains a new line and holding Enter never accepts it.
- **Two panes** on the Case tab at >= 840px wide and >= 500px tall (tablets, unfolded foldables, computers; not
  landscape phones): `.log-card.panes` grid, left = date, case box, quick picks, Still needed, Save; right = all tags
  (sticky, own scroll). On phones `.lp-left` / `.lp-right` are display: contents, so the order is unchanged.
- **Logbook** (`ui-logbook.js`): Calendar (default; opens on today, "No cases yet today" when empty) | List | Grid.
  Calendar days all share one layout (number on top, a reserved spot for the count) so nothing shifts. Calendar day:
  + Log a case (opens Log on that date), Share day, Copy. Rows: slim tag pills (short names, full name on hover) on the
  left, Copy and Reflect on the right at one fixed size (icons only at ≤ 600 px; labels on bigger screens); Reflect is
  filled with a ✓ once the case has a reflection (opens it). No swipe actions. Filter (Show, Search in; then Dates | Tags | More toggles, each open while in use; More = fuzzy, case sensitive, Save search, Tag N cases; saved searches one slim scrolling row): has all of / has none of
  tags, dates, flag, search scope, fuzzy; Reset (everything); × in the search box clears just the text; saved searches (text, filters, "Search in"; not fuzzy); Tag N cases (bulk add/remove). Search text
  cached per case (`hayCache`, reset when the tag set changes).
- **Reflections** (`ui-reflect.js`): list by heading, editor (Case details, learning points,
  References and Figures as folded white cards), Export page (summary + Mark ready) and Choose page
  (ticks, Quick actions). Draft kept per account. Only a small "Rules for reflections" (no card) at the bottom. No section headings (General Surgery, Trauma…) in the list or the Choose page; the heading picker keeps them as dividers.
  Headings show their `label` (owner's choice, categories.js; the official `name` stays in the Word export) and a
  `note` under each (rules, examples, JR), hidden with "Show notes under each heading" at the bottom (`settings.reflNotes`,
  on by default). Chosen in the owner's "Reflection Heading Names" artifact.
- **At a glance** (`glance.js`, tested): folded Logbook / Reflections cards show a bar (status segments; tick =
  this year's goal: tags due by the end of the year / 96 x year/5 reflections) and, for programme residents with
  at least 4 in their residency year, strips vs that year (range, middle half, median, you) from the Totals
  summaries (counts only). No last-12-months or earlier-cohort comparisons: summaries hold current totals only.
- **Analytics** (`ui-progress.js`): header tally, folded sections (Needs attention, Logbook,
  Reflections with ⓘ requirements, Trends), Compare with your intake (Totals). EPA view and Download summary removed (owner: not useful).
- **Reflection editor** (Oct 2026 tidy): Linked case with Change case and Unlink on one row; the heading note keeps its
  line breaks (examples, then the JR rule); the JR rule is one line with ⓘ; "What APMES wants covered" is a small fold
  at the very end, no card (`.refl-guide`, hidden with tips off). **Free-text learning points**: a Numbered | Free
  text switch on the Learning points card. Free text = one point with no heading (`isFreeText` / `joinPoints` in
  reflections.js, tested), so no data change; the Word export prints the text under Learning Points without "1.",
  the Markdown notes and the Claude connector say "Learning points". Numbered → Free text joins the points (asks
  first; figures go to the end). The editor opens a reflection as free text when it was switched on this device
  (localStorage `apmes-logbook-refl-free`) or the default is free (Settings → Reflections, `settings.reflPoints`);
  a one-point reflection without a heading yet looks the same, so the shape alone never decides.
- **Separate initials box** (Advanced logging, device `firstField: 'initials'`; was "First field for a new case",
  whose Date choice only moved an invisible cursor and was dropped: an older 'date' counts as off).
- **Admin portal** (`ui-admin.js`, admins only): Ready portfolios, then link rows to Programme totals (`#admintotals`,
  the Totals table full width), Residents (`#adminresidents`) and Advanced admin settings (`#adminadv`: shared tag
  groups, default tag names, portfolio template, the owner's import and one-off initials fix). Sub-pages are TABS
  entries `under: 'admin'`; `onAdmin()` covers them all. e2e: `goAdmin('adminresidents' | 'adminadv')`.
- **Fold-outs**: every `<details>` (except the reflection Quick actions menu) shows one chevron at the right of its
  summary (style.css, end), down when closed, up when open; the old per-place markers are gone. Folds that hold
  things say how many in the summary ("Figures (optional) · 2", "Default tag names · 3 renamed"). e2e checks it.
- **More** (`app.js`): Account (with Residency year for non-programme users; Delete account at the bottom,
  greyed out for residents on the programme list: a programme admin takes them off first; `cloud.deleteAccount`
  wipes cases, reflections, images, bin, submission, members entry, logbook, then the Google sign-in), Settings, Export &
  backup, Admin portal; Privacy, Credits, "Install the app" card (Install button from beforeinstallprompt; Safari steps on iPhone/iPad; hidden when installed or after Not now), Sign out at the very bottom.
- **Colour** (Display): one accent (`settings.accent`, null = NUHS navy): 8 suggested swatches + any colour.
  `colors.js` (tested) works out light, dark and OLED palettes with contrast floors (light accent 4.5:1 with white;
  dark accent 7:1 on cards, near-white text, neutral grey backgrounds) and writes them into <style id="accent-css">,
  cached for the first paint (index.html). Light / Dark / OLED (pure black: data-oled on top of dark) / Auto is
  separate, per device. (Fixed named themes were tried and dropped: they read as shades of one colour.)
- **Zoom and text size** (Display, per device): Interface zoom 80–150% = `body { zoom: var(--ui-zoom) }` (header and
  tab bar too; Ctrl/Cmd + − 0 on a computer, app.js); lengths measured on the real screen (tab bar, keyboard,
  visual viewport) are divided by `--ui-zoom` where used inside. Text size = the words only: every font size in
  style.css (and inline in JS) is `calc(Npx * var(--fs, 1))`; fields keep `max(16px, …)` so iPhones don't zoom on
  focus. New font sizes must follow that pattern. The old Text size (a content zoom) is carried over once as the
  zoom (`migrateDisplay`, display `v: 2`). Defaults are pixel-identical to before. Compact = density.
- **Fonts** (Display, per device; `fonts.js`, tested): Interface font and Logging font (`--font-ui`, `--font-log`;
  logging = `textarea.details`, `ul.cases .t`, `.refl-editor` fields; "Same as the interface" by default). Choices:
  Open Sans (default, Google Fonts as before), the device's font, Atkinson Hyperlegible Next, Lexend and Inter (woff2 in
  `fonts/`, latin 400/700, SIL OFL, loaded only when chosen, cached by the service worker on first use), Serif and
  Monospace (system stacks), a font installed on the device by name (`cleanFontName`; a width test says whether it
  was found; Safari mostly ignores user-installed fonts), or the user's own file (.woff2/.woff/.ttf/.otf ≤ 3 MB,
  IndexedDB `apmes-logbook-fonts`, FontFace API; this device only, never synced).
- **Look options** (Display, per device; `applyLook` in ui-settings.js, classes on `<html>`, also set at first paint in
  index.html): line spacing (`--lh`; every line-height in style.css is `calc(x * var(--lh, 1))`), line width (narrow
  760 px / normal 980 / wide 1400; the Case tab's panes keep theirs), contrast (follow the device's Increase contrast
  by default, normal, or higher: darker text and lines), motion (follow the device's Reduce motion by default, on, or
  reduce), icons-only tab bar (buttons keep `aria-label`; on a computer the icons are shown for it), tab bar position
  (auto = bottom on phones / top on bigger screens, or always top `tabs-top`, or always bottom `tabs-bottom`), hide the
  header (`no-header`; it shows again while `who-alert` is set by paintWho: signed out, demo, offline, unsynced).
  Case tab upside down on phones (`case-inverted`: CSS `order` on the log card's items, lp-left/right being
  display: contents; tags on top, the case box last above Save; app.js render() scrolls to the bottom on entering).
  Keyboard on opening the Case tab (Logging page, device key `autoFocus`, html `no-autofocus` read by ui-log.js).
  Colourful 'tabs' / 'all' ('all' = `colour-all`: the colour picker's palettes per tab, `tabSchemeCss` in colors.js,
  scoped to `body[data-bar=…]`, the stripe untouched; with the default colour NUH_TAB_COLOURS follow the NUH stripe, else
  TAB_COLOURS; the --t-* shades come from `tabVarsCss`). Name in the header (`appTitle`, ≤ 40 characters, also the
  browser tab title) — the older (`colourful`: one colour per bar tab, `body[data-bar]` set in paintTabs; darker shades for contrast,
  lighter in dark mode). Custom CSS (advanced; `custom-css.js` `checkCss`, tested): refused if it loads anything from
  elsewhere (url(), @import, image-set(), @font-face, @namespace, script hooks, backslash escapes), over 10 KB or with
  unbalanced braces; never applied on the Display page (applyCustomCss runs in render()); `?nocss` turns it off;
  device only and never in the settings file.
  Defaults are pixel-identical to before.
- **Quality-of-life settings** (Oct 2026). Account (`settings`, Logging page): First day of the week (`weekStart`
  1 Monday default / 0 Sunday / 6 Saturday; `weekStart`/`weekLead`/`weekdayNames` in engine.js, tested; used by the
  Logbook calendar, Analytics heatmap and By day of the week, `dateWindow` "this/last week", last week's summary);
  After Save (`afterSave`: next (default) / keepTags / closed = keyboard down / logbook = `hooks.showDay` set by
  ui-logbook.js, then #logbook on that day; Undo then puts the case back, and kept tags don't count as a new case);
  Undo window (`undoSecs` 5 default / 10 / 20 / 30: any toast with a button stays at least that long, ui-core `toast`);
  Case tab card: parts to hide (`caseHide`, CASE_PARTS in ui-log.js: interesting, parsed, quick, still, groupsave,
  plan; `.log-card.hide-*` in style.css; the case box, All tags and Save always stay). Device (`DISPLAY_KEYS`, html
  classes from applyLook): case box keyboard (`boxCaps` false → `box-caps-off`, `boxCorrect` true → `box-correct`,
  `boxSpell` false → `box-spell-off`; read in renderOne), reflection spelling (`reflSpell` false → `refl-spell-off`,
  Reflections settings; ui-reflect.js sets spellcheck on the editor's fields and on focus), Display: Pin the case box
  (`pinBox` → `pin-box`: `.box-wrap` sticky at `--pin-top`, the phone top tab bar's height when it sits on top; not
  when the Case tab is upside down) and Pin the search box (`pinSearch` → `pin-search`: `.lb-top` sticky, its height in
  `--lb-top-h` so List's month headings stick under it). All in the settings file.
- **Settings pages: everyday first, Advanced below** (owner, Oct 2026). Display (`#display`): light/dark, colour,
  Colourful, zoom, text size, compact, Borders, the start tab; then a link row to **Advanced display** (`#displayadv`,
  `renderDisplayAdvanced`: name in the header, fonts, line spacing/width, contrast, motion, tab bar, icons only, hide
  header, upside down, pins, custom CSS — never applied on either Display page). Logging (`#logging`): suggestions,
  age/gender detection, first field, Enter key, date for a new case, After Save; then **Advanced logging**
  (`#loggingadv`, `renderLoggingAdvanced`: keyboard on opening, case box height, undo window, week start, weekly
  summary, tips, advanced search, the Case tab card). Sub-pages are TABS entries `under` their page (Back trail and
  the bar's tab follow); `advancedLink` in ui-settings.js draws the row. New options go on the Advanced page unless most
  people would change them. e2e: `tab('displayadv')` / `tab('loggingadv')`.
- **Borders** (Display, per device `borders`: 0 Borderless, 1 Faint, 2 Light, 3 Soft, null = Normal; a range input):
  every border in style.css (and the reflection editor's inline ones) uses `var(--edge, var(--line))`; `html.edges`
  sets `--edge` on every element to `--line` mixed with transparent at `--edge-mix` (0/25/50/75%), so it follows the
  `--line` of themes, contrast and colours. `html.edges-fill` (Borderless, Faint) gives fields, plain buttons and
  chips a light fill so they stay visible. Tag tick boxes keep `--line`. Also set at first paint (index.html).
  Defaults pixel-identical to before.
- **Patient initials** (`splitInitials`, engine.js, tested): 2–4 letters as always; 5–8 letters and one capital letter
  only before an age or "/" ("ABCDEF 45F …", "K/30F …"), so "ELECTIVE LSCS" or "a 45f lady" keep their first word.
  **One-off fix** (Admin, owner only, `initialsFixCard` in ui-admin.js; `initialsFixes` in engine.js, tested;
  `cloud.listLogbookEmails` / `fixCaseInitials`): reads every logbook's cases, lists those with an empty initials
  field whose text starts with initials under these rules (older imports, pastes, spreadsheets), and writes initials +
  details back after a confirm. Re-running finds nothing. The rules already let the app owner read and update cases.
- **Settings tools** (Oct 2026): **Search** on the Settings page (app.js `settingsSearch`): the first search of a visit
  draws Display, Advanced display, Logging, Advanced logging, Reflections and Markdown off screen and indexes their
  headings, field labels, switches and folds (with the hint under each), so it never goes stale; a result opens the
  page and scrolls to the option, which flashes (`findAfterRender`). **Display preview** (`displayPreview`, top of
  both Display pages, sticky): a made-up row, chips and buttons with the app's own classes. **Reset this page**
  (`resetLink`) on Display, Advanced display, Advanced logging and Reflections (Codex's on Logging): only that page's
  keys, after a confirm; custom CSS is switched off but kept, own font files stay stored.
- **Look options, Oct 2026** (device keys): **Corners** (Display, `round` 0 Square / 1 / 2 Normal / 3 Very round): every
  border-radius in style.css (and the reflection editor's inline ones) is `calc(Npx * var(--round, 1))`; tag tick
  boxes cap at 1.2 so they never look like radio buttons. **Soft shadows instead of lines** (`shadows`, cards only).
  **Bigger tap targets on the Case tab** (Advanced display, `bigTaps`). **Tab bar order and hidden tabs** (Advanced
  display, `tabOrder` / `tabHidden`, `arrangeTabs` in ui-settings.js): ↑ ↓ and a switch per tab; More can't be
  hidden, at least two stay; hidden tabs are listed first on More ("Hidden from the tab bar") and links still open
  them; a hidden start tab gives way to the first one on the bar. All set at first paint where it matters.
- **Optional interaction** (Advanced display, device, off by default): **Swipe left or right to change tab**
  (`swipeTabs`, html `swipe-tabs`; app.js touch handlers on main): a quick sideways swipe (≥ 70 px, mostly
  horizontal, < 0.7 s) on a bar tab's page goes to the next/previous tab on the bar (order and hidden tabs honoured);
  never from fields, dialogs, drag handles, tag-editor pills or anything that scrolls sideways, never on sub-pages.
  **Fewer buttons on Logbook rows** (`rowMenu`, html `row-menu`): one ⋯ opens Copy / Write or Open the reflection /
  Edit the case; a ✓ still marks cases with a reflection.
- **Display is per device** (owner: people use the logbook on different devices with different needs): compact,
  text size, zoom, fonts, colour and the start tab live in localStorage `apmes-logbook-display` (`deviceDisplay` / `setDisplay` /
  `adoptDisplay` in ui-settings.js), light / dark in `apmes-logbook-theme`. A device with none starts from the
  account's old `settings` values (and corrects that from the server copy in the same visit). Kept at sign-out;
  wiped by Reset demo. The settings file carries this device's display values and imports them to the device.
- **Settings**: a menu of Display (incl. the tab the app opens on; a #hash still wins),
  Logging, Tag editor (`#tags`), Reflections (`#reflset`: new reflections in the export, photo sizes), Markdown (`#sharefmt`), Recycle bin;
  then a "Settings file" card: export / import settings, tags, tag groups, formats as JSON (`settings-file.js`, tested; never cases or portfolio).
- **Markdown** (Settings → Markdown, `#sharefmt`; `markdown.js`, tested in `markdown.test.mjs`): one format in
  `settings.markdown` (only what differs from the default; ≤ 8 KB) for Copy / Share on the Logbook tab and the notes
  export. Templates take `{{name}}` (older `{name}` still works): case fill-ins {{date}} {{iso}} {{day}} {{weekday}}
  {{n}} {{count}} {{initials}} {{details}} {{categories}} {{categoryCodes}} {{tags}} {{reflection}}; a line whose
  fill-ins are all empty goes; a value is never read again as a template. Options: date format, categories as
  names / codes / #tags, wiki or Markdown links, case notes per month or day, reflection folders (month, heading,
  flat), file name pattern, front matter fields, the reflection templates (title, summary, each point, figure,
  references). Default day: `[[YYYY-MM-DD]]`, then `1. AB` / case, a blank line between cases; no tags. An older
  `settings.shareFormat` (the Copy & share format) carries over until the Markdown page is saved; `share-format.js`
  is kept for that and its tests. Previews use the user's own latest day and reflection.
- **Save to Google Drive / Dropbox** (Backup card; `cloud-save.js`, ids and pure helpers in `backup-targets.js`,
  tested): Drive = Google Identity Services token client, scope `drive.file`, folder "APMES Logbook" found or made,
  same-day file replaced; Dropbox = PKCE in a popup (opened from the tap, its address set after the challenge), the
  popup's return is caught in `index.html` (`window.__dbxReturn`, postMessage to the opener, app not started there),
  App folder access, uploads to `/APMES Logbook/`. Tokens in memory only. `settings.cloudBackup` { remind, md,
  lastAt, lastTo } (never in the settings file). Reminder: one toast per visit with a Save button when due. Both
  stay disabled until the owner fills `GOOGLE_CLIENT_ID` / `DROPBOX_APP_KEY` (README Firebase setup step 6); the
  real sign-ins are untested until then.
- **Connect Claude** (`mcp/`, Settings → Connect Claude (advanced) links its README on GitHub): a read-only MCP
  server residents run locally; Google "Desktop app" OAuth (loopback, PKCE) → Firebase `signInWithIdp` → Firestore
  REST as the user, so the rules apply; only `logbooks/{own email}` and the user's own `residents` entry. Owner
  setup (the Desktop client ID and its non-confidential secret in `mcp/config.mjs`) is in `mcp/README.md`; until
  then sign-in can't work. Tests: `logbook/mcp/test/*.test.mjs` (tools test needs `npm install` there).
- **Download for notes apps** (More → Export / Import → Backup; `ui-notes.js`): a zip made on the phone (JSZip):
  `Cases/` notes, `Reflections/…` one note each (linked both ways), `Progress.md` (counts vs targets, reflections vs
  minimums), optional figures in `images/` (fetched one by one from `images/`). A privacy line is always shown.
- **Tag editor** (`ui-settings.js`): List | Pills (drag; hold on phones; the dragged copy is lifted above the finger,
  a bar or highlight shows the drop spot, a label at the top says "Before/After/Under …", vibration on Android), search, case counts, edit
  dialog (name, long name, sits under, counts towards, shorthand with built-in defaults and words
  learned from your cases, hide, merge), Tag groups card, then a "Tag list file" card at the bottom (CSV download / load, Reset). The last tag or header tapped (list or pills) is marked; a new one goes right after it (`tev.last`); a new tag group goes after the last one edited.

## Tags and suggestions (`tags.js`, `suggest.js`)

- Tag numbers ("16", "20iii") come from the APMES portfolio's Section 4 table and the old Google Form; they stay as
  internal IDs (Section 4 fill, old-form import, CSV IDs) but are never shown: Still needed, Totals, the Excel backup
  (full or short names) and the Admin names table use names only.

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
- Pull-down-to-refresh is off (`overscroll-behavior-y: none` on html, body).
- Any change to a file in `sw.js` SHELL: bump `VERSION` (`logbook-v20…`). New JS files go in SHELL. Check the bump
  really landed (`grep VERSION logbook/sw.js`): a sed run from the wrong folder once left it stale for ten commits.
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
  `data` (Export / Import), `totals` (by hash, under Analytics). On a wide screen the Case tab is two panes.
- Owner preferences: merge your own PRs once unit tests and e2e pass, then report. Exception: a Claude Code ↔
  Codex handover PR waits for the owner's explicit approval (see the handover skill once it is on main). The owner may say
  "no e2e yet": then only unit tests and quick browser checks. Show phone screenshots of UI changes. When the
  owner asks "should we / can we", answer and propose; for multi-part changes say the plan first and wait when
  asked ("let me know what you are going to do"). Owner's calls so far: no tag renames (APMES tag names stay),
  no raw regex, no swipe actions, no tag numbers on screen, no What's new, frictionless logging first.
- Working alongside another assistant (Claude Code and Codex each run in their own cloud environment and share
  nothing but GitHub): one owner per PR and per area at a time; start from current `main`; keep PRs small and
  merged promptly so the other side's branch doesn't drift. Claude Code watches the PRs it opens and acts on
  every comment, review and failure there: a comment on one of its open PRs wakes it, so don't post on it
  unless you mean to reach it (or the owner has stopped it first). Pass work across with a PR link via the owner.
- After a big batch, a review pass pays: three reviewers in parallel, one per area (Case tab; Logbook search,
  Excel and upload; settings, account, reflections), each asked for concrete scenarios and to reproduce in the
  demo, found ~16 real bugs in Oct 2026 (#117). Verify each finding before fixing; add a unit test when the
  logic is pure.
- Gotchas (Claude Code's cloud shell; Codex may differ): the shell's cwd resets between commands, so `cd logbook &&` every time (a relative `sw.js` sed once
  missed for ten commits). Long Python edits: write the script to the scratchpad and run it (inline heredocs with
  quotes broke). Regex edits by id can hit a sub-type with the same id (`chronic` is a heading and a regional
  sub-type). The local test server (`python3 -m http.server 8080` from the repo root) dies now and then: restart.
  Demo data lives in localStorage `apmes-logbook-demo-v1` (tests can edit it, e.g. take the user off the list).
- Artifacts: the owner's "Reflection Heading Names" editor (claude.ai artifact 1RFrWs3cCJFVgiJKULspFb, db doc
  `choices/headings`) produced the heading labels/notes in categories.js; re-read it with ArtifactData if asked
  to re-apply.
- Branch work: after a merge, restart the branch from `origin/main`.

## Review findings fixed (Oct 2026), worth not regressing

- Saved searches must store copies of filter arrays; flag select resets with Clear.
- Case rows have no swipe actions (owner: off); per-case Copy, not Share.
- Diff keys compare tags with parents; pasted export rows (hidden id) aren't read as initials.
- Removed personal tags show as "Removed tag" and stay filterable / bulk-removable.
- Per-user state resets on sign-out (`resetters`), including Analytics, Reflections view, drafts;
  async loads (Totals, ready portfolio) are dropped after sign-out (`gen` counters).
- Pill drag uses the pressed element; CSV Under uses IDs when names repeat; roman sub-codes (26ii).
- Upload reads back every tag name the export writes (full, short, names with commas: "Cardiac,on-pump");
  a column missing from the file (unticked in the export) leaves that field as it was; a file without the
  hidden "Export info" sheet only deletes cases dated within it. Unit tests in export-opts and engine tests.
- Search date words keep the rest of the query as typed (OR / AND, case-sensitive); a bare SAT/MON/SUN is a
  search word (initials), only full day names or "last sat" are dates.
- Case tab: Shift+Enter never saves; Undo of a save restores ☆ Interesting; a picked day survives a reload
  (12 h); "+ Log a case" keeps a case being typed; Same as last keeps line 1 (initials, age).
- Settings file: only known keys, each cleaned to the shape the app reads (a bad savedSearches broke the
  Logbook tab on every device); rYear / rYearAY / importMap / sharedSeen never travel.
- Programme tag groups are adopted only from the server logbook, never a cached copy (it overwrote groups
  changed on another device). Delete account re-authenticates before deleting anything.
- Totals: your own column is live (summaryOf), not the copy loaded when Analytics opened.

### Device recovery (Codex robustness review)

Case creation, individual edits/Undo and reflection editor saves first commit immutable recovery records on the device (IndexedDB, with localStorage fallback). Server transactions compare the editor’s base version before replacing a record. Offline saves stay usable; rejected saves keep the editor/input. More → Recent changes / Recover drafts shows pending/failed sync, explicit retries, both sides of a concurrent edit, and the last 100 saved versions. Pending/failed/conflicting changes never expire automatically. History is private to the browser/account and is cleared on sign-out; it is not a backup. Existing batch imports and reflection metadata operations keep their existing cloud APIs.

Case and reflection drafts use separate document slots, including when session storage is cloned into a duplicated tab. Case input writes synchronously and flushes on pagehide/hidden; draft status reports storage failures. Recovering a draft preserves the currently open draft in its previous slot.

Run `logbook/test/e2e/recovery.mjs` beside the full E2E suite for rejected writes, immediate reload, two-tab drafts, offline reconnect, conflicts, failed reflection Close and denied storage. It accepts `PLAYWRIGHT_PATH`/`CHROMIUM_PATH` for cloud-runtime paths and uses fake demo records only.

### Back, search and everyday logging (Codex usability review)

Dialogs and reflection editors/pickers/heading choices use finite, opaque history entries. Browser Back dismisses the top view before leaving its screen; manual closes consume the same entry. Dialogs restore focus/caret. Back-dismissed reflection and case-edit drafts remain in More → Recent changes / Recover drafts, including learning-point-only and legacy drafts. Sign-out clears pending toast actions and drops transient callbacks before cleanup; direct account changes clear the old screen immediately. Undo waits for its durable delete and preserves text entered while it is finishing.

Natural-language date search protects quoted phrases, field operands and exclusions before recognizing dates; literal whitespace is preserved. Category-name revisions invalidate search haystacks alongside personal tag changes. List and Pills use a multiselect listbox, roving option focus and a labelled combobox; empty-query ArrowDown+Enter works. The collapsed list reports its actual expanded state.

Logging keeps Claude’s everyday/Advanced split. Everyday controls are grouped by task with device/account scope, defaults, a live fake example and a reset limited to this page. Optional device `compactTags` shows six common recent tags, with the full picker expandable/searchable; settings-file import/export carries the preference. Additional-Enter confirmation names suggested tags in a persistent inline hint. Age previews use words (6m/6M = six years male; 6mo = six months; 3m = three years male; 3mo = three months) without changing the saved input. Unambiguous months+weeks compounds retain their meaning.

Run `logbook/test/e2e/usability.mjs` beside recovery and the full E2E suite. Both focused runners accept cloud-specific Playwright/Chromium paths and fail nonzero on assertion failure. Fake data only.
