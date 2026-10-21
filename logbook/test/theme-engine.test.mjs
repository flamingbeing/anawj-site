// The theme engine (js/theme-engine.js): facets with listed choices, their CSS, icon sets, page motion, and the
// check every theme passes (js/themes.js checkTheme).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FACETS, FACET_KEYS, FACET_GROUPS, cleanFacet, facetCss, facetDefault, ICON_SETS, iconPath, PAGE_MOTIONS, pageMotion, foldCompact, FINE_TUNE, TUNE_KEYS, cleanTune, tuneCss } from '../js/theme-engine.js';
import { migrateDisplay, DISPLAY_KEYS } from '../js/display.js';
import { THEMES, THEME_KEYS, checkTheme, lookCss, themePatch, themeState, themeById } from '../js/themes.js';
import { lookOf, themeLink, themeFromLink } from '../js/my-themes.js';
import { readSettingsFile, SETTINGS_KIND } from '../js/settings-file.js';

// every facet: a unique key, a known group, a default first, CSS for each choice it styles, a theme and device key
assert.equal(new Set(FACET_KEYS).size, FACET_KEYS.length);
const displaySrc = readFileSync(new URL('../js/display.js', import.meta.url), 'utf8');
for (const f of FACETS) {
  assert.ok(FACET_GROUPS.some(([g]) => g === f.group), f.key + ' group');
  assert.ok(THEME_KEYS.includes(f.key), f.key + ' in THEME_KEYS');
  assert.ok(displaySrc.includes(`'${f.key}'`), f.key + ' in DISPLAY_KEYS');
  assert.ok(f.label && (f.bool || f.choices.length >= 2), f.key);
  if (f.bool) { assert.ok(f.css || f.js, f.key); continue; }
  assert.equal(facetDefault(f), f.choices[0][0]);
  for (const [v] of f.choices.slice(1)) {
    assert.ok(f.js || (f.css && typeof f.css[v] === 'string') || (f.key === 'iconSet' && !ICON_SETS[v].css) || (f.key === 'pageMotion' && !PAGE_MOTIONS[v].vars) || (f.key === 'spacing' && v === 'compact'), `${f.key}: ${v} does something`);   // compact: body.compact (display.js)
  }
}
// values: listed choices only; the default and anything else saves as null
assert.equal(cleanFacet('headerStyle', 'filled'), 'filled');
assert.equal(cleanFacet('headerStyle', 'plain'), null);
assert.equal(cleanFacet('headerStyle', 'nonsense'), null);
assert.equal(cleanFacet('barBlur', true), true);
assert.equal(cleanFacet('barBlur', 'yes'), null);
assert.equal(cleanFacet('nope', 'x'), null);

