# context-nudge

A small Claude Code mod. When the context passes 10% (then 15%; on a 1M window that is 100k and 150k tokens), it shows a dim line above the prompt and a
one-off toast: "Run /save-state, then /compact." It only reminds; it never compacts or saves anything.

Cloud sessions install it from `.claude/hooks/session-start.sh` (local marketplace `anawj-tools`).
To change the thresholds, edit `STEPS` in `hooks/register.tsx`.
