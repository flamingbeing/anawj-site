# NUHS style guide

A design guide modelled on [nuhs.edu.sg](https://www.nuhs.edu.sg/), so the NUH tools on this site (roster, logbook, evals) can look at home next to it.

- `index.html`: the visual guide (colours, type, buttons, page patterns). Open it at `/nuhsdesign/`.
- `tokens.css`: CSS variables and `.n-*` component classes. Link it and use the variables, or add `class="n-page"` to `<body>` for the base styles.
- `app.css` and `app.js`: the **app kit**, for the web apps (PWAs): makes them look and behave like native phone apps. See "App kit" below; try it at `/nuhsdesign/app.html` on a phone.

Unofficial. The values were read from the public site's stylesheet (`main.min.css`, Bootstrap 5) and screenshots in October 2026. It copies the look, not the identity: don't use the NUHS logo or name to make a tool look official.

## Character

- **Navy and white.** Navy `#002F6C` carries the heavy parts: side panel, footer, primary buttons. Most of the page is white.
- **Light, large headings.** Open Sans 300 in navy. Size does the work, not weight.
- **Colour as a thin line.** Orange, red, blue and cyan appear as stripes and underlines, rarely as fills. The header has a stripe of four equal quarters (orange, red, blue, navy); quick-action tiles have a 4px coloured bar underneath.
- **Square, flat blocks.** Full-width bands, no rounding, no shadow. Only buttons and inputs get a 5px radius.
- **Two-up feature bands.** Half photo, half soft colour (beige, periwinkle, pale blue) with a centred Light heading and one outline button. The image side alternates.

## Colour

| Token | Hex | Use |
|---|---|---|
| `--n-navy` | `#002F6C` | Headings, primary buttons, dark panels, footer |
| `--n-cyan` | `#00A9E0` | Active tab and menu item, underlines, focus ring on navy. Not for text or focus rings on white |
| `--n-focus` | `#002F6C` | Focus ring on light grounds (3px, 12.9:1 on white) |
| `--n-blue` | `#337AB7` | Links, secondary buttons, section titles on bands |
| `--n-blue-bright` | `#1C8ED7` | Full-width gallery band |
| `--n-orange` | `#E57200` | Brand stripe, first tile bar |
| `--n-red` | `#E4002B` | Brand stripe, alert button |
| `--n-stripe-blue` | `#178FD7` | Third quarter of the brand stripe (not cyan) |
| `--n-hover-light` | `#D7340B` | Link / outline-button hover on light backgrounds |
| `--n-hover-dark` | `#F7941D` | Link / outline-button hover on navy |
| `--n-navy-hover` | `#2C6597` | Primary button hover |
| `--n-ink` | `#333333` | Body text |
| `--n-bg-blue` | `#D5E3EF` | Events band, address strip |
| `--n-bg-beige` | `#E6DBCE` | Feature band |
| `--n-bg-periwinkle` | `#7D8CB3` | Feature band, table headers |
| `--n-bg-grey` | `#EEEEEE` | Copyright strip |

### Contrast (WCAG)

| Pair | Ratio | |
|---|---|---|
| Navy or ink on white | 12.9 / 12.6 | Any text |
| Link blue on white | 4.6 | Body text |
| Orange on navy | 5.7 | Body text |
| Navy on cyan | 4.8 | Body text |
| White on bright blue | 3.6 | 24px+ only |
| White on periwinkle | 3.4 | 24px+ only |
| White on cyan | 2.7 | Don't (the source site does this; use navy on cyan) |

## Type

Open Sans, weights 300 / 400 / 600 / 700, from Google Fonts. Base 16px, line height 1.5.

| Role | Size / weight | Colour |
|---|---|---|
| h1 | 42 / 300 | Navy |
| h2 | 30 / 300 | Navy |
| h3 | 24 / 300 | Navy |
| Section title on a band | 30 / 600 | Link blue |
| h4 | 20 / 600 | Ink |
| h5, h6 | 18, 16 / 600 | Navy |
| Body | 16 / 400 | Ink |
| Small, dates | 14 / 400 (dates 700 in news lists) | |
| Footer labels | 14 / 700 uppercase | Cyan |

## Components (in `tokens.css`)

- `.n-btn` (navy), `--secondary` (link blue), `--alert` (red), `--outline` (the "View More" button: thin border in the band's text colour, 14px text).
- `.n-stripe`: the header bar, four equal quarters: orange, red, blue (`--n-stripe-blue`), navy. Give it four empty children. Apps draw the same four quarters as a 5px band along the top of their header.
- `.n-tile`: line icon + label with a coloured bottom bar. Set `--n-tile` per tile.
- `.n-dark`: navy surface that flips text to white and hover to orange.
- `.n-menu`: large Light menu on navy with a cyan block for `aria-current`.
- `.n-news`: dated list with a ruled heading.
- `.n-card`: image, title, date. No border or shadow.
- `.n-section-head`: title left, outline button right.
- `.n-tabs`, `.n-input`, `.n-alert`.
- Bands: `.n-band-blue`, `.n-band-beige`, `.n-band-periwinkle`, `.n-band-bright`.

## Layout and detail

- Container 1320px max, 16px side padding on phones. Breakpoints 576 / 768 / 992 / 1200 / 1400; the main menu collapses below 992.
- Gutter 1.5rem; 2.5 to 3rem between big blocks.
- Radius: 5px buttons and inputs, 3px badges, 0 everywhere else. Shadows almost never; `2px 4px 6px #e9e9e9` when a card needs lift.
- Icons: thin outline icons for tiles; Font Awesome 5 solid for small UI.
- Photos: real staff in navy scrubs or lab coats, bright clinical rooms. Report covers on soft blue-purple gradients.
- Voice: plain, warm, institutional. Title case in menus and headings.
- Keep a visible focus ring: 3px `--n-focus` (navy) on light grounds, cyan on navy. Cyan on white is only 2.7:1, under the 3:1 a focus ring needs. The source site mostly relies on browser defaults.

## App kit (web apps)

The website look above suits pages. The apps (evals, prewarm, hand log, people, roster…) are installed to the home
screen, so they use the app kit instead: on a phone they should be hard to tell from a native app. It grew out of the
logbook (the most polished app) and is shown working in `app.html` (open it on a phone; Theme switches light / dark).

```html
<link rel="stylesheet" href="../nuhsdesign/tokens.css">
<link rel="stylesheet" href="../nuhsdesign/app.css">
<script src="../nuhsdesign/app.js" defer></script>
<body class="a-app">
```

Add both files to the app's `sw.js` SHELL list so the app works offline.

**What makes it feel native**

- **The phone's own font** (SF Pro on iPhone, Roboto on Android) at 17px; the NUHS colours and the four-quarter band
  carry the brand. Inputs are at least 16px so iPhones don't zoom in on them.
- **App bar** (`.a-bar`): translucent, blurred, the four-quarter band on top, safe-area aware (notch, home bar). A
  **large title** (`.a-title`) starts each screen; the small centred title fades in once it scrolls under the bar.
- **Tab bar** (`.a-tabbar`): bottom on phones (icons and short labels, tint colour for the selected one, red count
  badges), a centred strip under the bar on tablets and laptops. Three to five tabs.
- **Inset grouped lists** (`.a-list`, `.a-row`): white rounded groups on the grey background, hairlines inset from the
  left, chevrons for rows that open something, section captions above (`.a-section`) and notes below
  (`.a-footnote`). Most screens are lists; use cards (`.a-card`) only for free text.
- **Buttons**: filled (`.a-btn`, one main action per screen), tinted (`--tinted`), plain text (`--plain`), destructive
  (`--danger`). 50px tall, rounded, they shrink slightly when pressed. No hover effects on touch screens.
- **Controls**: segmented control (`.a-seg`) for 2 to 4 views of the same thing, switches (`.a-switch`) for on/off
  settings (not checkboxes), checkmark rows (`.a-check`) to pick from a list, chips (`.a-chip`) for filters and quick
  picks, search field (`.a-search`).
- **Bottom sheets** (`<dialog class="a-sheet">`, `aSheet.open()`): slide up from the bottom, drag down or tap outside to
  close, header with Cancel / title / Done. Use them instead of new pages for short tasks (pick, add, confirm).
  Centred cards on wide screens. **Alerts** (`.a-alert`) for a yes/no question; **toasts** (`aToast()`) to confirm an
  action, with Undo where it can be undone.
- **Motion**: screens slide in from the right and back out (`aGo()`), sheets slide up; all of it switched off when the
  phone asks for reduced motion.
- **No web-page habits**: no tap flash, no text selection or long-press menu on buttons, no double-tap zoom, no
  pull-to-refresh, focus rings only for keyboards (navy, 3px).
- **Computers and big tablets** (1000px and wider): the same markup becomes a desktop app, like Mail or Settings on a
  Mac. The tab bar turns into a sidebar on the left, the content gets a wider column, buttons keep their natural
  width, and rows and buttons react to the mouse (hover, pointer cursor, copyable text). Tablets (700 to 999px) get the
  tabs as a strip under the bar. Use `.a-main--wide` for screens that need the full width (tables, the roster grid)
  and `.a-split` (`.a-split-list` + `.a-split-detail`, `data-show="detail"` on phones) to show a list and the open item
  side by side on a computer while phones open the item as its own screen (`app.html`, Requests).
- **Check for sideways scroll with a wide font**: CI's browser uses a wider fallback font (DejaVu) than a phone, so a
  row that fits on a phone can overflow in CI. Before merging an app, check 320 and 390px with a forced wide font
  (the NUH roster date bar and Practice tools were caught this way). Give flex children `min-width: 0`.
- **Dark mode**: add `data-theme="auto"` on `<html>` to follow the phone, once the app's own colours have been checked
  in dark. Light only until then.

**Page setup for an installed app** (as the logbook does): `viewport-fit=cover`, `theme-color` matching the bar
(`#f9f9fb` light), `apple-mobile-web-app-capable`, an `apple-touch-icon`, and a manifest with `"display": "standalone"`,
`background_color` `#f2f2f7` and a maskable icon. Show browser-only hints (install, "open in Chrome") with
`.a-browser-only` so they disappear once installed.

**Don't**: put more than one filled button on a screen, use hover for anything important, use web-style underlined
links for actions (use rows or buttons), put long forms on one screen (split them, or use sheets), or invent new colours
(the tint is NUHS navy; status colours are `--a-ok`, `--a-warn`, `--a-danger`).

The logbook keeps its own styles (owner, 15 Oct 2026); the kit is for the other apps.
