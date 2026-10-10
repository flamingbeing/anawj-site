// Upload reflections from a Word portfolio (.docx): pure parsing, no DOM (node-testable).
// Reads every table whose header row starts "Patient's Initials" (APMES portfolio Section 2), finds its
// heading from the paragraphs above (same tolerant match as portfolio.js), and turns each filled row into
// a reflection: col1 initials, col2 "JR" + date, col3 sub-type + diagnosis, col4 title, case summary,
// learning points, figures (embedded pictures + "Figure N: …" captions) and references. Text that doesn't
// fit the structure goes into the case summary, so nothing is lost.

import { REFLECTION_HEADINGS, REFLECTION_SECTIONS } from './categories.js';
import { topTables, parasOf, headingFor, norm, esc } from './portfolio.js';
import { parseDate } from './engine.js';
import { LIMITS } from './reflections.js';

const HD_BY_ID = Object.fromEntries(REFLECTION_HEADINGS.map(h => [h.id, h]));
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const on = (rPr, tag) => { const m = new RegExp(`<w:${tag}(?:\\s[^>]*)?/?>`).exec(rPr || ''); return !!m && !/w:val="(0|false|off|none)"/.test(m[0]); };

// One paragraph -> lines (split at manual line breaks): { text, bold, u, imgs: [rId], num }.
export function paraLines(p) {
  const pPr = (p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
  const num = /<w:numPr>/.test(pPr);
  const styleBold = /<w:pStyle w:val="(Heading\d|Title|Strong)"/i.test(pPr);
  const lines = [{ runs: [], imgs: [] }];
  const body = p.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, '').replace(/<w:del\b[\s\S]*?<\/w:del>/g, '');
  for (const r of body.match(/<w:r(?=[\s>])[^>]*>[\s\S]*?<\/w:r>/g) || []) {
    const rPr = (r.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
    const bold = styleBold || on(rPr, 'b') || /<w:rStyle w:val="Strong"/i.test(rPr);
    const u = on(rPr, 'u');
    const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br(?:\s[^>]*)?\/>|<w:cr\/>|r:embed="([^"]+)"|<v:imagedata[^>]*r:id="([^"]+)"/g;
    let m;
    while ((m = re.exec(r))) {
      const line = lines[lines.length - 1];
      if (m[1] != null) line.runs.push({ t: decode(m[1]), bold, u });
      else if (m[2] || m[3]) line.imgs.push(m[2] || m[3]);
      else if (m[0].startsWith('<w:tab')) line.runs.push({ t: ' ', bold, u });
      else if (/type="(page|column)"/.test(m[0])) continue;
      else lines.push({ runs: [], imgs: [] });
    }
  }
  return lines.map((l, i) => {
    const text = l.runs.map(x => x.t).join('').replace(/ /g, ' ').replace(/\s+$/, '');
    const vis = l.runs.filter(x => x.t.trim());
    return { text, bold: vis.length > 0 && vis.every(x => x.bold), u: vis.length > 0 && vis.every(x => x.u), imgs: l.imgs, num: num && i === 0 };
  });
}
const cellLines = tc => parasOf(tc).flatMap(paraLines);
const trimBlank = ls => { let a = 0, b = ls.length; while (a < b && !ls[a].text.trim() && !ls[a].imgs.length) a++; while (b > a && !ls[b - 1].text.trim() && !ls[b - 1].imgs.length) b--; return ls.slice(a, b); };
const joinText = ls => trimBlank(ls).map(l => l.text).join('\n').trim();

const LP = /^(learning|reflection|teaching|key learning)\s*points?\s*[:.]?$/i;
const REFS = /^(references?|bibliography)\s*[:.]?$/i;
const NUM = /^\(?\d{1,2}[.)](?:\s+|$)/;
const CAPTION = /^fig(?:ure)?\.?\s*\d+\s*[:.\-–—]?\s*/i;
const SECTION_BY_NAME = Object.fromEntries(REFLECTION_SECTIONS.map(s => [norm(s.name), s.id]));

// Column 4 -> { title, summary, points, figures: [{ rid, caption, point }], references, sections? }.
export function parseDetails(lines) {
  const ls = trimBlank(lines);
  const out = { title: '', summary: '', points: [], figures: [], references: [] };
  if (!ls.length) return out;
  const isMarker = (l, re) => re.test(l.text.trim()) && (l.bold || l.u || l.text.trim().length < 25);
  let iLP = ls.findIndex(l => isMarker(l, LP));
  let iRef = ls.findIndex((l, i) => i > iLP && isMarker(l, REFS));
  // figures: a picture line, with the caption on the next non-empty line ("Figure 2: …")
  const used = new Set();
  const figsIn = (from, to, point) => {
    for (let i = from; i < to; i++) {
      if (!ls[i].imgs.length) continue;
      let cap = '';
      let j = i + 1;
      while (j < to && !ls[j].text.trim() && !ls[j].imgs.length) j++;
      if (j < to && !ls[j].imgs.length && CAPTION.test(ls[j].text.trim())) { cap = ls[j].text.trim().replace(CAPTION, ''); used.add(j); }
      for (const rid of ls[i].imgs) out.figures.push({ rid, caption: cap.slice(0, LIMITS.caption), point: typeof point === 'function' ? point(i) : point });
    }
  };
  const textOnly = (from, to) => ls.slice(from, to).filter((l, k) => !used.has(from + k) && (l.text.trim() || !l.imgs.length));

  // old-style one-box-per-section reflections: bold "Case description", "Evaluation", …
  if (iLP < 0) {
    const secAt = ls.map(l => (l.bold ? SECTION_BY_NAME[norm(l.text)] : null));
    if (secAt[0] && secAt.filter(Boolean).length >= 2) {
      figsIn(0, ls.length, null);
      const sections = {};
      let cur = secAt[0], buf = [];
      const flush = () => { if (cur) sections[cur] = [sections[cur], joinText(buf)].filter(Boolean).join('\n'); buf = []; };
      ls.forEach((l, i) => { if (secAt[i]) { flush(); cur = secAt[i]; } else if (!used.has(i)) buf.push(l); });
      flush();
      out.sections = sections;
      return out;
    }
  }
  const endSummary = iLP >= 0 ? iLP : (iRef >= 0 ? iRef : ls.length);
  figsIn(0, endSummary, null);
  const head = trimBlank(textOnly(0, endSummary));
  if (head.length > 1 && head[0].bold && head[0].text.trim().length <= LIMITS.title) {
    out.title = head[0].text.trim();
    out.summary = joinText(head.slice(1));
  } else out.summary = joinText(head);

  if (iLP >= 0) {
    const end = iRef >= 0 ? iRef : ls.length;
    const starts = (l) => {
      const t = l.text.trim();
      if (!t || l.imgs.length || CAPTION.test(t)) return false;
      if (t.length > LIMITS.pointHeading) return NUM.test(t);
      return l.u || l.bold || l.num || NUM.test(t);
    };
    // which point each line belongs to (for figures)
    const pointOf = [];
    let cur = null;
    for (let i = iLP + 1; i < end; i++) {
      const l = ls[i];
      if (starts(l) && !used.has(i)) {
        const t = l.text.trim().replace(NUM, '');
        cur = t.length <= LIMITS.pointHeading ? { heading: t, lines: [] } : { heading: '', lines: [{ ...l, text: t }] };
        out.points.push(cur);
      } else if (!l.imgs.length) {
        if (!cur) { cur = { heading: '', lines: [] }; out.points.push(cur); }
        cur.lines.push({ ...l, i });
      }
      pointOf[i] = out.points.length ? out.points.length - 1 : null;
    }
    figsIn(iLP + 1, end, i => pointOf[i] ?? null);
    out.points = out.points.map(p => ({ heading: p.heading, text: joinText(p.lines.filter(l => !used.has(l.i))) }));
    if (out.points.length > LIMITS.points) {
      const extra = out.points.splice(LIMITS.points - 1);
      out.points.push({ heading: extra[0].heading, text: [extra[0].text, ...extra.slice(1).map(p => [p.heading, p.text].filter(Boolean).join('\n'))].filter(Boolean).join('\n\n') });
    }
  }
  if (iRef >= 0) {
    figsIn(iRef + 1, ls.length, null);
    const refs = textOnly(iRef + 1, ls.length).map(l => l.text.trim()).filter(Boolean).map(t => t.replace(NUM, '').replace(/^\d{1,2}[.)]\s*/, ''));
    if (refs.length > LIMITS.references) refs.splice(LIMITS.references - 1, refs.length, refs.slice(LIMITS.references - 1).join(' '));
    out.references = refs;
  }
  if (out.summary.length > LIMITS.summary) out.summary = out.summary.slice(0, LIMITS.summary);
  out.figures = out.figures.slice(0, LIMITS.figures);
  return out;
}

