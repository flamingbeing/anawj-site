// Run with: node logbook/test/engine.test.mjs  (fake data only)
// Also worth running under other time zones, e.g. TZ=America/New_York and TZ=Asia/Singapore.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  uid, todayISO, parseDate, fmtDate, withParents, countCases, rYearDefault, progress, epaProgress,
  frequentCombos, parseBulk, duplicates, caseFromRow, diffRows, catFromText, splitInitials, cleanInitials, caseParts, caseText,
} from '../js/engine.js';
import { BY_CODE } from '../js/categories.js';

// ids and dates
{
  const ids = new Set(Array.from({ length: 500 }, uid));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, /^[0-9a-z]{16}$/);
  assert.equal(todayISO(new Date(2026, 0, 7, 23, 59)), '2026-01-07');
  assert.equal(todayISO(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
}

// parseDate
{
  const P = parseDate;
  assert.equal(P('2026-03-12'), '2026-03-12');
  assert.equal(P('2026-3-2'), '2026-03-02');
  assert.equal(P('2026-03-12T10:00:00'), '2026-03-12');
  assert.equal(P('2026-02-30'), null);
  assert.equal(P('12/3/26'), '2026-03-12', 'day first');
  assert.equal(P('12/3/2026'), '2026-03-12');
  assert.equal(P('1-2-2025'), '2025-02-01');
  assert.equal(P('01.02.25'), '2025-02-01');
  assert.equal(P(' 7/1/26 '), '2026-01-07');
  assert.equal(P('31/6/24'), null, '30 days in June');
  assert.equal(P('29/2/24'), '2024-02-29', 'leap year');
  assert.equal(P('29/2/23'), null, 'not a leap year');
  assert.equal(P('29/2/2000'), '2000-02-29');
  assert.equal(P('29/2/2100'), null);
  assert.equal(P('13/13/24'), null);
  assert.equal(P('0/1/24'), null);
  assert.equal(P('12/3'), null, 'no year: not a full date');
  assert.equal(P('7 Jan 2026'), '2026-01-07');
  assert.equal(P('7 January 2026'), '2026-01-07');
  assert.equal(P('7-Jan-26'), '2026-01-07');
  assert.equal(P('07 jan 26'), '2026-01-07');
  assert.equal(P('1st Sept 2025'), '2025-09-01');
  assert.equal(P('31 Apr 2025'), null);
  assert.equal(P('7 Junior 2026'), null);
  assert.equal(P('yesterday'), null);
  assert.equal(P(''), null);
  assert.equal(P(null), null);
  assert.equal(P(undefined), null);
  // Excel serials (1900 date system)
  assert.equal(P(45658), '2025-01-01');
  assert.equal(P(45658.75), '2025-01-01', 'time part ignored');
  assert.equal(P(45351), '2024-02-29');
  assert.equal(P('45658'), '2025-01-01');
  assert.equal(P(12), null, 'small numbers are not dates');
  assert.equal(P(NaN), null);
  // Date objects: local midnight, local afternoon, and UTC midnight (as ExcelJS returns date cells)
  assert.equal(P(new Date(2026, 2, 12)), '2026-03-12');
  assert.equal(P(new Date(2026, 2, 12, 15, 30)), '2026-03-12');
  assert.equal(P(new Date(2024, 1, 29)), '2024-02-29');
  assert.equal(P(new Date(Date.UTC(2026, 2, 12))), '2026-03-12');
  assert.equal(P(new Date('nope')), null);
}

// fmtDate
assert.equal(fmtDate('2026-01-07'), '7 Jan 2026');
assert.equal(fmtDate('2025-12-25'), '25 Dec 2025');
assert.equal(fmtDate(null), '');
assert.equal(fmtDate('sometime'), 'sometime');

// withParents
assert.deepEqual(withParents(['20iii']), ['20', '20iii']);
assert.deepEqual(withParents(['17', '26i', '26iii']), ['17', '26', '26i', '26iii']);
assert.deepEqual(withParents(['26', '26i']), ['26', '26i']);
assert.deepEqual(withParents(['26i', '26']), ['26', '26i']);
assert.deepEqual(withParents(['16', '16', '15i']), ['16', '15', '15i']);
assert.deepEqual(withParents([]), []);
assert.deepEqual(withParents(undefined), []);

// countCases
assert.deepEqual(countCases([{ cats: ['16', '17'] }, { cats: ['16', '16'] }, { cats: ['20iii'] }, {}]), { 16: 2, 17: 1, '20iii': 1 });
assert.deepEqual(countCases([]), {});

// rYearDefault (AY starts 1 July)
assert.equal(rYearDefault(2026, new Date(2026, 9, 10)), 1);
assert.equal(rYearDefault(2026, new Date(2026, 6, 1)), 1);
assert.equal(rYearDefault(2026, new Date(2026, 5, 30)), 1, 'clamped up');
assert.equal(rYearDefault(2025, new Date(2026, 5, 30)), 1);
assert.equal(rYearDefault(2025, new Date(2026, 6, 1)), 2);
assert.equal(rYearDefault(2023, new Date(2026, 9, 10)), 4);
assert.equal(rYearDefault(2019, new Date(2026, 9, 10)), 5, 'clamped down');
assert.equal(rYearDefault('2024', new Date(2026, 9, 10)), 3);
assert.equal(rYearDefault(undefined), 1);

// progress
{
  const get = (counts, r, code) => progress(counts, r).find(p => p.code === code);
  const all = progress({}, 1);
  assert.ok(!all.some(p => BY_CODE[p.code].retired), 'no retired categories');
  assert.equal(get({}, 1, '99').status, 'none');
  assert.equal(get({}, 1, '37').next, null);
  // 16 LSCS: R3 10, R5 20
  const lscs = r => get({ 16: 12 }, r, '16');
  assert.deepEqual(lscs(1).milestones, [{ by: 'R3', n: 10, met: true, due: 'later' }, { by: 'R5', n: 20, met: false, due: 'later' }]);
  assert.deepEqual(lscs(1).next, { by: 'R5', n: 20 });
  assert.equal(lscs(1).status, 'ontrack');
  assert.equal(lscs(4).status, 'ontrack');
  assert.equal(lscs(5).status, 'due');
  assert.equal(lscs(5).milestones[1].due, 'now');
  assert.equal(get({ 16: 20 }, 5, '16').status, 'done');
  assert.equal(get({ 16: 25 }, 2, '16').status, 'done', 'done early');
  const lscs5 = r => get({ 16: 5 }, r, '16');
  assert.equal(lscs5(1).status, 'ontrack');
  assert.equal(lscs5(2).status, 'ontrack');
  assert.equal(lscs5(3).status, 'due');
  assert.equal(lscs5(3).milestones[0].due, 'now');
  assert.equal(lscs5(4).status, 'late');
  assert.equal(lscs5(4).milestones[0].due, 'past');
  assert.equal(lscs5(5).status, 'late');
  assert.equal(lscs5(4).count, 5);
  // 26 blocks: R2 10, R3 20, R4 30, R5 40 (lifetime counts)
  const blocks = (n, r) => get({ 26: n }, r, '26');
  assert.equal(blocks(0, 1).status, 'ontrack');
  assert.equal(blocks(5, 2).status, 'due');
  assert.equal(blocks(10, 2).status, 'ontrack', 'R2 met, R3 still to come');
  assert.deepEqual(blocks(10, 2).next, { by: 'R3', n: 20 });
  assert.equal(blocks(15, 3).status, 'due');
  assert.equal(blocks(9, 3).status, 'late');
  assert.equal(blocks(25, 4).status, 'due');
  assert.equal(blocks(25, 5).status, 'late');
  assert.equal(blocks(40, 5).status, 'done');
  assert.equal(blocks(40, 5).milestones.length, 4);
  // 31 chronic pain: R5 only
  assert.equal(get({}, 3, '31').status, 'ontrack');
  assert.equal(get({}, 5, '31').status, 'due');
  // R3-only target, R4+
  assert.equal(get({ 13: 19 }, 4, '13').status, 'late');
  assert.equal(get({ 13: 20 }, 4, '13').status, 'done');
  assert.equal(progress(undefined, undefined).length, all.length);
}

// epaProgress
{
  const e = epaProgress({ 16: 25, 17: 2 }, 3);
  const epas = e.map(g => String(g.epa));
  assert.deepEqual(epas.slice(0, 5), ['2', '3', '4', '5', '6']);
  assert.ok(epas.indexOf('7a') < epas.indexOf('7b') && epas.indexOf('7b') < epas.indexOf('8') && epas.indexOf('11') < epas.indexOf('12'));
  assert.equal(e.find(g => g.epa === '7b').status, 'done');
  assert.equal(e.find(g => g.epa === '7a').status, 'due');
  const nine = epaProgress({ 20: 200, '20i': 5, '20ii': 20, '20iii': 99 }, 4).find(g => g.epa === 9);
  assert.equal(nine.items.length, 4);
  assert.equal(nine.status, 'late', 'worst item wins');
  assert.ok(!epaProgress({}, 1).some(g => g.items.some(i => i.code === '13')), 'categories without an EPA are left out');
}

// frequentCombos
{
  const C = cats => ({ cats });
  const cases = [
    ...Array(5).fill(['17', '16']).map(C),
    ...Array(3).fill(['13', '08']).map(C),
    ...Array(2).fill(['18', '26', '26ii']).map(C),
    ...Array(4).fill(['21']).map(C),
    C(['16', '17', '28']), C([]),
  ];
  const f = frequentCombos(cases);
  assert.deepEqual(f, [{ cats: ['16', '17'], count: 5 }, { cats: ['21'], count: 4 }, { cats: ['08', '13'], count: 3 }]);
  assert.deepEqual(frequentCombos(cases, { min: 2, limit: 2 }), [{ cats: ['16', '17'], count: 5 }, { cats: ['21'], count: 4 }]);
  assert.deepEqual(frequentCombos(cases, { min: 2 }).map(x => x.cats.join()), ['16,17', '21', '08,13', '18,26,26ii']);
  assert.deepEqual(frequentCombos([]), []);
  // ties: bigger set first
  assert.deepEqual(frequentCombos([...Array(3).fill(['09']).map(C), ...Array(3).fill(['10', '11']).map(C)]).map(x => x.cats.join()), ['10,11', '09']);
}

// parseBulk
{
  const fakeSuggest = text => {
    const t = text.toLowerCase(), out = [];
    if (t.includes('lscs')) out.push({ code: '16', score: 0.9 });
    if (t.includes('spinal')) out.push({ code: '17', score: 0.7 }, { code: '28', score: 0.4 });
    if (t.includes('esp')) out.push({ code: '26iii', score: 0.8 });
    return out;
  };
  const now = new Date(2026, 2, 15, 10); // 15 Mar 2026
  // cases are separated by blank lines (whitespace-only lines count); leading initials go to their own field
  const r = parseBulk('12/3 AB LSCS spinal\n\n \t \n  2026-01-05 CD ESP block  \n\n20/12 EF lap chole\n\n16/3 GH future so last year\n\n15/3 today\n\nno date here\n\n12/3/25 IJ TKR\n\n12 Mar KL eye\n\n31/6 bad date stays text', fakeSuggest, now);
  assert.equal(r.length, 9);
  assert.deepEqual(r[0], { date: '2026-03-12', initials: 'AB', details: 'LSCS spinal', cats: ['16', '17'] });
  assert.deepEqual(r[1], { date: '2026-01-05', initials: 'CD', details: 'ESP block', cats: ['26', '26iii'] });
  assert.equal(r[2].date, '2025-12-20', 'December is in the future in March: previous year');
  assert.equal(r[3].date, '2025-03-16', 'tomorrow -> last year');
  assert.equal(r[4].date, '2026-03-15', 'today stays this year');
  assert.deepEqual(r[5], { date: null, initials: '', details: 'no date here', cats: [] });
  assert.equal(r[6].date, '2025-03-12');
  assert.equal(r[6].initials, '', 'IJ is a known case word (internal jugular), not initials');
  assert.equal(r[7].date, '2026-03-12');
  assert.equal(r[7].initials, 'KL');
  assert.equal(r[7].details, 'eye');
  assert.equal(r[8].date, null);
  assert.equal(r[8].details, '31/6 bad date stays text');
  // a case spans lines until the next blank line; inner line breaks are kept; the date is on the first line only
  const multi = parseBulk('12/3 AB/34F LSCS\nspinal, converted to GA\n\n\n13/3 CD 72M\nlap chole\n14/3 not a date line\n\nLSCS spinal', fakeSuggest, now);
  assert.equal(multi.length, 3);
  assert.deepEqual(multi[0], { date: '2026-03-12', initials: 'AB', details: '34F LSCS\nspinal, converted to GA', cats: ['16', '17'] });
  assert.deepEqual(multi[1], { date: '2026-03-13', initials: 'CD', details: '72M\nlap chole\n14/3 not a date line', cats: [] });
  assert.deepEqual(multi[2], { date: null, initials: '', details: 'LSCS spinal', cats: ['16', '17'] });
  // a date alone on the first line
  assert.deepEqual(parseBulk('12/3\nEF hernia', null, now)[0], { date: '2026-03-12', initials: 'EF', details: 'hernia', cats: [] });
  // separators after the date, and paediatric ages written like dates
  assert.equal(parseBulk('12/3 - MN hernia', null, now)[0].details, 'hernia');
  assert.equal(parseBulk('12/3: MN hernia', null, now)[0].date, '2026-03-12');
  assert.deepEqual(parseBulk('8/12 boy circumcision', null, now)[0], { date: null, initials: '', details: '8/12 boy circumcision', cats: [] });
  assert.equal(parseBulk('3/52 old pyloromyotomy', null, now)[0].date, null);
  assert.equal(parseBulk('5yo tonsillectomy', null, now)[0].date, null);
  assert.equal(parseBulk('1.5 hr case', null, now)[0].date, null);
  assert.equal(parseBulk('12 Mar 30yo man', null, now)[0].date, '2026-03-12');
  assert.equal(parseBulk('12 Mar 30yo man', null, now)[0].details, '30yo man');
  // 29/2 when this year is not a leap year: the most recent one, if any
  assert.equal(parseBulk('29/2 OP', null, new Date(2025, 5, 1))[0].date, '2024-02-29');
  assert.equal(parseBulk('29/2 OP', null, new Date(2026, 5, 1))[0].date, null);
  // year rollover on 1 Jan
  assert.equal(parseBulk('31/12 QR', null, new Date(2027, 0, 1))[0].date, '2026-12-31');
  assert.equal(parseBulk('1/1 QR', null, new Date(2027, 0, 1))[0].date, '2027-01-01');
  assert.deepEqual(parseBulk('', fakeSuggest), []);
  assert.equal(parseBulk('a\tb', null, now)[0].details, 'a b');
}

// duplicates
{
  const cs = [
    { id: 'a', date: '2026-01-01', details: 'AB lscs', cats: ['16', '17'] },
    { id: 'b', date: '2026-01-01', details: ' ab  LSCS ', cats: ['17', '16'] },
    { id: 'c', date: '2026-01-02', details: 'AB lscs', cats: ['16', '17'] },
    { id: 'd', date: '2026-01-01', details: 'AB lscs', cats: ['16'] },
    { id: 'e', date: '2026-01-01', details: 'AB lscs', cats: ['16', '17'] },
    { id: 'f', date: null, details: 'x', cats: [] },
    { id: 'g', date: null, details: 'x', cats: [] },
  ];
  assert.deepEqual(duplicates(cs), [['a', 'b', 'e'], ['f', 'g']]);
  assert.deepEqual(duplicates([]), []);
}

// catFromText and caseFromRow
{
  assert.equal(catFromText('16'), '16');
  assert.equal(catFromText('6'), '06');
  assert.equal(catFromText('20iii'), '20iii');
  assert.equal(catFromText('20III)'), '20iii');
  assert.equal(catFromText(BY_CODE['17'].label), '17');
  assert.equal(catFromText('lscs'), '16');
  assert.equal(catFromText('Lower Segment Caesarean Section'), '16');
  assert.equal(catFromText('truncal BLOCKS'), '26iii');
  assert.equal(catFromText('8) Laparoscopic surgery'), '08');
  assert.equal(catFromText('42'), null);
  assert.equal(catFromText('banana'), null);

  const r = caseFromRow({ id: 'x1', date: '12/3/26', details: '  AB LSCS ', categories: '16, 17' });
  assert.deepEqual(r, { id: 'x1', date: '2026-03-12', initials: 'AB', details: 'LSCS', cats: ['16', '17'], unknown: [] });
  // an Initials column is used as it is (cleaned), and the details are then left whole
  assert.deepEqual(caseFromRow({ date: '12/3/26', initials: ' ab ', details: 'CD lap chole', categories: '' }).initials, 'AB');
  assert.equal(caseFromRow({ date: '12/3/26', initials: 'ab', details: 'CD lap chole' }).details, 'CD lap chole');
  assert.equal(caseFromRow({ details: 'LSCS spinal' }).initials, '');
  const r2 = caseFromRow({ date: 'sometime in March', details: 'CD', categories: `${BY_CODE['20'].label}, ${BY_CODE['20iii'].label}; ENT\nfoo` });
  assert.equal(r2.id, undefined);
  assert.equal(r2.date, null);
  assert.equal(r2.dateText, 'sometime in March');
  assert.equal(r2.initials, 'CD');
  assert.equal(r2.details, '');
  assert.deepEqual(r2.cats, ['20', '20iii', '10']);
  assert.deepEqual(r2.unknown, ['foo']);
  assert.equal(caseFromRow({ date: new Date(Date.UTC(2025, 0, 1)), details: 'x', categories: '' }).date, '2025-01-01');
  assert.equal(caseFromRow({ date: 45658, details: 'x' }).date, '2025-01-01');
  assert.deepEqual(caseFromRow({ categories: '16, 16, lscs' }).cats, ['16'], 'deduped');
  assert.deepEqual(caseFromRow({ categories: ['16', '17'] }).cats, ['16', '17']);
}

// diffRows
{
  const now = 1000;
  const existing = [
    { id: 'a', date: '2026-01-01', details: 'AB lscs', cats: ['16', '17'], createdAt: 1, updatedAt: 1, source: 'app' },
    { id: 'b', date: '2026-01-02', details: 'CD lap chole', cats: ['08', '13'], createdAt: 1, updatedAt: 1, source: 'app' },
    { id: 'c', date: null, dateText: 'Jan?', details: 'EF', cats: ['99'], createdAt: 1, updatedAt: 1, source: 'import' },
    { id: 'd', date: '2026-01-04', details: 'GH', cats: ['18'], createdAt: 1, updatedAt: 1, source: 'app' },
  ];
  const rows = [
    { row: 2, id: 'a', date: new Date(Date.UTC(2026, 0, 1)), details: 'AB lscs', categories: `${BY_CODE['17'].label}, ${BY_CODE['16'].label}` }, // unchanged (order of cats ignored)
    { row: 3, id: 'b', date: '2/1/2026', details: 'CD lap chole', categories: '08, 13, 21' }, // changed
    { row: 4, id: 'c', date: 'Jan?', details: 'EF', categories: '99' }, // unchanged, still no date
    { row: 5, id: '', date: '5/1/26', details: 'IJ new', categories: 'tkr?' }, // error
    { row: 6, date: '6/1/26', details: 'KL new', categories: '18' }, // added (no id key)
    { row: 7, id: 'a', date: '1/1/26', details: 'AB lscs copy', categories: '16' }, // repeated id: added
    { row: 8, id: 'zzz', date: '7/1/26', details: 'MN', categories: '' }, // unknown id: added
    { row: 9, id: '', date: null, details: '', categories: '' }, // blank
    { row: 10, id: '', date: '', details: '', categories: '16' }, // no date or details
  ];
  rows.hasIdColumn = true;
  const d = diffRows(existing, rows, now);
  assert.equal(d.changed.length, 1);
  assert.equal(d.changed[0].before.id, 'b');
  assert.deepEqual(d.changed[0].after, { ...existing[1], initials: 'CD', details: 'lap chole', cats: ['08', '13', '21'], updatedAt: now });
  assert.deepEqual(d.added.map(caseText), ['KL new', 'AB lscs copy', 'MN']);
  assert.deepEqual(d.added.map(c => c.initials), ['KL', 'AB', 'MN']);
  for (const c of d.added) {
    assert.equal(c.source, 'sheet');
    assert.equal(c.createdAt, now);
    assert.ok(c.id && !['a', 'zzz'].includes(c.id), 'new ids');
  }
  assert.deepEqual(d.added[0].cats, ['18']);
  assert.equal(d.added[0].date, '2026-01-06');
  assert.deepEqual(d.deleted.map(c => c.id), ['d']);
  assert.deepEqual(d.errors.map(e => e.row), [5, 10]);
  assert.match(d.errors[0].message, /tkr\?/);

  // a row with an error keeps its case from being deleted
  const d2 = diffRows(existing, Object.assign([
    { id: 'a', date: '1/1/26', details: 'AB lscs', categories: 'nonsense' },
  ], { hasIdColumn: true }), now);
  assert.deepEqual(d2.deleted.map(c => c.id), ['b', 'c', 'd']);
  assert.equal(d2.errors[0].row, 2, 'row numbers default to index + 2');

  // date fixed for a case that had none: dateText dropped
  const d3 = diffRows(existing, [{ id: 'c', date: '3/1/26', details: 'EF', categories: '99' }], now);
  assert.equal(d3.changed.length, 1);
  assert.equal(d3.changed[0].after.date, '2026-01-03');
  assert.equal('dateText' in d3.changed[0].after, false);
  assert.equal(d3.deleted.length, 3, 'ids in rows imply an id column');

  // no id column: add-only import, nothing deleted
  const d4 = diffRows(existing, Object.assign([{ date: '9/1/26', details: 'OP', categories: '16 , 17' }], { hasIdColumn: false }), now);
  assert.equal(d4.added.length, 1);
  assert.deepEqual(d4.added[0].cats, ['16', '17']);
  assert.equal(d4.deleted.length, 0);
  assert.equal(diffRows(existing, [{ date: '9/1/26', details: 'OP', categories: '' }], now).deleted.length, 0);

  // details whitespace/case differences are not changes
  assert.equal(diffRows(existing, [{ id: 'd', date: '4/1/26', details: ' gh ', categories: '18' }], now).changed.length, 0);
  assert.deepEqual(diffRows([], [], now), { added: [], changed: [], deleted: [], errors: [] });
  // initials + details are compared as one text: an old case (initials in the details) read back from
  // an export, or a new case read back from the single "Case details" column, is unchanged
  const withIni = [{ id: 'n', date: '2026-01-05', initials: 'QR', details: '34F LSCS', cats: ['16'] }];
  assert.equal(diffRows(withIni, [{ id: 'n', date: '5/1/26', details: 'QR 34F LSCS', categories: '16' }], now).changed.length, 0);
  assert.equal(diffRows(withIni, [{ id: 'n', date: '5/1/26', initials: 'QR', details: '34F lscs', categories: '16' }], now).changed.length, 0);
  const moved = diffRows(withIni, [{ id: 'n', date: '5/1/26', details: 'ST 34F LSCS', categories: '16' }], now).changed;
  assert.equal(moved.length, 1);
  assert.equal(moved[0].after.initials, 'ST');
  assert.equal(moved[0].after.details, '34F LSCS');
  // an older case written "QR/34F LSCS" exports as is and splits on upload to the same parts: no change
  const slash = [{ id: 's', date: '2026-01-05', details: 'QR/34F LSCS', cats: ['16'] }];
  assert.equal(diffRows(slash, [{ id: 's', date: '5/1/26', details: 'QR/34F LSCS', categories: '16' }], now).changed.length, 0);
  // common abbreviations at the start are not initials
  for (const w of ['THR', 'TURP', 'EVAR', 'DM', 'HTN', 'PICC']) assert.equal(splitInitials(w + ' for x').initials, '', w);
}

// patient initials
{
  assert.deepEqual(splitInitials('AB 34F LSCS spinal'), { initials: 'AB', details: '34F LSCS spinal' });
  assert.deepEqual(splitInitials('AB/34F LSCS'), { initials: 'AB', details: '34F LSCS' });
  assert.deepEqual(splitInitials('ABCD 5yo tonsil'), { initials: 'ABCD', details: '5yo tonsil' });
  assert.deepEqual(splitInitials('LSCS spinal'), { initials: '', details: 'LSCS spinal' }, 'a case word is not initials');
  assert.deepEqual(splitInitials('TKR left'), { initials: '', details: 'TKR left' });
  assert.deepEqual(splitInitials('VATS lobectomy'), { initials: '', details: 'VATS lobectomy' });
  assert.deepEqual(splitInitials('GA lap chole'), { initials: '', details: 'GA lap chole' });
  assert.deepEqual(splitInitials('ABCDE x'), { initials: '', details: 'ABCDE x' }, '5 letters: not initials');
  assert.deepEqual(splitInitials('A 5yo'), { initials: '', details: 'A 5yo' });
  // the first run of letters is initials in any case, saved in capitals
  assert.deepEqual(splitInitials('Ab 5yo'), { initials: 'AB', details: '5yo' });
  assert.deepEqual(splitInitials('ab 45f\nlap chole'), { initials: 'AB', details: '45f\nlap chole' });
  assert.deepEqual(splitInitials('cd LSCS spinal'), { initials: 'CD', details: 'LSCS spinal' });
  assert.deepEqual(splitInitials('lap chole GA'), { initials: '', details: 'lap chole GA' }, 'lower-case case word');
  assert.deepEqual(splitInitials('the patient'), { initials: '', details: 'the patient' }, 'common word');
  assert.deepEqual(splitInitials('circ caudal'), { initials: '', details: 'circ caudal' }, 'lower-case 4 letters needs an age');
  assert.deepEqual(splitInitials('abcd 45f x'), { initials: 'ABCD', details: '45f x' });
  assert.deepEqual(splitInitials('AB2 x'), { initials: '', details: 'AB2 x' });
  assert.deepEqual(splitInitials('  AB  '), { initials: 'AB', details: '' });
  assert.deepEqual(splitInitials('AB 72M\nlap chole'), { initials: 'AB', details: '72M\nlap chole' });
  assert.deepEqual(splitInitials(''), { initials: '', details: '' });
  assert.equal(cleanInitials(' a.b-c d1 '), 'A.B-CD');
  assert.equal(cleanInitials('x'.repeat(30)).length, 20);
  assert.deepEqual(caseParts({ details: 'AB lap chole' }), { initials: 'AB', details: 'lap chole' }, 'older case: split on the fly');
  assert.deepEqual(caseParts({ initials: '', details: 'AB lap chole' }), { initials: '', details: 'AB lap chole' }, 'stored field wins');
  assert.equal(caseText({ initials: 'AB', details: '34F LSCS' }), 'AB 34F LSCS');
  assert.equal(caseText({ initials: '', details: 'x' }), 'x');
  assert.equal(caseText({ details: 'AB x' }), 'AB x');
  // duplicates look at initials + details together
  assert.deepEqual(duplicates([
    { id: '1', date: '2026-01-01', initials: 'AB', details: 'lscs', cats: ['16'] },
    { id: '2', date: '2026-01-01', details: 'AB lscs', cats: ['16'] },
    { id: '3', date: '2026-01-01', initials: 'CD', details: 'lscs', cats: ['16'] },
  ]), [['1', '2']]);
}

// xlsxio round trip (the vendored ExcelJS browser bundle also loads in Node)
{
  const require = createRequire(import.meta.url);
  globalThis.ExcelJS = require('../../nuh-roster/vendor/exceljs.min.js');
  const { exportCases, readCasesSheet, exportTotals } = await import('../js/xlsxio.js');
  const cases = [
    { id: 'k2', date: '2026-02-03', details: 'AB lscs spinal', cats: ['17', '16'], createdAt: 2 },
    { id: 'k1', date: '2026-01-31', details: 'CD 5yo T&A', cats: ['20iii', '20', '10'], createdAt: 1 },
    { id: 'k3', date: null, dateText: 'Feb?', details: 'EF ESP', cats: ['26', '26iii'], createdAt: 3 },
  ];
  const blob = await exportCases(cases, { name: 'Test Resident', rYear: 2 });
  assert.ok(blob instanceof Blob && blob.size > 1000);
  const rows = await readCasesSheet(blob);
  assert.equal(rows.hasIdColumn, true);
  assert.deepEqual(rows.map(r => r.id), ['k1', 'k2', 'k3'], 'oldest first, undated last');
  assert.equal(rows[0].categories, `${BY_CODE['10'].label}, ${BY_CODE['20'].label}, ${BY_CODE['20iii'].label}`);
  assert.equal(parseDate(rows[0].date), '2026-01-31');
  assert.equal(rows[2].date, 'Feb?');
  const d = diffRows(cases, rows);
  assert.deepEqual(d, { added: [], changed: [], deleted: [], errors: [] }, 'an untouched export round-trips with no changes');
  // cases with their own initials field: one "Case details" column (initials + details), split again on the way back
  const withIni = [...cases, { id: 'k4', date: '2026-02-04', initials: 'GH', details: '34F LSCS', cats: ['16'], createdAt: 4 }, { id: 'k5', date: '2026-02-04', initials: '', details: 'LSCS spinal', cats: ['16'], createdAt: 5 }];
  const irows = await readCasesSheet(await exportCases(withIni));
  assert.equal(irows.find(r => r.id === 'k4').details, 'GH 34F LSCS');
  assert.equal('initials' in irows[0], false, 'no Initials column in the export');
  assert.deepEqual(diffRows(withIni, irows), { added: [], changed: [], deleted: [], errors: [] });
  // an Initials column of its own is used directly
  const iwb = new globalThis.ExcelJS.Workbook();
  const iws = iwb.addWorksheet('Sheet1');
  iws.addRow(['Date', 'Initials', 'Case details', 'Categories']);
  iws.addRow(['4/2/26', 'mn', 'OP lscs', '16']);
  const icol = await readCasesSheet(new Blob([await iwb.xlsx.writeBuffer()]));
  assert.equal(icol[0].initials, 'mn');
  const ia = diffRows([], icol).added[0];
  assert.equal(ia.initials, 'MN');
  assert.equal(ia.details, 'OP lscs');

  // summary sheet
  const wb = new globalThis.ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  const sum = wb.getWorksheet('Summary');
  const vals = [];
  sum.eachRow((row) => vals.push(row.values.slice(1)));
  const header = vals.findIndex(v => v[0] === 'Category');
  assert.deepEqual(vals[header], ['Category', 'Count', 'R3', 'R5', 'Status']);
  const lscs = vals.find(v => v[0] === BY_CODE['16'].label);
  assert.deepEqual(lscs, [BY_CODE['16'].label, 1, 10, 20, '🟡']);
  assert.equal(wb.getWorksheet('Cases').getColumn(4).hidden, true);
  const late = await exportCases([], { progressRows: progress({ 13: 20, 16: 1 }, 4) });
  const wb2 = new globalThis.ExcelJS.Workbook();
  await wb2.xlsx.load(await late.arrayBuffer());
  const v2 = [];
  wb2.getWorksheet('Summary').eachRow(row => v2.push(row.values.slice(1)));
  assert.equal(v2.find(v => v[0] === BY_CODE['13'].label)[4], '🟢');
  assert.equal(v2.find(v => v[0] === BY_CODE['16'].label)[4], '🔴');

  // a plain sheet without an id column, headers in other places/orders
  const plain = new globalThis.ExcelJS.Workbook();
  const ws = plain.addWorksheet('Sheet1');
  ws.addRow(['My logbook']);
  ws.addRow([]);
  ws.addRow(['Categories', 'Initials,  Case Details', 'Date']);
  ws.addRow(['16, 17', 'GH lscs', '4/2/26']);
  ws.addRow(['LSCS', 'IJ lscs', new Date(Date.UTC(2026, 1, 5))]);
  ws.addRow([]);
  ws.addRow(['nope', 'KL', 45700]);
  const prows = await readCasesSheet(new Blob([await plain.xlsx.writeBuffer()]));
  assert.equal(prows.hasIdColumn, false);
  assert.equal(prows.length, 3);
  assert.equal('id' in prows[0], false);
  assert.equal(prows[2].row, 7);
  const pd = diffRows(cases, prows);
  assert.equal(pd.added.length, 2);
  assert.equal(pd.deleted.length, 0);
  assert.deepEqual(pd.errors, [{ row: 7, message: 'Unknown category: nope' }]);
  assert.deepEqual(pd.added.map(c => c.date), ['2026-02-04', '2026-02-05']);

  // no matching sheet
  const empty = new globalThis.ExcelJS.Workbook();
  empty.addWorksheet('x').addRow(['a', 'b']);
  await assert.rejects(readCasesSheet(await empty.xlsx.writeBuffer()), /Could not find/);

  // totals, both input shapes
  const t1 = await exportTotals({ title: 'AY2024 totals', columns: ['Resident A', 'Resident B'], rows: [
    { label: BY_CODE['16'].label, values: [3, 12], statuses: ['late', 'done'] },
    { label: 'Reflections', values: [1, 2] },
  ] });
  const t2 = await exportTotals([['Category', 'A'], ['16', 1], ['Grand Total', 1]]);
  for (const b of [t1, t2]) {
    const w = new globalThis.ExcelJS.Workbook();
    await w.xlsx.load(await b.arrayBuffer());
    assert.ok(w.getWorksheet('Totals'));
  }
  const w1 = new globalThis.ExcelJS.Workbook();
  await w1.xlsx.load(await t1.arrayBuffer());
  assert.deepEqual(w1.getWorksheet('Totals').getRow(3).values.slice(1), ['Category', 'Resident A', 'Resident B']);
  assert.deepEqual(w1.getWorksheet('Totals').getRow(4).values.slice(1), [BY_CODE['16'].label, 3, 12]);
}

// "12 Mar 65 year old man": 65 is an age, not 2065; procedure abbreviations aren't initials
{
  const now = new Date(2026, 2, 15, 9);
  const a = parseBulk('12 Mar 65 year old man TKR', null, now)[0];
  assert.equal(a.date, '2026-03-12'); assert.match(a.details, /^65 year old man TKR/);
  const b = parseBulk('3 Jan 80 yr F hip', null, now)[0];
  assert.equal(b.date, '2026-01-03'); assert.match(b.details, /^80 yr F hip/);
  assert.equal(parseBulk('12 Mar 26 AB TKR', null, now)[0].date, '2026-03-12');
  for (const w of ['PEG', 'LP', 'ICD', 'EBL']) assert.equal(splitInitials(`${w} insertion`).initials, '', w);
  assert.equal(splitInitials('IJ 60M VATS DLT').initials, 'IJ');
  assert.equal(splitInitials('TKR spinal').initials, '');
  // a blank line starts a new case; lines without one stay in the same case; list markers dropped
  const two = parseBulk('1. AB 45F\nlap chole GA\n\n2. CD 30F\nLSCS spinal', null, now);
  assert.deepEqual(two.map(c => [c.initials, c.details]), [['AB', '45F\nlap chole GA'], ['CD', '30F\nLSCS spinal']]);
}

// date words in search (Sat 10 Oct 2026)
{
  const { dateWindow } = await import('../js/engine.js');
  const now = new Date(2026, 9, 10, 9);
  assert.deepEqual(dateWindow('today', now), { from: '2026-10-10', to: '2026-10-10', rest: '' });
  assert.deepEqual(dateWindow('last tuesday', now), { from: '2026-10-06', to: '2026-10-06', rest: '' });
  assert.deepEqual(dateWindow('LSCS this week', now), { from: '2026-10-05', to: '2026-10-10', rest: 'lscs' });
  assert.deepEqual(dateWindow('last week', now), { from: '2026-09-28', to: '2026-10-04', rest: '' });
  assert.deepEqual(dateWindow('last month', now), { from: '2026-09-01', to: '2026-09-30', rest: '' });
  assert.deepEqual(dateWindow('sat', now), { from: '2026-10-10', to: '2026-10-10', rest: '' });
  assert.deepEqual(dateWindow('last sat', now), { from: '2026-10-03', to: '2026-10-03', rest: '' });
  assert.equal(dateWindow('lap chole', now), null);
  assert.equal(dateWindow('monitoring', now), null);
  assert.equal(dateWindow('wednesday', now).from, '2026-10-07');
  assert.equal(dateWindow('thurs', now).from, '2026-10-08');
}

console.log('engine tests passed');
