// Section 1 of the APMES portfolio ("General"): the resident's personal details and lists (memberships,
// awards, …), stored on logbooks/{email}.profile and written into the exported portfolio by
// portfolio.js (fillSection1Xml). Pure module (no DOM): node test in test/profile.test.mjs.
// parseSection1() reads the same fields back out of a filled portfolio's word/document.xml.

export const MAX_ITEMS = 40, MAX_STR = 2000, MAX_LONG = 4000;

// Scalar fields. type: text | long (multi-line) | date ('YYYY-MM-DD') | sex ('' | 'M' | 'F')
export const PROFILE_FIELDS = [
  { key: 'familyName', label: 'Family name (surname)', type: 'text' },
  { key: 'givenName', label: 'Given name', type: 'text' },
  { key: 'sex', label: 'Sex', type: 'sex' },
  { key: 'dob', label: 'Date of birth', type: 'date' },
  { key: 'graduation', label: 'Date and place of graduation (university)', type: 'text', hint: 'e.g. 12/06/2018, University of …' },
  { key: 'postgrad', label: 'Postgraduate qualifications (with dates)', type: 'long' },
  { key: 'program', label: 'Program', type: 'text' },
  { key: 'programDirector', label: 'Program Director', type: 'text' },
  { key: 'residencyStart', label: 'Commencement date of residency', type: 'date' },
  { key: 'seniorStart', label: 'Commencement date of senior residency', type: 'date' },
];

// The list tables, in template order. title: the heading above the table in the template.
const col = (key, label, long = false) => ({ key, label, long });
export const SECTIONS = [
  { key: 'memberships', title: 'Membership and activities in professional organisations',
    columns: [col('year', 'Year'), col('post', 'Post Held'), col('org', 'Organisation'), col('achievements', 'Achievements', true)] },
  { key: 'awards', title: 'Awards and prizes', columns: [col('date', 'Date of Award'), col('title', 'Title of Award'), col('purpose', 'Purpose / Aim', true)] },
  { key: 'scholarships', title: 'Scholarships awarded', columns: [col('date', 'Date of Award'), col('title', 'Title of Award'), col('purpose', 'Purpose / Aim', true)] },
  { key: 'electives', title: 'Overseas electives',
    columns: [col('period', 'Period'), col('duration', 'Duration'), col('department', 'Department'), col('institution', 'Institution'), col('country', 'Country'), col('purpose', 'Purpose', true)] },
  { key: 'projects', title: 'Formal project',
    columns: [col('date', 'Date'), col('title', 'Title & Aim of Research', true), col('coworkers', 'Co-workers'), col('completion', 'Completion date')] },
  { key: 'papers', title: 'Papers published', columns: [col('authors', 'Author(s)'), col('title', 'Title', true), col('journal', 'Journal (Reference)')] },
  { key: 'courses', title: 'List of courses, seminars & conferences attended',
    columns: [col('dateVenue', 'Date / Venue'), col('details', 'Details (conference title and papers presented)', true)] },
  { key: 'teaching', title: 'Summary of teaching experience',
    columns: [col('year', 'Year of Training (SR1, SR2)'), col('summary', 'Summary (audience, topics, duration)', true)] },
];
for (const s of SECTIONS) s.cols = s.columns;   // alias

export function emptyProfile() {
  const p = {};
  for (const f of PROFILE_FIELDS) p[f.key] = '';
  for (const s of SECTIONS) p[s.key] = [];
  p.projectRemarks = '';
  return p;
}

const str = (v, max = MAX_STR) => (v == null ? '' : String(v)).replace(/\r\n?/g, '\n').slice(0, max);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function cleanProfile(p) {
  const src = p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  const out = emptyProfile();
  for (const f of PROFILE_FIELDS) {
    const v = str(src[f.key], f.type === 'long' ? MAX_LONG : MAX_STR);
    if (f.type === 'sex') out[f.key] = v === 'M' || v === 'F' ? v : '';
    else if (f.type === 'date') out[f.key] = (ISO.test(v.trim()) && dmyToIso(v.trim())) || '';
    else out[f.key] = v;
  }
  for (const s of SECTIONS) {
    const list = Array.isArray(src[s.key]) ? src[s.key] : [];
    out[s.key] = list.filter(x => x && typeof x === 'object')
      .map(x => Object.fromEntries(s.columns.map(c => [c.key, str(x[c.key])])))
      .filter(x => Object.values(x).some(v => v.trim()))
      .slice(0, MAX_ITEMS);
  }
  out.projectRemarks = str(src.projectRemarks, MAX_LONG);
  return out;
}

