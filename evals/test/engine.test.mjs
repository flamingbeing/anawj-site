// Run with: node evals/test/engine.test.mjs  (fake data only)
import assert from 'node:assert/strict';
import { FORMS, questionsOf } from '../js/forms.js';
import { GROUPS } from '../js/catalogue.js';
import { validate, visibleQuestions, nextGap, progress, dueItems, statusOf, OVERDUE_HOURS, caseKey, sameCaseCount,
  identifierWarning, newId, todayISO, residentYear } from '../js/engine.js';

const LONG = 'Good airway assessment; next time plan for failure.'; // > 30 chars
// a complete, valid answer set for a form
function full(form) {
  const a = {};
  for (const q of questionsOf(form)) {
    if (q.type === 'select') a[q.key] = q.options[0];
    else if (q.type === 'checkboxes') a[q.key] = [q.options[0]];
    else if (q.type === 'text') a[q.key] = LONG;
    else if (q.type === 'ninePoint') a[q.key] = 5;
    else if (q.type === 'milestone') a[q.key] = 3.5;
    else if (q.type === 'supervision') a[q.key] = 3;
  }
  return a;
}
const without = (o, ...keys) => { const c = { ...o }; for (const k of keys) delete c[k]; return c; };
const { dops, minicex, ebd } = FORMS;

