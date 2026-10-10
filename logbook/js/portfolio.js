// Export case reflections as the APMES training portfolio (Section 2, case reflections) in Word format.
// With the admin-uploaded blank template (config/portfolioTemplate) the export is the official document
// with the tables filled in; without one, a clean docx with the same headings and tables is generated.
// The template is APMES's document: it is never committed; tools/build_portfolio_template.py makes it.

import { REFLECTION_HEADINGS, REFLECTION_SECTIONS } from './categories.js';
import { S, h, toast, cloud, download, hooks } from './ui-core.js';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// JSZip (~100 KB) loads on first use, like ExcelJS.
let zipP = null;
export function needZip() {
  if (globalThis.JSZip) return Promise.resolve(globalThis.JSZip);
  zipP ||= new Promise((resolve, reject) => {
    const s = h('script', { src: 'vendor/jszip.min.js' });
    s.onload = () => resolve(globalThis.JSZip);
    s.onerror = () => { zipP = null; reject(new Error('Could not load the zip library (offline?)')); };
    document.head.append(s);
  });
  return zipP;
}

// ---------- WordprocessingML helpers ----------

export const esc = s => String(s ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (text, bold) => `<w:r>${bold ? '<w:rPr><w:b/><w:bCs/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const para = (pPr, runs) => `<w:p>${pPr || ''}${runs}</w:p>`;
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '';
}

const subName = r => {
  const hd = REFLECTION_HEADINGS.find(x => x.id === r.headingId);
  const sub = hd && hd.subs && hd.subs.find(s => s.id === r.subId);
  return sub ? sub.name : '';
};

// The four cells of one portfolio row, each as a list of paragraphs: [[text, bold], ...] runs per paragraph.
export function rowCells(r) {
  if (!r) return [[], [], [], []];
  const lines = s => String(s || '').split(/\r?\n/).map(x => x.trimEnd());
  const details = [];
  for (const sec of REFLECTION_SECTIONS) {
    const v = (r.sections && r.sections[sec.id] || '').trim();
    if (!v) continue;
    details.push([[sec.name, true]]);
    for (const l of lines(v)) details.push([[l, false]]);
  }
  const sub = subName(r);
  const diag = [];
  if (sub) diag.push([[sub, true]]);
  for (const l of lines(r.diagnosis)) if (l || !diag.length) diag.push([[l, false]]);
  return [
    [[[r.initials || '', false]]],
    [...(r.jr ? [[['JR', true]]] : []), [[fmtDate(r.date), false]]],
    diag,
    details,
  ];
}

const paras = (pPr, list) => (list.length ? list : [[]]).map(p => para(pPr, p.map(([t, b]) => run(t, b)).join(''))).join('');

const byDate = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.createdAt || 0) - (b.createdAt || 0);
export function groupReflections(reflections) {
  const g = Object.fromEntries(REFLECTION_HEADINGS.map(hd => [hd.id, []]));
  for (const r of reflections || []) if (g[r.headingId]) g[r.headingId].push(r);
  for (const k in g) g[k].sort(byDate);
  return g;
}

// ---------- filling the official template ----------

// Top-level <w:tbl> spans in document.xml (nested tables are skipped over).
function topTables(xml) {
  const out = [];
  const re = /<w:tbl>|<w:tbl\s[^>]*>|<\/w:tbl>/g;
  let depth = 0, start = -1, m;
  while ((m = re.exec(xml))) {
    if (m[0] !== '</w:tbl>') { if (depth++ === 0) start = m.index; }
    else if (--depth === 0) out.push([start, re.lastIndex]);
  }
  return out;
}
const textOf = x => (x.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const parasOf = x => x.match(/<w:p(?=[\s>])[^>]*>[\s\S]*?<\/w:p>/g) || [];

// Which heading a table belongs to: the paragraph(s) just above it, matched on the heading name.
function headingFor(between) {
  const all = parasOf(between).map(textOf).map(s => s.trim()).filter(Boolean);
  const texts = all.slice(-3).reverse();
  const minLine = [...all].reverse().find(t => /\(min\s*\d+\)/i.test(t));
  if (minLine) texts.push(minLine);
  let best = null, bestLen = 0;
  for (const t of texts) {
    const nt = norm(t.replace(/\(min\s*\d+\)/i, ''));
    for (const hd of REFLECTION_HEADINGS) {
      const nh = norm(hd.name);
      let i = 0;
      while (i < nt.length && i < nh.length && nt[i] === nh[i]) i++;
      if ((i === nh.length || i === nt.length || i >= 24) && i >= 8 && i > bestLen) { best = hd; bestLen = i; }
    }
    if (best) return best;
  }
  return null;
}

function fillCell(tc, list) {
  const open = tc.match(/^<w:tc(?:\s[^>]*)?>/)[0];
  const tcPr = (tc.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || [''])[0];
  const p0 = parasOf(tc)[0] || '';
  let pPr = (p0.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
  pPr = pPr.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '');
  return `${open}${tcPr}${paras(pPr, list)}</w:tc>`;
}

function fillRow(proto, r) {
  const cells = rowCells(r);
  let i = 0;
  return proto.replace(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g, tc => fillCell(tc, cells[i++] || []));
}

// The template's rows are slots: some carry a pre-printed "JR" in the date cell or a sub-type in the
// diagnosis cell ("On pump CABG", "Under GA"). Each reflection goes to the row that asks for it;
// rows left empty keep their prompt; extra reflections get new rows after the last.
function slotInfo(hd, tr) {
  const cells = (tr.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || []).map(textOf).map(t => t.trim());
  const label = norm(cells[2] || '');
  const sub = label && (hd.subs || []).find(x => { const n = norm(x.name); return label.includes(n) || n.includes(label) || label.startsWith(n.slice(0, 6)); });
  return { tr, jr: /^jr$/i.test(cells[1] || ''), sub: sub ? sub.id : null, prompt: !!label, used: false };
}
export function placeInSlots(hd, protoRows, list) {
  const slots = protoRows.map(tr => slotInfo(hd, tr));
  const out = slots.map(() => null);
  const take = (r, ok) => { const i = slots.findIndex(sl => !sl.used && ok(sl)); if (i < 0) return false; slots[i].used = true; out[i] = fillRow(slots[i].tr, r); return true; };
  const extra = [];
  for (const r of list) {
    const done = (r.subId && take(r, sl => sl.sub === r.subId))
      || (r.jr && take(r, sl => sl.jr && !sl.sub))
      || take(r, sl => !sl.jr && !sl.sub && !sl.prompt)
      || take(r, sl => !sl.sub && !(sl.jr && !r.jr))
      || take(r, sl => !sl.sub);
    if (!done) extra.push(r);
  }
  const plain = (slots.find(sl => !sl.jr && !sl.prompt) || slots[slots.length - 1]).tr;
  const rows = slots.map((sl, i) => out[i] || sl.tr);
  for (const r of extra) rows.push(fillRow(plain, r));
  while (rows.length < hd.min) rows.push(fillRow(plain, null));
  return rows;
}

export function fillDocumentXml(xml, reflections, { name } = {}) {
  const groups = groupReflections(reflections);
  const tables = topTables(xml);
  const done = new Set();
  let out = '', last = 0;
  for (const [a, b] of tables) {
    const tbl = xml.slice(a, b);
    const rows = tbl.match(/<w:tr(?=[\s>])[^>]*>[\s\S]*?<\/w:tr>/g) || [];
    const hd = rows.length >= 2 && /^Patient/i.test(textOf(rows[0]).trim()) ? headingFor(xml.slice(last, a)) : null;
    out += xml.slice(last, a);
    last = b;
    if (!hd || done.has(hd.id)) { out += tbl; continue; }
    done.add(hd.id);
    const firstRow = tbl.indexOf(rows[1]);
    const lastRow = tbl.lastIndexOf(rows[rows.length - 1]) + rows[rows.length - 1].length;
    const filled = placeInSlots(hd, rows.slice(1), groups[hd.id]).join('');
    out += tbl.slice(0, firstRow) + filled + tbl.slice(lastRow);
  }
  out += xml.slice(last);
  if (name) out = out.replace(/(Resident’s name\s*:\s*)_{6,}/, (_, p) => p + esc(name));
  return { xml: out, matched: [...done] };
}

// ---------- fallback: a clean docx without the template ----------

const CELL_W = [1300, 1300, 2300, 4700];
const HEAD = ['Patient’s Initials', 'Date', 'Diagnosis/ Operations', 'Case details and Learning points'];
function plainTable(list, min) {
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join('');
  const tc = (i, body, shade) => `<w:tc><w:tcPr><w:tcW w:w="${CELL_W[i]}" w:type="dxa"/>${shade ? '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>' : ''}</w:tcPr>${body}</w:tc>`;
  const head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${HEAD.map((t, i) => tc(i, para('', run(t, true)), true)).join('')}</w:tr>`;
  const n = Math.max(min, list.length);
  const rows = Array.from({ length: n }, (_, k) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${rowCells(list[k]).map((c, i) => tc(i, paras('', c))).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="9600" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${CELL_W.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${head}${rows}</w:tbl>`;
}

export function plainDocumentXml(reflections, { name } = {}) {
  const groups = groupReflections(reflections);
  const H = (t, size) => para(`<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr>`, `<w:r><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`);
  let body = H('Anaesthesiology Residency Training Portfolio', 32);
  if (name) body += para('', run('Resident’s name : ' + name));
  body += H('SECTION 2 – CASE REFLECTIONS', 28);
  body += para('', run('Structure: case description; thoughts and feelings; evaluation; analysis; conclusions; action plan; further reflection as a SR (optional, for a JR reflection). “JR” above the date marks a junior residency reflection.'));
  let section = '';
  for (const hd of REFLECTION_HEADINGS) {
    if (hd.section !== section) { section = hd.section; body += H(section, 26); }
    body += H(`${hd.name} (Min ${hd.min})`, 22) + plainTable(groups[hd.id], hd.min) + para('', '');
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W_NS}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

function plainPackage(zip, docXml) {
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`);
  zip.file('word/document.xml', docXml);
}

const b64ToBytes = b64 => {
  if (typeof atob === 'function') return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return Uint8Array.from(Buffer.from(b64, 'base64'));
};

// reflections: reflection objects (any status). Returns a Blob (.docx).
export async function exportPortfolio(reflections, { name = '', templateB64 = null, JSZip = null } = {}) {
  const Z = JSZip || await needZip();
  let zip = null, usedTemplate = false;
  if (templateB64) {
    try {
      zip = await Z.loadAsync(b64ToBytes(templateB64));
      const xml = await zip.file('word/document.xml').async('string');
      const { xml: filled, matched } = fillDocumentXml(xml, reflections, { name });
      if (matched.length < REFLECTION_HEADINGS.length / 2) throw new Error('template headings not found');
      zip.file('word/document.xml', filled);
      usedTemplate = true;
    } catch (err) { console.warn('Portfolio template unusable, using the plain layout', err); zip = null; }
  }
  if (!zip) { zip = new Z(); plainPackage(zip, plainDocumentXml(reflections, { name })); }
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const blob = new Blob([bytes], { type: DOCX });
  blob.usedTemplate = usedTemplate;
  return blob;
}

// ---------- UI ----------

let templateCache = undefined;   // undefined: not loaded; null: none uploaded
async function getTemplate() {
  if (templateCache !== undefined) return templateCache;
  try { templateCache = cloud.loadTemplate ? await cloud.loadTemplate() : null; }
  catch (err) { console.warn('Could not load the portfolio template', err); return null; }
  return templateCache;
}

// A button for the reflections screen (or Progress): getReflections() and getName() are called on click.
export function renderExportButton(getReflections, getName) {
  return h('button', { onclick: async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const refl = (await getReflections()) || [];
      const t = await getTemplate();
      const name = (getName && getName()) || '';
      const blob = await exportPortfolio(refl, { name, templateB64: t && t.data });
      download(`APMES portfolio reflections${name ? ' - ' + name : ''}.docx`, blob);
      toast(blob.usedTemplate ? 'Portfolio exported.' : 'Exported in the plain layout (no portfolio template uploaded yet).');
    } catch (err) { toast('Could not export: ' + err.message); }
    btn.disabled = false;
  } }, 'Export portfolio (Word)');
}

