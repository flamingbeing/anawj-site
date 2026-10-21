# Logbook screens: look and feel, Settings pages, Themes, Layout

Part of the logbook working notes; index in [../NOTES.md](../NOTES.md). Where things are (screens), part 3, with Themes.

- **Themes and Advanced theme settings** (TE S2, owner 21 Oct 2026): Themes (`#themes`) keeps the essentials: the
  themes and Browse all, Keep when changing theme, Your themes, Colour and light (light or dark, the night theme, Colour,
  Background), Wallpaper, then one row to **Advanced theme settings** (`#themesadv`, `renderThemesAdv`): Shape and type,
  Fine-tune, Header and tab bar, Rows and forms, App-style details, More colour (Colourful, Top band), Edit colours,
  Custom CSS. Both pages have the preview and the reset. Which card is on which page is `THEME_CARDS` in look-schema.js,
  and every look setting names its card (`section`; unit test in `look-schema.test.mjs`), so the pages can't drift. A
  copied `#themes?find=…` link to an option now on Advanced opens Advanced (`SPILL` in app.js `showFound`); Settings
  search lists both pages. The paragraph below is from before the split.
- **The colour sheet** (TE S2; `ui-colour-sheet.js`, grid in `colour-grid.js`; e2e `colour-sheet.mjs`): Colour → More
  colours, the icon tint and each Edit colours token open it instead of the phone's own picker (which shows only a few
  colours): 12 hues × 8 shades (OKLCH, as much colour as fits) and a grey row, one radio group with names like "Teal,
  shade 5" (arrows along a row, up and down a hue), a dot in each cell showing the deeper shade the palette uses for text
  (Colour and icon tint), a hex box, Recent (this device, 8), and the phone's own picker last. The page changes as you
  pick; Cancel puts it back. Grid, Recent and phone-picker colours are snapped to 6 bits a channel (`snap`, at most 2/255
  off, invisible) so a link carries them in 18 bits; a typed hex stays exactly as typed.
