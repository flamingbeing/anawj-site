# APMES /evals v1 plan (FINAL)

This is the build plan for /evals. The scope, sign-in methods, share-link notification, NUHS design language and public-repo constraints were decided with the user (see `evals/README.md`) and are not reopened here. Form facts are taken from `evals/reference/apmes-forms.json`; item facts from `evals/reference/apmes-epas.json` (guidebook v8 wins); and the MedHub facts from a review of the official app (v1.4.8). No MedHub code, icons or images go into the repo.

**Form facts the build depends on.**
- **DOPS (19 questions).**
  - Q1–2 are selects.
  - Q3–14 are 9-point items. Q14 Overall has no N/A.
  - Q15 is the EbD text box. It is required and has **no minimum length**.
  - Q16 is supervision; Q18–19 are selects.
  - Q17 is optional, but needs at least 30 characters if filled.
- **Mini-CEX (22 questions).**
  - Q1 is the setting (8 options).
  - Q3–12 are 9-point items. Q7 is optional and Q12 has no N/A.
  - Q14–17 are milestones; **Q16–17 allow N/A**.
  - Q19 needs at least 30 characters.
- **EBD (12 questions).**
  - Q2 is a 10-option checklist that includes an exclusive "No obvious areas for improvement".
  - Q3 applies only if Q2 has a box ticked.
  - Q5–8 are milestones; **Q7–8 allow N/A**.
  - Q10 needs at least 30 characters.
- **Milestone values** are stored in the JSON as 0.5–5.0 in half steps.


**Platform.** A static web app (PWA) like `logbook/`: vanilla ES modules, no build step, served from GitHub Pages at anawj.com/evals/, installable to the home screen and to desktop (Chrome/Edge "Install app"). Nothing in it depends on being in a browser tab, and sign-in keeps the email-link path, so it can later be wrapped in Electron (desktop) or Capacitor (app stores) without a rewrite; in Electron, Google sign-in would go through the system browser.

---

## 1. What we learned from the MedHub app

**Screens and flows we copy, so they feel familiar**

