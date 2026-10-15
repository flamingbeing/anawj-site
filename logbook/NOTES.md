# Logbook: working notes

Decisions, conventions and how to work on the APMES logbook (`logbook/`). What's happening now (sessions, open
work, what waits on the owner, the next steps, a dated decisions log) is in `STATUS.md`. Read this, then `README.md`
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
- The demo should look like the real app: no yellow bar, just a small "demo ▾" badge in the header. Leave demo
  and Reset demo (a link that asks first) also sit by Sign out on More, so the header can be hidden in the demo too.

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
- Future dates are allowed (Log date picker, calendar "+ Add"); they show as "upcoming".

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
  A no-tag save highlights suggestions and offers the confident ones (score >= 0.5, `logging.js` `STRONG`, the same
  line as "+ All" and a pasted list; weak guesses are never counted without a look); a second Save (the button, an
  additional Enter in the box, the third Enter in double-Enter mode, or Enter in the empty tag search) accepts them
  and saves. This requires suggestions to be on. Editing or manually selecting tags cancels the offer; Shift+Enter
  remains a new line and holding Enter never accepts it (key repeats are ignored, also in the tag search). A Save tap
  within 600 ms of a tap that made the offer is a double tap and is ignored, so the hint shows first. Enter in the empty tag search
  saves the case only in Basic (which, with no suggestion row, sends the focus there) or while an offer is pending;
  elsewhere it does nothing, as before.