// ---------- validate ----------
{
  const r = validate(dops, full(dops));
  assert.equal(r.ok, true); assert.deepEqual(r.missing, []); assert.deepEqual(r.errors, []);
  assert.equal(r.required, 18); assert.equal(r.answered, 18); // q17 optional
  assert.equal(validate(minicex, full(minicex)).ok, true);
  assert.equal(validate(minicex, full(minicex)).required, 20); // q7 and q22 optional
  assert.equal(validate(ebd, full(ebd)).ok, true);
  assert.equal(validate(ebd, full(ebd)).required, 11); // q3 optional

  // empty
  const e = validate(dops, {});
  assert.equal(e.ok, false); assert.equal(e.answered, 0); assert.equal(e.missing.length, 18);
  assert.equal(nextGap(e), 1);
  assert.equal(validate(dops, null).missing.length, 18);
  assert.equal(nextGap(validate(dops, full(dops))), null);

  // missing a required one
  const m = validate(dops, without(full(dops), 'q9'));
  assert.deepEqual(m.missing, [9]); assert.equal(m.answered, 17); assert.equal(nextGap(m), 9);

  // NA only where na
  assert.equal(validate(dops, { ...full(dops), q3: 'NA' }).ok, true);
  const na14 = validate(dops, { ...full(dops), q14: 'NA' });
  assert.equal(na14.ok, false); assert.equal(na14.errors[0].n, 14); assert.match(na14.errors[0].msg, /Not observed/);
  assert.equal(validate(minicex, { ...full(minicex), q12: 'NA' }).ok, false);
  assert.equal(validate(minicex, { ...full(minicex), q16: 'NA', q17: 'NA' }).ok, true);
  assert.equal(validate(minicex, { ...full(minicex), q14: 'NA' }).ok, false);
  assert.equal(validate(ebd, { ...full(ebd), q7: 'NA', q8: 'NA' }).ok, true);
  assert.equal(validate(ebd, { ...full(ebd), q5: 'NA' }).ok, false);
  assert.equal(validate(dops, { ...full(dops), q16: 'NA' }).ok, false, 'supervision has no NA');

  // scale ranges
  assert.equal(validate(dops, { ...full(dops), q3: 10 }).ok, false);
  assert.equal(validate(dops, { ...full(dops), q3: 0 }).ok, false);
  assert.equal(validate(dops, { ...full(dops), q3: '7' }).ok, true, 'numeric strings from the DOM');
  assert.equal(validate(minicex, { ...full(minicex), q14: 0.5 }).ok, true, 'not yet level 1');
  assert.equal(validate(minicex, { ...full(minicex), q14: 5 }).ok, true);
  assert.equal(validate(minicex, { ...full(minicex), q14: 0.75 }).ok, false);
  assert.equal(validate(minicex, { ...full(minicex), q14: 9 }).ok, false, 'milestone stores 0.5..5.0');
  assert.equal(validate(dops, { ...full(dops), q16: 6 }).ok, false);

  // selects
  assert.equal(validate(dops, { ...full(dops), q1: 'Extreme' }).ok, false);
  assert.equal(validate(dops, { ...full(dops), q2: 'Hands-off' }).ok, true);

  // text: required with no minimum (DOPS q15)
  assert.equal(validate(dops, { ...full(dops), q15: 'ok' }).ok, true);
  assert.deepEqual(validate(dops, { ...full(dops), q15: '   ' }).missing, [15]);
  // The app's forms have no minimum length now; the engine still supports one (tested on copies).
  assert.equal(validate(dops, { ...full(dops), q17: 'Too short' }).ok, true, 'no minimum on DOPS q17');
  assert.equal(validate(minicex, { ...full(minicex), q19: 'ok' }).ok, true, 'no minimum on Mini-CEX q19');
  assert.equal(validate(ebd, { ...full(ebd), q10: 'ok' }).ok, true, 'no minimum on EBD q10');
  const withMin = (f, key, n) => ({ ...f, sections: f.sections.map(s => ({ ...s, questions: s.questions.map(q => q.key === key ? { ...q, minLength: n } : q) })) });
  { const dops = withMin(FORMS.dops, 'q17', 30), minicex = withMin(FORMS.minicex, 'q19', 30), ebd = withMin(FORMS.ebd, 'q10', 30);
  // optional text with minLength applies only when non-empty (DOPS q17)
    assert.equal(validate(dops, { ...full(dops), q17: '' }).ok, true);
    assert.equal(validate(dops, without(full(dops), 'q17')).ok, true);
    const short = validate(dops, { ...full(dops), q17: 'Too short' });
    assert.equal(short.ok, false); assert.deepEqual(short.missing, []); assert.equal(short.errors[0].n, 17);
    assert.match(short.errors[0].msg, /30 characters \(9 so far\)/);
    assert.equal(short.answered, 18, 'optional errors do not change the required count');
    // required with minLength (Mini-CEX q19, EBD q10)
    const r19 = validate(minicex, { ...full(minicex), q19: 'x'.repeat(29) });
    assert.equal(r19.ok, false); assert.equal(r19.errors[0].n, 19); assert.equal(r19.answered, 19);
    assert.equal(validate(minicex, { ...full(minicex), q19: 'x'.repeat(30) }).ok, true);
    assert.equal(validate(minicex, { ...full(minicex), q19: '  ' + 'x'.repeat(29) + '  ' }).ok, false, 'trimmed');
    assert.equal(validate(ebd, { ...full(ebd), q10: 'short' }).ok, false);
    // starter text does not count
    const STARTER = 'Do more of… because…';
    assert.equal(validate(minicex, { ...full(minicex), q19: STARTER + ' ' + 'x'.repeat(10) }, { starters: [STARTER] }).ok, false);
    assert.equal(validate(minicex, { ...full(minicex), q19: STARTER + ' ' + 'x'.repeat(30) }, { starters: [STARTER] }).ok, true);
    assert.deepEqual(validate(minicex, { ...full(minicex), q19: STARTER }, { starters: [STARTER] }).missing, [19]);
    assert.equal(validate(dops, { ...full(dops), q17: STARTER }, { starters: [STARTER] }).ok, true, 'optional starter-only = blank');
    // starters that end in a space are stored trimmed ("A: " → "A:"): still not the assessor's words
    const EQ = 'Q: When would you call for help?\nA: ';
    const STS = [EQ, 'Did well: ', 'To reach the next level: '];
    assert.deepEqual(validate(dops, { ...full(dops), q15: (EQ + EQ).trimEnd() }, { starters: STS }).missing.includes(15), true, 'trimmed entrustment starters = blank');
    assert.equal(validate(minicex, { ...full(minicex), q19: 'Did well:\nTo reach the next level:' }, { starters: STS }).ok, false, 'trimmed comment starters do not count');
    assert.equal(validate(minicex, { ...full(minicex), q19: 'Did well: ' + 'x'.repeat(30) }, { starters: STS }).ok, true);
  }

  // EBD checkboxes and the exclusive option
  const NONE = 'No obvious areas for improvement';
  assert.equal(validate(ebd, { ...full(ebd), q2: [NONE] }).ok, true);
  const both = validate(ebd, { ...full(ebd), q2: [NONE, 'Technical skills'] });
  assert.equal(both.ok, false); assert.equal(both.errors[0].n, 2);
  assert.deepEqual(validate(ebd, { ...full(ebd), q2: [] }).missing, [2]);
  assert.equal(validate(ebd, { ...full(ebd), q2: ['Juggling'] }).ok, false);
  assert.equal(validate(ebd, { ...full(ebd), q2: 'Technical skills' }).ok, false);
  assert.equal(validate(ebd, { ...full(ebd), q2: ['Technical skills', 'Professionalism'] }).ok, true);
}