| MedHub (source) | /evals equivalent |
|---|---|
| Dark-blue app bar with back arrow (#03568A), and a two-option switch on a dark strip (`two_button_toggle`) | `.e-appbar` in NUHS navy plus `.e-segment`. The segment labels are the same as MedHub's: **"Pending \| History"** |
| Bottom nav with a numeric badge on Evaluations (`badge.xml`) | `.e-bottomnav`, with the badge on the Evaluations tab |
| CompleteEvaluation: a header block, then the "Evaluation Subject" card with an initials avatar, then blue section bands, numbered questions with a Required tab, then a green submit button | Same order and section titles. The questions keep their official wording and numbering. |
| Horizontal 9-point scale (`evaluation_form_scale_horizontal`) with numbers above circles | A single row of 1–9 with band labels (§6) |
| Vertical radio lists for supervision and milestones | Vertical radios, with descriptors shown in full |
| Pending list with a late flag and a blue "partially complete" dot (`incomplete_evaluation.late_date`) | Same, plus "Resume at Q9" |
| Recent \| All \| Write-In picker for location and supervisor (`AllRecentWriteIn`) | The same three-way picker for location and assessor |
| Grey grouped background #EFEFF4 with white cells | `--e-bg-group` and `--e-cell` |

**What we deliberately do better**

| MedHub pain point (source) | /evals |
|---|---|
| Requesting takes about 7 taps over 4 screens (Evaluations → menu → Request → Program/Course → Form → Evaluator → Confirm). It has no context field, no list of sent requests, and no share option (`apk-flows.md` §"Findings" 1). | 1 Request button. The item decides which form is used. The case is filled in by the resident. The QR code and share sheet open automatically, and a status trail shows what happened next. |
| Assessors go through institution, single sign-on and 2FA, then the pending list (Login/SSO/TwoFactor fragments). | The link opens the form directly. The session persists. |
| Every pull-down opens a full-screen SelectionList. | Every select is answered with a single tap on an inline control. |
| The required-question check only runs as an alert after a failed submit. | A sticky "n of N required" bar that jumps to the next gap. Each Required tag turns into a ✓ once answered. |
| Removing an evaluation requires a typed reason (`RemoveEvaluation`). | Preset decline reasons. Text is required only for "Other". |
| Green #87B641 submit button at 2.39:1 contrast (`apk-visual.md`). | #58772a at 5.14:1 |
| Slab-serif bands that all look alike, and a LeaderBoard that rewards speed. | Open Sans, and two blue tones (navy app bar, `--n-blue` bands). There is no LeaderBoard; assessor turnaround is shown on the PD screen only. |
| Radar charts showing "Peer AVG / Your AVG" (EvaluationsSummary). | Progress per EPA, plus results that show comments first. |

---

## 2. Goals and success metrics

The timings come from server timestamps where we report them, plus a small client `metrics{}` map on each evaluation: `linkOpenedAt` (written when signed in), `submitAttempts` and `device`. Tap counts are checked only in Playwright. Client clocks are approximate.

| Metric | Target | How it is measured |
|---|---|---|
| Returning assessor: link → first question | ≤5 s, 0 taps after the link | Playwright, plus `metrics.linkOpenedAt` → `firstAnswerAt` |
| First-time assessor: link → first question | ≤45 s with Google; ≤90 s with an email link (Blaze plan only, see Q1) | Manual pilot timing |
| DOPS form taps (signed in) | **≤20 taps**: 18 minimum plus 2 entrustment chips, then the Q15 text | Playwright |
| Mini-CEX / EBD form taps | ≤22 plus 2 text boxes / ≤13 plus 2 text boxes | Playwright |
| Median time from first answer to Sent | DOPS ≤2:00 · Mini-CEX ≤3:00 · EBD ≤2:30 | `firstAnswerAt` → `submittedTs` |
| Repeat request by resident: open app → QR code | ≤6 taps, ≤30 s (≤10 taps the first time) | Playwright test (PR 5) |
| "What's outstanding?" | Answered on Home with 0 taps | Design review |
| Submitted within 24 h of the request | ≥70%; ≥80% submitted overall | `requestedTs` → `submittedTs` |
| Declined | ≤10%, each with a reason code | `declineReason.code` |
| Resident opens feedback within 7 days | ≥80%. External benchmark: about ⅓ of feedback was never opened in a student app (PMC5457783, `ux-research.md` §9). This is **not** a MedHub figure. | `seenAt` |
| Submits that needed more than one attempt | <10% | `metrics.submitAttempts > 1` |
| Lost forms / forms counted twice in MedHub | 0 / 0 | Pilot incident log; `mirroredToMedHub` |
| MedHub baseline | We time 3 faculty completing a DOPS in MedHub in week 1. No number is assumed in advance. | Manual |

---

## 3. Design language: MedHub layout, NUHS tokens

**Tokens**
- Copy `design/tokens.css` unchanged from `origin/claude/inspiring-dijkstra-pctmrf` into `evals/css/tokens.css`.
- App-specific tokens live in `evals/css/evals.css` with an `--e-` prefix:

| Token | Value / note |
|---|---|
| `--e-touch` | 48px |
| `--e-radio` | 28px |
| `--e-select`, `--e-go` | #58772a (5.14:1 on white, 4.88:1 on #f9f9f9) |
| `--e-cell` | #f9f9f9 |
| `--e-bg-group` | #efeff4 |
| `--e-muted-on-grey` | #5f656c (meta text on grey) |
| `--e-ok`, `--e-warn`, `--e-draft` | Status-chip colours |

- Nothing is added to `tokens.css`. `--e-touch` and `--e-ok` may be proposed upstream after the pilot.

**Contrast fixes, all required.** These pairs fail as they stand in the tokens; ratios computed by critic 2.

| Element | Fix | Reason |
|---|---|---|
| Unselected radio ring and input borders | `--n-muted` #6E747C (4.72:1) instead of #CED4DA | #CED4DA is 1.49:1 |
| Selected bottom-nav tab | 3px **navy** top bar, 600-weight label and a solid icon | Cyan is 2.71:1 |
| Focus ring | 2px navy inner ring plus 2px cyan outer ring. Cyan is used alone only on navy (4.78:1). | Cyan alone fails on light backgrounds |
| Meta text and links on #EFEFF4 | `--e-muted-on-grey`, or move them onto white rows. Links are never `--n-blue` on grey (3.98:1). | `--n-muted` on #EFEFF4 is 4.12:1 |
| Selected scale cell | Green ring plus a `--n-bg-blue` fill | Selection does not rely on colour alone |

**Fonts**
- Self-host Open Sans 300/400/600 woff2 (OFL licence file included) in `evals/fonts/`. The service worker caches them, `font-display: swap`, with a system-ui fallback.
- 300 is used only for page titles of 24px or more (the brief's "light large headings"). Form titles and section bands use 600.

**Components** (MedHub arrangement, NUHS values)

| Component | Spec |
|---|---|
| `.e-appbar` | Navy, 56px, with the 6px `.n-stripe`. Hides while scrolling down on form screens. |
| `.e-segment` | Switch on a navy band |
| `.e-bottomnav` | **Hidden on form screens**; padded for the phone's home bar |
| `.e-badge` | `--n-red` pill |
| `.e-section` | `--n-blue` #337AB7 band, Open Sans 600 18px white (4.56:1). This gives MedHub's two-tone look. |
| `.e-q`, `.e-required` | Required tag: white on `--n-red`, ≥11px, weight 600 (4.85:1). It becomes a navy ✓ once the question is answered. |
| `.e-scale9`, `.e-milestone`, `.e-radios`, `.e-chips`, `.e-checks` | Scales and choice controls (§6) |
| `.e-row` | List row: avatar, title, meta, status chip, chevron, blue dot for partly complete |
| `.e-chip` | Statuses: sent, opened, in progress, submitted, declined, overdue, cancelled |
| `.e-submitbar` | Sticky. Hidden while the keyboard is open (detected with a `visualViewport` resize). |
| `.e-sheet`, `.e-dialog`, `.e-qr`, `.e-empty`, `.e-progress`, `.e-subject` | Other components; the initials avatar on the subject card is the only rounded shape |

**Viewport and focus**
- Viewport meta: `interactive-widget=resizes-content`.
- `scroll-padding-top` and `scroll-padding-bottom` match the bar heights (WCAG 2.4.11).
- **Icons:** Font Awesome 5 Free solid. No NUHS logo or name.

---

## 4. Roles and information architecture

**How roles are detected** (rules plus client, checked on sign-in):

| Role | Detected by |
|---|---|
| Resident | `residents` row where `email == me()` and `status == 'ACTIVE'` |
| PD | `pds/{email}` |
| Admin | `admins/{email}` |
| Assessor | Anyone with items in Pending (no faculty registry in v1) |

**Tabs** are the union of the person's roles, in a fixed order. There is no role switch.

| Role | Tabs |
|---|---|
| Resident | **Home** · Requests (badge = needs action) · Progress · More |
| Assessor (anyone with Pending items) | **Evaluations** (segment Pending \| History; badge = pending count, oldest first) · More |
| PD / admin | Adds **Overview** (Cohort, Overdue, Declined, Resident page) |

- An admin who is also a resident **never sees their own requests in Pending**. The rules already block self-assessment, and the client filters them out too.
- A signed-in stranger with no items sees: "No evaluations for this account. Linked emails: … · Link another email".
- **Home** has:
  - a large Request button;
  - a "Due for you" card (the next 3 items for the resident's posting and year);
  - a "Needs action" strip: declined requests, requests 20 h or older, unseen feedback, and requests that were opened but abandoned for more than 3 days.
- **More** has: linked emails, posting (year comes from `residents.rYear`), auto-scroll on/off, the guide, and sign out.
- **Deep links:** `#e/{id}` opens the form; `#r/{id}` opens the result.
  - If someone without access opens either link, they see "Not available yet, or sent to a different address". No data is shown, and the same message covers a request that has not synced yet (critic 3, item 7).
- **Linked emails for residents:** none in v1. Residents sign in with their roster email; the admin edits the roster if it changes.

---

## 5. Key flows and tap counts

**A. Resident request (≤6 taps when repeating)**
1. Tap **Request**.
2. Pick the **item**.
   - First use: one row of posting chips ("Which posting?"), 1 tap, saved to `users/{uid}.posting`.
   - Then: Due for you · Recents and "Repeat last" · search. Each result shows the tool chip, EPA, level and **done n/min**.
   - The tool (DOPS, Mini-CEX or EBD) follows from the item.
3. Choose the **assessor**: Recent \| All \| Write-in.
   - Typed addresses are trimmed and lowercased, and a domain chip appears after "@" (taken from recents).
   - The full address is repeated on the Send button: "Send to dr.x@hospital.sg".
4. Fill the **case card**:
   - date (default today, Asia/Singapore);
   - location (defaults to the last one used);
   - initials (`autocapitalize=characters`, `maxlength=3`);
   - age band and gender as one-row chips.
   - EBD only: a co-management confirmation.
   - **No case title, role, diagnosis or complications** (see §8 Privacy). PR 1 updates the open questions in `evals/README.md` to match.
   - Soft warning when the same initials and date already appear on 2 of this resident's requests.
5. Tap **Send**.
   - The document ID is generated on the client before the write, so a double tap or an offline retry is idempotent.
   - Warning shown for the same item, assessor and date as an existing request.
   - Drafts are kept locally and saved as `status:'draft'`.

**B. Share (1–2 taps).** The share screen opens automatically after Send.
- A full-screen QR code, generated on the phone so it works offline. The library is vendored as a pinned `qrcode-generator` (MIT, licence file committed).
- `navigator.share`. The message contains **only** the form type, item and link; no patient details.
- Copy link.
- "Also assess this case for another EPA" creates a linked request with the same `caseKey`. A third request on the same case gets a **warning**: this is client-only and cannot be enforced in the rules.

**C. Status and chasing**
- Each request moves through: Sent → Opened → In progress n/M → Submitted / Declined / Cancelled. The age is shown, and turns red after 24 h.
- **Nudge** appears from 20 h: it reopens the share message (2 taps) and writes `chasedAt`.
- **Change assessor** is available while `assessment` is empty (this is already allowed by the rules), so no decline is needed first.
- Requests that sit untouched for more than 3 days appear in the PD's Overdue list. No emails are sent in v1.

**D. Assessor completes the form**
1. **Tap the link.** A preview paints first, showing only the form type and the masked address from the fragment ("DOPS for d…@n….sg"). Firebase loads after that.
   - If the link opened inside an app's own built-in browser (Teams, Outlook or Gmail; detected from the user agent), the page shows **"Open in Chrome"** (an `intent://` link on Android) or **"Open in Safari"** plus Copy on iOS, before any sign-in button.
   - **First live open only:** one skippable screen, "How this form works": the 9-point bands, the Required tag, autosave, and "I can't assess this". It is stored per uid.
2. **Sign in.**
   - If the address in the fragment is not gmail.com, "Email me a sign-in link" is shown first; otherwise "Continue with Google" is.
   - Sessions use `browserLocalPersistence`.
   - The "Paste sign-in link" box:
     - unwraps Outlook Safe Links and similar rewritten links (`url=` parameter);
     - never completes the sign-in without the stored or re-typed email address.
3. **Linked email (non-blocking).**
   - If the request went to an address the account has not claimed, the form **opens anyway into a local-only draft**. The prompt says: "Confirm d…@n….sg when convenient, your answers are kept."
   - **Submit unlocks once the claim exists.** The claim is proved by email link on a second app instance, `'proof'`, and its `isNewUser` decides whether to delete it (see §8, Rules).
   - Budget about 60 s on iOS. Linking is never done with `linkWithCredential`.
4. **Fill the form** (§6). There is **no gate question**. "I can't assess this" sits at the top, and the attestation line sits above Submit: "By submitting you confirm you directly observed (EBD: co-managed) this case". This meets the observation rule in `apmes-forms.json`, adds no field and saves a tap.
5. **Submit: 1 tap, no dialog.**
   - The write sets `status:'submitted'` and `submittedTs: serverTimestamp()`.
   - "Sent ✓" is announced through aria-live. The screen offers **"Tell resident"** (a share message with the `#r/{id}` link) and "Next in Pending (2)".
   - "Edit answers" stays available for 15 min after `submittedTs`.
   - Offline, the screen says "Sending when online: keep this page open until ✓". On the next open of any page, an unsent form shows a "1 not sent yet" banner. If the server refuses the write: "Copy my answers".
6. **DOPS tap count:** Q1–2 (2) + Q3–14 (12) + Q16 (1) + Q18–19 (2) + submit (1) = **18**, plus up to 2 entrustment chips and the Q15 text.

**E. Decline (3 taps)**
- Tap "I can't assess this", pick a reason, then Confirm.
- Reasons: did not observe / did not co-manage / conflict of interest / wrong item / other. **Only "other" needs text.**
- A conflict of interest appears as a flag in Overview; nothing is sent by email. The resident sees "Assessor couldn't assess this case" without the conflict-of-interest detail, and gets **"Send to another assessor"** in 1 tap with nothing retyped.
- If the resident cancels a request the assessor has started, Pending shows "Cancelled by resident" and the local draft is kept for 7 days.

**F. Resident sees the result (1 tap)**
- Order: comments first, then supervision, overall, then the read-only grid. Tapping an answer shows its descriptor.
- **"Got it"** sets `seenAt`. An optional `reflection` can be added; the identifier check in §8 applies to it.
- A print stylesheet gives the resident their own printable record.

**G. Progress (0–1 tap)**
- Each row reads, for example, "EPA 2 · DOPS 2/4 · due R1 · L3", coloured done / on track / due within 60 days / overdue.
- **Counting:** completed evaluations on any item in the item's `group` count towards `min`, and repeats count. This matches EPA 2's "minimum 4 of specified DOPS" with 3 listed items.
- **Expiry:** if an EPA's last submitted evaluation is more than one year old, a "Not assessed >1 year" tag appears (`apmes-epas.json` `expiry`; guidebook intro).
- Tapping an item shows **"Request this"**, which opens flow A at step 3.

**H. PD / admin (desktop first)**
- **PD is read-only in v1**, as in the current rules and README.
- Views:
  - a cohort grid (residents × EPA: done vs required by now, latest supervision level);
  - **Flags**: overall <5 on an L3 item; receptive or reflective "No"; declined; conflict of interest; more than 24 h; abandoned more than 3 days; due and still at 0; 3 or more on one `caseKey`; assessor email matches an active resident (the admin's client can read `residents`, so this is checked there);
  - "Overdue by assessor" with **Copy reminder** (clipboard only);
  - an "End of rotation" list.
- **Admin-only writes:** reassign, change the item while the assessment is empty, cancel, reopen, set `mirroredToMedHub`.
- **CSV columns:** rid, itemId, itemText, tool, epa, level, date, assessorEmail, q1…qN (stored values), supervision, comments, status, requestedTs, submittedTs, mirroredToMedHub. `private/` notes are **not exported**. **MedHub rows are not imported in v1.**

**I. Demo**
- `?demo`, `?demo=assessor` and `?demo=pd` all use one localStorage store; `?demo=reset` clears it.
- **Demo never imports or initialises Firebase.** A signed-in live user who opens `?demo` sees the demo only; the live session is not touched.
- Made-up names and `example.com` addresses only. A test checks the demo data for this.
- A 3-screen tour.

---

## 6. Form rendering

- **One renderer** driven by `forms.js`, which is compiled from the JSON.
- Official wording and numbering are kept. No fields are added. Answers are stored under `assessment.qN`.

**9-point scale (`.e-scale9`)**
- **One full-width row** of cells, each at least 38px wide (344/9 with 8px gutters at 360px) and **52px tall**. Band labels Below / Meets / Exceeds each span 3 cells. AA 2.5.8 needs only 24px.
- A **container query** switches to a 3×3 grid only when a cell would be under 36px (for example at 200% text size).
- "Not observed" is part of the **same radio group** (`value:'NA'`) and appears only where `na:true`.
- The chosen value's descriptor is shown in up to 2 lines. ⓘ opens all 9 descriptors plus the checklist from `guidebook/dops-expectations.md`.

**Milestone (`.e-milestone`)**
- A "Not yet Level 1" chip, then 5 anchor rows (1/3/5/7/9) with the competency-specific descriptors, and half-step chips (2/4/6/8) between them. A "Not observed" chip is added where `na:true` (Mini-CEX Q16–17, EBD Q7–8): 11 targets.
- Descriptors are shown **in full until the question is answered**, then fold to the chosen value and its descriptor.
- The **JSON `value` (0.5–5.0) is stored verbatim**, so the CSV and flags use the official numbers.

**Supervision.** Vertical radios with the full descriptors. The 326-character question text shows its first sentence, with "Note for supervisor…" folded behind "more". The wording is unchanged.

**Selects.** Every select takes 1 tap.

| Select | Control |
|---|---|
| complexity, receptive, reflective | Inline chips |
| guidance | Vertical radios |
| clinicalSetting | 2-column chip grid |

**Checkboxes.** EBD Q2's "No obvious areas for improvement" clears and disables the other 9 options. Q3 appears only when another box is ticked.

**Text boxes**
- They grow with the text and use `autocapitalize=sentences` and `enterkeyhint=done`. A one-time hint says "Tap the mic to dictate".
- Entrustment chips (from `epa-01-06.md`) insert starter text into DOPS Q15, Mini-CEX Q13 and EBD Q4, with a soft reminder that at least 2 are expected. EPA 7–12 show "questions pending".
- Starter chips for Q17/Q19/Q10: "Do more of… because…" and "To reach the next level…".
- **Inserted starter text does not count** toward the 30-character minimum. The counter ("18/30") is shown only where `minLength` exists. DOPS Q15 has no minimum, and Q17's minimum applies only once it has text.

**Auto-advance.** Auto-advance only scrolls the page; focus never moves. A Playwright test asserts `document.activeElement` is unchanged after the scroll. The scroll is instant under reduced motion, is skipped when an answer is being revised, and can be switched off in More.

**Validation (`engine.js`, no DOM)**
- Checks: required answers, N/A only where allowed, `minLength`, and the exclusive checkbox.
- The ≥2 entrustment questions check is a soft reminder. The overall-vs-supervision hint is **removed** because it has no source.
- The sticky bar shows "n of N required"; tapping it jumps to the next gap.
- A failed submit focuses the first gap and lists the rest.

**Screen readers**
- Each radio's name reads like "5, Meets expectations"; `aria-describedby` points to its descriptor.
- The DOM order is 1→9 then N/A, so arrow keys follow the scale.
- Half-steps are in the same group ("4, between level 2 and 3").
- "required" goes in the `<legend>` text.
- "n of N" is announced only after a submit attempt.

**Drafts**
- The localStorage buffer is written on every change.
- Server writes go through `queued()`:
  - choice answers are saved straight away;
  - **text is debounced to 3 s of idle, or on blur**.
- A DOPS costs about 25 writes.
- On resume, **the server version wins field by field**. If the local copy differs, the prompt "Your local copy differs: keep server / use mine" appears.
- Pending shows the blue dot and "Resume at Q9". Signing out wipes the buffer and the cache.

**Offline.** The service worker caches the shell, forms, catalogue and fonts. Pending items come from the `onSnapshot` cache. A link opened for the first time offline shows "Opens when you have signal" with Retry.

---

## 7. Item catalogue and picker

- `tools/build-catalogue.mjs` reads `apmes-epas.json` and writes `js/catalogue.js` (committed).
  - 67 items: DOPS 17, Mini-CEX 12, EBD 38.
  - Fixed IDs of the form `{tool}-{epa}-{nn}`. Retired items get `retired:true` and are never deleted.
- **Fields:** `{id, tool, formId, epa, text, group, completeBy, byYear, level, min, synonyms[], expectationsRef, entrustQs[]}`.
- **Exceptions to encode:**
  - mask+LMA and mask+ETT are each one DOPS;
  - CVC is under EPA 10;
  - EPA 7 is split into 7a and 7b;
  - at most 1 paediatric EBD for EPA 8;
  - EPA 4 needs three blades.
- **Picker order:**
  1. Due for you
  2. Recents
  3. Search over text, abbreviations and synonyms ("art line", "TAP", "vascath", "awake FOI")
  4. Browse by EPA
  5. Filter chips
- The posting map is a **draft for PD confirmation** (Q2), not a fact: PEC→1, ICU→6, Obs→7a/7b, ENT→4, Paeds→9, Cardiac→10, Pain→11/12, NORA→8, Trauma→5, OT core→2/3.
- Results show the full item text, not MedHub's "[DOPS] EPA 3 (Level 3): …" string.

---

## 8. Data model, rules and privacy

**`evaluations/{id}` new fields**

| Group | Fields |
|---|---|
| Item | `itemId`, `itemText`, `tool`, `level`, `catalogueVersion`, `caseKey` |
| Timing | `requestedTs`, `submittedTs` (server Timestamps, `== request.time` on the write that sets them); client numbers `openedAt`, `firstAnswerAt`, `seenAt`; `metrics{linkOpenedAt, submitAttempts, device}` |
| Feedback | `reflection` |
| Decline | `declineReason{code,text}`, `declinedTs` |
| Chasing and source | `chasedAt`, `source:'evals'`, `mirroredToMedHub` |

- `formId` becomes `dops` / `minicex` / `ebd`. Rules don't restrict it; only the `'mini-cex'` tests at `evals/test/rules.emulator.mjs` L32 and L107–109 change.
- **Statuses:** `declined` and `cancelled` are added.

**Other collections**
- `users/{uid}{pendingEmail, posting}`.
- `emailClaims/{email}{uid}`:
  - create: `email_verified == true && token.email == email`;
  - get: the owner;
  - **list: `resource.data.uid == request.auth.uid`**, so the client can build its `in` list and More can show linked emails;
  - delete: the owner (unlink). Evaluations still in progress for an unlinked address go back to "unclaimed".
- Claim conflicts (an address already claimed by another uid) are released by an admin only.
- All emails, claim IDs and `in` lists are lowercased.

**Rule branches (each with `affectedKeys().hasOnly([...])` and tests)**

| Who | When | May write |
|---|---|---|
| Resident | `draft` / `requested` | Existing fields plus `chasedAt`; assessor change while `assessment` is absent |
| Resident | `declined` | Reassign to `requested` with a new assessor, or `cancelled` |
| Resident | `submitted` | `seenAt`, `reflection` only |
| Assessor (`myEmail(assessorEmail)`) | `requested` | `assessment`, `openedAt`, `firstAnswerAt`, `metrics`, `assessorName`, `updatedAt`; the submit transition with `submittedTs == request.time`; the decline transition with `declineReason`, `declinedTs == request.time` |
| Assessor | `submitted` and `request.time < submittedTs + duration.value(15,'m')` | `assessment`, `updatedAt` |
| Admin | any | Reassign, item change while `assessment` is absent, cancel, reopen, `mirroredToMedHub` |

**Rule helpers and limits**
- `myEmail(e) = signedIn() && (e == me() || (exists(claim(e)) && get(claim(e)).data.uid == request.auth.uid))`. `signedIn()` keeps the `email_verified` check.
- Create: `!myEmail(assessorEmail)`. Assessor update: `!myEmail(residentEmail)`.
- Worst-case `get`/`exists` calls per request are 4 for create and update, and 7 for `private/`. Each has a test, and no `isAdmin`/`isPD` checks are added ahead of these in the same branch.
- **Existing tests that assume "submitted is locked" are rewritten on purpose.** About 60 new checks, including mixed-case aliases, alias attacks, a forged `submittedTs`, the window expiring, and `isNewUser` proof deletion. A test fails if the code contains `linkWith`.
- `validEval.hasOnly` and the `status` list are extended.
- **Proof flow:** `currentUser.delete()` runs only if `getAdditionalUserInfo(cred).isNewUser`; otherwise it just signs out of `'proof'`. The guide warns that an email-link sign-in signs that address out on other devices.
- **Composite indexes** need creating:
  - `assessorEmail in` + `orderBy(requestedTs)`;
  - `rid ==` + `orderBy(requestedTs)`;
  - `updatedAt >` + `orderBy(updatedAt)`.
  
  PR 2 documents the console steps, because the repo has no `firestore.indexes.json`.
- **Production check before the pilot:** a one-off run of the `in` + `get()` list rule against the real project. So far it has only been proven in the emulator (`codebase-fit.md`).
- **Leavers:** when a resident's `status` is no longer ACTIVE, an admin bulk-cancels their open requests after a CSV export. Retention follows Q2.

**Privacy**
- Patient details are limited to initials, age band and gender.
- A client-side check warns on NRIC-like patterns (`[STFGM]\d{7}[A-Z]`) and 8-digit numbers in every free-text box, including `reflection`.
- The URL fragment holds only the form type and the masked address. Emails never appear in the path or query string, and the link grants nothing by itself.
- The repo holds only made-up data. `.gitignore` adds `test-results/` and `playwright-report/`, and only `?demo` screenshots are committed.

**Costs.** About 3k writes a day at 60 residents × 2 evaluations, against Spark's 20k. A PD on a shared PC re-reads everything after each sign-out (about 4k reads), so roughly 12 sessions a day reach the 50k-read limit. This is noted in the PD guide.

---

## 9. Accessibility and performance

**Accessibility**
- WCAG 2.2 AA.
- Targets: rows 48px; scale cells 38×52px or larger.
- Every scale is a `<fieldset>`/`<legend>` group of radios that works with arrow keys.
- Focus is never hidden behind the bars (2.4.11).
- No timed UI. aria-live only for save and send status.
- The contrast fixes in §3.
- Axe runs through a vendored `axe.min.js` (MPL-2.0, pinned) in Playwright; 0 serious issues allowed.

**Performance**
- First screen ≤90 KB gzipped JS+CSS, not counting Firebase, which loads after the preview.
- Preview within 1.5 s on slow 4G.
- A scale tap responds in under 50 ms; a warm open takes ≤300 ms.
- Only the 3 self-hosted font weights.

---

## 10. Build sequence (small PRs, both suites green: evals 61+, logbook 85)

**Test tooling.** There is no `package.json`. Tests use the global Playwright install (1.56.1, Chromium only), plus vendored axe and QR files in `evals/test/vendor/` and `evals/js/vendor/`.

| PR | Contents | Acceptance |
|---|---|---|
| **1** | Catalogue, forms and engine; README open-questions update | `catalogue.test`: 67 items, IDs match the fixture. `forms.test`: 19/22/12 questions; N/A flags including milestone N/A (Mini-CEX Q16–17, EBD Q7–8); DOPS Q14/Mini-CEX Q12 have no N/A; DOPS Q17 and Mini-CEX Q7 are optional; DOPS Q15 has no `minLength`; EBD Q2 exclusive option. `engine.test`: validation, every status transition, edit window, n/M, group counting, expiry, `caseKey` warning, starter text excluded from the minimum. |
| **2** | Rules, claims and indexes (merged but **not pasted into the console until PR 10**) | All branches in §8 have tests (about 60 new). Forged `submittedTs` is rejected; an offline-queued submit succeeds; logbook 85 still pass; index steps documented. |
| **3** | Shell: tokens, `evals.css`, fonts, nav, service worker, demo backend, `.gitignore` | `sw.test` (every file cached, fonts included). Demo makes no Firebase import. Screenshots at 360/390/428px reviewed. Axe passes. Contrast pairs from §3 asserted. |
| **4a** | Form renderer and validation (demo) | At 360px: a single-row 9-point scale with cells ≥38px; 3×3 only at 200% text. Milestone N/A works. DOPS ≤20 taps. Focus is unchanged after auto-scroll. A blocked submit focuses the gap. The bottom nav is hidden, the submit bar hides with the keyboard. |
| **4b** | Drafts, resume, offline, conflict prompt | A reload resumes. `setOffline` still fills the form and queues it. The "1 not sent yet" banner appears. Server-wins merge prompt. Text writes are debounced (≤1 write per 3 s per field). |
| **4c** | Decline and the "Tell resident" sheet | Decline in 3 taps; text required only for "Other". |
| **5** | Resident request, share/QR and Home | A repeat request takes ≤6 taps. The QR code works offline. Duplicate Send is idempotent. Third-`caseKey` warning. Share text has no patient fields. Identifier warning fires on "S1234567A". |
| **6** | Requests trail, Change assessor, result view, Progress, print | Full 3-persona demo loop. `seenAt` is set. "Request this" starts at the assessor step. EPA 2 counts to 4. |
| **7** | PD/admin Overview, flags, CSV | Grid, all flags, Copy reminder, CSV columns as in §5H. PD has no write controls. |
| **8** | Separate cross-app PR: `.nojekyll`, self-hosted `/__/auth`, `authDomain: anawj.com` | Manual step: `https://anawj.com/__/auth/handler` added to the OAuth client, and `/__/firebase/init.json` served. **Logbook sign-in regression** passes on iOS and Android. |
| **9** | Live auth: Google, email link, paste box with Safe Links unwrapping, in-app browser escape, non-blocking claim, first-open explainer | **Gate: Q1 must be answered first.** Unit test for a rewritten Safe Links URL. Manual pass on an iPhone home-screen install, inside the Teams in-app browser, and on hospital Wi-Fi with a hospital address. |
| **10** | Rules go live, production `in`-query check, indexes created, pilot pack (performance check, one-page faculty guide, metrics export, PD briefing) | Console rules match the repo. Real-project smoke test. Guide states that proving a linked email takes about 60 s. |

---

## 11. Blocking questions (max 5)

1. **Firebase plan.** Spark allows only 5 sign-in-link emails a day for the whole project (https://firebase.google.com/docs/auth/limits). Hospital addresses need email links, both to sign in and to prove a linked address. May we move to **Blaze with a budget alert before PR 9**? If not, Google becomes the only practical sign-in, and assessors must be addressed by their Google account.
2. **Pilot scope.**
   - Which cohort and postings take part?
   - Does the PD agree that pilot EPAs are requested **only** in /evals, with the admin mirroring them into MedHub?
   - Does the PD confirm the posting → EPA map in §7?
   - How long is data kept for leavers?
3. **Faculty check.** Is a PD flag (and no client block) enough for "only physician faculty assess" in v1, or will the PD supply a faculty email list? If a list is supplied, it is kept in Firestore for the type-ahead, never in the repo.
4. **Hospital email test.** Can one consenting faculty member's hospital address be tested in week 1, to check mail scanners, Safe Links and the in-app browser against our sign-in links?
5. **EPA 7–12.** May these go live with their entrustment chips marked "pending" until the transcription is finished?

---

## Appendix: critique points not adopted

- **`allow get` on a missing document** (critic 3, item 7, option A): it leaks which IDs exist. We use one combined message instead.
- **Hashed `residentEmails` collection** (critic 3, item 3): SHA-256 of an email is easy to reverse with a dictionary in a public project. The resident-email check moves to the admin's Overview.
- **PD write rules** (critic 1, A2): PD stays read-only as documented. The writes go to the admin, which avoids new rule surface.
- **`medhubImports/` collection** (critic 3, item 8): new scope. We dropped the claim that MedHub rows appear in the export instead.
- **Linked emails for residents** (critic 1, B): the roster already holds one email per resident, and admin edits cover changes. This can be revisited after the pilot.
- **Automatic escalation emails** (critic 1, C): v1 has no automatic emails (brief). The escalation is a PD/admin Overdue and abandoned flag.
- **Test counts of 86/62** (critic 3): the READMEs and the plan's baseline say 61/85 (`evals/README.md` L56). The difference comes from counting helper calls, not checks.
- **"Pending" as a badge label on a "To do" tab** (critic 2): we go further and use MedHub's own tab name and segment, Evaluations · "Pending | History".
