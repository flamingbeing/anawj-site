# Hand log status

Short and current. Lasting rules go in `NOTES.md`. Update with `/save-state`.

Last updated: 2026-10-13 by Claude Code (first version).

## Now

Each session keeps its own line in `status/<session>.md`. Read them before starting; edit only yours.

## Waiting on the owner

- Subdomain: it saves data (on the device), so per the `SUBDOMAINS.md` rule it needs its own subdomain rather than
  sharing `hand.` with the static crash course. Pick a name (e.g. `handlog.anawj.com`).
- Whether to link it to the logbook/evals (`apmes.`) later, e.g. exporting into the logbook; until then it stays separate.
- Check the DOPS and Mini-CEX items and domains in `js/forms.js` against what the hand programme uses.

## Next (ideas, not agreed)

1. Subdomain once chosen (Worker route, test for the new host).
2. Import from the JSON backup on a new phone.
3. Counts per item against programme targets on the summary screen.

## Recently done

- 2026-10-13: speed-of-entry features (remembered fields, recent procedures, rate-all, drafts, log again, list filter, phrase chips); e2e checks added for them.

- 2026-10-13: first version: DOPS and Mini-CEX forms, list, entry detail with delete, summary with CSV/JSON export, offline.
