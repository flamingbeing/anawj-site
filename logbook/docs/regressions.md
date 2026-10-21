# Logbook: review findings fixed, worth not regressing

Part of the logbook working notes; index in [../NOTES.md](../NOTES.md).

- Cloudflare previews: a service worker must key cached navigations by the folder (`'./'`), never `'index.html'`:
  Workers static assets answer `index.html` with a 307 to the folder, and a cached redirect breaks reloads.

- Saved searches must store copies of filter arrays; flag select resets with Clear.
- Case rows have no swipe actions (owner: off); per-case Copy, not Share.
- Diff keys compare tags with parents; pasted export rows (hidden id) aren't read as initials.
- Removed personal tags show as "Removed tag" and stay filterable / bulk-removable.
- Per-user state resets on sign-out (`resetters`), including Analytics, Reflections view, drafts;
  async loads (Totals, ready portfolio) are dropped after sign-out (`gen` counters).
- Pill drag uses the pressed element; CSV Under uses IDs when names repeat; roman sub-codes (26ii).
- Upload reads back every tag name the export writes (full, short, names with commas: "Cardiac,on-pump");
  a column missing from the file (unticked in the export) leaves that field as it was; a file without the
  hidden "Export info" sheet only deletes cases dated within it. Unit tests in export-opts and engine tests.
- Search date words keep the rest of the query as typed (OR / AND, case-sensitive); a bare SAT/MON/SUN is a
  search word (initials), only full day names or "last sat" are dates.
- Add tab: Shift+Enter never saves; Undo of a save restores ☆ Interesting; a picked day survives a reload
  (12 h); "+ Add" (calendar) keeps a case being typed; Same as last keeps line 1 (initials, age).
- Settings file: only known keys, each cleaned to the shape the app reads (a bad savedSearches broke the
  Logbook tab on every device); rYear / rYearAY / importMap / sharedSeen never travel.
- Programme tag groups are adopted only from the server logbook, never a cached copy (it overwrote groups
  changed on another device). Delete account re-authenticates before deleting anything.
- Totals: your own column is live (summaryOf), not the copy loaded when Analytics opened.
- **App version (owner, 14 Oct 2026, as in the prewarming app):** the bottom of More (owner, 15 Oct 2026; it was
  Settings) shows "App version
  2026-10-14 (3f9a2c1d)" (the service worker's cache name, stamped at deploy by
  `tools/stamp-versions.mjs`; the date is the day that version went live) and "Get the latest version": it unregisters this app's service worker and deletes the
  `logbook-` caches, then reloads (`js/app-version.js`). Never data, drafts, settings or other apps' caches; refused
  offline (the saved copy is what opens the app) and while changes are still sending. e2e: `test/e2e/app-version.mjs`.
- Totals counts (owner, 14 Oct 2026): by default every tag on every case, all years (cumulative), plus a **Total tags**
  row like the old Google Sheet's Grand Total (one per tag per case; "Total cases" counts cases, so it is smaller). A
  per-device switch (`display().totalsCount = 'min'`) shows only what counts towards the minimums (each tag up to its
  last target; `towardsMinimum` / `tagTotal` in engine.js). Also on the Case log page.

### Device recovery (Codex robustness review)

Case creation, individual edits/Undo and reflection editor saves first commit immutable recovery records on the device (IndexedDB, with localStorage fallback). Server transactions compare the editor’s base version before replacing a record. Offline saves stay usable; rejected saves keep the editor/input. More → Recent changes / Recover drafts shows pending/failed sync, explicit retries, both sides of a concurrent edit, and the last 100 saved versions. Pending/failed/conflicting changes never expire automatically. History is private to the browser/account and is cleared on sign-out; it is not a backup. Existing batch imports and reflection metadata operations keep their existing cloud APIs.

After a conflict (14 Oct 2026 audit) nothing more for that record is sent until the resident chooses in Recent changes;
a later save used to wait behind it for good, say "Saved locally", and be set aside by either conflict button. Now
(`writes.js`): a save made on the version shown (the other copy) replaces the stopped chain (this device's earlier
versions are set aside, kept in the history past the last 100, and a toast says so); saving it unchanged changes
nothing; one made on this device's own version is kept as one more conflict and fails, so the editor keeps its input
(each next one replaces that held copy). "Keep version from elsewhere" sets aside that save, older ones and the held
copies, never a newer pending one. The Restore buttons go through `writes.restore()`: after a conflict it saves over
the other copy, and behind a failed save it saves from that save's base (what the server holds; it used to queue
behind the failed save for good and say "Version restored"); the chain is set aside only once that save is stored.
Retry on a save waiting behind a failed one sends the failed one again first. While a conflict is open the list shows
the server's copy (from the sync engine), so an edit or delete made elsewhere since shows and is counted (it showed
the copy found at the conflict: parked seed 285932884); the copy found at the conflict shows only while the list still
holds this device's own version, or the very version it started from (same `updatedAt`: a stale cached list; a
restore elsewhere is a newer one), or its delete took the record off. Windows that share the store (two tabs, the
home-screen app and a browser tab) read a save's stored state again just before sending it, on Retry and when a
failed save is reused, so one another window already sent or set aside is not sent again (nor one it has since
dropped from the history: gone, with 100 newer finished saves in the store).

