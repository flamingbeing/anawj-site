// Advanced search (Settings → Logging → Advanced search; off by default): operators in the Logbook
// search box. Pure, unit-tested.
//
//   initials:AB   only the initials        case:hernia   only the case text (no initials, tags, dates)
//   title:lscs    only the first line      tag:lscs      a tag, by name
//   "lap chole"   an exact phrase          spinal AND ga  both (same as a space)
//   -paeds        leave out                spinal OR epidural (or |)   either
//   has:lp        a labelled part (Settings → Advanced logging → Labelled parts)
//
// Anything else is a plain word, searched as without operators. A misspelt operator ("initals:AB",
// "tga:16") is searched as plain text and reported, so the box can say "did you mean initials:?".

import { editDistance } from './engine.js';

export const FIELDS = ['initials', 'title', 'case', 'tag', 'has'];
// with Labelled parts off, has: is plain text again (as before the setting existed)
export const FIELDS_NO_HAS = FIELDS.filter(f => f !== 'has');
// Reflections search: its own fields (no tags; title: is the reflection's title)
export const REFL_FIELDS = ['initials', 'heading', 'title', 'diagnosis', 'case'];
export const REFL_OPERATOR_HELP = [
  ['initials:AB', 'only reflections with those initials', 'initials:', 9],
  ['heading:bariatric', 'the heading or sub-heading', 'heading:', 8],
  ['title:blood', 'only the title', 'title:', 6],
  ['diagnosis:stroke', 'only the diagnosis / procedure', 'diagnosis:', 10],
  ['case:hypertension', 'only the case details', 'case:', 5],
  ['"blood pressure"', 'that exact phrase', '""', 1],
  ['-draft', 'leave out reflections with that word (works with the others: -heading:lap)', '-', 1],
  ['ponv OR nausea', 'either one (ponv | nausea works too)', 'OR ', 3],
  ['ponv AND ear', 'both (the same as a space)', 'AND ', 4],
];

// [example, what it does, what a tap in the "?" list puts in the box, where the cursor goes in it]
export const OPERATOR_HELP = [
  ['initials:AB', 'only cases with those initials', 'initials:', 9],
  ['title:lscs', 'only the first line of the case', 'title:', 6],
  ['case:hernia', 'only the case text (not initials, tags or dates)', 'case:', 5],
  ['tag:lscs', 'cases with that tag, by name (your own tags too)', 'tag:', 4],
  ['has:lp', 'cases with that labelled part (with Labelled parts on)', 'has:', 4],
  ['"lap chole"', 'that exact phrase', '""', 1],
  ['-paeds', 'leave out cases with that word (works with the others: -tag:13)', '-', 1],
  ['spinal OR epidural', 'either one (spinal | epidural works too)', 'OR ', 3],
  ['spinal AND GA', 'both (the same as a space, as every word must match)', 'AND ', 4],
];

// the box's text with an operator added at the cursor (a space either side as needed) and where the
// cursor goes next: { text, caret }
export function insertOperator(text, caret, insert, at) {
  text = String(text || ''); caret = Math.max(0, Math.min(text.length, caret ?? text.length));
  const before = text.slice(0, caret), after = text.slice(caret);
  const pre = before && !/\s$/.test(before) ? ' ' : '';
  const post = after && !/^\s/.test(after) ? ' ' : '';
  return { text: before + pre + insert + post + after, caret: before.length + pre.length + at };
}

// q -> { groups: [[term, ...], ...], unknown: [{ op, suggest }] }
// All groups must match; within a group any term may (OR). term: { field: null|'initials'|'case'|'tag', text, phrase, neg }
// opts: { fields (FIELDS or REFL_FIELDS), keepCase (case-sensitive search: the text isn't lower-cased) }
export function parseQuery(q, { fields = FIELDS, keepCase = false } = {}) {
  const tokens = [];
  const unknown = [];
  const re = /(-?)(?:([A-Za-z]+):)?(?:"([^"]*)"?|(\S+))/g;
  let m;
  const src = String(q || '');
  while ((m = re.exec(src))) {
    if (!m[0]) { re.lastIndex++; continue; }
    let [, neg, field, phrase, word] = m;
    // a lone "-" or "-" before nothing useful is just a character
    if (neg && !field && phrase == null && !/^[\p{L}\p{N}]/u.test(word || '')) { word = '-' + (word || ''); neg = ''; }
    if (!neg && !field && phrase == null && (word === 'OR' || word === '|')) { tokens.push({ or: true }); continue; }
    if (!neg && !field && phrase == null && (word === 'AND' || word === '&')) continue;   // a space does the same
    let f = field ? field.toLowerCase() : null;
    if (f && !fields.includes(f)) {
      // not an operator: the whole thing is text ("GA:ETT"); a near miss of one is reported
      const near = fields.find(x => editDistance(f, x, 2) <= 2 && f.length >= 3);
      if (near) unknown.push({ op: field + ':', suggest: near + ':' });
      word = field + ':' + (phrase != null ? phrase : word || ''); phrase = undefined; f = null;
    }
    const raw = (phrase != null ? phrase : word || '').trim();
    const text = keepCase && f !== 'tag' && f !== 'has' ? raw : raw.toLowerCase();
    if (!text) continue;
    tokens.push({ field: f, text, phrase: phrase != null, neg: !!neg });
  }
  // a | b | c → one group; OR at either end is ignored
  const groups = [];
  let joinNext = false;
  for (const t of tokens) {
    if (t.or) { joinNext = groups.length > 0; continue; }
    if (joinNext) groups[groups.length - 1].push(t); else groups.push([t]);
    joinNext = false;
  }
  return { groups, unknown };
}

// Does a case match? get: { all, initials, title, case } lower-cased texts of the case; tagHas(text) for tag:;
// has(hay, word) the plain-word test (fuzzy aware); partHas(text) for has: (no partHas: nothing has a part).
export function matchQuery(parsed, get, tagHas, has = (hay, w) => hay.includes(w), partHas = null) {
  const one = t => {
    const hit = t.field === 'has' ? !!(partHas && partHas(t.text))
      : t.field === 'tag' && tagHas ? tagHas(t.text)
      : t.phrase ? get(t.field || 'all').includes(t.text)
      : has(get(t.field || 'all'), t.text, t.field);
    return t.neg ? !hit : hit;
  };
  return parsed.groups.every(g => g.some(one));
}

// whether the query uses any operator (for the "?" note), cheap
export const usesOperators = q => /(^|\s)(-\S|"|(initials|title|case|tag|has):)|\s(OR|AND|\||&)\s/i.test(String(q || ''));