// ---------- dates ----------

export function isoToDmy(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// a real calendar date (no 31/02 or month 13)
const realDate = (y, mo, d) => { const x = new Date(Date.UTC(y, mo - 1, d)); return x.getUTCFullYear() === y && x.getUTCMonth() === mo - 1 && x.getUTCDate() === d; };
const isoOf = (y, mo, d) => (realDate(y, mo, d) ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '');
// "14/03/1995", "14-3-95", "1995-03-14", "14 March 1995", "14th Mar 95" -> "1995-03-14"; anything else -> ''
export function dmyToIso(s) {
  const t = String(s || '').trim();
  let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) return isoOf(+m[1], +m[2], +m[3]);
  const year = y => (y.length === 2 ? Number(y) + (Number(y) > 50 ? 1900 : 2000) : Number(y));
  if ((m = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2}|\d{4})$/.exec(t))) return isoOf(year(m[3]), +m[2], +m[1]);
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]*([a-z]{3,9})\.?,?[\s\-/.]*(\d{2}|\d{4})$/i.exec(t))) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    return mo ? isoOf(year(m[3]), mo, +m[1]) : '';
  }
  return '';
}

// ---------- locating Section 1 in document.xml (shared by the filler and the reader) ----------

const nrm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Text of a run of XML: w:t text, with w:br as a line break and w:tab as a space; deleted and moved-away text left out.
export const xmlText = x => (x.replace(/<w:(del|moveFrom)\b[\s\S]*?<\/w:\1>/g, '').match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:br\b[^>]*\/>|<w:cr\/>|<w:tab\/>/g) || [])
  .map(t => (/^<w:(br|cr)\b/.test(t) ? '\n' : t === '<w:tab/>' ? ' ' : t.replace(/<[^>]+>/g, ''))).join('')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export const PARA_RE = /<w:p(?=[\s>])[^>]*>[\s\S]*?<\/w:p>/g;
export const ROW_RE = /<w:tr(?=[\s>])[^>]*>[\s\S]*?<\/w:tr>/g;
export const CELL_RE = /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g;
// Text of a cell: its paragraphs joined by newlines.
export const cellText = tc => (tc.match(PARA_RE) || []).map(xmlText).join('\n');

function tablesOf(xml) {
  const out = [];
  const re = /<w:tbl>|<w:tbl\s[^>]*>|<\/w:tbl>/g;
  let depth = 0, start = -1, m;
  while ((m = re.exec(xml))) {
    if (m[0] !== '</w:tbl>') { if (depth++ === 0) start = m.index; }
    else if (--depth === 0) out.push([start, re.lastIndex]);
  }
  return out;
}

// Personal details rows: label (normalised, prefix) -> field. Order matters (programdirector before program).
const PD_LABELS = [['familyname', 'familyName'], ['givenname', 'givenName'], ['sex', 'sex'], ['dateofbirth', 'dob'],
  ['dateandplaceofgraduation', 'graduation'], ['postgraduate', 'postgrad'], ['programdirector', 'programDirector'], ['program', 'program']];
export const pdField = label => { const n = nrm(label); const hit = PD_LABELS.find(([p]) => n.startsWith(p)); return hit ? hit[1] : null; };

// Cover page: which field a paragraph with a "label : ____" line is, from its own label and its neighbours.
function coverField(label, prev, next) {
  const n = nrm(label);
  if (n.startsWith('residentsname') || n.startsWith('residentname')) return 'name';
  if (n === 'program' || n === 'programme') return 'program';
  if (n.startsWith('dateof') || n.startsWith('commencementdateof')) {
    if (/senior/.test(n) || /^seniorresidency/.test(nrm(next))) return 'seniorStart';
    if (/residency/.test(n)) return 'residencyStart';
  }
  return null;
}

