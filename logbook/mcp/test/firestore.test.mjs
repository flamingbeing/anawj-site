// Run with: node logbook/mcp/test/firestore.test.mjs  (no network: fetch is stubbed)
import assert from 'node:assert/strict';
import { decodeValue, decodeFields, decodeDoc, makeFirestore, makeLogbookSource } from '../lib/firestore.mjs';

// ---- decoder ----
assert.equal(decodeValue({ stringValue: 'AB 34F' }), 'AB 34F');
assert.equal(decodeValue({ integerValue: '42' }), 42);
assert.equal(decodeValue({ doubleValue: 1.5 }), 1.5);
assert.equal(decodeValue({ booleanValue: true }), true);
assert.equal(decodeValue({ booleanValue: false }), false);
assert.equal(decodeValue({ nullValue: null }), null);
assert.equal(decodeValue({ timestampValue: '2026-01-02T03:04:05Z' }), '2026-01-02T03:04:05Z');
assert.deepEqual(decodeValue({ arrayValue: {} }), []);
assert.deepEqual(decodeValue({ arrayValue: { values: [{ stringValue: '16' }, { integerValue: '3' }] } }), ['16', 3]);
assert.deepEqual(decodeValue({ mapValue: {} }), {});
assert.deepEqual(decodeValue({ mapValue: { fields: { rYear: { integerValue: '3' }, tags: { arrayValue: { values: [{ mapValue: { fields: { k: { stringValue: 'c:16' } } } }] } } } } }),
  { rYear: 3, tags: [{ k: 'c:16' }] });
assert.equal(decodeValue(undefined), null);
assert.deepEqual(decodeFields(undefined), {});
assert.deepEqual(decodeDoc({ name: 'projects/p/databases/(default)/documents/logbooks/x@y.z/cases/c1', fields: { date: { stringValue: '2026-03-01' } } }),
  { date: '2026-03-01', id: 'c1' });
assert.equal(decodeDoc({ name: '.../cases/c1', fields: { id: { stringValue: 'own' } } }).id, 'own');

// ---- client: paging, auth header, 401 retry, 404, query ----
const calls = [];
const json = (status, body) => ({ ok: status < 400, status, statusText: String(status), json: async () => body });
const doc = (id, fields) => ({ name: `x/${id}`, fields });
let first401 = true;
const fetch = async (url, init = {}) => {
  calls.push({ url, init });
  const u = new URL(url);
  if (u.pathname.endsWith('/cases')) {
    if (first401) { first401 = false; return json(401, { error: { message: 'expired' } }); }
    if (!u.searchParams.get('pageToken')) return json(200, { documents: [doc('a', { details: { stringValue: 'one' } })], nextPageToken: 'P2' });
    return json(200, { documents: [doc('b', { details: { stringValue: 'two' } })] });
  }
  if (u.pathname.endsWith('/reflections')) return json(200, {});
  if (u.pathname.endsWith(':runQuery')) return json(200, [{ readTime: 't' }, { document: doc('2024001', { rYear: { integerValue: '3' }, email: { stringValue: 'res@example.com' } }) }]);
  if (u.pathname.includes('/logbooks/')) return json(404, {});
  return json(500, { error: { message: 'unexpected' } });
};
const tokens = [];
const fs = makeFirestore({ projectId: 'apmes-logbook', fetch, getIdToken: async force => { tokens.push(force); return force ? 'fresh' : 'stale'; } });
const src = makeLogbookSource({ firestore: fs, email: 'Res@Example.com' });
assert.equal(src.email, 'res@example.com');

const cases = await src.cases();
assert.deepEqual(cases.map(c => c.details), ['one', 'two']);
assert.deepEqual(tokens.slice(0, 2), [false, true], 'a 401 refreshes the token once');
const caseCalls = calls.filter(c => c.url.includes('/cases'));
assert.equal(caseCalls.length, 3);
assert.ok(caseCalls.every(c => c.url.startsWith('https://firestore.googleapis.com/v1/projects/apmes-logbook/databases/(default)/documents/logbooks/res%40example.com/cases?')));
assert.ok(caseCalls.every(c => new URL(c.url).searchParams.get('pageSize') === '300'));
assert.equal(new URL(caseCalls[2].url).searchParams.get('pageToken'), 'P2');
assert.equal(caseCalls[1].init.headers.Authorization, 'Bearer fresh');

assert.deepEqual(await src.reflections(), []);
assert.equal(await src.logbook(), null, '404 -> null');
const r = await src.resident();
assert.equal(r.rYear, 3);
const q = JSON.parse(calls.find(c => c.url.endsWith(':runQuery')).init.body);
assert.deepEqual(q.structuredQuery.where.fieldFilter, { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: 'res@example.com' } });
assert.deepEqual(q.structuredQuery.from, [{ collectionId: 'residents' }]);

// only own paths: every URL is under logbooks/{own email} or the residents query
for (const c of calls) assert.ok(/\/logbooks\/res%40example\.com(\/|$|\?)|:runQuery$/.test(new URL(c.url).pathname + (c.url.includes('?') ? '?' : '')), c.url);

// 403 -> clear error; residents 403 -> null
const deny = makeFirestore({ projectId: 'p', getIdToken: async () => 't', fetch: async () => json(403, { error: { message: 'Missing or insufficient permissions.' } }) });
await assert.rejects(() => deny.listCollection(['logbooks', 'a@b.c', 'cases']), /refused access/);
assert.equal(await makeLogbookSource({ firestore: deny, email: 'a@b.c' }).resident(), null);
assert.throws(() => makeLogbookSource({ firestore: deny, email: '' }), /email/);

console.log('firestore.test.mjs: ok');
