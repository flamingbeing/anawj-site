# Hand log

DOPS and Mini-CEX log for hand surgery trainees. Data on the device only. Start with `NOTES.md`.

## Run locally

From the repo root:

```
python3 -m http.server 8080
```

then open http://localhost:8080/hand-log/ (live: https://hand.anawj.com/handlog/) (at phone width in the browser's device mode).

## Test

With the server above running, from the repo root:

```
node hand-log/test/e2e.mjs            # SHOTS=<dir> also saves phone screenshots
node tools/check.mjs
```

The browser test adds a DOPS and a Mini-CEX at 390 px, reloads, exports CSV, deletes an entry, and runs axe on the
list and the form. Set `CHROMIUM_PATH` if Playwright's own Chromium isn't installed.