- **Look settings: Themes / Layout / Accessibility** (theme-revamp S3, 21 Oct 2026). Display (`#display`) and Advanced
  display (`#displayadv`) are gone. **Themes** (`#themes`) holds every look: it opens with "Themes are kept on this
  device only" and Export (`exportThemes`: Your themes, or this look, as a file), then the themes, Your themes, Colour
  and light, Shape and type (now also Line strength, Button style, Icons instead of words, Plain calendar), Fine-tune,
  Header and tab bar (name in the header, page titles, hide header, icons only), Rows and forms (navigation, row and form
  layout, Shorter Logbook rows), App-style details, colours, Custom CSS. **Layout** (`#layout`, `renderLayout`) is how it
  works: start tab, tab bar place, order and hidden tabs, Logbook row buttons, page width, the Add tab, gestures (swipe,
  edge back, press and hold) and the tab bar while typing. **Accessibility** (`#access`): zoom, text size, bigger taps,
  contrast, motion. The old Compact switch is Themes → Spacing: Tight. Custom CSS never applies on Themes, Browse all or
  Layout (`CSS_FREE`, display.js). Old links land on the new page: `#display` → Layout, `#displayadv` → Themes, and a
  copied `?find=` link goes to the page the setting is on now (`MOVED_SETTINGS` / `movedSetting` in navigation.js, unit
  tested; e2e `settings-pages.mjs` checks each setting is on exactly one page). Older lines below that say Display or
  Advanced display mean these pages.

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
- **Case box marks** (polish 4): the initials, the age/sex, labelled parts and (log2 2) the BMI the suggestions read
  (`suggest.js` `bmiAt`, purple) are highlighted inside the case box (a see-through copy
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
- **Edit colours** (Themes, per device; its card sits below the look settings, above the reset link): `colours: { light: {...}, dark: {...} }` overrides any of `bg`,
  `panel`, `ink`, `muted`, `line`, `accent`, `accentInk`, `ok`, `warn`, `err` (six-digit hex only). Omitted
  tokens keep their accent/tint values; old looks are unchanged. The Light / Dark editor drafts both palettes,
  shows live contrast ratios and resets individual overrides. Save checks ink and muted on bg and panel,
  and accentInk on accent, at 4.5:1 in light, dark and OLED; failing pairs name their ratio. Any override makes
  the look Custom. The look CSS cache includes overrides at first paint. Your themes and settings files carry
  the tokens, sanitised to known names and hex values; old theme files still import.
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
  Add tab's panes keep theirs), contrast (follow the device's Increase contrast
  by default, normal, or higher: darker text and lines), motion (follow the device's Reduce motion by default, on, or
  reduce), icons-only tab bar (buttons keep `aria-label`; on a computer the icons are shown for it), tab bar position
  (auto = bottom on phones / top on bigger screens, or always top `tabs-top`, or always bottom `tabs-bottom`), hide the
  header (`no-header`; it shows again while `who-alert` is set by paintWho: signed out, offline, unsynced; not for the demo since Oct 2026).
  Add tab upside down on phones (`case-inverted`: CSS `order` on the log card's items, lp-left/right being
  display: contents; tags on top, the case box last above Save; app.js render() scrolls to the bottom on entering).
  Keyboard on opening the Add tab (Logging page, device key `autoFocus`, html `no-autofocus` read by ui-log.js).
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
  Add tab card: parts to hide (`caseHide`, CASE_PARTS in ui-log.js: interesting, parsed, sugg, recent, still, groupsave,
  plan; `.log-card.hide-*` in style.css; the case box, All tags and Save always stay). Device (`DISPLAY_KEYS`, html
  classes from applyLook): case box keyboard (`boxCaps` false → `box-caps-off`, `boxCorrect` true → `box-correct`,
  `boxSpell` false → `box-spell-off`; read in renderOne), reflection spelling (`reflSpell` false → `refl-spell-off`,
  Reflections settings; ui-reflect.js sets spellcheck on the editor's fields and on focus), Display: Pin the case box
  (`pinBox` → `pin-box`: `.box-wrap` sticky at `--pin-top`, the phone top tab bar's height when it sits on top; not
  when the Add tab is upside down) and Pin the search box (`pinSearch` → `pin-search`: `.lb-top` sticky, its height in
  `--lb-top-h` so List's month headings stick under it; on Reflections `.refl-top` sticks at minus the height of its
  title and counts (`--refl-hide`, `pinHead` in ui-reflect.js) so only the search row stays, and an open topic's name
  sticks under it (`--refl-top-h`) while its reflections scroll; not in edit mode). All in the settings file.
- **Settings pages: everyday first, Advanced below** (owner, Oct 2026). Look pages: Themes, Layout, Accessibility (see
  the top of this file). Logging (`#logging`): suggestions, age/gender detection, common tags first, Enter key,
  date for a new case, After Save; then **Advanced logging** (`#loggingadv`, `renderLoggingAdvanced`, under headings:
  Add tab · Keyboard in the case box · Search · Dates and Undo · Help). Sub-pages are TABS entries `under` their page
  (Back trail and the bar's tab follow); `advancedLink` in ui-settings.js draws the row. New options go on the
  Advanced page unless most people would change them. e2e: `tab('layout')` / `tab('loggingadv')`, and
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
  boxes cap at 1.2 so they never look like radio buttons. **Card style** (Themes; owner, 16 Oct 2026; `cardStyle` / `cardPatch` in display.js): Raised = soft shadows (default; owner 12 Oct 2026), Outlined = lines (`shadows: false`), Flat = no lines and no page cards (`flat`). It replaced the Soft shadows switch and the Flat end of the Borders slider; the line strength (`borders`, Borderless … Normal) moved to Advanced display → Look as **Line strength**, kept while Flat is on.
  **Bigger tap targets on the Add tab** (Advanced display, `bigTaps`). **Tab bar order and hidden tabs** (Advanced
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
- **Settings**: a menu of Themes, Layout (incl. the tab the app opens on; a #hash still wins), Accessibility,
  Logging, Tag editor (`#tags`), Reflections (`#reflset`: new reflections in the export, photo sizes), Markdown (`#sharefmt`), Recycle bin;
  then a "Settings file" card: export / import settings, tags, tag groups, formats as JSON (`settings-file.js`, tested; never cases or portfolio).

### Themes (Settings → Themes; `themes.js`; owner, 15 Oct 2026)

- A theme is a bundle of this device's look settings (`THEME_KEYS`); picking one sets them all (Undo in the toast),
  and changing any afterwards shows "Custom (based on …)". Classic themes are cards; Inspired ones ("Obsidian-style",
  colours, corners and type only, never logos, paid fonts or brand names beyond "-style") are a searchable list.
  No celebrity or brand palettes (owner). New ideas come in through "Suggest a theme" (private feedback).
- Layout keeps how it works (start tab, tab bar, row buttons, Add tab, gestures); Themes holds every look: light or
  dark, colour, Colourful, background tint, Top band, card style, line strength, corners, spacing, buttons, the header,
  tab bar style, heading font, fonts, line spacing, row and form layouts, custom CSS (theme-revamp S3).
- **Themes that travel** (theme-revamp S5, 21 Oct 2026; `my-themes.js` `themeLink` / `themeFromLink` / `lookNow`,
  `ui-theme-link.js`; unit tests `my-themes.test.mjs`, `theme-engine.test.mjs`, `fonts.test.mjs`; e2e `share-link.mjs`):
  **Share as a link…** in Your themes makes `…/logbook/#theme=<base64url JSON { v: 1, n, l, m }>` from the look now
  (all built-in themes stay under 1.3 kB), with Share (the phone's share sheet) and Copy link. Opening one (after
  sign-in, or in the demo; `app.js` `wantTheme`, also when tapped while the app is open) tidies the address to
  `#themes` and shows the theme at once (`display.js` `previewLook`, nothing saved) with **Use** / **Cancel**; Use sets
  it and keeps it in Your themes (a tick, on by default), Undo in the toast. A link is input from strangers: `lookOf`
  first, then every setting `checkTheme` rejects is dropped (fonts: bundled only, never a typed name or a file); a
  link that can't be read says "broken or cut short". No QR code: a 1-2 kB link makes a dense code and needs an
  encoder. **Day and night:** with Light or dark on Auto, "Theme when the phone is dark" (`nightTheme`: a theme's id or
  `mine:<id>`) shows that theme while the phone is dark; every look painter goes through `lookToShow`, so the day look
  set on the page is untouched, and the page says when the night theme is showing. **Case text size** (Accessibility,
  `caseSize`, `--cs`): the case box, case text in the Logbook and point rows, apart from Text size; first paint from
  index.html. **More bundled fonts:** Nunito, IBM Plex Sans, Source Serif 4, JetBrains Mono (latin 400 and 700, OFL,
  ~20 kB each, from Fontsource) for the interface, logging and heading fonts; themes may set any bundled font
  (`THEME_FONTS`). **Exported themes carry an uploaded font:** Save this look keeps a copy of the font file per theme
  (IndexedDB `mine-<id>-<slot>`); Export puts it in the file (`fonts: { ui, log }`, base64); Import checks name, size
  and the font's first bytes (`cleanFontFile`), and picking the theme makes it this device's font file.
- **Wallpaper and icons** (theme-revamp S4, 21 Oct 2026; `wallpaper.js`, unit tests `wallpaper.test.mjs`, e2e
  `wallpaper.mjs`): a **Wallpaper** card on Themes after Colour and light: None / Dots / Grid / Paper lines / Soft
  gradient / Your own photo, and a Dim slider (0-90%, unset = 40% for a photo, none for a pattern). style.css draws
  `html.wall::before` (the picture: `--wall`, from the look CSS for a pattern, set inline by display.js for the photo)
  and `::after` (the page colour at `--wall-dim`); the body turns see-through and cards stay solid. The dim never goes
  under `minDim`: the lowest dim at which ink, muted and accent text on the page reach 4.5:1 on every wallpaper colour
  (32 × 32 samples of a photo, a pattern's strongest colour) with the palette in use now; worked out again on light /
  dark / OLED / colour changes, and the note says when it was raised. The photo is made at most 1600 px (JPEG) and kept
  in IndexedDB `apmes-logbook-wall` on this device only (never in settings files, saved themes or the account); a theme
  or saved theme without a wallpaper keeps it (`keepPhoto`); Reset all clears it (Undo puts it back). Colours from the
  photo: "Use its main colour" (`mainColour`, the hue covering most of it) or tap the photo (`colourAt`) sets the accent,
  so colors.js makes the palettes. App-style details → Icons also has **Icon tint** (`iconTint`, `iconTintStrength`:
  mixed into every icon except the current tab and filled buttons, made readable for light and dark first) and **An
  icon for each tab** (`tabIcon`, names in `TAB_ICONS`). All off by default, per device; themes may set a pattern, the
  dim, the tint and tab icons, never a photo.
- **Sizes** (theme-revamp S2, 21 Oct 2026): Spacing is Normal / Snug (`tight`) / Tight (`compact`, the old Compact mode,
  still drawn by the `body.compact` rules in style.css) / Roomy. (The Display switch "Compact mode (Tight spacing)" went in
  S3: Spacing: Tight is the one place.) The old `compact: true` key is folded to `spacing: 'compact'` wherever it turns up (device, account
  copy, settings file, Your themes; display.js `migrateDisplay`, theme-engine.js `foldCompact`), so nobody's look
  changes. **Fine-tune** card on Themes: eight sliders (`FINE_TUNE`: button height, gaps, line weight, shadow, space
  between cases, space between days, letter spacing, text weight), unset by default, per device, themes may set
  them; their CSS is the `tune` cascade layer (after the theme, before custom CSS). Bigger taps keeps Add tab
  buttons at 44 px or more.
- **App-style details** (owner, 19 Oct 2026; Themes card, `lookCss` in themes.js, CSS only so the first paint has it; unit tests in
  themes.test.mjs, e2e `app-style.mjs`): each its own device key, off by default, part of `THEME_KEYS` (so themes, Your themes and the
  settings file carry them): `barBlur` (see-through header and tab bar), `tabActiveLabel` (label only on the current tab),
  `tabStyle: 'indicator'` (Material icon pill), `listStyle` (`inset` iOS grouped, `edge` edge to edge), `titleAlign: 'centre'`,
  `switchStyle` (`ios`, `material`), `pressStyle` (`highlight`, `none`), `iconWeight` (`thin`, `bold`), `typeStyle` (`ios`, `material`).
  New Inspired themes use them: X-, Spotify-, YouTube-, Gmail-style; Apple-, Pixel-, WhatsApp-, Telegram-, Instagram-, TikTok-, Material-style and the other Inspired ones now use their app's own ground, text and line colours (colours and shapes only).
- **Theme engine** (owner, 19 Oct 2026; `theme-engine.js`, guide [theme-engine.md](theme-engine.md), unit tests
  `theme-engine.test.mjs`, e2e `app-style.mjs`): every App-style detail, spacing and tab style is a facet in `FACETS`
  (key, choices, group, CSS); the Themes page draws "App-style details" from it, `lookCss` adds its CSS, Your themes and
  the settings file keep only listed values, and `checkTheme` (themes.js) refuses unknown keys or values, unreadable
  colours and Inspired names without "-style". Added with it: `statusBar` (header / page: `<meta theme-color>`,
  display.js `paintStatusBar`, cached as `apmes-logbook-statusbar` for the first paint), `headerStyle` (filled / large),
  `tabIconFill`, `iconSet` (`ICON_SETS`: CSS per set and optional per-icon paths, read by ui-core `ic()` and the tab bar
  through `iconPath`; `<html data-icons>`), `pageMotion` (`PAGE_MOTIONS`, app.js `slidePages`; material and fade also
  fade between bar tabs), `sheetStyle` (iOS bottom sheets / Material dialogs, `dialog:not(.full)`), `toastStyle` (iOS
  banner / Material snackbar), `fieldStyle` (ios / filled / outlined), `checkStyle` (round / square; never the settings
  switches). The first-paint look-CSS cache allows 60 KB (index.html). Apple, Pixel, Material, WhatsApp, Gmail and
  Telegram-style use them.
- **Themes never change Light or dark** (owner, 19 Oct 2026): no theme has a `mode`; every theme carries a light and a dark palette (`TINTS`), so it matches its app either way. Picking a theme or one of Your themes leaves the Light or dark setting alone.
- **Inspired themes box** (owner, 19 Oct 2026): the Themes page shows the Inspired themes as cards, only `FEATURED` in themes.js (Apple, Pixel, Evernote, Obsidian, Notion, WhatsApp, Office, ACGME), with no scrolling list. **Browse all themes** (`#themesall`, under Themes) has every theme in a searchable list and **Suggest a theme**. Your themes always has Export (with none saved it saves the look you have now) and Import.
- **Your themes** (owner, 16 Oct 2026; `my-themes.js`, unit-tested; e2e `my-themes.mjs`): once the look is Custom, the
  "Your themes" card says so and offers Save this look under a name (`display().myThemes`, this device, up to 12, a
  name already there is replaced; light or dark is kept with it). Saved looks are picked like any theme ("Now: Night
  shift (yours)"), × deletes with Undo. **Export…** writes `my-logbook-themes.json` (`kind: apmes-logbook-themes`);
  **Import…** adds a file's themes, only known look keys with checked values. The Themes reset leaves them alone; the
  settings file carries them.
- **Top band: only the NUHS theme keeps the NUH stripe; other themes bring their own four colours** (owner, 15 Oct
  2026; an exception to AGENTS.md's four-quarter band, for the logbook only). The Top band setting overrides it: the
  theme's colours (default), shades of my colour, the NUH stripe, or none.
- The CSS for the settings that aren't classes comes from `lookCss` into `<style id="look-css">`, cached as
  `apmes-logbook-look-css` for the first paint. A new look key goes in `THEME_KEYS`, `DISPLAY_KEYS` and settings-file
  `PLAIN`; `themes.test.mjs` round-trips every theme.

- **Reset all settings** (Settings, last card; owner, 15 Oct 2026): this device only, or the account too
  (`settings-file.js` `resetAccountPatch`: your year, profile, saved searches, send and sync places and the app's
  bookkeeping stay; tags and shorthand only when ticked). Saves a settings file first by default; Undo in the toast.

- **Analytics Edit mode** (owner, 15 Oct 2026): Edit above the cards; drag by ⠿ or the arrows, Hide / Show, Reset
  layout, Done. Saved for the account as `settings.anLayout { order, hidden }` (`analytics.js` arrangeCards: cards a
  profile lacks are left out; new cards land in their default place). A new card needs an id in `CARD_NAMES`.

- **Default tab bars** (owner, 15 Oct 2026; `profiles.js` PROFILE_ON / PROFILE_OFF): logbook only Case · Logbook ·
  Totals · More; Basic + Reflections; Advanced + Reflections · Analytics; Personal Case · Logbook · Notes · Reflections ·
  Analytics · More; Faculty / PCs Totals · Admin · More. Devices arranged by hand keep their arrangement.
- **More page:** two groups (More's pages with Settings last; Account and help), privacy and credits as fine print. Its
  Edit mode (per device) drags the tab bar and More's own list (`display().moreOrder`), Pin / Take off (a full bar asks
  which tab it replaces). The drag code is shared: `drag-list.js`.

- **Recover** (More; owner, 15 Oct 2026): one page for Needs attention (unsynced or clashing changes: Retry, Keep mine
  / Keep theirs), Recently deleted (the recycle bin, all devices), Unfinished drafts and Earlier versions (this device),
  each folded with a count. The bin is no longer in Settings; search "recycle" finds it here.
- **Case box height** (this device): the grab bar under the box sets a kept height (`display().boxHeight`; the List
  box, paste a list, has its own bar and `listHeight`, owner 16 Oct 2026; double-tap
  resets); Grow as I type (`boxGrow`, on by default) grows it to two thirds of the screen.
- **Totals Compact** (this device, on by default): initials across the top (`analytics.js` shortNames; a tap names the
  person), short category names, a key under the table; Show targets at the bottom. Excel keeps full names.
- **Select and Bulk edit** (Logbook List and the calendar's day list; log2 9 / 9d): press and hold a row (with
  Accessibility → Press and hold on, the hold opens the row menu, which has Select), or the Select button. A tap then
  ticks a row; the bar at the bottom has Select all (the whole search, not only the rows drawn), Select none, Bulk edit…
  and Done. Bulk edit… (`ui-bulk.js`, the rules in `bulk-change.js`): Change has a row per field, each "Unchanged"
  until chosen (date, initials, case summary replace / add to the end / find and replace with exact capitals, tags
  add / remove / replace, Interesting); Actions has Copy, Share, Send to and Move to the bin for just these. Review
  changes lists the changes, warns when something is replaced, shows up to three before → after; from 20 cases an
  overwriting change's button says how many. Save goes through `updateMany` (a case changed elsewhere keeps that
  version); Undo in the toast puts back only cases nobody has changed since. The old "Tag N cases…" is now "Edit N
  cases…" (Filter → More): every case in the search, selected, into Bulk edit. Not in the grid (it has its own editing).
- **Notes: a bin on each note while selecting** (owner, 16 Oct 2026): press and hold (or Select), then the red bin at a
  note's right moves just that note to the recycle bin (`moveToBin`, Undo in the message); the selection stays. The
  bin icon is `trash` in ui-core.js. e2e: `notes-select.mjs`.
- **Notes: Select and Bulk edit** (log2 9b): the same bar and popup (`ui-bulk.js` bulkDialog; the notes' fields in
  `ui-bulk-notes.js`, the rules in `note-bulk.js`). Change: date (set or clear; a daily note keeps its day, its id is the
  date), title (replace / add in front / find and replace), text (add to the end / find and replace), unlink from the
  case. Actions: Merge into one (a new note, each selected one under its title in date order, the earliest date, the
  case if they all share it; the originals go to the bin, Undo brings them back), Copy, Share, Send to, Download (zip),
  Move to the bin.
- **Reflections: Select and Bulk edit** (log2 9c): the header's Edit is now **Select** (press and hold a row starts it
  too); dragging between headings stays in it. The old Select all / Clear / Mark complete / Delete selected toolbar is
  the shared bar and popup (`ui-bulk-refl.js`, rules in `refl-bulk.js`). Change: heading (a sub-type stays where the
  new heading has it), status (complete only when nothing is missing, as one at a time: the review says what the
  others still need), portfolio export in / out, JR, date. Actions: Copy, Share, Send to (Markdown, as Settings →
  Markdown makes it), Move to the bin. Word export of just these is not built: the portfolio export takes the ticked
  ones (use Portfolio export: in / out).
- **Grid as a spreadsheet** (log2 10): thin cell lines, inputs without boxes; drag a heading's right edge to resize a
  column (`display().gridCols`, this device; ← → on the focused edge too; a double-tap resets it, "Reset column
  widths" resets all); Lines per row 1 / 2 / 3 / Fit to text (`display().gridLines`; the summary is a textarea that
  grows to its text with Fit).
- **Send to presets** (log2 12): Apple Notes through a Shortcut named “Logbook to Notes” (`shortcuts://run-shortcut?
  name=…&input=text&text=…`; setup steps folded on the Send to page), Email (mailto), Telegram (`tg://msg`), Drafts,
  Bear, Things, Day One, besides Obsidian, WhatsApp, UpNote and Other app. Keep, Notion and OneNote take no text from
  a link: the page says to use Share. Each link follows the app's documented format; check them on a real iPhone.
- **Pages** (log2 11; owner's call, 15 Oct): the Logbook List and Grid show 100 cases a page (25 / 50 / 100 / 300 /
  All, this device: `display().pageSize`, unset = 100); "‹ Page 2 of 14 ›" with a list of the pages and each page's
  dates to jump to (`paging.js`, unit-tested); a new search, filter or view goes back to page 1; the Calendar stays
  monthly. Replaces "Show more".
- **Group by and Sort** (log2 14): in the Filter panel while the List shows (so the List looks as before), Group by Month (default) / Day / Week / Residency year / APMES tag
  (a case under each of its tags; the heading has "12 of 20 for the target") / Your tags / Flags (No tag yet,
  ☆ Interesting, Plan for later) / None, and Sort Newest (default) / Oldest / Initials A–Z / Most tags; this device
  (`display().lbGroup` / `lbSort`, unset = the defaults). The default looks exactly as before (Jump on each month);
  any other choice draws headings that fold (tap) and say how many cases, "(continued)" across a page, and "Select
  these N" while selecting. Pure grouping in `lb-group.js` (unit-tested); pages count the rows shown.
- **Search** (log2 9e, first part): a line magnifier (`ic('search')`, never an emoji: it follows the theme; owner,
  16 Oct 2026) in the header on every tab, or / on a computer (not while typing), opens
  `#search` (`ui-search.js`; the engine `global-search.js`, unit-tested). One box over cases (planned ones too),
  reflections and notes (loaded the first time Search opens; offline works on what is on the device). The Logbook's
  search language plus in:, status:, is:interesting / is:planned, has:reflection / has:note, no:tag, linked:yes / no,
  heading:, tag:, diagnosis:; ⓘ lists them and a tap adds one. Results grouped by kind with counts, Best match or
  Newest, the words marked; a tap opens the case (edit page), the reflection (editor) or the note (Done comes back to
  Search); a case found links its reflection and notes. Chips (Cases / Reflections / Notes, Dates, Tag…, Drafts,
  Interesting) add or take out their operator in the box (after: / before: for dates) and light up from what is typed:
  the box is the one source. Saved searches are the Logbook's list (`settings.savedSearches`); one saved on Search has
  `global: true` and the magnifier icon, and runs in Search when tapped on the Logbook. Select ticks results into bulk edit: one
  kind opens its own popup; several kinds share the date (`ui-bulk-mixed.js`), with Copy and Move to the bin.

- **Layout** (Themes): `navStyle` tabs (default) or a left icon-and-label rail above 900 px; smaller windows keep
  the existing `tabBar` placement. `rowLayout` card (default), compact (the older `rowShort` alias), chat (bold
  case, logged-at time when available, grey tags and separators), or timeline (a day spine, retaining the saved sort).
  Choosing a row layout clears the alias; an explicit layout wins over it. `formLayout` page (default) or native
  collapsible Case details and Tags sections, the first open. All three belong to the device and travel with themes
  and settings files; stored cases stay unchanged. X-style chooses chat, Notion-style timeline, Office-style rail.
  Focused checks: `node logbook/test/layouts.test.mjs` and `node logbook/test/e2e/layouts.mjs` (phone/desk, tap,
  menu and selection holds, resizing, keyboard activation, disclosure fields, and accessibility). The standard
  App-style browser suite includes these layout checks.
