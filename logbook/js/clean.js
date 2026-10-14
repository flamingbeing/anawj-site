// The fields each kind of document may hold, and their tidying: shared by cloud.js (Firestore) and demo-backend.js
// (?demo), so both store the same shapes and cloud writes never trip the field checks in firestore.rules. Its own
// small file so a real sign-in never loads the demo backend.

import { cleanReflection, cleanImage } from './reflections.js';
export { cleanReflection, cleanImage };

const lc = e => String(e || '').trim().toLowerCase();

const CASE_FIELDS = ['id', 'date', 'dateText', 'initials', 'details', 'cats', 'createdAt', 'updatedAt', 'source', 'importKey', 'reflectionId', 'reflectTag', 'tags'];
const SUMMARY_FIELDS = ['rid', 'name', 'intake', 'rYear', 'smo', 'counts', 'total', 'reflections', 'reflectionsTotal', 'updatedAt'];
const RESIDENT_FIELDS = ['rid', 'name', 'email', 'status', 'intake', 'rYear', 'smo'];
const TEMPLATE_FIELDS = ['id', 'name', 'cats', 'details'];

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
// Firestore rejects undefined values; a JSON round trip drops them (and deep-copies).
export const plain = o => JSON.parse(JSON.stringify(o));

// (a write is stamped after the version it replaces, so it wins even over a copy stamped by a clock running ahead)
export function cleanCase(c, now = Math.max(Date.now(), (Number(c && c.updatedAt) || 0) + 1)) {
  const out = pick(c, CASE_FIELDS);
  out.id = out.id ? String(out.id) : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  out.date = out.date || null;
  out.details = String(out.details ?? '').slice(0, 2000);
  out.cats = [...new Set((out.cats || []).map(String))].slice(0, 40);
  if (out.dateText != null) out.dateText = String(out.dateText).slice(0, 200);
  if (out.initials != null) out.initials = String(out.initials).slice(0, 20);
  // marked interesting; personal subcategory tags ("16:elective")
  if (out.reflectTag) out.reflectTag = true; else delete out.reflectTag;
  if (Array.isArray(out.tags) && out.tags.length) out.tags = [...new Set(out.tags.map(t => String(t).slice(0, 60)))].slice(0, 20); else delete out.tags;
  out.createdAt = Number(out.createdAt) || now;
  out.updatedAt = now;
  out.source = out.source || 'app';
  return plain(out);
}

export function cleanSummary(rid, s, now = Date.now()) {
  const out = pick(s, SUMMARY_FIELDS);
  out.rid = String(rid);
  out.counts = out.counts || {};
  out.total = Number(out.total) || 0;
  if (out.smo !== true) delete out.smo;
  out.updatedAt = now;
  return plain(out);
}

export function cleanResident(r) {
  const out = pick(r, RESIDENT_FIELDS);
  out.rid = String(out.rid);
  out.name = String(out.name ?? '').slice(0, 200);
  out.email = String(out.email ?? '').trim().toLowerCase();
  out.status = out.status || 'ACTIVE';
  out.intake = out.intake == null || out.intake === '' ? null : Number(out.intake);
  out.rYear = out.rYear == null || out.rYear === '' ? null : Number(out.rYear);
  // years spent as an SMO (logbook: they count as R3); left out when none
  const smo = Math.floor(Number(out.smo) || 0);
  if (smo > 0) out.smo = Math.min(10, smo); else delete out.smo;
  return plain(out);
}

export function cleanTemplate(t) {
  const out = pick(t, TEMPLATE_FIELDS);
  out.name = String(out.name ?? '').slice(0, 100);
  out.cats = [...new Set((out.cats || []).map(String))].slice(0, 40);
  if (out.details != null) out.details = String(out.details).slice(0, 2000);
  return plain(out);
}

// Firestore document ids may not contain '/', and some other characters are awkward.
// Map an importKey to a safe, reversible-enough id: keep [A-Za-z0-9_-], escape the rest as ~xxxx.
export const importDocId = key =>
  'imp_' + String(key).replace(/[^A-Za-z0-9_-]/g, ch => '~' + ch.charCodeAt(0).toString(16).padStart(4, '0'));

export function defaultLogbook(email, name = '') {
  return { email, name, rid: null, settings: {}, templates: [], updatedAt: Date.now() };
}
export const cleanSubmission = (email, m) => plain({
  email: lc(email), rid: m.rid ? String(m.rid).slice(0, 40) : null, name: String(m.name || '').slice(0, 200),
  intake: Number(m.intake) || null, rYear: Number(m.rYear) || null, smo: Math.max(0, Math.floor(Number(m.smo) || 0)),
  readyAt: Number(m.readyAt) || Date.now(), updatedAt: Date.now(), fp: String(m.fp || '').slice(0, 100),
  count: Math.max(0, Math.floor(Number(m.count) || 0)), profile: m.profile && typeof m.profile === 'object' ? m.profile : null,
  counts: m.counts && typeof m.counts === 'object' ? m.counts : {},
  imageIds: [...new Set((Array.isArray(m.imageIds) ? m.imageIds : []).map(String))].slice(0, 1000),
});

// Category display names set by admins: { code: { name?, short? } } (display only; exports keep the official names)
export function cleanCategoryNames(m) {
  const out = {};
  for (const [code, v] of Object.entries(m && typeof m === 'object' ? m : {})) {
    if (!/^\d{2}[ivx]*$/.test(code) || !v || typeof v !== 'object') continue;
    const name = String(v.name || '').trim().slice(0, 80), short = String(v.short || '').trim().slice(0, 30);
    if (name || short) out[code] = { ...(name ? { name } : {}), ...(short ? { short } : {}) };
  }
  return out;
}
