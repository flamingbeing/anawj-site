# Scan tool session (14 Oct 2026)

Built `prewarm/tools/scan/`: #516 (align + ticks), then locate, reader, flags, review page, workbook export (this PR).
Waiting on the owner: put the blank v3.2 `.docx` on the home computer, run `setup-form.sh`, then a dry run of a few real
pages (patient details cropped off) with `ANTHROPIC_API_KEY` set. Not yet tried: the real form, real handwriting, the
live `AnthropicReader`. Next: tune on what the dry run shows (tick cut-off 0.12 left one synthetic tick "unsure").
