# Plan: labelled parts in the case summary (LP:, DT:)

Status: **built on branch `wt/labelled-parts` (13–14 Oct 2026, wave 2 track F)**: parser, switch, editable labels, rows,
read-back, the filter chip and `has:`, a Learning points page, Bold labels in Markdown, a case template and pasted
lists split by bold first lines; all off by default. What it does now is in `NOTES.md` ("Labelled parts and case
template"). Defaults chosen for the open questions: the cap stays 2000 (the rest of a long case goes into a linked
note, asked first; no rules change); the filter chip is in; `lp:` plus `lp1:` count as separate points in order.
Still to do from this plan: the reflection pre-fill (step 2) and the `{{main}}`/`{{lp}}` format tokens. Secondary goal behind it: the logbook should also suit non-APMES logging, and
the owner's daily habit is writing learning points in the case summary.

## The idea

One summary box stays one box. Labelled parts inside it are read when the option is on:

- `dt:` the fuller case details (for a reflection's "Case details").
- `lp:` learning points as one block (free text in a reflection).
- `lp1:`, `lp2:` … separate learning points (numbered points in a reflection).
- `Learning:` and `Learning points:` also count as `lp:`. Not "LP" alone: that is lumbar puncture. The colon is required;
  case doesn't matter.

A marker starts a part, which runs to the next marker or the end. Text before the first marker is the **main** line (what
the case summary is today). Nothing is stored separately: the text stays exactly as typed, so backups, Excel and CSV
round-trips are unchanged. If `lp:` and `lp1:` both appear, `lp:` counts as the first point, then `lp1:`, `lp2:`.

**One switch** (account setting, Settings → Advanced logging, Case tab group; off by default): "Read labelled parts in the
case summary (LP:, DT:)". Off = plain text everywhere, as today. Turning it on picks up markers already in older cases.

## Where it applies

Reads only the main line (so a learning point that says "spinal" never adds a Spinal tag or teaches wrong shorthand):
tag suggestions (`suggest`), learned shorthand (`tags.js` `learnShorthand`, `caseWords`), the diagnosis line of a new
reflection (`procedureText`), the "labour" check in `suggestHeadings`, and the Logbook row's main text.

Uses the parts:
- **Rows:** the main line, then a "Learning" line.
- **Case tab read-back:** "Learning points: 41 characters", so the owner sees the marker worked.
- **Reflect from a case** (`fromCase` in `ui-reflect.js`): `dt:` → Case details (else the main line); `lp:` → free-text
  learning points; `lp1:`, `lp2:` → numbered points, one each. A copy at creation only; an existing reflection is never
  overwritten and later edits to either side don't sync.
- **Copy / Share / Markdown formats:** `{{case}}` stays the full text (nothing silently dropped); new tokens `{{main}}`,
  `{{dt}}`, `{{lp}}` for custom layouts.
- **Search:** unchanged (already searches the whole text).
- **Privacy:** learning points stay in the case (private). Only what is copied into a reflection can reach a portfolio.
  Admin summaries never carry case text.

## Problems found

- **Size:** `details` is capped at 2000 characters in `logbook/firestore.rules` (and `demo-backend.js`). `dt:` plus `lp:`
  will hit it. Raising it to about 4000 is a rules change: it deploys live and waits for the owner's approval.
- **Bulk paste:** a blank line starts a new case (`parseBulk`), so a marker after a blank line becomes its own case.
  Markers must stay in the same block.
- **Stray text:** "dt:" or "lp:" typed as ordinary text (rare) is read as a marker while the switch is on.
- **Older cases:** any that already contain a marker light up when the switch is turned on.

## Daily workflow

Log the case, add `lp: …` in the same box; the read-back confirms it. Later, **Reflect** pre-fills the reflection. A
Logbook filter chip "Has learning points (n)" (like Interesting) would let the owner review them in one place.

## Build order (one PR each, each merged before the next)

1. Parser (pure, tested, any label), the switch, main-line-only reading, rows, Case tab read-back.
2. Reflection pre-fill and the format tokens.
3. Optional: the filter chip, `+ LP` / `+ Details` insert buttons, the 4000-character limit (rules; owner approval).

## Decisions still needed from the owner

1. Raise the 2000-character cap to about 4000 (rules change), or stay at 2000 for now?
2. Include the filter chip and the insert buttons?
3. `lp:` plus `lp1:`: `lp:` as the first point, then `lp1:`, `lp2:` (the default above): fine?
