# APMES Logbook

A case logbook for APMES (NUH anaesthesia) residents, at <https://apmes.anawj.com/logbook/> (it was at anawj.com/logbook/ until 13 Oct 2026; that address now forwards). It replaces the old Google Form and spreadsheet.

Logging a case takes three things: the date, free text (patient initials and case details), and one or more categories. Leading patient initials ("AB 34F LSCS spinal") are stored in a field of their own (`initials`); Enter adds a new line in the details box, and Ctrl+Enter (Cmd+Enter) saves. As you type, the page suggests categories from the text (age, BMI and keywords learnt from past logs). Progress against the APMES targets for your residency year is worked out from your counts.

It is a static page (vanilla ES modules, no build step) that installs to the home screen and works offline. Cases are stored in Cloud Firestore under your Google account and sync when you are back online.

Try it without signing in: <https://apmes.anawj.com/logbook/?demo> (made-up data, kept in your browser only; `?demo=empty` starts blank, `?demo=reset` wipes the demo data).

## Privacy model

- **Your cases are yours.** Only you can read or change your logbook and cases. This is enforced by `firestore.rules` on Google's side, not just by the page.
- **Admins** (the programme admins, listed in the `admins` collection) manage the resident list and shared templates. They **cannot** read anyone's logbook or cases; they see the counts in `summaries/` like everyone on the programme.
- **The app owner** (listed in the `owners` collection, set by hand in the console) can also read logbooks and cases and import cases into them, which is how the old form responses were imported. Never reflections, figures or the recycle bin. To hand the app over, add the new owner's email to `owners` (and `admins`) and remove your own.
- **Summaries are counts only.** Each programme resident's per-category counts (and complete reflections per heading, each capped at that heading's minimum so nobody can tell how many more were written) are copied to `summaries/{rid}` so the programme can compare progress. Only admins and programme residents can read them (the rules check that the `rid` in the reader's logbook belongs to a resident with the reader's email); other Google accounts cannot. A resident's own summary must carry the name and intake on the resident list. Case details are never in a summary; the rules reject any extra fields.
- Anyone with a Google account can sign in and keep a private logbook. Only people on the admin-managed resident list appear in the totals.
- Keep case details de-identified: initials and a short description, no names or NRIC numbers. The data is stored in Google Cloud (Firestore, asia-southeast1), outside NUH systems.
- This repository is public. It contains no resident names, emails or case data. Admin emails live only in Firestore.

## Firebase setup (once)

The Firebase project `apmes-logbook` already exists and its web config is in `js/firebase-config.js`. Those values are public by design.

1. **Authentication**: Firebase console → Authentication → Sign-in method → enable **Google**. Then Authentication → Settings → Authorised domains → add `apmes.anawj.com` (`localhost` is there already for testing; `anawj.com` can stay until the old address is retired).
2. **Firestore**: Firestore Database → Create database → location **asia-southeast1 (Singapore)** → **production mode**.
3. **Rules**: deployed automatically when a change to `firestore.rules` is merged to `main` (`.github/workflows/deploy-firestore-rules.yml`); don't paste them by hand. This one file holds the rules for the whole Firebase project, the logbook and evaluations (`/evals`) alike, so never publish another app's rules file over it.
4. **Admins**: Firestore Database → Data → Start collection `admins`. Add one document per admin. The document ID is the admin's Google email in lower case (use the admins' emails), with a field `name` (string). Admin emails are never written in this repository. **Owner**: the same in a collection `owners`, with one document for the app owner (who is usually an admin too).
5. **Optional, API key restriction**: Google Cloud console → APIs & Services → Credentials → the "Browser key" → Application restrictions → Websites → add `https://apmes.anawj.com/*`, `https://anawj.com/*`, `https://apmes-logbook.firebaseapp.com/*` and `http://localhost/*`. The key isn't a secret, but this stops other sites using it.
6. **Optional, Save to Google Drive and Dropbox** (More → Export / Import → Backup; `js/cloud-save.js`). Until these are done the buttons say "isn't set up yet".
   - **Google Drive**: Google Cloud console, project `apmes-logbook` → APIs & Services → Library → enable **Google Drive API**. OAuth consent screen → Data access → add the scope `.../auth/drive.file` (non-sensitive: the app sees only the files it creates, so no verification is needed). Credentials → the OAuth client of type *Web application* (the one Firebase made, "Web client (auto created by Google Service)", is fine) → Authorised JavaScript origins → add `https://apmes.anawj.com`; Authorised redirect URIs → add `https://apmes.anawj.com/logbook/` (and `http://localhost:8080/logbook/` for testing). Put its client ID in `GOOGLE_CLIENT_ID` in `js/backup-targets.js`. The client ID is public; there is no secret in the app.
   - **Dropbox**: <https://www.dropbox.com/developers/apps> → Create app → Scoped access → **App folder** → name it "APMES Logbook". Permissions: tick `files.content.write`, `files.content.read` and `files.metadata.read` (the last lists the folder to remove old backups). Settings → OAuth 2 → Redirect URIs → add `https://apmes.anawj.com/logbook/` (and `http://localhost:8080/logbook/` for testing). Leave "Allow public clients (Implicit Grant & PKCE)" on. Put the **App key** (not the secret) in `DROPBOX_APP_KEY` in `js/backup-targets.js`. Until the app has 50+ users or is approved for production, Dropbox lets only people added in its settings use it: apply for production when ready.
   - No background sync: unattended backups would need refresh tokens stored on a server. "Remind me…" offers a one-tap save when the app opens and the last backup is over 7 days old.
