# anawj.com: Claude Code

@AGENTS.md

The shared instructions are in `AGENTS.md` (imported above); put anything that applies to Codex too there.
Only Claude Code–specific notes belong in this file.

## Firebase and Cloudflare plugins: install only when needed

Cloud sessions no longer install the OpenAI Codex plugin or CLI, and no longer preinstall the Firebase or Cloudflare
plugins (owner, 17 Oct 2026). Prefer `npx firebase-tools` and `npx wrangler` (no plugin needed), still only with the
owner's approval. If the owner approves a plugin for a task, install it then: `claude plugin marketplace add
firebase/firebase-tools` and `claude plugin install firebase@firebase` (Cloudflare: `claude plugin marketplace add
cloudflare/skills` and `claude plugin install cloudflare@cloudflare`); its tools may only appear after the session restarts.

The official Firebase plugin (`firebase/firebase-tools` marketplace; its MCP server runs
`npx -y firebase-tools mcp`) acts with the owner's own Google access, so it can read live data, including
residents' private reflections and notes that the Firestore rules hide even from the app owner. **Never use it
without the owner's approval in that session**: no Firebase MCP tool call, `firebase` or `npx firebase-tools`
command, and no `firebase login`, until the owner says yes to that use. Prefer settings, rules and usage over
reading documents; never change projects, rules, auth or data through it (rules deploy only through the merge
workflow). Sign-in is per session and only when a task needs it. (`.claude/settings.json` makes these calls ask
first.)

Exception: the **local Firestore emulator** with fake accounts and the demo project (`tools/test-rules.sh`, or
`firebase emulators:exec --project demo-logbook …`) is fine without asking (owner, 12 Oct 2026): it never signs in or
touches the live projects. Commands that sign in, deploy or talk to `apmes-logbook` / `nuh-roster` still need the
owner's OK.

## Cloudflare plugin

Cloudflare's official plugin (`cloudflare@cloudflare` from the `cloudflare/skills`
marketplace; owner, 16 Oct 2026; installed on demand, see above) brings Cloudflare's skills (Wrangler, Workers best
practices and more) and the Cloudflare MCP server, which signs in with OAuth the first time a Cloudflare tool is used.
The site's Workers still deploy only through Workers Builds on merge (PREVIEWS.md); never deploy or change Cloudflare
settings through the plugin without the owner's OK.

## context-nudge mod

Cloud sessions also install `tools/context-nudge` (a small Claude Code mod, via `.claude/hooks/session-start.sh`).
It shows a reminder above the prompt when the context passes 10% and 15%: run `/save-state`, then `/compact`. It
only reminds; never compact for the owner without them asking.
