# Roadmap

Where the owner wants the apps to go, and ideas not yet being built. Sessions read it for context; **nothing here
is a task until the owner asks for it.** Add ideas when the owner mentions them ("someday…", "might…"), dated, and
move an item to its app's `STATUS.md` "Next" once the owner says to build it. Started 13 Oct 2026.

## Direction

- **Find diverse use cases for AI-built apps** (owner's main goal, Oct 2026). Exploring is the point: most apps are
  experiments, so speed beats polish, except for the vital ones (`AGENTS.md`, Working with the owner).
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

## Ways of working to try

- **The always-on home computer** (13 Oct 2026): runs `claude remote-control` (command-line Claude Code) from the
  owner's projects folder, which holds every Claude project, so the phone can drive a session there (first run 13 Oct;
  the desktop app's Remote Control is sandboxed, so the command line is used instead). Started hidden by a small
  PowerShell script, at sign-in through Task Scheduler, logging to a file in the user folder. For jobs the cloud can't
  do: the owner's signed-in browser, files on that computer, long jobs. Ordinary repo work stays in the cloud.
