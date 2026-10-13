# Design status

Short and current, like `logbook/STATUS.md` (same layout and rules). The rules themselves are in `README.md` (the
NUHS-style guide) and `tokens.css`. Update with `/save-state` (Claude Code) or `$save-state` (Codex).

Last updated: 2026-10-13 by Claude Code, design session (branch `claude/inspiring-dijkstra-pctmrf`).

## Now

- No session is working on `nuhsdesign/`. The design session is idle, nothing half-done.

## Waiting on the owner

- "Kent Ridge Clinical" design system (claude.ai artifact, https://claude.ai/artifact/4DzjjFcDa1FEbScP3CaMwp) is
  private: share it from its Share menu if other sessions or people should build from it. It holds the website style
  (`kr-page`) and the app theme taken from the logbook (`kr-app`: grey ground, rounded cards, chips, bottom tab bar,
  44px targets), with the same tokens as `tokens.css`.

## Next (agreed queue)

- Retire the old path: `design/tokens.css` is a byte-identical copy kept for pages and service workers still on
  `../design/tokens.css`. Once nothing links it (`git grep -n "design/tokens"`; prewarm #364 adds
  `prewarm/update.html`, which must link `../nuhsdesign/`) and the apps have updated, delete it and drop `/design/`
  from `SHARED` in `worker/routes.js` and its tests in `worker/test/` (or ask the hosting session to).

## Recently done

- #363 `design/` moved to `nuhsdesign/` (every subdomain serves it); evals, prewarm and prewarm-update link it. Checked live: tokens load on
  `prewarmstudy.`, `apmes.` and `anawj.com`; the prewarm and evals service workers install and cache them.
- #204 The brand stripe is four equal quarters (orange, red, blue `#178fd7`, navy) in `design/`, logbook, evals,
  roster and privacy; new `--n-stripe-blue`.
- #61 Navy focus ring (3px) in `design/` and the logbook; cyan only on navy panels.
- #49 `design/`: the NUHS-style guide (`index.html`), tokens and components (`tokens.css`), `README.md`.

## Decisions log

- 2026-10-13: The design folder is `nuhsdesign/` (owner), so every subdomain can serve it. Changes to the design,
  `prewarm/` or `prewarm-update/` wait while a prewarming study case is being collected (they change what the
  phones load).
- 2026-10-12: The top band is four equal quarters: orange `#e57200`, red `#e4002b`, blue `#178fd7`, navy `#002f6c`
  (measured across the whole nuhs.edu.sg stripe; the first guide sampled three points and missed the blue). Not cyan.
- 2026-10-10: Focus rings are navy (`--n-focus`) on light grounds; cyan `#00a9e0` is 2.7:1 on white, under 3:1.
- 2026-10-10: The guide and the design system copy the look only: no NUHS logo, and the claude.ai system is named
  "Kent Ridge Clinical", not NUHS.
