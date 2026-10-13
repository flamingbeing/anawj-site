# Evals: improvement review (13 Oct 2026)

A 20-reviewer pass over the evals app. 17 read the code; 3 looked outside it, at other assessment apps (SIMPL, Kaizen,
Elentra, ANZCA) and at the medical-education evidence. Nothing here is built yet. The owner picks; each item is
meant to be one small PR. Sizes are rough: S = an hour or two, M = half a day, L = more. Line numbers are as of
commit `72e8d19` and will drift.

**Verified** means checked against the code by the main session. Every other item is the reviewer's reading and
needs checking before it is built.

## Batch 1: don't lose work, don't lose assessors (do first)

1. **Signing out offline throws away unsent forms (M, verified).** `cloud.js:107-121`: `signOut` deletes every
   `evals-draft-*` key, then clears Firestore's offline cache, which also holds its queue of unsent writes. An
   assessor who submits in theatre and signs out before getting signal loses the evaluation. Fix: before signing
   out, check for pending writes; if any, say "N forms not sent yet" and offer to wait.
2. **"Sent ✓" shows when nothing has left the phone (S).** `ui-form.js` `sentScreen` and `cloud.js` `queued()`
   (resolves after 3 s even offline). Fix: say "Saved on this phone, sends when you have signal", then switch to
   Sent once the write has synced. The same wording problem appears in 'Saved on this device' (`ui-form.js:152`).
3. **Offline edits to a submitted form can be wiped (S, to verify).** `ui-core.js:42-45` `pruneDrafts` drops the
   draft of any evaluation that isn't `requested`, which includes one being edited in the 15-minute window. Keep
   the draft until the server copy matches it.
4. **WhatsApp's built-in browser can't sign in with Google (M).** Google refuses sign-in inside the WhatsApp,
   Instagram and Facebook in-app browsers (`disallowed_useragent`), and the error shows on Google's page, so the
   app never sees it. Most assessor links arrive by WhatsApp. Fix: detect those browsers on the landing page
   (`app.js` `renderLanding`) and show "Open in Chrome / Safari" with a Copy link button.
5. **An assessor link should say what it is (S).** When the hash is `#e/<id>`, the landing page shows the general
   page and demo buttons. Instead say "A resident asked you to complete an evaluation. Sign in with the Google
   account the programme has for you", and name that account (`login_hint`, `cloud.js:98`).
6. **Wrong account (S).** Signed in with another Gmail, an assessor lands on "Apply to join" and loses the
   evaluation. On an `#e/` link with no role, say "This was sent to a different account" with a prominent
   Switch account button. Do the same on "Evaluation not found" (`ui-form.js:46`).
7. **Plain error messages (S).** Several screens show raw `err.message` from Firebase. Map the usual ones
   (no signal, popup closed, wrong domain) to plain words. Exact wording suggestions are in "Wording" below.
8. **Dark-theme toast is unreadable (S).** `style.css:409`: `#toast` has a fixed dark background, and in dark mode
   its text colour is dark navy too. Add toast colour tokens to the dark block.

## Batch 2: faster for consultants (completion rates)

Evidence: SIMPL (US surgery) gets about 30-second evaluations from one autonomy rating, one performance rating and
optional dictation. Kaizen, Elentra and the Australian CLA let assessors complete from a link without an account.
ANZCA found 9 in 10 of its assessments had minimal feedback and redesigned its forms.

1. **Resident fills in the case context; the assessor confirms it (M).** Q1/Q2 (setting, complexity, guidance
   level) and "briefly describe what was discussed" are things the resident knows. Ask for them in the request
   (`ui-request.js`) and show them prefilled and editable on the form. That is 3-4 fewer required answers per form.
2. **One row for "Receptive and reflective: Yes" (S).** These two closing questions are required and nearly always
   Yes. Show a single pre-ticked row with a "change" option.
