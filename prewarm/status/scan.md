# Scan tool session (14 Oct 2026)

Built `prewarm/tools/scan/`: #516 (align + ticks), #521 (locate, reader, flags, review page, export), then fixes from the
first trial on the real v3.2 form (firetop, 5 real pages; the live reader has not run: no API credits yet).
Trial findings fixed here: ticks are slashes through the box (new score), Y/N and thermal sensation are written (found
from the form), page 7 was mis-guessed (now tries the top 3 pages; `--pages` overrides), false "cells" from printed
lines, clipped crops, skin-temperature range and jump rules, Windows (utf-8, PYTHON), API-free route (`--export-crops`,
`--readings`), 5x faster `locate.py`.
Waiting: firetop re-runs on the 5 real pages; why `locate.py` placed 462 of 587 fields (it now says why for each).
