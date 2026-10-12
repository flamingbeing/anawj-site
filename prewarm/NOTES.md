# Prewarming study app: notes

Lasting rules. Decisions with dates are in `PLAN.md` and `STATUS.md`.

- **Public repo:** never commit the eCRF template, the protocol or the paper data collection form (they carry staff
  names). Only the transcribed headers are here. Fake patients only, in tests and demo.
- **Study IDs only:** the app never asks for names, initials or hospital numbers. The Subject ID is exported in the
  template's Enrollment ID column (B).
- **Hospitals:** NTF, NUH, SGH, CGH, TTSH, KTPH, WH (`SITES` in `schema.js`). Each phone picks one in Settings; new
  patients record it (`site`, on the Extra sheet). With sharing, the join code will set it.
- **Blinding:** the randomisation group shows only on the pre-warming screen (and when the patient is created).
- **Columns:** `schema.js` lists fields in template column order; field n is column n. `test/prewarm.test.mjs` pins
  anchor columns. Never insert a template field out of order. Items with no template column go in `EXTRA` (exported
  on the "Extra" sheet).
- **Readings:** saving a timepoint stamps `at_<series>_<point>` with the clock time and initials; the Readings sheet
  is built from those. Gown set temp is NA for the no-pre-warming group and after "Active warming stopped".
- **Screens follow the day** (owner, 12 Oct 2026): opening a patient lands on one main screen: the event times as a
  compact grid (tap an empty one = now; tap a set one to change or clear it), then all temperatures with a
  Pre-warming / Intra-op switch (opens on Intra-op once the patient is in OT), then links to the other forms in the
  order they're filled in (BP/HR/BIS, intra-op details, PACU, satisfaction, form view).
- **Patient comfort** (owner, 12 Oct 2026): pre-op question at the top of the main screen, post-op at the bottom (no
  separate screen); one line once answered. "Sheet view" (was Spreadsheet view, earlier Form view) is a text link under the other forms.
- **Join by code:** the hospital comes from the code's prefix (NTF-…), so nobody picks a hospital to join.
- **Service worker:** the page reloads only when an update takes over, never on the first install (a reload wiped the
  initials typed on the join screen).
- **Look:** the NUHS design system's app theme (the owner's "Kent Ridge Clinical" design system artifact, Mobile and
  web app section; `design/tokens.css`, Open Sans): white app bar with the four-quarter band (orange / red / stripe
  blue #178fd7 / navy), grey #f3f3f3 ground, white cards with 14px corners and hairlines, 10px controls, navy as the
  only accent (Save, selected chips, active tab), bold navy titles, 44px tap targets, dark toast at the top.
  Links are navy (link blue is under 4.5:1 on the grey page).
- **One screen per timepoint** (owner, 12 Oct 2026): the main screen fits a 390 × 844 phone down to Save without
  scrolling (e2e checks it): − value + on one row, chip rows with the label on the left, the "set the start time"
  hint in the due slot. Patients are deleted only on Settings → Delete participants (owner, 12 Oct 2026), nowhere else.
- **Timer and next event** (owner, 12 Oct 2026): the patient screen's app bar shows a running timer (from warming on,
  else gown on, during pre-warming; from induction, else in OT, intra-op; the clock time before either) and the next
  event to note (the first unset of gown on, warming on, warming off, in OT, induction, surgery end, PACU arrival,
  to ward, after the last one set; warming off shows its expected time, 30 or 10 min after warming on).
- **Quick controls** (owner, 12 Oct 2026): a navy Log button in the app bar (main screen, BP / HR / BIS, intra-op details and PACU, with the timer) sets the next event to now (it replaced
  the Spreadsheet view icon; Spreadsheet view is the text link at the bottom). Big ‹ › buttons either side of the tabs
  and timepoint strip go to the previous / next timepoint. Event time boxes are squarer, six per row (two rows).
