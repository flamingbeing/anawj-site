// Markdown: one format (Settings → Markdown, logbook.settings.markdown) for Copy / Share on the Logbook tab
// and for the notes-app export (a zip of notes for Obsidian and the like). No DOM here, so it is unit-tested.
//
// Templates take fill-ins as {{name}} (the older {name} from the Copy & share format works too). A line whose
// fill-ins are all empty is left out, so a case with no initials doesn't leave a gap. A value is put in as it
// is and never read again as a template, so "{{x}}" typed in a case stays as typed.
//
// Case fill-ins: {{date}} (in the chosen date format) {{iso}} 2026-10-10 · {{day}} 10 Oct 2026 · {{weekday}} Sat
// {{n}} the case's number in the day · {{count}} cases that day · {{initials}} · {{details}} (also {{case}}) the
// case without its initials · {{categories}} (names, codes or #tags, as chosen) · {{categoryCodes}} · {{tags}}
// personal tags · {{reflection}} a link to the case's reflection note, if it has one.

import { fmtDate, caseParts, sortCodes } from './engine.js';
import { BY_CODE, DEFAULT_NAMES } from './categories.js';
import { HEADING_BY_ID } from './reflections.js';
import { notesMd, sortNotes } from './notepad.js';
import { boldLabels } from './parts.js';

export const DEFAULT_MARKDOWN = {
  // Copy / Share (the same as the Copy & share format's default before this page existed)
  // the day heading: 'plain' 2026-10-10 (default since log2 15; was a [[link]]) | 'heading' # 2026-10-10 |
  // 'link' [[2026-10-10]] (to the day's note, named by fileDate) | 'custom' (dayHead and oneCase as typed)
  dayHeadStyle: 'plain',
  dayHead: '{{date}}',
  dayCase: '{{n}}. {{initials}}\n{{details}}',
  oneCase: '{{date}}\n{{initials}}\n{{details}}',
  // the day's own notes (More → Notes), after its cases; or put {{notes}} in the day heading to place them there
  dayNotes: '## Notes\n\n{{notes}}',
  dateFormat: 'iso',            // 'iso' 2026-10-10 | 'compact' 20261010 | 'long' 10 Oct 2026 | 'wlong' Sat 10 Oct 2026 | 'dmy' 10/10/2026 | 'custom' (datePattern)
  datePattern: '',              // custom: YYYY YY MMMM MMM MM M DD D dddd ddd ([text] stays as typed)
  fileDate: 'same',             // file names and [[link]] targets: 'same' as dateFormat (slashes become spaces), or their own
  fileDatePattern: '',
  cats: 'names',                // {{categories}}: 'names' | 'codes' | 'tags' (#LSCS)
  links: 'wiki',                // 'wiki' [[note]] | 'md' [note](note.md)
  boldLabels: false,
  // under each case in a day or one case (log2 15): its reflections 'none' | 'link' | 'embed' (Obsidian ![[…]]) | 'full'
  // (the note's text); Link and Embed need the reflection's note (the export, Sync), else Full text. Linked notes:
  // 'none' | 'full' (a note has no file of its own; under its case it leaves the day's Notes)
  reflInDay: 'none',
  notesInDay: 'none',            // labelled parts (Settings → Advanced logging) as **Plan:** … in {{details}}
  // the notes export
  caseNotes: 'month',           // one note per 'month' or per 'day'
  folders: 'month',             // reflection notes: 'month' | 'heading' | 'flat'
  fileName: '{{date}} {{initials}} {{heading}}',
  frontMatter: true,
  fmFields: ['date', 'heading', 'status', 'tags'],
  reflTitle: '# {{title}}',
  reflSummary: '**{{initials}}** · {{date}} · {{diagnosis}}\n\n{{summary}}',
  reflPoint: '## {{point}}\n\n{{text}}',
  reflFigure: '{{image}}\n*{{caption}}*',
  reflRefs: '## References\n\n{{references}}',
};
export const CASE_FILLINS = ['date', 'dateLink', 'iso', 'day', 'weekday', 'n', 'count', 'initials', 'details', 'categories', 'categoryCodes', 'tags', 'reflection'];
export const REFL_FILLINS = ['title', 'date', 'iso', 'day', 'initials', 'diagnosis', 'heading', 'status', 'summary', 'point', 'text', 'n', 'image', 'caption', 'references'];
export const FM_FIELDS = ['date', 'heading', 'status', 'tags', 'initials', 'diagnosis', 'jr'];
const TEXT_KEYS = ['dayHead', 'dayCase', 'dayNotes', 'oneCase', 'fileName', 'reflTitle', 'reflSummary', 'reflPoint', 'reflFigure', 'reflRefs'];
export const HEAD_STYLES = { plain: '{{date}}', heading: '# {{date}}', link: '{{dateLink}}' };
const OLD_ONE = '[[{{date}}]]\n{{initials}}\n{{details}}';   // the one-case default before the styles
const oneCaseFor = style => `${HEAD_STYLES[style]}\n{{initials}}\n{{details}}`;
const CHOICES = { reflInDay: ['none', 'link', 'embed', 'full'], notesInDay: ['none', 'full'], dayHeadStyle: ['plain', 'heading', 'link', 'custom'], dateFormat: ['iso', 'compact', 'long', 'wlong', 'dmy', 'custom'], fileDate: ['same', 'iso', 'compact', 'long', 'wlong', 'custom'], cats: ['names', 'codes', 'tags'], links: ['wiki', 'md'], caseNotes: ['month', 'day'], folders: ['month', 'heading', 'flat'] };
const MAX_FIELD = 1000;
export const MAX_JSON = 8 * 1024;   // what settings.markdown may take in the account

