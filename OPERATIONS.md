# Operations

Every account and setting the site depends on, what it costs, what to do before real users arrive, and how to hand
it all over. Written 13 Oct 2026 with the owner. Keep it current when an account, setting or cost changes. Items
marked **owner** need the owner's own sign-in; no session can do them.

## Before real residents use the apps

Today the APMES apps are a demo: residents don't use them yet. These are cheapest to do now, with no real data to
protect or move. (Prewarm already holds real study data, so its items come first.)

1. **Backups: done 13 Oct 2026** (owner approved each step). Every
   project's `(default)` Firestore database (asia-southeast1) has a **daily backup kept 7 days**. `prewarm-study` also
   has **point-in-time recovery** (any moment in the last 7 days). Restore: Google Cloud console → Firestore →
   Disaster recovery (backups restore into a new database, never over the live one). **Still to do: delete
   protection** is off on all three databases; switching it on is free and stops a whole database being deleted by
   mistake.
2. **Budget alerts: done 13 Oct 2026.** A monthly budget on the billing account, emailing at 50%, 90% and 100%
   (amounts in the owner's private notes). Budgets only alert; they never stop spending.
3. **Plans: done 13 Oct 2026.** All three projects are on Blaze (pay-as-you-go) on the same billing account.
   `prewarm-study` was on the free Spark plan until 13 Oct, so it had no backups and would have stopped for the day
   on hitting a quota.
4. **App Check (owner, then a session).** Free. Stops scripts using the public Firebase config to burn quota or fill
   storage (the rules already stop them reading data). Owner: Firebase console → App Check → register each web app
   with reCAPTCHA Enterprise and add the subdomains. A session then adds the App Check call to each app and, once it
   reports clean traffic, the owner switches on enforcement. Before enforcing Firestore in `apmes-logbook`: the
   Google Form inbox script (`logbook/form-script/`) has no App Check token and would stop; give it a debug token first.
5. **Rules changes deploy live at once.** A merged change to any `firestore.rules` deploys on merge. Since 14 Oct 2026 the
   owner no longer approves each one: the merging session tests in the emulator, checks the deploy run and reports what
   changed (rule in `AGENTS.md`).
6. **Subdomain moves** (`SUBDOMAINS.md`): finish before residents arrive, so nobody has to sign in again or reinstall.
7. **Changed-records-only sync** for the logbook (planned in `logbook/STATUS.md`): needed before nationwide use, not
   before the first residents.

## Accounts and settings

All are held by the owner today (a handover adds a second owner: below).

| Account | What it holds | Settings that matter |
|---|---|---|
| **GitHub** `flamingbeing/anawj-site` (public) | All code, docs, PRs; GitHub Pages serves `anawj.com` | Pages source "GitHub Actions" (`.github/workflows/pages.yml`); secret `FIREBASE_SERVICE_ACCOUNT` (rules deploys); secret `CLAUDE_CODE_OAUTH_TOKEN` (instant page edits; set 14 Oct 2026 with the owner's own `claude setup-token`, plus "Allow GitHub Actions to create and approve pull requests"; default workflow permissions stay read; to stop it, delete the secret); PR labeller; weekly proof-read issue; page-edit suggestions arrive as **public** issues (`edit/NOTES.md`) |
| **Domain registrar** for `anawj.com` | The domain itself | **Owner: fill in which registrar and the renewal date.** If it lapses, every address stops |
| **Cloudflare** | DNS for `anawj.com`; Worker `anawj-preview` | Worker serves PR previews and the subdomains (`SUBDOMAINS.md`, `PREVIEWS.md`); custom domains on the Worker; `edit.anawj.com` redirect rule (`edit/NOTES.md`); Ask Claude (`ask.anawj.com`): a Zero Trust Access application (owner only), and three Worker secrets (`GITHUB_ISSUES_TOKEN`, a fine-grained GitHub token for this repo's issues; `ACCESS_TEAM`; `ACCESS_AUD`) (`edit/NOTES.md`, "Ask Claude"). Free plan: 100,000 Worker requests a day |
| **Firebase `apmes-logbook`** (Blaze, asia-southeast1; daily backups) | Logbook and evals data | Google sign-in; sign-in domain `apmes.anawj.com` (moved from `anawj.com` in step 5; `anawj.com` stays in the authorised domains until the old address is retired); authorised domains (must list `apmes.anawj.com`); `owners/`, `admins/` entries set by hand in the console (`logbook/NOTES.md`, Roles) |
| **Firebase `prewarm-study`** (Blaze since 13 Oct 2026, asia-southeast1; daily backups and point-in-time recovery) | **Real study data** | Anonymous sign-in (join codes), email link and password for admins; `admins/` entries set by hand; authorised domains |
| **Firebase `nuh-roster`** (Blaze; daily backups) | Roster data (not approved for real names yet) | Google sign-in; authorised domains |
| **Firebase `nuh-junior-monthly`** (created 16 Oct 2026, asia-southeast1; daily backups) | The junior monthly roster's team copy (rules, postings, people, rosters). The department agreed to real staff names here as long as nothing is public: only signed-in accounts listed in `members/` can read anything | Google sign-in (owner turns the Google provider on in the console), authorised domain `nuhjuniormonthly.anawj.com`, config in `nuh-junior-monthly/js/firebase-config.js`, the rules deployer has Firebase Rules Admin, first admin by hand in `members/{email}` (`{ role: 'admin', name }`), later the rosterer as `{ role: 'rosterer' }`. Rules and their emulator test are wired (`tools/test-rules.sh`, `deploy-firestore-rules.yml`). "Read from / Write to Google" needs the Google Sheets API enabled on the project and the scope `spreadsheets` on the OAuth consent screen (done 16 Oct through firetop; the screen stays In production, External, so every member can sign in, and because the scope is sensitive Google shows an "unverified app" notice: Advanced, then Go to app; limit 100 users) |
| **Firebase `ntf-roster`** (**not created yet**, 15 Oct 2026) | Will hold the NTF roster's team copy; until it exists the app keeps its data in the browser (Backup moves it) | When created: Google sign-in, authorised domain `ntfroster.anawj.com`, config into `ntf-roster/js/firebase-config.js`, Firebase Rules Admin for the rules deployer, a matrix entry in `deploy-firestore-rules.yml` (`ntf-roster/STATUS.md`) |
| **Google Cloud OAuth clients** | Sign-in and backups | Each project's web sign-in client (allowed origins and redirect addresses); the logbook's Google Drive client (`GOOGLE_CLIENT_ID`); the "Connect Claude" Desktop client (`mcp/README.md`); consent screen points to `anawj.com/privacy/` |
| **Rules-deployer service account** (in `apmes-logbook`) | Deploys rules on merge | Firebase Rules Admin on all three projects; its key is the GitHub secret above |
| **Dropbox app** | Logbook backups to Dropbox | App key `DROPBOX_APP_KEY` (public); development mode; redirect addresses |
| **Claude (claude.ai)** | Sessions, the daily "Page edits check" routine | Routine runs 8:58 am Singapore, drafts one PR, never merges (`edit/NOTES.md`) |

Public client IDs (Firebase config, OAuth client IDs, Dropbox app key) are in the repo on purpose: they identify the
apps, not unlock them. Security rests on the Firestore rules.

## Costs

Firestore's free daily allowance (50,000 reads, 20,000 writes, 1 GiB stored) applies on both plans. Current use is
near zero (the APMES apps are a demo). Rough projections, not measurements:

| Scale | Expected cost |
|---|---|
| ~100 residents | Likely within the free allowance |
| ~400 residents (nationwide) | A few US$ a month: reads from PD / admin sessions over the free allowance, photos (up to 20 MB per resident, kept in Firestore) |
| Cloudflare Worker | Free up to 100,000 requests a day; Workers Paid is US$5 a month if ever needed |
| GitHub | Free (public repo) |

## Security

- **The Firestore rules are the protection.** Every app's config is public, so anything the rules allow, anyone can
  do. Rules have emulator tests (`tools/test-rules.sh`); keep adding them with every rules change.
- **Isolation by subdomain** (`SUBDOMAINS.md`): one app's bug or bad script can't read another app's offline data or
  sign-in.
- **Reflections and notes are private to each resident, the owner included.** Backups, exports and any handover must
  keep that.
- **Logbook feedback is private, owner-only, never a GitHub issue.** Residents send it from More → Send feedback
  (Firestore `feedback/`, only the app owner in `owners/` reads, marks done or deletes it; admins can't). The site's
  page editor and 💬 button make public issues: never point residents at them.
- **Public repo:** fake data only; no names, patient data or secrets, ever (`AGENTS.md`).
- **Going nationwide** is mostly an approval question: expect the programme or MOHH to ask where data lives
  (Singapore, asia-southeast1), who can access it, PDPA and institutional policy, and who is accountable if the owner
  is unavailable. They may ask for institutional ownership and billing. Raise it before the data grows.

## The home computer ("firetop" helper)

The owner's always-on helper session takes what a cloud session can't do (live Firebase and Cloudflare changes,
production operations, the owner's real documents, long jobs, secrets). How to use it: `ops/firetop.md` in
`flamingbeing/life`.

## Handing over

The apps are documented for a successor already: `AGENTS.md`, each app's `NOTES.md`, `STATUS.md` and `README.md`.
What a handover needs on top:

1. **A second owner on every account above**, even one who never signs in: Firebase / Google Cloud projects (Owner
   role), GitHub (a collaborator now; an organisation later), Cloudflare (account member), the registrar if it allows.
2. **Move to an organisation when the programme adopts the apps:** transfer the GitHub repo to a GitHub organisation
   (links and Pages keep working; the custom domain stays), add the organisation's people to Cloudflare and Firebase,
   and move billing to an institutional billing account.
3. **Swap the app roles:** the `owners/` and `admins/` entries in each Firebase project (`logbook/NOTES.md`, Roles).
4. **Update this file** with the new owner's details, and the consent screen's contact email.
