# Logbook: data, roles, photos and Firestore rules

Part of the logbook working notes; index in [../NOTES.md](../NOTES.md).


- **App owner:** `owners/{email}`, set by hand in the Firebase console. May read logbooks and cases and import
  cases, but never reflections, images or the bin. Hand over by swapping the entry. Owner and admin are separate: without an
  `admins/` entry the owner has no Admin portal (where the import and initials fix live).
- **Admins** (the programme coordinators, PCs, are admins) can't read logbooks or cases. They read `summaries/`
  (counts per category, completed reflections per heading) and portfolios marked ready (`submissions/`). PDs,
  programme residents and **active faculty** read `summaries/` too (faculty since Oct 2026, for the Faculty / PCs
  profile). Reflections stay private to the resident, the owner included.
- **Photos:** adding one needs `isMember()` (on the residents list). 800–1000 px JPEG, a 20 MB budget per resident
  (`PHOTO_BUDGET_KB`; figures record `kb`). They stay in Firestore: at 150 residents that is about 3 GB, around
  US$0.40/month on Blaze, and photos still work offline. Moving to Firebase Storage needs a console bucket
  (asia-southeast1), loses offline adds, and isn't worth it yet.
- **Address (13 Oct 2026, SUBDOMAINS.md step 5):** the logbook lives at `apmes.anawj.com/logbook/` (evals beside it). `anawj.com/logbook/` still serves the same folder, but a top-level visit forwards (path, query, # kept; `index.html` head script; no-op on the new host, previews, localhost and frames). A browser with choices saved at the old address first gets a page (`js/moved.js`, `window.LOGBOOK_MOVED_TO`) offering them as a file (`deviceFile` in `settings-file.js`, kind `apmes-logbook-device`: `apmes-logbook-*` and `logbook-*` keys except demo, moved and Google / Dropbox sign-in state); Settings → Settings file at the new address loads it. e2e: `test/e2e/moved.mjs`. `authDomain` is `apmes.anawj.com` (helper pages and `init.json` served by the Worker, `apmes-auth/`).
- **Google Form inbox (14 Oct 2026):** the old Google Form stays open as a simple way in (owner: no end date). Its
  Apps Script writes each response to `formInbox/{responseId}` as a bot account listed in `formBots/{uid}` (console
  only; unverified email, so nothing else opens to it); the app turns the signed-in resident's entries into cases
  (`source: 'form'`) and deletes them (`form-inbox.js`, README "The Google Form, still open"). One way only: never
  write back to the Form or its sheet. Each open costs one extra read (the inbox query), even when empty. The script
  and its setup: `form-script/` (never turn off Firebase Auth "Enable create (sign-up)": it would block new Google sign-ins).
  Owner, 14 Oct 2026: no "Google sign-ins only" rule (`sign_in_provider`) for now: a small single-hospital Form with no
  patient identifiers. Password accounts already get nothing (every rule needs a verified email or `formBots`).
  15 Oct 2026 (audit): a response can come back at any time (edits stay on; the backfill), so a deleted Form case is
  kept for good in `formGone/{caseId}` (the bin lasts only 30 days), the pick-up stops if the bin or that list can't be
  read from the server, and the key notes the response's newest submit (a re-import knows an edited row). FormApp
  gives no first-submit time, so an old imported response edited in the Form is matched by day, initials and
  categories (not added, with a toast); a match like that against a case in the bin is added (with a toast), never
  dropped quietly. A `Code.gs` change reaches the Form only when the owner pastes it: list it in `form-script/CHANGES-PENDING.md`.
- **Test data paths against the real rules (14 Oct 2026 lesson):** the e2e tests run in demo mode, which skips the
  server-side checks (`commitRecord`'s base comparison, the rules), so a delete that never reached the server passed every
  test for a day (#519). Any change to saving, deleting, sync or the bin also needs the emulator tests:
  `tools/test-reads.sh` and `tools/test-multidevice.sh` (5 devices, random actions, devices going offline; seeded).
  `TEST=conflicts tools/test-multidevice.sh` runs fixed two-device scenarios (same case changed in two places, recycle
  bin, Form pick-up twice, a late offline save, sign-out with unsent work). The rule they check: nothing that said it
  saved is lost silently; it is on the server, or its device says "Save needs attention" and keeps it in Recent changes.
  A delete that loses to an edit made elsewhere is undone with a toast (the edit stays).
- **App → response sheet (14 Oct 2026, `PLAN-app-to-sheet.md`):** new app cases (source `app` or `paste`) of programme
  residents also go to `sheetOutbox/{caseId}` (`js/sheet-outbox.js`, switched by `SHEET_OUTBOX_ON`); a script on the
  sheet turns each into a Case-tab row with `app:<caseId>` in column J and deletes the entry. New cases only (edits
  and deletions don't reach the sheet; a case deleted before pick-up is taken out of the outbox, and put back when it is
  restored with its id: Undo, the bin, a delete that failed or lost to an edit; only cases made since `SHEET_OUTBOX_SINCE`,
  the go-live instant, 22:15 Singapore time on 14 Oct 2026; deleting an entry already gone is allowed, so a late offline
  delete shows no false sync error). The Admin workbook import skips rows with `app:` in column J (its count check still adds them: the AY
  Totals count them). Outbox.gs reads one page of 12 per run from a cursor (`LOGBOOK_OUTBOX_CURSOR`), so entries it must
  skip (resident not on the Residents tab) never block the rest (Oct 2026: they used to, as every run read the same first
  page); the nightly Totals check reports skipped entries and fails after a day. One run at a time (the script lock), and
  each piece looks in column J again under the lock, so overlapping runs never add a case twice. An entry keeps the rid it
  was queued with, so a wrong id fixed in People leaves the old entries stuck: `logbookOutboxDropRid` lists, then deletes
  them. New cases go only once the logbook names the resident's rid (`toSheet`); `app.js keepRid` sets it the moment the
  resident is known, also mid-session (someone put on the list after this device last asked). The sheet side is `form-script/Outbox.gs` (setup: `form-script/OUTBOX-README.md`). Lessons (14 Oct): the sheet's own script rebuilds a resident's report and the AY totals in 10–40 s under the document lock while its `onFormSubmit` waits only 10 s (now 60 s), so Outbox.gs holds the lock in small pieces and keeps owed rebuilds in a Script property; a copy of the sheet keeps the REAL residents' report spreadsheet ids (Residents column G), so any test on a copy must repoint them first (`logbookOutboxTryOne` refuses otherwise); Apps Script loads files in list order (keep the original order, put new files last); a script that adds rows doesn't fire `onFormSubmit`, so it runs the same chain itself. Tests: `test/sheet-outbox.test.mjs`, the sheetOutbox rules in
  `test/rules.emulator.mjs`, and `TEST=conflicts` (scenario `sheetOutbox`).
- **Privacy policy:** `privacy/index.html` (anawj.com/privacy/) shows who sees what. Keep it in step when roles change.
- **Private feedback (14 Oct 2026):** More → Send feedback (`ui-feedback.js`, pure parts in `feedback.js`) saves
  `feedback/{id}` { uid, text ≤ 2000, doing? ≤ 300, screen, version, ua ≤ 200, status 'new', createdAt = server time }.
  Residents must never use the site's public routes (page editor, 💬 button): they make **public** GitHub issues.
  Only the uid is kept, no email (the owner can look a uid up in Firebase Authentication if a reply is needed);
  `screen` is the name of the page before More (`S.lastScreen`), never anything on it; `version` is the service
  worker's cache name. Send needs the "no patient details" tick and runs `okNoIds` first. Only the app owner
  (`owners/`) reads it: More → Feedback (also linked from Admin), New / Done / All, Mark done (the rules let only
  `status` change, to 'new' or 'done'), Delete, Copy as task (names and numbers replaced using `PRIVATE`, the same
  patterns as `feedback/overlay.js`; `test/feedback.test.mjs` keeps them in step). Admins can't read it. The demo
  stores it in the demo store (the demo admin plays the owner). Tests: `test/e2e/feedback.mjs`, rules suite.
