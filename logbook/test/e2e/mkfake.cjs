// Fake old-form workbook with the real tab/column layout. Fake people only.
const ExcelJS = require(require('path').join(__dirname, '../../vendor/exceljs.min.js'));
(async () => {
  const wb = new ExcelJS.Workbook();
  const c = wb.addWorksheet('Case');
  c.addRow(['Resident', 'Date', 'Initials,  Case Details', 'Category', 'Neurosurgical procedure (15 | 15)', 'Paediatric Surgery (125 | 155)', 'Peripheral nerve blocks (R2=10 | R3=20 | R4=30 | R5=40)', 'Timestamp', 'Email Address']);
  const A = 'Fake Alpha (209901)', B = 'Fake Beta (209902)';
  const d = s => new Date(s + 'T00:00:00Z');
  const rows = [
    [A, d('2026-09-02'), 'ZZ 5yo tonsillectomy', '10) ENT (5 | 10), 20) Paediatric Surgery (125 | 155)', null, '20iii) Age 4 to 12 years (100 | 100)', null, new Date('2026-09-02T10:00:00Z'), ''],
    [A, d('2026-09-03'), 'YY 30F LSCS spinal', '16) Lower Segment Caesarean Section (10 | 20), 17) Obstetrics Spinal/ Epidural/ CSE (10 | 40)', null, null, null, new Date('2026-09-03T10:00:00Z'), ''],
    [A, '31/6/24', 'XX lap chole', '08) Laparoscopic surgery (5 | 10), 13) General Surgery (20 | 20)', null, null, null, new Date('2026-09-04T10:00:00Z'), ''],
    [B, d('2026-09-05'), 'WW 70M TKR ACB', '18) Orthopaedic Surgery (20 | 20), 26) Peripheral nerve blocks (R2=10 | R3=20 | R4=30 | R5=40)', null, null, '26ii) Lower limb blocks (10 | 10)', new Date('2026-09-05T10:00:00Z'), ''],
    [B, d('2026-09-06'), 'VV craniotomy', '15) Neurosurgical procedure (15 | 15)', '15i) Emergency neurosurgery (10 | 10)', null, null, new Date('2026-09-06T10:00:00Z'), ''],
  ];
  for (const r of rows) c.addRow(r);
  // the importer reads whatever label text is in the sheet; check what labels it expects
  const t = wb.addWorksheet('AY2099 Totals');
  t.addRow(['Category', A, B]);
  const { CATEGORIES } = await import(require('url').pathToFileURL(require('path').join(__dirname, '../../js/categories.js')).href);
  const cnt = { [A]: { '10': 1, '20': 1, '20iii': 1, '16': 1, '17': 1, '08': 1, '13': 1 }, [B]: { '18': 1, '26': 1, '26ii': 1, '15': 1, '15i': 0 /* deliberate mismatch */ } };
  for (const k of CATEGORIES.filter(x => !x.retired)) t.addRow([k.label, cnt[A][k.code] || null, cnt[B][k.code] || null]);
  t.addRow(['Grand Total', 7, 4]);
  require('fs').writeFileSync(process.argv[2] || require('os').tmpdir() + '/logbook-e2e/fake-old-form.xlsx', Buffer.from(await wb.xlsx.writeBuffer()));
  console.log('ok');
})();
