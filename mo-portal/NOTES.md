# Baby MO Portal notes

Lasting decisions for `mo-portal/`. Status and next steps: `STATUS.md`. Cloud setup: `SETUP.md`.

## Purpose

**Audience (owner, 14 Oct 2026): the baby MOs of Ng Teng Fong General Hospital (NTFGH) anaesthesia, not NUH.** The portal
is independent of the NUH roster app: no links to it, no shared data or sign-in, for now. Tools and pages from the
sibling repo `anantf-site` (the NTF anaesthesia teaching site) may be reused later.

The department's tests and later discussions for new MOs (every few months a new group rotates in). First module: the
**Baby MO Test**, the 20-question MCQ (pass 16/20 = 80%, 20 minutes, one answer each, no negative marking) that used to
be a Word paper. Later modules the owner has in mind (not built): CBD discussions, feedback, questions. Keep the portal
a set of small modules behind one sign-in; add them as nav links, don't bend the test code.

## Who uses it, and how they get in (owner, 14 Oct 2026)

- **MOs**: name + one shared passphrase. No Google account. Behind the scenes Firebase *anonymous* sign-in plus a
  `sessions/{uid}` document that the rules only allow if the passphrase matches `config/access`. Changing the
  passphrase locks out old sessions, so change it per intake.
- **Faculty**: Google sign-in; the email must be in `members` (role `editor` or `admin`). Admins also change settings,
  the passphrase and the faculty list, and delete things.
- Security is deliberately light ("security isn't that important"). Honest limits: the correct answers are in the
  question documents, so a determined MO with browser developer tools could read them; faculty can see the passphrase.
  Don't put anything confidential in a question.

## Design rules

- **Non-tech faculty must be able to edit without AI**: forms, not files. One question per screen, plain words, status
  Draft / In the test / Archived (drafts may be unfinished and are never given to MOs), live preview, paste-many from
  Word, spreadsheet round trip, full JSON backup.
- **Robustness**: a test in progress survives reload (answers and the start time are saved; the clock runs from the
  saved start); the timer auto-submits; a finished attempt waits in a local outbox until the server has it (retried on
  reconnect; ids make a retry idempotent); unsaved question edits are kept on the device; saves use a revision number so
  two editors can't silently overwrite each other (the second is asked); every save keeps a history entry.
- **Past results never change**: an attempt stores a snapshot of each question (stem, options, answer) as the MO saw it,
  and scores are recomputed from the snapshot (`summarise`), not read from a stored number. Editing a question later is
  safe.
- Questions are drawn at random (up to the configured count) from the questions that are "In the test" and complete;
  question order is random, choices keep the order faculty wrote (so "all of the above" works).
- Pictures (ECG, X-ray) are shrunk in the browser to a JPEG under 400 KB and stored in the question.
- Real question text is **not** in this public repo. The bank lives in Firestore; the owner imports it from a JSON
  backup. The demo has six invented sample questions in `js/local.js`.

## Code map

- `js/logic.js`: pure logic (validation, drawing a test, marking, paste parser, CSV, backup JSON, stats); tests in
  `test/logic.test.mjs`.
- `js/local.js`: browser-only backend (demo and "not connected yet"); `js/cloud.js`: Firebase backend; `js/store.js`
  picks one. Same functions in both: any change to one needs the other.
- `js/app.js`: all screens (hash routes: `#/`, `#/ready`, `#/test`, `#/result`, `#/faculty…`).
- `firestore.rules` (project `ntf-mo-portal`, not deployed until the workflow entry in `SETUP.md` step F is added).

## Tests

`node mo-portal/test/logic.test.mjs`, `node mo-portal/test/e2e.mjs` (demo mode in a browser at phone size + axe),
`tools/test-rules.sh` (includes the portal's rules), `tools/test-mo-portal-cloud.sh` (browser against the Auth and
Firestore emulators, if present).

## Address

`mo.anawj.com` (mapped in `worker/routes.js`; the owner adds the custom domain in Cloudflare like the other subdomains,
see `SUBDOMAINS.md`). Until then the folder is also served at `anawj.com/mo-portal/` by GitHub Pages: don't hand that
out, since logins and saved data belong to the address.
