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
  separate screen); one line once answered. "Spreadsheet view" (was Form view) is a text link under the other forms.
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
- **Never send an empty `f`** (lesson, 12 Oct 2026): `setDoc(…, { f: {} }, { merge: true })` replaces the server's
  `f` with an empty map (an empty map is a leaf in the merge). Lock / unlock / delete sent one and wiped the server
  copy's readings; push now omits an empty `f`, lock sends the full record, and each phone resends all its patients
  once after its first server snapshot (`resync1`). The sync emulator test checks the server copy keeps its readings.
- **Warming time labels** (owner, 12 Oct 2026): Gown on (pre-warming gown put on), Prewarm on, Prewarm off, Underbody
  warm, Gown warm (the intra-op Bair Huggers). Those are all the Bair Hugger items on the paper form. They are coloured warm
  beige (`.tchip.warm`: fill #efe2d2, labels #7a4a00); the other times stay blue.
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
- **Defaults on tap:** an empty temperature becomes 36.5 (anywhere on its card, owner 12 Oct 2026) (then + / −, or tap again to type); an empty time becomes now.
- Gown set temp follows "Warming off" (NA for later timepoints) until someone picks a value on that screen.
- - **Entry screen:** option B ("change what moved"): values carry over from the last saved timepoint; + / − nudges;
  tap the number to type ("365" → 36.5). Hidden readings (Settings) stay blank.
- **Alerts** only work while the app is open; locked-phone alerts would need push notifications.
- **Sharing** (`js/cloud.js`, `firestore.rules`, Firebase project `prewarm-study`):
  - Phones join with their hospital's code (anonymous sign-in); the rules accept a `members/{uid}` entry only with that
    hospital's current code. Members read and write only their hospital's patients. A new code stops new joins with
    the old one; phones already in stay in until an admin removes them.
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
