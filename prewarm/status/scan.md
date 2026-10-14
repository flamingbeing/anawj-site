# Scan tool session (14 Oct 2026)

Built `prewarm/tools/scan/`: #516 (align + ticks), #521 (locate, reader, flags, review page, export), then fixes from the
first trial on the real v3.2 form (firetop, 5 real pages; the live reader has not run: no API credits yet).
Trial findings fixed here: ticks are slashes through the box (new score), Y/N and thermal sensation are written (found
from the form), page 7 was mis-guessed (now tries the top 3 pages; `--pages` overrides), false "cells" from printed
lines, clipped crops, skin-temperature range and jump rules, Windows (utf-8, PYTHON), API-free route (`--export-crops`,
`--readings`), 5x faster `locate.py`.
Waiting: firetop re-runs on the 5 real pages; why `locate.py` placed 462 of 587 fields (it now says why for each).

Second trial (firetop, 14 Oct): 12 of 17 tick questions right, 0 wrong, 5 unsure (slash overshoot); 46 of 46 written cells found and real, 0 false alarms; page 7 still will not align (LibreOffice render differs from Word's layout: 15 pages vs 14, row heights). Fixed in the next PR: string-option fields (io_tech) were split into letters by locate.mjs; sliver crops; strongest-box tiebreak for overshooting slashes; readings.json can say "hard to read"; leak metric; RENDERER=word. Table-grid fallback (find the table's own lines in the photo; page 7 grid detects well on the real photo, 9 columns, rows ~42 px) NOT built: needs the real blank page to test against. Asked the owner for a Word-exported PDF of the blank form.

Third trial (firetop, Word-rendered template, 14 Oct): pages 1/4/5/9 now align at 0.96-0.99 (LibreOffice gave 0.83-0.94); page 7 0.772 (was 0.446) still under 0.80. Ticks 14/18 right, 2 wrong-but-flagged (the "strongest box wins" shortcut: removed), 2 unsure, 0 wrong unflagged. Two false cells (io_txa, io_fib) resolved to the handwritten Date of Entry header digits on page 5: now guarded (header band per page from the form; never cropped; locate.py drops fields there). Fixes in the next PR: tick score counts only ink inside the printed box; no auto-pick; table-aware refinement (finds the table's lines in the photo, matches them to the template's, resamples; synthetic 0.35 -> 0.92; on the real page-7 photo the detector finds 9 columns and 32 evenly spaced rows); docx2pdf called as a function (no __main__).
Waiting on firetop: re-run page 7 with the table refinement; ticks (Cell saver, Randomisation, Anaesthesia technique, PCC); Y/N columns and Room Temp arrows.
