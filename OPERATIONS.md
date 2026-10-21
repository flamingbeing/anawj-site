# Operations

> **Since 21 Oct 2026 (repo split):** the apps moved to their own repos and Workers; this repo is the landing site, the kit
> at design.anawj.com/v1/ and the old-address forwards (AGENTS.md). Older text below describes the site before that.

The principles behind the site's accounts and data. Account lists, costs, the pre-launch checklist and handover steps
are in the owner's private notes; ask the owner. Keep this file free of account names, amounts and contact details.

## Security

- **The Firestore rules are the protection.** Every app's config is public, so anything the rules allow, anyone can
  do. Rules have emulator tests (`tools/test-rules.sh`); keep adding them with every rules change. A merged change to
  any `firestore.rules` deploys live on merge (rule in `AGENTS.md`).
- **Isolation by subdomain** (`SUBDOMAINS.md`): one app's bug or bad script can't read another app's offline data or
  sign-in.
- **Reflections and notes are private to each resident, the owner included.** Backups, exports and any handover must
  keep that.
- **Logbook feedback is private, owner-only, never a GitHub issue.** Residents send it from More → Send feedback
  (Firestore `feedback/`, only the app owner in `owners/` reads, marks done or deletes it; admins can't). The site's
  page editor and 💬 button make public issues: never point residents at them.
- **Public repo:** fake data only; no names, patient data or secrets, ever (`AGENTS.md`).
- **Public client IDs** (Firebase config, OAuth client IDs, Dropbox app key) are in the repo on purpose: they identify
  the apps, not unlock them. Security rests on the Firestore rules.
- **Backups:** every Firestore database has daily backups and, for the study data, point-in-time recovery. Restores go
  into a new database, never over the live one.
- **Going nationwide** is mostly an approval question: expect the programme or MOHH to ask where data lives
  (Singapore, asia-southeast1), who can access it, PDPA and institutional policy, and who is accountable if the owner
  is unavailable. Raise it before the data grows.
- **Roles** (owner, admin staff, PC, PD) are kept in `access/` in the logbook's Firebase project and edited in People
  (`people/NOTES.md`, "Roles").

Accounts, billing, secrets inventory, roles outside the apps and handover steps: details in the owner's private notes.