- **Mark data collection as complete** (owner, 12 Oct 2026): one button at the very bottom of the patient's main
  screen (below the links and a divider, so it isn't tapped by accident), stored as `done` ("AB 12 Oct 2026 14:20").
  Once marked: a green line at the top of the main screen and "✓ Data collection complete" in the patient list; Undo at
  the bottom. In the patient list, tapping a completed patient warns first (amber row: who marked it and when); a
  second tap opens it. The Word form's sign-off lines use it on op-day pages with data that have no sign-off of their own. The
  per-section sign-offs stay on the BP / HR / BIS screen and the other forms.
- **Readings to enter live:** all on by default, BP / HR / BIS every 15 min included (owner, 12 Oct 2026; settings v2
  turned it on once for phones that had it off).
- **Export Excel** is in Settings (owner, 12 Oct 2026), not on the home page.
- **Log out** (owner, 12 Oct 2026; replaced "Stop sharing on this phone" and the admins' "Sign out"): warns first (how many
  patients will go), tries to sync for a few seconds, and warns again naming any patient with changes the server
  hasn't confirmed (`pending`, kept across reloads; cleared when Firestore's waitForPendingWrites resolves). Then it
  leaves the team / signs out, deletes every patient and Firestore's offline copy on the phone, keeps settings, reloads.
- **Admin screen:** the blank Word form card is at the bottom (owner, 12 Oct 2026).
- **Admin join codes** (owner, 12 Oct 2026): the code is shown big; tapping it copies it. "New code" is a small link
  and warns first: the old code, link and QR stop working for new phones; phones already in stay in (use Remove).
- **Last synced** (owner, 12 Oct 2026): home page and Settings show "Synced just now / N min ago / at 14:20 / 12 Oct
  14:20", or "Not synced: N patients waiting for signal. Last synced …" (amber). `lastSync` is set when nothing is
  pending and the server has confirmed the phone's copy (a server snapshot, a confirmed push, or waitForPendingWrites).
- **Locking** (owner, 12 Oct 2026): a study admin taps "Select to lock" on the home page, picks patients (or "All
  but <latest>": everyone except the most recently edited), then Lock / Unlock. A locked patient is hidden from team
  phones completely: the rules let members read only `locked == false` records, their query asks for that, and a
  patient that leaves the query is deleted from the phone (it comes back when unlocked). Admins (anyone in demo mode)
  open it read only (body.ro). Locked records are read only for everyone; an admin can only change `lock` / `locked`.
  `locked` (bool) mirrors `lock.on` on every record; older records got it from each phone's one-off resend
  (`resync2`), and stay hidden from members until then. Lock icon: an inline SVG padlock, no emoji.
  - Lesson: no `get(field, default)` in a read rule that guards a query: Firestore treats fields the query doesn't
    constrain as missing, so the default lets an unfiltered query through. Require the field (`locked == false`).
- **Readings saved ahead of time** (12 Oct 2026): a reading opens on the latest due timepoint still unsaved (else
  the next one), and saving one more than 3 min before it is due asks first (probably the wrong timepoint, and the
  real one would never be asked for). Tests that type key times use times relative to now: a fixed clock time
  reads as the next day's once the test runs over 12 h later (`nowFor` picks the nearest day).
- **Long reading numbers** (12 Oct 2026): `fitNums()` shrinks a reading's number until it fits its box (CSS
  container units didn't work under the app's zoom); checked at 320 and 390 px, zoom 1 and 1.25.
- **Never send an empty `f`** (lesson, 12 Oct 2026): `setDoc(…, { f: {} }, { merge: true })` replaces the server's
  `f` with an empty map (an empty map is a leaf in the merge). Lock / unlock / delete sent one and wiped the server
  copy's readings; push now omits an empty `f`, lock sends the full record, and each phone resends all its patients
  once after its first server snapshot (`resync1`). The sync emulator test checks the server copy keeps its readings.
