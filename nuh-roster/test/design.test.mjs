// The roster copies the shared NUHS tokens into its own style.css (it works offline, so it doesn't link them).
// Every copied value says which token it is ("/* n-navy */"); this checks the copies still match nuhsdesign/tokens.css.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const tokens = fs.readFileSync(new URL('../../nuhsdesign/tokens.css', import.meta.url), 'utf8');
const tok = Object.fromEntries([...tokens.matchAll(/--(n-[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim().toLowerCase()]));
let n = 0;
for (const m of css.matchAll(/--[\w-]+\s*:\s*([^;]+);\s*\/\*\s*(n-[\w-]+)\s*\*\//g)) {
  const [, value, name] = m;
  assert.ok(tok[name], `style.css names ${name}, which isn't in nuhsdesign/tokens.css`);
  assert.equal(value.trim().toLowerCase(), tok[name], `style.css copy of ${name}`);
  n++;
}
assert.ok(n >= 10, `found the copied tokens (${n})`);
console.log(`design token tests passed (${n} copies match)`);