// A stored format, cleaned: unknown keys dropped, empty or odd values back to the default. Without one, the
// older Copy & share format (settings.shareFormat) carries over, so a format someone set keeps working.
export function cleanMarkdown(m, shareFormat = null) {
  const out = { ...DEFAULT_MARKDOWN, fmFields: [...DEFAULT_MARKDOWN.fmFields] };
  const src = m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  const legacy = !m && shareFormat && typeof shareFormat === 'object' ? shareFormat : {};
  for (const k of TEXT_KEYS) {
    const v = typeof src[k] === 'string' ? src[k] : typeof legacy[k] === 'string' ? legacy[k] : '';
    const t = v.replace(/\r\n?/g, '\n').slice(0, MAX_FIELD);
    if (t.trim()) out[k] = t;
  }
  for (const [k, ok] of Object.entries(CHOICES)) if (ok.includes(src[k])) out[k] = src[k];
  for (const k of ['datePattern', 'fileDatePattern']) if (typeof src[k] === 'string') out[k] = src[k].replace(/[\r\n]+/g, ' ').slice(0, 60);
  // the day heading: a heading typed before the styles existed (or in the old Copy & share format) is Custom;
  // otherwise the style writes dayHead, and oneCase too unless that was typed
  const typed = k => [src[k], legacy[k]].some(v => typeof v === 'string' && v.trim());
  if (!CHOICES.dayHeadStyle.includes(src.dayHeadStyle)) out.dayHeadStyle = typed('dayHead') ? 'custom' : 'plain';
  if (out.dayHeadStyle !== 'custom') {
    out.dayHead = HEAD_STYLES[out.dayHeadStyle];
    if (!typed('oneCase') || [...Object.keys(HEAD_STYLES).map(oneCaseFor), OLD_ONE].includes(out.oneCase)) out.oneCase = oneCaseFor(out.dayHeadStyle);
  }
  if (typeof src.frontMatter === 'boolean') out.frontMatter = src.frontMatter;
  if (typeof src.boldLabels === 'boolean') out.boldLabels = src.boldLabels;
  if (Array.isArray(src.fmFields)) out.fmFields = FM_FIELDS.filter(f => src.fmFields.includes(f));
  return out;
}
// what is saved: only what differs from the default, so a later default change reaches everyone else
export function storedMarkdown(m) {
  const c = cleanMarkdown(m), out = {};
  for (const [k, v] of Object.entries(c)) if (JSON.stringify(v) !== JSON.stringify(DEFAULT_MARKDOWN[k])) out[k] = v;
  // a style's own heading and one-case line follow the style (not kept as typed)
  if (c.dayHeadStyle !== 'custom') { delete out.dayHead; if (c.oneCase === oneCaseFor(c.dayHeadStyle)) delete out.oneCase; }
  if (c.dateFormat !== 'custom') delete out.datePattern;
  if (c.fileDate !== 'custom') delete out.fileDatePattern;
  if (JSON.stringify(out).length > MAX_JSON) throw new Error('The Markdown format is too long');
  return Object.keys(out).length ? out : null;
}

