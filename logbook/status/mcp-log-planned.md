# Logbook MCP: log_planned, "Connect an AI assistant" (21 Oct 2026)

- `log_planned` (ids or `all_due`): due planned cases become cases on their planned date (source `paste`, personal tags
  kept, sheet outbox queued) and leave `logbook.plan`, like the Planned card's ✓ Done. Ones already logged are only
  removed from the plan. `list_plan` now shows each id.
- Settings card renamed "Connect an AI assistant (advanced)"; its text names Claude Desktop, Claude Code and Codex
  (`connectAiCard` in `js/app.js`; also README, docs, privacy page, e2e).
