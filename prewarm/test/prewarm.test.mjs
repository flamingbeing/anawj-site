// Run with: node prewarm/test/prewarm.test.mjs  (fake data only)
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { HEADERS, SECTIONS, SCREENING_HEADERS } from '../js/headers.js';
import { FIELDS, BY_ID, PAGES, SCREENING, colLetter, colIndex, calc, normaliseTemp, isShown } from '../js/schema.js';
import { newRecord, setVal, val, mergeRecord, mergeInto, packFile, readFile } from '../js/store.js';
import { workbook, workbookSheets, cellFor, ixText } from '../js/export.js';
import { dateSerial, timeSerial } from '../js/xlsx.js';

// schema lines up with the template, column for column
assert.equal(FIELDS.length, HEADERS.length, 'one field per template column');
assert.equal(new Set(FIELDS.map(f => f.id)).size, FIELDS.length, 'field ids are unique');
assert.equal(SCREENING.length, SCREENING_HEADERS.length);
const at = id => colLetter(BY_ID[id].colIndex);
const anchors = {
  screen_id: ['A', /^Screening ID/], enrol_id: ['B', /^Enrollment ID/], sex: ['G', /^Gender/], smoker: ['L', /^Smoker/],
  ihd_mi: ['U', /previous MI\(0-yes; 1-no\)/], csurg_proc: ['AE', /surgical procedure/], asp: ['AF', /^Aspirin/],
  warf: ['AJ', /^Warfarin\(0-yes; 1-no\)/], pre_hb: ['AR', /^Haemoglobin/], pre_ecg: ['BA', /^ECG/], pre_dl: ['BB', /^Downloaded/],
  arm: ['BC', /^Randomisation/], prewarm_0_core: ['BF', /^0min - Core/], prewarm_40_ts: ['DP', /^Thermal Sensation/],
  io_flip: ['DQ', /flipped/], io_ix: ['EM', /^Intraoperative Investigations/], iotemp_base_core: ['EN', /^Baseline Core/],
  iotemp_75_core: [null, /^75min \nCore/], iotemp_end_room: [null, /^End of Surgery\nRoom Temp/],
  haemo_base_sbp: ['OB', /^Baseline \nSystolic BP/], haemo_end_bis: ['SG', /^End of Surgery \nBIS/], pacu_in: ['SH', /PACU arrival/],
  pacu_delay_why: ['SR', /why\?/], d1_drain: ['SS', /^Blood loss/], d1_pcm: ['TD', /^Paracetamol/], d1_tram_dose: ['TM', /dosage/],
  sat_pre: ['TN', /preoperative period/], sat_post: ['TO', /postoperative period/], d2_dl: ['TY', /^Downloaded/],
  d2_pcm: ['UB', /^Paracetamol/], dc_hai: ['UL', /^Hospital Acquired Infection/], dc_mace: ['UO', /^Major Adverse Cardiac Event/],
  dc_icu: ['UT', /^Unplanned ICU/], dc_icu2: ['UV', /^Unplanned ICU/], dc_cost: ['UZ', /^Hospitalization Costs/],
};
for (const [id, [col, re]] of Object.entries(anchors)) {
  assert.ok(BY_ID[id], id + ' exists');
  if (col) assert.equal(at(id), col, id + ' column');
  assert.match(HEADERS[BY_ID[id].colIndex], re, id + ' header');
}
// each page's first field starts its template section
for (const p of PAGES) {
  const first = BY_ID[p.fields[0].id].colIndex;
  const [, a, b] = SECTIONS[p.section];
  assert.ok(first >= colIndex(a) && first <= colIndex(b), p.id + ' is inside ' + SECTIONS[p.section][0]);
}
// coded fields offer exactly the codes the template's dropdowns allow (where it has one)
assert.deepEqual(BY_ID.smoker.opts.map(o => o[0]), [0, 1, 2, 3]);
assert.deepEqual(BY_ID.dc_mace.opts.map(o => o[0]), [0, 1, 2, 3, 4, 5]);
assert.deepEqual(BY_ID.pre_ecg.opts.map(o => o[0]), [0, 1, 2]);
// show conditions point at earlier fields
for (const f of FIELDS) if (f.show) assert.ok(BY_ID[f.show.f] && BY_ID[f.show.f].colIndex < BY_ID[f.id].colIndex, f.id + ' show');

