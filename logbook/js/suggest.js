// Category suggestions from free-text case details.
// Keyword evidence (P(category | word), mined from the old case log into keywords.js) plus
// simple rules for age (paeds bands, geriatric) and BMI (morbid obesity).
// Pure functions only (no DOM), so it can be tested in Node.

import { KEYWORDS, CALIBRATION, STOP as STOP_LIST } from './keywords.js';
import { BY_CODE } from './categories.js';

const STOP = new Set(STOP_LIST);
const ROMAN = /^(?:i|ii|iii|iv)$/;

const num = s => parseFloat(s);

// -> { years } | null. Takes the first age-like phrase in the text (ages come early in case notes).
// A bare M/m or F/f means sex in years ("6m" = six-year-old male).
// Use explicit month units ("6mo", "6 months", "6/12"); compound "2m2w" stays months + weeks.
export function parseAge(text) {
  const s = String(text || '').replace(/\s+/g, ' ');
  const lower = s.toLowerCase();
  const found = [];
  const add = (re, toYears, src = lower) => {
    re.lastIndex = 0;
    for (let m; (m = re.exec(src));) {
      const y = toYears(m);
      if (y != null && y >= 0 && y <= 110) found.push({ at: m.index, len: m[0].length, years: y });
    }
  };
  const NB = '(?<![\\w.+/:])';   // not glued to a word, decimal, gestation "+", fraction or time
  const R = (src, flags = 'g') => new RegExp(src.replace(/NB/g, NB), flags);
  // compounds: "7y3mo", "1y 2mo", "5y10m", "2m2w", "6m3wk"
  add(R('NB(\\d{1,2})\\s*(?:y|yrs?|years?)\\s*,?\\s*(\\d{1,2})\\s*(?:m|mo|mos|mths?|months?)(?![a-z])'), m => num(m[1]) + num(m[2]) / 12);
  add(R('NB(\\d{1,2})\\s*(?:m|mo|mos|mths?|months?)\\s*,?\\s*(\\d{1,2})\\s*(?:w|wk|wks|weeks?)(?![a-z])'), m => num(m[1]) / 12 + num(m[2]) / 52);
  // "5yo", "5 y.o.", "5 y/o", "5y", "5yr", "5 years", "5-year-old", "72yoF", "72yF" (not "3 years ago")
  add(R('NB(\\d{1,3}(?:\\.\\d)?)\\s*-?\\s*(?:y\\.?\\s?o(?:\\b|(?=[mf]\\b))\\.?|y\\/o\\b|yrs?(?:\\b|(?=[mf]\\b))|years?\\b(?!\\s*(?:ago|of|hx|history|post|since))(?:\\s*-?\\s*old)?|y(?:\\b|(?=[mf]\\b))(?![\\s.]*o\\b)(?!\\s*\\d))'),
    m => num(m[1]));
  // "8mo", "8 months", "8mth", "8/12" (but not dates like 8/12/24 or 17/12)
  add(R('NB(\\d{1,2})\\s*(?:mo|mos|mths?|months?)\\b(?!\\s*(?:ago|post|since))(?:\\s*-?\\s*old)?'), m => num(m[1]) / 12);
  add(R('NB(\\d{1,2})\\/12\\b(?![\\/\\d])'), m => (num(m[1]) < 12 ? num(m[1]) / 12 : null));
  // "2w", "2 wk", "3/52" — but not gestations ("38+4w", "38/52", "PMA 45w", "16w gestation", "2/52 of pain")
  const gestation = i => /(?:\+|\b(?:pma|ca|prem\w*|gest\w*|g\d\s?p\d|preg\w*|pog|poa|at))\s*$/.test(lower.slice(Math.max(0, i - 14), i));
  add(R('NB(\\d{1,2})\\s*(?:w|wk|wks|weeks?)\\b(?!\\s*(?:ago|post|of|gest|pog|poa|amen|\\+|\\d))(?:\\s*-?\\s*old)?'),
    m => (num(m[1]) <= 26 && !gestation(m.index) ? num(m[1]) / 52 : null));
  add(R('NB(\\d{1,2})\\/52\\b(?![\\/\\d])(?!\\s*(?:ago|of|hx|history))'), m => (num(m[1]) <= 12 && !gestation(m.index) ? num(m[1]) / 52 : null));
  // "10d", "10 days old", "day 3 of life", "DOL 3" (not "+19.5d" lens powers, "POD 3d", "x 10d" courses, "031D" NRIC bits)
  add(R('NB(\\d{1,2})\\s*(?:d|days?)\\b(?:\\s*-?\\s*(old))?'), m => {
    const before = lower.slice(Math.max(0, m.index - 8), m.index);
    if (/\b(?:pod|x|for|abx|over|in|post|d)\s*$/.test(before)) return null;
    if (!m[2] && (m[1][0] === '0' || m.index > 40)) return null;
    return num(m[1]) / 365;
  });
  add(/\b(?:day\s*(\d{1,2})\s*of\s*life|dol\s*(\d{1,2}))\b/g, m => num(m[1] || m[2]) / 365);
  // "78M", "65F", "27/f", "65 / m", "M78", "F 65"
  add(R('NB(\\d{1,3})\\s*(\\/?)\\s*([mMfF])(?![\\w+/])', 'g'), m => {
    const before = lower.slice(Math.max(0, m.index - 10), m.index);
    if (/\b(?:from|fall|fell|of|x|sp|ns)\s*$/.test(before)) return null;   // "fall from 3m"
    if (m[1].length === 3 && m[1][0] === '0') return null;                  // NRIC "083F"
    const n = num(m[1]);
    return n;
  }, s);
  add(/(?<![\w/])([mf])\s?(\d{2,3})\b(?![\/\d.])/g, m => {
    if (/(?:m[1-4]|m\s?\d{2,3}\s*(?:mg|ml|segment))/.test(m[0])) return null;
    return num(m[2]) >= 12 ? num(m[2]) : null;
  });
  add(/\b(?:neonates?|newborn|new born|nb)\b/g, () => 0);
  if (!found.length) return null;
  found.sort((a, b) => a.at - b.at || b.len - a.len);
  return { years: Math.round(found[0].years * 1000) / 1000 };
}