7. **Optional, Connect an AI assistant**: see `mcp/README.md` (a *Desktop app* OAuth client for the MCP server).
8. Sign in on the page as an admin, open **Settings → Admin**, paste the residents list, then run the import (below).

The project is on Blaze (pay-as-you-go); its free daily quotas, which usage stays within, are: 20,000 writes and 50,000 reads a day. The first import is about 16,000 cases, so it fits in one day; re-imports write only new rows.

Sign-in uses a Google popup, falling back to a redirect if popups are blocked (e.g. some home-screen apps). If redirect sign-in fails on iPhone home-screen installs, open the page in Safari once to sign in.

The Firebase sign-in helper pages are self-hosted at `/__/auth/` (copied from `https://apmes-logbook.firebaseapp.com/__/auth/handler`, `handler.js`, `experiments.js`, `iframe`, `iframe.js`) with `/__/firebase/init.json`, and `authDomain` is `apmes.anawj.com` in both apps' `firebase-config.js` (the Worker serves them there: `SUBDOMAINS.md`; `apmes-auth/firebase/init.json` is that host's copy of `init.json`). This keeps sign-in on the same site, so Chrome's storage partitioning doesn't break the redirect ("Unable to process request due to missing initial state"). `.nojekyll` stops GitHub Pages dropping the `__` folder. Google Cloud console → APIs & Services → Credentials → the Web client (auto created by Google Service) → Authorised redirect URIs must include `https://apmes.anawj.com/__/auth/handler` (and, until the old address is retired, `https://anawj.com/__/auth/handler`). Refresh the copied files now and then (Firebase updates them rarely).

## Data model

