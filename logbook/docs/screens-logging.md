# Logbook screens: Add tab and logging

Part of the logbook working notes; index in [../NOTES.md](../NOTES.md). Where things are (screens), part 1.

- **Show tips and help text** (Settings → Logging, `settings.hideTips` true = off): an experienced-user mode. Off adds
  `body.no-help`, hiding every `.help` explanation (mark new how-to paragraphs `class: 'hint help'`) and the tag tips.
  The inline privacy and safety notes (reflection editor, photo rules) are `.help` too (owner). Status lines, the
  ID-number check, the delete-account warning and the Privacy card on More stay.
- **Case** tab (id `log`, `ui-log.js`; the bar label was "Log"): the case box (aligned example lines; Paste button; "Draft saved" sits on the
  Interesting line), Quick picks (suggestions + your shorthand tags, Same as last, your tag
  groups), All tags, Still needed, "Save these tags as a tag group" under the tag list, pinned bar (chosen tags, Save, keep date | Save).
  Paste-a-list (List mode), Plan for later. `editCaseDialog` (full screen on phones, pinned
  Delete/Cancel/Save, 6-line growing box, Tags + "Add tags"; also "New case" from the reflection picker).
- **Logging preferences**: First field (Case summary by default, Initials or Date) is per device (`display.firstField`). Initials adds an optional input before the case box; Enter moves to the summary. Opening Case and saving focus the chosen field. `settings.detectAgeSex` is on by default: off hides the age/gender preview and stops age-based suggestions in Case and List review, while preserving text and manual/keyword tags. Case/List examples follow autodetection and the separate initials field without changing typed text. `M` and `m` both mean male in years (`6m` = six-year-old male, `3m` = three-year-old male); use `mo` for months (`3mo` = three months). Unambiguous compounds such as `2m2w` retain months + weeks.
- **Enter key** (Settings → Logging, `settings.enterMode`): New line (default; Ctrl/Cmd+Enter saves), Press Enter twice
  (Enter on an empty line saves; also via beforeinput for phone keyboards), or Enter saves. Old `enterSaves` = single.
  A no-tag save highlights suggestions and offers the confident ones (score >= 0.5, `logging.js` `STRONG`, the same
  line as "+ All" and a pasted list; weak guesses are never counted without a look); a second Save (the button, an
  additional Enter in the box, the third Enter in double-Enter mode, or Enter in the empty tag search) accepts them
  and saves. This requires suggestions to be on. Editing or manually selecting tags cancels the offer; Shift+Enter
  remains a new line and holding Enter never accepts it (key repeats are ignored, also in the tag search). A Save tap
  within 600 ms of a tap that made the offer is a double tap and is ignored, so the hint shows first. Enter in the empty tag search
  saves the case only in Basic (which, with no suggestion row, sends the focus there) or while an offer is pending;
  elsewhere it does nothing, as before.
- **Add tab parts** (`settings.caseHide`, and Basic's `basicOn` `case:<part>`): `sugg` (the suggestion row) and
  `recent` (Same as last, tag groups) used to be one part, `quick`; an older `quick` still means both and is
  rewritten as the two on the next change (`logging.js` `expandParts`). Basic hides both unless turned back on.
  The profile switches are `case:sugg` and `case:recent` (profiles.js reads an older `quick` in `caseHide`,
  `basicOn` or `show['case:quick']` as both).
- **Logging extras** (account, off / default as before): `settings.autoTick` ticks the confident suggestions as you
  type; they follow the text, and one the user unticks stays off for that case (`draft.auto` / `draft.rejected`,
  kept through Undo after Save and Undo after clearing the box).
  `settings.recentCount` (1 default; 1, 2, 3 or 5, other values snap to the nearest: `logging.js` `recentCount`) Same as last chips. A date chip tap refocuses the box only when it
  had the focus. A pasted list ticks your own tags from their shorthand, with what they count towards.
- **Typing cost**: the draft is stored 300 ms after the keys pause (and at once on pagehide, hidden, hash change);
  the box's marks copy its style only on resize (ResizeObserver) and redraw in the next frame; per key only changed
  text is written; a tag tap updates the list in place (`picker.sync`); `PROGRESS_BY_CODE` is memoised on
  `S.counts`; a write's state change that leaves the list as it was doesn't recount. Benchmark:
  `PORT=8080 node logbook/test/e2e/bench-logging.mjs` (Chrome busy time; numbers in the 13 Oct 2026 PR).
- **Two panes** on the Add tab at >= 840px wide and >= 500px tall (tablets, unfolded foldables, computers; not
  landscape phones): `.log-card.panes` grid, left = date, case box, quick picks, Still needed, Save; right = all tags
  (sticky, own scroll). On phones `.lp-left` / `.lp-right` are display: contents, so the order is unchanged.
- **Form view** (More → Form view, `#formview`, `ui-formview.js`): the old APMES Case Numbers Google Form's layout for residents
  moving to the logbook: Resident (the signed-in resident, read only), Date, Initials and case details, the 46 categories as
  checkboxes (all required, as in the Form), then "Your response has been recorded" with **Edit your response** (the form
  filled from the case; saving updates the same case) and Submit another response. It saves through `createCase` /
  `updateCase` (the Add tab's path: same ID-number and double-entry questions, sync, sheet outbox), source `app`. Nothing
  goes through the Form inbox, so there is nothing to pick up, clear or drift-check. Test: `test/e2e/formview.mjs`.
