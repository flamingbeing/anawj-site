# NUHS Residency Applications (residency applicant feedback)

Residents and faculty give confidential feedback on residency applicants: a 1 to 5 suitability score and a comment for each,
as in the department's Google Form it replaces ("360 feedback on residency applicants"; owner, 17 Oct 2026). At
`apmes.anawj.com/applicants/` (folder `applicants/`; moved from `/360/` on 17 Oct 2026, because the owner's CCC 360 collection form is a different app and takes `/360/`) (`?demo` for made-up applicants). Plan and what comes next: details in the owner's private notes.

## Rules

- **No real names in this repo.** Applicants are real people, and the feedback is confidential. The code holds a made-up demo
  round only. The admin pastes the real list in the app; it is kept on the device and travels in a private link
  (`#r=…`, the part after `#` never reaches a server). The source form and the real round file are in the owner's private notes.
- **Same people as the other APMES apps.** Sign-in and roles come from evals' `cloud.js`: a resident (`residents/`), active
  faculty (`faculty/`), PD or admin may answer. Admins and PDs also see Set up; **only PDs and the selection committee
  see Results** (owner, 17 Oct 2026: "committee and PDs"). Nobody else gets in.
- **Shared store (stage 2, 17 Oct 2026)** in the logbook project: `selection/{cycle}` (the round: title, applicants, open or
  closed), `selection/{cycle}/responses/{email}` (one response per person, written only by them while the round is open,
  read by them, PDs and the committee) and `selectionCommittee/{email}` (kept by admins and PDs). Rules:
  `logbook/firestore.rules` "Selection 360" (the Firestore collections keep the names `selection`, `selection/{cycle}/responses` and `selectionCommittee`; renaming them would mean a live rules change for no gain), tested by `applicants/test/rules.emulator.mjs` (`tools/test-rules.sh`). Admins
  do not read responses unless they are PDs or on the committee; an admin can add themselves to the committee, which
  leaves a visible entry. Respondents can't delete a response; PDs can.
- A round has two homes: **published** (shared store; everyone sees it on opening the app, answers go to the store) or
  **link/device** (stage 1: private link, answers to the Google Form or the device). The app uses the open shared round
  first, else the newest closed one (read-only), else a link/device round. `js/store.js` has both backends (the demo
  keeps its own copy in `sel-demo-store`).
- **Nothing blocks Send.** Review lists only applicants who still need an answer (never "a score without a comment"); a comment is
  never needed unless the admin marked that question required. "I haven't worked with them" is the explicit answer for a blank.
- **Autosave on the device** while typing (`sel-ans-<cycle>-<email>`), so a dropped signal or closed tab loses nothing.
  Demo data uses `sel-demo-…` keys and never touches a real round.
- UI is the NUHS app kit through evals' `style.css` (like People): top band, `.a-*` classes, 44px+ targets, axe-checked.

## What it does now (17 Oct 2026)

- **Fast to fill in:** Start opens the first applicant who still needs an answer; one tap scores (1 to 5), a comment is optional, Next sits
  in a bar fixed to the bottom, and "I haven't worked with them" is one tap that moves on by itself. The overview is a grid of passport
  photos with a tick for done. Review shows only people who still need an answer; a score without a comment is never flagged.
- **Editable questions** (Set up): up to 8 per applicant, each a 1-5 score (with words for the two ends) or a text box, any can be marked
  required. Stored with the round (`questions`); the standard two have ids `score` and `comment`, which the first version and the Google
  Form used, so older answers still fit. Answers are flat per applicant: `{ na, <questionId>: value }`.
- **Photos** (Set up, published rounds only): per person, or many at once by file name ("lim-zhan-foong.jpg"). `js/photo.js` crops to 7:9 and
  210 x 270 px as a JPEG of a few KB; stored as base64 in `selection/{cycle}/photos/{applicantId}`. Everyone who may answer can read them
  (that is the point); only admins and PDs write. Not in private-link rounds (too big for a link).
- **Demo** (`/applicants/?demo`; `?demo=reset` starts it over): a published round of eight made-up applicants with placeholder portraits, a
  committee member and four people's answers, so the photo grid, the questionnaire, Results and Set up can all be tried; the account
  sheet switches between resident, faculty and admin.

## How it's built

- `js/photo.js`: the passport crop (browser only). `js/model.js`: all logic, no page code (`test/model.test.mjs`): applicant list parsing, the round and its link
  (`encodeRound` / `readRoundText`), answers and their status, warnings, the Google Form body (`formBody`, `formUrl`),
  results summary and CSV (formula-safe).
- `js/app.js`: screens (home list, one applicant, review and send, thank you; Set up and Results for staff).
- A round is `{ title, cycle, applicants: [{ id, name, entry? }], questions, form? }`. `form: { id, nameEntry }` plus each applicant's
  `entry: { score, comment }` wires the round to a Google Form's public id and question ids; without them, Send keeps the
  answers on the device.
- **Send, link/device rounds** (stage 1) is a `no-cors` POST to the Form's `formResponse` address. The browser can't read the reply, so "sent"
  means handed over; the committee checks the response sheet. Never tested against a live Form from a session (no test
  answers go into the real sheet): the first real send needs a look in the sheet.
- Tests: `node applicants/test/model.test.mjs`, `node applicants/test/e2e.mjs` (phone size, demo, axe on each screen, the link
  round trip, CSV).

## Lessons

- **Rules edits:** merge `main` into the branch first, run `tools/test-rules.sh`, and merge only on green Checks, then confirm the "Deploy
  Firestore rules" run. The rules engine allows 1000 expressions per request and the role paths are near it (`people/NOTES.md`, "Roles").
- **Applicant ids come from names** (`a1`, `a2`… kept for an unchanged name): renaming someone in Set up makes a new applicant, so their old answers
  and photo stop matching. Fix typos before answers arrive.
- **Photos are stored as bare base64 in a `jpeg` field**, not a data URL: the rules then only check type and size (no regex on a long string);
  the app adds the `data:image/jpeg;base64,` prefix and refuses anything else (`photoSrc`).
- **A published round beats a link round** in `loadRound`; to test the link path in the browser test, seed `sel-demo-store` as `{"seeded":true}`
  (the demo otherwise seeds a published round).
- Preview links serve folders by name (`<preview>/applicants/?demo`); only the production worker maps addresses (`worker/routes.js`).
- **Mirror to the Form** (published rounds, optional): `round.mirror` (Set up checkbox, only when the round is wired to a Form and has the standard two questions, `canMirror`). Send then posts to the Form (`no-cors`, source of truth) and saves to the shared store (backup); one failing doesn't lose the answer. A second send adds another Form row (the Form can't update one). Stored on `selection/{cycle}` as `form` + `mirror`.
- **Guest passcode** (people without an APMES account; most feedback is anonymous): the sign-in screen has a passcode box. `POST /api/guest` (`worker/guest.js`, `apmes.anawj.com` only) checks it against the Worker secret `GUEST_PASSCODE` (never in this repo) and returns a Firebase custom token (claim `guest`, no email) signed with the secret `GUEST_SA_KEY` of a role-less service account. Rules (`isGuest()`): a guest reads rounds and photos and writes only `selection/{cycle}/responses/guest-<uid>`; `signedIn()` needs a verified email, so every other rule turns a guest away. The name is optional (blank sends "Anonymous"). A guest who signs in on another device is a new guest (a second response). Tries are capped at 10 a minute per address (`GUEST_LIMIT`). To change the passcode: edit the secret in Cloudflare; existing guests stay signed in until they sign out (close the round to stop answers).
- **Who can set up the round:** Admin staff, PDs and owners always can. Set up has a card to add or remove people who get only the app-level role "Applicants set-up" (`access/{email}.roles` contains `selection`; also a chip in People › Access). Rules `selStaff()`: that role writes rounds and photos and reads rounds, but not responses, the committee list or any other app. Owners and Admin staff edit the list (same rule as People › Access). The committee card stays with Admin staff and PDs, so the role can't be used to read answers.
- **Drafts and guests:** a draft is kept per sign-in on that device (`sel-ans-<cycle>-<email>`; a guest's email is `guest-<uid>`), and a response is the document `guest-<uid>`, so two guests never share or merge. The same person on a second device, or after clearing site data, is a new guest and their send is a second response.
- **Three passcodes, three roles** (`worker/guest.js`; Worker secrets, never in the repo): `GUEST_PASSCODE` signs in a guest who sends feedback; `SETUP_PASSCODE` signs in a set-up account (opens Set up: rounds and photos, like the "Applicants set-up" role); `COMMITTEE_PASSCODE` signs in a committee account (reads the Results: every response, who said what; sends nothing, changes nothing). The token carries `guest: true` and `role` (`guest`, `setup`, `committee`; none means guest). Rules: `isGuest()`, `isSetupCode()`, `isCommitteeCode()`. Neither of the last two can read residents, faculty or the committee list or grant roles. Anyone holding a passcode has that role: share them like keys, and change a secret in Cloudflare to stop new sign-ins (people already signed in stay in until they sign out). **To change one, use Set up › Sign-in passcodes** (Admin staff and PDs; owner, 18 Oct 2026: both may see and change them). Each is kept in Firestore `selectionCodes/{guest|setup|committee}` `{ code, updatedAt }` (rules: admins and PDs read and write; the Worker reads them with a service sign-in, a custom token with claim `codesReader` and no email, exchanged for an ID token with the public web API key in `wrangler.jsonc` vars, cached 15 s, so a change is live within seconds). A passcode set there **replaces the Worker secret of the same role**; a role with none set there still uses its secret, and if the store can't be read the secrets still work (so a Firebase or key problem never locks everyone out; it also means a retired secret works again during such an outage, so rotate the secrets too if one leaked). The page suggests a random `k7mq-x4ph-9d2t`, 6 to 100 characters, ignoring capitals and spaces, and refuses a repeat of another role's (the Worker picks the first match: guest, setup, committee). People already signed in stay in. `tools/set-passcode.sh` (run on the owner's computer) still sets the Cloudflare secret, the fallback. Passcodes are kept as plain text (the owner wants to see them), so treat the `selectionCodes` rules as the lock.
- **Set up is locked by default** (owner, 18 Oct 2026): it opens read-only (`<fieldset disabled>` around every card), and **Unlock to edit** enables it; it locks again after 5 minutes without use, after saving the round, or on **Lock**. The passcodes' Show/Hide works while locked. A new card goes inside `lockable(...)` in `setupScreen`, or it stays editable while the page is locked.
