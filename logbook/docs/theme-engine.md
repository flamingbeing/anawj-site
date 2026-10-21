# Logbook theme engine: how to write a theme

Part of the logbook working notes; index in [../NOTES.md](../NOTES.md). The engine is `js/theme-engine.js` (facets,
icon sets, page motion); the themes are `js/themes.js` (`THEMES`, `checkTheme`); what each look setting may hold is
`js/look-schema.js` (`LOOK`, `cleanLook`, `TINTS` and the other lists). Owner, 19 Oct 2026.

## What a theme is

```js
{ id: 'whatsapp', name: 'WhatsApp', group: 'inspired', desc: 'One short line (≤ 90 characters)',
  look: { /* any THEME_KEYS: the settings below */ }, band: ['#rrggbb', '#rrggbb', '#rrggbb', '#rrggbb'] /* optional */ }
```

Picking a theme sets every key in `THEME_KEYS`: the ones in `look` to its values, the rest back to their defaults,
apart from the groups the device keeps (Themes → Keep when changing theme, `look-schema.js` `KEEP_GROUPS`: wallpaper
and layout unless switched off, fonts and text when switched on). So a theme's `rowLayout`, `navStyle` or wallpaper
only shows on a device that has switched that group off; don't rely on them for a theme's character.
A theme **never** sets light or dark (no `mode`): give it both palettes and it matches its app either way.

**One list of allowed values** (`look-schema.js` `LOOK`, owner 21 Oct 2026): every setting's kind and values. A new look
setting gets an entry there (and its key in `display.js` `DISPLAY_KEYS`); `checkTheme`, saved themes and themes files
(`lookOf`), settings files and theme links all check against it. A value the Themes page can't show is refused.

### The settings a theme can use

