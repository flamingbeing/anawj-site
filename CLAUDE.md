# anawj.com

Static site on GitHub Pages (public repo: no names, patient data or real evaluation data). Apps share one origin:

- `evals/`: APMES workplace-based assessments. Start with `evals/NOTES.md` (decisions, MedHub, forms, operations), then `evals/README.md`.
- `logbook/`: APMES case logbook. Start with `logbook/NOTES.md` (principles, words, screens, tags, demo, how to test), then `logbook/README.md`.
- `nuh-roster/`: NUH anaesthesia daily roster (own Firebase project `nuh-roster`). Start with `nuh-roster/NOTES.md`: its department section (grades, postings, roster sheet, notation, HMS monthly rosters, short names) applies to any app dealing with NUH anaesthesia staff.
- `design/tokens.css`: shared design tokens.

Rules that bite:

- `logbook/firestore.rules` is the one rules file for both logbook and evals (Firebase project `apmes-logbook`). It deploys automatically on merge to main; never ask the owner to paste rules.
- `nuh-roster/firestore.rules` (Firebase project `nuh-roster`) deploys the same way.
  How: `.github/workflows/deploy-firestore-rules.yml` deploys a changed file to its project on merge to main
  (check the "Deploy Firestore rules" run in Actions). It compiles the rules first, so a syntax error fails the run
  and leaves the live rules as they were. It signs in with the `FIREBASE_SERVICE_ACCOUNT` secret (service account
  `firebase-rules-deployer@apmes-logbook.iam.gserviceaccount.com`, Firebase Rules Admin on both projects); sessions
  never need the secret. A manual run (Run workflow) deploys both files over the live rules: ask the owner first.
  A new Firestore-backed app needs a matrix entry and paths filter in the workflow, and the owner grants that
  service account Firebase Rules Admin on the new project.
- `evals/js/catalogue.js` and `evals/js/forms.js` are generated. Edit `evals/reference/` or `evals/tools/build-data.mjs`, then run `node evals/tools/build-data.mjs`.
- Changing any file in an app's `sw.js` SHELL list means bumping that app's `VERSION`.

Before merging, run:

```
node tools/check.mjs
for f in evals/test/*.test.mjs logbook/test/*.test.mjs nuh-roster/test/*.test.mjs; do node "$f"; done
```

For evals UI changes, also run the e2e test (see `evals/README.md`).

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
