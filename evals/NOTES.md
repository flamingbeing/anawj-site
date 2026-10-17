# What we have learnt: MedHub, APMES evaluations and this project

This file collects what was learnt while building `/evals` (October 2026), so the next person or agent doesn't have to rediscover it. It sits alongside [`README.md`](README.md) (how to run the app and the data model), [`SPEC.md`](SPEC.md) (module contracts), [`PLAN.md`](PLAN.md) (the original UX plan) and [`/apmes/`](../apmes/) at the repo root (programme documents, transcribed, and the blank portfolio template). If this file disagrees with the code, the code wins; if it disagrees with the EPA Guidebook v8, the guidebook wins. Decisions, status, operations and open items are in the owner's private notes.

## 1. Conventions that matter in code

- **Source of truth:** the EPA Guidebook v8 (July 2024) overrides the AY2023 tracking template and the MedHub screenshots.
- **Sign-in:** Google only. The email-link and linked-emails code path is kept, switched off (`cloud.EMAIL_LINK = false`).
- **Data:** never delete resident data. Admins change status instead of deleting; a resident can delete only their own draft. Only listed, ACTIVE faculty can be assessors.
- **Theme:** light by default; More → Settings → Theme is Light / Dark / Auto, saved per device. The bottom nav stays visible above the phone keyboard.
- **Repo:** public. No names, patient data or real evaluation data. Programme originals stay with the programme.
- **Rules:** Firestore rules auto-deploy on merge to main, so never ask for rules to be pasted by hand.
- **Session status:** a session's "Now" lives in `evals/status/<session>.md`.

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
- **Where the guidebook and the template disagree:** central venous catheter insertion is a **DOPS under EPA 10** in the guidebook but a Mini-CEX in the template. Follow the guidebook. The other disagreements are in `apmes/data/apmes-epas.json` → `notes`.
- **Guidebook rules not yet enforced:**
  - fill within 24 h,
  - complete by the end of each rotation,
  - at most 2 EPA assessments on the same patient (the app warns using `caseKey`),
  - the three R1 airway DOPS within the first 2 months.

## 4. How the app is built

- **Stack:** vanilla ES modules, no build step, served at `apmes.anawj.com/evals/` by the `anawj-preview` Cloudflare Worker (`SUBDOMAINS.md`); `anawj.com/evals/` (GitHub Pages) forwards there from `index.html`, path, query and `#` kept. The PWA service worker is `evals/sw.js`; its `VERSION` is stamped at deploy (`tools/stamp-versions.mjs`), no hand bump. Each app deletes only its own cache prefix (`evals-*`, `logbook-*`), because the apps share one origin.
- **Firebase:**
  - Project `apmes-logbook`, **Blaze** (pay-as-you-go) plan, asia-southeast1. Usage is within the free quotas at this scale.
  - **Shared with the logbook.** Evals reuses the logbook's `residents` collection.
  - Google popup sign-in, with a redirect fallback.
  - Firestore with a persistent offline cache.
- **Rules:** one file, `logbook/firestore.rules`, for the whole project.
  - `.github/workflows/deploy-firestore-rules.yml` deploys it on merge to main, using the `FIREBASE_SERVICE_ACCOUNT` secret. The same workflow deploys `nuh-roster/firestore.rules` to project `nuh-roster`.
  - Logbook behaviour must not change when the evals rules are edited.
- **Collections:** `evaluations/{id}` (with `private/assessor`), `faculty/{email}`, `applications/{uid}`, `residents/{rid}`, `pds/{email}`, `admins/{email}`, `members/{email}`. The fields and transitions are in `SPEC.md`.
  - Rules let an assessor edit an assessment for **15 minutes after submitting**.
  - A resident can only set `seenAt` on a submitted evaluation.
- **Generated data:** `node evals/tools/build-data.mjs` writes `js/catalogue.js` and `js/forms.js` from `/apmes/` (repo root). **Change wording there, not in the generated files.** The build applies these overrides:
  - the short entrustment label (the official label is kept as `officialLabel`),
  - no comment minimum (`feedback: true`),
  - `ATTACHMENT_ENTRUST` for EPA 7a SR.
- **Form renderer** (`js/ui-form.js`):
  - `advance()` measures the tapped row at `pointerdown`.
  - After the re-render it scrolls by the difference, so the next answer row lands at the same screen position. The scroll is clamped so the heading stays below the app bar.
  - A settle correction runs after 450 ms.
  - Measuring at pointerdown, not at click, fixed a drift of about 21px per question.
  - `labelParts` folds long labels only for supervision questions; folding others split labels at "e.g.".