// Fill a template. {{name}} or {name}; unknown names are left as they are; lines whose fill-ins are all empty go.
export function fill(tpl, vals) {
  const re = /\{\{(\w+)\}\}|\{(\w+)\}/g;
  return String(tpl).split('\n').map(line => {
    const keys = [...line.matchAll(re)].map(m => m[1] || m[2]).filter(k => k in vals);
    // an empty fill-in between words leaves one space, not two (the indent at the start of a line stays)
    const out = line.replace(re, (m, a, b) => { const k = a || b; return k in vals ? String(vals[k] ?? '') : m; }).replace(/\s+$/, '')
      .replace(/^(\s*)(.*)$/, (m, ind, rest) => ind + (keys.length ? rest.replace(/ {2,}/g, ' ') : rest));
    const bare = line.replace(re, '').trim();
    if (keys.length && keys.every(k => !String(vals[k] ?? '').trim()) && !/[A-Za-z0-9]/.test(bare)) return null;
    return out;
  }).filter(l => l !== null).join('\n');
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const isIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const weekday = iso => { if (!isIso(iso)) return ''; const [y, m, d] = iso.split('-').map(Number); return WD[new Date(y, m - 1, d).getDay()]; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// a date in a pattern: YYYY 2026 · YY 26 · MMMM October · MMM Oct · MM 10 · M 10 · DD 05 · D 5 · dddd Saturday · ddd Sat;
// [text] stays as typed. An empty pattern is the ISO date.
export function fmtPattern(iso, pattern) {
  if (!isIso(iso)) return '';
  if (!String(pattern || '').trim()) return iso;
  const [y, m, d] = iso.split('-').map(Number), wd = new Date(y, m - 1, d).getDay();
  const v = { YYYY: String(y), YY: String(y).slice(-2), MMMM: MONTHS_FULL[m - 1], MMM: MON[m - 1], MM: String(m).padStart(2, '0'), M: String(m), DD: String(d).padStart(2, '0'), D: String(d), dddd: DAYS[wd], ddd: DAYS[wd].slice(0, 3) };
  return String(pattern).replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd/g, (t, lit) => (lit != null ? lit : v[t]));
}
const PRESET = { compact: 'YYYYMMDD', wlong: 'ddd D MMM YYYY' };
export function fmtMdDate(iso, style = 'iso', pattern = '') {
  if (!isIso(iso)) return '';
  if (style === 'long') return fmtDate(iso);
  if (style === 'dmy') { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
  if (PRESET[style]) return fmtPattern(iso, PRESET[style]);
  if (style === 'custom') return fmtPattern(iso, pattern);
  return iso;
}
// {{date}} as the format chooses; the day note's name (and [[link]] target), without slashes
export const mdDate = (iso, f) => fmtMdDate(iso, f.dateFormat, f.datePattern);
export const fileDate = (iso, f) => (isIso(iso) ? safeName(f.fileDate === 'same' || !f.fileDate ? mdDate(iso, f) : fmtMdDate(iso, f.fileDate, f.fileDatePattern)) : '');
// {{dateLink}}: a link to the day's note, showing {{date}} when the name differs
export function dateLink(iso, f) {
  if (!isIso(iso)) return '';
  const name = fileDate(iso, f), shown = mdDate(iso, f);
  return f.links === 'md' ? `[${shown.replace(/[[\]]/g, '\\$&')}](${encodeURIComponent(name)}.md)` : name === shown ? `[[${name}]]` : `[[${name}|${shown}]]`;
}

// #tags: letters, digits, - and _ only ("CNB(Obs)" -> "#CNB-Obs")
export const tagSlug = s => '#' + String(s || '').trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '');
const catFull = (code, ctx) => (ctx.catName && ctx.catName(code)) || (DEFAULT_NAMES[code] && DEFAULT_NAMES[code][0]) || (BY_CODE[code] && BY_CODE[code].name) || code;
const catShortName = (code, ctx) => (ctx.catShort && ctx.catShort(code)) || (DEFAULT_NAMES[code] && DEFAULT_NAMES[code][1]) || (BY_CODE[code] && BY_CODE[code].name) || code;
export function catsText(cats, style, ctx = {}) {
  const codes = sortCodes(cats || []);
  if (style === 'codes') return codes.join(', ');
  if (style === 'tags') return codes.map(c => tagSlug(catShortName(c, ctx))).join(' ');
  return codes.map(c => catFull(c, ctx)).join(', ');
}
export const headingLabel = id => (id && HEADING_BY_ID[id] ? HEADING_BY_ID[id].label || HEADING_BY_ID[id].name : 'Uncategorised');

// a link to another note in the export: [[path|label]] or [label](path.md), paths from the export's root
export function noteLink(path, label, links = 'wiki', from = '') {
  const p = String(path).replace(/\.md$/, '');
  if (links === 'wiki') return label && label !== p.split('/').pop() ? `[[${p}|${label}]]` : `[[${p}]]`;
  const up = from.split('/').slice(0, -1).map(() => '..').join('/');
  const href = (up ? up + '/' : '') + p.split('/').map(encodeURIComponent).join('/') + '.md';
  return `[${String(label || p.split('/').pop()).replace(/[[\]]/g, '\\$&')}](${href})`;
}

// ctx.labels: the labelled parts in use (Settings → Advanced logging), or none
function caseVals(c, n, count, f, ctx) {
  const p = caseParts(c);
  const text = String(p.details || '').trim(), details = f.boldLabels && ctx.labels ? boldLabels(text, ctx.labels) : text;
  return {
    date: mdDate(c.date, f) || c.dateText || '', dateLink: dateLink(c.date, f), iso: c.date || '', day: c.date ? fmtDate(c.date) : (c.dateText || ''), weekday: weekday(c.date),
    n: n ?? '', count: count ?? '', initials: p.initials, details, case: details,
    categories: catsText(c.cats, f.cats, ctx), categoryCodes: sortCodes(c.cats || []).join(', '),
    tags: (c.tags || []).map(k => (ctx.tagName ? ctx.tagName(k) : k)).filter(Boolean).join(', '),
    reflection: ctx.reflectionLink ? ctx.reflectionLink(c) || '' : '',
  };
}

// What goes under a case: its reflections and linked notes, as chosen. ctx.reflectionsOf(c) -> [r]; ctx.reflPath(r) ->
// the reflection note's path where one exists (the export, Sync), else '' (Link and Embed then give the full text);
// ctx.notesOf(c) -> [n]. Their headings go two levels down, under the day's.
const demote = t => t.replace(/^(#{1,4}) /gm, '$1## ');
function underCase(c, f, ctx) {
  const out = [];
  if (f.reflInDay !== 'none' && ctx.reflectionsOf) for (const r of ctx.reflectionsOf(c) || []) {
    const path = ctx.reflPath ? ctx.reflPath(r) || '' : '', title = r.title || r.diagnosis || 'Reflection';
    if (path && f.reflInDay === 'embed' && f.links === 'wiki') out.push(`![[${path.replace(/\.md$/, '')}]]`);
    else if (path && f.reflInDay !== 'full') out.push('Reflection: ' + noteLink(path, title, f.links));   // (Markdown links can't embed)
    else out.push(demote(reflectionNote(r, { ...f, frontMatter: false }).trim()));
  }
  if (f.notesInDay === 'full' && ctx.notesOf) { const t = notesMd(ctx.notesOf(c) || []); if (t) out.push(demote(t)); }
  return out.join('\n\n');
}
const withUnder = (text, c, f, ctx) => { const u = underCase(c, f, ctx); return u ? `${text}\n\n${u}` : text; };

// Copy / Share: one case, and a day (heading, then each case; a blank line between cases when the case
// format takes more than one line, none for a one-line format)
export function mdCase(c, m, ctx = {}) { const f = cleanMarkdown(m); return withUnder(fill(f.oneCase, caseVals(c, 1, 1, f, ctx)), c, f, ctx); }
// notes: that day's notes (More → Notes); {{notes}} in the day heading puts them there, otherwise they follow the
// cases in the dayNotes format. A day without notes gets no Notes heading.
export function mdDay(date, cases, m, ctx = {}, notes = []) {
  const f = cleanMarkdown(m);
  // notes linked to one of the day's cases go under it (Linked notes: Full text), not in the day's Notes too
  if (f.notesInDay === 'full' && ctx.notesOf) { const ids = new Set(cases.map(c => c.id)); notes = notes.filter(n => !(n.caseId && ids.has(n.caseId))); }
  const nText = notesMd(notes);
  const vals = { date: mdDate(date, f), dateLink: dateLink(date, f), iso: date || '', day: date ? fmtDate(date) : 'No date', weekday: weekday(date), count: cases.length };
  const inHead = /\{\{?notes\}?\}/.test(f.dayHead);
  const head = fill(f.dayHead, inHead ? { ...vals, notes: nText } : vals);
  const parts = cases.map((c, i) => [fill(f.dayCase, caseVals(c, i + 1, cases.length, f, ctx)), underCase(c, f, ctx)]);
  const sep = f.dayCase.includes('\n') || parts.some(([, u]) => u) ? '\n\n' : '\n';
  const body = parts.map(([t, u]) => (u ? `${t}\n\n${u}` : t)).join(sep);
  const tail = !inHead && nText ? fill(f.dayNotes, { ...vals, notes: nText }) : '';
  return [head, body].filter(Boolean).join('\n') + (tail ? (head || body ? '\n\n' : '') + tail : '');
}

// ---- the notes export ----

// a file or folder name: no / \ : * ? " < > | or control characters, no leading dots, at most 120 characters
export const safeName = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 120).trim() || 'Untitled';
// YAML front matter: every value quoted (JSON strings are valid YAML), lists in brackets
const yaml = v => (Array.isArray(v) ? `[${v.map(x => JSON.stringify(String(x))).join(', ')}]` : typeof v === 'boolean' ? String(v) : JSON.stringify(String(v ?? '')));
export function frontMatter(fields) {
  const rows = Object.entries(fields).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length));
  return rows.length ? `---\n${rows.map(([k, v]) => `${k}: ${yaml(v)}`).join('\n')}\n---\n\n` : '';
}

