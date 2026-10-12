# PR previews

Every pull request gets its own private-ish copy of the whole site on Cloudflare Pages, so a change can be
checked on a phone before it is merged. anawj.com itself stays on GitHub Pages and only changes on merge to
`main`, as before.

- A PR's preview lives at an address like `https://<id>.anawj-preview.pages.dev/`, and each branch also has a
  steady one: `https://<branch>.anawj-preview.pages.dev/` (Cloudflare shortens long branch names). Cloudflare
  posts the link on the PR (a comment and a "Cloudflare Pages" check) and updates it on every push.
- **Open the apps in demo mode:** `…/logbook/?demo`, `…/evals/?demo`, `…/nuh-roster/?demo`. Demo mode keeps
  everything in the browser.
- **Signing in does not work on previews, on purpose.** Google sign-in only works from domains listed in each
  Firebase project, and the previews aren't listed, so preview code can never read or change real data. Saving
  to Google Drive / Dropbox doesn't work there either (both are registered to anawj.com only).
- **Firestore rules** are not previewed: they deploy on merge to `main`. Test rule changes with the emulator
  (`logbook/NOTES.md`, "Working on it").
- Previews are public if someone has the link, and are kept out of search engines (`_headers`). Fake data only,
  as everywhere in this repo.

## One-time setup (the owner, about 10 minutes)

Cloudflare's screens change now and then; the names below are close enough to find.

1. Sign up or sign in at <https://dash.cloudflare.com> (the free plan is enough: 500 builds a month).
2. **Workers & Pages → Create → Pages → Connect to Git** (if it only offers Workers, look for "Pages" or
   "Import a repository").
3. Connect GitHub and, when GitHub asks, give the Cloudflare app access to **only `flamingbeing/anawj-site`**.
4. Choose `anawj-site` and set:
   - Project name: **`anawj-preview`** (this becomes `anawj-preview.pages.dev`; any free name works, then tell
     Claude/Codex so the notes match).
   - Production branch: **`main`**.
   - Framework preset: **None**. Build command: **empty**. Build output directory: **`/`**.
5. **Save and Deploy.** The first build copies `main` to `anawj-preview.pages.dev` (a harmless, unlisted copy).
6. In the project: **Settings → Builds (Builds & deployments)**:
   - Turn **off** automatic production deployments (anawj.com is the real site; no need to copy `main` again).
   - Preview deployments: **All non-production branches** (covers `claude/*`, `codex/*` and `ccr-*` branches).
   - Leave **PR comments** on.
7. Check it: open any PR; within a minute or two a "Cloudflare Pages" check and a comment with the link should
   appear. Open `<link>/logbook/?demo` on your phone.

Do **not** add `*.pages.dev` to Firebase's authorised domains or to the Google / Dropbox OAuth clients: that
would let preview code sign in to the real projects.

## Later, if needed: a staging site with sign-in

To try signed-in features (sync, sharing, admin) before merging, use a separate **test** Firebase project, never
the real ones: create e.g. `apmes-logbook-staging`, add one fixed preview address
(`staging.anawj-preview.pages.dev`, the `staging` branch) to its authorised domains, and have the apps pick the
test config on that host. That needs a small code change in each app's `firebase-config.js` and the rules deploy
workflow; ask for it when wanted.
