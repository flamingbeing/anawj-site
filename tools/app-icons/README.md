# App icons

One icon per app, for every group repo, drawn here so the set stays one family on a home screen.

- `icons/<id>.svg`: the source, 512 × 512, shapes only (no text, so it renders the same everywhere). It starts with its
  family's container and uses only that family's colours (`apps.json`).
- Families: **NUHS** (navy, white pictogram, one brand-stripe accent), **NTF** (ink tile, ivory pictogram, small wine
  square top right), **Home** (family blue, white pictogram, blue tick).
- Keep the glyph inside 96–416 so the maskable version stays in the safe zone; the renderer checks this.

```
node tools/app-icons/render.mjs                         # checks only
node tools/app-icons/render.mjs --out <dir> [--only id,id]   # <dir>/<id>/icon.svg + 5 PNGs
node tools/app-icons/render.mjs --sheet tools/app-icons/sheet.png
```

Per app it writes `icon.svg` (also the SVG favicon), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
`apple-touch-icon.png` (180, opaque) and `favicon-32.png`. Needs Playwright with Chromium (as the Checks job has).
After changing an icon, redraw `sheet.png` and copy the new files into the app's repo.
