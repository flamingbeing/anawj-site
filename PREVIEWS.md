# PR previews

Every pull request gets its own copy of the whole site on Cloudflare (Workers Builds with Worker Previews), so a
change can be checked on a phone before it is merged. anawj.com itself stays on GitHub Pages and only changes on
merge to `main`, as before. (Cloudflare now steers new projects to Workers rather than Pages: "Start new
projects with Workers".)

- Each branch gets a steady preview address, `https://<branch>-anawj-preview.kohwenjun.workers.dev/`, and each
  build a one-off one. Cloudflare posts the links on the PR (a comment and a Workers Builds check) and updates
  them on every push. The copy of `main` is at <https://anawj-preview.kohwenjun.workers.dev/>.
- **Open the apps in demo mode:** `…/logbook/?demo`, `…/evals/?demo`, `…/nuh-roster/?demo`. Demo mode keeps
  everything in the browser.
- **Signing in does not work on previews, on purpose.** Google sign-in only works from domains listed in each
  Firebase project, and the previews aren't listed, so preview code can never read or change real data. Saving
  to Google Drive / Dropbox doesn't work there either (both are registered to anawj.com only).
- **Firestore rules** are not previewed: they deploy on merge to `main`. Test rule changes with the emulator
  (`logbook/NOTES.md`, "Working on it").
- Previews are public if someone has the link, and are kept out of search engines (`_headers`). Fake data only,
  as everywhere in this repo.

How it is set up in the repo: `wrangler.jsonc` describes a Worker named `anawj-preview` that only serves files
(no server code), with `preview_urls` on. `.assetsignore` keeps `.git`, `.github`, `.claude`, `.agents` and the
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
5. In the Worker: **Settings → Builds**: turn on **builds for preview (non-production) branches** and leave **pull
   request comments** on.
6. Check it: push to any open PR; within a minute or two a Workers Builds check and a comment with the preview
   link should appear. Open `<link>/logbook/?demo` on your phone.

Do **not** add `*.workers.dev` to Firebase's authorised domains or to the Google / Dropbox OAuth clients: that
would let preview code sign in to the real projects.

The Cloudflare connector / plugin in Claude can then list the Worker and search Cloudflare's docs; build logs and
settings are in the dashboard.

## Later, if needed: a staging site with sign-in

To try signed-in features (sync, sharing, admin) before merging, use a separate **test** Firebase project, never
the real ones: create e.g. `apmes-logbook-staging`, add one fixed preview address (the `staging` branch's) to its
authorised domains, and have the apps pick the test config on that host. That needs a small code change in each
app's `firebase-config.js` and the rules deploy workflow; ask for it when wanted.
