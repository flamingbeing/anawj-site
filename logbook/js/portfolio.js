// Export case reflections as the APMES training portfolio (Section 2, case reflections) in Word format.
// With the admin-uploaded blank template (config/portfolioTemplate) the export is the official document
// with the tables filled in; without one, a clean docx with the same headings and tables is generated.
// The template is APMES's document: it is never committed; tools/build_portfolio_template.py makes it.

import { REFLECTION_HEADINGS, REFLECTION_SECTIONS } from './categories.js';
import { S, h, toast, cloud, download, hooks } from './ui-core.js';
import { SECTIONS, PROFILE_FIELDS, cleanProfile, locateSection1, pdField, isoToDmy, ROW_RE, CELL_RE, PARA_RE } from './profile.js';

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
// fmt: true = bold, or { b, u, sup, arial } for bold / single underline / superscript / Arial.
const ARIAL = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/>';
const run = (text, fmt) => {
  const f = fmt === true ? { b: true } : (fmt || {});
  const rPr = (f.arial ? ARIAL : '') + (f.b ? '<w:b/><w:bCs/>' : '') + (f.u ? '<w:u w:val="single"/>' : '') + (f.sup ? '<w:vertAlign w:val="superscript"/>' : '');
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
};
const para = (pPr, runs) => `<w:p>${pPr || ''}${runs}</w:p>`;
export const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '';
}

