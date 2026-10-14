# Now: Claude Code, Evals 1 (evals1)

**Claude Code, Evals 1 (evals1)** (branch `claude/charming-knuth-508520`): rules PR #428 (branch
`claude/evals-rules-tighten`, head 119795e) is approved by the owner but held: the Checks "browser" job fails in
`nuh-roster/test/e2e.mjs` ("practice task done with the fix buttons"), red on main too. Resume: when main's Checks are
green, merge main into #428, re-run `bash tools/test-rules.sh` if the rules file changed, then squash-merge #428 and
check the "Deploy Firestore rules" run. Otherwise idle. Then: `evals/STATUS.md` (Next), `NOTES.md`, `IMPROVEMENTS.md`.
