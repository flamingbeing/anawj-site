// APMES evals engine: form validation, progress against the guidebook's minimums, request status,
// case keys and identifier checks. Pure functions only (no DOM), so it can be tested in Node.

import { GROUPS, itemById } from './catalogue.js';

// ---------- forms ----------

const NINE = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const MILESTONE = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const SUPERVISION = [1, 2, 3, 4, 5];
const questionsOf = form => form.sections.flatMap(s => s.questions);
const isNA = v => v === 'NA';
const blank = v => v == null || v === '' || (Array.isArray(v) && !v.length);

// Questions to show for these answers: a question with showIf appears only once the named checkbox
// question has a tick other than its exclusive option (EBD q3 after q2).
export function visibleQuestions(form, answers = {}) {
  answers = answers || {};
  return questionsOf(form).filter(q => {
    if (!q.showIf) return true;
    const v = answers[q.showIf.key];
    return Array.isArray(v) && v.some(x => x !== q.showIf.anyExcept);
  });
}

// Text minus any starter phrases the UI inserted (they never count toward minLength).
const ownText = (v, starters) => {
  let t = String(v || '');
  // also the trimmed form: saved text loses its trailing space ("A: " is stored as "A:")
  for (const s of starters || []) if (s) { t = t.split(s).join(' '); if (s.trimEnd()) t = t.split(s.trimEnd()).join(' '); }
  return t.replace(/\s+/g, ' ').trim();
};

// One answer: null if fine, else an error message. Assumes the value is not blank.
function check(q, v, opts) {
  const num = typeof v === 'string' && v.trim() !== '' && !isNaN(v) ? Number(v) : v;
  switch (q.type) {
    case 'select':
      return q.options.includes(v) ? null : 'Choose one of the options';
    case 'checkboxes': {
      if (!Array.isArray(v)) return 'Tick at least one box';
      if (v.some(x => !q.options.includes(x))) return 'Unknown option ticked';
      if (q.exclusive && v.includes(q.exclusive) && v.length > 1) return `"${q.exclusive}" cannot be ticked with other areas`;
      return null;
    }
    case 'text': {
      if (typeof v !== 'string') return 'Enter some text';
      const len = ownText(v, opts.starters).length;
      if (!len) return 'Enter some text';
      if (q.minLength && len < q.minLength) return `At least ${q.minLength} characters (${len} so far)`;
      return null;
    }
    case 'ninePoint':
    case 'milestone':
    case 'supervision': {
      if (isNA(v)) return q.na ? null : 'Not observed is not allowed here';
      const allowed = q.type === 'ninePoint' ? NINE : q.type === 'milestone' ? MILESTONE : SUPERVISION;
      return allowed.includes(num) ? null : 'Choose a value on the scale';
    }
    default:
      return 'Unknown question type';
  }
}

// validate(form, answers, { starters }) -> { ok, required, answered, missing:[n], errors:[{n,msg}] }
// Only visible questions count. Required answers must be present and valid; optional answers are
// checked only when given (so an optional comment's minLength applies only once it has text).
// A text box holding only starter text counts as blank.
export function validate(form, answers = {}, opts = {}) {
  answers = answers || {};
  let required = 0, answered = 0;
  const missing = [], errors = [];
  for (const q of visibleQuestions(form, answers)) {
    let v = answers[q.key];
    if (q.type === 'text' && typeof v === 'string' && !ownText(v, opts.starters)) v = '';
    if (q.required) required++;
    if (blank(v)) { if (q.required) missing.push(q.n); continue; }
    const msg = check(q, v, opts);
    if (msg) errors.push({ n: q.n, msg });
    else if (q.required) answered++;
  }
  return { ok: !missing.length && !errors.length, required, answered, missing, errors };
}

// The first question number still needing attention (for "jump to next gap"), or null.
export function nextGap(result) {
  const ns = [...result.missing, ...result.errors.map(e => e.n)];
  return ns.length ? Math.min(...ns) : null;
}

// ---------- progress ----------

// Submitted evaluations counted against each guidebook group. Repeats of an item count toward the
// group minimum; in an 'each' group every item needs at least 1 first, so done is capped at
// min - (items with none). State: done; else by the resident's year against the group's due year:
// overdue (past), due-soon (this year), on-track (next year, or started early), later.
export function progress(evaluations, rYear) {
  const yr = Number(rYear) || 1;
  const counts = {};
  for (const ev of evaluations || []) {
    if (!ev || ev.status !== 'submitted' || !ev.itemId || !itemById(ev.itemId)) continue;
    counts[ev.itemId] = (counts[ev.itemId] || 0) + 1;
  }
  return GROUPS.map(g => {
    const items = g.itemIds.map(id => ({ item: itemById(id), done: counts[id] || 0 }));
    const total = items.reduce((n, i) => n + i.done, 0);
    const uncovered = g.each ? items.filter(i => !i.done).length : 0;
    const done = Math.max(0, Math.min(total, g.min - uncovered));
    const state = done >= g.min ? 'done'
      : yr > g.byYear ? 'overdue'
      : yr === g.byYear ? 'due-soon'
      : yr === g.byYear - 1 || done > 0 ? 'on-track' : 'later';
    return { group: g, done, min: g.min, state, items };
  });
}

