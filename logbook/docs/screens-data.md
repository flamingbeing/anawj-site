# Logbook screens: Settings, Markdown, Sync, backup, Notes, Connect an AI assistant

Part of the logbook working notes; index in [../NOTES.md](../NOTES.md). Where things are (screens), part 4.

- **Markdown** (Settings → Markdown, `#sharefmt`; `markdown.js`, tested in `markdown.test.mjs`): one format in
  `settings.markdown` (only what differs from the default; ≤ 8 KB) for Copy / Share on the Logbook tab and the notes
  export. Templates take `{{name}}` (older `{name}` still works): case fill-ins {{date}} {{iso}} {{day}} {{weekday}}
  {{n}} {{count}} {{initials}} {{details}} {{categories}} {{categoryCodes}} {{tags}} {{reflection}}; a line whose
  fill-ins are all empty goes; a value is never read again as a template. Options: date format, categories as
  names / codes / #tags, wiki or Markdown links, case notes per month or day, reflection folders (month, heading,
  flat), file name pattern, front matter fields, the reflection templates (title, summary, each point, figure,
  references). Default day: `YYYY-MM-DD` (plain since log2 15; it was `[[YYYY-MM-DD]]`), then `1. AB` / case, a blank
  line between cases; no tags. **Day heading** (`dayHeadStyle`): Plain / Heading (`# date`) / Link (`{{dateLink}}`,
  `[[file date|date]]` or a Markdown link) / Custom (the `dayHead` box; a heading typed before the styles existed is
  Custom); one case follows the style unless its box was typed. **Dates** (`dateFormat`): 2026-10-10, 20261010,
  10 Oct 2026, Sat 10 Oct 2026, 10/10/2026 or Custom (`datePattern`: YYYY YY MMMM MMM MM M DD D dddd ddd, [text]
  literal; `fmtPattern`). **File names and link targets** (`fileDate`): As the dates (slashes become spaces) or their
  own; they name the export's day notes, reflection files' {{date}} and what Link points to. Sync's own file name
  pattern (Settings → Sync) is separate. Changing the heading makes Sync rewrite each synced day once (3-way merge
  keeps the user's edits). **Under each case** (`reflInDay`: None (default) / Link / Embed `![[…]]` / Full text;
  `notesInDay`: None / Full text): a case's reflections and linked notes after it in a day and in one case, their
  headings two levels down. Link and Embed need the reflection's own note (`ctx.reflPath`): the export, and Sync places
  with **Also sync reflection notes**; Copy, Share, Send to and other Sync places give the full text (Markdown links can't embed: a link). A linked note under its case
  leaves the day's Notes. e2e: `md-format.mjs`. An older
  `settings.shareFormat` (the Copy & share format) carries over until the Markdown page is saved; `share-format.js`
  is kept for that and its tests. Previews use the user's own latest day and reflection.
- **Sync** (Settings → Sync, `#sync`; `ui-sync.js` page + run, `sync-remote.js` calls, `sync-md.js` pure and tested;
  Oct 2026): one Markdown file per day (the day's cases + that day's notes via `mdDay`, the user's Markdown format) in
  Google Drive (`APMES Logbook/Daily/`), Dropbox (app folder `/Daily/`) or a GitHub repo (owner/repo/branch/folder,
  contents API). Name pattern `{date}.md` (also {year} {month} {day}; `/` makes folders). Only days whose text changed
  since this device's last sync go, only on a tap: a "Sync (N)" button on the Logbook tab's count row once a place is
  set up (none otherwise); optional reminder on open (off). The app owns only `<!-- logbook:start fp=… -->` … `<!--
  logbook:end -->` in each file: text outside is kept; edits inside are merged (`merge3`: base = the app's text at the
  last sync, kept in IndexedDB `apmes-logbook-sync`; clashes kept both ways with `<<<<<<< logbook` / `>>>>>>> your
  edits` marks; lines both sides added at the end: the user's first). The start mark's `fp` is the fingerprint of the
  app's text written there (never of a merged block), so a device with no ledger or base (second device, after
  sign-out) replaces an untouched block, leaves alone a block already holding its text, and marks clashes only when
  both really changed. Changing a place's repo/branch/folder/file name clears its ledger and bases (every day is
  written there again). A run waits for the server's notes (`notesFromServer`); a run stops recording at once on
  sign-out (`gen`); `forgetSync` also drops this visit's Drive/Dropbox tokens and Drive folder ids. GitHub writes
  are paced (60 a minute) and a rate limit (403/429 "rate limit", Retry-After) stops that place with "try again in
  N minutes"; "Try again" redoes only the place(s) of that run. Writes are conditional (Drive: md5 checked just before PATCH; Dropbox: upload `update` rev / `add`;
  GitHub: PUT with sha) and a refused write is read again and merged (twice at most). `settings.sync` {targets,
  remind} (no tokens; travels in the settings file); ledger in localStorage `apmes-logbook-cloud-sync:<account>`
  {fp, rev per day}; GitHub token (fine-grained, one repo, Contents read/write) in `apmes-logbook-cloud-gh:<account>:<id>`
  only; "cloud" keeps them out of the device-settings file. Sign-out / account switch / demo reset forget all of it
  (`forgetSync`). Drive/Dropbox reuse the backup sign-in (`signInFor`, pending `action: 'sync'`, `back` page);
  tokens stay memory-only, so a run resumed after one sign-in never leaves for a second (the other place waits for
  the next tap). ID check once per run. e2e: `test/e2e/sync.mjs` fakes all three APIs.
