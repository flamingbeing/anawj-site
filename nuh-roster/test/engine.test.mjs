// Run with: node nuh-roster/test/engine.test.mjs  (fake names only)
import assert from 'node:assert/strict';
import { matchName, namesInCell, suggestFlags, generate, check, tickFromHistory, suggestShortName, suggestShortNames } from '../js/engine.js';

const P = (id, name, role, extra = {}) => ({ id, name, role, grade: role === 'senior' ? 'Consultant' : 'Resident', aliases: [], posting: '', subspecs: [], avoid: [], ...extra });

// names
const staff0 = [P('a', 'Tan Yi Wei', 'senior'), P('b', 'Leong Siaw May', 'senior'), P('c', 'Tan Yi Ling', 'senior')];
assert.equal(matchName('Tan YW', staff0).person.id, 'a');
assert.equal(matchName('Leong SM', staff0).person.id, 'b');
assert.ok(matchName('Tan', staff0).ambiguous);
assert.deepEqual(namesInCell('Sophia am /Leong SM pm'), ['Sophia', 'Leong SM']);
assert.deepEqual(namesInCell('Chaminda (Leong SM C)'), ['Chaminda']);
assert.deepEqual(namesInCell('Bryan Ng -mtg 8.30, 3.30'), ['Bryan Ng']);
assert.deepEqual(namesInCell('Loh May-Han (AOH 3)'), ['Loh May-Han']);

// flags
assert.deepEqual(suggestFlags('pras 10mo').subspecs, ['paeds']);
assert.deepEqual(suggestFlags('c').subspecs, ['cardiac']);
assert.deepEqual(suggestFlags('scoli 28y').subspecs, []);
assert.equal(suggestFlags('scoli 28y').complex, true);
assert.deepEqual(suggestFlags('eye').subspecs, []);
assert.deepEqual(suggestFlags('', undefined, 'MOR 12').subspecs, ['cardiac'], 'MOR 12 is cardiac by default');
assert.deepEqual(suggestFlags('c', undefined, 'mor 13').subspecs, ['cardiac'], 'no duplicate, case-insensitive room');
assert.deepEqual(suggestFlags('', undefined, 'MOR 11').subspecs, []);
{
  const st = [{ id: 'x', role: 'senior', subspecs: ['neuro'], history: { cardiac: 2, paeds: 1 } }, { id: 'y', role: 'junior', history: { paeds: 3 } }];
  assert.equal(tickFromHistory(st, 2), 1);
  assert.deepEqual(st[0].subspecs, ['neuro', 'cardiac']);
  assert.equal(tickFromHistory(st, 1), 1);
  assert.equal(st[1].subspecs, undefined, 'juniors untouched');
}

// generation
const room = (id, name, complex, notes = '') => ({ id, name, complex, running: true, notes, flags: suggestFlags(notes), session: 'full' });
const staff = [
  P('s1', 'Senior Paeds', 'senior', { subspecs: ['paeds'] }),
  P('s2', 'Senior Cardiac', 'senior', { subspecs: ['cardiac'] }),
  P('s3', 'Senior General', 'senior', { avoid: ['eye'] }),
  P('j1', 'Junior Baby', 'junior', { grade: 'Baby MO' }),
  P('j2', 'Junior Resident', 'junior'),
  P('j3', 'Junior Mopex', 'junior', { grade: 'MOPEX' }),
  P('j4', 'Junior Paeds', 'junior', { posting: 'P' }),
];
const day = {
  rooms: [room('r1', 'MCOR 1', 'MCOR', 'ent 3y'), room('r2', 'MOR 12', 'MOR', 'c'), room('r3', 'MCOR 2', 'MCOR', 'eye'), room('r4', 'MCOR 3', 'MCOR', 'hernia')],
  staff: { j2: { notAroundPrev: true } },
};
for (let seed = 1; seed < 30; seed++) {
  const g = generate({ staff, day, seed });
  const by = Object.fromEntries(g.rows.map(r => [r.label, r]));
  assert.match(by['MCOR 1'].senior, /Senior Paeds/, 'paeds room gets the paeds senior');
  assert.match(by['MOR 12'].senior, /Senior Cardiac/, 'cardiac room gets the cardiac senior');
  assert.doesNotMatch(by['MCOR 2'].senior, /Senior General/, "senior who doesn't do eye isn't given eye");
  // one double cover is needed (3 seniors, 4 rooms): Baby MO must not be in a double-covered room
  const counts = {};
  g.rows.forEach(r => r.senior.split(' / ').filter(Boolean).forEach(s => { counts[s] = (counts[s] || 0) + 1; }));
  for (const r of g.rows) {
    if (r.junior.includes('Junior Baby')) assert.ok(r.senior.split(' / ').every(s => counts[s] === 1), `Baby MO in double-covered room (seed ${seed})`);
  }
  assert.match(by['MCOR 1'].junior, /Junior Paeds/, 'paeds posting junior goes to the paeds list');
  const withJ2 = g.rows.find(r => r.complex !== 'Clinic' && r.junior.includes('Junior Resident'));
  if (withJ2) assert.ok(withJ2.premed && !withJ2.premed.includes('Junior Resident') && !withJ2.premed.includes('Junior Baby'), 'premed cover from someone around yesterday, not a Baby MO');
  const errs = check({ rows: g.rows, staff, day }).filter(w => w.level === 'error');
  assert.deepEqual(errs, [], JSON.stringify(errs));
}

