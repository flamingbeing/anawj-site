# APMES People

One place for the people lists the logbook and evals share: residents, faculty, programme directors (PDs) and
applications to join. Admins and PDs only. At `apmes.anawj.com/people/` (`?demo` for made-up people).

## Why it exists

The lists already live once, in the logbook's Firebase project (`apmes-logbook`): `residents/{rid}`, `faculty/{email}`,
`pds/{email}`, `applications/{uid}`. Logbook and evals both read them, so someone added once is on both apps. What was
missing was one obvious screen to keep them, and an easy way to add the yearly batch of residents (owner, 13 Oct 2026).

## How it's built

- No code of its own for storage or sign-in: it imports evals' `cloud.js`, `ui-core.js`, `engine.js` and the People
  panes in `ui-admin.js` (`residentsPane`, `facultyPane`, `applicationsPane`), and evals' `style.css`. A change to those
  shows here too, so run `node people/test/e2e.mjs` after changing them.
- `js/batch.js`: the new parts, free of page code (unit tests in `test/batch.test.mjs`):
  - **Add a new intake** (`parseIntake`): one intake year for the whole batch; paste `Name, email`, `Name <email>` or
    two spreadsheet columns; an ID at the start of a line is kept, otherwise the next IDs are given in order. People
    already listed are skipped. Residency year is left to the intake (moves up each 1 July) unless fixed by hand.
  - **Year check** (`yearIssues`): active residents whose year won't look after itself: a year set by hand that
    disagrees with the intake, a set year with no intake (never moves up), no year at all, or an intake that puts them
    past R5 (graduated?). Each has a one-tap fix where the answer is clear.
  - **Export CSV** (`peopleCSV`): everyone on one sheet with a `list` column (resident / faculty / pd).
  - **Import from the monthly roster** (`#roster`; `parseRosterList`, `rosterChanges`, `itemPatch`; owner, 16 Oct 2026):
    NUH Junior Monthly keeps every resident's grade month by month, so its staff list brings the years here up to date.
    "Get the list" opens it in a new tab with `?send=apmes`; it asks there, then sends names, grades and start/leave
    dates back by `postMessage` (only from `nuhjuniormonthly.anawj.com` or this origin) and closes. Fallback: its More ›
    Export › Copy the staff list for APMES People, pasted here; the department sheet's whole grid tab pastes too.
    Grades: RES1–RES3 are R1–R3, R/SR is R4 or R5 (the user picks; R3 now suggests R4), AC means graduated; other
    grades (MOPEX, RR, NHG, Fellow, consultants) are ignored. Years are compared on the 1st of the roster month and
    fixed through the intake (`rYear` cleared), so they keep moving up each July.
    The staff list's grades are only as current as the roster app's People › Staff: since #703 its sheet import moves
    people to the group the month's sheet shows (ticked in its review, newest month only), so import the new month there
    first (after July, the new July tab), then send the list here.
    Matching is by name (the roster has no emails): the same words in any order, or one name's words (two or more) all
    in the other, and only when there is one candidate both ways. Anyone else on the roster is listed as new: the user
    says who they are (similar names first) or adds them with their email. Ticked by default: year changes and
    graduations; not ticked: back from Graduated/SMO, SMO years, R4 or R5 not picked. Active residents not on the
    roster are listed for information only. Nothing is saved until Apply and its confirm.
- **PDs:** admins add and remove (`pds/{email}` → `{ name }`); PDs see the list. `cloud.listPDs / savePD / removePD`.
- No rules change: everything here was already allowed for admins and PDs (`logbook/firestore.rules`).
- No service worker (an online admin tool). `anawj.com/people/` redirects to `apmes.anawj.com/people/`.

## Roles (`access/`; rules in `logbook/firestore.rules`, tests `people/test/rules.emulator.mjs`)

Owner, 17 Oct 2026: roles are edited in the app, not in the Firebase console or by hand. `access/{google-email}` = `{ email, name, roles, updatedAt,
updatedBy }`, roles from `owner`, `admin` (Admin staff), `pc` (programme coordinator, same powers as Admin staff) and `pd`. A role there counts
like the older lists (`owners/`, `admins/`, `pds/`), which still work; retiring them is a later, planned job.
- Owners grant and remove anything. Admin staff and PCs grant admin, pc and pd but never owner, and never change their own record.
  Nobody drops their own owner role or deletes their own record, so an owner always remains. A PD cannot grant roles.
- `accessLog/{id}` `{ by, to, change, at }` is append-only (the app writes it in the same batch as the grant); readable by Admin staff,
  PCs and owners.
- Faculty records also take optional `core`, `ccc` (booleans) and `workEmail`.
- **People › Access is built** (17 Oct 2026, taken over from the CCC 360 session's checkpoint #752): `people/js/access.js` (pure logic, `mayChange`
  mirrors the rules) and `access-ui.js`. A list of people with role chips (owners/Admin staff/PCs edit, PDs look), Add / edit / remove, "Paste
  people" (pick a role; each line is matched by sign-in email, work email or name and shown before anything is saved), "Paste a list to tick"
  (Core faculty or CCC members, faculty list only, nobody is unticked) and "Recent changes" (the access log; owners/admins only). The Faculty form
  also has Work email, Core faculty and CCC member. `cloud.getRoles` now also reads `access/{email}` and `owners/{email}` and returns
  `owner` and `pc`; `listAccess`, `saveAccess`, `removeAccess` (each with its log entry in one batch) and `listAccessLog` are in `evals/js/cloud.js`,
  with a demo twin in `demo-backend.js` (demo users `staff` = Admin staff, `pdonly`; the demo admin is also the owner). Roles still on the older
  lists (`owners/`, `admins/`, `pds/`) work but are not shown there; moving them across is the later "retire the old lists" job.

