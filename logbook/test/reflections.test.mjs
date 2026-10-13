// Run with: node logbook/test/reflections.test.mjs  (fake data only)
import { wordCount, MIN_WORDS } from '../js/reflections.js';
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
  assert.deepEqual(bar.issues, [], 'JR is a reminder, not an issue');
}
// JR credit capped; required types remain reminders; duplicates and drafts.
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
  assert.ok(by.thyroid.issues.some(i => /1 extra JR.*not counted/.test(i)));
  assert.equal(by.thyroid.counted, 1);
  assert.equal(p.totals.counted, 7);
  assert.equal(by.cabg.met, true, 'sub-types not enforced');
  assert.deepEqual(by.cabg.issues, []);
  assert.ok(by.lap.issues.some(i => /Same patient/.test(i)));
  assert.equal(by.icu.done, 0);
  assert.equal(p.totals.done, 8);
  assert.equal(p.totals.drafts, 1);
  const c = reflectionCounts(list);
  assert.deepEqual(c.reflections, { bariatric: 3, thyroid: 1, cabg: 2, lap: 1 });
  assert.equal(c.reflectionsTotal, 7);
  // past the minimum, the shared count stops there
  const extra = [...list, ...[1, 2, 3].map(i => r({ headingId: 'bariatric', initials: 'Z' + i, date: '2026-02-0' + i }))];
  assert.equal(reflectionCounts(extra).reflections.bariatric, 3);
  assert.equal(reflectionCounts(extra).reflectionsTotal, 7);
}
// The JR cap applies even to headings requiring JR, with the Paediatrics exception.
{
  const { REFLECTION_HEADINGS } = await import('../js/categories.js');
  for (const hd of REFLECTION_HEADINGS) {
    const list = Array.from({ length: hd.min + 2 }, (_, i) => r({ headingId: hd.id, initials: `P${i}`, jr: true }));
    const p = reflectionProgress(list);
    const h = p.headings.find(x => x.id === hd.id);
    const limit = hd.id === 'paeds' ? 2 : 1;
    assert.equal(h.counted, limit, `${hd.id}: JR cap`);
    assert.equal(h.done, list.length, 'all completed reflections remain saved');
    assert.equal(h.met, limit >= hd.min, 'excess JR cannot meet heading');
    assert.equal(reflectionCounts(list).reflectionsTotal, limit);
    const mixed = [...list, r({ headingId: hd.id, initials: 'SR' }), r({ headingId: hd.id, initials: 'DR', jr: true, status: 'draft' })];
    assert.equal(reflectionProgress(mixed).headings.find(x => x.id === hd.id).counted, limit + 1, 'SR counts; draft does not');
    assert.equal(reflectionCounts(mixed).reflectionsTotal, Math.min(limit + 1, hd.min));
  }
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
  const base = { headingId: 'icu', initials: 'AB', date: '2026-01-01', caseId: 'c1' };
  assert.deepEqual(completeProblems({ ...base, title: 'T', points: [{ heading: 'One', text: '' }] }), []);
  assert.deepEqual(completeProblems({ ...base, summary: 'S', points: [] }), ['at least one learning point']);
  assert.deepEqual(completeProblems({ ...base, points: [{ heading: 'a', text: 'b' }] }), ['title or case details']);
  assert.deepEqual(completeProblems({ headingId: 'cabg', title: 'T', points: [{ text: 'x' }] }), ['initials', 'date']);
  // no case link is fine
  assert.deepEqual(completeProblems({ ...base, caseId: null, title: 'T', points: [{ heading: 'One' }] }), []);
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
  await new Promise(r => setTimeout(r, 5));   // the sync engine opens this device's copy first
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
// word count: title, summary and learning points (not captions or references)
assert.equal(wordCount({ title: 'Airway plan', summary: 'A made-up 50-year-old man.', points: [{ heading: 'One', text: 'Two three' }], figures: [{ caption: 'not counted' }], references: ['Not counted at all'] }), 9);
assert.equal(wordCount({ sections: { description: 'old style text', action: 'plan' } }), 4);
assert.equal(wordCount(null), 0);
assert.ok(MIN_WORDS > 0);

// heading suggestions
{
  const { suggestHeadings, moveToHeading } = await import('../js/reflections.js');
  const ids = (c, refl = [], o) => suggestHeadings(c, refl, o).map(x => x.headingId + (x.subId ? ':' + x.subId : ''));
  assert.deepEqual(ids({ cats: ['04'], details: 'AB thyroidectomy' }), ['thyroid']);
  assert.deepEqual(ids({ cats: ['01'] }), ['cabg:on', 'cardiac']);
  assert.deepEqual(ids({ cats: ['02'] }), ['cabg:off', 'cardiac']);
  assert.deepEqual(ids({ cats: ['26ii'] }), ['regional:ll']);
  assert.deepEqual(ids({ cats: ['26iv'] }), ['regional']);
  assert.deepEqual(ids({ cats: ['27'] }), ['regional:epidural']);
  assert.deepEqual(ids({ cats: ['17', '27'] }), ['labour']);
  assert.deepEqual(ids({ cats: ['20i'] }), ['paeds:neonate']);
  assert.deepEqual(ids({ cats: ['20iii'], details: 'CD 6M appendicectomy, RSI' }), ['paeds:rsi']);
  assert.deepEqual(ids({ cats: ['13'], details: 'EF RSI for laparotomy' }), []);   // RSI only hints paeds
  assert.deepEqual(ids({ cats: ['34'], details: 'GH TURP' }), ['urology:prostate']);
  assert.deepEqual(ids({ cats: ['99'], details: 'JK EVAR for AAA' }), ['vascular']);
  assert.deepEqual(ids({ cats: ['13'], details: 'LM MRI under GA' }), ['remote']);
  assert.deepEqual(ids({ cats: [], details: 'AFOI for trismus' }), ['airway']);
  assert.deepEqual(ids(null), []);
  // a caesarean section's spinal isn't labour analgesia; a labour epidural still is
  assert.deepEqual(ids({ cats: ['16', '17', '28'] }).includes('labour'), false);
  assert.deepEqual(ids({ cats: ['17'], details: 'CSE for labour' }), ['labour']);
  assert.deepEqual(ids({ cats: ['16', '17'], details: 'labour epidural topped up for LSCS' }).includes('labour'), true);
  assert.deepEqual(ids({ cats: ['36'] }), ['polytrauma']);
  assert.deepEqual(ids({ cats: ['13'], details: 'NO laparotomy, massive transfusion' }), ['challenging']);
  assert.deepEqual(ids({ cats: ['18'], details: 'PQ prolonged revision hip' }), ['challenging']);
  // a heading already met drops behind one still needed
  const full = [1, 2, 3].map(i => r({ headingId: 'thoracic', initials: 'T' + i }));
  const s = suggestHeadings({ cats: ['07', '21'] }, full);
  assert.deepEqual(s.map(x => [x.headingId, x.needed]), [['geriatric', true], ['thoracic', false]]);
  // JR is a reminder only: a met heading stays behind, JR resident or not
  const ger = [1, 2, 3].map(i => r({ headingId: 'geriatric', initials: 'G' + i, jr: false }));
  assert.deepEqual(suggestHeadings({ cats: ['04', '21'] }, ger, { jr: true }).map(x => x.headingId), ['thyroid', 'geriatric']);
  assert.deepEqual(suggestHeadings({ cats: ['04', '21'] }, ger).map(x => x.headingId), ['thyroid', 'geriatric']);
  assert.equal(suggestHeadings({ cats: ['21'] }, ger, { jr: true })[0].needed, false);
  // moving between headings
  assert.deepEqual(moveToHeading({ headingId: 'regional', subId: 'll' }, 'thoracic'), { headingId: 'thoracic', subId: null });
  assert.deepEqual(moveToHeading({ headingId: 'regional', subId: 'chronic' }, 'urology'), { headingId: 'urology', subId: null });
  assert.equal(moveToHeading({ headingId: 'x', subId: 'neonate' }, 'paeds').subId, 'neonate');
}
// a case link is optional for every reflection
{
  const r = cleanReflection({ id: 'w1', headingId: 'thyroid', initials: 'AB', date: '2025-01-02', title: 'T', points: [{ heading: 'h', text: 't' }] });
  assert.ok(!completeProblems(r).includes('linked case'));
  assert.equal(cleanReflection({ ...r, source: 'word' }).source, 'word');
  assert.equal(cleanReflection({ id: 'x', headingId: 'thyroid', source: 'evil' }).source, undefined);
}
console.log('reflections tests passed');

// ---------- choosing what goes into the export ----------
{
  const { inExport, exportSummary, pickJustEnough } = await import('../js/reflections.js');
  const words = n => Array.from({ length: n }, (_, i) => 'w' + i).join(' ');
  const R = (id, o) => ({ id, status: 'complete', headingId: 'bariatric', initials: 'AB', date: '2026-01-0' + (id.length % 9 + 1), jr: false, title: '', summary: words(10), points: [], ...o });
  // the flag: stored only when off; older reflections (no flag) are in
  assert.equal(cleanReflection({ headingId: 'lscs', export: false }).export, false);
  assert.ok(!('export' in cleanReflection({ headingId: 'lscs', export: true })));
  assert.ok(!('export' in cleanReflection({ headingId: 'lscs' })));
  assert.ok(inExport(R('a', {})));
  assert.ok(!inExport(R('a', { export: false })), 'left out');
  assert.ok(!inExport(R('a', { status: 'draft' })), 'drafts never');
  assert.ok(!inExport(R('a', { headingId: '' })), 'uncategorised never');
  // uncategorised reflections can be marked complete
  assert.deepEqual(completeProblems({ headingId: '', initials: 'AB', date: '2026-01-01', title: 'T', points: [{ heading: 'One' }] }), []);
  // summary + warnings
  const list = [R('a', {}), R('bb', { export: false }), R('ccc', { export: false }), R('dddd', { status: 'draft' })];
  const b = exportSummary(list).headings.find(x => x.id === 'bariatric');
  assert.equal(b.written, 4); assert.equal(b.complete, 3); assert.equal(b.inExport, 1);
  assert.ok(b.warn.some(w => /1 of 3/.test(w)), 'short of the minimum: ' + b.warn);
  assert.ok(b.warn.some(w => /JR/.test(w)) === false, 'no JR complete, so no JR warning');
  // pick just enough: longest first, keep the JR needed (bariatric needs 1 JR, min 3)
  const many = [R('s1', { summary: words(100) }), R('s2', { summary: words(300) }), R('s3', { summary: words(200) }), R('s4', { summary: words(50), jr: true }), R('s5', { summary: words(400) })];
  const pick = pickJustEnough(many);
  assert.deepEqual(Object.keys(pick).filter(k => pick[k]).sort(), ['s2', 's4', 's5'], 'JR one kept, then the two longest');
  // sub-types: CABG needs on pump and off pump (min 2)
  const cabg = [R('c1', { headingId: 'cabg', subId: 'on', summary: words(500) }), R('c2', { headingId: 'cabg', subId: 'on', summary: words(400) }), R('c3', { headingId: 'cabg', subId: 'off', summary: words(20) })];
  const pc = pickJustEnough(cabg);
  assert.deepEqual(Object.keys(pc).filter(k => pc[k]).sort(), ['c1', 'c3'], 'the off-pump one kept although short');
  // headings without a JR rule: at most one JR while others are left
  const thy = [R('t1', { headingId: 'thyroid', jr: true, summary: words(900) }), R('t2', { headingId: 'thyroid', jr: true, summary: words(800) }), R('t3', { headingId: 'thyroid', summary: words(10) }), R('t4', { headingId: 'thyroid', summary: words(5) })];
  const pt = pickJustEnough(thy);
  assert.deepEqual(Object.keys(pt).filter(k => pt[k]).sort(), ['t1', 't3', 't4']);
  // drafts and uncategorised are left alone
  assert.ok(!('dddd' in pickJustEnough(list)));
  assert.ok(!('u' in pickJustEnough([R('u', { headingId: '' })])));
}
console.log('export choice tests passed');

// photo budget: sizes recorded on figures, each image counted once, older figures estimated
{
  const { photoUsageKb, PHOTO_BUDGET_KB, LEGACY_FIGURE_KB, imageKb, fmtMb } = await import('../js/reflections.js');
  const a = { id: 'a', figures: [{ id: 'img1', kb: 120 }, { id: 'img2' }] };
  const b = { id: 'b', figures: [{ id: 'img1', kb: 120 }, { id: 'img3', kb: 80 }] };
  assert.equal(photoUsageKb([a, b]), 120 + LEGACY_FIGURE_KB + 80);
  assert.equal(photoUsageKb([]), 0);
  assert.equal(PHOTO_BUDGET_KB, 20 * 1024);
  assert.equal(imageKb('x'.repeat(2048)), 2);
  assert.equal(fmtMb(20 * 1024), '20 MB');
  const kept = cleanReflection({ id: 'r', headingId: '', figures: [{ id: 'img1', caption: 'c', point: null, kb: 133.4 }, { id: 'img2', kb: -1 }] });
  assert.equal(kept.figures[0].kb, 133);
  assert.ok(!('kb' in kept.figures[1]));
  console.log('photo budget tests passed');
}

// free-text learning points
{
  const { isFreeText, joinPoints } = await import('../js/reflections.js');
  assert.equal(isFreeText({ points: [{ heading: '', text: 'x' }] }), true);
  assert.equal(isFreeText({ points: [{ heading: 'H', text: 'x' }] }), false);
  assert.equal(isFreeText({ points: [{ heading: '', text: 'a' }, { heading: '', text: 'b' }] }), false);
  assert.equal(joinPoints([{ heading: 'Early signs', text: 'Hands weak.' }, { heading: '', text: 'Plan ahead.' }, { heading: ' ', text: ' ' }]), 'Early signs\nHands weak.\n\nPlan ahead.');
  console.log('free text tests passed');
}
