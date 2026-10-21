// Settings export / import (js/settings-file.js).
import assert from 'node:assert/strict';
import { settingsFile, readSettingsFile, SETTINGS_KIND, deviceFile, readDeviceFile, isDeviceFile, isDeviceKey, DEVICE_KIND } from '../js/settings-file.js';

const lb = { email: 'x@y', name: 'N', profile: { familyName: 'Secret' }, settings: { compact: true, searchOps: true, sharedSeen: ['a'], tagSet: [{ k: 'c:16', t: 'apmes' }], shareFormat: { dayHead: '{day}' } },
  templates: [{ id: 't1', name: 'LSCS spinal', cats: ['16', '28'] }] };
const f = settingsFile(lb, { theme: 'dark' });
assert.equal(f.kind, SETTINGS_KIND);
assert.equal(f.settings.compact, true);
assert.equal('sharedSeen' in f.settings, false);       // account bookkeeping stays behind
assert.equal(JSON.stringify(f).includes('Secret'), false);   // never portfolio details
assert.equal(JSON.stringify(f).includes('x@y'), false);
assert.equal(f.theme, 'dark');

const back = readSettingsFile(JSON.stringify(f));
assert.equal(back.settings.compact, true);
assert.equal(back.settings.searchOps, true);
assert.equal(back.settings.shareFormat.dayHead, '{day}');   // cleaned: the other fields fall back to the default
assert.ok(Array.isArray(back.settings.tagSet));
assert.equal(back.templates.length, 1);
assert.equal(back.theme, 'dark');

// places to send to travel in the file, cleaned: a script-like link never gets through
const dst = settingsFile({ settings: { destinations: [{ id: 'a', name: 'Obs', uri: 'obsidian://new?content={content}' }] } });
assert.equal(readSettingsFile(JSON.stringify(dst)).settings.destinations[0].uri, 'obsidian://new?content={content}');
const evil = { kind: SETTINGS_KIND, version: 1, settings: { destinations: [{ id: 'b', name: 'Bad', uri: 'javascript:alert({content})' }, { id: 'c', name: 'Ok', uri: 'https://x.test/?t={content}' }] } };
assert.deepEqual(readSettingsFile(JSON.stringify(evil)).settings.destinations.map(d => d.id), ['c']);

// junk and the wrong files
assert.throws(() => readSettingsFile('nope'), /not JSON/);
assert.throws(() => readSettingsFile('{"kind":"other"}'), /isn’t a settings file/);
assert.throws(() => readSettingsFile('{"logbook":{},"cases":[]}'), /full backup/);
assert.throws(() => readSettingsFile(`{"kind":"${SETTINGS_KIND}"}`), /no settings/);
const odd = readSettingsFile(JSON.stringify({ kind: SETTINGS_KIND, settings: { 'bad key': 1, unknown: 2, compact: true, textSize: { x: 1 }, sharedSeen: [1], rYear: 1, rYearAY: 2025 }, templates: [{ id: 'x', name: 'empty', cats: [] }], theme: 'neon' }));
assert.deepEqual(odd.settings, { compact: true });   // unknown keys, wrong shapes and your residency year are dropped
assert.deepEqual(odd.templates, []);
assert.equal(odd.theme, null);

// lists and objects come back in the shape the app reads (a bad one used to break the Logbook tab)
const shaped = readSettingsFile(JSON.stringify({ kind: SETTINGS_KIND, settings: { savedSearches: { a: 1 }, shareFormat: 'x', excelExport: [1] } }));
assert.deepEqual(shaped.settings.savedSearches, []);
assert.equal(typeof shaped.settings.shareFormat.dayHead, 'string');
assert.ok(Array.isArray(shaped.settings.excelExport.caseCols));
// a search saved on the Search page keeps its global flag (it runs in Search from the Logbook)
assert.equal(readSettingsFile(JSON.stringify({ kind: SETTINGS_KIND, settings: { savedSearches: [{ name: 'Everywhere', q: 'lap in:notes', global: true }, { name: 'Logbook', q: 'x', global: 'yes' }] } })).settings.savedSearches.map(x => x.global).join(), 'true,');
const ss = readSettingsFile(JSON.stringify({ kind: SETTINGS_KIND, settings: { savedSearches: [null, 3, { name: 'Blocks', has: ['c:26', 5], q: 'block' }] } })).settings.savedSearches;
assert.equal(ss.length, 1); assert.deepEqual(ss[0].has, ['c:26']); assert.equal(ss[0].q, 'block');
assert.equal('rYear' in settingsFile({ settings: { rYear: 4, compact: true } }).settings, false);

