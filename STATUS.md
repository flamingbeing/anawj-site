# Site status

Site-wide work that belongs to no single app: the homepage, subdomains and hosting, repo rules. Each app keeps its own
`STATUS.md`. Lasting rules go in `AGENTS.md`. "Recently done" is updated at save-state only. What is now, waiting, next
and decided: details in the owner's private notes.

Last updated: 2026-10-21.

## Recently done

- 23 Oct: **app icon set** in `tools/app-icons/` (33 icons in three families, renderer with safe-zone checks and a
  review sheet); the apps take them up from their own repos.
- 21 Oct: **landing only** (repo split, last step): every app folder removed (they live in their group repos: apmes,
  rosters, prewarm, hand, owner-tools); old `anawj.com/<folder>/` addresses forward to the new hosts (`moved.json`,
  `404.html`); the Worker serves only design.anawj.com and the anaes forwards; previews off; the page editor retired;
  the Firestore rules and PR-screenshot workflows removed (each group repo deploys its own rules).

- 16 Oct: the **BIS to DSA and OT simulators moved to anantf.com** (`/bis/`, `/ot/`; NTF-Anaesthesia/anantf-site #130,
  with their own Checks). `anaes.anawj.com/bis/`, `/ot/` and `anawj.com/bis-dsa/`, `/ot-sim/` forward there.
- #489, #555, #557, #558: **Ask Claude** at `ask.anawj.com` (owner only, behind Cloudflare Access; a request becomes a
  `Page edits:` issue that the instant workflow drafts); AI proof-read routine (fortnightly); the page-edits workflow says on
  the issue or PR when it fails.
- #435–#454: feedback follow-ups: Share with a QR code (editor and button), compare a preview with how it is now,
  fixes from a review (live-app privacy, iPhone picking, PR match), app version in problem reports; **Checks** on every
  PR (repo check, unit tests, proof-read, quick browser tests, `.github/workflows/checks.yml`) and **before-and-after
  phone screenshots** as one PR comment (`pr-screenshots.yml`; pictures on the history-less `pr-screenshots` branch).