// checks catch hand edits
const bad = [{ roomId: 'r1', label: 'MCOR 1', complex: 'MCOR', senior: 'Senior General', junior: 'Junior Baby', premed: '', notes: 'ent 3y' }];
const out = check({ rows: bad, staff, day: { ...day, staff: { s3: { status: 'leave' } } } }).map(w => w.text).join('\n');
assert.match(out, /on leave/);
assert.match(out, /Paeds list/);
assert.equal(suggestShortName('Tan Yi Wei'), 'Tan YW');
assert.equal(suggestShortName('Chan Jiaxin'), 'Jiaxin');
assert.equal(suggestShortName('Swapna Thampi'), 'Swapna');
assert.equal(suggestShortName('Eric Lee Shih Hsiung'), 'Eric');
assert.equal(suggestShortName('Loh May-Han'), 'Loh MH');
{
  const st = [P('a', 'Tan Yi Wei', 'senior'), P('b', 'Tan Yu Wen', 'junior'), P('c', 'Swapna Thampi', 'senior'), P('d', 'Ang King Sin', 'senior', { aliases: ['Ang KS'] }), P('e', 'Swapna Rao', 'junior')];
  assert.deepEqual(suggestShortNames(st), [], 'clashing suggestions and people with short names are skipped');
  st.pop(); st.splice(1, 1);
  assert.deepEqual(suggestShortNames(st).map(x => x.short), ['Tan YW', 'Swapna']);
}
console.log('engine tests passed');

// contact list merging (fake names)
{
  const { mergeContacts, findSameStaff } = await import('../js/engine.js');
  const { cleanContactName } = await import('../js/xlsxio.js');
  assert.equal(cleanContactName('Dr Foo Peng Xiang, Donald'), 'Donald Foo Peng Xiang');
  assert.equal(cleanContactName('A/Prof Sophia Ang Bee Leng '), 'Sophia Ang Bee Leng');
  assert.equal(cleanContactName('Dr Ambika D/O Paramasivan'), 'Ambika Paramasivan');
  assert.equal(cleanContactName('Dr Ng Peng (SAF)'), 'Ng Peng');
  const staff = [P('a', 'Sophia Ang', 'senior'), P('b', 'Donald Foo', 'senior', { grade: 'AC' }), P('c', 'Zara Lim', 'senior')];
  assert.equal(findSameStaff('Sophia Ang Bee Leng', staff).id, 'a');
  let n = 0;
  const res = mergeContacts(staff, [
    { name: 'Sophia Ang Bee Leng', role: 'senior', grade: 'Consultant', subspecs: ['cardiac'] },
    { name: 'Donald Foo Peng Xiang', role: 'senior', grade: 'Consultant', subspecs: [] },
    { name: 'New Person Senior', role: 'senior', grade: 'AC', subspecs: ['paeds'] },
    { name: 'New Junior Person', role: 'junior', grade: 'MOPEX', subspecs: [] },
  ], () => 'n' + ++n);
  assert.deepEqual(res.staff.find(p => p.id === 'a').subspecs, ['cardiac']);
  assert.equal(res.staff.find(p => p.id === 'b').grade, 'Consultant');
  assert.ok(res.staff.some(p => p.name === 'New Person Senior'));
  assert.deepEqual(res.skipped, ['New Junior Person']);
  assert.deepEqual(staff[0].subspecs, [], 'input not mutated');
  console.log('contact tests passed');
}

