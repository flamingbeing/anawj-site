# build (NTF Roster build session)

2026-10-15: first version built and integrated on branch `claude/practical-pasteur-ff2uqp`. Unit tests (rules,
solver, io), `test/e2e.mjs` (desktop, phone, fresh start, axe) and `tools/test-rules.sh` pass. Next: open the PR,
check the preview, merge when the Checks are green; then the owner's answers on rule numbers and code meanings
(`STATUS.md`, Waiting on the owner).

2026-10-15: review fixes done (engine, UX, robustness; see `STATUS.md` Recently done). Unit, emulator and browser tests
green. Same next steps.

2026-10-15: the owner's "a bit too slow? also use the new NTF design language for webapps": speed work and the NTF app
design merged (see `STATUS.md` Recently done). Unit, browser (`e2e.mjs`, 101 checks with axe) and speed
(`perf.e2e.mjs`, now in the Checks workflow) tests green. Same next steps: PR, preview, merge.

2026-10-15: the second review of the speed and design work fixed (solver on tight departments, month-switch redraw,
paint Clear, import review on phones, phone screen head, back buttons, rule rows and builder, targets, colours; see
`STATUS.md` Recently done). Unit, browser (`e2e.mjs`) and speed (`perf.e2e.mjs`) tests green. Same next steps.