const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function reflectionPath(r, f, used = new Set()) {
  const base = safeName(fill(f.fileName, { date: fileDate(r.date, f) || 'No date', iso: r.date || '', initials: r.initials || '', heading: headingLabel(r.headingId), title: r.title || '', diagnosis: r.diagnosis || '' }).replace(/\n/g, ' '));
  const folder = f.folders === 'heading' ? `Reflections/${safeName(headingLabel(r.headingId))}` : f.folders === 'month' ? `Reflections/${r.date ? r.date.slice(0, 7) : 'No date'}` : 'Reflections';
  let p = `${folder}/${base}.md`, i = 2;
  while (used.has(p.toLowerCase())) p = `${folder}/${base} (${i++}).md`;
  used.add(p.toLowerCase());
  return p;
}

// one reflection as a note. images: { [figureImageId]: 'images/<file>' } for the figures included in the zip
export function reflectionNote(r, m, { path = '', images = {}, caseLink = '' } = {}) {
  const f = cleanMarkdown(m);
  const base = { title: r.title || r.diagnosis || 'Reflection', date: mdDate(r.date, f), iso: r.date || '', day: r.date ? fmtDate(r.date) : '', initials: r.initials || '', diagnosis: r.diagnosis || '', heading: headingLabel(r.headingId), status: r.status || 'draft', summary: String(r.summary || '').trim() };
  const fm = f.frontMatter ? frontMatter(Object.fromEntries(f.fmFields.map(k => [k,
    k === 'date' ? (r.date || '') : k === 'heading' ? base.heading : k === 'status' ? base.status : k === 'initials' ? base.initials : k === 'diagnosis' ? base.diagnosis
      : k === 'jr' ? !!r.jr : ['apmes/reflection', tagSlug(base.heading).slice(1)]]))) : '';
  const figs = (r.figures || []).filter(x => x && x.id);
  const figText = fg => {
    const file = images[fg.id];
    const image = !file ? '' : f.links === 'wiki' ? `![[${file}]]` : `![${String(fg.caption || '').replace(/[[\]]/g, '')}](${path.split('/').slice(0, -1).map(() => '..').join('/')}/${file})`;
    return file || fg.caption ? fill(f.reflFigure, { ...base, image, caption: fg.caption || '' }) : '';
  };
  const parts = [fill(f.reflTitle, base), fill(f.reflSummary, base), caseLink];
  (r.points || []).forEach((pt, i) => {
    const free = (r.points || []).length === 1 && !String(pt.heading || '').trim();   // free text: "Learning points"
    parts.push(fill(f.reflPoint, { ...base, n: i + 1, point: pt.heading || (free ? 'Learning points' : `Learning point ${i + 1}`), text: String(pt.text || '').trim() }));
    for (const fg of figs.filter(x => x.point === i)) parts.push(figText(fg));
  });
  for (const fg of figs.filter(x => x.point == null || x.point >= (r.points || []).length)) parts.push(figText(fg));
  const refs = (r.references || []).filter(x => String(x || '').trim());
  if (refs.length) parts.push(fill(f.reflRefs, { ...base, references: refs.map((x, i) => `${i + 1}. ${String(x).trim()}`).join('\n') }));
  return fm + parts.filter(x => x && x.trim()).join('\n\n') + '\n';
}