Changes to many logged cases at once (Tag N cases, Settings → tag Merge, a spreadsheet's Changed rows) also go through the queue, case by case with the version each change was made from (`updateMany` in `ui-core.js`; audit, 14 Oct 2026): a blind batch overwrote a case changed on another device meanwhile, with no conflict and no copy. Now that case keeps the other device's version, both are in Recent changes, and the toast says how many were kept (with a Recent changes button). A case whose saves already met such a change (an unresolved conflict) is left alone and counted as kept: a save queued behind it never synced, and either choice in Recent changes then set it aside. The safe way on for a kept case is **Keep version from elsewhere**, then the same tag change or merge again (the toast says so); "Restore my version" puts this device's older copy back over the other device's edit. Ten at a time, each batch waiting (10 s at most) until its saves are done, so the counts say what happened: on a connection slower than the 180 ms `save()` waits, a conflict was found only after the case had counted as saved, and a merge took the old tag off the list. A merge takes the old tag off the list only when every case saved; offline saves, and any still on their way after a batch's 10 s (a connection that only looks online; the batches after it then don't wait), count as saved, and one that meets a change later shows as "Save needs attention", as for one edit. The list repaints once a batch, not on each save's state change (that sorted, overlaid and counted every case about three times a case: 300 cases took over half a minute on a 1,500-case logbook; now about 9 s online in the demo, under a second offline), with "Saving N cases… n done" meanwhile; it stops if the account changes. Each case costs a read and a write, and a big change pushes older entries out of the 100-version history. Only brand-new cases (pasted lists, plans, a backup's missing cases) still go in one batch (`saveMany`). Lesson: anything that saves many records through the queue should hold the per-save repaint (`holding` in `ui-core.js`; multi-delete in `bin.js` doesn't yet), and code run on every queue change uses `writes.attention()` / `conflicted()` / `status()` rather than `writes.entries()` (a deep copy of every entry).

Case and reflection drafts use separate document slots, including when session storage is cloned into a duplicated tab. Case input writes synchronously and flushes on pagehide/hidden; draft status reports storage failures. Recovering a draft preserves the currently open draft in its previous slot.

Run `logbook/test/e2e/recovery.mjs` beside the full E2E suite for rejected writes, immediate reload, two-tab drafts, offline reconnect, conflicts, failed reflection Close and denied storage. It accepts `PLAYWRIGHT_PATH`/`CHROMIUM_PATH` for cloud-runtime paths and uses fake demo records only.

### Back, search and everyday logging (Codex usability review)

Dialogs and reflection editors/pickers/heading choices use finite, opaque history entries. Browser Back dismisses the top view before leaving its screen; manual closes consume the same entry. Dialogs restore focus/caret. Back-dismissed reflection and case-edit drafts remain in More → Recent changes / Recover drafts, including learning-point-only and legacy drafts. Sign-out clears pending toast actions and drops transient callbacks before cleanup; direct account changes clear the old screen immediately. Undo waits for its durable delete and preserves text entered while it is finishing.

Natural-language date search protects quoted phrases, field operands and exclusions before recognizing dates; literal whitespace is preserved. Category-name revisions invalidate search haystacks alongside personal tag changes. List and Pills use a multiselect listbox, roving option focus and a labelled combobox; empty-query ArrowDown+Enter works. The collapsed list reports its actual expanded state.

Logging keeps Claude’s everyday/Advanced split. Everyday controls are grouped by task with device/account scope, defaults, a live fake example and a reset limited to this page. Optional device `compactTags` shows six common recent tags, with the full picker expandable/searchable; settings-file import/export carries the preference. Additional-Enter confirmation names suggested tags in a persistent inline hint. Age previews use words (6m/6M = six years male; 6mo = six months; 3m = three years male; 3mo = three months) without changing the saved input. Unambiguous months+weeks compounds retain their meaning.

Run `logbook/test/e2e/usability.mjs` beside recovery and the full E2E suite. Both focused runners accept cloud-specific Playwright/Chromium paths and fail nonzero on assertion failure. Fake data only.

### Tag editor selection and insertion (Codex next batch)

The first tap selects a tag in List or Pills and opens a small read-only details card. Edit is explicit; Add after uses the selection as an insertion anchor. Close / Escape / browser Back dismiss the card and retain selection. New tags and section headers offer separate Sits under and Place after controls, a searchable sibling list, Beginning / End and a placement preview. Insertion preserves child subtrees and existing APMES parent restrictions. Changing parent resets placement to its end. A changed layout or account refuses a stale dialog save. Selection clears with the account caches.
