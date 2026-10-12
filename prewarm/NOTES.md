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
- **Look:** the NUHS design system (`design/tokens.css`, Open Sans from Google Fonts), like evals: navy bar with the
  orange / red / navy stripe, flat white cards with 5px corners, light navy headings, cyan-underlined tabs, green Save.
  Links are navy (link blue is under 4.5:1 on the grey page).
- **Form view** (owner, 12 Oct 2026): the day-of-surgery pages of the paper data collection form v3.2 (intervention,
  intraoperative, intraoperative readings, PACU with patient satisfaction), filled in; one A4 page each when printed.
  "Save as PDF / Print" opens the browser's print screen. Spreadsheet view stays for checking readings.
- **Defaults on tap:** an empty temperature becomes 36.5 (then + / −, or tap again to type); an empty time becomes now.
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
