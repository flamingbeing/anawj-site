# anawj.com

Instructions for every AI assistant working here (Claude Code reads this through `CLAUDE.md`).

Static landing site on GitHub Pages (anawj.com) plus one Cloudflare Worker (`anawj-preview`) for design.anawj.com and
the anaes.anawj.com forwards. **Public repo: fake data only; no names, patient data, secrets or tokens.** Anything
private goes in the owner's private notes, not here; leave at most that pointer.

Since the repo split (21 Oct 2026) every app lives in its own group repo with its own Worker; this repo keeps only:

| What | Folder | Address |
|---|---|---|
| Home page (server up or down, no app links) | `index.html` | `anawj.com` |
| Privacy page | `privacy/` | `anawj.com/privacy/` |
| Obsidian link forwarder (opens a note in the phone app; no data, not linked) | `o/` | `anawj.com/o/#vault=NAME&file=PATH` |
| Old-address forwards | `<old folder>/index.html`, `404.html`, `moved.json` | `anawj.com/<old folder>/...` |
| NUHS design kit | `nuhsdesign/` | `design.anawj.com/v1/` |
| Feedback button | `feedback/` | `design.anawj.com/v1/feedback/` |
| App icon set for every group repo | `tools/app-icons/` | not served on its own; copied into each app |
| Site-wide session notes | `status/` | not served |

Where the apps went (`moved.json` is the list the forwards use): `apmes` (logbook, evals, people, applicants, 360,
programme documents; apmes.anawj.com), `rosters` (nuh-roster, ntf-roster, nuh-junior-monthly), `prewarm`
(prewarmstudy.anawj.com), `hand` (hand.anawj.com: babies, handlog, cmcj), `owner-tools` (Ask Claude, ask.anawj.com).
The page editor was retired on 21 Oct 2026 (owner); Ask Claude takes page-edit requests. The BIS to DSA and OT simulators
live in the anantf site repo (`NTF-Anaesthesia/anantf-site`). Hosts: [SUBDOMAINS.md](SUBDOMAINS.md). Security:
[OPERATIONS.md](OPERATIONS.md).

## Rules that bite

- **The home page stays unlisted:** it only shows whether the server is up. Never link apps from it; every page has
  `<meta name="robots" content="noindex, nofollow">` (GitHub Pages ignores `_headers`).
- **The kit is shared:** other repos load `design.anawj.com/v1/`. Never break `/v1/`; a breaking change goes in `/v2/`
  beside it (`worker/routes.js`).
- **Forwards:** a moved folder keeps a small `index.html` that forwards (path, query and # kept), and `404.html` forwards
  deeper old links using the same list. The logbook's forward first offers what a browser saved at the old address as a
  settings file. Add a line to `moved.json` (and the `404.html` copy) when another address moves.
- **New apps go in a group repo**, not here (the owner's plan; ask before adding an app folder).
- **PR titles** start with the area ("Kit: …", "Landing: …").
- **Previews are off** (`preview_urls: false`); check the Worker locally with `npx wrangler@4 dev --local`.

## Before merging

GitHub runs these on every PR ("Checks"; red means don't merge). Merge your own PRs once they pass, by the number the
PR creation returned (never a guess), and report with the link.

```
node tools/check.mjs
for f in worker/test/*.test.mjs feedback/test/*.test.mjs; do node "$f"; done
node tools/proofread.mjs
node feedback/test/e2e.mjs   # needs checkouts of hand, rosters and prewarm beside this repo (SIBLINGS=<dir>)
```

## Showing and saving work

- **Build minutes are limited:** push once per finished step, not to save work in progress.
- **Status:** update `STATUS.md` when a task finishes or a decision is made, and before compacting or ending
  ([save-state skill](.agents/skills/save-state/SKILL.md)); edit only your own `status/<session>.md`. Lasting
  rules go in `NOTES.md`, or here if they apply to the whole repo.

## Claude Code–Codex handovers

Both assistants run in separate cloud environments. Use [the shared handover skill](.agents/skills/claude-codex-handover/SKILL.md)
and GitHub PRs. Review a checkpoint without changing its branch; take over only after all writers have stopped, on
your own branch, linking the original PR. Handover tasks need explicit human approval before merge.

Token savers: `.claude/settings.json` denies reading `__/`, `vendor/` folders and generated data files (edit their
  build scripts instead). Ask the owner if one is really needed.
