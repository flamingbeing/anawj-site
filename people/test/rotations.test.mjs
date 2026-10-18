// Plain node checks for people/js/rotations.js (the block rotation sheet reader). Made-up names only.
import assert from 'node:assert/strict';
import { CODE_KEY, splitCode, weekColumns, parseBlockSheet, readable, manpower, unknownCodes, history, nameKey, weekMonday, sampleRows, CRITICAL, suggestLinks, exportRotations, placementOf, exportPlacements } from '../js/rotations.js';

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('✗ ' + name); throw e; } };

t('codes: exact entries, elective, provisional, combinations, unknown', () => {
  const c = splitCode('C-e');
  assert.equal(c.parts[0].elective, false);          // echo week, not an elective
  assert.equal(c.parts[0].known[2], 'Cardiac echo week');
  const e = splitCode('Liver-E');
  assert.deepEqual([e.parts[0].base, e.parts[0].elective, e.unknown], ['Liver', true, false]);
  assert.equal(splitCode('Paed-E').parts[0].known[2], 'Paediatric anaesthesia elective');
  const k = splitCode('KIV ICU');
  assert.deepEqual([k.provisional, k.parts[0].code, k.unknown], [true, 'KIV ICU', false]);
  const kv = splitCode('KIV Vascular');                // KIV in front of a known code that has no KIV entry
  assert.deepEqual([kv.provisional, kv.parts[0].code, kv.unknown], [true, 'Vascular', false]);
  const combo = splitCode('Part B/ ICU');
  assert.deepEqual([combo.combo, combo.parts.map(p => p.code)], [true, ['Part B', 'ICU']]);
  assert.equal(splitCode('ML/ NPL').combo, false);     // an exact entry in the key
  assert.equal(splitCode('Mystery').unknown, true);
  assert.deepEqual([splitCode('ICU.').parts[0].code, splitCode('PART B').parts[0].code, splitCode('C.').parts[0].code], ['ICU', 'Part B', 'C']);
  assert.deepEqual([splitCode('C-E').parts[0].elective, splitCode('C-E').parts[0].base], [true, 'C']);   // capitals matter for short codes: an elective, not the echo week
  assert.equal(splitCode('  '), null);
  assert.equal(splitCode(null), null);
  assert.equal(splitCode('ICU  ').raw, 'ICU');
});

t('weeks: notes, stars, month ends, a changeover week and a year end', () => {
  const row1 = ['', '2026-12-01', '', '', '', '', '2027-01-01', '', '', ''];
  const row2 = ['', '(MOPEX changeover)\n14* (M)-20', '21-27', '28-3', '*CHANGEOVER DAY', '', '4*-10', '11-17', 'CNY 18-19\n\n18-24', '25-31'];
  const w = weekColumns(row1, row2);
  assert.deepEqual(w.map(x => x.start), ['2026-12-14', '2026-12-21', '2026-12-28', '2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25']);
  assert.deepEqual(w.map(x => x.col), [1, 2, 3, 6, 7, 8, 9]);   // the note column and the blank are not weeks
  assert.equal(w[0].holiday, true);
  assert.equal(w[1].holiday, false);
  assert.equal(weekMonday('2027-01-06'), '2027-01-04');
  assert.equal(weekMonday('2027-01-04'), '2027-01-04');
});

t('weeks: a missing label does not shift the later ones', () => {
  const row1 = ['', '2027-02-01'];
  const row2 = ['', '1-7', '8-14', 'oops', '22-28', '1-7'];
  assert.deepEqual(weekColumns(row1, row2).map(x => x.start), ['2027-02-01', '2027-02-08', '2027-02-22', '2027-03-01']);
});

t('sheet: sections, people, origin tags and where the people stop', () => {
  const p = parseBlockSheet(sampleRows());
  assert.equal(p.weeks.length, 12);
  assert.deepEqual(p.sections.map(s => [s.label, s.people.length]),
    [['RESIDENT PHYSICIANS', 2], ['CA2 Residents', 3], ['CA1 Residents', 1], ['External Residents', 2]]);
  const ext = p.sections[3].people;
  assert.deepEqual(ext.map(x => [x.name, x.origin]), [['Dana Visitor', 'ED'], ['Lee Rotating', 'SIG']]);   // a tag alone, or in brackets
  assert.equal(p.sections.flatMap(s => s.people).some(x => /manpower/i.test(x.name)), false);
  assert.equal(readable(p), false);                    // 12 weeks is not a year
  assert.equal(readable(p, 4), true);
  assert.equal(parseBlockSheet([['x'], ['y']]), null);
});

