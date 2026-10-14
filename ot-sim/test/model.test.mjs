// Page checks without a browser: noindex, and the old-address forward (anawj.com/ot-sim/ -> anaes.anawj.com/ot/)
// run with fake locations. Run: node ot-sim/test/model.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /<meta name="robots" content="noindex, nofollow">/, 'app page must be noindex');

// the forward script is the first inline script in <head>
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function forward(url, framed = false) {
  const u = new URL(url);
  let went = null;
  const location = { hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, replace: x => { went = x; } };
  const self = {}, top = framed ? {} : self;
  new Function('top', 'self', 'location', script)(top, self, location);
  return went;
}
assert.equal(forward('https://anawj.com/ot-sim/?case=anaphylaxis&at=300#theatre'), 'https://anaes.anawj.com/ot/?case=anaphylaxis&at=300#theatre');
assert.equal(forward('https://www.anawj.com/ot-sim/index.html'), 'https://anaes.anawj.com/ot/index.html');
assert.equal(forward('https://anawj.com/ot-sim'), 'https://anaes.anawj.com/ot/');
assert.equal(forward('https://anaes.anawj.com/ot/#theatre'), null, 'inert on the subdomain');
assert.equal(forward('http://localhost:8080/ot-sim/'), null, 'inert locally');
assert.equal(forward('https://claude-x.anawj-preview.workers.dev/ot-sim/'), null, 'inert on previews');
assert.equal(forward('https://anawj.com/ot-sim/', true), null, 'inert in a frame (the page editor)');

// no request leaves the folder: no absolute URLs in src/href (fonts and scripts are relative)
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) assert.ok(!/^(https?:)?\/\//.test(m[1]), `relative path: ${m[1]}`);
console.log('ot-sim page tests: ok');
