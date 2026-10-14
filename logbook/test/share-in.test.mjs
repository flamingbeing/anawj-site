// Shared to the app (share-in.js): what was shared as one text, which files can be read, the old GET address.
// Fake text only.
import assert from 'node:assert/strict';
import { sharedText, isTextFile, fromQuery, keepShared, peekShared, popShared, sharedFiles, shareState } from '../js/share-in.js';

assert.ok(isTextFile('plan.md', '') && isTextFile('a.TXT', '') && isTextFile('x', 'text/plain') && isTextFile('x', 'text/markdown'));
assert.ok(!isTextFile('photo.jpg', 'image/jpeg') && !isTextFile('doc.pdf', 'application/pdf'));

// title only when the text doesn't start with it; the link only when not in the text
assert.equal(sharedText({ title: 'Fake list', text: 'AB 40M lap chole', url: 'https://example.com' }), 'Fake list\n\nAB 40M lap chole\n\nhttps://example.com');
assert.equal(sharedText({ title: 'AB 40M', text: 'AB 40M lap chole', url: '' }), 'AB 40M lap chole');
assert.equal(sharedText({ text: 'see https://example.com', url: 'https://example.com' }), 'see https://example.com');
// files: their text (named when more than one); files the app can't read are left out
assert.equal(sharedText({ files: [{ name: 'a.md', type: 'text/markdown', text: '# Fake\r\nline' }] }), '# Fake\nline');
assert.equal(sharedText({ text: 'x', files: [{ name: 'a.md', text: 'one' }, { name: 'b.txt', text: 'two' }, { name: 'c.png', type: 'image/png', text: 'bin' }] }), 'x\n\na.md\none\n\nb.txt\ntwo');
assert.equal(sharedText({}), '');

// the old GET share: its text, and the address left with only the other parameters
assert.deepEqual(fromQuery('?demo&share_title=T&share_text=AB%2040M&share_url='), { has: true, text: 'T\nAB 40M', rest: 'demo' });
assert.deepEqual(fromQuery('?shared=1'), { has: false, text: '', rest: '' });
assert.deepEqual(fromQuery('?demo'), { has: false, text: '', rest: 'demo' });

// waiting in sessionStorage (faked here): a new share asks again; popping clears the file count too
const store = new Map();
globalThis.sessionStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
shareState.seen = true;
keepShared('Fake text', 2);
assert.equal(peekShared(), 'Fake text');
assert.equal(sharedFiles(), 2);
assert.equal(shareState.seen, false);
assert.equal(popShared(), 'Fake text');
assert.equal(peekShared(), '');
assert.equal(sharedFiles(), 0);
keepShared('   ');
assert.equal(peekShared(), '');

console.log('share-in tests passed');
