# APMES Logbook

A case logbook for APMES (NUH anaesthesia) residents, at <https://anawj.com/logbook/>. It replaces the old Google Form and spreadsheet.

Logging a case takes three things: the date, a line of free text (patient initials and case details), and one or more categories. As you type, the page suggests categories from the text (age, BMI and keywords learnt from past logs). Progress against the APMES targets for your residency year is worked out from your counts.

It is a static page (vanilla ES modules, no build step) that installs to the home screen and works offline. Cases are stored in Cloud Firestore under your Google account and sync when you are back online.

Try it without signing in: <https://anawj.com/logbook/?demo> (made-up data, kept in your browser only; `?demo=empty` starts blank, `?demo=reset` wipes the demo data).

## Privacy model

- **Your cases are yours.** Only you can read or change your logbook and cases. This is enforced by `firestore.rules` on Google's side, not just by the page.
- **Admins** (the programme admins, listed in the `admins` collection) can read logbooks and can write cases into them, which is how the old form responses are imported. They manage the resident list.
- **Summaries are counts only.** Each programme resident's per-category counts (and number of reflections) are copied to `summaries/{rid}` so the programme can compare progress. Only admins and programme residents can read them (the rules check that the `rid` in the reader's logbook belongs to a resident with the reader's email); other Google accounts cannot. A resident's own summary must carry the name and intake on the resident list. Case details are never in a summary; the rules reject any extra fields.
- Anyone with a Google account can sign in and keep a private logbook. Only people on the admin-managed resident list appear in the totals.
- Keep case details de-identified: initials and a short description, no names or NRIC numbers. The data is stored in Google Cloud (Firestore, asia-southeast1), outside NUH systems.
- This repository is public. It contains no resident names, emails or case data. Admin emails live only in Firestore.

## Firebase setup (once)

The Firebase project `apmes-logbook` already exists and its web config is in `js/firebase-config.js`. Those values are public by design.

1. **Authentication**: Firebase console → Authentication → Sign-in method → enable **Google**. Then Authentication → Settings → Authorised domains → add `anawj.com` (`localhost` is there already for testing).
2. **Firestore**: Firestore Database → Create database → location **asia-southeast1 (Singapore)** → **production mode**.
3. **Rules**: Firestore Database → Rules → paste the whole of `firestore.rules` → Publish. Paste it again whenever the file changes. This one file holds the rules for the whole Firebase project, the logbook and evaluations (`/evals`) alike, so never publish another app's rules file over it.
4. **Admins**: Firestore Database → Data → Start collection `admins`. Add one document per admin. The document ID is the admin's Google email in lower case (use the admins' emails), with a field `name` (string). Admin emails are never written in this repository.
5. **Optional, API key restriction**: Google Cloud console → APIs & Services → Credentials → the "Browser key" → Application restrictions → Websites → add `https://anawj.com/*`, `https://apmes-logbook.firebaseapp.com/*` and `http://localhost/*`. The key isn't a secret, but this stops other sites using it.
6. Sign in on the page as an admin, open **Settings → Admin**, paste the residents list, then run the import (below).

Free (Spark) plan limits that matter: 20,000 writes and 50,000 reads a day. The first import is about 16,000 cases, so it fits in one day; re-imports write only new rows.

Sign-in uses a Google popup, falling back to a redirect if popups are blocked (e.g. some home-screen apps). If redirect sign-in fails on iPhone home-screen installs, open the page in Safari once to sign in.

## Data model

