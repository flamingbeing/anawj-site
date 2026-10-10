// Case reflections: the stored shape and progress against the APMES portfolio rules (pure, no DOM).
// Rules: 96 reflections across REFLECTION_HEADINGS (min per heading); heading.jr = how many must be
// junior-residency (R1–R3) cases; a heading without jr allows at most one JR reflection; heading.subs
// are required sub-types; each reflection is a unique patient, under one heading only.

import { REFLECTION_HEADINGS, REFLECTION_SECTIONS } from './categories.js';

export const REFLECTION_TOTAL = REFLECTION_HEADINGS.reduce((n, h) => n + h.min, 0);   // 96
export const SECTION_MAX = 20000;
export const REFLECTION_FIELDS = ['id', 'headingId', 'subId', 'initials', 'date', 'jr', 'diagnosis', 'title', 'summary', 'points', 'figures', 'references', 'sections', 'caseId', 'source', 'status', 'createdAt', 'updatedAt'];
// Caps (firestore.rules checks list sizes and top-level types; string lengths inside lists are capped here).
export const LIMITS = { title: 300, summary: 20000, points: 15, pointHeading: 300, pointText: 20000, figures: 10, caption: 300, references: 30, reference: 1000 };
export const IMAGE_MAX_B64 = 700 * 1024;   // an image doc's base64 must be under this (rules allow < 750000)
const HEADING_IDS = new Set(REFLECTION_HEADINGS.map(h => h.id));
export const HEADING_BY_ID = Object.fromEntries(REFLECTION_HEADINGS.map(h => [h.id, h]));

const str = (v, max) => String(v ?? '').slice(0, max);
const arr = v => (Array.isArray(v) ? v : []);
const IMG_ID = /^[A-Za-z0-9_-]{1,100}$/;

