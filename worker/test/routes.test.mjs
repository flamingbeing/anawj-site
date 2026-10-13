// worker/routes.js: which folder each address serves, and what it must never serve. Run: node worker/test/routes.test.mjs
import assert from 'node:assert/strict';
import { resolve, SITES } from '../routes.js';

// shared hosts: one path per app
assert.deepEqual(resolve('hand.anawj.com', '/cmcj/'), { file: 'cmcj/' });
assert.deepEqual(resolve('hand.anawj.com', '/cmcj/app.js'), { file: 'cmcj/app.js' });
assert.deepEqual(resolve('hand.anawj.com', '/babies/'), { file: 'hand-babies/' });
assert.deepEqual(resolve('hand.anawj.com', '/babies/img/x.png'), { file: 'hand-babies/img/x.png' });
assert.deepEqual(resolve('apmes.anawj.com', '/logbook/js/app.js'), { file: 'logbook/js/app.js' });
assert.deepEqual(resolve('apmes.anawj.com', '/evals/'), { file: 'evals/' });
assert.deepEqual(resolve('hand.anawj.com', '/babies'), { redirect: '/babies/' });
// a shared host serves nothing else: not its root, not other apps' folders, not the repo
for (const [h, p] of [['hand.anawj.com', '/'], ['hand.anawj.com', '/logbook/'], ['hand.anawj.com', '/hand-babies/'], ['hand.anawj.com', '/AGENTS.md'],
  ['apmes.anawj.com', '/'], ['apmes.anawj.com', '/prewarm/'], ['apmes.anawj.com', '/nuh-roster/index.html'], ['apmes.anawj.com', '/logbooks/']]) {
  assert.deepEqual(resolve(h, p), { notFound: true }, h + p);
}
// dot segments are resolved by URL parsing before we see them; check the worker's view of them anyway
for (const raw of ['/cmcj/%2e%2e/logbook/', '/cmcj/../logbook/', '/cmcj/..%2flogbook/']) {
  const u = new URL(raw, 'https://hand.anawj.com');
  const r = resolve('hand.anawj.com', u.pathname);
  assert.ok(r.notFound || (r.file && r.file.startsWith('cmcj/') && !r.file.includes('..')), raw + ' -> ' + JSON.stringify(r));
}
for (const p of ['/cmcj/..%2flogbook/', '/cmcj/%2e%2e%2flogbook/', '/babies/a%5c..%5clogbook/', '/cmcj/a\\b']) {
  assert.deepEqual(resolve('hand.anawj.com', p), { notFound: true }, p);
  assert.deepEqual(resolve('anawj-preview.x.workers.dev', p), { notFound: true }, p);
}

// one-app hosts: the app at the root; its own folder name works too (until its links are updated)
assert.deepEqual(resolve('prewarmstudy.anawj.com', '/'), { file: 'prewarm/' });
assert.deepEqual(resolve('prewarmstudy.anawj.com', '/js/app.js'), { file: 'prewarm/js/app.js' });
assert.deepEqual(resolve('prewarmstudy.anawj.com', '/prewarm/'), { file: 'prewarm/' });
assert.deepEqual(resolve('prewarmstudy.anawj.com', '/prewarm/sw.js'), { file: 'prewarm/sw.js' });
assert.deepEqual(resolve('prewarmstudy.anawj.com', '/prewarm'), { redirect: '/prewarm/' });
assert.deepEqual(resolve('roster.anawj.com', '/'), { file: 'nuh-roster/' });
assert.deepEqual(resolve('ROSTER.anawj.com:443', '/x.js'), { file: 'nuh-roster/x.js' });
// ... and never another app's files (only folders under the app's own folder are reachable)
assert.deepEqual(resolve('prewarmstudy.anawj.com', '/logbook/js/app.js'), { file: 'prewarm/logbook/js/app.js' });   // that file doesn't exist there: 404

// every other host (previews, the copy of main) serves the repo as it is
assert.deepEqual(resolve('anawj-preview.example.workers.dev', '/logbook/'), { file: 'logbook/' });
assert.deepEqual(resolve('anawj-preview.example.workers.dev', '/'), { file: '' });

// trying an address on a preview: /_sites/<host>/…
assert.deepEqual(resolve('x.workers.dev', '/_sites/hand.anawj.com/babies/'), { file: 'hand-babies/' });
assert.deepEqual(resolve('x.workers.dev', '/_sites/prewarmstudy.anawj.com/'), { file: 'prewarm/' });
assert.deepEqual(resolve('x.workers.dev', '/_sites/hand.anawj.com/babies'), { redirect: '/_sites/hand.anawj.com/babies/' });
assert.deepEqual(resolve('x.workers.dev', '/_sites/hand.anawj.com/logbook/'), { notFound: true });
assert.deepEqual(resolve('x.workers.dev', '/_sites/hand.anawj.com'), { redirect: '/_sites/hand.anawj.com/' });
assert.deepEqual(resolve('x.workers.dev', '/_sites/nothing.anawj.com/x'), { file: '_sites/nothing.anawj.com/x' });   // unknown host: not a site
// the real hosts don't take the /_sites/ route
assert.deepEqual(resolve('hand.anawj.com', '/_sites/roster.anawj.com/'), { notFound: true });

// the table lists only folders that exist in the repo
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
for (const [h, s] of Object.entries(SITES)) {
  for (const f of s.root ? [s.root] : Object.values(s.prefixes)) assert.ok(fs.existsSync(path.join(root, f, 'index.html')), `${h}: ${f}index.html is missing`);
}
console.log('worker routes tests passed');
