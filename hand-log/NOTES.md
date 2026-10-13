# Hand log: notes

Hand surgery trainees log their DOPS (Direct Observation of Procedural Skills) and Mini-CEX (mini Clinical
Evaluation Exercise) assessments on their phone. Static app: no sign-in, no server.

## Principles

- **Data stays on the device.** Entries live in `localStorage` (key `handlog.entries`) in that phone's browser. Clearing
  site data or changing phone loses them, so the summary screen offers **Export CSV** (for spreadsheets/portfolio) and
  a JSON backup. Nothing is sent anywhere.
- **No names or patient identifiers.** Assessor is a free-text field for the trainee's own record; the case
  description must never carry patient names, NRIC, MRN or dates of birth. Say so on the form.
- **Forms live in `js/forms.js`** (items, domains, rating scales for DOPS and Mini-CEX). Change a form there, not in
  `js/app.js`.
- Phone first (390 px), NUHS-style top band and tokens from `../nuhsdesign/tokens.css`, `noindex` meta, offline via
  `sw.js` (network first; VERSION is stamped on deploy, don't bump it by hand).

## Speed of entry (13 Oct 2026)

- Remembers last assessor, setting and complexity (`handlog.last`); recent procedures in a "Recent" optgroup.
- "Rate all domains" buttons (`.quick-all`), auto-suggested global rating, big radio pills, sticky Save bar.
- Draft autosave per form (`handlog.draft.<type>`) with "Discard draft".
- "Log another like this" (`#log-again`) on an entry; big add buttons and a filter box (`#list-filter`) on the list.
- Feedback phrase chips (`.chip`) under each feedback box.
- Test note: the pill styling hides the radio input where the sticky bar takes the click, so `test/e2e.mjs` clicks
  radios in the DOM; each feature check skips if its element is missing.

## Files

`index.html`, `style.css`, `js/app.js` (hash routes `#list`, `#new-dops`, `#new-minicex`, `#entry/<id>`, `#summary`),
`js/forms.js`, `sw.js`, `test/e2e.mjs`.