| Path | Contents | Who |
|---|---|---|
| `owners/{email}` | `{ name }` | the app owner; added by hand in the console; a user may check their own entry |
| `admins/{email}` | `{ name }` | added by hand in the console; a user may check their own entry |
| `pds/{email}` | `{ name }` | programme directors, a role separate from admin: read residents, summaries and evaluations; added by admins or in the console |
| `residents/{rid}` | `{ rid, name, email (lower case), status: ACTIVE / ON LEAVE / GRADUATED / ATTRITED, intake, rYear 1–5 }` | admins; a user may read the entry with their own email |
| `logbooks/{email}` | `{ email, name, rid, settings, templates: [{ id, name, cats, details? }], profile?, updatedAt }` (`profile`: portfolio Section 1 details, `{ familyName, givenName, sex: ''/M/F, dob, graduation, postgrad, program, programDirector, residencyStart, seniorStart, memberships, awards, scholarships, electives, projects, projectRemarks, papers, courses, teaching }`; dates 'YYYY-MM-DD', lists of row objects (columns in `SECTIONS`, ≤40 rows), strings ≤2000 (postgrad/projectRemarks ≤4000), cleaned by `cleanProfile` in `js/profile.js`; rules cap it at 30 keys. Export writes it into the template's cover page, PERSONAL DETAILS and Section 1 tables via `fillSection1Xml` in `js/portfolio.js`). Display settings are not here: they are saved per device (`localStorage` `apmes-logbook-display`: compact, text size, colour, start tab; `apmes-logbook-theme`: light / dark). A device starts from older values in `settings` the first time | owner; the app owner reads |
| `logbooks/{email}/cases/{id}` | `{ id, date ('YYYY-MM-DD' or null), dateText?, initials? (≤20, upper case; older cases have none and keep the initials at the front of `details`), details (≤2000 chars, may span lines), cats (≤40 codes), createdAt, updatedAt, source: app / import / paste / sheet, importKey?, reflectionId? }` | owner; the app owner reads and writes (import) |
| `logbooks/{email}/reflections/{id}` | `{ id, headingId, subId (or null), initials, date ('YYYY-MM-DD' or null), jr (bool), diagnosis (≤2000), title (≤300), summary (≤20000), points: [{ heading (≤300), text (≤20000) }] (≤15), figures: [{ id (image doc), caption (≤300), point (index of the learning point it follows, or null = after all) }] (≤10), references: [string ≤1000] (≤30), sections? (legacy: { description, thoughts, evaluation, analysis, conclusions, action, further }, each ≤20000), caseId (or null), status: draft / complete, export? (false = left out of the Word export; absent = in), createdAt, updatedAt }` (`js/reflections.js`). headingId '' = Uncategorised (can be complete, never exported). Exported like the portfolio's Section 2 rows: bold title, case summary, "Learning Points" with underlined numbered headings, figures with captions, references. | owner only; admins have no access |
| `logbooks/{email}/images/{id}` | `{ id, data (base64 without the data: prefix, < 700 KB), mime: image/jpeg or image/png, w, h, createdAt }`: reflection figures, compressed on the phone to JPEG (longest side ≤ 800 px, quality 0.7: about 60–120 KB). For the Word portfolio only: not in the backup file or the Excel export. Each figure in a reflection records its stored size as `kb`; a resident's figures may use at most 20 MB in total (`PHOTO_BUDGET_KB` in `js/reflections.js`, enforced by the app when adding a photo or importing a Word file; Settings → Photos shows the meter). Figures saved before sizes were recorded count as 300 KB until they are next opened | owner only |
| `logbooks/{email}/notes/{id}` | `{ id, date ('YYYY-MM-DD' or null), title (≤200), body (Markdown text ≤20000), caseId?, createdAt, updatedAt }`: personal notes (More → Notes; `js/notepad.js`). The app keeps at most 2,000. Never in the portfolio. | owner only; admins, PDs and the app owner have no access |
| `logbooks/{email}/meta/noteIndex` | `{ days: ['YYYY-MM-DD'…] (≤100), cases: [caseId…] (≤100), n, updatedAt }`: which days and cases have notes, so the Logbook can mark them without reading notes (`js/ui-notepad.js`). No other `meta` docs. | owner only; admins, PDs and the app owner have no access |
| `logbooks/{email}/bin/{id}` | `{ id, kind: case / reflection / note, data: the deleted case, reflection or note (≤40 top-level keys), deletedAt (ms) }`: the recycle bin (`js/bin.js`). Every case and reflection delete moves the item here; it can be restored (same id, or a new id if that id is in use again) for 30 days, then the app purges it after the next sign-in. A binned reflection's figures stay in `images/` until its entry is purged or deleted forever. | owner only; admins have no access |
| `logbooks/{email}/formGone/{caseId}` | `{ id, deletedAt }`: Google Form cases the resident deleted (`js/form-inbox.js`), kept for good so an edited or re-sent response doesn't bring one back | owner only |
| `summaries/{rid}` | `{ rid, name, intake, rYear, counts: { code: n }, total, reflections: { headingId: n }, reflectionsTotal, updatedAt }` | admins and programme residents read; admins or that resident write |
| `imports/{rid}` | `{ email, keys: [importKey], updatedAt }` (keys reset if the resident's email changes) | the app owner |
| `sharedTemplates/{id}` | `{ id, name, cats, details? }` | everyone signed in reads; admins write |
| `formInbox/{responseId}` | `{ id, email, date ('YYYY-MM-DD' or null), dateText?, details (≤2000), labels: [category answers] (≤40), submittedAt (ms) }`: Google Form responses waiting for the app to pick them up (`js/form-inbox.js`) | the Form's bot account adds or replaces (never reads); the resident with that email reads and deletes |
| `formBots/{uid}` | anything: lists the bot account the Form's Apps Script signs in as | nobody (console only) |

`{email}` is always the Google account email in lower case. Category codes and targets are in `js/categories.js`.

## How the import works

The old data is the Google Form responses workbook (tabs **Case** and **AY20xx Totals**). The app owner only (admins see a note instead). In **Settings → Admin**:

1. Paste the residents list (the `RESIDENTS` array from the old Apps Script). Check names, emails, status and residency year, then save. This creates `residents/{rid}`.
2. Upload the workbook. It is read in the browser (nothing is uploaded except the resulting cases). `js/importer.js` reads the Case tab: resident, date, details and the category columns, merged into one list of codes. Rows marked "WRONG ENTRY" are skipped; dates that can't be read are kept as text and flagged "needs date".
3. The page compares the counts per resident and category with the Totals tabs (`countCheck`) and shows any differences before you import.
4. **Import** writes each resident's cases into `logbooks/{their email}/cases`, then their summary. Every row has an `importKey` (a hash of resident, form timestamp, date, details and categories, plus a counter for identical rows). `imports/{rid}` records which keys are in, so running the import again after more form responses writes only the new rows. The case document ID is derived from the key, so an interrupted import can be resumed without duplicates.

## The Google Form, still open (Oct 2026)

Residents who prefer the old APMES Google Form can keep using it, with no end date; the logbook stays the one record.
One way only: Form → logbook, never back.

1. A small Apps Script on the Form ([`form-script/`](form-script/README.md): the code and the setup steps) runs on every new or edited response
   and writes just that response to `formInbox/{responseId}`: the respondent's Google sign-in email (the Form
   requires sign-in), date, the initials and case details answer, and the category answers. It signs in as a bot
   account (Firebase email and password) whose uid is listed by hand in `formBots/`. The bot's email is never
   verified, so every other rule (`signedIn()`) stays closed to it; it can only add or replace inbox entries.
2. When the resident next opens the logbook (after the first server copy of their cases), the app reads their
   entries, turns each into a case (`source: 'form'`, id from the response id, initials split off, labels to codes,
   NRIC/long numbers replaced by "[ID removed]", unrecognised tags noted in the details) and deletes the entries.
3. Duplicates: a response already imported from the workbook (Admin portal) is skipped by the inbox, and a re-run
   of the workbook import skips responses the inbox brought in (`sameResponse`: same day, same response second once
   the sheet's time zone is taken off; for a Form case, its first submit or, once the app has picked up an edit, its
   newest one). An old response edited in the Form arrives with its edit time: an imported case with the same day,
   initials and categories counts as it (not added; the toast says so, as it may be another patient: log that one in
   the app). An edit that changes the day, initials or categories still adds a second case. A Form case the resident
   deleted doesn't come back: its id is kept in `formGone` (written when it goes to the bin and again before its bin
   entry goes). An imported case the resident deleted stays gone only while it is in the bin, and only from its own
   response (same time); a response that merely has its day, initials and categories is added (it may be a corrected
   copy) and the toast points to the bin. The pick-up reads the bin and `formGone` from the server and stops if it
   can't; the toast tells only what reached the server. Each entry's case and
   its delete go in one batch (`cloud.commitFormPickup`); at most 50 per pick-up, which runs again when the app comes
   back to the front (every 10 minutes at most).
