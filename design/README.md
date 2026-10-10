# NUHS style guide

A design guide modelled on [nuhs.edu.sg](https://www.nuhs.edu.sg/), so the NUH tools on this site (roster, logbook, evals) can look at home next to it.

- `index.html`: the visual guide (colours, type, buttons, page patterns). Open it at `/design/`.
- `tokens.css`: CSS variables and `.n-*` component classes. Link it and use the variables, or add `class="n-page"` to `<body>` for the base styles.

Unofficial. The values were read from the public site's stylesheet (`main.min.css`, Bootstrap 5) and screenshots in October 2026. It copies the look, not the identity: don't use the NUHS logo or name to make a tool look official.

## Character

- **Navy and white.** Navy `#002F6C` carries the heavy parts: side panel, footer, primary buttons. Most of the page is white.
- **Light, large headings.** Open Sans 300 in navy. Size does the work, not weight.
- **Colour as a thin line.** Orange, red and cyan appear as stripes and underlines, rarely as fills. The header has an orange / red / navy stripe; quick-action tiles have a 4px coloured bar underneath.
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
- `.n-stripe`: the orange / red / navy header bar (1 : 1 : 2).
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
