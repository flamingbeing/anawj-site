# Logbook screens: Logbook, Reflections, Analytics, admin

Part of the logbook working notes; index in [../NOTES.md](../NOTES.md). Where things are (screens), part 2.

- **Logbook** (`ui-logbook.js`): Calendar (default; opens on today, "No cases yet today" when empty) | List | Grid.
  Calendar days all share one layout (number on top, a reserved spot for the count) so nothing shifts. Calendar day:
  + Add (opens Log on that date), Share, Copy (off unless switched on: Layout → Copy button for each day). Rows: slim tag pills (short names, full name on hover) on the
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