// The sub-type a diagnosis label names ("On pump CABG" -> 'on'), like portfolio.js matches template slots.
export function subFor(hd, text) {
  const label = norm(text);
  if (!hd || !hd.subs || !label) return null;
  const s = hd.subs.find(x => { const n = norm(x.name); return label === n || label.startsWith(n) || (label.length >= 4 && n.startsWith(label)) || label.startsWith(n.slice(0, 6)); });
  return s ? s.id : null;
}

// Heading for the paragraphs above a table; tolerates list labels like "A)" or "12." in front.
const LABEL = /^\s*(\(?[A-Za-z]{1,2}\)|\(?[ivxIVX]{1,4}\)|\d{1,2}[.)])\s*/;
export function headingAbove(between) {
  const hd = headingFor(between);
  if (hd) return hd;
  const ps = parasOf(between).map(p => paraLines(p).map(l => l.text).join(' ').trim()).filter(Boolean).map(t => t.replace(LABEL, ''));
  return headingFor(ps.map(t => `<w:p><w:r><w:t>${esc(t)}</w:t></w:r></w:p>`).join(''));
}

const MON3 = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?/i;
// Column 2 -> { jr, date, dateText }. dateText is what was written when the date can't be read exactly.
export function parseDateCell(lines) {
  let text = lines.map(l => l.text.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  let jr = false;
  text = text.replace(/\bJR\b[:.\-]?/gi, () => { jr = true; return ' '; }).replace(/\s+/g, ' ').trim();
  const t = text.replace(/(\d)\s+(st|nd|rd|th)\b/gi, '$1$2').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  let date = parseDate(t) || parseDate(t.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+/i, ''));
  if (!date) {   // "Dec 21, 2024", "December 21st 2024"
    const m = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{2,4})$/i.exec(t);
    if (m && MON3.test(m[1])) date = parseDate(`${m[2]} ${m[1]} ${m[3]}`);
  }
  return { jr, date, dateText: date ? '' : text };
}

