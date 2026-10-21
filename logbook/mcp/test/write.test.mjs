// Run with: node logbook/mcp/test/write.test.mjs  (stub data and writer, no network)
import assert from 'node:assert/strict';
import { z } from 'zod';
import { defineTools, callTool, READ_ONLY, ADDS, REPLACES } from '../lib/tools.mjs';
import { resolveTags, buildNewCase, buildCaseUpdate, buildReflection, checkNoIds, today } from '../lib/write.mjs';

// ---- helpers ----
assert.deepEqual(resolveTags(['16', 'upper limb blocks']), ['16', '26i']);
assert.deepEqual(resolveTags(['16', '16']), ['16']);
assert.throws(() => resolveTags(['26']), /sub-tags; pick one: 26i/);
assert.throws(() => resolveTags(['15ii']), /No current APMES tag/, 'retired tags are refused');
assert.throws(() => resolveTags(['zzz nothing']), /No current APMES tag/);
assert.throws(() => checkNoIds([['details', 'MRN 12345678']]), /identifier/);
checkNoIds([['details', '34F LSCS spinal 2.2ml']]);
assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);

// what is built has only the fields firestore.rules validCase / validReflection allow
const CASE_KEYS = ['id', 'date', 'dateText', 'initials', 'details', 'cats', 'createdAt', 'updatedAt', 'source', 'importKey', 'reflectionId', 'reflectTag', 'tags'];
const REFL_KEYS = ['id', 'headingId', 'subId', 'initials', 'date', 'jr', 'diagnosis', 'title', 'summary', 'points', 'figures', 'references', 'sections', 'caseId', 'source', 'status', 'export', 'createdAt', 'updatedAt'];
const c = buildNewCase({ date: '2026-10-20', initials: 'GH', details: ' 30F LSCS spinal ', tags: ['caesarean'], interesting: true }, 1000);
assert.ok(Object.keys(c).every(k => CASE_KEYS.includes(k)), Object.keys(c).join());
assert.deepEqual({ ...c, id: 'x' }, { id: 'x', date: '2026-10-20', initials: 'GH', details: '30F LSCS spinal', cats: ['16'], reflectTag: true, createdAt: 1000, updatedAt: 1000, source: 'app' });
assert.throws(() => buildNewCase({ details: '  ' }), /needs details/);
assert.equal(buildNewCase({ details: 'x' }).date, today());

const u = buildCaseUpdate({ id: 'old', dateText: 'last week', details: 'AB old text', cats: ['16'], createdAt: 5, updatedAt: 9, source: 'form', importKey: 'k' }, { date: '2026-01-02', tags: [] }, 10);
assert.deepEqual(u, { id: 'old', date: '2026-01-02', details: 'AB old text', cats: [], createdAt: 5, updatedAt: 10, source: 'form', importKey: 'k' });

const r = buildReflection(null, { heading: 'cabg', subheading: 'off pump', title: 'Made-up', learning_points: [{ text: 'free text' }] }, 50);
assert.ok(Object.keys(r).every(k => REFL_KEYS.includes(k)), Object.keys(r).join());
assert.equal(r.status, 'draft');
assert.equal(r.headingId, 'cabg');
assert.equal(r.subId, 'off');
assert.equal(r.date, today());
assert.throws(() => buildReflection(null, { title: 'x' }), /needs a heading/);
assert.throws(() => buildReflection({ id: 'r', headingId: 'cabg', status: 'complete' }, { title: 'x' }), /marked complete/);
assert.throws(() => buildReflection(null, { heading: 'cabg', subheading: 'sideways' }), /not a sub-type/);
assert.equal(buildReflection({ id: 'r', headingId: 'cabg', subId: 'on', status: 'draft', title: 'a', createdAt: 1 }, { title: 'b' }, 60).subId, 'on', 'other fields kept');

// ---- tools ----
const data = {
  email: 'res@example.com',
  logbook: { rid: '2024001', settings: { rYear: 3 } },
  resident: null,
  cases: [{ id: 'c1', date: '2026-01-05', initials: 'AB', details: '34F LSCS spinal', cats: ['16'], createdAt: 1, updatedAt: 1, source: 'app' }],
  reflections: [
    { id: 'r1', headingId: 'lscs', status: 'complete', title: 'Done one' },
    { id: 'r2', headingId: 'lscs', status: 'draft', title: 'Draft one', createdAt: 1, updatedAt: 1 },
  ],
};
const log = [];
let fresh = 0, invalidated = 0;
const writer = {
  saveCase: async x => { log.push(['case', x]); },
  saveReflection: async x => { log.push(['reflection', x]); },
  queueSheetRow: async x => { log.push(['sheet', x]); },
  invalidate: () => { invalidated++; },
};
const tools = Object.fromEntries(defineTools(async f => { if (f) fresh++; return data; }, writer).map(t => [t.name, t]));
assert.deepEqual(Object.keys(tools).sort(), ['add_case', 'add_cases', 'get_reflection', 'list_cases', 'list_plan', 'list_reflections', 'log_planned', 'missing_targets', 'plan_cases', 'progress', 'save_reflection', 'search_cases', 'suggest_tags', 'update_case']);
assert.equal(tools.add_case.annotations, ADDS);
assert.equal(tools.update_case.annotations, REPLACES);
assert.equal(tools.list_cases.annotations, undefined, 'read tools register as READ_ONLY');
assert.equal(READ_ONLY.readOnlyHint, true);
assert.ok(!Object.keys(tools).some(n => /delete|remove/.test(n)), 'no delete tools');