// leave and cover tags
{
  const { missingCovers, namesInCell: nic } = await import('../js/engine.js');
  assert.deepEqual(nic('Tan YW L-4pm / Lee AB C-OT13'), ['Tan YW', 'Lee AB']);
  assert.deepEqual(nic('Tan YW L-4-5pm'), ['Tan YW']);
  const rows = [
    { roomId: 'a', label: 'MOR 13', complex: 'MOR', senior: 'Senior One L-4pm', junior: '' },
    { roomId: 'b', label: 'MOR 14', complex: 'MOR', senior: 'Senior Two', junior: '' },
  ];
  assert.equal(missingCovers(rows).length, 1);
  rows[1].senior = 'Senior Two C-OT13';
  assert.equal(missingCovers(rows).length, 0);
  rows.push({ roomId: 'c', label: 'KROR PACU', complex: 'KROR', senior: 'Senior Three L-4-5pm', junior: '' });
  assert.equal(missingCovers(rows).length, 1);
  rows[1].junior = 'Junior Four C-KROR PACU';
  assert.equal(missingCovers(rows).length, 0, 'cover by full room name, from another complex');
  rows[1].senior = 'Senior Two C-13';
  assert.equal(missingCovers(rows).length, 0, 'bare number means own complex');
  const r2 = [
    { roomId: 'a', label: 'MOR 13', complex: 'MOR', senior: 'Senior One', junior: 'Junior Five L-3pm' },
    { roomId: 'b', label: 'MOR 14', complex: 'MOR', senior: 'Senior Two', junior: 'Junior Six' },
  ];
  assert.equal(missingCovers(r2).length, 1);
  r2[0].junior = 'Junior Five L-3pm / Junior Six (C)';
  assert.equal(missingCovers(r2).length, 0, '"Name (C)" in the room counts as its cover');
  const st = [P('j5', 'Junior Five', 'junior'), P('j6', 'Junior Six', 'junior'), P('s1', 'Senior One', 'senior'), P('s2', 'Senior Two', 'senior')];
  const day = { rooms: [{ id: 'a', name: 'MOR 13' }, { id: 'b', name: 'MOR 14' }], staff: {} };
  assert.ok(!check({ rows: r2, staff: st, day }).some(w => /junior in/.test(w.text)), 'an ad hoc cover is not a second junior posting');
  console.log('cover tests passed');
}

// AOCC gets a senior and two juniors; AIC a spare consultant or a senior resident
{
  const st = [
    P('s1', 'Senior A', 'senior'), P('s2', 'Senior B', 'senior'), P('s3', 'Senior C', 'senior'),
    P('j1', 'Junior A', 'junior'), P('j2', 'Junior B', 'junior'), P('j3', 'Junior C', 'junior'),
    P('j4', 'Junior SR', 'junior', { grade: 'Senior Resident' }),
  ];
  const dy = { rooms: [room('r1', 'MOR 1', 'MOR', 'hernia')], staff: {} };
  const g = generate({ staff: st, day: dy, seed: 5 });
  const by = Object.fromEntries(g.rows.map(r => [r.label, r]));
  assert.ok(by['AOCC'].senior, 'AOCC has a senior');
  assert.equal(by['AOCC'].junior.split(' / ').length, 2, 'AOCC has two juniors');
  assert.ok(by['AIC'].senior, 'AIC filled');
  assert.equal(by['AH OT'].senior, '', 'AH OT left for hand entry');
  const fixedDay = { ...dy, fixed: { ahot: 'Senior C', aic: 'Junior SR' } };
  const g2 = generate({ staff: st, day: fixedDay, seed: 5 });
  assert.equal(g2.rows.find(r => r.label === 'AH OT').senior, 'Senior C');
  assert.equal(g2.rows.find(r => r.label === 'AIC').senior, 'Junior SR');
  console.log('special row tests passed');
}