| Path | Contents | Who |
|---|---|---|
| `admins/{email}` | `{ name }` | added by hand in the console; a user may check their own entry |
| `pds/{email}` | `{ name }` | programme directors, a role separate from admin: read residents, summaries and evaluations; added by admins or in the console |
| `residents/{rid}` | `{ rid, name, email (lower case), status: ACTIVE / ON LEAVE / GRADUATED / ATTRITED, intake, rYear 1–5 }` | admins; a user may read the entry with their own email |
| `logbooks/{email}` | `{ email, name, rid, settings, templates: [{ id, name, cats, details? }], updatedAt }` | owner; admins read |
| `logbooks/{email}/cases/{id}` | `{ id, date ('YYYY-MM-DD' or null), dateText?, details (≤2000 chars), cats (≤40 codes), createdAt, updatedAt, source: app / import / paste / sheet, importKey?, reflectionId? }` | owner; admins read and write (import) |
| `logbooks/{email}/reflections/{id}` | `{ id, headingId, subId (or null), initials, date ('YYYY-MM-DD' or null), jr (bool), diagnosis (≤2000), title (≤300), summary (≤20000), points: [{ heading (≤300), text (≤20000) }] (≤15), figures: [{ id (image doc), caption (≤300), point (index of the learning point it follows, or null = after all) }] (≤10), references: [string ≤1000] (≤30), sections? (legacy: { description, thoughts, evaluation, analysis, conclusions, action, further }, each ≤20000), caseId (or null), status: draft / complete, createdAt, updatedAt }` (`js/reflections.js`). Exported like the portfolio's Section 2 rows: bold title, case summary, "Learning Points" with underlined numbered headings, figures with captions, references. | owner only; admins have no access |
| `logbooks/{email}/images/{id}` | `{ id, data (base64 without the data: prefix, < 700 KB), mime: image/jpeg or image/png, w, h, createdAt }`: reflection figures, compressed on the phone to JPEG (longest side ≤ 1400 px) | owner only |
| `logbooks/{email}/bin/{id}` | `{ id, kind: case / reflection, data: the deleted case or reflection (≤40 top-level keys), deletedAt (ms) }`: the recycle bin (`js/bin.js`). Every case and reflection delete moves the item here; it can be restored (same id, or a new id if that id is in use again) for 30 days, then the app purges it after the next sign-in. A binned reflection's figures stay in `images/` until its entry is purged or deleted forever. | owner only; admins have no access |
| `summaries/{rid}` | `{ rid, name, intake, rYear, counts: { code: n }, total, reflections: { headingId: n }, reflectionsTotal, updatedAt }` | admins and programme residents read; admins or that resident write |
| `imports/{rid}` | `{ email, keys: [importKey], updatedAt }` (keys reset if the resident's email changes) | admins |
| `sharedTemplates/{id}` | `{ id, name, cats, details? }` | everyone signed in reads; admins write |

`{email}` is always the Google account email in lower case. Category codes and targets are in `js/categories.js`.

## How the import works

The old data is the Google Form responses workbook (tabs **Case** and **AY20xx Totals**). In **Settings → Admin**:

1. Paste the residents list (the `RESIDENTS` array from the old Apps Script). Check names, emails, status and residency year, then save. This creates `residents/{rid}`.
2. Upload the workbook. It is read in the browser (nothing is uploaded except the resulting cases). `js/importer.js` reads the Case tab: resident, date, details and the category columns, merged into one list of codes. Rows marked "WRONG ENTRY" are skipped; dates that can't be read are kept as text and flagged "needs date".
3. The page compares the counts per resident and category with the Totals tabs (`countCheck`) and shows any differences before you import.
4. **Import** writes each resident's cases into `logbooks/{their email}/cases`, then their summary. Every row has an `importKey` (a hash of resident, form timestamp, date, details and categories, plus a counter for identical rows). `imports/{rid}` records which keys are in, so running the import again after more form responses writes only the new rows. The case document ID is derived from the key, so an interrupted import can be resumed without duplicates.

## Code

- `js/reflections.js`: reflection shape and progress against the portfolio rules (96 total, JR, sub-types, unique patients); `js/ui-reflect.js`: the Reflections tab (`#reflect`): every reflection is linked to a logged case (`caseId`); "+ New reflection" opens a case picker and pre-fills from the chosen case, and a case's Reflect button does the same. Unlinked older reflections show "not linked" and can't be marked complete until linked.
- Reflections tab extras: each heading has "+ Add" (and sub-type chips) that open the case picker with the heading preset; after the general "+ New reflection" the app suggests headings from the case (`suggestHeadings` in `js/reflections.js`). "Edit" unlocks dragging a reflection (⠿ handle, mouse or touch) onto another heading, with Undo, and checkboxes to move several to the recycle bin after a confirmation.
- `js/reflect-import.js`: parses a portfolio Word file (.docx) back into reflections (`parseDocx`). No DOM. `js/ui-reflect-import.js`: "Upload from Word" on the Reflections tab: a review page lists what was found with a checkbox per reflection; ticked ones are added as drafts.
- `js/bin.js`: the recycle bin (`moveToBin`, `restoreFromBin`, `deleteForever`, `purgeExpired`, `renderBin` / `openBin`). Reached from Settings → Recycle bin and from the Reflections tab.
- `js/categories.js`: categories, targets, EPA tags, tips, reflection headings.
- `js/suggest.js`, `js/keywords.js`: category suggestions from free text.
- `js/engine.js`: dates, counts, progress, bulk paste, duplicates, spreadsheet diff. No DOM.
- `js/importer.js`: old Google Form workbook → cases. No DOM.
- `js/xlsxio.js`: Excel export and upload (ExcelJS).
- `js/cloud.js`: sign-in and Firestore (Firebase JS SDK 10.12.2 from gstatic, offline cache on). Writes return once queued locally, so saving works without signal; a write the server later rejects is reported through `onSyncError`.
- `js/demo-backend.js`: the `?demo` stand-in for `cloud.js` (localStorage, fake admin `demo@example.com`).
- `js/app.js`: boot, sign-in, tabs, service worker. Each screen is in `js/ui-*.js` (`ui-core.js` holds shared state and helpers).
- `sw.js`: offline app shell (cache-first). **Bump `VERSION` in `sw.js` whenever any file changes**, otherwise installed phones keep the old copy; with a new version the app shows "Update available — Reload".
- `firestore.rules`: access rules for the whole project, logbook and evaluations (paste into the console).

## Tests

Each test uses fake data only and runs with plain node:

```sh
for f in logbook/test/*.test.mjs; do node "$f" || break; done
```

The rules are checked against the Firestore emulator (needs Java). From a scratch folder outside the repo:

```sh
mkdir -p /tmp/lbrules && cd /tmp/lbrules
npm init -y && npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10.12.2
cp ~/anawj-site/logbook/firestore.rules ~/anawj-site/logbook/test/rules.emulator.mjs .
echo '{ "firestore": { "rules": "firestore.rules" }, "emulators": { "firestore": { "port": 8085, "host": "127.0.0.1" }, "ui": { "enabled": false } } }' > firebase.json
npx firebase emulators:exec --only firestore --project demo-logbook "node rules.emulator.mjs"
```
