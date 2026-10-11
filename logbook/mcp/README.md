# APMES Logbook MCP server

A small local [MCP](https://modelcontextprotocol.io) server that lets Claude (Claude Desktop or Claude Code) read **your own** APMES Logbook: your cases, your progress against the APMES targets, and your reflections. You ask in plain words ("which tags am I behind on?", "find my cases with an adductor canal block last month") and Claude calls these tools.

**It is read-only.** There are no tools that add, change or delete anything. It signs in as you and reads Firestore with your own sign-in, so the same `firestore.rules` as the web app apply: it can only see `logbooks/{your email}` (cases and reflections) and your own entry on the programme list (for your residency year).

| Tool | What it returns |
|---|---|
| `list_cases({ from?, to?, category?, limit? })` | your cases, newest first; dates `YYYY-MM-DD`; `category` is a tag code (`16`) or name (`caesarean`); a parent tag also finds its sub-tags |
| `search_cases({ text, limit? })` | cases whose initials, details or tag names contain every word (`"quoted phrase"` stays whole) |
| `progress({ year? })` | count per APMES tag against the cumulative targets, with status (done, on track, due this year, behind) |
| `list_reflections({ heading?, status?, limit? })` | reflections with id, heading, title, date and draft/complete |
| `get_reflection({ id })` | the full text of one reflection (figures are not read, only their captions) |
| `missing_targets({ year? })` | tags behind or due for your year, and reflection headings below their minimum |

`limit` defaults to 50 and is capped at 500. Your residency year comes from the programme list (as in the app), else from Settings in the app, else R1; pass `year` (1–5) to override it. Counts and targets use the app's own code (`../js/engine.js`, `../js/categories.js`, `../js/reflections.js`), so they match the Analytics tab.

## Privacy: read this first

- **What you read through it is sent to Claude (Anthropic).** Case details and reflections that a tool returns go into your Claude conversation. Check your hospital's policy on using AI tools with clinical logs before you use it, and keep your cases de-identified (initials and a short description, no names or NRIC numbers), as the logbook already asks.
- **Your sign-in stays on your computer.** Only a Firebase refresh token and your email are stored, in `~/.config/apmes-logbook-mcp/token.json` (readable only by you, mode 0600). Nothing goes to any server other than Google's (sign-in and Firestore) and, through Claude, Anthropic.
- **To revoke access:** run `node server.mjs logout` (deletes the token file), and remove the app in your Google Account → Security → Third-party access ("Your connections to third-party apps & services").

## Install

You need [Node.js](https://nodejs.org) 20.19 or later and git.

```sh
git clone https://github.com/flamingbeing/anawj-site.git
cd anawj-site/logbook/mcp
npm install
node server.mjs login
```

`login` opens your browser to sign in with Google (the same Google account you use for the logbook). If no browser opens, it prints an address to open yourself. After "Signed in as …" you can close the tab.

Then add it to Claude, using the **absolute path** to `server.mjs` on your computer (run `pwd` in the `mcp` folder to see it).

**Claude Desktop**: Settings → Developer → Edit Config, and add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apmes-logbook": {
      "command": "node",
      "args": ["/absolute/path/to/anawj-site/logbook/mcp/server.mjs"]
    }
  }
}
```

On Windows the path looks like `"C:\\Users\\you\\anawj-site\\logbook\\mcp\\server.mjs"`. Restart Claude Desktop.

**Claude Code**:

```sh
claude mcp add apmes-logbook -- node /absolute/path/to/anawj-site/logbook/mcp/server.mjs
```

If you start Claude before signing in, every tool answers with a message telling you to run `node /path/to/server.mjs login`; sign in and ask again. To update: `git pull` in the repo, then `npm install` in this folder.

Commands: `node server.mjs login` (sign in), `node server.mjs logout` (delete the token), `node server.mjs` (the MCP server on stdio; Claude starts this itself).

## How it works

1. **Sign-in, with no server of ours.** Google OAuth for an installed app: a one-off listener on `http://127.0.0.1:<random port>`, PKCE (S256) and a `state` check, scopes `openid email`. The code is exchanged at `https://oauth2.googleapis.com/token`, and the Google ID token is turned into a Firebase sign-in with `accounts:signInWithIdp` (Identity Toolkit), using the logbook's public Firebase API key from `../js/firebase-config.js`. The Firebase refresh token is stored; a fresh ID token is fetched from `securetoken.googleapis.com` when needed and kept in memory only.
2. **Data.** Firestore REST (`firestore.googleapis.com/v1/projects/apmes-logbook/databases/(default)/documents/logbooks/{email}/cases`, likewise `reflections` and the logbook doc), as you, with `Authorization: Bearer <ID token>`, 300 per page. Your residents entry is found with the same query the app makes (`residents` where `email == your email`). Data is cached for a minute so a run of questions reads Firestore once.
3. **About the client secret in `config.mjs`.** Google's "Desktop app" OAuth clients still ask for the client secret at the token step, even with PKCE. Google documents that, for installed apps, this secret is not treated as confidential (it ships inside every copy of the app); the protection is the loopback redirect, PKCE and your own consent. So `CLIENT_ID` and `CLIENT_SECRET` are kept in `config.mjs` in this public repo on purpose. You can override them with the environment variables `APMES_GOOGLE_CLIENT_ID` and `APMES_GOOGLE_CLIENT_SECRET` (and the API key with `APMES_FIREBASE_API_KEY`).

Files: `server.mjs` (commands and MCP wiring), `config.mjs`, `lib/auth.mjs` (sign-in, token file, refresh), `lib/firestore.mjs` (REST client and typed-value decoder), `lib/logbook.mjs` (filters, search, summaries), `lib/tools.mjs` (tool definitions).

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
