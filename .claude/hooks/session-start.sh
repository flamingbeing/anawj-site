#!/bin/bash
# Cloud sessions only: set up the OpenAI Codex plugin for Claude Code (/codex:review, /codex:rescue …)
# and the Codex CLI it drives, and the Firebase and Cloudflare plugins. Each step is skipped when already done. Signing in to OpenAI can't be
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

# Firebase plugin (official; its MCP server runs `npx -y firebase-tools mcp`). Sign-in stays manual and per
# session, with the owner's approval (CLAUDE.md).
if ! claude plugin marketplace list 2>/dev/null | grep -q '> firebase$'; then
  claude plugin marketplace add firebase/firebase-tools >/dev/null 2>&1 || echo "Firebase plugin: marketplace add failed" >&2
fi
if ! claude plugin list 2>/dev/null | grep -q 'firebase@firebase'; then
  claude plugin install firebase@firebase >/dev/null 2>&1 || echo "Firebase plugin: install failed" >&2
fi

# Cloudflare plugin (official; Cloudflare's skills, e.g. Wrangler and Workers best practices, and its MCP server; owner,
# 16 Oct 2026, from https://developers.cloudflare.com/agent-setup/prompt.md). The MCP server signs in with OAuth on first use.
if ! claude plugin marketplace list 2>/dev/null | grep -q '> cloudflare$'; then
  claude plugin marketplace add cloudflare/skills >/dev/null 2>&1 || echo "Cloudflare plugin: marketplace add failed" >&2
fi
if ! claude plugin list 2>/dev/null | grep -q 'cloudflare@cloudflare'; then
  claude plugin install cloudflare@cloudflare >/dev/null 2>&1 || echo "Cloudflare plugin: install failed" >&2
fi

# context-nudge: reminds the owner to /save-state and /compact at 50% and 75% context (tools/context-nudge).
if ! claude plugin marketplace list 2>/dev/null | grep -q anawj-tools; then
  claude plugin marketplace add "$PWD/tools/context-nudge" >/dev/null 2>&1 || echo "context-nudge: marketplace add failed" >&2
fi
if ! claude plugin list 2>/dev/null | grep -q 'context-nudge@anawj-tools'; then
  claude plugin install context-nudge@anawj-tools >/dev/null 2>&1 || echo "context-nudge: install failed" >&2
fi

if ! command -v codex >/dev/null 2>&1; then
  npm install -g @openai/codex >/dev/null 2>&1 || echo "Codex CLI: npm install failed" >&2
fi

if command -v codex >/dev/null 2>&1 && ! codex login status >/dev/null 2>&1 && [ -n "${OPENAI_API_KEY:-}" ]; then
  printenv OPENAI_API_KEY | codex login --with-api-key >/dev/null 2>&1 || echo "Codex CLI: API key sign-in failed" >&2
fi

exit 0