const call = (name, args) => callTool(tools[name], z.object(tools[name].shape).parse(args));

// preview writes nothing
let res = await call('add_case', { date: '2026-10-20', initials: 'GH', details: '30F LSCS GA', tags: ['16'] });
assert.match(res.content[0].text, /^New case:\nDate: 2026-10-20\nInitials: GH\nDetails: 30F LSCS GA\nTags: 16 /);
assert.match(res.content[0].text, /Preview only: nothing is saved yet/);
assert.equal(log.length, 0);
assert.equal(fresh, 0, 'a preview uses the cache');

// confirm saves the case and its sheet entry
res = await call('add_case', { date: '2026-10-20', initials: 'GH', details: '30F LSCS GA', tags: ['16'], confirm: true });
assert.match(res.content[0].text, /^Saved case \S+:/);
assert.match(res.content[0].text, /Queued for the response sheet/);
assert.deepEqual(log.map(x => x[0]), ['case', 'sheet']);
assert.equal(fresh, 1, 'the save reads fresh data');
const saved = log[0][1];
assert.deepEqual(log[1][1], { id: saved.id, email: 'res@example.com', rid: '2024001', date: '2026-10-20', initials: 'GH', details: '30F LSCS GA', cats: ['16'], createdAt: saved.createdAt });
assert.equal(invalidated, 1);

// no rid on the logbook: the case is saved, no sheet entry; a failed sheet entry is reported, not thrown
log.length = 0;
data.logbook = { settings: {} };
res = await call('add_case', { details: '5M circ caudal', confirm: true });
assert.deepEqual(log.map(x => x[0]), ['case']);
data.logbook = { rid: '2024001' };
writer.queueSheetRow = async () => { throw new Error('refused'); };
res = await call('add_case', { details: '6M circ caudal', confirm: true });
assert.equal(res.isError, undefined);
assert.match(res.content[0].text, /not queued for the response sheet \(refused\)/);

// a repeat of a stored case is refused on confirm, flagged in the preview
log.length = 0;
res = await call('add_case', { date: '2026-01-05', initials: 'ab', details: '34F LSCS spinal' });
assert.match(res.content[0].text, /already there \(id c1\)/);
res = await call('add_case', { date: '2026-01-05', initials: 'AB', details: '34F LSCS spinal', confirm: true });
assert.equal(res.isError, true);
assert.equal(log.length, 0);

// identifiers are refused
res = await call('add_case', { details: 'MRN 87654321 LSCS', confirm: true });
assert.equal(res.isError, true);
assert.match(res.content[0].text, /identifier/);
assert.equal(log.length, 0);

// update: preview shows the change, confirm saves the whole case
res = await call('update_case', { id: 'c1', tags: ['16', 'spinal'] });
assert.equal(res.isError, undefined, res.content[0].text);
assert.match(res.content[0].text, /Tags: 16 [^\n]+  →  16 [^;]+; 28 /);
assert.equal(log.length, 0);
res = await call('update_case', { id: 'c1', tags: ['16', '28'], confirm: true });
assert.deepEqual(log[0][1].cats, ['16', '28']);
assert.equal(log[0][1].details, '34F LSCS spinal');
res = await call('update_case', { id: 'c1', details: '34F LSCS spinal', confirm: true });
assert.match(res.content[0].text, /no changes, nothing saved/);
res = await call('update_case', { id: 'nope', details: 'x' });
assert.equal(res.isError, true);

// reflections: new draft, edit a draft, never a complete one
log.length = 0;
res = await call('save_reflection', { heading: 'lscs', title: 'Made-up title', summary: 'Made-up summary', case_id: 'c1' });
assert.match(res.content[0].text, /^New draft reflection:\n\n# Made-up title\nHeading: [^\n]+\nStatus: draft/);
assert.equal(log.length, 0);
res = await call('save_reflection', { heading: 'lscs', title: 'Made-up title', confirm: true });
assert.match(res.content[0].text, /^Saved draft reflection \S+ \(give this id/);
assert.equal(log[0][1].status, 'draft');
res = await call('save_reflection', { id: 'r2', title: 'Better title', confirm: true });
assert.equal(log[1][1].id, 'r2');
assert.equal(log[1][1].title, 'Better title');
assert.equal(log[1][1].headingId, 'lscs');
res = await call('save_reflection', { id: 'r1', title: 'x', confirm: true });
assert.match(res.content[0].text, /marked complete/);
res = await call('save_reflection', { heading: 'lscs', case_id: 'nope' });
assert.match(res.content[0].text, /No case with id/);
assert.equal(log.length, 2);

console.log('write.test.mjs: ok');
