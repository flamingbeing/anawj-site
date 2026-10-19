# Logbook theme engine: how to write a theme

Part of the logbook working notes; index in [../NOTES.md](../NOTES.md). The engine is `js/theme-engine.js` (facets,
icon sets, page motion); the themes are `js/themes.js` (`THEMES`, `TINTS`, `checkTheme`). Owner, 19 Oct 2026.

## What a theme is

```js
{ id: 'whatsapp', name: 'WhatsApp-style', group: 'inspired', desc: 'One short line (≤ 90 characters)',
  look: { /* any THEME_KEYS: the settings below */ }, band: ['#rrggbb', '#rrggbb', '#rrggbb', '#rrggbb'] /* optional */ }
```

Picking a theme sets every key in `THEME_KEYS`: the ones in `look` to its values, the rest back to their defaults.
A theme **never** sets light or dark (no `mode`): give it both palettes and it matches its app either way.

### The settings a theme can use

- **Colours:** `accent` (one hex; colors.js works out readable light, dark and OLED shades), `bgTint` (a key of
  `TINTS`) and `colours: { light: {…}, dark: {…} }`, which overrides any of `bg`, `panel`, `ink`, `muted`, `line`,
  `accent`, `accentInk`, `ok`, `warn`, `err` (#rrggbb). Prefer `colours` for a new app's own ground, cards, text and
  lines; add a `TINTS` entry only when the Background menu should offer it too. `colourful`, `contrast`.
- **Shape and type:** `round` (0 square, 1 slight, 3 very round; leave out for normal), `borders` (0–3 line strength),
  `flat`, `shadows: false` (outlined cards), `btnStyle` (outlined / filled / tinted / plain), `compact`,
  `fontUi`, `fontLog` (system, inter, lexend, atkinson, serif, mono; never a paid or bundled brand font), `headFont`,
  `lineHeight`, `band` ('none', 'shades', 'nuh'; or give the theme its own four `band` colours).
- **Layout:** `navStyle` (tabs / rail), `rowLayout` (card / compact / chat / timeline), `formLayout` (page / sections),
  `tabIcons` (icons only), `pageTitles`, `calPlain`, `iconBtns`.
- **Facets** (theme-engine.js `FACETS`; each off by default; the value must be one of its choices):

| Key | Choices | What it changes |
|---|---|---|
| `spacing` | tight, roomy | card padding, row height |
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

## Icon sets

`ICON_SETS[set].css` restyles every icon; `paths` can redraw single icons by name, in the 24 × 24 stroked style
(names: `ICON_PATHS` in ui-core.js and `ICONS` in app.js). An icon a set doesn't draw keeps the default. Draw your own
paths in the app's style; never copy an icon font's or a company's artwork.

## Rules for Inspired themes (checked by `checkTheme`, run over every theme in test/theme-engine.test.mjs)

- The name is "<App>-style"; colours, shapes, motion and type only: **no logos, artwork, slogans or bundled brand
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
Defaults must stay pixel-identical: `test/e2e/app-style.mjs` checks that all off draws the page as before.

## Inspired catalogue

The catalogue has 67 Inspired looks: the original 17 and 50 additional apps. `FEATURED` stays at eight; additions
appear in Browse all themes. Each look owns a complete light and dark palette, uses system font stacks, and resets
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

`test/themes.test.mjs` checks all 50 names, palette completeness and contrast (including OLED), sanitisation and
export/import for every Inspired look. `test/e2e/inspired-themes.mjs` renders all 67 in light and dark at 390 px,
checks effective tokens, system tab paths, neutral chrome, phone overflow, persistence and reset. Set `E2E_OUT` to
save representative viewport screenshots. The original app-style suite checks that defaults stay pixel-identical.

## Checks

`node logbook/test/theme-engine.test.mjs`, `node logbook/test/themes.test.mjs`, `node logbook/test/e2e/app-style.mjs`
(also runs `layouts.mjs`), `node logbook/test/e2e/my-themes.mjs`, and `node logbook/test/e2e/a11y.mjs` after UI changes.
Catalogue browser coverage: `node logbook/test/e2e/inspired-themes.mjs`.
