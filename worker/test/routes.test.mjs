// worker/routes.js: which folder each address serves, and what it must never serve. Run: node worker/test/routes.test.mjs
import assert from 'node:assert/strict';
import { resolve, SITES, kitCors } from '../routes.js';

// every app moved to its own repo on 21 Oct 2026 (repo split): this Worker lists only the kit and the anaes forwards
// (any unlisted host would get the whole-repo behaviour, so the table itself is what is checked)
assert.deepEqual(Object.keys(SITES).sort(), ['anaes.anawj.com', 'design.anawj.com']);
// shared hosts: one path per app (design.anawj.com is the one host with prefixes left)
assert.deepEqual(resolve('design.anawj.com', '/v1/js/app.js'), { file: 'nuhsdesign/js/app.js' });
// anaes.anawj.com: the BIS and OT simulators moved to anantf.com (16 Oct 2026); old links forward, keeping the rest of the path
assert.deepEqual(resolve('anaes.anawj.com', '/bis/'), { redirect: 'https://anantf.com/bis/' });
assert.deepEqual(resolve('anaes.anawj.com', '/bis'), { redirect: 'https://anantf.com/bis/' });
assert.deepEqual(resolve('anaes.anawj.com', '/bis/app.js'), { redirect: 'https://anantf.com/bis/app.js' });
assert.deepEqual(resolve('anaes.anawj.com', '/ot/'), { redirect: 'https://anantf.com/ot/' });
assert.deepEqual(resolve('anaes.anawj.com', '/ot'), { redirect: 'https://anantf.com/ot/' });
assert.deepEqual(resolve('x.workers.dev', '/_sites/anaes.anawj.com/ot/'), { redirect: 'https://anantf.com/ot/' });
// a shared host serves nothing else: not its root, not other apps' folders, not the repo
for (const [h, p] of [['design.anawj.com', '/hand-babies/'], ['design.anawj.com', '/AGENTS.md'], ['anaes.anawj.com', '/'], ['anaes.anawj.com', '/bis-dsa/'], ['anaes.anawj.com', '/ot-sim/'], ['anaes.anawj.com', '/hand-babies/'],
  ['design.anawj.com', '/'], ['design.anawj.com', '/prewarm/'], ['design.anawj.com', '/nuh-roster/index.html'], ['design.anawj.com', '/v2/']]) {
  assert.deepEqual(resolve(h, p), { notFound: true }, h + p);
}
// dot segments are resolved by URL parsing before we see them; check the worker's view of them anyway
for (const raw of ['/v1/%2e%2e/AGENTS.md', '/v1/../AGENTS.md', '/v1/..%2fAGENTS.md']) {
  const r = resolve('design.anawj.com', new URL(raw, 'https://design.anawj.com').pathname);
  assert.ok(r.notFound || (r.file && r.file.startsWith('nuhsdesign/') && !r.file.includes('..')), raw + ' -> ' + JSON.stringify(r));
}
for (const p of ['/..%2flogbook/', '/%2e%2e%2flogbook/', '/a%5c..%5clogbook/', '/a\\b']) {
  assert.deepEqual(resolve('design.anawj.com', '/v1' + p), { notFound: true }, p);
  assert.deepEqual(resolve('anawj-preview.x.workers.dev', p), { notFound: true }, p);
}


// every other host (previews, the copy of main) serves the repo as it is
assert.deepEqual(resolve('anawj-preview.example.workers.dev', '/privacy/'), { file: 'privacy/' });
assert.deepEqual(resolve('anawj-preview.example.workers.dev', '/'), { file: '' });

// trying an address on a preview: /_sites/<host>/…
assert.deepEqual(resolve('x.workers.dev', '/_sites/design.anawj.com/prewarm/'), { notFound: true });
assert.deepEqual(resolve('x.workers.dev', '/_sites/design.anawj.com'), { redirect: '/_sites/design.anawj.com/' });
assert.deepEqual(resolve('x.workers.dev', '/_sites/nuhroster.anawj.com/'), { file: '_sites/nuhroster.anawj.com/' });   // moved away: not a site any more
assert.deepEqual(resolve('x.workers.dev', '/_sites/nothing.anawj.com/x'), { file: '_sites/nothing.anawj.com/x' });   // unknown host: not a site
// the real hosts don't take the /_sites/ route

// the shared design folder: served on every subdomain as it is, and nothing else is shared; the old /design/ is gone
for (const h of Object.keys(SITES)) {
  assert.deepEqual(resolve(h, '/nuhsdesign/tokens.css'), { file: 'nuhsdesign/tokens.css' }, h);
  assert.deepEqual(resolve(h, '/nuhsdesign'), { redirect: '/nuhsdesign/' }, h);
  assert.deepEqual(resolve(h, '/nuhsdesign/../logbook/index.html'), { notFound: true }, h);
  // /design/ is not shared any more: a shared host 404s, a one-app host looks inside its own folder (also a 404)
  assert.deepEqual(resolve(h, '/design/tokens.css'), SITES[h].root ? { file: SITES[h].root + 'design/tokens.css' } : { notFound: true }, h);
}
assert.deepEqual(resolve('x.workers.dev', '/nuhsdesign/tokens.css'), { file: 'nuhsdesign/tokens.css' });

// design.anawj.com/v1/: the kit for every repo (nuhsdesign/ at /v1/, the feedback script at /v1/feedback/), nothing else
assert.deepEqual(resolve('design.anawj.com', '/v1/tokens.css'), { file: 'nuhsdesign/tokens.css' });
assert.deepEqual(resolve('design.anawj.com', '/v1/'), { file: 'nuhsdesign/' });
assert.deepEqual(resolve('design.anawj.com', '/v1'), { redirect: '/v1/' });
assert.deepEqual(resolve('design.anawj.com', '/v1/feedback/overlay.js'), { file: 'feedback/overlay.js' });
assert.deepEqual(resolve('design.anawj.com', '/v1/../logbook/index.html'), { notFound: true });
assert.deepEqual(resolve('design.anawj.com', '/logbook/'), { notFound: true });
assert.deepEqual(resolve('x.workers.dev', '/_sites/design.anawj.com/v1/app.js'), { file: 'nuhsdesign/app.js' });
// the CORS header goes on kit files only
assert.ok(kitCors('nuhsdesign/tokens.css') && kitCors('feedback/overlay.js'));
assert.ok(!kitCors('logbook/index.html') && !kitCors('prewarm/nuhsdesign/x') && !kitCors(''));

assert.deepEqual(resolve('anaes.anawj.com', '/__/auth/handler'), { notFound: true });
assert.deepEqual(resolve('design.anawj.com', '/__/auth/handler'), { notFound: true });

// the table lists only folders that exist in the repo
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
for (const [h, s] of Object.entries(SITES)) {
  for (const [pre, f] of s.root ? [['/', s.root]] : Object.entries(s.prefixes || {})) {
    // an app folder has an index.html; the sign-in helper, guidebook and feedback folders have their own files
    const own = { '/__/auth/': 'handler.html', '/__/firebase/': 'init.json', '/apmes/guidebook/': 'dops-expectations.md', '/v1/feedback/': 'overlay.js' };
    assert.ok(fs.existsSync(path.join(root, f, own[pre] || 'index.html')), `${h}: ${f} is missing its page`);
  }
}
console.log('worker routes tests passed');
