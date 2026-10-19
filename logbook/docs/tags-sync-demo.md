# Logbook: tags and suggestions, sync, demo

Part of the logbook working notes; index in [../NOTES.md](../NOTES.md).

## Tags and suggestions (`tags.js`, `suggest.js`)

- **Detection** (Settings → Logging → Detection; owner, 15 Oct 2026): account settings `detectInitials` (false: never
  read initials from the text), `skipStarts` ("===, Pt:", dropped before initials, only when initials follow) and
  `oneLetterInitials` (a lone capital is initials; I and A still need an age, "/" or "("). `ui-core.settings()` passes
  them into engine.js (`setDetection`), so the box, pastes and spreadsheets read initials alike. The line under the
  Case box shows what was read; a tap keeps it as text for that case only (`draft.noIni`, `draft.noAge`).
- **Pasted list format** (Settings → Logging; owner, 19 Oct 2026): account setting `listFormat` `{ start, skip, dropEnd }`
  (`list-format.js`, pure). `start` is plain text with `{n}`, `{initials}`, `{date}`, `{any}` (never a raw regex; only one
  `{any}` counts, so a pattern can't crawl); `parseBulk(..., { format })` cuts the paste where it appears (text before the
  first start is left out; none found: empty-line splitting as before), takes captured initials/date, then applies `skip`
  (characters off the start of each case) and `dropEnd` (texts off its end), which also work with empty-line lists. The
  settings card has a "Try it" box that runs the same parser. "Teach it from an example" (`learnFormat`, `ui-settings.js` `listTeach`): the resident pastes a sample, selects spans and marks them Case starts here / Initials / Date / Skip / Case ends with; the marks become the same `listFormat` (digits in the fixed text become `{n}`), shown on the sample and saved only on "Use this format". Also `remove` (texts removed wherever they appear, e.g. a closing ") ==="; mark role Remove everywhere), and a date in the text above the first case ("OR06 - 20 Oct 2026", `dateTokens`) is the date of every case with none of its own. Test: `test/list-format.test.mjs`, `e2e/list-format.mjs`.

- Tag numbers ("16", "20iii") come from the APMES portfolio's Section 4 table and the old Google Form; they stay as
  internal IDs (Section 4 fill, old-form import, CSV IDs) but are never shown: Still needed, Totals, the Excel backup
  (full or short names) and the Admin names table use names only.

- Tag set: `settings.tagSet` on the logbook doc (per account, synced). Cases keep APMES codes in
  `cats` and personal tag keys in `tags`. The 300 cap counts personal tags and headers only.
- Shorthand: `DEFAULT_SHORTHAND` per APMES code (editable; an APMES tag with `kw` replaces the
  built-in list, `[]` turns it off). `apmesShorthand(set)` feeds `suggest(text, { extra })`; a word
  inside a longer match steps aside ("lap" in "ex lap"). Leading capitals before an age are initials.
- `learnShorthand(cases, key)`: words frequent in a tag's cases and rare elsewhere; offered, never applied.
- Tag CSV: Type (APMES / Personal / Header), Name, Full name, Under, APMES tags, Shorthand, Hidden, ID.
  Import is forgiving (column names, title row, separators, codes or names, Under anywhere, IDs kept by
  name) and reports what didn't line up.

## Sync: this device's copy and cheap reopening (`sync.js`, `store.js`; 13 Oct 2026)

