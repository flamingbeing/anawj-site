// Run with: node logbook/test/backup.test.mjs  (demo backend, fake data only)
// Restore from a backup adds only what is missing (worked out from the lists as they are when Restore is tapped) and
// never writes over a case or reflection the server has, even one the lists here didn't show yet (a new phone still
// loading); a backup for Google Drive / Dropbox holds the server's notes, not this device's older copy.
import assert from 'node:assert/strict';
globalThis.location = { search: '?demo' };
const device = new Map();
globalThis.localStorage = { getItem: k => device.get(k) || null, setItem: (k,v) => { device.set(k,String(v)); Object.defineProperty(localStorage,k,{value:String(v),configurable:true,enumerable:true}); }, removeItem: k => { device.delete(k); delete localStorage[k]; } };
const cloud = await import('../js/cloud.js');
const D = await import('../js/demo-backend.js');
const { openStore } = await import('../js/store.js');
const { S, setCases, addMissingCases, resetCaches } = await import('../js/ui-core.js');
const B = await import('../js/backup.js');

D.resetDemo({ seeded: true });
const email = D.DEMO_USER.email;
S.user = { ...D.DEMO_USER };
S.logbook = { name: 'Fake', settings: {}, templates: [] };
setCases(await cloud.listCases(email));
const r1 = await cloud.saveReflection(email, { id: 'fake-r1', headingId: 'thyroid', initials: 'AB', title: 'Fake', summary: 'first draft', status: 'draft' });
const r2 = await cloud.saveReflection(email, { id: 'fake-r2', headingId: 'thyroid', initials: 'CD', title: 'Fake two', summary: 'kept', status: 'draft' });
S.reflections = [r1, r2]; S.notes = [];
const n0 = S.cases.length;
assert.ok(n0 >= 3, 'seeded cases');
const backup = { format: 'apmes-logbook-backup', version: 1, cases: S.cases.map(c => ({ ...c })), reflections: [r1, r2], notes: [] };

// the plan: only what this logbook doesn't have
let p = B.restorePlan(backup);
assert.equal(p.cases.length, 0); assert.equal(p.refl.length, 0); assert.equal(p.nothing, true);

// since the backup: one case and one reflection edited (another device), one case and one reflection deleted
const [c1, c2] = S.cases;
await cloud.saveCase(email, { ...c1, details: c1.details + ' EDITED LATER' });
await cloud.saveReflection(email, { ...r1, summary: '900 finished words' });
await cloud.deleteCase(email, c2.id);
await cloud.deleteReflection(email, r2.id);

// a list still loading (empty here) counts everything as missing...
setCases([]); S.reflections = [];
p = B.restorePlan(backup);
assert.equal(p.cases.length, n0); assert.equal(p.refl.length, 2);
// ...but the writes add only what the server doesn't have: the edited copies are never replaced by the backup's
const added = await addMissingCases(p.cases);
assert.deepEqual(added.map(c => c.id), [c2.id], 'only the deleted case is added');
const server = await cloud.listCases(email);
assert.equal(server.length, n0);
assert.equal(server.find(c => c.id === c1.id).details, c1.details + ' EDITED LATER', 'edited case kept');
assert.ok(S.cases.some(c => c.id === c2.id), 'the added case shows at once');
const addedRefl = await cloud.addMissing(email, 'reflection', p.refl);
assert.deepEqual(addedRefl.map(r => r.id), [r2.id], 'only the deleted reflection is added');
const refls = D.reflectionsOf(email.toLowerCase());
assert.equal(refls.find(r => r.id === r1.id).summary, '900 finished words', 'edited reflection kept');
assert.equal(refls.find(r => r.id === r2.id).summary, 'kept');
// a restored record is stamped now (other devices' "changed since" reads see it), and repeats in a file go once
assert.ok(addedRefl[0].updatedAt > r2.updatedAt);
assert.deepEqual((await cloud.addMissing(email, 'case', [{ ...c1, id: 'fake-new' }, { ...c1, id: 'fake-new' }])).map(c => c.id), ['fake-new']);
assert.deepEqual(await cloud.addMissing(email, 'case', []), []);

// once the lists are in, the plan is worked out against them again
setCases(await cloud.listCases(email)); S.reflections = D.reflectionsOf(email.toLowerCase());
p = B.restorePlan(backup);
assert.equal(p.cases.length, 0); assert.equal(p.refl.length, 0);

// notes: this device's copy is a day old (an edited note and a new one are only on the server)
const t = Date.now();
const store = await openStore(email);
await store.write('notes', { put: [{ id: 'fake-n1', date: null, title: 'Doses', body: 'old text', createdAt: 1, updatedAt: t - 864e5 }], meta: { syncAt: t - 864e5, fullAt: t - 864e5 } });
D.saveNote(email, { id: 'fake-n1', date: null, title: 'Doses', body: 'new text', createdAt: 1, updatedAt: t });
D.saveNote(email, { id: 'fake-n2', date: null, title: 'New on the laptop', body: 'x', createdAt: 2, updatedAt: t });
S.casesSynced = false; S.reflectionsSynced = false;
// Save to Drive / Dropbox waits for the server's copy of everything, or says it didn't load
await assert.rejects(B.makeBackup({ fromServer: true, wait: 300 }), /your logbook didn’t finish loading/);
S.casesSynced = true; S.reflectionsSynced = true;
const data = await B.makeBackup({ fromServer: true });
assert.deepEqual(data.notes.map(n => n.id + ':' + n.body).sort(), ['fake-n1:new text', 'fake-n2:x'], 'the server’s notes');
assert.equal(data.cases.length, n0 + 1);
assert.ok(!('noteIndex' in data.logbook.settings));

// restoring notes: only the ones the server doesn't have
p = B.restorePlan({ ...backup, notes: [{ id: 'fake-n1', title: 'Doses', body: 'old text', createdAt: 1, updatedAt: 5 }, { id: 'fake-n3', title: 'Gone', body: 'y', createdAt: 3, updatedAt: 5 }] });
assert.deepEqual(p.notes.map(n => n.id), ['fake-n3']);

resetCaches();
console.log('backup tests passed');
process.exit(0);
