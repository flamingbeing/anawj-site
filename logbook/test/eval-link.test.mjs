// Request an evaluation from a case (js/eval-link.js): only the date and initials go in the link, checked.
import assert from 'node:assert/strict';
import { evalRequestUrl, evalsBase, EVALS_URL } from '../js/eval-link.js';

const today = '2026-10-13';
assert.equal(EVALS_URL, 'https://apmes.anawj.com/evals/');
assert.equal(evalRequestUrl({ date: '2026-10-12', initials: 'AB' }, { today }), 'https://apmes.anawj.com/evals/?date=2026-10-12&initials=AB#new');
// today is fine; the future, impossible days and other shapes are left out
assert.equal(evalRequestUrl({ date: today, initials: 'XYZ' }, { today }), EVALS_URL + '?date=2026-10-13&initials=XYZ#new');
assert.equal(evalRequestUrl({ date: '2026-10-14', initials: 'AB' }, { today }), EVALS_URL + '?initials=AB#new');
assert.equal(evalRequestUrl({ date: '2026-02-30', initials: 'AB' }, { today }), EVALS_URL + '?initials=AB#new');
assert.equal(evalRequestUrl({ date: '13/10/2026', initials: 'AB' }, { today }), EVALS_URL + '?initials=AB#new');
assert.equal(evalRequestUrl({ date: null, initials: '' }, { today }), EVALS_URL + '#new');
// initials: letters only, in capitals, 1 to 3 of them, never shortened
assert.equal(evalRequestUrl({ initials: 'a.b' }, { today }), EVALS_URL + '?initials=AB#new');
assert.equal(evalRequestUrl({ initials: 'C' }, { today }), EVALS_URL + '?initials=C#new');
assert.equal(evalRequestUrl({ initials: 'ABCD' }, { today }), EVALS_URL + '#new');
assert.equal(evalRequestUrl({ initials: '12' }, { today }), EVALS_URL + '#new');
// never anything else from the case, and nothing that could break out of the parameter
const u = new URL(evalRequestUrl({ date: '2026-10-01', initials: 'A&B', details: 'Fake 34F LSCS' }, { today }));
assert.deepEqual([...u.searchParams.keys()], ['date', 'initials']);
assert.equal(u.searchParams.get('initials'), 'AB');
assert.equal(u.hash, '#new');
// the demo goes to the evals demo
assert.equal(evalRequestUrl({ date: '2026-10-01', initials: 'AB' }, { today, demo: true }), EVALS_URL + '?demo&date=2026-10-01&initials=AB#new');
// no today given: any real date
assert.equal(evalRequestUrl({ date: '2030-01-01' }), EVALS_URL + '?date=2030-01-01#new');

// the evals app beside this logbook: the live site, a PR preview, a local server; EVALS_URL with no address
assert.equal(evalsBase('https://apmes.anawj.com/logbook/?demo#log'), 'https://apmes.anawj.com/evals/');
assert.equal(evalsBase('https://pr-1.example.workers.dev/logbook/index.html'), 'https://pr-1.example.workers.dev/evals/');
assert.equal(evalsBase('http://localhost:8212/logbook/'), 'http://localhost:8212/evals/');
assert.equal(evalsBase(''), EVALS_URL);
assert.equal(evalRequestUrl({ initials: 'AB' }, { base: evalsBase('http://localhost:8212/logbook/') }), 'http://localhost:8212/evals/?initials=AB#new');

console.log('eval-link tests passed');
