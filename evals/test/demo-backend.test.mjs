// Run with: node evals/test/demo-backend.test.mjs  (fake data only)
// Node has no localStorage, so this also checks the in-memory fallback.
import assert from 'node:assert/strict';
import * as D from '../js/demo-backend.js';
import { FORMS } from '../js/forms.js';
import { validate } from '../js/engine.js';
import { itemById } from '../js/catalogue.js';

let n = 0;
async function t(name, fn) { n++; try { await fn(); } catch (e) { console.log('FAIL', name); throw e; } }
const rejects = (p, re = /permission/) => assert.rejects(p, re);
const { resident: RES, assessor: FAC, admin: ADM } = D.DEMO_USERS;
const as = role => D.setDemoRole(role);

await t('memory fallback and seed', async () => {
  assert.equal(typeof localStorage, 'undefined');
  as('admin');
  const people = await D.listResidents();
  assert.equal(people.length, 8);
  assert.ok(people.some(r => r.email === RES.email && r.status === 'ACTIVE'));
  const fac = await D.listFaculty();
  assert.equal(fac.length, 6);
  assert.ok(fac.some(f => f.status === 'INACTIVE'));
  let all = [];
  const stop = D.watchAll(list => { all = list; });
  assert.ok(all.length >= 12);
  assert.deepEqual(new Set(all.map(e => e.status)), new Set(D.STATUSES));
  assert.deepEqual(new Set(all.map(e => e.formId)), new Set(['dops', 'minicex', 'ebd']));
  stop();
});

await t('seeded data is made up and consistent', async () => {
  as('admin');
  let all = [];
  D.watchAll(list => { all = list; })();
  const fac = new Map((await D.listFaculty()).map(f => [f.email, f]));
  for (const e of all) {
    assert.match(e.residentEmail, /@example\.com$/);
    assert.match(e.assessorEmail, /@example\.com$/);
    assert.ok(fac.has(e.assessorEmail), e.assessorEmail);
    assert.equal(e.source, 'evals');
    const item = itemById(e.itemId);
    assert.ok(item, 'item in catalogue: ' + e.itemId);
    assert.equal(item.formId, e.formId);
    assert.equal(item.tool, e.tool);
    if (e.status === 'submitted') {
      const v = validate(FORMS[e.formId], e.assessment);
      assert.ok(v.ok, e.id + ' ' + JSON.stringify(v.errors) + ' missing ' + v.missing);
    }
  }
});

await t('roles of the three demo identities', async () => {
  as('resident');
  const r = await D.getRoles(RES.email);
  assert.equal(r.resident.rid, 'DEMO01');
  assert.equal(r.admin, false);
  assert.equal(r.faculty, null);
  const f = await D.getRoles(FAC.email);
  assert.equal(f.faculty.status, 'ACTIVE');
  assert.equal(f.resident, null);
  const a = await D.getRoles(ADM.email);
  assert.equal(a.admin, true);
  assert.equal(a.pd, true);
});

await t('user watcher follows role switch and sign-out', async () => {
  const seen = [];
  await D.watchUser(u => seen.push(u && u.email));
  as('assessor');
  await D.signOut();
  await D.signIn();
  as('resident');
  assert.deepEqual(seen.slice(-4), [FAC.email, null, FAC.email, RES.email]);
});

const base = o => ({ id: D.newEvaluationId(), rid: 'DEMO01', residentEmail: RES.email, residentName: RES.name,
  assessorEmail: FAC.email, assessorName: 'Dr Demo Faculty', formId: 'dops', tool: 'DOPS', itemId: 'DOPS-2-01',
  itemText: 'Mask holding and bag ventilation', epa: '2', level: null, date: '2026-10-10', caseKey: '2026-10-10|AB',
  request: { date: '2026-10-10', location: 'Operating theatre', initials: 'AB', ageBand: '40-49', gender: 'F' }, status: 'requested', ...o });

let id;
await t('resident creates; assessor sees it live', async () => {
  as('assessor');
  let pending = [];
  const stop = D.watchAssigned(FAC.email, list => { pending = list.filter(e => e.status === 'requested'); });
  const before = pending.length;
  as('resident');
  const ev = await D.createEvaluation(base());
  id = ev.id;
  assert.equal(id.length, 20);
  assert.equal(ev.source, 'evals');
  assert.ok(ev.requestedAt);
  assert.equal(pending.length, before + 1);
  stop();
  const again = await D.createEvaluation(base({ id }));   // a repeat Send is harmless
  assert.equal(again.createdAt, ev.createdAt);
});

