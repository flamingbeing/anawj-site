// Profiles as presets (js/profiles.js): switch defaults, saved values, the older lists, picking a profile, "Custom",
// and the tabs a profile moves. Fake settings only.
import assert from 'node:assert/strict';
const P = await import('../js/profiles.js');
const { SWITCH_KEYS, presetOn, shownIn, switchPatch, resetPatch, applyPatch, switchChanges, offBar, presetHidesTab, tabsAfter, mergeSettings, replaceShow, PROFILE_IDS } = P;
const PARTS = ['interesting', 'parsed', 'sugg', 'recent', 'still', 'groupsave', 'plan'];

// the presets: Basic leaves out the extras (not Reflect), logbook only Reflect too, Personal the APMES parts
{
  for (const k of ['grid', 'analytics', 'reflExtras', 'case:sugg', 'case:recent', 'case:still', 'case:plan']) assert.equal(presetOn('basic', k), false, k);
  assert.equal(presetOn('basic', 'reflect'), true);
  assert.equal(presetOn('logbook', 'reflect'), false);
  for (const k of SWITCH_KEYS) { assert.equal(presetOn('advanced', k), true, k); assert.equal(presetOn('faculty', k), true, k); }
  for (const k of ['targets', 'case:still', 'totals', 'portfolio', 'year', 'reflHeadings', 'saveToast', 'apmesTitle']) {
    assert.equal(presetOn('personal', k), false, k);
    assert.equal(presetOn('basic', k), k === 'case:still' ? false : true, 'APMES parts stay on in Basic: ' + k);
  }
  for (const k of ['grid', 'analytics', 'reflExtras', 'reflect', 'case:sugg', 'case:recent', 'case:plan', 'case:interesting']) assert.equal(presetOn('personal', k), true, k);
  assert.equal(presetOn('basic', 'case:parsed'), true, 'not governed: always on');
  assert.deepEqual(PROFILE_IDS, ['logbook', 'basic', 'advanced', 'personal', 'faculty']);
}

// back-compat: an account with only `mode` saved looks as it did; caseHide and basicOn still count
{
  const old = { mode: 'basic', basicOn: ['grid', 'case:quick'], caseHide: ['plan', 'parsed'] };
  assert.equal(shownIn(old, 'basic', 'grid'), true);
  assert.equal(shownIn(old, 'basic', 'analytics'), false);
  assert.equal(shownIn(old, 'basic', 'case:sugg'), true, 'an older case:quick turned both halves on');
  assert.equal(shownIn(old, 'basic', 'case:recent'), true);
  assert.equal(shownIn({ mode: 'basic', basicOn: ['case:sugg'] }, 'basic', 'case:recent'), false, 'the halves apart');
  assert.equal(shownIn(old, 'basic', 'case:plan'), false);
  assert.equal(shownIn(old, 'basic', 'case:parsed'), false, 'a hidden part no profile governs');
  assert.equal(shownIn({ caseHide: ['quick'] }, 'advanced', 'case:sugg'), false, 'an older quick hid both halves');
  assert.equal(shownIn({ caseHide: ['quick'] }, 'advanced', 'case:recent'), false);
  assert.equal(shownIn({ show: { 'case:quick': false } }, 'advanced', 'case:recent'), false, 'an older show key too');
  assert.equal(shownIn({ show: { 'case:quick': false, 'case:sugg': true } }, 'advanced', 'case:sugg'), true, 'the new key wins');
  assert.equal(shownIn({}, 'advanced', 'targets'), true, 'APMES on by default');
  // a saved value wins over everything
  assert.equal(shownIn({ ...old, show: { grid: false, 'case:plan': true } }, 'basic', 'grid'), false);
  assert.equal(shownIn({ ...old, show: { grid: false, 'case:plan': true } }, 'basic', 'case:plan'), true);
  assert.equal(shownIn({ show: { grid: false } }, 'advanced', 'grid'), false, 'Advanced can hide the extras now too');
}