3. **Feedback box straight after the scores (S).** Ask for "one thing done well, one specific next step" while the
   assessor is still engaged, not at Q19-22. Warn gently if every 9-point item has the same score (in one study,
   nearly a third of forms did, and those scores didn't match the comments).
4. **Say how long it takes (S).** "About 2 min · 22 questions" on each Pending row, plus a counter per section.
5. **Sent screen: next form for the same resident in one tap (S).** "2 left for Dr X".
6. **Voice dictation hint on comment boxes (S).** Already in the §7 backlog. SIMPL saw about a quarter of
   evaluations use dictation.

## Batch 3: reminders that reach the assessor

Today nothing reaches the assessor unless a person sends it. Resident nudges are a manual re-share, and the
admin's `reminderText` (`ui-admin.js:146`) is copy-only.

1. **WhatsApp reminders (S, free).** A "Remind assessor" button for the resident after 20 h (`NUDGE_HOURS`) and for
   the admin digest, opening WhatsApp with the message ready (`wa.me/?text=`). Record when it was sent.
2. **Weekly email digest (M, about $0-1 a month).** Use Firebase's Trigger Email extension with a scheduled
   function that sends `reminderText`. It needs an SMTP account (kept in Secret Manager), may land in spam, and
   must never put patient details in an email. Pilot it only if completion stays under about 60% after 2 weeks of
   WhatsApp reminders.
3. Skip web push for now: it is fragile and on iPhones only works once the app is installed. Calendar invites
   are easy to ignore.

## Batch 4: residents and PDs

Residents:
1. **"Next 3 to ask for" card at the top of Progress (S).** `dueItems()` (`engine.js:200`) already exists. Show
   overdue items first, each with one-tap Request.
2. **Progress filters "This year / Overdue / All" and "N more needed" per row (S).**
3. **Deadlines inside a year (S).** Four items are due in the first 2 months of R1 (mask, intubation), but
   `progress()` only compares by year.
4. **Supervision trend per EPA (M).** Plot each evaluation's supervision level against the target level.
5. **Rotation checklist (M).** The guidebook says Mini-CEX/EBD are due by the end of each rotation, but the app has
   no idea of a rotation.
6. Request flow:
   - a "not synced yet" banner on the QR when offline (S);
   - one summary line instead of two cards on step 3, so the date fields sit above the fold (S);
   - Today / Yesterday chips for the date (S);
   - start from a recent assessor (M);
   - edit the case details after sending (M).

PDs and committee:
1. **Sortable cohort grid with "Last submitted" and total shortfall, plus an R1-R5 filter (S).** `ui-admin.js`
   `cohortGrid`.
2. **One-page committee summary per resident (M).** Reuse the Progress view on the resident sheet, with Print.
3. **Committee CSV: one row per resident × EPA (S).** `cohortRow` and `flagsOf` already compute this.
4. **Flags grouped by resident (S).** Repeated concerns about one resident are easy to miss in a time-ordered list.
5. **Show drafts never sent and declines never re-sent, older than 7 days (S).**

## Batch 5: privacy and rules (each rules change needs the owner's approval)

The rules reviewer found nothing serious. A resident cannot write or change an assessor's ratings, and an assessor
only sees evaluations sent to them.
1. **Private comments carry over to a new assessor (M).** The `/private` comments check the evaluation's *current*
   assessor, so after a decline and reassign, the new assessor can read the old assessor's PD-only comments. Store
   the author on each private doc and check it.
2. **Resident can change the EPA/level under a half-written assessment (S).** Lock `epa`, `level`, `itemText`,
   `caseKey`, `formVersion`, `request` and `date` once `assessment` has started (rules around l.414).
3. **Assessment values are unchecked (S-M).** Only the number of keys is limited. Cap the type and length of each
   value, and lower the 20,000-character limit on private comments.
4. **The client sets `submittedAt` (S).** Use the server time, which also fixes the edit window and conflicts
   between devices.

## Batch 6: speed, look, accessibility, tests, code health

Speed (first open from WhatsApp; repeat visits are already fast):
- Measured: our own JS is about 115 KB gzipped, and the Firebase SDK about 174 KB, the largest cost.
- Start fetching the SDK sooner (`modulepreload` plus preconnect to gstatic) (S).
- Register the service worker after the first screen has rendered (S).
- Drop the Google Fonts request (system fonts, or 2 self-hosted weights) (S).
- Lazy-load `qrcode.js` (12 KB), `demo-backend.js` (9 KB) and the full catalogue on the assessor path (S-M).

Look (to match the logbook's recent polish):
- switches instead of checkboxes in Settings (S);
- merge the old navy base styles into the "Logbook theme" block (M);
- motion tokens and slide-in pages (M);
- bold page titles (S);
- honour the logbook's Flat look (S).

Accessibility:
- Port `logbook/test/e2e/a11y.mjs` and run it in light and dark (M).
- Announce form errors (`aria-invalid` and `aria-describedby`, `ui-form.js` `markErrors`) (S).
- Make the full-screen QR a real modal with focus returned on close (S).
- Set `document.title` per screen (S).

Tests to add (`evals/test/e2e.spec.mjs`):
- reload and submit while offline (M);
- sign out mid-form, checking drafts are cleared and none leak to the next user (S);
- the anawj.com forward, including inside an iframe (S);
- the PD role (M);
- a service worker update (M);
- a dark theme sweep (S).

Code health:
- **Move the shared data rules out of `demo-backend.js` into `schema.js` (M).** The real backend imports its
  field rules from the demo file, which is a trap for future sessions.
- Split `ui-request.js` (move the shared helpers at l.99-270 to `ui-shared.js`) and `FormScreen` in `ui-form.js`.
- One clipboard helper (the copy-and-toast code appears 4 times).
- Mark `firebase-config.js` as "keep in sync with logbook".

## Later or bigger

- **Logbook link (S-M; no rules change needed).** Add "Request evaluation" on a logbook case, opening
  `/evals/#new` with the date and initials prefilled (never case details). Store `caseId` on the evaluation and
  show "Evaluated (n)" on the case. Add "Log this case" from a sent evaluation.
- **Exports:**
  - a resident's "My evaluations" PDF or Word, reusing the logbook's docx helpers (M);
  - a PD per-cohort Excel (M);
  - a graduation pack (M);
  - a MedHub-format export (blocked: needs MedHub's import template from the admin team).
- **Backups:** switch on Firestore scheduled backups in the console now (no code), then the nightly encrypted
  export Action (L). The owner deferred this until the app is finalised.
- **Scale, by year 3-5:** PD/admin sessions load the whole `evaluations` collection (`cloud.js:325`), reaching
  about 15k documents in 5 years (roughly 270k reads a day). Add an academic-year field (`ay`) on write, backfill
  it, filter the live lists by year and add `firestore.indexes.json`. Not urgent in year 1 (about 3k documents).
- **Onboarding:**
  - an install-to-home-screen prompt (M);
  - a one-page "How evals work" for consultants, linked from Pending and the first form (M);
  - an empty Home with a "Request your first evaluation" button (S);
  - a demo walkthrough checklist for teaching sessions (M);
  - a one-time welcome per role after approval (S).
- **Assessment design (owner and PD call, not code):**
  - Score supervision with O-SCORE or Zwisch anchors ("I had to do it" … "I didn't need to be there").
  - Require a structured comment ("done well / next step / why").
  - Set a 48-hour deadline.
  - Frame requests as learning, with a short resident action plan after each assessment.
  - Show assessors their own score spread.

  The APMES forms are the programme's own, so these are suggestions to raise with the PD, not changes to make.

## Wording (ready to apply)

- 'Saved on this device' → 'Saved on this phone only. It will sync when you have signal.' (`ui-form.js:152`)
- Raw errors ('Not saved: …', 'Could not decline: …', 'Could not approve: …') → 'Couldn't save. Check your signal
  and try again.', with the detail underneath (`ui-requests.js`, `ui-result.js`, `ui-form.js:347`, `ui-admin.js`,
  `ui-more.js`)
- 'Unknown form' → 'Can't open this form. Refresh the app; if it still fails, ask the resident to send it again.'
  (`ui-form.js:55`)
- 'Nudge (send the link again)' → 'Remind assessor', and the timeline step 'Nudged' → 'Reminder sent'
  (`ui-requests.js`)
- 'Saved: sends when online' → 'Saved. It will send when you're back online.' (`ui-request.js:596`)
- 'Not available yet' → 'Can't find this evaluation. It may still be syncing; check you're signed in with the right
  email.' (`ui-result.js:14`)
- 'Reopen?' → 'Reopen this evaluation?' (`ui-result.js:66`)
- 'Still waiting' → 'Not approved yet. You'll see it here once it is.' (`ui-more.js:58`)

## Sources (outside reviewers)

SIMPL: PMC6239054; otolaryngology median 22 s (doi 10.1177/0194599819868165); Penn 58k assessments. ANZCA WBA
review. RCR Kaizen supervisor guide. Toronto PGME timing guideline (48 h). "Ticking the boxes" PMC4817654 (identical
domain scores). CMEJ 2024 and UMN "But why" (comment quality). Gaunt 2017 (residents "play the game" when stakes feel
high). Gofton 2012 and JGME 2022 (O-SCORE). Lörwald 2018, Holmboe 2004, Crossley 2011, Rekman 2016 and George 2014
were cited from memory by the reviewer; check them before quoting.
