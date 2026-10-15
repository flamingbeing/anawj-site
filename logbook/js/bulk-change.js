// Bulk edit (Logbook → Select → Bulk edit…): the changes chosen in the popup, applied to one case at a time. Every
// field starts unchanged (null). Pure, so it is unit-tested (test/bulk-change.test.mjs); the tag rules come in as `t`
// (ui-core: a tag's parent, keepTags, tagLinks) and engine's sortCodes / withParents.
//
// ch: {
//   date: { set: '2026-10-01' } | null,
//   initials: { set: 'AB' } (empty clears) | null,
//   details: { mode: 'replace' | 'append' | 'find', text, find, with } | null   (find: exact capitals, so “GA” leaves
//     “gastrectomy” alone),
//   tags: { mode: 'add' | 'remove' | 'replace', k, to } | null   ('c:16' an APMES tag, else one of yours)
//   star: true | false | null   (☆ Interesting)
// }
export const MAX_DETAILS = 2000;   // what a case holds (the edit dialog moves the rest into a note)
export const BIG = 20;             // from this many cases, an overwriting change's button names the size
export const none = () => ({ date: null, initials: null, details: null, tags: null, star: null });
export const isEmpty = ch => !ch || Object.values(ch).every(v => v == null);

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const same = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

// the fields a bulk edit can change, as they are compared (old cases keep the initials at the front of the details)
function fields(c, parts) {
  const p = parts(c);
  return { date: c.date || '', initials: p.initials.trim(), details: p.details.trim(), cats: c.cats || [], tags: c.tags || [], star: !!c.reflectTag };
}

// -> the changed case, or null when nothing changes for it. { tooLong: true } when the summary would pass MAX_DETAILS
// (left as it is). t: { parts(c) -> { initials, details }, cleanInitials, sortCodes, withParents, parentOf(code),
// keepTags(tags, cats), tagLinks(k) }
export function applyChange(c, ch, t, now = Date.now()) {
  const was = fields(c, t.parts);
  const next = { ...was, cats: [...was.cats], tags: [...was.tags] };
  if (ch.date && /^\d{4}-\d{2}-\d{2}$/.test(ch.date.set || '')) next.date = ch.date.set;
  if (ch.initials) next.initials = t.cleanInitials(String(ch.initials.set || ''));
  if (ch.details) {
    const d = ch.details, text = String(d.text || '').trim();
    if (d.mode === 'replace' && text) next.details = text;
    else if (d.mode === 'append' && text) next.details = next.details ? `${next.details} ${text}` : text;   // on the same line, after a space
    else if (d.mode === 'find' && d.find) next.details = next.details.replace(new RegExp(escapeRe(String(d.find)), 'g'), String(d.with ?? '')).trim();
    if (next.details.length > MAX_DETAILS) return { tooLong: true };
  }
  if (ch.tags && ch.tags.k) {
    const { mode, k, to } = ch.tags;
    if (mode === 'add') putOn(next, k, t);
    if (mode === 'remove') takeOff(next, k, t);
    // replace: only on the cases that have the old tag
    if (mode === 'replace' && to && has(was, k)) { takeOff(next, k, t); putOn(next, to, t); }
  }
  if (ch.star === true || ch.star === false) next.star = ch.star;
  if (next.date === was.date && next.initials === was.initials && next.details === was.details && same(next.cats, was.cats) && same(next.tags, was.tags) && next.star === was.star) return null;
  const out = { ...c, date: next.date || c.date, initials: next.initials, details: next.details, cats: next.cats, updatedAt: now };
  if (next.tags.length) out.tags = next.tags; else delete out.tags;
  if (next.star) out.reflectTag = true; else delete out.reflectTag;
  if (out.date && out.dateText && next.date !== was.date) delete out.dateText;
  return out;
}
const has = (f, k) => (k.startsWith('c:') ? f.cats.includes(k.slice(2)) : f.tags.includes(k));
function putOn(f, k, t) {
  if (k.startsWith('c:')) f.cats = t.sortCodes(t.withParents([...f.cats, k.slice(2)]));
  else {
    if (!f.tags.includes(k)) f.tags = [...f.tags, k];
    f.cats = t.sortCodes(t.withParents([...f.cats, ...t.tagLinks(k)]));   // a tag that counts towards APMES ticks them
  }
}
function takeOff(f, k, t) {
  if (k.startsWith('c:')) {
    const code = k.slice(2);
    f.cats = f.cats.filter(x => x !== code && t.parentOf(x) !== code);
    f.tags = t.keepTags(f.tags, f.cats);   // your tags under a removed APMES tag go with it (as in the edit dialog)
  } else f.tags = f.tags.filter(x => x !== k);
}

// Does the change replace or take away what is there (the warning, and samples from BIG cases)? Adding is not.
export function overwrites(ch) {
  return !!((ch.date && ch.date.set) || ch.initials || (ch.details && ch.details.mode !== 'append')
    || (ch.tags && ch.tags.mode !== 'add') || ch.star === false);
}

// One line per field changed, for the review step. name(k) -> a tag's name; day(iso) -> "1 Oct 2026"
export function changeLines(ch, { name = k => k, day = d => d } = {}) {
  const out = [];
  if (ch.date && ch.date.set) out.push(`Date: set to ${day(ch.date.set)}`);
  if (ch.initials) out.push(ch.initials.set ? `Initials: replaced with “${ch.initials.set}”` : 'Initials: cleared');
  if (ch.details) {
    const d = ch.details;
    out.push(d.mode === 'replace' ? `Case summary: replaced with “${d.text}”` : d.mode === 'append' ? `Case summary: “${d.text}” added to the end`
      : `Case summary: “${d.find}” replaced with “${d.with || ''}”${d.with ? '' : ' (taken out)'}`);
  }
  if (ch.tags && ch.tags.k) out.push(ch.tags.mode === 'add' ? `Tags: add ${name(ch.tags.k)}` : ch.tags.mode === 'remove' ? `Tags: remove ${name(ch.tags.k)}`
    : `Tags: ${name(ch.tags.k)} replaced with ${name(ch.tags.to)}`);
  if (ch.star === true) out.push('Interesting: on');
  if (ch.star === false) out.push('Interesting: off');
  return out;
}

// Is a choice complete enough to apply? -> a message saying what is missing, or ''
export function missing(ch) {
  if (ch.date && !/^\d{4}-\d{2}-\d{2}$/.test(ch.date.set || '')) return 'Choose the date';
  if (ch.details) {
    const d = ch.details;
    if ((d.mode === 'replace' || d.mode === 'append') && !String(d.text || '').trim()) return 'Type the case summary text';
    if (d.mode === 'find' && !d.find) return 'Type what to find';
  }
  if (ch.tags && (!ch.tags.k || (ch.tags.mode === 'replace' && !ch.tags.to))) return 'Choose the tag';
  if (ch.tags && ch.tags.mode === 'replace' && ch.tags.k === ch.tags.to) return 'Choose a different tag to replace it with';
  return '';
}
