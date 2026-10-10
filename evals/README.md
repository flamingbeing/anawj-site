# APMES Evaluations

A phone-first web app at `anawj.com/evals/` for workplace-based assessments: **DOPS, Mini-CEX and EBD**.
The resident picks the item (from the EPA Guidebook v8 catalogue), names an assessor from the faculty
list and sends a link or QR code. The assessor signs in with Google, fills the official form in a few
taps (saved as they go) and submits or declines. The resident reads the result and sees progress
against the APMES requirements. PDs and admins see every evaluation, keep the faculty and resident
lists, approve applications and download a CSV.

It is a trial app for **all residents and postings**. Vanilla ES modules, no build step, same Firebase
project as the logbook (`apmes-logbook`, free Spark plan).

## Try it

Serve the repo root and open the demo (made-up people, kept only in this browser):

```
npx http-server . -p 8110 -c-1
# http://localhost:8110/evals/?demo            resident "Demo Resident"
# http://localhost:8110/evals/?demo=assessor   "Dr Demo Faculty"
# http://localhost:8110/evals/?demo=admin      admin + PD
# http://localhost:8110/evals/?demo=reset      wipe and re-seed the demo store
```

All tabs share one demo store (`localStorage` key `apmes-evals-demo-v1`), so you can request in one tab
as the resident and complete it in another as the assessor. More → "Switch demo role" does the same in
one tab. The demo never loads Firebase.

## Files

| File | What |
|---|---|
| `index.html`, `style.css`, `manifest.webmanifest`, `icons/`, `sw.js` | Shell, styles (NUHS tokens from `../design/tokens.css`), PWA and offline cache (`evals-*` caches only). |
| `js/app.js`, `js/ui-core.js` | Boot, sign-in, roles, tabs, hash routes, shared helpers and state. |
| `js/catalogue.js`, `js/forms.js` | **Generated** by `node tools/build-data.mjs` from `reference/*.json` and `reference/guidebook/*.md`. 14 EPAs, 67 items (DOPS 17, Mini-CEX 12, EBD 38), 46 counting groups; the three forms. |
| `js/engine.js` | Pure logic: validation, visible questions, progress, status, case key, identifier warning. |
| `js/cloud.js`, `js/demo-backend.js`, `js/firebase-config.js` | Firestore backend and the in-browser demo, same API. |
| `js/ui-*.js` | Screens: home, request flow, requests, result, progress (resident); pending and form (assessor); overview and people (admin/PD); more. |
| `js/vendor/qrcode.js` | qrcode-generator 1.4.4 (MIT), as an ES module. |

Routes: `#home` `#new[/itemId]` `#requests` `#r/{id}` `#progress` `#pending[/history]` `#e/{id}` `#overview` `#people[/faculty|/residents]` `#more`.

## Tests

```
# unit tests (no dependencies)
for f in evals/test/*.test.mjs; do node "$f"; done

# end-to-end demo loop (Playwright + Chromium; a global install works)
npx http-server . -p 8110 -s -c-1 &
node evals/test/e2e.spec.mjs        # BASE, PW_PATH, CHROMIUM env vars override the defaults
```

The e2e script drives one browser context across roles: a resident requests a DOPS, the assessor
completes it, the resident marks it "Got it" and Progress ticks it; then a Mini-CEX (with a blocked
submit for a missing answer and a comment under 30 characters), an EBD (Q3 shown/hidden), a decline
with "Other" and a reassign to another assessor, the admin screens, and no console errors (36 checks).
Taps measured: DOPS 18 (17 answers + Submit, plus typing the entrustment answer), Mini-CEX 19,
EBD 10, resident request 6 from `#new/{item}` (+ typing the initials).

Rules tests run against the Firestore emulator (needs Java, `firebase-tools`,
`@firebase/rules-unit-testing` and `firebase`), from the repo root:

```
npx firebase emulators:exec --only firestore --project demo-logbook \
  "cd logbook && node test/rules.emulator.mjs; cd .. && node evals/test/rules.emulator.mjs"
```

