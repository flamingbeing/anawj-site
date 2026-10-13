# Subdomains

Plan agreed with the owner on 13 Oct 2026. Apps that save data or sign people in get their own subdomain, so the
browser keeps their saved data, sign-ins and offline copies apart; one bad page can't reach another app's data.
Related static pages share a subdomain by topic. `anawj.com` keeps only the status page and a few shared pages.
The rule for new apps is in `AGENTS.md`.

## Where everything goes

| Address | Folder now | Notes |
|---|---|---|
| `anawj.com/` | `index.html` | Status page only. Stays on GitHub Pages. |
| `hand.anawj.com/cmcj/` | `cmcj/` | Static, hand surgery. |
| `hand.anawj.com/babies/` | `hand-babies/` | Static, hand surgery. The old `hand/` redirect goes. |
| `prewarmstudy.anawj.com/` | `prewarm/` | **Real study data.** The name is a reminder that it holds sensitive data and stays isolated. |
| `nuhroster.anawj.com/` | `nuh-roster/` | Own Firebase project `nuh-roster`. |
| `apmes.anawj.com/logbook/` | `logbook/` | With evals: one Firebase project (`apmes-logbook`), one sign-in. |
| `apmes.anawj.com/evals/` | `evals/` | |
| `anawj.com/privacy/` | `privacy/` | Stays: the Google sign-in consent screen points here. |
| `anawj.com/prewarm-update/` | `prewarm-update/` | Stays until no phone runs the old prewarm worker, then becomes a redirect. |
| `anawj.com/edit/` (decided in step 5) | `edit/` | Stays on `anawj.com`: see "The page editor" below. |

Single-app subdomains serve the app at the root; shared ones keep a path per app. Folders in the repo don't need
renaming: the hosting maps each address to its folder.

Every old `anawj.com/<folder>/` address becomes a redirect to the new one, keeping the path, query and `#` part.
That matters most for prewarm's PACU nurse links and QR codes, and for the logbook's `?demo` links.

The roster's address is `nuhroster.anawj.com` (owner, 13 Oct: he may manage other rosters later, each with its own subdomain).

## Who does what, in order

One step at a time; each is merged and checked before the next starts. Each session updates its own app's
`STATUS.md` and touches no other app's files. When a step is done, its session tells the homepage session
(`session_01F6SrdrEnHJKzjEAr5LcDy8`), which starts the next one and ticks it here.

1. **Hosting** — Logbook 1 (log1). A live Cloudflare Worker that serves `main` at the subdomains, maps each address
   to its folder (table above), deploys on every merge to `main` and stamps service-worker versions like
   `.github/workflows/pages.yml` does. Keep the PR previews working. Write the owner's Cloudflare clicks (custom
   domains or DNS records, as for `edit.anawj.com` in `edit/NOTES.md`) into this file. Nothing moves yet.
2. **hand.anawj.com** — the CMC joint surgical trainer session moves `cmcj/`, then the hand assessment crash course
   session moves `hand-babies/` to `/babies/` and removes the `hand/` redirect. No sign-in, so this proves the
   hosting with nothing at risk.
3. **prewarmstudy.anawj.com** — the Prewarming Webapp session, between cases only. Before the switch: every reading
   on every phone is saved to Firestore (nothing waiting offline), and the move changes no data. Its sign-in domain
   stays `prewarm-study.firebaseapp.com`; the owner adds `prewarmstudy.anawj.com` to the project's authorised
   domains. Nurse links and QR codes keep working through the redirect. Phones on the old worker are moved on with
   `anawj.com/prewarm-update/`. Check the next case's phones before it starts.
4. **nuhroster.anawj.com** — the NUH Roster session. The owner adds the address to the `nuh-roster` Firebase project's
   authorised domains and the Google sign-in client.
5. **apmes.anawj.com** — Logbook 1 (log1) leads, with the MedHub Evaluations session for `evals/`. Sign-in domain
   moves from `anawj.com` to `apmes.anawj.com` (copy the `__/auth/` helper files); the owner updates the
   `apmes-logbook` authorised domains, the Google sign-in client, Google Drive and Dropbox. log1 also decides where
   `edit/` and `edit.anawj.com` go, and moves them.

After each move: tests pass against the new address, previews still work, the app's `NOTES.md`/`README.md` show the
new address, and every page keeps `<meta name="robots" content="noindex, nofollow">`.

## How the hosting works (step 1, log1)

One Cloudflare Worker, `anawj-preview` (the one that already serves the PR previews), now also serves the subdomains.
Its code is `worker/sites.js`; the address-to-folder table is `SITES` in `worker/routes.js` (same as the table above;
change both together). It serves the repo's files as they are on `main`: Workers Builds deploys it on every merge to
`main` (build command `node tools/stamp-versions.mjs`, so service-worker versions are stamped, as for GitHub Pages),
and builds a preview for every PR.

- A subdomain serves **only** its own folders: `hand.anawj.com` can't reach `logbook/`, `prewarmstudy.anawj.com` can't
  reach anything but `prewarm/`, and so on; a path outside them is a 404 (an address with no slash gets one, query
  kept). Every response carries `X-Robots-Tag: noindex, nofollow`.
- One-app hosts (`prewarmstudy.`, `nuhroster.`) serve the app at the root, and its own folder name works too
  (`prewarmstudy.anawj.com/prewarm/…`) so an app can move before its absolute links are tidied.
- **One shared folder:** every host also serves `/nuhsdesign/` (the NUHS-style design files, styles only, no data), so an
  app on a subdomain can link `../nuhsdesign/tokens.css` (`SHARED` in `worker/routes.js`). It is the only folder subdomains
  share; everything else stays per app. The old `/design/` path was served alongside it for phones still on an older copy,
  and retired on 13 Oct 2026 (nothing linked it any more; the old folder held only a copy of `tokens.css`).