Lessons (Access): the demo twin (`evals/js/demo-backend.js`) must use one `adminEmail`/`pdEmail` helper everywhere; a role kept only in `access/`
failed `listFaculty` until every `s.admins[...]` check went through it. In e2e, a hash-only `goto` does not reload, so a closing dialog can
still be in the page: pick elements by class, not by text alone.

## Rotations (read-only; owner, 16 Oct 2026)

People › Rotations shows the department's master block rotation sheet (an .xlsx downloaded from Google Sheets) as a week by
week grid, a person's weeks per posting across the year tabs, and people per posting per week. Plan and decisions: the owner's private notes. The sheet's real details (names, the code key's answers) are in the owner's private notes.

- `js/rotations.js`: the reader and the code key, free of page code (`test/rotations.test.mjs`). `js/rotations-ui.js`: the
  screen. Everything happens in the browser; the file is not uploaded or saved, and the sheet is not changed. Only admins
  and PDs can open People, so only they see it (faculty and juniors are turned away at the door).
- ExcelJS is loaded from `../logbook/vendor/exceljs.min.js` (same host), not copied again.
- The tab layout: row 1 a date in the first column of each month, row 2 a week label (`13-19`, `3*-9` star = a holiday, `31-6`
  across a month; the first may carry a note in brackets, some a note before the range, so the last `d-d` in the label is
  the range). Column A names and section labels (SR2 RESIDENTS … CA1 Residents, FELLOWS, MOPEX, External Residents);
  names are repeated inside the grid, and for External Residents that repeated cell is where the person comes from (ED,
  SIG, TTSH…). "TOTAL PROJECTED MANPOWER" ends the people. Weeks usually start on a Monday; one after a holiday or a
  changeover starts midweek. Tabs before 2024-25 are not read (other layouts, notes in the week columns); a tab with fewer
  than 40 weeks or many midweek starts is listed as not read.
- Notation: a `-E` suffix is the elective version of a posting (not always at the base code's place); a `KIV` prefix means
  provisional; a slash joins two codes in one week (the first counts in the totals; resolve each by hand). Case and a
  trailing dot are forgiven for codes of four letters or more (`PART B`, `ICU.`), not for short ones (`C-e` is the echo
  week, `C-E` an elective). A bare number in a week cell is a count, not a posting. Codes not in the key are listed under the grid.
- The code key (`CODE_KEY`: institution, type, meaning) comes from the owner's answers to a "Rotation Code Key" page, with
  names and hedges removed. Add a code there when the sheet gains one.
- **Hand-off to NUH Junior Monthly** (the roster app pulls): Postings › Pull from APMES People… in that app opens
  `people/?pull=rotations#rotations`. People says hello to the tab that opened it (`people-pull-hello`); the roster app
  answers `nuhjm-pull-info` (its staff names, the posting codes it accepts, the first and last Monday shown). With a sheet open,
  People lists who on the sheet has a critical posting in those weeks (`CRITICAL`: ICU, C, C-e, C-p, OGDF, OGNF1, OGNF2, and
  only those the roster accepts) and the user links each sheet name to a roster name (a suggestion is made only when one name
  fits best, `suggestLinks`; "Not in the roster" is a choice too). Links are kept in this browser (`people-rot-links-v1`, names
  only). KIV cells and electives (`-E`) are left out unless ticked. Only after Send does `people-rotations` (the paste text,
  `exportRotations`) go to the opener, and the roster app opens its Paste rotations box with it: nothing is applied until Apply.
  Both ends check the origin (the other app's address, or their own on previews and tests). Test: `people/test/e2e.mjs` 6d.
- **Hand-off to the NTF roster** (same pattern, `?pull=ntf`, hello answered with `ntf-pull-info`: names, first and last Monday,
  month): sends where each person is each week instead of a code list (`exportPlacements`, `placementOf`): `NTF`, `NUH`, `KKH`,
  `TTSH`, `OTH` (another hospital) for a posting, `AL`/`ML`/`NPL`/`NS` for leave (SAF is `NS`). Left out: exam weeks (Part A, B,
  C; owner, 18 Oct), OG1 and OG2 (no use in the monthly rosters, for now; `NOT_SENT`), KIV cells, electives, tags and cells
  outside a hospital. For a two-code cell the first decides; Prep still counts as a NUH posting. Each app is trusted
  only at its own address and has its own saved links (`people-rot-links-ntf-v1`). The NTF roster's end (ask, paste, apply)
  is a separate change. Test: `people/test/e2e.mjs` 6e.

## Linked from

- Logbook → Admin → "People (logbook and evals)".
- Evals → People: "Adding a yearly intake? Open APMES People".

## Not in it (on purpose)

- NUH roster staff: a different Firebase project and a wider set of people (its juniors come from the contact list).
- Faculty from the monthly roster: it has no consultants (they're left off the junior roster) and no emails.
- Prewarm study team: joins by code.

Plans, permissions decisions and ideas for later: details in the owner's private notes.
