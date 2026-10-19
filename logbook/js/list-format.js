// Pasted-list format (Settings → Logging → Pasted list format): lets a list that isn't laid out as "cases separated by
// empty lines" still be read into cases. Pure, tested in test/list-format.test.mjs.
//   start    where a case begins, written as the text that starts it with {n} (a number), {initials}, {date} and {any}
//            (anything on the same line) standing in for what varies: "{n}. === {initials} (" . Never a raw regular
//            expression (nobody has to learn one, and a pasted pattern can't hang the page).
//   skip     characters dropped from the start of each case (after the start text), 0–200
//   dropEnd  texts dropped from the end of each case, comma separated: "===, --"
//   remove   texts removed wherever they appear in a case, comma separated: ") ==="
// A date in the text above the first case ("OR06 - 20 Oct 2026 (Tue)") is the date of every case that has none of its own.
// With no start text the empty-line splitting is unchanged; skip and dropEnd still apply to each case.

const MAX_START = 80, MAX_SKIP = 200;
const DATE_RE = '\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[\\/.\\-]\\d{1,2}(?:[\\/.\\-](?:\\d{4}|\\d{2}))?|\\d{1,2} ?[A-Za-z]{3,9}\\.?(?: ?\\d{4})?';
const TOKEN = { n: '\\d{1,3}', initials: '[A-Za-z][A-Za-z.\\-]{0,7}', date: '(?:' + DATE_RE + ')', any: '[^\\n]{0,150}?' };
const esc = s => s.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');

export const cleanDropEnd = v => (Array.isArray(v) ? v : String(v || '').split(/[\n,]+/)).map(x => String(x || '').trim().slice(0, 20)).filter(Boolean).slice(0, 10);

// the stored format, or null when it does nothing
export function cleanListFormat(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const start = String(v.start || '').replace(/\s+/g, ' ').trim().slice(0, MAX_START);
  const skip = Math.max(0, Math.min(MAX_SKIP, Math.floor(Number(v.skip)) || 0));
  const dropEnd = cleanDropEnd(v.dropEnd).join(', ');
  const remove = cleanDropEnd(v.remove).join(', ');
  if (!start && !skip && !dropEnd && !remove) return null;
  return { ...(start ? { start } : {}), ...(skip ? { skip } : {}), ...(dropEnd ? { dropEnd } : {}), ...(remove ? { remove } : {}) };
}

// A start text needs something fixed in it, or it would match everywhere.
export const startUsable = tpl => String(tpl || '').replace(/\{(?:n|initials|date|any)\}/gi, '').replace(/\s+/g, '') !== '';

// -> { re, groups: ['initials', 'date'] in capture order } or null
export function startRegex(tpl) {
  if (!startUsable(tpl)) return null;
  const groups = [];
  let src = '', anys = 0;
  for (const part of String(tpl).trim().split(/(\{(?:n|initials|date|any)\})/i)) {
    const tok = /^\{(n|initials|date|any)\}$/i.exec(part);
    if (!tok) { src += part.split(/(\s+)/).map(p => (/^\s+$/.test(p) ? '\\s*' : esc(p))).join(''); continue; }
    const k = tok[1].toLowerCase();
    // {any} is bounded, but two of them would make a long paste crawl (150 x 150 tries at every position): only the first counts
    if (k === 'any' && anys++) continue;
    if ((k === 'initials' || k === 'date') && !groups.includes(k)) { groups.push(k); src += '(' + TOKEN[k] + ')'; }   // only the first of each is read
    else src += TOKEN[k];
  }
  try { return { re: new RegExp(src, 'gi'), groups }; } catch { return null; }
}

// Cut the text into cases where the start text appears: [{ initials, date, body }] (initials / date '' when the start
// text doesn't capture them); text before the first start is left out. null: no start text set, or none found, so the
// caller splits by empty lines as usual.
export function splitByStart(text, fmt) {
  const rx = fmt && fmt.start ? startRegex(fmt.start) : null;
  if (!rx) return null;
  const src = String(text || '');
  const hits = [...src.matchAll(rx.re)].filter(m => m[0].length);
  if (!hits.length) return null;
  const at = k => rx.groups.indexOf(k) + 1;   // 0: the start text doesn't capture it
  const out = hits.map((m, i) => ({
    initials: at('initials') ? m[at('initials')] || '' : '',
    date: at('date') ? m[at('date')] || '' : '',
    body: src.slice(m.index + m[0].length, i + 1 < hits.length ? hits[i + 1].index : src.length),
  }));
  out.head = src.slice(0, hits[0].index);   // what comes before the first case (a title, the day's date)
  return out;
}

