// Run with: node logbook/test/reflect-import.test.mjs  (made-up reflections only)
// Round trip: reflections -> exportPortfolio (.docx) -> parseDocx -> the same fields back.
// Optional: PORTFOLIO_TEMPLATE=blank.docx also round-trips through a real blank portfolio template.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { exportPortfolio, esc } from '../js/portfolio.js';
import { parseDocx, parseDateCell, parseInitials, subFor, parseDetails } from '../js/reflect-import.js';
import { HEADING_BY_ID } from '../js/reflections.js';

const JSZip = createRequire(import.meta.url)('../vendor/jszip.min.js');
const L = t => ({ text: t, bold: false, u: false, imgs: [], num: false });

// small units
for (const [t, iso] of [['21st Dec 2024', '2024-12-21'], ['21/12/24', '2024-12-21'], ['21-12-2024', '2024-12-21'], ['JR 6/12/24', '2024-12-06'], ['2nd Jan 2025', '2025-01-02'], ['Dec 21, 2024', '2024-12-21']]) {
  assert.equal(parseDateCell([L(t)]).date, iso, t);
}
assert.deepEqual(parseDateCell([L('JR'), L('6/12/24')]), { jr: true, date: '2024-12-06', dateText: '' });
assert.deepEqual(parseDateCell([L('Dec 2024')]), { jr: false, date: null, dateText: 'Dec 2024' });
assert.equal(parseInitials([L('3.'), L('AB')]), 'AB');
assert.equal(parseInitials([L('3. AB')]), 'AB');
assert.equal(subFor(HEADING_BY_ID.cabg, 'On pump CABG'), 'on');
assert.equal(subFor(HEADING_BY_ID.cabg, 'Off-pump'), 'off');
assert.equal(subFor(HEADING_BY_ID.eye, 'Under GA'), 'ga');
assert.equal(subFor(HEADING_BY_ID.urology, 'Prostate surgery'), 'prostate');
assert.equal(subFor(HEADING_BY_ID.regional, 'Upper limb block'), 'ul');
const free = parseDetails([L('Just some free text'), L('on two lines')]);
assert.equal(free.summary, 'Just some free text\non two lines');
assert.deepEqual(free.points, []);

// ---------- round trip through the app's own export ----------
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const R = o => ({ id: Math.random().toString(36).slice(2), subId: null, jr: false, status: 'complete', caseId: null, createdAt: 1, updatedAt: 1,
  title: '', summary: '', points: [], figures: [], references: [], diagnosis: '', ...o });
const refl = [
  R({ headingId: 'thyroid', initials: 'AB', date: '2024-12-21', jr: true, diagnosis: 'Total thyroidectomy\nRetrosternal goitre',
    title: 'Airway planning for a made-up retrosternal goitre', summary: 'A 60 year old made-up patient.\n\nSecond paragraph & <tags>.',
    points: [{ heading: 'Pre-op imaging', text: 'CT showed tracheal deviation.\nPlan agreed with surgeons.' }, { heading: 'Awake intubation', text: 'Consider it early.' }],
    figures: [{ id: 'imgA1', caption: 'CT neck (made up)', point: 0 }, { id: 'imgA2', caption: 'Second picture', point: null }],
    references: ['Smith A. Made-up airways. J Fake Anaesth 2020;1:1-2.', 'Doe B. Another made-up paper.'] }),
  R({ headingId: 'cabg', subId: 'on', initials: 'CD', date: '2025-01-02', diagnosis: 'CABG x3', title: 'Weaning from bypass',
    summary: 'Made-up summary.', points: [{ heading: 'Protamine', text: 'Give slowly.' }] }),
  R({ headingId: 'regional', subId: 'ul', initials: 'EF', date: '2025-03-04', diagnosis: 'Interscalene block', title: 'Phrenic sparing',
    summary: 'Made-up block.', points: [{ heading: 'Volume', text: 'Low volume.' }, { heading: 'Position', text: 'Supraclavicular?' }] }),
  R({ headingId: 'eye', subId: 'ga', initials: 'GH', date: '2025-04-05', diagnosis: 'Vitrectomy', title: '', summary: 'No title, only a summary.',
    points: [{ heading: '', text: 'A point without a heading.' }] }),
  R({ headingId: 'urology', subId: 'prostate', initials: 'IJ', date: '2025-05-06', diagnosis: 'TURP', title: 'TURP syndrome', summary: 'Made up.', points: [{ heading: 'Sodium', text: 'Check it.' }] }),
  // legacy one-box-per-section reflection
  { id: 'leg1', headingId: 'neuro', subId: null, initials: 'KL', date: '2024-08-01', jr: true, diagnosis: 'Craniotomy', status: 'draft',
    sections: { description: 'Made-up case.\nSecond line', thoughts: 'Felt fine', evaluation: '', analysis: 'Thought about it', conclusions: 'Learnt', action: 'Read more', further: '' } },
];
const images = { imgA1: { data: PNG, mime: 'image/png', w: 1, h: 1 }, imgA2: { data: PNG, mime: 'image/png', w: 1, h: 1 } };

