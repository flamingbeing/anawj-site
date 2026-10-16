# Scan tool session (14 Oct 2026)

Built `prewarm/tools/scan/`: #516 (align + ticks), #521 (locate, reader, flags, review page, export), then fixes from six
trials on real pages run on the home computer (trial log in the owner's private notes): tick scoring inside the printed
box, written Y/N and thermal sensation, Word-rendered template, table-aware alignment for the dense temperature page,
header band never cropped, option-box choice on the same row, arrow and leak checks, Windows fixes, and the API-free
route (`--export-crops`, `--readings`, `--readings2`, `--no-read`; reader instructions in
`prewarm/tools/scan/READ-CROPS.md`).

15 Oct 2026: the live reader (`readers.AnthropicReader`) stays shelved and untested (owner's decision); every reading
so far was a stand-in. If it is ever run, the API key goes to that one process from a private file (`scan.py
--key-file`), never an environment variable. Still to prove: a "No pre-warming" patient's page 4, a bigger batch, and
how accurate a session's readings of the contact sheets are against the paper.
