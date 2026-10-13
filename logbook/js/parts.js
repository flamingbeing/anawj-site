// Labelled parts in the case summary (Settings → Advanced logging → Labelled parts; an account setting, off by
// default). One box stays one box: a line that starts with a label and a colon ("lp: …", "Plan: …", "ASA 2: …")
// starts a part, which runs to the next labelled line or the end. Text before the first one is the main part (what
// the case summary always was). Nothing is stored apart: the text stays exactly as typed, so backups, Excel and
// CSV are unchanged, and turning the setting off shows plain text again.
//
// Rules: the label must start the line (a list mark "- " or bold "**PE:**" is fine), the colon is required and case
// doesn't matter, so "LP" alone (lumbar puncture) is never a label. A number may follow: "lp1:", "lp 2:", "ASA 2:".
// Also the case template (text put into an empty case box) and the 2000-character split. Pure, no DOM; tested in
// test/parts.test.mjs.

// lp and dt are the defaults; people add their own (ASA, PE, Ix, Plan …). n: the name shown in bold; also: other
// words that mean the same label; hide: left out of Logbook rows (still searched, exported and shown when editing)
export const DEFAULT_LABELS = [
  { k: 'lp', n: 'Learning point', also: ['learning', 'learning point', 'learning points'] },
  { k: 'dt', n: 'Case details' },
];
export const MAX_LABELS = 20;
// what a case's details may hold (logbook/firestore.rules caps it)
export const MAX_DETAILS = 2000;
export const MAX_TEMPLATE = 500;

// a label word: starts with a letter, then letters, digits, spaces and & / . ' - (no digit at the end: "lp1" is
// lp numbered 1)
const WORD = /^\p{L}(?:[\p{L}\p{N} &/.'-]{0,22}[\p{L}&/.'-])?$/u;
const word = v => String(v ?? '').replace(/\s+/g, ' ').trim();
export const labelWordOk = v => WORD.test(word(v));

// A stored list, cleaned: a missing one is the defaults; bad words dropped; one entry per word. Every label's own
// word is reserved first, so another label's "also" word never pushes a label (and its name and hide) out
export function cleanLabels(v) {
  if (!Array.isArray(v)) return DEFAULT_LABELS.map(x => ({ ...x, ...(x.also ? { also: [...x.also] } : {}) }));
  const keep = [], seen = new Set();
  for (const x of v) {
    if (!x || typeof x !== 'object' || keep.length >= MAX_LABELS) continue;
    const k = word(x.k);
    if (!labelWordOk(k) || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    keep.push([x, k]);
  }
  return keep.map(([x, k]) => {
    const also = [...new Set((Array.isArray(x.also) ? x.also : []).map(word).filter(a => labelWordOk(a) && !seen.has(a.toLowerCase())))].slice(0, 5);
    for (const a of also) seen.add(a.toLowerCase());
    const n = word(x.n).slice(0, 40);
    return strip({ k, n: n || k, also: also.length ? also : undefined, hide: x.hide === true || undefined });
  });
}
const strip = x => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined));

