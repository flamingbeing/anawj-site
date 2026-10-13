# Site status

Site-wide work that belongs to no single app: the homepage, subdomains and hosting, accounts and operations, repo
rules, the roadmap. Each app keeps its own `STATUS.md`. Short and current; lasting rules go in `AGENTS.md`.
"Recently done" is updated at save-state only.

Last updated: 2026-10-13 by Claude Code, homepage session.

## Now

Each session keeps its own line in `status/<session>.md` (`homepage.md`; a new session adds its own file).

## Waiting on the owner

- Fill in the domain registrar and renewal date in `OPERATIONS.md` (accounts table).
- Optional, from the pre-launch checklist in `OPERATIONS.md`: Firestore delete protection on the three databases
  (free; the home-computer session can do it), and App Check.

## Next

Nothing agreed. Ideas for later are in `ROADMAP.md`; nothing there is a task until the owner asks.

## Recently done

- #398: owner profile in `AGENTS.md` reduced to a plain product version (personal version in the private repo); the
  two-step sign-in note removed from the public repo.
- #389: allow rules for tests and checks in `.claude/settings.json`.
- #386, #388, #391: the home-computer session in `OPERATIONS.md` (what to hand it, its daily backup and uptime
  checks); `AGENTS.md` rule: blocked by the cloud environment, hand it over.
- #378: Firestore backups (daily, 7 days; point-in-time recovery for prewarm), budget alert, all projects on Blaze.
- #350, #360, #362, #385: subdomain plan and progress; every step done (`SUBDOMAINS.md`).
- #353, #369, #374–#377: `OPERATIONS.md` and `ROADMAP.md` created.
- #341, #345: homepage rule and `noindex` on every app page.
- #30: homepage shows only server status; apps unlisted.

## Decisions log

- 2026-10-13: personal material about the owner lives in the private repo `life`; this repo keeps plain product
  versions only (owner).
- 2026-10-13: production operations (Google Cloud, backups, secrets, the owner's real documents) go to the
  home-computer session, with the owner's OK per change (owner).
- 2026-10-13: a PR changing any `firestore.rules` waits for the owner's approval.
- 2026-10-13: apps that save data or sign in get their own subdomain; static pages share one by topic
  (`hand.`, `apmes.`, `nuhroster.`, `prewarmstudy.`); `anawj.com` keeps only the status page (owner).
- 2026-10-13: no NAS backup of study data and no weekly spend report (owner's choice).