- **Sync reflection notes** (log2 15; owner said build it, 16 Oct 2026; off unless chosen, per place: `target.reflections`):
  one note per reflection in `Reflections/…` beside the day files, named and foldered as the Markdown export names
  them (`reflectionFiles` in sync-md.js, in a stable order: date, created, id), inside the usual marked block, so no
  front matter and no figures. Ledger keys `r:<id>` with the file's `path`; a reflection whose name changes (title,
  date, heading) gets a new file and the old one is left (Sync never deletes a file; the run says how many); a
  deleted reflection's file stays. Only on those places do a day's Link and Embed point at the notes (the day text
  differs per place). Tested in `sync-md.test.mjs` and `e2e/sync.mjs`.
- **Save to Google Drive / Dropbox** (Backup card; `cloud-save.js`, ids and pure helpers in `backup-targets.js`,
  tested): sign-in leaves the page and comes back, no popups (Oct 2026: on the owner's phone popups lost their
  opener, so Drive stayed on a blank page and Dropbox did nothing). Drive = OAuth implicit grant (token in the
  `#fragment`), scope `drive.file`, folder "APMES Logbook" found or made, same-day file replaced; Dropbox = PKCE,
  code in `?query`, App folder access, uploads to `/APMES Logbook/`. Both redirect to `https://apmes.anawj.com/logbook/`
  (registered with both; moved from anawj.com on 13 Oct 2026). localStorage `apmes-logbook-cloud-pending` {to, state, verifier, demo, at} before leaving
  (not sessionStorage: a home-screen app may finish sign-in in a browser tab; 15 min limit);
  `index.html` stores the answer in `apmes-logbook-cloud-return` and tidies the address to `#data` (`?demo` kept);
  `resumeCloudSave` (from `onUser`) waits for the server's cases and reflections, then saves. The reflections
  listener needs `includeMetadataChanges` for that: without it an unchanged offline copy never reports `fromCache:
  false` (the first version waited 30 s and gave up on the owner's phone; demo e2e can't see it). States start `gdr-` /
  `dbx-`; a mismatch saves nothing. e2e: `test/e2e/cloud-save.mjs` fakes both. Tokens in memory only.
  Uploads are `logbook-backup-<date>.json.gz` (CompressionStream, about 4x smaller; `gzipBlob` in `backup.js`);
  Download backup stays plain `.json`; Restore reads both (`backupText`: gzip's 1f 8b bytes, not the name).
  `cloudBackup.keepDays` 0 (default, keep all) / 90 / 30: after a save the app lists its folder and deletes its own
  dated backups and notes zips older than that (`staleBackups`); Dropbox needs `files.metadata.read` for the list.
  A failed tidy never undoes the save; the toast says so. `settings.cloudBackup` { remind, md,
  lastAt, lastTo } (never in the settings file). Reminder: one toast per visit with a Save button when due. The
  owner filled `GOOGLE_CLIENT_ID` and `DROPBOX_APP_KEY` (both public) in Oct 2026. Dropbox stays in development
  mode until the owner applies for production (its icons are 64 and 256 px from `icons/icon-512.png`).
- **Settings menu** (`renderSettingsMenu`, `SETTINGS_GROUPS` in `app.js`; owner, 13 Oct 2026): every page kept, in
  groups Profile / Look (Themes, Layout, Accessibility) / Logging / Reflections / Notes and sharing / Data / Advanced
  (Advanced logging also listed there; Advanced display went in theme-revamp S3). A Settings page (`under: 'settings'`) no group names still shows, under "Other"
  (`settingsGroups`): give a new page its group. Settings search indexes every page, Profile and the Tag editor included (`SEARCH_PAGES`).
- **Profile** page (Settings → Profile, was Profiles or hide items; `#showhide`, `renderShowHide` in `ui-settings.js`):
  the profile card, then every switch that shows or hides part of the app, grouped Extras / APMES / Tips and help /
  Add tab / Reflections / Logbook / Header and tabs, each group with its own "Reset this group" (back to the
  profile's defaults; the other groups stay). The same settings as on their own pages. e2e: `simpler.mjs`, `profiles.mjs`.
- **Profiles are presets of switches** (owner, 13 Oct 2026: "changing profiles simply toggles a bunch of switches";
  `js/profiles.js`, pure, `test/profiles.test.mjs`). `settings.mode` (the whole account; `PROFILES`, `profile()`,
  `shows(key)` / `basicHides(key)`, `setShown`, `caseShown` / `setCaseShown` in `ui-core.js`) is the base; each switch
  (`SWITCHES`: extras `grid`, `analytics`, `reflExtras`, `reflect`; Add tab parts `case:<part>`; APMES `targets`,
  `case:still`, `totals`, `portfolio`, `year`, `reflHeadings`, `saveToast`, `apmesTitle`) is its saved value in
  `settings.show`, else the profile's default (`presetOn`). Older accounts' lists still count: `caseHide` (parts off,
  kept in step on every save) and `basicOn` (items a Basic profile hid, turned back on). So an account with only `mode`
  saved looks exactly as before. Picking a profile (`profileCard` → `confirmProfile`) lists what it turns on and off and
  the tabs it moves on this device, then Apply clears the saved switches (`applyPatch`; an ungoverned hidden part such
  as `parsed` stays) and moves this device's saved tabs, only those the old or new profile moves (`PROFILE_OFF` /
  `PROFILE_ON`; `tabsAfter`; Notes put on the bar by hand stays there from Basic to Advanced; a device with no saved tabs
  follows the profile's `offBar`). A switch changed after makes the card read "Custom (based on X)" with "Back to X"
  (of the tabs, only the profile's own count). **Saving `show`:** the cloud merges the map key by key (`setDoc` with merge), so a patch sends
  only the changed keys, and a reset sends its keys as `null` (left out, they'd stay); `mergeSettings` merges the same
  way locally and in demo mode, and a settings file's `show` replaces the account's (`replaceShow`).
  Body classes `basic`, `logbook-only`, `faculty-profile` stay. **Basic is the default for everyone** (owner, 12 Oct
  2026: nothing saved = Basic). The e2e demo account starts in Advanced (`demoDoc` in demo-backend.js, when
  `apmes-logbook-demo-small` is set) since the tests check every feature.
  - **Profiles hide interface items only, never settings** (owner): every switch is visible on the Profile page and
    works in any profile.
  - **Opt-in switches** (`OPT_IN` in profiles.js: new options, off in every profile unless `PRESET_ON` lists them):
    `evalRequest` ("Request an evaluation from a case", APMES group; a case's ⋯ menu and edit page open the evals app's
    new request with the date and initials only, `js/eval-link.js`). The APMES group's reset says it turns it off.
  - **Device presets** (`js/device-presets.js`): device options a profile turns on, the device's own value first.
    `hideTabsTyping` (Layout → Hide the tab bar while typing) is on in Personal only. The profile sheet lists them
    as "Turns on / off (this device)", and Apply clears the device's own values for them (`deviceReset`), so the device
    follows the new profile; one switched by hand after makes the profile "Custom".
  - **APMES switches** (account, on in every profile but Personal): targets (counts against targets in All tags,
    Analytics targets; off: Analytics shows cases per tag, your own tags too, `renderCounts`), Still needed, programme
    totals (Compare with your intake, You and your year), portfolio export and Section 1 (Export / Import cards,
    Account card), residency year (Account card, Analytics year), reflection headings (Analytics card, "Which
    heading?" step, Reflections list grouped by month), the "now 4/10" save toast, APMES in the default app name
    (`defaultTitle`; a name typed in Themes → Header and tab bar still wins).
  - **Personal** (generic logging outside APMES): the APMES switches off, the extras on, Notes on the tab bar
    (`PROFILE_ON`), own tags kept (tags are never touched by a profile).
  - **Basic**: hides the optional Add tab parts but "what the box was read as" (quick picks, ☆, Still needed, tag
    group saving, Plan for later), the Logbook Grid, Analytics trends / forecasts / Gone quiet / to-dos / links,
    reflection Figures and References (shown anyway when a reflection has some); Analytics off the bar (in More).
    Search operators are not hidden (already off by default; a setting).
  - **Basic: logbook only**: Basic without reflections, for residents allowed to submit reflections separately (the
    PCs still need compiled case logs): Reflections off the bar (in More, for ones already written), no Reflect
    buttons or row-menu item, no ☆ Interesting (edit dialog, Logbook filter), no reflection headings card.
  - **Advanced**: hides nothing.
  - **Faculty / PCs** (`facultyMode()`; offered only to `facultyRole()`: admins, PDs and active faculty; their
    default when nothing is saved, outside the demo; owner, 12 Oct 2026: PCs are added as admins, no PC role; no
    Generic profile): tab bar **Totals** (Programme totals), the Admin portal for admins (left of More; owner), then More
    (owner, 15 Oct 2026): **Case logs** first (`#caselogs`, `ui-caselogs.js`: residents by year with total cases, tags
    behind / due, reflections; tap → `#caselog`, that resident's counts per tag against the targets (`totalsTable` with
    one column), reflection headings met, Excel download), then **Analytics** as programme analytics (`renderProgramme`:
    who's behind, the tags most residents are behind on, and the **Year comparison**: each target tag's median in the
    year picked, the target due next, residents with half the median or less from a median of 4 (`year-compare.js`,
    unit-tested); no totals), then their own Case, Logbook, Reflections. All from the counts
    summaries, never case details. The rules let active
    faculty read `summaries/` (counts are no secret, owner); they still can't read the residents list, cases,
    reflections or notes. Case logs is listed in More for them in other profiles.
  - Display preview (`displayPreview`): dashed accent edge, faint stripes and a "Preview only: not a real case" pill,
    so it never reads as a real case (owner).
  e2e: `simpler.mjs`.
- **One spreadsheet (CSV)** (Backup card, "Download as one spreadsheet"; `backup-csv.js`, tested; Oct 2026, from
  Codex's list): the backup as one CSV for Excel: a `logbook` row (settings, tag groups, portfolio details) then a row
  per case, reflection and note (photos left out). Readable columns (Kind, ID, Date, Initials, Title, Text, Tags,
  Heading, Status, Linked case, Updated) and a Data column with each record's JSON, which Restore from backup reads
  (`looksLikeBackupCsv` → `csvToBackup`), so the same preview and add-only restore apply. A BOM for Excel; cells that
  start like a formula get a leading `'`; comma, semicolon or tab separators load. e2e: `simpler.mjs`.
- **Reflection formatting buttons** (Settings → Reflections or Show or hide → Reflections; `display().reflToolbar`,
  this device, off by default; html class `refl-toolbar`; `fmtBar` in `ui-reflect.js`; Oct 2026, from Codex's list):
  Bold, • List and 1. List above each reflection box. They write Markdown (`**bold**`, `- `, `1. `); the Word export
  turns `**bold**` into bold runs, `- ` into "• " and `# heading` into a bold line (`mdRuns` in `portfolio.js`, tested),
  the Markdown export keeps it. Notes have no toolbar (owner). e2e: `simpler.mjs`.
- **Notes** (`#notes`; `ui-notepad.js`, pure helpers in `notepad.js`, tested; Oct 2026, owner's spec via Codex):
  a resident's own notepad: teaching points, doses, to-dos. Private (owner-only rules: no admin, PD or app-owner
  access), never in the portfolio. A bar tab that starts off the bar (`OFF_BAR` in `ui-settings.js`): first in More
  with "Your own notes: private, never in your portfolio"; Arrange tabs can put it on the bar (it stays off until
  `tabOrder` holds it, so people who arranged tabs before Notes existed don't get it on their bar). At most 2,000
  (`MAX_NOTES`, raised from 100 on 13 Oct 2026 with the sync engine; the app enforces it: the rules can't count); the
  list shows 100 at a time ("Show 100 more"). The index doc (`meta/noteIndex`, rules cap 100) keeps the latest 100
  days and the cases of the latest-changed notes; once the notes are loaded the Logbook's marks come from them. A full
  index (100 days or cases) can't say about older ones, so the Logbook then loads the notes (this device's copy:
  cheap), and a day's Share loads them too (`dayMayHaveNotes`). A new note takes today's date (or the filtered day /
  linked case's day); "No date" makes it undated. Order: undated first (latest change first), then newest day first,
  then as written. Search over title and body. Optional `caseId` ("Link to a case…"). Body is Markdown text, shown
  through `parseNote` → elements (never innerHTML; the list page keeps the syntax in a small "Formatting" fold;
  Enter in the title moves to the note text): # headings, **bold**, - / 1. lists, - [ ] to-dos that tick in
  Preview, http(s)/mailto links only. No images. Delete → recycle bin (kind `note`, 30 days; restore refuses past 100).
  Firebase cost: notes are not read at sign-in; `ensureNotes()` starts the listener on first need (the page, a day
  with notes in the Logbook, the Markdown export, a backup) and keeps it for the visit. Sync, the backups and a
  restore wait for the server's list (`notesFromServer`): this device's copy may be weeks old. Typing saves after 3 s of
  quiet, on blur, on leaving (Back, another tab) and on pagehide / hidden, through `writes.save('note')` →
  `cloud.commitRecord` (offline queue, conflict check). The note index { days, cases, n } (`logbooks/{email}/meta/
  noteIndex`, owner only; updated only from the server's copy of the notes) lets the Logbook show a bar on days with
  notes, "✎ Notes" on the day and "✎ note" on linked case rows without reading notes: one small read when the Logbook
  first asks. It moved out of `settings.noteIndex` (Oct 2026 review: the logbook doc is readable by the app owner); the
  first sync clears the old copy, and backups and the settings file never carry it. Bin restore loads the notes first,
  so the 100 limit holds; the notes listener uses `includeMetadataChanges` like reflections. Copy / Share for a day adds its notes after the
  cases in Settings → Markdown's "A day's notes" format (default `## Notes` then `{{notes}}`: each note as `### title`
  and its text); `{{notes}}` in the day heading places them there instead; no notes, no heading. The Markdown export
  (renamed from "Notes apps") puts dated notes in their day's case note (a notes-only day gets one) and undated ones
  in `Notes.md`. The backup file holds notes; restore adds missing ones up to the limit. e2e: `test/e2e/notepad.mjs`.
  A note's linked-case pill (in the list and in the editor) opens that case's edit page over the note
  (`openCase` → `editCaseDialog`). The edit page has a "Linked" row (not for a new case): Open / Write a
  reflection (`reflectOnCase`) and Open the notes / Write a note (`openNotes({ caseId, create })`; it saves an open
  note first). The Notes page's "Download notes as files (zip)" makes one `.md` or `.txt` per note
  (`noteFiles` in `notepad.js`: "2026-10-12 Title.md", undated "No date Title.md"; title, Date line, text; the linked
  case isn't named); this is separate from the Markdown export, which puts notes inside the day's case note.
- **Daily notes, pasting, formatting, shared to the app** (Oct 2026, 6-hour build track E; e2e `test/e2e/daily-note.mjs`):
  - A daily note is an ordinary note with the id `day-YYYY-MM-DD` (date set, title empty → "Daily note"), so every device
    finds the same one without a query and no rules change was needed. `openDayNote(iso)` waits for the notes and opens
    the existing one (never a second copy with the same id), straight in Edit; when the offline cache hasn't got it,
    it waits up to 3 s for the server's list, and a server copy arriving before anything is typed replaces the blank
    one. Two copies saved apart (two devices) are merged (`mergeDayNote`: the other copy's text plus what was added
    here) instead of a write conflict; ordinary notes keep the conflict. The Add tab box and the editor share one
    copy. A daily note's date can't be changed (it's found by its day). Ways in: the Logbook day's "+ Daily
    note" / preview card (`dayNoteCard`; Done goes back to the Logbook), Notes' "Today's note" button and "Daily notes"
    chip, the manifest shortcut `./#today`, and the Add tab box (Settings → Notes, `settings.dayNoteOnCase`, off).
    It sorts first in its day and has no heading in Copy / Share / Send and the Markdown export.
  - Daily notes don't count towards `MAX_NOTES` (2,000; `cappedNotes`; backup restore and bin restore follow). The
    rules allow 100 days in `meta/noteIndex`, so the doc holds the latest 100 days and the cases of the latest-changed
    notes (`noteIndex(list, INDEX_CAP)`, from the sync engine); once the notes are loaded the marks come from all of
    them, and a full index loads them (`indexCapped`, `dayMayHaveNotes`), so an older daily note still shows and goes
    into Copy / Share / Send. The Logbook's day repaints when the notes change (ui-notepad.js `apply`). Raising that
    cap needs a `firestore.rules` change (owner's approval).
  - Paste cleaner (`paste-clean.js`, tested): `settings.pasteClean` (off) turns pasted HTML into light Markdown;
    Clean up (editor ⋯ menu, always there, with Undo) runs `tidyMarkdown`. The preview now shows `*italic*`.
  - Formatting bar (`fmt-bar.js`, shared with reflections): the note editor's full bar (bold, italic, heading, lists,
    to-do, link, undo) is device setting `noteToolbar` (off); on phones it rides on the keyboard while typing. Edits go
    through `execCommand('insertText')`, so Undo and Ctrl+Z work.
  - Shared to the app: the manifest share_target is POST multipart (text, title, url, `.md`/`.txt` files) to
    `./share-target`; `sw.js` keeps it in Cache Storage `share-inbox-logbook` and opens `./?shared=1#log`. Shared text
    (POST or the old GET `?share_text=`, which still works) goes straight to paste-a-list, as before, unless Settings →
    Notes → Ask what to do with shared text (`settings.shareAsk`, off); files always ask. The chooser
    (`ui-share-in.js`: Add as case(s) / Add to today's note / New note) clears the text only once the note has it.
    `share-in.js` holds the plumbing (tested).
    The POST needs the service worker: with none active (site data cleared, shared before the first install finished,
    or the old v40 worker still in charge while the new one waits for its reload and the phone already has the new manifest), the share reaches
    GitHub Pages, which refuses POSTs (405), so a static fallback page can't help. The worker installs on the first
    visit, so this only bites in that window.
- **Connect an AI assistant** (`mcp/`, Settings → Connect an AI assistant (advanced) links its README on GitHub): an MCP
  server residents run locally (reads, plus `add_case`, `update_case`, `save_reflection` for drafts: preview, then
  `confirm: true`; no deletes; new cases also queue their `sheetOutbox` entry); Google "Desktop app" OAuth (loopback, PKCE) → Firebase `signInWithIdp` → Firestore
  REST as the user, so the rules apply; only `logbooks/{own email}` and the user's own `residents` entry. Owner
  setup (the Desktop client ID and its non-confidential secret in `mcp/config.mjs`) is in `mcp/README.md`; until
  then sign-in can't work. The Desktop client ID is set in `mcp/config.mjs`; the agent's safety check refuses to
  commit the `client_secret` (even with the owner's go-ahead), so the owner pastes it via a GitHub web edit, then
  test `node server.mjs login` live. Tests: `logbook/mcp/test/*.test.mjs` (tools test needs `npm install` there).
- **Download for notes apps** (More → Export / Import → Backup; `ui-notes.js`): a zip made on the phone (JSZip):
  `Cases/` notes, `Reflections/…` one note each (linked both ways), `Progress.md` (counts vs targets, reflections vs
  minimums), optional figures in `images/` (fetched one by one from `images/`). A privacy line is always shown.
