# Handover: Claude Code, Logbook 3 (log3), 17 Oct 2026

The three logbook sessions are being merged into one, **APMES Logbook** (`session_016HpHN2kgnP6mwgTMoZ6yCN`), which carries
on from this file. log3 stops here (the owner archives it). Read this file, then `logbook/STATUS.md` and `logbook/NOTES.md`.
Public-safe: private details are in the owner's private repo (`flamingbeing/life`; its `README.md` says what to read; cloud
sessions load it at start, or attach it with `add_repo`). Delete this file once you've folded what you need into your own.

Branch `ccr-2994049c-4e5tlt` (reset to `origin/main` at each start; its remote copy only carries already-merged history,
nothing to rescue).

## Open work

- **Open PRs: none** (anawj-site, hi, anantf-site, life). Nothing unpushed, nothing half-done.
- Two open PRs in the private repo belong to other sessions (not mine).

## Merged by log3 (this session)

anawj-site: #164 Codex plugin set up in cloud sessions; #165 on-demand axe-core accessibility check; #167 Codex needs the
owner's approval; #168 shared instructions moved to `AGENTS.md`; #169, #171, #174 PR previews on Cloudflare (Workers Builds);
#176 Firebase plugin (ask the owner before any use); #178, #182, #185, #188 STATUS saves; #181 Notes review fixes (owner-only
note index, bin limit, listener; rules deployed); #487 **APMES People** (`people/`); #684, #685, #687, #688 the public/private
split (private details moved to the private repo, pointers left; startup step loads it); #720 the save-state skill covers the
split. Other repos: hi #14, #15 and anantf-site #137 (owner's own lines only; Shi Hao's untouched); private repo #9–#13.

## What log3 left running

- Scheduled tasks (`create_trigger`, `send_later`): **none made.** (A 14 Nov reminder exists in log2's session; the thing it
  reminds about is already done: see "Waiting on the owner".)
- Watches (`watch_url`): none. PR subscriptions: none left (all PRs merged, auto-unsubscribed).
- Sub-agents: all finished. Local scratch worktrees removed.
- Messages: the home-computer session (firetop) did the response-sheet job and was told the permission is recorded; the CCC 360
  session sent an FYI (role rules, #751; nothing to answer). I told the other sessions about the split on 16 Oct. **No reply
  is owed to anyone.** Not messaged (repo unclear): the "Open source webapp deployment" and "Shi Hao message inquiry"
  sessions: tell them if the owner says they work in these repos.

## Decisions and rules from the owner (all now in the files named)

- Public/private split (16 Oct): `AGENTS.md`, "Keep the repo public-safe". Git history was left as it is on purpose
  (owner: "i just dont want the private stuff to be tooo obvious in the public repo").
- Live Firebase/Cloudflare changes go as jobs to the home-computer session, not to the owner: `AGENTS.md`, "Cloud changes go
  through firetop"; limits in the private notes (`ops/`).
- anantf-site is shared with Dr Chew Shi Hao: only the owner's own additions were touched, and nothing there names the private
  repo (a rule in the private repo's `CLAUDE.md`). Neutral wording for private things anywhere public: "(details in the
  owner's private notes)" or "ask the owner".
- Roster example names in tests are made up (owner, 16 Oct): no action.
- The response sheet's public link was closed (owner OK, firetop did it, 16 Oct).
- People app (13 Oct): reuse evals' sign-in, storage and People panes; no rules change was needed; one shared list for logbook
  and evals. Details: `people/NOTES.md`. Other sessions have since extended it (roster import, rotations, roles `access/`, CCC
  360): treat People as shared; run `node people/test/e2e.mjs` after touching it or the evals files it imports.
- Lasting rules were already in `AGENTS.md` / `logbook/NOTES.md`; nothing new is waiting to be copied.

## Waiting on the owner (what I need from him)

1. **Glance at the response sheet's Apps Script Executions page once** (Form handler `onFormSubmit` and `logbookOutboxRun`
   still run without errors after the link was closed; firetop can't see that page). Tell me/log1 "fine" or the error.
2. **Add the private notes repo to Codex's environment** (Codex settings) so Codex sees it; Codex otherwise asks him.
3. **Tick the private notes repo when starting an anantf-site session** (that repo's startup step can't load it, by design).
4. Private-repo housekeeping (stale branches): details in his private notes.
5. **Decide** whether the pacemaker-magnet locations should leave the published MO guide's content (anantf-site; his call, a
   content change, not a docs one).
6. Still open from before (see `logbook/STATUS.md`, "Waiting on the owner"): nothing of log3's.

## Next (queue, in order; none started)

1. **Nothing is urgent from log3.** Keep People healthy: after any change to `logbook/firestore.rules` roles or to the evals
   files People imports (`cloud.js`, `ui-core.js`, `ui-admin.js`), run `node people/test/e2e.mjs` and `tools/test-rules.sh`.
2. People ideas, only if the owner asks (all in `people/NOTES.md`, "Ideas for later"): bulk status change (e.g. a whole intake
   to Graduated) and an "R5s this year" list before July; faculty "last assessed" date from evals; "Change email" (moves a
   person's logbook and evaluations without losing history; needs a permanent ID first).
3. Logbook queue item 4 in `logbook/STATUS.md` (lazy-load rarely used modules to cut first-visit time: measure before and
   after; low priority, the owner hasn't asked).
4. When an old log3 branch warning appears at stop time ("N unpushed commits" after a squash-merge): it is only history that
   is already in main. `git fetch origin <branch>; git merge -s ours origin/<branch>; git push` (never force-push); for a
   missing remote branch just push.

## Gotchas learned (also useful to log1)

- After a squash-merge, the session branch carries stale history: reset to `origin/main` at each start.
- `expectedHeadSha` for merging a PR must be the full 40-character sha.
- GitHub's browser check ran an accessibility check on a toast still fading in and on a hovered row's grey text: People's
  e2e waits 300 ms before axe, and a hovered `.e-row` meta line is now darker (`evals/style.css`).
