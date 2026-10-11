# anawj.com

Static site on GitHub Pages (public repo: no names, patient data or real evaluation data). Apps share one origin:

- `evals/`: APMES workplace-based assessments. Start with `evals/NOTES.md` (decisions, MedHub, forms, operations), then `evals/README.md`.
- `logbook/`: APMES case logbook. `logbook/README.md`.
- `nuh-roster/`: NUH anaesthesia daily roster (own Firebase project `nuh-roster`). Start with `nuh-roster/NOTES.md`: its department section (grades, postings, roster sheet, notation, HMS monthly rosters, short names) applies to any app dealing with NUH anaesthesia staff.
- `design/tokens.css`: shared design tokens.

Rules that bite:

- `logbook/firestore.rules` is the one rules file for both logbook and evals (Firebase project `apmes-logbook`). It deploys automatically on merge to main; never ask the owner to paste rules.
- `nuh-roster/firestore.rules` (Firebase project `nuh-roster`) deploys the same way.
- `evals/js/catalogue.js` and `evals/js/forms.js` are generated. Edit `evals/reference/` or `evals/tools/build-data.mjs`, then run `node evals/tools/build-data.mjs`.
- Changing any file in an app's `sw.js` SHELL list means bumping that app's `VERSION`.

Before merging, run:

```
node tools/check.mjs
for f in evals/test/*.test.mjs logbook/test/*.test.mjs nuh-roster/test/*.test.mjs; do node "$f"; done
```

For evals UI changes, also run the e2e test (see `evals/README.md`).
