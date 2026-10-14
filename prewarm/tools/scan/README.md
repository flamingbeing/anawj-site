# Scan the paper form (v3.2) into the study workbook

Phone photos of filled-in paper pages → checked values → the same Excel layout the app exports. Local tool: no scans,
no form, no outputs go in git (the repo is public), and nothing is sent anywhere except small crops of **numbers and
times** to Claude for reading. IDs, dates, names, signatures and free text are never cropped to the API, and nothing in a page's header band (Subject ID / Date of
Entry, worked out per page from the form) is ever cropped; you type
those in the review screen.

## How it works

1. **Find every field** (once per form version). `setup-form.sh` asks the app's own Form view (`js/wordform.js`) to fill
   the blank form one field at a time, renders each, and sees which printed characters appeared. That gives every
   field's place with no hand-made coordinates, and it follows the form whenever `wordform.js` changes.
2. **Line up the photo** (`align.py`): finds the sheet, flattens it onto the blank page, refines with ECC, then finds each
   printed table's own row and column lines in the photo and pulls them onto the template's (a long table over a phone
   lens), and scores how well the printed lines match. A low score rejects the photo: retake it.
3. **Read the page** (`scan.py`):
   - ticks: the slash or cross through each box (`ticks.py`), ticked / empty / unsure; fields whose answers are
     written (Y / N columns, thermal sensation) are read as handwriting, found automatically from the form;
   - handwriting: crop the cell, ask Claude twice (different framing, 2× scale), accept only if both reads agree;
   - checks (`plausible.py`, `scan.py`): ranges (skin temperatures down to 20 °C), 24-hour times, whole numbers,
     option letters, core temperature jumping >1 °C (skin >6 °C) between neighbours, systolic above diastolic, two ticks
     in one question, an arrow or ditto ("same as above"). Anything off is flagged; values with no known range are not.
4. **You confirm** (`review.html`): flagged fields first, the photo crop beside each reading. Only values you confirm
   are saved to `patient.reviewed.json`.
5. **Export** (`export-scan.mjs`): reviewed files → the workbook through the app's own `workbook()`, same 572 columns.

## Use

```
pip install opencv-python-headless pdfplumber anthropic        # once
export ANTHROPIC_API_KEY=...                                    # once per shell (never commit)
sh prewarm/tools/scan/setup-form.sh blank-v3.2.docx form-data   # once per form version
python3 prewarm/tools/scan/scan.py --form-dir form-data --out scans/pt01 photo1.jpg photo2.jpg ...
# open prewarm/tools/scan/review.html, load scans/pt01/scan.json, check, Save reviewed file
node prewarm/tools/scan/export-scan.mjs study.xlsx pt01.reviewed.json pt02.reviewed.json
```

Photos: whole sheet in frame on a plain surface, even light, one page per photo, any order. If a page is picked wrong
or rejected, say which page each photo is with `--pages 7,9,1` (one number per photo, in order).

**Without API credits** (Claude Max has none): `scan.py --export-crops crops/ ...` aligns the photos, reads the ticks and
writes every handwritten crop to `crops/` with a `manifest.json`; someone (or a Claude Code session) reads them into
`readings.json` as `{"<field id>": "<text>"}`; then `scan.py --readings readings.json ...` carries on as usual. There is
only one read, so no second opinion: the review screen is the only check.

**The template must look like the paper.** Field places and the alignment template are rendered from the blank `.docx`. If
the render is not the same layout as the printed paper (different fonts, different row heights, a different page
count), alignment scores drop and printed text leaks into the ink layer, which makes ticks unreliable. Check: the
template pages should say "Page n of 14" like the paper. Fix: render with Microsoft Word itself (`pip install docx2pdf`,
then `RENDERER=word sh setup-form.sh ...`), or with LibreOffice after installing the Carlito font (Calibri-metric).
`scan.py` prints a warning, and puts `template_mismatch` in `scan.json`, for a page whose ink layer is full of printed text.

`readings.json` entries may be text or `{"text": "34.0", "legible": false}`: use the second form for a cell that is hard
to read, so it is flagged "hard to read".

**Windows**: run the shell steps in Git Bash; the tool needs `soffice` (LibreOffice) and `pdftoppm` (poppler) on PATH. Use
`PYTHON=python sh setup-form.sh ...` if `python3` is the Store stub. `setup-form.sh` uses all cores (`LOCATE_JOBS=n` to
change); it prints why any field was not placed (the paper form has no per-reading BP / HR / BIS grid, only a "Vital Signs Data Collected" tick, so `haemo_*` readings after the baseline are rightly unplaced). The model is Sonnet by default; `SCAN_MODEL=claude-opus-5-5` for hard pages.

## Tests (all fake data)

- `node prewarm/test/scan-export.test.mjs` (in CI): reviewed values → the right workbook cells.
- `python3 grid_test.py` (a table whose rows and columns are not where the template says is warped back onto it)
- `python3 unit.py` (the small rules; no photos needed)
- `python3 test.py <dir>` (alignment + ticks on synthetic phone photos) and `python3 e2e.py <form dir>` (whole read
  with a stand-in reader, one deliberate misread that must be flagged). Needs OpenCV, LibreOffice, `pdftoppm`.
- `node prewarm/tools/scan/review.e2e.mjs <scan.json>` (review page at phone size, axe), static server on 8080.

## Not yet proven

Everything above was tested on a made-up fixture form and synthetic photos. Not yet done: a run on the real v3.2 form,
real handwriting, and the live Claude reader (`readers.AnthropicReader`). Do a dry run on a few real pages (patient
details cropped off) and compare with the paper before trusting a batch.
