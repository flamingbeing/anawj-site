// Pure helpers behind the write tools: build a case or a draft reflection from a tool's arguments with the app's own
// tidying (cleanCase, cleanReflection, so what is saved looks exactly like what the app saves and passes the same
// firestore.rules checks), and describe it for the preview. No network here.

import { cleanCase, cleanReflection } from '../../js/clean.js';
import { outboxEntry, outboxOn } from '../../js/sheet-outbox.js';
import { ID_RE } from '../../js/engine.js';
import { BY_CODE, CATEGORIES } from '../../js/categories.js';
import { HEADING_BY_ID } from '../../js/reflections.js';
import { resolveCategory, resolveHeading, catName, headingLabel, checkDate, formatReflection } from './logbook.mjs';

export { outboxEntry, outboxOn };

const pad = n => String(n).padStart(2, '0');
// this computer's date, as the app takes it from the phone
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const str = v => (v == null ? '' : String(v));

// Identifiers never go in (the app masks them on the way to the sheet; here they are refused outright).
export function checkNoIds(fields) {
  for (const [label, v] of fields) {
    if (v != null && ID_RE.test(String(v))) {
      throw new Error(`The ${label} looks like it holds an identifier (an NRIC/FIN or a number of 7 or more digits). `
        + 'Take it out: cases and reflections stay de-identified (initials and a short description). Nothing was saved.');
    }
  }
}

// Tag codes or names -> codes. Each must match one current tag; a tag with sub-tags needs the sub-tag.
export function resolveTags(list) {
  const out = [];
  for (const q of list || []) {
    const s = str(q).trim();
    if (!s) continue;
    const codes = (BY_CODE[s] ? [s] : resolveCategory(s)).filter(c => !BY_CODE[c].retired);
    if (!codes.length) throw new Error(`No current APMES tag matches "${s}". Try a code (e.g. 16) or part of a name. Nothing was saved.`);
    if (codes.length > 1) {
      throw new Error(`"${s}" matches ${codes.length} tags: ${codes.slice(0, 10).map(c => `${c} ${catName(c)}`).join('; ')}. Give the code. Nothing was saved.`);
    }
    const subs = CATEGORIES.filter(c => c.parent === codes[0] && !c.retired);
    if (subs.length) throw new Error(`"${catName(codes[0])}" has sub-tags; pick one: ${subs.map(c => `${c.code} ${catName(c.code)}`).join('; ')}. Nothing was saved.`);
    out.push(codes[0]);
  }
  return [...new Set(out)];
}

// ---- cases ----

// args: { date?, initials?, details, tags?, interesting? } -> the case document (a fresh id)
export function buildNewCase(args, now = Date.now()) {
  const details = str(args.details).trim();
  if (!details) throw new Error('A case needs details (a short de-identified description). Nothing was saved.');
  checkNoIds([['initials', args.initials], ['details', details]]);
  return cleanCase({
    date: checkDate(args.date, 'date') || today(),
    initials: str(args.initials).trim(),
    details,
    cats: resolveTags(args.tags),
    ...(args.interesting ? { reflectTag: true } : {}),
    source: 'app',
  }, now);
}

// The stored case with only the fields given changed. tags replaces the whole list.
export function buildCaseUpdate(existing, args, now = Math.max(Date.now(), (Number(existing.updatedAt) || 0) + 1)) {
  const c = { ...existing };
  if (args.date !== undefined) c.date = checkDate(args.date, 'date');
  if (args.initials !== undefined) c.initials = str(args.initials).trim();
  if (args.details !== undefined) {
    c.details = str(args.details).trim();
    if (!c.details) throw new Error('Details cannot be empty. Nothing was saved.');
  }
  if (args.tags !== undefined) c.cats = resolveTags(args.tags);
  if (args.interesting !== undefined) c.reflectTag = !!args.interesting;
  checkNoIds([['initials', args.initials], ['details', args.details]]);
  if (c.date) delete c.dateText;
  return cleanCase(c, now);
}

// same day, initials and details: what a repeated save would make
export const sameCase = (a, b) => (a.date || '') === (b.date || '') && str(a.initials).trim().toLowerCase() === str(b.initials).trim().toLowerCase()
  && str(a.details).trim() === str(b.details).trim();

