// Run with: node logbook/test/bin.test.mjs  (demo backend, fake data only)
import assert from 'node:assert/strict';
globalThis.location = { search: '?demo' };
// Device recovery storage: explicit in-memory browser adapter for this Node test.
const device = new Map();
globalThis.localStorage = { getItem: k => device.get(k) || null, setItem: (k,v) => { device.set(k,String(v)); Object.defineProperty(localStorage,k,{value:String(v),configurable:true,enumerable:true}); }, removeItem: k => { device.delete(k); delete localStorage[k]; } };
const cloud = await import('../js/cloud.js');
const { resetDemo, DEMO_USER } = await import('../js/demo-backend.js');
const { S, setCases, resetCaches } = await import('../js/ui-core.js');
const B = await import('../js/bin.js');

const DAY = 864e5, now = Date.parse('2026-03-01T00:00:00Z');
// pure helpers
assert.equal(B.daysAgo(now - 3 * DAY, now), 3);
assert.equal(B.daysLeft(now - 3 * DAY, now), 27);
assert.equal(B.binLabel({ deletedAt: now - 3 * DAY }, now), 'deleted 3 days ago · 27 days left');
assert.equal(B.binLabel({ deletedAt: now }, now), 'deleted today · 30 days left');
assert.equal(B.isExpired({ deletedAt: now - 31 * DAY }, now), true);
assert.equal(B.isExpired({ deletedAt: now - 29 * DAY }, now), false);
assert.equal(B.isExpired({}, now), true);
assert.deepEqual(B.imageIdsOf({ kind: 'reflection', data: { figures: [{ id: 'i1' }, { id: 'i2' }] } }), ['i1', 'i2']);
assert.deepEqual(B.imageIdsOf({ kind: 'case', data: {} }), []);
assert.throws(() => B.binEntry('summary', {}));
const e0 = B.binEntry('case', { id: 'x1', date: '2026-01-02', details: 'AB 5yo tonsil', cats: ['10'], junk: 1 }, now);
assert.equal(e0.kind, 'case'); assert.equal(e0.data.id, 'x1'); assert.equal(e0.data.junk, undefined); assert.ok(e0.id.startsWith('c_x1_'));

// case: delete -> bin -> restore
resetDemo({ seeded: true });
const email = DEMO_USER.email;
S.user = { ...DEMO_USER };
setCases(await cloud.listCases(email));
const before = S.cases.length;
const victim = S.cases[0];
const entry = await B.moveToBin('case', victim);
assert.equal(S.cases.length, before - 1, 'gone from S.cases');
assert.equal((await cloud.listCases(email)).length, before - 1, 'gone from store');
let bin = await cloud.listBin(email);
assert.equal(bin.length, 1); assert.equal(bin[0].data.details, victim.details);
const back = await B.restoreFromBin(entry.id);
assert.equal(back.id, victim.id, 'same id when free');
assert.equal(S.cases.length, before);
assert.equal((await cloud.listCases(email)).length, before);
assert.equal((await cloud.listBin(email)).length, 0);

// restoring when the id is taken gives a new id
const e2 = await B.moveToBin('case', victim);
await cloud.saveCase(email, victim); setCases(await cloud.listCases(email));
const back2 = await B.restoreFromBin(e2.id);
assert.notEqual(back2.id, victim.id);
assert.equal((await cloud.listCases(email)).length, before + 1);

// bulk
const two = S.cases.slice(0, 2);
const es = await B.moveToBin('case', two);
assert.equal(es.length, 2);
assert.equal(S.cases.length, before - 1);
assert.equal((await cloud.listBin(email)).length, 2);

// reflection with figures: images kept until purge
await cloud.saveImage(email, { id: 'img1', data: 'QUJD', mime: 'image/jpeg', w: 1, h: 1, createdAt: 1 });
const r = await cloud.saveReflection(email, { id: 'r1', headingId: 'thyroid', initials: 'AB', title: 'Made-up', figures: [{ id: 'img1', caption: 'x', point: null }], status: 'draft' });
S.reflections = [r];
const re = await B.moveToBin('reflection', r);
assert.equal(S.reflections.length, 0);
assert.ok(await cloud.loadImage(email, 'img1'), 'image kept while binned');
// age the reflection entry and one case entry past 30 days, then purge
await cloud.saveBinEntry(email, { ...re, deletedAt: Date.now() - 31 * DAY });
await cloud.saveBinEntry(email, { ...es[0], deletedAt: Date.now() - 40 * DAY });
const n = await B.purgeExpired();
assert.equal(n, 2);
assert.equal(await cloud.loadImage(email, 'img1'), null, 'image purged with its entry');
bin = await cloud.listBin(email);
assert.deepEqual(bin.map(x => x.id), [es[1].id]);
assert.equal(await B.purgeExpired(), 0, 'runs once per user');

