# anawj.com: Claude Code

@AGENTS.md

The shared instructions are in `AGENTS.md` (imported above); put anything that applies to Codex too there.
Only Claude Code–specific notes belong in this file.

## Codex plugin in Claude Code sessions

Cloud sessions install the OpenAI Codex plugin and CLI (`.claude/hooks/session-start.sh`). **Never run Codex
without the owner's approval in that session**: no `/codex:*` command, `codex-rescue` agent, `codex` CLI call or
`codex-companion.mjs` run until the owner says yes to that use, and keep the stop-time review gate off. Say what
you would ask Codex and why, then wait. (`.claude/settings.json` also makes these calls ask first.)