// saving one switch: only that key of the show map (Firestore merges it key by key), caseHide and the older basicOn
// kept in step for older copies of the app
{
  const st = { mode: 'basic', basicOn: ['grid', 'case:quick'], caseHide: ['plan'] };
  assert.deepEqual(switchPatch(st, 'grid', false, PARTS), { show: { grid: false }, basicOn: ['case:sugg', 'case:recent'] }, 'an older case:quick written as the two halves');
  assert.deepEqual(switchPatch(st, 'case:plan', true, PARTS), { show: { 'case:plan': true }, basicOn: ['grid', 'case:sugg', 'case:recent', 'case:plan'], caseHide: null });
  assert.deepEqual(switchPatch({ caseHide: ['quick', 'plan'] }, 'case:sugg', true, PARTS), { show: { 'case:sugg': true }, basicOn: ['case:sugg'], caseHide: ['recent', 'plan'] });
  assert.deepEqual(switchPatch({}, 'analytics', true), { show: { analytics: true }, basicOn: ['analytics'] }, 'an older copy in Basic shows it too');
  assert.deepEqual(switchPatch({ basicOn: ['grid'] }, 'grid', true), { show: { grid: true } }, 'basicOn unchanged: not sent');
  assert.deepEqual(switchPatch(st, 'case:still', false, PARTS), { show: { 'case:still': false }, basicOn: ['grid', 'case:sugg', 'case:recent'], caseHide: ['still', 'plan'] }, 'the older quick rewritten as both halves');
  assert.deepEqual(switchPatch({ basicOn: ['grid', 'case:sugg'], caseHide: ['plan'] }, 'case:still', false, PARTS), { show: { 'case:still': false }, caseHide: ['still', 'plan'] });
  assert.deepEqual(switchPatch({ show: { targets: false } }, 'year', false), { show: { year: false } });
  const after = mergeSettings(st, switchPatch(st, 'case:recent', false, PARTS));
  assert.equal(shownIn(after, 'basic', 'case:recent'), false);
  assert.equal(shownIn(after, 'basic', 'case:sugg'), true, 'the other half stays on');
  // a group's reset: back to the profile's defaults
  const r = resetPatch({ show: { grid: true, targets: false }, caseHide: ['plan', 'parsed'], basicOn: ['analytics', 'case:plan'] }, ['grid', 'analytics', 'case:plan']);
  assert.deepEqual(r, { show: { grid: null, analytics: null, 'case:plan': null }, caseHide: ['parsed'], basicOn: null });
}

// merging as Firestore does (setDoc with merge): `show` key by key, so a reset sends nulls and the other switches stay
{
  const st = { show: { grid: false, targets: false, 'case:recent': false }, caseHide: ['recent'] };
  const after = mergeSettings(st, resetPatch(st, ['targets', 'year']));
  assert.equal(shownIn(after, 'advanced', 'grid'), false, 'another group’s switch is kept');
  assert.equal(shownIn(after, 'advanced', 'targets'), true, 'the reset one is back to its default');
  assert.equal(shownIn(after, 'advanced', 'case:recent'), false);
  assert.deepEqual(mergeSettings(st, { show: { year: false } }).show, { grid: false, targets: false, 'case:recent': false, year: false });
  assert.equal(mergeSettings(st, { show: null }).show, null, 'picking a profile clears the map');
  assert.deepEqual(mergeSettings({ mode: 'basic' }, { show: { grid: true } }).show, { grid: true });
  assert.deepEqual(mergeSettings({ a: 1 }, { b: 2 }), { a: 1, b: 2 });
  // a settings file's show replaces the account's
  const file = replaceShow(st.show, { grid: true });
  assert.deepEqual(file, { grid: true, targets: null, 'case:recent': null });
  assert.equal(shownIn(mergeSettings(st, { show: file, caseHide: null }), 'advanced', 'targets'), true);
}

