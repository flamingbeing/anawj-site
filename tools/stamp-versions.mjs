// Gives each app's service worker a VERSION that changes whenever its files do, at deploy time only
// (GitHub Pages workflow, Cloudflare preview build). Never committed: PRs don't touch sw.js for a version bump, so
// sessions working on the same app no longer collide on that line (owner, 13 Oct 2026).
// 'logbook-v40' becomes 'logbook-v40-3f9a2c1d': a hash of every file the app can serve: its whole folder (the service
// workers serve any same-origin file cache-first and keep it until VERSION changes, so SHELL alone isn't enough) plus
// SHELL files outside it (../design/tokens.css). Tests, tools and notes are left out; extras only cost an update.
// Run: node tools/stamp-versions.mjs [--check]   (--check prints the versions without writing)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = !process.argv.includes('--check');
const RE = /const VERSION = '([^']+)'/;
const SKIP = /(^|\/)(test|tools|node_modules|\.[^/]+)(\/|$)|\.md$/;
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
  const f = path.join(dir, d.name);
  if (SKIP.test(path.relative(ROOT, f))) return [];
  return d.isDirectory() ? walk(f) : [f];
});

for (const app of fs.readdirSync(ROOT).filter(d => fs.existsSync(path.join(ROOT, d, 'sw.js')))) {
  const swPath = path.join(ROOT, app, 'sw.js');
  const sw = fs.readFileSync(swPath, 'utf8');
  const m = sw.match(RE);
  if (!m) { console.error(`stamp: ${app}/sw.js has no VERSION`); process.exitCode = 1; continue; }
  const base = m[1].replace(/-[0-9a-f]{8}$/, '');   // already stamped: stamp again from the base
  const shellSrc = sw.match(/const SHELL = \[([\s\S]*?)\];/)?.[1] || '';
  const shell = [...shellSrc.matchAll(/'([^']+)'/g)].map(x => x[1]).filter(f => f !== './').map(f => path.join(ROOT, app, f));
  const files = [...new Set([...walk(path.join(ROOT, app)).filter(f => f !== swPath), ...shell])].sort();
  const hash = crypto.createHash('sha256');
  hash.update(sw.replace(RE, `const VERSION = '${base}'`));
  for (const f of files) { hash.update('\0' + path.relative(ROOT, f) + '\0'); if (fs.existsSync(f)) hash.update(fs.readFileSync(f)); }
  const version = `${base}-${hash.digest('hex').slice(0, 8)}`;
  if (write) fs.writeFileSync(swPath, sw.replace(RE, `const VERSION = '${version}'`));
  console.log(`${app}: ${version}`);
}
