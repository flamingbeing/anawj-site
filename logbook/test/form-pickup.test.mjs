// Run with: node logbook/test/form-pickup.test.mjs  (fake data only)
// The Google Form pick-up through cloud.js's real Firestore code (not the demo backend), against an in-memory stand-in
// for the Firebase SDK (fake-firebase.mjs) whose batches take a scripted time on a fake clock.
import assert from 'node:assert/strict';
import { register } from 'node:module';

const fakeUrl = new URL('./fake-firebase.mjs', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
  let fake;
  export function initialize(d) { fake = d.fake; }
  export async function resolve(spec, ctx, next) {
    if (/^https:\\/\\/www\\.gstatic\\.com\\/firebasejs\\/[^/]+\\/firebase-(app|auth|firestore)\\.js$/.test(spec)) return { url: fake, shortCircuit: true };
    return next(spec, ctx);
  }`), { data: { fake: fakeUrl } });

let clock = Date.UTC(2026, 9, 20, 1, 0, 0);
const realNow = Date.now;
Date.now = () => clock;
globalThis.location = { search: '', hostname: 'apmes.anawj.com' };
const device = new Map();
globalThis.localStorage = { getItem: k => device.get(k) ?? null, setItem: (k, v) => device.set(k, String(v)), removeItem: k => device.delete(k) };

const F = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
F.net.wait = async ms => { await new Promise(r => setImmediate(r)); clock += ms; };
const cloud = await import('../js/cloud.js');
const { mergeFormEntries, pickUp, pickupMessage, formCaseId, withoutFormCases } = await import('../js/form-inbox.js');
assert.equal(cloud.demo, false);

const E = 'fake.resident@example.com';
const LSCS = '16) Lower Segment Caesarean Section (10 | 20)', GA = '01) General Anaesthesia (100 | 200)';
const cases = () => new Map([...F.server].filter(([p]) => p.startsWith(`logbooks/${E}/cases/`)).map(([, d]) => [d.id, d]));
const inbox = id => F.server.get('formInbox/' + id);
const entry = (id, extra = {}) => ({ id, email: E, date: '2026-10-16', details: 'AB fake case ' + id, labels: [LSCS], submittedAt: clock - 864e5, ...extra });
const send = e => { F.server.set('formInbox/' + e.id, e); return e; };
const reset = () => { F.server.clear(); F.net.delays = []; F.net.fail.clear(); };
const keyAt = d => Number(/@(\d+)$/.exec(d.importKey)[1]);

// A pick-up on a slow connection: the loop waits for the server after each entry, so later cases are written well
// after the pick-up began. Each key's time is the updatedAt actually written, so none of them looks edited in the app,
// and the response's next edit in the Form still reaches the case.
{
  reset();
  const entries = Array.from({ length: 12 }, (_, i) => send(entry('slow' + i, { submittedAt: clock - 864e5 + i })));
  F.net.delays = [150, 150, 12000];   // one 12 s stall (a lift, a Wi-Fi handover) on the 3rd commit
  const r = mergeFormEntries(entries, new Map(), Date.now());
  const byCase = new Map(r.save.map(c => [c.id, c]));
  const done = await cloud.commitFormPickup(E, r.done.map(id => ({ id, case: byCase.get(formCaseId(id)) || null })));
  assert.equal(done.length, 12);
  assert.ok(clock - r.save[0].updatedAt > 12000, 'the loop took longer than SAVE_SLACK');
  for (const d of cases().values()) assert.ok(d.updatedAt - keyAt(d) <= 10000, `${d.id}: looks edited in the app`);
  for (const d of cases().values()) assert.equal(keyAt(d), d.updatedAt, `${d.id}: key time is the write time`);
  assert.equal(inbox('slow11'), undefined);
  // a week later the resident edits the last response in the Form (adds GA)
  clock += 7 * 864e5;
  const edit = send({ ...entries[11], labels: [LSCS, GA], details: 'AB fake case corrected', submittedAt: clock - 60e3 });
  const r2 = await pickUp(cloud, E, [edit], { cases: () => [...cases().values()] });
  assert.deepEqual([r2.save.length, r2.kept], [1, []]);
  assert.deepEqual(cases().get(formCaseId('slow11')).cats, ['01', '16']);
  assert.equal(pickupMessage(r2), '1 case from the Google Form added to your logbook.');
}

// The recycle bin or the deleted-Form-cases list can't be read: nothing is written, the entries wait for next time
for (const coll of ['bin', 'formGone']) {
  reset();
  const e = send(entry('wait-' + coll));
  F.net.fail.add(`logbooks/${E}/${coll}`);
  await assert.rejects(pickUp(cloud, E, [e], { cases: () => [] }));
  assert.equal(cases().size, 0, coll + ': no case written');
  assert.ok(inbox(e.id), coll + ': the entry waits');
  F.net.fail.clear();
  assert.equal((await pickUp(cloud, E, [e], { cases: () => [] })).save.length, 1);   // next time it works
}

// A deleted Form case doesn't come back: in the bin (read from the server, not the device's cache), and after its bin
// entry has gone (purged after 30 days, Delete forever), through the formGone list
{
  reset();
  F.server.set(`logbooks/${E}/bin/c_x_1`, { id: 'c_x_1', kind: 'case', data: { id: formCaseId('binned'), source: 'form' }, deletedAt: clock });
  await cloud.addFormGone(E, [formCaseId('purged'), 'c1', 'imp_abc~00230']);   // only Form case ids are kept
  assert.deepEqual(await cloud.listFormGone(E), [formCaseId('purged')]);
  assert.deepEqual(F.server.get(`logbooks/${E}/formGone/${formCaseId('purged')}`), { id: formCaseId('purged'), deletedAt: clock });
  const es = ['binned', 'purged', 'fresh'].map(id => send(entry(id)));
  const r = await pickUp(cloud, E, es, { cases: () => [] });
  assert.deepEqual(r.gone, ['binned', 'purged']);
  assert.deepEqual([...cases().keys()], [formCaseId('fresh')]);
  for (const e of es) assert.equal(inbox(e.id), undefined, e.id + ' left the inbox');
}

// A wrong imported case deleted (in the bin), then a corrected response sent on the Form for that day: it is added (a
// response that only has the binned case's day, initials and categories is never dropped quietly), and the toast says so
{
  reset();
  const t = Date.UTC(2026, 9, 10, 2, 0, 0);
  F.server.set(`logbooks/${E}/bin/c_imp_1`, { id: 'c_imp_1', kind: 'case', deletedAt: clock,
    data: { id: 'imp_zz', source: 'import', date: '2026-10-10', initials: 'AB', details: '34F fake typo', cats: ['16'], createdAt: t + 8 * 3600e3, updatedAt: 1 } });
  const e = send(entry('corrected', { date: '2026-10-10', details: 'AB 34F fake case (corrected)', submittedAt: clock - 60e3 }));
  const same = send(entry('sameresp', { date: '2026-10-10', details: 'AB 34F fake typo', submittedAt: t }));   // the import's own response
  const r = await pickUp(cloud, E, [e, same], { cases: () => [] });
  assert.deepEqual([[...cases().keys()], r.gone, r.binLike], [[formCaseId('corrected')], ['sameresp'], ['corrected']]);
  assert.match(pickupMessage(r), /^1 case from the Google Form added to your logbook; it has the same day, initials and categories as a case in your recycle bin/);
  assert.equal(inbox('sameresp'), undefined);
}

// A Form case the resident changed in the app keeps their version; the response's newest submit is still noted on it
// (only the key changes, keeping its time), so a re-run of the workbook import leaves the edited sheet row out
{
  reset();
  const first = send(entry('kept1', { submittedAt: clock - 864e5 }));
  await pickUp(cloud, E, [first], { cases: () => [] });
  const written = cases().get(formCaseId('kept1'));
  clock += 3600e3;
  F.server.set(`logbooks/${E}/cases/${written.id}`, { ...written, details: 'my own words', updatedAt: clock });   // edited in the app
  clock += 864e5;
  const edit = send({ ...first, details: 'AB changed on the Form', submittedAt: clock - 60e3 });
  const r = await pickUp(cloud, E, [edit], { cases: () => [...cases().values()] });
  assert.deepEqual([r.save, r.kept], [[], ['kept1']]);
  assert.equal(pickupMessage(r), '1 edited Form response left as you changed it here.');
  const now1 = cases().get(written.id);
  assert.equal(now1.details, 'my own words');
  assert.equal(now1.importKey, `form:kept1~${edit.submittedAt}@${keyAt(written)}`);
  assert.ok(now1.updatedAt > written.updatedAt + 3600e3, 'stamped, so other devices get the new key');
  assert.equal(inbox('kept1'), undefined);
  assert.equal(withoutFormCases([{ date: '2026-10-16', createdAt: edit.submittedAt + 8 * 3600e3 }], [now1]).dropped, 1);
  // ... and it stays the resident's
  clock += 864e5;
  const again = send({ ...first, details: 'AB changed again', submittedAt: clock - 60e3 });
  assert.deepEqual((await pickUp(cloud, E, [again], { cases: () => [...cases().values()] })).kept, ['kept1']);
  assert.equal(cases().get(written.id).details, 'my own words');
}

// Delete account reads the deleted-Form-cases list first: if that is refused (its rules not live yet), it stops before
// anything else is deleted, and says nothing was
{
  reset();
  F.net.fail.add(`logbooks/${E}/formGone`);
  const steps = [];
  const err = await cloud.deleteAccount(E, t => steps.push(t)).then(() => null, e => e);
  assert.ok(err, 'refused');
  assert.equal(err.started, undefined, 'nothing deleted yet');
  assert.deepEqual(steps, ['Deleting deleted Form cases…']);
}

Date.now = realNow;
console.log('form-pickup tests passed');
