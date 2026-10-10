# APMES Evaluations

Workplace-based assessments at `anawj.com/evals/`: the resident starts an evaluation and names an assessor. The assessor opens a link, signs in and fills it in. PDs and admins see every evaluation and which are complete. The app itself isn't built yet. This folder holds the agreed data model and the access rules, so the app can be built against them and later combined with the logbook and the roster.

## Decisions

| Decision | Choice | Notes |
|---|---|---|
| Firebase project | Same as the logbook (`apmes-logbook`) | Reuses `residents/{rid}`, `admins/{email}`, and lower-case email as identity. |
| Rules file | **One file for the project: `logbook/firestore.rules`** | Firestore allows one rules file per project. The evals rules are a block in that file. Publishing any other rules file would wipe out the logbook's rules. |
| PD role | `pds/{email}` `{ name }`, separate from `admins` | Today a PD can read residents, summaries and all evaluations, with no writes, so permissions can be tuned later without touching admins. Admins add PDs (or add them by hand in the console). |
| Shared keys | Every evaluation has `rid`, `date` (`YYYY-MM-DD`) and `source: 'evals'` | A future CCC dashboard can join evaluations to logbook summaries (`summaries/{rid}`). Logbook cases sit under `logbooks/{email}` without a rid, so joining evaluations to individual cases goes through `residents/{rid}.email`, or through `caseId` when an evaluation is linked to a case. |
| Code | Separate `/evals` folder, same style as the logbook | Vanilla ES modules, no build step, node tests in `test/*.test.mjs`. **Copy** rather than import from `logbook/js/`. `cloud.js`, `demo-backend.js` and the `ui-core` helpers are written around the logbook's data and screens, and importing across folders would let a change to one app break the other. Pull the shared pieces into `/shared/` when the apps are combined. |
| Service worker | Its own `evals/sw.js` with its own cache name | A service worker's scope is its folder, so the two apps don't interfere. |
| Sign-in | Google **or** an emailed sign-in link, for residents and assessors alike | The user decided this on 2026-10-10. Assessors can **link several emails into one account**, for example a hospital address and a Gmail, so evaluations sent to any of them reach the same person. The current rules match the assessor on the signed-in token's email only. Before building, extend them so any verified email linked to the account counts (for example through the token's linked identities, or a `emailLinks/{email}` → uid claim that can only be written while signed in as that email), and add rules tests for it. Email-link sign-in works on the free Spark plan, but the free plan caps how many sign-in emails go out each day; check the limit under Authentication → Settings. |
| Comments | Residents **see** the assessor's comments | Decided 2026-10-10. Feedback goes in `assessment`, which the resident reads. `private/` stays as an optional note for the PD only; drop it from the form if the programme doesn't want one. |
| Forms | DOPS, Mini-CEX and EBD, matching the MedHub `[DOPS]`, `[MiniCEX]`, `[EBD]` items | The requirement list per residency year is in [`reference/`](reference/README.md) (70 items, from the AY2023 tracking template). The PD has agreed (2026-10-10). |

## Data model

| Path | Fields | Who can do what |
|---|---|---|
| `pds/{email}` | `{ name }` | The PD can read their own entry. PDs and admins can list. Admins write. |
| `evaluations/{id}` | `{ id, rid, residentEmail, residentName?, assessorEmail, assessorName?, formId, formVersion?, epa?, date, source: 'evals', status, request?, assessment?, caseId?, createdAt, updatedAt, requestedAt?, submittedAt? }` | See the next table. |
| `evaluations/{id}/private/{doc}` | `{ comments, updatedAt }` | Comments from the assessor meant only for the PD. The assessor writes them while the evaluation is `requested`, and can read them back. PDs and admins read them. **Never the resident.** Optional: residents see the assessor's feedback in `assessment`, so use this only for a separate note to the PD. |
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

## Open questions

- The evaluator's forms are transcribed in [`reference/apmes-forms.json`](reference/apmes-forms.json). Still unconfirmed: the dropdown options (DOPS guidance), whether the DOPS form continues past question 19, and the EPA number for each requirement. See [`reference/`](reference/README.md#the-evaluators-forms).
- The resident's request mirrors the MedHub case log: date, location, evaluator, patient initials, gender, age, item, role (performed / assisted / observed), diagnosis, complications, notes to the evaluator. See [`reference/`](reference/README.md).

## Tests

The rules tests run against the Firestore emulator, which needs Java, `firebase-tools`, `@firebase/rules-unit-testing` and `firebase`. Run them from the repo root:

```
npx firebase emulators:exec --only firestore --project demo-logbook \
  "cd logbook && node test/rules.emulator.mjs; cd .. && node evals/test/rules.emulator.mjs"
```

There are 61 evals checks covering the PD role, creation, reads and list queries, resident and assessor updates, locking after submission, private comments, deletion and forms. They run alongside the 85 logbook checks, which confirm the logbook's behaviour is unchanged.