// The labels in use for these account settings, or null when the setting is off (the same list object while the
// settings don't change, so callers can keep caches by it)
let memoSrc, memoOut;
export function labelsOn(st) {
  if (!st || !st.labelParts) return null;
  if (memoSrc !== st.partLabels || !memoOut) { memoSrc = st.partLabels; memoOut = cleanLabels(st.partLabels); }
  return memoOut;
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const RE = new WeakMap();
// one regex per list: the longest words first, so "learning points" wins over "learning"
function matcher(labels) {
  let m = RE.get(labels);
  if (m) return m;
  const byWord = new Map();
  for (const l of labels || []) for (const w of [l.k, ...(l.also || [])]) if (!byWord.has(w.toLowerCase())) byWord.set(w.toLowerCase(), l);
  const words = [...byWord.keys()].sort((a, b) => b.length - a.length).map(w => esc(w).replace(/ /g, '[ \\t]+'));
  // optional list mark, optional bold around the label (closing before or after the colon), the word, an optional
  // number, the colon
  const re = words.length ? new RegExp(`^[ \\t]*(?:[-*•][ \\t]+)?(\\*\\*|__)?(${words.join('|')})(?:[ \\t]?(\\d{1,2}))?(?:\\1[ \\t]*:|[ \\t]*:\\1)[ \\t]?`, 'iu') : null;
  m = { re, byWord };
  RE.set(labels, m);
  return m;
}

// One line -> { label, word (as typed), num, name ("Learning point 1"), rest } or null
export function labelOf(line, labels) {
  const { re, byWord } = matcher(labels);
  const m = re && re.exec(String(line || ''));
  if (!m) return null;
  const label = byWord.get(m[2].replace(/\s+/g, ' ').toLowerCase());
  const num = m[3] || '';
  return { label, word: m[2], num, name: label.n + (num ? ' ' + num : ''), rest: String(line).slice(m[0].length) };
}

// text -> { main, parts: [{ k, name, word, num, text, hide }] }; main and each part's text keep their own lines
export function parseParts(text, labels) {
  const main = [], parts = [];
  let cur = null;
  for (const line of String(text || '').split('\n')) {
    const hit = labels && labels.length ? labelOf(line, labels) : null;
    if (hit) { parts.push(cur = { k: hit.label.k, name: hit.name, word: hit.word, num: hit.num, text: hit.rest, hide: !!hit.label.hide }); continue; }
    if (cur) cur.text += '\n' + line; else main.push(line);
  }
  for (const p of parts) p.text = p.text.replace(/^\s*\n/, '').replace(/\s+$/, '');   // a label alone on its line heads the lines below
  return { main: main.join('\n').replace(/\s+$/, ''), parts };
}

// Logbook rows: the main text, then each part with its label (parts hidden in lists left out)
export function rowSegments(text, labels) {
  const { main, parts } = parseParts(text, labels);
  return [...(main ? [{ text: main }] : []), ...parts.filter(p => !p.hide).map(p => ({ label: p.name, k: p.k, text: p.text }))];
}

// Copy, Share and the export with Settings → Markdown → Bold labels: "lp: x" -> "**Learning point:** x"
export function boldLabels(text, labels) {
  if (!labels || !labels.length) return String(text ?? '');
  return String(text ?? '').split('\n').map(line => {
    const hit = labelOf(line, labels);
    if (!hit) return line;
    // the word as typed ("Learning:" stays "Learning", "ASA 2" stays "ASA 2"); a short key ("lp") shows its name
    const head = hit.word.toLowerCase() === hit.label.k.toLowerCase() && hit.label.n !== hit.label.k ? hit.name : hit.word.replace(/\s+/g, ' ') + (hit.num ? ' ' + hit.num : '');
    return `**${head}:**${hit.rest ? ' ' + hit.rest : ''}`;
  }).join('\n');
}
// A pasted "**Learning:** x" is kept as "Learning: x" (the export puts the bold back when asked)
export function plainLabels(text, labels) {
  if (!labels || !labels.length) return String(text ?? '');
  return String(text ?? '').split('\n').map(line => {
    const hit = labelOf(line, labels);
    if (!hit || !/^\s*(?:[-*•]\s+)?(\*\*|__)/.test(line)) return line;
    return `${hit.word}${hit.num ? ' ' + hit.num : ''}:${hit.rest ? ' ' + hit.rest : ''}`;
  }).join('\n');
}

// What tag suggestions read: everything but the learning points (a point that says "spinal" never suggests Spinal)
export function suggestText(text, labels) {
  if (!labels || !labels.length) return String(text ?? '');
  const { main, parts } = parseParts(text, labels);
  return [main, ...parts.filter(p => p.k !== 'lp').map(p => p.text)].filter(Boolean).join('\n');
}

// The label a search word means ("lp", "learning", "plan"), by its word, another word for it or its name
export function findLabel(q, labels) {
  const w = word(q).toLowerCase();
  if (!w) return null;
  return (labels || []).find(l => [l.k, ...(l.also || []), l.n].some(x => x.toLowerCase() === w)) || null;
}
export const hasPart = (text, labels, k) => parseParts(text, labels).parts.some(p => p.k === k && p.text.trim());
// "has:lp" words in a plain search (Advanced search off): -> { rest, keys: [label key or null for an unknown one] }
export function takeHas(q, labels) {
  const keys = [];
  const rest = String(q || '').replace(/(^|\s)has:("[^"]*"|\S+)/gi, (m, sp, w) => { const l = findLabel(w.replace(/"/g, ''), labels); keys.push(l ? l.k : null); return sp; });
  return { rest: rest.replace(/\s+/g, ' ').trim(), keys };
}

// ---------- case template (Settings → Advanced logging; off by default) ----------

export const cleanCaseTemplate = v => String(v ?? '').replace(/\r\n?/g, '\n').slice(0, MAX_TEMPLATE);
// where the cursor goes in a fresh template: on an empty first line (room for the case itself), else after the
// first colon and its spaces, else at the end of the first line
export function templateCaret(tpl) {
  const t = String(tpl || '');
  const nl = t.indexOf('\n'), first = nl < 0 ? t : t.slice(0, nl);
  if (!first.trim() && nl >= 0) return 0;
  const m = /:[ \t]*/.exec(t);
  return m ? m.index + m[0].length : first.length;
}
// What is saved: the template's lines left as they were (nothing typed after "PE :") are dropped, so a template
// with nothing added saves as nothing. An untouched line that heads text typed on the lines below it ("Plan :" then
// "- spinal") is kept: it is dropped only when the next line with text is another template line (filled or not), a
// label or the end.
export function stripTemplate(text, tpl, labels = null) {
  const tl = new Set(String(tpl || '').split('\n').map(l => l.trim().toLowerCase()).filter(Boolean));
  if (!tl.size) return String(text ?? '');
  const lines = String(text ?? '').split('\n');
  const isTpl = l => tl.has(l.trim().toLowerCase());
  // the next line is another part: a label, or a template line with something typed after it ("Plan : GA")
  const isLabel = l => !!(labels && labels.length && labelOf(l, labels)) || [...tl].some(t => l.trim().toLowerCase().startsWith(t));
  const out = lines.filter((l, i) => {
    if (!isTpl(l)) return true;
    const next = lines.slice(i + 1).find(x => x.trim());
    return !(next == null || isTpl(next) || isLabel(next));
  });
  return out.join('\n').replace(/^\s*\n/, '').replace(/\s+$/, '');
}

// ---------- the 2000-character limit ----------

// text over max -> { head, rest }: head as long as allowed, cut at a line break (else a space) in its second half;
// rest goes into a note linked to the case
export function splitOverflow(text, max = MAX_DETAILS) {
  const t = String(text ?? '');
  if (t.length <= max) return { head: t, rest: '' };
  let cut = t.lastIndexOf('\n', max);
  if (cut < max / 2) cut = t.lastIndexOf(' ', max);
  if (cut < max / 2) cut = max;
  if (/[\uD800-\uDBFF]/.test(t[cut - 1] || '')) cut--;   // never half an emoji
  return { head: t.slice(0, cut).replace(/\s+$/, ''), rest: t.slice(cut).trim() };
}
