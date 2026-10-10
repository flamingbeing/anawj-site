// Run with: node logbook/test/cloud.test.mjs  (fake data only)
// Exercises cloud.js in demo mode (the in-browser backend, here with an in-memory store) and the
// shared field whitelists. The Firestore rules are tested separately against the emulator (README).
import assert from 'node:assert/strict';

globalThis.location = { search: '?demo' };
const cloud = await import('../js/cloud.js');
const { resetDemo, cleanCase, cleanSummary, cleanResident, importDocId, DEMO_USER } = await import('../js/demo-backend.js');

assert.equal(cloud.demo, true);
assert.equal(cloud.enabled, true);

// whitelists
{
  const c = cleanCase({ id: 'x', date: '', details: 'a'.repeat(3000), cats: ['16', '16', '17', ...Array(50).fill(0).map((_, i) => 'c' + i)], rid: 'leak', timestamp: 5, flags: ['needsDate'] }, 99);
  assert.deepEqual(Object.keys(c).sort(), ['cats', 'createdAt', 'date', 'details', 'id', 'source', 'updatedAt']);
  assert.equal(c.date, null);
  assert.equal(c.details.length, 2000);
  assert.equal(c.cats.length, 40);
  assert.deepEqual(c.cats.slice(0, 2), ['16', '17']);
  assert.equal(c.updatedAt, 99);
  assert.ok(cleanCase({ details: 'no id', cats: [] }).id.length >= 8);
  const s = cleanSummary('R1', { rid: 'other', counts: { '16': 2 }, total: 2, details: 'leak', extra: 1 }, 5);
  assert.deepEqual(Object.keys(s).sort(), ['counts', 'rid', 'total', 'updatedAt']);
  assert.equal(s.rid, 'R1');
  const r = cleanResident({ rid: 202303, name: 'X', email: ' Foo@Example.COM ', intake: '2023', rYear: '', notes: 'n' });
  assert.deepEqual(r, { rid: '202303', name: 'X', email: 'foo@example.com', status: 'ACTIVE', intake: 2023, rYear: null });
  assert.match(importDocId('ab/c#0'), /^imp_ab~002fc~00230$/);
  assert.match(importDocId('k9Zx_-#12'), /^[A-Za-z0-9_~-]+$/);
}

resetDemo({ seeded: false });
const E = DEMO_USER.email;

// user and admin
{
  const seen = [];
  await cloud.watchUser(u => seen.push(u && u.email));
  assert.deepEqual(seen, [E]);
  await cloud.signOut();
  await cloud.signIn();
  assert.deepEqual(seen, [E, null, E]);
  assert.equal(await cloud.isAdmin(E), true);
  assert.equal(await cloud.isAdmin('someone@example.com'), false);
  assert.equal(await cloud.myResident(E), null);
}

// logbook doc
{
  const lb = await cloud.loadLogbook(E);
  assert.equal(lb.email, E);
  assert.deepEqual(lb.templates, []);
  await cloud.saveLogbook(E, { settings: { suggest: false } });
  await cloud.saveLogbook(E, { settings: { other: 1 }, templates: [{ id: 't', name: 'T', cats: ['16'] }] });
  const lb2 = await cloud.loadLogbook(E.toUpperCase());
  assert.deepEqual(lb2.settings, { suggest: false, other: 1 });
  assert.equal(lb2.templates.length, 1);
}

// cases: watchCases fires immediately and on every change, newest first
{
  const calls = [];
  const stop = cloud.watchCases(E, cases => calls.push(cases));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], []);
  await cloud.saveCase(E, { id: 'a', date: '2026-01-01', details: 'AB 30F LSCS', cats: ['16'], createdAt: 1 });
  await cloud.saveCase(E, { id: 'b', date: '2026-02-01', details: 'CD 70M TKR', cats: ['18', '21'], createdAt: 2 });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].map(c => c.id), ['b', 'a']);
  calls[2][0].details = 'mutated';   // callers get copies
  await cloud.saveCases(E, [{ id: 'c', date: null, dateText: '31/6/24', details: 'x', cats: [] }, { id: 'a', date: '2026-01-01', details: 'AB 30F LSCS spinal', cats: ['16', '17'] }]);
  const last = calls.at(-1);
  assert.deepEqual(last.map(c => c.id), ['b', 'a', 'c']);
  assert.equal(last[0].details, 'CD 70M TKR');
  assert.deepEqual(last[1].cats, ['16', '17']);
  await cloud.deleteCase(E, 'c');
  await cloud.deleteCases(E, ['b']);
  assert.deepEqual(calls.at(-1).map(c => c.id), ['a']);
  const before = calls.length;
  stop();
  await cloud.saveCase(E, { id: 'd', date: '2026-03-01', details: 'y', cats: [] });
  assert.equal(calls.length, before);
  await cloud.deleteCase(E, 'd');
}

