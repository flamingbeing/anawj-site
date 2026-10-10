// Run with: node logbook/test/portfolio.test.mjs  (made-up reflections only)
// Optional: PORTFOLIO_TEMPLATE=blank.docx PORTFOLIO_OUT=out.docx also fills a real blank template.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { REFLECTION_HEADINGS } from '../js/categories.js';
import { printLayoutSettings, stripComments, fillDocumentXml, plainDocumentXml, exportPortfolio, rowCells, esc, fmtDate, caseRYear, countsByYear, fillSummaryXml, placeInSlots, dateRuns, ordinal, imageSize, ensureNamespaces } from '../js/portfolio.js';

const JSZip = createRequire(import.meta.url)('../vendor/jszip.min.js');

const R = (o) => ({ id: Math.random().toString(36).slice(2), subId: null, jr: false, status: 'complete', caseId: null,
  createdAt: 1, updatedAt: 1, sections: {}, ...o });
const refl = [
  R({ headingId: 'thyroid', initials: 'AB', date: '2025-03-04', jr: true, diagnosis: 'Total thyroidectomy',
    sections: { description: 'ASA 2 made-up patient\nSecond line', thoughts: 'Felt <ok> & fine', action: 'Read more', further: '' } }),
  R({ headingId: 'thyroid', initials: 'CD', date: '2024-12-01', diagnosis: 'Hemithyroidectomy', sections: { description: 'Earlier case' } }),
  R({ headingId: 'regional', subId: 'ul', initials: 'EF', date: '2025-01-02', diagnosis: 'Interscalene block', sections: { description: 'Block' } }),
  ...Array.from({ length: 7 }, (_, i) => R({ headingId: 'paeds', initials: 'P' + i, date: `2025-02-0${i + 1}`, diagnosis: 'Circumcision' })),
];

assert.equal(esc('a<b>&"c'), 'a&lt;b&gt;&amp;&quot;c');
assert.equal(fmtDate('2025-03-04'), '04/03/25');
const cells = rowCells(refl[0]);
assert.deepEqual(cells[1].map(p => p.map(x => x[0]).join('')), ['JR', '4th Mar 2025']);
assert.deepEqual(cells[1][1][1], ['th', { sup: true }], 'ordinal suffix is superscript');
assert.deepEqual(rowCells(refl[0], 3)[0].map(p => p[0][0]), ['3.', 'AB'], 'row number then initials');
const ords = { 1: 'st', 2: 'nd', 3: 'rd', 4: 'th', 11: 'th', 12: 'th', 13: 'th', 21: 'st', 22: 'nd', 23: 'rd', 31: 'st', 111: 'th' };
for (const [d, o] of Object.entries(ords)) assert.equal(ordinal(Number(d)), o, 'ordinal ' + d);
assert.equal(dateRuns('2024-12-21').map(x => x[0]).join(''), '21st Dec 2024');
assert.equal(dateRuns('2025-01-02').map(x => x[0]).join(''), '2nd Jan 2025');
assert.equal(dateRuns('2025-06-13').map(x => x[0]).join(''), '13th Jun 2025');
assert.equal(dateRuns(null).map(x => x[0]).join(''), '');
assert.ok(cells[3].some(p => p[0][0] === 'Case description' && p[0][1] === true));
assert.ok(!cells[3].some(p => p[0][0] === 'Further reflection as SR'), 'empty optional section skipped');
assert.equal(rowCells(refl[2])[2][0][0][0], 'Upper limb block');

