# Scan tool session (14 Oct 2026)

Built `prewarm/tools/scan/`: #516 (align + ticks), #521 (locate, reader, flags, review page, export), then fixes from the
first trial on the real v3.2 form (firetop, 5 real pages; the live reader has not run: no API credits yet).
Trial findings fixed here: ticks are slashes through the box (new score), Y/N and thermal sensation are written (found
from the form), page 7 was mis-guessed (now tries the top 3 pages; `--pages` overrides), false "cells" from printed
lines, clipped crops, skin-temperature range and jump rules, Windows (utf-8, PYTHON), API-free route (`--export-crops`,
`--readings`), 5x faster `locate.py`.
Waiting: firetop re-runs on the 5 real pages; why `locate.py` placed 462 of 587 fields (it now says why for each).

Second trial (firetop, 14 Oct): 12 of 17 tick questions right, 0 wrong, 5 unsure (slash overshoot); 46 of 46 written cells found and real, 0 false alarms; page 7 still will not align (LibreOffice render differs from Word's layout: 15 pages vs 14, row heights). Fixed in the next PR: string-option fields (io_tech) were split into letters by locate.mjs; sliver crops; strongest-box tiebreak for overshooting slashes; readings.json can say "hard to read"; leak metric; RENDERER=word. Table-grid fallback (find the table's own lines in the photo; page 7 grid detects well on the real photo, 9 columns, rows ~42 px) NOT built: needs the real blank page to test against. Asked the owner for a Word-exported PDF of the blank form.
