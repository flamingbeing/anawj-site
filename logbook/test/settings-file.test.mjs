// Settings export / import (js/settings-file.js).
import assert from 'node:assert/strict';
import { settingsFile, readSettingsFile, SETTINGS_KIND } from '../js/settings-file.js';

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
const ss = readSettingsFile(JSON.stringify({ kind: SETTINGS_KIND, settings: { savedSearches: [null, 3, { name: 'Blocks', has: ['c:26', 5], q: 'block' }] } })).settings.savedSearches;
assert.equal(ss.length, 1); assert.deepEqual(ss[0].has, ['c:26']); assert.equal(ss[0].q, 'block');
assert.equal('rYear' in settingsFile({ settings: { rYear: 4, compact: true } }).settings, false);

console.log('settings file tests passed');
