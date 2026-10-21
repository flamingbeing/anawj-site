// Fake data only. The Add tab's pure helpers (js/logging.js).
import assert from 'node:assert/strict';
const { STRONG, confident, autoTick, rejectCodes, expandParts, hasPart, recentCases } = await import('../js/logging.js');
const { suggest } = await import('../js/suggest.js');

// confident suggestions: the same 0.5 line as "+ All" and a pasted list
{
  assert.equal(STRONG, 0.5);
  assert.deepEqual(confident([{ code: '16', score: 0.9 }, { code: '13', score: 0.5 }, { code: '26', score: 0.49 }, { code: '01', score: 0.15 }]), ['16', '13']);
  assert.deepEqual(confident(null), []);
  // real suggestions: an age gives a confident Geriatric; whatever is weak is left out
  const found = suggest('AB 72M lap chole GA', { limit: 8 });
  assert.ok(confident(found).includes('21'));
  assert.ok(confident(found).every(code => found.find(s => s.code === code).score >= 0.5));
}

// auto-tick: ticks follow the text, manual ticks are never touched, rejected ones stay off
{
  let d = { cats: [], auto: [], rejected: [] };
  let r = autoTick(d, ['21']);
  assert.deepEqual(r, { cats: ['21'], auto: ['21'] });
  d = { ...d, ...r };
  // nothing changed: the same arrays back (no repaint)
  const same = autoTick(d, ['21']);
  assert.equal(same.cats, d.cats); assert.equal(same.auto, d.auto);
  // a manual tick stays when the text stops suggesting it; the automatic one goes
  d = { ...d, cats: ['13', '21'] };
  r = autoTick(d, []);
  assert.deepEqual(r, { cats: ['13'], auto: [] });
  // a sub-category brings its parent, which is automatic too and goes with it
  r = autoTick({ cats: [], auto: [], rejected: [] }, ['20i']);
  assert.deepEqual(r.cats, ['20', '20i']); assert.deepEqual(r.auto, ['20', '20i']);
  r = autoTick({ cats: r.cats, auto: r.auto, rejected: [] }, []);
  assert.deepEqual(r, { cats: [], auto: [] });
  // a parent the user needs for a manual sub-category stays
  r = autoTick({ cats: ['26', '26i', '26ii'], auto: ['26', '26i'], rejected: [] }, []);
  assert.deepEqual(r.cats, ['26', '26ii']); assert.deepEqual(r.auto, ['26']);
  // taking one off: it leaves the automatic list and is never ticked again for this case
  const off = rejectCodes({ auto: ['21', '13'], rejected: [] }, ['21']);
  assert.deepEqual(off, { auto: ['13'], rejected: ['21'] });
  r = autoTick({ cats: ['13'], ...off }, ['21', '13']);
  assert.deepEqual(r.cats, ['13']);
  assert.deepEqual(rejectCodes({ auto: [], rejected: ['21'] }, ['21']).rejected, ['21']);
  // the draft fields may be missing on an older saved draft
  assert.deepEqual(autoTick({}, ['21']), { cats: ['21'], auto: ['21'] });
}

// Add tab parts: an older 'quick' still means both of the parts it was split into
{
  assert.deepEqual(expandParts(['quick', 'still']), ['sugg', 'recent', 'still']);
  assert.deepEqual(expandParts(['sugg', 'quick']), ['sugg', 'recent']);
  assert.deepEqual(expandParts(['case:quick', 'grid'], 'case:'), ['case:sugg', 'case:recent', 'grid']);
  assert.deepEqual(expandParts(['quick'], 'case:'), ['quick'], 'only with the prefix');
  assert.deepEqual(expandParts(null), []);
  assert.equal(hasPart(['quick'], 'sugg'), true);
  assert.equal(hasPart(['quick'], 'recent'), true);
  assert.equal(hasPart(['recent'], 'sugg'), false, 'Same as last hidden alone keeps the suggestions');
  assert.equal(hasPart(['sugg'], 'recent'), false);
  assert.equal(hasPart(['case:quick'], 'case:sugg', 'case:'), true);
  assert.equal(hasPart(['case:sugg'], 'case:recent', 'case:'), false);
  assert.equal(hasPart([], 'still'), false);
}

// Same as last: newest by when logged, one per procedure and tag set, without sorting everything
{
  const mk = (id, createdAt, details, cats = ['13']) => ({ id, createdAt, details, cats });
  const cases = [mk('a', 5, 'lap chole'), mk('b', 9, 'TKR', ['16']), mk('c', 7, 'lap chole'), mk('d', 8, 'no tags', []), mk('e', 1, 'LSCS', ['26'])];
  const key = c => c.details + '|' + c.cats.join();
  let calls = 0;
  const counted = c => { calls++; return key(c); };
  assert.deepEqual(recentCases(cases, 1, counted).map(c => c.id), ['b']);
  assert.equal(calls, 1, 'only the newest is looked at');
  assert.deepEqual(recentCases(cases, 3, key).map(c => c.id), ['b', 'c', 'e'], 'the older lap chole repeats and is skipped');
  assert.deepEqual(recentCases(cases, 5, key).map(c => c.id), ['b', 'c', 'e']);
  assert.deepEqual(recentCases([], 2, key), []);
  // many repeats among the newest: still finds the next different one further back
  const many = Array.from({ length: 50 }, (_, i) => mk('r' + i, 1000 - i, 'same'));
  many.push(mk('old', 1, 'different'));
  assert.deepEqual(recentCases(many, 2, key).map(c => c.id), ['r0', 'old']);
  // the order of the input doesn't matter
  const shuffled = [...many].reverse();
  assert.deepEqual(recentCases(shuffled, 2, key).map(c => c.id), ['r0', 'old']);
}

// recentCount: the picker's choices; anything else (an imported settings file) snaps to the nearest
{
  const { recentCount, RECENT_CHOICES } = await import('../js/logging.js');
  const engine = await import('../js/engine.js');
  assert.equal(engine.STRONG, STRONG, 'parseBulk and the Add tab share one confident line');
  assert.deepEqual(RECENT_CHOICES, [1, 2, 3, 5]);
  for (const [v, want] of [[undefined, 1], [null, 1], ['x', 1], [0, 1], [-3, 1], [1, 1], [2, 2], [2.6, 3], [3, 3], [4, 3], [4.6, 5], [5, 5], [9, 5], ['2', 2]]) assert.equal(recentCount(v), want, String(v));
}

console.log('logging tests passed');