// a tiny synthetic "template": heading paragraph + table (header + one empty prototype row) per heading
const P = t => `<w:p><w:pPr><w:pStyle w:val="Heading5"/></w:pPr><w:r><w:t>${esc(t)}</w:t></w:r></w:p>`;
const tc = t => `<w:tc><w:tcPr><w:tcW w:w="100" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="left"/></w:pPr>${t ? `<w:r><w:t>${t}</w:t></w:r>` : ''}</w:p></w:tc>`;
const table = `<w:tbl><w:tblPr/><w:tr>${['Patient’s Initials', 'Date', 'Diagnosis/ Operations', 'Case details'].map(tc).join('')}</w:tr><w:tr>${[0, 0, 0, 0].map(() => tc('')).join('')}</w:tr></w:tbl>`;
const fake = `<w:document><w:body><w:p><w:r><w:t>Resident’s name : ________________</w:t></w:r></w:p>${
  REFLECTION_HEADINGS.map(hd => P(`${hd.name.split(' e.g.')[0]} (Min ${hd.min})`) + table).join('')}${P('Transplant surgery (optional)')}${table}</w:body></w:document>`;
const { xml, matched } = fillDocumentXml(fake, refl, { name: 'Test Resident' });
assert.equal(matched.length, REFLECTION_HEADINGS.length, 'every heading table found');
assert.ok(xml.includes('Resident’s name : Test Resident'));
assert.ok(xml.includes('Felt &lt;ok&gt; &amp; fine'));
const rowsOf = x => (x.match(/<w:tr>/g) || []).length;
const total = REFLECTION_HEADINGS.reduce((n, hd) => n + 1 + Math.max(hd.min, refl.filter(r => r.headingId === hd.id).length), 0) + 2;
assert.equal(rowsOf(xml), total, 'min rows per table, more when needed; transplant table untouched');
assert.ok(xml.indexOf('CD') < xml.indexOf('AB'), 'rows in date order');

const plain = plainDocumentXml(refl, { name: 'Test Resident' });
assert.ok(plain.includes('Bariatric Surgery (Min 3)') && plain.includes('Felt &lt;ok&gt;'));

const blob = await exportPortfolio(refl, { name: 'Test Resident', JSZip });
assert.equal(blob.usedTemplate, false);
const z = await JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer()));
assert.ok((await z.file('word/document.xml').async('string')).includes('Paediatrics (Min 6)'));
if (process.env.PLAIN_OUT) writeFileSync(process.env.PLAIN_OUT, new Uint8Array(await blob.arrayBuffer()));

if (process.env.PORTFOLIO_TEMPLATE) {
  const b64 = readFileSync(process.env.PORTFOLIO_TEMPLATE).toString('base64');
  const out = await exportPortfolio(refl, { name: 'Test Resident', templateB64: b64, JSZip });
  assert.equal(out.usedTemplate, true);
  if (process.env.PORTFOLIO_OUT) writeFileSync(process.env.PORTFOLIO_OUT, new Uint8Array(await out.arrayBuffer()));
}