151 evals checks and 103 logbook checks (the logbook's behaviour is unchanged).

## Data model

One rules file for the whole project: **`logbook/firestore.rules`** (the evals rules are a block in it).
Emails are lower case and are the identity; sign-in is Google only for now (`cloud.EMAIL_LINK = false`
keeps a stub for hospital email-link sign-in on the paid plan later).

| Path | Fields | Who |
|---|---|---|
| `admins/{email}`, `pds/{email}` | `{ name }` | As the logbook. PDs can now also maintain the people lists. |
| `residents/{rid}` | `{ rid, name, email, status: ACTIVE\|ON LEAVE\|GRADUATED\|ATTRITED, intake, rYear }` | Admin create/update; PD create, and update without changing the email (the email is what grants logbook access). Delete admin-only; **the app never deletes residents** (change the status instead). |
| `members/{email}` **new** | `{ rid }` | Written by the resident themselves at sign-in (the rid must carry their email), so rules can tell a resident by email. Grants nothing alone: each use re-checks `residents/{rid}`. |
| `faculty/{email}` **new** | `{ email, name, status: ACTIVE\|INACTIVE, updatedAt }` | Admin or PD write. Read by admins, PDs, faculty and residents (via `members`); anyone may check their own entry. Only ACTIVE faculty can be named as assessors. |
| `applications/{uid}` **new** | `{ uid, email, name, role: resident\|faculty, note, status: pending\|approved\|rejected, createdAt, decidedAt?, decidedBy? }` | The applicant writes their own while pending, or applies again after a rejection; admin/PD read and decide. Approving creates the faculty or resident entry (never overwriting another resident's rid). |
| `evaluations/{id}` | `{ id, rid, residentEmail, residentName, assessorEmail, assessorName, formId: dops\|minicex\|ebd, formVersion, itemId, itemText, tool: DOPS\|MiniCEX\|EBD, epa, level, date, caseKey, source:'evals', status, request, assessment, metrics, declineReason, createdAt, updatedAt, requestedAt, submittedAt, declinedAt, seenAt, chasedAt, caseId? }` | See below. |
| `evaluations/{id}/private/assessor` | `{ comments, updatedAt }` | Optional PD-only note. Never the resident. |

`status`: `draft` → `requested` → `submitted`, or `declined` (assessor, with `declineReason {code, text}`;
codes `not-observed`, `not-co-managed`, `conflict`, `wrong-item`, `other`) → `requested` again when the
resident sends it to another assessor, or `cancelled` (resident, before submission).
`request` is the case card `{ date, location, initials, ageBand, gender, coManaged (EBD), notes? }` (no
names or record numbers). `assessment` is keyed `q1…q22`: 9-point 1–9 or `'NA'`, milestones 0.5–5 or
`'NA'`, supervision 1–5, selects store the option text, checkboxes an array, text a string.
`metrics` is `{ openedAt, firstAnswerAt, submitAttempts }`. Times are client milliseconds; request,
submit and decline times may not be in the future (5 min slack) or over 30 days old, so a form
submitted offline still syncs hours later. The assessor's answers stay on the device until the server
has the outcome. A decline drops any partial answers. The case card is limited to its 7 keys
(initials ≤3, location ≤100, notes ≤1000 characters).

| Who | Can |
|---|---|
| Resident | Create for themselves (`draft`/`requested`) naming an active listed faculty member, not themselves. Change the assessor until an answer is saved (opening the form doesn't count); cancel; reassign after a decline; set `seenAt` on a result; delete their own drafts only (never one with answers). |
| Assessor (signed in as `assessorEmail`) | Sees it once sent (never the resident's unsent draft). While `requested`: save answers, then submit or decline. Edit the answers for 15 minutes after submitting. Faculty set INACTIVE can still finish requests already sent to them. |
| PD | Read everything; maintain faculty, residents and applications. |
| Admin | Everything, including any valid change to an evaluation (#r/{id} has Reassign, Cancel request and Reopen). |

Queries match the rules: `where('residentEmail','==',me)`, `where('assessorEmail','==',me)` with
`where('status','in',[sent statuses])` and, for PD/admin, the whole collection. Equality filters only,
so **no composite indexes are needed**.

## Going live (Firebase console, project `apmes-logbook`)

1. **Authentication → Sign-in method:** Google is already on for the logbook. Under Settings →
   Authorised domains, check `anawj.com` is listed.
2. **Firestore → Rules:** paste the whole of `logbook/firestore.rules` and Publish (never paste another
   rules file over it). Run the emulator tests first.
3. **Admins and PDs:** add `admins/{email}` and `pds/{email}` documents `{ name }` by hand (lower-case
   email as the document id) if they aren't there yet.
4. **People lists:** sign in as an admin/PD, open People, and paste the faculty list (`Name, email` per
   line) and the resident list (`rid, name, email, intake, rYear`). Anyone else who signs in can apply
   as faculty or resident from the app; approve them under People → Applications.
5. **Deploy:** push the `evals/` folder with the site. The service worker is `evals-v1`; bump `VERSION`
   in `sw.js` whenever a shell file changes so phones pick up the update.

## Still to do

- **EPA 7–12 entrustment questions** aren't transcribed yet (EPA 1–6 are, from the guidebook). Add them
  to `reference/guidebook/` and rerun `node tools/build-data.mjs` before going live.
- Not built yet: linking an evaluation to a logbook case (`caseId`), mask holding credited automatically by an LMA/ETT DOPS, "abandoned >3 days" flags.
- Hospital email sign-in (email link, linked emails) waits for the paid plan; see `cloud.EMAIL_LINK`.
