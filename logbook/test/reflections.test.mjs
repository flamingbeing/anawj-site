// Run with: node logbook/test/reflections.test.mjs  (fake data only)
import assert from 'node:assert/strict';

globalThis.location = { search: '?demo' };
const { reflectionProgress, reflectionCounts, cleanReflection, splitDetails, REFLECTION_TOTAL } = await import('../js/reflections.js');
const cloud = await import('../js/cloud.js');
const { resetDemo, DEMO_USER } = await import('../js/demo-backend.js');

assert.equal(REFLECTION_TOTAL, 96);

const r = (o) => ({ status: 'complete', initials: 'AB', date: '2026-01-01', jr: false, sections: {}, ...o });

// empty
{
  const p = reflectionProgress([]);
  assert.equal(p.totals.min, 96);
  assert.equal(p.totals.done, 0);
  const bar = p.headings.find(x => x.id === 'bariatric');
  assert.deepEqual([bar.done, bar.min, bar.jrNeeded], [0, 3, 1]);
  assert.ok(bar.issues.some(i => /JR/.test(i)));
}
// JR requirement, subs, >1 JR without jr, duplicates, drafts not counted
{
  const list = [
    r({ id: '1', headingId: 'bariatric', initials: 'AA', jr: true }),
    r({ id: '2', headingId: 'bariatric', initials: 'BB' }),
    r({ id: '3', headingId: 'bariatric', initials: 'CC' }),
    r({ id: '4', headingId: 'thyroid', initials: 'DD', jr: true }),
    r({ id: '5', headingId: 'thyroid', initials: 'EE', jr: true }),
    r({ id: '6', headingId: 'cabg', initials: 'FF', subId: 'on' }),
    r({ id: '7', headingId: 'cabg', initials: 'GG', subId: 'on' }),
    r({ id: '8', headingId: 'lap', initials: 'AA' }),            // same patient as 1
    r({ id: '9', headingId: 'icu', initials: 'HH', status: 'draft' }),
  ];
  const p = reflectionProgress(list);
  const by = Object.fromEntries(p.headings.map(x => [x.id, x]));
  assert.equal(by.bariatric.met, true);
  assert.equal(by.bariatric.jrDone, 1);
  assert.equal(by.bariatric.issues.length, 1);   // duplicate patient
  assert.ok(by.thyroid.issues.some(i => /Only 1 JR/.test(i)));
  assert.equal(by.thyroid.counted, 1);
  assert.equal(by.cabg.met, false);
  assert.ok(by.cabg.issues.some(i => /Off pump/.test(i)));
  assert.ok(by.lap.issues.some(i => /Same patient/.test(i)));
  assert.equal(by.icu.done, 0);
  assert.equal(p.totals.done, 8);
  assert.equal(p.totals.drafts, 1);
  const c = reflectionCounts(list);
  assert.deepEqual(c.reflections, { bariatric: 3, thyroid: 2, cabg: 2, lap: 1 });
  assert.equal(c.reflectionsTotal, 8);
}
// whitelist
{
  const c = cleanReflection({ id: 'x', headingId: 'nope', subId: 'on', initials: 'AB', date: 'bad', jr: 1, diagnosis: 'd', sections: { description: 'a'.repeat(30000), extra: 'no' }, status: 'weird', leak: 1 }, 5);
  assert.deepEqual(Object.keys(c).sort(), ['caseId', 'createdAt', 'date', 'diagnosis', 'headingId', 'id', 'initials', 'jr', 'sections', 'status', 'subId', 'updatedAt']);
  assert.equal(c.headingId, ''); assert.equal(c.subId, null); assert.equal(c.date, null); assert.equal(c.jr, true); assert.equal(c.status, 'draft');
  assert.equal(c.sections.description.length, 20000);
  assert.ok(!('extra' in c.sections));
  assert.equal(cleanReflection({ headingId: 'cabg', subId: 'off' }).subId, 'off');
}
assert.deepEqual(splitDetails('AB 34F LSCS under spinal'), { initials: 'AB', diagnosis: '34F LSCS under spinal' });
assert.deepEqual(splitDetails('lscs'), { initials: '', diagnosis: 'lscs' });

// demo backend round trip
{
  resetDemo({ seeded: false });
  const seen = [];
  const stop = cloud.watchReflections(DEMO_USER.email, l => seen.push(l));
  await cloud.saveReflection(DEMO_USER.email, { id: 'r1', headingId: 'icu', initials: 'ZZ', sections: { description: 'x' } });
  assert.equal(seen.at(-1).length, 1);
  assert.equal(seen.at(-1)[0].headingId, 'icu');
  await cloud.deleteReflection(DEMO_USER.email, 'r1');
  assert.equal(seen.at(-1).length, 0);
  stop();
}
console.log('reflections tests passed');
