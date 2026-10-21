// Run with: node logbook/mcp/test/bulk.test.mjs  (stub data and writer, no network; made-up cases)
import assert from 'node:assert/strict';
import { z } from 'zod';
import { defineTools, callTool, ADDS } from '../lib/tools.mjs';
import { parseList, rowsFromCases, checkRows, buildCases, suggester, untaggedReport, formatPlan, buildPlanItems } from '../lib/bulk.mjs';
import { today } from '../lib/write.mjs';

const NOW = new Date('2026-10-21T08:00:00');
const LIST = 'AB 45F lap chole GA\n\nCD 3/12 M inguinal hernia\n\n20/10 EF 70M TKR spinal adductor canal';

// ---- the app's paste reader and suggestions ----
let rows = parseList(LIST, {}, { now: NOW });
assert.equal(rows.length, 3);
assert.deepEqual(rows.map(r => r.initials), ['AB', 'CD', 'EF']);
assert.deepEqual(rows.map(r => r.date), ['2026-10-21', '2026-10-21', '2026-10-20'], 'a leading date sets the case date, else today');
assert.ok(rows[0].cats.includes('08'), 'confident tags ticked (lap chole: laparoscopic)');
assert.ok(rows[2].cats.includes('21'), 'the age rule: 70M is geriatric');
assert.equal(parseList(LIST, {}, { date: '2026-10-01', now: NOW })[0].date, '2026-10-01');

// the user's Pasted list format is used (a start text instead of empty lines)
rows = parseList('OR6 - 20 Oct 2026\n1. === GH (40F) LSCS spinal\n2. === JK (50M) lap appendicectomy', { settings: { listFormat: { start: '{n}. === {initials} (' } } }, { now: NOW });
assert.deepEqual(rows.map(r => [r.initials, r.date]), [['GH', '2026-10-20'], ['JK', '2026-10-20']]);

// the user's shorthand (Tag editor) counts, as in the app
const sug = suggester({});
assert.ok(sug('LSCS under spinal').some(s => s.code === '16'));
assert.equal(suggester({ settings: { detectAgeSex: false } })('70M hernia repair').some(s => s.why === 'age'), false);

// rows given one by one
rows = rowsFromCases([{ initials: 'ab', details: ' hernia repair ', tags: ['caesarean'] }], { date: '2026-10-02' });
assert.deepEqual(rows[0], { date: '2026-10-02', initials: 'AB', details: 'hernia repair', cats: ['16'], maybe: [] });
assert.throws(() => rowsFromCases([{ details: 'x', tags: ['no such tag at all'] }]), /No current APMES tag/);

// checks before anything is saved
assert.throws(() => checkRows([]), /No cases found/);
assert.throws(() => checkRows([{ details: '' }]), /no details/);
assert.throws(() => checkRows([{ details: 'MRN 12345678 lap chole' }]), /identifier/);
assert.throws(() => checkRows(Array.from({ length: 51 }, () => ({ details: 'x' }))), /at most 50/);
assert.throws(() => checkRows([{ details: 'x'.repeat(2001) }]), /2000-character/);

// duplicates: of a stored case, and within the list
const { cases, dups } = buildCases([
  { date: '2026-10-21', initials: 'AB', details: 'old one', cats: [] },
  { date: '2026-10-21', initials: 'CD', details: 'new', cats: ['16'] },
  { date: '2026-10-21', initials: 'CD', details: 'new', cats: ['16'] },
], [{ id: 'x', date: '2026-10-21', initials: 'ab', details: 'old one' }], 1000);
assert.deepEqual(dups, [1, 3]);
assert.equal(cases.length, 1);
assert.equal(cases[0].source, 'paste', 'saved like the app\'s pasted cases (firestore.rules allow paste)');
assert.deepEqual(Object.keys(cases[0]).sort(), ['cats', 'createdAt', 'date', 'details', 'id', 'initials', 'source', 'updatedAt']);

