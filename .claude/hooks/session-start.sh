#!/bin/bash
# Cloud sessions only: install the context-nudge mod (tools/context-nudge). Nothing else is installed at start:
# the Firebase and Cloudflare plugins are added on demand (see CLAUDE.md), the Firestore emulator tools install on
# first use of tools/test-rules.sh, and the Codex plugin and CLI are no longer installed (owner, 17 Oct 2026).
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# context-nudge: reminds the owner to /save-state and /compact at 50% and 75% context (tools/context-nudge).
if ! claude plugin marketplace list 2>/dev/null | grep -q anawj-tools; then
  claude plugin marketplace add "$PWD/tools/context-nudge" >/dev/null 2>&1 || echo "context-nudge: marketplace add failed" >&2
fi
if ! claude plugin list 2>/dev/null | grep -q 'context-nudge@anawj-tools'; then
  claude plugin install context-nudge@anawj-tools >/dev/null 2>&1 || echo "context-nudge: install failed" >&2
fi

exit 0