const tagList = cats => (cats || []).length ? cats.map(c => `${c} ${catName(c)}`).join('; ') : 'none';

export function describeCase(c) {
  return [
    `Date: ${c.date || c.dateText || 'none'}`,
    `Initials: ${c.initials || 'none'}`,
    `Details: ${c.details || '(none)'}`,
    `Tags: ${tagList(c.cats)}`,
    `Marked interesting: ${c.reflectTag ? 'yes' : 'no'}`,
  ].join('\n');
}

// what changes, field by field
export function describeCaseChange(before, after) {
  const rows = [
    ['Date', before.date || before.dateText || 'none', after.date || after.dateText || 'none'],
    ['Initials', before.initials || 'none', after.initials || 'none'],
    ['Details', before.details || '(none)', after.details || '(none)'],
    ['Tags', tagList(before.cats), tagList(after.cats)],
    ['Marked interesting', before.reflectTag ? 'yes' : 'no', after.reflectTag ? 'yes' : 'no'],
  ].filter(([, a, b]) => a !== b);
  return rows.length ? rows.map(([k, a, b]) => `${k}: ${a}  →  ${b}`).join('\n') : 'No changes.';
}

// ---- reflections (drafts only) ----

function resolveOneHeading(q) {
  const ids = (resolveHeading(q) || []).filter(Boolean);
  if (ids.length === 1) return ids[0];
  if (!ids.length) throw new Error(`No reflection heading matches "${q}". Nothing was saved.`);
  throw new Error(`"${q}" matches ${ids.length} headings: ${ids.slice(0, 10).map(id => `${id} (${headingLabel(id)})`).join('; ')}. Give the id. Nothing was saved.`);
}

function resolveSub(headingId, q) {
  if (q == null || q === '') return null;
  const subs = (HEADING_BY_ID[headingId] || {}).subs || [];
  const s = str(q).trim().toLowerCase();
  const sub = subs.find(x => x.id === s || x.name.toLowerCase() === s) || subs.find(x => x.name.toLowerCase().includes(s));
  if (!sub) {
    throw new Error(subs.length ? `"${q}" is not a sub-type of ${headingLabel(headingId)}; pick one of: ${subs.map(x => x.name).join(', ')}. Nothing was saved.`
      : `${headingLabel(headingId)} has no sub-types. Nothing was saved.`);
  }
  return sub.id;
}

// args: { heading?, subheading?, title?, date?, initials?, diagnosis?, summary?, learning_points?, references?, case_id? }
// existing: the stored reflection when editing one, else null. Always saved as a draft: marking it complete stays in
// the app.
export function buildReflection(existing, args, now) {
  if (existing && existing.status === 'complete') {
    throw new Error('That reflection is marked complete; edit it in the app (only drafts can be written from here). Nothing was saved.');
  }
  const r = existing ? { ...existing } : {};
  if (args.heading !== undefined || !existing) {
    if (!args.heading) throw new Error('A new reflection needs a heading (e.g. "Caesarean sections"; list_reflections and missing_targets show them). Nothing was saved.');
    r.headingId = resolveOneHeading(args.heading);
    if (args.subheading === undefined) r.subId = null;
  }
  if (args.subheading !== undefined) r.subId = resolveSub(r.headingId, args.subheading);
  if (args.date !== undefined) r.date = checkDate(args.date, 'date');
  else if (!existing) r.date = today();
  for (const k of ['title', 'initials', 'diagnosis', 'summary']) if (args[k] !== undefined) r[k] = str(args[k]);
  if (args.learning_points !== undefined) r.points = args.learning_points.map(p => ({ heading: str(p.heading), text: str(p.text) }));
  if (args.references !== undefined) r.references = args.references.map(str);
  if (args.case_id !== undefined) r.caseId = args.case_id || null;
  checkNoIds([['title', args.title], ['initials', args.initials], ['diagnosis', args.diagnosis], ['summary', args.summary],
    ...(args.learning_points || []).flatMap(p => [['learning point', p.heading], ['learning point', p.text]])]);
  r.status = 'draft';
  return cleanReflection(r, now ?? Math.max(Date.now(), (Number(r.updatedAt) || 0) + 1));
}

export const describeReflection = formatReflection;
