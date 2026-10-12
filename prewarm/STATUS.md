# Prewarming study app status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-12 by Claude Code, Prewarming Webapp.

## Now

- **Claude Code, Prewarming Webapp** (branch `ccr-13264f37-d28edu`): app-theme restyle, one-screen main screen,
  screen-size setting (PR open). Then the Word-form Form view (Next, item 1).

## Waiting on the owner

- Send each hospital team its join link (admin screen → Share join link), privately; test with a second phone.
- Cloudflare previews: builds for #199 failed instantly with no log and were filed under "production/builds", not
  branch previews. Check the anawj-preview Worker's build settings in the Cloudflare dashboard.

## Next

1. **Form view from the real Word form** (owner, 12 Oct 2026). Use the paper data collection form v3.2 (.docx, 14
   pages) as the base and only put text in it: values on the blank lines, ☐ → ☒ for chosen options, every page kept
   (unfilled ones blank). Decisions:
   - **Template stays private:** an admin uploads the blank .docx once from the admin screen; it's stored in the
     study's Firebase (≈245 KB, so base64 in one document under 1 MB, or chunked) and only members/admins can read it.
     Needs a rules change + emulator tests. Strip `docProps` (creator, lastModifiedBy, company) on upload. Never commit
     the form to the repo (staff name in its file details).
   - **Outputs:** "Download Word file" (filled .docx, exact formatting; JSZip is vendored in `logbook/vendor`) and
     "Save as PDF / Print" (render the filled .docx in the app, e.g. vendored docx-preview, then the browser's print).
   - The form's thermal sensation image is the −3 … +3 scale already used; it also holds an MME conversion chart.
   - The current HTML Form view (#201) stays until this replaces it.
2. Export across hospitals for admins, a members' view of who entered what, polish after phone testing.

## Recently done

- #201: NUHS design system look; printable HTML Form view (4 day-of-surgery pages); Save as PDF / Print.
- #199: join links and QR codes, hospital read from the code, comfort questions on the main screen, Spreadsheet view.
- #198: admin sign-in by email link (owner signed in and made the NTF code).
- #197: main screen = times + all temperatures + links; rules first deployed to `prewarm-study` (run #19).
- #196: sharing (join code per hospital, Firestore sync, rules, admin screen).
- #194: study hospitals (NTF, NUH, SGH, CGH, TTSH, KTPH, WH).
- #193: Firebase web config for `prewarm-study`. #192: plan and the offline op-day app.

## Decisions

- 12 Oct 2026: NUHS app theme (design system artifact, kr-app); main screen fits one phone screen; Delete moves to the
  Spreadsheet view; Screen size setting (per phone, Normal by default).
- 12 Oct 2026: Form view should be the Word form itself, filled in; the blank form is uploaded by an admin (private),
  outputs Word download + PDF/print.
- 12 Oct 2026: NUHS design system look (as evals); "Form view" = paper-form layout, "Spreadsheet view" = grid.
- 12 Oct 2026: comfort questions on the main screen (pre-op top, post-op bottom); hospital comes from the join code.
- 12 Oct 2026: keep 8-character codes; teams join by link or QR instead of typing (4 digits too easy to guess).
- 12 Oct 2026: admins sign in by email link, not Google (phone browsers broke the Google pop-up).
- 12 Oct 2026: main screen = event times (compact) + all temperatures, links to other forms in fill-in order; empty
  temperature taps to 36.5, empty time taps to now.
- 12 Oct 2026: scope is op-day bedside data; template timepoints; intraop 0 min = induction; entry screen option B;
  join code, new Firebase project, several hospitals; group shown only on the pre-warming screen; Subject ID in the
  Enrollment ID column; vitals baseline-only by default; keep data until the study ends. Full list in `PLAN.md`.
- 12 Oct 2026: Firebase project `prewarm-study` created by the owner; `firebase-rules-deployer@apmes-logbook` has
  Firebase Rules Admin on it.