// "BMI 42", "bmi42", "BMI: 41.5", "BMI of 40" -> number | null
export function parseBMI(text) { const m = bmiAt(text); return m ? m.value : null; }
// where it is in the text, for the case box's highlight: { from, to, value } | null
export function bmiAt(text) {
  const m = String(text || '').match(/\bbmi\s*(?:of|is|was|[:=~-])?\s*(\d{2}(?:\.\d+)?)(?![\d/])/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return v >= 10 && v <= 100 ? { from: m.index, to: m.index + m[0].length, value: v } : null;
}

// Same tokenisation as tools/build_logbook_keywords.py: drop leading patient initials, lowercase,
// split on anything but letters/digits/&, blank out stop words and numbers so bigrams don't span them.
export function tokens(text, keywords = KEYWORDS) {
  // "ABC lap chole": ABC is the patient, but "TKR ..." or "LSCS ..." on their own are the case
  const lead = String(text || '').match(/^\s*([A-Z]{2,4})\b/) || String(text || '').match(/^\s*([A-Z]{5,8})(?=[\s\/,:;.-]*\/|[\s,:;.-]+\d)/);   // longer initials only before an age or /
  const known = lead && keywords[lead[1].toLowerCase()];
  const s = (lead && !known ? String(text).replace(lead[0], ' ') : String(text || '')).toLowerCase();
  return (s.match(/[a-z0-9&]+/g) || []).map(t => {
    t = t.replace(/^&+|&+$/g, '');
    if (t.length < 2 || STOP.has(t) || ROMAN.test(t)) return null;
    const digits = (t.match(/\d/g) || []).length;
    if (digits && (digits * 2 >= t.length || /\d{3}/.test(t) || t.length < 3 || digits > 1)) return null;
    return t;
  });
}

function grams(text, keywords) {
  const toks = tokens(text, keywords);
  const out = new Set(toks.filter(Boolean));
  for (let i = 0; i + 1 < toks.length; i++) {
    if (toks[i] && toks[i + 1] && toks[i] !== toks[i + 1]) out.add(toks[i] + ' ' + toks[i + 1]);
  }
  return out;
}

// Words that define a category whatever residents ticked in the past (blocks are often under-logged).
// Each hit also suggests its parent (26iii -> 26). These count as 'keyword' evidence.

// Score of a code = the strongest word for it, nudged up a little by a second independent word
// (noisy-OR on a damped runner-up). Plain noisy-OR over-counts words that always travel together.
const SECOND = 0.35;
// Wrong chips cost more than missing ones, so keyword scores are tilted down a little:
// a keyword chip reaches 0.5 only when ~57% of such chips were ticked in the old log.
const TILT = 1.25;
// Ages and BMI are facts, so their rules beat keywords.
// An age of 16 or under is Paeds (EPA 9: to 16 years; owner, 15 Oct 2026); over 16 is not.
const AGE_SCORE = { '20': 0.95, band: 0.9, '21': 0.9 };
const BMI_SCORE = 0.9;
// A shorthand word you (or the built-in list) linked to a tag: a strong chip.
const SHORTHAND_SCORE = 0.8;

// Raw keyword scores run hot (the best of several noisy word probabilities), so they are mapped
// through the builder's cross-validated table to "how often residents ticked such a chip".
export function calibrate(raw, table = CALIBRATION) {
  if (!table || !table.length) return raw;
  if (raw <= table[0][0]) return raw * table[0][1] / table[0][0];
  for (let i = 1; i < table.length; i++) {
    const [x0, y0] = table[i - 1], [x1, y1] = table[i];
    if (raw <= x1) return y0 + (y1 - y0) * (raw - x0) / (x1 - x0);
  }
  const [xn, yn] = table[table.length - 1];
  return yn + (1 - yn) * (raw - xn) / (1 - xn);
}

// keywords / calibration options exist so the builder's held-out evaluation can swap tables in.
export function suggest(text, { limit = 6, keywords = KEYWORDS, calibration = CALIBRATION, extra = null, detectAgeSex = true } = {}) {
  const ev = {};   // code -> [p, ...]
  for (const g of grams(text, keywords)) {
    const ps = keywords[g];
    if (!ps) continue;
    for (const code in ps) (ev[code] = ev[code] || []).push(ps[code]);
  }
  const out = new Map();
  const put = (code, score, why) => {
    if (!BY_CODE[code] || BY_CODE[code].retired) return;
    const cur = out.get(code);
    if (!cur || score > cur.score) out.set(code, { code, score: Math.round(score * 100) / 100, why });
  };
  for (const code in ev) {
    const ps = ev[code].sort((a, b) => b - a);
    put(code, calibrate(1 - (1 - ps[0]) * (1 - SECOND * (ps[1] || 0)), calibration) ** TILT, 'keyword');
  }

  const lower = String(text || '').toLowerCase();
  // leading capitals before an age are the patient's initials ("DL 45M …"), not shorthand
  const words = String(text || '').replace(/^\s*[A-Z]{2,8}(?=[\s\/,:;.-]+\d)/, '').toLowerCase();
  // shorthand (Tag editor: built in, and your own): whole words that mean an APMES tag. A word inside
  // a longer match ("lap" in "ex lap") steps aside for it.
  const hits = [];
  for (const { re, code } of extra || []) {
    // every place the word appears ("ex lap … lap washout": the second lap still counts)
    const g = re.global ? re : new RegExp(re.source, re.flags + 'g');
    for (const m of words.matchAll(g)) { const at = m.index + m[0].search(/[a-z0-9&]/); hits.push({ code, at, end: m.index + m[0].length }); }
  }
  for (const x of hits) {
    if (hits.some(y => y !== x && y.at <= x.at && y.end >= x.end && (y.end - y.at) > (x.end - x.at))) continue;
    put(x.code, SHORTHAND_SCORE, 'shorthand'); if (BY_CODE[x.code] && BY_CODE[x.code].parent) put(BY_CODE[x.code].parent, SHORTHAND_SCORE, 'shorthand');
  }

  const age = detectAgeSex ? parseAge(text) : null;
  if (age) {
    const y = age.years;
    if (y >= 65) put('21', AGE_SCORE['21'], 'age');
    if (y <= 12) {
      put('20', AGE_SCORE['20'], 'age');
      put(y <= 0.25 ? '20i' : y < 4 ? '20ii' : '20iii', AGE_SCORE.band, 'age');
      // an age says which band it is, so keyword guesses at the other bands step aside
      for (const b of ['20i', '20ii', '20iii']) if (out.get(b)?.why === 'keyword') out.delete(b);
    } else if (y <= 16) {
      // EPA 9 counts paediatric cases to 16 years (owner, 15 Oct 2026): a 13 to 16 year old is Paeds, no band
      put('20', AGE_SCORE['20'], 'age');
      for (const b of ['20i', '20ii', '20iii']) if (out.get(b)?.why !== 'age') out.delete(b);
      if (out.get('21')?.why === 'keyword') out.delete('21');
    } else {
      // a known adult is not paediatric (whatever suggested it: a keyword or a shorthand word such as
      // "circumcision", which ticked Paeds on an 18/M; 15 Oct 2026) and not geriatric before 65
      for (const b of ['20', '20i', '20ii', '20iii']) out.delete(b);
      if (y < 65 && out.get('21')?.why === 'keyword') out.delete('21');
    }
  }
  const bmi = parseBMI(text);
  if (bmi != null) {
    if (bmi >= 40) put('22', BMI_SCORE, 'bmi');
    else if (out.get('22')?.why === 'keyword') out.delete('22');
  }
  // very weak guesses are noise on a chip row
  return [...out.values()].filter(s => s.score >= 0.15).sort((a, b) => b.score - a.score || a.code.localeCompare(b.code)).slice(0, limit);
}
