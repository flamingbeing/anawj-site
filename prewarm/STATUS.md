# Prewarming study app status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-12 by Claude Code, Prewarming Webapp.

## Now

- **Claude Code, Prewarming Webapp** (branch `ccr-13264f37-d28edu`): nothing half-done. Last change (this PR): Other
  data pages, Sheet view rename, vital-signs tick, BP / HR / BIS box warms up. The owner and their MO start using the
  app on real patients on 13 Oct 2026.

## Waiting on the owner

- Upload the blank paper form (.docx) on the admin screen, then check a patient's Form view on a phone (Download
  Word file, Save as PDF / Print).
- Open the app once as admin with signal (resends every patient so older records get the `locked` flag) and take
  "Update available" on both phones.

## Next

1. Polish from the first day of real use (13 Oct 2026).
2. Export across hospitals for admins; a members' view of who entered what.

## Recently done

- This PR: "Other data" box (pre-op, meds, bloods, day 1 and 2 chart review and analgesia, discharge: every remaining
  template field as a form); Spreadsheet view renamed Sheet view; Word form's "Vital Signs Data Collected" ticks
  itself once any BP / HR / BIS value is in; the BP, HR, BIS box warms up and pulses like the due time.
- #229: due time warms up (soon / now / late) and pulses. #228: warming boxes plain until set; room temp 20.
- #227: time boxes numbered 1–11. #223–#226: warming labels (Prewarm on / off, Underbody warm, Gown warm), beige.
- #222: locked patients hidden from team phones (rules + query, `locked` flag). #221: read only for admins, lock icon.
- #220: fix: lock / unlock / delete wiped readings on the server copy (empty `f` merge); one-off resend repairs.
- #219: admins lock patients. #218: last synced line. #216: Log out (deletes the phone's patients, warns if unsynced).
- #211–#215: Word form filled in (admin uploads the blank), delete participants page, complete marker, warnings.
- #205–#209: NUHS app theme, one-screen main screen, timer and Log next event, ‹ › timepoints, screen size.

## Decisions

- 12 Oct 2026: all remaining template data gets entry forms under "Other data" (small box beside Form view / Sheet view);
  "Spreadsheet view" is now "Sheet view"; vital-signs tick is automatic; the BP, HR, BIS box flashes like the due time.
- 12 Oct 2026: warming labels Prewarm on / off, Underbody warm, Gown warm; light grey until tapped, beige once set; times numbered; room temp 20.
- 12 Oct 2026: locked patients are hidden from team phones completely (rules + query); admins see them read only.
- 12 Oct 2026: admins lock patients from the home page (select, all but latest); locked = nobody opens them.
- 12 Oct 2026: Log out (deletes the phone's patients, warns, warns again if unsynced) replaces Stop sharing. Join links sent
  to the teams and working (owner).
- 12 Oct 2026: completed patients warn before opening; Export Excel moves to Settings.
- 12 Oct 2026: Cloudflare PR previews fixed by the owner (build settings); main copy at
  anawj-preview.kohwenjun.workers.dev.
- 12 Oct 2026: "Mark data collection as complete" (one per patient) replaces the main screen's section mark; shown at the
  top of the main screen and in the patient list.
- 12 Oct 2026: delete participants only from Settings → Delete participants; every reading entered live by default.
- 12 Oct 2026: Log button (next event), ‹ › timepoints, squarer time boxes, Mark section complete at the bottom, tap an
  empty temperature card for 36.5, running timer and next event in the app bar.
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