- **Saving answers** (`ui-form.js`, `cloud.js`):
  - Autosave uses `updateEvaluation(id, patch, { wait: false, onError })`: a rejection that arrives before the 3 s ack wait is reported (before, the form said "Saved").
  - `restoreLocal()` keeps the device copy when it only adds to the server's answers, not just when it is newer (a resident's nudge bumps `updatedAt`).
  - Unsent text is flushed on `visibilitychange`/`pagehide`. Sign-out removes `evals-draft-*`.
- **State changes** (`stampPatch` in `schema.js`, used by both backends): reopen, reassign and assessor change restart `requestedAt`; reopen clears `seenAt`; a new assessor drops the old `metrics` (rules let the resident remove `metrics`, never set it).
- **Navigation:**
  - The phone's Back closes open sheets and the full-screen QR (`popstate` listener in `ui-core.js`).
  - The request flow survives a reload (`sessionStorage` `evals-request-flow`, 2 h).
  - A resident opening their own `#e/` link is sent to `#r/`.
  - After a decline, `replaceState` to `#pending`.
  - First visit doesn't reload when the service worker takes control (`hadController` check, also in the logbook).
- **`needsAction`** lives in `ui-core.js`, so the Requests badge equals Home's "Needs action" count.
- **Search** (`build-data.mjs` template): drops a trailing plural "s" and understands `r1`…`r5`; synonyms include RSI, PCA, USG/ultrasound, TIVA, extubation.
- **Faculty paste** accepts email-client lists (`Name <email>; …`, `"Last, First" <email>`) and skips a header row.
- **Theme** (`style.css`):
  - Surfaces and text on filled accents are variables (`--e-surface`, `--e-on-accent`, `--e-hover`, `--e-track`, `--e-row-alt`, `--e-nav-bg`, `--e-due`), so dark mode is one block at the end of the file. Never hard-code `#fff`.
  - The inline script in `index.html` sets `data-theme` before the first paint; the QR code stays black on white.
- **Keyboard:** `--e-kb` (from `visualViewport`) lifts the nav on iOS; `keepFocusClear()` scrolls the focused box above it.
- **Demo:**
  - Modes: `?demo` (resident), `?demo=assessor`, `?demo=admin`, `?demo=reset`.
  - One shared localStorage store, `apmes-evals-demo-v1`.
  - The demo never loads Firebase.
  - `resetDemoData()` is exported from `app.js` for the banner button.

### Added in the 14 Oct improvement run (worth not regressing)

- **Unsent work:** `cloud.hasUnsentWrites()` / `whenSynced()` (Firestore `waitForPendingWrites`). `signOutSafely()` (ui-core) asks before
  signing out with unsent writes, because sign-out clears the offline cache and its write queue. The Sent screen says "Saved on this phone"
  until synced; so does the request share step. `pruneDrafts` keeps a draft newer than the server's `updatedAt` (edits in the 15-min window).
- **Errors:** `errText(err)` (ui-core) maps Firebase codes to plain words; never show raw `err.message`.
- **Assessor links:** `evalLink(id, email)` adds `?as=<assessor email>`; `linkAccount()` reads it; sign-in passes it as `login_hint`. An `#e/`
  link signed out shows the assessor landing; `inAppBrowser()` + `openInBrowserCard()` handle WhatsApp/Facebook/Instagram web views (Google
  blocks sign-in there). `wrongAccountCard()` / `switchAccount()` when the signed-in account has no role or isn't the `?as=` one.
- **Case link:** `?date=YYYY-MM-DD&initials=AB#new[/itemId]` prefills the case card (`caseFromLink`), then drops those two params only.
- **Requirements:** `progress(evals, rYear, today)` / `dueItems(…, today)`: with `today`, a "first N months of R1" group is overdue in R1 once
  N months from 1 July have passed (`monthsIntoYear`). Screens pass `todayISO()`; tests without a date keep the by-year rule.
- **Data rules:** field whitelists and `clean*()`/`stampPatch` live in `js/schema.js` (production code; demo-backend re-exports them).
- **Speed:** Firebase SDK `modulepreload` from an inline script in `index.html` (not in the demo; keep the version in step with `cloud.js`
  and `sw.js`); web font non-blocking; service worker registers on `load`; `qrSvg()` loads `vendor/qrcode.js` on first use.