// ---------- visibleQuestions ----------
{
  const NONE = 'No obvious areas for improvement';
  const has3 = a => visibleQuestions(ebd, a).some(q => q.n === 3);
  assert.equal(has3({}), false);
  assert.equal(has3(null), false);
  assert.equal(has3({ q2: [] }), false);
  assert.equal(has3({ q2: [NONE] }), false);
  assert.equal(has3({ q2: ['Clinical judgment'] }), true);
  assert.equal(has3({ q2: ['Clinical judgment', NONE] }), true);
  assert.equal(visibleQuestions(ebd, {}).length, 11);
  assert.equal(visibleQuestions(dops, {}).length, 19);
  // hidden q3 is not validated (a stale too-anything value is ignored)
  assert.equal(validate(ebd, { ...full(ebd), q2: [NONE], q3: 42 }).ok, true);
  assert.equal(validate(ebd, { ...full(ebd), q2: ['Technical skills'], q3: 42 }).ok, false);
}

// ---------- progress ----------
{
  const sub = (itemId, status = 'submitted') => ({ itemId, status });
  const byId = (rows, id) => rows.find(r => r.group.id === id);
  let p = progress([], 1);
  assert.equal(p.length, GROUPS.length);
  assert.ok(p.every(r => r.done === 0 && r.items.every(i => i.done === 0)));
  assert.equal(byId(p, 'EPA2-DOPS-A').state, 'due-soon');
  assert.equal(byId(p, 'EPA2-DOPS-B').state, 'on-track');
  assert.equal(byId(p, 'EPA4-DOPS-B').state, 'later');
  assert.equal(byId(progress([], 2), 'EPA2-DOPS-A').state, 'overdue');
  assert.equal(byId(progress([], null), 'EPA2-DOPS-A').state, 'due-soon', 'unknown year = R1');

  // only submitted ones count; unknown items are ignored
  p = progress([sub('DOPS-2-01', 'requested'), sub('DOPS-2-01', 'declined'), sub('DOPS-2-01', 'draft'), sub('NOPE-1-01'), { status: 'submitted' }, null], 1);
  assert.equal(byId(p, 'EPA2-DOPS-A').done, 0);

  // each-of group: repeats of one item do not finish it
  p = progress([sub('DOPS-2-01'), sub('DOPS-2-01'), sub('DOPS-2-01')], 1);
  let g = byId(p, 'EPA2-DOPS-A');
  assert.equal(g.done, 1); assert.equal(g.min, 3); assert.equal(g.state, 'due-soon');
  assert.equal(g.items[0].done, 3);
  p = progress([sub('DOPS-2-01'), sub('DOPS-2-02'), sub('DOPS-2-03')], 2);
  assert.equal(byId(p, 'EPA2-DOPS-A').state, 'done'); assert.equal(byId(p, 'EPA2-DOPS-A').done, 3);

  // EPA 2 obese: min 4 over 3 items, repeats count once each is covered
  const ob = ['DOPS-2-04', 'DOPS-2-05', 'DOPS-2-06'];
  g = byId(progress(ob.map(i => sub(i)), 2), 'EPA2-DOPS-B');
  assert.equal(g.done, 3); assert.equal(g.state, 'due-soon');
  g = byId(progress([...ob, 'DOPS-2-04'].map(i => sub(i)), 2), 'EPA2-DOPS-B');
  assert.equal(g.done, 4); assert.equal(g.state, 'done');
  g = byId(progress(['DOPS-2-04', 'DOPS-2-04', 'DOPS-2-04', 'DOPS-2-04'].map(i => sub(i)), 2), 'EPA2-DOPS-B');
  assert.equal(g.done, 2, '4 of one item, 2 items uncovered'); assert.notEqual(g.state, 'done');

  // numbered repeats: CVC x3, difficult airway x3, labour epidural x3
  g = byId(progress([sub('DOPS-10-01'), sub('DOPS-10-01')], 2), 'EPA10-DOPS-A');
  assert.equal(g.done, 2); assert.equal(g.state, 'due-soon');
  g = byId(progress([sub('DOPS-10-01'), sub('DOPS-10-01'), sub('DOPS-10-01'), sub('DOPS-10-01')], 3), 'EPA10-DOPS-A');
  assert.equal(g.done, 3, 'capped at min'); assert.equal(g.state, 'done');
  assert.equal(byId(progress([1, 2, 3].map(() => sub('DOPS-4-02')), 3), 'EPA4-DOPS-B').state, 'done');
  assert.equal(byId(progress([1, 2].map(() => sub('DOPS-7a-01')), 4), 'EPA7a-DOPS-A').state, 'overdue');

  // any-one-of group: EPA 7a scenarios (min 1 of 5)
  g = byId(progress([sub('EBD-7a-04')], 3), 'EPA7a-EBD-A');
  assert.equal(g.done, 1); assert.equal(g.state, 'done');
  assert.equal(byId(progress([], 3), 'EPA7a-EBD-A').state, 'due-soon');

  // started early = on-track; due next year = on-track; further out = later
  assert.equal(byId(progress([sub('DOPS-4-02')], 1), 'EPA4-DOPS-B').state, 'on-track');
  assert.equal(byId(progress([], 2), 'EPA4-DOPS-B').state, 'on-track');
  assert.equal(byId(progress([], 1), 'EPA3-DOPS-D').state, 'later');

  // dueItems: overdue first, uncovered items of each-of groups
  const due = dueItems([sub('DOPS-2-01')], 2);
  assert.ok(due.findIndex(i => i.id === 'DOPS-2-02') < due.findIndex(i => i.id === 'DOPS-2-04'));
  assert.ok(!due.some(i => i.id === 'DOPS-2-01'), 'covered item in an each group is not due');
  assert.ok(due.every(i => i.byYear <= 2));
  assert.ok(dueItems([], 1).some(i => i.id === 'DOPS-2-03'));
  const after = dueItems(['DOPS-2-04', 'DOPS-2-05', 'DOPS-2-06'].map(i => sub(i)), 2);
  assert.ok(after.some(i => i.id === 'DOPS-2-04'), 'all covered but under min: any item');
}