// Finds Section 1 in document.xml. Returns
// { cover: [{ start, end, key }], personal: [start, end] | null, lists: { key: [start, end] }, remarks: [start, end] | null }
// (character spans in xml). Only the first match of each is returned.
export function locateSection1(xml) {
  const res = { cover: [], personal: null, lists: {}, remarks: null };
  const tables = tablesOf(xml);
  const firstTbl = tables.length ? tables[0][0] : xml.length;
  // cover page: paragraphs before the first table
  const paras = [];
  PARA_RE.lastIndex = 0;
  let m;
  while ((m = PARA_RE.exec(xml)) && m.index < firstTbl) paras.push({ start: m.index, end: PARA_RE.lastIndex, text: xmlText(m[0]) });
  const nonEmpty = paras.filter(p => p.text.trim());
  const seen = new Set();
  nonEmpty.forEach((p, i) => {
    const c = p.text.indexOf(':');
    if (c < 0) return;
    const key = coverField(p.text.slice(0, c), (nonEmpty[i - 1] || {}).text, (nonEmpty[i + 1] || {}).text);
    if (key && !seen.has(key)) { seen.add(key); res.cover.push({ start: p.start, end: p.end, key }); }
  });
  // tables
  let last = 0;
  for (const [a, b] of tables) {
    const tbl = xml.slice(a, b);
    const before = (xml.slice(last, a).match(PARA_RE) || []).map(xmlText).map(s => s.trim()).filter(Boolean).slice(-3);
    last = b;
    const rows = tbl.match(ROW_RE) || [];
    if (!rows.length) continue;
    const head = (rows[0].match(CELL_RE) || []).map(xmlText);
    if (!res.personal && /^personaldetails/.test(nrm(head.join('')))) { res.personal = [a, b]; continue; }
    if (!res.remarks && res.lists.projects && before.length && nrm(before[before.length - 1]) === 'remarks' && head.length === 1) { res.remarks = [a, b]; continue; }
    for (const s of SECTIONS) {
      if (res.lists[s.key] || head.length !== s.columns.length) continue;
      if (!before.some(t => nrm(t).startsWith(nrm(s.title)))) continue;
      if (!nrm(head[0]).startsWith(nrm(s.columns[0].label).slice(0, 4))) continue;
      res.lists[s.key] = [a, b];
      break;
    }
  }
  return res;
}

// ---------- reading a filled portfolio ----------

const MARK = /[☒☑🗹✓✔Xx]/u;
export function parseSex(text) {
  const t = String(text || '');
  const marked = /([☒☑🗹✓✔])\s*(female|male)/iu.exec(t);
  if (marked) return /^f/i.test(marked[2]) ? 'F' : 'M';
  const plain = t.replace(/\(please[^)]*\)/i, '').trim();
  if (/☐/.test(plain) || MARK.test(plain) && plain.length > 8) return '';
  if (/^(f|female)$/i.test(plain)) return 'F';
  if (/^(m|male)$/i.test(plain)) return 'M';
  return '';
}

const valueAfterColon = s => { const i = s.indexOf(':'); return (i < 0 ? '' : s.slice(i + 1)).replace(/_{2,}/g, '').trim(); };

// Section 1 of a filled portfolio (word/document.xml) -> a profile (cleanProfile'd).
export function parseSection1(xml) {
  const p = emptyProfile();
  if (!xml || typeof xml !== 'string') return p;
  const loc = locateSection1(xml);
  for (const c of loc.cover) {
    const v = valueAfterColon(xmlText(xml.slice(c.start, c.end)));
    if (c.key === 'program') p.program = v;
    else if (c.key === 'residencyStart' || c.key === 'seniorStart') p[c.key] = dmyToIso(v);
  }
  if (loc.personal) {
    for (const tr of xml.slice(...loc.personal).match(ROW_RE) || []) {
      const cells = tr.match(CELL_RE) || [];
      if (cells.length < 2) continue;
      const key = pdField(xmlText(cells[0]));
      if (!key) continue;
      const vc = cells[cells.length - 1];
      if (key === 'sex') { p.sex = parseSex(xmlText(vc)); continue; }
      const v = cellText(vc).replace(/^\s*:\s*/, '').trim();
      if (key === 'dob') p.dob = dmyToIso(v);
      else if (v || !p[key]) p[key] = v;   // the table's Program wins over the cover page's
    }
  }
  for (const s of SECTIONS) {
    if (!loc.lists[s.key]) continue;
    const rows = (xml.slice(...loc.lists[s.key]).match(ROW_RE) || []).slice(1);
    p[s.key] = rows.map(tr => {
      const cells = tr.match(CELL_RE) || [];
      return Object.fromEntries(s.columns.map((c, i) => [c.key, cells[i] ? cellText(cells[i]).trim() : '']));
    });
  }
  if (loc.remarks) {
    p.projectRemarks = (xml.slice(...loc.remarks).match(ROW_RE) || []).map(tr => cellText(tr)).join('\n').replace(/\s+$/, '');
  }
  return cleanProfile(p);
}
