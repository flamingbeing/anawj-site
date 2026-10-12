# Prewarming study app status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-12 by Claude Code, Prewarming Webapp.

## Now

- **Claude Code, Prewarming Webapp** (branch `ccr-13264f37-d28edu`): bug hunt from 17:53 UTC 12 Oct 2026 (owner: at
  least 2 hours, anything that makes a missed variable likelier). Merged so far #257 #259 #261 #263 #265. Still to do:
  (this PR: duplicate Subject IDs flagged, storage-full bar, lock warning, join-code flake fixed). Next: more edge
  cases. Advise the owner not to lock patients during the study day. Real patients start 13 Oct 2026.

## Waiting on the owner

- Blank Word form uploaded (12 Oct 2026). Still to do: check one patient's Form view on a phone (Download Word file,
  Save as PDF / Print).
- Open the app once as admin with signal (resends every patient so older records get the `locked` flag) and take
  "Update available" on both phones.

## Next

1. Polish from the first day of real use (13 Oct 2026).
2. Export across hospitals for admins; a members' view of who entered what.

## Recently done

- #265: sync heals the server's last-write to the newest value; edits before sign-in resent; Save sends only changes and asks before overwriting the other phone's reading; clearing a time asks.
- #263: typed form answers checked; due alerts on every patient screen for every series; screen kept awake after app switches.
- #261: blank readings not saved, part-blank asks; Still to fill lists saved-with-blanks and columns hidden in Settings.
- #259: hidden follow-ups not exported, nested follow-ups hide, BMI worked out, NA warming start (no pre-warming), Subject ID / group correctable.
- #257: update reload asks before losing a reading; stray key-time taps ask; times out of order flagged.
- This PR: top-bar clock labelled "Time now".
- #255: time stays on the right when nothing is due.
- #252: BP, HR, BIS tick above Intra-op details; swipe to change tab; pull-to-refresh off.
- #251: tab "Others"; "Perioperative data" full width; Still to fill back to amber.
- #249: warming time boxes lavender (not beige) and Still to fill navy, so amber / orange / red only mean a timing alarm.
- #248: two tabs (Temperatures / BP, HR, BIS; other forms on the BP tab); sign-offs named by section with a tick box.
- #246: "Still to fill" checklist; Baseline / End readings due at In OT / Surgery end; Mark complete asks first.
- #244: "Study admins" card: admins add / remove admins by email (rules: create only, lower-case email id, no removing yourself).
- #241: stress-test fixes: past midnight, readings after surgery end, BP number checks, back button with an unsaved reading; `edge.e2e.mjs`.

## Decisions

- 12 Oct 2026: amber, orange and red are kept for timing alarms (warming boxes lavender); Still to fill stays amber (owner).
- 12 Oct 2026: top-bar clock reads "Time now".
- 12 Oct 2026: second tab renamed Others; Other data renamed Perioperative data, a full-width box.
- 12 Oct 2026: thermal sensation keeps carrying over like the rest (owner: no need to change).

- 12 Oct 2026: patient screen split into two tabs, Temperatures and BP, HR, BIS (other forms on the BP tab); Mark data collection as complete on both; section sign-offs named, ticked box once marked.

- 12 Oct 2026: admins manage admins in the app (all equal; nobody removes themselves).

- 12 Oct 2026: all remaining template data gets entry forms under "Other data" (small box beside Form view / Sheet view);
  "Spreadsheet view" is now "Sheet view"; vital-signs tick is automatic; the BP, HR, BIS box flashes like the due time.
- 12 Oct 2026: Other data is one page with collapsible headers, all open by default, built for keyboard entry on a
  computer (Enter and arrow keys); the Other data box has no caption.
- 12 Oct 2026: no auto-save for readings (Save confirms carried-over values; Firebase use isn't the reason); instead
  ask to save when leaving a reading with changes.
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
