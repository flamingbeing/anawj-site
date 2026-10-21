# Theme catalogue refresh

## Scope and inventory

The application is a static site; there is no package install or compiled application build. The Logbook owns its theme system independently of the shared app kit. Definitions: [themes.js](../js/themes.js). Engine controls: [theme-engine.js](../js/theme-engine.js). Picker: [ui-settings.js](../js/ui-settings.js), Settings → Themes → Browse all themes. Display persistence and first-paint CSS: display.js; saved looks, export/import and links: my-themes.js.

Before: 75 themes (8 Classic, 67 Inspired). After: 100 (8 Classic, 92 Inspired), exactly 25 additions. All original IDs, eight Classic definitions, FEATURED IDs, storage keys, default CSS, shared styles and application logic remain unchanged. Display names and background tint labels lose the “-style” suffix. Inspired now includes visual traditions as well as apps and brands; additions appear in the existing searchable picker without expanding the eight featured cards.

Available controls include separate light/dark palettes; system and bundled open fonts; neutral or accent headings/tabs; square through round corners; border strength, shadow, spacing and button treatments; rail/tab navigation; card/compact/chat/timeline lists; form sections; header, field, checkbox, switch, dialog and toast facets; icon geometry; page motion; numeric fine tuning; and four safe wallpaper patterns. No new engine facet or arbitrary theme CSS was introduced.

The prior collection already covered mobile platforms, messaging, social feeds, productivity, media and fitness. Underrepresented areas were editorial and print typography, geometric graphic design, technical instruments, accessible monochrome, retro computing, heritage and organic surfaces. The additions combine geometry, fonts, density and surfaces rather than merely recolouring one template.

## References and assumptions

Reference access checked 21 October 2026. Successfully retrieved official pages:

