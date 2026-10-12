---
name: save-state
description: Save task status and key decisions to the repository before compacting or ending a session in anawj-site, so the next context (or another assistant) can carry on from the files instead of chat history.
---

# Save state

Use when the owner says "save state", before `/compact`, when a session is about to end, or after a decision worth
keeping. The goal: everything needed to carry on is on main, not only in this conversation.

1. **Which app.** Update the STATUS.md of each app this session worked on (`logbook/STATUS.md`, `evals/STATUS.md`,
   `nuh-roster/STATUS.md`). Create one from `logbook/STATUS.md`'s layout if it doesn't exist.
2. **STATUS.md** (short; replace stale lines rather than adding):
   - **Now**: only your own session's line: what you are doing, branch / open PR, anything half-done and how to
     resume it. Never rewrite another session's line.
   - **Waiting on the owner**: things only the owner can do; remove ones they've confirmed done.
   - **Next**: the agreed queue, in order, with enough detail to start without the chat.
   - **Recently done**: add merged PRs (one line each, with the PR number); keep about the last 8.
   - **Decisions log**: dated one-liners for decisions made since the last save.
   - Update "Last updated" with the date and your session.
3. **NOTES.md**: copy lasting rules, owner preferences and lessons (things true beyond this task) into the app's
   NOTES.md in its existing sections. Rules for every assistant go in `AGENTS.md`; Claude-only ones in `CLAUDE.md`.
4. **Public repo**: no patient data, names, real evaluation records, secrets or tokens.
5. **Commit and merge**: on your own session branch, from current main; a documentation-only PR may merge once
   `node tools/check.mjs` passes (unless it's part of a handover, which needs the owner's approval). If you have an
   open code PR, put the STATUS update in it instead.
6. **Tell the owner** in one or two lines what was saved and that it's safe to compact. After compacting (or in a
   new session), read the app's STATUS.md and NOTES.md first and carry on from "Now" and "Next".
