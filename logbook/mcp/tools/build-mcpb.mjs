#!/usr/bin/env node
// Stages the Claude Desktop extension (.mcpb) for the APMES Logbook MCP server; the release workflow
// (.github/workflows/logbook-mcpb.yml) then packs it with the official mcpb CLI.
//   node logbook/mcp/tools/build-mcpb.mjs [stage dir]   (default logbook/mcp/dist/stage)
// The stage holds manifest.json, the icon, and only the files server.mjs imports (followed from it, so a new import is
// never left out), laid out as in the repo (mcp/…, js/…) with the server's production node_modules. The manifest's
// tool list comes from lib/tools.mjs itself, so it can't fall out of step.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MCP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGBOOK = path.dirname(MCP);
const stage = path.resolve(process.argv[2] || path.join(MCP, 'dist', 'stage'));
const pkg = JSON.parse(fs.readFileSync(path.join(MCP, 'package.json'), 'utf8'));

// relative imports, static and dynamic, from one module
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
export function importGraph(entry) {
  const seen = new Set(), todo = [entry];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(IMPORT)) todo.push(path.resolve(path.dirname(f), m[1]));
  }
  return [...seen].sort();
}

async function main() {
  fs.rmSync(stage, { recursive: true, force: true });
  const files = importGraph(path.join(MCP, 'server.mjs'));
  for (const f of files) if (!f.startsWith(LOGBOOK + path.sep)) throw new Error(`server.mjs imports ${f}, outside logbook/`);
  for (const f of [...files, path.join(MCP, 'package.json'), path.join(MCP, 'package-lock.json')]) {
    const to = path.join(stage, path.relative(LOGBOOK, f));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(f, to);
  }
  fs.copyFileSync(path.join(LOGBOOK, 'icons', 'icon-512.png'), path.join(stage, 'icon.png'));
  execFileSync('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: path.join(stage, 'mcp'), stdio: 'inherit' });

  const { defineTools } = await import(path.join(MCP, 'lib', 'tools.mjs'));
  const noop = async () => {};
  const tools = defineTools(noop, { saveCase: noop, saveReflection: noop, savePlan: noop, queueSheetRow: noop, invalidate() {} })
    .map(t => ({ name: t.name, description: t.description }));
  const manifest = {
    manifest_version: '0.2',
    name: 'apmes-logbook',
    display_name: 'APMES Logbook',
    version: pkg.version,
    description: 'Your own APMES Logbook in Claude: cases, progress against the targets, reflections and planned cases; log cases (one or a pasted list), suggest tags, plan cases, log them once done and draft reflections.',
    long_description: 'Signs in as you with Google (a browser window opens the first time you use it) and uses the same Firestore rules as the web app, so it sees and changes only your own logbook. Every change is shown to you first and saved only once you agree; nothing is ever deleted. What it reads or writes goes through Claude: check your hospital\'s policy on AI tools first, and keep cases de-identified. Your sign-in stays on this computer (~/.config/apmes-logbook-mcp/token.json).',
    author: { name: 'APMES Logbook', url: 'https://apmes.anawj.com/logbook/' },
    homepage: 'https://github.com/flamingbeing/anawj-site/tree/main/logbook/mcp#readme',
    documentation: 'https://github.com/flamingbeing/anawj-site/tree/main/logbook/mcp#readme',
    support: 'https://github.com/flamingbeing/anawj-site/issues',
    icon: 'icon.png',
    server: {
      type: 'node',
      entry_point: 'mcp/server.mjs',
      mcp_config: { command: 'node', args: ['${__dirname}/mcp/server.mjs'] },
    },
    tools,
    keywords: ['logbook', 'anaesthesia', 'apmes', 'residency'],
    compatibility: { platforms: ['darwin', 'win32', 'linux'], runtimes: { node: pkg.engines.node } },
  };
  fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  process.stderr.write(`Staged ${files.length} source files and ${tools.length} tools in ${stage}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { process.stderr.write(`build-mcpb: ${e.message}\n`); process.exit(1); });
}
