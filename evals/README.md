# APMES Evaluations (groundwork)

Workplace-based assessments at `anawj.com/evals/`: the resident starts an evaluation and names an assessor. The assessor opens a link, signs in and fills it in. PDs and admins see every evaluation and which are complete. The app itself isn't built yet. This folder holds the agreed data model and the access rules, so the app can be built against them and later combined with the logbook and the roster.

## Decisions

| Decision | Choice | Notes |
|---|---|---|
| Firebase project | Same as the logbook (`apmes-logbook`) | Reuses `residents/{rid}`, `admins/{email}`, and lower-case Google email as identity. |
| Rules file | **One file for the project: `logbook/firestore.rules`** | Firestore allows one rules file per project. The evals rules are a block in that file. Publishing any other rules file would wipe out the logbook's rules. |
| PD role | `pds/{email}` `{ name }`, separate from `admins` | Today a PD can read residents, summaries and all evaluations, with no writes, so permissions can be tuned later without touching admins. Admins add PDs (or add them by hand in the console). |
| Shared keys | Every evaluation has `rid`, `date` (`YYYY-MM-DD`) and `source: 'evals'` | A future CCC dashboard can join evaluations to logbook summaries (`summaries/{rid}`). Logbook cases sit under `logbooks/{email}` without a rid, so joining evaluations to individual cases goes through `residents/{rid}.email`, or through `caseId` when an evaluation is linked to a case. |
| Code | Separate `/evals` folder, same style as the logbook | Vanilla ES modules, no build step, node tests in `test/*.test.mjs`. **Copy** rather than import from `logbook/js/`. `cloud.js`, `demo-backend.js` and the `ui-core` helpers are written around the logbook's data and screens, and importing across folders would let a change to one app break the other. Pull the shared pieces into `/shared/` when the apps are combined. |
| Service worker | Its own `evals/sw.js` with its own cache name | A service worker's scope is its folder, so the two apps don't interfere. |
| Sign-in | Google, as in the logbook (placeholder) | Email-link sign-in for assessors without Google accounts works on the free Spark plan, but the free plan caps how many sign-in emails go out each day. Check the current limit under Authentication → Settings before relying on it. Email-link sign-in gives a verified email, which the rules require. |

## Data model

| Path | Fields | Who can do what |
|---|---|---|
| `pds/{email}` | `{ name }` | The PD can read their own entry. PDs and admins can list. Admins write. |
| `evaluations/{id}` | `{ id, rid, residentEmail, residentName?, assessorEmail, assessorName?, formId, formVersion?, epa?, date, source: 'evals', status, request?, assessment?, caseId?, createdAt, updatedAt, requestedAt?, submittedAt? }` | See the next table. |
| `evaluations/{id}/private/{doc}` | `{ comments, updatedAt }` | Comments from the assessor meant only for the PD. The assessor writes them while the evaluation is `requested`, and can read them back. PDs and admins read them. **Never the resident.** This is a placeholder until it's decided whether residents see free-text comments. |
| `evalForms/{formId}` | Form definition (placeholder) | Anyone signed in reads. Admins write. |

`status` moves `draft` → `requested` → `submitted`. A resident can also set `cancelled` before submission. `request` is the resident's part of the form (setting, case summary and so on). `assessment` is the assessor's part (ratings, entrustment level, feedback). Both are maps whose fields depend on the form.

Field limits: emails are lower case, at most 200 characters. The assessor can't be the resident. `request` has at most 40 keys and `assessment` at most 80. `date` is `YYYY-MM-DD` or null. Unknown top-level fields are rejected.

| Who | Can |
|---|---|
| Resident | Create evaluations for themselves only, as `draft` or `requested`, never with an assessment filled in. Read their own. Edit the request, form, date and assessor until it's submitted; the assessor can only change while no assessment has been started. Cancel. Delete their own drafts. |
| Assessor (signed in with `assessorEmail`) | Read the evaluations assigned to them. While an evaluation is `requested`, write `assessment`, `assessorName` and their private comments, saving as often as needed, then submit. After submission it's locked. |
| PD | Read every evaluation, including private comments, plus residents and summaries. No writes yet. |
| Admin | Everything above, plus any valid edit (for example reopening a submitted evaluation) and deleting. |
| Other residents and assessors | Nothing. Residents never see each other's evaluations, and an assessor never sees ones not assigned to them. |

Queries must match the rules: residents list with `where('residentEmail', '==', me)`, and assessors with `where('assessorEmail', '==', me)`.

## Open questions (placeholders until answered)

- Which forms come first: EPA entrustment, Mini-CEX, DOPS, CbD? The MedHub naming is "[EBD] EPA 1 (Level 3): …". `formId` and `evalForms/{formId}` are placeholders.
- Do assessors sign in with Google, or with an email link?
- Do residents see the assessor's free-text comments? Today, comments in `assessment` are visible to the resident, and `private/` comments are not.
- Has the PD signed off on the forms and the workflow?

## Tests

The rules tests run against the Firestore emulator, which needs Java, `firebase-tools`, `@firebase/rules-unit-testing` and `firebase`. Run them from the repo root:

```
npx firebase emulators:exec --only firestore --project demo-logbook \
  "cd logbook && node test/rules.emulator.mjs; cd .. && node evals/test/rules.emulator.mjs"
```

There are 61 evals checks covering the PD role, creation, reads and list queries, resident and assessor updates, locking after submission, private comments, deletion and forms. They run alongside the 85 logbook checks, which confirm the logbook's behaviour is unchanged.