// Section 4: the resident's own counts replace the minimum numbers
assert.equal(caseRYear('2024-07-01', 2024), 1);
assert.equal(caseRYear('2025-06-30', 2024), 1);
assert.equal(caseRYear('2025-07-01', 2024), 2);
assert.equal(caseRYear('2031-01-01', 2024), 5, 'clamped to R5');
assert.equal(caseRYear(null, 2024), null);
{
  const cases = [
    { date: '2024-08-01', cats: ['20', '20iii'] }, { date: '2025-08-01', cats: ['20'] }, { date: null, cats: ['20', '20'] },
    { date: '2025-09-01', cats: ['15i'] },
  ];
  const c = countsByYear(cases, 2024);
  assert.deepEqual(c['20'], { total: 3, 1: 1, 2: 1 });
  assert.deepEqual(c['20iii'], { total: 1, 1: 1 });
  const tc = t => `<w:tc><w:tcPr/><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const tr = cells => `<w:tr>${cells.map(tc).join('')}</w:tr>`;
  const xml = `<w:tbl>${tr(['Posting period', 'Number of cases', 'Total Number'])}${tr(['', 'R1', 'R2', 'R3', 'R4', 'R5', ''])}`
    + `${tr(['20) Paediatric Surgery (EPA 9)', '', '', 'Total - 125', '', 'Total - 155', ''])}${tr(['15 i) Emergency neurosurgery (EPA2)', '', '', '10', '', '', ''])}`
    + `${tr(['Supervisor’s signature', '', '', '', '', '', ''])}</w:tbl>`;
  const { xml: out, rows } = fillSummaryXml(xml, cases, { intake: 2024, rYear: 2 });
  assert.equal(rows, 2);
  const texts = r => (r.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, ''));
  const trs = out.match(/<w:tr>[\s\S]*?<\/w:tr>/g);
  assert.deepEqual(texts(trs[2]), ['20) Paediatric Surgery (EPA 9)', '1', '1', '', '', '', '3'], 'years not reached are blank; minimums gone');
  assert.deepEqual(texts(trs[3]), ['15 i) Emergency neurosurgery (EPA2)', '0', '1', '', '', '', '1']);
  assert.ok(!out.includes('Total - 125') && !out.includes('>10<'));
  assert.deepEqual(texts(trs[4])[0], 'Supervisor’s signature');
  const noIntake = fillSummaryXml(xml, cases, {}).xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g);
  assert.deepEqual(texts(noIntake[2]), ['20) Paediatric Surgery (EPA 9)', '', '', '', '', '', '3'], 'no intake: total only');
}

// ---------- structured (resident-style) reflections ----------
// a 1x1 red PNG (made up)
const PNG1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const S1 = R({ headingId: 'thyroid', initials: 'GH', date: '2024-12-21', jr: true, diagnosis: 'Total thyroidectomy\nRetrosternal goitre',
  title: 'Airway plan for a made-up goitre', summary: 'Made-up summary line one.\n\nSecond paragraph.',
  points: [{ heading: 'Awake versus asleep', text: 'Point one text.' }, { heading: '', text: '' }, { heading: 'Extubation', text: 'Point three text.\nMore.' }],
  figures: [{ id: 'img1', caption: 'A red square', point: 0 }, { id: 'img2', caption: 'Missing picture', point: null }],
  references: ['Author A. A made-up paper. 2020.', '2. Author B. Another. 2021.'] });
{
  const c = rowCells(S1, 1);
  const txt = c[3].map(p => (Array.isArray(p) ? p.map(x => x[0]).join('') : '[img:' + p.image + ']'));
  assert.deepEqual(txt, ['Airway plan for a made-up goitre', '', 'Made-up summary line one.', '', 'Second paragraph.', '', 'Learning Points',
    '1. Awake versus asleep', 'Point one text.', '[img:img1]', 'Figure 1: A red square',
    '', '2. Extubation', 'Point three text.', 'More.', '[img:img2]', 'Figure 2: Missing picture',
    '', 'References', '1. Author A. A made-up paper. 2020.', '2. Author B. Another. 2021.']);
  assert.equal(c[3][0][0][1], true, 'title bold');
  assert.deepEqual(c[3][7][0][1], { u: true }, 'learning point heading underlined');
  assert.deepEqual(c[2].map(p => p[0][0]), ['Total thyroidectomy', 'Retrosternal goitre']);
  assert.deepEqual(imageSize(200, 100), [2194560, 1097280]);
  assert.deepEqual(imageSize(100, 1000), [Math.round(3200400 / 10), 3200400], 'tall images capped at 3.5 in');
  assert.ok(ensureNamespaces('<w:document xmlns:w="x" xmlns:r="y">').includes('xmlns:pic='));
  assert.equal((ensureNamespaces('<w:document xmlns:w="x" xmlns:r="y">').match(/xmlns:r=/g) || []).length, 1);

  // numbering ignores pre-printed empty slots: slot 1 asks for JR, slot 2 is plain
  const hd = REFLECTION_HEADINGS.find(x => x.id === 'thyroid');
  const row = (a, b) => `<w:tr>${[a, b, '', ''].map(tc).join('')}</w:tr>`;
  const rows = placeInSlots(hd, [row('', 'JR'), row('', ''), row('', '')], [R({ headingId: 'thyroid', initials: 'ZZ', date: '2025-01-01', diagnosis: 'x' })]);
  assert.ok(rows[0].includes('>JR<') && !rows[0].includes('ZZ'), 'JR slot keeps its prompt');
  assert.ok(rows[1].includes('>1.<') && rows[1].includes('ZZ'), 'first filled row is 1.');
  const rows2 = placeInSlots(hd, [row('', 'JR'), row('', '')], [S1, R({ headingId: 'thyroid', initials: 'YY', date: '2025-01-01' }), R({ headingId: 'thyroid', initials: 'XX', date: '2025-02-01' })]);
  assert.deepEqual(rows2.map(r => (r.match(/>(\d+)\.</) || [])[1]), ['1', '2', '3']);

  // the export embeds the picture (rels, content type, media file, inline drawing); the missing one is skipped
  const all = [...refl, S1];
  for (const templ of [false, true]) {
    let templateB64 = null;
    if (templ) {
      const tz = new JSZip();
      tz.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
      tz.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="styles.xml"/></Relationships>');
      tz.file('word/document.xml', fake.replace('<w:document>', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'));
      templateB64 = Buffer.from(await tz.generateAsync({ type: 'uint8array' })).toString('base64');
    }
    const b = await exportPortfolio(all, { JSZip, templateB64, images: { img1: { data: PNG1, mime: 'image/png', w: 1, h: 1 } } });
    assert.equal(b.usedTemplate, templ);
    const zz = await JSZip.loadAsync(new Uint8Array(await b.arrayBuffer()));
    const doc = await zz.file('word/document.xml').async('string');
    const rels = await zz.file('word/_rels/document.xml.rels').async('string');
    const ct = await zz.file('[Content_Types].xml').async('string');
    assert.equal((doc.match(/<w:drawing>/g) || []).length, 1, 'one picture (img2 has no data)');
    assert.ok(/<wp:inline[\s\S]*<wp:extent cx="2194560" cy="2194560"\/>[\s\S]*r:embed="rIdApmesImg1"/.test(doc));
    for (const p of ['wp', 'a', 'pic', 'r']) assert.ok(new RegExp(`<w:document[^>]*xmlns:${p}=`).test(doc), 'namespace ' + p);
    assert.ok(rels.includes('Id="rIdApmesImg1"') && rels.includes('Target="media/image1.png"'));
    assert.ok(/Extension="png" ContentType="image\/png"/.test(ct) && /Extension="jpeg"/.test(ct));
    assert.deepEqual([...(await zz.file('word/media/image1.png').async('uint8array'))], [...Buffer.from(PNG1, 'base64')]);
    assert.ok(doc.includes('<w:u w:val="single"/>') && doc.includes('<w:vertAlign w:val="superscript"/>'));
    assert.ok(doc.includes('Figure 1: A red square') && doc.includes('>Learning Points<'));
    assert.ok(doc.includes('Felt &lt;ok&gt; &amp; fine'), 'legacy reflection still uses its sections');
  }
}

// comments are removed, the text around them is kept
{
  const x = '<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>Keep me</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r></w:p>';
  const y = stripComments(x);
  assert.ok(y.includes('Keep me'));
  assert.ok(!/comment/i.test(y), y);
}
// exports open in Print Layout
assert.equal(printLayoutSettings('<w:settings x="1"><w:zoom w:percent="100"/></w:settings>'), '<w:settings x="1"><w:view w:val="print"/><w:zoom w:percent="100"/></w:settings>');
assert.equal(printLayoutSettings('<w:settings><w:view w:val="web"/><w:zoom/></w:settings>'), '<w:settings><w:view w:val="print"/><w:zoom/></w:settings>');
assert.equal(printLayoutSettings('<w:settings><w:writeProtection w:recommended="1"/></w:settings>'), '<w:settings><w:writeProtection w:recommended="1"/><w:view w:val="print"/></w:settings>');
console.log('portfolio tests passed');