assert.deepEqual(readSettingsFile(JSON.stringify({ kind: SETTINGS_KIND, settings: { firstField: 'initials', detectAgeSex: false } })).settings, { firstField: 'initials', detectAgeSex: false });
// the newer Logging / Display choices travel; the hidden Add tab parts stay a list of strings
const qol = readSettingsFile(JSON.stringify({ kind: SETTINGS_KIND, settings: { weekStart: 0, afterSave: 'logbook', undoSecs: 20, caseHide: ['quick', 7, 'still'], pinBox: true, pinSearch: true, boxCorrect: true, reflSpell: false } })).settings;
assert.deepEqual(qol, { weekStart: 0, afterSave: 'logbook', undoSecs: 20, caseHide: ['quick', 'still'], pinBox: true, pinSearch: true, boxCorrect: true, reflSpell: false });
assert.deepEqual(readSettingsFile(JSON.stringify({ kind: SETTINGS_KIND, settings: { caseHide: 'quick' } })).settings.caseHide, []);

console.log('settings file tests passed');

assert.equal(readSettingsFile(JSON.stringify(settingsFile({settings:{compactTags:true,firstField:'date'}}))).settings.compactTags,true);

// labelled parts and the case template travel with the file, cleaned
{
  const r = readSettingsFile(JSON.stringify(settingsFile({ settings: { labelParts: true, caseTplOn: true, caseTpl: 'ASA :\r\nPE :' + 'x'.repeat(900), partLabels: [{ k: 'PE' }, { k: '1bad' }, { k: 'pe' }] } })));
  assert.equal(r.settings.labelParts, true);
  assert.equal(r.settings.caseTplOn, true);
  assert.equal(r.settings.caseTpl.length, 500);
  assert.ok(r.settings.caseTpl.startsWith('ASA :\nPE :'));
  assert.deepEqual(r.settings.partLabels, [{ k: 'PE', n: 'PE' }]);
  assert.equal(readSettingsFile(JSON.stringify(settingsFile({ settings: { partLabels: null } }))).settings.partLabels, null);
}

// this browser's own choices as a file (the move to apmes.anawj.com)
{
  const entries = [['apmes-logbook-display', '{"flat":true}'], ['apmes-logbook-theme', 'dark'], ['logbook-draft-x', '{"details":"fake"}'], ['logbook-edit-draft:y', 'z'],
    ['apmes-logbook-demo-small', '1'], ['apmes-logbook-moved', '1'], ['apmes-logbook-cloud-pending', '{}'], ['ot-roster-v1', '{}'], ['other', 'x'], ['apmes-logbook-big', 'x'.repeat(100 * 1024 + 1)]];
  const f = deviceFile(entries);
  assert.equal(f.kind, DEVICE_KIND);
  assert.deepEqual(Object.keys(f.items).sort(), ['apmes-logbook-display', 'apmes-logbook-theme', 'logbook-draft-x', 'logbook-edit-draft:y']);
  const back = readDeviceFile(JSON.stringify(f));
  assert.deepEqual(back.items, f.items);
  assert.ok(isDeviceFile(JSON.stringify(f)) && !isDeviceFile('nope') && !isDeviceFile('{"kind":"apmes-logbook-settings"}'));
  assert.ok(isDeviceKey('apmes-logbook-theme') && !isDeviceKey('apmes-logbook-demo-small') && !isDeviceKey('ot-roster-v1'));
  // a file can only write this app's own keys, never anything else
  const evil = readDeviceFile(JSON.stringify({ kind: DEVICE_KIND, items: { 'apmes-logbook-theme': 'dark', 'ot-roster-v1': 'x', 'apmes-logbook-cloud-pending': 'x', __proto__: 'x', n: 5 } }));
  assert.deepEqual(Object.keys(evil.items), ['apmes-logbook-theme']);
  assert.throws(() => readDeviceFile('not json'), /not JSON/);
  assert.throws(() => readDeviceFile(JSON.stringify({ kind: 'apmes-logbook-settings', items: {} })), /isn’t a device file/);
  assert.throws(() => readDeviceFile(JSON.stringify({ kind: DEVICE_KIND, items: [] })), /isn’t a device file/);
}

