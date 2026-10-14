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
- **PDs:** admins add and remove (`pds/{email}` → `{ name }`); PDs see the list. `cloud.listPDs / savePD / removePD`.
- No rules change: everything here was already allowed for admins and PDs (`logbook/firestore.rules`).
- No service worker (an online admin tool). `anawj.com/people/` redirects to `apmes.anawj.com/people/`.

## Linked from

- Logbook → Admin → "People (logbook and evals)".
- Evals → People: "Adding a yearly intake? Open APMES People".

## Not in it (on purpose)

- NUH roster staff: a different Firebase project and a wider set of people (its juniors come from the contact list).
- Prewarm study team: joins by code.

## Ideas for later

- Bulk status change (e.g. a whole intake to Graduated) and an "R5s this year" list before July.
- Faculty "last assessed" date from evals, to spot inactive assessors.
