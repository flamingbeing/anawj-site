// worker/routes.js: which folder each address serves, and what it must never serve. Run: node worker/test/routes.test.mjs
import assert from 'node:assert/strict';
import { resolve, SITES, kitCors } from '../routes.js';

// shared hosts: one path per app
assert.deepEqual(resolve('apmes.anawj.com', '/logbook/js/app.js'), { file: 'logbook/js/app.js' });
assert.deepEqual(resolve('apmes.anawj.com', '/evals/'), { file: 'evals/' });
assert.deepEqual(resolve('apmes.anawj.com', '/people/js/app.js'), { file: 'people/js/app.js' });
assert.deepEqual(resolve('apmes.anawj.com', '/applicants/js/app.js'), { file: 'applicants/js/app.js' });
assert.deepEqual(resolve('apmes.anawj.com', '/360/js/app.js'), { file: '360/js/app.js' });
// anaes.anawj.com: the BIS and OT simulators moved to anantf.com (16 Oct 2026); old links forward, keeping the rest of the path
assert.deepEqual(resolve('anaes.anawj.com', '/bis/'), { redirect: 'https://anantf.com/bis/' });
assert.deepEqual(resolve('anaes.anawj.com', '/bis'), { redirect: 'https://anantf.com/bis/' });
assert.deepEqual(resolve('anaes.anawj.com', '/bis/app.js'), { redirect: 'https://anantf.com/bis/app.js' });
assert.deepEqual(resolve('anaes.anawj.com', '/ot/'), { redirect: 'https://anantf.com/ot/' });
assert.deepEqual(resolve('anaes.anawj.com', '/ot'), { redirect: 'https://anantf.com/ot/' });
assert.deepEqual(resolve('x.workers.dev', '/_sites/anaes.anawj.com/ot/'), { redirect: 'https://anantf.com/ot/' });
// a shared host serves nothing else: not its root, not other apps' folders, not the repo
for (const [h, p] of [['apmes.anawj.com', '/hand-babies/'], ['apmes.anawj.com', '/AGENTS.md'], ['anaes.anawj.com', '/'], ['anaes.anawj.com', '/bis-dsa/'], ['anaes.anawj.com', '/ot-sim/'], ['anaes.anawj.com', '/hand-babies/'],
  ['apmes.anawj.com', '/'], ['apmes.anawj.com', '/prewarm/'], ['apmes.anawj.com', '/nuh-roster/index.html'], ['apmes.anawj.com', '/logbooks/']]) {
  assert.deepEqual(resolve(h, p), { notFound: true }, h + p);
}
// dot segments are resolved by URL parsing before we see them; check the worker's view of them anyway
for (const raw of ['/%2e%2e/logbook/', '/../logbook/', '/..%2flogbook/']) {
  const u = new URL(raw, 'https://prewarmstudy.anawj.com');
  const r = resolve('prewarmstudy.anawj.com', u.pathname);
  assert.ok(r.notFound || (r.file && r.file.startsWith('prewarm/') && !r.file.includes('..')), raw + ' -> ' + JSON.stringify(r));
}
for (const p of ['/..%2flogbook/', '/%2e%2e%2flogbook/', '/a%5c..%5clogbook/', '/a\\b']) {
  assert.deepEqual(resolve('prewarmstudy.anawj.com', p), { notFound: true }, p);
  assert.deepEqual(resolve('anawj-preview.x.workers.dev', p), { notFound: true }, p);
}

// one-app hosts: the app at the root; its own folder name works too (until its links are updated)
assert.deepEqual(resolve('prewarmstudy.anawj.com', '/'), { file: 'prewarm/' });
assert.deepEqual(resolve('prewarmstudy.anawj.com', '/js/app.js'), { file: 'prewarm/js/app.js' });
assert.deepEqual(resolve('prewarmstudy.anawj.com', '/prewarm/'), { file: 'prewarm/' });
assert.deepEqual(resolve('prewarmstudy.anawj.com', '/prewarm/sw.js'), { file: 'prewarm/sw.js' });
assert.deepEqual(resolve('prewarmstudy.anawj.com', '/prewarm'), { redirect: '/prewarm/' });
assert.deepEqual(resolve('nuhroster.anawj.com', '/'), { file: 'nuh-roster/' });
assert.deepEqual(resolve('NUHROSTER.anawj.com:443', '/x.js'), { file: 'nuh-roster/x.js' });
assert.deepEqual(resolve('ntfroster.anawj.com', '/'), { file: 'ntf-roster/' });
assert.deepEqual(resolve('nuhjuniormonthly.anawj.com', '/'), { file: 'nuh-junior-monthly/' });
assert.deepEqual(resolve('nuhjuniormonthly.anawj.com', '/js/sheet.js'), { file: 'nuh-junior-monthly/js/sheet.js' });
assert.deepEqual(resolve('ntfroster.anawj.com', '/js/app.js'), { file: 'ntf-roster/js/app.js' });
assert.deepEqual(resolve('ntfroster.anawj.com', '/nuh-roster/'), { file: 'ntf-roster/nuh-roster/' });   // never the NUH roster's files: 404
assert.deepEqual(resolve('ntfroster.anawj.com', '/__/auth/handler'), { file: '__/auth/handler' });   // Firebase's sign-in helper on this host
assert.deepEqual(resolve('ntfroster.anawj.com', '/__/firebase/init.json'), { file: 'ntf-auth/firebase/init.json' });
assert.deepEqual(resolve('ntfroster.anawj.com', '/ntf-auth/firebase/init.json'), { file: 'ntf-roster/ntf-auth/firebase/init.json' });   // only through /__/firebase/
// ... and never another app's files (only folders under the app's own folder are reachable)
assert.deepEqual(resolve('prewarmstudy.anawj.com', '/logbook/js/app.js'), { file: 'prewarm/logbook/js/app.js' });   // that file doesn't exist there: 404

