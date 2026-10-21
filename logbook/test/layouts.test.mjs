// Device layout choices: strict imports, theme resets and the older short-row alias.
import assert from 'node:assert/strict';
import { NAV_STYLES, ROW_LAYOUTS, FORM_LAYOUTS, rowLayoutOf, barAtBottom } from '../js/device-presets.js';
import { lookOf, minePatch, saveMine } from '../js/my-themes.js';
import { THEME_KEYS, themeById, themePatch, themeState } from '../js/themes.js';
import { readSettingsFile, settingsFile } from '../js/settings-file.js';

let checks = 0;
for (const [key, options] of Object.entries({ navStyle: NAV_STYLES, rowLayout: ROW_LAYOUTS, formLayout: FORM_LAYOUTS })) {
  assert.ok(THEME_KEYS.includes(key));
  for (const [value] of options) {
    const d = { [key]: value };
    assert.deepEqual(lookOf(d), d);
    assert.deepEqual(readSettingsFile(JSON.stringify(settingsFile({ settings: d }))).settings, d);
    assert.equal(minePatch(saveMine([], 'Layout', d)[0], { themeKeep: [] })[key], value);
    checks++;
  }
  for (const invalid of ['unknown', true, 3, [], {}]) {
    assert.deepEqual(lookOf({ [key]: invalid }), {});
    assert.equal(readSettingsFile(JSON.stringify(settingsFile({ settings: { [key]: invalid } }))).settings[key], null);
    checks++;
  }
  assert.equal(themePatch(themeById('nuhs'), { [key]: options[1][0], themeKeep: [] })[key], null);
  // Keep when changing theme (look-schema.js): layout stays unless switched off
  assert.equal(themePatch(themeById('nuhs'), { [key]: options[1][0] })[key], options[1][0]);
}
assert.equal(rowLayoutOf({}), 'card');
assert.equal(rowLayoutOf({ rowShort: true }), 'compact');
assert.equal(rowLayoutOf({ rowShort: true, rowLayout: 'card' }), 'card');
assert.equal(rowLayoutOf({ rowShort: true, rowLayout: 'chat' }), 'chat');
assert.equal(rowLayoutOf({ rowLayout: 'invalid' }), 'card');
assert.equal(rowLayoutOf({ rowShort: true, rowLayout: 'invalid' }), 'compact');
for (const width of [390, 600, 900, 901, 1200]) for (const tabBar of ['auto', 'top', 'bottom']) {
  assert.equal(barAtBottom({ width, tabBar, navStyle: 'rail' }), width > 900 ? false : barAtBottom({ width, tabBar }));
  checks++;
}
// X uses compact feed rows; conversation themes keep the chat timestamp layout.
for (const [id, key, value] of [['x', 'rowLayout', 'compact'], ['notion', 'rowLayout', 'compact'], ['office', 'navStyle', 'rail']]) {
  const d = { ...themePatch(themeById(id), { themeKeep: [] }), themeKeep: [] };
  assert.equal(d[key], value);
  assert.equal(themeState(d).custom, false);
  assert.equal(themeState({ ...d, [key]: 'default' }).custom, true);
  // with Layout kept (the default), the theme leaves the device's layout alone, and that isn't a change to the theme
  const kept = { ...themePatch(themeById(id), {}), theme: id };
  assert.equal(kept[key], null);
  assert.equal(themeState(kept).custom, false);
  assert.equal(themeState({ ...kept, [key]: 'chat' }).custom, false);
}
console.log(`PASS layouts: ${checks + 18} setting, alias and theme checks`);
