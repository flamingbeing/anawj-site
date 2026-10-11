# What we have learnt: MedHub, APMES evaluations and this project

This file collects what was learnt while building `/evals` (October 2026), so the next person or agent doesn't have to rediscover it. It sits alongside [`README.md`](README.md) (how to run the app and the data model), [`SPEC.md`](SPEC.md) (module contracts), [`PLAN.md`](PLAN.md) (the original UX plan) and [`reference/`](reference/) (programme documents, transcribed). If this file disagrees with the code, the code wins; if it disagrees with the EPA Guidebook v8, the guidebook wins.

## 1. The owner's decisions (don't re-litigate)

| Topic | Decision |
|---|---|
| Source of truth | **EPA Guidebook v8 (July 2024)**. It overrides the AY2023 tracking template and the MedHub screenshots. |
| Scope | Evaluations first: request and complete **DOPS, Mini-CEX and EBD**. Other MedHub modules may come later and be harmonised. |
| Who | A **trial app for all residents and all postings**, not a pilot. |
| Sign-in | **Google only** on the free Spark plan. The email-link sign-in and linked-emails code path is kept, switched off (`cloud.EMAIL_LINK = false`), for when a paid plan allows hospital email. |
| Data | **Never delete resident data.** Admins change status instead of deleting. A resident can delete only their own draft. |
| People | Admins **or PDs** keep the faculty list and the resident list, or people apply for a role and appear in the admin panel for approval. Only **listed, ACTIVE faculty** can be assessors. |
| Feedback | Residents **see assessor comments** (the PD agreed). |
| Notification | **Share link or QR code** sent by the resident. No automatic emails (they would need Blaze). |
| Form wording | Entrustment question label shortened to "Please briefly describe what was discussed", followed by the entrustment questions as a **plain, non-clickable list**. The "(discuss at least 2)" hint stays; it comes from the guidebook and MedHub ("centered around at least 2 entrustment questions"). |
| Comments | **No 30-character minimum** (MedHub has one; we dropped it). |
| Scale | The 9-point scale and the milestone scale are both **one uniform 1–9 row** of equal cells. The interface is compact. |
| Flow | **Auto-scroll after every answer**, so the next question's answer row lands where the finger already is (tap, tap, tap). |
| Demo | A **Reset** button on the demo banner (also `?demo=reset`). |
| Home page | **No evals card** on the anawj.com home page. |
| Design | Same design language as `/logbook`: white header with the 5px four-colour band, light grey page, rounded white cards, navy accent. |
| Repo | Public. **No names, patient data or real evaluation data** in the repo. Programme originals stay with the programme. |
| Merging | "automerge": evals PRs are squash-merged once tests pass. **Firestore rules auto-deploy on merge to main**, so never ask the owner to paste rules. |
| Platform | Static web app (PWA) on GitHub Pages. Electron might come later; nothing in the app blocks that. |

## 2. MedHub, as it works today (from the official Android app 1.4.8 and the resident guide)

The MedHub admin team gave permission to use the APK as a reference. We describe it and re-create it; none of MedHub's code, icons or images are in this repo.

**Platform.** Native Kotlin, Material 2, Room cache. Forms are **server-driven**: question types SCALE, MATRIX, TEXT, COMMENTS, DATE, HEADER, PULL_DOWN_MENU, SHORT_TEXT and LONG_TEXT, with skip logic and options that can demand a comment. Login goes institution → SSO → two-factor.

**Navigation.**
- The bottom nav has Calendar, Work Hours (hidden for this institution), Evaluations (with a red count badge), Procedures and More. Each tab keeps its own back stack.
- The Evaluations tab has a navy band with a segmented **Pending | History** toggle. History holds Evaluation History, Competencies Summary, EPA/Elements Summary and a LeaderBoard (which ranks evaluators by count and speed).
- The app-bar menu offers "Initiate an Evaluation" and "Request an Evaluation".

**How residents trigger an assessment in APMES.** Through the **case log**, not the request menu:
1. Procedures → New Case Log.
2. Fill in date, location, supervisor, encounter initials, gender, age group and procedure. Procedures are named like `[DOPS] EPA 3 (Level 3): …`. Then set the role (Performed / Assisted / Observed).
3. Submit. A procedure marked `can_evaluate` sends the evaluation to the supervisor.

Pickers are full-screen **Recent | All | Write-In** lists, with recents remembered.

**Requesting from the Evaluations tab takes about 7 taps over 4 screens:** menu → Request → Program/Course → Form → Evaluator → Confirm. It has no message field, no case details, no list of your own outstanding requests, and no share link or QR code.

