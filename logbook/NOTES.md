# Logbook: working notes

Decisions, conventions and how to work on the APMES logbook (`logbook/`). What's happening now (sessions, open
work, what waits on the owner, the next steps, a dated decisions log) is in `STATUS.md`. Read this, then `README.md`
(data model, Firestore layout, rules). Public repo: never commit real names, emails, case details or
portfolio content.


## Product principles (from the owner)

- **Frictionless APMES logging first.** Most residents only log for the audit requirements. Personal
  "learning logbook" features (personal tags, shorthand, tag groups, analytics, saved searches) are
  secondary and must never get in the way of logging a case.
- No extra structured fields (ASA, supervision, urgency): APMES requirements are already covered.
- Things you might do by accident are links, not buttons, and they ask first (e.g. reset built-in shorthand).
- Rarely used things fold away: Figures (optional), References, More tools, Analytics sections.
- Tags count towards credentialling, so they are picked on purpose: nothing is auto-ticked when
  "Suggest tags as I type" is off, and Save needs at least one tag.
- The demo should look like the real app: no yellow bar, just a small "demo ▾" badge in the header. Leave demo
  and Reset demo (a link that asks first) also sit by Sign out on More, so the header can be hidden in the demo too.


## Commands and rules to keep in mind

- Checks: `node tools/check.mjs`; ESM syntax: `for f in logbook/js/*.js; do node --input-type=module --check < $f; done`;
  unit tests: `for f in logbook/test/*.test.mjs; do node "$f"; done`.
- Everything in one go: `tools/test-logbook.sh` (`quick` skips the full e2e). Rules: `tools/test-rules.sh`. Accessibility
  after UI changes: `node logbook/test/e2e/a11y.mjs`. Details: [docs/working.md](docs/working.md).
- Don't bump `sw.js` `VERSION` by hand (the deploy stamps it); new JS files go in `sw.js` SHELL.
- Only the Add tab's modules load with the app: they must not import a page module statically (`docs/working.md`, "Start-up speed").
- New options: per device unless they belong to the account, off by default, defaults pixel-identical.
- Theme links (`#t=`) and themes files are input from strangers: read them only through `themeFromLink` / `importText` (checkTheme drops what it rejects; fonts are checked by their first bytes).
- Look settings: what each may hold is `js/look-schema.js` (one list for themes, files, settings files and links). New settings, choices, tints, fonts or patterns go at the **end** of their list, never reordered or removed, or old theme links change meaning (`test/fixtures/theme-links.json` catches it).
- Owner preferences (merging, screenshots, planning): "Working with the owner" in the root `AGENTS.md`. Status and decisions: `STATUS.md`.

## Topic notes (open only the one you need)

| File | What is in it |
|---|---|
| [docs/words.md](docs/words.md) | The words the app uses (tags, tag groups, case summary, Interesting, ...) |
| [docs/screens-logging.md](docs/screens-logging.md) | Add tab, logging preferences, Enter key, case parts, two panes |
| [docs/screens-logbook.md](docs/screens-logbook.md) | Logbook, Reflections, Analytics, reflection editor, Admin portal, fold-outs |
| [docs/screens-look.md](docs/screens-look.md) | Look and feel, colour, zoom, fonts, Settings pages: Themes, Layout, Accessibility |
| [docs/theme-engine.md](docs/theme-engine.md) | The theme engine: every look a theme can set, icon sets, page motion, how to write a theme |
| [docs/screens-data.md](docs/screens-data.md) | Settings, Markdown, Sync, Drive / Dropbox backup, profiles, CSV, Notes, Connect an AI assistant |
| [docs/screens-tags.md](docs/screens-tags.md) | Tag editor, labelled parts and case template, pasted lists, the 2000-character limit |
| [docs/data-and-rules.md](docs/data-and-rules.md) | Data, roles and photos (`firestore.rules`) |
| [docs/tags-sync-demo.md](docs/tags-sync-demo.md) | Tags and suggestions, sync and cheap reopening, the demo |
| [docs/working.md](docs/working.md) | Tests, e2e options, start-up speed, Firefox, ad blockers, gotchas, lessons |
| [docs/regressions.md](docs/regressions.md) | Review findings fixed, device recovery, Back and search, tag editor selection |

Read [README.md](README.md) for the data model and Firestore layout.