// case notes: one per month ("Cases/2026-10.md") or per day ("Cases/2026-10/2026-10-10.md")
// notes: dated notes join their day (a day with only notes still gets its note); undated notes go in Notes.md
export function caseNotes(cases, m, ctx = {}, notes = []) {
  const f = cleanMarkdown(m);
  const byDay = new Map(), notesBy = new Map();
  for (const n of notes) if (n.date) { if (!notesBy.has(n.date)) notesBy.set(n.date, []); notesBy.get(n.date).push(n); }
  for (const c of [...cases].sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')) || (a.createdAt || 0) - (b.createdAt || 0))) {
    const k = c.date || ''; if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(c);
  }
  for (const d of notesBy.keys()) if (!byDay.has(d)) byDay.set(d, []);
  const order = [...byDay.keys()].sort((a, b) => String(a || '9999').localeCompare(String(b || '9999')));
  const sorted = new Map(order.map(k => [k, byDay.get(k)]));
  byDay.clear(); for (const [k, v] of sorted) byDay.set(k, v);
  const files = [];
  const dayText = (date, list) => (date ? mdDay(date, list, f, ctx, notesBy.get(date) || []) : `## No date\n${list.map((c, i) => fill(f.dayCase, caseVals(c, i + 1, list.length, f, ctx))).join('\n')}`);
  if (f.caseNotes === 'day') {
    for (const [date, list] of byDay) {
      const path = date ? `Cases/${date.slice(0, 7)}/${fileDate(date, f)}.md` : 'Cases/No date.md';
      const fm = f.frontMatter ? frontMatter({ date, cases: String(list.length), ...(notesBy.has(date) ? { notes: String(notesBy.get(date).length) } : {}), tags: ['apmes/cases'] }) : '';
      files.push({ path, text: fm + dayText(date, list) + '\n' });
    }
  } else {
    const byMonth = new Map();
    for (const [date, list] of byDay) { const k = date ? date.slice(0, 7) : ''; if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k).push([date, list]); }
    for (const [month, days] of byMonth) {
      const n = days.reduce((a, [, l]) => a + l.length, 0);
      const title = month ? `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}` : 'No date';
      const fm = f.frontMatter ? frontMatter({ month, cases: String(n), tags: ['apmes/cases'] }) : '';
      files.push({ path: `Cases/${month || 'No date'}.md`, text: fm + `# ${title} (${n} case${n === 1 ? '' : 's'})\n\n` + days.map(([d, l]) => dayText(d, l)).join('\n\n') + '\n' });
    }
  }
  return files;
}