// import: only new keys written, re-import skips
{
  const rows = [
    { rid: 'R1', date: '2024-07-01', details: 'EF 6yo circumcision', cats: ['20', '20iii'], timestamp: 1720000000000, importKey: 'h1#0' },
    { rid: 'R1', date: '2024-07-01', details: 'EF 6yo circumcision', cats: ['20', '20iii'], timestamp: 1720000000000, importKey: 'h1#1' },
    { rid: 'R1', date: null, dateText: '31/6/24', details: 'GH lap chole', cats: ['08'], timestamp: null, importKey: 'h2#0' },
  ];
  const prog = [];
  assert.deepEqual(await cloud.importCases('Other@Example.com', 'R1', rows, (d, t) => prog.push([d, t])), { written: 3, skipped: 0 });
  assert.deepEqual(prog.at(-1), [3, 3]);
  assert.deepEqual(await cloud.importCases('other@example.com', 'R1', [...rows, { ...rows[2], importKey: 'h3#0' }]), { written: 1, skipped: 3 });
  const got = [];
  cloud.watchCases('other@example.com', cs => got.push(cs))();
  assert.equal(got[0].length, 4);
  assert.ok(got[0].every(c => c.source === 'import' && c.id.startsWith('imp_')));
  // after an email fix the import record no longer applies: everything goes to the new address
  assert.deepEqual(await cloud.importCases('fixed@example.com', 'R1', rows), { written: 3, skipped: 0 });
  assert.equal((await cloud.listCases('fixed@example.com')).length, 3);
  assert.equal(got[0].find(c => c.importKey === 'h1#0').createdAt, 1720000000000);
}

// summaries, residents, shared templates
{
  await cloud.writeSummary('R1', { name: 'Resident A', intake: 2024, rYear: 2, counts: { '16': 3 }, total: 3, reflections: {}, reflectionsTotal: 0, details: 'never stored' });
  const sums = await cloud.listSummaries();
  assert.equal(sums.length, 1);
  assert.equal(sums[0].details, undefined);
  await cloud.saveResident({ rid: 'R1', name: 'Resident A', email: 'A@example.com', status: 'ACTIVE', intake: 2024, rYear: 2 });
  await cloud.saveResident({ rid: 'D9', name: 'Demo', email: E, status: 'ACTIVE', intake: 2025, rYear: 1 });
  assert.equal((await cloud.myResident(E)).rid, 'D9');
  assert.deepEqual((await cloud.listResidents()).map(r => r.rid), ['D9', 'R1']);
  await cloud.deleteResident('R1');
  assert.equal((await cloud.listResidents()).length, 1);
  const t = await cloud.saveSharedTemplate({ name: 'LSCS spinal', cats: ['16', '17', '28'] });
  assert.ok(t.id);
  await cloud.saveSharedTemplate({ ...t, name: 'LSCS SAB' });
  assert.deepEqual((await cloud.listSharedTemplates()).map(x => x.name), ['LSCS SAB']);
  await cloud.deleteSharedTemplate(t.id);
  assert.equal((await cloud.listSharedTemplates()).length, 0);
}

// seeded demo store has a resident record and fake classmates
{
  resetDemo();
  assert.equal((await cloud.myResident(E)).rid, 'DEMO01');
  assert.ok((await cloud.listSummaries()).length >= 3);
  let first = null;
  cloud.watchCases(E, cs => { first ??= cs; })();
  assert.ok(first.length > 0);
}

console.log('cloud (demo) tests passed');