await t('create checks mirror the rules', async () => {
  as('resident');
  await rejects(D.createEvaluation(base({ assessorEmail: 'dr.lena.ho@example.com' })));        // inactive
  await rejects(D.createEvaluation(base({ assessorEmail: 'nobody@example.com' })));            // not faculty
  await rejects(D.createEvaluation(base({ assessorEmail: RES.email })));                       // self
  await rejects(D.createEvaluation(base({ rid: 'DEMO02' })));                                  // someone else's rid
  await rejects(D.createEvaluation(base({ status: 'submitted' })));
  await rejects(D.createEvaluation(base({ assessment: { q1: 'Low' } })));
  as('assessor');
  await rejects(D.createEvaluation(base()));
});

await t('reads are limited like the rules', async () => {
  as('resident');
  assert.ok(await D.getEvaluation(id));
  assert.equal(await D.getEvaluation('demo-ev-09'), null);   // another resident's
  await rejects(D.listResidents());
  as('assessor');
  assert.ok(await D.getEvaluation(id));
  let all = null;
  D.watchAll(l => { all = l; })();
  assert.deepEqual(all, []);
});

await t('assessor fills in, submits, edits within 15 min', async () => {
  as('resident');
  await rejects(D.updateEvaluation(id, { assessment: { q1: 'Low' } }));
  as('assessor');
  await D.updateEvaluation(id, { assessment: { q1: 'Low' }, metrics: { openedAt: 1, firstAnswerAt: 2 } });
  as('resident');
  await rejects(D.updateEvaluation(id, { assessorEmail: 'dr.hana.lee@example.com' }));   // started: no reassign
  await D.updateEvaluation(id, { chasedAt: Date.now() });                                // nudge is fine
  as('assessor');
  await rejects(D.updateEvaluation(id, { request: { location: 'ICU' } }));
  const done = await D.updateEvaluation(id, { assessment: { q1: 'Moderate' }, status: 'submitted', metrics: { submitAttempts: 1 } });
  assert.equal(done.status, 'submitted');
  assert.ok(Math.abs(done.submittedAt - Date.now()) < 5000);
  const ed = await D.updateEvaluation(id, { assessment: { q1: 'High' } });
  assert.equal(ed.assessment.q1, 'High');
  await rejects(D.updateEvaluation(id, { status: 'requested' }));
  as('resident');
  await rejects(D.updateEvaluation(id, { status: 'cancelled' }));
  const seen = await D.updateEvaluation(id, { seenAt: Date.now() });
  assert.ok(seen.seenAt);
});

await t('edit window closes after 15 min', async () => {
  as('assessor');
  // demo-ev-10 was submitted days ago by Dr Demo Faculty
  await rejects(D.updateEvaluation('demo-ev-10', { assessment: { q1: 'Low' } }));
});

await t('decline, then reassign keeps the reason and drops old answers', async () => {
  as('resident');
  const ev = await D.createEvaluation(base({ formId: 'ebd', tool: 'EBD', itemId: 'EBD-1-01' }));
  as('assessor');
  await D.updateEvaluation(ev.id, { assessment: { q1: 'High' } });
  await rejects(D.updateEvaluation(ev.id, { status: 'declined' }));   // needs a reason
  await rejects(D.updateEvaluation(ev.id, { status: 'declined', declineReason: { code: 'not-co-managed', text: '' } }));   // must drop partial answers
  const dec = await D.updateEvaluation(ev.id, { status: 'declined', declineReason: { code: 'not-co-managed', text: '' }, assessment: null, metrics: null });
  assert.equal(dec.assessment, undefined);
  assert.ok(dec.declinedAt);
  as('resident');
  await rejects(D.updateEvaluation(ev.id, { status: 'requested', assessorEmail: FAC.email }));                // same assessor
  await rejects(D.updateEvaluation(ev.id, { status: 'requested', assessorEmail: 'dr.lena.ho@example.com' })); // inactive
  const re = await D.updateEvaluation(ev.id, { status: 'requested', assessorEmail: 'dr.hana.lee@example.com', assessorName: 'Dr Hana Lee' });
  assert.equal(re.status, 'requested');
  assert.equal(re.assessment, undefined);
  assert.equal(re.metrics, undefined);
  assert.equal(re.declineReason.code, 'not-co-managed');
  as('assessor');
  assert.equal(await D.getEvaluation(ev.id), null);   // no longer theirs
});

await t('drafts: edit, send, delete only own draft', async () => {
  as('resident');
  const d = await D.createEvaluation(base({ status: 'draft' }));
  assert.equal(d.requestedAt, undefined);
  const sent = await D.updateEvaluation(d.id, { status: 'requested', assessorEmail: 'dr.ivan.chua@example.com' });
  assert.ok(sent.requestedAt);
  await rejects(D.deleteDraft(sent.id));
  const d2 = await D.createEvaluation(base({ status: 'draft' }));
  await D.deleteDraft(d2.id);
  assert.equal(await D.getEvaluation(d2.id), null);
});