assert.equal(colLetter(0), 'A'); assert.equal(colLetter(25), 'Z'); assert.equal(colLetter(26), 'AA'); assert.equal(colLetter(571), 'UZ');
assert.equal(colIndex('UZ'), 571);

// helpers
assert.equal(calc('bmi', id => ({ wt: '70', ht: '175' })[id]), 22.9);
assert.equal(calc('bmi', id => ({ wt: '70', ht: '1.75' })[id]), 22.9);
assert.equal(calc('bmi', id => ({ wt: '70' })[id]), null);
assert.equal(calc('txa', id => ({ io_txa_bolus: '1000', io_txa_inf: '500' })[id]), 1500);
assert.equal(calc('map', id => ({ sbp: '120', dbp: '60' })[id]), 80);
assert.equal(normaliseTemp('365'), '36.5');
assert.equal(normaliseTemp('36,5'), '36.5');
assert.equal(normaliseTemp('120'), '120');
assert.equal(isShown(BY_ID.ihd_mi_years, id => ({ ihd_mi: 0 })[id]), true);
assert.equal(isShown(BY_ID.ihd_mi_years, id => ({ ihd_mi: 1 })[id]), false);

// records and merging
{
  const a = newRecord(1000);
  assert.equal(setVal(a, 'age', 64, 'A', 2000), true);
  assert.equal(setVal(a, 'age', 64, 'A', 2100), false, 'same value is not an edit');
  setVal(a, 'sex', 1, 'A', 2000);
  const b = { ...a, f: { ...a.f } };
  setVal(b, 'age', 65, 'B', 3000);  // B corrects age later
  setVal(a, 'sex', null, 'A', 4000); // A clears sex later still
  setVal(b, 'wt', 70, 'B', 3500);
  const m1 = mergeRecord(a, b).rec, m2 = mergeRecord(b, a).rec;
  assert.deepEqual(m1.f, m2.f, 'merging is the same either way round');
  assert.equal(val(m1, 'age'), 65); assert.equal(val(m1, 'sex'), null); assert.equal(val(m1, 'wt'), 70);
  assert.equal(mergeRecord(m1, m1).changed, 0, 'merging a copy changes nothing');
  // clock behind: an edit still lands after the value it replaces
  const c = newRecord(); setVal(c, 'age', 1, '', 5000); setVal(c, 'age', 2, '', 100);
  assert.ok(c.f.age.t > 5000);
}
{
  // the same patient entered on two phones merges by Screening ID
  const a = newRecord(1); setVal(a, 'screen_id', 'SBH001', 'A', 10); setVal(a, 'age', 50, 'A', 10);
  const b = newRecord(2); setVal(b, 'screen_id', 'sbh001 ', 'B', 20); setVal(b, 'wt', 80, 'B', 20);
  const other = newRecord(3); setVal(other, 'screen_id', 'SBH002', 'B', 20);
  const { map, added, updated } = mergeInto({ [a.id]: a }, [b, other], ['screen_id', 'enrol_id']);
  assert.equal(Object.keys(map).length, 2); assert.equal(added, 1); assert.equal(updated, 1);
  assert.equal(val(map[a.id], 'wt'), 80); assert.equal(val(map[a.id], 'age'), 50);
  // deleting travels
  const del = { ...map[a.id], deleted: 99 };
  assert.equal(mergeInto(map, [del], ['screen_id']).map[a.id].deleted, 99);
  // junk is ignored
  assert.equal(mergeInto(map, [null, { id: 5 }], []).added, 0);
}
{
  // shared files leave out initials
  const s = newRecord(); setVal(s, 'id', 'SBH001'); setVal(s, 'initials', 'XY');
  const file = JSON.stringify(packFile({ patients: [], screening: [s] }, ['initials'], 'tester'));
  assert.ok(!file.includes('XY'));
  const back = readFile(file);
  assert.equal(val(back.screening[0], 'id'), 'SBH001');
  assert.throws(() => readFile('{"kind":"other"}'));
  assert.throws(() => readFile('not json'));
}

