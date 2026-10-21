# APMES Logbook MCP server

A small local [MCP](https://modelcontextprotocol.io) server that lets Claude (Claude Desktop or Claude Code) work with **your own** APMES Logbook: read your cases, your progress against the APMES targets and your reflections, and add or change cases and draft reflections. You ask in plain words ("which tags am I behind on?", "find my cases with an adductor canal block last month", "log today's list: …", "start a draft reflection on that case") and Claude calls these tools.

It signs in as you and uses Firestore with your own sign-in, so the same `firestore.rules` as the web app apply: it can only see `logbooks/{your email}` (cases and reflections) and your own entry on the programme list (for your residency year), and it can only write your own cases and reflections.

| Tool | What it returns |
|---|---|
| `list_cases({ from?, to?, category?, limit? })` | your cases, newest first; dates `YYYY-MM-DD`; `category` is a tag code (`16`) or name (`caesarean`); a parent tag also finds its sub-tags |
| `search_cases({ text, limit? })` | cases whose initials, details or tag names contain every word (`"quoted phrase"` stays whole) |
| `progress({ year? })` | count per APMES tag against the cumulative targets, with status (done, on track, due this year, behind) |
| `list_reflections({ heading?, status?, limit? })` | reflections with id, heading, title, date and draft/complete |
| `get_reflection({ id })` | the full text of one reflection (figures are not read, only their captions) |
| `missing_targets({ year? })` | tags behind or due for your year, and reflection headings below their minimum |
| `suggest_tags({ text?, case_id?, limit? })` | APMES tag suggestions from the app's own keyword engine (`../js/suggest.js`, with your shorthand from the Tag editor): for some text, for one case (leaving out tags it has), or, with neither, your cases with no APMES tag, each with suggestions |
| `list_plan()` | your planned cases (Paste a list → Plan for later), due now and later, each with its id |

Writing (each one is two calls: without `confirm` it only shows what would be saved; Claude shows you that and saves with `confirm: true` once you agree):

| Tool | What it does |
|---|---|
| `add_case({ date?, initials?, details, tags?, interesting?, confirm? })` | adds a case as if typed in the app (date defaults to today); like any app case it also goes to the Google Form response sheet (`sheetOutbox`) |
| `update_case({ id, date?, initials?, details?, tags?, interesting?, confirm? })` | changes only the fields given; `tags` replaces the whole list |
| `add_cases({ text? \| cases?, date?, confirm? })` | adds up to 50 cases at once, like the app's Paste a list: `text` is read with the app's own reader (`parseBulk` in `../js/engine.js`, with your Settings → Logging → Pasted list format and Labelled parts), confident tags ticked and weaker ones offered; or give `cases` one by one (to change a row's tags after the preview). Cases already there are skipped, so repeating a call is safe. Each goes to the response sheet too |
| `plan_cases({ text? \| cases?, date?, confirm? })` | adds cases to your plan for a day (today or later, default tomorrow): on that day they wait on the app's Log tab to be confirmed once done. The plan holds at most 100 |
| `log_planned({ ids? \| all_due?, confirm? })` | logs planned cases that are due (today or earlier) as done, like ✓ Done on the app's Log tab → Planned: each becomes a case on its planned date (source `paste`, its tags kept), goes to the response sheet and leaves the plan. Ones already in the logbook are only removed from the plan |
| `save_reflection({ id?, heading?, subheading?, title?, date?, initials?, diagnosis?, summary?, learning_points?, references?, case_id?, confirm? })` | starts a new draft (no `id`) or changes one of your drafts; always saved as a draft |

Safeguards: nothing is ever deleted (there is no delete tool); complete reflections can't be changed from here (edit them, and mark drafts complete, in the app); text that looks like an identifier (an NRIC/FIN or 7 or more digits) is refused; a case with the same date, initials and details as one already there is refused; tags must each match one current tag (a tag with sub-tags needs the sub-tag). Saves use the app's own `cleanCase` / `cleanReflection` (`../js/clean.js`), so they look exactly like the app's and the app shows them at once. A save always reads your latest data first, so it changes what is stored now (and checks again for repeats); a preview may use what was read in the last minute, which keeps Firestore reads (one per case and reflection) down. Cases are saved with source `app` (`add_case`) or `paste` (`add_cases`), as the app saves typed and pasted cases. `plan_cases` only adds to the plan and `log_planned` only removes the logged ones from it, changing nothing else on your logbook document; editing or removing a planned case without logging it stays in the app.

`limit` defaults to 50 and is capped at 500. Your residency year comes from the programme list (as in the app), else from Settings in the app, else R1; pass `year` (1–5) to override it. Counts and targets use the app's own code (`../js/engine.js`, `../js/categories.js`, `../js/reflections.js`), so they match the Analytics tab.

## Privacy: read this first

- **What you read or write through it is sent to Claude (Anthropic).** Case details and reflections that a tool returns or saves go through your Claude conversation. Check your hospital's policy on using AI tools with clinical logs before you use it, and keep your cases de-identified (initials and a short description, no names or NRIC numbers), as the logbook already asks.
- **Your sign-in stays on your computer.** Only a Firebase refresh token and your email are stored, in `~/.config/apmes-logbook-mcp/token.json` (readable only by you, mode 0600). Nothing goes to any server other than Google's (sign-in and Firestore) and, through Claude, Anthropic.
- **To revoke access:** run `node server.mjs logout`, or with the extension delete the file `~/.config/apmes-logbook-mcp/token.json` (in your home folder; on Windows `C:\Users\you\.config\apmes-logbook-mcp\token.json`), and remove the app in your Google Account → Security → Third-party access ("Your connections to third-party apps & services").

## Install

**Claude Desktop (easiest):** download **[apmes-logbook.mcpb](https://github.com/flamingbeing/anawj-site/releases/download/logbook-mcp/apmes-logbook.mcpb)** and open it (or drag it onto Claude Desktop's Settings → Extensions), then Install. Nothing else to set up: Claude Desktop brings its own Node.js. The first time you ask about your logbook, a browser window opens to sign in with Google (the same account you use for the logbook); once the page says you are signed in, ask again. If no browser opens, Claude shows the address to open. To update, download and open the file again. The link always gives the latest version (the `logbook-mcp` release, rebuilt on every change by `.github/workflows/logbook-mcpb.yml`).

**Claude Code or Codex CLI:** you need [Node.js](https://nodejs.org) 20.19 or later and git. Once:

```sh
git clone https://github.com/flamingbeing/anawj-site.git && cd anawj-site/logbook/mcp && npm install
```

then, from that folder:

```sh
claude mcp add apmes-logbook -- node "$PWD/server.mjs"      # Claude Code
codex mcp add apmes-logbook -- node "$PWD/server.mjs"       # Codex CLI
```

Sign-in starts by itself on the first tool call, as above (or run `node server.mjs login` first). To update: `git pull`, then `npm install` in this folder.

Commands: `node server.mjs login` (sign in now), `node server.mjs logout` (delete the token), `node server.mjs` (the MCP server on stdio; Claude starts this itself).

## How it works

1. **Sign-in, with no server of ours.** Started by `login`, or by the first tool call when there is no token (or it has expired): that call answers at once with the sign-in address, and the server finishes the sign-in in the background (one at a time, 5 minutes to finish). Google OAuth for an installed app: a one-off listener on `http://127.0.0.1:<random port>`, PKCE (S256) and a `state` check, scopes `openid email`. The code is exchanged at `https://oauth2.googleapis.com/token`, and the Google ID token is turned into a Firebase sign-in with `accounts:signInWithIdp` (Identity Toolkit), using the logbook's public Firebase API key from `../js/firebase-config.js`. The Firebase refresh token is stored; a fresh ID token is fetched from `securetoken.googleapis.com` when needed and kept in memory only.
2. **Data.** Firestore REST (`firestore.googleapis.com/v1/projects/apmes-logbook/databases/(default)/documents/logbooks/{email}/cases`, likewise `reflections` and the logbook doc), as you, with `Authorization: Bearer <ID token>`, 300 per page. Your residents entry is found with the same query the app makes (`residents` where `email == your email`). Data is cached for a minute so a run of questions reads Firestore once. Writes `PATCH` the whole document (`logbooks/{email}/cases/{id}` or `reflections/{id}`); a new case's sheet copy is written to `sheetOutbox/{id}` only if not there yet (`currentDocument.exists=false`).
3. **About the client secret in `config.mjs`.** Google's "Desktop app" OAuth clients still ask for the client secret at the token step, even with PKCE. Google documents that, for installed apps, this secret is not treated as confidential (it ships inside every copy of the app); the protection is the loopback redirect, PKCE and your own consent. So `CLIENT_ID` and `CLIENT_SECRET` are kept in `config.mjs` in this public repo on purpose. You can override them with the environment variables `APMES_GOOGLE_CLIENT_ID` and `APMES_GOOGLE_CLIENT_SECRET` (and the API key with `APMES_FIREBASE_API_KEY`).

Files: `server.mjs` (commands and MCP wiring), `config.mjs`, `lib/auth.mjs` (sign-in, token file, refresh), `lib/firestore.mjs` (REST client and typed-value decoder), `lib/logbook.mjs` (filters, search, summaries), `lib/write.mjs` (building and checking what the write tools save), `lib/bulk.mjs` (pasted lists, tag suggestions and the plan, with the app's own engines), `lib/tools.mjs` (tool definitions), `tools/build-mcpb.mjs` (stages the Claude Desktop extension: `manifest.json`, the icon and only the files `server.mjs` imports; the workflow packs it with the official `mcpb` CLI).

## Tests

No network (HTTP is stubbed; the login test uses a local 127.0.0.1 listener only), made-up data:

```sh
cd logbook/mcp && npm install && npm test
# or from the repo root:
for f in logbook/mcp/test/*.test.mjs; do node "$f"; done
```

## One-time owner setup

Done once by the app owner, in the Google Cloud console for project **apmes-logbook** (the Firebase project).

1. **OAuth consent screen** (Google Auth Platform → Branding / Audience / Data access): it already exists for the web app's Google sign-in. Check that the scopes `openid` and `.../auth/userinfo.email` are listed (they are non-sensitive, so no verification is needed). If the app is in "Testing", only listed test users can sign in: publish it ("In production") so any resident can.
2. **OAuth client**: APIs & Services → Credentials → Create credentials → OAuth client ID → Application type **Desktop app** → name it "APMES Logbook MCP". Copy the client ID and client secret into `CLIENT_ID` and `CLIENT_SECRET` in `config.mjs` and commit (see "About the client secret" above). Desktop clients accept any `http://127.0.0.1:<port>` redirect; nothing else to register.
3. **Firebase accepts the token**: Firebase Auth accepts Google ID tokens issued to any OAuth client in the same Google Cloud project, so a client created in `apmes-logbook` should work as is. If `login` fails with `INVALID_IDP_RESPONSE` mentioning the audience, add the new client ID under Firebase console → Authentication → Sign-in method → Google → "Allowlist client IDs from external projects".
4. **API key restrictions**: sign-in and token refresh call Identity Toolkit and the Token Service with the web API key from `../js/firebase-config.js`, from Node (no browser, so no `Referer` header). Firestore calls use the ID token, not the key. As of October 2026 the key accepts calls from Node (checked with harmless invalid requests). If the key is ever restricted:
   - **Application restriction "Websites" (HTTP referrers)** would block `login` and refresh with `API_KEY_HTTP_REFERRER_BLOCKED`. Fix: create a second API key (Credentials → Create credentials → API key), application restriction **None**, API restrictions **Identity Toolkit API** and **Token Service API** only, and put it in `config.mjs` as `API_KEY` (or tell users to set `APMES_FIREBASE_API_KEY`). Like the web key, it isn't a secret: Firestore access is still decided by the rules.
   - **API restrictions** on the web key must include Identity Toolkit API and Token Service API (the Firebase defaults do); Cloud Firestore API doesn't need the key.
