# Design status

Short and current, like `logbook/STATUS.md` (same layout and rules). The rules themselves are in `README.md` (the
NUHS-style guide) and `tokens.css`. Update with `/save-state` (Claude Code) or `$save-state` (Codex).

Last updated: 2026-10-13 by Claude Code, design session (branch `claude/inspiring-dijkstra-pctmrf`).

## Now

- Design session (branch `claude/inspiring-dijkstra-pctmrf`): the app kit is PR #592 (phone, tablet and computer
  layouts). It waits only for `main`'s red **browser** check (`bis-dsa/test/e2e.mjs` "awake beta is cyan or green", red
  on main since #591, not this PR's). Then one PR per app, each already built and tested locally on this session's
  helper branches (not pushed): hand log + hand assessment, NUH roster, evals + People.

## Waiting on the owner

- "Kent Ridge Clinical" design system (claude.ai artifact, https://claude.ai/artifact/4DzjjFcDa1FEbScP3CaMwp) is
  private: share it from its Share menu if other sessions or people should build from it. It holds the website style
  (`kr-page`) and the app theme taken from the logbook (`kr-app`: grey ground, rounded cards, chips, bottom tab bar,
  44px targets), with the same tokens as `tokens.css`.

## Next (agreed queue)

Owner, 15 Oct 2026: a web-app design indistinguishable from a native app (from the logbook, the most polished), then
every app using the NUHS style moves onto it, except the logbook. One PR per app, each with screenshots and preview links:

1. App kit (`app.css`, `app.js`, `app.html`, README "App kit").
2. Hand log + hand assessment, NUH roster, Evals + People (built; ship after #592).
3. NTF roster: suggest the kit to its own session (it was just built by another session).
- **Not prewarm** (owner, 15 Oct, via the prewarm session): "highly important app must stay up, skip breaking
  changes". Prewarm keeps its look unless the owner says otherwise in the design session's own chat.

## Recently done

- #392 (log1) The old `design/` folder and `/design/` path are retired; every subdomain serves only `/nuhsdesign/`.
- #363 `design/` moved to `nuhsdesign/` (every subdomain serves it); evals, prewarm and prewarm-update link it. Checked live: tokens load on
  `prewarmstudy.`, `apmes.` and `anawj.com`; the prewarm and evals service workers install and cache them.
- #204 The brand stripe is four equal quarters (orange, red, blue `#178fd7`, navy) in `design/`, logbook, evals,
  roster and privacy; new `--n-stripe-blue`.
- #61 Navy focus ring (3px) in `design/` and the logbook; cyan only on navy panels.
- #49 `design/`: the NUHS-style guide (`index.html`), tokens and components (`tokens.css`), `README.md`.

## Decisions log

- 2026-10-15: The kit adapts to computers (sidebar, list and detail side by side, hover) as well as phones. Prewarm stays
  out of the restyle (live study). Apps that already have a dark theme (evals) keep it, on the kit's dark colours.
- 2026-10-15: Apps use the app kit: the phone's own font (brand from colour and the band), inset grouped lists, bottom
  sheets, switches, translucent bars, light only until each app is checked in dark. The logbook keeps its own styles.
- 2026-10-13: The design folder is `nuhsdesign/` (owner), so every subdomain can serve it. Changes to the design,
  `prewarm/` or `prewarm-update/` wait while a prewarming study case is being collected (they change what the
  phones load).
- 2026-10-12: The top band is four equal quarters: orange `#e57200`, red `#e4002b`, blue `#178fd7`, navy `#002f6c`
  (measured across the whole nuhs.edu.sg stripe; the first guide sampled three points and missed the blue). Not cyan.
- 2026-10-10: Focus rings are navy (`--n-focus`) on light grounds; cyan `#00a9e0` is 2.7:1 on white, under 3:1.
- 2026-10-10: The guide and the design system copy the look only: no NUHS logo, and the claude.ai system is named
  "Kent Ridge Clinical", not NUHS.
