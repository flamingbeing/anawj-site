// The theme engine (js/theme-engine.js): facets with listed choices, their CSS, icon sets, page motion, and the
// check every theme passes (js/themes.js checkTheme).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FACETS, FACET_KEYS, FACET_GROUPS, cleanFacet, facetCss, facetDefault, ICON_SETS, iconPath, PAGE_MOTIONS, pageMotion } from '../js/theme-engine.js';
import { THEMES, THEME_KEYS, checkTheme, lookCss, themePatch, themeState, themeById } from '../js/themes.js';
import { lookOf } from '../js/my-themes.js';
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
    assert.ok(f.js || (f.css && typeof f.css[v] === 'string') || (f.key === 'iconSet' && !ICON_SETS[v].css) || (f.key === 'pageMotion' && !PAGE_MOTIONS[v].vars), `${f.key}: ${v} does something`);
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
assert.match(lookCss({ headerStyle: 'filled' }), /\.top \{ background: var\(--accent\)/);
assert.match(lookCss({ sheetStyle: 'ios' }), /sheet-up/);
assert.match(lookCss({ toastStyle: 'material' }), /#313033/);
assert.match(lookCss({ fieldStyle: 'filled' }), /inset 0 -2px 0 var\(--accent\)/);
assert.match(lookCss({ checkStyle: 'round' }), /border-radius: 50%/);
assert.match(lookCss({ pageMotion: 'ios' }), /--dur: 350ms/);
assert.match(lookCss({ tabIconFill: true }), /fill: color-mix/);

// icon sets: a set's own path wins, any other icon keeps the default
ICON_SETS.test = { label: 'Test', paths: { search: 'M1 1h2' } };
assert.equal(iconPath('search', 'M0 0', 'test'), 'M1 1h2');
assert.equal(iconPath('copy', 'M0 0', 'test'), 'M0 0');
assert.equal(iconPath('search', 'M0 0', ''), 'M0 0');
delete ICON_SETS.test;
for (const [k, s] of Object.entries(ICON_SETS)) for (const [n, d] of Object.entries(s.paths || {})) assert.match(d, /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/, `${k}.${n}`);

// page motion: the default is the old slide; every motion with a duration has frames both ways
assert.equal(pageMotion({}), PAGE_MOTIONS.default);
assert.equal(pageMotion({ pageMotion: 'nope' }), PAGE_MOTIONS.default);
assert.deepEqual(PAGE_MOTIONS.default.frames(1, 400), [{ transform: 'translateX(120px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }]);
for (const [k, m] of Object.entries(PAGE_MOTIONS)) if (m.ms) for (const dir of [1, -1, 0]) assert.equal(m.frames(dir, 390).length, 2, `${k} ${dir}`);

// every theme passes the check, and one with colours of its own still reads as itself (not Custom)
for (const t of THEMES) assert.deepEqual(checkTheme(t), [], t.id);
assert.ok(checkTheme({ id: 'x2', name: 'Thing', group: 'inspired', desc: 'd', look: {} }).some(p => /-style/.test(p)));
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
console.log('theme engine tests passed');