// The date tokens in a piece of text, in order of appearance ("OR06 - 20 Oct 2026 (Tue)" -> ["20 Oct 2026"]); the caller
// keeps the first one that is a real date.
export const dateTokens = text => [...String(text || '').matchAll(new RegExp('(?<![\\w/.\\-])(?:' + DATE_RE + ')(?![\\w/])', 'gi'))].map(m => m[0]);

// The case text with skip characters off its start and the dropEnd texts off its end (repeatedly, "=== ===" too).
export function trimCase(s, fmt) {
  let t = String(s || '');
  for (const r of cleanDropEnd(fmt && fmt.remove)) t = t.replace(new RegExp(r.split(/(\s+)/).map(p => (/^\s+$/.test(p) ? '\\s*' : esc(p))).join(''), 'gi'), ' ');
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n');
  const skip = fmt && fmt.skip ? Math.min(MAX_SKIP, Number(fmt.skip) || 0) : 0;
  if (skip) t = t.trimStart().slice(skip);
  t = t.trim();
  const ends = cleanDropEnd(fmt && fmt.dropEnd).sort((a, b) => b.length - a.length);
  for (let go = ends.length > 0; go;) {
    go = false;
    const low = t.toLowerCase();
    for (const e of ends) if (low.endsWith(e.toLowerCase())) { t = t.slice(0, t.length - e.length).trimEnd(); go = true; break; }
  }
  return t;
}

// Teach it by example (Settings → Logging → Teach it my format): the resident pastes a sample and marks spans in it,
// { role, s, e } with s/e offsets into the sample. Roles: 'start' (the text that begins a case, e.g. "1. === AAB ("),
// 'initials' and 'date' (inside the start span), 'skip' (characters to skip after it), 'end' (text that ends a case) and 'remove' (text to
// remove wherever it appears, e.g. a closing ") ==="); end and remove can be marked any number of times. Numbers in the fixed text become {n}, so "2." and "3." match too.
// -> { format } (cleanListFormat shape) or { error } saying what is missing.
export const MARK_ROLES = ['start', 'initials', 'date', 'skip', 'end', 'remove'];
export function learnFormat(sample, marks) {
  const text = String(sample || '');
  const ms = (Array.isArray(marks) ? marks : []).filter(m => m && MARK_ROLES.includes(m.role) && Number.isInteger(m.s) && Number.isInteger(m.e) && m.s >= 0 && m.e <= text.length && m.e > m.s);
  const st = ms.find(m => m.role === 'start');
  if (!st) return { error: 'Mark the text that starts a case first (for example "1. === AB (").' };
  const lit = s => s.replace(/[{}]/g, '').replace(/\s+/g, ' ').replace(/\d+/g, '{n}');
  const inner = MARK_ROLES.slice(1, 3).map(r => ms.find(m => m.role === r && m.s >= st.s && m.e <= st.e)).filter(Boolean).sort((a, b) => a.s - b.s);
  let tpl = '', pos = st.s;
  for (const m of inner) { if (m.s < pos) continue; tpl += lit(text.slice(pos, m.s)) + '{' + m.role + '}'; pos = m.e; }
  tpl += lit(text.slice(pos, st.e));
  tpl = tpl.replace(/(\{n\})+/g, '{n}').trim();
  if (!startUsable(tpl)) return { error: 'The start needs some fixed text too, such as "===" or "Case", not just a number or the initials.' };
  const sk = ms.find(m => m.role === 'skip');
  const dropEnd = ms.filter(m => m.role === 'end').map(m => text.slice(m.s, m.e).trim());
  const remove = ms.filter(m => m.role === 'remove').map(m => text.slice(m.s, m.e).trim());
  const format = cleanListFormat({ start: tpl, skip: sk ? sk.e - sk.s : 0, dropEnd, remove });
  return format ? { format } : { error: 'Nothing to learn from those marks.' };
}
