# Wallpaper you can see (TE S3)

21 Oct 2026: Themes → Wallpaper shows more of the picture, and text stays at 4.5:1.

- Text between cards (hints, the theme line, More's fine print and version line, Reflect's notes switch and rules)
  gets its own soft backing in the page colour (`--wall-scrim`, `wallpaper.js scrimFor`), just strong enough for
  4.5:1 over the picture. The dim no longer goes up to the floor by itself, so a photo keeps the dim you chose
  (40% unless set). Exception: Flat cards put text straight on the picture, so there the whole dim still rises.
- Pattern strength (`wallInk`, 6 to 36% in steps of 6; unset = 6, as before): a slider for patterns.
- See-through cards (`wallFrost`): the card colour at 80% or more (`frostAlpha`: more if a busy picture needs it for
  4.5:1) with a 14px blur behind; solid where the browser can't blur; off with Flat.
- Both are in the look schema and the Wallpaper keep group. They go at the end of theme links, after the colour
  tokens (`my-themes.js LINK_KEYS`), so old links keep their places.
- First paint: `apmes-logbook-wall-paint` caches the backing and card cover (index.html).
- Tests: `test/wallpaper.test.mjs`, `test/look-schema.test.mjs`, `test/e2e/wallpaper.mjs` (photo at dim 0 in light,
  dark and OLED; every pattern at strength 36 with see-through cards at 1280 px; Flat). `a11y.mjs` takes
  `A11Y_INK` and `A11Y_FROST`: dots and gradient at 36 with frost, no problems.
- Watch: blur cost on older Android phones (the frost is opt-in).
