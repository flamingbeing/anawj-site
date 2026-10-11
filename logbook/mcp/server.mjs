#!/usr/bin/env node
// APMES Logbook MCP server (read-only). See README.md.
//   node server.mjs login    sign in with Google in the browser
//   node server.mjs logout   delete the stored token
//   node server.mjs          run the MCP server on stdio (Claude Desktop / Claude Code start it)

import { fileURLToPath } from 'node:url';
import { CLIENT_ID, CLIENT_SECRET, API_KEY, PROJECT_ID, isConfigured } from './config.mjs';
import { login, makeSession, deleteToken, defaultTokenFile, NotSignedInError } from './lib/auth.mjs';
import { makeFirestore, makeLogbookSource } from './lib/firestore.mjs';
import { defineTools, callTool, READ_ONLY } from './lib/tools.mjs';

const SELF = fileURLToPath(import.meta.url);
const log = m => process.stderr.write(m + '\n');
const LOGIN_HINT = `In a terminal, run:\n  node "${SELF}" login\nthen ask again.`;

// All the user's data, fetched together and kept for a minute so a run of tool calls reads Firestore once.
const CACHE_MS = 60_000;
let cache = null;
async function getData() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  let session;
  try { session = makeSession({ apiKey: API_KEY }); }
  catch (e) { if (e instanceof NotSignedInError) throw new Error(`Not signed in to the APMES Logbook. ${LOGIN_HINT}`); throw e; }
  const firestore = makeFirestore({ projectId: PROJECT_ID, getIdToken: f => session.getIdToken(f) });
  const src = makeLogbookSource({ firestore, email: session.email });
  try {
    const [logbook, cases, reflections, resident] = await Promise.all([src.logbook(), src.cases(), src.reflections(), src.resident()]);
    const data = { email: src.email, logbook, cases, reflections, resident };
    cache = { at: Date.now(), data };
    return data;
  } catch (e) {
    if (e instanceof NotSignedInError) throw new Error(`APMES Logbook sign-in problem: ${e.message}. ${LOGIN_HINT}`);
    throw e;
  }
}

async function serve() {
  const [{ McpServer }, { StdioServerTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/server/mcp.js'),
    import('@modelcontextprotocol/sdk/server/stdio.js'),
  ]);
  const server = new McpServer({ name: 'apmes-logbook', version: '0.1.0' }, {
    instructions: 'Read-only access to the signed-in resident\'s own APMES Logbook: cases, progress against APMES targets, and reflections. Case details are de-identified initials and short descriptions; do not try to identify patients.',
  });
  for (const tool of defineTools(getData)) {
    server.registerTool(tool.name, { title: tool.title, description: tool.description, inputSchema: tool.shape, annotations: READ_ONLY },
      args => callTool(tool, args));
  }
  await server.connect(new StdioServerTransport());
  log(`apmes-logbook MCP server running (token file ${defaultTokenFile()})`);
}

async function main(cmd) {
  if (cmd === 'login') {
    if (!isConfigured()) {
      log('The Google OAuth client ID and secret are not set yet. The app owner fills them into config.mjs\n'
        + '(see README.md, "One-time owner setup"), or set APMES_GOOGLE_CLIENT_ID and APMES_GOOGLE_CLIENT_SECRET.');
      process.exit(1);
    }
    const { email } = await login({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, apiKey: API_KEY });
    log(`Signed in as ${email}. Token saved to ${defaultTokenFile()} (only on this computer).`);
    log('Restart Claude Desktop or Claude Code if it was already running.');
    return;
  }
  if (cmd === 'logout') {
    log(deleteToken() ? `Signed out: deleted ${defaultTokenFile()}.` : 'Not signed in (no token file).');
    log('To revoke access fully: Google Account → Security → Third-party access (your connections) → remove it.');
    return;
  }
  if (cmd && cmd !== 'serve') {
    log('Usage: node server.mjs [login | logout]   (no argument: run the MCP server on stdio)');
    process.exit(2);
  }
  await serve();
}

main(process.argv[2]).catch(e => { log(`Error: ${e && e.message ? e.message : e}`); process.exit(1); });