const subName = r => {
  const hd = REFLECTION_HEADINGS.find(x => x.id === r.headingId);
  const sub = hd && hd.subs && hd.subs.find(s => s.id === r.subId);
  return sub ? sub.name : '';
};

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const ordinal = d => (d % 100 >= 11 && d % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[d % 10] || 'th';
// "2024-12-21" -> runs for "21st Dec 2024" with the suffix superscript, as in residents' own portfolios.
export function dateRuns(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return [['', false]];
  const d = Number(m[3]);
  return [[String(d), false], [ordinal(d), { sup: true }], [` ${MON[Number(m[2]) - 1] || ''} ${m[1]}`, false]];
}

const lines = s => String(s || '').split(/\r?\n/).map(x => x.trimEnd());
// Text split into paragraphs; blank lines kept (as empty paragraphs), leading/trailing blanks dropped.
const textParas = s => {
  const ls = lines(String(s || '').trim());
  return ls.length === 1 && !ls[0] ? [] : ls.map(l => (l ? [[l, false]] : []));
};
export const isStructured = r => !!(r && (String(r.title || '').trim() || String(r.summary || '').trim()
  || (r.points || []).some(p => p && (String(p.heading || '').trim() || String(p.text || '').trim()))));

// Column 4 of a structured reflection: title, summary, Learning Points (underlined numbered headings,
// figures after the point they belong to), References. A paragraph is a list of runs, or { image }.
function detailsStructured(r) {
  const out = [];
  const summary = textParas(r.summary);
  if (String(r.title || '').trim()) out.push([[r.title.trim(), true]], ...(summary.length ? [[]] : []));
  out.push(...summary);
  const figs = (r.figures || []).filter(f => f && f.id);
  const pts = (r.points || []).map((p, i) => ({ ...p, i })).filter(p => p && (String(p.heading || '').trim() || String(p.text || '').trim()));
  const valid = new Set(pts.map(p => p.i));
  let k = 0;
  const figure = f => { k++; out.push({ image: f.id }); out.push([[`Figure ${k}: ${String(f.caption || '').trim()}`.replace(/:\s*$/, ''), false]]); };
  if (pts.length || figs.length) {
    out.push([]);
    out.push([['Learning Points', true]]);
    pts.forEach((p, n) => {
      if (n) out.push([]);
      out.push([[`${n + 1}. ${String(p.heading || '').trim()}`.trimEnd(), { u: true }]]);
      out.push(...textParas(p.text));
      for (const f of figs) if (f.point === p.i) figure(f);
    });
    for (const f of figs) if (f.point == null || !valid.has(f.point)) figure(f);
  }
  const refs = (r.references || []).map(x => String(x || '').trim()).filter(Boolean);
  if (refs.length) {
    out.push([]);
    out.push([['References', true]]);
    refs.forEach((x, n) => out.push([[`${n + 1}. ${x.replace(/^\d+[.)]\s*/, '')}`, false]]));
  }
  return out;
}

// The four cells of one portfolio row, each as a list of paragraphs: [[text, fmt], ...] runs per paragraph.
// n: the row's number within its table (filled rows only).
export function rowCells(r, n) {
  if (!r) return [[], [], [], []];
  let details = [];
  if (isStructured(r)) details = detailsStructured(r);
  else {
    for (const sec of REFLECTION_SECTIONS) {
      const v = (r.sections && r.sections[sec.id] || '').trim();
      if (!v) continue;
      details.push([[sec.name, true]]);
      for (const l of lines(v)) details.push([[l, false]]);
    }
  }
  const sub = subName(r);
  const diag = [];
  if (sub) diag.push([[sub, true]]);
  for (const l of lines(r.diagnosis)) if (l || !diag.length) diag.push([[l, false]]);
  return [
    [...(n ? [[[`${n}.`, false]]] : []), [[r.initials || '', false]]],
    [...(r.jr ? [[['JR', true]]] : []), dateRuns(r.date)],
    diag,
    details,
  ];
}

// ---------- inline pictures ----------

const EMU = 914400, MAX_W = 2194560, MAX_H = Math.round(3.5 * EMU);
const REL_IMG = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
// Collects the pictures a document uses; finishMedia() then writes them into the package.
export function newMedia(images, docXml = '') {
  const ids = (docXml.match(/<wp:docPr\b[^>]*\bid="(\d+)"/g) || []).map(x => Number(/id="(\d+)"/.exec(x)[1]));
  return { images: images || {}, used: [], byId: {}, docPr: Math.max(1000, ...ids) };
}
export function imageSize(w, h) {
  const ar = w > 0 && h > 0 ? h / w : 1;
  let cx = MAX_W, cy = Math.round(cx * ar);
  if (cy > MAX_H) { cy = MAX_H; cx = Math.round(cy / ar); }
  return [cx, cy];
}
function drawing(media, id) {
  const img = media && media.images[id];
  if (!img || !img.data) return '';
  let m = media.byId[id];
  if (!m) {
    const png = /png/i.test(img.mime || '');
    m = media.byId[id] = { id, n: media.used.length + 1, rId: `rIdApmesImg${media.used.length + 1}`, ext: png ? 'png' : 'jpeg', img };
    media.used.push(m);
  }
  const [cx, cy] = imageSize(img.w, img.h);
  const pid = ++media.docPr;
  const name = `Figure ${pid}`;
  return `<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${pid}" name="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${pid}" name="${name}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="${m.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

const NS = { wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture', r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships' };
export function ensureNamespaces(xml) {
  return xml.replace(/<w:document\b[^>]*>/, tag => {
    let t = tag;
    for (const [p, uri] of Object.entries(NS)) if (!new RegExp(`\\sxmlns:${p}=`).test(t)) t = t.replace(/>$/, ` xmlns:${p}="${uri}">`);
    return t;
  });
}

// Writes the used pictures into the zip: media files, relationships, content types.
async function finishMedia(zip, media) {
  if (!media || !media.used.length) return;
  const relsPath = 'word/_rels/document.xml.rels';
  let rels = zip.file(relsPath) ? await zip.file(relsPath).async('string')
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  let ct = await zip.file('[Content_Types].xml').async('string');
  for (const m of media.used) {
    let n = m.n, file;
    while (zip.file(file = `word/media/image${n}.${m.ext}`)) n += 1000;
    zip.file(file, b64ToBytes(String(m.img.data).replace(/^data:[^,]*,/, '')));
    rels = rels.replace('</Relationships>', `<Relationship Id="${m.rId}" Type="${REL_IMG}" Target="${file.slice(5)}"/></Relationships>`);
  }
  const types = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png' };
  for (const [ext, mime] of Object.entries(types)) {
    if (!new RegExp(`Extension="${ext}"`, 'i').test(ct)) ct = ct.replace('</Types>', `<Default Extension="${ext}" ContentType="${mime}"/></Types>`);
  }
  zip.file(relsPath, rels);
  zip.file('[Content_Types].xml', ct);
}

const paras = (pPr, list, media) => (list.length ? list : [[]]).map(p => (Array.isArray(p)
  // the case reflection rows are written in Arial (the rest of the template keeps its own fonts)
  ? para(pPr, p.map(([t, b]) => run(t, { ...(b === true ? { b: true } : b || {}), arial: true })).join(''))
  : para(pPr, drawing(media, p.image)))).join('');

const byDate = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.createdAt || 0) - (b.createdAt || 0);
export function groupReflections(reflections) {
  const g = Object.fromEntries(REFLECTION_HEADINGS.map(hd => [hd.id, []]));
  for (const r of reflections || []) if (g[r.headingId]) g[r.headingId].push(r);
  for (const k in g) g[k].sort(byDate);
  return g;
}

// ---------- filling the official template ----------

// Top-level <w:tbl> spans in document.xml (nested tables are skipped over).
export function topTables(xml) {
  const out = [];
  const re = /<w:tbl>|<w:tbl\s[^>]*>|<\/w:tbl>/g;
  let depth = 0, start = -1, m;
  while ((m = re.exec(xml))) {
    if (m[0] !== '</w:tbl>') { if (depth++ === 0) start = m.index; }
    else if (--depth === 0) out.push([start, re.lastIndex]);
  }
  return out;
}
export const textOf = x => (x.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
export const parasOf = x => x.match(/<w:p(?=[\s>])[^>]*>[\s\S]*?<\/w:p>/g) || [];

// Which heading a table belongs to: the paragraph(s) just above it, matched on the heading name.
export function headingFor(between) {
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

function fillCell(tc, list, media) {
  const open = tc.match(/^<w:tc(?:\s[^>]*)?>/)[0];
  const tcPr = (tc.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || [''])[0];
  const p0 = parasOf(tc)[0] || '';
  let pPr = (p0.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
  pPr = pPr.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '');
  return `${open}${tcPr}${paras(pPr, list, media)}</w:tc>`;
}

function fillRow(proto, r, n, media) {
  const cells = rowCells(r, n);
  let i = 0;
  return proto.replace(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g, tc => fillCell(tc, cells[i++] || [], media));
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
export function placeInSlots(hd, protoRows, list, media) {
  const slots = protoRows.map(tr => slotInfo(hd, tr));
  const out = slots.map(() => null);
  const take = (r, ok) => { const i = slots.findIndex(sl => !sl.used && ok(sl)); if (i < 0) return false; slots[i].used = true; out[i] = r; return true; };
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
  // rows are numbered 1, 2, … in table order; slots left empty don't count
  let n = 0;
  const rows = slots.map((sl, i) => (out[i] ? fillRow(sl.tr, out[i], ++n, media) : sl.tr));
  for (const r of extra) rows.push(fillRow(plain, r, ++n, media));
  while (rows.length < hd.min) rows.push(fillRow(plain, null));
  return rows;
}

// ---------- Section 4: summary of experience ----------

// Residency year a case falls in: the academic year starts on 1 July; intake 2024 → AY2024 is R1.
export function caseRYear(date, intake) {
  const m = /^(\d{4})-(\d{2})/.exec(date || '');
  if (!m || !intake) return null;
  const ay = Number(m[1]) - (Number(m[2]) < 7 ? 1 : 0);
  return Math.min(5, Math.max(1, ay - Number(intake) + 1));
}

// counts[code] = { 1: n, …, 5: n, total }
export function countsByYear(cases, intake) {
  const out = {};
  for (const c of cases || []) {
    const y = caseRYear(c.date, intake);
    for (const code of new Set(c.cats || [])) {
      const o = (out[code] ||= { total: 0 });
      o.total++;
      if (y) o[y] = (o[y] || 0) + 1;
    }
  }
  return out;
}

// "15 i) Emergency neurosurgery (EPA2)" -> "15i"
const s4Code = label => { const m = /^\s*(\d+)\s*([ivx]*)\s*\)/i.exec(label); return m ? m[1].padStart(2, '0') + m[2].toLowerCase() : null; };

// Replace the minimum numbers in the "Posting period" table with the resident's own counts: cases in
// each residency year (blank for years not reached yet) and the total. Without an intake year only
// the total is filled.
export function fillSummaryXml(xml, cases, { intake = null, rYear = null } = {}) {
  const counts = countsByYear(cases, intake);
  const upTo = rYear || (intake ? 5 : 0);
  let n = 0;
  const out = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, tbl => {
    if (!/Posting period/.test(textOf(tbl))) return tbl;
    return tbl.replace(/<w:tr(?=[\s>])[^>]*>[\s\S]*?<\/w:tr>/g, tr => {
      const tcs = tr.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || [];
      if (tcs.length < 7) return tr;
      const code = s4Code(textOf(tcs[0]));
      if (!code) return tr;
      n++;
      const c = counts[code] || { total: 0 };
      const vals = [1, 2, 3, 4, 5].map(y => (intake && y <= upTo ? String(c[y] || 0) : ''));
      vals.push(String(c.total));
      let i = 0;
      return tr.replace(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g, tc => (i++ === 0 ? tc : fillCell(tc, [[[vals[i - 2], false]]])));
    });
  });
  return { xml: out, rows: n };
}

export function fillDocumentXml(xml, reflections, { name, media = null } = {}) {
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
    const filled = placeInSlots(hd, rows.slice(1), groups[hd.id], media).join('');
    out += tbl.slice(0, firstRow) + filled + tbl.slice(lastRow);
  }
  out += xml.slice(last);
  if (name) out = out.replace(/(Resident’s name\s*:\s*)_{6,}/, (_, p) => p + esc(name));
  if (media && media.used.length) out = ensureNamespaces(out);
  return { xml: out, matched: [...done] };
}

// ---------- Section 1: personal details and lists (profile.js) ----------

const markRPr = pPr => ((pPr.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0]).replace(/<w:b\/>|<w:bCs\/>|<w:b w:val="[^"]*"\/>|<w:bCs w:val="[^"]*"\/>/g, '');
// A table cell with its text replaced by `text` (one paragraph per line), keeping the cell's properties,
// its first paragraph's properties and the paragraph mark's font for the new runs.
function textCell(tc, text) {
  const open = tc.match(/^<w:tc(?:\s[^>]*)?>/)[0];
  const tcPr = (tc.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || [''])[0];
  const p0 = (tc.match(PARA_RE) || [''])[0];
  const pPr = (p0.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
  const rPr = markRPr(pPr);
  const ps = String(text ?? '').split('\n').map(l => `<w:p>${pPr}${l ? `<w:r>${rPr}<w:t xml:space="preserve">${esc(l)}</w:t></w:r>` : ''}</w:p>`);
  return `${open}${tcPr}${ps.join('')}</w:tc>`;
}
// exact row heights become minimums so longer (multi-line) entries are not cut off
const rowWith = (tr, values) => { let i = 0; return tr.replace(/(<w:trHeight\b[^>]*w:hRule=")exact"/, '$1atLeast"').replace(CELL_RE, tc => (i < values.length ? textCell(tc, values[i++]) : tc)); };

// "Label : ______" -> "Label : value": the first run of underscores takes the value, later ones go.
function fillBlank(p, value) {
  if (!value) return p;
  let done = false;
  return p.replace(/(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g, (all, a, t, b) => {
    if (!/_{2,}/.test(t)) return all;
    const nt = t.replace(/_{2,}/g, () => (done ? '' : (done = true, esc(value))));
    return `${a.startsWith('<w:t>') ? '<w:t xml:space="preserve">' : a}${nt}${b}`;
  });
}

// The ☐ before option n (0 = Male, 1 = Female) becomes ☒ (and its checkbox control is ticked).
function tickBox(tc, n) {
  let k = -1, at = -1;
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(tc))) {
    const j = m[1].indexOf('☐');
    if (j >= 0 && ++k === n) { at = m.index + m[0].indexOf('>') + 1 + j; break; }
  }
  if (at < 0) return tc;
  let out = tc.slice(0, at) + '☒' + tc.slice(at + 1);
  const sdt = out.lastIndexOf('<w:sdt>', at);
  if (sdt >= 0 && out.indexOf('</w:sdt>', sdt) > at) out = out.slice(0, sdt) + out.slice(sdt).replace(/<w14:checked w14:val="0"\/>/, '<w14:checked w14:val="1"/>');
  return out;
}

// Writes the profile into Section 1 of the template's document.xml: cover page, PERSONAL DETAILS and the
// list tables (rows filled in order, more added when needed, unused rows left empty), Remarks lines.
export function fillSection1Xml(xml, profile, { name = '' } = {}) {
  const p = cleanProfile(profile);
  const loc = locateSection1(xml);
  const edits = [];   // [start, end, replacement]
  const full = `${p.givenName.trim()} ${p.familyName.trim()}`.trim() || String(name || '').trim();
  const coverVal = { name: full, program: p.program.trim(), residencyStart: isoToDmy(p.residencyStart), seniorStart: isoToDmy(p.seniorStart) };
  for (const c of loc.cover) edits.push([c.start, c.end, fillBlank(xml.slice(c.start, c.end), coverVal[c.key])]);
  if (loc.personal) {
    const tbl = xml.slice(...loc.personal);
    const out = tbl.replace(ROW_RE, tr => {
      const cells = tr.match(CELL_RE) || [];
      if (cells.length < 2) return tr;
      const key = pdField(textOf(cells[0]));
      if (!key) return tr;
      let i = 0;
      const last = cells.length - 1;
      if (key === 'sex') return p.sex ? tr.replace(CELL_RE, tc => (i++ === last ? tickBox(tc, p.sex === 'F' ? 1 : 0) : tc)) : tr;
      const v = key === 'dob' ? isoToDmy(p.dob) : p[key];
      return v ? tr.replace(CELL_RE, tc => (i++ === last ? textCell(tc, v) : tc)) : tr;
    });
    edits.push([...loc.personal, out]);
  }
  const fillTable = (span, items, header) => {
    const tbl = xml.slice(...span);
    const rows = tbl.match(ROW_RE) || [];
    const data = rows.slice(header ? 1 : 0);
    if (!data.length || !items.length) return;
    const proto = data[data.length - 1];
    const filled = items.map((vals, k) => rowWith(data[k] || proto, vals));
    for (let k = items.length; k < data.length; k++) filled.push(data[k]);
    const a = tbl.indexOf(data[0]);
    const b = tbl.lastIndexOf(data[data.length - 1]) + data[data.length - 1].length;
    edits.push([...span, tbl.slice(0, a) + filled.join('') + tbl.slice(b)]);
  };
  for (const s of SECTIONS) if (loc.lists[s.key]) fillTable(loc.lists[s.key], p[s.key].map(it => s.columns.map(c => it[c.key])), true);
  if (loc.remarks && p.projectRemarks.trim()) fillTable(loc.remarks, p.projectRemarks.replace(/\s+$/, '').split('\n').map(l => [l]), false);
  edits.sort((x, y) => y[0] - x[0]);
  let out = xml;
  for (const [a, b, r] of edits) out = out.slice(0, a) + r + out.slice(b);
  return { xml: out, found: { cover: loc.cover.map(c => c.key), personal: !!loc.personal, lists: Object.keys(loc.lists), remarks: !!loc.remarks } };
}

// Plain layout: a simple "Personal details" section at the top.
function plainProfileXml(profile, H) {
  const p = cleanProfile(profile);
  let body = H('SECTION 1 – PERSONAL DETAILS', 28);
  const val = f => (f.type === 'date' ? isoToDmy(p[f.key]) : f.type === 'sex' ? ({ M: 'Male', F: 'Female' })[p[f.key]] || '' : p[f.key]);
  for (const f of PROFILE_FIELDS) {
    const v = val(f);
    if (!String(v).trim()) continue;
    const ls = String(v).split('\n');
    body += para('', run(f.label + ': ', true) + run(ls[0]));
    for (const l of ls.slice(1)) body += para('', run(l));
  }
  for (const s of SECTIONS) {
    if (!p[s.key].length && !(s.key === 'projects' && p.projectRemarks.trim())) continue;
    body += H(s.title, 22);
    for (const it of p[s.key]) body += para('', s.columns.filter(c => it[c.key].trim()).map((c, i) => (i ? run(' · ') : '') + run(c.label + ': ', true) + run(it[c.key].replace(/\n/g, ' '))).join(''));
    if (s.key === 'projects' && p.projectRemarks.trim()) body += para('', run('Remarks: ', true)) + p.projectRemarks.trim().split('\n').map(l => para('', run(l))).join('');
  }
  return body;
}

// ---------- fallback: a clean docx without the template ----------

const CELL_W = [1300, 1300, 2300, 4700];
const HEAD = ['Patient’s Initials', 'Date', 'Diagnosis/ Operations', 'Case details and Learning points'];
function plainTable(list, min, media) {
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join('');
  const tc = (i, body, shade) => `<w:tc><w:tcPr><w:tcW w:w="${CELL_W[i]}" w:type="dxa"/>${shade ? '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>' : ''}</w:tcPr>${body}</w:tc>`;
  const head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${HEAD.map((t, i) => tc(i, para('', run(t, true)), true)).join('')}</w:tr>`;
  const n = Math.max(min, list.length);
  const rows = Array.from({ length: n }, (_, k) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${rowCells(list[k], list[k] ? k + 1 : 0).map((c, i) => tc(i, paras('', c, media))).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="9600" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${CELL_W.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${head}${rows}</w:tbl>`;
}

export function plainDocumentXml(reflections, { name, media = null, profile = null } = {}) {
  const groups = groupReflections(reflections);
  const H = (t, size) => para(`<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr>`, `<w:r><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`);
  let body = H('Anaesthesiology Residency Training Portfolio', 32);
  if (name) body += para('', run('Resident’s name : ' + name));
  if (profile) body += plainProfileXml(profile, H);
  body += H('SECTION 2 – CASE REFLECTIONS', 28);
  body += para('', run('Each reflection: a title and case summary, then the learning points. “JR” above the date marks a junior residency reflection.'));
  let section = '';
  for (const hd of REFLECTION_HEADINGS) {
    if (hd.section !== section) { section = hd.section; body += H(section, 26); }
    body += H(`${hd.name} (Min ${hd.min})`, 22) + plainTable(groups[hd.id], hd.min, media) + para('', '');
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W_NS}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}" xmlns:a="${NS.a}" xmlns:pic="${NS.pic}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

function plainPackage(zip, docXml) {
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>');
  zip.file('word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="${W_NS}"><w:view w:val="print"/><w:zoom w:percent="100"/></w:settings>`);
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`);
  zip.file('word/document.xml', docXml);
}

const b64ToBytes = b64 => {
  if (typeof atob === 'function') return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return Uint8Array.from(Buffer.from(b64, 'base64'));
};

// reflections: reflection objects (any status). Returns a Blob (.docx).
// images: { [imageId]: { data (base64), mime, w, h } } for the reflections' figures.
// Word comments in the template (reviewers' notes) are not part of the portfolio: remove their anchors
// from the document and the comment parts from the package. Everything else in the template is kept.
export function stripComments(xml) {
  return xml
    .replace(/<w:commentRangeStart\b[^>]*\/>/g, '')
    .replace(/<w:commentRangeEnd\b[^>]*\/>/g, '')
    .replace(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:commentReference\b[^>]*\/>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, '')
    .replace(/<w:r\s[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:commentReference\b[^>]*\/>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, '')
    .replace(/<w:commentReference\b[^>]*\/>/g, '');
}
function dropCommentParts(zip) {
  const parts = Object.keys(zip.files).filter(n => /^word\/comments[A-Za-z]*\.xml$/.test(n));
  if (!parts.length) return;
  for (const n of parts) zip.remove(n);
  const rels = zip.file('word/_rels/document.xml.rels');
  const types = zip.file('[Content_Types].xml');
  return Promise.all([
    rels && rels.async('string').then(x => zip.file('word/_rels/document.xml.rels', x.replace(/<Relationship\b[^>]*Target="comments[A-Za-z]*\.xml"[^>]*\/>/g, ''))),
    types && types.async('string').then(x => zip.file('[Content_Types].xml', x.replace(/<Override\b[^>]*PartName="\/word\/comments[A-Za-z]*\.xml"[^>]*\/>/g, ''))),
  ]);
}

// Open in Print Layout: set <w:view w:val="print"/> in word/settings.xml. Schema order puts w:view
// right before w:zoom (after an optional w:writeProtection). Templates without a settings part are left
// alone (Word's default is print).
export function printLayoutSettings(xml) {
  if (/<w:view\b[^>]*\/>/.test(xml)) return xml.replace(/<w:view\b[^>]*\/>/, '<w:view w:val="print"/>');
  if (/<w:zoom\b/.test(xml)) return xml.replace(/<w:zoom\b/, '<w:view w:val="print"/><w:zoom');
  if (/<w:writeProtection\b[^>]*\/>/.test(xml)) return xml.replace(/(<w:writeProtection\b[^>]*\/>)/, '$1<w:view w:val="print"/>');
  return xml.replace(/(<w:settings\b[^>]*>)/, '$1<w:view w:val="print"/>');
}
async function setPrintLayout(zip) {
  const f = zip.file('word/settings.xml');
  if (f) zip.file('word/settings.xml', printLayoutSettings(await f.async('string')));
}

export async function exportPortfolio(reflections, { name = '', templateB64 = null, JSZip = null, cases = null, intake = null, rYear = null, images = null, profile = null } = {}) {
  const Z = JSZip || await needZip();
  let zip = null, usedTemplate = false, media = null;
  if (templateB64) {
    try {
      zip = await Z.loadAsync(b64ToBytes(templateB64));
      const xml = await zip.file('word/document.xml').async('string');
      media = newMedia(images, xml);
      let { xml: filled, matched } = fillDocumentXml(xml, reflections, { name, media });
      if (cases) filled = fillSummaryXml(filled, cases, { intake, rYear }).xml;
      if (profile || name) filled = fillSection1Xml(filled, profile || {}, { name }).xml;
      if (matched.length < REFLECTION_HEADINGS.length / 2) throw new Error('template headings not found');
      zip.file('word/document.xml', stripComments(filled));
      await dropCommentParts(zip);
      await setPrintLayout(zip);
      usedTemplate = true;
    } catch (err) { console.warn('Portfolio template unusable, using the plain layout', err); zip = null; }
  }
  if (!zip) { zip = new Z(); media = newMedia(images); plainPackage(zip, plainDocumentXml(reflections, { name, media, profile })); }
  await finishMedia(zip, media);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const blob = new Blob([bytes], { type: DOCX });
  blob.usedTemplate = usedTemplate;
  return blob;
}

// ---------- UI ----------

let templateCache = undefined;   // the loaded template; "none uploaded" is not cached, so an upload made
async function getTemplate() {    // after the page opened is picked up at the next export
  if (templateCache) return templateCache;
  try { templateCache = (cloud.loadTemplate ? await cloud.loadTemplate() : null) || undefined; }
  catch (err) { console.warn('Could not load the portfolio template', err); return null; }
  return templateCache || null;
}

// A button for the reflections screen (or Progress): getReflections() and getName() are called on click.
// getExtra() (may be async) may return { cases, intake, rYear } to fill Section 4 with the resident's case
// counts, and { images } with the pictures of the reflections' figures.
export function renderExportButton(getReflections, getName, getExtra) {
  // says up front which layout the export will use, so a missing template is noticed before exporting
  const note = h('span', { class: 'hint', style: 'display:block;margin-top:4px' }, 'Checking the portfolio template…');
  const paintNote = t => {
    note.textContent = t
      ? 'Exports into the official APMES portfolio: Section 1 (from Account → Portfolio details), the case reflection tables and the Section 4 numbers are filled in; everything else is kept for you to complete.'
      : 'No portfolio template uploaded yet, so the export is a plain layout without the portfolio’s preamble and other sections. An admin can upload it on the Admin tab.';
    note.style.color = t ? '' : 'var(--warn, #b45309)';
  };
  getTemplate().then(paintNote, () => paintNote(null));
  const btn = h('button', { onclick: async () => {
    btn.disabled = true;
    try {
      const refl = (await getReflections()) || [];
      const t = await getTemplate();
      paintNote(t);
      const name = (getName && getName()) || '';
      const blob = await exportPortfolio(refl, { name, templateB64: t && t.data, ...((getExtra && await getExtra()) || {}) });
      download(`APMES portfolio reflections${name ? ' - ' + name : ''}.docx`, blob);
      toast(blob.usedTemplate ? 'Portfolio exported.' : t ? 'The portfolio template could not be read, so the plain layout was used. Ask an admin to upload it again.' : 'Exported in the plain layout (no portfolio template uploaded yet).');
    } catch (err) { toast('Could not export: ' + err.message); }
    btn.disabled = false;
  } }, 'Export portfolio (Word)');
  return h('span', { style: 'display:block' }, btn, note);
}

// The uploaded template without Word comments (reviewers' notes): anchors stripped from document.xml and the
// comment parts dropped. Returns { bytes, matched (reflection tables found), comments (true if any removed) }.
export async function cleanTemplate(bytes, Z) {
  const zip = await Z.loadAsync(bytes);
  const xml = await zip.file('word/document.xml').async('string');
  const { matched } = fillDocumentXml(xml, []);
  const cleaned = stripComments(xml);
  const comments = cleaned !== xml || Object.keys(zip.files).some(n => /^word\/comments[A-Za-z]*\.xml$/.test(n));
  if (!comments) return { bytes, matched, comments };
  zip.file('word/document.xml', cleaned);
  await dropCommentParts(zip);
  return { bytes: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), matched, comments };
}

const TC = { info: null, loading: false, busy: false };
// Admin page card: upload the blank portfolio template (made with tools/build_portfolio_template.py).
export function renderTemplateCard() {
  const card = h('section', { class: 'card' }, h('h2', {}, 'Portfolio template'),
    h('p', { class: 'hint' }, 'The blank APMES portfolio (.docx) that “Export portfolio (Word)” fills in. Word comments in it are removed on upload. Make it from a filled portfolio with tools/build_portfolio_template.py, which clears every resident’s details. Do not upload a filled one. Without a template, exports use a plain layout.'));
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
        const Z = await needZip();
        const { bytes, matched, comments } = await cleanTemplate(new Uint8Array(await f.arrayBuffer()), Z);
        if (matched.length < REFLECTION_HEADINGS.length / 2) throw new Error(`only ${matched.length} of ${REFLECTION_HEADINGS.length} reflection tables found — is this the APMES portfolio?`);
        let bin = '';
        for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
        const b64 = btoa(bin);
        await cloud.saveTemplate(b64);
        templateCache = { data: b64, size: bytes.length, uploadedAt: Date.now() };
        TC.info = { size: bytes.length, uploadedAt: Date.now() };
        toast(`Template saved (${matched.length} reflection tables found${comments ? '; comments removed' : ''}).`);
      } catch (err) { toast('Could not upload: ' + err.message); }
      TC.busy = false; hooks.render();
    } })));
  return card;
}