// ---------- statusOf ----------
{
  const H = 36e5, now = Date.parse('2026-10-10T12:00:00Z');
  assert.equal(OVERDUE_HOURS, 24);
  assert.deepEqual(statusOf({ status: 'draft', createdAt: now - H }, now), { key: 'draft', label: 'Draft', ageHours: 1 });
  assert.equal(statusOf({ status: 'requested', requestedAt: now - 2 * H }, now).key, 'sent');
  assert.equal(statusOf({ status: 'requested', requestedAt: now - 2 * H, assessment: {} }, now).key, 'sent');
  const ip = statusOf({ status: 'requested', requestedAt: now - 2 * H, assessment: { q1: 'Low' } }, now);
  assert.equal(ip.key, 'in-progress'); assert.equal(ip.label, 'In progress');
  assert.equal(statusOf({ status: 'requested', requestedAt: now - 23.9 * H }, now).key, 'sent');
  const od = statusOf({ status: 'requested', requestedAt: now - 24 * H }, now);
  assert.equal(od.key, 'overdue'); assert.equal(od.ageHours, 24); assert.equal(od.label, 'Overdue');
  assert.equal(statusOf({ status: 'requested', requestedAt: now - 30 * H, assessment: { q1: 'Low' } }, now).key, 'overdue');
  assert.equal(statusOf({ status: 'requested', createdAt: now - 30 * H }, now).key, 'overdue', 'falls back to createdAt');
  assert.equal(statusOf({ status: 'requested' }, now).ageHours, null);
  assert.equal(statusOf({ status: 'submitted', requestedAt: now - 99 * H }, now).key, 'submitted');
  assert.equal(statusOf({ status: 'declined', requestedAt: now - 99 * H }, now).label, 'Declined');
  assert.equal(statusOf({ status: 'cancelled' }, now).key, 'cancelled');
  assert.equal(statusOf({ status: 'requested', requestedAt: now + H }, now).ageHours, 0, 'clock skew');
  assert.ok(statusOf({ status: 'requested', requestedAt: Date.now() }).key === 'sent');
}