// Whitelist and cap a reflection before it is stored (Firestore rules check the same).
// Shape: title, summary, points [{ heading, text }], figures [{ id, caption, point }], references [string];
// legacy reflections carry sections { description, thoughts, ... } instead, which are kept.
export function cleanReflection(r, now = Date.now()) {
  const L = LIMITS;
  const id = r.id ? String(r.id).slice(0, 100) : now.toString(36) + Math.random().toString(36).slice(2, 10);
  const h = HEADING_BY_ID[r.headingId];
  const points = arr(r.points).slice(0, L.points).map(p => ({ heading: str(p && p.heading, L.pointHeading), text: str(p && p.text, L.pointText) }));
  const figures = arr(r.figures).filter(f => f && IMG_ID.test(String(f.id || ''))).slice(0, L.figures).map(f => {
    const pt = Number.isInteger(f.point) && f.point >= 0 && f.point < points.length ? f.point : null;
    return { id: String(f.id), caption: str(f.caption, L.caption), point: pt };
  });
  const out = {
    id,
    headingId: h ? h.id : '',
    subId: h && h.subs && h.subs.some(s => s.id === r.subId) ? r.subId : null,
    initials: str(r.initials, 20).trim(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : null,
    jr: !!r.jr,
    diagnosis: str(r.diagnosis, 2000),
    title: str(r.title, L.title),
    summary: str(r.summary, L.summary),
    points,
    figures,
    references: arr(r.references).slice(0, L.references).map(x => str(x, L.reference)),
    caseId: r.caseId ? String(r.caseId).slice(0, 200) : null,
    ...(r.source === 'word' ? { source: 'word' } : {}),
    status: r.status === 'complete' ? 'complete' : 'draft',
    createdAt: Number(r.createdAt) || now,
    updatedAt: now,
  };
  if (r.sections && typeof r.sections === 'object') {
    const sections = {};
    for (const s of REFLECTION_SECTIONS) sections[s.id] = str(r.sections[s.id], SECTION_MAX);
    out.sections = sections;
  }
  return out;
}

// True when the reflection uses the old one-box-per-section layout (no summary or learning points).
export const isLegacy = r => !!(r && r.sections && Object.values(r.sections).some(v => String(v || '').trim())
  && !String(r.summary || '').trim() && !arr(r.points).some(p => p && (String(p.heading || '').trim() || String(p.text || '').trim())));

// What is missing before a reflection can be marked complete (empty = ready).
// Linking a reflection to a logged case (caseId) is optional. source 'word' marks a Word import.
export function completeProblems(r) {
  const out = [];
  const hd = HEADING_BY_ID[r.headingId];
  if (!hd) out.push('heading');
  if (hd && hd.subs && !r.subId) out.push('sub-type');
  if (!String(r.initials || '').trim()) out.push('initials');
  if (!r.date) out.push('date');
  if (isLegacy(r)) {
    for (const s of REFLECTION_SECTIONS) if (!s.optional && !String(r.sections[s.id] || '').trim()) out.push(s.name.toLowerCase());
    return out;
  }
  if (!String(r.title || '').trim() && !String(r.summary || '').trim()) out.push('title or case summary');
  if (!arr(r.points).some(p => p && (String(p.heading || '').trim() || String(p.text || '').trim()))) out.push('at least one learning point');
  return out;
}

// Image doc (logbooks/{email}/images/{id}): { id, data (base64, no data: prefix), mime, w, h, createdAt }.
export function cleanImage(img, now = Date.now()) {
  const id = String(img && img.id || '');
  if (!IMG_ID.test(id)) throw new Error('bad image id');
  const data = String(img.data || '').replace(/^data:[^,]*,/, '');
  if (!data || data.length >= IMAGE_MAX_B64) throw new Error('image too large');
  const mime = img.mime === 'image/png' ? 'image/png' : 'image/jpeg';
  return { id, data, mime, w: Math.round(Number(img.w) || 0), h: Math.round(Number(img.h) || 0), createdAt: Number(img.createdAt) || now };
}

// "AB 34F LSCS under spinal" -> { initials: 'AB', diagnosis: '34F LSCS under spinal' }
export function splitDetails(details) {
  const m = String(details || '').trim().match(/^([A-Z]{1,4})\b[\s,.:;-]*(.*)$/s);
  return m ? { initials: m[1], diagnosis: m[2].trim() } : { initials: '', diagnosis: String(details || '').trim() };
}

const patientKey = r => (r.initials || '').trim().toUpperCase() + '|' + (r.date || '');

// Progress per heading (complete reflections only count) plus totals and rule issues.
export function reflectionProgress(reflections) {
  const done = (reflections || []).filter(r => r.status === 'complete' && HEADING_IDS.has(r.headingId));
  // duplicate patients across all reflections (drafts too): same initials and date
  const seen = new Map();
  for (const r of reflections || []) {
    if (!r.initials || !r.date) continue;
    const k = patientKey(r);
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  const dupKeys = new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));

  const headings = REFLECTION_HEADINGS.map(h => {
    const mine = done.filter(r => r.headingId === h.id);
    const jrDone = mine.filter(r => r.jr).length;
    const jrNeeded = h.jr || 0;
    const jrMax = h.jr ? Infinity : 1;
    const subs = (h.subs || []).map(s => ({ id: s.id, name: s.name, min: s.min, done: mine.filter(r => r.subId === s.id).length }));
    const issues = [];
    if (jrNeeded && jrDone < jrNeeded) issues.push(`Needs ${jrNeeded - jrDone} more JR reflection${jrNeeded - jrDone > 1 ? 's' : ''}`);
    if (!h.jr && jrDone > 1) issues.push('Only 1 JR reflection counts under this heading');
    for (const s of subs) if (s.done < s.min) issues.push(`Missing: ${s.name}`);
    const dups = (reflections || []).filter(r => r.headingId === h.id && dupKeys.has(patientKey(r)));
    if (dups.length) issues.push(`Same patient used more than once (${[...new Set(dups.map(r => r.initials + ' ' + r.date))].join(', ')})`);
    // a heading is met when the count, JR and sub-types are met (extra JR beyond the max don't count)
    const counted = h.jr ? mine.length : mine.length - Math.max(0, jrDone - 1);
    const met = counted >= h.min && (!jrNeeded || jrDone >= jrNeeded) && subs.every(s => s.done >= s.min);
    return { id: h.id, section: h.section, name: h.name, hint: h.hint || '', done: mine.length, counted, min: h.min, jrDone, jrNeeded, jrMax, subs, issues, met };
  });
  const total = headings.reduce((n, h) => n + Math.min(h.counted, h.min), 0);
  return { headings, totals: { done: done.length, counted: total, min: REFLECTION_TOTAL, drafts: (reflections || []).filter(r => r.status !== 'complete').length } };
}

// For the shared summary: { headingId: complete count } and the total.
export function reflectionCounts(reflections) {
  const out = {};
  for (const r of reflections || []) if (r.status === 'complete' && HEADING_IDS.has(r.headingId)) out[r.headingId] = (out[r.headingId] || 0) + 1;
  return { reflections: out, reflectionsTotal: Object.values(out).reduce((a, b) => a + b, 0) };
}