- **App version line (More, bottom):** `versionLine()` and `getLatest()` in `ui-more.js` read the saved copy's name from `caches.keys()`
  (the one starting `evals-`); the button checks `sw.js` over the network first, asks if answers are unsent, then clears only evals' service
  worker and caches (never the logbook's on the same origin) and reloads. Saved data (Firestore offline store, drafts) is not touched.
- **Roles and rules:** `logbook/firestore.rules` also serves evals; roles can live in `access/{email}` and a PC counts as `isAdmin()`
  (`people/NOTES.md`, "Roles"). The evaluation rules sit near the 1000-expression limit per request: run `tools/test-rules.sh` after any
  change to them or to `isAdmin()`, `isPD()`, `isAppOwner()`, and merge main into a branch first.
- **Not changed on purpose:** form questions, their order, required answers and scales are the programme's (APMES guidebook). Ideas that
  would change them (pre-ticking, resident-filled context, moving the feedback box) are kept in the owner's private notes for the PD to decide.

### Tests (run all before merging)

```
node tools/check.mjs                                                          # cache prefixes, SHELL files, plain VERSION, generated files
for f in evals/test/*.test.mjs logbook/test/*.test.mjs; do node "$f"; done   # unit
npx http-server . -p 8110 -s -c-1 &                                           # static server
node evals/test/e2e.spec.mjs                                                  # 36 e2e checks
node evals/test/edge.e2e.mjs                                                  # 13 edge checks (forward, sign-out, dark, assessor landing)
node evals/test/a11y.mjs                                                      # axe WCAG 2.2 AA, 12 screens, light and dark
```

- **Rules:** `tools/test-rules.sh` (installs the emulator tools once into `~/.cache/anawj-rules`, about a minute). On 14 Oct: evals 201/201, logbook 227/227, prewarm 116/116.
- **Playwright** is installed globally. Use executable `/opt/pw-browsers/chromium` in the cloud container.
- **People reuses evals code** (`cloud.js`, `ui-core.js`, the People panes in `ui-admin.js`): after changing them, also
  run `node people/test/e2e.mjs`.
- **A red check on main isn't ours to merge past:** if the Checks run fails in another app's test and main is red too,
  comment once on the PR and wait (or the owner says "merge anyway"); rules PRs also need the owner's approval.
- **e2e failing with `ERR_CONNECTION_REFUSED`** means the static server isn't running on port 8110.

### Git workflow that works here

PRs are squash-merged, so the working branch falls behind main, and force-push is refused. So:

1. `git fetch origin main && git checkout -B <branch> origin/main`
2. Commit.
3. `git merge -s ours origin/<branch>` (keeps history linear enough to push without force).
4. Push, open the PR, then squash-merge it with the expected head SHA.

On `sw.js` VERSION conflicts, take the higher version and keep the prefix-only cache cleanup.

A quick contrast check for both themes is worth running after any colour change: set `localStorage['evals-theme']` to `dark`/`light` with Playwright `addInitScript`, walk the routes, and compare each visible text node's colour against its background (WCAG AA). The last run passed on 13 screens in both themes.

## 5. Changing the domain

Evals and the logbook are at `apmes.anawj.com` (`SUBDOMAINS.md` step 5); the roster is at `nuhroster.anawj.com`. What to change when a domain moves:

- `CNAME` and DNS.
- Add the new domain to **Firebase Auth → Authorised domains** in both projects (`apmes-logbook`, `nuh-roster`). Otherwise sign-in fails.
- Change `authDomain` in `logbook/js/firebase-config.js`, `evals/js/firebase-config.js` and `/__/firebase/init.json`, and add `https://<new domain>/__/auth/handler` to the OAuth Web client's redirect URIs (see logbook/README.md, sign-in).
- The roster keeps data in localStorage, which is per origin, so users must export it before the move and import it after.
- Old share links and QR codes in chats break unless the old domain redirects (evals: the forward at the top of `index.html`).
- The new host must serve `/__/` (sign-in helper) and `/apmes/` (the DOPS expectations in the sw SHELL), or sign-in or the service worker fails.
- What a browser keeps (theme, unsent local drafts) belongs to the old address and doesn't move; answers are already in the cloud.
- Installed PWAs need reinstalling from the new domain.
