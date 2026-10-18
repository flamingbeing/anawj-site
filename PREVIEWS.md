# PR previews

Every pull request gets its own copy of the whole site on Cloudflare (Workers Builds with Worker Previews), so a
change can be checked on a phone before it is merged. anawj.com itself stays on GitHub Pages and only changes on
merge to `main`, as before. (Cloudflare now steers new projects to Workers rather than Pages: "Start new
projects with Workers".)

- Each branch gets a steady preview address, `https://<branch>-anawj-preview.<account>.workers.dev/`, and each
  build a one-off one. Cloudflare posts the links on the PR (a comment and a Workers Builds check) and updates
  them on every push. The copy of `main` is at `https://anawj-preview.<account>.workers.dev/`.
- **Open the apps in demo mode:** `…/logbook/?demo`, `…/evals/?demo`, `…/nuh-roster/?demo` (the roster as it will be at its own address: `…/_sites/nuhroster.anawj.com/?demo`). Demo mode keeps
  everything in the browser.
- **Signing in does not work on previews, on purpose.** Google sign-in only works from domains listed in each
  Firebase project, and the previews aren't listed, so preview code can never read or change real data. Saving
  to Google Drive / Dropbox doesn't work there either (both are registered to apmes.anawj.com only).
- **Firestore rules** are not previewed: they deploy on merge to `main`. Test rule changes with the emulator
  (`logbook/NOTES.md`, "Working on it").
- Previews are public if someone has the link, and are kept out of search engines (`_headers`). Fake data only,
  as everywhere in this repo.

How it is set up in the repo: `wrangler.jsonc` describes a Worker named `anawj-preview` that only serves files
(`worker/sites.js`: no data, no secrets; it also serves the subdomains, see `SUBDOMAINS.md`), with `preview_urls` on. `.assetsignore` keeps `.git`, `.github`, `.claude`, `.agents` and the
config out of the upload. `_headers` adds `X-Robots-Tag: noindex`. GitHub Pages ignores all three. Check a change
to them with `npx wrangler deploy --dry-run` (no account needed; it lists files before the ignore list applies).

## One-time setup (the owner, about 10 minutes)

Cloudflare's screens change now and then; the names below are close enough to find.

1. In <https://dash.cloudflare.com>: **Workers & Pages → Create → Import a repository** (the Workers option,
   not Pages).
2. Connect GitHub and, when GitHub asks, give the Cloudflare app access to **only `flamingbeing/anawj-site`**.
3. Choose `anawj-site` and set:
   - Project / Worker name: **`anawj-preview`** (it must match `name` in `wrangler.jsonc`).
   - Build command: **empty**. Deploy command: **`npx wrangler deploy`**. Preview command: **`npx wrangler
     preview`** (the defaults). Root path: `/`.
4. **Deploy.** The first build puts a copy of `main` at `anawj-preview.<subdomain>.workers.dev` (unlisted,
   noindex; it is refreshed on each merge to `main`, which is harmless).
5. In the Worker: **Settings → Builds** (two tabs, **Production** and **Previews Base**):
   - Previews Base: turn on **Builds for Preview branches**, and click **Enable Preview URLs** if a yellow
     "Preview URLs are disabled" box shows (without it, PR builds make no link).
   - Both tabs: pick or create an **API token** (e.g. "anawj-preview build token"). "Configured API token
     unavailable" means builds can't deploy: the first PR preview failed until one was set.
   - Leave **pull request comments** on.
6. Check it: push to any open PR; within a minute or two a Workers Builds check and a comment with the preview
   link should appear. Open `<link>/logbook/?demo` on your phone.

Do **not** add `*.workers.dev` to Firebase's authorised domains or to the Google / Dropbox OAuth clients: that
would let preview code sign in to the real projects.

The Cloudflare connector / plugin in Claude can then list the Worker and search Cloudflare's docs; build logs and
settings are in the dashboard.

## Beta: try a change signed in, before it goes live

PR previews can't sign in. **Beta** can, against a separate **test** Firebase project (test data only), so a change to
the logbook or evals can be tried for real before it reaches `apmes.anawj.com` (owner, 18 Oct 2026).

- **Address:** `https://beta-apmes.anawj.com/logbook/` (and `/evals/`, `/people/`, `/applicants/`, `/360/`): the live
  address with `beta-` in front. Its browser storage is separate from the live site's.
- **What it serves:** the `beta` branch, through a second Worker, `anawj-beta` (`wrangler.jsonc`, `env.beta`), with its
  own Workers Builds: production branch `beta`, deploy command `npx wrangler deploy --env beta`. The folders are the
  same as apmes (`beta-apmes.anawj.com` in `worker/routes.js`).
- **Which data:** `logbook/js/firebase-config.js` and `evals/js/firebase-config.js` pick the test project (`TEST`) on
  any `beta-` host, so the code tried on beta is the code that goes live, unchanged. While `TEST` is empty, sync and
  sign-in stay off on beta (local data only).
- **Trying a PR:** point `beta` at the PR's branch (`git push --force origin <branch>:beta`); `beta` is disposable,
  nothing ever merges from it. Wait for the anawj-beta build, then send the owner the beta link.
- **Merging:** PRs that change the logbook or evals wait for the owner's "ship it" after he has tried them on beta
  (AGENTS.md, "Before merging"), once beta is set up.
- **Firestore rules:** test the rules with the emulator as before; deploy them to the test project before live.

Still to set up (once): the test Firebase project (Google sign-in on; `beta-apmes.anawj.com` in its authorised
domains and on its OAuth client, with its own `/__/auth/` helper pages and `init.json`), its config in `TEST`, and the
`anawj-beta` Worker with its Workers Builds.

## Build minutes

Workers Builds' free plan gives a monthly allowance of build minutes for the whole Cloudflare account (shared with any
other Workers on it). If they run out, builds and previews stop until the 1st (the live sites keep working), or Workers
Paid raises the limit. To save minutes:

- **Build watch paths** (owner's click: Workers → anawj-preview → Settings → Build → Build watch paths): include `*`,
  exclude `*.md`, `**/STATUS.md`, `**/status/**`, `**/test/**`, `.github/**`. A push touching only those files makes no
  build. (Notes and tests don't change what the preview shows.)
- **Previews only for PRs:** Settings → Build → Previews Base → build only branches with an open PR, if offered.
- **Sessions push once per finished step** (AGENTS.md, PR previews).

## Before-and-after screenshots on PRs

`.github/workflows/pr-screenshots.yml` (`tools/shots.mjs`): on every PR from this repo, the first screen (390 px, demo
mode) of each app the PR changes, on `main` and on the PR, side by side in one PR comment that each push updates. More
screens: a line `Screens: /logbook/?demo#notes, /evals/?demo` in the PR description (up to 6 pages). The pictures are
kept on the branch `pr-screenshots`, rewritten on every run as one commit holding only open PRs' latest pictures (no
history, so clones stay small). PRs opened by the Page edits workflow (GitHub's own token) don't trigger it.

## Service-worker versions in previews

The live site stamps each app's `sw.js` `VERSION` at deploy (`tools/stamp-versions.mjs`). For previews to do the same,
set **Build command** to `node tools/stamp-versions.mjs` in the Cloudflare dashboard (Workers → anawj-preview →
Settings → Build); Workers Builds ignores a build step in `wrangler.jsonc`. Without it a preview keeps the plain
version, so a phone that already opened that preview may need a hard refresh to see a newer commit. Optional.
