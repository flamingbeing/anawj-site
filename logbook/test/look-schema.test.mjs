// Run with: node logbook/test/look-schema.test.mjs  (fake data only)
// Look settings (look-schema.js): one list of what every look setting may hold, used by bundled themes, saved themes,
// themes files, settings files and theme links; and what stays when changing theme.
import assert from 'node:assert/strict';
import { LOOK, LOOK_KEYS, cleanLook, KEEP_GROUPS, keepGroups, keptKeys, THEME_CARDS, cardsOn } from '../js/look-schema.js';
import { THEMES, THEME_KEYS, themeById, themePatch, themeState, checkTheme } from '../js/themes.js';
import { lookOf, saveMine, minePatch, matchMine } from '../js/my-themes.js';
import { readSettingsFile, SETTINGS_KIND } from '../js/settings-file.js';
import { DISPLAY_KEYS } from '../js/display.js';

assert.deepEqual(THEME_KEYS, LOOK_KEYS);
assert.equal(new Set(LOOK_KEYS).size, LOOK_KEYS.length, 'one entry per setting');
for (const k of LOOK_KEYS) assert.ok(DISPLAY_KEYS.includes(k), k + ' is a device setting');
assert.ok(DISPLAY_KEYS.includes('themeKeep'));
for (const t of THEMES) assert.deepEqual(checkTheme(t), [], t.id);

// values the Themes page can't show are rejected everywhere (docs/theme-engine-follow-up.md: the validation probe)
const probe = { id: 'probe', name: 'Probe', group: 'inspired', desc: 'Validation probe', look: { round: 9, btnStyle: 'unlisted' } };
assert.equal(checkTheme(probe).length, 2);
assert.deepEqual(lookOf(probe.look), {});
for (const [k, bad] of [['round', 4], ['round', -1], ['borders', 4], ['lineHeight', '1.7'], ['contrast', 'max'], ['wallDim', 7], ['wallInk', 8], ['wallInk', 42], ['wallFrost', 1], ['iconTintStrength', 5], ['ftGap', 40], ['spacing', 'huge'], ['flat', 'yes'], ['shadows', true], ['accent', 'red'], ['bgTint', 'toString']]) {
  assert.equal(cleanLook(k, bad), null, `${k} ${bad}`);
  assert.ok(checkTheme({ ...probe, look: { [k]: bad } }).length, `${k} ${bad}`);
}
for (const [k, good] of [['round', 0], ['round', 3], ['borders', 3], ['lineHeight', '1.3'], ['wallDim', 90], ['wallInk', 36], ['wallFrost', true], ['ftGap', 6], ['spacing', 'roomy'], ['flat', true], ['shadows', false], ['accent', '#ABCDEF']])
  assert.notEqual(cleanLook(k, good), null, `${k} ${good}`);
assert.equal(cleanLook('spacing', 'normal'), null, 'a facet at its default saves as unset');
assert.equal(cleanLook('colourful', true), 'tabs', 'the old on/off Colourful');
assert.equal(cleanLook('wallpaper', 'photo'), null, 'a photo never travels');
assert.deepEqual(readSettingsFile(JSON.stringify({ kind: SETTINGS_KIND, settings: { navStyle: 'rail', spacing: 'huge', themeKeep: ['type', 'nope', 3] } })).settings,
  { ...readSettingsFile(JSON.stringify({ kind: SETTINGS_KIND, settings: {} })).settings, navStyle: 'rail', spacing: null, themeKeep: ['type'] });
for (const f of LOOK) assert.ok(['enum', 'bool', 'off', 'int', 'tune', 'colour', 'colours', 'icons'].includes(f.kind), f.key);
console.log('look-schema values: ok');

// Keep when changing theme: wallpaper and layout by default; none, or fonts too, when chosen
assert.deepEqual(keepGroups({}), ['wallpaper', 'layout']);
assert.deepEqual(keepGroups({ themeKeep: [] }), []);
assert.deepEqual(keepGroups({ themeKeep: ['type', 'wallpaper'] }), ['wallpaper', 'type']);
assert.deepEqual(KEEP_GROUPS.map(g => g[0]), ['wallpaper', 'layout', 'type']);
assert.ok(keptKeys({}).has('wallpaper') && keptKeys({}).has('rowLayout') && !keptKeys({}).has('fontUi') && !keptKeys({}).has('accent'));
const mine = { wallpaper: 'grid', wallDim: 30, rowLayout: 'chat', navStyle: 'rail', fontUi: 'inter', accent: '#123456', round: 0 };
const withPattern = THEMES.find(t => t.look.wallpaper);
let p = themePatch(withPattern, mine);
assert.deepEqual([p.wallpaper, p.wallDim, p.rowLayout, p.navStyle], ['grid', 30, 'chat', 'rail'], 'kept');
assert.equal(p.fontUi, withPattern.look.fontUi ?? null, 'fonts follow the theme unless kept');
assert.equal(p.accent, withPattern.look.accent ?? null, 'the colour always follows the theme');
assert.equal(themeState({ ...mine, ...p }).custom, false, 'kept settings aren’t a change to the theme');
p = themePatch(withPattern, { ...mine, themeKeep: ['type'] });
assert.deepEqual([p.wallpaper, p.rowLayout, p.fontUi], [withPattern.look.wallpaper, withPattern.look.rowLayout ?? null, 'inter']);
assert.equal(themeState({ ...mine, ...p, themeKeep: ['type'] }).custom, false);
// a photo stays when the theme sets no wallpaper, even with Wallpaper not kept (as before)
p = themePatch(themeById('nuhs'), { wallpaper: 'photo', wallDim: 50, themeKeep: [] });
assert.deepEqual([p.wallpaper, p.wallDim], ['photo', 50]);
// your themes: the same, and a saved theme still matches when only kept settings differ
const saved = saveMine([], 'Fake mine', { accent: '#654321', rowLayout: 'timeline', wallpaper: 'dots' });
p = minePatch(saved[0], mine);
assert.deepEqual([p.accent, p.rowLayout, p.wallpaper], ['#654321', 'chat', 'grid']);
assert.equal(matchMine(saved, { ...mine, ...p }).name, 'Fake mine');
assert.equal(matchMine(saved, { ...mine, ...p, themeKeep: [] }), null, 'nothing kept: every setting counts');
console.log('look-schema keep when changing theme: ok');

// Themes and Advanced theme settings (TE S2): every setting names a card, every card is on one page; the essentials
// (themes, Keep, Your themes, light or dark, colour, background, wallpaper) on Themes, the rest on the Advanced page
const cardIds = THEME_CARDS.map(([id]) => id);
assert.equal(new Set(cardIds).size, cardIds.length, 'a card listed twice');
for (const f of LOOK) assert.ok(cardIds.includes(f.section), `${f.key}: no card (section) on the Themes pages`);
assert.deepEqual(cardsOn('themes'), ['themes', 'mine', 'colour', 'wallpaper']);
const on = page => LOOK.filter(f => cardsOn(page).includes(f.section)).map(f => f.key);
assert.deepEqual(on('themes'), ['accent', 'bgTint', 'wallpaper', 'wallDim', 'wallInk', 'wallFrost']);
for (const k of ['round', 'fontUi', 'ftGap', 'colours', 'navStyle', 'tabStyle', 'statusBar', 'iconTint', 'colourful', 'band']) assert.ok(on('themesadv').includes(k), k + ' not on Advanced');
assert.deepEqual(on('access'), ['contrast']);
console.log('look-schema theme pages: ok');