**The assessor's side.**
- **Pending row:** initials avatar, title, grey subtitle, date in #667787, chevron, and a blue "Partially Complete" dot. The data come from the server's `incomplete_evaluation` table, which has `late_date`, `can_remove` and `remove_req_comment`.
- **Complete Evaluation** is one long scroll.
  - At the top: a grey info block (Aleo slab-serif title, date, "Evaluation Subject" card, Program, Introduction).
  - Each question has a tiny red "REQUIRED" tab, 13sp question text and a white answer band.
  - The 9-point grid has numbers over 32dp radio cells (green ring #87B641).
  - Milestone and supervision scales are vertical radio lists.
  - Pull-downs open a full-screen list.
  - The submit button sits **at the end of the scroll, not sticky**, and has white-on-green at **2.39:1 contrast (fails AA)**.
  - Validation is a single alert: "At least one required question is incomplete", with "Jump to Question".
- **Decline** is the trash icon → "Remove Evaluation?" → a free-text reason (sometimes required) → "Delete Evaluation". There are no preset reasons.
- **Drafts** save to the server as PARTIAL.
- **Reminders** are server emails. Push uses FCM.

**Look.**
- Colours: dark blue #03568A (app bar and band), blue #007DBC (section bands, links), green #87B641 (submit, radios), dark green #58772A (selected tab), red #CA3A4C (badge, required, delete), grey background #EFEFF4, hairlines #D8D8D8, warm ink #433E36, purple empty-state banner #8A627F.
- Aleo Bold for headers; Font Awesome 5-style icons.
- Layout: 16dp gutters, 44dp rows, structure from hairlines rather than cards.

**Weaknesses we set out to beat, and what we did:**

| MedHub | Ours |
|---|---|
| 7 taps / 4 screens to request; no case context | One Request button, item search pre-filtered by year, case card, share link/QR; 6 taps from an item |
| No "my requests" status | Requests tab with a status trail (sent, seen, in progress, submitted, declined) |
| Submit at the bottom; one generic error | Sticky bar "n of N required", jumps to the next gap, auto-scroll after each answer |
| Tiny text and 32dp targets; submit fails contrast | 16px questions, equal 1–9 cells ≥38px wide, AA contrast throughout |
| Descriptors hidden | Chosen descriptor shown under the row; milestone descriptors in an info sheet |
| Decline needs free text | Preset reasons plus optional text; the resident can reassign |
| Radar charts and peer averages | Per-EPA progress against the guidebook requirements and deadlines |
| Drafts only on the server | Local autosave and the Firestore offline cache |

## 3. The forms and the guidebook (facts that matter in code)

- **Three forms:**
  - **EBD:** 12 questions. Assessed by faculty who co-managed the case.
  - **Mini-CEX:** 22 questions. Clinical setting chips (blue letter referral for pain, delivery suite, ICU, OT, pain clinic, preop clinic, recovery/PACU, ward).
  - **DOPS:** 19 questions. Guidance options: Observation, Active Help, Passive Help, Hands-off.
- **Answer options:**
  - Complexity: Low, Moderate, High.
  - "Receptive to feedback" and "reflective learning": Yes, No, Maybe.
- **9-point observation scale:**
  - Each point has a written descriptor (1 = cannot perform … 5 = indirect supervision for an uncomplicated case … 7 = independent with distant supervision … 9 = could instruct others).
  - N/A is shown as **"Not Observed"**.
  - Bands: Below (1–3), Meets (4–6), Exceeds (7–9).
- **Milestone scale** (EBD, Mini-CEX):
  - Stored as 0.5–5.0 and shown as 1–9 (1.0 = 1, 1.5 = 2 … 5.0 = 9).
  - 0.5 = "Not yet Level 1".
  - Medical knowledge and clinical reasoning can't be N/A; evidence-based medicine and healthcare system awareness can.
- **Supervision levels:** 1 Observe only, 2 Direct, 3 Indirect, 4 Distant, 5 Supervise.
- **Entrustment rule:** level 3 needs an overall score ≥5, and level 4 needs ≥7.
- **Catalogue:** 14 EPAs (1–12, 7a, 7b), 67 items (DOPS 17, Mini-CEX 12, EBD 38) and 46 counting groups. Every item has entrustment questions.
  - `EBD-7a-06` has only a vignette in the guidebook table, so its questions come from the embedded EBD_EPA7A_SR document.
- **Where the guidebook and the template disagree:** central venous catheter insertion is a **DOPS under EPA 10** in the guidebook but a Mini-CEX in the template. Follow the guidebook. The other disagreements are in `reference/apmes-epas.json` → `notes`.
- **Guidebook rules not yet enforced:**
  - fill within 24 h,
  - complete by the end of each rotation,
  - at most 2 EPA assessments on the same patient (the app warns using `caseKey`),
  - the three R1 airway DOPS within the first 2 months.

## 4. How the app is built

- **Stack:** vanilla ES modules, no build step, GitHub Pages (`CNAME` anawj.com). The PWA service worker is `evals/sw.js`; **bump `VERSION` on every shell change**. Each app deletes only its own cache prefix (`evals-*`, `logbook-*`), because the apps share one origin.
- **Firebase:**
  - Project `apmes-logbook`, Spark plan, asia-southeast1.
  - **Shared with the logbook.** Evals reuses the logbook's `residents` collection.
  - Google popup sign-in, with a redirect fallback.
  - Firestore with a persistent offline cache.
- **Rules:** one file, `logbook/firestore.rules`, for the whole project.
  - `.github/workflows/deploy-firestore-rules.yml` deploys it on merge to main, using the `FIREBASE_SERVICE_ACCOUNT` secret. The same workflow deploys `nuh-roster/firestore.rules` to project `nuh-roster`.
  - Logbook behaviour must not change when the evals rules are edited.
- **Collections:** `evaluations/{id}` (with `private/assessor`), `faculty/{email}`, `applications/{uid}`, `residents/{rid}`, `pds/{email}`, `admins/{email}`, `members/{email}`. The fields and transitions are in `SPEC.md`.
  - Rules let an assessor edit an assessment for **15 minutes after submitting**.
  - A resident can only set `seenAt` on a submitted evaluation.
- **Generated data:** `node evals/tools/build-data.mjs` writes `js/catalogue.js` and `js/forms.js` from `reference/`. **Change wording there, not in the generated files.** The build applies these overrides:
  - the short entrustment label (the official label is kept as `officialLabel`),
  - no comment minimum (`feedback: true`),
  - `ATTACHMENT_ENTRUST` for EPA 7a SR.
- **Form renderer** (`js/ui-form.js`):
  - `advance()` measures the tapped row at `pointerdown`.
  - After the re-render it scrolls by the difference, so the next answer row lands at the same screen position. The scroll is clamped so the heading stays below the app bar.
  - A settle correction runs after 450 ms.
  - Measuring at pointerdown, not at click, fixed a drift of about 21px per question.
  - `labelParts` folds long labels only for supervision questions; folding others split labels at "e.g.".
- **Demo:**
  - Modes: `?demo` (resident), `?demo=assessor`, `?demo=admin`, `?demo=reset`.
  - One shared localStorage store, `apmes-evals-demo-v1`.
  - The demo never loads Firebase.
  - `resetDemoData()` is exported from `app.js` for the banner button.

### Tests (run all before merging)

```
for f in evals/test/*.test.mjs logbook/test/*.test.mjs; do node "$f"; done   # unit
npx http-server . -p 8110 -s -c-1 &                                           # static server
node evals/test/e2e.spec.mjs                                                  # 36 e2e checks
```

- **Rules:** the emulator suites (`logbook/test/rules.emulator.mjs` and `evals/test/rules.emulator.mjs`) run under `firebase emulators:exec --only firestore --project demo-logbook`. At the last run, logbook passed 112/112 and evals 185/185.
- **Playwright** is installed globally. Use executable `/opt/pw-browsers/chromium` in the cloud container.
- **e2e failing with `ERR_CONNECTION_REFUSED`** means the static server isn't running on port 8110.

### Git workflow that works here

PRs are squash-merged, so the working branch falls behind main, and force-push is refused. So:

1. `git fetch origin main && git checkout -B <branch> origin/main`
2. Commit.
3. `git merge -s ours origin/<branch>` (keeps history linear enough to push without force).
4. Push, open the PR, then squash-merge it with the expected head SHA.

On `sw.js` VERSION conflicts, take the higher version and keep the prefix-only cache cleanup.

## 5. Operations

- **Adding people:**
  - Paste emails in **People → Faculty** or **People → Residents**, or approve applications there.
  - Agents in the cloud session cannot write to production Firestore. The owner, a PD or an admin has to do it in the app.
- **Backups:**
  - **There is no Firestore backup today.** The Spark plan has no managed backups or scheduled exports.
  - The proposed fix is a nightly GitHub Action that exports with the service account and stores an encrypted copy. Not built yet.
- **Paid plan (Blaze):** pay-as-you-go with the Spark free quota still included. At this app's scale Firestore cost is expected to be near zero. Blaze is what unlocks:
  - email-link sign-in at volume and hospital email,
  - Cloud Functions (automatic reminder emails),
  - scheduled backups.
  - Set a budget alert when upgrading.
- **Changing the domain** (logbook, roster and evals all live on anawj.com). What to change:
  - `CNAME` and DNS.
  - Add the new domain to **Firebase Auth → Authorised domains** in both projects (`apmes-logbook`, `nuh-roster`). Otherwise sign-in fails.
  - The roster keeps data in localStorage, which is per origin, so users must export it before the move and import it after.
  - Old share links and QR codes in chats break unless the old domain redirects.
  - Installed PWAs need reinstalling from the new domain.

## 6. Open items

- Linked emails / hospital-email sign-in (waits for Blaze; code path present, off).
- Nightly encrypted Firestore backup Action.
- Linking an evaluation to a logbook case (MedHub triggers evaluations from the case log; we request them directly).
- Auto-crediting mask holding and bag ventilation alongside the airway DOPS, if the PD wants it.
- Flagging requests abandoned for more than 3 days, and the 24-hour / end-of-rotation deadlines in the PD overview.
- Electron wrapper, if ever needed.
