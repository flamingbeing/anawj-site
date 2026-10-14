# Scan the paper form (v3.2) into the study workbook

Phone photos of filled-in paper pages → checked values → the same Excel layout the app exports. Local tool: no scans,
no form, no outputs go in git (the repo is public), and nothing is sent anywhere except small crops of **numbers and
times** to Claude for reading. IDs, dates, names, signatures and free text are never cropped to the API; you type
those in the review screen.

## How it works

1. **Find every field** (once per form version). `setup-form.sh` asks the app's own Form view (`js/wordform.js`) to fill
   the blank form one field at a time, renders each, and sees which printed characters appeared. That gives every
   field's place with no hand-made coordinates, and it follows the form whenever `wordform.js` changes.
2. **Line up the photo** (`align.py`): finds the sheet, flattens it onto the blank page, refines with ECC, and scores
   how well the printed lines match. A low score rejects the photo: retake it.
3. **Read the page** (`scan.py`):
   - ticks: the ink in each box (`ticks.py`), ticked / empty / unsure;
   - handwriting: crop the cell, ask Claude twice (different framing, 2× scale), accept only if both reads agree;
   - checks (`plausible.py`, `scan.py`): ranges, 24-hour times, whole numbers, temperatures jumping >1.5 °C between
     neighbours, systolic above diastolic, two ticks in one question. Anything off is flagged.
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

Photos: whole sheet in frame on a plain surface, even light, one page per photo, any order.

## Tests (all fake data)

- `node prewarm/test/scan-export.test.mjs` (in CI): reviewed values → the right workbook cells.
- `python3 test.py <dir>` (alignment + ticks on synthetic phone photos) and `python3 e2e.py <form dir>` (whole read
  with a stand-in reader, one deliberate misread that must be flagged). Needs OpenCV, LibreOffice, `pdftoppm`.
- `node prewarm/tools/scan/review.e2e.mjs <scan.json>` (review page at phone size, axe), static server on 8080.

## Not yet proven

Everything above was tested on a made-up fixture form and synthetic photos. Not yet done: a run on the real v3.2 form,
real handwriting, and the live Claude reader (`readers.AnthropicReader`). Do a dry run on a few real pages (patient
details cropped off) and compare with the paper before trusting a batch.
