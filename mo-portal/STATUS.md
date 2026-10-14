# Baby MO Portal status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-14 by Claude Code (first version).

## Now

Each session keeps its own line in `status/<session>.md`.

## Waiting on the owner

- Create the Firebase project (`SETUP.md`, steps A to E, about 20 minutes), then send the config block to Claude.
- Add `mo.anawj.com` as a custom domain in Cloudflare (as for the other subdomains; `SUBDOMAINS.md`).
- Step F of `SETUP.md` (workflow entry + Rules Admin for the deployer account) goes with the PR that holds the rules:
  a rules PR waits for the owner's approval.
- Import the question bank (a JSON file handed over in the session, not in this repo) and have faculty check the 16
  drafts, especially the 10 v3 questions that had no answer key.

## Next (ideas, not agreed)

1. CBD discussion module, feedback and questions (the owner wants the portal to grow into this).
2. Per-MO history across attempts and a "retake after X days" rule.
3. Optional shuffling of choices per question.

## Recently done

- 2026-10-14: first version: test taking (timer, resume, review, outbox), faculty editor (drafts, history, paste many,
  CSV, backup, pictures), results by person and by question, settings, rules and tests.
