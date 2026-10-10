# /evals v1 build spec (contract between modules)

Read with `evals/PLAN.md` (the why and the UX detail). This file fixes **names, files and interfaces** so modules built in parallel fit together. Where PLAN.md and this file differ, this file wins (it records the user's later decisions).

## User decisions that override PLAN.md
- **Google sign-in only** (free Spark plan). Keep the code path for email-link sign-in and linked emails out of v1 except a disabled stub (`cloud.EMAIL_LINK = false`). Assessor = the Google account whose email equals `assessorEmail`.
- **Everyone, all postings** (a trial app, not a pilot).
- **Never delete resident data.** No delete buttons for residents or evaluations in the UI except a resident deleting their own *draft*. Admins change status instead.
- **People lists:** admins **or PDs** maintain a **faculty list** and a **resident list**. Anyone signed in with neither role can **apply** to be faculty or resident; applications appear in the admin panel for an admin/PD to approve (creates the faculty/resident entry) or reject.
- **Only listed faculty can be assessors** (rules enforce: `faculty/{assessorEmail}` must exist with status ACTIVE when an evaluation is created or reassigned).
- Focus: request and complete **DOPS, Mini-CEX and EBD** evaluations. CSV export and the PD overview are nice-to-have after the core loop works.

## Files (all under evals/)
| File | Owner | Purpose |
|---|---|---|
| `index.html` | shell | Links `../design/tokens.css` then `style.css`; `<header class="e-appbar">`, `<main id="app">`, `<nav id="tabs" class="e-bottomnav">`, `<div id="toast">`, `<div id="banner">`. Viewport `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`. |
| `style.css` | shell | All app CSS, `e-` prefixed classes, NUHS `--n-*` variables + `--e-*` additions (PLAN §3, incl. contrast fixes). Light only. Mobile first (360px), max content width 720px, desktop OK. |
| `manifest.webmanifest`, `icons/` | shell | PWA (generate simple navy square icons with "E" via a script; no NUHS/MedHub artwork). |
| `sw.js` | shell | Copy of logbook/sw.js pattern, `VERSION = 'evals-v2'`, SHELL lists every evals file. |
| `js/app.js` | shell | Boot, auth state, role detection, tabs, hash routing, update banner, demo banner. |
| `js/ui-core.js` | shell | `S` state, `hooks`, `h`, `fill`, `add`, `toast`, `debounce`, `icon(name)`, `go(route)`, `fmtDate`, `initials(name)`, `statusChip(ev)`. Copy helpers from logbook/js/ui-core.js. |
| `tools/build-data.mjs` | data | Node script: reads `reference/apmes-epas.json` + `reference/apmes-forms.json` (+ `reference/guidebook/*.md` for entrustment questions if easy) and writes `js/catalogue.js` and `js/forms.js` (committed, generated header comment). |
| `js/catalogue.js` | data | Generated. Exports below. |
| `js/forms.js` | data | Generated. Exports below. |
| `js/engine.js` | data | Pure logic, no DOM. Exports below. |
| `js/cloud.js`, `js/demo-backend.js`, `js/firebase-config.js` | backend | Same API in both backends (below). firebase-config.js is a copy of logbook's. |
| `js/ui-form.js` | assessor | Renders a form spec into an interactive form (scales, chips, checks, text), drafts, validation bar, submit, decline. |
| `js/ui-pending.js` | assessor | "Evaluations" tab: segment Pending \| History, rows. |
| `js/ui-home.js`, `js/ui-request.js`, `js/ui-requests.js`, `js/ui-result.js`, `js/ui-progress.js` | resident | Home, new request (item picker → assessor → case card → send → share/QR), request list + status trail, result view, progress. |
| `js/vendor/qrcode.js` (+ LICENSE) | resident | Vendored qrcode-generator (MIT), pinned version, ES-module wrapper. |
| `js/ui-admin.js`, `js/ui-more.js` | admin | People (faculty list, resident list, applications), Overview (cohort grid, overdue, CSV); More (account, apply for a role, demo role switch, sign out, guide links). |
| `test/*.test.mjs` | each owner | Plain `node` tests (no deps). `test/rules.emulator.mjs` (exists) extended by backend owner. `test/e2e.spec.mjs` Playwright (integration). |
| `README.md` | integration | Update data model/how to run. |

`logbook/firestore.rules` (the ONE project rules file) is edited by the backend owner only; logbook behaviour must not change.

## Routes (location.hash)
`#home` (resident default) · `#new` (request flow; `#new/{itemId}` preselects item) · `#requests` · `#r/{id}` (result / request detail) · `#progress` · `#pending` (assessor default; `#pending/history`) · `#e/{id}` (complete evaluation) · `#overview` · `#people` · `#more`.
Tabs shown = union of roles, fixed order: Home, Requests, Progress (resident) · Evaluations (faculty) · Overview, People (pd/admin) · More (everyone). Bottom nav hidden on `#e/` and `#new` screens. Each `render*()` returns a DOM Node; app.js puts it in `#app`.

## State (ui-core.js `S`)
```js
S = { user: {email,name,uid}|null, roles: {admin:false, pd:false, resident:null /*residents doc*/, faculty:null /*faculty doc*/, application:null},
      mine: [] /* evaluations where residentEmail==me */, assigned: [] /* assessorEmail==me */, all: [] /* pd/admin */,
      faculty: [] /* faculty list, for picker */, route: 'home', demoRole: null }
hooks = { render(){} }  // app.js sets; screens call hooks.render() after state changes
```

## Data model (Firestore; demo backend mirrors it)
- `residents/{rid}` (exists): `{ rid, name, email, status: ACTIVE|ON LEAVE|GRADUATED|ATTRITED, intake, rYear }`. Now writable by admin **or PD**; delete admin-only (UI never deletes).
- `faculty/{email}` NEW: `{ email (lower), name, status: 'ACTIVE'|'INACTIVE', updatedAt }`. Read: any signed-in user who is admin/PD/resident/faculty. Write: admin or PD.
- `applications/{uid}` NEW: `{ uid, email, name, role: 'resident'|'faculty', note, status: 'pending'|'approved'|'rejected', createdAt, decidedAt?, decidedBy? }`. Create/update-own-while-pending: owner (email == token email, status 'pending'). Read: owner, admin, PD. Decide: admin/PD.
- `evaluations/{id}`: existing fields **plus** `itemId, itemText, tool ('DOPS'|'MiniCEX'|'EBD'), epa, level, caseKey, declineReason {code,text}, declinedAt, seenAt, chasedAt, metrics {openedAt, firstAnswerAt, submitAttempts}`. `formId` ∈ `dops|minicex|ebd`. `status` ∈ `draft|requested|submitted|declined|cancelled`. `request` map = case card `{ date, location, initials, ageBand, gender, coManaged (EBD) , notes? }`. `assessment` map = `{ q1: value, q2: ..., 'q2': [..] for checkboxes }` keyed `q{n}`; 9-point values 1..9 or 'NA'; milestone values 0.5..5.0 or 'NA'; supervision 1..5; selects store the option string; text stores string.
  - Transitions: resident create (`draft`|`requested`, assessor in faculty list, not self) · resident edit while draft/requested (assessor change only while no `assessment`) · resident cancel · resident after `declined`: reassign to new assessor → `requested` · resident after `submitted`: may set `seenAt` only · assessor while `requested`: write `assessment`, `metrics`, `assessorName`, then submit (`status:'submitted', submittedAt`) or decline (`status:'declined', declineReason, declinedAt`) · assessor may edit `assessment` for 15 min after `submittedAt` · admin: any valid change (reopen, reassign, cancel).
- `evaluations/{id}/private/assessor`: keep as is (optional PD-only note).

## catalogue.js exports
```js
export const CATALOGUE_VERSION = '2024-07-v8';
export const EPAS = [{ epa:'1', title, levels:[{level, by:'R1', scope}] }, ...];   // 14 incl 7a/7b
export const ITEMS = [{ id:'DOPS-2-01', tool:'DOPS'|'MiniCEX'|'EBD', formId:'dops'|'minicex'|'ebd', epa:'2', text, byYear:1..5|null, completeBy:'first 2 months of R1'|'end R1'.., level:3|4|null, group:'EPA2-DOPS-A', synonyms:[...], entrustQs:[...]? }];
export const GROUPS = [{ id:'EPA2-DOPS-A', epa:'2', tool:'DOPS', min:3, byYear:1, level:null, label:'Airway management skills', itemIds:[...] }];
export function itemById(id); export function searchItems(q, { rYear } = {}) // ranked, matches text, synonyms, EPA number, tool
```
## forms.js exports
```js
export const SCALES = {...};            // from apmes-forms.json scales
export const FORMS = { dops:{ id:'dops', tool:'DOPS', title, introduction:[..], decline, sections:[{ title|null, questions:[{ n, key:'q3', label, type:'select'|'checkboxes'|'text'|'ninePoint'|'milestone'|'supervision', required, na, options:[...]|scaleKey, minLength, descriptors }] }] }, minicex:{...}, ebd:{...} };
export const ENTRUSTMENT_TEXT_KEY = { dops:'q15', minicex:'q13', ebd:'q4' };
```
## engine.js exports
```js
validate(form, answers) -> { ok, required, answered, missing:[n], errors:[{ n, msg }] }   // required, NA only where na, minLength (optional+filled), exclusive "No obvious areas for improvement"
visibleQuestions(form, answers) -> [question]   // EBD q3 only if q2 has a non-exclusive tick
progress(evaluations, rYear) -> [{ group, done, min, state:'done'|'on-track'|'due-soon'|'overdue'|'later', items:[{item, done}] }]  // submitted only; repeats count toward group min
statusOf(ev, now) -> { key:'draft'|'sent'|'in-progress'|'submitted'|'declined'|'cancelled'|'overdue', label, ageHours }
caseKey(date, initials) ; sameCaseCount(evals, date, initials)
identifierWarning(text) -> string|null   // NRIC-like [STFGM]\d{7}[A-Z], 8+ digit runs
newId() ; todayISO(tz='Asia/Singapore') ; residentYear(residentDoc, today)
```
## cloud.js / demo-backend.js API (identical signatures; all async unless noted)
```js
export const demo, enabled, EMAIL_LINK=false
watchUser(cb) ; signIn() ; signOut()
getRoles(email) -> { admin, pd, resident, faculty, application }
listFaculty() ; saveFaculty(doc) ; listResidents() ; saveResident(doc)
applyForRole({ role, name, note }) ; listApplications() ; decideApplication(uid, { approve, rid?, rYear?, intake? })
newEvaluationId() (sync) ; createEvaluation(ev) ; updateEvaluation(id, patch) ; getEvaluation(id)
watchMine(email, cb) ; watchAssigned(email, cb) ; watchAll(cb)   // return unsubscribe
onSyncError(cb)
```
Demo: `?demo` = resident "Demo Resident" (resident@example.com), `?demo=assessor` = "Dr Demo Faculty" (faculty@example.com), `?demo=admin` = admin+PD (admin@example.com); one shared localStorage store `apmes-evals-demo-v1`, seeded with made-up residents/faculty/evaluations in several states; `?demo=reset` wipes. A "Switch demo role" control in More. Demo never imports Firebase.

## Visual rules (summary of PLAN §3, §6)
MedHub layout with NUHS tokens: navy app bar + `.n-stripe`; segment control; bottom nav with count badge (navy 3px top bar for selected, not cyan text); blue (`--n-blue`) section bands with white 600 text; numbered questions with a red "Required" tag that turns into a navy ✓; 9-point scale = one row of 9 cells (≥38px wide, 52px tall) with Below/Meets/Exceeds band labels over 1–3/4–6/7–9, separate "Not observed" where allowed, chosen descriptor shown under the row; milestone = vertical list with descriptors at 1/3/5/7/9 and half-step chips; supervision = vertical radios with descriptors; selects = inline chips (complexity, yes/no/maybe), radios (guidance), 2-col chip grid (clinical setting); sticky submit bar "n of N required" that jumps to the next gap; green submit `--e-go #58772a`; focus ring navy+cyan; 48px touch targets; WCAG AA contrast. No NUHS or MedHub logos/names in the UI.
