# Operations

Every account and setting the site depends on, what it costs, what to do before real users arrive, and how to hand
it all over. Written 13 Oct 2026 with the owner. Keep it current when an account, setting or cost changes. Items
marked **owner** need the owner's own sign-in; no session can do them.

## Before real residents use the apps

Today the APMES apps are a demo: residents don't use them yet. These are cheapest to do now, with no real data to
protect or move. (Prewarm already holds real study data, so its items come first.)

1. **Backups (owner).** There are none today. In the Google Cloud console for each project → Firestore → Disaster
   recovery: switch on scheduled backups (daily, keep 7+ days) or point-in-time recovery. **`prewarm-study` first**
   (real study data), then `apmes-logbook`, then `nuh-roster`. Needs the pay-as-you-go plan (see Costs).
2. **Budget alerts (owner).** Google Cloud console → Billing → Budgets & alerts: one budget per billing account
   (e.g. US$10 a month, alerts at 50%, 90%, 100%) so a bug or abuse can't quietly run up a bill.
3. **Check each project's plan (owner).** `apmes-logbook` is on Blaze (pay-as-you-go). Check `prewarm-study` and
   `nuh-roster`: on the free Spark plan, going over a daily quota stops the app until the next day, which would
   stop prewarm during a case.
4. **App Check (owner, then a session).** Free. Stops scripts using the public Firebase config to burn quota or fill
   storage (the rules already stop them reading data). Owner: Firebase console → App Check → register each web app
   with reCAPTCHA Enterprise and add the subdomains. A session then adds the App Check call to each app and, once it
   reports clean traffic, the owner switches on enforcement.
5. **Rules changes need the owner's approval.** A merged change to any `firestore.rules` deploys live at once. Every
   session asks the owner before merging one (rule in `AGENTS.md`).
6. **Subdomain moves** (`SUBDOMAINS.md`): finish before residents arrive, so nobody has to sign in again or reinstall.
7. **Changed-records-only sync** for the logbook (planned in `logbook/STATUS.md`): needed before nationwide use, not
   before the first residents.

Not doing: two-step sign-in (2FA) on the accounts below. The owner decided against it (13 Oct 2026, too irritating).
The risk: anyone who gets one of these passwords controls the site and its data. A passkey on the Google account is
the low-effort middle ground if that changes.

## Accounts and settings

All are the owner's personal accounts today.

| Account | What it holds | Settings that matter |
|---|---|---|
| **GitHub** `flamingbeing/anawj-site` (public) | All code, docs, PRs; GitHub Pages serves `anawj.com` | Pages source "GitHub Actions" (`.github/workflows/pages.yml`); secret `FIREBASE_SERVICE_ACCOUNT` (rules deploys); PR labeller; page-edit suggestions arrive as **public** issues (`edit/NOTES.md`) |
| **Domain registrar** for `anawj.com` | The domain itself | **Owner: fill in which registrar and the renewal date.** If it lapses, every address stops |
| **Cloudflare** | DNS for `anawj.com`; Worker `anawj-preview` | Worker serves PR previews and the subdomains (`SUBDOMAINS.md`, `PREVIEWS.md`); custom domains on the Worker; `edit.anawj.com` redirect rule (`edit/NOTES.md`). Free plan: 100,000 Worker requests a day |
| **Firebase `apmes-logbook`** (Blaze, asia-southeast1) | Logbook and evals data | Google sign-in; sign-in domain `anawj.com` (moves to `apmes.anawj.com` in step 5); authorised domains; `owners/`, `admins/` entries set by hand in the console (`logbook/NOTES.md`, Roles) |
| **Firebase `prewarm-study`** (asia-southeast1) | **Real study data** | Anonymous sign-in (join codes), email link and password for admins; `admins/` entries set by hand; authorised domains |
| **Firebase `nuh-roster`** | Roster data (not approved for real names yet) | Google sign-in; authorised domains |
| **Google Cloud OAuth clients** | Sign-in and backups | Each project's web sign-in client (allowed origins and redirect addresses); the logbook's Google Drive client (`GOOGLE_CLIENT_ID`); the "Connect Claude" Desktop client (`mcp/README.md`); consent screen points to `anawj.com/privacy/` |
| **Service account** `firebase-rules-deployer@apmes-logbook` | Deploys rules on merge | Firebase Rules Admin on all three projects; its key is the GitHub secret above |
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
- **Public repo:** fake data only; no names, patient data or secrets, ever (`AGENTS.md`).
- **Going nationwide** is mostly an approval question: expect the programme or MOHH to ask where data lives
  (Singapore, asia-southeast1), who can access it, PDPA and institutional policy, and who is accountable if the owner
  is unavailable. They may ask for institutional ownership and billing. Raise it before the data grows.

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