t('sheet: a person with nothing planned is a person, not a section', () => {
  const rows = sampleRows();
  rows.splice(4, 0, ['Nobody Planned', ...Array(12).fill(''), 'Nobody Planned']);
  const p = parseBlockSheet(rows);
  assert.deepEqual(p.sections[0].people.map(x => x.name), ['Alex Example', 'Nobody Planned', 'Sam Sample']);
});

t('sheet: counts in the grid are not postings', () => {
  const rows = sampleRows();
  rows[3][1] = '3'; rows[3][2] = '0.0';
  const p = parseBlockSheet(rows);
  assert.deepEqual(p.sections[0].people[0].codes.slice(0, 3), ['', '', 'GC']);
});

t('summaries: people per posting, unknown codes, history', () => {
  const p = parseBlockSheet(sampleRows());
  const m = manpower(p, { skip: s => /^external/i.test(s.label) });
  const gc = m.find(r => r.code === 'GC');
  assert.equal(gc.byWeek.length, 12);
  assert.equal(gc.byWeek[0], 3);                        // Alex, Sam and Jo in week 1 (the external ones are skipped)
  assert.equal(m.find(r => r.code === 'ICU').byWeek[4], 1);
  assert.deepEqual(unknownCodes(p), [{ code: 'Mystery', count: 1 }]);
  const h = history([{ name: 'Sample', parsed: p }], nameKey('Robin Testcase'));
  assert.deepEqual(h.map(r => [r.code, r.total]).sort(), [['GC', 2], ['Liver', 2], ['OGNF1', 2], ['OGNF2', 2], ['Part B', 1], ['Prep', 2], ['Mystery', 1]].sort());
  assert.equal(nameKey('Lee Rotating (SIG)'), nameKey('Lee Rotating'));
});

t('the key is complete: every entry has an institution, a type and a meaning', () => {
  for (const [code, v] of Object.entries(CODE_KEY)) {
    assert.ok(['NUH', 'NTF', 'KKH', 'TTSH', 'other', 'none'].includes(v[0]), code);
    assert.ok(['post', 'exam', 'leave', 'other'].includes(v[1]), code);
    assert.ok(v[2] && v[2].length >= 3, code);
  }
  assert.ok(Object.keys(CODE_KEY).length >= 60);
});

t('hand-off: only the critical postings, in the roster paste format', () => {
  const p = parseBlockSheet(sampleRows());
  const links = { [nameKey('Kim Placeholder')]: 'Kim P', [nameKey('Pat Madeup')]: 'Pat M', [nameKey('Robin Testcase')]: 'Robin T', [nameKey('Sam Sample')]: 'Sam S', [nameKey('Dana Visitor')]: '' };
  const r = exportRotations(p, { links });
  const rows = r.text.trim().split('\n').map(l => l.split('\t'));
  assert.deepEqual(rows[0].slice(0, 3), ['Name', '2027-01-04', '2027-01-11']);   // the first week starts midweek: its Monday
  const kim = rows.find(x => x[0] === 'Kim P');
  assert.deepEqual(kim.slice(1), ['ICU', 'ICU', 'ICU', 'ICU', '', '', '', '', 'C', 'C', 'C-e', 'C-p']);
  const pat = rows.find(x => x[0] === 'Pat M');
  assert.equal(pat[9], '');                              // KIV ICU is provisional: left out
  assert.equal(pat[10], 'ICU');
  assert.equal(rows.find(x => x[0] === 'Robin T')[9], 'ICU');   // "Part B/ ICU": the ICU part
  assert.equal(rows.find(x => x[0] === 'Robin T')[5], '');      // Liver-E is not critical
  assert.equal(rows.find(x => x[0] === 'Sam S')[5], 'ICU');
  assert.equal(r.people.some(x => x.name === 'Dana Visitor'), false);   // linked to nobody on purpose
  assert.deepEqual(r.unlinked.map(x => x.name), []);                    // Dana was decided, Alex and Jo have none
  const kiv = exportRotations(p, { links, provisional: true });
  assert.equal(kiv.text.split('\n').find(l => l.startsWith('Pat M')).split('\t')[9], 'ICU');
});

