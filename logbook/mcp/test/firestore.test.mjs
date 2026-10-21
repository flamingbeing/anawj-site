// Run with: node logbook/mcp/test/firestore.test.mjs  (no network: fetch is stubbed)
import assert from 'node:assert/strict';
import { decodeValue, decodeFields, decodeDoc, encodeValue, encodeFields, makeFirestore, makeLogbookSource } from '../lib/firestore.mjs';

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

// ---- encoder: round trip, integers stay integers (rules check createdAt is number, cats is list) ----
const sample = { id: 'c9', date: null, initials: 'EF', details: 'made up', cats: ['16', '28'], createdAt: 1760000000000, x: 1.5, reflectTag: true, empty: [], m: { a: 'b' } };
assert.deepEqual(encodeValue(1760000000000), { integerValue: '1760000000000' });
assert.deepEqual(encodeValue([]), { arrayValue: {} });
assert.deepEqual(decodeFields(encodeFields(sample)), sample);
assert.deepEqual(Object.keys(encodeFields({ a: 1, b: undefined })), ['a']);

// ---- writes: PATCH the whole document at its own path; the outbox entry only if not there yet ----
const wcalls = [];
const wfs = makeFirestore({ projectId: 'apmes-logbook', getIdToken: async () => 't', fetch: async (url, init) => {
  wcalls.push({ url, init });
  return json(200, { name: url.split('?')[0], fields: JSON.parse(init.body).fields });
} });
const wsrc = makeLogbookSource({ firestore: wfs, email: 'res@example.com' });
const saved = await wsrc.saveCase({ id: 'c9', details: 'made up', cats: ['16'], createdAt: 5 });
assert.equal(saved.details, 'made up');
assert.equal(wcalls[0].init.method, 'PATCH');
assert.equal(wcalls[0].url, 'https://firestore.googleapis.com/v1/projects/apmes-logbook/databases/(default)/documents/logbooks/res%40example.com/cases/c9');
assert.deepEqual(JSON.parse(wcalls[0].init.body).fields.createdAt, { integerValue: '5' });
await wsrc.saveReflection({ id: 'r9', headingId: 'lscs', status: 'draft' });
assert.ok(wcalls[1].url.endsWith('/logbooks/res%40example.com/reflections/r9'));
await wsrc.queueSheetRow({ id: 'c9', email: 'res@example.com', rid: '2024001', details: 'x', cats: [], createdAt: 5 });
assert.ok(wcalls[2].url.endsWith('/documents/sheetOutbox/c9?currentDocument.exists=false'));
// the plan: only plan, email and updatedAt change on the logbook document (an update mask), the rest stays
await wsrc.savePlan([{ id: 'p1', date: '2030-01-01', details: 'x', cats: [] }]);
assert.equal(wcalls[3].url, 'https://firestore.googleapis.com/v1/projects/apmes-logbook/databases/(default)/documents/logbooks/res%40example.com'
  + '?updateMask.fieldPaths=email&updateMask.fieldPaths=plan&updateMask.fieldPaths=updatedAt');
assert.deepEqual(Object.keys(JSON.parse(wcalls[3].init.body).fields), ['email', 'plan', 'updatedAt']);
await assert.rejects(() => deny.setDoc(['logbooks', 'a@b.c', 'cases', 'x'], { id: 'x' }), /refused access/);

console.log('firestore.test.mjs: ok');
