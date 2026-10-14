# Prewarming study app: notes

Lasting rules. Decisions with dates are in `PLAN.md` and `STATUS.md`.

- **Public repo:** never commit the eCRF template, the protocol or the paper data collection form (they carry staff
  names). Only the transcribed headers are here. Fake patients only, in tests and demo.
- **Study IDs only:** the app never asks for names, initials or hospital numbers. The Subject ID is exported in the
  template's Enrollment ID column (B).
- **Hospitals:** NTF, NUH, SGH, CGH, TTSH, KTPH, WH (`SITES` in `schema.js`). Each phone picks one in Settings; new
  patients record it (`site`, on the Extra sheet). With sharing, the join code will set it.
- **Scanning old paper forms** (owner, 14 Oct 2026; `prewarm/tools/scan/`, README there): phone photo, aligned to the
  blank v3.2 page; ticks by ink; numbers and times read twice by Claude (crops of de-identified cells only; IDs, dates,
  names and free text are typed by the owner); flags; `review.html` where the owner confirms every value; then the app's
  own `workbook()`. Field places come from `js/wordform.js` (fill one field, render, diff). Scans, the form and
  `form-data/` stay out of git. Tested on the fake fixture only; the real form, real handwriting and the live reader
  still need a dry run at home.
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
  web app section; `nuhsdesign/tokens.css`, Open Sans): white app bar with the four-quarter band (orange / red / stripe
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
- **Readings to enter live:** (the Settings section was removed 13 Oct 2026; settings v3 resets every hidden column, so all are always entered live) all on by default, BP / HR / BIS every 15 min included (owner, 12 Oct 2026; settings v2
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
- **Two patients at once** (12 Oct 2026): the next patient pre-warms while the last is in surgery, so due alerts
  cover every patient being charted that was opened on this phone in the last 12 hours (not deleted, locked or
  complete; a teammate's patient synced from another theatre doesn't beep here), other patients' alerts start with
  their Subject ID, the screen stays awake on the home list too, and the home list shows each one's reading due within 2 min,
  now or late. The top bar's countdown also shows the other tab's reading once it is due.
- **Unsaved readings survive the app closing** (12 Oct 2026): as a reading is typed (including a temperature with
  the keyboard still up), it is kept in localStorage (`unsaved:<patient>:<series>:<timepoint>`); reopening that
  reading brings it back with a toast, unless any of its boxes was saved since. Save or "Don't save" clears it.
  Toasts let taps through (`pointer-events: none`): they sat over Log, Back and the tabs for 2.6 s.
- **Patient screen layout** (owner, 12 Oct 2026): key times at the top on both tabs, then the Temperatures / Others
  tab bar, then the tab's readings; the bottom part (Intra-op details, PACU, Perioperative data, Form / Sheet view,
  Still to fill, Mark complete) is the same on both tabs. The no-pre-warming group keeps a Pre-warming tab that says
  "No pre-warming". Intra-op time 0 is induction (`io_knife`, labelled Induction; the paper form's row reads
  "Knife-to-skin start time (Induction)").
- **Three parts, reset, PACU view** (owner, 12 Oct 2026): the patient screen has three bordered parts with their
  own backgrounds (key times blue-grey; tab bar and readings; shared bottom part beige). Swipe changes tab only in
  the middle part (a touch starting on a −/+ button is its hold-to-repeat, not a swipe). The second tab is named
  "BP, HR, BIS". "Reset this subject" (small, bottom part) asks twice, then clears every entry except the Subject
  ID, group and hospital, on every phone. "PACU view" button beside New patient: tapping a participant opens only their
  PACU page (to hand the phone to the PACU nurse); back returns to that list.
- **PACU page times; temperature ticks** (owner, 12 Oct 2026): the PACU page starts with PACU in / To ward boxes
  (tap logs now, tap again to change) so the PACU nurse logs them there. The Temperatures tab has "Mark pre-warming
  temps complete" (not for the no-pre-warming group) and "Mark intra-op temps complete" (`sign_prewarm`,
  `sign_iotemp`, already in the export and the Word form).
- **Complete means closed** (owner, 13 Oct 2026): a section marked complete (pre-warming / intra-op temps, BP HR BIS,
  Intra-op details, PACU) is read only for everyone until its tick is undone (Undo asks first); its due alerts and
  countdown stop. "Data collection complete" closes every op-day screen (key times, Log, readings, forms) but not
  Perioperative data (filled in later from the chart). Each temps tick shows only on its own sub-tab.
