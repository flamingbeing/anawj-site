# Hand assessment

One-page crash course for MOs in their first week of hand surgery: how to examine accurately and send photos a
senior can assess remotely. Lives at `anawj.com/hand/`. No data, no sign-in; works offline once opened.

- `index.html`: all the text (rules, by clinical picture, sensation/2PD, tendons, infection/Kanavel, photos,
  referral template, words, quiz). Edit content here.
- `app.js`: draws the figures (inline SVG, stylised LEFT hand palm side, thumb on the left = radial), copy button,
  top-bar highlight, offline worker. `style.css`: layout. `sw.js`: offline cache (bump `VERSION` on any change).
- Decisions and content rules: `NOTES.md`. Status: `STATUS.md`.

Test (phone size, axe accessibility, every figure drew, in-page links resolve, copy works):

```
python3 -m http.server 8080 &   # from the repo root
node hand/test/e2e.mjs          # SHOTS=<dir> saves a screenshot per section
```
