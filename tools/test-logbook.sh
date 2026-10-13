#!/bin/bash
# Every check the logbook needs before merging, in one go (fake data only):
#   tools/test-logbook.sh            everything (about 10 minutes)
#   tools/test-logbook.sh quick      repo check, unit tests and the focused browser tests (no full e2e)
# It starts a static server on port 8080 if none is running (and stops it after). The portfolio template steps
# use apmes/templates/portfolio-template-blank.docx.
# Accessibility (logbook/test/e2e/a11y.mjs) and the rules emulator (tools/test-rules.sh) are run on their own.
set -u
cd "$(dirname "$0")/.."
OUT="${E2E_OUT:-${TMPDIR:-/tmp}/logbook-tests}"; mkdir -p "$OUT"
fail=0
step() { printf '\n== %s\n' "$1"; }
if ! curl -s -o /dev/null http://localhost:${PORT:-8080}/logbook/; then
  python3 -m http.server ${PORT:-8080} >/dev/null 2>&1 & SERVER=$!; trap 'kill $SERVER 2>/dev/null' EXIT; sleep 1
fi

step 'repo check'; node tools/check.mjs || fail=1
step 'unit tests'
for f in evals/test/*.test.mjs logbook/test/*.test.mjs nuh-roster/test/*.test.mjs; do
  node "$f" >"$OUT/unit.txt" 2>&1 || { echo "FAIL $f"; tail -5 "$OUT/unit.txt"; fail=1; }
done
echo 'done'

if [ "${1:-}" != quick ]; then
  step 'full e2e (phone and desk)'
  mkdir -p "$OUT/e2e"; [ -f "$OUT/e2e/fake-old-form.xlsx" ] || node logbook/test/e2e/mkfake.cjs "$OUT/e2e/fake-old-form.xlsx" >/dev/null
  E2E_OUT="$OUT/e2e" timeout 600 node logbook/test/e2e/e2e.mjs >"$OUT/e2e.txt" 2>&1 || fail=1
  grep -E '^== |^FAIL|console errors' "$OUT/e2e.txt"
fi

for t in recovery usability cloud-save notepad tag-editor simpler profiles moved send logging-speed; do
  step "$t"
  timeout 300 node "logbook/test/e2e/$t.mjs" >"$OUT/$t.txt" 2>&1 && grep -E '^PASS' "$OUT/$t.txt" || { echo "FAIL $t"; tail -15 "$OUT/$t.txt"; fail=1; }
done

printf '\n%s\n' "$([ $fail = 0 ] && echo 'ALL PASSED' || echo "SOMETHING FAILED (logs in $OUT)")"
exit $fail
