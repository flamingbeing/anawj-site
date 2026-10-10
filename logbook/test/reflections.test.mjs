// Run with: node logbook/test/reflections.test.mjs  (fake data only)
import assert from 'node:assert/strict';

globalThis.location = { search: '?demo' };
const { reflectionProgress, reflectionCounts, cleanReflection, splitDetails, REFLECTION_TOTAL, completeProblems, isLegacy, cleanImage, IMAGE_MAX_B64 } = await import('../js/reflections.js');
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
  assert.deepEqual(Object.keys(c).sort(), ['caseId', 'createdAt', 'date', 'diagnosis', 'figures', 'headingId', 'id', 'initials', 'jr', 'points', 'references', 'sections', 'status', 'subId', 'summary', 'title', 'updatedAt']);
  assert.equal(c.headingId, ''); assert.equal(c.subId, null); assert.equal(c.date, null); assert.equal(c.jr, true); assert.equal(c.status, 'draft');
  assert.equal(c.sections.description.length, 20000);
  assert.ok(!('extra' in c.sections));
  assert.equal(cleanReflection({ headingId: 'cabg', subId: 'off' }).subId, 'off');
}
// new shape: caps, figures, no sections unless given
{
  const c = cleanReflection({
    id: 'n', headingId: 'airway', initials: 'XY', date: '2026-02-03', title: 't'.repeat(400), summary: 's'.repeat(25000),
    points: Array.from({ length: 20 }, (_, i) => ({ heading: 'h'.repeat(400), text: 'p' + i, junk: 1 })),
    figures: [{ id: 'img1', caption: 'c'.repeat(400), point: 1, data: 'leak' }, { id: 'bad id!', caption: 'x' }, { id: 'img2', point: 99 }, { id: 'img3', point: null }],
    references: Array.from({ length: 40 }, () => 'r'.repeat(1200)),
  }, 7);
  assert.ok(!('sections' in c));
  assert.equal(c.title.length, 300); assert.equal(c.summary.length, 20000);
  assert.equal(c.points.length, 15); assert.equal(c.points[0].heading.length, 300); assert.deepEqual(Object.keys(c.points[0]).sort(), ['heading', 'text']);
  assert.deepEqual(c.figures.map(f => f.id), ['img1', 'img2', 'img3']);
  assert.deepEqual(c.figures.map(f => f.point), [1, null, null]);
  assert.equal(c.figures[0].caption.length, 300); assert.ok(!('data' in c.figures[0]));
  assert.equal(c.references.length, 30); assert.equal(c.references[0].length, 1000);
  assert.equal(cleanReflection({ figures: Array.from({ length: 12 }, (_, i) => ({ id: 'i' + i })) }).figures.length, 10);
  assert.deepEqual(cleanReflection({ points: 'nope', figures: null, references: {} }).points, []);
}
// mark complete rules: new shape and legacy
{
  const base = { headingId: 'icu', initials: 'AB', date: '2026-01-01' };
  assert.deepEqual(completeProblems({ ...base, title: 'T', points: [{ heading: 'One', text: '' }] }), []);
  assert.deepEqual(completeProblems({ ...base, summary: 'S', points: [] }), ['at least one learning point']);
  assert.deepEqual(completeProblems({ ...base, points: [{ heading: 'a', text: 'b' }] }), ['title or case summary']);
  assert.deepEqual(completeProblems({ headingId: 'cabg', title: 'T', points: [{ text: 'x' }] }), ['sub-type', 'initials', 'date']);
  const legacy = { ...base, sections: { description: 'd', thoughts: 't', evaluation: 'e', analysis: 'a', conclusions: 'c', action: '' } };
  assert.equal(isLegacy(legacy), true);
  assert.deepEqual(completeProblems(legacy), ['action plan']);
  assert.equal(isLegacy({ ...legacy, summary: 'new' }), false);
  assert.equal(isLegacy({ ...base, sections: { description: '' } }), false);
  // legacy sections survive cleaning
  assert.equal(cleanReflection(legacy).sections.thoughts, 't');
}
// image docs
{
  const img = cleanImage({ id: 'img1', data: 'data:image/jpeg;base64,QUJD', mime: 'image/gif', w: 10.4, h: '20', extra: 1 }, 9);
  assert.deepEqual(img, { id: 'img1', data: 'QUJD', mime: 'image/jpeg', w: 10, h: 20, createdAt: 9 });
  assert.throws(() => cleanImage({ id: 'a/b', data: 'x' }));
  assert.throws(() => cleanImage({ id: 'ok', data: 'x'.repeat(IMAGE_MAX_B64) }));
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
  // images
  await cloud.saveImage(DEMO_USER.email, { id: 'img9', data: 'QUJD', mime: 'image/jpeg', w: 3, h: 4 });
  assert.equal((await cloud.loadImage(DEMO_USER.email, 'img9')).data, 'QUJD');
  assert.equal(await cloud.loadImage('other@example.com', 'img9'), null);
  await cloud.deleteImage(DEMO_USER.email, 'img9');
  assert.equal(await cloud.loadImage(DEMO_USER.email, 'img9'), null);
}
console.log('reflections tests passed');
