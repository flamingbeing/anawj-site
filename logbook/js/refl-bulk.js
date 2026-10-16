// Bulk edit for Reflections (Reflections → Select → Bulk edit…): the changes chosen in the popup, applied to one
// reflection at a time. Pure (test/refl-bulk.test.mjs); the case and note versions are bulk-change.js and note-bulk.js.
//
// ch: {
//   heading: { id } ('' = Uncategorised) | null   (a sub-type stays when the new heading has it)
//   status: 'complete' | 'draft' | null   (complete only when nothing is missing, as one at a time)
//   exp: true | false | null   (in the portfolio export)
//   jr: true | false | null    (the JR flag)
//   date: { set: '2026-10-01' } | null
// }
// t: { headings: { [id]: { subs } }, problems(r) -> what is missing before it can be complete }
export const reflNone = () => ({ heading: null, status: null, exp: null, jr: null, date: null });
export const reflEmpty = ch => !ch || Object.values(ch).every(v => v == null);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const FIELDS = ['headingId', 'subId', 'status', 'export', 'jr', 'date'];
// (export: unset means in, as inExport reads it)
const norm = r => ({ headingId: r.headingId || '', subId: r.subId || null, status: r.status === 'complete' ? 'complete' : 'draft', export: r.export !== false, jr: !!r.jr, date: r.date || '' });

// -> the changed reflection; null when nothing changes; { blocked: [what is missing] } when it can't be made complete
export function applyReflChange(r, ch, t, now = Date.now()) {
  const was = norm(r), next = { ...was };
  if (ch.heading) {
    const id = ch.heading.id || '', hd = t.headings[id];
    next.headingId = hd ? id : '';
    next.subId = hd && (hd.subs || []).some(s => s.id === was.subId) ? was.subId : null;
  }
  if (ch.date && ISO.test(ch.date.set || '')) next.date = ch.date.set;
  if (ch.jr === true || ch.jr === false) next.jr = ch.jr;
  if (ch.exp === true || ch.exp === false) next.export = ch.exp;
  if (ch.status === 'draft') next.status = 'draft';
  if (ch.status === 'complete' && was.status !== 'complete') {
    const missing = t.problems({ ...r, headingId: next.headingId, date: next.date });
    if (missing.length) {
      // the other changes still apply; only "complete" waits
      if (FIELDS.every(k => k === 'status' || was[k] === next[k])) return { blocked: missing };
    } else next.status = 'complete';
  }
  if (FIELDS.every(k => was[k] === next[k])) return null;
  const out = { ...r, headingId: next.headingId, subId: next.subId, status: next.status, export: next.export, jr: next.jr, updatedAt: now };
  if (next.date) out.date = next.date;
  return out;
}

// replaces what is there? (all of these do; a status of complete only adds)
export const reflOverwrites = ch => !!(ch.heading || ch.date || ch.status === 'draft' || ch.exp === false || ch.jr != null);

export function reflChangeLines(ch, { heading = id => id, day = d => d } = {}) {
  const out = [];
  if (ch.heading) out.push(`Heading: moved to ${ch.heading.id ? heading(ch.heading.id) : 'Uncategorised'}`);
  if (ch.status) out.push(ch.status === 'complete' ? 'Status: complete (ones still missing something stay drafts)' : 'Status: back to draft');
  if (ch.exp != null) out.push(ch.exp ? 'Portfolio export: in' : 'Portfolio export: left out');
  if (ch.jr != null) out.push(ch.jr ? 'JR: on' : 'JR: off');
  if (ch.date) out.push(`Date: set to ${day(ch.date.set)}`);
  return out;
}

export function reflMissing(ch) {
  if (ch.heading && ch.heading.id == null) return 'Choose the heading';
  if (ch.date && !ISO.test(ch.date.set || '')) return 'Choose the date';
  return '';
}
