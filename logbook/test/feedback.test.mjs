// Private feedback: the record a resident sends, the Send checks and the owner's scrubbed "Copy as task" text.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const { screenOf, feedbackRecord, sendProblem, scrub, taskText, PRIVATE, byNewestFeedback, TEXT_MAX, DOING_MAX } = await import('../js/feedback.js');

// screen: the page's name only
{
  assert.equal(screenOf('#logbook'), 'logbook');
  assert.equal(screenOf('#caselog/abc?x=1'), 'caselog');
  assert.equal(screenOf('reflect?id=AB'), 'reflect');
  assert.equal(screenOf(''), 'unknown');
  assert.equal(screenOf('#' + 'x'.repeat(80)).length, 40);
}

// the record: only the fields the rules allow, trimmed and capped; no createdAt (the server sets it)
{
  const r = feedbackRecord({ uid: 'u1', text: '  The Save button is slow  ', doing: '', screen: '#log', version: 'logbook-v41-abcd1234', ua: 'Mozilla/5.0   (iPhone)' });
  assert.deepEqual(r, { uid: 'u1', text: 'The Save button is slow', screen: 'log', version: 'logbook-v41-abcd1234', ua: 'Mozilla/5.0 (iPhone)', status: 'new' });
  const long = feedbackRecord({ uid: 'u1', text: 'a'.repeat(3000), doing: 'b'.repeat(400), screen: 'log', version: '', ua: 'c'.repeat(500) });
  assert.equal(long.text.length, TEXT_MAX); assert.equal(long.doing.length, DOING_MAX);
  assert.equal(long.ua.length, 200); assert.equal(long.version, 'unknown');
  assert.deepEqual(Object.keys(long).sort(), ['doing', 'screen', 'status', 'text', 'ua', 'uid', 'version']);
}

// what stops Send
{
  assert.match(sendProblem({ text: '  ', tick: true }), /Write/);
  assert.match(sendProblem({ text: 'x'.repeat(TEXT_MAX + 1), tick: true }), /2000/);
  assert.match(sendProblem({ text: 'ok', doing: 'y'.repeat(DOING_MAX + 1), tick: true }), /300/);
  assert.match(sendProblem({ text: 'ok', tick: false }), /patient details/);
  assert.equal(sendProblem({ text: 'ok', doing: 'logging', tick: true }), '');
}

// scrub: names and numbers out (fake examples)
{
  assert.equal(scrub('NRIC S1234567D seen'), 'NRIC [ID] seen');
  assert.equal(scrub('MRN 12345678 and 7654321'), 'MRN [number] and [number]');
  assert.equal(scrub('born 01/02/1990'), 'born [date]');
  assert.equal(scrub('call 9123 4567 or 61234567'), 'call [phone] or [number]');
  assert.equal(scrub('mail fake.person@example.com'), 'mail [email]');
  assert.equal(scrub('Mr Fakename and pt Testcase were fine'), '[name] and [name] were fine');
  assert.equal(scrub('The tag picker on #log hides R2 targets'), 'The tag picker on #log hides R2 targets');
}

// the task text: header from the record, text scrubbed, no uid or browser string
{
  const f = { id: 'a', uid: 'secret-uid', ua: 'Mozilla', text: 'Mdm Fakeperson case 1234567 would not save', doing: 'Logging for Mr Testname', screen: 'log', version: 'logbook-v41-abcd1234', createdAt: Date.UTC(2026, 9, 14, 3) };
  const t = taskText(f);
  assert.equal(t, 'Logbook feedback (2026-10-14, screen #log, version logbook-v41-abcd1234)\nDoing: Logging for [name]\nFeedback: [name] case [number] would not save');
  assert.ok(!t.includes('secret-uid') && !t.includes('Mozilla'));
  assert.ok(!taskText({ text: 'x', screen: 'more' }).includes('Doing'));
}

// newest first, unsent (no server time yet) on top
{
  const list = [{ id: 'a', createdAt: 1 }, { id: 'b', createdAt: 3 }, { id: 'c' }, { id: 'd', createdAt: 2 }];
  assert.deepEqual(list.sort(byNewestFeedback).map(x => x.id), ['c', 'b', 'd', 'a']);
}

// the patterns stay in step with the public 💬 button's warning list (feedback/overlay.js PRIVATE)
{
  const overlay = fs.readFileSync(fileURLToPath(new URL('../../feedback/overlay.js', import.meta.url)), 'utf8');
  const block = overlay.match(/const PRIVATE = \[([\s\S]*?)\n\s*\];/)[1];
  const theirs = [...block.matchAll(/^\s*\[\/(.+)\/(\w*),/gm)].map(m => m[1] + '/' + m[2]);
  assert.deepEqual(PRIVATE.map(([re]) => re.source + '/' + re.flags), theirs);
}

console.log('feedback tests passed');