// untagged cases with suggestions
const report = untaggedReport([
  { id: 'u1', date: '2026-10-01', initials: 'AB', details: 'LSCS spinal', cats: [] },
  { id: 't1', date: '2026-10-02', initials: 'CD', details: 'lap chole', cats: ['08'] },
], {});
assert.match(report, /^1 case has no APMES tag/);
assert.match(report, /id u1 · suggested: .*16 Lower Segment Caesarean Section/);
assert.equal(untaggedReport([], {}), 'Every case has at least one APMES tag.');

// plan list
const items = buildPlanItems([{ initials: 'AB', details: 'lap chole', cats: ['13', '08'] }], '2026-10-22', 5000);
assert.deepEqual(Object.keys(items[0]).sort(), ['cats', 'date', 'details', 'id', 'initials']);
assert.deepEqual(items[0].cats, ['08', '13']);
const planText = formatPlan([{ id: 'p1', date: '2026-10-20', details: 'due one', cats: [] }, ...items], NOW);
assert.match(planText, /Due now \(1;/);
assert.match(planText, /Later \(1\):\n- 2026-10-22 · AB: lap chole/);

// ---- the tools ----
const data = {
  email: 'res@example.com',
  logbook: { email: 'res@example.com', rid: '2024-01', settings: {}, plan: [{ id: 'p0', date: '2030-01-01', initials: 'ZZ', details: 'planned', cats: [] }] },
  resident: null,
  cases: [{ id: 'c1', date: today(), initials: 'AB', details: '45F lap chole GA', cats: ['08'] },
    { id: 'c2', date: '2026-01-01', initials: 'XY', details: 'LSCS spinal', cats: [] }],
  reflections: [],
};
const log = [];
const writer = {
  saveCase: async c => { log.push(['case', c]); },
  saveReflection: async r => { log.push(['refl', r]); },
  savePlan: async p => { log.push(['plan', p]); },
  queueSheetRow: async e => { log.push(['sheet', e]); },
  invalidate: () => {},
};
const tools = Object.fromEntries(defineTools(async () => data, writer).map(t => [t.name, t]));
assert.equal(tools.add_cases.annotations, ADDS);
assert.equal(tools.plan_cases.annotations, ADDS);
assert.equal(tools.suggest_tags.annotations, undefined, 'read-only');
assert.equal(tools.list_plan.annotations, undefined, 'read-only');
const call = (name, args) => callTool(tools[name], z.object(tools[name].shape).parse(args));
const txt = r => r.content[0].text;

// add_cases: preview saves nothing, confirm saves the new ones and queues each for the sheet
let r = await call('add_cases', { text: LIST });
assert.match(txt(r), /^3 cases read \(1 already there, skipped\)/);
assert.match(txt(r), /Preview only/);
assert.equal(log.length, 0);
r = await call('add_cases', { text: LIST, confirm: true });
assert.match(txt(r), /^Saved 2 cases \(1 already there, skipped\)/);
assert.equal(log.filter(([k]) => k === 'case').length, 2);
assert.ok(log.filter(([k]) => k === 'case').every(([, c]) => c.source === 'paste'));
assert.equal(log.filter(([k]) => k === 'sheet').length, 2 * Number(log.some(([k]) => k === 'sheet')), 'each saved case queued (when the outbox is on)');
assert.equal((await call('add_cases', {})).isError, true, 'text or cases needed');
assert.equal((await call('add_cases', { text: 'a', cases: [{ details: 'b' }] })).isError, true, 'not both');
r = await call('add_cases', { cases: [{ initials: 'GH', details: 'NRIC S1234567D', tags: ['16'] }], confirm: true });
assert.equal(r.isError, true);
assert.match(txt(r), /identifier/);

// a save that fails stops there and says how to finish
log.length = 0;
let n = 0;
writer.saveCase = async c => { if (n++) throw new Error('offline'); log.push(['case', c]); };
r = await call('add_cases', { cases: [{ details: 'one new' }, { details: 'two new' }], confirm: true });
assert.match(txt(r), /Saved 1 case\b/);
assert.match(txt(r), /Stopped after 1 of 2: offline/);
writer.saveCase = async c => { log.push(['case', c]); };

// suggest_tags
r = await call('suggest_tags', { text: 'LSCS under spinal' });
assert.match(txt(r), /16 Lower Segment Caesarean Section/);
r = await call('suggest_tags', { case_id: 'c1' });
assert.doesNotMatch(txt(r).split('\n')[1], /\b08 /, 'leaves out tags the case has');
r = await call('suggest_tags', {});
assert.match(txt(r), /^1 case has no APMES tag/);
assert.equal((await call('suggest_tags', { case_id: 'nope' })).isError, true);

// list_plan and plan_cases
r = await call('list_plan', {});
assert.match(txt(r), /Later \(1\):\n- 2030-01-01 · ZZ: planned/);
log.length = 0;
r = await call('plan_cases', { text: 'AB 45F lap chole\n\nCD hernia', date: '2030-01-02' });
assert.match(txt(r), /^Plan for 2030-01-02, 2 cases/);
assert.equal(log.length, 0);
r = await call('plan_cases', { text: 'AB 45F lap chole\n\nCD hernia', date: '2030-01-02', confirm: true });
assert.match(txt(r), /^Planned 2 cases for 2030-01-02/);
const [[kind, plan]] = log;
assert.equal(kind, 'plan');
assert.equal(plan.length, 3, 'added to the plan already there');
assert.equal(plan[0].id, 'p0');
assert.ok(plan.slice(1).every(p => p.date === '2030-01-02'));
assert.equal((await call('plan_cases', { cases: [{ details: 'x' }], date: '2020-01-01' })).isError, true, 'not for a past day');
data.logbook.plan = Array.from({ length: 100 }, (_, i) => ({ id: 'p' + i, date: '2030-01-01', details: 'x', cats: [] }));
r = await call('plan_cases', { cases: [{ details: 'x' }] });
assert.match(txt(r), /at most 100/);

// log_planned: due ones become cases on their planned date (source paste, sheet queued) and leave the plan
data.logbook.plan = [
  { id: 'd1', date: '2026-01-02', initials: 'EF', details: 'knee scope', cats: ['08'], tags: ['08:day'] },
  { id: 'd2', date: today(), details: 'hernia', cats: [] },
  { id: 'd3', date: '2026-01-01', initials: 'XY', details: 'LSCS spinal', cats: [] },   // already logged (c2)
  { id: 'l1', date: '2030-01-01', details: 'later', cats: [] },
];
assert.equal((await call('log_planned', {})).isError, true, 'ids or all_due needed');
assert.equal((await call('log_planned', { ids: ['d1'], all_due: true })).isError, true, 'not both');
assert.match(txt(await call('log_planned', { ids: ['l1'] })), /not due yet/);
assert.match(txt(await call('log_planned', { ids: ['nope'] })), /No planned case with id "nope"/);
log.length = 0;
r = await call('log_planned', { all_due: true });
assert.match(txt(r), /^3 planned cases to log as done \(1 already in the logbook/);
assert.match(txt(r), /1\. 2026-01-02 · EF: knee scope/);
assert.match(txt(r), /Preview only/);
assert.equal(log.length, 0);
r = await call('log_planned', { all_due: true, confirm: true });
assert.match(txt(r), /^Logged 2 planned cases as done \(1 already in the logbook/);
const logged = log.filter(([k]) => k === 'case').map(([, c]) => c);
assert.deepEqual(logged.map(c => [c.date, c.details, c.source]), [['2026-01-02', 'knee scope', 'paste'], [today(), 'hernia', 'paste']]);
assert.deepEqual(logged[0].tags, ['08:day'], 'personal tags kept');
assert.deepEqual(log.filter(([k]) => k === 'plan')[0][1].map(p => p.id), ['l1'], 'only the later one stays');
// by id, and a save that fails keeps the rest in the plan
log.length = 0;
writer.saveCase = async () => { throw new Error('offline'); };
r = await call('log_planned', { ids: ['d1'], confirm: true });
assert.match(txt(r), /Stopped after 0 of 1: offline/);
assert.equal(log.filter(([k]) => k === 'plan').length, 0, 'plan untouched when nothing saved');
writer.saveCase = async c => { log.push(['case', c]); };
r = await call('list_plan', {});
assert.match(txt(r), /\(id d1\)/);

console.log('bulk.test.mjs: ok');
