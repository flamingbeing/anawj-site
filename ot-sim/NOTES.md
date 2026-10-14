# OT simulator notes

Lasting decisions for `ot-sim/`. Status and next steps: `STATUS.md`. The build brief for autonomous sessions: `PLAN.md`.

## Purpose and audience

- A teaching simulator of an anaesthetic in the operating theatre: induce, maintain and wake a synthetic patient with a
  general anaesthetic, watch a vitals monitor respond to what you do, and manage crisis scenarios (owner, 14 Oct 2026).
- For anaesthesia residents and new MOs. It teaches recognition and first response; it is not a clinical tool and never
  gives advice for a real patient. Say so on the page.
- One static site: no data, no sign-in, no storage beyond per-device settings. All patients are synthetic.
  Public repo: no real patient, case or hospital data, and no names.
- Lives at `anaes.anawj.com/ot/` (topic subdomain, shared with `/bis/`; `worker/routes.js`). Unlisted: `noindex`, never
  linked from the homepage. Relative paths only.
- Related: `bis-dsa/` (processed EEG; reuse its engine ideas, fonts and monitor look rather than redoing them).

## Principles

- **Physiology first, scenes second.** One patient model (pharmacokinetics and pharmacodynamics, haemodynamics,
  respiration and gas exchange, temperature) drives every number and waveform. A crisis is an event that changes the
  model (anaphylaxis lowers vascular resistance and raises airway pressure), never a canned script of numbers. The same
  model must therefore behave sensibly when the trainee does something unexpected.
- **Deterministic and seedable.** The model takes a seed and a fixed time step (`dt`), so a run replays exactly and
  tests can assert on it. Rendering reads the model; the model never reads the screen.
- **Faster than real time** is a feature (a 4-hour case in minutes) but the speed multiplier must not change the
  outcome, only how often the model steps (fixed `dt`, more steps per frame).
- **Teach, don't test, by default.** A debrief after each scenario: timeline of events and actions, what was missed,
  and the teaching points, with sources. No scores that reward speed over safety.
- **Sources for every clinical number.** Doses, thresholds, drug parameters and crisis management steps cite a
  source in code comments or `PLAN.md` (published PK/PD models; the AAGBI/ANZCA/SAGES/Difficult Airway Society and
  resuscitation guideline pages; Miller; Morgan & Mikhail). Flag anything unsure for the owner's clinical read-through;
  the owner checks all clinical content before it is described as reviewed.
- Singapore practice by default (owner is at NUH): units mmHg, kPa not used; temperatures °C; drugs by generic name;
  Mallampati, ASA, Cormack-Lehane as taught here. Metric doses (mg, mcg).
- Dark monitor, like the BIS page: near-black screens, standard colour coding (ECG green, SpO2 cyan, NIBP/ABP red/white,
  EtCO2 yellow/white, resp white, temperature, agent colours per ISO 32: sevoflurane yellow, desflurane blue,
  isoflurane purple, N2O blue, O2 white, air black/white). Phone first (390 px) then desktop, tablet landscape works.
- Accessibility: axe clean; every alarm has a text message as well as sound/colour; respects `prefers-reduced-motion`;
  sound is off until the user turns it on (browsers block autoplay anyway).

## Layout of the code (intended; see PLAN.md for the build order)

- `index.html`: shell and styles; `js/` ES modules, no build step, no dependencies (GitHub Pages / Workers serve files
  as they are; the editor and previews need that).
- `js/model/`: pure simulation, no DOM, importable by Node tests: `pkpd.js`, `cardio.js`, `resp.js`, `gas.js`,
  `temp.js`, `patient.js` (assembles them), `events.js` (crisis injection), `rng.js` (seeded).
- `js/ui/`: monitor, waveforms (canvas), controls (drugs, vent, fluids, airway), alarms, debrief.
- `js/scenarios/`: data files, one per scenario (`{ id, title, patient, steps, triggers, expected actions, teaching }`).
- `test/*.test.mjs`: model tests in Node (fast, no browser). `test/e2e.mjs`: browser smoke and flows with axe.

## How to test

- `tools/test-ot-sim.sh` runs the repo check, the model tests and the browser test (starts its own static server).
- `node ot-sim/test/<name>.test.mjs` for one model test. Browser: Playwright is preinstalled in cloud sessions
  (`PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright/index.mjs`, Chromium in `/opt/pw-browsers`; do not run
  `playwright install`).
- Phone screenshots (390 px) of every UI change go in the PR (AGENTS.md "Show it").

## Decisions log

- 14 Oct 2026: folder `ot-sim/`, address `anaes.anawj.com/ot/`, plain ES modules with no build step, model separate
  from UI so Node tests can run it. Environment prepared (routes, labels, checks, test runner, build brief).

## Permissions for unattended sessions (14 Oct 2026)

`.claude/settings.json` allows what a milestone loop needs without a prompt: the test scripts (`tools/test-*.sh`,
`node ot-sim/test/*` and other apps' tests), local static servers and `curl` to localhost, `git add/commit/checkout/
merge origin/main/pull`, pushes to `claude/*` branches, reading sources (web search and fetch, PubMed tools), and the
PR loop (open, update, read checks, merge your own PR). Sessions may edit `.claude/settings.json` to keep this list
current (owner's OK, 14 Oct 2026); widen it only for what the work needs, and say what you added in the PR.
It still **asks** for Codex, Firebase and anything that signs in to a live project (`CLAUDE.md`); never add allow rules
for a force-push to `main`, secrets or live-project sign-in.
Firestore rules (owner, 14 Oct 2026): a session may merge a PR that changes a `firestore.rules` without waiting for the
owner, because rules and data are the owner's biggest headache and he does not want to intervene. Do it carefully: run
`tools/test-rules.sh` (local emulator, fake accounts) first, merge only when the Checks are green, then confirm the
"Deploy Firestore rules" run succeeded, and say in the report which rules changed and what they now allow or deny. The
deploy compiles the rules first, so a syntax error leaves the live rules as they were. `ot-sim/` itself has no
Firestore (no data, no sign-in).
The permission *mode* is set in the app, not in the repo: pick **Auto** from the mode dropdown when starting the build
session. Settings are read from `main`, so they apply to new sessions once the PR is merged.
Network (checked 14 Oct 2026): GitHub, npm, PubMed/NCBI, ANZCA and MHAUS are reachable. If a guideline site is denied,
the owner adds the host under Allowed domains in the environment settings.
