#!/bin/sh
# One-off, per version of the paper form: work out where every field sits.
#   sh setup-form.sh <blank form.docx> <form-data dir>      (about 10 minutes for the real form; needs LibreOffice)
# form-data/ is made from the real form: keep it out of git (it is in .gitignore).
set -e
BLANK=$(realpath "$1"); OUT=$2; HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"; OUT=$(realpath "$OUT")
node "$HERE/locate.mjs" "$BLANK" "$OUT"
cp "$BLANK" "$OUT/blank.docx"
(cd "$OUT" && soffice --headless --convert-to pdf blank.docx >/dev/null 2>&1 && pdftoppm -r 200 -png blank.pdf page)
${PYTHON:-python3} "$HERE/locate.py" "$OUT"