- **Case tab parts** (`settings.caseHide`, and Basic's `basicOn` `case:<part>`): `sugg` (the suggestion row) and
  `recent` (Same as last, tag groups) used to be one part, `quick`; an older `quick` still means both and is
  rewritten as the two on the next change (`logging.js` `expandParts`). Basic hides both unless turned back on.
  The profile switches are `case:sugg` and `case:recent` (profiles.js reads an older `quick` in `caseHide`,
  `basicOn` or `show['case:quick']` as both).
- **Logging extras** (account, off / default as before): `settings.autoTick` ticks the confident suggestions as you
  type; they follow the text, and one the user unticks stays off for that case (`draft.auto` / `draft.rejected`,
  kept through Undo after Save and Undo after clearing the box).
  `settings.recentCount` (1 default; 1, 2, 3 or 5, other values snap to the nearest: `logging.js` `recentCount`) Same as last chips. A date chip tap refocuses the box only when it
  had the focus. A pasted list ticks your own tags from their shorthand, with what they count towards.
- **Typing cost**: the draft is stored 300 ms after the keys pause (and at once on pagehide, hidden, hash change);
  the box's marks copy its style only on resize (ResizeObserver) and redraw in the next frame; per key only changed
  text is written; a tag tap updates the list in place (`picker.sync`); `PROGRESS_BY_CODE` is memoised on
  `S.counts`; a write's state change that leaves the list as it was doesn't recount. Benchmark:
  `PORT=8080 node logbook/test/e2e/bench-logging.mjs` (Chrome busy time; numbers in the 13 Oct 2026 PR).
- **Two panes** on the Case tab at >= 840px wide and >= 500px tall (tablets, unfolded foldables, computers; not
  landscape phones): `.log-card.panes` grid, left = date, case box, quick picks, Still needed, Save; right = all tags
  (sticky, own scroll). On phones `.lp-left` / `.lp-right` are display: contents, so the order is unchanged.
- **Logbook** (`ui-logbook.js`): Calendar (default; opens on today, "No cases yet today" when empty) | List | Grid.
  Calendar days all share one layout (number on top, a reserved spot for the count) so nothing shifts. Calendar day:
  + Add (opens Log on that date), Share, Copy (off unless switched on: Advanced display → Copy button for each day). Rows: slim tag pills (short names, full name on hover) on the
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
  List look (owner, Oct 2026): each topic reads as a heading: a bold navy name (`.refl-topic`), the count as a pill
  after it (`.refl-pill` met = green, some = grey, none = amber; replaced the dot and bold count), a line between
  topics, and a quiet "+" (still `.refl-add`, label "Add a reflection under …"). Header: title, Edit and "+ New"
  (`aria-label` "New reflection") on one line; if they can't fit, the buttons wrap below on the right.
- **At a glance** (`glance.js`, tested): folded Logbook / Reflections cards show a bar (status segments; tick =
  this year's goal: tags due by the end of the year / 96 x year/5 reflections) and, for programme residents with
  at least 4 in their residency year, strips vs that year (range, middle half, median, you) from the Totals
  summaries (counts only). No last-12-months or earlier-cohort comparisons: summaries hold current totals only.
- **Analytics** (`ui-progress.js`): header tally, folded sections (Needs attention, Logbook,
  Reflections with ⓘ requirements, Trends), Compare with your intake (Totals). EPA view and Download summary removed (owner: not useful).
  **Advanced mode only** (owner, Oct 2026; none of it in Basic mode; pure helpers in `analytics.js`, tested):
  pace forecast on each tag row ("about 4 months at your pace", over the last 6 months, or since the first case if
  more recent; future-dated cases don't count), tags on track whose next target won't be reached by the end of its
  year join Needs attention as "Off pace"; **Gone quiet** (still needed, last logged 60+ days ago; never-logged tags
  left out); **Reflection to-dos** (☆ Interesting cases with no reflection → Write; drafts untouched 30+ days →
  Finish, `openReflection` in ui-reflect.js). Tag names (rows, Gone quiet, top tags) and month bars open the
  Logbook List on those cases (`hooks.showCases` in ui-logbook.js clears other filters). Heatmap days aren't links:
  9 px squares are too small to tap (the tap-target check needs 40 px).
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
  They open and close smoothly (one click listener in `app.js`: the height is held, then animated; not for the
  Quick actions menu, a control inside the summary, or Reduce motion).
- **Look and feel** (owner's Apple-apps review, 13 Oct 2026): line icons from `ui-core.js` (`ic(name)` inside text and
  buttons, `rowIcon` on Logbook rows), never emoji; empty lists use `emptyState(icon, title, hint, button)`; buttons,
  chips and rows show a pressed state; one speed for motion (`--dur`, `--ease` in style.css). New looks are separate
  settings, off by default (the plan is in STATUS, Next).
- **Back links** (owner, 13 Oct 2026): every page without its own place on the tab bar has a back link to the page
  before it (`parentOf` in app.js: none for a page on the bar, Settings or Notes too when put there; More for a bar
  page kept off the bar; otherwise the page it sits under). The edge swipe follows the same rule.
- **Colour** (owner, 13 Oct 2026): the device's own colour picker (one colour well, Default colour beside it), no
  preset swatches; the light and dark palettes still adjust it to stay readable.
- **Moving around** (polish 2): on a page under a tab, "‹ Settings" (the page it goes back to) replaces the app's name
  in the header (in the page instead when the header is hidden). Going into a page slides it in from the right as it
  fades in; going back, from the left. Only the new page moves: a still copy of the old page (tried first) put every
  button on the screen twice for a moment, which broke look-ups. Only within one bar tab, never while swiping or with
  Reduce motion. In the iPhone / iPad
  home-screen app only, a drag from the left edge goes back (Accessibility → edge swipe; Android uses its own Back
  gesture there). Settings → Accessibility (`#access`) holds zoom, text size, bigger taps, contrast, motion and the
  gestures. Filter and its folds grow open (`reveal()` in ui-core.js); dropdowns draw the app's own chevron; the
  calendar's month name opens a month picker (not in Firefox on a computer, which has none).
- **Lists** (polish 3): case rows put the initials on top of the date in the left column (like Reflections) and the
  details beside them; tags stay on one line that scrolls sideways (fading at the edge); month headers are a thin
  sticky line you tap anywhere to jump to a date. Reflection rows: initials with a small JR, the date on one line
  ("11 Sep", or "11 Sep 25" in an earlier year); a heading's counts never split over two lines. Analytics cards show
  the summary and one bar folded; "You and your year" (the spread strips) is inside the opened card.
- **Case box marks** (polish 4): the initials and the age/sex are highlighted inside the case box (a see-through copy
  of its text on top, `.box-marks`, styled from the box's own computed font and padding so the wrapping matches).
  The line under the box says only what the age was read as ("6m = 6 years · male"): kept on purpose, as the check
  that 6m means years and 6mo months. The initials and procedure are no longer repeated there.
- **Note editor** (polish 5): a page, not a form. Top bar: ‹ Notes, Saved / Not saved yet, a ⋯ menu (Preview or
  Edit, Delete) and Done. The title is a borderless heading, the body plain text; one grey line under the title holds
  the date (tap to change), No date, and the linked case or Link to a case….
- **Settings pages** (polish 6a): every settings page (class `set-page`) uses the helpers at the top of the Display
  code in ui-settings.js: `toggle()` (a switch at the row's end; one help line, ⓘ for the rest), `pick()` (two to
  five choices as a list with a ✓; real radio buttons, so the keyboard and screen readers work) and `help()`. Keep
  help to one short line; longer text goes behind ⓘ. Bigger choices (zoom, box height, fonts) stay dropdowns.
  Advanced display and Advanced logging are grouped under headings. Settings search also reads the ✓ lists (their
  name and choices, so "oled" finds Light or dark).
- **Clean looks** (polish 6b; each its own device setting, off by default): Borders → Flat (`flat`: no lines, no
  page cards; its own key so saved border levels keep their meaning), Button style (`btnStyle`: outlined / filled /
  tinted / plain, for every button but the main one), Icons instead of words (`iconBtns`: buttons built with `ib(icon,
  word)` from ui-core.js, class `ib`; the word stays for screen readers), Plain calendar (`calPlain`), Page titles in
  the header (`pageTitles`; `setPageLabel` from render()), Shorter Logbook rows (`rowShort`, CSS only), Press and hold
  a row for its menu (`rowHold`, Accessibility; the click from lifting the finger is swallowed so it can't press the
  sheet's button now under it). The calendar day's buttons read Share, Copy and + Add; Copy for a day is off unless
  switched on (`dayCopy`, owner 13 Oct 2026). e2e: `nap()` is capped, so a long press needs `p.waitForTimeout`.
- **Reflections list JR count** (owner, 13 Oct 2026): a heading's JR rule ("One / Two from JR") shows as a small
  "JR 0/1" pill beside its count, green when met, and leaves the note under the heading (`listNote`; a qualifier stays:
  "JR: with neuromonitoring"). The editor still shows the full note. Word counts on the list can be hidden
  (Settings → Reflections, this device: `hideWords`).
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
  index.html): line spacing (`--lh`; every line-height in style.css is `calc(x * var(--lh, 1))`), **Page width** (key
  `lineWidth`, was "Line width"; narrow 760 px / normal 980 / wide 1400 / full = no limit; phones are always full; the
  Case tab's panes keep theirs), contrast (follow the device's Increase contrast
  by default, normal, or higher: darker text and lines), motion (follow the device's Reduce motion by default, on, or
  reduce), icons-only tab bar (buttons keep `aria-label`; on a computer the icons are shown for it), tab bar position
  (auto = bottom on phones / top on bigger screens, or always top `tabs-top`, or always bottom `tabs-bottom`), hide the
  header (`no-header`; it shows again while `who-alert` is set by paintWho: signed out, offline, unsynced; not for the demo since Oct 2026).
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
  Case tab card: parts to hide (`caseHide`, CASE_PARTS in ui-log.js: interesting, parsed, sugg, recent, still, groupsave,
  plan; `.log-card.hide-*` in style.css; the case box, All tags and Save always stay). Device (`DISPLAY_KEYS`, html
  classes from applyLook): case box keyboard (`boxCaps` false → `box-caps-off`, `boxCorrect` true → `box-correct`,
  `boxSpell` false → `box-spell-off`; read in renderOne), reflection spelling (`reflSpell` false → `refl-spell-off`,
  Reflections settings; ui-reflect.js sets spellcheck on the editor's fields and on focus), Display: Pin the case box
  (`pinBox` → `pin-box`: `.box-wrap` sticky at `--pin-top`, the phone top tab bar's height when it sits on top; not
  when the Case tab is upside down) and Pin the search box (`pinSearch` → `pin-search`: `.lb-top` sticky, its height in
  `--lb-top-h` so List's month headings stick under it; on Reflections `.refl-top` sticks at minus the height of its
  title and counts (`--refl-hide`, `pinHead` in ui-reflect.js) so only the search row stays, and an open topic's name
  sticks under it (`--refl-top-h`) while its reflections scroll; not in edit mode). All in the settings file.
- **Settings pages: everyday first, Advanced below** (owner, Oct 2026). Display (`#display`): light/dark, colour,
  Colourful, compact, Borders, Corners, shadows, the start tab; then a link row to **Advanced display**
  (`#displayadv`, `renderDisplayAdvanced`, under headings: Header and tab bar · Logbook rows · Text · Case tab layout;
  custom CSS last, never applied on either Display page). Accessibility (`#access`): zoom, text size, bigger taps,
  contrast, motion, gestures. Logging (`#logging`): suggestions, age/gender detection, common tags first, Enter key,
  date for a new case, After Save; then **Advanced logging** (`#loggingadv`, `renderLoggingAdvanced`, under headings:
  Case tab · Keyboard in the case box · Search · Dates and Undo · Help). Sub-pages are TABS entries `under` their page
  (Back trail and the bar's tab follow); `advancedLink` in ui-settings.js draws the row. New options go on the
  Advanced page unless most people would change them. e2e: `tab('displayadv')` / `tab('loggingadv')`, and
  `choose(legend, value)` for a ✓ list.
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
  boxes cap at 1.2 so they never look like radio buttons. **Soft shadows instead of lines** (`shadows`, cards only; **on by default**, owner 12 Oct 2026: `shadows: false` = lines).
  **Bigger tap targets on the Case tab** (Advanced display, `bigTaps`). **Tab bar order and hidden tabs** (Advanced
  display, `tabOrder` / `tabHidden`, `arrangeTabs` in ui-settings.js): ↑ ↓ and a switch per tab; More can't be
  hidden, at least two and at most seven (`MAX_BAR`, More included; owner, Oct 2026) stay. Every page in the More list
  (Account, Settings, Recover drafts, Export / Import, Admin portal for admins; `bar: true` in TABS, a `short` label on
  the bar) can go on the bar, off by default like Notes; its own pages select it (Display → Settings). An eighth asks
  which tab it replaces and takes that tab's place (`setTabOnBar`; also the Notes page's "Add Notes to the tab bar").
  Hidden main tabs are listed first on More ("Hidden from the tab bar"; the More pages stay in their own list) and
  links still open them; a hidden start tab gives way to the first one on the bar. A tab missing from the saved
  order goes just before More, so More stays last. All set at first paint where it matters.
- **Optional interaction** (Advanced display, device): **Swipe left or right to change tab** (`swipeTabs`, html
  `swipe-tabs`; app.js touch handlers on main). **On by default** (owner, Oct 2026: `swipeTabs: false` = off, the
  switch is also in Show or hide → Header and tabs). Touch handlers on the document, so the empty background under
  a short page swipes too (owner); never from the tab bar or a banner. Like a deck of cards (owner, Oct 2026: no popping in, no bar
  moving): the page follows the finger and the next tab's page comes in beside it while dragging, as a still copy of
  that page from when it was last left (`snaps`, taken in `changeScreen`; inert, no ids) or a loading card for a tab
  not opened yet (`makePeek`, fixed at the page's unscrolled top). Letting go after a quick swipe (≥ 70 px, mostly
  horizontal, < 0.7 s) or past a third of the screen finishes the slide (both on one Web Animations clock), then the
  real page is drawn underneath at the copy's height on screen and the copy goes; otherwise both spring back. The next
  tab is the next/previous on the bar (order and hidden tabs honoured; `barTabOf`: a sub-page counts as the bar tab
  it sits under, an off-bar tab as More). While swiping the page is pinned (`pin`: position fixed over a spacer of
  its height): a page in the flow sliding off the right edge widened the phone's layout viewport, so the fixed tab bar
  dropped and slid back. Don't clip overflow on html/body for this: on Chrome for Android that stopped the page
  scrolling to the very bottom (the last card, e.g. Advanced display settings, hid behind the tab bar). `paintTabs` only moves the selection when the bar's tabs are unchanged (no rebuild, no flash). Never from fields, dialogs, drag handles, tag-editor pills, anything that scrolls sideways, or within 20 px of
  the screen's edges (the phone's Back gesture). Reduce motion: switches without sliding.
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
- **Sync** (Settings → Sync, `#sync`; `ui-sync.js` page + run, `sync-remote.js` calls, `sync-md.js` pure and tested;
  Oct 2026): one Markdown file per day (the day's cases + that day's notes via `mdDay`, the user's Markdown format) in
  Google Drive (`APMES Logbook/Daily/`), Dropbox (app folder `/Daily/`) or a GitHub repo (owner/repo/branch/folder,
  contents API). Name pattern `{date}.md` (also {year} {month} {day}; `/` makes folders). Only days whose text changed
  since this device's last sync go, only on a tap: a "Sync (N)" button on the Logbook tab's count row once a place is
  set up (none otherwise); optional reminder on open (off). The app owns only `<!-- logbook:start fp=… -->` … `<!--
  logbook:end -->` in each file: text outside is kept; edits inside are merged (`merge3`: base = the app's text at the
  last sync, kept in IndexedDB `apmes-logbook-sync`; clashes kept both ways with `<<<<<<< logbook` / `>>>>>>> your
  edits` marks; lines both sides added at the end: the user's first). The start mark's `fp` is the fingerprint of the
  app's text written there (never of a merged block), so a device with no ledger or base (second device, after
  sign-out) replaces an untouched block, leaves alone a block already holding its text, and marks clashes only when
  both really changed. Changing a place's repo/branch/folder/file name clears its ledger and bases (every day is
  written there again). A run waits for the server's notes (`notesFromServer`); a run stops recording at once on
  sign-out (`gen`); `forgetSync` also drops this visit's Drive/Dropbox tokens and Drive folder ids. GitHub writes
  are paced (60 a minute) and a rate limit (403/429 "rate limit", Retry-After) stops that place with "try again in
  N minutes"; "Try again" redoes only the place(s) of that run. Writes are conditional (Drive: md5 checked just before PATCH; Dropbox: upload `update` rev / `add`;
  GitHub: PUT with sha) and a refused write is read again and merged (twice at most). `settings.sync` {targets,
  remind} (no tokens; travels in the settings file); ledger in localStorage `apmes-logbook-cloud-sync:<account>`
  {fp, rev per day}; GitHub token (fine-grained, one repo, Contents read/write) in `apmes-logbook-cloud-gh:<account>:<id>`
  only; "cloud" keeps them out of the device-settings file. Sign-out / account switch / demo reset forget all of it
  (`forgetSync`). Drive/Dropbox reuse the backup sign-in (`signInFor`, pending `action: 'sync'`, `back` page);
  tokens stay memory-only, so a run resumed after one sign-in never leaves for a second (the other place waits for
  the next tap). ID check once per run. e2e: `test/e2e/sync.mjs` fakes all three APIs.
- **Save to Google Drive / Dropbox** (Backup card; `cloud-save.js`, ids and pure helpers in `backup-targets.js`,
  tested): sign-in leaves the page and comes back, no popups (Oct 2026: on the owner's phone popups lost their
  opener, so Drive stayed on a blank page and Dropbox did nothing). Drive = OAuth implicit grant (token in the
  `#fragment`), scope `drive.file`, folder "APMES Logbook" found or made, same-day file replaced; Dropbox = PKCE,
  code in `?query`, App folder access, uploads to `/APMES Logbook/`. Both redirect to `https://apmes.anawj.com/logbook/`
  (registered with both; moved from anawj.com on 13 Oct 2026). localStorage `apmes-logbook-cloud-pending` {to, state, verifier, demo, at} before leaving
  (not sessionStorage: a home-screen app may finish sign-in in a browser tab; 15 min limit);
  `index.html` stores the answer in `apmes-logbook-cloud-return` and tidies the address to `#data` (`?demo` kept);
  `resumeCloudSave` (from `onUser`) waits for the server's cases and reflections, then saves. The reflections
  listener needs `includeMetadataChanges` for that: without it an unchanged offline copy never reports `fromCache:
  false` (the first version waited 30 s and gave up on the owner's phone; demo e2e can't see it). States start `gdr-` /
  `dbx-`; a mismatch saves nothing. e2e: `test/e2e/cloud-save.mjs` fakes both. Tokens in memory only.
  Uploads are `logbook-backup-<date>.json.gz` (CompressionStream, about 4x smaller; `gzipBlob` in `backup.js`);
  Download backup stays plain `.json`; Restore reads both (`backupText`: gzip's 1f 8b bytes, not the name).
  `cloudBackup.keepDays` 0 (default, keep all) / 90 / 30: after a save the app lists its folder and deletes its own
  dated backups and notes zips older than that (`staleBackups`); Dropbox needs `files.metadata.read` for the list.
  A failed tidy never undoes the save; the toast says so. `settings.cloudBackup` { remind, md,
  lastAt, lastTo } (never in the settings file). Reminder: one toast per visit with a Save button when due. The
  owner filled `GOOGLE_CLIENT_ID` and `DROPBOX_APP_KEY` (both public) in Oct 2026. Dropbox stays in development
  mode until the owner applies for production (its icons are 64 and 256 px from `icons/icon-512.png`).
- **Settings menu** (`renderSettingsMenu`, `SETTINGS_GROUPS` in `app.js`; owner, 13 Oct 2026): every page kept, in
  groups Profile / Look / Logging / Reflections / Notes and sharing / Data / Advanced (Advanced display and Advanced
  logging also listed there). A Settings page (`under: 'settings'`) no group names still shows, under "Other"
  (`settingsGroups`): give a new page its group. Settings search indexes every page, Profile and the Tag editor included (`SEARCH_PAGES`).
- **Profile** page (Settings → Profile, was Profiles or hide items; `#showhide`, `renderShowHide` in `ui-settings.js`):
  the profile card, then every switch that shows or hides part of the app, grouped Extras / APMES / Tips and help /
  Case tab / Reflections / Logbook / Header and tabs, each group with its own "Reset this group" (back to the
  profile's defaults; the other groups stay). The same settings as on their own pages. e2e: `simpler.mjs`, `profiles.mjs`.
- **Profiles are presets of switches** (owner, 13 Oct 2026: "changing profiles simply toggles a bunch of switches";
  `js/profiles.js`, pure, `test/profiles.test.mjs`). `settings.mode` (the whole account; `PROFILES`, `profile()`,
  `shows(key)` / `basicHides(key)`, `setShown`, `caseShown` / `setCaseShown` in `ui-core.js`) is the base; each switch
  (`SWITCHES`: extras `grid`, `analytics`, `reflExtras`, `reflect`; Case tab parts `case:<part>`; APMES `targets`,
  `case:still`, `totals`, `portfolio`, `year`, `reflHeadings`, `saveToast`, `apmesTitle`) is its saved value in
  `settings.show`, else the profile's default (`presetOn`). Older accounts' lists still count: `caseHide` (parts off,
  kept in step on every save) and `basicOn` (items a Basic profile hid, turned back on). So an account with only `mode`
  saved looks exactly as before. Picking a profile (`profileCard` → `confirmProfile`) lists what it turns on and off and
  the tabs it moves on this device, then Apply clears the saved switches (`applyPatch`; an ungoverned hidden part such
  as `parsed` stays) and moves this device's saved tabs, only those the old or new profile moves (`PROFILE_OFF` /
  `PROFILE_ON`; `tabsAfter`; Notes put on the bar by hand stays there from Basic to Advanced; a device with no saved tabs
  follows the profile's `offBar`). A switch changed after makes the card read "Custom (based on X)" with "Back to X"
  (of the tabs, only the profile's own count). **Saving `show`:** the cloud merges the map key by key (`setDoc` with merge), so a patch sends
  only the changed keys, and a reset sends its keys as `null` (left out, they'd stay); `mergeSettings` merges the same
  way locally and in demo mode, and a settings file's `show` replaces the account's (`replaceShow`).
  Body classes `basic`, `logbook-only`, `faculty-profile` stay. **Basic is the default for everyone** (owner, 12 Oct
  2026: nothing saved = Basic). The e2e demo account starts in Advanced (`demoDoc` in demo-backend.js, when
  `apmes-logbook-demo-small` is set) since the tests check every feature.
  - **Profiles hide interface items only, never settings** (owner): every switch is visible on the Profile page and
    works in any profile.
  - **Opt-in switches** (`OPT_IN` in profiles.js: new options, off in every profile unless `PRESET_ON` lists them):
    `evalRequest` ("Request an evaluation from a case", APMES group; a case's ⋯ menu and edit page open the evals app's
    new request with the date and initials only, `js/eval-link.js`). The APMES group's reset says it turns it off.
  - **Device presets** (`js/device-presets.js`): device options a profile turns on, the device's own value first.
    `hideTabsTyping` (Accessibility → Hide the tab bar while typing) is on in Personal only. The profile sheet lists them
    as "Turns on / off (this device)", and Apply clears the device's own values for them (`deviceReset`), so the device
    follows the new profile; one switched by hand after makes the profile "Custom".
  - **APMES switches** (account, on in every profile but Personal): targets (counts against targets in All tags,
    Analytics targets; off: Analytics shows cases per tag, your own tags too, `renderCounts`), Still needed, programme
    totals (Compare with your intake, You and your year), portfolio export and Section 1 (Export / Import cards,
    Account card), residency year (Account card, Analytics year), reflection headings (Analytics card, "Which
    heading?" step, Reflections list grouped by month), the "now 4/10" save toast, APMES in the default app name
    (`defaultTitle`; a name typed in Advanced display still wins).
  - **Personal** (generic logging outside APMES): the APMES switches off, the extras on, Notes on the tab bar
    (`PROFILE_ON`), own tags kept (tags are never touched by a profile).
  - **Basic**: hides the optional Case tab parts but "what the box was read as" (quick picks, ☆, Still needed, tag
    group saving, Plan for later), the Logbook Grid, Analytics trends / forecasts / Gone quiet / to-dos / links,
    reflection Figures and References (shown anyway when a reflection has some); Analytics off the bar (in More).
    Search operators are not hidden (already off by default; a setting).
  - **Basic: logbook only**: Basic without reflections, for residents allowed to submit reflections separately (the
    PCs still need compiled case logs): Reflections off the bar (in More, for ones already written), no Reflect
    buttons or row-menu item, no ☆ Interesting (edit dialog, Logbook filter), no reflection headings card.
  - **Advanced**: hides nothing.
  - **Faculty / PCs** (`facultyMode()`; offered only to `facultyRole()`: admins, PDs and active faculty; their
    default when nothing is saved, outside the demo; owner, 12 Oct 2026: PCs are added as admins, no PC role; no
    Generic profile): tab bar **Case logs** (`#caselogs`, `ui-caselogs.js`: residents by year with total cases, tags
    behind / due, reflections; tap → `#caselog`, that resident's counts per tag against the targets (`totalsTable`
    with one column), reflection headings met, Excel download), then **Analytics** as programme analytics
    (`renderProgramme`: who's behind, the tags most residents are behind on, then Programme totals), then the Admin
    portal for admins (left of More; owner), then More (their own
    Case, Logbook, Reflections first). All from the counts summaries, never case details. The rules let active
    faculty read `summaries/` (counts are no secret, owner); they still can't read the residents list, cases,
    reflections or notes. Case logs is listed in More for them in other profiles.
  - Display preview (`displayPreview`): dashed accent edge, faint stripes and a "Preview only: not a real case" pill,
    so it never reads as a real case (owner).
  e2e: `simpler.mjs`.
- **One spreadsheet (CSV)** (Backup card, "Download as one spreadsheet"; `backup-csv.js`, tested; Oct 2026, from
  Codex's list): the backup as one CSV for Excel: a `logbook` row (settings, tag groups, portfolio details) then a row
  per case, reflection and note (photos left out). Readable columns (Kind, ID, Date, Initials, Title, Text, Tags,
  Heading, Status, Linked case, Updated) and a Data column with each record's JSON, which Restore from backup reads
  (`looksLikeBackupCsv` → `csvToBackup`), so the same preview and add-only restore apply. A BOM for Excel; cells that
  start like a formula get a leading `'`; comma, semicolon or tab separators load. e2e: `simpler.mjs`.
- **Reflection formatting buttons** (Settings → Reflections or Show or hide → Reflections; `display().reflToolbar`,
  this device, off by default; html class `refl-toolbar`; `fmtBar` in `ui-reflect.js`; Oct 2026, from Codex's list):
  Bold, • List and 1. List above each reflection box. They write Markdown (`**bold**`, `- `, `1. `); the Word export
  turns `**bold**` into bold runs, `- ` into "• " and `# heading` into a bold line (`mdRuns` in `portfolio.js`, tested),
  the Markdown export keeps it. Notes have no toolbar (owner). e2e: `simpler.mjs`.
- **Notes** (`#notes`; `ui-notepad.js`, pure helpers in `notepad.js`, tested; Oct 2026, owner's spec via Codex):
  a resident's own notepad: teaching points, doses, to-dos. Private (owner-only rules: no admin, PD or app-owner
  access), never in the portfolio. A bar tab that starts off the bar (`OFF_BAR` in `ui-settings.js`): first in More
  with "Your own notes: private, never in your portfolio"; Arrange tabs can put it on the bar (it stays off until
  `tabOrder` holds it, so people who arranged tabs before Notes existed don't get it on their bar). At most 2,000
  (`MAX_NOTES`, raised from 100 on 13 Oct 2026 with the sync engine; the app enforces it: the rules can't count); the
  list shows 100 at a time ("Show 100 more"). The index doc (`meta/noteIndex`, rules cap 100) keeps the latest 100
  days and the cases of the latest-changed notes; once the notes are loaded the Logbook's marks come from them. A full
  index (100 days or cases) can't say about older ones, so the Logbook then loads the notes (this device's copy:
  cheap), and a day's Share loads them too (`dayMayHaveNotes`). A new note takes today's date (or the filtered day /
  linked case's day); "No date" makes it undated. Order: undated first (latest change first), then newest day first,
  then as written. Search over title and body. Optional `caseId` ("Link to a case…"). Body is Markdown text, shown
  through `parseNote` → elements (never innerHTML; the list page keeps the syntax in a small "Formatting" fold;
  Enter in the title moves to the note text): # headings, **bold**, - / 1. lists, - [ ] to-dos that tick in
  Preview, http(s)/mailto links only. No images. Delete → recycle bin (kind `note`, 30 days; restore refuses past 100).
  Firebase cost: notes are not read at sign-in; `ensureNotes()` starts the listener on first need (the page, a day
  with notes in the Logbook, the Markdown export, a backup) and keeps it for the visit. Typing saves after 3 s of
  quiet, on blur, on leaving (Back, another tab) and on pagehide / hidden, through `writes.save('note')` →
  `cloud.commitRecord` (offline queue, conflict check). The note index { days, cases, n } (`logbooks/{email}/meta/
  noteIndex`, owner only; updated only from the server's copy of the notes) lets the Logbook show a bar on days with
  notes, "✎ Notes" on the day and "✎ note" on linked case rows without reading notes: one small read when the Logbook
  first asks. It moved out of `settings.noteIndex` (Oct 2026 review: the logbook doc is readable by the app owner); the
  first sync clears the old copy, and backups and the settings file never carry it. Bin restore loads the notes first,
  so the 100 limit holds; the notes listener uses `includeMetadataChanges` like reflections. Copy / Share for a day adds its notes after the
  cases in Settings → Markdown's "A day's notes" format (default `## Notes` then `{{notes}}`: each note as `### title`
  and its text); `{{notes}}` in the day heading places them there instead; no notes, no heading. The Markdown export
  (renamed from "Notes apps") puts dated notes in their day's case note (a notes-only day gets one) and undated ones
  in `Notes.md`. The backup file holds notes; restore adds missing ones up to the limit. e2e: `test/e2e/notepad.mjs`.
  A note's linked-case pill (in the list and in the editor) opens that case's edit page over the note
  (`openCase` → `editCaseDialog`). The edit page has a "Linked" row (not for a new case): Open / Write a
  reflection (`reflectOnCase`) and Open the notes / Write a note (`openNotes({ caseId, create })`; it saves an open
  note first). The Notes page's "Download notes as files (zip)" makes one `.md` or `.txt` per note
  (`noteFiles` in `notepad.js`: "2026-10-12 Title.md", undated "No date Title.md"; title, Date line, text; the linked
  case isn't named); this is separate from the Markdown export, which puts notes inside the day's case note.
- **Daily notes, pasting, formatting, shared to the app** (Oct 2026, 6-hour build track E; e2e `test/e2e/daily-note.mjs`):
  - A daily note is an ordinary note with the id `day-YYYY-MM-DD` (date set, title empty → "Daily note"), so every device
    finds the same one without a query and no rules change was needed. `openDayNote(iso)` waits for the notes and opens
    the existing one (never a second copy with the same id), straight in Edit; when the offline cache hasn't got it,
    it waits up to 3 s for the server's list, and a server copy arriving before anything is typed replaces the blank
    one. Two copies saved apart (two devices) are merged (`mergeDayNote`: the other copy's text plus what was added
    here) instead of a write conflict; ordinary notes keep the conflict. The Case tab box and the editor share one
    copy. A daily note's date can't be changed (it's found by its day). Ways in: the Logbook day's "+ Daily
    note" / preview card (`dayNoteCard`; Done goes back to the Logbook), Notes' "Today's note" button and "Daily notes"
    chip, the manifest shortcut `./#today`, and the Case tab box (Settings → Notes, `settings.dayNoteOnCase`, off).
    It sorts first in its day and has no heading in Copy / Share / Send and the Markdown export.
  - Daily notes don't count towards `MAX_NOTES` (2,000; `cappedNotes`; backup restore and bin restore follow). The
    rules allow 100 days in `meta/noteIndex`, so the doc holds the latest 100 days and the cases of the latest-changed
    notes (`noteIndex(list, INDEX_CAP)`, from the sync engine); once the notes are loaded the marks come from all of
    them, and a full index loads them (`indexCapped`, `dayMayHaveNotes`), so an older daily note still shows and goes
    into Copy / Share / Send. The Logbook's day repaints when the notes change (ui-notepad.js `apply`). Raising that
    cap needs a `firestore.rules` change (owner's approval).
  - Paste cleaner (`paste-clean.js`, tested): `settings.pasteClean` (off) turns pasted HTML into light Markdown;
    Clean up (editor ⋯ menu, always there, with Undo) runs `tidyMarkdown`. The preview now shows `*italic*`.
  - Formatting bar (`fmt-bar.js`, shared with reflections): the note editor's full bar (bold, italic, heading, lists,
    to-do, link, undo) is device setting `noteToolbar` (off); on phones it rides on the keyboard while typing. Edits go
    through `execCommand('insertText')`, so Undo and Ctrl+Z work.
  - Shared to the app: the manifest share_target is POST multipart (text, title, url, `.md`/`.txt` files) to
    `./share-target`; `sw.js` keeps it in Cache Storage `share-inbox-logbook` and opens `./?shared=1#log`. Shared text
    (POST or the old GET `?share_text=`, which still works) goes straight to paste-a-list, as before, unless Settings →
    Notes → Ask what to do with shared text (`settings.shareAsk`, off); files always ask. The chooser
    (`ui-share-in.js`: Add as case(s) / Add to today's note / New note) clears the text only once the note has it.
    `share-in.js` holds the plumbing (tested).
    The POST needs the service worker: with none active (site data cleared, shared before the first install finished,
    or the old v40 worker still in charge while the new one waits for its reload and the phone already has the new manifest), the share reaches
    GitHub Pages, which refuses POSTs (405), so a static fallback page can't help. The worker installs on the first
    visit, so this only bites in that window.
- **Connect Claude** (`mcp/`, Settings → Connect Claude (advanced) links its README on GitHub): a read-only MCP
  server residents run locally; Google "Desktop app" OAuth (loopback, PKCE) → Firebase `signInWithIdp` → Firestore
  REST as the user, so the rules apply; only `logbooks/{own email}` and the user's own `residents` entry. Owner
  setup (the Desktop client ID and its non-confidential secret in `mcp/config.mjs`) is in `mcp/README.md`; until
  then sign-in can't work. The Desktop client ID is
  `474134277199-7ma8hij2lirbhk18d9l0i5033c2soc5c.apps.googleusercontent.com`; the agent's safety check refuses to
  commit the `client_secret` (even with the owner's go-ahead), so the owner pastes it via a GitHub web edit, then
  test `node server.mjs login` live. Tests: `logbook/mcp/test/*.test.mjs` (tools test needs `npm install` there).
- **Download for notes apps** (More → Export / Import → Backup; `ui-notes.js`): a zip made on the phone (JSZip):
  `Cases/` notes, `Reflections/…` one note each (linked both ways), `Progress.md` (counts vs targets, reflections vs
  minimums), optional figures in `images/` (fetched one by one from `images/`). A privacy line is always shown.
- **Tag editor** (`ui-settings.js`): List | Pills (drag; hold on phones; the dragged copy is lifted above the finger,
  a bar or highlight shows the drop spot, a label at the top says "Before/After/Under …", vibration on Android), search, case counts, edit
  dialog (name, long name, sits under, counts towards, shorthand with built-in defaults and words
  learned from your cases, hide, merge), Tag groups card, then a "Tag list file" card at the bottom (CSV download / load, Reset). The last tag or header tapped (list or pills) is marked; a new one goes right after it (`tev.last`); a new tag group goes after the last one edited.

- **Labelled parts and case template** (Settings → Advanced logging → "Labelled parts and template"; account
  settings `labelParts`, `partLabels`, `caseTplOn`, `caseTpl`, all off by default; rules in `parts.js`, screens in
  `ui-parts.js`, plan in `PLAN-labelled-parts.md`). A line starting with a label and a colon (`lp:`, `Plan:`,
  `ASA 2:`, also `**PE:**` and `- Plan:`; case doesn't matter, the colon is required so "LP" alone, lumbar puncture,
  never matches; `lp1:`/`lp 2:` numbered) starts a part, up to the next label; text before is the main part. The text
  is stored exactly as typed (no new case field, no rules change). Defaults `lp` (Learning point; also "learning",
  "learning point(s)") and `dt` (Case details); people add their own (word, shown-as name, other words, hide in
  lists). Uses: bold labels on Logbook rows (a label hidden in lists is left out of rows only), a read-back under the
  case box ("Parts ASA · Plan") and marks in the box, "Has <label> (n)" in the Logbook filter's Show list, `has:lp` in
  the search (plain search, or as an Advanced search operator), the **Learning points** page (`#points`, under the
  Logbook; link in Filter: every part of one label, newest first, Copy all, tap opens the case), Settings → Markdown →
  "Bold labels" (`markdown.boldLabels`: `**Learning point:** …` in `{{details}}`, via `mdCtx().labels`). Learning
  points never feed tag suggestions or shorthand (`suggestText`). The case template goes into an empty case box on
  focus (cursor after the first label, or on an empty first line), goes again on blur if untouched, and template lines
  left as they were are dropped on save (`stripTemplate`), so a bare template saves nothing and isn't kept as a draft;
  an untouched label line that heads lines typed under it (`Plan :` then `- spinal`) is kept, so those lines keep their
  part. A box holding only the template counts as empty for tag groups (their text goes on the empty first line or
  above) and Same as last (procedure on line 2, template lines kept). Same as last takes only the main text when
  labels are on. "Bold labels" writes the word as typed (`**Learning:**` stays `Learning`; a bare key like `lp` shows
  its name). A label's own word always beats another label's "also" word.
- **Pasted lists** (Case → List): with labelled parts off, exactly as before (blank lines split cases). With it on: a
  bold first line (`**AB 72M lap chole**`, also after a list mark) starts a case and loses its stars, but inside a case
  only a wholly bold line does (a bold word for emphasis stays); a bold label (`**Plan:**`) never does and is kept as
  `Plan:` (the export adds the bold back when asked); a block that starts with a labelled line after a blank line joins
  the case above, unless the label is `dt` or the case above already has that label.
- `has:` is a search operator only with labelled parts on; with it off it is plain text and the box says so.
- **2000-character limit** (`details` in `firestore.rules`): a case, a pasted row or an edit over it is never cut off
  silently. The box and the review table say how far over; Save asks, then keeps the first part in the case (cut at a
  line break or space, `splitOverflow`) and puts the rest in a note linked to it ("Rest of the case · AB", Notes'
  100-note limit checked first). "Plan for later" refuses a long row (planned cases can't carry a note).

## Data, roles and photos (`firestore.rules`)

- **App owner:** `owners/{email}`, set by hand in the Firebase console. May read logbooks and cases and import
  cases, but never reflections, images or the bin. Hand over by swapping the entry. Owner and admin are separate: without an
  `admins/` entry the owner has no Admin portal (where the import and initials fix live).
- **Admins** (the programme coordinators, PCs, are admins) can't read logbooks or cases. They read `summaries/`
  (counts per category, completed reflections per heading) and portfolios marked ready (`submissions/`). PDs,
  programme residents and **active faculty** read `summaries/` too (faculty since Oct 2026, for the Faculty / PCs
  profile). Reflections stay private to the resident, the owner included.
- **Photos:** adding one needs `isMember()` (on the residents list). 800–1000 px JPEG, a 20 MB budget per resident
  (`PHOTO_BUDGET_KB`; figures record `kb`). They stay in Firestore: at 150 residents that is about 3 GB, around
  US$0.40/month on Blaze, and photos still work offline. Moving to Firebase Storage needs a console bucket
  (asia-southeast1), loses offline adds, and isn't worth it yet.
- **Address (13 Oct 2026, SUBDOMAINS.md step 5):** the logbook lives at `apmes.anawj.com/logbook/` (evals beside it). `anawj.com/logbook/` still serves the same folder, but a top-level visit forwards (path, query, # kept; `index.html` head script; no-op on the new host, previews, localhost and frames). A browser with choices saved at the old address first gets a page (`js/moved.js`, `window.LOGBOOK_MOVED_TO`) offering them as a file (`deviceFile` in `settings-file.js`, kind `apmes-logbook-device`: `apmes-logbook-*` and `logbook-*` keys except demo, moved and Google / Dropbox sign-in state); Settings → Settings file at the new address loads it. e2e: `test/e2e/moved.mjs`. `authDomain` is `apmes.anawj.com` (helper pages and `init.json` served by the Worker, `apmes-auth/`).
- **Google Form inbox (14 Oct 2026):** the old Google Form stays open as a simple way in (owner: no end date). Its
  Apps Script writes each response to `formInbox/{responseId}` as a bot account listed in `formBots/{uid}` (console
  only; unverified email, so nothing else opens to it); the app turns the signed-in resident's entries into cases
  (`source: 'form'`) and deletes them (`form-inbox.js`, README "The Google Form, still open"). One way only: never
  write back to the Form or its sheet. Each open costs one extra read (the inbox query), even when empty. The script
  and its setup: `form-script/` (never turn off Firebase Auth "Enable create (sign-up)": it would block new Google sign-ins).
  Owner, 14 Oct 2026: no "Google sign-ins only" rule (`sign_in_provider`) for now: a small single-hospital Form with no
  patient identifiers. Password accounts already get nothing (every rule needs a verified email or `formBots`).
  15 Oct 2026 (audit): a response can come back at any time (edits stay on; the backfill), so a deleted Form case is
  kept for good in `formGone/{caseId}` (the bin lasts only 30 days), the pick-up stops if the bin or that list can't be
  read from the server, and the key notes the response's newest submit (a re-import knows an edited row). FormApp
  gives no first-submit time, so an old imported response edited in the Form is matched by day, initials and
  categories (not added, with a toast); a match like that against a case in the bin is added (with a toast), never
  dropped quietly. A `Code.gs` change reaches the Form only when the owner pastes it: list it in `form-script/CHANGES-PENDING.md`.
- **Test data paths against the real rules (14 Oct 2026 lesson):** the e2e tests run in demo mode, which skips the
  server-side checks (`commitRecord`'s base comparison, the rules), so a delete that never reached the server passed every
  test for a day (#519). Any change to saving, deleting, sync or the bin also needs the emulator tests:
  `tools/test-reads.sh` and `tools/test-multidevice.sh` (5 devices, random actions, devices going offline; seeded).
  `TEST=conflicts tools/test-multidevice.sh` runs fixed two-device scenarios (same case changed in two places, recycle
  bin, Form pick-up twice, a late offline save, sign-out with unsent work). The rule they check: nothing that said it
  saved is lost silently; it is on the server, or its device says "Save needs attention" and keeps it in Recent changes.
  A delete that loses to an edit made elsewhere is undone with a toast (the edit stays).
- **App → response sheet (14 Oct 2026, `PLAN-app-to-sheet.md`):** new app cases (source `app` or `paste`) of programme
  residents also go to `sheetOutbox/{caseId}` (`js/sheet-outbox.js`, switched by `SHEET_OUTBOX_ON`); a script on the
  sheet turns each into a Case-tab row with `app:<caseId>` in column J and deletes the entry. New cases only (edits
  and deletions don't reach the sheet; a case deleted before pick-up is taken out of the outbox). The Admin
  workbook import skips rows with `app:` in column J. The sheet side is `form-script/Outbox.gs` (setup: `form-script/OUTBOX-README.md`). Lessons (14 Oct): the sheet's own script rebuilds a resident's report and the AY totals in 10–40 s under the document lock while its `onFormSubmit` waits only 10 s (now 60 s), so Outbox.gs holds the lock in small pieces and keeps owed rebuilds in a Script property; a copy of the sheet keeps the REAL residents' report spreadsheet ids (Residents column G), so any test on a copy must repoint them first (`logbookOutboxTryOne` refuses otherwise); Apps Script loads files in list order (keep the original order, put new files last); a script that adds rows doesn't fire `onFormSubmit`, so it runs the same chain itself. Tests: `test/sheet-outbox.test.mjs`, the sheetOutbox rules in
  `test/rules.emulator.mjs`, and `TEST=conflicts` (scenario `sheetOutbox`).
- **Privacy policy:** `privacy/index.html` (anawj.com/privacy/) shows who sees what. Keep it in step when roles change.
- **Private feedback (14 Oct 2026):** More → Send feedback (`ui-feedback.js`, pure parts in `feedback.js`) saves
  `feedback/{id}` { uid, text ≤ 2000, doing? ≤ 300, screen, version, ua ≤ 200, status 'new', createdAt = server time }.
  Residents must never use the site's public routes (page editor, 💬 button): they make **public** GitHub issues.
  Only the uid is kept, no email (the owner can look a uid up in Firebase Authentication if a reply is needed);
  `screen` is the name of the page before More (`S.lastScreen`), never anything on it; `version` is the service
  worker's cache name. Send needs the "no patient details" tick and runs `okNoIds` first. Only the app owner
  (`owners/`) reads it: More → Feedback (also linked from Admin), New / Done / All, Mark done (the rules let only
  `status` change, to 'new' or 'done'), Delete, Copy as task (names and numbers replaced using `PRIVATE`, the same
  patterns as `feedback/overlay.js`; `test/feedback.test.mjs` keeps them in step). Admins can't read it. The demo
  stores it in the demo store (the demo admin plays the owner). Tests: `test/e2e/feedback.mjs`, rules suite.

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

## Sync: this device's copy and cheap reopening (`sync.js`, `store.js`; 13 Oct 2026)

- Goal: opening the app many times a day costs about one Firestore read per collection when nothing changed
  (Firestore's own cache only re-charges unchanged documents if a listener resumes within ~30 minutes).
- Each synced collection (cases, reflections, notes) has a copy on the device: IndexedDB `apmes-logbook-store:<email>`
  (demo: `…:demo:<email>`), one object store per collection plus a meta record `{ syncAt, fullAt, epoch?, gone }`.
  On start the engine shows the stored list at once (only if it was confirmed before, so a new device waits for the
  server as it did), then listens to `where('updatedAt', '>', syncAt - 10 min)` and merges what arrives. syncAt is
  this device's clock when the server last confirmed the list (never past now). First open on a device and once a week
  (`FULL_EVERY`): the whole collection instead, which picks up documents without updatedAt and heals anything missed.
- One engine per account and collection (`createSyncHub`), shared by every caller (the one-shot reflections purge and
  the Reflections screen share one listener); an engine nobody watches stops after 1.5 s.
- Deletions: the recycle bin is a feed of tombstones (`deletedAt > syncAt - 10 min`): a binned record goes only if it
  is still the version that was binned (the entry's `data.updatedAt`; restored or edited elsewhere since, it stays, so
  a bin entry whose delete was refused as a conflict removes nothing). Deletes on this device (`commitRecord`
  `_deleted`, `deleteCases`, `deleteReflection`) drop the record from the local copy and remember its id (`gone`,
  8 days), so a stale copy arriving later is ignored. A removal the server confirms goes at once; one seen only in the
  cache, or after this device's own pending write (a refused write), is checked with one read. Delete account stops
  the listeners first.
- **Limits** (healed by the weekly full read): a record deleted for good without a bin entry (Undo of a just-saved
  case, plan "done" / pasted-list Undo, Recent changes restoring a deletion) while another device was closed stays on
  that device until then, as does a write stamped by a clock more than 10 minutes slow. A bin-entry tombstone for
  these was considered and not used: older app versions would show it in the recycle bin as an empty case to restore.
- Late writes: direct writes (pasted lists, bulk tag, reflections saved outside the editor, bin entries) that reach the
  server more than 5 minutes after they were made (offline) are stamped again once the server has them
  (`restampIfLate` in `cloud.js`, one small write per record so one deleted since doesn't block the rest; ids listed in
  `apmes-logbook-late:<email>` from the moment they're queued until the server has them, so a page closed first
  stamps them after the next start), so other devices' "changed since" queries still see them. Queue writes (`writes.js`) are stamped when they commit, so they need nothing.
- Firestore's persistent cache stays (offline direct writes depend on its pending-writes queue).
- Sign-out, account switch and Delete account delete every store on the device (`cloud.forgetLocal`; other tabs close
  theirs on `versionchange` and a BroadcastChannel message). A shared ward PC keeps nothing. The account signed in
  now keeps its store (account switch, or a tab catching up on another tab's sign-out and sign-in). If a store is
  still deleted under a running engine, the engine writes its whole list back and reads everything at the next start.
- Costs: the 10-minute window means records changed in the 10 minutes before the last sync are read again on the
  next open (log a case and close the app: one read next time). The recycle-bin purge reads the whole bin at most once
  a day per device (`apmes-logbook-purged:<email>`).
- Demo: `demo-backend.js` `listenSince` gives the same listener; a logbook's `epoch` changes when its data is replaced
  wholesale (reset, sample logbook), which makes the device read it in full.
- Tests: `test/sync.test.mjs` (engine against a fake server that counts reads), `test/e2e/sync-engine.mjs` (demo: stored
  copy, reopen, two tabs, reset, sign-out wipe), `tools/test-reads.sh` → `test/e2e/reads.emulator.mjs` (the real app
  with `?emulator` on localhost against the Firestore and Auth emulators and the real rules; `window.__reads`).
  Measured 13 Oct: first open 50 cases → 50 reads; reopen with nothing changed → 1 read per collection; one case
  edited, one added, one binned elsewhere → 2 case reads and 1 bin read. Before the engine every open read all 50+.

## Demo (`demo-backend.js`, `demo-seed.js`)

- `?demo` (local storage), `?demo=reset` (wipes, reseeds, then the address becomes `?demo`).
- Demo user is an R3. ~350 generated cases over two years plus 32 sample reflections invented by the
  owner (initials and dates made up) load on demand from `demo-seed.js`, so real users never download it.

## Working on it

- Checks: `node tools/check.mjs`; ESM syntax: `for f in logbook/js/*.js; do node --input-type=module --check < $f; done`
  (plain `node --check` misses ESM errors); unit tests: `for f in logbook/test/*.test.mjs; do node "$f"; done`.
- Pull-down-to-refresh is off (`overscroll-behavior-y: none` on html, body).
- New JS files go in `sw.js` SHELL. No hand bump of `VERSION` (13 Oct 2026): the deploy stamps it with a hash of the
  SHELL files (`tools/stamp-versions.mjs`), so installed phones update whenever those files change. Change the base
  (`logbook-v40`) only when the service worker's own logic changes.
- Start-up speed (13 Oct 2026): only the Case tab's modules load with the app (`index.html` modulepreloads exactly
  those); every other page's module loads the first time it opens, then the rest in idle moments (`app.js`, "pages
  that load on first use": `MODS`, `page()`, `warmUp()`). So: the Case-tab modules (`ui-log.js`, `ui-notepad.js`,
  `ui-core.js`, `cloud.js` and what they import) must not import a page module statically. Device display settings
  live in `display.js`, the settings rows in `settings-rows.js` and More's cards in `more-cards.js`; sync's device
  wipe in `sync-forget.js` and the reflection drafts' wipe in `ui-core.js` (sign-out leaves nothing on the device
  even before those pages' code loads: anything a lazy module keeps on the device needs an eager wipe); the field
  whitelists in `clean.js` (the demo backend loads only in `?demo`, the Firebase SDK only outside it). A new page:
  `page(['mod'], m => m.mod.renderX())` in TABS. `#app[data-page]` names the page once drawn (tests wait on it).
  `logbook/test/e2e/lazy-load.mjs` checks the Case tab's modules, every page, every page offline with the
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
  `data` (Export / Import), `totals` (by hash, under Analytics). On a wide screen the Case tab is two panes.
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
  - Everyday choices on a settings page, the rest on its Advanced page (`#displayadv`, `#loggingadv`, `#adminadv`).
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

- Cloudflare previews: a service worker must key cached navigations by the folder (`'./'`), never `'index.html'`:
  Workers static assets answer `index.html` with a 307 to the folder, and a cached redirect breaks reloads.

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
  (12 h); "+ Add" (calendar) keeps a case being typed; Same as last keeps line 1 (initials, age).
- Settings file: only known keys, each cleaned to the shape the app reads (a bad savedSearches broke the
  Logbook tab on every device); rYear / rYearAY / importMap / sharedSeen never travel.
- Programme tag groups are adopted only from the server logbook, never a cached copy (it overwrote groups
  changed on another device). Delete account re-authenticates before deleting anything.
- Totals: your own column is live (summaryOf), not the copy loaded when Analytics opened.
- **App version (owner, 14 Oct 2026, as in the prewarming app):** the bottom of Settings shows "App version
  2026-10-14 (3f9a2c1d)" (the service worker's cache name, stamped at deploy by
  `tools/stamp-versions.mjs`; the date is the day that version went live) and "Get the latest version": it unregisters this app's service worker and deletes the
  `logbook-` caches, then reloads (`js/app-version.js`). Never data, drafts, settings or other apps' caches; refused
  offline (the saved copy is what opens the app) and while changes are still sending. e2e: `test/e2e/app-version.mjs`.
- Totals counts (owner, 14 Oct 2026): by default every tag on every case, all years (cumulative), plus a **Total tags**
  row like the old Google Sheet's Grand Total (one per tag per case; "Total cases" counts cases, so it is smaller). A
  per-device switch (`display().totalsCount = 'min'`) shows only what counts towards the minimums (each tag up to its
  last target; `towardsMinimum` / `tagTotal` in engine.js). Also on the Case log page.

### Device recovery (Codex robustness review)

Case creation, individual edits/Undo and reflection editor saves first commit immutable recovery records on the device (IndexedDB, with localStorage fallback). Server transactions compare the editor’s base version before replacing a record. Offline saves stay usable; rejected saves keep the editor/input. More → Recent changes / Recover drafts shows pending/failed sync, explicit retries, both sides of a concurrent edit, and the last 100 saved versions. Pending/failed/conflicting changes never expire automatically. History is private to the browser/account and is cleared on sign-out; it is not a backup. Existing batch imports and reflection metadata operations keep their existing cloud APIs.

After a conflict (14 Oct 2026 audit) nothing more for that record is sent until the resident chooses in Recent changes;
a later save used to wait behind it for good, say "Saved locally", and be set aside by either conflict button. Now
(`writes.js`): a save made on the version shown (the other copy) replaces the stopped chain (this device's earlier
versions are set aside, kept in the history past the last 100, and a toast says so); saving it unchanged changes
nothing; one made on this device's own version is kept as one more conflict and fails, so the editor keeps its input
(each next one replaces that held copy). "Keep version from elsewhere" sets aside that save, older ones and the held
copies, never a newer pending one. The Restore buttons go through `writes.restore()`: after a conflict it saves over
the other copy, and behind a failed save it saves from that save's base (what the server holds; it used to queue
behind the failed save for good and say "Version restored"); the chain is set aside only once that save is stored.
Retry on a save waiting behind a failed one sends the failed one again first. While a conflict is open the list shows
the server's copy (from the sync engine), so an edit or delete made elsewhere since shows and is counted (it showed
the copy found at the conflict: parked seed 285932884); the copy found at the conflict shows only while the list still
holds this device's own version, or the very version it started from (same `updatedAt`: a stale cached list; a
restore elsewhere is a newer one), or its delete took the record off. Windows that share the store (two tabs, the
home-screen app and a browser tab) read a save's stored state again just before sending it, on Retry and when a
failed save is reused, so one another window already sent or set aside is not sent again (nor one it has since
dropped from the history: gone, with 100 newer finished saves in the store).

Case and reflection drafts use separate document slots, including when session storage is cloned into a duplicated tab. Case input writes synchronously and flushes on pagehide/hidden; draft status reports storage failures. Recovering a draft preserves the currently open draft in its previous slot.

Run `logbook/test/e2e/recovery.mjs` beside the full E2E suite for rejected writes, immediate reload, two-tab drafts, offline reconnect, conflicts, failed reflection Close and denied storage. It accepts `PLAYWRIGHT_PATH`/`CHROMIUM_PATH` for cloud-runtime paths and uses fake demo records only.

### Back, search and everyday logging (Codex usability review)

Dialogs and reflection editors/pickers/heading choices use finite, opaque history entries. Browser Back dismisses the top view before leaving its screen; manual closes consume the same entry. Dialogs restore focus/caret. Back-dismissed reflection and case-edit drafts remain in More → Recent changes / Recover drafts, including learning-point-only and legacy drafts. Sign-out clears pending toast actions and drops transient callbacks before cleanup; direct account changes clear the old screen immediately. Undo waits for its durable delete and preserves text entered while it is finishing.

Natural-language date search protects quoted phrases, field operands and exclusions before recognizing dates; literal whitespace is preserved. Category-name revisions invalidate search haystacks alongside personal tag changes. List and Pills use a multiselect listbox, roving option focus and a labelled combobox; empty-query ArrowDown+Enter works. The collapsed list reports its actual expanded state.

Logging keeps Claude’s everyday/Advanced split. Everyday controls are grouped by task with device/account scope, defaults, a live fake example and a reset limited to this page. Optional device `compactTags` shows six common recent tags, with the full picker expandable/searchable; settings-file import/export carries the preference. Additional-Enter confirmation names suggested tags in a persistent inline hint. Age previews use words (6m/6M = six years male; 6mo = six months; 3m = three years male; 3mo = three months) without changing the saved input. Unambiguous months+weeks compounds retain their meaning.

Run `logbook/test/e2e/usability.mjs` beside recovery and the full E2E suite. Both focused runners accept cloud-specific Playwright/Chromium paths and fail nonzero on assertion failure. Fake data only.

### Tag editor selection and insertion (Codex next batch)

The first tap selects a tag in List or Pills and opens a small read-only details card. Edit is explicit; Add after uses the selection as an insertion anchor. Close / Escape / browser Back dismiss the card and retain selection. New tags and section headers offer separate Sits under and Place after controls, a searchable sibling list, Beginning / End and a placement preview. Insertion preserves child subtrees and existing APMES parent restrictions. Changing parent resets placement to its end. A changed layout or account refuses a stale dialog save. Selection clears with the account caches.

Notes v1 followed in its own PR (Claude, after the handover): see **Notes** under "Where things are".

- **Drift check lesson (15 Oct 2026):** an edit or delete in a resident's account found by the drift check is the resident's own
  work until they say otherwise (a resident's (202411) deliberate duplicate clean-up was first undone as "accidental"). Ask the owner to
  ask the resident before restoring, and keep a before-snapshot of anything written back.

Reliability-hour lessons (15 Oct 2026): a cloud container with 4 CPUs runs only 2 agents per workflow, so run one workflow per area
side by side. In the multidevice harness, `SLOW=1` used to leave the page "offline" while Firestore's open connection still reached the
server (fixed in #571): a failure that needs a state no real phone can be in is the harness's, so check that first. `writes.entries()`
lists the newest job first. The conflict path's blind spots (a save after a conflict, an overlay frozen at the conflict) explained
every remaining soak failure.
