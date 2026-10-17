// The shapes stored in Firestore, shared by both backends (cloud.js and the demo, demo-backend.js):
// field whitelists and the clean*() helpers that build every write, so cloud writes never trip the
// field checks in logbook/firestore.rules. Keep this file and the rules in step. Not demo code:
// the real app depends on it.

export const EVAL_FIELDS = ['id', 'rid', 'residentEmail', 'residentName', 'assessorEmail', 'assessorName',
  'formId', 'formVersion', 'epa', 'date', 'source', 'status', 'request', 'assessment', 'caseId',
  'createdAt', 'updatedAt', 'requestedAt', 'submittedAt',
  'itemId', 'itemText', 'tool', 'level', 'caseKey', 'catalogueVersion',
  'declineReason', 'declinedAt', 'seenAt', 'chasedAt', 'metrics'];
// fields a patch may remove by passing null (Firestore deleteField)
export const REMOVABLE = ['assessment', 'metrics', 'declineReason', 'declinedAt', 'submittedAt', 'seenAt', 'chasedAt'];
export const RESIDENT_FIELDS = ['rid', 'name', 'email', 'status', 'intake', 'rYear', 'smo'];
export const FACULTY_FIELDS = ['email', 'name', 'status', 'updatedAt', 'core', 'ccc', 'workEmail'];
export const APPLICATION_FIELDS = ['uid', 'email', 'name', 'role', 'note', 'status', 'createdAt', 'decidedAt', 'decidedBy'];
export const RESIDENT_STATUSES = ['ACTIVE', 'ON LEAVE', 'SMO', 'GRADUATED', 'ATTRITED'];
export const STATUSES = ['draft', 'requested', 'submitted', 'declined', 'cancelled'];

export const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
// Firestore rejects undefined values; a JSON round trip drops them (and deep-copies).
export const plain = o => JSON.parse(JSON.stringify(o));
export const lc = e => String(e || '').trim().toLowerCase();
export const str = (v, max) => (v == null ? v : String(v).slice(0, max));

export const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function newEvaluationId(n = 20) {
  const bytes = new Uint8Array(n);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, b => ID_CHARS[b % 36]).join('');
}

// A whole new evaluation, as the resident sends it.
export function cleanEval(ev, now = Date.now()) {
  const out = pick(ev, EVAL_FIELDS);
  out.id = out.id ? String(out.id) : newEvaluationId();
  out.rid = String(out.rid ?? '');
  out.residentEmail = lc(out.residentEmail);
  out.assessorEmail = lc(out.assessorEmail);
  out.source = 'evals';
  out.status = out.status || 'requested';
  out.date = out.date || null;
  for (const [k, max] of [['residentName', 200], ['assessorName', 200], ['itemText', 600], ['caseKey', 100], ['itemId', 60], ['formId', 60]]) {
    if (out[k] != null) out[k] = str(out[k], max);
  }
  if (out.epa != null) out.epa = String(out.epa);
  out.createdAt = Number(out.createdAt) || now;
  out.updatedAt = now;
  if (out.status === 'requested' && !out.requestedAt) out.requestedAt = now;
  return plain(out);
}

// A patch for updateEvaluation: whitelisted, emails lower case. Returns { set, remove }: null values
// of REMOVABLE fields become removals. The id, source and createdAt never change.
export function cleanPatch(patch, now = Date.now()) {
  const p = pick(patch || {}, EVAL_FIELDS.filter(k => !['id', 'source', 'createdAt'].includes(k)));
  const remove = [];
  for (const k of REMOVABLE) if (k in p && p[k] === null) { remove.push(k); delete p[k]; }
  if (p.assessorEmail != null) p.assessorEmail = lc(p.assessorEmail);
  if (p.residentEmail != null) p.residentEmail = lc(p.residentEmail);
  p.updatedAt = now;
  return { set: plain(p), remove };
}

// Stamps the times a transition needs (submit, decline, (re)send) unless the caller set them, and
// clears the old assessor's partial answers and metrics when the request goes to someone new.
export function stampPatch(cur, patch, now = Date.now()) {
  const p = { ...patch };
  const from = cur ? cur.status : null;
  const to = p.status || from;
  const newAssessor = !!(cur && p.assessorEmail && lc(p.assessorEmail) !== cur.assessorEmail);
  if (p.status === 'submitted' && from !== 'submitted' && p.submittedAt == null) p.submittedAt = now;
  if (p.status === 'declined' && from !== 'declined' && p.declinedAt == null) p.declinedAt = now;
  // (re)sent, reopened or handed to a new assessor: the 24 h clock starts again
  if (to === 'requested' && (from === 'draft' || from === 'declined' || from === 'submitted' || (from === 'requested' && newAssessor)) && p.requestedAt == null) p.requestedAt = now;
  // reopened: the revised feedback is new to the resident
  if (from === 'submitted' && p.status === 'requested' && cur.seenAt != null && !('seenAt' in p)) p.seenAt = null;
  if (newAssessor) {
    if (from === 'declined' && p.status === 'requested' && !('assessment' in p)) p.assessment = null;
    if (cur.metrics != null && !('metrics' in p)) p.metrics = null;
  }
  return p;
}

export function cleanResident(r) {
  const out = pick(r, RESIDENT_FIELDS);
  out.rid = String(out.rid);
  out.name = String(out.name ?? '').slice(0, 200);
  out.email = lc(out.email);
  out.status = out.status || 'ACTIVE';
  out.intake = out.intake == null || out.intake === '' ? null : Number(out.intake);
  out.rYear = out.rYear == null || out.rYear === '' ? null : Number(out.rYear);
  // years spent as an SMO (logbook: they count as R3); left out when none
  const smo = Math.floor(Number(out.smo) || 0);
  if (smo > 0) out.smo = Math.min(10, smo); else delete out.smo;
  return plain(out);
}

export function cleanFaculty(f, now = Date.now()) {
  const out = pick(f, FACULTY_FIELDS);
  out.email = lc(out.email);
  out.name = String(out.name ?? '').slice(0, 200);
  out.status = out.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  // groups (core faculty, CCC members) and the NUHS work email: only kept when set, so older records stay as they were
  if ('core' in out) out.core = out.core === true;
  if ('ccc' in out) out.ccc = out.ccc === true;
  if ('workEmail' in out) { out.workEmail = lc(out.workEmail).slice(0, 200); if (!out.workEmail) delete out.workEmail; }
  out.updatedAt = now;
  return plain(out);
}

export function cleanApplication(a, now = Date.now()) {
  const out = pick(a, APPLICATION_FIELDS);
  out.uid = String(out.uid);
  out.email = lc(out.email);
  out.name = String(out.name ?? '').slice(0, 200);
  out.note = String(out.note ?? '').slice(0, 1000);
  out.role = out.role === 'faculty' ? 'faculty' : 'resident';
  out.status = out.status || 'pending';
  out.createdAt = Number(out.createdAt) || now;
  return plain(out);
}

// rid for a resident added from an application when the admin gives none
export const newRid = () => 'EV' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
