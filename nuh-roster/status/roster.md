# roster (Claude Code, NUH Roster session)

Last updated: 2026-10-17.

13 Oct: built most of `../REVIEW-2026-10.md` (#407–#473, see its "Done on 13 Oct"). A last bug review's 20 findings are fixed
(#476–#478). The stricter rules are live (#492, 14 Oct); the browser test was fixed
in #491. Nothing in progress.

16-17 Oct: no roster code changed. Cloud changes (Firebase, Cloudflare) now go to the firetop session as jobs (rule in
`../../AGENTS.md`, #683). Optional, not started: make the Practice "Fix 3 problems" step fully repeatable by letting the
test fix the random seed (it is stable since #491, so only if it flakes again).

To pick up: read `../STATUS.md` (Waiting on the owner, Next) and `../NOTES.md`. The browser test is
`node nuh-roster/test/e2e.mjs` (also in CI); rules tests are `tools/test-rules.sh`.