// Column 1 -> initials (drops the row number "3." and anything after a line break that is a number).
export function parseInitials(lines) {
  const parts = lines.map(l => l.text.trim()).filter(Boolean).filter(t => !/^\d{1,3}[.)]?$/.test(t)).map(t => t.replace(/^\d{1,3}[.)]\s*/, ''));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

const cellsOf = tr => tr.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || [];

// One table row -> a reflection draft (or null for an empty / prompt-only row).
export function parseRow(tr, hd) {
  const cells = cellsOf(tr).map(cellLines);
  while (cells.length < 4) cells.push([]);
  if (cells.length > 4) cells[3] = cells.slice(3).flatMap((c, i) => (i ? [{ text: '', imgs: [] }, ...c] : c));
  const initials = parseInitials(cells[0]);
  const d = parseDateCell(cells[1]);
  let diagLines = trimBlank(cells[2]);
  let subId = null;
  if (diagLines.length && hd && hd.subs) {
    const first = diagLines[0];
    subId = subFor(hd, first.text);
    if (subId && first.bold && first.text.trim().length <= 60) diagLines = diagLines.slice(1);
    if (!subId) for (const l of diagLines) if ((subId = subFor(hd, l.text))) break;
  }
  const diagnosis = joinText(diagLines);
  const details = parseDetails(cells[3]);
  const hasDetails = !!(details.title || details.summary || details.points.length || details.figures.length || details.references.length || details.sections);
  if (!initials && !d.date && !d.dateText && !hasDetails && (!diagnosis || (subId && !diagLines.length) || subFor(hd, diagnosis))) return null;
  // pre-printed prompts ("JR", a sub-type, "Emergency Neurosurgery") with nothing else filled in
  if (!initials && !d.date && !d.dateText && !hasDetails && diagnosis.length <= 80) return null;
  const warnings = [];
  if (!d.date) warnings.push(d.dateText ? `date “${d.dateText}” not read` : 'no date');
  if (!initials) warnings.push('no initials');
  if (hd && hd.subs && !subId) warnings.push('sub-type not found');
  return { headingId: hd ? hd.id : '', subId, initials: initials.slice(0, 20), date: d.date, dateText: d.dateText, jr: d.jr, diagnosis: diagnosis.slice(0, 2000), ...details, warnings };
}

