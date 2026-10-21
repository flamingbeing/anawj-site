# Subdomains

> **Since 21 Oct 2026 (repo split):** the apps moved to their own repos and Workers; this repo is the landing site, the kit
> at design.anawj.com/v1/ and the old-address forwards (AGENTS.md). Older text below describes the site before that.

The rule (owner, 13 Oct 2026): apps that save data or sign people in get their own subdomain, so the browser keeps
their saved data, sign-ins and offline copies apart; one bad page can't reach another app's data. Related static pages
share a subdomain by topic. `anawj.com` keeps only the status page and a few shared pages. Each new roster gets its own
subdomain. The rule for new apps is in `AGENTS.md`. The move steps and progress log are kept in the owner's private
notes; every step is done.

## Where everything goes

| Address | Folder now | Notes |
|---|---|---|
| `anawj.com/` | `index.html` | Status page only. Stays on GitHub Pages. |
| `anaes.anawj.com/bis/`, `/ot/` | (none) | Forwards to `anantf.com/bis/` and `anantf.com/ot/`: the BIS to DSA and OT simulators moved to the anantf site on 16 Oct 2026. `anawj.com/bis-dsa/` and `/ot-sim/` are stub pages forwarding there too. |
| `prewarmstudy.anawj.com/` | (repo `prewarm`) | **Real study data.** Served by the `prewarm` repo's own Worker since 21 Oct 2026 (repo split), with the scan upload. This repo's `prewarm/` is the old copy until anawj-site becomes a landing site; change the app there. |
| `hand.anawj.com` | (own repo `hand`) | Moved to its own repo and Worker on 21 Oct 2026; the old folders here stay until the landing step. |
| `nuhroster.anawj.com/` | `nuh-roster/` | Own Firebase project `nuh-roster`. |
| `nuhjuniormonthly.anawj.com/` | `nuh-junior-monthly/` | NUH junior monthly roster helper (15 Oct 2026). Data in the browser. |
| `ntfroster.anawj.com/` | `ntf-roster/` | NTF anaesthesia monthly duty roster (15 Oct 2026). Data in the browser until its own Firebase project `ntf-roster` exists. |
| `apmes.anawj.com/…` | (own repo `apmes`) | The APMES apps (logbook, evals, people, applicants, 360): moved to the `apmes` repo and its Worker `apmes` on 21 Oct 2026; the old folders here stay until removed. |
| `beta-apmes.anawj.com/…` | (own repo `apmes`) | Beta: the `apmes` repo's `beta` branch, Worker `apmes-beta`, test Firebase project (moved 21 Oct 2026). |
| `anawj.com/privacy/` | `privacy/` | Stays: the Google sign-in consent screen points here. |
| `anawj.com/prewarm-update/` | `prewarm-update/` | Stays until no phone runs the old prewarm worker, then becomes a redirect. |
| `anawj.com/edit/` (decided in step 5) | `edit/` | Stays on `anawj.com`: see "The page editor" below. |
| `ask.anawj.com/` | (owner-tools repo) | Ask Claude moved to the owner-tools Worker (21 Oct 2026); this Worker no longer serves the host. `ask/` and `worker/ask.js` here are the old copies. |

An app that moves to another site: give its host a `moved` entry in `worker/routes.js` (`{ moved: { '/bis/': 'https://anantf.com/bis/' } }`;
the rest of the path and the query are kept), leave a noindex stub `index.html` that forwards at its old GitHub Pages folder, and
take its tests, labels and screenshot paths out of `.github/` and `tools/` (16 Oct 2026, #668).

Single-app subdomains serve the app at the root; shared ones keep a path per app. Folders in the repo don't need
renaming: the hosting maps each address to its folder.

Every old `anawj.com/<folder>/` address becomes a redirect to the new one, keeping the path, query and `#` part.
That matters most for prewarm's PACU nurse links and QR codes, and for the logbook's `?demo` links.

## How the hosting works

One Cloudflare Worker, `anawj-preview` (also the PR previews), serves the subdomains. Code: `worker/sites.js`; the
address-to-folder table is `SITES` in `worker/routes.js` (same as the table above; change both together). Workers Builds
deploys it on every merge to `main` (build command `node tools/stamp-versions.mjs`).

- A subdomain serves **only** its own folders; any other path is a 404. Every response carries
  `X-Robots-Tag: noindex, nofollow`. One-app hosts serve the app at the root (its folder name works too).
- Every host also serves `/nuhsdesign/` (styles only) and `/feedback/` (the feedback button's script): `SHARED` in
  `worker/routes.js`. Nothing else is shared.
- `design.anawj.com/v1/` is the same kit for apps in other repos: `/v1/` = `nuhsdesign/`, `/v1/feedback/` = `feedback/`.
  Kit files (on every host) carry `Access-Control-Allow-Origin: *`. A breaking kit change goes in `/v2/`; `/v1/` stays.
  The custom domain is added to `anawj-preview` in Cloudflare by the owner.
- `ntfroster.anawj.com` serves Firebase's sign-in helper pages (`/__/auth/`, `/__/firebase/`; `ntf-auth/firebase/init.json`).
- Any other address (PR previews, the copy of main) serves the whole repo. To try a subdomain on a preview, use
  `<preview>/_sites/ntfroster.anawj.com/`.
- No data or storage in the Worker. The one API is owner-only, on `ask.anawj.com` (`worker/ask.js`); its secrets live
  in Cloudflare, never in the repo; previews never answer it.
- Tests: `node worker/test/routes.test.mjs` and `node worker/test/sites.test.mjs`.

## The page editor

`anawj.com/edit/` and `edit.anawj.com` stay on `anawj.com`: the editor frames the page and reads its text, so it can
only edit pages from its own origin, and `anawj.com` still serves every app folder (forwarding only top-level visits).
Do not stop serving the old folders there without moving the editor.
