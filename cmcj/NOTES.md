# Thumb CMC Trainer: working notes

Conventions and lessons for `cmcj/`, served at `https://hand.anawj.com/cmcj/` (shared with `hand-babies/` at `/babies/`). What's happening now is in `STATUS.md`; architecture and files are in
`README.md`. Public repo: no patient images or data.

## Owner preferences

- Open PRs and squash-merge them directly; restart the session branch from main after each merge.
- Tuning of simulation feel (burr speed, targets) is decided by the owner on a phone, not by headless tests.

## Address and hosting

- Live at `https://hand.anawj.com/cmcj/` (Cloudflare Worker, `worker/routes.js`). `hand.anawj.com` serves only `cmcj/`
  and `hand-babies/`: no `/design/`, `/edit/` or other repo folders, so keep every path relative to `cmcj/`.
- `anawj.com/cmcj/` (GitHub Pages) redirects with an inline script at the top of `index.html`: only on `anawj.com` /
  `www.anawj.com` and only at the top level, so the new host, previews, localhost and the `/edit/` iframe don't loop.
- Keep `<meta name="robots" content="noindex, nofollow">`. No service worker.

## Content

- Clinical text lives in `js/content.js` as plain data (`STAGES`, `NOTES`, `INFO`, `VIVA`) so clinicians can edit it
  without touching the 3D code. Pathology is simulated on the normal Z-Anatomy model; say so wherever it matters.
- Viva items: `{ topic, q, a, show }`; `show` = `{ mode, stage, view, layers, heat }` sets up the scene for the answer.
- Meshes are Z-Anatomy (CC BY-SA 4.0); keep `models/ATTRIBUTION.md` and the About dialog credits intact.

## Testing

- Headless Chromium with SwiftShader: launch with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`,
  serve the repo root with `python3 -m http.server`, open `/cmcj/`. Check 1280×800 and 390×844 and the console.
- On phones in arthroscopy mode the side panel collapses; in other modes the panel sits below the viewport.
- `window.__cmcj` is the debugging handle (raycast probes, tool application, inside-bone test).
- Don't `pkill -f` a pattern that also appears in the same shell command line: it kills that shell.
