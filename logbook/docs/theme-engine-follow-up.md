# Theme engine: follow-up for the next session

The catalogue refresh keeps the current engine and works around its limits. This is a separate implementation brief for improving the engine, not a claim that these capabilities were added. Start from current `main` after the catalogue PR merges; preserve the default NUHS appearance and behavior, existing IDs, custom looks, accessibility and saved data.

## Where to work

- `js/theme-engine.js`: facets, CSS, icons, motion and numeric tuning.
- `js/themes.js`: bundled definitions, `THEME_KEYS`, `checkTheme`, theme patches and matching.
- `js/colors.js`: palette generation, editable colour tokens, contrast checks.
- `js/display.js` and the startup code in `index.html`: device settings, painting and first-paint caches.
- `js/my-themes.js`: sanitisation, saved snapshots, import/export and compact links.
- `js/ui-settings.js`: theme picker and editing controls.
- `style.css`: original/default components and responsive layout.

Read [theme-engine.md](theme-engine.md) and [the catalogue review](theme-catalogue-review.md) first. Do not start by recolouring the catalogue again. Make the engine safe and expressive, then revisit only themes whose workarounds can be removed.

## Progress

- 21 Oct 2026, first PR: one list of allowed values (`js/look-schema.js`) used by `checkTheme`, `lookOf`, settings files
  and links (the validation probe below is now refused); theme link format 2 (self-contained, append-only lists held
  by `test/fixtures/theme-links.json`; the owner said no one used format 1); Keep when changing theme (wallpaper and
  layout by default, fonts optional). Next, from the owner's feedback the same day: Themes page essentials vs an
  Advanced theme settings page; a full colour picker (the phone's own picker offers only a few colours); wallpaper
  that can actually be seen; then the palette resolver and colour roles below, with NUHS looking exactly as now.
- 21 Oct 2026, TE S2: Themes keeps the essentials, the rest moved to Advanced theme settings (`#themesadv`), the split
  driven by `THEME_CARDS` and a `section` per setting in `look-schema.js`; the colour sheet (grid of shades, hex,
  Recent, the phone's picker last) replaces the phone's own picker; theme link format 3 (settings as steps from the one
  before, grid colours as their place, snapped colours in 18 bits, white and black pre-sent, tab icons as list places,
  6-bit names): a fully custom theme went from 178 to about 120 characters with the address. Format 2 links still open.
  Next: TE S3, wallpaper that can be seen.
- 21 Oct 2026, TE S3: wallpaper that can be seen (text backing, pattern strength, see-through cards).
- 21 Oct 2026, TE S4: one `resolvePalette(look, appearance, tint)` (colors.js) after explicit overrides, used by the
  page's CSS (`paletteCss`, cached for the first paint, NUHS's too), the contrast checks, theme previews and the
  status bar; the light tint no longer leaks onto auto-dark pages; soft accent, chips and info colours follow a
  theme's own accent and card. Roles `fill`/`onFill`, `link`, `focus`, `selection`, defaulting to today's colours,
  editable in Edit colours, checked once set, appended to theme links. NUHS is a written-out palette (`NUHS`); the
  `DEFAULT_ACCENT` deletions in `schemeCss` and `colourPalette` are gone. `test/e2e/nuhs-baseline.mjs` holds NUHS to
  its earlier colours (every element and variable, 80 screens). Next: TE S5, interaction states and layout fixes.

## Observed problems and recommended order

| Priority | Finding and evidence from this session | Recommended implementation and acceptance check |
| --- | --- | --- |
| 1 | **One accent serves several incompatible roles.** A vivid green or yellow fill cannot also be readable small text on a white panel. Many light accents were darkened; some dark accents were lightened. | Add separate action-fill/on-fill, link, selection and focus roles with backward-compatible defaults. Test a vivid green filled button next to a dark green text link, in light/dark/OLED and high contrast. Old themes must still resolve as before. |
| 1 | **Derived colours are not resolved from the final palette.** `schemeCss` derives `accent-soft`, `chip`, `chip-on`, info, row and input treatments from the single accent/default surfaces; `coloursCss` subsequently overrides only the supported explicit tokens. An independent dark accent or panel can leave related colours from a different palette. | Resolve a complete semantic palette once per appearance, after explicit overrides. Derive missing roles from the final surfaces/accent, then use the same result in CSS, contrast checking, previews, status-bar painting and first-paint caches. Test a dark accent distinct from the light accent, on a non-default panel. Audit these relationships before migrating existing definitions. |
| 1 | **Pressed controls lose contrast.** The `highlight` facet gives every pressed button a neutral background without changing its text colour. A filled button can keep white text on a pale neutral fill, or dark text on a dark fill. All Inspired themes now use `pressStyle: 'none'` as the safe supported workaround. | Give filled, tinted, outlined, text and destructive buttons explicit hover/pressed/focus/disabled pairs. Preserve visible feedback while checking the rendered foreground/background, including the Save keyboard hint at 75% opacity. Test pointer down without requiring a successful save. Do not silently change NUHS interaction states. |
| 1 | **The generic contrast validator covers only a subset of the UI.** `colourChecks` checks body/secondary text on page/panel and button labels on accent. It missed tinted segments, chips, faint keyboard hints, status colours and translucent navigation. Seven light themes needed darker inactive tab labels after browser scans. | Expand checks to resolved semantic roles and states, composites and opacity; retain rendered axe and pointer-state coverage. Palette-only checks cannot prove blurred/translucent navigation readable over arbitrary content: define safe compositing limits or a solid fallback. Test the seven repaired themes: Bear, Spotify, Zoom, LINE, Airbnb, Things and Substack. |
| 2 | **Flat cards break the Add save bar.** Flat mode reduces card padding to 4px; the save bar retains negative margins designed for larger gutters and overflowed the phone viewport. Revised themes avoid flat mode. The original Classic Flat definition is unchanged. | Share spacing/gutter variables between cards, save bars and their responsive variants rather than mixing literal padding and negative margins. Test Flat with edge/inset lists, normal/compact/roomy spacing, long action labels and 320px width. Preserve the exact default gutter geometry. |
| 2 | **Timeline rows overflow narrow screens.** Terracotta's timeline produced a 334px document at a 320px viewport. Its current definition uses cards. | Let timeline tracks and flex children shrink and wrap; collapse secondary metadata when needed without hiding content or actions. Reproduce with Inter UI text, a 320px viewport and long case summaries/category chips; cover larger fonts and keyboard use. Only restore Terracotta's timeline after that passes. |
| 2 | **Compact links depend on the entire mutable catalogue.** `packLists()` fingerprints keys, words, bundled names/looks and modes into 12 bits. Adding or renaming a theme invalidates older compact links. Existing selected IDs and JSON exports still work. | Design a versioned format with stable field IDs and immutable base IDs/revisions, or self-contained compressed look data. Keep legacy decoders or provide explicit migration. Test fixtures produced by an older catalogue after adding, reordering, renaming and editing themes. The 12-bit fingerprint is a drift detector, not a robust identity or security check; collision ambiguity is a source-review concern, not an observed incident. |
| 2 | **Saved selections are snapshots, with no explicit upgrade model.** Old selected settings are preserved, but a bundled-theme edit can make an unchanged saved selection appear as “Custom (based on …)”. Re-selecting applies the new definition. | Separate bundled theme ID/revision from explicit user overrides, with a migration policy. Detect old snapshots matching old bundled revisions without overwriting actual customisations. Test account adoption, day/night themes, import/export and reload/first paint. Decide whether existing selections follow updates or pin revisions before implementing. |
| 3 | **Component styling is too global for faithful app interfaces.** One corner level affects unrelated controls; shadow tuning is card-wide; surface roles cannot independently describe sidebar, toolbar, editor, dialog and navigation. Multicolour bubbles and richer layouts also lack supported roles. | Add a small semantic surface/component-token layer: independent radii, border/shadow roles, control heights and density. Reuse supported layout structures; avoid arbitrary CSS selectors in theme data. Prototype a grouped Obsidian settings surface plus a denser editor/sidebar and a card with pill buttons. All new tokens must be optional and have legacy-preserving defaults. |

## Additional source-review finding: unify validation

This was confirmed with a pure validation probe, rather than discovered as a visible catalogue failure:

```js
const probe = {
  id: 'probe', name: 'Probe', group: 'inspired', desc: 'Validation probe',
  look: { round: 9, btnStyle: 'unlisted' },
};
checkTheme(probe); // []
lookOf(probe.look); // retains both values
```

The documented corner levels and button-style choices are narrower than these validators allow. `THEME_KEYS`, `DISPLAY_KEYS`, facet metadata, `checkTheme`, import sanitisation, storage and link packing have overlapping responsibilities. Consolidate types, enums, ranges, defaults, serialisation and migration metadata into a shared schema. Unknown values should have an explicit reject/drop policy at every input boundary. Test malformed imported looks and links, not just known bundled themes. Preserve harmless user-defined names and do not add remote CSS or script execution.

## Scope choices, not defects

- Themes deliberately respect the user's light/dark setting. Dark-first brands currently have interpreted light palettes; a future preferred-appearance hint must not override accessibility or device preferences silently.
- The engine already supports bundled open fonts and device-local named/uploaded fonts. Missing exact proprietary brand fonts and the exclusion of company artwork/logos were scope choices, not evidence that all font customisation is absent. Do not weaken font/file validation to pursue a closer match.
- Fine-tune already supports numeric button height, gaps, line width, shadows, case/day spacing, letter spacing and weight. The missing capability is independent component roles, not a total absence of tuning.
- Official reference availability and app version/platform differences limit fidelity independently of engine capability. Keep assumptions explicit.

## Regression plan and completion criteria

1. Capture the default NUHS baseline before changing shared code: Add, List, settings/Layout, dialog, light/dark/auto/OLED, desktop and phone. Compare both initial defaults and switching from a heavily customised theme back to NUHS. Account for font loading and screenshot antialias noise.
2. Extend unit tests for the central schema, complete resolved roles, imports, saved overrides and historical link fixtures. Check statuses, selections, opacity and state colours, not only body text.
3. Extend `test/e2e/theme-catalogue.mjs` and `inspired-themes.mjs` with 320/390/768/1280px layouts, long content and larger text. Commit regression coverage for the flat save bar, timeline, pressed buttons and translucent tabs. The previous session's supplemental scans lived outside the repository; do not rely on those artifacts being attached to the next session.
4. Run `node tools/check.mjs`, unit tests, `tools/test-logbook.sh`, theme-specific browser suites and `test/e2e/a11y.mjs`. Include WebKit and real-device/installed-PWA testing when available; report skips honestly. Exercise offline first paint and update compatibility because the prior theme matrix blocked service workers.
5. Existing IDs, custom looks, data and navigation must survive. Default NUHS must remain unchanged. Previously shared links should remain readable under the new compatibility policy. Remove catalogue workarounds only after regression tests pass.

Suggested first PR: shared schema and palette resolver with legacy output parity, plus durable failing fixtures for the observed bugs. Then split semantic roles/state fixes, layout fixes and persistence/link migration into reviewable steps.
