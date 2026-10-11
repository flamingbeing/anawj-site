# Instructions for AI assistants working on anawj.com

Read [CLAUDE.md](CLAUDE.md) for the current site rules, app notes and required checks.
Those instructions apply to both Claude Code and Codex.

## Claude Code–Codex handovers

Both assistants run in separate cloud environments. Use
[the shared handover skill](.agents/skills/claude-codex-handover/SKILL.md)
and GitHub PRs to exchange pushed code and task context.

- Review a checkpoint without changing its branch or owner; report the reviewed SHA.
- Take over only after the sender/human confirms all writers have stopped. Continue
  on your own session branch and link its PR to the original.
- Include the branch/PR, goal, completed work, test results, blockers and next steps.
- Handover tasks require explicit human approval before merge or auto-merge, even
  where a general rule allows immediate merging.
- New cloud sessions get the skill through the repository clone. Do not modify an
  active Claude branch just to install these instructions.