const norm = s => String(s || '').trim();
function check(parsed, label) {
  let fields = 0, ok = 0;
  const cmp = (a, b, what, r) => { fields++; if (JSON.stringify(a) === JSON.stringify(b)) ok++; else console.log(`  ${label} ${r.initials} ${what}:`, JSON.stringify(a), '!=', JSON.stringify(b)); };
  for (const src of refl) {
    const got = parsed.items.find(x => x.initials === src.initials);
    assert.ok(got, `${label}: ${src.initials} found`);
    cmp(got.headingId, src.headingId, 'heading', src);
    cmp(got.date, src.date, 'date', src);
    cmp(got.jr, !!src.jr, 'jr', src);
    cmp(got.subId, src.subId, 'sub', src);
    cmp(got.diagnosis, src.diagnosis, 'diagnosis', src);
    if (src.sections) {
      for (const [k, v] of Object.entries(src.sections)) if (v) cmp(norm(got.sections && got.sections[k]), v, 'section ' + k, src);
      continue;
    }
    cmp(got.title, src.title, 'title', src);
    cmp(got.summary, src.summary, 'summary', src);
    cmp(got.points, src.points, 'points', src);
    cmp(got.references, src.references, 'references', src);
    cmp(got.figures.length, src.figures.length, 'figures', src);
    cmp(got.figures.map(f => f.caption), src.figures.map(f => f.caption), 'captions', src);
  }
  console.log(`${label}: ${ok}/${fields} fields round-tripped, ${parsed.items.length} rows, ${parsed.headings} headings`);
  return [ok, fields];
}

const plainBlob = await exportPortfolio(refl, { name: 'Test Resident', JSZip, images });
const plain = await parseDocx(new Uint8Array(await plainBlob.arrayBuffer()), JSZip);
assert.equal(plain.items.length, refl.length, 'one row per reflection, empty rows skipped');
const [ok1, n1] = check(plain, 'plain layout');
assert.equal(ok1, n1, 'plain layout round trip is exact');
const a = plain.items.find(x => x.initials === 'AB');
assert.equal(a.figures[0].point, 0, 'figure follows its learning point');
assert.ok(plain.images[a.figures[0].rid].data.length > 10, 'figure picture extracted');

const tplPath = process.env.PORTFOLIO_TEMPLATE || '/tmp/claude-0/-home-user-anawj-site/aef7b023-a326-5f96-82d2-2f768144ab6f/scratchpad/orig/original-blank.docx';
if (existsSync(tplPath)) {
  const tb = await exportPortfolio(refl, { name: 'Test Resident', JSZip, images, templateB64: readFileSync(tplPath).toString('base64') });
  assert.ok(tb.usedTemplate, 'template used');
  const tp = await parseDocx(new Uint8Array(await tb.arrayBuffer()), JSZip);
  assert.equal(tp.items.length, refl.length, 'template: prompt-only rows (JR / sub-type) skipped');
  const [ok2, n2] = check(tp, 'real template');
  assert.ok(ok2 / n2 > 0.95, 'template round trip mostly exact');
} else console.log('(no blank template found; skipped the real-template round trip)');