const TC = { info: null, loading: false, busy: false };
// Admin page card: upload the blank portfolio template (made with tools/build_portfolio_template.py).
export function renderTemplateCard() {
  const card = h('section', { class: 'card' }, h('h2', {}, 'Portfolio template'),
    h('p', { class: 'hint' }, 'The blank APMES portfolio (.docx) that “Export portfolio (Word)” fills in. Make it from a filled portfolio with tools/build_portfolio_template.py, which clears every resident’s details. Do not upload a filled one. Without a template, exports use a plain layout.'));
  if (!cloud.saveTemplate) return card;
  if (!TC.info && !TC.loading) {
    TC.loading = true;
    getTemplate().then(t => { TC.info = t ? { size: t.size, uploadedAt: t.uploadedAt } : { none: true }; TC.loading = false; if (S.tab === 'admin') hooks.render(); });
  }
  const i = TC.info;
  card.append(h('p', { class: 'muted' }, !i ? 'Loading…' : i.none ? 'No template uploaded.'
    : `Uploaded ${i.uploadedAt ? new Date(i.uploadedAt).toLocaleDateString() : ''} (${Math.round((i.size || 0) / 1024)} KB).`));
  card.append(h('label', { class: 'btn' }, TC.busy ? 'Uploading…' : 'Upload template (.docx)',
    h('input', { type: 'file', accept: '.docx', hidden: true, disabled: TC.busy, onchange: async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      TC.busy = true; hooks.render();
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        let bin = '';
        for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
        const b64 = btoa(bin);
        const Z = await needZip();
        const xml = await (await Z.loadAsync(bytes)).file('word/document.xml').async('string');
        const { matched } = fillDocumentXml(xml, []);
        if (matched.length < REFLECTION_HEADINGS.length / 2) throw new Error(`only ${matched.length} of ${REFLECTION_HEADINGS.length} reflection tables found — is this the APMES portfolio?`);
        await cloud.saveTemplate(b64);
        templateCache = { data: b64, size: bytes.length, uploadedAt: Date.now() };
        TC.info = { size: bytes.length, uploadedAt: Date.now() };
        toast(`Template saved (${matched.length} reflection tables found).`);
      } catch (err) { toast('Could not upload: ' + err.message); }
      TC.busy = false; hooks.render();
    } })));
  return card;
}