// document.xml -> rows grouped by heading: [{ ...reflection, figures: [{ rid, caption, point }] }].
export function parseDocumentXml(xml) {
  const out = [];
  let last = 0, prevHd = null;
  for (const [a, b] of topTables(xml)) {
    const tbl = xml.slice(a, b);
    const between = xml.slice(last, a);
    last = b;
    const rows = tbl.match(/<w:tr(?=[\s>])[^>]*>[\s\S]*?<\/w:tr>/g) || [];
    const hIdx = rows.findIndex(tr => /^Patient/i.test(cellLines(cellsOf(tr)[0] || '').map(l => l.text).join(' ').trim()));
    const betweenText = parasOf(between).map(p => paraLines(p).map(l => l.text).join('')).join('').trim();
    let hd = null;
    if (hIdx >= 0) hd = headingAbove(between) || (!betweenText ? prevHd : null);
    else if (!betweenText && prevHd && rows.length && cellsOf(rows[0]).length >= 4) hd = prevHd;   // table continued after a page break
    else continue;
    prevHd = hd;
    let n = 0;
    for (const tr of rows.slice(hIdx + 1)) {
      const r = parseRow(tr, hd);
      if (r) { r.order = out.length; r.rowInTable = ++n; if (!hd) r.warnings.unshift('heading not recognised'); out.push(r); }
    }
  }
  return out;
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };
// A .docx (ArrayBuffer / Uint8Array) -> { items, images: { rid: { data (base64), mime, name } }, headings }.
// Pictures in formats a browser can't draw (EMF/WMF) are dropped from the figures and their captions kept as text.
export async function parseDocx(bytes, JSZip) {
  let zip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error('not a Word .docx file'); }
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('not a Word .docx file (no document)');
  const xml = await docFile.async('string');
  const items = parseDocumentXml(xml);
  const relsF = zip.file('word/_rels/document.xml.rels');
  const rels = {};
  if (relsF) for (const m of (await relsF.async('string')).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0]), t = /Target="([^"]+)"/.exec(m[0]);
    if (id && t && !/TargetMode="External"/.test(m[0])) rels[id[1]] = t[1].replace(/^\//, '').replace(/^word\//, '');
  }
  const images = {};
  for (const r of items) {
    const keep = [];
    for (const f of r.figures) {
      const target = rels[f.rid];
      const ext = target && (target.split('.').pop() || '').toLowerCase();
      if (!images[f.rid] && target && MIME[ext]) {
        const file = zip.file('word/' + target);
        if (file) images[f.rid] = { data: await file.async('base64'), mime: MIME[ext], name: target.split('/').pop() };
      }
      if (images[f.rid]) keep.push(f);
      else {
        r.warnings.push('a picture could not be read');
        if (f.caption) r.summary = [r.summary, 'Figure: ' + f.caption].filter(Boolean).join('\n');
      }
    }
    r.figures = keep;
  }
  return { items, images, headings: new Set(items.map(r => r.headingId).filter(Boolean)).size };
}

// Same patient: initials compared case-insensitively, same date.
export const sameKey = (a, b) => !!a && !!b && String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
