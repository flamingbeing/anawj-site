# anawj.com: Claude Code

@AGENTS.md

The shared instructions are in `AGENTS.md` (imported above). Only Claude Code–specific notes belong in this file.

## Firebase and Cloudflare: only on demand, only with the owner's approval

Sessions do not preinstall the Firebase or Cloudflare plugins (or Codex). Prefer `npx firebase-tools` and `npx wrangler`.
If the owner approves a plugin for a task: `claude plugin marketplace add firebase/firebase-tools` then
`claude plugin install firebase@firebase` (Cloudflare: `cloudflare/skills`, `cloudflare@cloudflare`); its tools may only
appear after a restart.

The Firebase tools act with the owner's own Google access and can read live data, including residents' private
reflections that the Firestore rules hide even from the app owner. **Never use them (MCP tools, `firebase` or
`npx firebase-tools`, `firebase login`) without the owner's approval in that session.** Prefer settings, rules and usage
over reading documents; never change projects, rules, auth or data through them (rules deploy only through the merge
workflow). `.claude/settings.json` makes these calls ask first.

Exception: the **local Firestore emulator** with fake accounts and the demo project (`tools/test-rules.sh`, or
`firebase emulators:exec --project demo-logbook …`) is fine without asking: it never signs in or touches live projects.
Commands that sign in, deploy or talk to `apmes-logbook` / `nuh-roster` need the owner's OK.

The site's Workers deploy only through Workers Builds on merge (PREVIEWS.md); never deploy or change Cloudflare settings
without the owner's OK.
