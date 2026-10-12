# Prewarming study app

Phone app for the op-day bedside data of the prewarming RCT: temperatures every 5 minutes (pre-warming and intra-op),
event times, intra-op details, PACU and satisfaction. Lives at `anawj.com/prewarm/`; `?demo` opens a separate demo
store with a fake patient.

- Plan and decisions: `PLAN.md`. Status: `STATUS.md`. Lasting rules: `NOTES.md`.
- `js/headers.js`: the eCRF template's 572 headers and sections, verbatim. `js/schema.js`: every template column as a
  field, in column order, plus op-day extras the template lacks. `js/app.js`: the screens. `js/store.js`: records with
  a timestamp per field (merge-ready for sharing). `js/xlsx.js` + `js/export.js`: the Excel export.
- Data stays on the phone (localStorage) until sharing (Firebase, PR 2) is added.

Tests (fake data only):

```
node prewarm/test/prewarm.test.mjs
python3 -m http.server 8080 &   # from the repo root
node prewarm/test/e2e.mjs        # phone-size browser test with an axe check; SHOTS=<dir> saves screenshots
```