// delete forever
await B.deleteForever(es[1].id);
assert.equal((await cloud.listBin(email)).length, 0);
await assert.rejects(B.restoreFromBin('nope'));

// a reflection finished on another device while this one shows its outline: binning the outline is refused, the
// finished text stays and no copy is left in the bin (a blind delete lost it, and the bin kept only the outline)
const { writes } = await import('../js/ui-core.js');
const D = await import('../js/demo-backend.js');
const reflOf = id => D.reflectionsOf(email.toLowerCase()).find(x => x.id === id);
// just enough page for the toasts (what they say is kept)
const toasts = [];
const node = () => ({ nodeType: 1, children: [], classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {}, append(...k) { this.children.push(...k); }, replaceChildren(...k) { this.children = k; } });
const text = n => (n.nodeType === 3 ? n.textContent : (n.children || []).map(text).join(''));
const toastEl = { ...node(), replaceChildren(...k) { toasts.push(k.map(text).join(' ')); } };
globalThis.document = { createElement: node, createTextNode: t => ({ nodeType: 3, textContent: String(t) }), getElementById: () => toastEl };
const vOld = await cloud.saveReflection(email, { id: 'r9', headingId: 'thyroid', initials: 'AB', title: 'Made-up', summary: 'outline', status: 'draft' });
await cloud.saveReflection(email, { ...vOld, summary: '900 finished words' });
S.reflections = [vOld];
await assert.rejects(B.moveToBin('reflection', vOld), /changed elsewhere/);
assert.equal(reflOf('r9')?.summary, '900 finished words', 'the newer version kept');
assert.match(toasts.at(-1), /A reflection you deleted was changed on another device, so it was kept/);
assert.equal((await cloud.listBin(email)).filter(e => e.data.id === 'r9').length, 0, 'no copy left in the bin');
assert.ok(!writes.entries().some(x => x.kind === 'reflection' && x.record.id === 'r9' && (x.state === 'conflict' || x.state === 'failed')), 'the refused delete is set aside');
// the same reflection, up to date here: it goes, through the write queue
S.reflections = [reflOf('r9')];
const rOk = await B.moveToBin('reflection', S.reflections[0]);
assert.equal(reflOf('r9'), undefined, 'deleted on the server');
assert.equal(S.reflections.length, 0, 'gone from the list at once');
assert.equal(rOk.data.summary, '900 finished words');
assert.equal(writes.status('reflection', 'r9'), 'synced');
await B.restoreFromBin(rOk.id);
// the editor: the bin keeps what is on screen (unsaved typing too) and the delete checks the version it last saved;
// the bin copy carries that version's stamp, so other devices remove their copy of it
const saved = reflOf('r9');
const onScreen = { ...saved, summary: '900 finished words and a few typed', updatedAt: saved.updatedAt - 5000 };
S.reflections = [saved];
const rEd = await B.moveToBin('reflection', onScreen, { base: saved });
assert.equal(reflOf('r9'), undefined);
assert.equal(rEd.data.summary, '900 finished words and a few typed');
assert.equal(rEd.data.updatedAt, saved.updatedAt);
await B.restoreFromBin(rEd.id);
// ...and one changed elsewhere since the editor last saved is kept
const ed2 = reflOf('r9');
await cloud.saveReflection(email, { ...ed2, summary: 'edited on the laptop' });
await assert.rejects(B.moveToBin('reflection', { ...ed2, summary: 'typed here' }, { base: ed2 }), /changed elsewhere/);
assert.equal(reflOf('r9')?.summary, 'edited on the laptop');
// a delete that fails (not a conflict): the copy leaves the bin and nothing is written over the server's copy
writes.configure({ backend: async (em, kind, rec, bs) => { if (rec._deleted) throw Object.assign(new Error('Fake refusal'), { code: 'permission-denied' }); return cloud.commitRecord(em, kind, rec, bs); } });
const cur = reflOf('r9');
S.reflections = [cur];
await assert.rejects(B.moveToBin('reflection', cur), /Fake refusal/);
writes.configure({ backend: cloud.commitRecord });
assert.equal(reflOf('r9')?.summary, 'edited on the laptop');
assert.equal((await cloud.listBin(email)).filter(e => e.data.id === 'r9').length, 0);

resetCaches();
console.log('bin tests passed');
