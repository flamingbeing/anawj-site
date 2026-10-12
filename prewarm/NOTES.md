# Prewarming study app: notes

Lasting rules. Decisions with dates are in `PLAN.md` and `STATUS.md`.

- **Public repo:** never commit the eCRF template, the protocol or the paper data collection form (they carry staff
  names). Only the transcribed headers are here. Fake patients only, in tests and demo.
- **Study IDs only:** the app never asks for names, initials or hospital numbers. The Subject ID is exported in the
  template's Enrollment ID column (B).
- **Blinding:** the randomisation group shows only on the pre-warming screen (and when the patient is created).
- **Columns:** `schema.js` lists fields in template column order; field n is column n. `test/prewarm.test.mjs` pins
  anchor columns. Never insert a template field out of order. Items with no template column go in `EXTRA` (exported
  on the "Extra" sheet).
- **Readings:** saving a timepoint stamps `at_<series>_<point>` with the clock time and initials; the Readings sheet
  is built from those. Gown set temp is NA for the no-pre-warming group and after "Active warming stopped".
- **Entry screen:** option B ("change what moved"): values carry over from the last saved timepoint; + / − nudges;
  tap the number to type ("365" → 36.5). Hidden readings (Settings) stay blank.
- **Alerts** only work while the app is open; locked-phone alerts would need push notifications.
- Changing any file in `sw.js` SHELL means bumping `VERSION`.