// export
assert.equal(dateSerial('2026-10-12'), 46307);
assert.equal(timeSerial('06:00'), 0.25);
assert.deepEqual(cellFor(BY_ID.op_date, '2026-10-12'), { v: 46307, fmt: 'date' });
assert.deepEqual(cellFor(BY_ID.pw_start, 'NA'), 'NA');
assert.equal(cellFor(BY_ID.sex, 0), 0);
assert.equal(cellFor(BY_ID.wt, '70.5'), 70.5);
assert.equal(cellFor(BY_ID.io_tech, 'TIVA'), 'TIVA');
assert.equal(cellFor(BY_ID.age, ''), null);
{
  const p = newRecord(); setVal(p, 'enrol_id', 'E2'); setVal(p, 'sex', 0); setVal(p, 'iotemp_end_room', '21.5'); setVal(p, 'dc_cost', 12000);
  const q = newRecord(); setVal(q, 'enrol_id', 'E10');
  const gone = newRecord(); setVal(gone, 'enrol_id', 'E1'); gone.deleted = 1;
  const [data, scr] = workbookSheets([q, p, gone], []);
  assert.equal(data.rows.length, 4, 'section row, header row, two live patients');
  assert.equal(data.rows[2][1], 'E2', 'sorted by Enrollment ID, numbers in order');
  assert.equal(data.rows[2][colIndex('G')], 0);
  assert.equal(data.rows[2][BY_ID.iotemp_end_room.colIndex], 21.5);
  assert.equal(data.rows[2][colIndex('UZ')], 12000);
  assert.equal(data.merges.length, 12);
  assert.equal(scr.rows.length, 1);
  // readings sheet: one row per saved timepoint, with the exact time and who saved it
  setVal(p, 'prewarm_5_core', '36.5', 'AB'); setVal(p, 'at_prewarm_5', '08:12', 'AB');
  const [, , rd, ex] = workbookSheets([p], []);
  assert.equal(rd.rows.length, 3, 'the 5-min pre-warming reading and the end-of-surgery room temp');
  assert.deepEqual(rd.rows[1].slice(0, 3), ['E2', 'Pre-warming', '5 min']);
  assert.match(rd.rows[1][5], /Core 36.5/);
  assert.equal(ex.rows[0][0].s, 'Subject ID');
  // investigation rows go in the template's one cell as text
  setVal(p, 'io_ix_rows', JSON.stringify([{ time: '10:30', hb: '9.8', test: 'ROTEM', ct: '60' }]));
  assert.equal(workbookSheets([p], [])[0].rows[2][BY_ID.io_ix.colIndex], '10:30, Hb 9.8, ROTEM, CT or R 60');
  assert.equal(ixText('not json'), '');
  assert.equal(calc('nudesc', id => ({ nd_dis: 1, nd_beh: 2 })[id]), 3);

  // the file is a valid zip whose sheet carries the values
  const bytes = workbook([p], []);
  const text = unzip(bytes);
  assert.deepEqual(Object.keys(text).sort(), ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml', 'xl/worksheets/sheet4.xml']);
  assert.match(text['xl/worksheets/sheet1.xml'], /<c r="UZ3"><v>12000<\/v><\/c>/);
  assert.match(text['xl/worksheets/sheet1.xml'], /<mergeCell ref="A1:AE1"\/>/);
  assert.match(text['xl/workbook.xml'], /name="Screening Number"/);
}

function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = {};
  let o = 0;
  while (dv.getUint32(o, true) === 0x04034b50) {
    const method = dv.getUint16(o + 8, true), size = dv.getUint32(o + 18, true), nl = dv.getUint16(o + 26, true), xl = dv.getUint16(o + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(o + 30, o + 30 + nl));
    let data = bytes.subarray(o + 30 + nl + xl, o + 30 + nl + xl + size);
    if (method === 8) data = inflateRawSync(data);
    out[name] = new TextDecoder().decode(data);
    o += 30 + nl + xl + size;
  }
  return out;
}

console.log('prewarm: ok');