- **Warming time labels** (owner, 12 Oct 2026): Gown on (pre-warming gown put on), Prewarm on, Prewarm off, Underbody
  warm, Gown warm (the intra-op Bair Huggers). Those are all the Bair Hugger items on the paper form. They are coloured warm
  lavender once set (`.tchip.warm.set`: #ebe5f7, labels #4f2f86; was beige, too like the amber "due soon" alarm; light grey #e6e6e6 until tapped, labels #50565c); the
  other times stay blue. The time boxes are numbered in the order they happen (1 Gown on … 11 To ward; renumbered
  without the pre-warming ones for the no-pre-warming group), a small number in each box's top corner.
- **Due time warms up** (owner, 12 Oct 2026): the "due hh:mm" beside each timepoint is plain until 2 min before,
  then an amber pill with a slow pulse (soon), an orange-red pill with a stronger pulse from due to 5 min past (now),
  and a red pill with a fast pulse after that (late); plain once the reading is saved. Reduced motion: colours only.
- **Bug hunt** (12 Oct 2026 evening): "Update available" (and an update taken in another tab) asks to save an unsaved
  reading before reloading (`afterAsking`). Tapping an empty key time while an earlier key time is still empty asks
  first (a stray Surgery end would stop intra-op readings counting as due); Log next always goes in order. Key times
  going backwards (over 12 h counts as past midnight) are listed in Still to fill as "Times out of order".
  Follow-ups: `isShown` also needs the question's own question shown (a follow-up of a follow-up hides when the first
  answer is No), and a hidden follow-up's stored value is left out of the Excel and Word exports (`shownValue`; kept
  stored, so switching back brings it back). BMI is worked out from weight and height like the TXA total (unless
  typed). The no-pre-warming group exports NA for active warming start. Perioperative data starts with "Subject ID
  and group" to correct mistakes: the ID can't be blank or a duplicate; the group asks first and can't be cleared.
  Save refuses an all-blank reading (it would stop the timepoint counting as missed) and asks when some boxes are
  blank; saved readings with blank boxes and readings hidden in Settings are listed in Still to fill.
  Typed form answers (Intra-op details, PACU, Perioperative data): letters refused where a number is asked; a
  temperature outside 25–45 °C asks first; 366 reads as 36.6 (`typedValue`). Due alerts (banner, vibrate, beep) run on
  every patient screen for every series (a BP reading falling due on the Temperatures tab or a form alerts too), and
  the screen-awake lock is taken again after switching apps (`startAlerts`, started from `topBar`).
  Sync (review, 12 Oct 2026): the server keeps whichever write arrives last, not the newest, so `watch()` heals: any
  field this phone holds newer (`t`) than the copy it just heard is sent again; both phones and the server settle on
  the newest (proven in the emulator test: without it, server 60 / A 60 / B 70). On the first server word each
  session, patients the server never had are sent whole, and pending entries from an earlier session are dropped
  (they were just re-sent if still newer). Save sends only the boxes that changed (plus the save time); a reading
  changed on the other phone while open here asks before writing over it (Cancel shows theirs). `push` always sends
  `auto`, so a typed BMI / TXA total / NuDESC isn't recalculated over elsewhere. A member's patient locked with
  unsent changes stays on the phone with a warning. Clearing a time asks first; an emptied time picker doesn't clear.
  The home list flags two records with the same Subject ID (same site): readings may be split. Locking warns about
  patients changed in the last 3 hours and not marked complete. A failed local write shows a sticky red bar
  (`#storefull`) instead of a toast that "… saved" would replace. A team listener refused right after a wrong join code
  rechecks membership and stops quietly (it used to overwrite "That code isn't right" with "Not allowed").
  A reading first saved more than 5 min after it was due asks what time it was taken (due time filled in; `askTime`):
  that time is the reading's time on the Word form and Readings sheet. A saved reading shows "Taken hh:mm (saved by
  XX) · Change time". `fullcase.e2e.mjs` runs a whole case per group and checks every op-day cell is exported.
  Delete / restore: a patient is gone only if deleted after its last "restored" field (`isGone` in store.js; no rules
  change). Settings › Delete participants lists deleted ones with Restore (to every phone in the team). A deleted
  patient can't be opened (back to the list with a note), so nobody charts into a record the export leaves out.
  Prewarm off falling due alerts like a reading (banner, vibrate, beep); alerts due in the same second share one
  banner, with three loud beeps (sound resumed on every tap, as phones suspend it after an app switch). AF "specify"
  on discharge is New onset / Existing (chips), so it always ticks the Word form.
  Underbody / gown warming yes / no: a reading due after its logged start time defaults to Yes until someone picks;
  saved readings still saying No after the start are listed in Still to fill.
  Taps (UI stress test, 12 Oct 2026): after a tap that moves or redraws the screen (Save, Log, a time box, a comfort
  answer) a second tap within 0.7 s and 48 px is ignored (`lockTaps`): a double tap used to save the next timepoint
  too or log the next event. "Tap again to delete" ignores a second tap within 0.6 s. `render()` blurs a box being
  typed in first, so a swipe or the phone's back button commits it (the leave prompt sees it; a form answer saves).
  A typed temperature goes back in place at once and the screen redraws 0.4 s later (a full redraw swapped Save
  under a finger already on its way, so the first Save tap was lost). The due banner floats over the page under the
  bar (`showBanner`) instead of pushing it down. Comfort answers change but don't clear on a second tap.