await t('applications: apply, list, approve, reject', async () => {
  as('assessor');
  const app = await D.applyForRole({ role: 'resident', name: 'Dr Demo Faculty', note: 'test' });
  assert.equal(app.status, 'pending');
  assert.equal(app.email, FAC.email);
  await rejects(D.listApplications());
  as('admin');
  const apps = await D.listApplications();
  assert.equal(apps[0].status, 'pending');
  assert.ok(apps.some(a => a.uid === FAC.uid));
  const maya = apps.find(a => a.email === 'dr.maya.goh@example.com');
  const ok = await D.decideApplication(maya.uid, { approve: true });
  assert.equal(ok.status, 'approved');
  assert.equal(ok.decidedBy, ADM.email);
  assert.ok((await D.listFaculty()).some(f => f.email === 'dr.maya.goh@example.com' && f.status === 'ACTIVE'));
  const noah = apps.find(a => a.email === 'noah.teo@example.com');
  await D.decideApplication(noah.uid, { approve: true, rid: 'DEMO09', rYear: 1, intake: 2026 });
  assert.ok((await D.listResidents()).some(r => r.rid === 'DEMO09' && r.email === 'noah.teo@example.com'));
  const no = await D.decideApplication(FAC.uid, { approve: false });
  assert.equal(no.status, 'rejected');
  as('assessor');
  assert.equal((await D.getRoles(FAC.email)).application.status, 'rejected');
  assert.equal((await D.applyForRole({ role: 'faculty' })).status, 'pending');   // rejected: may apply again
  as('admin');
  await D.decideApplication(FAC.uid, { approve: true });
  as('assessor');
  await rejects(D.applyForRole({ role: 'resident' }));   // approved: done
  as('admin');
  const apps2 = await D.listApplications();
  const x = await D.applyForRole({ role: 'resident' }).catch(() => null);   // admin applying is fine too
  assert.ok(x);
  await assert.rejects(D.decideApplication(x.uid, { approve: true, rid: 'DEMO01' }), /in use/);   // never overwrite another resident
  assert.ok(apps2.length);
});

await t('opening a form does not lock the assessor; started work cannot go back to draft or be deleted', async () => {
  as('resident');
  const ev = await D.createEvaluation(base());
  as('assessor');
  await D.updateEvaluation(ev.id, { metrics: { openedAt: Date.now() } });   // opened, nothing answered
  as('resident');
  await D.updateEvaluation(ev.id, { assessorEmail: 'dr.ivan.chua@example.com', assessorName: 'Dr Ivan Chua' });
  await D.updateEvaluation(ev.id, { assessorEmail: FAC.email, assessorName: 'Dr Demo Faculty' });
  as('assessor');
  await D.updateEvaluation(ev.id, { assessment: { q1: 'Low' } });
  as('resident');
  await rejects(D.updateEvaluation(ev.id, { assessorEmail: 'dr.ivan.chua@example.com' }));
  await rejects(D.updateEvaluation(ev.id, { status: 'draft' }));
  await rejects(D.deleteDraft(ev.id));
});

await t('assessors never see unsent drafts', async () => {
  as('resident');
  const d = await D.createEvaluation(base({ status: 'draft' }));
  as('assessor');
  assert.equal(await D.getEvaluation(d.id), null);
  let list = [];
  const stop = D.watchAssigned(FAC.email, l => { list = l; });
  stop();
  assert.ok(!list.some(e => e.id === d.id));
});


await t('admins and PDs maintain the lists; nobody else', async () => {
  as('resident');
  await rejects(D.saveFaculty({ email: 'dr.x@example.com', name: 'Dr X' }));
  await rejects(D.saveResident({ rid: 'X1', email: 'x@example.com' }));
  as('admin');
  const f = await D.saveFaculty({ email: 'Dr.New@Example.com', name: 'Dr New' });
  assert.equal(f.email, 'dr.new@example.com');
  await assert.rejects(D.saveResident({ rid: 'X1', email: 'x@example.com', status: 'GONE' }), /status/);
  const r = await D.saveResident({ rid: 'X1', name: 'Xavier', email: 'X@example.com', status: 'ACTIVE', rYear: '2' });
  assert.equal(r.email, 'x@example.com');
  assert.equal(r.rYear, 2);
  await D.updateEvaluation('demo-ev-03', { status: 'requested' });   // admin may reopen
});

await t('clean helpers keep to the whitelist', () => {
  const e = D.cleanEval({ ...base(), nric: 'S1234567A', residentEmail: 'A@Example.com' });
  assert.equal(e.nric, undefined);
  assert.equal(e.residentEmail, 'a@example.com');
  const { set, remove } = D.cleanPatch({ assessment: null, id: 'x', source: 'x', status: 'requested', junk: 1 });
  assert.deepEqual(remove, ['assessment']);
  assert.deepEqual(Object.keys(set).sort(), ['status', 'updatedAt']);
});

await t('reset reseeds', async () => {
  as('admin');
  D.resetDemo();
  assert.equal((await D.listResidents()).length, 8);
  assert.equal((await D.listFaculty()).length, 6);
});

console.log(`${n} demo backend checks passed`);
