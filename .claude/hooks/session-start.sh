#!/bin/bash
# Cloud sessions only: set up the OpenAI Codex plugin for Claude Code (/codex:review, /codex:rescue …)
# and the Codex CLI it drives. Each step is skipped when already done. Signing in to OpenAI can't be
# automated with a ChatGPT account: run `codex login --device-auth` once per session, or add an
# OPENAI_API_KEY secret to the cloud environment and this signs in with it.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

if ! claude plugin marketplace list 2>/dev/null | grep -q openai-codex; then
  claude plugin marketplace add openai/codex-plugin-cc >/dev/null 2>&1 || echo "Codex plugin: marketplace add failed" >&2
fi
if ! claude plugin list 2>/dev/null | grep -q 'codex@openai-codex'; then
  claude plugin install codex@openai-codex >/dev/null 2>&1 || echo "Codex plugin: install failed" >&2
fi

if ! command -v codex >/dev/null 2>&1; then
  npm install -g @openai/codex >/dev/null 2>&1 || echo "Codex CLI: npm install failed" >&2
fi

if command -v codex >/dev/null 2>&1 && ! codex login status >/dev/null 2>&1 && [ -n "${OPENAI_API_KEY:-}" ]; then
  printenv OPENAI_API_KEY | codex login --with-api-key >/dev/null 2>&1 || echo "Codex CLI: API key sign-in failed" >&2
fi

exit 0