// the CSS: nothing by default; each choice adds its own, with nothing that could load from elsewhere or break out
assert.deepEqual(facetCss({}), []);
assert.equal(lookCss({ headerStyle: 'plain', pageMotion: 'default', sheetStyle: 'default' }), '');
for (const f of FACETS) for (const v of f.bool ? [true] : f.choices.slice(1).map(([c]) => c)) {
  const css = facetCss({ [f.key]: v }).join('\n');
  assert.ok(!/<|@import|url\(\s*['"]?(?!data:)/.test(css), `${f.key}: ${v}`);
  assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, `${f.key}: ${v} braces`);
}
assert.match(lookCss({ headerStyle: 'filled' }), /\.top \{ --header-ink: var\(--accent-ink\); background: var\(--accent\)/);
assert.match(lookCss({ sheetStyle: 'ios' }), /sheet-up/);
assert.match(lookCss({ toastStyle: 'material' }), /#313033/);
assert.match(lookCss({ fieldStyle: 'filled' }), /inset 0 -2px 0 var\(--accent\)/);
assert.match(lookCss({ checkStyle: 'round' }), /border-radius: 50%/);
assert.match(lookCss({ headingTone: 'ink' }), /color: var\(--header-ink, var\(--ink\)\)/);
assert.match(lookCss({ tabTone: 'ink' }), /aria-selected="true".*color: var\(--ink\)/);
assert.equal(lookCss({ headingTone: 'accent', tabTone: 'accent' }), '');
assert.match(lookCss({ listStyle: 'edge' }), /body\.compact section\.card \{ margin-left: -8px; margin-right: -8px;/);
assert.match(lookCss({ pageMotion: 'ios' }), /--dur: 350ms/);
assert.match(lookCss({ tabIconFill: true }), /fill: color-mix/);

// icon sets: a set's own path wins, any other icon keeps the default
ICON_SETS.test = { label: 'Test', paths: { search: 'M1 1h2' } };
assert.equal(iconPath('search', 'M0 0', 'test'), 'M1 1h2');
assert.equal(iconPath('copy', 'M0 0', 'test'), 'M0 0');
assert.equal(iconPath('search', 'M0 0', ''), 'M0 0');
delete ICON_SETS.test;
for (const [k, s] of Object.entries(ICON_SETS)) for (const [n, d] of Object.entries(s.paths || {})) assert.match(d, /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/, `${k}.${n}`);

// Every tab and search has an original drawing in both system sets; unknown icons still fall back.
for (const set of ['ios', 'material']) {
  for (const name of ['log', 'logbook', 'reflect', 'progress', 'totals', 'notes', 'more', 'settings', 'account', 'search']) {
    assert.ok(ICON_SETS[set].paths[name], `${set}.${name} has a drawing`);
    assert.equal(iconPath(name, 'fallback', set), ICON_SETS[set].paths[name]);
    assert.notEqual(ICON_SETS.ios.paths[name], ICON_SETS.material.paths[name], `${name} has distinct system drawings`);
  }
  assert.equal(iconPath('unknown', 'fallback', set), 'fallback');
}

// page motion: the default is the old slide; every motion with a duration has frames both ways
assert.equal(pageMotion({}), PAGE_MOTIONS.default);
assert.equal(pageMotion({ pageMotion: 'nope' }), PAGE_MOTIONS.default);
assert.deepEqual(PAGE_MOTIONS.default.frames(1, 400), [{ transform: 'translateX(120px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }]);
for (const [k, m] of Object.entries(PAGE_MOTIONS)) if (m.ms) for (const dir of [1, -1, 0]) assert.equal(m.frames(dir, 390).length, 2, `${k} ${dir}`);

// every theme passes the check, and one with colours of its own still reads as itself (not Custom)
for (const t of THEMES) assert.deepEqual(checkTheme(t), [], t.id);
assert.ok(checkTheme({ id: 'x2', name: ' ', group: 'inspired', desc: 'd', look: {} }).some(p => /name:/.test(p)));
assert.ok(checkTheme({ id: 'x3', name: 'A-style', group: 'inspired', desc: 'd', look: { headerStyle: 'huge' } }).some(p => /headerStyle/.test(p)));
assert.ok(checkTheme({ id: 'x4', name: 'A-style', group: 'inspired', desc: 'd', look: { colours: { light: { ink: '#ffffff', bg: '#ffffff' } } } }).some(p => /colours/.test(p)));
const own = { id: 'own', name: 'Own-style', group: 'inspired', desc: 'd', look: { colours: { light: { bg: '#fafafa' } } } };
const d = JSON.parse(JSON.stringify(themePatch(own)));
THEMES.push(own);
assert.equal(themeState(d).custom, false, 'a theme’s own colours match after a save');
THEMES.pop();
assert.equal(themeById('apple').look.pageMotion, 'ios');

// Your themes and the settings file keep a facet's listed values and drop the rest
assert.deepEqual(lookOf({ headerStyle: 'large', sheetStyle: 'bogus', barBlur: true }), { headerStyle: 'large', barBlur: true });
const got = readSettingsFile(JSON.stringify({ kind: SETTINGS_KIND, settings: { toastStyle: 'material', fieldStyle: '<b>' } })).settings;
assert.equal(got.toastStyle, 'material');
assert.equal(got.fieldStyle, null);

// Sizes (theme-revamp S2): the old Compact mode is Spacing: Tight ('compact'), whatever spacing came with it
assert.deepEqual(foldCompact({ compact: true, accent: '#123456' }), { spacing: 'compact', accent: '#123456' });
assert.deepEqual(foldCompact({ compact: true, spacing: 'roomy' }), { spacing: 'compact' });
assert.deepEqual(foldCompact({ compact: false, spacing: 'tight' }), { spacing: 'tight' });   // Snug stays Snug
assert.deepEqual(foldCompact({ compact: null }), {});
const plain = { spacing: 'roomy' };
assert.equal(foldCompact(plain), plain);
assert.equal(facetCss({ spacing: 'compact' }).length, 0);   // Tight is body.compact, not facet CSS
assert.ok(facetCss({ spacing: 'tight' })[0].includes('padding: 11px'));   // Snug keeps the old Tight values
// a device, an old account copy and saved themes fold once; Normal stays exactly as it was
const mig = migrateDisplay({ v: 2, compact: true, spacing: null, myThemes: [{ id: 'a', name: 'Mine', look: { compact: true, round: 0 } }] });
assert.equal(mig.spacing, 'compact');
assert.ok(!('compact' in mig));
assert.deepEqual(mig.myThemes[0].look, { round: 0, spacing: 'compact' });
assert.equal(migrateDisplay({ v: 2, compact: false }).spacing, undefined);
const same = { v: 2, spacing: 'tight' };
assert.equal(migrateDisplay(same), same);
assert.equal(migrateDisplay({ compact: true, textSize: '1.12' }).zoom, '1.1');   // the older text-size move still runs
// a theme and a saved look carry the old switch as Tight
assert.deepEqual(lookOf({ compact: true }), { spacing: 'compact' });
assert.ok(!THEME_KEYS.includes('compact'));
assert.ok(DISPLAY_KEYS.includes('compact'));   // still read from an account's settings, then folded

// Fine-tune: per device, theme keys too, unset by default, in range and on the step only
for (const k of TUNE_KEYS) { assert.ok(DISPLAY_KEYS.includes(k), k); assert.ok(THEME_KEYS.includes(k), k); }
for (const t of FINE_TUNE) {
  assert.equal(cleanTune(t.key, t.min), t.min); assert.equal(cleanTune(t.key, t.max), t.max); assert.equal(cleanTune(t.key, t.from), t.from, t.key);
  assert.equal(cleanTune(t.key, t.max + t.step), null); assert.equal(cleanTune(t.key, t.min - t.step), null);
  assert.equal(cleanTune(t.key, String(t.from)), null); assert.equal(cleanTune(t.key, NaN), null);
  assert.equal(typeof t.css(t.from), 'string');
}
assert.equal(cleanTune('ftGap', 4.5), null);
assert.equal(cleanTune('ftLetter', 0.02), 0.02);
assert.equal(cleanTune('ftLine', 1.5), 1.5);
assert.equal(tuneCss({}), '');
assert.equal(lookCss({}), '');   // nothing set: no CSS at all, Normal is today's look
const tc = tuneCss({ ftGap: 4, ftBtn: 99, ftDays: 12 });
assert.ok(tc.startsWith('@layer tune {') && tc.includes('gap: 4px') && tc.includes('margin-top: 12px') && !tc.includes('99px'));
assert.ok(lookCss({ ftGap: 4 }).includes('@layer tune'));
assert.ok(tuneCss({ ftBtn: 32 }).includes('max(32px, 44px)'));   // Bigger taps keeps 44 px on the Add tab
assert.deepEqual(checkTheme({ ...themeById('nuhs'), look: { ...themeById('nuhs').look, ftGap: 6, ftLetter: 0.01 } }), []);
assert.match(checkTheme({ ...themeById('nuhs'), look: { ftGap: 40 } }).join(), /ftGap: 40 is out of range/);
assert.match(checkTheme({ ...themeById('nuhs'), look: { compact: true } }).join(), /look.compact: not a look setting/);
assert.deepEqual(lookOf({ ftGap: 6, ftBtn: 3 }), { ftGap: 6 });
const ft = readSettingsFile(JSON.stringify({ kind: SETTINGS_KIND, settings: { ftCases: 4, ftWeight: 450, spacing: 'compact' } })).settings;
assert.equal(ft.ftCases, 4); assert.equal(ft.ftWeight, null); assert.equal(ft.spacing, 'compact');
// fonts in a theme (theme-revamp S5): bundled ones only, so a link can't name a font file or a typed font
assert.match(checkTheme({ ...themeById('nuhs'), look: { fontUi: 'file' } }).join(), /fontUi: a bundled font/);
assert.match(checkTheme({ ...themeById('nuhs'), look: { fontLog: 'named', headFont: 'comic' } }).join(), /(?=.*fontLog)(?=.*headFont)/);
assert.deepEqual(checkTheme({ ...themeById('nuhs'), look: { fontUi: 'sourceserif', fontLog: 'same', headFont: 'jetbrains' } }), []);
// links: bad values dropped (a stranger's link is checked like a theme), good ones kept
const shared = themeFromLink(themeLink('https://fake.example/', { name: 'Fake', look: { spacing: 'roomy', ftGap: 6, fontUi: 'plex' } }).split('/')[3]);
assert.deepEqual(shared.look, { spacing: 'roomy', ftGap: 6, fontUi: 'plex' });
const raw = themeLink('https://fake.example/', { name: 'Fake', look: { fontUi: 'file', fontLog: 'named', tabStyle: 'pill' } }).split('/')[3];
assert.deepEqual(themeFromLink(raw).look, { tabStyle: 'pill' }, 'fonts that aren’t bundled dropped');
console.log('theme engine tests passed');