// every device display key survives a settings file (custom CSS stays out on purpose: never in a file to share)
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/display.js', import.meta.url), 'utf8');
  const keys = JSON.parse(src.match(/export const DISPLAY_KEYS = (\[[^\]]*\])/)[1].replace(/'/g, '"')).filter(k => !/^customCss/.test(k));
  const sample = v => (['tabOrder', 'tabHidden'].includes(v) ? ['log'] : v === 'themeKeep' ? ['wallpaper'] : v === 'accent' ? '#123456' : true);
  const got = readSettingsFile(JSON.stringify({ kind: SETTINGS_KIND, settings: Object.fromEntries(keys.map(k => [k, sample(k)])) })).settings;
  assert.deepEqual(keys.filter(k => !(k in got)), [], 'display keys dropped on import');
}
// the profile switches: known keys and booleans only
{
  const got = readSettingsFile(JSON.stringify({ kind: SETTINGS_KIND, settings: { mode: 'personal', show: { targets: false, grid: true, 'case:quick': false, nope: true, portfolio: 'yes' } } })).settings;
  assert.equal(got.mode, 'personal');
  assert.deepEqual(got.show, { targets: false, grid: true, 'case:quick': false });
}
console.log('settings-file display keys and profile switches tests passed');
// the phone batch's options travel in the file too (Request an evaluation is a profile switch, in `show`)
{
  const f2 = settingsFile({ settings: { hideTabsTyping: true, show: { evalRequest: true } } });
  const got = readSettingsFile(JSON.stringify(f2)).settings;
  assert.equal(got.hideTabsTyping, true);
  assert.equal(got.show.evalRequest, true);
}

// Reset all settings: preferences go back to their defaults; your year, profile, places, searches and (unless asked) tags stay
{
  const { resetAccountPatch } = await import('../js/settings-file.js');
  const st = { rYear: 2, mode: 'basic', show: { analytics: true }, savedSearches: [{ name: 'x' }], destinations: [{ id: 'a' }], sync: { on: true },
    tagSet: [{ k: 'u:x' }], subcats: {}, autoTick: true, enterMode: 'single', markdown: { day: 'x' }, detectInitials: false, borders: 2, gone: null };
  assert.deepEqual(resetAccountPatch(st), { autoTick: null, enterMode: null, markdown: null, detectInitials: null, borders: null });
  assert.deepEqual(resetAccountPatch(st, { tags: true }), { tagSet: null, subcats: null, autoTick: null, enterMode: null, markdown: null, detectInitials: null, borders: null });
  assert.deepEqual(resetAccountPatch(null), {});
}

// Pasted list format travels in a settings file, cleaned
{
  
  const ok = readSettingsFile(JSON.stringify({ kind: 'apmes-logbook-settings', settings: { listFormat: { start: '{n}. ===', skip: 3, dropEnd: '===', evil: 1 } } }));
  assert.deepEqual(ok.settings.listFormat, { start: '{n}. ===', skip: 3, dropEnd: '===' });
  assert.equal(readSettingsFile(JSON.stringify({ kind: 'apmes-logbook-settings', settings: { listFormat: 'x' } })).settings.listFormat, null);
  console.log('list format settings passed');
}

assert.deepEqual(readSettingsFile(JSON.stringify({ kind: SETTINGS_KIND, settings: { colours: { light: { bg: '#FFFFFF', ink: 'red', unknown: '#123456' } } } })).settings.colours, { light: { bg: '#ffffff' } });
