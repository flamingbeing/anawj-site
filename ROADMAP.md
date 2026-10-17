# Roadmap

Where the owner wants the apps to go, and ideas not yet being built. Sessions read it for context; **nothing here
is a task until the owner asks for it.** Add ideas when the owner mentions them ("someday…", "might…"), dated, and
move an item to its app's `STATUS.md` "Next" once the owner says to build it. Started 13 Oct 2026.

## Direction

- **Find diverse use cases for AI-built apps** (Oct 2026). Most apps are experiments, so speed beats polish, except
  for the vital ones (`AGENTS.md`, Working with the owner).
- **Resident education** is the thread through most of it: the APMES logbook and evals, the hand surgery pages.

## Vital apps

| App | State | Why it's vital |
|---|---|---|
| `prewarm/` (`prewarmstudy.anawj.com`) | Live: real study cases | Study data must never be lost |
| `logbook/` (`apmes.anawj.com/logbook/`) | Live soon | Residents' records and private reflections |

Everything else is an experiment or a demo for now.

## Ideas for later

- **APMES nationwide** (13 Oct 2026): from ~100 residents to ~400. Needs the changed-records-only sync, costs
  checked (`OPERATIONS.md`), and approval from the programme or MOHH (data location, access, PDPA, who is
  accountable). Raise the approval question before the data grows.
- **Postings from APMES to the NUH roster** (13 Oct 2026): rosterers need the APMES postings. Start as an export file
  the roster imports (it already imports HMS rosters); a live sync maybe later. **On hold until the NUH roster is
  approved.**
- **Other rosters** (13 Oct 2026): each would get its own subdomain, like `nuhroster.anawj.com`.
- **One people page for logbook and evals** (13 Oct 2026): both already share one residents list; give them one
  admin screen at `apmes.anawj.com/people/` instead of two. Not needed while the owner is the only admin and roles
  aren't assigned yet.
- **Hand over to an organisation** (13 Oct 2026) if the programme adopts the apps: steps in `OPERATIONS.md`.

## Editing and commenting (13 Oct 2026)

Plan from a 20-way brainstorm. Built and merged: the page editor's spoken comments, options and privacy check; the
feedback button (previews and `?feedback=1`: comment, draw, versions, problem reports, comment on the preview's PR); a
weekly proof-read; instant page edits and PR revisions by the Claude GitHub Action (needs its secret). Details:
`edit/NOTES.md`. Ideas not built yet:

- **Telegram bot**: text a change from the phone ("prewarmstudy: rename Baseline to Pre-op"), get the preview link back
  with Approve / Revise buttons. Needs a bot token in the Worker, which today holds no secrets: the owner's call.
- **"Ask Claude" box** in the editor or the feedback button: an instruction goes straight to the instant workflow without a
  GitHub page in between. Needs a Worker secret and Cloudflare Access (owner-only), same call as above.
- **Weekly AI proof-reading routine**: reads every page for contradictions between pages, stale dates and unclear
  wording, and files them as one issue (the mechanical checks already run weekly). A Claude routine; owner to approve.
- **Private feedback queue for residents** when the logbook goes live: their reports must not become public issues;
  stored in the app's own Firebase project, owner-only read (a rules change: owner approval).
- **Comments become tests** for prewarm and logbook: part of the applying rules already (`edit/NOTES.md`); a screenshot
  workflow posting before-and-after 390 px pictures on each PR would make it automatic.
- Not worth it for now: a form-based CMS (Decap, Tina), commercial feedback tools, an Obsidian outbox, live-editable text
  in Firestore (except perhaps an announcement banner).