- **Fast tests** (13 Oct 2026): `tools/test-prewarm.sh` runs everything but sync and rules in about 1½ minutes.
  Edge blocks each start from a fresh browser context and run four at a time (`JOBS=1` for one at a time); the full
  case's three groups run side by side. A failing `assert` on a Playwright handle can hang Node building its diff
  (memory climbs to gigabytes): if a test run is killed, look for a failed assertion comparing an element handle.
- **No BP, HR, BIS alarm** (owner, 13 Oct 2026): only temperatures and Prewarm off beep, buzz and show the banner.
  BP, HR, BIS due times still show in the top bar countdown and on the tab.
- **Temperature page** (owner, 13 Oct 2026): "Core (spot on)" spans both columns, then chest + arm, then thigh + calf.
  One tap on a number opens its box for typing; tapping elsewhere on an empty card fills the starting value (core
  36.5, skin 31.0, room 20.0). The first intra-op reading starts from the last pre-warming one. "Clear all boxes"
  empties the draft (on a saved reading it removes the reading after asking). The strip reads Arrival, then
  "Prewarm on" / "Induction" for 0, then "5 min"…; "Clear" beside a comfort answer. BP, HR, BIS due alarm is a
  Settings toggle, off by default (`settings.remind.haemo`).
- **Quick-entry pads** (owner, 13 Oct 2026; `js/keypad.js`): tapping a temperature, BP, HR or BIS box opens a number pad
  (Back, Clear, OK; BP, HR, BIS also Next); tapping a key time opens a time pad (Now, digits: the fourth digit saves,
  731 = 07:31; Back, Clear asks first). The display is a real input (`inputmode="none"`), so a computer keyboard
  works (Enter = OK, Esc = Back) and Playwright `fill()` still works: tests fill `input.num` / `#evtime` and press
  Enter. Tapping an alarm banner goes to that reading's screen only (owner, 13 Oct: no pad); the top-bar countdown also opens
  its first box (or the key time's pad). PACU in / To ward are on the PACU page only (not in the key-times row or the Log button); Still to fill
  lists them once surgery has ended. The tap guard (`lockTaps`) also runs after a pad saves, so tests wait 0.8 s.
- **Progress and Perioperative data tick** (owner, 13 Oct 2026; moved 13 Oct: first built as tick boxes on the patient screen, wrongly): the patient list shows a
  list of ticks on each patient in the patient list (read only; they mirror the existing complete ticks, no new boxes: pre-warming temps, intra-op temps, BP HR BIS, Intra-op details, PACU,
  Perioperative data). Perioperative data has its own tick (`sign_periop`, exported as
  "Complete: Perioperative data") that locks only that page; "data collection complete" does not lock it.
- **PACU nurse link** (owner, 13 Oct 2026): on a participant's PACU page a member (or admin) makes a link and QR code
  (`#/nurse/<token>`, 24 random characters = the secret). Firestore `pacu/{token}` holds a copy of that participant's
  PACU answers (`PACU_KEYS` in `js/schema.js`; the rules allow exactly that list, checked by a unit test): anyone
  signed in (the nurse's phone signs in anonymously, joins nothing) who has the token reads it and writes only those
  fields; nobody can list tokens except admins; members of the hospital make and stop (delete) it. The nurse's page
  shows only that participant's PACU in / To ward, answers and complete tick (the Subject ID in its title), with
  initials. Team phones subscribe to the `pacu_token` of their patients and merge newer fields (and push their own
  PACU edits to the link copy), so both directions settle on the newest write. `pacu_token` is a field on the patient.
  Anyone holding the link can edit those PACU answers until the link is stopped. Tests: `rules.emulator.mjs` (24
  checks), `sync.emulator.mjs` (a third phone opens the link). Rules deploy on merge to main.
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
  - **Join links** (owner, 12 Oct 2026): the admin screen shares `prewarmstudy.anawj.com/#/join/{site}/{code}` (old links at `anawj.com/prewarm/#/join/…` move across and still work) or shows it as
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
- No hand bump of `VERSION`: the deploy stamps it with a hash of the SHELL files (`tools/stamp-versions.mjs`; AGENTS.md).
- **Update check** (owner, 13 Oct 2026: "Update available" didn't appear until the app was closed and reopened): browsers
  look for a new service worker only when the page is opened, and the phones keep the app open for hours. The page now
  calls `reg.update()` when it comes back to the front, when signal returns and every 10 min (not tested in the browser
  suite: the worker isn't registered in demo mode).
- **Last warming reading** (owner, 13 Oct 2026): Save on the 10 min reading (arm 2) or the 30 min one (arm 1) marks
  Pre-warming temps complete (`sign_prewarm`, needs initials) and opens the intra-op temps. Undo the tick to edit.
  Once complete, `pointsFor` drops the later 5-min points (past 10 / 30 min) unless already saved, so they aren't
  asked for or listed in Still to fill; their export cells stay blank.
- **Perioperative data split in three** (owner, 13 Oct 2026): one row of three buttons on the patient screen: Pre-op
  (`#/p/<id>/data`: Subject ID and group, pre-op, meds, bloods; tick `sign_periop`, label "Pre-op and patient
  details"), POD1 (`/data/day1`: chart review, analgesia; `sign_pod1`) and POD2 (`/data/day2`: chart review,
  analgesia, discharge; `sign_pod2`). Questions and order unchanged (`DATA_PARTS` in app.js). Each tick locks only
  its page; "data collection complete" closes none of them. Progress ticks on the list and the export's "Complete: …"
  columns (Extra sheet) have the three.
- **Defaults in light grey** (owner, 13 Oct 2026): a temperature or choice that is only carried over from the last reading
  (or filled by a rule: gown set NA, underbody / gown Yes) and not yet saved for this timepoint has the `dflt` class
  (grey text, grey pressed chip). Saving makes it normal. The later warming points (past 10 / 30 min) are also dropped
  once that last warming reading is saved, even without initials (`pointsFor`).
- **Admin password sign-in** (owner, 13 Oct 2026; Google stays off, see above): Settings has email + password boxes
  with Sign in, "Email me a sign-in link" and "Forgot password? Email me a reset link". A password exists only on an
  account that signed in once by emailed link (that proves the email, which the rules need): once signed in, Settings →
  Password → Save password (8+ characters). Rules unchanged (admins list + verified email). Needs Email/Password on
  in the Firebase console (it is, for email links). Covered by the two-phone sync test.
- **Refresh now** (owner, 13 Oct 2026): a button at the bottom of the home page and in Settings (when sharing is on).
  It re-checks who the phone is (fresh token, member / admin list, so a newly added admin entry counts without
  logging out), re-subscribes to the team's patients, sends anything waiting, and checks for a new app version (shows
  "Update available" if one is ready). It never deletes anything on the phone.
- **Update helper** (owner, 13 Oct 2026: Firefox on the phone kept the old version after closing and reopening):
  `anawj.com/prewarm-update/` is a plain page outside the app's service-worker scope (`/prewarm/`), so the old worker
  can't serve it. "Get the latest version" first checks the app is reachable, then unregisters the prewarm worker and
  deletes the `prewarm-*` caches, then opens `/prewarm/` again. Patients and readings (localStorage, IndexedDB) are
  never touched. Also linked from Settings under Refresh now. Tell the owner to open it by typing the address when a
  phone is stuck on an old version.
- **Read only hides empty timepoints** (owner, 13 Oct 2026): once a section is marked complete (or data collection is),
  `pointsFor` shows only the timepoints that have a time or a reading (all, if none has), so no time is offered for
  logging and the strip has no empty tabs; opening a hidden one goes to the default point. The bottom of Settings and
  home shows the app version (the saved copy's name) to spot a phone stuck on an old one.
- **Stale banner and bare times** (owner, 13 Oct 2026): (1) "Update available" posted `skipWaiting` to the worker it had
  captured, which can be replaced by a newer one when several updates ship in a row, so on Firefox the tap did nothing.
  It now asks the current waiting worker, hides the banner, and if nothing takes over in 3 s clears the app's saved
  copy (never the patients) and reloads. (2) A blank or cleared save leaves a bare `at_…` time with no readings; a point
  counts as having data only if it has a reading (`hasData`), and `p.f[...]` truthiness is never used (cleared records stay).
- **"Subject ID:" label** (owner, 13 Oct 2026): patients are named "Subject ID: 85" in the patient list, PACU view and
  delete lists (`sidL`), and the app bar shows a small "Subject ID" above the ID (`setTitle`) so it doesn't crowd the
  countdown and Log. The PACU nurse's page keeps its own "PACU · ID" title.
- **Sync status replaces Log in the bar** (owner, 13 Oct 2026): the top-right chip shows Synced / N waiting / Offline
  (or Local when not sharing); a tap runs Refresh now. The one-tap Log shortcut is gone: key times are set from their
  boxes in the key-times row (pad with a Now button). Tests set times that way (`tapNow`); logging one while an earlier
  key time is empty asks first.
- **Patient list tools** (owner, 13 Oct 2026): admins get a Form view icon on every line (`.formlink`, beside the
  card). "Select to export" (everyone) beside "Select to lock" (admins): tick cases, "Select all" / "Select none" chips,
  "Export N to Excel" (the same file as Settings → Export, for just those). In the lock view the chips (dashed, "All
  but the latest" / "Select none") sit on their own row above Lock / Unlock. The "Study IDs only" line was removed.
  "Downloaded" (pre-op `pre_dl` and day 2 `d2_dl`) is no longer asked (`NOT_ASKED`); its template columns stay empty.
- **Move to prewarmstudy.anawj.com** (owner, 13 Oct 2026; plan in `SUBDOMAINS.md`, step 3; done between cases only):
  - Why: the browser keeps a phone's saved copy, unsent readings and sign-in per web address, so the study app has its own
    address. The repo folder stays `prewarm/`; the host serves only it (plus the shared `/nuhsdesign/`).
  - The old address (`anawj.com/prewarm/`, `www.`) runs `moveCheck()` once, 1.5 s after the app opens (never mid-entry,
    top-level windows only). It moves the phone only when: no half-entered reading (`unsaved:` drafts), nothing waiting
    (`pending` empty and `cloud.flushed()`), the phone is on a team (or has no patients), it is online and the new
    address answers. Otherwise a bar says why, with Try again. Demo mode moves at once. It never moves a phone mid-case
    unless the app was just opened or updated: a running phone only gets the new code by "Update available" or a reload.
  - The redirect keeps path and query and the `#` part (nurse links, join links, admin sign-in links). A team member's
    phone sends `#/join/{site}/{its code}/{initials}` (read from its own `members` record) so it rejoins on the new
    address with one tap; admins sign in again there (email link or password). Nothing in Firestore or the rules changes;
    the old address's saved copy is left as it was (no data deleted).
  - New address: `update.html` in the app folder is the update helper (the SW lets it through to the network);
    the old address keeps `anawj.com/prewarm-update/` (outside the old worker's scope; it clears the old copy and
    reopens `/prewarm/`, which then moves on). The sign-in domain stays `prewarm-study.firebaseapp.com`;
    `prewarmstudy.anawj.com` is an authorised domain (owner added it).
  - Tests: edge block AJ (redirect keeps path, query, `#`; no loop; update helper), sync test (a half-entered reading
    keeps the phone; then the join code and initials arrive on the new address and the team's patient shows). In tests
    `?oldhost=<new address>` on localhost pretends to be the old address.
- **Admin hospital** (owner, 13 Oct 2026): signed-in admins had no way to set "their" hospital (the chips only showed in
  demo mode), so patients they started had no hospital and never synced. Settings now shows the hospital chips to admins
  (members' hospital stays fixed by their team). Workaround before this ships: open the team's join link while signed in.

### Done looks done (owner, 13 Oct 2026)
The bottom shortcuts on the patient screen turn solid green once their section is marked complete (no tick). The PACU
Mark complete is a full-width navy button. Day 1 / Day 2 are called POD1 / POD2 everywhere (the Word template's own
"Day 1" labels are unchanged).

### Saves that don't reach the team are shown (14 Oct 2026)
`sync()` keeps a `failed` map (patient -> reason, saved on the phone). A patient with no hospital, a refused save
(locked, or the phone left the team) or another save error turns the sync chip red ("N not saved", tap says why) until
a later save reaches the team; Log out also warns about them. Before, a no-hospital patient showed "Synced" and a
refused save only toasted. `friendly(e, ctx)` words errors by place: `'save'` and `'pacu'` (a stopped link says "This
link has stopped working. Ask the study team for a new link."). `pacuPush` uses `updateDoc`, not a merging `setDoc`:
a save onto a stopped link would otherwise become a create, which the rules refuse as "Not allowed" (a likely cause of
the 13 Oct nurse failure, not proven).

### Delete / restore and alerts (14 Oct 2026)
`markDeleted` and `restore` (store.js) give each delete and restore a time later than the last one seen, so delete,
restore, delete, restore always works, even from a phone whose clock is behind (the old restore wrote the same value
`1` again, which `setVal` skipped, so the second restore did nothing). Lock times never go backwards either.
Due alerts now repeat every 2 minutes while a reading is due and unsaved, for 10 minutes after its time (the banner
says "overdue" after 5), and a phone that slept checks the moment it is back in front. The `nag` key (last buzz per
reading) replaces `alerted`. Still only while the app is open: a lock-screen alarm needs a push server.

### Export NA, file name, safer updates (14 Oct 2026)
- **Export:** pre-warming reading cells past the warming (after 10 min in the 10 min group, after 30 in the 30 min
  group) with nothing saved export as `NA` (owner, 14 Oct). The no-pre-warming group and a patient with no group stay
  as before; the Downloaded columns stay empty. `WARM_MIN` now lives in schema.js. A typed decimal comma ("37,5") exports
  as a number. The file is named with the phone's local date and the patient count (`prewarming-study-2026-10-14-3pt.xlsx`);
  it used the UTC date, so a Singapore phone before 8 am got yesterday's.
- **Updates:** the service worker's install is all-or-nothing for the app's own files (one failed download fails the
  install, the browser retries, the phone keeps the old complete copy); Firebase SDK files stay optional. The 3 s
  fallback only clears the saved copy if `sw.js` can be fetched right then. Base `prewarm-v79`.

### Done shortcuts also show a ✓ (14 Oct 2026)
The green "complete" shortcuts on the patient screen also get a ✓ before the label (not colour alone, red-green colour
blindness), and their spoken label is "POD1, complete" instead of just "complete". Taller tap targets for the reading
tabs were tried and dropped: they push Save below the fold on a phone (the e2e test pins that).

### The number pad chains through the boxes (14 Oct 2026)
On the temperature and BP/HR/BIS screens the pad has a Next button for every box that takes a number (not the gown set
temp or yes/no boxes), and three digits of a temperature (like 366) save it and open the next box's pad by themselves:
about 5 taps fewer per reading. Back closes the chain. Edge tests close the next pad after a 3-digit entry. Not done: the
late-reading time still uses the browser's `prompt()` (`askTime`), because the save flow waits for its answer.

### Patient list: POD due, search, unsent badge; runbook (14 Oct 2026)
The list shows "POD1 due today / overdue" and "POD2 ..." from the Surgery date field (else the day the patient was
started on this phone) until the section's Complete tick. A Subject ID search box appears above 5 patients (hides rows,
no redraw). A patient waiting to send, or whose save was refused, has a red "Not sent yet" / "Not saved to the team"
line. `RUNBOOK.md` is the one-page study-day routine for the team; `PLAN.md` is marked old.

### Ready for a case? card (14 Oct 2026)
Top of Settings (when sharing is available): ✓ / ✗ rows for online, initials, on a team, hospital set, nothing waiting
or refused, synced in the last 15 minutes, app up to date, each with what to do. It only reads state the app already
keeps; it does not test the PACU link (do that by hand, see `RUNBOOK.md`). Checked in the sync emulator test.
Still to fill (patient screen) also lists "POD1 / POD2 chart review due today / overdue" with how many questions have an answer,
once due and not ticked complete.

### Off-protocol note (14 Oct 2026)
Intra-op details ends with a free-text "Anything unusual or off-protocol" (`io_dev`, exported in the Extra sheet): a
missed reading and why, a monitor fault, warming stopped early. A fuller deviation form (codes, per-reading reasons, a
log of group changes) is still open and needs the study team's wording.

### Carried-over measurements are not saved (14 Oct 2026, owner: "stopped on save")
A temperature (core, chest, arm, thigh, calf) or BP / HR / BIS that is only the grey carried-over value, untouched, is
left out on Save (it is never stored as a new reading). Typing it, tapping the value and OK, using a stepper or tapping the
box to fill it all count as confirming it (`touched`; the grey goes away). Saving with some boxes still blank asks
first, as before, and a reading with nothing but carried boxes is the "blank" case. The set temp, warming Yes / No and room
temp still carry as before. Tests confirm grey boxes first (`confirmDefaults` in edge.e2e, the fullcase `temps()`).

### Less scrolling on the sub-pages (14 Oct 2026)
On a phone (under 700 px) the questions on Intra-op details, PACU, Pre-op, POD1, POD2 and the nurse's PACU page sit two to
a row, label above its answer. A question with 3 or more answers (ASA, Smoker, ECG, pain 0-10), long answers (GA
(Inhalational) / GA (TIVA), the adverse events list) and every non-question (headings, tables, buttons) take the full row
(`.fld.longopt` set in `fieldHtml`, the rest by `:has()` in style.css). No taps were added: nothing is collapsed (owner:
"I don't want taps"). At 390 px: Pre-op 5.0 to 2.9 screens, POD1 2.5 to 1.5, POD2 3.8 to 2.4, PACU 2.2 to 1.5, Intra-op 1.7 to
1.3. The Temp and BP, HR, BIS screens are unchanged (owner: fine as they are). An odd question before a full-width one
leaves a half-empty row; filling holes (`grid-auto-flow: dense`) would reorder the questions, so it is not done.
