// Send to… destinations (js/destinations.js).
import assert from 'node:assert/strict';
import { PRESETS, cleanDestination, cleanDestinations, sendLink, linkHost, linkOk, fingerprint, markSent, sentState, cleanLedger, MAX_DESTINATIONS, MAX_LINK } from '../js/destinations.js';

// every preset is a usable template except the empty "other app" one
for (const p of PRESETS) assert.equal(linkOk(p.uri), p.id !== 'custom', p.id);

// hosts: what the confirmation shows
assert.equal(linkHost('https://wa.me/?text={content}'), 'wa.me');
assert.equal(linkHost('obsidian://new?vault=V&content={content}'), 'obsidian');
assert.equal(linkHost('HTTPS://Example.COM/x'), 'example.com');
assert.equal(linkHost('nonsense'), '');

// script-like and contentless links are refused
for (const bad of ['javascript:alert({content})', 'data:text/html,{content}', 'file:///x/{content}', 'intent://x#Intent;{content}', 'https://x.test/', '{content}', '']) assert.equal(linkOk(bad), false, bad);
assert.equal(cleanDestination({ name: 'x', uri: 'javascript:{content}' }), null);
assert.equal(cleanDestination({ name: '', uri: 'https://a.test/?q={content}' }), null);
assert.equal(cleanDestination('x'), null);

const d = cleanDestination({ id: 'a b!', name: ' Notes ', uri: 'myapp://add?t={content}\n', fileName: '', mode: 'weird', extra: 1 });
assert.deepEqual(d, { id: 'ab', name: 'Notes', uri: 'myapp://add?t={content}', fileName: '{date}', mode: 'replace' });
assert.equal(cleanDestination({ name: 'n', uri: 'myapp://a?{content}', mode: 'append' }).mode, 'append');

// the list: duplicates and junk dropped, capped
const many = Array.from({ length: 30 }, (_, i) => ({ id: 'd' + i, name: 'n' + i, uri: 'a://x?{content}' }));
assert.equal(cleanDestinations(many).length, MAX_DESTINATIONS);
assert.equal(cleanDestinations([many[0], many[0], null, 5]).length, 1);
assert.deepEqual(cleanDestinations(null), []);

// the link: values URL-encoded, the file name from its template
const ob = { ...PRESETS[0], uri: 'obsidian://new?vault=V&file={file}&content={content}' };
const r = sendLink(ob, { content: '# 2026-10-13\n1. AB & CD', title: 'T', date: '2026-10-13' });
assert.equal(r.tooLong, false);
assert.equal(r.file, 'Logbook/2026-10-13');
assert.equal(r.url, 'obsidian://new?vault=V&file=Logbook%2F2026-10-13&content=%23%202026-10-13%0A1.%20AB%20%26%20CD');
// text that looks like a template is not read again
assert.ok(sendLink(ob, { content: '{file} {{date}}', date: '2026-10-13' }).url.includes(encodeURIComponent('{file} {{date}}')));
// too long: the link opens without the text
const long = sendLink(ob, { content: 'x'.repeat(MAX_LINK), date: '2026-10-13' });
assert.equal(long.tooLong, true);
assert.ok(long.url.length < 200 && long.url.endsWith('content='));

// the ledger
let l = markSent({}, 'obsidian', '2026-10-13', 'one');
assert.equal(sentState(l, 'obsidian', '2026-10-13', 'one'), 'same');
assert.equal(sentState(l, 'obsidian', '2026-10-13', 'one edited'), 'changed');
assert.equal(sentState(l, 'obsidian', '2026-10-14', 'one'), 'new');
assert.equal(sentState(l, 'whatsapp', '2026-10-13', 'one'), 'new');
assert.notEqual(fingerprint('a'), fingerprint('b'));
assert.equal(fingerprint('same'), fingerprint('same'));
l = markSent(l, 'obsidian', '2026-10-13', 'two');
assert.equal(sentState(l, 'obsidian', '2026-10-13', 'two'), 'same');
// the ledger holds fingerprints, never the text
assert.equal(JSON.stringify(l).includes('two'), false);
assert.deepEqual(cleanLedger({ a: { 'not-a-date': 'x', '2026-01-01': 'ok' }, b: 5 }), { a: { '2026-01-01': 'ok' } });
assert.deepEqual(cleanLedger('x'), {});
console.log('destinations tests passed');
