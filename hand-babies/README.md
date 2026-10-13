# Hand assessment

One-page crash course for MOs in their first week of hand surgery: how to examine accurately and send photos a
senior can assess remotely. Lives at `hand.anawj.com/babies/` (folder `hand-babies/`; `anawj.com/hand-babies/` redirects). No data, no sign-in; works offline once opened.

- `index.html`: all the text (rules, by clinical picture, sensation/2PD, tendons, infection/Kanavel, photos,
  referral template, words, quiz). Edit content here.
- `app.js`: draws the figures (inline SVG, stylised LEFT hand palm side, thumb on the left = radial) as looping
  animations (each a function of time; the last frame is the complete diagram), copy button, top-bar highlight,
  offline worker.
- `hand3d.js`: the 3D figures (tendon tests, cascade, nerve map) on a simple 3D hand, drawn with three.js r160
  (`vendor/three.module.min.js`, MIT); they plug into the same player (Play/Pause, still frame, drag to turn).
- `gifs/`: GIF copy of each animation for sharing in chats. Made by `node hand-babies/tools/make-gifs.mjs` (server on 8080,
  needs ffmpeg); rerun after changing a figure. `style.css`: layout. `sw.js`: offline cache (its `VERSION` is stamped at deploy, no hand bump).
- `edit.html`: page editor for suggesting changes (sends a GitHub issue); see NOTES.md "Edits sent from the page editor".
- Decisions and content rules: `NOTES.md`. Status: `STATUS.md`.

Test (phone size, axe accessibility, every figure drew and animates, pause, reduced motion, GIFs exist, in-page links
resolve, copy works):

```
python3 -m http.server 8080 &   # from the repo root
node hand-babies/test/e2e.mjs          # SHOTS=<dir> saves a screenshot per section
```