// ---------- status ----------

const HOUR = 36e5;
export const OVERDUE_HOURS = 24;
const STATUS_LABEL = { draft: 'Draft', sent: 'Sent', 'in-progress': 'In progress', submitted: 'Submitted', declined: 'Declined', cancelled: 'Cancelled', overdue: 'Overdue' };

// Status for lists and chips. A request is overdue once 24 h have passed since it was sent
// (forms should be filled within 24 hours), even if the assessor has started it.
export function statusOf(ev, now = Date.now()) {
  const sentAt = ev.requestedAt || ev.createdAt || null;
  const ageHours = sentAt ? Math.max(0, Math.floor((now - sentAt) / HOUR)) : null;
  let key;
  switch (ev.status) {
    case 'draft': key = 'draft'; break;
    case 'submitted': key = 'submitted'; break;
    case 'declined': key = 'declined'; break;
    case 'cancelled': key = 'cancelled'; break;
    default: {
      const started = ev.assessment && Object.keys(ev.assessment).length > 0;
      key = ageHours != null && ageHours >= OVERDUE_HOURS ? 'overdue' : started ? 'in-progress' : 'sent';
    }
  }
  return { key, label: STATUS_LABEL[key], ageHours };
}

// ---------- cases ----------

const initialsOf = s => String(s || '').toUpperCase().replace(/[^A-Z]/g, '');
// Same date + same initials = same patient (the same patient can be used for at most 2 assessments).
export const caseKey = (date, initials) => `${date || ''}|${initialsOf(initials)}`;
export function sameCaseCount(evals, date, initials) {
  const key = caseKey(date, initials);
  if (!initialsOf(initials) || !date) return 0;
  return (evals || []).filter(ev => ev && ev.status !== 'cancelled'
    && (ev.caseKey || caseKey(ev.request && ev.request.date || ev.date, ev.request && ev.request.initials)) === key).length;
}

// Warns about things that look like patient identifiers in free text. Not a guarantee.
export function identifierWarning(text) {
  const t = String(text || '');
  if (/\b[STFGM]\d{7}[A-Z]\b/i.test(t)) return 'This looks like an NRIC/FIN. Please remove patient identifiers.';
  if (/\d{8,}/.test(t) || /(^|[^\d-])\d{4} \d{4}(?![\d-])/.test(t)) return 'Long numbers look like record or phone numbers. Please remove them.';
  if (/\b\d{6,7}[A-Z]\b/i.test(t) || /\b(MRN|IC|NRIC|FIN|case no|hospital no|reg no)\b\W*\w*\d/i.test(t)) return 'This looks like a record number. Please remove patient identifiers.';
  if (/\b(Mr|Mrs|Ms|Mdm|Madam|Miss)\.? +[A-Z][a-z]+/.test(t) || /\bname\s*[:=-]/i.test(t)) return 'This looks like a patient name. Use initials only.';
  return null;
}

// ---------- ids and dates ----------

const ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
export function newId(n = 20) {
  const bytes = new Uint8Array(n);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, b => ID_CHARS[b % 36]).join('');
}

// Today as YYYY-MM-DD in the programme's time zone (Singapore by default).
export function todayISO(tz = 'Asia/Singapore', now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    const p = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  }
}

// Residency year 1..5: the admin-set rYear wins, else from intake (the year runs from 1 July,
// so intake 2026 is R1 from July 2026 to June 2027). null if neither is known.
export function residentYear(residentDoc, today = todayISO()) {
  if (!residentDoc) return null;
  const set = Number(residentDoc.rYear);
  if (set >= 1 && set <= 5) return set;
  const intake = Number(residentDoc.intake);
  if (!intake) return null;
  const d = today instanceof Date ? todayISO('Asia/Singapore', today) : String(today);
  const [y, m] = d.split('-').map(Number);
  const ay = m >= 7 ? y : y - 1;
  return Math.min(5, Math.max(1, ay - intake + 1));
}

// Items due by the resident's year that their group still needs (for "Due for you"), overdue first.
// In an 'each' group the items not yet done come first; once all are covered any item counts.
export function dueItems(evaluations, rYear) {
  const out = [];
  const rows = progress(evaluations, rYear).filter(p => p.state === 'overdue' || p.state === 'due-soon');
  rows.sort((a, b) => (a.state === 'overdue' ? 0 : 1) - (b.state === 'overdue' ? 0 : 1));
  for (const p of rows) {
    const open = p.group.each ? p.items.filter(i => !i.done) : [];
    for (const { item } of open.length ? open : p.items) out.push(item);
  }
  return out;
}