// Progress.md: case counts per tag against targets, and reflections per heading against the minimum.
// rows: engine progress(); refl: reflections.js reflectionProgress(); year: 'R3'
export function progressNote(rows, refl, { year = '', today = '', ctx = {} } = {}) {
  const cell = s => String(s ?? '').replace(/\|/g, '\\|');
  const status = { done: 'done ✓', ontrack: 'on track', due: 'due this year', late: 'behind' };
  const tagRows = rows.filter(r => (r.milestones || []).length).map(r => {
    const next = r.next ? `${r.next.n} by ${r.next.by}` : 'all met';
    return `| ${cell(catFull(r.code, ctx))} | ${r.count} | ${cell(next)} | ${status[r.status] || r.status || ''} |`;
  });
  const hd = refl.headings.map(x => `| ${cell(x.label || x.name)} | ${x.counted} | ${x.min} | ${x.met ? 'met ✓' : `${x.min - x.counted} to go`} |`);
  return [`# APMES progress${year ? ` (${year})` : ''}`, ...(today ? ['', `Exported ${today}.`] : []),
    '', '## Cases', '', '| Tag | Logged | Next target | Status |', '|---|---|---|---|', ...tagRows,
    '', `## Reflections (${refl.totals.counted} of ${refl.totals.min} counted)`, '', '| Heading | Counted | Minimum | |', '|---|---|---|---|', ...hd].join('\n') + '\n';
}

