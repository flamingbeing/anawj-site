# build (NTF Roster build session)

2026-10-15: first version built and integrated on branch `claude/practical-pasteur-ff2uqp`. Unit tests (rules,
solver, io), `test/e2e.mjs` (desktop, phone, fresh start, axe) and `tools/test-rules.sh` pass. Next: open the PR,
check the preview, merge when the Checks are green; then the owner's answers on rule numbers and code meanings
(`STATUS.md`, Waiting on the owner).

2026-10-15: review fixes done (engine, UX, robustness; see `STATUS.md` Recently done). Unit, emulator and browser tests
green. Same next steps.

2026-10-17: all four PRs merged (#580, #605, #606, #610) and the app is live at ntfroster.anawj.com. Nothing open or
half-done. Possible bug to check if the owner confirms it: importing a real October did not bring in the current calls
(see `STATUS.md`, Now).
