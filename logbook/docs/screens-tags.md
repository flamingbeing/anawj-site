# Logbook screens: tag editor, labelled parts, limits

Part of the logbook working notes; index in [../NOTES.md](../NOTES.md). Where things are (screens), part 5.

- **Tag editor** (`ui-settings.js`): List | Pills (drag; hold on phones; the dragged copy is lifted above the finger,
  a bar or highlight shows the drop spot, a label at the top says "Before/After/Under …", vibration on Android), search, case counts, edit
  dialog (name, long name, sits under, counts towards, shorthand with built-in defaults and words
  learned from your cases, hide, merge), Tag groups card, then a "Tag list file" card at the bottom (CSV download / load, Reset). The last tag or header tapped (list or pills) is marked; a new one goes right after it (`tev.last`); a new tag group goes after the last one edited.

- **Labelled parts and case template** (Settings → Advanced logging → "Labelled parts and template"; account
  settings `labelParts`, `partLabels`, `caseTplOn`, `caseTpl`, all off by default; rules in `parts.js`, screens in
  `ui-parts.js`, plan in `PLAN-labelled-parts.md`). A line starting with a label and a colon (`lp:`, `Plan:`,
  `ASA 2:`, also `**PE:**` and `- Plan:`; case doesn't matter, the colon is required so "LP" alone, lumbar puncture,
  never matches; `lp1:`/`lp 2:` numbered) starts a part, up to the next label; text before is the main part. The text
  is stored exactly as typed (no new case field, no rules change). Defaults `lp` (Learning point; also "learning",
  "learning point(s)") and `dt` (Case details); people add their own (word, shown-as name, other words, hide in
  lists). Uses: bold labels on Logbook rows (a label hidden in lists is left out of rows only), a read-back under the
  case box ("Parts ASA · Plan") and marks in the box, "Has <label> (n)" in the Logbook filter's Show list, `has:lp` in
  the search (plain search, or as an Advanced search operator), the **Learning points** page (`#points`, under the
  Logbook; link in Filter: every part of one label, newest first, Copy all, tap opens the case), Settings → Markdown →
  "Bold labels" (`markdown.boldLabels`: `**Learning point:** …` in `{{details}}`, via `mdCtx().labels`). Learning
  points never feed tag suggestions or shorthand (`suggestText`). The case template goes into an empty case box on
  focus (cursor after the first label, or on an empty first line), goes again on blur if untouched, and template lines
  left as they were are dropped on save (`stripTemplate`), so a bare template saves nothing and isn't kept as a draft;
  an untouched label line that heads lines typed under it (`Plan :` then `- spinal`) is kept, so those lines keep their
  part. A box holding only the template counts as empty for tag groups (their text goes on the empty first line or
  above) and Same as last (procedure on line 2, template lines kept). Same as last takes only the main text when
  labels are on. "Bold labels" writes the word as typed (`**Learning:**` stays `Learning`; a bare key like `lp` shows
  its name). A label's own word always beats another label's "also" word.
- **Pasted lists** (Case → List): with labelled parts off, exactly as before (blank lines split cases). With it on: a
  bold first line (`**AB 72M lap chole**`, also after a list mark) starts a case and loses its stars, but inside a case
  only a wholly bold line does (a bold word for emphasis stays); a bold label (`**Plan:**`) never does and is kept as
  `Plan:` (the export adds the bold back when asked); a block that starts with a labelled line after a blank line joins
  the case above, unless the label is `dt` or the case above already has that label.
- `has:` is a search operator only with labelled parts on; with it off it is plain text and the box says so.
- **2000-character limit** (`details` in `firestore.rules`): a case, a pasted row or an edit over it is never cut off
  silently. The box and the review table say how far over; Save asks, then keeps the first part in the case (cut at a
  line break or space, `splitOverflow`) and puts the rest in a note linked to it ("Rest of the case · AB", Notes'
  100-note limit checked first). "Plan for later" refuses a long row (planned cases can't carry a note).
