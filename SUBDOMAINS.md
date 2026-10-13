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
| `roster.anawj.com/` | `nuh-roster/` | Own Firebase project `nuh-roster`. |
| `apmes.anawj.com/logbook/` | `logbook/` | With evals: one Firebase project (`apmes-logbook`), one sign-in. |
| `apmes.anawj.com/evals/` | `evals/` | |
| `anawj.com/privacy/` | `privacy/` | Stays: the Google sign-in consent screen points here. |
| `anawj.com/prewarm-update/` | `prewarm-update/` | Stays until no phone runs the old prewarm worker, then becomes a redirect. |
| (decided in step 5) | `edit/` | The page editor has to reach pages on several subdomains. |

Single-app subdomains serve the app at the root; shared ones keep a path per app. Folders in the repo don't need
renaming: the hosting maps each address to its folder.

Every old `anawj.com/<folder>/` address becomes a redirect to the new one, keeping the path, query and `#` part.
That matters most for prewarm's PACU nurse links and QR codes, and for the logbook's `?demo` links.

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
4. **roster.anawj.com** — the NUH Roster session. The owner adds the address to the `nuh-roster` Firebase project's
   authorised domains and the Google sign-in client.
5. **apmes.anawj.com** — Logbook 1 (log1) leads, with the MedHub Evaluations session for `evals/`. Sign-in domain
   moves from `anawj.com` to `apmes.anawj.com` (copy the `__/auth/` helper files); the owner updates the
   `apmes-logbook` authorised domains, the Google sign-in client, Google Drive and Dropbox. log1 also decides where
   `edit/` and `edit.anawj.com` go, and moves them.

After each move: tests pass against the new address, previews still work, the app's `NOTES.md`/`README.md` show the
new address, and every page keeps `<meta name="robots" content="noindex, nofollow">`.

## Progress

- [x] Plan written (homepage session)
- [ ] 1. Hosting (log1)
- [ ] 2. hand.anawj.com (CMC trainer, then hand assessment)
- [ ] 3. prewarmstudy.anawj.com (Prewarming Webapp)
- [ ] 4. roster.anawj.com (NUH Roster)
- [ ] 5. apmes.anawj.com (log1, with MedHub Evaluations)
