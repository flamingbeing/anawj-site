// Notes (More → Notes): a resident's own notepad. Private, never in the portfolio. Pure helpers, no DOM
// (tested in test/notepad.test.mjs).
//   logbooks/{email}/notes/{id} = { id, date: 'YYYY-MM-DD' | null, title, body (Markdown), caseId?, createdAt, updatedAt }
// The app keeps at most MAX_NOTES (the rules don't cap the count). The note index (meta/noteIndex { days, cases, n })
// says which days and cases have notes, so the Logbook can mark them before the notes are loaded; the rules cap its
// lists at INDEX_CAP, so it holds the most recent ones, and once the notes are loaded the marks come from them.

export const MAX_NOTES = 2000;
export const INDEX_CAP = 100;
export const LIMITS = { title: 200, body: 20000 };
export const NOTE_FIELDS = ['id', 'date', 'title', 'body', 'caseId', 'createdAt', 'updatedAt'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const str = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').slice(0, n);
export function cleanNote(n, now = Date.now()) {
  const src = n && typeof n === 'object' ? n : {};
  const out = {
    id: src.id ? String(src.id).slice(0, 100) : Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
    date: ISO.test(src.date || '') ? src.date : null,
    title: str(src.title, LIMITS.title).replace(/\n/g, ' '),
    body: str(src.body, LIMITS.body),
    createdAt: Number(src.createdAt) || now,
    updatedAt: now,
  };
  if (src.caseId) out.caseId = String(src.caseId).slice(0, 200);
  return out;
}

// undated first (newest change first), then by day, newest day first, and within a day in the order written
export function sortNotes(list) {
  return [...(list || [])].sort((a, b) => {
    if (!a.date !== !b.date) return a.date ? 1 : -1;
    if (!a.date) return (b.updatedAt || 0) - (a.updatedAt || 0);
    return b.date.localeCompare(a.date) || (a.createdAt || 0) - (b.createdAt || 0);
  });
}

// every word must appear in the title or body (case-insensitive); a day or case narrows it further
export function filterNotes(list, { q = '', day = '', caseId = '' } = {}) {
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  return (list || []).filter(n => (!day || n.date === day) && (!caseId || n.caseId === caseId)
    && words.every(w => (n.title + '\n' + n.body).toLowerCase().includes(w)));
}

export const notesOn = (list, date) => sortNotes((list || []).filter(n => n.date === date));
// the body's lines without Markdown marks (for titles and previews in the list)
export const plainLines = body => String(body || '').split('\n').map(l => l.replace(/^\s*(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, '').replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim()).filter(Boolean);
export const noteTitle = n => (n.title || '').trim() || (plainLines(n.body)[0] || '').slice(0, 80) || 'Untitled note';

// which days and cases have notes; with cap, only the latest days and the cases of the latest-changed notes (what the
// index doc can hold). sameIndex() says whether it needs writing again.
export function noteIndex(list, cap = Infinity) {
  const notes = list || [];
  const days = [...new Set(notes.map(n => n.date).filter(Boolean))].sort().slice(-cap);
  const recent = [...notes].filter(n => n.caseId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const cases = [...new Set(recent.map(n => n.caseId))].slice(0, cap).sort();
  return { days, cases, n: notes.length };
}
export function cleanNoteIndex(v) {
  const o = v && typeof v === 'object' ? v : {};
  const list = (x, ok) => (Array.isArray(x) ? x.filter(ok).slice(-INDEX_CAP) : []);
  return { days: list(o.days, d => ISO.test(d)), cases: list(o.cases, c => typeof c === 'string' && c.length <= 200), n: Number.isInteger(o.n) && o.n >= 0 ? o.n : 0 };
}
export const sameIndex = (a, b) => JSON.stringify(cleanNoteIndex(a)) === JSON.stringify(cleanNoteIndex(b));

// ---- light Markdown: headings, **bold**, bullet / numbered lists, [ ] checkboxes, links ----
// Parsed into plain blocks the page turns into elements (never innerHTML), so nothing typed can run as code.
//   { t: 'h', level, inl } | { t: 'p', inl } | { t: 'ul' | 'ol', items: [{ inl, check: null | bool, line }] }
// inl: [{ t: 'text', v } | { t: 'b', v } | { t: 'a', v, href }]; line is the item's line number (for ticking).
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|\*\*([^*\n]+)\*\*/g;
export function safeHref(href) {
  const s = String(href || '').trim();
  return /^(https?:|mailto:)/i.test(s) ? s : /^www\./i.test(s) ? 'https://' + s : '';
}
export function inline(text) {
  const out = [], s = String(text || '');
  let last = 0;
  for (const m of s.matchAll(LINK)) {
    if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) });
    if (m[4] != null) out.push({ t: 'b', v: m[4] });
    else {
      const href = safeHref(m[2] || m[3]);
      out.push(href ? { t: 'a', v: m[1] || m[3], href } : { t: 'text', v: m[0] });
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}
export function parseNote(body) {
  const lines = String(body || '').split('\n'), blocks = [];
  let para = null;
  const endPara = () => { if (para) { blocks.push({ t: 'p', inl: inline(para.join('\n')) }); para = null; } };
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    let m;
    if (!line.trim()) { endPara(); return; }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { endPara(); blocks.push({ t: 'h', level: m[1].length, inl: inline(m[2]) }); return; }
    if ((m = /^\s*(?:([-*+])|(\d+)[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(line))) {
      endPara();
      const t = m[1] ? 'ul' : 'ol', prev = blocks[blocks.length - 1];
      const item = { inl: inline(m[4]), check: m[3] == null ? null : m[3] !== ' ', line: i };
      if (prev && prev.t === t) prev.items.push(item); else blocks.push({ t, items: [item] });
      return;
    }
    (para ||= []).push(line);
  });
  endPara();
  return blocks;
}
// tick or untick the checkbox on one line of the body
export function toggleCheck(body, line) {
  const lines = String(body || '').split('\n');
  lines[line] = (lines[line] || '').replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/, (m, pre, x) => `${pre}[${x === ' ' ? 'x' : ' '}]`);
  return lines.join('\n');
}

// ---- Markdown export: a day's notes, and undated notes on their own ----
export function noteMd(n) {
  const title = (n.title || '').trim(), body = String(n.body || '').trim();
  return [title ? `### ${title}` : '', body].filter(Boolean).join('\n');
}
export const notesMd = list => sortNotes(list).map(noteMd).filter(Boolean).join('\n\n');

// ---- one file per note, for a zip: "2026-10-12 Title.md" (undated: "No date Title.md"), .md or .txt ----
// Markdown starts with "# Title"; plain text with the title on its own line. The date follows as "Date: …". The linked
// case is not named (its details stay in the logbook).
const fileSafe = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 60).trim();
export function noteFiles(list, fmt = 'md') {
  const ext = fmt === 'txt' ? 'txt' : 'md', used = new Set();
  return sortNotes(list).map(n => {
    const title = noteTitle(n), stem = `${n.date || 'No date'} ${fileSafe(title) || 'Untitled note'}`;
    let name = stem, i = 1;
    while (used.has(name.toLowerCase())) name = `${stem} ${++i}`;
    used.add(name.toLowerCase());
    const body = String(n.body || '').trim();
    const head = ext === 'md' ? `# ${title}` : title;
    const text = [head, n.date ? `Date: ${n.date}` : '', body].filter(Boolean).join('\n\n') + '\n';
    return { path: `${name}.${ext}`, text };
  });
}
