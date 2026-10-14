// Placeholder model test: replaced by real tests from milestone M0 (see ot-sim/PLAN.md).
// Model tests are plain Node scripts (no browser): import the pure modules from ../js/model/ and assert on a seeded run.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /<meta name="robots" content="noindex, nofollow">/, 'app page must be noindex');
console.log('ot-sim model tests: ok');
