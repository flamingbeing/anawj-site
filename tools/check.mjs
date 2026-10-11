// Repo checks for mistakes tests don't catch. Run before merging: node tools/check.mjs
// 1. Each app's sw.js deletes only caches with its own prefix (apps share the anawj.com origin).
// 2. Every file in an app's SHELL list exists.
// 3. If a SHELL file changed against origin/main, that app's sw.js VERSION changed too.
// 4. evals/js/catalogue.js and forms.js match a fresh build from evals/reference/.
// Exits 1 on any failure.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const errors = [];
const fail = msg => errors.push(msg);

const BASE = process.env.BASE_REF || 'origin/main';
let base = null;
try { base = git('merge-base', 'HEAD', BASE).trim(); } catch { console.warn(`check: ${BASE} not found, skipping the VERSION-bump check (git fetch origin main)`); }
// changed against the merge base, committed or not
const changed = base ? new Set(git('diff', '--name-only', base).split('\n').filter(Boolean)) : new Set();

const apps = fs.readdirSync(ROOT).filter(d => fs.existsSync(path.join(ROOT, d, 'sw.js')));
for (const app of apps) {
  const swPath = `${app}/sw.js`;
  const sw = fs.readFileSync(path.join(ROOT, swPath), 'utf8');
  const prefix = `${app}-`;

  const version = sw.match(/const VERSION = '([^']+)'/)?.[1];
  if (!version) fail(`${swPath}: no VERSION constant`);
  else if (!version.startsWith(prefix)) fail(`${swPath}: VERSION '${version}' should start with '${prefix}'`);

  for (const line of sw.split('\n').filter(l => l.includes('caches.delete'))) {
    if (!line.includes(`startsWith('${prefix}')`)) fail(`${swPath}: caches.delete without a startsWith('${prefix}') guard deletes other apps' caches:\n    ${line.trim()}`);
  }

  const shellSrc = sw.match(/const SHELL = \[([\s\S]*?)\];/)?.[1];
  if (!shellSrc) { fail(`${swPath}: no SHELL list`); continue; }
  const shell = [...shellSrc.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(f => f !== './')
    .map(f => path.posix.normalize(`${app}/${f}`));
  for (const f of shell) if (!fs.existsSync(path.join(ROOT, f))) fail(`${swPath}: SHELL lists ${f}, which doesn't exist`);

  if (base) {
    const touched = shell.filter(f => changed.has(f));
    let oldVersion = null;
    try { oldVersion = git('show', `${base}:${swPath}`).match(/const VERSION = '([^']+)'/)?.[1]; } catch { /* new app */ }
    if (touched.length && oldVersion && oldVersion === version) {
      fail(`${swPath}: ${touched.join(', ')} changed but VERSION is still '${version}'; bump it`);
    }
  }
}

try { execFileSync('node', [path.join(ROOT, 'evals/tools/build-data.mjs'), '--check'], { stdio: ['ignore', 'ignore', 'pipe'] }); }
catch (e) { fail(String(e.stderr || e.message).trim()); }

if (errors.length) {
  console.error(`check: ${errors.length} problem(s)\n- ` + errors.join('\n- '));
  process.exit(1);
}
console.log(`check: ok (${apps.join(', ')}; generated files up to date)`);
