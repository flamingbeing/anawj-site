# Prewarming study app status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-13 (late night) by Claude Code, Prewarming Webapp.

## Now

Each session keeps its own line in `status/<session>.md` (`webapp.md`; a new session adds its own file), so sessions never
edit the same lines. Read them all before starting; edit only yours.

## Waiting on the owner

- Blank Word form uploaded (12 Oct 2026). Still to do: check one patient's Form view on a phone (Download Word file,
  Save as PDF / Print).
- Add `admins/kohwenjun@gmail.com` (lower case, any field) in the Firebase console for `prewarm-study` if it isn't there:
  the app said that email isn't on the admin list. Then tap Refresh now in Settings. Then set a password (Settings →
  Password, after one emailed-link sign-in).
- MOVE MERGED (#364, #382, 13 Oct night) and CHECKED on the owner's phones (old nurse link, admin password sign-in, team phone moving and rejoining, synced reading). Homepage session told. Nothing open.
- PACU link (13 Oct): the old link's saves were refused ("Not allowed"); cause unknown (live rules = repo rules; record deleted). The NEW link works (owner tested). Practice: fresh link per patient, test once on a phone that isn't on the team. Revisit only if it recurs.
- Firefox phone stuck on an old version: open `anawj.com/prewarm-update/` once and tap Get the latest version.
- Say if the export should show "NA" in the later pre-warming cells (past 10 / 30 min) and the two empty Downloaded columns.
- Open the app once as admin with signal (resends every patient so older records get the `locked` flag) and take
  "Update available" on both phones.

## Next

1. Polish from the first day of real use (13 Oct 2026).
2. Export across hospitals for admins; a members' view of who entered what.

## Recently done

- #382, #381, #364: move to prewarmstudy.anawj.com (old address moves a phone only when nothing is waiting; join code and initials carried; `update.html`); admins can pick their hospital; update.html on nuhsdesign.
- #339: list tools: Form view icon per line (admin), Select to export, Select none apart from Lock; Downloaded dropped; "Study IDs only" line removed.
- #336: sync status chip replaces the Log shortcut in the app bar (tap = Refresh now).
- #335: "Subject ID:" label in lists and the header.
- #334, #333, #332, #331: bare time no longer keeps an empty point; read-only sections hide empty times; update helper `prewarm-update/`; Refresh now; "Readings to enter live" removed.
- #330, #329, #328, #327: admin password sign-in; carried-over values light grey; Perioperative data split into Pre-op / Day 1 / Day 2; last warming reading completes pre-warming.
- #326, #324, #323, #322, #321: update check every 10 min; Save with all blank removes the reading; alarm tap goes to the screen only; list ticks read only.
- #317: PACU nurse link (QR code + link; `pacu/{token}` rules, 24 rules tests, two-phone sync test).
- #316: progress ticks on the main page; Perioperative data complete tick.
- #315: number and time pads; alarm / countdown tap opens the reading; PACU in / To ward on the PACU page only.
- #314: Core (spot on) wide, one-tap typing, skin default 31, Clear, carry-over from pre-warming, Arrival / Induction labels, BP alarm toggle (off).
- #300: AGENTS: merge by the PR number returned at creation (a guessed number merged another session's #295 early;
  logbook tests on main pass afterwards).
- #298: no BP, HR, BIS alarm (banner, beep, buzz); temperatures and Prewarm off still alarm.
- #296: prewarm tests in parallel; `tools/test-prewarm.sh` (~1½ min, was 5).
- #294: sections marked complete are read only until undone (asks); temps ticks on their own sub-tab.
- #292, #293: PACU in / To ward on the PACU page; temps complete ticks; PACU view button beside New patient.
- #291: three bordered parts, swipe in the middle only, tab "BP, HR, BIS", Reset this subject (asks twice), PACU view.
- #290: key times on top, tab bar under them, same bottom part on both tabs; no-pre-warming Pre-warming tab.
- #285: unsaved readings come back after the phone closes the app; toasts no longer block taps.

## Decisions

- 13 Oct 2026: prewarm is served at prewarmstudy.anawj.com; moves happen between cases only and only for a phone with nothing waiting (owner); the PACU nurse link is tested once per patient by a non-team phone.
- 13 Oct 2026: no Log shortcut: the bar's top-right is a sync status chip; key times are set from their pads (owner).
- 13 Oct 2026: Save with every box blank removes the reading; later warming points (past 10 / 30 min) are dropped once that last reading is saved; sections marked complete show only timepoints that have readings (owner).
- 13 Oct 2026: admin sign-in by email + password as well as the emailed link; Google stays off (phone browsers block its helper page).
- 13 Oct 2026: Perioperative data is three pages (Pre-op and patient details, Day 1, Day 2 with discharge), each with its own complete tick (owner).
- 13 Oct 2026: PACU nurse link = a secret link (no sign-in); anyone with it can edit only that participant's PACU answers until it is stopped (owner chose this over joined-phones-only).
- 13 Oct 2026: timepoint labels read Arrival, Prewarm on / Induction, then "5 min" (owner); skin temperature starts at 31; one tap on a number opens the pad; BP, HR, BIS alarm is a Settings toggle, off by default.
- 13 Oct 2026: a section marked complete is closed for everyone until its tick is undone; data collection complete closes the op-day screens, not Perioperative data (owner).
- 13 Oct 2026: no alarm for BP, HR, BIS; their due times still show in the top bar and tab (owner).
- 12 Oct 2026: PACU view for the PACU nurse; PACU in / To ward on the PACU page; Reset this subject asks twice (owner).
- 12 Oct 2026: intra-op time 0 is induction; no-pre-warming group keeps a Pre-warming tab saying so; times on top, tab bar below, shared bottom part (owner).
- 12 Oct 2026: amber, orange and red are kept for timing alarms (warming boxes lavender); Still to fill stays amber (owner).
- 12 Oct 2026: top-bar clock reads "Time now".
- 12 Oct 2026: due alerts for other patients only once opened on this phone (a teammate's synced patient doesn't beep).
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
