# anawj.com

Instructions for every AI assistant working here (Claude Code reads this through `CLAUDE.md`).

Static site on GitHub Pages plus one Cloudflare Worker for the subdomains. **Public repo: fake data only; no names,
patient data, real evaluation data, secrets or tokens.** Anything private goes in the owner's private notes, not here
(details in the owner's private notes); leave at most that pointer. Start with the app's `STATUS.md`, then `NOTES.md`.

| App | Folder | Host | Start with |
|---|---|---|---|
| APMES case logbook | `logbook/` | `apmes.anawj.com/logbook/` | `NOTES.md`, `README.md` |
| APMES assessments (evals) | `evals/` | `apmes.anawj.com/evals/` | `NOTES.md`, `README.md` |
| APMES People | `people/` | `apmes.anawj.com/people/` | `NOTES.md` |
| Applicants feedback | `applicants/` | `apmes.anawj.com/applicants/` | `NOTES.md`, `PLAN.md` |
| CCC 360 | `360/` | `apmes.anawj.com/360/` | `NOTES.md` |
| NUH daily roster | `nuh-roster/` | `nuhroster.anawj.com` | `NOTES.md` |
| NTF monthly roster | `ntf-roster/` | `ntfroster.anawj.com` | `NOTES.md`, `SPEC.md` |
| NUH junior monthly | `nuh-junior-monthly/` | `nuhjuniormonthly.anawj.com` | `NOTES.md` |
| Prewarming study | `prewarm/` | `prewarmstudy.anawj.com` | `NOTES.md`, `PLAN.md` |
| Hand surgery pages | `hand-babies/`, `hand-log/`, `cmcj/` | `hand.anawj.com/<babies, handlog, cmcj>/` | each `NOTES.md` |
| Page editor | `edit/` | `anawj.com/edit/` | `edit/NOTES.md` |
| Ask Claude | `ask/`, `worker/ask.js` | `ask.anawj.com` | `edit/NOTES.md` |
| Programme documents | `apmes/` | not served (guidebook only) | `apmes/README.md` |
| Design tokens, app kit | `nuhsdesign/` | every host, `/nuhsdesign/` | `README.md` |

The BIS to DSA and OT simulators live in the anantf site repo (`NTF-Anaesthesia/anantf-site`); work on them there.
Hosts: [SUBDOMAINS.md](SUBDOMAINS.md). Security: [OPERATIONS.md](OPERATIONS.md). Direction: [ROADMAP.md](ROADMAP.md).

## Rules that bite

- **Apps stay unlisted.** The homepage (`index.html`) only shows whether the server is up. Never link apps from it, and
  give each app page `<meta name="robots" content="noindex, nofollow">` (GitHub Pages ignores `_headers`).
- **Subdomains** (owner, 13 Oct 2026): an app that saves data or signs people in gets its own subdomain (apps sharing
  data or sign-in share one, like `apmes.`); static pages share one by topic (`hand.`). Never put a data app on a
  subdomain with apps it doesn't need to share with.
- **Firestore rules deploy live on merge** (`deploy-firestore-rules.yml`; the logbook's file also covers evals, people, applicants, 360). Run `tools/test-rules.sh` (local emulator, never the live projects), merge
  only when Checks are green, confirm the "Deploy Firestore rules" run, and report what the rules now allow or deny.
  Never loosen rules on real-data collections to pass a test. A manual run deploys over live rules: ask the owner.
  The workflow compiles the rules first, so a syntax error leaves the live rules as they were. A new Firestore-backed app
  needs a matrix entry and paths filter in the workflow.
- **Generated files:** `evals/js/catalogue.js` and `forms.js`. Edit `apmes/` or `evals/tools/build-data.mjs`, then run
  `node evals/tools/build-data.mjs`.
- **Service workers:** don't bump `sw.js` `VERSION` by hand. The deploy stamps it (`tools/stamp-versions.mjs`) as
  `<app>-<date>-<hash>`; change the base (`logbook-v40`) only when the worker's own logic changes.
- **App version lines:** every app with a service worker ends its settings screen (or footer) with small muted
  `App version 2026-10-14 (3f9a2c1d)` (from its `<app>-` cache name) and a `Not updating? Get the latest version`
  button: fetch `sw.js` with `cache: 'no-store'` first, then unregister only this app's worker, delete only `<app>-`
  caches, reload. Never touch saved data or sign-in.
- **PR titles** start with the app ("Logbook: …"); a workflow labels PRs by folder. One PR number sequence for all apps.
- **Blocked by the cloud environment** (no Google Cloud sign-in, real documents, a secret)? Ask the owner to pass it to
  the owner's private helper. No secrets or patient data in a request. Firebase and Cloudflare tools only with the
  owner's approval in that session (`CLAUDE.md`).
- **Vital apps** (`prewarm/`, live study data; `logbook/`): full tests before merging, and nothing
  merged into prewarm while the owner says a case is being collected.

## Before merging

GitHub runs these on every PR ("Checks"; red means don't merge). Merge your own PRs once they pass, by the number the
PR creation returned (never a guess), and report with the link. Handover PRs wait for the owner's approval.
Beta (PREVIEWS.md, "Beta") is opt-in: only when the owner asks for it, or for sign-in or Firestore-rules changes,
point `beta` at the branch, send him the beta link and merge on his "ship it". Otherwise PRs merge once Checks pass.

```
node tools/check.mjs
for f in evals/test/*.test.mjs logbook/test/*.test.mjs nuh-roster/test/*.test.mjs ntf-roster/test/*.test.mjs prewarm/test/*.test.mjs people/test/*.test.mjs applicants/test/*.test.mjs 360/test/*.test.mjs worker/test/*.test.mjs feedback/test/*.test.mjs; do node "$f"; done
```

Per app, as well (only the touched app while iterating):

- Logbook: `tools/test-logbook.sh` (`quick` skips the full e2e), plus `node logbook/test/e2e/a11y.mjs` after UI changes.
- Rules: `tools/test-rules.sh`. Prewarm: `tools/test-prewarm.sh`. Evals UI: e2e in `evals/README.md`.
- Each other app: its `test/e2e.mjs` (NTF roster also `tour.e2e.mjs`, `perf.e2e.mjs`; applicants and 360 also `model.test.mjs`).
  Editor changes also run `node hand-babies/test/e2e.mjs`. New or moved pages: `node tools/proofread.mjs`.

## Showing and saving work

- **Show it:** every PR that changes a page gets an automatic before-and-after screenshot comment; add
  `Screens: /logbook/?demo#notes` to the PR body for more. Don't take or send your own screenshots or preview links
  unless the owner asks ([PREVIEWS.md](PREVIEWS.md)). Previews can't sign in, by design.
- **Build minutes are limited:** every push to a branch with a PR starts a Cloudflare build. Push once per finished
  step, not to save work in progress.
- **Status:** update the app's `STATUS.md` when a task finishes or a decision is made, and before compacting or ending
  ([save-state skill](.agents/skills/save-state/SKILL.md)); edit only your own `<app>/status/<session>.md`. Lasting
  rules go in `NOTES.md`, or here if they apply to the whole repo.

## Claude Code–Codex handovers

Both assistants run in separate cloud environments. Use [the shared handover skill](.agents/skills/claude-codex-handover/SKILL.md)
and GitHub PRs. Review a checkpoint without changing its branch; take over only after all writers have stopped, on
your own branch, linking the original PR. Handover tasks need explicit human approval before merge.

Token savers: `.claude/settings.json` denies reading `__/`, `vendor/` folders and generated data files (edit their
  build scripts instead). Ask the owner if one is really needed.