// ---------- cases ----------
{
  assert.equal(caseKey('2026-10-01', 'a.b.'), '2026-10-01|AB');
  assert.equal(caseKey('2026-10-01', ' Ab '), caseKey('2026-10-01', 'AB'));
  const evs = [
    { status: 'submitted', request: { date: '2026-10-01', initials: 'AB' } },
    { status: 'requested', caseKey: '2026-10-01|AB' },
    { status: 'cancelled', request: { date: '2026-10-01', initials: 'AB' } },
    { status: 'requested', request: { date: '2026-10-02', initials: 'AB' } },
    { status: 'requested', request: { date: '2026-10-01', initials: 'CD' } },
  ];
  assert.equal(sameCaseCount(evs, '2026-10-01', 'ab'), 2);
  assert.equal(sameCaseCount(evs, '2026-10-02', 'AB'), 1);
  assert.equal(sameCaseCount(evs, '2026-10-01', ''), 0);
  assert.equal(sameCaseCount([], '2026-10-01', 'AB'), 0);
  assert.equal(sameCaseCount(null, '2026-10-01', 'AB'), 0);
}

// ---------- identifierWarning ----------
{
  assert.equal(identifierWarning(''), null);
  assert.equal(identifierWarning(null), null);
  assert.equal(identifierWarning('AB 65M for TKR, ASA 3, BMI 42'), null);
  assert.equal(identifierWarning('Hb 9.5, BP 180/110, 2024-07-01'), null);
  assert.match(identifierWarning('patient S1234567D seen'), /NRIC/);
  assert.match(identifierWarning('t9876543z'), /NRIC/);
  assert.match(identifierWarning('M1234567K'), /NRIC/);
  assert.equal(identifierWarning('S123456D'), null);
  assert.match(identifierWarning('MRN 12345678'), /numbers/);
  assert.match(identifierWarning('call 9123 4567'), /numbers/);
  assert.equal(identifierWarning('1234567'), null);
  assert.match(identifierWarning('Patient MRN 1234567A, bed 12'), /record number/);
  assert.match(identifierWarning('Mdm Tan for TKR'), /name/);
  assert.equal(identifierWarning('ASA 3, ICU bed, Mallampati 2'), null);
}

// ---------- ids and dates ----------
{
  const a = newId(), b = newId();
  assert.match(a, /^[0-9a-z]{20}$/); assert.notEqual(a, b);
  assert.equal(newId(8).length, 8);
  const t = Date.parse('2026-10-10T17:30:00Z'); // 01:30 on the 11th in Singapore
  assert.equal(todayISO('Asia/Singapore', new Date(t)), '2026-10-11');
  assert.equal(todayISO('UTC', new Date(t)), '2026-10-10');
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(todayISO('Not/AZone', new Date(t)), /^\d{4}-\d{2}-\d{2}$/, 'bad zone falls back');

  assert.equal(residentYear(null), null);
  assert.equal(residentYear({}), null);
  assert.equal(residentYear({ rYear: 3, intake: 2020 }, '2026-10-10'), 3, 'admin-set year wins');
  assert.equal(residentYear({ rYear: '2' }, '2026-10-10'), 2);
  assert.equal(residentYear({ intake: 2026 }, '2026-07-01'), 1);
  assert.equal(residentYear({ intake: 2026 }, '2027-06-30'), 1);
  assert.equal(residentYear({ intake: 2025 }, '2026-10-10'), 2);
  assert.equal(residentYear({ intake: '2024' }, '2026-10-10'), 3);
  assert.equal(residentYear({ intake: 2015 }, '2026-10-10'), 5, 'capped');
  assert.equal(residentYear({ intake: 2027 }, '2026-10-10'), 1, 'floored');
  assert.equal(residentYear({ intake: 2025, rYear: null }, new Date(Date.parse('2026-06-30T20:00:00Z'))), 2, 'Date in SG time (1 July)');
}

console.log('engine tests passed');