- **Sign-in helper pages on `apmes.`:** `apmes.anawj.com/__/auth/` and `/__/firebase/` serve Firebase's sign-in helper
  pages (the same scripts as `anawj.com/__/auth/`; `apmes-auth/firebase/init.json` is `apmes.`'s own copy with
  `authDomain` `apmes.anawj.com`). Only that host serves them. `anawj.com/__/` stays as it is until nothing uses it.
- **The guidebook on `apmes.`:** `apmes.anawj.com/apmes/guidebook/` serves just that folder of `apmes/` (the evals app reads
  `../apmes/guidebook/dops-expectations.md`); the rest of `apmes/` is not served there.
- Any other address (the previews on `workers.dev`, the copy of main) serves the whole repo as before.
- **Trying a subdomain before it exists:** on a PR preview, `<preview>/_sites/hand.anawj.com/babies/` serves what
  `hand.anawj.com/babies/` will. (Real hosts don't take that route.)
- No data, no secrets, no storage in the Worker: it only serves files. Workers' free plan allows 100,000 requests a
  day; every request goes through the Worker (a page load without a cached service worker is a few dozen). If that is
  ever not enough, Workers Paid is $5 a month.
- Tests: `node worker/test/routes.test.mjs` and `node worker/test/sites.test.mjs` (in the merge checklist in `AGENTS.md`).

### The owner's Cloudflare clicks (after the step 1 PR is merged and its build has finished)

Do these **after** the merge, not before: until then the Worker still serves the whole repo everywhere.
For each of `hand.anawj.com`, `prewarmstudy.anawj.com`, `nuhroster.anawj.com`, `apmes.anawj.com` (any order):

1. <https://dash.cloudflare.com> → **Workers & Pages** → the `anawj-preview` Worker → **Settings** → **Domains & Routes**.
2. **Add** → **Custom domain** → type the address → **Add domain**. Cloudflare makes the DNS record and the certificate
   itself (anawj.com's DNS is already on Cloudflare); it can take a few minutes.
3. Nothing else (no DNS record by hand, no redirect rule, nothing in Firebase yet: sign-in domains come with each
   app's own move in steps 3 to 5).

Check: each address answers with its app (`hand.anawj.com/babies/` the hand assessment, `hand.anawj.com/cmcj/` the
trainer, `apmes.anawj.com/logbook/?demo`, `apmes.anawj.com/evals/?demo`, `nuhroster.anawj.com/?demo`,
`prewarmstudy.anawj.com/`); the same apps still work at their old `anawj.com/<folder>/` addresses (GitHub Pages, until
each one's step makes it a redirect), and `hand.anawj.com/logbook/` is a 404.

## The page editor (decided in step 5)

`anawj.com/edit/` and `edit.anawj.com` stay where they are. The editor shows the page in a same-origin frame and reads and
marks its text, so it can only edit pages served from its own origin; and `anawj.com` still serves every app folder (the
GitHub Pages copy), forwarding only top-level visits (the forwards check `top === self`, so they never fire inside the
editor's frame). So `edit.anawj.com/<old path>` keeps working for every page, suggested edits still name repo paths, and the
"Suggest an edit" link on the hand pages (`anawj.com/edit/?page=…`) is correct. Do not stop serving the old folders at
`anawj.com` without moving the editor (it would need to be served on each subdomain, `/edit/` shared like `/design/`, with
`edit.anawj.com` turned into a lookup from old path to new host).

## Progress

- [x] Plan written (homepage session)
- [x] 1. Hosting (log1): Worker merged (#352, #354); the four custom domains were added by the owner and checked 13 Oct (each address answers with its app, noindex, stamped versions; other apps' folders are 404s)
- [x] 2. hand.anawj.com (CMC trainer, hand assessment; run side by side): #357 (`cmcj/`) and #356 (`hand-babies/` to
  `/babies/`, `hand/` removed), checked live 13 Oct; old addresses forward with path, query and `#` kept (a top-level-only
  host check in each `index.html`, no Worker change)
- [x] Shared design folder: every subdomain serves `/design/` and `/nuhsdesign/` (log1, #358); `design/` moved to
  `nuhsdesign/` (NUHS-style Design, #363), checked live 13 Oct. The old `/design/` path was
  retired on 13 Oct 2026 (log1): nothing links it, and `design/` is deleted
- [x] 3. prewarmstudy.anawj.com (Prewarming Webapp): #364, #382, live 13 Oct after the day's case. A phone moves only
  when nothing is waiting on it. Checked on the owner's phones: an old nurse link lands on the new address, admin
  password sign-in works, a team phone moves and rejoins in one tap, readings sync between phones
- [x] 4. nuhroster.anawj.com (NUH Roster): #361, live 13 Oct; old address forwards with path, query and `#` kept, and a
  browser with a roster saved at the old address is offered a download first. Authorised domain added by the owner;
  a real Google sign-in works (owner, 13 Oct)
- [x] 5. apmes.anawj.com (log1, with MedHub Evaluations): logbook #370, evals #367, helper pages and guidebook #368; live 13 Oct. The
  owner added `apmes.anawj.com` to the Firebase authorised domains and the Google sign-in client's redirect URIs and origin, and
  a real Google sign-in works at the new address. Old `anawj.com/logbook/` and `/evals/` forward (path, query and `#` kept). Drive and Dropbox backups also work at the new address (the owner added
  `https://apmes.anawj.com/logbook/` as a redirect URI to the Google Web client and to the Dropbox app).