- [WhatsApp](https://www.whatsapp.com/): modern neutral chrome, green actions and soft conversation shapes.
- [Gmail](https://workspace.google.com/products/gmail/): pale blue workspace and blue Material actions rather than logo-red controls.
- [Spotify](https://www.spotify.com/us/premium/): black/charcoal hierarchy, strong headings and green actions.
- [Duolingo design site](https://blog.duolingo.com/hub/design/): the requested colour-guide URL redirects to its design blog. The green identity and substantial rounded controls remain conservative assumptions from the prior catalogue, not a verified current guideline.

Obsidian follows the supplied mobile screenshots: pale grey page, white rounded groups, violet controls, quiet rules and neutral navigation. [Obsidian mobile](https://obsidian.md/mobile), [Notion](https://www.notion.com/product), [Discord branding](https://discord.com/branding) and [ACGME](https://www.acgme.org/) returned HTTP 403; [Starbucks colour](https://creative.starbucks.com/color/) returned 503. For those and the other apps, existing catalogue palettes and familiar platform conventions are conservative assumptions, not verified latest-version screenshots. The new visual traditions are interpretations, not branded replicas. Developer palette themes adapt their familiar dark colours to readable light surfaces too.

No logos, artwork, slogans or proprietary fonts are included. There is no claim of an exact match to any current app release. Prior design-system references remain in [theme-engine.md](theme-engine.md).

## Existing inspired themes

All 67 retain IDs and gain more deliberate geometry/density. In both appearances, body and secondary text and filled-button labels pass 4.5:1; action text now also passes 4.5:1 on page and panel. Bright brand accents are darkened/lightened only where the shared text/button colour requires it.

The table lists settings changed beyond names and palette contrast. An omitted edge-list facet means the engine’s regular cards, allowing rounded or raised surfaces to work.

| Theme | Main changes |
| --- | --- |
| Obsidian | listStyle: inset; typeStyle: default; fieldStyle: ios; round: 3; spacing: default; titleAlign: centre; ftCases: 12; ftGap: 10; ftLine: 0.5; iconWeight: thin |
| Bear | ftCases: 14; ftDays: 20; ftGap: 10 |
| Evernote | listStyle: default; round: 3; rowLayout: card; ftCases: 12; ftGap: 10 |
| Notion | checkStyle: square; rowLayout: compact; navStyle: rail; titleAlign: default; ftCases: 8; ftLine: 0.5 |
| Telegram | ftCases: 12; ftGap: 8; ftLine: 0.5 |
| Office | round: 1; ftBtn: 40; ftCases: 7; ftGap: 6; formLayout: sections |
| WhatsApp | headerStyle: default; ftCases: 12; ftGap: 10 |
| Pixel | listStyle: default; ftBtn: 48; ftGap: 12; ftLine: 0; formLayout: sections |
| Apple | round: 3; ftBtn: 48; ftCases: 12; ftLine: 0.5 |
| Material | listStyle: default; ftShadow: 2; ftBtn: 48; ftGap: 8 |
| Instagram | ftCases: 12; ftLine: 0.5 |
| ACGME | ftLine: 1.5; ftGap: 8; ftBtn: 44; formLayout: sections |
| X | ftCases: 14; ftLine: 0.5 |
| Spotify | round: 1; ftBtn: 48; ftGap: 12; ftCases: 16; headerStyle: large |
| YouTube | listStyle: default; rowLayout: card; ftBtn: 44; ftCases: 14; ftLine: 0 |
| Gmail | fieldStyle: filled; ftBtn: 48; ftCases: 12; ftLine: 0 |
| TikTok | round: 1; ftCases: 14; ftLine: 0.5 |
| Facebook | listStyle: default; round: 1; ftShadow: 1; ftCases: 12; ftGap: 8 |
| Messenger | ftCases: 14; ftBtn: 48; ftLine: 0 |
| Threads | ftCases: 16; ftLine: 0.5 |
| LinkedIn | listStyle: default; ftCases: 12; ftLine: 1; ftBtn: 44 |
| Reddit | listStyle: default; round: 3; ftCases: 12; ftLine: 0.5 |
| Discord | ftCases: 6; ftGap: 6; ftBtn: 40 |
| Slack | headerStyle: filled; ftCases: 6; ftGap: 6; ftLine: 0.5 |
| Microsoft Teams | listStyle: default; ftCases: 8; ftGap: 8; ftBtn: 40; formLayout: sections |
| Zoom | ftBtn: 48; ftCases: 14; ftShadow: 1 |
| Signal | ftCases: 14; ftBtn: 48; ftLine: 0 |
| LINE | ftCases: 14; ftGap: 10; ftLine: 0.5 |
| WeChat | round: 0; ftCases: 12; ftLine: 0.5 |
| Snapchat | listStyle: default; ftBtn: 48; ftWeight: 500; ftLine: 0 |
| Pinterest | ftBtn: 48; ftCases: 16; ftGap: 12; ftLine: 0 |
| Tumblr | listStyle: default; round: 1; ftCases: 14; ftShadow: 1 |
| Netflix | ftBtn: 48; ftGap: 12; ftCases: 16; headerStyle: large |
| Disney+ | ftBtn: 48; ftCases: 16; ftGap: 12; ftShadow: 2 |
| Prime Video | ftBtn: 48; ftCases: 14; ftGap: 10 |
| Apple Music | ftBtn: 48; ftCases: 14; ftLine: 0.5 |
| SoundCloud | listStyle: default; ftCases: 10; ftGap: 8; ftLine: 0 |
| Duolingo | listStyle: default; ftBtn: 52; ftLine: 2; ftGap: 12; ftWeight: 500 |
| Airbnb | ftBtn: 48; ftCases: 16; ftGap: 12; ftShadow: 1 |
| Uber | ftBtn: 52; ftWeight: 500; ftCases: 14; ftLine: 0 |
| Grab | ftBtn: 48; ftCases: 12; ftGap: 10; ftLine: 0 |
| Google Maps | listStyle: default; ftBtn: 48; ftShadow: 2; ftGap: 10 |
| Google Calendar | ftBtn: 44; ftCases: 8; ftLine: 0.5; ftGap: 8 |
| Google Keep | ftLine: 1; ftShadow: 1; ftGap: 12 |
| Google Drive | ftBtn: 48; ftCases: 12; ftLine: 0 |
| Dropbox | ftBtn: 44; ftLine: 1; ftCases: 10; formLayout: sections |
| Trello | ftCases: 8; ftGap: 8; ftShadow: 1; ftBtn: 40 |
| Asana | ftCases: 10; ftLine: 0.5; ftGap: 10; ftBtn: 44 |
| Todoist | ftCases: 10; ftLine: 0.5; ftGap: 8 |
| Things | ftCases: 14; ftDays: 24; ftLine: 0.5; ftBtn: 44 |
| Craft | ftCases: 16; ftDays: 24; ftShadow: 1; ftGap: 12 |
| OneNote | ftCases: 8; ftGap: 6; ftBtn: 40; formLayout: sections |
| Outlook | ftCases: 10; ftLine: 0.5; ftBtn: 44; formLayout: sections |
| Apple Notes | ftCases: 14; ftDays: 20; ftLine: 0.5; ftGap: 10 |
| Apple Health | ftCases: 14; ftGap: 12; ftLine: 0; ftBtn: 48 |
| Strava | ftCases: 14; ftGap: 10; ftLine: 0.5 |
| Nike Run Club | ftWeight: 500; ftBtn: 52; ftCases: 16; ftLine: 0 |
| Headspace | ftBtn: 52; ftGap: 14; ftCases: 16; ftLine: 0 |
| Calm | ftBtn: 48; ftCases: 16; ftGap: 14; wallpaper: gradient; wallDim: 50; ftLine: 0 |
| Medium | ftCases: 16; ftDays: 24; ftLine: 0.5; ftGap: 12 |
| Substack | ftCases: 16; ftDays: 24; ftLine: 0.5; ftGap: 10 |
| Kindle | pageMotion: none; ftCases: 18; ftDays: 24; ftLine: 0.5 |
| GitHub | listStyle: default; ftCases: 8; ftGap: 6; ftLine: 1; ftBtn: 40; formLayout: sections |
| Figma | ftCases: 6; ftGap: 4; ftLine: 0.5; ftBtn: 40; formLayout: sections |
| Canva | ftBtn: 48; ftGap: 12; ftCases: 14; ftShadow: 1 |
| Shopee | ftCases: 8; ftGap: 6; ftBtn: 44; ftLine: 0 |
| Starbucks | ftBtn: 48; ftCases: 16; ftGap: 12; ftShadow: 1 |

## Exactly 25 new themes

| Theme | Inspiration and distinguishing treatment |
| --- | --- |
| Swiss Grid | Swiss typography: red, white, precise black rules and compact sans |
| Bauhaus | Primary geometry: cream, cobalt, colour bands and bold rounded controls |
| Brutalist | Raw web graphics: acid yellow, monospaced type and heavy square frames |
| Letterpress | Printed stationery: warm paper, book serifs and fine brown outlines |
| Broadsheet | Newspaper columns: black ink, serif headlines and tightly ruled lists |
| Terminal | Phosphor console: green monochrome, square fields and motionless mono text |
| Blueprint | Technical drawings: blue grid, monospaced labels and precise outlines |
| Field Notes | Survey notebook: olive tools, dotted parchment and practical sans labels |
| Art Deco | Architectural elegance: gold rules, ivory panels and formal serif titles |
| Memphis | Playful eighties graphics: blush dots, pink ink and bold rounded panels |
| Y2K | Early digital optimism: ice-blue sheen, lilac controls and rounded mono titles |
| Solarized | Solarized reading workspace: balanced sand, blue-green ink and flat mono lists |
| Nord | Arctic workspace: frost-blue actions, cool layers and airy soft panels |
| Dracula | Gothic code lounge: violet panels, pink actions and rounded mono cards |
| Gruvbox | Earthy retro workspace: warm ochre, stout rules and bookish headings |
| Synthwave | Neon studio: violet night, cyan controls and glowing gradient atmosphere |
| Rosé Pine | Quiet rose-tinted reading: warm neutrals, muted mauve and flowing serif text |
| Tokyo Night | Night-city workstation: blue-violet tools, dense rails and crisp code text |
| E Ink | Reflective display: pure monochrome, clear type and large motionless controls |
| Riso | Two-ink print: cream stock, vermilion tools and sturdy navy outlines |
| Candy Shop | Confectionery counter: cream-pink layers, rounded type and buoyant cards |
| Botanical | Herbarium pages: forest green, pale linen and spacious book typography |
| Terracotta | Mediterranean ceramics: sand, rust, softly edged panels and serif titles |
| Marine Instrument | Bridge instruments: navy, amber signals and strong monospaced readouts |
| Museum | Gallery catalogue: ivory space, charcoal tools and elegant serif headings |

## Engine limits and compatibility

- The engine uses one accent for text links, filled controls and selection treatments. Very bright brand colours cannot simultaneously be vivid fills and readable text on white; these themes use the closest hue that passes contrast. A separate link/accent role would require an engine change outside this task.
- The neutral press-highlight facet changes filled-button backgrounds without changing labels. Inspired themes use the supported stable press treatment instead; 184 rendered pressed-button/keyboard-hint checks pass.
- The timeline layout overflowed at 320px with Terracotta; it uses the closest supported card layout.
- Corners and shadows are global/preset treatments. Different radii per component, multicolour chat bubbles, exact brand fonts, artwork, asymmetrical layouts and independent sidebar colours are unavailable. Existing structure and original icon drawings stay intact.
- Flat-card mode shrinks horizontal padding without adjusting the Add form save bar. Revised themes avoid that combination; borderless/edge list treatments supply the closest safe appearance. The original Classic Flat theme is unchanged.
- A theme never forces light/dark mode. Dark-first inspirations therefore have interpreted light palettes. OLED and high contrast remain user-controlled.
- Existing selected IDs and saved custom snapshots continue to load. A previously selected snapshot may show “Custom (based on …)” after its bundled definition changes; its actual saved settings are retained. Re-selecting the theme adopts the refinement. No migration overwrites user customisation.
- Existing compact theme links carry a catalogue fingerprint by engine design: editing/adding bundled themes invalidates old compact links with “ask for a new one”. Saved selections and exported theme JSON do not rely on that fingerprint. New links and import/export are tested; the link format was not changed.

## Validation

- `node tools/check.mjs`: passed, including generated-data freshness. This static site has no separate compiled build.
- All 91 repository unit-test scripts: passed. Theme tests pin all 75 original IDs, exactly 25 additions, unchanged NUHS, palette contrast, derived tinted controls, faint keyboard hints, sanitisation, export/import and theme-link round trips.
- App-style/default reset and layouts browser suite: passed. Saved themes browser suite: passed at 390px and 1280px.
- Inspired palette browser suite: 92 themes, two appearances, effective palette and status tokens, navigation, reload and NUHS reset.
- Catalogue browser matrix: 736 Add/List renders (92 themes × two appearances × two desktop/phone sizes × two screens), with dialogs, toasts and no page errors. All additions plus Obsidian selected through the real searchable picker and reloaded successfully. The checked-in `test/e2e/theme-catalogue.mjs` reproduces the matrix and includes the Terracotta 320px regression.
- Supplemental 320px and 768px checks: 368 Add/List renders, no horizontal overflow after fixing Terracotta. These supplemental checks used light appearance; the 390px/1280px matrix covered both.
- Accessibility: the broad app suite reported zero violations. Axe scanned all 184 Inspired theme appearances on Add; seven muted-navigation findings were corrected and all 14 affected appearances passed repeat scans. All 25 additions passed. Rendered pressed-button/shortcut checks also passed for all 184 appearances.
- Visual review: all 92 themes inspected in 12 contact sheets showing mobile Add/List and desktop List, in both appearances; representative full-resolution dialogs also inspected. Review artifacts include an offline searchable gallery, full PNG captures and a 25-theme overview.
- NUHS: all eight Classic definitions are structurally identical to the baseline. Before/after captures cover Add, List, Layout and a dialog at 390px/1280px in light/dark. Fourteen of sixteen comparisons are pixel-identical. The other two differ at one/two antialias pixels in the header search icon by one colour-channel level; geometry and theme colours are unchanged. No shared CSS or default behavior was edited.

Browser runs used desktop Chromium with emulated viewports, demo data and blocked service workers. Real iOS/Android devices, Safari/WebKit, authenticated cloud flows and installed-PWA updates were not exercised. No deployment was performed.

Reproduce from the repository root with `PORT`, `PLAYWRIGHT_PATH` and `CHROMIUM_PATH` pointing to the local server/browser:

```sh
node logbook/test/themes.test.mjs
node logbook/test/theme-engine.test.mjs
node logbook/test/my-themes.test.mjs
node logbook/test/e2e/inspired-themes.mjs
node logbook/test/e2e/theme-catalogue.mjs
node logbook/test/e2e/app-style.mjs
node logbook/test/e2e/my-themes.mjs
node logbook/test/e2e/a11y.mjs
```

Set `E2E_OUT` for catalogue PNGs and a machine-readable render report.
