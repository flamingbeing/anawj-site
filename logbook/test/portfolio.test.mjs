// Run with: node logbook/test/portfolio.test.mjs  (made-up reflections only)
// Optional: PORTFOLIO_TEMPLATE=blank.docx PORTFOLIO_OUT=out.docx also fills a real blank template.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { REFLECTION_HEADINGS } from '../js/categories.js';
import { fillDocumentXml, plainDocumentXml, exportPortfolio, rowCells, esc, fmtDate, caseRYear, countsByYear, fillSummaryXml } from '../js/portfolio.js';

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
assert.deepEqual(cells[1].map(p => p[0][0]), ['JR', '04/03/25']);
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

console.log('portfolio tests passed');
