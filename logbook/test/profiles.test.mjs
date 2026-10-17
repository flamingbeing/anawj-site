// Profiles as presets (js/profiles.js): switch defaults, saved values, the older lists, picking a profile, "Custom",
// and the tabs a profile moves. Fake settings only.
import assert from 'node:assert/strict';
const P = await import('../js/profiles.js');
const { SWITCH_KEYS, OPT_IN, presetOn, shownIn, switchPatch, resetPatch, applyPatch, switchChanges, offBar, presetHidesTab, tabsAfter, mergeSettings, replaceShow, PROFILE_IDS } = P;
const PARTS = ['interesting', 'parsed', 'sugg', 'recent', 'still', 'groupsave', 'plan'];

// the presets: Basic leaves out the extras (not Reflect), logbook only Reflect too, Personal the APMES parts
{
  for (const k of ['grid', 'reflExtras', 'case:sugg', 'case:recent', 'case:still', 'case:plan']) assert.equal(presetOn('basic', k), false, k);
  // full Analytics in every profile (owner, 15 Oct 2026)
  for (const m of ['logbook', 'basic', 'advanced', 'personal', 'faculty']) assert.equal(presetOn(m, 'analytics'), true, m);
  assert.equal(presetOn('basic', 'reflect'), true);
  assert.equal(presetOn('logbook', 'reflect'), false);
  for (const k of SWITCH_KEYS.filter(k => !OPT_IN.includes(k))) { assert.equal(presetOn('advanced', k), true, k); assert.equal(presetOn('faculty', k), true, k); }
  // opt-in switches (Request an evaluation): off in every profile until switched on, and saved like any switch
  assert.ok(OPT_IN.includes('evalRequest') && SWITCH_KEYS.includes('evalRequest'));
  for (const m of PROFILE_IDS) assert.equal(presetOn(m, 'evalRequest'), false, m);
  assert.equal(shownIn({ mode: 'advanced' }, 'advanced', 'evalRequest'), false);
  assert.equal(shownIn({ mode: 'basic', show: { evalRequest: true } }, 'basic', 'evalRequest'), true);
  assert.deepEqual(switchChanges({ mode: 'advanced', show: { evalRequest: true } }, 'advanced', 'personal').off, ['targets', 'case:still', 'totals', 'portfolio', 'year', 'reflHeadings', 'saveToast', 'apmesTitle', 'evalRequest']);
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
  assert.equal(shownIn(old, 'basic', 'analytics'), true, 'Analytics is on in every profile now');
  assert.equal(shownIn(old, 'basic', 'reflExtras'), false);
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
  assert.deepEqual(toAdv.on, ['grid', 'reflExtras', 'case:interesting', 'case:sugg', 'case:recent', 'case:groupsave', 'case:plan', 'case:still']);
  const toPersonal = switchChanges(basic, 'basic', 'personal');
  assert.deepEqual(toPersonal.off, ['targets', 'totals', 'portfolio', 'year', 'reflHeadings', 'saveToast', 'apmesTitle']);
  assert.ok(!toPersonal.on.includes('case:still'), 'Still needed stays off going from Basic to Personal');
  assert.deepEqual(switchChanges(basic, 'basic'), { on: [], off: [] });
  // one switch changed by hand: Custom, and going back would undo just that
  assert.deepEqual(switchChanges({ mode: 'basic', basicOn: ['grid'] }, 'basic'), { on: [], off: ['grid'] });
  assert.deepEqual(switchChanges({ mode: 'personal', show: { targets: true } }, 'personal'), { on: [], off: ['targets'] });
}

// tabs (owner, 15 Oct 2026): logbook only Case · Logbook · Totals · More; Basic + Reflections; Advanced + Reflections ·
// Analytics; Personal Case · Logbook · Notes · Reflections · Analytics · More; Faculty / PCs Totals · Admin · More
{
  assert.ok(!offBar('personal').includes('notes'));
  assert.ok(offBar('advanced').includes('notes'));
  assert.ok(!offBar('faculty').includes('totals') && !offBar('faculty').includes('admin') && offBar('faculty').includes('caselogs') && offBar('faculty').includes('progress'));
  assert.ok(!offBar('advanced').includes('progress') && !offBar('advanced').includes('totals'));
  assert.ok(!offBar('personal').includes('progress') && !offBar('personal').includes('notes'));
  assert.ok(offBar('basic').includes('progress') && !offBar('basic').includes('reflect'));
  assert.ok(offBar('logbook').includes('reflect'));
  assert.equal(presetHidesTab('faculty', 'log'), true);
  assert.equal(tabsAfter(null, 'advanced', 'basic'), null, 'a device with no saved tabs follows the profile by itself');
  assert.deepEqual(new Set(tabsAfter(['account'], 'advanced', 'basic')), new Set(['account', 'progress']));
  const personal = new Set(tabsAfter(['progress', 'reflect', 'account', 'notes'], 'logbook', 'personal'));
  assert.ok(!personal.has('notes') && !personal.has('progress') && !personal.has('reflect') && personal.has('account'), 'Personal puts Notes and Analytics on the bar');
  const fac = new Set(tabsAfter([], 'advanced', 'faculty'));
  assert.ok(fac.has('log') && fac.has('logbook') && fac.has('reflect') && fac.has('caselogs') && fac.has('progress') && !fac.has('totals') && !fac.has('admin'));
  // tabs placed by hand that neither profile moves stay put: Notes on the bar and Logbook hidden, Basic to Advanced
  const hand = ['account', 'settings', 'recovery', 'data', 'progress', 'caselogs', 'admin', 'logbook'];
  assert.deepEqual(new Set(tabsAfter(hand, 'basic', 'advanced')), new Set(hand.filter(x => x !== 'progress')), 'Advanced puts Analytics on the bar; the rest stay put');
  assert.deepEqual(tabsAfter(hand, 'basic', 'basic'), hand, 'the same profile moves nothing');
  // Personal to Advanced takes Notes back into More (Personal put it on the bar)
  assert.ok(tabsAfter(['account'], 'personal', 'advanced').includes('notes'));
  // Analytics put on the bar by hand in Basic goes back into More in Basic: logbook only (both profiles move it)
  assert.ok(tabsAfter(['account'], 'basic', 'logbook').includes('progress'));
}

