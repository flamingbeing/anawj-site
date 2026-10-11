// Advanced search (Settings → Logging → Advanced search; off by default): operators in the Logbook
// search box. Pure, unit-tested.
//
//   initials:AB   only the initials        case:hernia   only the case text (no initials, tags, dates)
//   tag:16        a tag, by code or name   "lap chole"   an exact phrase
//   -paeds        leave out                spinal OR epidural (or |)   either
//
// Anything else is a plain word, searched as without operators. A misspelt operator ("initals:AB",
// "tga:16") is searched as plain text and reported, so the box can say "did you mean initials:?".

import { editDistance } from './engine.js';

export const FIELDS = ['initials', 'case', 'tag'];
export const OPERATOR_HELP = [
  ['initials:AB', 'only cases with those initials'],
  ['case:hernia', 'only the case text (not initials, tags or dates)'],
  ['tag:16  tag:lscs', 'cases with that tag, by code or name (your own tags too)'],
  ['"lap chole"', 'that exact phrase'],
  ['-paeds', 'leave out cases with that word (works with the others: -tag:13)'],
  ['spinal OR epidural', 'either one (spinal | epidural works too)'],
];

// q -> { groups: [[term, ...], ...], unknown: [{ op, suggest }] }
// All groups must match; within a group any term may (OR). term: { field: null|'initials'|'case'|'tag', text, phrase, neg }
export function parseQuery(q) {
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
    let f = field ? field.toLowerCase() : null;
    if (f && !FIELDS.includes(f)) {
      // not an operator: the whole thing is text ("GA:ETT"); a near miss of one is reported
      const near = FIELDS.find(x => editDistance(f, x, 2) <= 2 && f.length >= 3);
      if (near) unknown.push({ op: field + ':', suggest: near + ':' });
      word = field + ':' + (phrase != null ? phrase : word || ''); phrase = undefined; f = null;
    }
    const text = (phrase != null ? phrase : word || '').toLowerCase().trim();
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

// Does a case match? get: { all, initials, case } lower-cased texts of the case; tagHas(text) for tag:;
// has(hay, word) the plain-word test (fuzzy aware).
export function matchQuery(parsed, get, tagHas, has = (hay, w) => hay.includes(w)) {
  const one = t => {
    const hit = t.field === 'tag' ? tagHas(t.text)
      : t.phrase ? get(t.field || 'all').includes(t.text)
      : has(get(t.field || 'all'), t.text, t.field);
    return t.neg ? !hit : hit;
  };
  return parsed.groups.every(g => g.some(one));
}

// whether the query uses any operator (for the "?" note), cheap
export const usesOperators = q => /(^|\s)(-\S|"|(initials|case|tag):)|\s(OR|\|)\s/i.test(String(q || ''));