- **Colours:** `accent` (one hex; colors.js works out readable light, dark and OLED shades), `bgTint` (a key of
  `TINTS`) and `colours: { light: {…}, dark: {…} }`, which overrides any of `bg`, `panel`, `ink`, `muted`, `line`,
  `accent`, `accentInk`, `ok`, `warn`, `err` (#rrggbb), and the roles `fill`, `onFill` (filled buttons and their words),
  `link`, `focus` (the keyboard ring, 3:1) and `selection` (selected text), which follow the accent until set. All of
  it is resolved into one palette per appearance by `colors.js resolvePalette` (NUHS's or the accent's, then the tint,
  then `colours`; the soft accent, chips and info colours are made again from the final accent and card), used for the
  CSS, the contrast checks, previews and the status bar. NUHS is its written-out `NUHS` palette. Prefer `colours` for a new app's own ground, cards, text and
  lines; add a `TINTS` entry only when the Background menu should offer it too. `colourful`, `contrast`.
- **Shape and type:** `round` (0 square, 1 slight, 3 very round; leave out for normal), `borders` (0–3 line strength),
  `flat`, `shadows: false` (outlined cards), `btnStyle` (outlined / filled / tinted / plain), `compact`,
  `fontUi`, `fontLog` (system, inter, lexend, atkinson, serif, mono; never a paid or bundled brand font), `headFont`,
  `lineHeight`, `band` ('none', 'shades', 'nuh'; or give the theme its own four `band` colours).
- **Layout:** `navStyle` (tabs / rail), `rowLayout` (card / compact / chat / timeline), `formLayout` (page / sections),
  `tabIcons` (icons only), `pageTitles`, `calPlain`, `iconBtns`.
- **Fine-tune** (theme-engine.js `FINE_TUNE`; numbers, unset by default, in range and on the step or the theme is refused):
  `ftBtn` button height 32-56 px, `ftGap` gaps 2-16 px, `ftLine` line weight 0-3 px, `ftShadow` card shadow 0-4,
  `ftCases` space between cases 0-20 px, `ftDays` space between days 0-32 px, `ftLetter` letter spacing -0.03 to 0.08 em,
  `ftWeight` text weight 300-600. Their CSS sits in the `tune` layer, after the theme and before custom CSS.
- **Wallpaper and icons** (theme-revamp S4): `wallpaper` (a pattern: dots, grid, paper, gradient; never `photo`, which
  stays on its device), `wallDim` (0-90 in steps of 5), `iconTint` (#rrggbb; made readable for light and dark),
  `iconTintStrength` (10-100 in steps of 10), `tabIcon` (`{ tabId: name }`, names from `TAB_ICONS`, keys sorted). The
  app raises the dim by itself if a pattern would bring text on the page under 4.5:1 with the theme's colours.
- **Fonts** (theme-revamp S5): `fontUi`, `fontLog` (or `same`) and `headFont` must be bundled (`THEME_FONTS`,
  `HEAD_FONTS`): never `file` or `named`, which stay on their device. Theme links (`#t=`) go through
  `checkTheme` and lose any setting it rejects.
- **Theme links, format 2** (my-themes.js `themeLink`; owner, 21 Oct 2026): a bundled theme unchanged is its id; any
  other look is written out in full, each setting by its place in `LINK_KEYS` and its value by its place in that
  setting's list (`look-schema.js`), its step from the lowest, or a colour. Nothing depends on the bundled themes'
  current looks, so editing or adding themes never breaks a link. **`LINK_KEYS` and every list only grow at the end**
  (a new setting, choice, tint, font or pattern goes last; never reorder or remove), and an int's lowest value and step
  stay; `test/fixtures/theme-links.json` holds them and some links, and the test fails otherwise. A bundled theme is
  ~40 characters with the address, a fully custom one ~180. Format 1 links ask for a new one.
- **Facets** (theme-engine.js `FACETS`; each off by default; the value must be one of its choices):

| Key | Choices | What it changes |
|---|---|---|
| `spacing` | tight (Snug), compact (Tight: the old Compact mode), roomy | card padding, row height; the old `compact: true` is folded to `spacing: 'compact'` |
| `tabStyle` | pill, plain, indicator | how the current tab is marked |
| `statusBar` | header, page | the phone's status bar colour (Android, browsers) |
| `headerStyle` | filled, large | a header filled with the accent (Android apps) or an iOS large title |
| `barBlur` | true | see-through header and bottom bar |
| `titleAlign` | centre | centred header title |
| `tabActiveLabel` | true | only the current tab keeps its label |
| `tabIconFill` | true | the current tab's icon is filled |
| `tabTone` | ink | neutral active tabs instead of accent-coloured tabs |
| `listStyle` | inset, edge | iOS inset grouped, or edge-to-edge lists |
| `typeStyle` | ios, material | title weight and letter spacing |
| `headingTone` | ink | neutral headings; filled headers keep their contrasting title |
| `iconSet` | sharp, soft, ios, material | how icons are drawn (see Icon sets) |
| `iconWeight` | thin, bold | icon line weight |
| `pageMotion` | ios, material, fade, none | moving between pages (and between tabs for material, fade) |
| `sheetStyle` | ios, material | pop-ups: iOS bottom sheets with stacked text buttons, or Material dialogs |
| `toastStyle` | ios, material | messages: frosted iOS banner at the top, or a Material snackbar at the bottom |
| `fieldStyle` | ios, filled, outlined | text boxes |
| `checkStyle` | round, square | tick boxes |
| `switchStyle` | ios, material | on / off switches |
| `pressStyle` | highlight, none | what a press looks like |

## Cascade layers (owner, 20 Oct 2026)

`index.html` sets the order `@layer base, facets, theme, custom` and imports `style.css` into `base`. A later layer
wins whatever the selectors, so **never repeat `:root`** to win; plain selectors are enough.

| Layer | What | Written by |
|---|---|---|
| `base` | `style.css` (today's look) | index.html |
| `base` (again) | most facets and band "none", after style.css: they compete with it by specificity as before, so the app's own special cases (the bold reflection tick, the Display preview) stay | `facetCss`, `lookCss` |
| `facets` | facets with `wins: true` (header style, see-through bars, tab tone, heading tone, pop-ups, text boxes), each in its own sub-layer in `FACETS` order (a later one wins) | `facetCss` |
| `theme` | the resolved palette (accent or NUHS, tint, `colours`, roles), then band colours, heading font | `paletteCss` (display.js `applyPalette`), `lookCss`, tab colours |
| `custom` | the resident's custom CSS | display.js `applyCustomCss` |

High contrast (`html.hc`) uses `!important` in `base` so it still wins over a theme's colours. Browsers without layers
(before Safari 15.4, Chrome 99, Firefox 97) get `style.css` as a plain sheet and ignore the layered sheets: the
default look, still usable. The first-paint caches are `apmes-logbook-accent-css-v2` and `-look-css-v2`.

## Icon sets

`ICON_SETS[set].css` restyles every icon; `paths` can redraw single icons by name, in the 24 × 24 stroked style
(names: `ICON_PATHS` in ui-core.js and `ICONS` in app.js). An icon a set doesn't draw keeps the default. Draw your own
paths in the app's style; never copy an icon font's or a company's artwork.

## Rules for Inspired themes (checked by `checkTheme`, run over every theme in test/theme-engine.test.mjs)

- Names omit the “-style” suffix; colours, shapes, motion and type only: **no logos, artwork, slogans or bundled brand
  fonts** (system font stacks are fine). No celebrity themes.
- Text stays readable: ink and muted on bg and panel, and accentInk on accent, at 4.5:1 in light and dark
  (`checkColours`); the tests refuse a theme that fails.
- Only known keys and listed values. A new kind of look is a new facet in theme-engine.js (with its CSS, the tests and
  this table), never CSS inside a theme.
- New themes go in Browse all themes; only `FEATURED` ones show on the Themes page.

## A new facet

Add it to `FACETS` (key, group, label, choices with the default first, CSS per choice, or `js: true` and the code
that reads it), add its key to `DISPLAY_KEYS` in display.js (a literal list: the settings-file test reads it), and
to this table. The Themes page, Your themes, the settings file and the first-paint cache pick it up from the list.
Its CSS competes with style.css by specificity; give it `wins: true` (facets layer) only if it must beat all of style.css. Never repeat `:root`. Defaults must stay pixel-identical: `test/e2e/app-style.mjs` checks that all off draws the page as before.

## Inspired catalogue

The catalogue has 92 Inspired looks: the original 67 plus 25 visual traditions. See [the catalogue review](theme-catalogue-review.md) for the inventory, references, changes and limitations. `FEATURED` stays at eight; additions
appear in Browse all themes. Each look owns a complete light and dark palette, uses system or bundled open font stacks, and resets
unused facets through `themePatch` (off/default values are omitted). Pixel now has a fixed lavender Material You
reference palette, rather than keeping a previous accent behind its own colour overrides.

These are interpretations of app interfaces, not official skins or copies of app screens. The common Logbook content
and controls stay the same. Platform and app versions differ; the palette and facet choices target recognisable
mobile surfaces, with desktop rails where appropriate. Light appearances for primarily dark media services are
readable adaptations of the same palette. No logos, source artwork, brand typefaces or promotional copy are included.
Secondary text is adjusted only as needed for 4.5:1 on both surfaces; button text uses white or black for contrast.

`headingTone` and `tabTone` fill two specific gaps: most apps use neutral headings, and social/media apps often keep
the selected tab neutral even when actions use a bright colour. Both default to the existing accent treatment. A
filled header still uses `accentInk`. The edge list facet also accounts for compact mode's smaller page gutters.

Reference systems checked for role and platform conventions (20 Oct 2026):

- [Apple dark appearance](https://developer.apple.com/design/human-interface-guidelines/dark-mode)
- [Material colour roles](https://m3.material.io/styles/color/roles)
- [Atlassian colour and themes](https://atlassian.design/foundations/color)
- [GitHub Primer colour primitives](https://primer.style/product/primitives/color/)
- [LINE messenger colour guide](https://designsystem.line.me/LDSM/foundation/color/line-color-guide-ex-en)
- [Discord colour reference](https://discord.com/branding)

`test/themes.test.mjs` checks the original names and all 25 additions, palette completeness and contrast (including OLED), sanitisation and
export/import for every Inspired look. `test/e2e/inspired-themes.mjs` renders all 92 in light and dark at 390 px,
checks effective tokens, system tab paths, neutral chrome, phone overflow, persistence and reset. Set `E2E_OUT` to
save representative viewport screenshots. The original app-style suite checks that defaults stay pixel-identical.

## Checks

`node logbook/test/theme-engine.test.mjs`, `node logbook/test/themes.test.mjs`, `node logbook/test/e2e/app-style.mjs`
(also runs `layouts.mjs`), `node logbook/test/e2e/my-themes.mjs`, and `node logbook/test/e2e/a11y.mjs` after UI changes.
Catalogue browser coverage: `node logbook/test/e2e/inspired-themes.mjs` and `node logbook/test/e2e/theme-catalogue.mjs` (Add/List, dialogs, toasts, desktop/phone, picker reloads and a 320px regression).

## Engine follow-up

Observed engine limits, reproducible cases, priorities and acceptance criteria for the next session: [theme-engine-follow-up.md](theme-engine-follow-up.md).
