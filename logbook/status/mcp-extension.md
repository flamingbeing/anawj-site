# Logbook MCP: Desktop extension, bulk add, tag suggestions, plan list (21 Oct 2026)

- Claude Desktop extension: `logbook/mcp/tools/build-mcpb.mjs` stages it; `.github/workflows/logbook-mcpb.yml` tests,
  packs (official `mcpb` CLI 2.1.2, manifest 0.2) and, on main, replaces `apmes-logbook.mcpb` on the `logbook-mcp`
  release (stable link in `mcp/README.md` and Settings → Connect Claude). Sign-in starts by itself on the first tool call.
- New tools: `add_cases` (pasted list via `parseBulk` with the user's list format; source `paste`; dups skipped),
  `suggest_tags` (the app's `suggest`, untagged cases), `list_plan`, `plan_cases` (masked update of `logbook.plan` only).
- Not done: confirming planned cases from Claude (stays in the app); personal (non-APMES) tags in MCP writes.
- Check after merge: the workflow's first main run creates the release; download link works.