// Words in the reflection itself: title, case summary and learning points (or the older sections).
// Captions and references don't count. There is no official minimum; MIN_WORDS is a guide only
// (most of a recent senior resident's portfolio reflections were 270–770 words).
export const MIN_WORDS = 250;
const words = s => (String(s || '').match(/[A-Za-z0-9\u00C0-\u024F]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
export function wordCount(r) {
  if (!r) return 0;
  let n = words(r.title) + words(r.summary);
  for (const p of r.points || []) n += words(p.heading) + words(p.text);
  for (const v of Object.values(r.sections || {})) n += words(v);
  return n;
}


// ---------- heading suggestions from a logged case ----------
// Case category code -> [headingId, subId?]. Codes are matched exactly, then by their parent (e.g. 20iii -> 20).
const CAT_HEADINGS = {
  '01': [['cabg', 'on'], ['cardiac']], '02': [['cabg', 'off'], ['cardiac']],
  '03': [['thoracic']], '07': [['thoracic']], '04': [['thyroid']], '05': [['ugi']], '06': [['egi']], '08': [['lap']],
  '09': [['eye']], '11': [['shared']], '12': [['airway']], '15': [['neuro']], '15i': [['neuro']],
  '16': [['lscs']], '17': [['labour']], '20': [['paeds']], '20i': [['paeds', 'neonate']],
  '21': [['geriatric']], '23': [['bariatric']], '24': [['spine']],
  '26': [['regional']], '26i': [['regional', 'ul']], '26ii': [['regional', 'll']], '26iii': [['regional', 'truncal']],
  '27': [['regional', 'epidural']], '28': [['regional']], '29': [['regional']],
  '30': [['acute']], '31': [['chronic']], '33': [['remote']], '34': [['urology']], '35': [['vascular']],
  '36': [['polytrauma']], '38': [['icu']],
};
// Keyword hints in the case details: [regex, headingId, subId?, onlyIfHeadingAlreadySuggested?]
const KEYWORD_HEADINGS = [
  [/prostat|\bTURP\b|\bTURBT?\b/i, 'urology', 'prostate'],
  [/nephrectom|kidney|\bPCNL\b|renal/i, 'urology', 'kidney'],
  [/\bRSI\b|rapid sequence/i, 'paeds', 'rsi', true],
  [/\bAAA\b|fem(oral)?[- ]?pop|aort/i, 'vascular'],
  [/valve|\bAVR\b|\bMVR\b|\bTAVI\b|pacemaker|\bAICD\b|pericardial/i, 'cardiac'],
  [/\bCABG\b/i, 'cabg'],
  [/\bMRI\b|\bIR\b|angio|cath(eter)? lab|\bERCP\b/i, 'remote'],
  [/polytrauma/i, 'polytrauma'],
  [/difficult airway|\bAFOI\b|awake fib|\bFONA\b/i, 'airway'],
  [/thyroid/i, 'thyroid'],
  [/\bLSCS\b|caesar/i, 'lscs'],
  [/craniotomy/i, 'neuro'],
];

// Ranked heading suggestions for a case: [{ headingId, subId, name, needed }].
// Headings still short (count, a missing sub-type, or JR needed and the case is JR) come first.
// opts.jr: the reflection would be a JR case (default: unknown -> JR shortfalls not considered).
export function suggestHeadings(caseObj, reflections = [], opts = {}) {
  if (!caseObj) return [];
  const cats = (caseObj.cats || []).map(c => String(c).toLowerCase());
  const details = String(caseObj.details || '');
  const out = [];
  const push = (headingId, subId = null) => {
    const hd = HEADING_BY_ID[headingId];
    if (!hd) return;
    if (subId && !(hd.subs || []).some(s => s.id === subId)) subId = null;
    const ex = out.find(o => o.headingId === headingId);
    if (ex) { if (!ex.subId && subId) ex.subId = subId; return; }
    out.push({ headingId, subId });
  };
  for (const c of cats) {
    let m = CAT_HEADINGS[c];
    if (!m) { const parent = c.match(/^\d{2}/); if (parent && /^20/.test(c)) m = CAT_HEADINGS['20']; else if (parent && /^26/.test(c)) m = CAT_HEADINGS['26']; }
    if (!m) continue;
    for (const [hid, sid] of m) {
      // a 27 epidural on an obstetric case (17) is labour analgesia, not a non-obstetric epidural
      if (c === '27' && cats.includes('17')) continue;
      push(hid, sid);
    }
  }
  for (const [re, hid, sid, onlyIf] of KEYWORD_HEADINGS) {
    if (!re.test(details)) continue;
    if (onlyIf && !out.some(o => o.headingId === hid)) continue;
    push(hid, sid);
  }
  const prog = reflectionProgress(reflections || []);
  const byId = Object.fromEntries(prog.headings.map(x => [x.id, x]));
  const scored = out.map((o, i) => {
    const p = byId[o.headingId];
    const subNeeded = !!(o.subId && p.subs.some(s => s.id === o.subId && s.done < s.min));
    const jrNeeded = !!(opts.jr && p.jrNeeded && p.jrDone < p.jrNeeded);
    const needed = !p.met && (p.counted < p.min || subNeeded || jrNeeded || p.subs.some(s => s.done < s.min));
    return { headingId: o.headingId, subId: o.subId, name: HEADING_BY_ID[o.headingId].name, needed, _s: (needed ? 0 : 100) - (subNeeded ? 2 : 0) - (jrNeeded ? 1 : 0), _i: i };
  });
  scored.sort((a, b) => a._s - b._s || a._i - b._i);
  return scored.map(({ _s, _i, ...o }) => o);
}

// Move a reflection to another heading: keeps subId only when the new heading has that sub-type.
export function moveToHeading(r, headingId) {
  const hd = HEADING_BY_ID[headingId];
  if (!hd) return { ...r };
  const subId = hd.subs && hd.subs.some(s => s.id === r.subId) ? r.subId : null;
  return { ...r, headingId, subId };
}
