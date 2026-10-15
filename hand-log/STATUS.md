# Hand log status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-13 by Claude Code (first version).

## Now

Each session keeps its own line in `status/<session>.md`. Read them before starting; edit only yours.

## Waiting on the owner

- Whether to link it to the logbook/evals (`apmes.`) later, e.g. exporting into the logbook; until then it stays separate.
- Check the DOPS and Mini-CEX items and domains in `js/forms.js` against what the hand programme uses.

## Next (ideas, not agreed)

1. Import from the JSON backup on a new phone.
2. Counts per item against programme targets on the summary screen.

## Recently done

- 2026-10-15: app kit (native look): app bar, large titles, bottom tab bar (sidebar on computers), grouped lists, segmented ratings.

- 2026-10-13: speed-of-entry features (remembered fields, recent procedures, rate-all, drafts, log again, list filter, phrase chips); e2e checks added for them.

- 2026-10-13: first version: DOPS and Mini-CEX forms, list, entry detail with delete, summary with CSV/JSON export, offline.

## Decisions

- 13 Oct 2026 (owner): served at `hand.anawj.com/handlog/` (Worker route; data stays on the phone, so sharing `hand.` is fine). `anawj.com/hand-log/` redirects there.