t('hand-off: unlinked people, a date range and the codes the roster accepts', () => {
  const p = parseBlockSheet(sampleRows());
  const r = exportRotations(p, { accepted: ['ICU', 'OGNF1'], from: '2027-02-01', to: '2027-02-08' });
  assert.deepEqual(r.weeks, ['2027-02-01', '2027-02-08']);
  assert.deepEqual(r.people, []);
  assert.deepEqual(r.unlinked.map(x => x.name), ['Sam Sample', 'Dana Visitor']);   // ICU in those two weeks, nobody linked yet
  assert.equal(r.text, '');
  const e = exportRotations(p, { accepted: ['icu'], links: { [nameKey('Sam Sample')]: 'Sam' } });   // codes match in any capitals
  assert.ok(e.text.includes('Sam\t'));
  assert.ok(CRITICAL.includes('OGDF'));
});

t('NTF hand-off: one word per week from the code key', () => {
  const w = c => placementOf(c);
  assert.deepEqual(['NTFGH-JR', 'NTF ICU', 'NTFGH-RA'].map(w), ['NTF', 'NTF', 'NTF']);
  assert.deepEqual(['ICU', 'GC', 'Neu', 'RA'].map(w), ['NUH', 'NUH', 'NUH', 'NUH']);
  assert.deepEqual([w('KKH'), w('TTSH NICU'), w('AH-AMB')], ['KKH', 'TTSH', 'OTH']);
  assert.deepEqual([w('AL'), w('ML'), w('NPL'), w('SAF'), w('ML/ NPL')], ['AL', 'ML', 'NPL', 'NS', 'ML']);
  assert.deepEqual([w('Part A'), w('Part B'), w('Part C'), w('Part B/ ICU')], ['', '', '', '']);   // exam weeks are not sent (owner, 18 Oct)
  assert.deepEqual([w('OG1'), w('OG2'), w('OGDF'), w('OGNF1')], ['', '', 'NUH', 'NUH']);        // OG1 and OG2 are of no use to the monthly rosters
  assert.equal(w('Prep'), 'NUH');                       // exam preparation is still a NUH posting
  assert.deepEqual([w('KIV ICU'), w('KIV AL'), w('Liver-E'), w('Elective'), w('ED'), w('TTSH'), w('Mystery'), w(''), w(null)], ['', '', '', '', '', '', '', '', '']);
  assert.equal(w('NTFGH/ ICU'), 'NTF');                  // two codes: the first decides
});

t('NTF hand-off: names, date range and unlinked people', () => {
  const p = parseBlockSheet(sampleRows());
  const links = { [nameKey('Kim Placeholder')]: 'Kim P' };
  const r = exportPlacements(p, { links, from: '2027-01-04', to: '2027-01-25' });
  assert.deepEqual(r.weeks, ['2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25']);
  const rows = r.text.trim().split('\n').map(l => l.split('\t'));
  assert.deepEqual(rows[0], ['Name', ...r.weeks]);
  const kim = rows.find(x => x[0] === 'Kim P');
  assert.ok(kim && kim.length === 5 && kim.slice(1).every(c => c === 'NUH'));
  assert.ok(r.unlinked.length > 0);                       // the others have no roster name yet
  assert.equal(r.text.includes('Placeholder'), false);    // the sheet name never goes over, only the roster's
  const none = exportPlacements(p, { links: Object.fromEntries(p.sections.flatMap(s => s.people).map(x => [x.key, ''])) });
  assert.equal(none.text, '');
});

t('hand-off: suggestions need exactly one best roster name', () => {
  const score = (a, b) => (a === b ? 3 : a.split(' ')[0] === b.split(' ')[0] ? 2 : 0);
  const people = [{ key: 'a', name: 'Alex Example' }, { key: 'b', name: 'Sam Sample' }, { key: 'c', name: 'Pat Madeup' }];
  const m = suggestLinks(people, ['Alex Example', 'Sam Other', 'Sam Third'], score);
  assert.equal(m.get('a'), 'Alex Example');
  assert.equal(m.has('b'), false);     // two Sams: no guess
  assert.equal(m.has('c'), false);
});

console.log(`people rotations: ${n} checks passed`);