- Goal: opening the app many times a day costs about one Firestore read per collection when nothing changed
  (Firestore's own cache only re-charges unchanged documents if a listener resumes within ~30 minutes).
- Each synced collection (cases, reflections, notes) has a copy on the device: IndexedDB `apmes-logbook-store:<email>`
  (demo: `…:demo:<email>`), one object store per collection plus a meta record `{ syncAt, fullAt, epoch?, gone }`.
  On start the engine shows the stored list at once (only if it was confirmed before, so a new device waits for the
  server as it did), then listens to `where('updatedAt', '>', syncAt - 10 min)` and merges what arrives. syncAt is
  this device's clock when the server last confirmed the list (never past now). First open on a device and once a week
  (`FULL_EVERY`): the whole collection instead, which picks up documents without updatedAt and heals anything missed.
- One engine per account and collection (`createSyncHub`), shared by every caller (the one-shot reflections purge and
  the Reflections screen share one listener); an engine nobody watches stops after 1.5 s.
- Deletions: the recycle bin is a feed of tombstones (`deletedAt > syncAt - 10 min`): a binned record goes only if it
  is still the version that was binned (the entry's `data.updatedAt`; restored or edited elsewhere since, it stays, so
  a bin entry whose delete was refused as a conflict removes nothing). Deletes on this device (`commitRecord`
  `_deleted`: every move to the bin, cases, reflections and notes alike, checked against the version being deleted;
  a restore from the bin goes through the write queue too, base null, so it waits behind a delete still waiting for
  signal and lands after it, and `watchDeletes` follows each delete's own job (`writes.jobKey` / `stateOf`), not the
  record's latest, so a refused delete is still rolled back with a restore queued behind it; `deleteCases`,
  `deleteReflection`) drop the record from the local copy and remember its id (`gone`,
  8 days), so a stale copy arriving later is ignored. A removal the server confirms goes at once; one seen only in the
  cache, or after this device's own pending write (a refused write), is checked with one read. Delete account stops
  the listeners first.
- **Limits** (healed by the weekly full read): a record deleted for good without a bin entry (Undo of a just-saved
  case, plan "done" / pasted-list Undo, Recent changes restoring a deletion) while another device was closed stays on
  that device until then, as does a write stamped by a clock more than 10 minutes slow. A bin-entry tombstone for
  these was considered and not used: older app versions would show it in the recycle bin as an empty case to restore.
- Late writes: direct writes (pasted lists, reflections saved outside the editor, bin entries) that reach the
  server more than 5 minutes after they were made (offline) are stamped again once the server has them
  (`restampIfLate` in `cloud.js`, one small write per record so one deleted since doesn't block the rest; ids listed in
  `apmes-logbook-late:<email>` from the moment they're queued until the server has them, so a page closed first
  stamps them after the next start), so other devices' "changed since" queries still see them. Queue writes (`writes.js`) are stamped when they commit, so they need nothing.
- Firestore's persistent cache stays (offline direct writes depend on its pending-writes queue).
- Sign-out, account switch and Delete account delete every store on the device (`cloud.forgetLocal`; other tabs close
  theirs on `versionchange` and a BroadcastChannel message). A shared ward PC keeps nothing. The account signed in
  now keeps its store (account switch, or a tab catching up on another tab's sign-out and sign-in). If a store is
  still deleted under a running engine, the engine writes its whole list back and reads everything at the next start.
- Costs: the 10-minute window means records changed in the 10 minutes before the last sync are read again on the
  next open (log a case and close the app: one read next time). The recycle-bin purge reads the whole bin at most once
  a day per device (`apmes-logbook-purged:<email>`).
- Demo: `demo-backend.js` `listenSince` gives the same listener; a logbook's `epoch` changes when its data is replaced
  wholesale (reset, sample logbook), which makes the device read it in full.
- Tests: `test/sync.test.mjs` (engine against a fake server that counts reads), `test/e2e/sync-engine.mjs` (demo: stored
  copy, reopen, two tabs, reset, sign-out wipe), `tools/test-reads.sh` → `test/e2e/reads.emulator.mjs` (the real app
  with `?emulator` on localhost against the Firestore and Auth emulators and the real rules; `window.__reads`).
  Measured 13 Oct: first open 50 cases → 50 reads; reopen with nothing changed → 1 read per collection; one case
  edited, one added, one binned elsewhere → 2 case reads and 1 bin read. Before the engine every open read all 50+.

## Demo (`demo-backend.js`, `demo-seed.js`)

- `?demo` (local storage), `?demo=reset` (wipes, reseeds, then the address becomes `?demo`).
- Demo user is an R3. ~350 generated cases over two years plus 32 sample reflections invented by the
  owner (initials and dates made up) load on demand from `demo-seed.js`, so real users never download it.