// the cloud's write paths: settings keys whole (a map like markdown too), `show` key by key (bug: Firestore's plain
// merge kept markdown keys a new value left out, so a format set back to its default stayed custom)
{
  assert.deepEqual(P.mergePaths({ settings: { markdown: { links: 'md' }, show: { grid: false, 'case:plan': null }, mode: 'basic' }, email: 'e', updatedAt: 1 }),
    [['settings', 'markdown'], ['settings', 'show', 'grid'], ['settings', 'show', 'case:plan'], ['settings', 'mode'], ['email'], ['updatedAt']]);
  assert.deepEqual(P.mergePaths({ settings: { show: null } }), [['settings', 'show']], 'null clears the whole map');
  assert.deepEqual(P.mergePaths({ profile: { a: 1 }, settings: null }), [['profile'], ['settings']]);
  // and the local copy / demo agree: markdown replaced, show merged
  assert.deepEqual(mergeSettings({ markdown: { dateFormat: 'long' }, show: { grid: false } }, { markdown: { links: 'md' }, show: { analytics: false } }),
    { markdown: { links: 'md' }, show: { grid: false, analytics: false } });
}

// a settings file from before `show` (mode, basicOn, caseHide): its lists become the switches, winning over the
// account's own (bug: the account's show.grid=false kept the grid hidden though the file turned it on)
{
  const old = P.legacyShow({ mode: 'basic', basicOn: ['grid', 'case:plan'], caseHide: [] }, 'basic');
  assert.deepEqual(old, { grid: true, 'case:plan': true });
  const show = replaceShow({ grid: false, 'case:plan': false, analytics: false }, old);
  assert.equal(shownIn({ basicOn: ['grid', 'case:plan'], show }, 'basic', 'grid'), true);
  assert.equal(shownIn({ show }, 'basic', 'case:plan'), true);
  assert.equal(shownIn({ show }, 'basic', 'analytics'), true, 'the account’s other switches go back to the profile');
  assert.deepEqual(P.legacyShow({ mode: 'advanced', caseHide: ['quick', 'plan'] }, 'advanced'), { 'case:sugg': false, 'case:recent': false, 'case:plan': false });
  assert.equal(P.legacyShow({ show: { grid: true }, basicOn: ['grid'] }, 'basic'), null, 'a file with show uses its show');
  assert.equal(P.legacyShow({ weekStart: 0 }, 'basic'), null);
}

// the old combined part 'case:quick': a reset of either half clears it (bug: Reset this group left both hidden)
{
  const st = { show: { 'case:quick': false } };
  const all = mergeSettings(st, resetPatch(st, ['case:interesting', 'case:sugg', 'case:recent', 'case:groupsave', 'case:plan']));
  assert.equal(shownIn(all, 'advanced', 'case:sugg'), true); assert.equal(shownIn(all, 'advanced', 'case:recent'), true);
  assert.deepEqual(switchChanges(all, 'advanced'), { on: [], off: [] }, 'not Custom any more');
  // one half reset: the other keeps the old value
  const one = mergeSettings(st, resetPatch(st, ['case:sugg']));
  assert.equal(shownIn(one, 'advanced', 'case:sugg'), true); assert.equal(shownIn(one, 'advanced', 'case:recent'), false);
  // one half switched: the other keeps the old value, and 'quick' goes
  const sw = mergeSettings(st, switchPatch(st, 'case:sugg', true, PARTS));
  assert.equal(shownIn(sw, 'advanced', 'case:sugg'), true); assert.equal(shownIn(sw, 'advanced', 'case:recent'), false);
  assert.equal(sw.show['case:quick'], null);
}

console.log('profiles tests passed');