- **Two tabs** (owner, 12 Oct 2026): a thin tab bar under the top bar on the patient screen: **Temperatures** (the
  main screen: times, pre-warming / intra-op temps, comfort, Form view / Sheet view) and **Others** (BP, HR, BIS,
  plus the Intra-op details and PACU boxes and a full-width **Perioperative data** box, formerly "Other data"). The tab you're not on warms up and pulses when its next
  reading falls due. "Still to fill" and Mark data collection as complete are on both tabs. On Others, the BP, HR, BIS tick sits right under the readings, above Intra-op details (it covers only the vitals).
  Swipe left / right on either tab to switch. Pull-to-refresh is off (`overscroll-behavior-y: none`). Intra-op
  details, PACU and Perioperative data go back to the Others tab. Sign-offs name their section ("Mark BP, HR, BIS complete", "Mark PACU
  complete"…) and show a ticked green box with who and when once marked (`tickHtml`).
- **Nothing easy to miss intra-op** (owner, 12 Oct 2026): intra-op Baseline (temps and BP / HR / BIS) is due at In OT,
  End at Surgery end, so the top bar asks for them and they count as missed. "Still to fill" (`gaps()`, patient
  screen above Mark data collection as complete, refreshed every second) lists readings missed by over 5 min (link to
  the first), essential times skipped, warming marked Yes with no start time, Induction not logged 20 min after In OT,
  Intra-op details / PACU unanswered once Surgery end / PACU in is logged, and the comfort questions. Intra-op details
  and PACU boxes show "n to answer". Mark data collection as complete lists the gaps and asks first.
- **Edge cases** (stress test, 12 Oct 2026; `prewarm/test/edge.e2e.mjs`): times are minutes after midnight, so every
  "now vs due" compare uses `nowFor(p, s)` (the clock on the same day as the series' start): a case past midnight
  counts right. Readings due after their stage ended (into OT for pre-warming, surgery end for intra-op temps and
  BP) aren't counted as missed, alerted or counted down (`expected`). BP / HR / BIS / room temp: numbers only;
  outside usual ranges (`SANE`) Save asks first. Leaving an unsaved reading: each history entry carries `state.i`;
  back / a link is stepped back while the prompt is up and redone after, so the phone's back button never leaves the
  app past an unsaved reading. The automatic set-temp NA (after Log Prewarm off) doesn't count as a change.
- **Top bar** (owner, 12 Oct 2026): on the right the time now ("Time now 16:08", above the time boxes); to its left the next
  thing to log and a countdown: the reading due most recently on this screen (Temp or BP, until the next is due) or the
  next one, or warming off, whichever is first ("Temp 20 min · in 1:42" / "now" / "late 5:29"), coloured and pulsing
  like the due time, centred between the title and the time; before anything is due (no Prewarm on / Induction yet)
  there is no countdown and the time stays on the right. Then the Log button for the next event. The old "Prewarm + 12:34" elapsed timer is gone.
- **BP, HR, BIS are typed boxes** (owner, 12 Oct 2026): no − / + (the numbers are big); plain boxes that stay boxes
  (no redraw while typing), so tapping the next box or Enter ("next" on the keyboard) keeps the keyboard up. Save as before.
- **Ask before leaving an unsaved reading** (owner, 12 Oct 2026): readings (temperatures, BP / HR / BIS) still save only
  on Save (carried-over values count once someone confirms them; no auto-save). Changing a value and then leaving
  (another timepoint, ‹ ›, the tabs, BP, HR, BIS, back, Sign-off, a team update) asks "Save the 5 min reading?": Save /
  Don't save / Stay here (`leaveGuard` + `askLeave` in `render()`). A team update doesn't redraw over unsaved changes;
  the "New readings" bar shows instead.
- **Other data** (owner, 12 Oct 2026): a small box beside Form view / Sheet view opens the remaining template pages
  (pre-op, pre-op medication, pre-op investigations, day 1 and 2 chart review and analgesia, discharge) on one page
  (`#/p/<id>/data`), each a collapsible header (open by default) over every field in template order (`OTHER_PAGES`; no
  sign-off). The box has no caption. Keyboard entry on a computer: Enter / ↓ next question, Shift+Enter / ↑ previous;
  on a row of choices ← → move, Enter picks (never clears) and moves on, Space picks or clears; date and time boxes keep
  their own arrow keys. At ≥700 px each label sits beside its box. The main screen stays the op-day bedside screen.
- **Vital signs data collected** (paper form, intra-op readings page; no template column): ticked on the Word form
  once any BP / HR / BIS value is in; the BP screen says so. The BP, HR, BIS box on the main screen warms up and
  pulses like the due time for its next 15-min reading (misses older than 15 min are let go).
- **Screen size** (Settings, this phone only): Smaller / Small / Normal / Large / Larger zooms the whole app
  (`--ui-zoom` on body). Normal by default.
- **Form view** (owner, 12 Oct 2026): the study's real paper form (data collection form v3.2, .docx) with text put in:
  ☐ → ☒ (and the Word tick box's checked flag), values over the blank lines and into empty cells, Subject ID on every
  page, Date of Entry and the sign-off (Name, Date) on pages with data; every page kept, unfilled ones blank.
  "Download Word file" gives the exact file; "Save as PDF / Print" shows it with docx-preview (Calibri via Carlito) and
  prints. docx-preview doesn't paginate like Word, so a long section can run onto an extra printed page.
  - The blank form is uploaded once by an admin (admin screen) to `forms/blank` (base64; members and admins read it;
    Firestore keeps a copy for offline use). Its file details (creator, last edited by, company) are removed on
    upload; never commit the form (staff name in its file details). The upload lists places the map didn't find.
  - Without an uploaded form (or not sharing), the Form view shows the older simple HTML version. Demo: choose a blank
    .docx on the Form view; it stays in that browser tab.
  - Subject ID: one character per box; longer IDs get the five boxes merged into one.
- **Defaults on tap:** an empty room temp becomes 20.0 (owner, 12 Oct 2026); an empty temperature becomes 36.5 (anywhere on its card, owner 12 Oct 2026) (then + / −, or tap again to type); an empty time becomes now.
- Gown set temp follows "Warming off" (NA for later timepoints) until someone picks a value on that screen.
- - **Entry screen:** option B ("change what moved"): values carry over from the last saved timepoint; + / − nudges;
  tap the number to type ("365" → 36.5). Hidden readings (Settings) stay blank.
- **Alerts** only work while the app is open; locked-phone alerts would need push notifications.
- **Sharing** (`js/cloud.js`, `firestore.rules`, Firebase project `prewarm-study`):
  - Phones join with their hospital's code (anonymous sign-in); the rules accept a `members/{uid}` entry only with that
    hospital's current code. Members read and write only their hospital's patients. A new code stops new joins with
    the old one; phones already in stay in until an admin removes them.
  - **Managing admins** (owner, 12 Oct 2026): the admin screen's "Study admins" card lists `admins/{email}`
    ({ addedBy, addedAt }); any admin adds one by email (confirm first) or removes one (confirm first); nobody removes
    themselves (rules), so there's always one. All admins are equal. The new admin signs in from Settings ("Study
    admin? Sign in by email").
  - Admins sign in with an emailed link (Firebase "Email link" sign-in), not Google: phone browsers block the
    Google pop-up's helper page on `prewarm-study.firebaseapp.com` ("missing initial state"), and the self-hosted
    helper at `anawj.com/__/auth` belongs to the logbook's project. `admins/{email}` (lower-case email) lists them. The first admin is added by hand in the
    Firebase console; after that admins can add others there. Admins see every hospital, make codes, remove phones.
  - **Join links** (owner, 12 Oct 2026): the admin screen shares `anawj.com/prewarm/#/join/{site}/{code}` or shows it as
    a QR code (vendored qrcode-generator, as in evals). The code sits after the `#`, so it never reaches a server, and
    the app drops it from the address bar once joined. Codes stay long (8 characters); a link means nobody types them.
  - Each patient is one document; each field is merged on its own (`f.<id>: {v, t, by}`), newest edit wins when
    copies meet. localStorage stays the phone's working copy; Firestore keeps its own offline cache and sends when
    there is signal.
  - Membership is checked on the server, not the local cache (a refused join briefly shows in the cache).
  - Remote changes redraw the list, patient and form-view screens; on reading and form screens a bar offers to show
    them, so a half-entered reading is never lost.
- **Deploys:** a merge that changes `.github/workflows/deploy-firestore-rules.yml` and a rules file together may not
  start a run (it happened with #196); check Actions, and touch the rules file in a later PR if it didn't run.
- **Testing sharing:** `tools/test-rules.sh` (rules, 52 checks) and `tools/test-prewarm-sync.sh` (two phones in a
  browser against the local Firestore and Auth emulators, `?emulator` on localhost only). Never the live project.
- Changing any file in `sw.js` SHELL means bumping `VERSION`.