// ---------- a hand-made messy document ----------
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const p = (t, f = {}) => `<w:p>${f.num ? '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>' : ''}<w:r>${f.b || f.u ? `<w:rPr>${f.b ? '<w:b/>' : ''}${f.u ? '<w:u w:val="single"/>' : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
const tc = (...ps) => `<w:tc>${ps.join('') || '<w:p/>'}</w:tc>`;
const tr = (...cs) => `<w:tr>${cs.join('')}</w:tr>`;
const head = tr(tc(p('Patient’s Initials')), tc(p('Date')), tc(p('Diagnosis/ Operations')), tc(p('Case details and Learning points')));
const doc = `<?xml version="1.0"?><w:document ${W}><w:body>
${p('SECTION 2')}${p('A) Thyroid / Head and Neck Operations (Min 3)')}
<w:tbl>${head}
${tr(tc(p('1.'), p('mn')), tc(p('21-12-2024')), tc(p('Hemithyroidectomy')), tc(p('This is a free text reflection with no structure at all.'), p('It goes on for another paragraph.')))}
${tr(tc(p('2. OP')), tc(p('Dec 2024')), tc(p('Parathyroidectomy')), tc(p('Bold title here', { b: true }), p('Summary line.'), p('Some more text but no learning points heading.')))}
${tr(tc(), tc(p('JR', { b: true })), tc(), tc())}
${tr(tc(), tc(), tc(), tc())}
</w:tbl>
${p('')}
<w:tbl>${tr(tc(p('3.'), p('QR')), tc(p('JR'), p('3rd March 2025')), tc(p('Neck dissection')), tc(p('A title', { b: true }), p('Summary.'), p('Reflection points', { b: true }), p('First thing learnt', { num: true }), p('Its explanation.'), p('2. Second thing'), p('More text.'), p('References', { b: true }), p('1. Made-up ref one'), p('2. Made-up ref two')))}</w:tbl>
${p('L) Urology surgery (Min 3)')}
<w:tbl>${head}${tr(tc(p('ST')), tc(p('5/6/25')), tc(p('Prostate surgery', { b: true }), p('HoLEP')), tc(p('Learning points', { b: true }), p('Fluid', { u: true }), p('Watch absorption.')))}
${tr(tc(), tc(), tc(p('Kidney', { b: true })), tc())}</w:tbl>
</w:body></w:document>`;
const z = new JSZip();
z.file('word/document.xml', doc);
const messy = await parseDocx(await z.generateAsync({ type: 'uint8array' }), JSZip);
assert.equal(messy.items.length, 4, 'empty and prompt-only rows skipped');
const [m1, m2, m3, m4] = messy.items;
assert.equal(m1.headingId, 'thyroid');
assert.equal(m1.initials, 'mn');
assert.equal(m1.date, '2024-12-21');
assert.equal(m1.summary, 'This is a free text reflection with no structure at all.\nIt goes on for another paragraph.');
assert.deepEqual(m1.points, []);
assert.equal(m2.initials, 'OP');
assert.equal(m2.date, null);
assert.equal(m2.dateText, 'Dec 2024');
assert.ok(m2.warnings.some(w => /Dec 2024/.test(w)));
assert.equal(m2.title, 'Bold title here');
assert.equal(m2.summary, 'Summary line.\nSome more text but no learning points heading.');
assert.equal(m3.headingId, 'thyroid', 'continuation table (no header) stays under the heading');
assert.equal(m3.jr, true);
assert.equal(m3.date, '2025-03-03');
assert.deepEqual(m3.points, [{ heading: 'First thing learnt', text: 'Its explanation.' }, { heading: 'Second thing', text: 'More text.' }]);
assert.deepEqual(m3.references, ['Made-up ref one', 'Made-up ref two']);
assert.equal(m4.headingId, 'urology');
assert.equal(m4.subId, 'prostate');
assert.equal(m4.diagnosis, 'HoLEP');
assert.deepEqual(m4.points, [{ heading: 'Fluid', text: 'Watch absorption.' }]);
assert.equal(messy.headings, 2);

await assert.rejects(parseDocx(new Uint8Array([1, 2, 3]), JSZip), /docx/);
console.log('reflect-import tests passed');