4. An edited response replaces the case it made, unless the resident has changed that case in the app since
   (`importKey` `form:<responseId>~<newest submit>@<ms written>`, the `@` time being the `updatedAt` actually written;
   a later `updatedAt` means theirs: then only the newest submit is noted in the key); what only the app adds (a
   linked reflection, the star, personal tags) is kept.

Tests: `test/form-inbox.test.mjs`, `test/form-pickup.test.mjs` (cloud.js's real Firestore code against a stand-in SDK,
`test/fake-firebase.mjs`), `test/form-script.test.mjs`, the rules suite (`tools/test-rules.sh`) and the emulator browser
test (`tools/test-reads.sh`). A change to `form-script/Code.gs` must be pasted into the Form by the owner: list it in
`form-script/CHANGES-PENDING.md`.

## Code

- `js/reflections.js`: reflection shape and progress against the portfolio rules (96 total, JR, sub-types, unique patients); `js/ui-reflect.js`: the Reflections tab (`#reflect`): every reflection is linked to a logged case (`caseId`); "+ New reflection" opens a case picker and pre-fills from the chosen case, and a case's Reflect button does the same. Unlinked older reflections show "not linked" and can't be marked complete until linked.
- Reflections tab extras: each heading has "+ Add" (and sub-type chips) that open the case picker with the heading preset; after the general "+ New reflection" the app suggests headings from the case (`suggestHeadings` in `js/reflections.js`). "Edit" unlocks dragging a reflection (⠿ handle, mouse or touch) onto another heading, with Undo, and checkboxes to move several to the recycle bin after a confirmation.
- Choosing what's exported: only complete reflections under a heading and not left out (`inExport`) go into the Word export; each row has an export tick, Edit mode can include or leave out several, and each heading shows written / in export with warnings (`exportSummary`: fewer than the minimum, a sub-type or the JR reflections left out). "Tick just enough" (`pickJustEnough`) keeps, per heading, the longest reflections (word count) that cover the sub-types and JR ones, up to the minimum. Settings → Reflections: whether new reflections start ticked (`settings.reflExport`, default on). Headings already met start folded; the list has a search box and filters (drafts, in / not in export); tagged cases sit in one folded line under the header and at the top of the case picker.
- `js/reflect-import.js`: parses a portfolio Word file (.docx) back into reflections (`parseDocx`). No DOM. `js/ui-reflect-import.js`: "Upload from Word" on the Reflections tab: a review page lists what was found with a checkbox per reflection; ticked ones are added as drafts. Rows listing multiple patients with corresponding readable dates require a "Case to keep" choice. The chosen patient fields are used, all reflection text is retained, and existing logbook cases are left intact. Ambiguous diagnosis text is retained for review rather than guessed.
- `js/ui-account.js`: the Account tab (`#account`): the "You" card (name, programme status), then "Portfolio details (Section 1)" (personal details, then one collapsible card per Section 1 table from `SECTIONS` in `js/profile.js`; autosaves ~1 s after typing to `logbooks/{email}.profile` via `cleanProfile`, offline too), with "Fill from my Word portfolio" (reads Section 1 of a .docx with `parseSection1`, shows what was found, then fills only empty fields and adds rows not already there). Sign out is at the bottom. The Settings tab (`#settings`, `js/ui-settings.js`) holds display, logging, templates, the recycle bin and privacy; admins open Admin (`#admin`, `js/ui-admin.js`) from a card at the top of Settings. Its residents list is read-only until you tap Edit, in collapsible groups: R5 down to R1, then SMO (a resident status), year unknown, graduated and attrited (the last two start folded). Section 1 lists show one line per entry; tapping an entry or + Add opens a small form. The Reflections export passes the profile so Section 1 is filled in the Word file.
- `js/bin.js`: the recycle bin (`moveToBin`, `restoreFromBin`, `deleteForever`, `purgeExpired`, `renderBin` / `openBin`). Reached from Settings → Recycle bin and from the Reflections tab.
- `js/categories.js`: categories, targets, EPA tags, tips, reflection headings.
- `js/suggest.js`, `js/keywords.js`: category suggestions from free text.
- `js/engine.js`: dates, counts, progress, bulk paste, duplicates, spreadsheet diff. No DOM.
- Patient initials (`splitInitials`, `caseParts`, `caseText` in `js/engine.js`): leading 2–4 letters, optionally followed by `/` or a space (or 5–8 letters when an age or `/` follows, for older cases with longer initials), are split off the details when a case is created (Log screen, paste list, Excel/grid rows without an Initials column, admin import), unless they are a known case word (anything in the keyword table, e.g. LSCS, TKR, VATS, IJ, plus GA, LA, MAC, …). Older cases without the field are split on the fly for display and in the edit dialog, and stored apart on their next save. The Excel export keeps one "Case details" column (initials + details), so old files still round-trip; an optional "Initials" column is used directly on upload. Search, duplicates and the spreadsheet diff compare initials + details as one text. The import's `importKey` is still hashed on the original details text.
- Paste list (`parseBulk`): cases are separated by blank lines, so a case can span lines; an optional date at the start of a case's first line sets its date. In the review table each case offers "Same as above: <codes>" (the categories of the case above, when they are not all there already) next to its own suggestions.
- Tags (`js/tags.js`, Settings → Tag editor): the Log page's list is the user's tag set (`settings.tagSet`, display order): the APMES categories are built-in tags (`c:<code>`; renamed, hidden, reordered or put under section headers `h:` per user, but always counting towards their category), plus the user's own tags (`u:`; older personal subcategories keep their `code:name` keys) that link to any APMES categories (choosing one ticks them) or to none. A tag under a category counts towards it. Cases keep APMES codes in `cats` (Totals, Progress, exports) and the user's tags by key in `tags`. "Share as CSV" / "Load a CSV" swap layouts as a readable CSV (Type, Tag, Long name, Under, APMES categories, Hidden, Key). A user's own names come before an admin's (Settings → Category names) and the programme defaults (`DEFAULT_NAMES`).
- Log page: one-line date bar (Today, as many recent weekdays as fit, a calendar, Case | List); the category list shows as List or Pills (`settings.catView`).
- `js/importer.js`: old Google Form workbook → cases. No DOM.
- `js/xlsxio.js`: Excel export and upload (ExcelJS).
- `mcp/`: an MCP server residents run on their own computer, so Claude Desktop or Claude Code can read their own logbook (cases, progress, reflections) and add or change cases and draft reflections (each write previewed first; no deletes). It signs in with Google (a "Desktop app" OAuth client the owner sets up once) and reads Firestore as the user, so the same rules apply. No server. See `mcp/README.md`; linked from Settings → Connect an AI assistant (advanced). Its tests: `for f in logbook/mcp/test/*.test.mjs; do node "$f"; done` (the tools test needs `npm install` in `logbook/mcp` first).
- `js/markdown.js`: the Markdown format (Settings → Markdown, saved in `logbook.settings.markdown`, only what differs from the default, at most 8 KB) for Copy / Share on the Logbook tab and the notes export: day and case templates with `{{fill-ins}}`, date format, categories as names, codes or #tags, wiki or Markdown links, front matter, reflection note templates, file names and folders. No DOM. `js/ui-notes.js`: **Download for notes apps** (More → Export / Import): a zip of Markdown notes for Obsidian and the like, built on the phone: case notes by month or day, one note per reflection, `Progress.md` (counts against targets, reflections per heading against the minimum) and, if chosen, the figures in `images/`. The files hold case details: the app says so next to the button.
- `js/cloud.js`: sign-in and Firestore (Firebase JS SDK 10.12.2 from gstatic, offline cache on). Writes return once queued locally, so saving works without signal; a write the server later rejects is reported through `onSyncError`. `?emulator` on localhost (tests only) uses the Firestore and Auth emulators.
- `js/sync.js`, `js/store.js`: the sync engine. Cases, reflections and notes keep a copy on the device (IndexedDB, one store per account) and listen only for what changed since the last sync, so reopening costs about one read per collection; a full read on first use and weekly. Design and limits: `NOTES.md`, "Sync".
- `js/demo-backend.js`: the `?demo` stand-in for `cloud.js` (localStorage, fake admin `demo@example.com`).
- `js/app.js`: boot, sign-in, tabs, service worker. Each screen is in `js/ui-*.js` (`ui-core.js` holds shared state and helpers).
- `sw.js`: offline app shell (cache-first). Its `VERSION` is stamped at deploy with a hash of the SHELL files (`tools/stamp-versions.mjs`), so installed phones get the new copy; with a new version the app shows "Update available — Reload".
- `firestore.rules`: access rules for the whole project, logbook and evaluations (deployed automatically on merge to `main`).

## Tests

Each test uses fake data only and runs with plain node:

```sh
for f in logbook/test/*.test.mjs; do node "$f" || break; done
# uses the blank template in apmes/templates/ (PORTFOLIO_TEMPLATE=other.docx to try another): node logbook/test/profile.test.mjs
# fills Section 1 of the real template with a made-up profile and reads it back (parseSection1)
```

Read counts of the sync engine, against the Firestore and Auth emulators with the real rules (needs Java; fake
account and cases, demo project): `PORT=8080 tools/test-reads.sh`.

The rules are checked against the Firestore emulator (needs Java). From a scratch folder outside the repo:

```sh
mkdir -p /tmp/lbrules && cd /tmp/lbrules
npm init -y && npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10.12.2
cp ~/anawj-site/logbook/firestore.rules ~/anawj-site/logbook/test/rules.emulator.mjs .
echo '{ "firestore": { "rules": "firestore.rules" }, "emulators": { "firestore": { "port": 8085, "host": "127.0.0.1" }, "ui": { "enabled": false } } }' > firebase.json
npx firebase emulators:exec --only firestore --project demo-logbook "node rules.emulator.mjs"
```