// every other host (previews, the copy of main) serves the repo as it is
assert.deepEqual(resolve('anawj-preview.example.workers.dev', '/logbook/'), { file: 'logbook/' });
assert.deepEqual(resolve('anawj-preview.example.workers.dev', '/'), { file: '' });

// trying an address on a preview: /_sites/<host>/…
assert.deepEqual(resolve('x.workers.dev', '/_sites/apmes.anawj.com/evals/'), { file: 'evals/' });
assert.deepEqual(resolve('x.workers.dev', '/_sites/prewarmstudy.anawj.com/'), { file: 'prewarm/' });
assert.deepEqual(resolve('x.workers.dev', '/_sites/apmes.anawj.com/evals'), { redirect: '/_sites/apmes.anawj.com/evals/' });
assert.deepEqual(resolve('x.workers.dev', '/_sites/apmes.anawj.com/prewarm/'), { notFound: true });
assert.deepEqual(resolve('x.workers.dev', '/_sites/nuhroster.anawj.com'), { redirect: '/_sites/nuhroster.anawj.com/' });
assert.deepEqual(resolve('x.workers.dev', '/_sites/nothing.anawj.com/x'), { file: '_sites/nothing.anawj.com/x' });   // unknown host: not a site
// the real hosts don't take the /_sites/ route
assert.deepEqual(resolve('apmes.anawj.com', '/_sites/nuhroster.anawj.com/'), { notFound: true });

// the shared design folder: served on every subdomain as it is, and nothing else is shared; the old /design/ is gone
for (const h of Object.keys(SITES)) {
  assert.deepEqual(resolve(h, '/nuhsdesign/tokens.css'), { file: 'nuhsdesign/tokens.css' }, h);
  assert.deepEqual(resolve(h, '/nuhsdesign'), { redirect: '/nuhsdesign/' }, h);
  assert.deepEqual(resolve(h, '/nuhsdesign/../logbook/index.html'), { notFound: true }, h);
  // /design/ is not shared any more: a shared host 404s, a one-app host looks inside its own folder (also a 404)
  assert.deepEqual(resolve(h, '/design/tokens.css'), SITES[h].root ? { file: SITES[h].root + 'design/tokens.css' } : { notFound: true }, h);
}
assert.deepEqual(resolve('x.workers.dev', '/_sites/prewarmstudy.anawj.com/nuhsdesign/tokens.css'), { file: 'nuhsdesign/tokens.css' });
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

// apmes.anawj.com: Firebase's sign-in helper pages
assert.deepEqual(resolve('apmes.anawj.com', '/__/auth/handler'), { file: '__/auth/handler' });
assert.deepEqual(resolve('apmes.anawj.com', '/__/firebase/init.json'), { file: 'apmes-auth/firebase/init.json' });
assert.deepEqual(resolve('apmes.anawj.com', '/__/other'), { notFound: true });
assert.deepEqual(resolve('anaes.anawj.com', '/__/auth/handler'), { notFound: true });
assert.deepEqual(resolve('apmes.anawj.com', '/apmes/guidebook/dops-expectations.md'), { file: 'apmes/guidebook/dops-expectations.md' });
assert.deepEqual(resolve('apmes.anawj.com', '/apmes/originals/x'), { notFound: true });

// beta-apmes.anawj.com: the same apps (beta branch, test Firebase project) and its own sign-in config, nothing else
assert.deepEqual(resolve('beta-apmes.anawj.com', '/logbook/js/app.js'), { file: 'logbook/js/app.js' });
assert.deepEqual(resolve('beta-apmes.anawj.com', '/evals/'), { file: 'evals/' });
assert.deepEqual(resolve('beta-apmes.anawj.com', '/__/firebase/init.json'), { file: 'apmes-auth-beta/firebase/init.json' });
assert.deepEqual(resolve('beta-apmes.anawj.com', '/__/auth/handler'), { file: '__/auth/handler' });
assert.deepEqual(resolve('beta-apmes.anawj.com', '/prewarm/'), { notFound: true });

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
