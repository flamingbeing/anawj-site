// Run with: node logbook/mcp/test/tools.test.mjs  (stub data, no network)
import assert from 'node:assert/strict';
import { z } from 'zod';
import { defineTools, callTool, READ_ONLY } from '../lib/tools.mjs';

const data = {
  email: 'res@example.com',
  logbook: { settings: { rYear: 3 } },
  resident: null,
  cases: [
    { id: 'c1', date: '2026-01-05', initials: 'AB', details: '34F LSCS spinal', cats: ['16', '28'] },
    { id: 'c2', date: '2026-02-10', initials: 'CD', details: '5M circumcision caudal', cats: ['20iii', '27'] },
  ],
  reflections: [{ id: 'r1', headingId: 'lscs', status: 'complete', title: 'Made-up title', date: '2026-01-05', initials: 'AB' }],
};
const tools = Object.fromEntries(defineTools(async () => data).map(t => [t.name, t]));
assert.deepEqual(Object.keys(tools).sort(), ['get_reflection', 'list_cases', 'list_plan', 'list_reflections', 'missing_targets', 'progress', 'search_cases', 'suggest_tags']);
assert.ok(Object.keys(tools).every(n => !/add|set|write|delete|update|create/.test(n)), 'no write tools');
assert.equal(READ_ONLY.readOnlyHint, true);

const text = async (name, args) => {
  const shape = z.object(tools[name].shape);
  const res = await callTool(tools[name], shape.parse(args || {}));
  assert.equal(res.content[0].type, 'text');
  return res;
};

let res = await text('list_cases', { category: 'LSCS' });
assert.match(res.content[0].text, /^1 cases tagged "Lower Segment Caesarean Section"/);
res = await text('search_cases', { text: 'caudal' });
assert.match(res.content[0].text, /CD: 5M circumcision caudal/);
res = await text('progress', {});
assert.match(res.content[0].text, /Progress for R3 \(year 3\), year from your Settings/);
res = await text('progress', { year: 5 });
assert.match(res.content[0].text, /SR2 \(year 5\)/);
res = await text('missing_targets', {});
assert.match(res.content[0].text, /Caesarean sections: 1 of 5/);
res = await text('list_reflections', { status: 'complete' });
assert.match(res.content[0].text, /\[r1\] Caesarean sections: Made-up title/);
res = await text('get_reflection', { id: 'r1' });
assert.match(res.content[0].text, /^# Made-up title/);
res = await text('get_reflection', { id: 'nope' });
assert.equal(res.isError, true);

// the schemas cap sizes and check dates
assert.throws(() => z.object(tools.list_cases.shape).parse({ limit: 501 }));
assert.throws(() => z.object(tools.list_cases.shape).parse({ from: '2026-1-5' }));
assert.throws(() => z.object(tools.progress.shape).parse({ year: 6 }));

// not signed in: every tool returns the error as text, nothing throws
const out = defineTools(async () => { throw new Error('Not signed in to the APMES Logbook. In a terminal, run: node server.mjs login'); });
for (const t of out) {
  const r = await callTool(t, { text: 'x', id: 'x' });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /login/);
}

console.log('tools.test.mjs: ok');