// Every file of the export: [{ path, text }]; figures come separately (the caller fetches the pictures).
// opts: { cases: true, reflections: true, progress: true }; images: { [imageId]: 'images/<file>' }
export function exportNotes({ cases = [], reflections = [], notes = [], m = null, ctx = {}, images = {}, progress = null, opts = {} }) {
  const f = cleanMarkdown(m);
  const o = { cases: true, reflections: true, progress: true, notes: true, ...opts };
  const myNotes = o.notes ? notes : [];
  const files = [], used = new Set();
  const reflPath = new Map();
  if (o.reflections) for (const r of reflections) reflPath.set(r.id, reflectionPath(r, f, used));
  const byCase = new Map(reflections.filter(r => r.caseId && reflPath.has(r.id)).map(r => [r.caseId, r]));
  const caseCtx = { ...ctx, reflectionLink: c => { const r = byCase.get(c.id); return r ? noteLink(reflPath.get(r.id), r.title || 'Reflection', f.links) : ''; },
    reflectionsOf: c => (o.reflections ? reflections.filter(r => r.caseId === c.id) : []), reflPath: r => reflPath.get(r.id) || '', notesOf: c => myNotes.filter(n => n.caseId === c.id) };
  if (o.cases || myNotes.some(n => n.date)) files.push(...caseNotes(o.cases ? cases : [], f, caseCtx, myNotes));
  const undated = myNotes.filter(n => !n.date);
  if (undated.length) files.push({ path: 'Notes.md', text: (f.frontMatter ? frontMatter({ notes: String(undated.length), tags: ['apmes/notes'] }) : '') + '# Notes\n\n' + notesMd(sortNotes(undated)) + '\n' });
  if (o.reflections) for (const r of reflections) {
    const path = reflPath.get(r.id);
    const c = r.caseId && o.cases ? cases.find(x => x.id === r.caseId) : null;
    const caseLink = c && c.date ? 'Case: ' + noteLink(f.caseNotes === 'day' ? `Cases/${c.date.slice(0, 7)}/${fileDate(c.date, f)}` : `Cases/${c.date.slice(0, 7)}`, mdDate(c.date, f), f.links, path) : '';
    files.push({ path, text: reflectionNote(r, f, { path, images, caseLink }) });
  }
  if (o.progress && progress) files.push({ path: 'Progress.md', text: progressNote(progress.rows, progress.refl, { year: progress.year, today: progress.today, ctx }) });
  return files;
}
