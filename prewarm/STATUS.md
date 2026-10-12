# Prewarming study app status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-12 by Claude Code, Prewarming Webapp.

## Now

- **Claude Code, Prewarming Webapp** (branch `ccr-13264f37-d28edu`): bug hunt 17:53 to 20:45 UTC 12 Oct 2026 done
  (#257 to #285). Nothing half-done. Owner answered: intra-op time 0 is induction; no pre-op
  temperatures for no pre-warming (tab kept, says so). Advise: don't lock patients during the study day;
  set both phones' clocks to automatic; check +/− and the iOS time wheel on a real phone. Real patients start 13 Oct 2026.

## Waiting on the owner

- Blank Word form uploaded (12 Oct 2026). Still to do: check one patient's Form view on a phone (Download Word file,
  Save as PDF / Print).
- Open the app once as admin with signal (resends every patient so older records get the `locked` flag) and take
  "Update available" on both phones.

## Next

1. Polish from the first day of real use (13 Oct 2026).
2. Export across hospitals for admins; a members' view of who entered what.

## Recently done

- Layout: key times on top, tab bar under them, same bottom part on both tabs; no-pre-warming Pre-warming tab.
- #285: unsaved readings come back after the phone closes the app; toasts no longer block taps on Log / tabs.
- #283, #284: two patients at once: home list shows each one's due reading; alerts cover patients opened on this phone.
- #282: a reading due now on the other tab shows in the top bar too.
- #281: reading opens on the latest due unsaved timepoint; early saves ask; numbers shrink to fit; arm 3 pre-warming hidden in exports.
- #280: double taps locked out; typed temperature kept when the screen redraws; banner floats under the bar.
- #276: warming yes / no follows its logged start time; saved No after the start flagged.
- #275: Prewarm off due alerts; alerts due together share one banner; AF specify as New onset / Existing.
- #273: deleted patients can be restored; a deleted patient can't be charted into.

## Decisions

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
