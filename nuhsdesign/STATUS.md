# Design status

Short and current, like `logbook/STATUS.md` (same layout and rules). The rules themselves are in `README.md` (the
NUHS-style guide) and `tokens.css`. Update with `/save-state` (Claude Code) or `$save-state` (Codex).

Last updated: 2026-10-15 by Claude Code, design session (branch `claude/inspiring-dijkstra-pctmrf`).

## Now

- Design session: the app kit rollout is done (#592, #611, #613, #625). Nothing half-done.

## Waiting on the owner

- "Kent Ridge Clinical" design system (claude.ai artifact, https://claude.ai/artifact/4DzjjFcDa1FEbScP3CaMwp) is
  private: share it from its Share menu if other sessions or people should build from it. It holds the website style
  (`kr-page`) and the app theme taken from the logbook (`kr-app`: grey ground, rounded cards, chips, bottom tab bar,
  44px targets), with the same tokens as `tokens.css`.

## Next (agreed queue)

1. NTF roster: suggest the kit to its own session (built by another session; don't restyle it from here).
2. Possible, not asked for: list and detail side by side (`.a-split`) on computers for evals and the hand log; dark
   mode for the other kit apps once each is checked in dark.
- **Not prewarm** (owner, 15 Oct, via the prewarm session): "highly important app must stay up, skip breaking
  changes". Prewarm keeps its look unless the owner says otherwise in the design session's own chat.
- The logbook keeps its own styles.

## Recently done

- #625 Evals and People on the app kit (dark theme kept, on the kit's dark colours).
- #613 NUH roster on the app kit (and a phone overflow fix with wide fonts).
- #611 Hand log and hand assessment on the app kit.
- #592 The app kit: `nuhsdesign/app.css`, `app.js`, demo `app.html`, README "App kit" (phone, tablet, computer).
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