// picking a profile: its mode, every switch back to its defaults (an ungoverned hidden part stays hidden)
{
  const st = { mode: 'basic', basic: true, basicOn: ['grid'], caseHide: ['parsed', 'plan'], show: { targets: false } };
  const p = applyPatch(st, 'personal');
  assert.deepEqual(p, { mode: 'personal', basic: null, basicOn: null, show: null, caseHide: ['parsed'] });
  const after = { ...st, ...p };
  for (const k of SWITCH_KEYS) assert.equal(shownIn(after, 'personal', k), presetOn('personal', k), k);
  assert.deepEqual(switchChanges(after, 'personal'), { on: [], off: [] }, 'not Custom right after picking');
  assert.equal(applyPatch({ caseHide: ['quick', 'parsed'] }, 'advanced').caseHide.join(), 'parsed', 'an older quick is governed too');
}

// what picking changes, and "Custom (based on …)"
{
  const basic = { mode: 'basic' };
  const toAdv = switchChanges(basic, 'basic', 'advanced');
  assert.deepEqual(toAdv.off, []);
  assert.deepEqual(toAdv.on, ['grid', 'analytics', 'reflExtras', 'case:interesting', 'case:sugg', 'case:recent', 'case:groupsave', 'case:plan', 'case:still']);
  const toPersonal = switchChanges(basic, 'basic', 'personal');
  assert.deepEqual(toPersonal.off, ['targets', 'totals', 'portfolio', 'year', 'reflHeadings', 'saveToast', 'apmesTitle']);
  assert.ok(!toPersonal.on.includes('case:still'), 'Still needed stays off going from Basic to Personal');
  assert.deepEqual(switchChanges(basic, 'basic'), { on: [], off: [] });
  // one switch changed by hand: Custom, and going back would undo just that
  assert.deepEqual(switchChanges({ mode: 'basic', basicOn: ['grid'] }, 'basic'), { on: [], off: ['grid'] });
  assert.deepEqual(switchChanges({ mode: 'personal', show: { targets: true } }, 'personal'), { on: [], off: ['targets'] });
}

// tabs: Personal puts Notes on the bar, Faculty / PCs Case logs and the Admin portal; the Basic profiles keep
// Analytics (and logbook only Reflections) in More
{
  assert.ok(!offBar('personal').includes('notes'));
  assert.ok(offBar('advanced').includes('notes'));
  assert.ok(!offBar('faculty').includes('caselogs') && !offBar('faculty').includes('admin'));
  assert.ok(offBar('basic').includes('progress') && !offBar('basic').includes('reflect'));
  assert.ok(offBar('logbook').includes('reflect'));
  assert.equal(presetHidesTab('faculty', 'log'), true);
  assert.equal(tabsAfter(null, 'advanced', 'basic'), null, 'a device with no saved tabs follows the profile by itself');
  assert.deepEqual(new Set(tabsAfter(['account'], 'advanced', 'basic')), new Set(['account', 'progress']));
  const personal = new Set(tabsAfter(['progress', 'reflect', 'account', 'notes'], 'logbook', 'personal'));
  assert.ok(!personal.has('notes') && !personal.has('progress') && !personal.has('reflect') && personal.has('account'));
  const fac = new Set(tabsAfter([], 'advanced', 'faculty'));
  assert.ok(fac.has('log') && fac.has('logbook') && fac.has('reflect') && !fac.has('caselogs') && !fac.has('admin'));
  // tabs placed by hand that neither profile moves stay put: Notes on the bar and Logbook hidden, Basic to Advanced
  const hand = ['account', 'settings', 'recovery', 'data', 'progress', 'caselogs', 'admin', 'logbook'];
  assert.deepEqual(new Set(tabsAfter(hand, 'basic', 'advanced')), new Set(hand.filter(id => id !== 'progress')));
  assert.deepEqual(tabsAfter(hand, 'basic', 'basic'), hand, 'the same profile moves nothing');
  // Personal to Advanced takes Notes back into More (Personal put it on the bar)
  assert.ok(tabsAfter(['account'], 'personal', 'advanced').includes('notes'));
  // Analytics put on the bar by hand in Basic goes back into More in Basic: logbook only (both profiles move it)
  assert.ok(tabsAfter(['account'], 'basic', 'logbook').includes('progress'));
}

console.log('profiles tests passed');
